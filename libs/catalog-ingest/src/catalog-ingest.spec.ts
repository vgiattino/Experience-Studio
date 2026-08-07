/**
 * Tests for the ingestion pipeline.
 *
 * Weighted deliberately. The tests that matter most here are not the ones that check a happy path
 * produces entities — they are the ones that check the pipeline *refuses*: a credential in a host field,
 * a table with no key, a personal column with no entitlement, a subset measure with no filter. Ingestion
 * is a machine writing the vocabulary a business will make decisions in, and the failure mode worth
 * testing is the one where it writes something plausible and wrong.
 */

import { describe, expect, it } from 'vitest';
import type { UserContext } from '@opus/contracts';
import { CatalogService } from '@opus/catalog';
import type { RawCatalog } from '@opus/catalog';

import { detectDrift } from './drift';
import {
  FIXTURE_SCHEMAS,
  FixtureExecutor,
  OPUS_EDM_FIXTURE,
  type FixtureDatabase,
} from './fixture-source';
import { DEFAULT_INFER_OPTIONS, infer, kebab, pluralise, singular, titleise } from './infer';
import { MsSqlProbe, SQL_TABLES, declaredLength, enumerationSql, parseCheckValues } from './mssql-probe';
import type { PhysicalSchema } from './physical';
import { defaultDecisions, promote } from './promote';
import {
  IMPLEMENTED_KINDS,
  blockingProblems,
  checkRegistration,
  checkSecretRef,
  normalise,
  quoteIdentifier,
  redactForClient,
  type SourceRegistration,
} from './source';
import { isCodeSemantic, looksPersonal, mapType, semanticTypeFor } from './type-map';

// ── helpers ────────────────────────────────────────────────────────────────────────────

/** What a steward supplies. `id`, `registeredAt`, `readOnly` and `acknowledged` are derived. */
type RegistrationInput = Parameters<typeof checkRegistration>[0];

function registration(
  overrides: Partial<RegistrationInput> = {},
): RegistrationInput {
  return {
    name: 'Opus EDM — production',
    kind: 'mssql',
    host: 'sql-edm-prod-01',
    port: 1433,
    database: 'OpusEDM',
    auth: 'integrated',
    schemas: ['dq', 'vendor'],
    encrypt: true,
    trustServerCertificate: false,
    registeredBy: 'steward@example.com',
    ...overrides,
  };
}

async function scan(
  fixture: FixtureDatabase = OPUS_EDM_FIXTURE,
  options: { refuse?: readonly string[]; now?: string; sample?: boolean } = {},
): Promise<PhysicalSchema> {
  const probe = new MsSqlProbe('opus-edm-prod', 'OpusEDM', FIXTURE_SCHEMAS);
  return probe.scan(new FixtureExecutor(fixture, { refuse: options.refuse, now: options.now }), {
    sampleEnumerations: options.sample ?? false,
  });
}

/** A deep copy of the fixture, for a test that mutates a schema to produce drift. */
function mutable(): FixtureDatabase {
  return JSON.parse(JSON.stringify(OPUS_EDM_FIXTURE)) as FixtureDatabase;
}

function tableIn(fixture: FixtureDatabase, ref: string) {
  const [schema, name] = ref.split('.');
  const found = fixture.tables.find((table) => table.schema === schema && table.name === name);
  if (!found) throw new Error(`The fixture has no ${ref}`);
  return found;
}

function user(capabilities: readonly string[]): UserContext {
  return {
    id: 'u1',
    displayName: 'Steward',
    tenantId: 'gresham',
    locale: 'en-GB',
    timezone: 'Europe/London',
    roles: ['experienceAuthor'],
    capabilities: [...capabilities],
    entitlementScopeHash: capabilities.join('|') || 'none',
  };
}

// ── registration ───────────────────────────────────────────────────────────────────────

describe('source registration', () => {
  it('accepts a well-formed MS SQL registration', () => {
    expect(checkRegistration(registration())).toEqual([]);
  });

  it('refuses a connection string dressed as a host', () => {
    const problems = checkRegistration(
      registration({ host: 'sql-edm-prod-01;Initial Catalog=master;Integrated Security=true' }),
    );
    expect(problems.map((problem) => problem.field)).toContain('host');
  });

  it('accepts SQL Server’s HOST\\INSTANCE form, which is a host and not an injection', () => {
    expect(checkRegistration(registration({ host: 'SQL-EDM-01\\EDMPROD' }))).toEqual([]);
  });

  it('spots a password pasted into any field, not just the password one', () => {
    const problems = checkRegistration(registration({ name: 'edm user=sa;password=Sup3rSecret' }));
    expect(problems.some((problem) => problem.message.includes('looks like a password'))).toBe(true);
  });

  it('requires a named schema rather than scanning whatever the login can see', () => {
    const problems = checkRegistration(registration({ schemas: [] }));
    expect(problems.map((problem) => problem.field)).toContain('schemas');
  });

  it('refuses a schema name that is not an identifier', () => {
    const problems = checkRegistration(registration({ schemas: ['dbo; DROP TABLE x --'] }));
    expect(problems.map((problem) => problem.field)).toContain('schemas');
  });

  it('makes a SQL login name its secret rather than carry one', () => {
    const problems = checkRegistration(
      registration({ auth: 'sqlLogin', username: 'edm_reader', secretRef: undefined }),
    );
    expect(problems.map((problem) => problem.field)).toContain('secretRef');
  });

  it('objects out loud to unencrypted transport and to trusting an unverified certificate', () => {
    const problems = checkRegistration(registration({ encrypt: false, trustServerCertificate: true }));
    expect(problems.map((problem) => problem.field)).toContain('encrypt');
    expect(problems.map((problem) => problem.field)).toContain('trustServerCertificate');
  });

  it('lets a steward accept a transport risk, and refuses a malformed registration outright', () => {
    /*
      The distinction the severity split exists for. Trusting a self-signed certificate is what every
      deployment does against its first development instance; refusing it outright made that instance
      impossible to register, using a message that said it was acceptable.
    */
    const risky = checkRegistration(registration({ trustServerCertificate: true }));
    expect(risky).toHaveLength(1);
    expect(risky[0]!.severity).toBe('warning');
    expect(blockingProblems(risky)).toEqual([]);

    // A host that is a connection string is not a judgement anybody gets to make.
    const malformed = checkRegistration(registration({ host: 'db;Integrated Security=true' }));
    expect(blockingProblems(malformed)).toHaveLength(1);
    expect(malformed[0]!.severity).toBe('blocking');
  });

  it('records which risks were accepted, on the registration itself', () => {
    const stored = normalise(
      registration({ encrypt: false, trustServerCertificate: true }),
      'src-3',
      '2026-08-06T09:00:00.000Z',
    );
    // Derived from the check rather than taken from the caller: a registration cannot understate what
    // it is running, and cannot claim to have accepted something that is not a risk.
    expect(stored.acknowledged).toEqual(['encrypt', 'trustServerCertificate']);
    expect(redactForClient(stored).acknowledged).toEqual(['encrypt', 'trustServerCertificate']);
    expect(normalise(registration(), 'src-4', '2026-08-06T09:00:00.000Z').acknowledged).toEqual([]);
  });

  it('applies the dialect’s default port and asserts read-only when storing', () => {
    const stored = normalise(registration({ port: undefined }), 'src-1', '2026-08-06T09:00:00.000Z');
    expect(stored.port).toBe(1433);
    expect(stored.readOnly).toBe(true);
    expect(stored.schemas).toEqual(['dq', 'vendor']);
  });

  it('never lets a secret reference or a username reach the client', () => {
    const stored = normalise(
      registration({ auth: 'sqlLogin', username: 'edm_reader', secretRef: 'kv/edm/reader' }),
      'src-1',
      '2026-08-06T09:00:00.000Z',
    );
    const json = JSON.stringify(redactForClient(stored));

    expect(json).not.toContain('kv/edm/reader');
    expect(json).not.toContain('edm_reader');
    expect(json).not.toContain('secretRef');
    // Enough to tell two registrations apart, and no more.
    expect(JSON.parse(json).target).toBe('sql-edm-prod-01:1433/OpusEDM');
  });

  it('tells the client which kinds can actually be scanned', () => {
    const stored = normalise(registration({ kind: 'oracle' }), 'src-2', '2026-08-06T09:00:00.000Z');
    expect(redactForClient(stored).scannable).toBe(false);
    expect(IMPLEMENTED_KINDS).toEqual(['mssql']);
  });
});

