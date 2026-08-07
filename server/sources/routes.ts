/**
 * `/api/sources` — the ingestion API. The step that made the scan real.
 *
 * ── WHY THESE ROUTES AND NOT ONE ────────────────────────────────────────────────────────
 * A single `POST /api/sources/:id/ingest` that scanned, inferred and published would be simpler and
 * would remove the reason the pipeline is five steps. The steward's review sits between inference and
 * promotion, so the scan has to return a draft and stop. `test` is separate again because "can this
 * registration connect at all" is the question a steward has when a scan fails, and answering it with
 * a full scan is a slow way to learn that a password is wrong.
 *
 * ── THE ENTITLEMENT, AND THE ONE PLACE PHYSICAL NAMES ARE ALLOWED OUT ───────────────────
 * Every route here requires `catalog.edit`. That is not boilerplate: a draft contains physical table
 * and column names, and the platform's standing rule is that `physical` never reaches a client
 * (`CatalogService.projectionFor` strips it, and a test asserts the strings do not appear).
 *
 * The review screen is the deliberate exception, because it cannot do its job without them. A steward
 * asked "is `EXCPTN_STS` the column you mean by Exception Status?" needs to see `EXCPTN_STS`. So the
 * exception is scoped rather than general: it applies to a caller holding catalog stewardship, on a
 * source they registered, in a payload that is a *draft* and not a catalog. An author's projection is
 * unchanged, and an author calling these routes gets 403.
 *
 * ── AND WHAT A FAILED SCAN RETURNS ──────────────────────────────────────────────────────
 * The reason, in the steward's language, with the driver's own message passed through after a redaction
 * pass. A scan against somebody's production database fails for ordinary reasons — a firewall, an
 * expired password, a login without `VIEW DEFINITION` — and every one of those is a different fix. A
 * generic "scan failed" turns a two-minute correction into a support ticket.
 */

import { Router, type Request, type Response } from 'express';
import {
  MsSqlProbe,
  applyEdit,
  blockingProblems,
  changedFields,
  checkEdit,
  checkRegistration,
  defaultDecisions,
  detectDrift,
  editContextOf,
  editableView,
  infer,
  managedSecretRefFor,
  materialChanges,
  normalise,
  promote,
  redactForClient,
  type AuthMode,
  type SourceEdit,
  type SourceRegistration,
  type SourceRegistrationInput,
  type StewardDecisions,
} from '@opus/catalog-ingest';

import { personaById } from '../personas';
import { projectionFor, publish, storedCatalog } from '../services/catalog';
import { executorFor, releaseExecutor } from './mssql-executor';
import {
  canStoreSecrets,
  deleteSecret,
  managedSecretExists,
  storeUnavailableReason,
  writeSecret,
} from './secret-store';
import { secretIsAvailable } from './secrets';
import * as store from './source-store';

export const sources = Router();

/** The capability that owns the catalog. See the note above about physical names. */
const REQUIRED_CAPABILITY = 'catalog.edit';

type Category = 'validation' | 'semantic' | 'entitlement' | 'upstream';

function problem(res: Response, status: number, category: Category, detail: string, code = category): void {
  res.status(status).json({ type: `about:blank#${code}`, title: code, status, category, code, detail });
}

/**
 * The caller, and whether they may steward the catalog.
 *
 * Reads the same demo persona header `routes.ts` documents as its one deviation from the security
 * architecture. The deviation is the *source* of the identity, not the check — the check is real, and
 * moving to a verified token claim changes this function and nothing below it.
 */
function steward(req: Request): { id: string; name: string } | null {
  const persona = personaById(String(req.header('x-persona') ?? req.query['persona'] ?? 'analyst'));
  if (!persona.user.capabilities.includes(REQUIRED_CAPABILITY)) return null;
  return { id: persona.user.id, name: persona.user.displayName };
}

function requireSteward(req: Request, res: Response): { id: string; name: string } | null {
  const caller = steward(req);
  if (!caller) {
    problem(
      res,
      403,
      'entitlement',
      `Registering a source and publishing a catalog need the "${REQUIRED_CAPABILITY}" capability. A scan exposes physical table and column names, which the catalog projection deliberately withholds.`,
    );
    return null;
  }
  return caller;
}

