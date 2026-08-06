/**
 * An Opus EDM database, offline: a `SqlExecutor` that answers the probe's real statements.
 *
 * ── WHY A FIXTURE EXECUTOR RATHER THAN A FIXTURE SCHEMA ──────────────────────────────────
 * The easy version of this file exports a `PhysicalSchema` object and skips the probe. It would test
 * inference and nothing else — and the probe is where the interesting mistakes live: five result sets
 * folded together, composite foreign keys paired by ordinal, CHECK definitions parsed, columns sorted so
 * two scans compare equal. Answering the *statements* means every one of those paths runs in a test, and
 * the fixture stays honest because it has to satisfy the same SQL a server does.
 *
 * ── AND WHY THIS SCHEMA, SPECIFICALLY ───────────────────────────────────────────────────
 * It is the shape of an Opus EDM deployment rather than a demo: vendors and their feeds, the processing
 * tables that record what arrived, the exception data that records what was wrong with it, and mastered
 * data for several industries — a securities master, a legal-entity master, a customer master and a
 * product master. That breadth is doing work. It is what puts the awkward cases in front of the
 * pipeline instead of leaving them for production:
 *
 *   · a 240-million-row child table, so cost class and the unfiltered-query refusal are exercised;
 *   · `varbinary`, `xml` and `geography` columns, which have no honest business type and must be refused;
 *   · a computed column and identity columns, which a page may read and never write;
 *   · a reconciliation table with no primary key, and a view with none — the two different reasons a
 *     thing cannot become an entity, with the two different messages;
 *   · a self-referencing foreign key on the legal-entity master, and a foreign key pointing at a schema
 *     that was not scanned;
 *   · a customer master whose columns are unambiguously personal, so the promotion gate is exercised on
 *     real column names rather than a contrived `PII_FIELD`.
 *
 * One thing this fixture does *not* do is stand in for a real server. `STRING_SPLIT`, the `sys` view
 * columns and the estimate in `sys.partitions` behave as SQL Server behaves as far as this file models
 * them, and no further. A deployment's first scan against a real instance is still the moment the SQL is
 * proven.
 */

import type { SqlExecutor, SqlRow } from './physical';
import {
  SQL_CHECKS,
  SQL_COLUMNS,
  SQL_FOREIGN_KEYS,
  SQL_PRIMARY_KEYS,
  SQL_TABLES,
  SQL_VERSION,
} from './mssql-probe';

export interface FixtureColumn {
  name: string;
  sqlType: string;
  maxLength?: number;
  precision?: number;
  scale?: number;
  nullable?: boolean;
  /** Identity or computed. */
  generated?: boolean;
  defaultExpression?: string;
  /**
   * A CHECK constraint definition, written as SQL Server stores it.
   *
   * Verbatim on purpose: the parser that turns it into an enumeration is the thing under test, and a
   * fixture that supplied a clean array of values would test nothing.
   */
  check?: string;
  /** What an enumeration sample would find. Returned only when sampling is switched on. */
  sampleValues?: string[];
}

export interface FixtureForeignKey {
  name: string;
  columns: string[];
  toTable: string;
  toColumns: string[];
}

export interface FixtureTable {
  schema: string;
  name: string;
  isView?: boolean;
  /** What `sys.partitions` would report. Absent for a view, as on a real server. */
  rows?: number;
  description?: string;
  primaryKey?: string[];
  foreignKeys?: FixtureForeignKey[];
  columns: FixtureColumn[];
}

export interface FixtureDatabase {
  name: string;
  serverVersion: string;
  edition: string;
  tables: FixtureTable[];
}

/** Shorthand so the schema below reads as a schema rather than as object literals. */
const col = (
  name: string,
  sqlType: string,
  extra: Omit<FixtureColumn, 'name' | 'sqlType'> = {},
): FixtureColumn => ({ name, sqlType, ...extra });

/** A `varchar`/`nvarchar` column, with `max_length` in bytes as `sys.columns` reports it. */
const str = (
  name: string,
  length: number,
  extra: Omit<FixtureColumn, 'name' | 'sqlType' | 'maxLength'> = {},
): FixtureColumn => ({ name, sqlType: 'nvarchar', maxLength: length * 2, ...extra });

