/**
 * REST surface. Four resources, and the split follows the service decomposition in
 * architecture/backend-architecture.md §2.2 rather than the shape of the UI:
 *
 *   /api/catalog       Catalog Service      — the governed vocabulary, entitlement-scoped
 *   /api/experiences   Definition Service   — authoring and storage
 *   /api/ai/*          Generation Service   — the model seam
 *   /api/data/batch    Data Gateway         — the single path to data
 *   /api/sources       Catalog Ingestion    — register, scan and publish a database's vocabulary
 *
 * Conventions kept from §3.4 because calling code branches on them: one batch per render, a
 * machine-readable error category on every failure, and a correlation id threaded through.
 */

import { Router, type Request, type Response } from 'express';
import type { BatchRequest, DataSource, UserContext } from '@opus/contracts';
import type { ModelRequest } from '@opus/generation';

import { AI_PROVIDER } from './config';
import { activeProvider, providerCatalogue, type MockSimulationInput } from './ai/providers/index';
import { catalogVersion, projectionFor } from './services/catalog';
import { validateExperience, type ExperienceValidation } from './services/validate-experience';
import { executeBatch, servedEntities } from './services/gateway';
import { applyTransition } from '@opus/experience-model';

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

// ── experiences ─────────────────────────────────────────────────────────────
api.get('/experiences', (_req, res) => {
  res.json(store.list());
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
    res.json(store.save({ definition: definition as never, actorId, origin: body.origin as never }));
  } catch (error) {
    const status = (error as { status?: number }).status ?? 500;
    problem(res, status, status === 409 ? 'concurrency' : 'validation', (error as Error).message);
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
    res.status(201).json(store.save({ definition: body.definition as never, actorId, origin: body.origin as never }));
  } catch (error) {
    const status = (error as { status?: number }).status ?? 500;
    problem(res, status, status === 409 ? 'concurrency' : 'validation', (error as Error).message);
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