/** What a client is told about a stored source. Redacted, plus where its ingestion has reached. */
function summarise(stored: store.StoredSource) {
  return {
    ...redactForClient(stored.registration),
    promotedAt: stored.promotedAt,
    promotedBy: stored.promotedBy,
    /** True when there is a baseline to diff a re-scan against. */
    hasBaseline: !!stored.promotedSchema,
  };
}

function probeFor(registration: SourceRegistration): MsSqlProbe {
  return new MsSqlProbe(registration.id, registration.database, registration.schemas);
}

// ── the roster ──────────────────────────────────────────────────────────────
sources.get('/', (req, res) => {
  if (!requireSteward(req, res)) return;
  res.json({
    sources: store.list().map(summarise),
    /*
      Whether this deployment can store a typed password, and why not if it cannot.

      Sent with the roster so the register form knows before it renders: offering a password field that
      the server will refuse is worse than not offering it, because the steward types a real credential
      into it first.
    */
    canStorePassword: canStoreSecrets(),
    passwordUnavailableReason: storeUnavailableReason(),
  });
});

// ── register ────────────────────────────────────────────────────────────────
sources.post('/', (req, res) => {
  const caller = requireSteward(req, res);
  if (!caller) return;

  const input = {
    ...(req.body as Record<string, unknown>),
    registeredBy: caller.name,
  } as SourceRegistrationInput;

  /*
    The same function the browser runs as the steward types, run again here — a client-side check is a
    convenience and a server-side check is the control.

    Only the blocking problems refuse. A warning (encryption off, an unverified certificate) is a
    judgement somebody with this capability is allowed to make, and `normalise` records which ones they
    made on the registration itself.
  */
  const problems = checkRegistration(input);
  if (blockingProblems(problems).length) {
    res.status(422).json({
      type: 'about:blank#validation',
      title: 'validation',
      status: 422,
      category: 'validation',
      code: 'validation',
      detail: blockingProblems(problems)[0]!.message,
      problems,
    });
    return;
  }

  const id = store.nextId(input.name);

  /*
    The typed password's whole journey, in one place.

    It arrived in the request body, it is written to the encrypted store under a name this platform
    generates, and `normalise` is handed the *name*. Nothing below this point has the password: not the
    registration, not the response, not the audit record — `input` goes out of scope with the request.
  */
  let managedRef: string | undefined;
  const typedPassword = input.password;
  if (typedPassword) {
    if (!canStoreSecrets()) {
      problem(res, 422, 'validation', storeUnavailableReason() ?? 'This platform cannot store a password.');
      return;
    }
    managedRef = managedSecretRefFor(id);
    try {
      writeSecret(managedRef, typedPassword, caller.name);
    } catch (error) {
      problem(res, 500, 'upstream', asText(error));
      return;
    }
  }

  const registration = normalise(input, id, new Date().toISOString(), managedRef);
  store.save({ registration });
  // The accepted warnings go back with the summary, so the screen can show what it just waved through.
  res.status(201).json(summarise({ registration }));
});

// ── read a registration back, for an edit form ──────────────────────────────
/**
 * The editable values, for one source, to a caller holding `catalog.edit`.
 *
 * A separate route from the roster on purpose. `GET /` answers with `redactForClient`, which collapses
 * the target into one string and withholds the username — right for a list, useless for a form that has
 * to pre-fill what it is about to replace. This is the wider view, and keeping it here means the wider
 * view is requested one source at a time, deliberately, rather than shipped with every roster load.
 *
 * The revision history rides along for the same reason it exists: an edit screen is where somebody asks
 * "has anyone moved this before, and did that throw the baseline away".
 */
