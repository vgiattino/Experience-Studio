/**
 * Physical schema → a catalog *draft*. The judgement half of ingestion.
 *
 * ── A DRAFT, AND WHY THAT WORD IS LOAD-BEARING ──────────────────────────────────────────
 * Nothing here produces a live catalog. It produces a proposal in which every decision carries the
 * reason it was made, every rejection carries the reason it was rejected, and a steward accepts or
 * changes it (`promote.ts`). That is not ceremony: a scan renames `EXCPTN_STS` to "Exception Status" and
 * decides it is groupable, and both of those are guesses about a business, made by a machine, that will
 * then appear on pages people make decisions from. The guess is worth making — it turns a week of
 * modelling into an hour of review — and it is not worth trusting unread.
 *
 * ── THE ONE INFERENCE THIS DELIBERATELY DOES NOT MAKE ───────────────────────────────────
 * It does not invent measures for *subsets*. A `Status` column with values Open, Late and Failed does not
 * become `late-count` and `failed-count`; it becomes one count measure and a groupable status attribute.
 *
 * That is a direct lesson from this repository's own fixture catalog, where `late-file-count` and
 * `failed-file-count` exist with no definition of what makes a file late — so the gateway counts every
 * row and a generated page displays "Late Files 90" beside "Files Processed 90". A subset is expressed by
 * filtering or grouping, where the condition is visible and checkable. Two measures that differ by a
 * condition nobody wrote down are two labels over one number.
 *
 * ── AND HOW IT STAYS DETERMINISTIC ──────────────────────────────────────────────────────
 * Same schema in, byte-identical draft out: every collection is sorted, no clock and no randomness reach
 * a decision. That is what makes a re-scan diffable, which is what makes drift detection possible.
 */

import type { Aggregation, DataType } from '@opus/contracts';

import type { PhysicalColumn, PhysicalSchema, PhysicalTable } from './physical';
import { isCodeSemantic, looksPersonal, mapType, semanticTypeFor } from './type-map';

export type Confidence = 'certain' | 'likely' | 'guess';

/** One inference, with its evidence. The draft is these plus the shape they describe. */
export interface Decision {
  what: string;
  because: string;
  confidence: Confidence;
}

export interface DraftAttribute {
  id: string;
  businessName: string;
  dataType: DataType;
  semanticType?: string;
  unit?: string;
  nullable: boolean;
  isKey: boolean;
  groupable: boolean;
  filterable: boolean;
  sortable: boolean;
  searchable: boolean;
  enumValues?: string[];
  /** Set when the column's name suggests personal data. A prompt for a steward, never a conclusion. */
  suspectedPersonal: boolean;
  /** The physical column. Server-side only — the client projection strips it. */
  physicalRef: string;
  decisions: Decision[];
}

export interface DraftMeasure {
  id: string;
  businessName: string;
  description: string;
  /** What the aggregated number is: `integer` for a count, else the column's own type. */
  valueType: DataType;
  allowedAggregations: Aggregation[];
  defaultAggregation: Aggregation;
  unit?: string;
  higherIsBetter?: boolean;
  /** `null` for a row count, which has no column of its own. */
  physicalRef: string | null;
  decisions: Decision[];
}

export interface DraftRelationship {
  id: string;
  businessName: string;
  from: string;
  to: string;
  cardinality: 'many-to-one' | 'one-to-many';
  keyMapping: { fromAttribute: string; toAttribute: string }[];
  decisions: Decision[];
}

export interface DraftEntity {
  /** The platform ref: `domain.entity-name`, from the schema and table. */
  ref: string;
  physicalTable: string;
  businessName: string;
  pluralName: string;
  domain: string;
  description?: string;
  primaryKey: string[];
  labelAttribute?: string;
  approxRows?: number;
  requiresFilter: boolean;
  costClass: 'low' | 'medium' | 'high';
  attributes: DraftAttribute[];
  measures: DraftMeasure[];
  decisions: Decision[];
  /** Columns that could not become attributes, and why. */
  skipped: { column: string; reason: string }[];
}

export interface DraftProblem {
  /** `schema.table`, or the source when it is not about one table. */
  subject: string;
  message: string;
  /** `blocking` keeps it out of the catalog; `warning` lets it in with a caveat. */
  severity: 'blocking' | 'warning';
}

export interface CatalogDraft {
  sourceId: string;
  database: string;
  scannedAt: string;
  serverVersion?: string;
  entities: DraftEntity[];
  relationships: DraftRelationship[];
  problems: DraftProblem[];
  /** Carried through so a reviewer sees what the *scan* could not do as well as what inference could not. */
  scanWarnings: string[];
}

