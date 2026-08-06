/**
 * What changed since the last scan, and what it breaks.
 *
 * ── WHY DRIFT IS A FIRST-CLASS STEP AND NOT A RE-SCAN ────────────────────────────────────
 * The naive design re-scans, re-infers and replaces. It is wrong in a way that only shows up in
 * production: a DBA renames `EXCPTN_STS` to `EXCEPTION_STATUS`, the next scan produces a catalog with a
 * new attribute and without the old one, and every page that grouped by exception status silently loses
 * its dimension. Nobody is told, because replacing a catalog is not an event — it looks like a scan that
 * worked.
 *
 * So a re-scan produces a *diff against the physical schema that was promoted*, and the diff is read
 * against the catalog to answer the only question a steward actually has: which pages stop working. A
 * column that appeared is news; a column that vanished from under a bound KPI is an incident, and the two
 * are not the same notification.
 *
 * ── SEVERITY IS ABOUT THE CATALOG, NOT THE DATABASE ─────────────────────────────────────
 * A dropped column nothing references is `additive` housekeeping. The same drop under a measure a
 * dashboard reads is `breaking`. That is why `detectDrift` takes the catalog: severity without it is a
 * guess about importance, and a report that cries breaking over every unreferenced column is a report a
 * steward learns to skim.
 *
 * ── AND WHY WIDENED NULLABILITY IS ITS OWN CATEGORY ─────────────────────────────────────
 * `NOT NULL` becoming nullable breaks nothing and changes everything: an average silently starts
 * excluding rows, a count of a column stops matching a count of rows, and a KPI moves for a reason no
 * business user can find. It is `behavioural` — the query still runs, the number no longer means what it
 * meant — and that category exists because "it still works" and "it is still correct" are different
 * claims.
 */

import type { RawCatalog, RawEntity } from '@opus/catalog';

import type { PhysicalColumn, PhysicalSchema, PhysicalTable } from './physical';
import { mapType } from './type-map';

export type DriftKind =
  | 'table-added'
  | 'table-removed'
  | 'table-became-view'
  | 'column-added'
  | 'column-removed'
  | 'type-changed'
  | 'business-type-changed'
  | 'nullability-widened'
  | 'nullability-narrowed'
  | 'key-changed'
  | 'enum-values-changed'
  | 'relationship-added'
  | 'relationship-removed'
  | 'row-count-moved';

export type DriftSeverity =
  /** Something the catalog references no longer exists, or no longer has the same shape. */
  | 'breaking'
  /** It still runs; what it returns has changed meaning. */
  | 'behavioural'
  /** New capability. Nothing that worked stops working. */
  | 'additive';

export interface DriftChange {
  kind: DriftKind;
  /** `schema.table` or `schema.table.column`. */
  subject: string;
  detail: string;
  severity: DriftSeverity;
  /** Catalog refs that stop working or change meaning. Empty means nothing references it. */
  affects: string[];
  /** What to do about it, in a steward's language. */
  remedy: string;
}

export interface DriftReport {
  sourceId: string;
  previousScan: string;
  currentScan: string;
  changes: DriftChange[];
  /** Nothing the catalog references changed. A re-promote is safe without review. */
  safe: boolean;
  /** Counts by severity, so a UI can lead with the number that matters. */
  counts: Record<DriftSeverity, number>;
}

/** How far a row count has to move before it is worth mentioning. */
const ROW_COUNT_TOLERANCE = 0.5;

/**
 * Compare two scans of the same source.
 *
 * The catalog is optional and changes the answer: without it every change is reported at its
 * structural severity, which is what a first scan of an unpromoted source deserves. With it, severity
 * and `affects` are about the vocabulary people actually built on.
 */
