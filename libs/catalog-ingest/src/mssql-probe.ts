/**
 * The SQL Server probe: real T-SQL against the system catalog views.
 *
 * ── WHY THESE VIEWS AND NOT INFORMATION_SCHEMA THROUGHOUT ───────────────────────────────
 * `INFORMATION_SCHEMA` is the standard and is used where it is sufficient — columns, key usage. It is
 * not sufficient for three things this scan needs, and each omission would be a silent hole:
 *
 *   · **row counts.** `sys.partitions` has them; the standard views have nothing. Row count decides
 *     whether an entity may be queried unfiltered, so guessing it wrong makes a page that times out in
 *     production and is fine in a demo.
 *   · **computed and identity columns.** `INFORMATION_SCHEMA.COLUMNS` cannot tell you a column is
 *     generated. A page that offers to filter on a computed column is fine; one that treats it as
 *     writable is not.
 *   · **foreign keys as a unit.** The standard views expose them through three joins on constraint
 *     names, which breaks on composite keys ordered differently. `sys.foreign_key_columns` carries the
 *     ordinal, so composite relationships come out in the right order.
 *
 * ── EVERY STATEMENT IS SELECT, AND EVERY VALUE IS A PARAMETER ───────────────────────────
 * The scanner reads. There is no statement here that writes, and the registration records `readOnly`
 * as an assertion a reviewer can check against this file. Schema names arrive as a parameter through
 * `STRING_SPLIT` rather than interpolated, so a schema list from a form cannot become SQL. The three
 * things no dialect can parameterise — schema, table and column names, needed only for the optional
 * enumeration sample — go through `quoteIdentifier`, which validates before it quotes.
 *
 * ── AND WHAT IT DOES WITH A SERVER THAT SAYS NO ─────────────────────────────────────────
 * A login without `VIEW DEFINITION` sees tables and no columns; one without access to `sys.partitions`
 * gets no row counts. Both are normal in a locked-down estate. Each optional statement is attempted and
 * its failure recorded as a warning, so a partial scan is a partial scan with a reason rather than an
 * empty result or an exception thrown at a steward.
 */

import {
  DEFAULT_PROBE_OPTIONS,
  type PhysicalColumn,
  type PhysicalForeignKey,
  type PhysicalSchema,
  type PhysicalTable,
  type ProbeOptions,
  type SchemaProbe,
  type SqlExecutor,
  type SqlRow,
} from './physical';
import { quoteIdentifier } from './source';

/* ── the statements ──────────────────────────────────────────────────────────────────────
   Exported so they can be reviewed, tested and — the point of naming them — read by a DBA who is
   being asked to grant the login that runs them. */

/** Tables and views in the requested schemas, with an estimated row count. */
export const SQL_TABLES = `
SELECT s.name AS [schema],
       t.name AS [table],
       CAST(0 AS bit) AS [isView],
       SUM(p.rows) AS [approxRows],
       CAST(ep.value AS nvarchar(400)) AS [description]
FROM sys.tables t
JOIN sys.schemas s ON s.schema_id = t.schema_id
LEFT JOIN sys.partitions p ON p.object_id = t.object_id AND p.index_id IN (0, 1)
LEFT JOIN sys.extended_properties ep
       ON ep.major_id = t.object_id AND ep.minor_id = 0 AND ep.name = 'MS_Description'
WHERE s.name IN (SELECT value FROM STRING_SPLIT(@schemas, ','))
GROUP BY s.name, t.name, CAST(ep.value AS nvarchar(400))
UNION ALL
SELECT s.name AS [schema],
       v.name AS [table],
       CAST(1 AS bit) AS [isView],
       NULL AS [approxRows],
       CAST(ep.value AS nvarchar(400)) AS [description]
FROM sys.views v
JOIN sys.schemas s ON s.schema_id = v.schema_id
LEFT JOIN sys.extended_properties ep
       ON ep.major_id = v.object_id AND ep.minor_id = 0 AND ep.name = 'MS_Description'
WHERE s.name IN (SELECT value FROM STRING_SPLIT(@schemas, ','))
ORDER BY [schema], [table]`;