export interface InferOptions {
  /** Rows above which an entity may not be queried unfiltered. */
  requiresFilterAbove: number;
  /** Rows above which the entity is `high` cost. */
  highCostAbove: number;
  /** Acronyms to keep upper-case when a name is humanised. */
  acronyms: string[];
}

export const DEFAULT_INFER_OPTIONS: InferOptions = {
  requiresFilterAbove: 1_000_000,
  highCostAbove: 10_000_000,
  acronyms: [
    'ID',
    'ISIN',
    'SEDOL',
    'CUSIP',
    'LEI',
    'FIGI',
    'CCY',
    'FX',
    'PNL',
    'DQ',
    'EDM',
    'SLA',
    'UTC',
    'IBAN',
    'BIC',
    'MIC',
    'NAV',
    'IRR',
    'ETL',
    'API',
    'URL',
    'VAT',
  ],
};

/**
 * Table-name prefixes and suffixes that carry no business meaning.
 *
 * The separator is mandatory, and that is not a detail. With it optional, `^(…|f|…)` strips the leading
 * `F` from `FILE_LOAD` and the entity comes out named "Ile Load"; the suffix pattern turns `ARTIFACT`
 * into "Arti". A prefix with no separator is indistinguishable from the first letters of a word, so it is
 * left alone — a steward renaming `TBLVENDOR` by hand is a one-word edit, where a mangled name looks like
 * a platform that cannot read.
 */
const NOISE = /^(tbl|tb|t|dim|fact|f|d|stg|staging|src|ref|lkp|lookup|vw|v)_/i;
const NOISE_SUFFIX = /_(tbl|table|dim|fact|master|hist|history|current|curr|v\d+)$/i;

export function infer(
  schema: PhysicalSchema,
  overrides: Partial<InferOptions> = {},
): CatalogDraft {
  const options: InferOptions = { ...DEFAULT_INFER_OPTIONS, ...overrides };
  const problems: DraftProblem[] = [];
  const entities: DraftEntity[] = [];

  for (const table of schema.tables) {
    const entity = inferEntity(table, options, problems);
    if (entity) entities.push(entity);
  }

  const byPhysical = new Map(entities.map((entity) => [entity.physicalTable, entity]));
  const relationships = inferRelationships(schema.tables, byPhysical, problems);

  return {
    sourceId: schema.sourceId,
    database: schema.database,
    scannedAt: schema.scannedAt,
    serverVersion: schema.serverVersion,
    entities: entities.sort((a, b) => a.ref.localeCompare(b.ref)),
    relationships: relationships.sort((a, b) => a.id.localeCompare(b.id)),
    problems: problems.sort((a, b) => a.subject.localeCompare(b.subject)),
    scanWarnings: [...schema.warnings],
  };
}