export function detectDrift(
  previous: PhysicalSchema,
  current: PhysicalSchema,
  catalog?: RawCatalog,
): DriftReport {
  const changes: DriftChange[] = [];
  const index = catalog ? indexCatalog(catalog, previous.sourceId) : null;

  const before = new Map(previous.tables.map((table) => [table.ref, table]));
  const after = new Map(current.tables.map((table) => [table.ref, table]));

  for (const [ref, table] of after) {
    if (!before.has(ref)) {
      changes.push({
        kind: 'table-added',
        subject: ref,
        detail: `${ref} appeared, with ${table.columns.length} columns.`,
        severity: 'additive',
        affects: [],
        remedy: table.primaryKey.length
          ? 'Review it in the draft and include it if a page needs it.'
          : 'It has no primary key, so it cannot become an entity until one is declared.',
      });
    }
  }

  for (const [ref, table] of before) {
    const now = after.get(ref);
    if (!now) {
      const affected = index?.entitiesByTable.get(ref) ?? [];
      changes.push({
        kind: 'table-removed',
        subject: ref,
        detail: `${ref} is gone from the source.`,
        severity: affected.length ? 'breaking' : 'additive',
        affects: affected,
        remedy: affected.length
          ? 'Every page bound to it will fail. Find out whether it was renamed — a rename looks exactly like a drop followed by an add.'
          : 'Nothing in the catalog referenced it.',
      });
      continue;
    }
    compareTable(table, now, index, changes);
  }

  const counts: Record<DriftSeverity, number> = { breaking: 0, behavioural: 0, additive: 0 };
  for (const change of changes) counts[change.severity]++;

  return {
    sourceId: current.sourceId,
    previousScan: previous.scannedAt,
    currentScan: current.scannedAt,
    changes: changes.sort(
      (a, b) => order(a.severity) - order(b.severity) || a.subject.localeCompare(b.subject),
    ),
    safe: counts.breaking === 0 && counts.behavioural === 0,
    counts,
  };
}

function order(severity: DriftSeverity): number {
  return severity === 'breaking' ? 0 : severity === 'behavioural' ? 1 : 2;
}

function compareTable(
  before: PhysicalTable,
  after: PhysicalTable,
  index: CatalogIndex | null,
  changes: DriftChange[],
): void {
  const entities = index?.entitiesByTable.get(after.ref) ?? [];

  if (!before.isView && after.isView) {
    changes.push({
      kind: 'table-became-view',
      subject: after.ref,
      detail: `${after.ref} is now a view. Views carry no key and no row count.`,
      severity: entities.length ? 'behavioural' : 'additive',
      affects: entities,
      remedy:
        'Confirm which columns identify a row. A view replacing a table usually means the table moved, and the key moved with it.',
    });
  }

  if (before.primaryKey.join(',') !== after.primaryKey.join(',')) {
    changes.push({
      kind: 'key-changed',
      subject: after.ref,
      detail: `The primary key changed from (${before.primaryKey.join(', ') || 'none'}) to (${after.primaryKey.join(', ') || 'none'}).`,
      severity: entities.length ? 'breaking' : 'additive',
      affects: entities,
      remedy:
        'Row identity is what a detail page, a drill-down and a selection all depend on. Re-promote the entity rather than editing the key by hand.',
    });
  }

  const rowsMoved = moved(before.approxRows, after.approxRows);
  if (rowsMoved) {
    changes.push({
      kind: 'row-count-moved',
      subject: after.ref,
      detail: `Estimated rows went from ~${before.approxRows?.toLocaleString()} to ~${after.approxRows?.toLocaleString()}.`,
      severity: 'additive',
      affects: entities,
      remedy:
        'Cost class and the unfiltered-query threshold were set from the old count. Re-promote so a page that is now expensive is treated as expensive.',
    });
  }

  const beforeColumns = new Map(before.columns.map((column) => [column.name, column]));
  const afterColumns = new Map(after.columns.map((column) => [column.name, column]));

  for (const [name, column] of afterColumns) {
    if (beforeColumns.has(name)) continue;
    changes.push({
      kind: 'column-added',
      subject: `${after.ref}.${name}`,
      detail: `A ${column.sqlType} column appeared.`,
      severity: 'additive',
      affects: [],
      remedy: 'Re-promote the entity to expose it, or leave it out — an unexposed column costs nothing.',
    });
  }

  for (const [name, column] of beforeColumns) {
    const now = afterColumns.get(name);
    const affected = index?.refsByColumn.get(`${after.ref}.${name}`) ?? [];

    if (!now) {
      changes.push({
        kind: 'column-removed',
        subject: `${after.ref}.${name}`,
        detail: `The ${column.sqlType} column is gone.`,
        severity: affected.length ? 'breaking' : 'additive',
        affects: affected,
        remedy: affected.length
          ? `${affected.length} catalog ${affected.length === 1 ? 'field' : 'fields'} read it, and every page bound to ${affected.length === 1 ? 'it' : 'them'} will fail. Check for a rename before removing anything.`
          : 'Nothing in the catalog referenced it.',
      });
      continue;
    }

    compareColumn(after.ref, column, now, affected, changes);
  }
}