/** Columns, with the two facts `INFORMATION_SCHEMA` alone cannot give: identity and computed. */
export const SQL_COLUMNS = `
SELECT s.name AS [schema],
       o.name AS [table],
       c.name AS [column],
       c.column_id AS [ordinal],
       ty.name AS [sqlType],
       c.max_length AS [maxLength],
       c.precision AS [precision],
       c.scale AS [scale],
       c.is_nullable AS [nullable],
       CASE WHEN c.is_identity = 1 OR c.is_computed = 1 THEN 1 ELSE 0 END AS [isGenerated],
       dc.definition AS [defaultExpression]
FROM sys.columns c
JOIN sys.objects o ON o.object_id = c.object_id
JOIN sys.schemas s ON s.schema_id = o.schema_id
JOIN sys.types ty ON ty.user_type_id = c.user_type_id
LEFT JOIN sys.default_constraints dc ON dc.object_id = c.default_object_id
WHERE o.type IN ('U', 'V')
  AND s.name IN (SELECT value FROM STRING_SPLIT(@schemas, ','))
ORDER BY s.name, o.name, c.column_id`;

/** Primary keys, in key order — a composite key out of order is a wrong key. */
export const SQL_PRIMARY_KEYS = `
SELECT s.name AS [schema],
       t.name AS [table],
       c.name AS [column],
       ic.key_ordinal AS [ordinal]
FROM sys.indexes i
JOIN sys.tables t ON t.object_id = i.object_id
JOIN sys.schemas s ON s.schema_id = t.schema_id
JOIN sys.index_columns ic ON ic.object_id = i.object_id AND ic.index_id = i.index_id
JOIN sys.columns c ON c.object_id = ic.object_id AND c.column_id = ic.column_id
WHERE i.is_primary_key = 1
  AND s.name IN (SELECT value FROM STRING_SPLIT(@schemas, ','))
ORDER BY s.name, t.name, ic.key_ordinal`;

/** Foreign keys with their column ordinals, so composite relationships keep their pairing. */
export const SQL_FOREIGN_KEYS = `
SELECT fk.name AS [name],
       fs.name AS [fromSchema], ft.name AS [fromTable], fc.name AS [fromColumn],
       ts.name AS [toSchema], tt.name AS [toTable], tc.name AS [toColumn],
       fkc.constraint_column_id AS [ordinal]
FROM sys.foreign_keys fk
JOIN sys.foreign_key_columns fkc ON fkc.constraint_object_id = fk.object_id
JOIN sys.tables ft ON ft.object_id = fkc.parent_object_id
JOIN sys.schemas fs ON fs.schema_id = ft.schema_id
JOIN sys.columns fc ON fc.object_id = fkc.parent_object_id AND fc.column_id = fkc.parent_column_id
JOIN sys.tables tt ON tt.object_id = fkc.referenced_object_id
JOIN sys.schemas ts ON ts.schema_id = tt.schema_id
JOIN sys.columns tc ON tc.object_id = fkc.referenced_object_id AND tc.column_id = fkc.referenced_column_id
WHERE fs.name IN (SELECT value FROM STRING_SPLIT(@schemas, ','))
ORDER BY fs.name, ft.name, fk.name, fkc.constraint_column_id`;

/**
 * CHECK constraints, which is where an enumeration is usually written down.
 *
 * A column constrained to `IN ('Open','Closed')` is an enum whatever its SQL type says, and reading the
 * constraint costs one statement against metadata — where finding the same fact by sampling costs a scan
 * of the table and reads real values.
 */
export const SQL_CHECKS = `
SELECT s.name AS [schema],
       t.name AS [table],
       c.name AS [column],
       cc.definition AS [definition]
FROM sys.check_constraints cc
JOIN sys.tables t ON t.object_id = cc.parent_object_id
JOIN sys.schemas s ON s.schema_id = t.schema_id
LEFT JOIN sys.columns c ON c.object_id = cc.parent_object_id AND c.column_id = cc.parent_column_id
WHERE s.name IN (SELECT value FROM STRING_SPLIT(@schemas, ','))`;

/**
 * The server's version and its clock.
 *
 * The clock is here because a scan is timestamped where it happened. Two hosts disagreeing by a few
 * minutes is ordinary, and drift detection compares a stored scan time against a new one — so taking the
 * time from the process that *asked* rather than the database that answered makes a re-scan appear to
 * precede the scan it follows whenever the two clocks are out of step.
 */
export const SQL_VERSION = `SELECT CAST(SERVERPROPERTY('ProductVersion') AS nvarchar(64)) AS [version],
       CAST(SERVERPROPERTY('Edition') AS nvarchar(128)) AS [edition],
       CONVERT(nvarchar(30), SYSUTCDATETIME(), 127) AS [utcNow]`;

