/**
 * REST surface. Four resources, and the split follows the service decomposition in
 * architecture/backend-architecture.md §2.2 rather than the shape of the UI:
 *
 *   /api/catalog       Catalog Service      — the governed vocabulary, entitlement-scoped
 *   /api/experiences   Definition Service   — authoring and storage
 *   /api/ai/*          Generation Service   — the model seam
 *   /api/data/batch    Data Gateway         — the single path to data
 *   /api/sources       Catalog Ingestion    — register, scan and publish a database's vocabulary
 *   /api/products      Product Registry     — the EDM product's own declaration and its standard pages
 *
 * Conventions kept from §3.4 because calling code branches on them: one batch per render, a
 * machine-readable error category on every failure, and a correlation id threaded through.
 */

import { Router, type Request, type Response } from 'express';
import type { BatchRequest, DataSource, ExperienceDefinition, UserContext } from '@opus/contracts';
import type { ModelRequest } from '@opus/generation';

import { AI_PROVIDER } from './config';
import { activeProvider, providerCatalogue, type MockSimulationInput } from './ai/providers/index';
import { catalogVersion, projectionFor } from './services/catalog';
import { validateExperience, type ExperienceValidation } from './services/validate-experience';
import {
  productOf,
  productProblems,
  productViews,
  unreadableRegistrations,
  type ProductResolution,
} from './services/product-registry';
import { executeBatch, servedEntities } from './services/gateway';
import {
  applyTransition,
  compareWithStandard,
  declineUpdate,
  derivedIdFor,
  deriveClientExperience,
  describeUpdate,
  isStandard,
  updateAvailableFor,
} from '@opus/experience-model';

import { PERSONAS, personaById } from './personas';
import { sources } from './sources/routes';
import * as store from './store/experience-store';

export const api = Router();

/**
 * RFC 9457-shaped. The category is closed and load-bearing: the client branches on it.
 *
 * `code` is deliberately *not* the same type. It is the specific reason — `notFound`,
 * `providerFailed`, `fanOutExceeded` — which a client may log, show or match on but must not need in
 * order to behave correctly. Defaulting it to `category` was a shortcut that gave it the closed type
 * by accident, so every caller passing a real code was a type error nobody saw: this file was never
 * type-checked. See `tsconfig.server.json`.
 */
function problem(
  res: Response,
  status: number,
  category: 'validation' | 'semantic' | 'entitlement' | 'cost' | 'concurrency' | 'upstream' | 'provider' | 'capability',
  detail: string,
  code: string = category,
): void {
  res.status(status).json({ type: `about:blank#${code}`, title: code, status, category, code, detail });
}

function callerFrom(req: Request): { user: UserContext; dataCapabilities: readonly string[] } {
  // The prototype resolves identity from a header, which is the one place it knowingly does what
  // the security architecture forbids: identity must come from a verified token claim, never from a
  // client-supplied header (P3). It is a demo persona switch, and it is listed as such.
  const id = String(req.header('x-persona') ?? req.query['persona'] ?? 'analyst');
  const persona = personaById(id);
  return { user: persona.user, dataCapabilities: persona.dataCapabilities };
}

// ── sources (catalog ingestion) ─────────────────────────────────────────────
// Its own router because it is its own service boundary: it is the only thing in this process that
// opens a connection to somebody else's database, and the only one gated on catalog stewardship.
api.use('/sources', sources);

// ── health ──────────────────────────────────────────────────────────────────
api.get('/health', async (_req, res) => {
  res.json({
    status: 'ok',
    catalogVersion: catalogVersion(),
    entities: await servedEntities(),
    experiences: store.list().length,
    products: productViews().length,
    ai: { active: AI_PROVIDER, providers: providerCatalogue() },
  });
});

// ── personas (the demo's identity switch) ───────────────────────────────────
api.get('/personas', (_req, res) => {
  res.json(
    PERSONAS.map((p) => ({
      id: p.id,
      label: p.label,
      description: p.description,
      displayName: p.user.displayName,
      capabilities: p.user.capabilities,
      dataCapabilities: p.dataCapabilities,
    })),
  );
});