function compareColumn(
  tableRef: string,
  before: PhysicalColumn,
  after: PhysicalColumn,
  affected: string[],
  changes: DriftChange[],
): void {
  const subject = `${tableRef}.${after.name}`;

  const redeclared =
    before.sqlType !== after.sqlType ||
    before.precision !== after.precision ||
    before.scale !== after.scale ||
    // Length matters too: a `varchar(40)` narrowed to `varchar(20)` truncates on write and, more to the
    // point here, means somebody decided the values are shorter than the catalog was told.
    before.maxLength !== after.maxLength;

  if (redeclared) {
    /*
      Two questions, not one: did the SQL type change, and did the *business* type change with it?

      `varchar(20)` widening to `varchar(50)` is a fact about the database and nothing else — the column
      is still a string and every page still works. `decimal(18,2)` becoming `nvarchar(30)` is the same
      "type changed" event and it breaks every sum in the catalog. Reporting both at one severity means
      the second is buried in the noise of the first.
    */
    const wasType = mapType(before.sqlType, before.name, {
      precision: before.precision,
      scale: before.scale,
    }).dataType;
    const nowType = mapType(after.sqlType, after.name, {
      precision: after.precision,
      scale: after.scale,
    }).dataType;

    if (wasType !== nowType) {
      changes.push({
        kind: 'business-type-changed',
        subject,
        detail: `${before.sqlType} → ${after.sqlType}, which changes it from ${wasType ?? 'unmappable'} to ${nowType ?? 'unmappable'}.`,
        severity: affected.length ? 'breaking' : 'additive',
        affects: affected,
        remedy:
          nowType === null
            ? 'The new type has no honest mapping to a business type. Project it through a view, or the column leaves the catalog.'
            : 'Formatting, aggregation and filter operators all follow the business type. Re-promote rather than editing the type by hand.',
      });
    } else {
      const narrowed = (after.maxLength ?? 0) > 0 && (after.maxLength ?? 0) < (before.maxLength ?? 0);
      changes.push({
        kind: 'type-changed',
        subject,
        detail: `${sqlLabel(before)} → ${sqlLabel(after)}. Both map to ${nowType}.`,
        severity: 'additive',
        affects: affected,
        remedy: narrowed
          ? 'The business type is unchanged, but the column is shorter than it was. Check with the owner that no values were truncated to fit.'
          : 'No action needed: the business type is unchanged.',
      });
    }
  }

  if (!before.nullable && after.nullable) {
    changes.push({
      kind: 'nullability-widened',
      subject,
      detail: 'It was NOT NULL and now allows nulls.',
      severity: affected.length ? 'behavioural' : 'additive',
      affects: affected,
      remedy:
        'Averages will start excluding rows and a count of this column will stop matching a count of rows. Check any KPI reading it, and consider whether the page should say how many rows are blank.',
    });
  }
  if (before.nullable && !after.nullable) {
    changes.push({
      kind: 'nullability-narrowed',
      subject,
      detail: 'It now requires a value.',
      severity: 'additive',
      affects: affected,
      remedy: 'Nothing breaks. An "is blank" filter on it will now match nothing.',
    });
  }

  const wasValues = valueList(before);
  const nowValues = valueList(after);
  if (wasValues && nowValues && wasValues.join('|') !== nowValues.join('|')) {
    const lost = wasValues.filter((value) => !nowValues.includes(value));
    changes.push({
      kind: 'enum-values-changed',
      subject,
      detail: lost.length
        ? `The permitted values changed; ${lost.map((value) => `"${value}"`).join(', ')} ${lost.length === 1 ? 'is' : 'are'} no longer allowed.`
        : `The permitted values changed: ${nowValues.map((value) => `"${value}"`).join(', ')}.`,
      severity: lost.length && affected.length ? 'behavioural' : 'additive',
      affects: affected,
      remedy: lost.length
        ? 'A filter or a chart series pinned to a removed value will quietly return nothing. Search the pages using this attribute for the old values.'
        : 'New values will appear in filters and breakdowns. Give them labels if the raw codes are not readable.',
    });
  }
}