/** Distinct values for one column. The only statement that reads data, and it is opt-in. */
export function enumerationSql(schema: string, table: string, column: string): string {
  // Identifiers cannot be parameters in any dialect. Validated, then quoted; see `quoteIdentifier`.
  const target = `${quoteIdentifier(schema)}.${quoteIdentifier(table)}`;
  const field = quoteIdentifier(column);
  return `SELECT TOP (@limit) ${field} AS [value], COUNT_BIG(*) AS [n]
FROM ${target} WITH (NOLOCK)
WHERE ${field} IS NOT NULL
GROUP BY ${field}
ORDER BY [n] DESC`;
}

export class MsSqlProbe implements SchemaProbe {
  readonly kind = 'mssql';

  constructor(
    private readonly sourceId: string,
    private readonly database: string,
    private readonly schemas: readonly string[],
  ) {}

  async scan(executor: SqlExecutor, overrides: Partial<ProbeOptions> = {}): Promise<PhysicalSchema> {
    const options: ProbeOptions = { ...DEFAULT_PROBE_OPTIONS, ...overrides };
    const warnings: string[] = [];
    const params = { schemas: this.schemas.join(',') };

    /*
      Optional statements are attempted and their failure recorded.

      A locked-down login is the normal case in a governed estate, not an error: it can commonly list
      tables and not read `sys.partitions`. Failing the whole scan for a missing row count would make the
      feature unusable exactly where it matters most, so each part degrades on its own and says so.
    */
    const attempt = async (label: string, sql: string, args?: Record<string, unknown>) => {
      try {
        return await executor.query(sql, args);
      } catch (error) {
        warnings.push(`${label} could not be read (${message(error)}). Scanned without it.`);
        return [] as SqlRow[];
      }
    };

    const version = await attempt('The server version', SQL_VERSION);
    const tableRows = await executor.query(SQL_TABLES, params);
    if (tableRows.length > options.maxTables) {
      throw new Error(
        `That scan would return ${tableRows.length} tables, over the ${options.maxTables} limit. Narrow the schema list.`,
      );
    }

    const columnRows = await executor.query(SQL_COLUMNS, params);
    const keyRows = await attempt('Primary keys', SQL_PRIMARY_KEYS, params);
    const fkRows = await attempt('Foreign keys', SQL_FOREIGN_KEYS, params);
    const checkRows = await attempt('CHECK constraints', SQL_CHECKS, params);

    const tables = this.assemble(tableRows, columnRows, keyRows, fkRows, checkRows, warnings);

    if (options.sampleEnumerations) {
      await this.sample(executor, tables, options, warnings);
    }

    return {
      sourceId: this.sourceId,
      kind: this.kind,
      database: this.database,
      schemas: [...this.schemas],
      tables,
      scannedAt: scanTime(version[0], warnings),
      serverVersion: version[0]
        ? `${str(version[0]['version'])} ${str(version[0]['edition'])}`.trim()
        : undefined,
      warnings,
    };
  }

