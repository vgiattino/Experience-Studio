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
import { executeBatch, servedEntities } from './services/gateway';
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
  const body = req.body as { definition?: unknown; actorId?: string; origin?: string };
  if (!body?.definition) return problem(res, 400, 'validation', 'Body must carry `definition`');
  const definition = body.definition as { id?: string };
  if (definition.id !== req.params.id) {
    return problem(res, 400, 'validation', `Body id "${definition.id}" does not match path "${req.params.id}"`);
  }
  try {
    res.json(store.save({ definition: definition as never, actorId: body.actorId, origin: body.origin as never }));
  } catch (error) {
    const status = (error as { status?: number }).status ?? 500;
    problem(res, status, status === 409 ? 'concurrency' : 'validation', (error as Error).message);
  }
});

api.post('/experiences', (req, res) => {
  const body = req.body as { definition?: unknown; actorId?: string; origin?: string };
  if (!body?.definition) return problem(res, 400, 'validation', 'Body must carry `definition`');
  try {
    res.status(201).json(store.save({ definition: body.definition as never, actorId: body.actorId, origin: body.origin as never }));
  } catch (error) {
    const status = (error as { status?: number }).status ?? 500;
    problem(res, status, status === 409 ? 'concurrency' : 'validation', (error as Error).message);
  }
});

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