sources.get('/:id/editable', (req, res) => {
  if (!requireSteward(req, res)) return;
  const stored = store.get(String(req.params['id']));
  if (!stored) {
    problem(res, 404, 'semantic', `No source "${req.params['id']}" is registered.`);
    return;
  }
  res.json({
    editable: editableView(stored.registration),
    hasBaseline: !!stored.promotedSchema,
    revisions: stored.revisions ?? [],
  });
});

// ── edit ────────────────────────────────────────────────────────────────────
/**
 * Change what a source is, without changing what it is authenticated with.
 *
 * ── WHY AN EDIT IS NOT A DELETE AND A RE-REGISTER ───────────────────────────────────────
 * Because the id survives, and things point at it. `promote` writes `physical.sourceId` onto every
 * published entity, and `promotedSchema` is the baseline drift is measured against — so deleting and
 * re-registering a source that moved to a new host silently orphans a published catalog and resets its
 * history, to accomplish what is really a two-field change.
 *
 * ── AND WHY A MATERIAL CHANGE NEEDS SAYING YES TWICE ────────────────────────────────────
 * Drift is a diff against the promoted scan. Repoint the registration at another database, or widen the
 * schemas, and the next re-scan attributes to the *database* a change that was really made to the
 * *registration* — "42 tables added" about a database in which nothing happened. Worse is the quiet
 * case: two environments whose schemas happen to match, and a drift report that says nothing changed
 * while the catalog now describes somewhere else entirely.
 *
 * So an edit that would invalidate the baseline is refused once, with the fields that would do it, and
 * accepted on a second request carrying `confirmBaselineReset`. The baseline is then dropped rather
 * than kept — a stale baseline is worse than no baseline, because no baseline reports honestly that
 * there is nothing to compare against. `promotedAt` and `promotedBy` stay: that publish did happen, and
 * rewriting it would be a different kind of lie.
 */