describe('secret references', () => {
  it('accepts the names a secret store actually uses', () => {
    for (const reference of ['kv/edm/reader', 'edm-scanner', 'opus.edm.prod', 'SECRET1']) {
      expect(checkSecretRef(reference).ok).toBe(true);
    }
  });

  it('refuses anything that is a path rather than a name', () => {
    // Each of these reaches a file the process was never meant to read.
    for (const reference of ['../../etc/shadow', '/etc/shadow', 'kv/../../secret', './x', '', 'a b']) {
      const checked = checkSecretRef(reference);
      expect(checked.ok).toBe(false);
      if (!checked.ok) expect(checked.reason.length).toBeGreaterThan(0);
    }
  });

  it('catches a bad reference at registration, before anything tries to resolve it', () => {
    const problems = checkRegistration(
      registration({ auth: 'sqlLogin', username: 'edm_reader', secretRef: '../../etc/shadow' }),
    );
    expect(blockingProblems(problems).map((problem) => problem.field)).toContain('secretRef');
  });
});

describe('identifier quoting', () => {
  it('quotes a legal identifier, including a reserved word', () => {
    expect(quoteIdentifier('order')).toBe('[order]');
    expect(quoteIdentifier('EXCEPTION_STATUS')).toBe('[EXCEPTION_STATUS]');
  });

  it('refuses anything that is not an identifier rather than quoting it', () => {
    for (const attempt of ['x]; DROP TABLE y --', 'a b', '1abc', '', 'dbo.x', 'x)']) {
      expect(() => quoteIdentifier(attempt)).toThrow(/not an identifier/);
    }
  });
});

// ── the type map ───────────────────────────────────────────────────────────────────────

describe('SQL Server type mapping', () => {
  it('maps every type the fixture uses', () => {
    for (const table of OPUS_EDM_FIXTURE.tables) {
      for (const column of table.columns) {
        const decision = mapType(column.sqlType, column.name, {
          precision: column.precision,
          scale: column.scale,
        });
        // Either a type or a stated reason. Never undefined, never a silent pass-through.
        expect(decision.reason.length).toBeGreaterThan(0);
      }
    }
  });

  it('reports an unknown type as unknown rather than guessing from its name', () => {
    const decision = mapType('MyCompanyUdt', 'SOME_COLUMN');
    expect(decision.dataType).toBeNull();
    expect(decision.reason).toMatch(/not a SQL Server type this platform knows/);
  });

  it('refuses the types with no honest business meaning', () => {
    for (const sqlType of ['varbinary', 'xml', 'geography', 'sql_variant', 'image', 'timestamp']) {
      expect(mapType(sqlType, 'ANY_COLUMN').dataType).toBeNull();
    }
  });

  it('corrects decimal(p,0) to an integer so a count is not rendered "312.00"', () => {
    expect(mapType('decimal', 'SHELF_LIFE_DAYS', { precision: 5, scale: 0 }).dataType).toBe('integer');
    expect(mapType('decimal', 'IMPACT_AMOUNT', { precision: 19, scale: 4 }).dataType).toBe('amount');
  });

  it('narrows a number to an identifier when the name says identifier', () => {
    // Otherwise a surrogate key renders as "1,240" and is offered for summing.
    expect(mapType('int', 'VENDOR_ID').dataType).toBe('identifier');
    expect(mapType('bigint', 'LOAD_ID').dataType).toBe('identifier');
    expect(mapType('nvarchar', 'RULE_CODE').dataType).toBe('identifier');
  });

  it('never promotes a string to a number on the strength of its name', () => {
    // A column called AMOUNT that the DBA made nvarchar holds strings, whatever it is called.
    expect(mapType('nvarchar', 'IMPACT_AMOUNT').dataType).toBe('string');
    expect(mapType('nvarchar', 'TOLERANCE_PCT').dataType).toBe('string');
  });

  it('treats a constrained value list as an enumeration whatever the storage type is', () => {
    expect(mapType('nvarchar', 'LOAD_STATUS', { hasEnumValues: true }).dataType).toBe('enum');
    expect(mapType('int', 'STATUS_CODE_NUM', { hasEnumValues: true }).dataType).toBe('enum');
  });

  it('flags an approximate type instead of quietly treating it as money', () => {
    expect(mapType('float', 'SPOT_RATE').reason).toMatch(/approximate/);
  });

  it('does not call an exchange rate a percentage', () => {
    // An interest rate is a percentage and an exchange rate is not; the name cannot tell you which.
    expect(mapType('decimal', 'SPOT_RATE', { precision: 18, scale: 8 }).dataType).toBe('decimal');
    expect(mapType('decimal', 'TOLERANCE_PCT', { precision: 9, scale: 4 }).dataType).toBe('percentage');
  });

  it('recognises code lists and identifying codes as different things', () => {
    expect(isCodeSemantic(semanticTypeFor('IMPACT_CCY'))).toBe(true);
    expect(isCodeSemantic(semanticTypeFor('DOMICILE_COUNTRY'))).toBe(true);
    expect(isCodeSemantic(semanticTypeFor('KYC_STATUS'))).toBe(true);
    // Identifying, not categorising: grouping by one gives a bucket per row.
    expect(isCodeSemantic(semanticTypeFor('ISIN'))).toBe(false);
    expect(isCodeSemantic(semanticTypeFor('EMAIL'))).toBe(false);
  });

  it('flags unambiguous personal data and stays quiet about names', () => {
    for (const column of ['EMAIL', 'DATE_OF_BIRTH', 'TAX_ID', 'ACCOUNT_NUMBER', 'POSTCODE']) {
      expect(looksPersonal(column)).toBe(true);
    }
    // A name in a securities master is an instrument's. Crying PII over every name teaches a
    // steward to click past the warnings that matter.
    expect(looksPersonal('SECURITY_NAME')).toBe(false);
    expect(looksPersonal('VENDOR_NAME')).toBe(false);
  });
});

