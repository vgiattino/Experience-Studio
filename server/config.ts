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

/**
 * Where everything this process writes lives.
 *
 * Overridable because a deployment wants its mutable state on a mounted volume with its own backup and
 * retention policy, not inside the application directory — the same argument `OPUS_SECRET_DIR` already
 * makes for the one part of it that holds credentials. It also makes the definition store testable
 * against a real filesystem rather than a mock, which for append-only versioned storage is the only
 * test worth having.
 */
export const DATA_ROOT = process.env['OPUS_DATA_DIR'] ?? join(ROOT, 'server/data');

export const PATHS = {
  /** Saved experience definitions. The prototype's Definition Service store. */
  experiences: join(DATA_ROOT, 'experiences'),
  /** Append-only audit of generations and saves, so the flow is inspectable after the fact. */
  audit: join(DATA_ROOT, 'audit.log.jsonl'),
  /**
   * The catalog and the row fixtures are shared with the Viewer rather than copied. One
   * catalog, one set of rows: a second copy would drift, and the whole point of the semantic
   * catalog is that every consumer binds to the same governed vocabulary.
   */
  catalog: join(ROOT, 'apps/viewer/public/catalog/securities.catalog.json'),
  /**
   * The catalog as *published* — the seed above, plus whatever a scan promoted into it.
   *
   * Separate from the seed rather than overwriting it, because the seed is a checked-in fixture that
   * the Viewer loads directly and a test asserts against. A promotion that edited it would make
   * `git status` dirty as a side effect of using the product, and would leave no way back to a known
   * starting point. This file is absent until the first promotion, and deleting it is the reset.
   */
  publishedCatalog: join(DATA_ROOT, 'catalog.json'),
  fixtures: join(ROOT, 'apps/viewer/public/data'),
  /**
   * Component manifests, read as JSON.
   *
   * Not through `@opus/component-registry`: its loader resolves the Angular *component* alongside each
   * manifest, which would pull the framework into this process for information the JSON already holds.
   */
  components: join(ROOT, 'libs/components'),
  /**
   * Product registrations — the Product Integration Contract's artifacts (FR-20…FR-24).
   *
   * Read at runtime rather than compiled in, which is the mechanism behind "adding a product is a
   * registration exercise, not a platform code change": a deployment adds a file here and nothing
   * rebuilds. Not under `DATA_ROOT`, because these are checked-in configuration a product team owns,
   * not mutable state this process writes.
   */
  products: join(ROOT, 'products'),
  /** Seed definitions copied into the store on first boot if it is empty. */
  seed: join(ROOT, 'apps/viewer/public/definitions'),
  /**
   * Registered data sources, and the scan each one's catalog was promoted from.
   *
   * Beside the experiences rather than beside the catalog, because a registration is not part of the
   * vocabulary — it is the record of where a part of the vocabulary came from, and it outlives any
   * particular version of the catalog it produced.
   */
  sources: join(DATA_ROOT, 'sources'),
  /**
   * Passwords a steward typed, encrypted at rest.
   *
   * Its own directory rather than a field on the registration, because the two have different
   * lifetimes and different privileges: a registration is metadata anybody reviewing the platform may
   * read, and this is not.
   */
  secrets: join(DATA_ROOT, 'secrets'),
} as const;

/**
 * The read-only inputs, resolved per call and overridable — the same argument `DATA_ROOT` and
 * `OPUS_SECRET_DIR` already make, applied to the things this process reads rather than writes.
 *
 * The operator case: a deployment runs the API against a catalog fixture and a set of product
 * registrations that live wherever its configuration management puts them, not inside the application
 * directory. Nothing here writes to either, so nothing prevented it except these paths being computed
 * from `import.meta.url` at module load.
 *
 * The test case, which is what surfaced it: under a bundler `import.meta.url` is the bundle's location,
 * so `ROOT` resolves somewhere else entirely and every path built on it points at nothing. A test that
 * needs an environment variable to find real files is a test reporting that operators needed one too.
 */
export function catalogSeedPath(): string {
  return process.env['OPUS_CATALOG_PATH']?.trim() || PATHS.catalog;
}

export function productsDir(): string {
  return process.env['OPUS_PRODUCTS_DIR']?.trim() || PATHS.products;
}

/**
 * Where shipped experiences are read from — the seed on first boot, and the source of product-standard
 * versions on every boot (PRD §16.2).
 *
 * Overridable for the same two reasons as the others, and a third specific to this one: a release
 * *is* a change to this directory, so being able to point the process at a different set of shipped
 * artifacts is how a deployment stages one.
 */
export function seedDir(): string {
  return process.env['OPUS_SEED_DIR']?.trim() || PATHS.seed;
}

export const PORT = Number(process.env['PORT'] ?? 4000);

/**
 * Which model provider serves `/api/ai/generate`.
 *
 * `mock` is the only one implemented. `openai` and `claude` exist as named, registered stubs so
 * that the seam is visible in code rather than described in a document — see
 * `server/ai/providers/`. Switching is an environment variable, never a code change in the
 * pipeline.
 */
export const AI_PROVIDER = (process.env['AI_PROVIDER'] ?? 'mock') as 'mock' | 'openai' | 'claude';

/** Simulated gateway latency, so loading and skeleton states are visible rather than theoretical. */
export const GATEWAY_LATENCY_MS = Number(process.env['GATEWAY_LATENCY_MS'] ?? 120);
