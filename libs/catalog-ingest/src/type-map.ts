/**
 * SQL Server types → the platform's `DataType`, and the ones that are refused.
 *
 * ── WHY THIS IS A TABLE AND NOT A CHAIN OF IFS ──────────────────────────────────────────
 * Exhaustive and reviewable: every type SQL Server ships is named here, so adding one is a row and a
 * missing one is visible. A `startsWith('var')` heuristic gets `varbinary` wrong and nobody notices until
 * a page tries to render a photograph as a string.
 *
 * ── AND WHY SOME TYPES ARE REFUSED RATHER THAN COERCED ──────────────────────────────────
 * `geography`, `xml`, `varbinary`, `sql_variant` and the CLR types have no honest mapping. A `varbinary`
 * is not a string; making it one produces `[object Object]` on a page or, worse, a megabyte of base64 in
 * a table cell. The scan reports them as unmapped and the column does not become an attribute — a steward
 * who needs one adds a view that projects it into something meaningful, which is the right place for that
 * decision.
 *
 * Refusing is also the safe direction. An attribute that exists is bindable, and a bindable column whose
 * type is a guess is a page that fails at render time in front of a business user.
 */

import type { DataType } from '@opus/contracts';

export interface TypeDecision {
  dataType: DataType;
  /** Why, in one clause — carried into the draft so a reviewer sees the reasoning, not just the result. */
  reason: string;
}

/**
 * The base mapping, before precision and name are considered.
 *
 * `null` means "no honest mapping": the column is reported and skipped.
 */
const BASE: Readonly<Record<string, DataType | null>> = {
  // ── exact numerics
  bit: 'boolean',
  tinyint: 'integer',
  smallint: 'integer',
  int: 'integer',
  bigint: 'integer',
  decimal: 'decimal',
  numeric: 'decimal',
  smallmoney: 'amount',
  money: 'amount',
  // ── approximate numerics. Mapped, and flagged: a float is not a currency.
  float: 'decimal',
  real: 'decimal',
  // ── dates and times
  date: 'date',
  datetime: 'datetime',
  datetime2: 'datetime',
  smalldatetime: 'datetime',
  datetimeoffset: 'datetime',
  time: 'time',
  // ── strings
  char: 'string',
  nchar: 'string',
  varchar: 'string',
  nvarchar: 'string',
  text: 'string',
  ntext: 'string',
  // ── identifiers
  uniqueidentifier: 'identifier',
  // ── structured, and honestly unmappable
  xml: null,
  binary: null,
  varbinary: null,
  image: null,
  sql_variant: null,
  geography: null,
  geometry: null,
  hierarchyid: null,
  timestamp: null,
  rowversion: null,
  sysname: 'string',
};

/** Column-name patterns that carry more meaning than the SQL type does. */
const BY_NAME: readonly (readonly [RegExp, DataType, string])[] = [
  /*
    `rate` is deliberately absent.

    An interest rate is a percentage and an exchange rate is not, and there is no way to tell from the
    name — so including it made `SPOT_RATE` a percentage, which formats 1.2734 as "127.34%" on a page.
    A coin flip that produces a confidently wrong unit is worse than leaving the column a plain decimal
    for a steward to classify.
  */
  [/(^|_)(pct|percent|percentage|ratio)($|_)/i, 'percentage', 'the name reads as a proportion'],
  [
    /(^|_)(amount|amt|value|price|cost|fee|balance|notional|mv|market_value)($|_)/i,
    'amount',
    'the name reads as a monetary amount',
  ],
  [/(^|_)(id|key|code|ref|isin|sedol|cusip|lei|figi)($|_)/i, 'identifier', 'the name reads as an identifier'],
];

/**
 * What a column becomes.
 *
 * Order matters and is deliberate: the SQL type decides first, then a *narrowing* by name is allowed —
 * and only a narrowing. `decimal` may become `percentage` or `amount` because both are decimals with
 * meaning; `nvarchar` may become `identifier` because that is still a string. Nothing here promotes a
 * string to a number on the strength of its name, because a column called `amount` that the DBA made
 * `nvarchar` holds strings, whatever it is called, and a page that treats it as a number breaks on the
 * first row containing "n/a".
 */