function inferEntity(
  table: PhysicalTable,
  options: InferOptions,
  problems: DraftProblem[],
): DraftEntity | null {
  const decisions: Decision[] = [];

  /*
    No primary key, no entity. The single hardest rule here.

    Every read path in the platform needs to identify a row: a detail page, a drill-down, a selection, a
    cache key. A table without a key can still be *aggregated*, but the platform's entity contract
    requires one, and inventing a surrogate — "the first column looks unique" — produces a page whose
    row identity is wrong in exactly the cases that matter, duplicates and history rows.

    A view is the ordinary reason for this, and the message says what to do about it.
  */
  if (!table.primaryKey.length) {
    problems.push({
      subject: table.ref,
      severity: 'blocking',
      message: table.isView
        ? `${table.ref} is a view with no key. Views have no primary key of their own — ask the owner which columns identify a row, and register it once they are declared.`
        : `${table.ref} has no primary key, so nothing can identify one of its rows. It cannot become an entity until it has one.`,
    });
    return null;
  }

  const domain = humanKey(table.schema);
  const bareName = bareNameOf(table);
  const businessName = titleise(singular(bareName), options.acronyms);
  const pluralName = titleise(pluralise(bareName), options.acronyms);
  const ref = `${domain}.${kebab(singular(bareName))}`;

  if (bareName.toLowerCase() !== table.name.toLowerCase()) {
    decisions.push({
      what: `Named it "${businessName}"`,
      because: `"${table.name}" carries a prefix or suffix that is a modelling convention rather than business language`,
      confidence: 'likely',
    });
  }

  const attributes: DraftAttribute[] = [];
  const skipped: { column: string; reason: string }[] = [];

  for (const column of table.columns) {
    const attribute = inferAttribute(column);
    if ('reason' in attribute) {
      skipped.push({ column: column.name, reason: attribute.reason });
      continue;
    }
    attributes.push(attribute);
  }

  if (!attributes.length) {
    problems.push({
      subject: table.ref,
      severity: 'blocking',
      message: `Every column of ${table.ref} was unmappable, so there is nothing to expose.`,
    });
    return null;
  }

  const keyAttributes = table.primaryKey.map((column) => kebab(column));
  const missingKey = keyAttributes.filter(
    (id) => !attributes.some((attribute) => attribute.id === id),
  );
  if (missingKey.length) {
    problems.push({
      subject: table.ref,
      severity: 'blocking',
      message: `${table.ref}'s key includes ${missingKey.join(', ')}, which could not be mapped — so a row cannot be identified.`,
    });
    return null;
  }

  const labelAttribute = pickLabel(attributes, foreignColumnsOf(table), decisions);
  const requiresFilter = (table.approxRows ?? 0) > options.requiresFilterAbove;
  if (requiresFilter) {
    decisions.push({
      what: 'Marked it as needing a filter',
      because: `~${table.approxRows?.toLocaleString()} rows is over the ${options.requiresFilterAbove.toLocaleString()} threshold, so an unfiltered query would be refused rather than slow`,
      confidence: 'certain',
    });
  }

  const measures = inferMeasures(table, attributes, pluralName, options);

  if (table.isView) {
    decisions.push({
      what: 'Recorded that it is a view',
      because: 'row counts and cost are unknown for a view, so its cost class is a floor rather than a measurement',
      confidence: 'certain',
    });
  }

  return {
    ref,
    physicalTable: table.ref,
    businessName,
    pluralName,
    domain,
    description: table.description,
    primaryKey: keyAttributes,
    labelAttribute,
    approxRows: table.approxRows,
    requiresFilter,
    costClass:
      (table.approxRows ?? 0) > options.highCostAbove
        ? 'high'
        : requiresFilter
          ? 'medium'
          : 'low',
    attributes,
    measures,
    decisions,
    skipped,
  };
}

function inferAttribute(column: PhysicalColumn): DraftAttribute | { reason: string } {
  const values = column.checkValues?.length ? column.checkValues : column.distinctValues;
  const mapped = mapType(column.sqlType, column.name, {
    precision: column.precision,
    scale: column.scale,
    hasEnumValues: !!values?.length,
  });
  if (mapped.dataType === null) return { reason: mapped.reason };

  const decisions: Decision[] = [
    { what: `Typed it as ${mapped.dataType}`, because: mapped.reason, confidence: 'certain' },
  ];

  const dataType = mapped.dataType;
  const semanticType = semanticTypeFor(column.name);
  if (semanticType) {
    decisions.push({
      what: `Marked it as ${semanticType}`,
      because: 'the column name matches a semantic type components render specially',
      confidence: 'likely',
    });
  }

  /*
    What a page may do with it, decided from the type rather than granted by default.

    Grouping by a free-text column produces one bucket per row, which is not a breakdown — it is a table
    with extra steps, and a chart of 40,000 categories in a business user's face. So `groupable` is
    granted to the shapes that make sense to group: enums, dates, booleans, identifiers and short codes.
  */
  const searchable = dataType === 'string' || dataType === 'identifier';
  const suspectedPersonal = looksPersonal(column.name);

  /*
    Two exceptions to "an identifier is groupable", both found by looking at what the rule produced.

    An identifier is groupable as a rule because grouping by a foreign key — exceptions by vendor,
    loads by feed — is the most ordinary breakdown there is. But:

      · **the primary key is never groupable.** It is one bucket per row by definition, so offering it
        turns a chart into a list of every row with a bar of height one beside each.
      · **a personal identifier is never groupable.** A count of one in a bucket labelled with somebody's
        tax number names that person. An aggregate is the shape people assume is anonymous, which is
        exactly why it is the wrong place to leak an identity — and a steward reviewing an entitlement
        on the *column* would not think to check whether it could still be a chart axis.
  */
  const groupable =
    (['enum', 'boolean', 'date', 'datetime', 'identifier'].includes(dataType) ||
      isCodeSemantic(semanticType)) &&
    !(dataType === 'identifier' && (column.isKey || suspectedPersonal));

  decisions.push({
    what: groupable ? 'A page may group by it' : 'A page may not group by it',
    because: groupable
      ? isCodeSemantic(semanticType) && dataType === 'string'
        ? `a ${semanticType} is a closed code list, whatever its storage type says`
        : `${dataType} values fall into a countable number of buckets`
      : dataType === 'identifier' && suspectedPersonal
        ? 'grouping by a personal identifier names a person in a bucket of one'
        : dataType === 'identifier' && column.isKey
          ? 'it identifies the row, so grouping by it gives one bucket per row'
          : `grouping by ${dataType} would produce about one bucket per row`,
    confidence: 'likely',
  });

  if (suspectedPersonal) {
    decisions.push({
      what: 'Flagged as possibly personal data',
      because: 'the column name matches a personal-data pattern — set an entitlement or a masking policy before this goes live',
      confidence: 'guess',
    });
  }

  return {
    id: kebab(column.name),
    businessName: titleise(column.name, DEFAULT_INFER_OPTIONS.acronyms),
    dataType,
    semanticType,
    unit: unitFor(column.name),
    nullable: column.nullable,
    isKey: column.isKey,
    groupable,
    // Anything can be filtered and sorted; a generated column is read-only, not unfilterable.
    filterable: true,
    sortable: true,
    searchable,
    enumValues: values?.length ? [...values].sort() : undefined,
    suspectedPersonal,
    physicalRef: column.name,
    decisions,
  };
}