sources.put('/:id', async (req, res) => {
  const caller = requireSteward(req, res);
  if (!caller) return;

  const id = String(req.params['id']);
  const stored = store.get(id);
  if (!stored) {
    problem(res, 404, 'semantic', `No source "${id}" is registered.`);
    return;
  }

  const body = (req.body ?? {}) as Record<string, unknown>;

  /*
    A password is refused here rather than ignored.

    Ignoring it would mean a client that posted one got a 200 and no error while the credential went
    nowhere — the steward believes it is set, the next scan fails on the old password, and nothing on
    the screen connects the two. Credentials have a route; this says so.
  */
  if ('password' in body) {
    problem(
      res,
      422,
      'validation',
      'An edit does not carry a password. Change the credential with PUT /api/sources/:id/credential — a metadata edit and a credential change are separate acts, and only one of them may put a secret on the wire.',
    );
    return;
  }

  const auth = (body['auth'] ?? stored.registration.auth) as AuthMode;
  if (!['integrated', 'sqlLogin', 'managedIdentity'].includes(auth)) {
    problem(res, 422, 'validation', `"${String(auth)}" is not an authentication mode this platform knows.`);
    return;
  }

  /*
    A missing field is not a blank field, for the two booleans only.

    Everything else is validated by `checkEdit` and fails loudly — an absent host is an empty host is
    "A host is required". The booleans cannot fail that way: absent, they would read as `false`, and a
    client that omitted `encrypt` would silently turn encryption off on a registration that had it on.
    So absent means "as it is now", and any real change appears in the response's change list.
  */
  const edit: SourceEdit = {
    name: String(body['name'] ?? ''),
    host: String(body['host'] ?? ''),
    port: body['port'] === undefined || body['port'] === null || body['port'] === '' ? undefined : Number(body['port']),
    database: String(body['database'] ?? ''),
    auth,
    username: body['username'] === undefined ? undefined : String(body['username']),
    secretRef: body['secretRef'] === undefined ? undefined : String(body['secretRef']),
    schemas: Array.isArray(body['schemas']) ? body['schemas'].map((schema) => String(schema)) : [],
    encrypt: body['encrypt'] === undefined ? stored.registration.encrypt : body['encrypt'] === true,
    trustServerCertificate:
      body['trustServerCertificate'] === undefined
        ? stored.registration.trustServerCertificate
        : body['trustServerCertificate'] === true,
  };

  // The same function the browser runs as the steward types. Warnings are theirs to accept.
  const problems = checkEdit(editContextOf(stored.registration), edit);
  if (blockingProblems(problems).length) {
    res.status(422).json({
      type: 'about:blank#validation',
      title: 'validation',
      status: 422,
      category: 'validation',
      code: 'validation',
      detail: blockingProblems(problems)[0]!.message,
      problems,
    });
    return;
  }

  const next = applyEdit(stored.registration, edit, new Date().toISOString(), caller.name);
  const changes = changedFields(stored.registration, next);

  // Nothing to do. Reported as success with an empty change list rather than as an error: opening a
  // form, changing nothing and saving is not a mistake, and a 4xx for it is a screen that looks broken.
  if (!changes.length) {
    res.json({ ...summarise(stored), changed: [], baselineCleared: false });
    return;
  }

  const material = materialChanges(changes);
  const clearsBaseline = material.length > 0 && !!stored.promotedSchema;

  if (clearsBaseline && body['confirmBaselineReset'] !== true) {
    res.status(409).json({
      type: 'about:blank#baseline-reset-required',
      title: 'baseline-reset-required',
      status: 409,
      category: 'semantic',
      code: 'baseline-reset-required',
      detail:
        `This changes what the next scan reads, so the promoted scan can no longer be used as a baseline: ` +
        `${material.map((change) => `${change.field} ${change.from || '(none)'} → ${change.to || '(none)'}`).join('; ')}. ` +
        `Saving discards the baseline — drift reports nothing until this source is scanned and published again. ` +
        `The published catalog itself is untouched.`,
      changes: material,
    });
    return;
  }

  /*
    A managed secret whose registration no longer points at it.

    Left behind, it is a password on disk belonging to nothing, that no screen will ever mention again —
    the same failure `DELETE /:id` cleans up, reached by a different route. Only a *managed* secret: a
    reference names something in the deployment's own store and is not this platform's to delete.
  */
  const hadManaged = summarise(stored).credential === 'managed';
  if (hadManaged && stored.registration.secretRef !== next.secretRef) {
    deleteSecret(stored.registration.secretRef!);
  }

  /*
    The pool is dropped on every edit, not only on a host change.

    A cached connection was opened with the previous host, database, login and transport settings, and it
    keeps answering until it idles out — so an edit would appear to have taken effect while the next scan
    still read the old target. Reconnecting costs one handshake; the alternative costs a steward their
    confidence in the screen.
  */
  await releaseExecutor(id);

  const revision = {
    at: next.updatedAt!,
    by: caller.name,
    changed: changes,
    baselineCleared: clearsBaseline,
  };

  const saved = store.save({
    ...stored,
    registration: next,
    // Dropped, not kept: see the note above about a stale baseline being worse than no baseline.
    promotedSchema: clearsBaseline ? undefined : stored.promotedSchema,
    revisions: [...(stored.revisions ?? []), revision],
  });

  res.json({ ...summarise(saved), changed: changes, baselineCleared: clearsBaseline });
});

/**
 * Rotate the credential on an existing source.
 *
 * A separate route because it is a separate act, and because passwords expire: without it a rotation
 * means deleting the registration and re-creating it, which loses the promoted-scan baseline that drift
 * is measured against — so the first password expiry would quietly cost the source its history.
 *
 * Only a *managed* credential is rotated here. One held in the deployment's own store is changed there,
 * and the platform picks the new value up on the next scan because it resolves the reference every time
 * rather than caching it.
 */
