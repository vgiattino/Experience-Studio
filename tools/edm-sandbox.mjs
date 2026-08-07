#!/usr/bin/env node
/**
 * A SQL Server to scan, in one command.
 *
 *   npm run edm:up      start it, create the schema, seed it, print what to do next
 *   npm run edm:down    stop and remove it
 *   npm run edm:status  is it there, and what is in it
 *   npm run edm:reset   re-apply the schema and data without recreating the container
 *
 * ── WHY A SCRIPT AND NOT FOUR LINES IN THE README ───────────────────────────────────────
 * Because the four lines have an order, a wait in the middle, and a failure mode each. SQL Server takes
 * thirty to sixty seconds before it accepts a connection, so a README that says "run the container then
 * apply the DDL" produces a login-timeout error the first time everybody tries it. This waits, and says
 * what it is waiting for.
 *
 * ── THE PASSWORD ────────────────────────────────────────────────────────────────────────
 * There is a default, and it is in this file in plain sight. That is a deliberate, narrow exception: it
 * belongs to a throwaway container on a loopback port with no real data in it, and the alternative — a
 * step that says "choose a password and remember to use the same one in three other places" — is the
 * step that makes a demo fail in front of an audience.
 *
 * It is overridable with `EDM_SA_PASSWORD`, it is only ever passed to the local container and to
 * `sqlcmd` inside it, and it never becomes a *registration*: the platform stores the name of a secret,
 * and `npm run demo` puts this value in the environment under that name. Nothing in `server/data`
 * contains it.
 */

