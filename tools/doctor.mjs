#!/usr/bin/env node
/**
 * `npm run doctor` — check the handful of things that actually go wrong.
 *
 * ── WHY THIS EXISTS ─────────────────────────────────────────────────────────────────────
 * Not as a general-purpose diagnostic. This list is exactly the set of failures that have been hit
 * while getting the scan demo running, each of which produced an error message pointing somewhere other
 * than the cause:
 *
 *   · a `node_modules` out of step with the lockfile — reported as "@angular/build supports Angular
 *     ^20.0.0 but detected 21.2.19", which reads as a repository problem and is a local install;
 *   · a port still held by a process from an earlier session — reported as the app failing to start,
 *     one line deep in another process's banner;
 *   · an API running without the code that stores a password — reported as a form field being disabled;
 *   · Docker not running — reported by whatever ran next;
 *   · a container that exists but whose database is still recovering.
 *
 * Every check answers with the *fix*, not the symptom. A diagnostic that says "FAIL: version mismatch"
 * has moved the problem, not solved it.
 *
 * It never changes anything. Reading state is safe to run at any time, including while the demo is up.
 */

import { execFile } from 'node:child_process';
import { createServer } from 'node:net';
import { createRequire } from 'node:module';
import { existsSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join, resolve } from 'node:path';
import { promisify } from 'node:util';

const run = promisify(execFile);
const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const require = createRequire(join(ROOT, 'package.json'));

const API_PORT = process.env['PORT'] ?? '4000';
const STUDIO_PORT = '4300';

let failures = 0;
let warnings = 0;

function ok(what, detail = '') {
  process.stdout.write(`  ✓ ${what}${detail ? `  ${detail}` : ''}\n`);
}
function warn(what, fix) {
  warnings++;
  process.stdout.write(`  ! ${what}\n      ${fix}\n`);
}
function fail(what, fix) {
  failures++;
  process.stdout.write(`  ✗ ${what}\n      ${fix}\n`);
}

function installed(name) {
  try {
    return require(`${name}/package.json`).version;
  } catch {
    return null;
  }
}

// ── Node ────────────────────────────────────────────────────────────────────
process.stdout.write('\nRuntime\n');
{
  const major = Number(process.versions.node.split('.')[0]);
  const minor = Number(process.versions.node.split('.')[1]);
  // Angular 21 needs 20.19+ or 22+. 21.x is odd-numbered and unsupported.
  const supported = (major === 20 && minor >= 19) || major === 22 || major >= 24;
  if (supported) ok('Node', process.versions.node);
  else fail(`Node ${process.versions.node} is not supported by Angular 21`, 'Use Node 20.19+ or 22+.');
}

// ── dependencies ────────────────────────────────────────────────────────────
process.stdout.write('\nDependencies\n');
{
  if (!existsSync(join(ROOT, 'node_modules'))) {
    fail('node_modules is missing', 'Run: npm ci');
  } else {
    /*
      Every Angular package must agree, and the check is against `@angular/core` rather than against a
      number in this file — a hardcoded expectation is one more thing to forget to bump.
    */
    const core = installed('@angular/core');
    const family = ['@angular/build', '@angular/cli', '@angular/common', '@angular/compiler-cli'];
    const wrong = family
      .map((name) => [name, installed(name)])
      .filter(([, version]) => version && version.split('.')[0] !== core?.split('.')[0]);

    if (!core) {
      fail('@angular/core is not installed', 'Run: npm ci');
    } else if (wrong.length) {
      fail(
        `Angular packages disagree: core is ${core}, but ${wrong
          .map(([name, version]) => `${name} is ${version}`)
          .join(', ')}`,
        'A part-installed tree. Run: rm -rf node_modules && npm ci  (npm ci installs exactly the ' +
          'lockfile; npm install can leave a tree half-updated)',
      );
    } else {
      ok('Angular', `${core} — core, build, cli and compiler all agree`);
    }

    // The dependency most recently added, so the one most likely to be missing from an older install.
    const driver = installed('mssql');
    if (driver) ok('mssql driver', driver);
    else fail('the mssql driver is not installed', 'Run: npm ci');

    /*
      A global Angular CLI shadowing the local one produces the same version error, from a completely
      different cause, so it is worth naming separately.
    */
    try {
      const { stdout } = await run('npm', ['ls', '-g', '--depth', '0', '@angular/cli', '--json'], {
        cwd: ROOT,
      });
      const globalVersion = JSON.parse(stdout)?.dependencies?.['@angular/cli']?.version;
      if (globalVersion && globalVersion.split('.')[0] !== core?.split('.')[0]) {
        warn(
          `a global @angular/cli ${globalVersion} is installed, and this project needs ${core}`,
          'Harmless through npm scripts, which use the local one. It breaks a bare `ng serve` — use ' +
            '`npm run studio` instead, or uninstall it: npm rm -g @angular/cli',
        );
      }
    } catch {
      // No global CLI, or npm could not be asked. Either is fine.
    }
  }
}

