/**
 * Loads the mock gateway's fixture tables.
 *
 * Restricted attributes and row capabilities are declared here rather than in a
 * page definition, which is the point: entitlement is a property of the DATA, resolved
 * against the caller — never something an experience declares about itself.
 */

import type { DataRow } from '@opus/contracts';

import type { MockEntityTable } from './mock-gateway';

/**
 * How to resolve an entity's physical mapping.
 *
 * A CALLBACK RATHER THAN THE CATALOG SERVICE, so this library does not depend on `@opus/catalog`.
 * The dependency would be the wrong way round: the catalog must stay usable on both sides of the
 * network, and the gateway is the one component that legitimately holds both vocabularies. The
 * caller — which is playing the part of the server — supplies the map it already has.
 */
export interface PhysicalResolver {
  (entity: string): {
    fields?: Readonly<Record<string, string>>;
    measureFields?: Readonly<Record<string, string | null>>;
    primaryKey?: readonly string[];
  } | undefined;
}

export interface FixtureFile {
  entity: string;
  /** The date the fixture was generated against. */
  dateAnchor: string;
  /** Fields to shift when rebasing, so relative-date filters keep working. */
  dateFields: string[];
  rows: DataRow[];
}

/**
 * Shift every date field by (today − anchor) whole days.
 *
 * A fixture with hardcoded dates goes stale the day after it is written, and every
 * relative filter (`inLast 14 day`, `eq $params.as-of`, `onOrAfterToday`) silently
 * returns nothing. Rebasing at load keeps the demo live indefinitely without
 * touching the data model — the rows are still plain ISO dates, and the gateway
 * still evaluates the same declarative filters.
 */
function rebase(file: FixtureFile): DataRow[] {
  const anchor = new Date(`${file.dateAnchor}T00:00:00Z`);
  const today = new Date();
  const todayUtc = Date.UTC(today.getFullYear(), today.getMonth(), today.getDate());
  const shiftDays = Math.round((todayUtc - anchor.getTime()) / 86_400_000);
  if (shiftDays === 0 || !file.dateFields?.length) return file.rows;

  const shiftMs = shiftDays * 86_400_000;
  return file.rows.map((row) => {
    const next: Record<string, unknown> = { ...row };
    for (const field of file.dateFields) {
      const value = row[field];
      if (typeof value !== 'string') continue;
      const parsed = new Date(value);
      if (Number.isNaN(parsed.getTime())) continue;
      const shifted = new Date(parsed.getTime() + shiftMs);
      // Preserve the original precision: date-only stays date-only.
      next[field] = value.length === 10 ? shifted.toISOString().slice(0, 10) : shifted.toISOString();
    }
    return next;
  });
}

export interface FixtureDescriptor {
  file: string;
  restrictedAttributes?: Record<string, string>;
  rowCapability?: string;
}

/**
 * WHICH fixtures exist and what entitlements they carry — exported because the server needs the
 * same list read from disk while the browser needs it fetched over HTTP. One manifest, two
 * transports: a second list would be a second answer to "what is the demo data and who may see it".
 */
export const FIXTURE_MANIFEST: readonly FixtureDescriptor[] = [
  { file: 'file-loads.json', rowCapability: 'edm.processing.read' },
  { file: 'securities.json', rowCapability: 'edm.security.read' },
  {
    file: 'dq-exceptions.json',
    rowCapability: 'edm.dq.read',
    // Column-level entitlement: a caller without this sees `partial`, with the
    // column removed from the projection rather than blanked in the UI.
    restrictedAttributes: { 'assigned-to': 'edm.dq.assignee.read' },
  },
  { file: 'parties.json', rowCapability: 'edm.party.read' },
  // Vendor contributions carry the same row entitlement as the securities they describe: the
  // provenance of a value is as sensitive as the value.
  { file: 'source-values.json', rowCapability: 'edm.security.read' },
];

/**
 * Build the gateway's tables, carrying each entity's logical→physical map.
 *
 * Shared by the Viewer and the Studio: the builder's canvas renders live data through the same
 * gateway the runtime uses, so both need the same tables, and a second copy of this loader would
 * be a second definition of what the demo data is.
 *
 * This function plays the part of the server. It is the only place in the codebase that
 * holds both vocabularies at once: it reads the catalog's `physical` blocks — which the
 * client projection strips and the model never sees — and hands them to the gateway, which
 * is the single point of translation (schemas/README.md R6).
 *
 * The mapping is genuinely load-bearing here, not decorative. `securities.security`'s
 * `security-id` is stored as `security_id`, and `processing.file-load`'s `rows-processed`
 * measure aggregates the `row-count` column. A page — hand-written or AI-generated — that
 * named either physical form would be wrong, and one that names the logical form works
 * only because this map exists.
 */
export async function loadFixtureTables(
  baseUrl: string,
  resolvePhysical?: PhysicalResolver,
): Promise<MockEntityTable[]> {
  return buildFixtureTables(async (file) => {
    const response = await fetch(`${baseUrl}/${file}`);
    if (!response.ok) throw new Error(`Could not load fixture ${file}: ${response.status}`);
    return (await response.json()) as FixtureFile;
  }, resolvePhysical);
}

/**
 * The transport-independent half: rebase dates, attach entitlements, attach the physical map.
 *
 * Split out so the prototype's Node server can read the same fixtures from disk without a second
 * copy of the rebasing rule or the entitlement table. The reader is injected rather than the
 * function taking a path, because this library must not acquire a filesystem dependency — it runs
 * in a browser.
 */
export async function buildFixtureTables(
  read: (file: string) => Promise<FixtureFile>,
  resolvePhysical?: PhysicalResolver,
): Promise<MockEntityTable[]> {
  return Promise.all(
    FIXTURE_MANIFEST.map(async (fixture) => {
      const data = await read(fixture.file);
      const physical = resolvePhysical?.(data.entity);
      return {
        entity: data.entity,
        rows: rebase(data),
        restrictedAttributes: fixture.restrictedAttributes,
        rowCapability: fixture.rowCapability,
        fields: physical?.fields,
        measureFields: physical?.measureFields,
        primaryKey: physical?.primaryKey,
      } satisfies MockEntityTable;
    }),
  );
}
