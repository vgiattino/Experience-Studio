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
  blockingProblems,
  checkRegistration,
  defaultDecisions,
  detectDrift,
  infer,
  normalise,
  promote,
  redactForClient,
  type SourceRegistration,
  type StewardDecisions,
} from '@opus/catalog-ingest';

import { personaById } from '../personas';
import { projectionFor, publish, storedCatalog } from '../services/catalog';
import { executorFor, releaseExecutor } from './mssql-executor';
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
  res.json({ sources: store.list().map(summarise) });
});

// ── register ────────────────────────────────────────────────────────────────
sources.post('/', (req, res) => {
  const caller = requireSteward(req, res);
  if (!caller) return;

  const input = { ...(req.body as Record<string, unknown>), registeredBy: caller.name } as Parameters<
    typeof checkRegistration
  >[0];

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

  const registration = normalise(input, store.nextId(input.name), new Date().toISOString());
  store.save({ registration });
  // The accepted warnings go back with the summary, so the screen can show what it just waved through.
  res.status(201).json(summarise({ registration }));
});

sources.delete('/:id', async (req, res) => {
  if (!requireSteward(req, res)) return;
  const id = String(req.params['id']);
  await releaseExecutor(id);
  if (!store.remove(id)) {
    problem(res, 404, 'semantic', `No source "${id}" is registered.`);
    return;
  }
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
    problem(
      res,
      422,
      'validation',
      `The secret named "${registration.secretRef}" is not available to this process, so no connection was attempted.`,
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