// ── catalog ─────────────────────────────────────────────────────────────────
api.get('/catalog', (req, res) => {
  const { user, dataCapabilities } = callerFrom(req);
  // The projection, never the raw catalog: `physical` blocks and unentitled members are removed
  // here, on the server, which is the only place removal means anything.
  res.json({ catalogVersion: catalogVersion(), snapshot: projectionFor(user, dataCapabilities) });
});

/**
 * Who is acting, for a write — from the resolved identity, never from the body.
 *
 * The body used to carry `actorId`, and the store trusted it. That is the wrong shape twice over: it
 * defaults to `'anonymous'` when omitted, and when supplied it is a claim by the party being audited.
 * Meanwhile the same request already carries a persona the server resolves for every read, so the
 * verified answer was available the whole time and was being ignored.
 *
 * Refused rather than ignored when a client sends one. Ignoring it means a caller who believes they
 * are recording an actor gets a 200 and a different name in the audit log — the same reasoning as the
 * source-edit route refusing a password rather than dropping it.
 */
/**
 * Refuse a save that tries to move the lifecycle.
 *
 * This is the hole that made FR-33's whole chain optional: a client PUT the entire definition,
 * `version.lifecycleState` included, so anything could write `published` and skip every stage. State now
 * moves only through the transition routes below.
 *
 * Refused rather than silently reset, on the same reasoning as the actor: a caller who believes they
 * just published something must not get a 200 for a save that did not.
 */
function refuseLifecycleChange(
  incoming: unknown,
  previous: { definition?: { version?: { lifecycleState?: string } } } | null,
  res: Response,
): boolean {
  const proposed = (incoming as { version?: { lifecycleState?: string } })?.version?.lifecycleState;
  const current = previous?.definition?.version?.lifecycleState ?? 'draft';
  // Absent is fine — most saves do not mention it. Equal is fine. Different is a transition.
  if (proposed === undefined || proposed === current) return false;

  problem(
    res,
    409,
    'concurrency',
    `A save cannot move an experience from "${current}" to "${proposed}". The lifecycle moves through its own transitions — POST /api/experiences/:id/submit, /approve, /reject, /publish — each of which checks what that step requires. Save the definition without changing version.lifecycleState.`,
    'lifecycleNotSavable',
  );
  return true;
}

function actorFor(req: Request, res: Response): string | null {
  const body = req.body as { actorId?: unknown } | undefined;
  if (body && 'actorId' in body && body.actorId !== undefined) {
    problem(
      res,
      400,
      'validation',
      'An actor is not supplied by the caller. It is resolved from the identity on the request, because an audit trail whose actor is asserted by the party being audited records nothing. Remove `actorId` from the body.',
    );
    return null;
  }
  return callerFrom(req).user.id;
}

/**
 * Turn a store refusal into a problem response, keeping what the store said about it.
 *
 * The three save routes previously flattened every 409 to `concurrency` and discarded the error's own
 * `code`. That is wrong twice over for §16: nothing raced when a client tried to save over a product
 * standard, so `concurrency` misdescribes it; and `standardNotEditable` is precisely the code a client
 * needs in order to do the right thing next, which is to derive and retry. `deriveTo` is carried for
 * the same reason — a refusal that does not name the alternative makes the caller reimplement
 * `derivedIdFor` to recover from it.
 */
function refuseSave(res: Response, error: unknown): void {
  const { status = 500, code, deriveTo } = error as { status?: number; code?: string; deriveTo?: string };
  const category = code === 'standardNotEditable' ? 'semantic' : status === 409 ? 'concurrency' : 'validation';
  if (deriveTo) {
    res.status(status).json({
      type: `about:blank#${code}`,
      title: code,
      status,
      category,
      code,
      detail: (error as Error).message,
      deriveTo,
    });
    return;
  }
  problem(res, status, category, (error as Error).message, code ?? category);
}

