/**
 * Schema migration (architecture/runtime-architecture.md §4).
 *
 * Migrations are pure, ordered, chained functions applied FORWARD IN MEMORY at
 * load. The stored definition is never mutated as a side effect of someone viewing
 * a page — doing so would break publication immutability and change an audit record
 * with no actor.
 *
 * There is only one schema version so far, so the chain is empty. The mechanism
 * exists now because retrofitting it once definitions are in the field is what makes
 * schema evolution expensive.
 */

export interface Migration {
  from: string;
  to: string;
  apply: (definition: Record<string, unknown>) => Record<string, unknown>;
}

/** The current schema version this runtime speaks. */
export const CURRENT_SCHEMA_VERSION = '1.0';

export const MIGRATIONS: readonly Migration[] = [
  // Example of the intended shape, for when 1.1 arrives:
  // { from: '1.0', to: '1.1', apply: (d) => ({ ...d, schemaVersion: '1.1' }) },
];

export type MigrationOutcome =
  | { ok: true; definition: Record<string, unknown>; chain: readonly string[] }
  | { ok: false; reason: 'newerThanRuntime' | 'noPath'; detail: string };

export function migrate(definition: Record<string, unknown>): MigrationOutcome {
  const declared = String(definition['schemaVersion'] ?? '');
  if (!declared) {
    return { ok: false, reason: 'noPath', detail: 'Definition declares no schemaVersion' };
  }

  if (compareVersions(declared, CURRENT_SCHEMA_VERSION) > 0) {
    // Rendering a partially-understood definition is worse than failing loudly.
    return {
      ok: false,
      reason: 'newerThanRuntime',
      detail: `Definition schemaVersion ${declared} is newer than the runtime's ${CURRENT_SCHEMA_VERSION}`,
    };
  }

  let current = definition;
  let version = declared;
  const chain: string[] = [];

  while (compareVersions(version, CURRENT_SCHEMA_VERSION) < 0) {
    const migration = MIGRATIONS.find((m) => m.from === version);
    if (!migration) {
      return {
        ok: false,
        reason: 'noPath',
        detail: `No migration registered from schemaVersion ${version}`,
      };
    }
    current = migration.apply(current);
    version = migration.to;
    chain.push(`${migration.from}→${migration.to}`);
  }

  return { ok: true, definition: current, chain };
}

function compareVersions(a: string, b: string): number {
  const pa = a.split('.').map(Number);
  const pb = b.split('.').map(Number);
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
    const diff = (pa[i] ?? 0) - (pb[i] ?? 0);
    if (diff !== 0) return diff;
  }
  return 0;
}