  /** Fold five result sets into tables, in a deterministic order so two scans are comparable. */
  private assemble(
    tableRows: readonly SqlRow[],
    columnRows: readonly SqlRow[],
    keyRows: readonly SqlRow[],
    fkRows: readonly SqlRow[],
    checkRows: readonly SqlRow[],
    warnings: string[],
  ): PhysicalTable[] {
    const keys = new Map<string, string[]>();
    for (const row of keyRows) {
      const ref = `${str(row['schema'])}.${str(row['table'])}`;
      keys.set(ref, [...(keys.get(ref) ?? []), str(row['column'])]);
    }

    const checks = new Map<string, string[]>();
    for (const row of checkRows) {
      const column = str(row['column']);
      if (!column) continue;
      const values = parseCheckValues(str(row['definition']));
      if (!values.length) continue;
      checks.set(`${str(row['schema'])}.${str(row['table'])}.${column}`, values);
    }

    const foreignKeys = new Map<string, PhysicalForeignKey[]>();
    const pending = new Map<string, PhysicalForeignKey>();
    for (const row of fkRows) {
      const from = `${str(row['fromSchema'])}.${str(row['fromTable'])}`;
      const id = `${from}::${str(row['name'])}`;
      const existing = pending.get(id);
      if (existing) {
        existing.fromColumns.push(str(row['fromColumn']));
        existing.toColumns.push(str(row['toColumn']));
        continue;
      }
      const created: PhysicalForeignKey = {
        name: str(row['name']),
        fromTable: from,
        fromColumns: [str(row['fromColumn'])],
        toTable: `${str(row['toSchema'])}.${str(row['toTable'])}`,
        toColumns: [str(row['toColumn'])],
      };
      pending.set(id, created);
      foreignKeys.set(from, [...(foreignKeys.get(from) ?? []), created]);
    }

    const columns = new Map<string, PhysicalColumn[]>();
    for (const row of columnRows) {
      const ref = `${str(row['schema'])}.${str(row['table'])}`;
      const name = str(row['column']);
      const key = keys.get(ref)?.includes(name) ?? false;
      columns.set(ref, [
        ...(columns.get(ref) ?? []),
        {
          name,
          ordinal: num(row['ordinal']),
          sqlType: str(row['sqlType']).toLowerCase(),
          maxLength: optionalNum(row['maxLength']),
          precision: optionalNum(row['precision']),
          scale: optionalNum(row['scale']),
          nullable: bool(row['nullable']),
          isKey: key,
          isGenerated: bool(row['isGenerated']),
          defaultExpression: str(row['defaultExpression']) || undefined,
          checkValues: checks.get(`${ref}.${name}`),
        },
      ]);
    }

    const tables: PhysicalTable[] = [];
    for (const row of tableRows) {
      const schema = str(row['schema']);
      const name = str(row['table']);
      const ref = `${schema}.${name}`;
      const own = columns.get(ref) ?? [];
      if (!own.length) {
        warnings.push(
          `${ref} has no readable columns — the login can see the table but not its definition, so it was skipped.`,
        );
        continue;
      }
      tables.push({
        ref,
        schema,
        name,
        isView: bool(row['isView']),
        approxRows: optionalNum(row['approxRows']),
        columns: own.sort((a, b) => a.ordinal - b.ordinal),
        primaryKey: keys.get(ref) ?? [],
        foreignKeys: foreignKeys.get(ref) ?? [],
        description: str(row['description']) || undefined,
      });
    }
    return tables.sort((a, b) => a.ref.localeCompare(b.ref));
  }

  /**
   * Sample candidate columns for enumerations.
   *
   * Candidates only: short string columns that are not keys, on tables small enough to ask. Every skip is
   * a decision worth being able to explain — sampling a 400-million-row fact table's free-text column
   * finds nothing and costs a table scan.
   */
  private async sample(
    executor: SqlExecutor,
    tables: readonly PhysicalTable[],
    options: ProbeOptions,
    warnings: string[],
  ): Promise<void> {
    for (const table of tables) {
      if ((table.approxRows ?? 0) > options.enumSampleRowLimit) {
        warnings.push(
          `${table.ref} was not sampled for enumerations: ~${table.approxRows?.toLocaleString()} rows is over the limit.`,
        );
        continue;
      }
      for (const column of table.columns) {
        if (column.isKey || column.checkValues?.length) continue;
        if (!isEnumCandidate(column)) continue;
        try {
          const rows = await executor.query(
            enumerationSql(table.schema, table.name, column.name),
            // One more than the threshold, so "at most N distinct" can be distinguished from "N and more".
            { limit: options.maxEnumValues + 1 },
          );
          if (rows.length && rows.length <= options.maxEnumValues) {
            column.distinctValues = rows.map((row) => str(row['value'])).sort();
          }
        } catch (error) {
          warnings.push(`${table.ref}.${column.name} could not be sampled (${message(error)}).`);
        }
      }
    }
  }
}

/** How many characters a column holds, from the byte length `sys.columns` reports. */
export function declaredLength(column: PhysicalColumn): number {
  const bytes = column.maxLength ?? 0;
  // -1 is MAX. Not a length, and not a code list either.
  if (bytes < 0) return Number.POSITIVE_INFINITY;
  // The `n` types are UTF-16: two bytes a character.
  return column.sqlType.startsWith('n') ? Math.floor(bytes / 2) : bytes;
}

/**
 * A short, non-key string column: the only shape an enumeration takes in practice.
 *
 * The length test is in *characters*, and that distinction was a bug before it was a comment.
 * `sys.columns.max_length` is bytes, so an `nvarchar(80)` reports 160 — and a threshold of 128 compared
 * against bytes silently excluded every `nvarchar` over 64 characters, which is most of the status and
 * category columns this sampling exists to find.
 */
function isEnumCandidate(column: PhysicalColumn): boolean {
  const stringish = ['char', 'nchar', 'varchar', 'nvarchar'].includes(column.sqlType);
  if (!stringish) return false;
  const length = declaredLength(column);
  return length > 0 && length <= 128;
}