// ── the probe ──────────────────────────────────────────────────────────────────────────

describe('the MS SQL probe', () => {
  it('issues nothing that writes', async () => {
    const executor = new FixtureExecutor();
    await new MsSqlProbe('s', 'OpusEDM', FIXTURE_SCHEMAS).scan(executor, { sampleEnumerations: true });

    expect(executor.executed.length).toBeGreaterThan(5);
    for (const statement of executor.executed) {
      expect(statement.trimStart().toUpperCase().startsWith('SELECT')).toBe(true);
      expect(statement).not.toMatch(/\b(INSERT|UPDATE|DELETE|MERGE|DROP|ALTER|CREATE|EXEC)\b/i);
    }
  });

  it('passes the schema list as a parameter rather than interpolating it', () => {
    expect(SQL_TABLES).toContain('STRING_SPLIT(@schemas');
    expect(SQL_TABLES).not.toMatch(/IN \('/);
  });

  it('builds the one statement that needs identifiers through the quoting function', () => {
    expect(enumerationSql('master', 'PRODUCT', 'CATEGORY')).toContain('[master].[PRODUCT]');
    expect(() => enumerationSql('master', 'PRODUCT', 'CATEGORY; DROP TABLE x')).toThrow(
      /not an identifier/,
    );
  });

  it('reads the estate: twelve objects across four schemas, with the server’s clock', async () => {
    const schema = await scan();
    expect(schema.tables).toHaveLength(12);
    expect(schema.warnings).toEqual([]);
    expect(schema.scannedAt).toBe('2026-08-06T09:15:00.000Z');
    expect(schema.serverVersion).toBe('16.0.4165.4 Enterprise Edition');
  });

  it('pairs a composite key and a composite foreign key in declaration order', async () => {
    const schema = await scan();
    const step = schema.tables.find((table) => table.ref === 'processing.LOAD_STEP')!;

    expect(step.primaryKey).toEqual(['LOAD_ID', 'STEP_NO']);
    expect(step.foreignKeys[0]).toMatchObject({
      fromColumns: ['LOAD_ID'],
      toTable: 'processing.FILE_LOAD',
      toColumns: ['LOAD_ID'],
    });
  });

  it('marks generated columns and gives a view no row count', async () => {
    const schema = await scan();
    const load = schema.tables.find((table) => table.ref === 'processing.FILE_LOAD')!;
    const view = schema.tables.find((table) => table.ref === 'dq.V_EXCEPTION_BY_VENDOR')!;

    expect(load.columns.find((column) => column.name === 'ROWS_PENDING')!.isGenerated).toBe(true);
    expect(load.approxRows).toBe(48_000_000);
    expect(view.isView).toBe(true);
    expect(view.approxRows).toBeUndefined();
  });

  it('degrades a statement at a time and says which one, rather than failing the scan', async () => {
    const schema = await scan(OPUS_EDM_FIXTURE, { refuse: ['Primary keys', 'Foreign keys'] });

    expect(schema.tables).toHaveLength(12);
    expect(schema.warnings.join(' ')).toMatch(/Primary keys could not be read/);
    expect(schema.warnings.join(' ')).toMatch(/Foreign keys could not be read/);
    expect(schema.tables.every((table) => table.primaryKey.length === 0)).toBe(true);
  });

  it('says so when it had to use the platform’s clock', async () => {
    const schema = await scan(OPUS_EDM_FIXTURE, { refuse: ['The server version'] });
    expect(schema.warnings.join(' ')).toMatch(/timestamped from the platform’s clock/);
  });

  it('reads metadata only until enumeration sampling is asked for', async () => {
    const withoutSampling = new FixtureExecutor();
    await new MsSqlProbe('s', 'OpusEDM', FIXTURE_SCHEMAS).scan(withoutSampling);
    expect(withoutSampling.executed.some((statement) => statement.includes('WITH (NOLOCK)'))).toBe(false);

    const sampled = await scan(OPUS_EDM_FIXTURE, { sample: true });
    const category = sampled.tables
      .find((table) => table.ref === 'master.PRODUCT')!
      .columns.find((column) => column.name === 'CATEGORY')!;
    expect(category.distinctValues).toEqual([
      'Ambient',
      'Chilled',
      'Frozen',
      'Hardware',
      'Packaging',
      'Spares',
    ]);
  });

  it('measures a declared length in characters, not bytes', () => {
    // sys.columns reports nvarchar(80) as 160. A byte comparison excluded every nvarchar over 64.
    expect(declaredLength({ name: 'c', ordinal: 1, sqlType: 'nvarchar', maxLength: 160, nullable: false, isKey: false, isGenerated: false })).toBe(80);
    expect(declaredLength({ name: 'c', ordinal: 1, sqlType: 'char', maxLength: 3, nullable: false, isKey: false, isGenerated: false })).toBe(3);
    expect(declaredLength({ name: 'c', ordinal: 1, sqlType: 'nvarchar', maxLength: -1, nullable: false, isKey: false, isGenerated: false })).toBe(
      Number.POSITIVE_INFINITY,
    );
  });

  it('does not sample a table too large to ask', async () => {
    const schema = await scan(OPUS_EDM_FIXTURE, { sample: true });
    // DQ_EXCEPTION is 118M rows, over the default 5M sampling limit.
    expect(schema.warnings.join(' ')).toMatch(/dq\.DQ_EXCEPTION was not sampled/);
  });
});

describe('CHECK constraint parsing', () => {
  it('reads a value list, deduplicated and ordered', () => {
    expect(parseCheckValues("([SEVERITY]=N'LOW' OR [SEVERITY]=N'HIGH' OR [SEVERITY]=N'LOW')")).toEqual([
      'HIGH',
      'LOW',
    ]);
  });

  it('reads a single-value constraint', () => {
    expect(parseCheckValues("([IS_ACTIVE]='Y')")).toEqual(['Y']);
  });

  it('unescapes a doubled quote', () => {
    expect(parseCheckValues("([NAME]=N'O''Brien')")).toEqual(["O'Brien"]);
  });

  it('refuses to read an expression whose meaning it cannot be sure of', () => {
    // Each of these would yield literals that are not a value list.
    expect(parseCheckValues("([QTY] > 0 AND [CODE] = N'X')")).toEqual([]);
    expect(parseCheckValues("([NAME] LIKE N'A%')")).toEqual([]);
    expect(parseCheckValues("(len([ISIN])=(12))")).toEqual([]);
    expect(parseCheckValues("(case when [A]=N'x' then 1 else 0 end = 1)")).toEqual([]);
    expect(parseCheckValues('')).toEqual([]);
  });
});

// ── inference ──────────────────────────────────────────────────────────────────────────

describe('inference', () => {
  it('is deterministic: two scans of an unchanged database produce identical drafts', async () => {
    const first = infer(await scan());
    const second = infer(await scan());
    expect(JSON.stringify(first)).toBe(JSON.stringify(second));
  });

  it('turns the fixture into ten entities and blocks the two that cannot be identified', async () => {
    const draft = infer(await scan());
    expect(draft.entities.map((entity) => entity.ref)).toEqual([
      'dq.exception',
      'dq.rule',
      'master.customer-account',
      'master.legal-entity',
      'master.product',
      'master.security',
      'processing.file-load',
      'processing.load-step',
      'vendor.feed',
      'vendor.vendor',
    ]);
    expect(draft.problems.filter((problem) => problem.severity === 'blocking')).toHaveLength(2);
  });

  it('refuses a table with no primary key, and says something different about a view', async () => {
    const draft = infer(await scan());
    const table = draft.problems.find(
      (problem) => problem.subject === 'processing.LOAD_RECONCILIATION',
    )!;
    const view = draft.problems.find((problem) => problem.subject === 'dq.V_EXCEPTION_BY_VENDOR')!;

    expect(table.message).toMatch(/has no primary key/);
    // "Add a primary key" is not advice a steward can act on for a view.
    expect(view.message).toMatch(/Views have no primary key of their own/);
  });

  it('proposes one count per entity and no counts of subsets', async () => {
    const draft = infer(await scan());
    const exception = draft.entities.find((entity) => entity.ref === 'dq.exception')!;
    const ids = exception.measures.map((measure) => measure.id);

    expect(ids).toContain('exception-count');
    // The defect this rule exists for: `late-count` and `failed-count` with no definition of late
    // or failed, so both return the row count and a page shows the same number twice.
    expect(ids.filter((id) => id.endsWith('-count'))).toEqual(['exception-count']);
    for (const value of ['OPEN', 'RESOLVED', 'WAIVED']) {
      expect(ids.some((id) => id.toUpperCase().includes(value))).toBe(false);
    }
    // The subset is expressed by grouping instead, where the condition is visible.
    expect(exception.attributes.find((a) => a.id === 'exception-status')!.groupable).toBe(true);
  });

  it('never offers to sum a key or a foreign key', async () => {
    const draft = infer(await scan());
    for (const entity of draft.entities) {
      const keys = new Set(entity.primaryKey);
      for (const measure of entity.measures) {
        expect(keys.has(measure.id)).toBe(false);
      }
    }
    const load = draft.entities.find((entity) => entity.ref === 'processing.file-load')!;
    expect(load.measures.map((measure) => measure.id)).not.toContain('feed-id');
  });

  it('averages a duration rather than totalling it', async () => {
    const draft = infer(await scan());
    const step = draft.entities.find((entity) => entity.ref === 'processing.load-step')!;
    const elapsed = step.measures.find((measure) => measure.id === 'elapsed-ms')!;

    expect(elapsed.allowedAggregations).toEqual(['avg', 'min', 'max']);
    expect(elapsed.decisions[0]!.because).toMatch(/sum of ages is not a meaningful number/);
  });

  it('leaves direction unset unless the column name states it', async () => {
    const draft = infer(await scan());
    const security = draft.entities.find((entity) => entity.ref === 'master.security')!;
    const exception = draft.entities.find((entity) => entity.ref === 'dq.exception')!;

    expect(security.measures.find((m) => m.id === 'match-confidence-pct')!.higherIsBetter).toBe(true);
    // A higher impact amount is neither good nor bad, and guessing paints a page green.
    expect(exception.measures.find((m) => m.id === 'impact-amount')!.higherIsBetter).toBeUndefined();
  });

  it('groups by a code list even when SQL Server calls it char(3)', async () => {
    const draft = infer(await scan());
    const exception = draft.entities.find((entity) => entity.ref === 'dq.exception')!;
    const currency = exception.attributes.find((attribute) => attribute.id === 'impact-ccy')!;

    expect(currency.dataType).toBe('string');
    expect(currency.semanticType).toBe('currencyCode');
    // "Exceptions by currency" is an ordinary question.
    expect(currency.groupable).toBe(true);
  });

  it('will not group by a key, or by a personal identifier', async () => {
    const draft = infer(await scan());
    const account = draft.entities.find((entity) => entity.ref === 'master.customer-account')!;
    const by = (id: string) => account.attributes.find((attribute) => attribute.id === id)!;

    // One bucket per row by definition.
    expect(by('account-id').groupable).toBe(false);
    // A count of one in a bucket labelled with somebody's tax number names that person.
    expect(by('tax-id').dataType).toBe('identifier');
    expect(by('tax-id').groupable).toBe(false);
    expect(by('tax-id').decisions.some((d) => d.because.includes('names a person'))).toBe(true);
    // A foreign key is still the ordinary breakdown it always was.
    expect(
      draft.entities
        .find((entity) => entity.ref === 'dq.exception')!
        .attributes.find((attribute) => attribute.id === 'rule-id')!.groupable,
    ).toBe(true);
  });

  it('does not offer to group by free text', async () => {
    const draft = infer(await scan());
    const exception = draft.entities.find((entity) => entity.ref === 'dq.exception')!;
    const note = exception.attributes.find((attribute) => attribute.id === 'resolution-note')!;

    expect(note.groupable).toBe(false);
    expect(note.searchable).toBe(true);
  });

  it('reports an unmappable column instead of exposing it as a string', async () => {
    const draft = infer(await scan());
    const load = draft.entities.find((entity) => entity.ref === 'processing.file-load')!;

    expect(load.skipped).toEqual([
      {
        column: 'FILE_CHECKSUM',
        reason: expect.stringContaining('no honest mapping') as unknown as string,
      },
    ]);
    expect(load.attributes.some((attribute) => attribute.id === 'file-checksum')).toBe(false);
  });

  it('builds relationships only from declared foreign keys, and warns about one it cannot follow', async () => {
    const draft = infer(await scan());

    expect(draft.relationships.map((relationship) => relationship.id)).toEqual([
      'dq.exception.exception-load',
      'dq.exception.exception-rule',
      'master.legal-entity.legal-entity-parent',
      'master.security.security-golden-vendor',
      'processing.file-load.load-feed',
      'processing.load-step.step-load',
      'vendor.feed.feed-vendor',
    ]);
    // SUBJECT_KEY names a security, a legal entity or a product by convention and nothing enforces
    // it, so no relationship is invented from it.
    expect(draft.relationships.some((r) => r.keyMapping.some((k) => k.fromAttribute === 'subject-key'))).toBe(
      false,
    );
    expect(draft.problems.find((problem) => problem.subject === 'vendor.VENDOR')!.message).toMatch(
      /admin\.ORGANISATION, which is not in this scan/,
    );
  });

  it('sets cost class and the unfiltered-query refusal from the row count', async () => {
    const draft = infer(await scan());
    const by = (ref: string) => draft.entities.find((entity) => entity.ref === ref)!;

    expect(by('processing.load-step')).toMatchObject({ costClass: 'high', requiresFilter: true });
    expect(by('master.security')).toMatchObject({ costClass: 'medium', requiresFilter: true });
    expect(by('vendor.vendor')).toMatchObject({ costClass: 'low', requiresFilter: false });
  });

  it('labels a row by a name, and never by a pointer at another row', async () => {
    const draft = infer(await scan());
    const by = (ref: string) => draft.entities.find((entity) => entity.ref === ref)!;

    expect(by('vendor.vendor').labelAttribute).toBe('vendor-name');
    // RULE_ID is the first non-key identifier on the exception table, and it names a rule.
    expect(by('dq.exception').labelAttribute).toBe('subject-key');
  });

  it('carries the reason for every decision it makes', async () => {
    const draft = infer(await scan());
    for (const entity of draft.entities) {
      for (const decision of [...entity.decisions, ...entity.attributes.flatMap((a) => a.decisions)]) {
        expect(decision.what.length).toBeGreaterThan(0);
        expect(decision.because.length).toBeGreaterThan(0);
      }
    }
  });
});

describe('naming', () => {
  it('strips a modelling prefix only when a separator makes it one', async () => {
    // With the separator optional, `^(…|f|…)` turns FILE_LOAD into "Ile Load".
    const draft = infer(await scan());
    expect(draft.entities.find((entity) => entity.ref === 'processing.file-load')!.businessName).toBe(
      'File Load',
    );
  });

  it('drops a schema name repeated in its own table name', async () => {
    const draft = infer(await scan());
    // dq.DQ_EXCEPTION is a flat-namespace convention; the platform's namespace is not flat.
    expect(draft.entities.map((entity) => entity.ref)).toContain('dq.exception');
    // …and does not reduce vendor.VENDOR to nothing.
    expect(draft.entities.find((entity) => entity.ref === 'vendor.vendor')!.businessName).toBe('Vendor');
  });

  it('treats "_MASTER" as the modelling word it is', async () => {
    const draft = infer(await scan());
    const security = draft.entities.find((entity) => entity.ref === 'master.security')!;
    expect(security.businessName).toBe('Security');
    expect(security.pluralName).toBe('Securities');
  });

  it('keeps acronyms upper and humanises the rest', () => {
    expect(titleise('EXCEPTION_ID', DEFAULT_INFER_OPTIONS.acronyms)).toBe('Exception ID');
    expect(titleise('ISIN', DEFAULT_INFER_OPTIONS.acronyms)).toBe('ISIN');
    expect(titleise('receivedAtUtc', DEFAULT_INFER_OPTIONS.acronyms)).toBe('Received At UTC');
    expect(kebab('EXCEPTION_STATUS')).toBe('exception-status');
  });

  it('pluralises and singularises naively, which is the right amount of clever', () => {
    expect(pluralise('SECURITY')).toBe('securities');
    expect(pluralise('EXCEPTION')).toBe('exceptions');
    expect(pluralise('STATUS')).toBe('statuses');
    expect(singular('EXCEPTIONS')).toBe('exception');
    expect(singular('STATUS')).toBe('status');
  });
});

// ── promotion ──────────────────────────────────────────────────────────────────────────

describe('promotion', () => {
  const context = { tenantId: 'gresham', promotedAt: '2026-08-06T10:00:00.000Z' };

  it('promotes nothing without a decision', async () => {
    const draft = infer(await scan());
    const result = promote(draft, { approvedBy: 'steward', entities: {} }, undefined, context);

    expect(result.counts.entities).toBe(0);
    expect(Object.keys(result.catalog.entities)).toEqual([]);
    expect(result.notes.every((note) => note.kind === 'refused')).toBe(true);
  });

  it('does not offer a blocked table for review at all', async () => {
    const draft = infer(await scan());
    const decisions = defaultDecisions(draft, 'steward');
    expect(Object.keys(decisions.entities)).toHaveLength(10);
  });

  it('leaves a suspected-personal column out until a person decides', async () => {
    const draft = infer(await scan());
    const result = promote(draft, defaultDecisions(draft, 'steward'), undefined, context);
    const account = result.catalog.entities['master.customer-account']!;

    for (const held of ['email', 'tax-id', 'date-of-birth', 'postcode', 'account-number']) {
      expect(account.attributes[held]).toBeUndefined();
    }
    // Five on the customer account, plus a VAT number and a vendor contact email.
    expect(
      result.notes
        .filter((note) => note.kind === 'refused' && note.message.includes('suggests personal data'))
        .map((note) => note.subject),
    ).toEqual([
      'master.customer-account.account-number',
      'master.customer-account.date-of-birth',
      'master.customer-account.email',
      'master.customer-account.postcode',
      'master.customer-account.tax-id',
      'master.legal-entity.vat-number',
      'vendor.vendor.contact-email',
    ]);
  });

  it('admits a personal column once it is entitled, and labels it', async () => {
    const draft = infer(await scan());
    const decisions = defaultDecisions(draft, 'steward');
    decisions.entities['master.customer-account']!.attributes['email'] = {
      include: true,
      columnEntitlement: 'edm.customer.pii.read',
    };

    const result = promote(draft, decisions, undefined, context);
    const email = result.catalog.entities['master.customer-account']!.attributes['email']!;

    expect(email.columnEntitlement).toBe('edm.customer.pii.read');
    expect(email.sensitivity).toBe('pii');
  });

  it('admits one the steward says is not personal, without the label', async () => {
    const draft = infer(await scan());
    const decisions = defaultDecisions(draft, 'steward');
    decisions.entities['master.legal-entity']!.attributes['vat-number'] = {
      include: true,
      notPersonal: true,
    };

    const result = promote(draft, decisions, undefined, context);
    const vat = result.catalog.entities['master.legal-entity']!.attributes['vat-number']!;
    expect(vat.sensitivity).toBeUndefined();
  });

  it('derives a row entitlement rather than leaving one blank, and says it did', async () => {
    const draft = infer(await scan());
    const result = promote(draft, defaultDecisions(draft, 'steward'), undefined, context);

    // Absent means "everyone" to the projection, so absent is the one thing this must not produce.
    for (const entity of Object.values(result.catalog.entities)) {
      expect(entity.rowEntitlementDomain).toBeTruthy();
    }
    // Coded as well as worded, so a screen can summarise ten identical notes into one line without
    // matching prose.
    const derived = result.notes.filter((note) => note.code === 'entitlement-derived');
    expect(derived).toHaveLength(10);
    expect(derived[0]!.message).toMatch(/No row entitlement was set/);
    expect(result.notes.every((note) => note.code.length > 0)).toBe(true);
  });

  it('refuses an entity whose key was not included', async () => {
    const draft = infer(await scan());
    const decisions = defaultDecisions(draft, 'steward');
    decisions.entities['vendor.vendor']!.attributes['vendor-id']!.include = false;

    const result = promote(draft, decisions, undefined, context);
    expect(result.catalog.entities['vendor.vendor']).toBeUndefined();
    expect(result.notes.find((note) => note.subject === 'vendor.vendor')!.message).toMatch(
      /key \(vendor-id\) is not fully exposed/,
    );
  });

  it('refuses a measure whose column was excluded rather than dropping it quietly', async () => {
    const draft = infer(await scan());
    const decisions = defaultDecisions(draft, 'steward');
    decisions.entities['processing.file-load']!.attributes['rows-rejected']!.include = false;

    const result = promote(draft, decisions, undefined, context);
    expect(result.catalog.entities['processing.file-load']!.measures!['rows-rejected']).toBeUndefined();
    expect(result.notes.find((note) => note.subject === 'processing.file-load.rows-rejected')!.message).toMatch(
      /aggregates a column that was not included/,
    );
  });

  it('refuses a relationship whose join columns are not both exposed', async () => {
    const draft = infer(await scan());
    const decisions = defaultDecisions(draft, 'steward');
    decisions.entities['dq.exception']!.attributes['rule-id']!.include = false;

    const result = promote(draft, decisions, undefined, context);
    expect(result.catalog.relationships!['dq.exception.exception-rule']).toBeUndefined();
    expect(result.notes.find((note) => note.subject === 'dq.exception.exception-rule')!.message).toMatch(
      /key columns are not both exposed/,
    );
  });

  it('records the physical table and column so a re-scan can find them', async () => {
    const draft = infer(await scan());
    const result = promote(draft, defaultDecisions(draft, 'steward'), undefined, context);
    const load = result.catalog.entities['processing.file-load']!;

    expect(load.physical).toEqual({ ref: 'processing.FILE_LOAD', sourceId: 'opus-edm-prod' });
    expect(load.attributes['load-status']!.physical!.ref).toBe('LOAD_STATUS');
    // A count needs no column.
    expect(load.measures!['file-load-count']!.physical).toBeUndefined();
  });

  it('names who approved it and what was scanned', async () => {
    const draft = infer(await scan());
    const result = promote(draft, defaultDecisions(draft, 'vincent'), undefined, context);
    const audit = result.catalog.audit!['promotion-opus-edm-prod'] as Record<string, unknown>;

    expect(audit['approvedBy']).toBe('vincent');
    expect(audit['scannedAt']).toBe('2026-08-06T09:15:00.000Z');
    expect(audit['promotedAt']).toBe('2026-08-06T10:00:00.000Z');
  });

  it('leaves another source’s entities alone and bumps the version', async () => {
    const draft = infer(await scan());
    const base: RawCatalog = {
      schemaVersion: '1.0',
      catalogVersion: 7,
      tenantId: 'gresham',
      lifecycleState: 'published',
      entities: {
        'crm.account': {
          id: 'crm.account',
          businessName: 'Account',
          primaryKey: ['account-id'],
          logicalDataSourceId: 'salesforce',
          physical: { ref: 'dbo.ACCOUNT', sourceId: 'crm-prod' },
          attributes: {
            'account-id': { id: 'account-id', businessName: 'Account ID', dataType: 'identifier' },
          },
        },
      },
    };

    const result = promote(draft, defaultDecisions(draft, 'steward'), base, context);
    expect(result.catalog.entities['crm.account']).toEqual(base.entities['crm.account']);
    expect(result.catalog.catalogVersion).toBe(8);
    // What this promotion contributed, not what the merged catalog now holds — the same basis as the
    // entity count beside it.
    expect(result.counts.relationships).toBe(draft.relationships.length);
  });

  it('reports an enumeration sample as drift against a scan taken without one', async () => {
    // A real change a steward can cause, not a contrived one: sampling reads values a metadata-only
    // scan cannot see, so the same database yields a different physical schema.
    const plain = await scan();
    const draft = infer(plain);
    const catalog = promote(draft, defaultDecisions(draft, 'steward'), undefined, context).catalog;

    const report = detectDrift(plain, await scan(OPUS_EDM_FIXTURE, { sample: true }), catalog);
    const change = report.changes.find((entry) => entry.subject === 'master.PRODUCT.CATEGORY')!;

    expect(change.kind).toBe('enum-values-changed');
    expect(change.severity).toBe('additive');
    expect(change.detail).toMatch(/"Ambient"/);
  });

  it('keeps an entity the source no longer exposes rather than breaking the pages on it', async () => {
    const draft = infer(await scan());
    const first = promote(draft, defaultDecisions(draft, 'steward'), undefined, context);

    const shrunk = mutable();
    shrunk.tables = shrunk.tables.filter((table) => table.name !== 'PRODUCT');
    const second = infer(await scan(shrunk));
    const result = promote(second, defaultDecisions(second, 'steward'), first.catalog, context);

    expect(result.catalog.entities['master.product']).toBeDefined();
    expect(result.notes.find((note) => note.subject === 'master.product')!.message).toMatch(
      /kept as it was rather than removed/,
    );
  });

  it('produces a catalog the platform can actually load and project', async () => {
    const draft = infer(await scan());
    const decisions = defaultDecisions(draft, 'steward');
    decisions.entities['dq.exception']!.rowEntitlementDomain = 'edm.dq.read';

    const service = new CatalogService();
    service.hydrate(promote(draft, decisions, undefined, context).catalog);

    const snapshot = service.projectionFor(user(['edm.dq.read']));
    const exception = snapshot.entities['dq.exception']!;

    expect(exception.businessName).toBe('Exception');
    expect(Object.keys(exception.measures)).toContain('exception-count');
    // An entity whose derived entitlement this caller lacks is not in the projection at all.
    expect(snapshot.entities['master.security']).toBeUndefined();
    // And nothing physical crossed the boundary.
    const json = JSON.stringify(snapshot);
    expect(json).not.toContain('EXCEPTION_STATUS');
    expect(json).not.toContain('physical');
  });

  it('gives the gateway a physical map for every promoted entity', async () => {
    const draft = infer(await scan());
    const service = new CatalogService();
    service.hydrate(promote(draft, defaultDecisions(draft, 'steward'), undefined, context).catalog);

    const map = service.physicalMapFor('processing.file-load')!;
    expect(map.attributes['load-status']).toBe('LOAD_STATUS');
    expect(map.measures['file-load-count']).toBeNull();
    expect(map.measures['rows-received']).toBe('ROWS_RECEIVED');
  });
});

// ── drift ──────────────────────────────────────────────────────────────────────────────

describe('drift detection', () => {
  const context = { tenantId: 'gresham', promotedAt: '2026-08-06T10:00:00.000Z' };

  async function promoted(): Promise<{ schema: PhysicalSchema; catalog: RawCatalog }> {
    const schema = await scan();
    const draft = infer(schema);
    return { schema, catalog: promote(draft, defaultDecisions(draft, 'steward'), undefined, context).catalog };
  }

  it('finds nothing between two scans of an unchanged database', async () => {
    const { schema, catalog } = await promoted();
    const report = detectDrift(schema, await scan(OPUS_EDM_FIXTURE, { now: '2026-08-07T09:15:00.000Z' }), catalog);

    expect(report.changes).toEqual([]);
    expect(report.safe).toBe(true);
    expect(report.previousScan).toBe('2026-08-06T09:15:00.000Z');
    expect(report.currentScan).toBe('2026-08-07T09:15:00.000Z');
  });

  it('calls a dropped column that a measure reads breaking, and names what breaks', async () => {
    const { schema, catalog } = await promoted();
    const changed = mutable();
    const load = tableIn(changed, 'processing.FILE_LOAD');
    load.columns = load.columns.filter((column) => column.name !== 'ROWS_REJECTED');

    const report = detectDrift(schema, await scan(changed), catalog);
    const change = report.changes.find(
      (entry) => entry.subject === 'processing.FILE_LOAD.ROWS_REJECTED',
    )!;

    expect(change.kind).toBe('column-removed');
    expect(change.severity).toBe('breaking');
    expect(change.affects).toEqual(['processing.file-load.rows-rejected']);
    expect(report.safe).toBe(false);
  });

  it('calls a dropped column nothing references housekeeping', async () => {
    const { schema, catalog } = await promoted();
    const changed = mutable();
    const load = tableIn(changed, 'processing.FILE_LOAD');
    // Never became an attribute: varbinary has no honest business type.
    load.columns = load.columns.filter((column) => column.name !== 'FILE_CHECKSUM');

    const report = detectDrift(schema, await scan(changed), catalog);
    expect(report.changes[0]).toMatchObject({ kind: 'column-removed', severity: 'additive' });
    expect(report.safe).toBe(true);
  });

  it('separates a type change that matters from one that does not', async () => {
    const { schema, catalog } = await promoted();
    const changed = mutable();
    // A widening: still a string, nothing to do.
    tableIn(changed, 'vendor.VENDOR').columns.find((column) => column.name === 'VENDOR_NAME')!.maxLength =
      600;
    // A change of kind: a decimal became text, and every sum over it is now wrong.
    const impact = tableIn(changed, 'dq.DQ_EXCEPTION').columns.find(
      (column) => column.name === 'IMPACT_AMOUNT',
    )!;
    impact.sqlType = 'nvarchar';
    impact.maxLength = 60;
    impact.precision = undefined;
    impact.scale = undefined;

    const report = detectDrift(schema, await scan(changed), catalog);
    expect(report.changes.find((entry) => entry.subject === 'vendor.VENDOR.VENDOR_NAME')).toMatchObject({
      kind: 'type-changed',
      severity: 'additive',
    });
    expect(
      report.changes.find((entry) => entry.subject === 'dq.DQ_EXCEPTION.IMPACT_AMOUNT'),
    ).toMatchObject({ kind: 'business-type-changed', severity: 'breaking' });
  });

  it('treats widened nullability as behavioural, because the query still runs', async () => {
    const { schema, catalog } = await promoted();
    const changed = mutable();
    tableIn(changed, 'processing.FILE_LOAD').columns.find(
      (column) => column.name === 'ROWS_RECEIVED',
    )!.nullable = true;

    const report = detectDrift(schema, await scan(changed), catalog);
    const change = report.changes.find(
      (entry) => entry.subject === 'processing.FILE_LOAD.ROWS_RECEIVED',
    )!;

    expect(change.kind).toBe('nullability-widened');
    expect(change.severity).toBe('behavioural');
    expect(change.remedy).toMatch(/Averages will start excluding rows/);
    expect(report.safe).toBe(false);
  });

  it('notices a value disappearing from a code list', async () => {
    const { schema, catalog } = await promoted();
    const changed = mutable();
    const status = tableIn(changed, 'processing.FILE_LOAD').columns.find(
      (column) => column.name === 'LOAD_STATUS',
    )!;
    status.check = "[LOAD_STATUS]=N'PENDING' OR [LOAD_STATUS]=N'RUNNING' OR [LOAD_STATUS]=N'COMPLETE'";

    const report = detectDrift(schema, await scan(changed), catalog);
    const change = report.changes.find((entry) => entry.kind === 'enum-values-changed')!;

    expect(change.detail).toMatch(/"FAILED", "LATE" are no longer allowed/);
    expect(change.severity).toBe('behavioural');
  });

  it('calls a changed primary key breaking', async () => {
    const { schema, catalog } = await promoted();
    const changed = mutable();
    tableIn(changed, 'processing.LOAD_STEP').primaryKey = ['LOAD_ID'];

    const report = detectDrift(schema, await scan(changed), catalog);
    expect(report.changes.find((entry) => entry.kind === 'key-changed')).toMatchObject({
      subject: 'processing.LOAD_STEP',
      severity: 'breaking',
      affects: ['processing.load-step'],
    });
  });

  it('reports a new table and a new column as additive', async () => {
    const { schema, catalog } = await promoted();
    const changed = mutable();
    tableIn(changed, 'vendor.VENDOR').columns.push({
      name: 'REVIEW_CYCLE_MONTHS',
      sqlType: 'int',
      precision: 10,
      scale: 0,
      nullable: true,
    });
    changed.tables.push({
      schema: 'vendor',
      name: 'VENDOR_CONTRACT',
      rows: 1_400,
      primaryKey: ['CONTRACT_ID'],
      columns: [
        { name: 'CONTRACT_ID', sqlType: 'int', generated: true, precision: 10, scale: 0 },
        { name: 'VENDOR_ID', sqlType: 'int', precision: 10, scale: 0 },
        { name: 'RENEWAL_DATE', sqlType: 'date', nullable: true },
      ],
    });

    const report = detectDrift(schema, await scan(changed), catalog);
    expect(report.counts).toEqual({ breaking: 0, behavioural: 0, additive: 2 });
    expect(report.safe).toBe(true);
    expect(report.changes.map((entry) => entry.kind).sort()).toEqual(['column-added', 'table-added']);
  });

  it('reports a row count that moved by proportion, not by difference', async () => {
    const { schema, catalog } = await promoted();
    const changed = mutable();
    // Ordinary growth on a 48M-row fact table: not news.
    tableIn(changed, 'processing.FILE_LOAD').rows = 49_000_000;
    // A lookup table that is suddenly a fact table: news.
    tableIn(changed, 'dq.DQ_RULE').rows = 4_000_000;

    const report = detectDrift(schema, await scan(changed), catalog);
    const moved = report.changes.filter((entry) => entry.kind === 'row-count-moved');
    expect(moved).toHaveLength(1);
    expect(moved[0]!.subject).toBe('dq.DQ_RULE');
  });

  it('does not call a value list lost when the scan simply did not look for it', async () => {
    // The false-alarm case: promote a sampled scan, re-scan on metadata only, and every discovered
    // code list appears to have been dropped from the database.
    const sampled = await scan(OPUS_EDM_FIXTURE, { sample: true });
    const draft = infer(sampled);
    const catalog = promote(draft, defaultDecisions(draft, 'steward'), undefined, context).catalog;

    const report = detectDrift(sampled, await scan(), catalog);
    const change = report.changes.find((entry) => entry.subject === 'master.PRODUCT.CATEGORY')!;

    expect(change.severity).toBe('additive');
    expect(change.detail).toMatch(/this scan did not sample values/);
    expect(report.safe).toBe(true);
  });

  it('reports a column that has become a code list', async () => {
    const { schema, catalog } = await promoted();
    const changed = mutable();
    tableIn(changed, 'master.PRODUCT').columns.find((column) => column.name === 'CATEGORY')!.check =
      "[CATEGORY]=N'Chilled' OR [CATEGORY]=N'Frozen'";

    const report = detectDrift(schema, await scan(changed), catalog);
    const change = report.changes.find((entry) => entry.subject === 'master.PRODUCT.CATEGORY')!;

    expect(change.detail).toMatch(/now a code list of 2/);
    expect(change.remedy).toMatch(/give the codes labels/);
  });

  it('reports a value list that has genuinely been dropped', async () => {
    const { schema, catalog } = await promoted();
    const changed = mutable();
    delete tableIn(changed, 'processing.FILE_LOAD').columns.find(
      (column) => column.name === 'LOAD_STATUS',
    )!.check;

    const report = detectDrift(schema, await scan(changed), catalog);
    const change = report.changes.find(
      (entry) => entry.subject === 'processing.FILE_LOAD.LOAD_STATUS',
    )!;

    expect(change.detail).toMatch(/no longer restricted to a value list/);
    expect(change.severity).toBe('behavioural');
  });

  it('does not blame this source for another source’s table of the same name', async () => {
    const { schema } = await promoted();
    const foreign: RawCatalog = {
      schemaVersion: '1.0',
      catalogVersion: 1,
      tenantId: 'gresham',
      lifecycleState: 'published',
      entities: {
        'other.vendor': {
          id: 'other.vendor',
          businessName: 'Vendor',
          primaryKey: ['vendor-id'],
          logicalDataSourceId: 'other',
          // Same table name, different database.
          physical: { ref: 'vendor.VENDOR', sourceId: 'some-other-source' },
          attributes: {
            'vendor-id': { id: 'vendor-id', businessName: 'Vendor ID', dataType: 'identifier' },
          },
        },
      },
    };

    const changed = mutable();
    changed.tables = changed.tables.filter((table) => table.name !== 'VENDOR');
    const report = detectDrift(schema, await scan(changed), foreign);

    expect(report.changes.find((entry) => entry.subject === 'vendor.VENDOR')!.affects).toEqual([]);
  });

  it('reports structural severity when there is no catalog to read it against', async () => {
    const { schema } = await promoted();
    const changed = mutable();
    changed.tables = changed.tables.filter((table) => table.name !== 'DQ_RULE');

    const report = detectDrift(schema, await scan(changed));
    expect(report.changes.find((entry) => entry.subject === 'dq.DQ_RULE')!.affects).toEqual([]);
  });
});