const dec = (
  name: string,
  precision: number,
  scale: number,
  extra: Omit<FixtureColumn, 'name' | 'sqlType' | 'precision' | 'scale'> = {},
): FixtureColumn => ({ name, sqlType: 'decimal', precision, scale, ...extra });

/** `IN (…)` as SQL Server stores it — one `OR` per literal, brackets and all. */
function inList(column: string, values: readonly string[]): string {
  return values.map((value) => `[${column}]=N'${value}'`).join(' OR ');
}

export const OPUS_EDM_FIXTURE: FixtureDatabase = {
  name: 'OpusEDM',
  serverVersion: '16.0.4165.4',
  edition: 'Enterprise Edition',
  tables: [
    // ── vendors and their feeds: where data enters the estate ────────────────────────────
    {
      schema: 'vendor',
      name: 'VENDOR',
      rows: 1_240,
      description: 'A data provider under contract, and the terms it delivers under.',
      primaryKey: ['VENDOR_ID'],
      foreignKeys: [
        // Points at a schema that is not registered for scanning: the relationship is lost, with a warning.
        { name: 'FK_VENDOR_ORGANISATION', columns: ['ORG_ID'], toTable: 'admin.ORGANISATION', toColumns: ['ORG_ID'] },
      ],
      columns: [
        col('VENDOR_ID', 'int', { generated: true, precision: 10, scale: 0 }),
        str('VENDOR_CODE', 20),
        str('VENDOR_NAME', 200),
        str('VENDOR_STATUS', 20, { check: inList('VENDOR_STATUS', ['ACTIVE', 'SUSPENDED', 'TERMINATED']) }),
        col('COUNTRY_CODE', 'char', { maxLength: 2 }),
        str('CONTACT_EMAIL', 320, { nullable: true }),
        col('ONBOARDED_DATE', 'date'),
        col('SLA_HOURS', 'int', { precision: 10, scale: 0 }),
        col('ORG_ID', 'int', { precision: 10, scale: 0 }),
        // No honest business type. Reported and skipped.
        col('REGION_SHAPE', 'geography', { nullable: true }),
        col('UPDATED_AT_UTC', 'datetime2', { scale: 3 }),
      ],
    },
    {
      schema: 'vendor',
      name: 'VENDOR_FEED',
      rows: 3_800,
      description: 'One expected delivery from a vendor: what, how and when.',
      primaryKey: ['FEED_ID'],
      foreignKeys: [
        { name: 'FK_FEED_VENDOR', columns: ['VENDOR_ID'], toTable: 'vendor.VENDOR', toColumns: ['VENDOR_ID'] },
      ],
      columns: [
        col('FEED_ID', 'int', { generated: true, precision: 10, scale: 0 }),
        col('VENDOR_ID', 'int', { precision: 10, scale: 0 }),
        str('FEED_CODE', 40),
        str('FEED_NAME', 200),
        str('FEED_TYPE', 30, {
          check: inList('FEED_TYPE', ['POSITIONS', 'PRICES', 'CORPORATE_ACTIONS', 'REFERENCE', 'TRANSACTIONS']),
        }),
        str('DELIVERY_METHOD', 20, { check: inList('DELIVERY_METHOD', ['SFTP', 'API', 'MQ', 'MANUAL']) }),
        col('EXPECTED_TIME_UTC', 'time', { scale: 0 }),
        col('IS_CRITICAL', 'bit', { defaultExpression: '((0))' }),
        col('FEED_CONFIG_XML', 'xml', { nullable: true }),
      ],
    },

    // ── processing: what actually arrived, and how it went ───────────────────────────────
    {
      schema: 'processing',
      name: 'FILE_LOAD',
      rows: 48_000_000,
      description: 'One inbound file, from receipt to completion.',
      primaryKey: ['LOAD_ID'],
      foreignKeys: [
        { name: 'FK_LOAD_FEED', columns: ['FEED_ID'], toTable: 'vendor.VENDOR_FEED', toColumns: ['FEED_ID'] },
      ],
      columns: [
        col('LOAD_ID', 'bigint', { generated: true, precision: 19, scale: 0 }),
        col('FEED_ID', 'int', { precision: 10, scale: 0 }),
        col('BUSINESS_DATE', 'date'),
        str('FILE_NAME', 400),
        str('LOAD_STATUS', 20, {
          check: inList('LOAD_STATUS', ['PENDING', 'RUNNING', 'COMPLETE', 'FAILED', 'LATE']),
        }),
        col('ROWS_RECEIVED', 'bigint', { precision: 19, scale: 0 }),
        col('ROWS_ACCEPTED', 'bigint', { precision: 19, scale: 0 }),
        col('ROWS_REJECTED', 'bigint', { precision: 19, scale: 0 }),
        // Computed: readable, never writable.
        col('ROWS_PENDING', 'bigint', { generated: true, precision: 19, scale: 0, nullable: true }),
        col('LOAD_DURATION_SECONDS', 'int', { nullable: true, precision: 10, scale: 0 }),
        col('RECEIVED_AT_UTC', 'datetime2', { scale: 3 }),
        col('COMPLETED_AT_UTC', 'datetime2', { scale: 3, nullable: true }),
        col('RETRY_COUNT', 'tinyint', { precision: 3, scale: 0, defaultExpression: '((0))' }),
        col('FILE_CHECKSUM', 'varbinary', { maxLength: 32, nullable: true }),
      ],
    },
    {
      schema: 'processing',
      name: 'LOAD_STEP',
      rows: 240_000_000,
      description: 'A step within a load — parse, validate, transform, publish.',
      primaryKey: ['LOAD_ID', 'STEP_NO'],
      foreignKeys: [
        { name: 'FK_STEP_LOAD', columns: ['LOAD_ID'], toTable: 'processing.FILE_LOAD', toColumns: ['LOAD_ID'] },
      ],
      columns: [
        col('LOAD_ID', 'bigint', { precision: 19, scale: 0 }),
        col('STEP_NO', 'smallint', { precision: 5, scale: 0 }),
        str('STEP_NAME', 80),
        str('STEP_STATUS', 20, {
          check: inList('STEP_STATUS', ['PENDING', 'RUNNING', 'COMPLETE', 'FAILED', 'SKIPPED']),
        }),
        col('ELAPSED_MS', 'int', { precision: 10, scale: 0, nullable: true }),
        str('ERROR_MESSAGE', 2000, { nullable: true }),
        col('STARTED_AT_UTC', 'datetime2', { scale: 3 }),
      ],
    },
    {
      /*
        A reconciliation table with no primary key.

        Real, and common: it is written by a batch job that never needed to identify a row. It cannot
        become an entity, and the draft says so with the reason rather than inventing a key.
      */
      schema: 'processing',
      name: 'LOAD_RECONCILIATION',
      rows: 12_000,
      columns: [
        col('LOAD_ID', 'bigint', { precision: 19, scale: 0 }),
        col('BUSINESS_DATE', 'date'),
        col('SOURCE_ROW_COUNT', 'bigint', { precision: 19, scale: 0 }),
        col('TARGET_ROW_COUNT', 'bigint', { precision: 19, scale: 0 }),
        col('VARIANCE_PCT', 'decimal', { precision: 9, scale: 4, nullable: true }),
      ],
    },

    // ── exception data: what was wrong, and who is fixing it ─────────────────────────────
    {
      schema: 'dq',
      name: 'DQ_RULE',
      rows: 860,
      description: 'A data quality rule: what is checked, how hard it fails.',
      primaryKey: ['RULE_ID'],
      columns: [
        col('RULE_ID', 'int', { generated: true, precision: 10, scale: 0 }),
        str('RULE_CODE', 40),
        str('RULE_NAME', 200),
        str('RULE_DESCRIPTION', 1000, { nullable: true }),
        str('RULE_DOMAIN', 30, {
          check: inList('RULE_DOMAIN', ['SECURITY', 'COUNTERPARTY', 'PRICE', 'POSITION', 'CUSTOMER']),
        }),
        str('SEVERITY', 20, { check: inList('SEVERITY', ['CRITICAL', 'HIGH', 'MEDIUM', 'LOW']) }),
        col('IS_BLOCKING', 'bit'),
        dec('TOLERANCE_PCT', 9, 4, { nullable: true }),
      ],
    },
    {
      schema: 'dq',
      name: 'DQ_EXCEPTION',
      rows: 118_000_000,
      description: 'One instance of a rule failing, with its lifecycle.',
      primaryKey: ['EXCEPTION_ID'],
      foreignKeys: [
        { name: 'FK_EXCEPTION_RULE', columns: ['RULE_ID'], toTable: 'dq.DQ_RULE', toColumns: ['RULE_ID'] },
        { name: 'FK_EXCEPTION_LOAD', columns: ['LOAD_ID'], toTable: 'processing.FILE_LOAD', toColumns: ['LOAD_ID'] },
      ],
      columns: [
        col('EXCEPTION_ID', 'bigint', { generated: true, precision: 19, scale: 0 }),
        col('RULE_ID', 'int', { precision: 10, scale: 0 }),
        col('LOAD_ID', 'bigint', { precision: 19, scale: 0, nullable: true }),
        str('SUBJECT_TYPE', 30, {
          check: inList('SUBJECT_TYPE', ['SECURITY', 'LEGAL_ENTITY', 'CUSTOMER_ACCOUNT', 'PRODUCT']),
        }),
        str('SUBJECT_KEY', 80),
        str('EXCEPTION_STATUS', 20, {
          check: inList('EXCEPTION_STATUS', ['OPEN', 'INVESTIGATING', 'WAIVED', 'RESOLVED', 'REJECTED']),
        }),
        str('ASSIGNED_TO_USER', 120, { nullable: true }),
        col('DETECTED_AT_UTC', 'datetime2', { scale: 3 }),
        col('RESOLVED_AT_UTC', 'datetime2', { scale: 3, nullable: true }),
        col('AGE_HOURS', 'int', { precision: 10, scale: 0 }),
        dec('IMPACT_AMOUNT', 19, 4, { nullable: true }),
        col('IMPACT_CCY', 'char', { maxLength: 3, nullable: true }),
        // `nvarchar(max)`: -1 as `sys.columns` reports it, and prose either way.
        col('RESOLUTION_NOTE', 'nvarchar', { maxLength: -1, nullable: true }),
      ],
    },
    {
      /*
        A view with no key.

        Different from the table above and worth a different message: a view *cannot* declare a primary
        key in SQL Server, so "add one" is not advice a steward can act on. The remedy is to ask the owner
        which columns identify a row.
      */
      schema: 'dq',
      name: 'V_EXCEPTION_BY_VENDOR',
      isView: true,
      description: 'Open exceptions per vendor, for the daily operations review.',
      columns: [
        col('VENDOR_ID', 'int', { precision: 10, scale: 0 }),
        str('VENDOR_NAME', 200),
        str('SEVERITY', 20),
        col('OPEN_EXCEPTIONS', 'int', { precision: 10, scale: 0 }),
        col('OLDEST_DETECTED_AT_UTC', 'datetime2', { scale: 3, nullable: true }),
      ],
    },

    // ── mastered data, across industries ────────────────────────────────────────────────
    {
      schema: 'master',
      name: 'SECURITY_MASTER',
      rows: 2_400_000,
      description: 'The golden record for an instrument, mastered across vendor feeds.',
      primaryKey: ['SECURITY_ID'],
      foreignKeys: [
        {
          name: 'FK_SECURITY_GOLDEN_VENDOR',
          columns: ['GOLDEN_SOURCE_VENDOR_ID'],
          toTable: 'vendor.VENDOR',
          toColumns: ['VENDOR_ID'],
        },
      ],
      columns: [
        col('SECURITY_ID', 'uniqueidentifier'),
        col('ISIN', 'char', { maxLength: 12, nullable: true }),
        col('SEDOL', 'char', { maxLength: 7, nullable: true }),
        col('CUSIP', 'char', { maxLength: 9, nullable: true }),
        col('FIGI', 'char', { maxLength: 12, nullable: true }),
        str('SECURITY_NAME', 300),
        str('ASSET_CLASS', 30, {
          check: inList('ASSET_CLASS', ['EQUITY', 'BOND', 'FUND', 'DERIVATIVE', 'FX', 'COMMODITY']),
        }),
        col('CURRENCY_CODE', 'char', { maxLength: 3 }),
        col('ISSUE_DATE', 'date', { nullable: true }),
        col('MATURITY_DATE', 'date', { nullable: true }),
        col('GOLDEN_SOURCE_VENDOR_ID', 'int', { precision: 10, scale: 0, nullable: true }),
        dec('MATCH_CONFIDENCE_PCT', 5, 2, { nullable: true }),
        col('IS_ACTIVE', 'bit'),
      ],
    },
    {
      schema: 'master',
      name: 'LEGAL_ENTITY',
      rows: 640_000,
      description: 'A counterparty or issuing entity, mastered for KYC and credit.',
      primaryKey: ['LEGAL_ENTITY_ID'],
      foreignKeys: [
        // Self-referencing: an entity's parent is an entity.
        {
          name: 'FK_LEGAL_ENTITY_PARENT',
          columns: ['PARENT_LEGAL_ENTITY_ID'],
          toTable: 'master.LEGAL_ENTITY',
          toColumns: ['LEGAL_ENTITY_ID'],
        },
      ],
      columns: [
        col('LEGAL_ENTITY_ID', 'uniqueidentifier'),
        col('LEI', 'char', { maxLength: 20, nullable: true }),
        str('ENTITY_NAME', 300),
        str('ENTITY_TYPE', 40, {
          check: inList('ENTITY_TYPE', ['CORPORATE', 'FUND', 'SOVEREIGN', 'BANK', 'INSURER', 'SPV']),
        }),
        col('DOMICILE_COUNTRY', 'char', { maxLength: 2 }),
        col('PARENT_LEGAL_ENTITY_ID', 'uniqueidentifier', { nullable: true }),
        str('KYC_STATUS', 20, {
          check: inList('KYC_STATUS', ['PENDING', 'APPROVED', 'REJECTED', 'EXPIRED']),
        }),
        str('RISK_RATING', 10, { check: inList('RISK_RATING', ['LOW', 'MEDIUM', 'HIGH']) }),
        str('VAT_NUMBER', 40, { nullable: true }),
        col('LAST_REVIEWED_DATE', 'date', { nullable: true }),
      ],
    },
    {
      /*
        A customer master, mastered for retail banking and insurance.

        Here so the promotion gate meets real column names. `EMAIL`, `DATE_OF_BIRTH`, `TAX_ID`,
        `ACCOUNT_NUMBER` and `POSTCODE` are all flagged, and `CUSTOMER_NAME` deliberately is not — the
        flag reads names, and a name in a securities master is an instrument's. A steward entitles the
        name column themselves, which is the trade-off the flag list documents.
      */
      schema: 'master',
      name: 'CUSTOMER_ACCOUNT',
      rows: 8_900_000,
      description: 'A retail customer account, mastered across originating systems.',
      primaryKey: ['ACCOUNT_ID'],
      columns: [
        col('ACCOUNT_ID', 'uniqueidentifier'),
        str('CUSTOMER_NAME', 200),
        str('ACCOUNT_NUMBER', 34),
        str('TAX_ID', 30, { nullable: true }),
        col('DATE_OF_BIRTH', 'date', { nullable: true }),
        str('EMAIL', 320, { nullable: true }),
        str('POSTCODE', 16, { nullable: true }),
        str('SEGMENT', 20, {
          check: inList('SEGMENT', ['MASS', 'AFFLUENT', 'PRIVATE', 'BUSINESS']),
        }),
        dec('BALANCE_AMOUNT', 19, 4),
        col('BALANCE_CCY', 'char', { maxLength: 3 }),
        col('OPENED_DATE', 'date'),
        col('IS_CLOSED', 'bit'),
      ],
    },
    {
      schema: 'master',
      name: 'PRODUCT',
      rows: 74_000,
      description: 'A mastered product, for the manufacturing and distribution use cases.',
      primaryKey: ['PRODUCT_ID'],
      columns: [
        col('PRODUCT_ID', 'int', { generated: true, precision: 10, scale: 0 }),
        str('SKU', 40),
        str('PRODUCT_NAME', 300),
        /*
          A category with no CHECK constraint: the case only sampling can find.

          Nothing about `nvarchar(80)` says "one of six values", which is why enumeration sampling exists
          and why it is opt-in — the answer is in the data, so getting it means reading the data.
        */
        str('CATEGORY', 80, {
          sampleValues: ['Ambient', 'Chilled', 'Frozen', 'Hardware', 'Packaging', 'Spares'],
        }),
        str('UNIT_OF_MEASURE', 10, {
          check: inList('UNIT_OF_MEASURE', ['EA', 'KG', 'L', 'M', 'BOX', 'PALLET']),
        }),
        dec('LIST_PRICE_AMOUNT', 19, 4),
        col('LIST_PRICE_CCY', 'char', { maxLength: 3 }),
        // `decimal(p,0)` holding whole numbers: corrected to an integer, so it is not formatted "312.00".
        dec('SHELF_LIFE_DAYS', 5, 0, { nullable: true }),
        col('ACTIVE_FLAG', 'bit'),
      ],
    },
  ],
};

