/**
 * Scan a real SQL Server and diff the result against the built-in fixture.
 *
 * ── WHAT THIS ANSWERS THAT THE UNIT TESTS CANNOT ────────────────────────────────────────
 * The test suite runs the whole pipeline over `FixtureExecutor`, which answers the probe's statements
 * from a declared schema. That proves the pipeline is self-consistent. It cannot prove the statements
 * are *correct T-SQL*, that `sys.columns` reports what the fixture claims, or that the fixture is a
 * faithful description of a database — three things which are only true if a real server says so.
 *
 * It found real defects the fixture had hidden. `sys.columns` populates `max_length`, `precision` and
 * `scale` for *every* column, not only the ones where a length was declared — so a real `int` arrives
 * with `max_length: 4` and a real `nvarchar(200)` with `max_length: 400`. The drift report's type label
 * rendered those as "int(4)" and "nvarchar(400)", and nothing in the fixture-based tests could see it
 * because the fixture omitted the fields.
 *
 * ── HOW TO RUN IT ───────────────────────────────────────────────────────────────────────
 *   docker run -d --name opus-edm-sql -e ACCEPT_EULA=Y -e 'MSSQL_SA_PASSWORD=<password>' \
 *     -e MSSQL_PID=Developer -p 11433:1433 mcr.microsoft.com/mssql/server:2022-latest
 *   node tools/fixture-ddl.mjs > /tmp/opus-edm.sql
 *   docker cp /tmp/opus-edm.sql opus-edm-sql:/tmp/ && docker exec opus-edm-sql \
 *     /opt/mssql-tools18/bin/sqlcmd -S localhost -U sa -P '<password>' -C -i /tmp/opus-edm.sql
 *   SCAN_PASSWORD='<password>' node tools/verify-real-scan.mjs
 *
 * Environment: `SCAN_HOST` (localhost), `SCAN_PORT` (11433), `SCAN_DATABASE` (OpusEDM),
 * `SCAN_USER` (sa), `SCAN_PASSWORD` (required).
 *
 * ── AND WHAT IT DELIBERATELY EXCLUDES FROM THE COMPARISON ───────────────────────────────
 * Row counts, and the clock. `tools/fixture-ddl.mjs` creates the schema and inserts nothing, so
 * `sys.partitions` honestly reports zero where the fixture claims 240 million — and cost class,
 * `requiresFilter` and drift's proportional row-count test all key off that number. Excluding them is
 * stated here and printed in the output, because a comparison that quietly ignored a field would be a
 * comparison that could not fail.
 */

import {
  FIXTURE_SCHEMAS,
  FixtureExecutor,
  MsSqlProbe,
  infer,
  normalise,
} from '../libs/catalog-ingest/src/index.ts';
import { executorFor, releaseAll } from '../server/sources/mssql-executor.ts';

const HOST = process.env['SCAN_HOST'] ?? 'localhost';
const PORT = Number(process.env['SCAN_PORT'] ?? 11433);
const DATABASE = process.env['SCAN_DATABASE'] ?? 'OpusEDM';
const USER = process.env['SCAN_USER'] ?? 'sa';
const PASSWORD = process.env['SCAN_PASSWORD'];

if (!PASSWORD) {
  console.error('Set SCAN_PASSWORD. This script does not have a default, and never will.');
  process.exit(2);
}

// Handed to the resolver the same way a deployment hands it over: as a named secret in the environment.
process.env['OPUS_SECRET_VERIFY_SCAN'] = PASSWORD;

const source = normalise(
  {
    name: 'Verification target',
    kind: 'mssql',
    host: HOST,
    port: PORT,
    database: DATABASE,
    auth: 'sqlLogin',
    username: USER,
    secretRef: 'verify/scan',
    schemas: [...FIXTURE_SCHEMAS],
    encrypt: true,
    // A development container's certificate is self-signed. Recorded as accepted, which is the point.
    trustServerCertificate: true,
    registeredBy: 'tools/verify-real-scan.mjs',
  },
  'verify-scan',
  new Date().toISOString(),
);

