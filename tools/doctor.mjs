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

/**
 * Run `npm`, on Windows too.
 *
 * On Windows `npm` is `npm.cmd`, and since the shell-injection fix in Node 18.20 / 20.12 `execFile`
 * refuses to spawn a `.cmd` without a shell. Without this the global-CLI check below silently did
 * nothing — on the one platform where a globally installed Angular CLI is most likely to be the cause of
 * the error it is looking for.
 */
function npm(args) {
  return run('npm', args, { cwd: ROOT, shell: process.platform === 'win32' });
}

/**
 * Advice a reader can paste into the shell they are actually using.
 *
 * `rm -rf` and `pkill` are not commands on Windows, and PowerShell 5.1 does not accept `&&` either — so
 * a fix line written for a Unix shell is a fix line half this project's audience cannot run. `npm ci`
 * removes `node_modules` itself, which is why the reinstall advice does not need a delete at all.
 */
const WINDOWS = process.platform === 'win32';

const REINSTALL = WINDOWS
  ? 'Close any running dev server first (a locked file makes this fail on Windows), then run: npm ci'
  : 'Run: npm ci';

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

// ── checkout ────────────────────────────────────────────────────────────────
/*
  Which repository, which branch, which commit — asked first, because it is the question that makes
  every other answer meaningful.

  Twice now a version error has turned out to be a checkout that was not the one the reader thought it
  was: a differently-named directory, a branch without the work in it. No amount of reinstalling fixes
  either, so being told to reinstall sends somebody round a loop.
*/
process.stdout.write('\nCheckout\n');
{
  async function git(args) {
    const { stdout } = await run('git', args, { cwd: ROOT });
    return stdout.trim();
  }

  try {
    const [remote, branch, commit] = await Promise.all([
      git(['remote', 'get-url', 'origin']).catch(() => '(no origin)'),
      git(['rev-parse', '--abbrev-ref', 'HEAD']),
      git(['log', '--oneline', '-1']),
    ]);
    ok('repository', remote);
    ok('branch', branch);
    ok('commit', commit);

    /*
      A deleted or edited lockfile, called out specifically.

      It is the most damaging thing somebody reaches for when an install misbehaves, and it is the one
      that guarantees the next `npm install` resolves a different tree — turning a recoverable stale
      `node_modules` into a genuinely different set of versions. `npm ci` cannot run at all without it.
    */
    const dirty = await git(['status', '--porcelain', '--', 'package.json', 'package-lock.json']);
    if (dirty) {
      const missing = dirty.split('\n').some((line) => line.includes('package-lock.json'));
      fail(
        `package.json or package-lock.json differs from the commit:\n      ${dirty.replace(/\n/g, '\n      ')}`,
        missing
          ? 'Restore the lockfile — it pins the exact tree, and npm ci needs it: ' +
            'git restore package-lock.json package.json   then run: npm ci'
          : 'Restore them with: git restore package.json package-lock.json   then run: npm ci',
      );
    } else {
      ok('package.json and package-lock.json', 'match the commit');
    }
  } catch {
    warn('this directory is not a git checkout', 'Version checks below cannot tell you whether it is the right code.');
  }
}

// ── Node ────────────────────────────────────────────────────────────────────
process.stdout.write('\nRuntime\n');
{
  /*
    The requirement is read from the installed Angular, not restated here.

    A hardcoded range is a second copy that drifts, and it drifts silently: Angular 21.2 wants
    `^20.19.0 || ^22.12.0 || >=24.0.0` and Angular 22 wants `^22.22.3 || ^24.15.0 || >=26.0.0`, so a
    check written against one of those quietly passes an unsupported Node after an upgrade. Falling back
    to `package.json`'s own `engines` covers the case where node_modules is not installed yet — which is
    exactly when somebody most wants to be told their Node is wrong.
  */
  let required;
  try {
    required = require('@angular/core/package.json').engines?.node;
  } catch {
    required = JSON.parse(readFileSync(join(ROOT, 'package.json'), 'utf8')).engines?.node;
  }

  if (!required) {
    warn('cannot tell which Node versions are supported', 'Neither @angular/core nor package.json declares one.');
  } else if (satisfiesAny(process.versions.node, required)) {
    ok('Node', `${process.versions.node} — supported (${required})`);
  } else {
    fail(
      `Node ${process.versions.node} is not supported by this Angular`,
      `It needs ${required}. Install one of those and run: npm ci`,
    );
  }
}