import { execFile, spawn } from 'node:child_process';
import { promisify } from 'node:util';
import { fileURLToPath } from 'node:url';
import { dirname, join, resolve } from 'node:path';
import { writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';

const run = promisify(execFile);

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const CONTAINER = process.env['EDM_CONTAINER'] ?? 'opus-edm-sql';
const PORT = process.env['EDM_PORT'] ?? '11433';
const PASSWORD = process.env['EDM_SA_PASSWORD'] ?? 'Opus!Edm2026Scan';
const IMAGE = process.env['EDM_IMAGE'] ?? 'mcr.microsoft.com/mssql/server:2022-latest';
const SQLCMD = '/opt/mssql-tools18/bin/sqlcmd';

/** The name the platform knows the password by. Kept in one place; `npm run demo` reads it. */
export const SECRET_ENV = 'OPUS_SECRET_KV_EDM_SA';

function say(message) {
  process.stdout.write(`${message}\n`);
}

async function docker(args, options = {}) {
  return run('docker', args, { maxBuffer: 32 * 1024 * 1024, ...options });
}

/**
 * Is the daemon reachable?
 *
 * Checked first and reported plainly, because "Cannot connect to the Docker daemon" is the single most
 * common reason this fails and it is not a problem with this project.
 */
async function daemonReady() {
  try {
    await docker(['info', '--format', '{{.ServerVersion}}']);
    return true;
  } catch {
    return false;
  }
}

async function containerState() {
  try {
    const { stdout } = await docker([
      'inspect', CONTAINER, '--format', '{{.State.Status}}',
    ]);
    return stdout.trim();
  } catch {
    return 'absent';
  }
}

/** Run a SQL file inside the container. `-C` trusts the container's self-signed certificate. */
async function sqlFile(localPath, label) {
  const inContainer = `/tmp/${label}.sql`;
  await docker(['cp', localPath, `${CONTAINER}:${inContainer}`]);
  const { stdout, stderr } = await docker([
    'exec', CONTAINER, SQLCMD, '-S', 'localhost', '-U', 'sa', '-P', PASSWORD, '-C', '-b', '-i', inContainer,
  ]);
  return `${stdout}${stderr}`;
}

/**
 * A query, optionally against a named database.
 *
 * The database matters: `sqlcmd` connects to `master`, so a query about `OpusEDM`'s tables returns
 * nothing at all rather than failing — which is how the row-count summary came back blank the first
 * time this ran.
 */
async function sqlQuery(query, database) {
  const { stdout } = await docker([
    'exec', CONTAINER, SQLCMD, '-S', 'localhost', '-U', 'sa', '-P', PASSWORD, '-C',
    ...(database ? ['-d', database] : []),
    '-h', '-1', '-W', '-Q', query,
  ]);
  return stdout.trim();
}

/**
 * Wait until the server answers, not until a fixed number of seconds have passed.
 *
 * A first boot initialises system databases and can take a minute on a slow disk; a restart of an
 * existing container is a few seconds. Polling covers both without making either wait for the other.
 */
async function waitForServer(timeoutMs = 180_000) {
  const started = Date.now();
  let announced = false;
  while (Date.now() - started < timeoutMs) {
    try {
      await sqlQuery('SELECT 1');
      return;
    } catch {
      if (!announced) {
        say('  waiting for SQL Server to accept connections (a first boot takes about a minute)…');
        announced = true;
      }
      await new Promise((wake) => setTimeout(wake, 3000));
    }
  }
  throw new Error(
    `SQL Server in "${CONTAINER}" did not accept a connection within ${timeoutMs / 1000}s. ` +
      `Check: docker logs ${CONTAINER}`,
  );
}

/** Generate the DDL from the fixture, into a temp file, and apply it. */
async function applySchema() {
  say('  creating the schema from the fixture…');
  const { stdout } = await run(
    process.execPath,
    [join(ROOT, 'node_modules/tsx/dist/cli.mjs'), join(ROOT, 'tools/fixture-ddl.mjs')],
    { cwd: ROOT, maxBuffer: 16 * 1024 * 1024 },
  );
  const path = join(tmpdir(), 'opus-edm-ddl.sql');
  writeFileSync(path, stdout, 'utf8');
  const output = await sqlFile(path, 'opus-edm-ddl');
  const problems = output.split('\n').filter((line) => /^Msg \d+/.test(line));
  if (problems.length) throw new Error(`The schema did not apply cleanly:\n${problems.join('\n')}`);
}

async function applyData() {
  say('  seeding 3.7 million rows (about a minute)…');
  const output = await sqlFile(join(ROOT, 'tools/opus-edm-seed.sql'), 'opus-edm-seed');
  const problems = output.split('\n').filter((line) => /^Msg \d+/.test(line));
  if (problems.length) throw new Error(`The seed did not apply cleanly:\n${problems.join('\n')}`);
}

async function rowCounts() {
  const rows = await sqlQuery(
    `SET NOCOUNT ON;
     SELECT s.name + '.' + t.name + ' ' + CAST(SUM(p.rows) AS varchar(20))
     FROM sys.tables t
     JOIN sys.schemas s ON s.schema_id = t.schema_id
     JOIN sys.partitions p ON p.object_id = t.object_id AND p.index_id IN (0, 1)
     GROUP BY s.name, t.name ORDER BY s.name, t.name`,
    'OpusEDM',
  );
  return rows;
}

async function up() {
  if (!(await daemonReady())) {
    say('Docker is not reachable.');
    say('');
    say('  Start it and run this again. On a machine with systemd:  sudo systemctl start docker');
    say('  On this kind of sandbox, the daemon may need starting by hand:  sudo dockerd &');
    process.exit(1);
  }

  const state = await containerState();
  if (state === 'absent') {
    say(`Creating "${CONTAINER}" from ${IMAGE}…`);
    await docker([
      'run', '-d', '--name', CONTAINER,
      '-e', 'ACCEPT_EULA=Y',
      '-e', `MSSQL_SA_PASSWORD=${PASSWORD}`,
      // Developer edition: every Enterprise feature, licensed for development only.
      '-e', 'MSSQL_PID=Developer',
      '-p', `${PORT}:1433`,
      IMAGE,
    ]);
  } else if (state !== 'running') {
    say(`Starting the existing "${CONTAINER}"…`);
    await docker(['start', CONTAINER]);
  } else {
    say(`"${CONTAINER}" is already running.`);
  }

  await waitForServer();
  await applySchema();
  await applyData();

  const version = await sqlQuery("SET NOCOUNT ON; SELECT CAST(SERVERPROPERTY('ProductVersion') AS nvarchar(64))");

  say('');
  say(`Ready. SQL Server ${version} on localhost:${PORT}, database OpusEDM.`);
  say('');
  say(await rowCounts());
  say('');
  say('Next:');
  say('');
  say('  npm run demo          the API and the Studio together, with the secret in the environment');
  say('');
  say('Then in the Studio: Catalog → Sources → Register a source');
  say('');
  say(`  Host             localhost`);
  say(`  Port             ${PORT}`);
  say(`  Database         OpusEDM`);
  say(`  Authentication   SQL login`);
  say(`  Username         sa`);
  say(`  Secret name      kv/edm/sa`);
  say(`  Schemas          dq, master, processing, vendor`);
  say(`  Trust an unverified certificate — tick it; the container's certificate is self-signed`);
  say('');
  say('Then: Test the connection → Scan → review → Publish.');
}

async function down() {
  if (!(await daemonReady())) {
    say('Docker is not reachable, so there is nothing to stop.');
    return;
  }
  if ((await containerState()) === 'absent') {
    say(`"${CONTAINER}" does not exist.`);
    return;
  }
  await docker(['rm', '-f', CONTAINER]);
  say(`Removed "${CONTAINER}". Its data went with it.`);
}

async function status() {
  if (!(await daemonReady())) {
    say('Docker is not reachable.');
    process.exit(1);
  }
  const state = await containerState();
  say(`container: ${state}`);
  if (state !== 'running') return;
  try {
    const version = await sqlQuery("SET NOCOUNT ON; SELECT CAST(SERVERPROPERTY('ProductVersion') AS nvarchar(64))");
    say(`server:    ${version} on localhost:${PORT}`);
    say('');
    say(await rowCounts());
  } catch (error) {
    say(`server:    not accepting connections yet (${error instanceof Error ? error.message : error})`);
  }
}

async function reset() {
  if ((await containerState()) !== 'running') {
    say(`"${CONTAINER}" is not running. Use: npm run edm:up`);
    process.exit(1);
  }
  await waitForServer();
  await applySchema();
  await applyData();
  say('');
  say(await rowCounts());
}

const command = process.argv[2] ?? 'up';
const commands = { up, down, status, reset };

if (!commands[command]) {
  say(`Unknown command "${command}". One of: ${Object.keys(commands).join(', ')}`);
  process.exit(2);
}

try {
  await commands[command]();
} catch (error) {
  say('');
  say(`Failed: ${error instanceof Error ? error.message : String(error)}`);
  process.exit(1);
}