/**
 * Resolve which product an experience belongs to, from the entities it reads, and stamp it.
 *
 * Derived rather than accepted from the body for the same reason `actorId` is: a value the client
 * asserts about itself is a value the client can be wrong about. Here the wrongness is quieter than an
 * unauthenticated actor but lasts longer — a page repointed at another product's data keeps its old
 * badge forever, and every catalog filter built on that badge is then wrong.
 *
 * Three outcomes remove any value rather than keep a stale one, and one keeps it:
 *
 *   resolved   → stamp it
 *   unclaimed  → no product owns what this reads; a badge would be an invention
 *   spans      → two products; picking one mislabels the artifact silently (FR-3 leaves this open)
 *   noCatalog  → nothing can be derived, so whatever was there is left alone rather than destroyed
 */
function withResolvedProduct(definition: ExperienceDefinition): {
  definition: ExperienceDefinition;
  resolution: ProductResolution;
} {
  const resolution = productOf(definition);
  if (resolution.outcome === 'resolved') {
    return { definition: { ...definition, productId: resolution.productId }, resolution };
  }
  if (resolution.outcome === 'noCatalog') return { definition, resolution };
  const { productId: _stale, ...withoutProduct } = definition;
  return { definition: withoutProduct as ExperienceDefinition, resolution };
}

// ── products (the Product Experience Registry) ──────────────────────────────
/**
 * What each Opus product contributes, and what is wrong with how it was registered.
 *
 * `problems` is returned alongside the products rather than logged and forgotten, because the
 * interesting failures are the ones an operator caused by editing a file: two products claiming one
 * catalog domain, a System Journey stepping through a page nobody ships. A registry that hides those
 * behaves as though the second claimant does not exist.
 */
api.get('/products', (_req, res) => {
  res.json({
    products: productViews(),
    problems: productProblems(),
    unreadable: unreadableRegistrations(),
  });
});

/*
  ── PARKED: GET /products/identify ─────────────────────────────────────────────────────
  Product identification from intent served the superseded portfolio PRD, whose FR-3 asked the AI to
  work out which of several Opus products a prompt concerned. The EDM Experience Framework PRD is
  single-product: with one product registered the answer is always that product, and a route that
  cannot be wrong cannot be useful.

  `identifyProduct` and its signal index are untouched in `@opus/product-registry`, still tested, and
  still the cheapest proof that the platform core carries no product-specific branching. `docs/PARKED.md`
  §1 records what un-parking takes: register a second product and restore this route.
  ──────────────────────────────────────────────────────────────────────────────────────
*/

// ── experiences ─────────────────────────────────────────────────────────────
/**
 * The catalog listing, with the product filled in where the record does not carry one.
 *
 * A seeded artifact never went through `save`, so nothing ever stamped its `productId` — and those are
 * exactly the shipped baselines a user browses first. Leaving them blank would make FR-12's product
 * column look broken on a fresh install, and back-filling the files on boot would dirty a checked-in
 * fixture as a side effect of reading it.
 *
 * Deriving here costs one extra read per row. Acceptable at this scale and worth stating: with
 * thousands of experiences the product belongs in an index, not in a loop.
 */
api.get('/experiences', (_req, res) => {
  res.json(
    store.list().map((summary) => {
      if (summary.product) return summary;
      const record = store.get(summary.id);
      const resolution = record ? productOf(record.definition) : undefined;
      return resolution?.outcome === 'resolved' ? { ...summary, product: resolution.productId } : summary;
    }),
  );
});

api.get('/experiences/:id', (req, res) => {
  const record = store.get(req.params.id);
  if (!record) return problem(res, 404, 'semantic', `No experience "${req.params.id}"`, 'notFound');
  res.json(record);
});