export interface FixtureOptions {
  /**
   * Statements to refuse, by the probe's own label — "Primary keys", "Foreign keys",
   * "CHECK constraints", "The server version".
   *
   * A locked-down login is the case the probe's degradation exists for, and it is untestable without a
   * way to say no.
   */
  refuse?: readonly string[];
  /**
   * What the server's clock says.
   *
   * Fixed by default, which is what makes a whole scan deterministic: two scans of an unchanged fixture
   * produce byte-identical results, so "the pipeline is deterministic" is a test rather than a claim.
   * A drift test passes a later instant for the second scan.
   */
  now?: string;
}

const FIXTURE_CLOCK = '2026-08-06T09:15:00.000Z';

/**
 * An executor over a fixture database.
 *
 * Matching is on statement identity, not on parsing SQL: the probe exports its statements as constants,
 * so a test that changes the SQL and forgets the fixture fails loudly on an unexpected statement rather
 * than quietly returning the wrong rows.
 */
export class FixtureExecutor implements SqlExecutor {
  readonly label: string;
  /** Every statement run, in order. A scan that got slower is a scan that started asking more. */
  readonly executed: string[] = [];

  constructor(
    private readonly database: FixtureDatabase = OPUS_EDM_FIXTURE,
    private readonly options: FixtureOptions = {},
  ) {
    this.label = `mssql://fixture/${database.name}`;
  }