// ── ports ───────────────────────────────────────────────────────────────────
process.stdout.write('\nPorts\n');

function portFree(port) {
  return new Promise((resolve) => {
    const probe = createServer();
    probe.once('error', () => resolve(false));
    probe.once('listening', () => probe.close(() => resolve(true)));
    probe.listen(Number(port), '127.0.0.1');
  });
}

for (const [port, what] of [
  [API_PORT, 'API'],
  [STUDIO_PORT, 'Studio'],
]) {
  if (await portFree(port)) ok(`:${port} free`, `(${what})`);
  else ok(`:${port} in use`, `(${what} — fine if you meant to leave it running)`);
}

// ── the API, if it is up ────────────────────────────────────────────────────
process.stdout.write('\nCatalog service\n');
{
  let reached = false;
  try {
    const response = await fetch(`http://localhost:${API_PORT}/api/sources`, {
      headers: { 'x-persona': 'steward' },
      signal: AbortSignal.timeout(3000),
    });
    if (response.ok) {
      reached = true;
      const body = await response.json();
      ok(`answering on :${API_PORT}`, `${body.sources?.length ?? 0} source(s) registered`);
      if (body.canStorePassword) {
        ok('can store a typed password');
      } else {
        // The exact symptom that was reported as "the password field is not working".
        fail(
          'it will not store a typed password, so that option is disabled in the form',
          body.passwordUnavailableReason ?? 'Restart the API; if it persists, set OPUS_SECRET_KEY.',
        );
      }
    } else if (response.status === 403) {
      warn(`answering on :${API_PORT} but refusing this caller`, 'Expected unless you are the steward persona.');
    } else {
      fail(`:${API_PORT} answered HTTP ${response.status}`, 'Check the API output for the reason.');
    }
  } catch {
    ok(`not running on :${API_PORT}`, '(start it with: npm run demo)');
  }

  if (reached) {
    // An API that is up but pre-dates the password work is the case a version check cannot see.
    const hasRotate = existsSync(join(ROOT, 'server/sources/secret-store.ts'));
    if (!hasRotate) fail('this checkout pre-dates the credential store', 'Run: git pull && npm ci');
  }
}

// ── the sandbox ─────────────────────────────────────────────────────────────
process.stdout.write('\nSQL Server sandbox\n');
{
  const container = process.env['EDM_CONTAINER'] ?? 'opus-edm-sql';
  try {
    await run('docker', ['info', '--format', '{{.ServerVersion}}']);
    try {
      const { stdout } = await run('docker', ['inspect', container, '--format', '{{.State.Status}}']);
      const state = stdout.trim();
      if (state === 'running') {
        try {
          const { stdout: rows } = await run('docker', [
            'exec', container, '/opt/mssql-tools18/bin/sqlcmd',
            '-S', 'localhost', '-U', 'sa', '-P', process.env['EDM_SA_PASSWORD'] ?? 'Opus!Edm2026Scan',
            '-C', '-d', 'OpusEDM', '-h', '-1', '-W',
            '-Q', 'SET NOCOUNT ON; SELECT CAST(COUNT(*) AS varchar(10)) FROM sys.tables',
          ]);
          ok(`"${container}" running`, `OpusEDM has ${rows.trim()} tables`);
        } catch {
          warn(
            `"${container}" is running but OpusEDM is not answering yet`,
            'A database recovers for a few seconds after a restart. Wait, or run: npm run edm:up',
          );
        }
      } else {
        fail(`"${container}" exists but is ${state}`, 'Run: npm run edm:up');
      }
    } catch {
      warn(`no "${container}" container`, 'For a live scan run: npm run edm:up');
    }
  } catch {
    warn('Docker is not reachable', 'Start it, then: npm run edm:up  (or skip it — the Studio runs without one)');
  }
}

// ── verdict ─────────────────────────────────────────────────────────────────
process.stdout.write('\n');
if (failures) {
  process.stdout.write(`${failures} problem(s) to fix${warnings ? `, ${warnings} worth knowing` : ''}.\n\n`);
  process.exit(1);
}
process.stdout.write(
  warnings ? `Nothing broken, ${warnings} thing(s) worth knowing.\n\n` : 'All good.\n\n',
);