/**
 * Pull the literals out of a CHECK constraint — but only from a constraint that *is* a value list.
 *
 * ── AN ALLOWLIST OF SHAPE, NOT A BLOCKLIST OF TOKENS ────────────────────────────────────
 * The first version of this refused constraints containing arithmetic or a function call and then
 * harvested every string literal from whatever was left. It is the wrong way round, and the case that
 * proves it is ordinary: `([QTY] > 0 AND [CODE] = N'X')` contains no banned token, so the harvest
 * returned `['X']` and the column was published as an enumeration whose only permitted value is X.
 * Wrong, confidently, and invisibly — a filter offering one choice looks like a column with one choice.
 *
 * So this recognises the two shapes that mean "one of these values" and refuses everything else:
 *
 *   · `[COL] = N'A' OR [COL] = N'B' OR …` — how SQL Server stores an `IN` list, all terms on one column;
 *   · `[COL] IN (N'A', N'B', …)` — how a DBA writes it.
 *
 * Anything with an `AND`, a comparison other than equality, a function, a second column or a nested
 * expression falls through to an empty list, and the column stays whatever its SQL type says. Missing an
 * enumeration costs a steward one edit; inventing one puts a wrong constraint in a business vocabulary.
 */
export function parseCheckValues(definition: string): string[] {
  const body = unwrap(definition);
  if (!body) return [];

  const asList = /^\[?([A-Za-z_][A-Za-z0-9_$#@]*)\]?\s+IN\s*\(([^()]*)\)$/i.exec(body);
  if (asList) {
    const values = literalList(asList[2]!);
    return values ? unique(values) : [];
  }

  const values: string[] = [];
  let column: string | null = null;
  for (const term of body.split(/\s+OR\s+/i)) {
    const equality = /^\[?([A-Za-z_][A-Za-z0-9_$#@]*)\]?\s*=\s*N?'((?:[^']|'')*)'$/i.exec(unwrap(term));
    if (!equality) return [];
    // Two columns in one constraint is a rule about their combination, not a list for either.
    if (column && column.toLowerCase() !== equality[1]!.toLowerCase()) return [];
    column = equality[1]!;
    values.push(equality[2]!.replace(/''/g, "'"));
  }
  return values.length ? unique(values) : [];
}

/** Split an `IN` list into literals, or nothing if any element is not a literal. */
function literalList(inner: string): string[] | null {
  const values: string[] = [];
  for (const element of inner.split(',')) {
    const literal = /^\s*N?'((?:[^']|'')*)'\s*$/.exec(element);
    if (!literal) return null;
    values.push(literal[1]!.replace(/''/g, "'"));
  }
  return values.length ? values : null;
}

/**
 * Remove parentheses that wrap the whole expression, however many layers deep.
 *
 * A literal containing a bracket makes the remainder unbalanced, so nothing is stripped and the
 * expression fails to match a shape — which is the safe outcome rather than a lucky one.
 */
function unwrap(raw: string): string {
  let text = raw.trim();
  while (text.startsWith('(') && text.endsWith(')') && balanced(text.slice(1, -1))) {
    text = text.slice(1, -1).trim();
  }
  return text;
}

function balanced(text: string): boolean {
  let depth = 0;
  for (const character of text) {
    if (character === '(') depth++;
    else if (character === ')' && --depth < 0) return false;
  }
  return depth === 0;
}

function unique(values: readonly string[]): string[] {
  return [...new Set(values)].sort();
}

/**
 * The server's clock, or this process's with a warning saying so.
 *
 * Falling back silently would be the wrong shape of convenience: the fallback is only reached when the
 * version statement was refused, and a steward comparing two scan times deserves to know one of them
 * came from somewhere else.
 */
function scanTime(row: SqlRow | undefined, warnings: string[]): string {
  const reported = str(row?.['utcNow']);
  if (reported) {
    const parsed = new Date(reported.endsWith('Z') ? reported : `${reported}Z`);
    if (!Number.isNaN(parsed.getTime())) return parsed.toISOString();
  }
  warnings.push(
    'The server’s clock could not be read, so this scan is timestamped from the platform’s clock. Comparing it with another scan assumes the two agree.',
  );
  return new Date().toISOString();
}

function str(value: unknown): string {
  return value === null || value === undefined ? '' : String(value);
}

function num(value: unknown): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function optionalNum(value: unknown): number | undefined {
  if (value === null || value === undefined) return undefined;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : undefined;
}

function bool(value: unknown): boolean {
  return value === true || value === 1 || value === '1';
}

function message(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
