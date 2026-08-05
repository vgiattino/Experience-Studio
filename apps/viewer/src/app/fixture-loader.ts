/**
 * Loads the mock gateway's fixture tables.
 *
 * Restricted attributes and row capabilities are declared here rather than in a
 * page definition, which is the point: entitlement is a property of the DATA, resolved
 * against the caller — never something an experience declares about itself.
 */

import type { DataRow } from '@opus/contracts';
import type { MockEntityTable } from '@opus/data-client';
import type { CatalogService } from '@opus/catalog';

interface FixtureFile {
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

const FIXTURES: readonly {
  file: string;
  restrictedAttributes?: Record<string, string>;
  rowCapability?: string;
}[] = [
  { file: 'file-loads.json', rowCapability: 'edm.processing.read' },
  { file: 'securities.json', rowCapability: 'edm.security.read' },
  {
    file: 'dq-exceptions.json',
    rowCapability: 'edm.dq.read',
    // Column-level entitlement: a caller without this sees `partial`, with the
    // column removed from the projection rather than blanked in the UI.
    restrictedAttributes: { 'assigned-to': 'edm.dq.assignee.read' },
  },
];

/**
 * Build the gateway's tables, carrying each entity's logical→physical map.
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
  catalog?: CatalogService,
): Promise<MockEntityTable[]> {
  const loaded = await Promise.all(
    FIXTURES.map(async (fixture) => {
      const response = await fetch(`${baseUrl}/${fixture.file}`);
      if (!response.ok) throw new Error(`Could not load fixture ${fixture.file}: ${response.status}`);
      const data = (await response.json()) as FixtureFile;
      const physical = catalog?.physicalMapFor(data.entity);
      return {
        entity: data.entity,
        rows: rebase(data),
        restrictedAttributes: fixture.restrictedAttributes,
        rowCapability: fixture.rowCapability,
        fields: physical?.attributes,
        measureFields: physical?.measures,
        primaryKey: catalog?.primaryKeyFor(data.entity),
      } satisfies MockEntityTable;
    }),
  );
  return loaded;
}