api.put('/experiences/:id', (req, res) => {
  const body = req.body as { definition?: unknown; origin?: string };
  if (!body?.definition) return problem(res, 400, 'validation', 'Body must carry `definition`');
  const definition = body.definition as { id?: string };
  if (definition.id !== req.params.id) {
    return problem(res, 400, 'validation', `Body id "${definition.id}" does not match path "${req.params.id}"`);
  }
  const actorId = actorFor(req, res);
  if (!actorId) return;
  if (refuseLifecycleChange(definition, store.get(req.params.id), res)) return;
  try {
    const resolved = withResolvedProduct(definition as never);
    res.json({
      ...store.save({ definition: resolved.definition, actorId, origin: body.origin as never }),
      // Alongside the record rather than inside it: this is how the product was decided, not part of
      // the artifact. The client shows it when the answer was "two products" or "none".
      productResolution: resolved.resolution,
    });
  } catch (error) {
    return refuseSave(res, error);
  }
});

api.post('/experiences', (req, res) => {
  const body = req.body as { definition?: unknown; origin?: string };
  if (!body?.definition) return problem(res, 400, 'validation', 'Body must carry `definition`');
  const actorId = actorFor(req, res);
  if (!actorId) return;
  /*
    A create may not arrive already approved or published either. `previous` is null, so the guard
    compares against "draft" — which is the only state a new experience may be created in.
  */
  if (refuseLifecycleChange(body.definition, null, res)) return;
  try {
    const resolved = withResolvedProduct(body.definition as never);
    res.status(201).json({
      ...store.save({ definition: resolved.definition, actorId, origin: body.origin as never }),
      productResolution: resolved.resolution,
    });
  } catch (error) {
    return refuseSave(res, error);
  }
});

// ── §16: standards, derivation, and update notification ─────────────────────

/**
 * Every product standard the store holds.
 *
 * Read from the store rather than from the definitions directory, because a standard reaches the store
 * by deployment (`seedMissing`) and the store is therefore the authority on which version is actually
 * installed. Reading the files would report what the release *contains*, which is a different question
 * and the wrong one for "is an update available".
 */
function standardDefinitions(): ExperienceDefinition[] {
  return store
    .list()
    .map((summary) => store.get(summary.id)?.definition)
    .filter((definition): definition is ExperienceDefinition => !!definition && isStandard(definition));
}

api.get('/standards', (_req, res) => {
  res.json(
    standardDefinitions().map((definition) => ({
      id: definition.id,
      name: typeof definition.name === 'string' ? definition.name : definition.name.default,
      standardId: definition.standard!.standardId,
      version: definition.standard!.version,
      productRelease: definition.standard!.productRelease,
      releaseNotes: definition.standard!.releaseNotes,
      pageCount: Object.keys(definition.pages ?? {}).length,
      /* Whether this tenant has already forked it, so the library can offer Open or Customise. */
      derivedId: store.get(derivedIdFor(definition.standard!.standardId)) ? derivedIdFor(definition.standard!.standardId) : null,
    })),
  );
});

/**
 * FR-20 — fork a standard into a client-specific experience.
 *
 * A separate route rather than a side effect of saving, because the fork is the thing §16 cares about
 * and a PUT that quietly wrote somewhere other than its own URL would hide it. The builder calls this
 * on the first edit of a standard and says what happened; the store's 409 names this route for anyone
 * who tries the save directly.
 *
 * Idempotent by returning the existing variant rather than a second one: §16 speaks of "your current
 * experience", singular, and a second fork would give "is an update available for my Security Master
 * Overview" two answers.
 */
api.post('/experiences/:id/derive', (req, res) => {
  const record = store.get(req.params.id);
  if (!record) return problem(res, 404, 'semantic', `No experience "${req.params.id}"`, 'notFound');

  const actorId = actorFor(req, res);
  if (!actorId) return;

  const body = (req.body ?? {}) as { name?: string; id?: string };
  const outcome = deriveClientExperience(
    { standard: record.definition, actorId, name: body.name, id: body.id },
    new Date().toISOString(),
  );
  if (!outcome.ok) {
    return problem(res, 409, 'semantic', outcome.detail, outcome.code);
  }

  const existing = store.get(outcome.definition.id);
  if (existing) {
    // Already forked. Returning it with 200 rather than 409 because the caller's intent — "give me my
    // client version of this" — is satisfied, and a conflict would push every caller into a
    // check-then-create race for no benefit.
    return res.status(200).json({ ...existing, derived: false });
  }

  try {
    const resolved = withResolvedProduct(outcome.definition);
    res.status(201).json({
      ...store.save({ definition: resolved.definition, actorId, origin: 'copy' }),
      productResolution: resolved.resolution,
      derived: true,
    });
  } catch (error) {
    return refuseSave(res, error);
  }
});