/**
 * Measures: one count, plus an aggregate per genuinely numeric column.
 *
 * Keys and foreign keys are excluded even though they are numeric. Summing an identifier is meaningless
 * and offering it invites someone to do it — the total of your security IDs is a number, and it is not
 * information.
 */
function inferMeasures(
  table: PhysicalTable,
  attributes: readonly DraftAttribute[],
  pluralName: string,
  options: InferOptions,
): DraftMeasure[] {
  const measures: DraftMeasure[] = [];
  const singularRef = kebab(singular(bareNameOf(table)));

  measures.push({
    id: `${singularRef}-count`,
    businessName: `${pluralName} Count`,
    description: `How many ${pluralName.toLowerCase()} match the page's filters.`,
    valueType: 'integer',
    allowedAggregations: ['count', 'countDistinct'],
    defaultAggregation: 'count',
    physicalRef: null,
    decisions: [
      {
        what: 'Proposed a count',
        because: 'every entity can be counted, and a count needs no column of its own',
        confidence: 'certain',
      },
      {
        what: 'Did not propose counts of subsets',
        because:
          'a count of "late" or "failed" rows is a filter on the status attribute, not a separate measure — two measures differing by a condition nobody wrote down are two labels over one number',
        confidence: 'certain',
      },
    ],
  });

  const foreignColumns = foreignColumnsOf(table);

  for (const attribute of attributes) {
    if (attribute.isKey || foreignColumns.has(attribute.id)) continue;
    if (!['integer', 'decimal', 'amount', 'percentage'].includes(attribute.dataType)) continue;

    const duration = /(^|-)(age|duration|latency|elapsed|hours|minutes|seconds|days|ms)($|-)/i.test(
      attribute.id,
    );
    const percentage = attribute.dataType === 'percentage';
    const allowed: Aggregation[] =
      duration || percentage ? ['avg', 'min', 'max'] : ['sum', 'avg', 'min', 'max'];

    measures.push({
      id: attribute.id,
      businessName: attribute.businessName,
      description: `${attribute.businessName}, aggregated across the rows a page selects.`,
      valueType: attribute.dataType,
      allowedAggregations: allowed,
      defaultAggregation: allowed[0]!,
      unit: attribute.unit,
      /*
        Direction is left unset unless the name says it.

        Whether a higher number is better is a business fact — a higher exception count is worse, a higher
        coverage percentage is better, and a higher notional is neither. Guessing it drives threshold
        colours, so a wrong guess paints a page green while it reports a problem.
      */
      higherIsBetter: directionFor(attribute.id),
      physicalRef: attribute.physicalRef,
      decisions: [
        {
          what: `Proposed aggregating it with ${allowed.join(', ')}`,
          because: duration
            ? 'a duration is averaged, not totalled — the sum of ages is not a meaningful number'
            : percentage
              ? 'a percentage cannot be summed'
              : `${attribute.dataType} values add up`,
          confidence: 'likely',
        },
      ],
    });
  }

  void options;
  return measures.sort((a, b) => a.id.localeCompare(b.id));
}