  async query(sql: string, params: Readonly<Record<string, unknown>> = {}): Promise<SqlRow[]> {
    this.executed.push(sql);
    const schemas = String(params['schemas'] ?? '')
      .split(',')
      .map((schema) => schema.trim())
      .filter(Boolean);
    const inScope = this.database.tables.filter(
      (table) => !schemas.length || schemas.includes(table.schema),
    );

    if (sql === SQL_VERSION) {
      this.refuseIf('The server version');
      return [
        {
          version: this.database.serverVersion,
          edition: this.database.edition,
          // `CONVERT(…, 127)` is ISO 8601, which is what the probe parses.
          utcNow: (this.options.now ?? FIXTURE_CLOCK).replace(/Z$/, ''),
        },
      ];
    }
    if (sql === SQL_TABLES) return this.tables(inScope);
    if (sql === SQL_COLUMNS) return this.columns(inScope);
    if (sql === SQL_PRIMARY_KEYS) {
      this.refuseIf('Primary keys');
      return this.keys(inScope);
    }
    if (sql === SQL_FOREIGN_KEYS) {
      this.refuseIf('Foreign keys');
      return this.foreignKeys(inScope);
    }
    if (sql === SQL_CHECKS) {
      this.refuseIf('CHECK constraints');
      return this.checks(inScope);
    }

    const sample = this.matchEnumeration(sql);
    if (sample) return sample;

    throw new Error(`The fixture was asked a statement it does not know:\n${sql}`);
  }