/**
 * FR-21 — §16.3's notification, for one client experience.
 *
 * Returns `null` rather than 404 when there is no update: "nothing is available" is a successful
 * answer to this question, and a 404 would make a client branch on an error to render a quiet state.
 */
api.get('/experiences/:id/standard-update', (req, res) => {
  const record = store.get(req.params.id);
  if (!record) return problem(res, 404, 'semantic', `No experience "${req.params.id}"`, 'notFound');

  const standards = standardDefinitions();
  const update = updateAvailableFor(record.definition, standards);
  if (!update) return res.json({ update: null });

  /*
    The STANDARD's name, not the client's. A client that renamed its variant to "Securities Operations
    — Acme" has no new version of that; the product released a new version of the standard the variant
    derives from, and saying otherwise invites the reader to look for an Acme release that does not
    exist. §16.3's own example names the page the product ships.
  */
  const shipped = standards.find((s) => s.standard?.standardId === update.standardId);
  const name = shipped
    ? typeof shipped.name === 'string'
      ? shipped.name
      : shipped.name.default
    : update.standardId;
  res.json({ update, message: describeUpdate(update, name) });
});

/**
 * FR-22 — §16.4's comparison.
 *
 * The three artifacts are assembled here because only the store knows where they are: the variant, the
 * shipped standard, and — the one that used to be impossible — the **baseline**, the standard version
 * the variant was derived from. `standardAtVersion` reads it from the archive `deployStandards` writes.
 *
 * Refuses with the model's own code rather than flattening to a 409, because `baselineUnavailable` and
 * `notDerived` call for different things from the caller: the first means "this cannot be compared,
 * offer Keep My Version", the second means "you asked about the wrong artifact".
 */
api.get('/experiences/:id/compare-standard', (req, res) => {
  const record = store.get(req.params.id);
  if (!record) return problem(res, 404, 'semantic', `No experience "${req.params.id}"`, 'notFound');

  const lineage = record.definition.derivedFrom;
  if (!lineage) {
    return problem(
      res,
      409,
      'semantic',
      `“${req.params.id}” is not derived from a product standard, so there is nothing to compare it against.`,
      'notDerived',
    );
  }

  const shipped = standardDefinitions().find((s) => s.standard?.standardId === lineage.standardId);
  if (!shipped) {
    return problem(
      res,
      409,
      'semantic',
      `The standard “${lineage.standardId}” is not installed, so there is nothing newer to compare against.`,
      'standardNotShipped',
    );
  }

  const outcome = compareWithStandard({
    client: record.definition,
    standard: shipped,
    baseline: store.standardAtVersion(shipped.id, lineage.standardVersion),
  });

  if (!outcome.ok) {
    // 409 for every refusal: each says the artifacts are not in a state this question can be asked of,
    // which is a semantic conflict rather than a bad request. The `code` is what a caller branches on.
    return problem(res, 409, 'semantic', outcome.detail, outcome.code);
  }
  res.json(outcome.comparison);
});

/**
 * FR-21 — §16.3's **Keep My Version**.
 *
 * A POST rather than a PATCH on the experience, because the decision is not a property of the
 * experience the way its name is: it is an act with an actor and a time, and the body carries the one
 * thing the server must not infer — *which* version was on offer when the person decided. Inferring it
 * from the shipped standard would record a decline of whatever happens to be current at the moment the
 * request lands, which is not necessarily what was on the screen.
 *
 * Written through `saveLineage` rather than `save`, and that is not a detail. `save` increments
 * `artifactVersion`, which is what `customised` counts — so recording a decline through it made the
 * *next* notification claim customizations the owner had never made. A write that records a decision
 * about an experience must not move the version line of that experience.
 *
 * §16.3's "Review Later" has no route at all: it records nothing, which is the difference between it
 * and this.
 */