/**
 * Does a version satisfy an `||`-separated list of `^x.y.z` / `>=x.y.z` ranges?
 *
 * Hand-rolled rather than pulling in semver, because this script must run before `npm ci` has put
 * anything in `node_modules` — a diagnostic that needs its own dependencies installed cannot diagnose a
 * failed install. Only the two forms Angular actually publishes are handled, and anything else is
 * reported as unknown rather than guessed at.
 */
function satisfiesAny(version, ranges) {
  const [major, minor, patch] = version.split('.').map(Number);
  return ranges.split('||').some((raw) => {
    const range = raw.trim();
    const parts = range.replace(/^[\^>=]+/, '').split('.').map(Number);
    const [wantMajor, wantMinor = 0, wantPatch = 0] = parts;
    if (range.startsWith('^')) {
      if (major !== wantMajor) return false;
      if (minor !== wantMinor) return minor > wantMinor;
      return patch >= wantPatch;
    }
    if (range.startsWith('>=')) {
      if (major !== wantMajor) return major > wantMajor;
      if (minor !== wantMinor) return minor > wantMinor;
      return patch >= wantPatch;
    }
    return false;
  });
}

// ── dependencies ────────────────────────────────────────────────────────────
process.stdout.write('\nDependencies\n');
{
  if (!existsSync(join(ROOT, 'node_modules'))) {
    fail('node_modules is missing', REINSTALL);
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

    /*
      What the manifest *asks for*, not only what is installed.

      These are different problems with the same symptom. A declared `^20` means this checkout is not the
      one that expects Angular 21 — a stray project, or a merge that lost the bump — and no amount of
      reinstalling will fix it. A declared `^21` with a 20 on disk is a stale tree, which `npm ci` fixes.
      Telling somebody to reinstall when the manifest is the problem sends them round a loop.
    */
    const manifest = JSON.parse(readFileSync(join(ROOT, 'package.json'), 'utf8'));
    const declaredBuild = manifest.devDependencies?.['@angular/build'] ?? manifest.dependencies?.['@angular/build'];
    const declaredMajor = declaredBuild?.match(/(\d+)/)?.[1];

    if (!core) {
      fail('@angular/core is not installed', REINSTALL);
    } else if (declaredMajor && declaredMajor !== core.split('.')[0]) {
      fail(
        `package.json asks for @angular/build ${declaredBuild}, but @angular/core is ${core}`,
        'This checkout is not the one that expects Angular ' +
          `${core.split('.')[0]} — reinstalling will not change it. Check you are in the right directory ` +
          'and on the right branch: git remote -v ; git log --oneline -1',
      );
    } else if (wrong.length) {
      fail(
        `Angular packages disagree: core is ${core}, but ${wrong
          .map(([name, version]) => `${name} is ${version}`)
          .join(', ')}`,
        `A part-installed tree — npm install can leave one half-updated. ${REINSTALL}` +
          ' (npm ci deletes node_modules and installs exactly the lockfile)',
      );
    } else {
      ok('Angular', `${core} — core, build, cli and compiler all agree`);
    }

    // The dependency most recently added, so the one most likely to be missing from an older install.
    const driver = installed('mssql');
    if (driver) ok('mssql driver', driver);
    else fail('the mssql driver is not installed', REINSTALL);

    /*
      A global Angular CLI shadowing the local one produces the same version error, from a completely
      different cause, so it is worth naming separately.
    */
    try {
      const { stdout } = await npm(['ls', '-g', '--depth', '0', '@angular/cli', '--json']);
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
    if (!hasRotate) fail('this checkout pre-dates the credential store', `git pull, then. ${REINSTALL}`);
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