/** Fields the DDL cannot reproduce, and the reason. Printed, not hidden. */
const EXCLUDED = {
  approxRows: 'the DDL creates the schema and inserts no rows',
  scannedAt: 'two scans happen at two times',
  serverVersion: 'the fixture names one build',
};

function normaliseForDiff(schema) {
  return {
    ...schema,
    scannedAt: 'excluded',
    serverVersion: 'excluded',
    tables: schema.tables.map((table) => ({ ...table, approxRows: 'excluded' })),
  };
}

/** Every leaf difference, as a path and two values. */
function differences(a, b, path = '', found = []) {
  if (a === b) return found;
  if (typeof a !== typeof b || a === null || b === null || typeof a !== 'object') {
    found.push({ path, real: a, fixture: b });
    return found;
  }
  for (const key of new Set([...Object.keys(a), ...Object.keys(b)])) {
    differences(a[key], b[key], path ? `${path}.${key}` : key, found);
  }
  return found;
}

/** Keyed by ref and name so a difference is reported against the right table, not the right index. */
function keyed(schema) {
  return {
    ...schema,
    tables: Object.fromEntries(
      schema.tables.map((table) => [
        table.ref,
        {
          ...table,
          columns: Object.fromEntries(table.columns.map((column) => [column.name, column])),
          foreignKeys: Object.fromEntries(table.foreignKeys.map((key) => [key.name, key])),
        },
      ]),
    ),
  };
}

async function main() {
  const probe = new MsSqlProbe(source.id, source.database, source.schemas);

  console.log(`Scanning ${HOST}:${PORT}/${DATABASE} as ${USER}…`);
  const real = await probe.scan(await executorFor(source));
  console.log(`  ${real.tables.length} objects · ${real.serverVersion}`);
  if (real.warnings.length) for (const warning of real.warnings) console.log(`  warning: ${warning}`);

  const fixture = await probe.scan(new FixtureExecutor());

  console.log('\nExcluded from the comparison:');
  for (const [field, reason] of Object.entries(EXCLUDED)) console.log(`  ${field} — ${reason}`);

  const found = differences(
    keyed(normaliseForDiff(real)),
    keyed(normaliseForDiff(fixture)),
  ).filter(
    /*
      A field the fixture simply does not state is not a disagreement about the database.

      The fixture omits `precision` on a string column and `max_length` on an `int`; the server reports
      0 and 4. Both describe the same column. What matters is a field where both sides have an opinion
      and the opinions differ — that is the fixture being wrong.
    */
    (difference) => difference.real !== undefined && difference.fixture !== undefined,
  );

  console.log(`\n${found.length} substantive difference${found.length === 1 ? '' : 's'}:`);
  for (const difference of found) {
    console.log(`  ${difference.path}: real=${JSON.stringify(difference.real)} fixture=${JSON.stringify(difference.fixture)}`);
  }

  /*
    The draft is the comparison that matters most.

    The physical schema is an input; the draft is what a steward reviews and what becomes the business
    vocabulary. Row-count-derived fields are excluded for the reason above.
  */
  const stripDraft = (draft) =>
    JSON.stringify({
      ...draft,
      scannedAt: 'excluded',
      serverVersion: 'excluded',
      entities: draft.entities.map((entity) => ({
        ...entity,
        approxRows: 'excluded',
        requiresFilter: 'excluded',
        costClass: 'excluded',
        decisions: entity.decisions.filter((decision) => !decision.what.includes('needing a filter')),
      })),
    });

  const same = stripDraft(infer(real)) === stripDraft(infer(fixture));
  console.log(`\nInferred draft identical: ${same ? 'YES' : 'NO'}`);

  // Determinism, against a real server rather than a fixture with a frozen clock.
  const again = await probe.scan(await executorFor(source));
  const stable =
    JSON.stringify({ ...real, scannedAt: 'x' }) === JSON.stringify({ ...again, scannedAt: 'x' });
  console.log(`Two consecutive real scans identical: ${stable ? 'YES' : 'NO'}`);

  await releaseAll();
  process.exit(found.length === 0 && same && stable ? 0 : 1);
}

main().catch(async (error) => {
  console.error(`\nFAILED: ${error instanceof Error ? error.message : String(error)}`);
  await releaseAll();
  process.exit(1);
});