sources.put('/:id/credential', async (req, res) => {
  const caller = requireSteward(req, res);
  if (!caller) return;

  const stored = store.get(String(req.params['id']));
  if (!stored) {
    problem(res, 404, 'semantic', `No source "${req.params['id']}" is registered.`);
    return;
  }

  const body = req.body as { username?: string; password?: string };
  const password = body?.password ?? '';

  if (!password.trim()) {
    problem(res, 422, 'validation', 'Give the new password.');
    return;
  }
  if (stored.registration.auth !== 'sqlLogin') {
    problem(
      res,
      422,
      'validation',
      `This source authenticates with ${stored.registration.auth}, which has no password to rotate.`,
    );
    return;
  }
  if (!canStoreSecrets()) {
    problem(res, 422, 'validation', storeUnavailableReason() ?? 'This platform cannot store a password.');
    return;
  }

  const reference = managedSecretRefFor(stored.registration.id);
  try {
    writeSecret(reference, password, caller.name);
  } catch (error) {
    problem(res, 500, 'upstream', asText(error));
    return;
  }

  /*
    The pool is dropped rather than reused.

    A cached connection was opened with the old password and keeps working until it idles out, so a
    rotation would appear to have taken effect while the next scan still used the credential that was
    just replaced. Dropping it makes the next scan prove the new one.
  */
  await releaseExecutor(stored.registration.id);

  const registration: SourceRegistration = {
    ...stored.registration,
    username: body.username?.trim() || stored.registration.username,
    secretRef: reference,
  };
  store.save({ ...stored, registration });
  res.json(summarise({ ...stored, registration }));
});

sources.delete('/:id', async (req, res) => {
  if (!requireSteward(req, res)) return;
  const id = String(req.params['id']);
  const stored = store.get(id);
  await releaseExecutor(id);
  if (!store.remove(id)) {
    problem(res, 404, 'semantic', `No source "${id}" is registered.`);
    return;
  }
  /*
    The password goes with the registration.

    Otherwise removing a source leaves its credential on disk indefinitely, belonging to nothing, with
    no screen that would ever mention it again — which is how a decommissioned database's password
    outlives the database.
  */
  if (stored?.registration.secretRef) deleteSecret(stored.registration.secretRef);
  res.status(204).end();
});

// ── test the connection ─────────────────────────────────────────────────────
/**
 * Connect, read the version, disconnect. The cheapest question worth asking.
 *
 * Reports the secret's availability separately from the connection, because "no secret named X is
 * available to this process" and "the server refused the login" are different problems and only one
 * of them is about the database.
 */
sources.post('/:id/test', async (req, res) => {
  if (!requireSteward(req, res)) return;
  const stored = store.get(String(req.params['id']));
  if (!stored) {
    problem(res, 404, 'semantic', `No source "${req.params['id']}" is registered.`);
    return;
  }

  const { registration } = stored;
  if (registration.auth === 'sqlLogin' && !(await secretIsAvailable(registration.secretRef))) {
    // Two different problems, two different fixes: a password this platform stored and can no longer
    // read, versus a reference into a store that does not hold it.
    const managed = summarise(stored).credential === 'managed';
    problem(
      res,
      422,
      'validation',
      managed
        ? managedSecretExists(registration.secretRef!)
          ? `The stored password for this source could not be decrypted. OPUS_SECRET_KEY has probably changed since it was saved — re-enter the password to replace it.`
          : `This source's password is no longer stored. Re-enter it.`
        : `The secret named "${registration.secretRef}" is not available to this process, so no connection was attempted.`,
    );
    return;
  }

  try {
    const executor = await executorFor(registration);
    const rows = await executor.query('SELECT CAST(SERVERPROPERTY(N\'ProductVersion\') AS nvarchar(64)) AS [version]');
    res.json({ ok: true, target: executor.label, serverVersion: String(rows[0]?.['version'] ?? 'unreported') });
  } catch (error) {
    problem(res, 502, 'upstream', asText(error));
  } finally {
    // Closed either way: a test is a question, not the start of a session.
    await releaseExecutor(registration.id);
  }
});