export function mapType(
  sqlType: string,
  columnName: string,
  options: { precision?: number; scale?: number; hasEnumValues?: boolean } = {},
): TypeDecision | { dataType: null; reason: string } {
  const base = BASE[sqlType.toLowerCase()];

  if (base === undefined) {
    return {
      dataType: null,
      reason: `"${sqlType}" is not a SQL Server type this platform knows. Report it: the mapping table is meant to be exhaustive.`,
    };
  }
  if (base === null) {
    return {
      dataType: null,
      reason: `"${sqlType}" has no honest mapping to a business type. Project it through a view if a page needs it.`,
    };
  }

  // A constrained or sampled value list makes a column an enumeration whatever its storage type is.
  if (options.hasEnumValues && (base === 'string' || base === 'integer')) {
    return { dataType: 'enum', reason: 'a CHECK constraint or a value sample restricts it to a code list' };
  }

  /*
    A `string` or an `integer` whose name says "identifier" is an identifier.

    Including `integer` matters more than it looks, because an `int` surrogate key left as a number is
    wrong twice on a page: it is formatted with thousands separators — a vendor whose id is 1240 renders
    as "1,240" — and it is offered for aggregation, where the total of your load ids is a number and not
    information. Narrowing it is lossless in the other direction: nothing that reads an identifier needs
    it to be arithmetic.
  */
  if (base === 'string' || base === 'integer') {
    const named = BY_NAME.find(([pattern, type]) => type === 'identifier' && pattern.test(columnName));
    if (named) return { dataType: 'identifier', reason: named[2] };
  }

  if (base === 'decimal' || base === 'amount') {
    const named = BY_NAME.find(
      ([pattern, type]) => (type === 'percentage' || type === 'amount') && pattern.test(columnName),
    );
    if (named) return { dataType: named[1], reason: named[2] };
  }

  /*
    `decimal(p,0)` is an integer that someone stored as a decimal.

    Worth correcting because it changes how a page reads it: an integer is formatted without decimal
    places and a decimal is not, so a count of exceptions displayed as "312.00" is this mapping being
    literal where it should have been careful.
  */
  if (base === 'decimal' && options.scale === 0) {
    return { dataType: 'integer', reason: `decimal(${options.precision ?? '?'},0) holds whole numbers` };
  }

  if (sqlType.toLowerCase() === 'float' || sqlType.toLowerCase() === 'real') {
    return {
      dataType: 'decimal',
      reason: 'an approximate type — do not aggregate it as money without checking with the owner',
    };
  }

  return { dataType: base, reason: `${sqlType} maps to ${base}` };
}

/** Semantic types the platform's components key their rendering off. */
const SEMANTIC: readonly (readonly [RegExp, string])[] = [
  [/(^|_)isin($|_)/i, 'isin'],
  [/(^|_)sedol($|_)/i, 'sedol'],
  [/(^|_)cusip($|_)/i, 'cusip'],
  [/(^|_)lei($|_)/i, 'lei'],
  [/(^|_)figi($|_)/i, 'figi'],
  [/(^|_)(ccy|currency)($|_)/i, 'currencyCode'],
  [/(^|_)(country|domicile)($|_)/i, 'countryCode'],
  [/(^|_)(status|state)($|_)/i, 'statusCode'],
  [/(^|_)(severity|priority)($|_)/i, 'severityCode'],
  [/(^|_)(asset_class|assetclass)($|_)/i, 'assetClass'],
  [/(^|_)(email|e_mail)($|_)/i, 'email'],
  [/(^|_)(url|uri|link)($|_)/i, 'url'],
  [/(^|_)(security_id|securityid)($|_)/i, 'securityId'],
];

export function semanticTypeFor(columnName: string): string | undefined {
  return SEMANTIC.find(([pattern]) => pattern.test(columnName))?.[1];
}

/**
 * Semantic types that are *code lists*, whatever their storage type.
 *
 * This exists because of a defect the fixture surfaced: `IMPACT_CCY` is a `char(3)`, so it mapped to
 * `string`, so it was not groupable — and "exceptions by currency" is about as ordinary as a business
 * question gets. Same for `DOMICILE_COUNTRY`. The SQL type cannot tell you a three-character column is a
 * closed set, but the semantic type can, and a currency, a country, a status and an asset class are all
 * closed sets by definition rather than by sampling.
 *
 * `isin`, `email` and the rest are deliberately absent: they are identifying, not categorising, and
 * grouping by one produces a bucket per row.
 */
const CODE_SEMANTICS = new Set(['currencyCode', 'countryCode', 'statusCode', 'severityCode', 'assetClass']);

export function isCodeSemantic(semanticType: string | undefined): boolean {
  return semanticType !== undefined && CODE_SEMANTICS.has(semanticType);
}

/**
 * Columns whose *name* says they hold personal data.
 *
 * A conservative list on purpose, in both directions. It flags what is unambiguous — an email address, a
 * date of birth, a tax identifier — and does not flag "name", because in a securities master a name is
 * an instrument's, and crying PII over every name teaches a steward to click past the warnings that
 * matter.
 *
 * A flag here is a *prompt to a steward*, never a substitute for one. The platform's real protection is
 * `columnEntitlement` and `maskingPolicy`, which a human sets.
 */
const PII = [
  /(^|_)(email|e_mail)($|_)/i,
  /(^|_)(phone|mobile|telephone|fax)($|_)/i,
  /(^|_)(dob|date_of_birth|birth_date)($|_)/i,
  /(^|_)(ssn|nino?|national_insurance|social_security)($|_)/i,
  /(^|_)(passport|driving_licence|driver_license)($|_)/i,
  /(^|_)(tax_id|tin|vat_number)($|_)/i,
  /(^|_)(iban|bban|account_number|card_number|pan)($|_)/i,
  /(^|_)(address_line|postcode|post_code|zip_code)($|_)/i,
  /(^|_)(salary|compensation)($|_)/i,
];

export function looksPersonal(columnName: string): boolean {
  return PII.some((pattern) => pattern.test(columnName));
}