api.post('/experiences/:id/decline-update', (req, res) => {
  const record = store.get(req.params.id);
  if (!record) return problem(res, 404, 'semantic', `No experience "${req.params.id}"`, 'notFound');

  const actorId = actorFor(req, res);
  if (!actorId) return;

  const version = (req.body as { version?: unknown } | undefined)?.version;
  if (typeof version !== 'string' || !version.trim()) {
    return problem(
      res,
      400,
      'validation',
      'A "version" is required — the standard version that was offered and is being declined.',
      'versionRequired',
    );
  }

  const outcome = declineUpdate(record.definition, version.trim(), actorId, new Date().toISOString());
  if (!outcome.ok) {
    return problem(res, 409, 'semantic', outcome.detail, outcome.code);
  }

  try {
    res.json(
      store.saveLineage({
        id: record.id,
        derivedFrom: outcome.definition.derivedFrom!,
        actorId,
        event: 'declineStandardUpdate',
      }),
    );
  } catch (error) {
    return refuseSave(res, error);
  }
});

// ── lifecycle transitions ───────────────────────────────────────────────────
/**
 * `submit`, `approve`, `reject`, `publish` — the four steps FR-33's chain needs.
 *
 * One handler because the differences between them all live in `applyTransition`, which is pure and
 * tested as arithmetic. What the route adds is the three things the pure function cannot know: who is
 * asking, whether the artifact validates, and how to persist the result.
 *
 * `validate` is exposed as its own route too, because a steward wants to see what is wrong before
 * submitting rather than being told a submission was refused.
 */
api.post('/experiences/:id/validate', (req, res) => {
  const record = store.get(req.params.id);
  if (!record) return problem(res, 404, 'semantic', `No experience "${req.params.id}"`, 'notFound');
  res.json(validateExperience(record.definition));
});

const TRANSITIONS = ['submit', 'approve', 'reject', 'publish'] as const;

for (const transition of TRANSITIONS) {
  api.post(`/experiences/:id/${transition}`, (req, res) => {
    const record = store.get(req.params.id);
    if (!record) return problem(res, 404, 'semantic', `No experience "${req.params.id}"`, 'notFound');

    const actorId = actorFor(req, res);
    if (!actorId) return;
    const { user } = callerFrom(req);
    const body = (req.body ?? {}) as { note?: string; environments?: string[] };

    /*
      Validation runs only for `submit`, and its cost is the reason.

      It reads every page against the catalog and the manifests. Doing that on approve and publish as
      well would re-answer a question already answered, and the answer cannot have changed: a save
      cannot move state, so nothing has been edited since the submission that was validated.
    */
    const validation = transition === 'submit' ? validateExperience(record.definition) : undefined;

    const outcome = applyTransition(
      record.definition.version,
      {
        transition,
        actorId,
        capabilities: user.capabilities,
        ...(validation ? { validated: validation.valid } : {}),
        ...(body.note ? { note: body.note } : {}),
        ...(body.environments ? { environments: body.environments } : {}),
      },
      new Date().toISOString(),
    );

    if (!outcome.ok) {
      // 422 rather than 409: the request is well-formed and the artifact's state or the caller's rights
      // are what refuse it. `code` is the machine-readable half a client branches on.
      return problem(
        res,
        outcome.code === 'missingCapability' ? 403 : 422,
        outcome.code === 'missingCapability' ? 'entitlement' : 'semantic',
        validation && outcome.code === 'notValidated'
          ? `${outcome.detail} ${describeFailures(validation)}`
          : outcome.detail,
        outcome.code,
      );
    }

    /*
      Written through `saveTransition`, not `save`.

      `save` refuses to touch a published version and increments the artifact version on every write —
      both correct for an edit and wrong for a transition: approving something must not create a new
      version of it, and publishing must be able to write the record that makes it immutable.
    */
    const saved = store.saveTransition({
      id: record.id,
      version: outcome.version,
      actorId,
      transition,
    });
    res.json({ ...store.summarize(saved), state: outcome.state, ...(validation ? { validation } : {}) });
  });
}