  private refuseIf(label: string): void {
    if (this.options.refuse?.includes(label)) {
      throw new Error(`The login does not have permission to read ${label.toLowerCase()}.`);
    }
  }

  private tables(tables: readonly FixtureTable[]): SqlRow[] {
    // `ORDER BY [schema], [table]`, and the order is part of the contract the probe relies on.
    return [...tables]
      .sort((a, b) => a.schema.localeCompare(b.schema) || a.name.localeCompare(b.name))
      .map((table) => ({
        schema: table.schema,
        table: table.name,
        isView: table.isView ? 1 : 0,
        // A view has no row count, exactly as `sys.partitions` gives none.
        approxRows: table.isView ? null : (table.rows ?? null),
        description: table.description ?? null,
      }));
  }

  private columns(tables: readonly FixtureTable[]): SqlRow[] {
    const rows: SqlRow[] = [];
    for (const table of sorted(tables)) {
      table.columns.forEach((column, index) => {
        rows.push({
          schema: table.schema,
          table: table.name,
          column: column.name,
          ordinal: index + 1,
          sqlType: column.sqlType,
          maxLength: column.maxLength ?? null,
          precision: column.precision ?? null,
          scale: column.scale ?? null,
          nullable: column.nullable ? 1 : 0,
          isGenerated: column.generated ? 1 : 0,
          defaultExpression: column.defaultExpression ?? null,
        });
      });
    }
    return rows;
  }

