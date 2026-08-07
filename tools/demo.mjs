#!/usr/bin/env node
/**
 * The API and the Studio together, with the sandbox's secret in the environment.
 *
 *   npm run demo
 *
 * ── WHY THIS EXISTS RATHER THAN A `concurrently` LINE ───────────────────────────────────
 * Because of the environment variable. A scan resolves a *named* secret, so the API has to be started
 * with `OPUS_SECRET_KV_EDM_SA` set — and a demo where that step is a sentence in a README is a demo
 * where the first scan fails with "no secret named kv/edm/sa is available to this process", which looks
 * like a bug in the product rather than a missing export.
 *
 * It also checks the sandbox is up before starting anything, and prints the click path. Both because
 * the failure it prevents is the same one: something obvious is missing, and the error message that
 * results points at the wrong thing.
 *
 * The secret is read from `EDM_SA_PASSWORD` if set, and otherwise from the sandbox's documented
 * development default — the same value `tools/edm-sandbox.mjs` gives the container. Nothing here writes
 * it anywhere: it goes into the API process's environment, the API hands it to the driver, and the
 * registration on disk holds only the name `kv/edm/sa`.
 */

import { spawn, execFile } from 'node:child_process';
import { promisify } from 'node:util';

const run = promisify(execFile);

const PASSWORD = process.env['EDM_SA_PASSWORD'] ?? 'Opus!Edm2026Scan';

/**
 * A development encryption key for the secret store: 32 bytes, base64.
 *
 * Fixed so that a password stored in one `npm run demo` still opens in the next — a key that changed
 * per run would make every stored credential undecryptable on restart, which looks exactly like a bug.
 * Overridden by `OPUS_SECRET_KEY` if the environment sets one.
 */
const DEV_ENCRYPTION_KEY = 'b3B1cy1leHBlcmllbmNlLXN0dWRpby1kZXYta2V5ISE=';
const PORT = process.env['EDM_PORT'] ?? '11433';
const API_PORT = process.env['PORT'] ?? '4000';
const STUDIO_PORT = '4300';

function say(message = '') {
  process.stdout.write(`${message}\n`);
}

/**
 * Is there a database to scan?
 *
 * A warning rather than a refusal. The Studio is useful without one — it falls back to the built-in
 * schema and says so — and somebody may be running this to look at the fallback deliberately.
 */
async function sandboxRunning() {
  try {
    const { stdout } = await run('docker', [
      'inspect', process.env['EDM_CONTAINER'] ?? 'opus-edm-sql', '--format', '{{.State.Status}}',
    ]);
    return stdout.trim() === 'running';
  } catch {
    return false;
  }
}

if (!(await sandboxRunning())) {
  say('No SQL Server sandbox is running, so the Sources screen will use its built-in schema and say so.');
  say('For a live scan, stop this and run:  npm run edm:up');
  say('');
}

say(`Starting the API on :${API_PORT} and the Studio on :${STUDIO_PORT}.`);
say('');
say(`  Studio          http://localhost:${STUDIO_PORT}/`);
say(`  API health      http://localhost:${API_PORT}/api/health`);
say('');
say('In the Studio: Catalog → Sources → Register a source');
say('');
say('  Host             localhost');
say(`  Port             ${PORT}`);
say('  Database         OpusEDM');
say('  Authentication   SQL login');
say('  Username         sa');
say('  Secret name      kv/edm/sa');
say('  Schemas          dq, master, processing, vendor');
say('  Trust an unverified certificate — tick it');
say('');
say('Then: Test the connection → Scan → expand an entity → Publish.');
say('');

const children = [];

function start(name, command, args, extraEnv = {}) {
  const child = spawn(command, args, {
    // `npm run` on Windows needs a shell; on POSIX this is inherited and harmless.
    shell: process.platform === 'win32',
    stdio: ['ignore', 'inherit', 'inherit'],
    env: { ...process.env, ...extraEnv },
  });
  child.on('exit', (code) => {
    if (code !== 0 && code !== null) say(`\n${name} exited with ${code}.`);
    stopAll();
  });
  children.push(child);
}

function stopAll() {
  for (const child of children) {
    if (!child.killed) child.kill('SIGTERM');
  }
}

process.on('SIGINT', () => {
  say('\nStopping.');
  stopAll();
  process.exit(0);
});

/*
  Two secrets go to the API, and they do different jobs.

  `OPUS_SECRET_KV_EDM_SA` is the sandbox's password under the name a registration can refer to — that is
  the "name a secret my deployment already holds" route working without a vault.

  `OPUS_SECRET_KEY` is the key the API encrypts *typed* passwords with. Without it the password field is
  not offered at all, which is correct but makes half the feature invisible in a demo. A fixed
  development key here is the same bargain as the sandbox password: a throwaway container, on loopback,
  with nothing real in it. A deployment supplies its own from its platform's secret manager.
*/
start('api', 'npm', ['run', 'api'], {
  OPUS_SECRET_KV_EDM_SA: PASSWORD,
  OPUS_SECRET_KEY: process.env['OPUS_SECRET_KEY'] ?? DEV_ENCRYPTION_KEY,
});
start('studio', 'npm', ['run', 'studio'], {});