/** The first few reasons a validation failed, for a refusal message somebody can act on. */
function describeFailures(validation: ExperienceValidation): string {
  const lines = [
    ...validation.pages.flatMap((page) =>
      page.findings
        .filter((finding) => finding.severity === 'error')
        .map((finding) => `${page.pageId}: ${finding.message}`),
    ),
    ...validation.elements
      .filter((problem) => problem.severity === 'error')
      .map((problem) => `${problem.path}: ${problem.message}`),
  ];
  if (!lines.length) return '';
  const shown = lines.slice(0, 3).join(' · ');
  return lines.length > 3 ? `${shown} (and ${lines.length - 3} more)` : shown;
}

api.delete('/experiences/:id', (req, res) => {
  const removed = store.remove(req.params.id);
  if (!removed) return problem(res, 404, 'semantic', `No experience "${req.params.id}"`, 'notFound');
  res.status(204).end();
});

// ── generation: the model seam ──────────────────────────────────────────────
api.get('/ai/providers', (_req, res) => {
  res.json({ active: AI_PROVIDER, providers: providerCatalogue() });
});

/**
 * One model call.
 *
 * The endpoint is deliberately this small. The *pipeline* — intake, grounding, context assembly,
 * plan, fill, assembly, the validation cascade, bounded repair, deterministic fallback — is platform
 * logic in `@opus/generation` and is provider-agnostic. What has to cross the network is the model
 * call, because that is what needs credentials. Putting the pipeline behind the network instead
 * would move code that has nothing to do with the model.
 */
api.post('/ai/generate', async (req, res) => {
  const body = req.body as { request?: ModelRequest; simulation?: MockSimulationInput };
  if (!body?.request?.purpose || !body.request.responseSchema) {
    return problem(res, 400, 'validation', 'Body must carry `request` with `purpose` and `responseSchema`');
  }
  const provider = activeProvider();
  if (!provider.configured) {
    return problem(
      res,
      503,
      'provider',
      `Provider "${provider.id}" is registered but not configured. Set AI_PROVIDER=mock, or supply its credentials.`,
      'providerNotConfigured',
    );
  }
  try {
    const response = await provider.complete(body.request, body.simulation);
    res.json({ provider: { id: provider.id, version: provider.version, external: provider.isExternal }, response });
  } catch (error) {
    const status = (error as { status?: number }).status ?? 502;
    problem(res, status, 'provider', (error as Error).message, 'providerFailed');
  }
});

// ── data ────────────────────────────────────────────────────────────────────
api.post('/data/batch', async (req, res) => {
  const body = req.body as {
    batch?: BatchRequest;
    sources?: Record<string, DataSource>;
    simulate?: 'none' | 'denied' | 'error' | 'empty' | 'slow';
  };
  if (!body?.batch?.queries?.length) {
    return problem(res, 400, 'validation', 'Body must carry `batch.queries`');
  }
  if (body.batch.queries.length > 64) {
    // A fan-out cap is a cost guard, and refusing is the correct answer: silently truncating would
    // make a page look complete when it is not.
    return problem(res, 400, 'cost', `Batch of ${body.batch.queries.length} exceeds the 64-query cap`, 'fanOutExceeded');
  }
  const caller = callerFrom(req);
  try {
    const response = await executeBatch(body.batch, body.sources ?? {}, {
      user: caller.user,
      dataCapabilities: caller.dataCapabilities,
      simulate: body.simulate,
    });
    res.json(response);
  } catch (error) {
    problem(res, 502, 'upstream', (error as Error).message, 'gatewayFailed');
  }
});