/**
 * The attribute a row is labelled by.
 *
 * A row needs a human handle for a drill-down, a breadcrumb or a picker, and the search is deliberately
 * narrow: a name-ish string column, then any short string, then nothing. Returning nothing is a valid
 * answer — the platform falls back to the key, which is honest, where labelling a row by the first string
 * column it happens to have produces "Security: GBP" on every breadcrumb.
 */
function pickLabel(
  attributes: readonly DraftAttribute[],
  foreignColumns: ReadonlySet<string>,
  decisions: Decision[],
): string | undefined {
  const named = attributes.find(
    (attribute) =>
      attribute.dataType === 'string' && /(^|-)(name|title|label|description)($|-)/i.test(attribute.id),
  );
  if (named) {
    decisions.push({
      what: `Labelled rows by "${named.businessName}"`,
      because: 'its name says it is what a person calls the row',
      confidence: 'likely',
    });
    return named.id;
  }
  /*
    Foreign keys are not candidates.

    Without this, an exception's label became its rule id — the first non-key identifier on the table
    happened to be a pointer at another entity, so every breadcrumb read "Exception: 41" where 41 named a
    rule and not the exception. A column that identifies a *different* row is the one kind of identifier
    that must never label this one.
  */
  const identifier = attributes.find(
    (attribute) =>
      attribute.dataType === 'identifier' && !attribute.isKey && !foreignColumns.has(attribute.id),
  );
  if (identifier) {
    decisions.push({
      what: `Labelled rows by "${identifier.businessName}"`,
      because: 'no name-like column exists, and a business identifier reads better than a surrogate key',
      confidence: 'guess',
    });
    return identifier.id;
  }
  decisions.push({
    what: 'Left rows unlabelled',
    because: 'no column reads as a human handle — the key will be shown until a steward picks one',
    confidence: 'certain',
  });
  return undefined;
}

/**
 * Relationships from foreign keys.
 *
 * A foreign key is the one relationship that is a *fact* rather than a guess, which is why nothing here
 * infers relationships from naming conventions. `SECURITY_ID` on a table with no constraint to
 * `dbo.SECURITY` might be a reference, or a free-text field, or a reference to a system this database
 * does not contain. A declared constraint is checked by the server; a name is not.
 */
function inferRelationships(
  tables: readonly PhysicalTable[],
  byPhysical: ReadonlyMap<string, DraftEntity>,
  problems: DraftProblem[],
): DraftRelationship[] {
  const relationships: DraftRelationship[] = [];

  for (const table of tables) {
    const from = byPhysical.get(table.ref);
    if (!from) continue;

    for (const key of table.foreignKeys) {
      const to = byPhysical.get(key.toTable);
      if (!to) {
        problems.push({
          subject: table.ref,
          severity: 'warning',
          message: `${key.name} points at ${key.toTable}, which is not in this scan. Add its schema, or the relationship is lost.`,
        });
        continue;
      }
      relationships.push({
        id: `${from.ref}.${kebab(key.name.replace(/^fk_?/i, ''))}`,
        businessName: titleise(
          key.fromColumns.length === 1
            ? key.fromColumns[0]!.replace(/_?id$/i, '')
            : to.businessName,
          DEFAULT_INFER_OPTIONS.acronyms,
        ),
        from: from.ref,
        to: to.ref,
        // A foreign key points at a key, so the child side is always the many.
        cardinality: 'many-to-one',
        keyMapping: key.fromColumns.map((column, index) => ({
          fromAttribute: kebab(column),
          toAttribute: kebab(key.toColumns[index] ?? column),
        })),
        decisions: [
          {
            what: 'Read it from a declared foreign key',
            because: 'the server enforces it, so the relationship is a fact rather than a naming coincidence',
            confidence: 'certain',
          },
        ],
      });
    }
  }
  return relationships;
}

function foreignColumnsOf(table: PhysicalTable): Set<string> {
  return new Set(table.foreignKeys.flatMap((key) => key.fromColumns.map(kebab)));
}

// ── naming ─────────────────────────────────────────────────────────────────────────────