  private keys(tables: readonly FixtureTable[]): SqlRow[] {
    const rows: SqlRow[] = [];
    for (const table of sorted(tables)) {
      // A view has no primary key on a real server, whatever the fixture says.
      if (table.isView) continue;
      (table.primaryKey ?? []).forEach((column, index) => {
        rows.push({ schema: table.schema, table: table.name, column, ordinal: index + 1 });
      });
    }
    return rows;
  }

  private foreignKeys(tables: readonly FixtureTable[]): SqlRow[] {
    const rows: SqlRow[] = [];
    for (const table of sorted(tables)) {
      for (const key of [...(table.foreignKeys ?? [])].sort((a, b) => a.name.localeCompare(b.name))) {
        const [toSchema = '', toTable = ''] = key.toTable.split('.');
        key.columns.forEach((column, index) => {
          rows.push({
            name: key.name,
            fromSchema: table.schema,
            fromTable: table.name,
            fromColumn: column,
            toSchema,
            toTable,
            toColumn: key.toColumns[index] ?? column,
            ordinal: index + 1,
          });
        });
      }
    }
    return rows;
  }

  private checks(tables: readonly FixtureTable[]): SqlRow[] {
    const rows: SqlRow[] = [];
    for (const table of sorted(tables)) {
      for (const column of table.columns) {
        if (!column.check) continue;
        rows.push({
          schema: table.schema,
          table: table.name,
          column: column.name,
          definition: `(${column.check})`,
        });
      }
    }
    return rows;
  }

  /**
   * The enumeration sample, matched by shape because its SQL is built per column.
   *
   * The pattern reads the *quoted* identifiers back out, which is a check worth having: a column whose
   * name failed validation never reaches here, so a match proves the statement was built through
   * `quoteIdentifier`.
   */
  private matchEnumeration(sql: string): SqlRow[] | null {
    const match = /SELECT TOP \(@limit\) \[(.+?)\] AS \[value\][\s\S]*?FROM \[(.+?)\]\.\[(.+?)\]/.exec(sql);
    if (!match) return null;
    const [, column, schema, table] = match;
    const found = this.database.tables.find((entry) => entry.schema === schema && entry.name === table);
    const values = found?.columns.find((entry) => entry.name === column)?.sampleValues ?? [];
    return values.map((value, index) => ({ value, n: values.length - index }));
  }
}

function sorted(tables: readonly FixtureTable[]): FixtureTable[] {
  return [...tables].sort((a, b) => a.schema.localeCompare(b.schema) || a.name.localeCompare(b.name));
}

/** The schemas a full scan of the fixture asks for. */
export const FIXTURE_SCHEMAS: readonly string[] = ['dq', 'master', 'processing', 'vendor'];
