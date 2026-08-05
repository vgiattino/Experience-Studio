/**
 * Server configuration and paths.
 *
 * Everything the prototype's backend needs is on disk. Storage is local JSON by design for this
 * milestone — the shapes match the storage model in architecture/backend-architecture.md §4.2
 * (append-only versions, immutable once published) closely enough that moving to PostgreSQL is a
 * repository swap rather than a redesign, and far enough that nothing here pretends to be it.
 */

import { fileURLToPath } from 'node:url';
import { dirname, join, resolve } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));

export const ROOT = resolve(here, '..');

export const PATHS = {
  /** Saved experience definitions. The prototype's Definition Service store. */
  experiences: join(ROOT, 'server/data/experiences'),
  /** Append-only audit of generations and saves, so the flow is inspectable after the fact. */
  audit: join(ROOT, 'server/data/audit.log.jsonl'),
  /**
   * The catalog and the row fixtures are shared with the Viewer rather than copied. One
   * catalog, one set of rows: a second copy would drift, and the whole point of the semantic
   * catalog is that every consumer binds to the same governed vocabulary.
   */
  catalog: join(ROOT, 'apps/viewer/public/catalog/securities.catalog.json'),
  fixtures: join(ROOT, 'apps/viewer/public/data'),
  /** Seed definitions copied into the store on first boot if it is empty. */
  seed: join(ROOT, 'apps/viewer/public/definitions'),
} as const;

export const PORT = Number(process.env.PORT ?? 4000);

/**
 * Which model provider serves `/api/ai/generate`.
 *
 * `mock` is the only one implemented. `openai` and `claude` exist as named, registered stubs so
 * that the seam is visible in code rather than described in a document — see
 * `server/ai/providers/`. Switching is an environment variable, never a code change in the
 * pipeline.
 */
export const AI_PROVIDER = (process.env.AI_PROVIDER ?? 'mock') as 'mock' | 'openai' | 'claude';

/** Simulated gateway latency, so loading and skeleton states are visible rather than theoretical. */
export const GATEWAY_LATENCY_MS = Number(process.env.GATEWAY_LATENCY_MS ?? 120);