/**
 * The business words in a table name: modelling noise off, and the schema's own name off the front.
 *
 * The second half of that is worth explaining. `dq.DQ_EXCEPTION` is a table whose name repeats its
 * schema, which is a convention for making names unique in a flat namespace — and the platform's
 * namespace is not flat, so the repetition arrives in the business vocabulary as `dq.dq-exception` and
 * "DQ Exception". Stripping it yields `dq.exception` and "Exception", which is what a person would have
 * written. `master.SECURITY_MASTER` gets the same treatment from the other end and becomes
 * `master.security`, "Security" / "Securities".
 *
 * Guarded both ways: a `vendor.VENDOR` is left as "Vendor" rather than reduced to nothing, and the strip
 * requires a separator so `master.MASTERING_RUN` keeps its name.
 */
function bareNameOf(table: PhysicalTable): string {
  const schemaPrefix = new RegExp(`^${escapeForPattern(table.schema)}_`, 'i');
  const stripped = table.name
    .replace(NOISE, '')
    .replace(NOISE_SUFFIX, '')
    .replace(schemaPrefix, '');
  return stripped || table.name.replace(NOISE, '') || table.name;
}

function escapeForPattern(raw: string): string {
  return raw.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/** `EXCEPTION_STATUS` / `ExceptionStatus` / `exception status` → the words, lower-cased. */
export function words(raw: string): string[] {
  return raw
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .replace(/([A-Z]+)([A-Z][a-z])/g, '$1 $2')
    .split(/[\s_\-.]+/)
    .filter(Boolean)
    .map((word) => word.toLowerCase());
}

/** Title Case, with acronyms kept upper — "Exception ID", not "Exception Id". */
export function titleise(raw: string, acronyms: readonly string[]): string {
  const upper = new Set(acronyms.map((acronym) => acronym.toLowerCase()));
  return words(raw)
    .map((word) => (upper.has(word) ? word.toUpperCase() : word[0]!.toUpperCase() + word.slice(1)))
    .join(' ');
}

export function kebab(raw: string): string {
  return words(raw).join('-');
}

/** A schema name as a domain key: `dbo` and `edm` stay, `EDM_Staging` becomes `edm-staging`. */
function humanKey(raw: string): string {
  return kebab(raw);
}

/**
 * Naive singular and plural, and naive is the right amount of clever here.
 *
 * A steward is reviewing every name anyway, so "Statuses" being right and "Analysis" being wrong is a
 * one-word edit — where a dictionary of irregular English nouns is a dependency, a maintenance burden and
 * still wrong for the domain's own coinages.
 */
export function singular(raw: string): string {
  const parts = words(raw);
  const last = parts[parts.length - 1] ?? '';
  if (/(ss|us|is)$/.test(last)) return parts.join(' ');
  if (last.endsWith('ies')) parts[parts.length - 1] = `${last.slice(0, -3)}y`;
  else if (last.endsWith('ses') || last.endsWith('xes') || last.endsWith('ches'))
    parts[parts.length - 1] = last.slice(0, -2);
  else if (last.endsWith('s')) parts[parts.length - 1] = last.slice(0, -1);
  return parts.join(' ');
}

export function pluralise(raw: string): string {
  const parts = words(singular(raw));
  const last = parts[parts.length - 1] ?? '';
  if (!last) return raw;
  if (/(s|x|ch|sh)$/.test(last)) parts[parts.length - 1] = `${last}es`;
  else if (/[^aeiou]y$/.test(last)) parts[parts.length - 1] = `${last.slice(0, -1)}ies`;
  else parts[parts.length - 1] = `${last}s`;
  return parts.join(' ');
}

/** A unit the name declares. Only where it is unambiguous — `hours`, `days`, `bps`, `pct`. */
function unitFor(columnName: string): string | undefined {
  const table: readonly (readonly [RegExp, string])[] = [
    [/(^|_)(hours|hrs)($|_)/i, 'hour'],
    [/(^|_)(minutes|mins)($|_)/i, 'minute'],
    [/(^|_)(seconds|secs)($|_)/i, 'second'],
    [/(^|_)days($|_)/i, 'day'],
    [/(^|_)bps($|_)/i, 'basisPoint'],
    [/(^|_)(pct|percent|percentage)($|_)/i, 'percent'],
  ];
  return table.find(([pattern]) => pattern.test(columnName))?.[1];
}

/** Direction, only where the word itself says it. Unset otherwise — see the note in `inferMeasures`. */
function directionFor(attributeId: string): boolean | undefined {
  if (/(^|-)(exception|error|fail|failed|late|breach|reject|stale|overdue|backlog)($|-)/i.test(attributeId)) {
    return false;
  }
  if (/(^|-)(coverage|complete|completeness|quality|accuracy|match|approved)($|-)/i.test(attributeId)) {
    return true;
  }
  return undefined;
}