function sqlLabel(column: PhysicalColumn): string {
  if (column.precision !== undefined && column.scale !== undefined && column.scale > 0) {
    return `${column.sqlType}(${column.precision},${column.scale})`;
  }
  if (column.maxLength !== undefined && column.maxLength > 0) {
    return `${column.sqlType}(${column.maxLength})`;
  }
  return column.sqlType;
}

function valueList(column: PhysicalColumn): string[] | null {
  const values = column.checkValues?.length ? column.checkValues : column.distinctValues;
  return values?.length ? [...values].sort() : null;
}

/**
 * A row count "moving" is a proportion, not a difference.
 *
 * A fact table growing by ten thousand rows a day is not news; a lookup table going from 40 rows to
 * 40 million is. And `approxRows` comes from `sys.partitions`, which is an estimate — so a threshold
 * tight enough to catch ordinary growth would report noise on every scan.
 */
function moved(before: number | undefined, after: number | undefined): boolean {
  if (before === undefined || after === undefined) return false;
  if (before === after) return false;
  const floor = Math.max(before, 1);
  return Math.abs(after - before) / floor > ROW_COUNT_TOLERANCE;
}

// ── reading the catalog backwards ──────────────────────────────────────────────────────

interface CatalogIndex {
  /** `schema.table` → the entity refs built on it. */
  entitiesByTable: Map<string, string[]>;
  /** `schema.table.column` → the `entity.field` refs that read it. */
  refsByColumn: Map<string, string[]>;
}

/**
 * Index the catalog by the physical objects it reads.
 *
 * Only entities from *this* source are indexed. A catalog spans sources, and attributing a dropped
 * `dbo.VENDOR` in one database to an entity built over another database's `dbo.VENDOR` would report a
 * break that is not one — and, worse, would miss the real one.
 */
function indexCatalog(catalog: RawCatalog, sourceId: string): CatalogIndex {
  const entitiesByTable = new Map<string, string[]>();
  const refsByColumn = new Map<string, string[]>();

  /*
    Deduplicated, because a column is usually referenced twice.

    `ROWS_REJECTED` is both the attribute `rows-rejected` and the measure that aggregates it, and both
    resolve to the ref `processing.file-load.rows-rejected`. Listing it twice makes a report read as
    though two things break where one does, and inflates a count a steward is trying to judge scale from.
  */
  const push = (map: Map<string, string[]>, key: string, value: string) => {
    const held = map.get(key);
    if (!held) map.set(key, [value]);
    else if (!held.includes(value)) held.push(value);
  };

  for (const [ref, entity] of Object.entries(catalog.entities)) {
    const table = tableOf(entity, sourceId);
    if (!table) continue;
    push(entitiesByTable, table, ref);

    for (const [id, attribute] of Object.entries(entity.attributes ?? {})) {
      // No `physical.ref` means the logical id *is* the column, which is the common case.
      push(refsByColumn, `${table}.${attribute.physical?.ref ?? id}`, `${ref}.${id}`);
    }
    for (const [id, measure] of Object.entries(entity.measures ?? {})) {
      // A count has no column, so nothing physical can break it.
      if (!measure.physical?.ref) continue;
      push(refsByColumn, `${table}.${measure.physical.ref}`, `${ref}.${id}`);
    }
  }

  return { entitiesByTable, refsByColumn };
}

function tableOf(entity: RawEntity, sourceId: string): string | undefined {
  const physical = entity.physical;
  if (!physical?.ref) return undefined;
  if (physical.sourceId && physical.sourceId !== sourceId) return undefined;
  return physical.ref;
}