// ── scan and infer ──────────────────────────────────────────────────────────
sources.post('/:id/scan', async (req, res) => {
  if (!requireSteward(req, res)) return;
  const stored = store.get(String(req.params['id']));
  if (!stored) {
    problem(res, 404, 'semantic', `No source "${req.params['id']}" is registered.`);
    return;
  }

  const sampleEnumerations = (req.body as { sampleEnumerations?: boolean })?.sampleEnumerations === true;

  try {
    const schema = await probeFor(stored.registration).scan(await executorFor(stored.registration), {
      sampleEnumerations,
    });
    const draft = infer(schema);

    res.json({
      schema,
      draft,
      // Everything promotable, included — data a UI renders, never a path that promotes.
      decisions: defaultDecisions(draft, stored.registration.registeredBy),
      // Only once there is a baseline. A first scan has nothing to have drifted from.
      drift: stored.promotedSchema
        ? detectDrift(stored.promotedSchema, schema, storedCatalog())
        : undefined,
    });
  } catch (error) {
    problem(res, 502, 'upstream', asText(error));
  } finally {
    /*
      The pool is released after a scan rather than kept warm.

      A scan is occasional and a held connection is a connection somebody cannot drain when they take
      the database down for maintenance. The cost is a fresh handshake on the next scan, which against
      a step that reads a whole schema is not measurable.
    */
    await releaseExecutor(stored.registration.id);
  }
});

// ── promote ─────────────────────────────────────────────────────────────────
sources.post('/:id/promote', async (req, res) => {
  const caller = requireSteward(req, res);
  if (!caller) return;

  const stored = store.get(String(req.params['id']));
  if (!stored) {
    problem(res, 404, 'semantic', `No source "${req.params['id']}" is registered.`);
    return;
  }

  const body = req.body as { decisions?: StewardDecisions; sampleEnumerations?: boolean };
  if (!body?.decisions?.entities) {
    problem(res, 422, 'validation', 'A promotion needs the reviewer’s decisions.');
    return;
  }

  try {
    /*
      Scanned again, here, rather than trusting a schema posted by the client.

      This is the load-bearing decision of the route. The browser holds a scan and a draft, and
      accepting them back would let a client dictate the physical mapping the gateway then queries
      through — which is an injection with extra steps. The decisions are the steward's and come from
      the client; the *facts* are re-read from the database, and the draft is re-derived from those
      facts by the same pure function.

      It also closes a real race rather than a theoretical one: a review that takes twenty minutes is
      twenty minutes in which a column can be dropped, and promoting a stale scan would publish a
      catalog pointing at a column that no longer exists.
    */
    const schema = await probeFor(stored.registration).scan(await executorFor(stored.registration), {
      sampleEnumerations: body.sampleEnumerations === true,
    });
    const draft = infer(schema);

    const result = promote(draft, { ...body.decisions, approvedBy: caller.name }, storedCatalog(), {
      tenantId: storedCatalog()?.tenantId ?? 'demo-tenant',
      promotedAt: new Date().toISOString(),
    });

    publish(result.catalog);
    store.save({
      ...stored,
      promotedSchema: schema,
      promotedAt: new Date().toISOString(),
      promotedBy: caller.name,
    });

    /*
      The catalog itself is not returned — the client asks for its projection, which is the only shape it
      is allowed and which it needs to reload anyway.

      `visible` is, because the client cannot work it out. Publishing ten entities and seeing none of
      them in the vocabulary is this design working (each carries a row entitlement nobody has been
      granted yet) and is indistinguishable from the publish having failed. Only this process holds both
      the catalog and the caller's capabilities, so only this process can count.
    */
    res.json({
      counts: result.counts,
      notes: result.notes,
      catalogVersion: result.catalog.catalogVersion,
      visible: visibleToCaller(req, stored.registration.id),
    });
  } catch (error) {
    problem(res, 502, 'upstream', asText(error));
  } finally {
    await releaseExecutor(stored.registration.id);
  }
});

/** How many of this source's promoted entities the caller's projection actually contains. */
function visibleToCaller(req: Request, sourceId: string): number {
  const persona = personaById(String(req.header('x-persona') ?? req.query['persona'] ?? 'analyst'));
  const snapshot = projectionFor(persona.user, persona.dataCapabilities);
  const stored = storedCatalog();
  return Object.keys(snapshot.entities).filter(
    (ref) => stored?.entities[ref]?.physical?.sourceId === sourceId,
  ).length;
}

function asText(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
