/**
 * The secret store — the first server-side test in this repository.
 *
 * It goes first because it is the code where a mistake is worst. Everything else in `server/` produces
 * a wrong answer when it breaks; this holds somebody's production database password, and its failure
 * modes are "written in the clear", "readable by anyone" and "cannot be read back after a restart" —
 * none of which a screen would ever show.
 *
 * `angular.json` and `tsconfig.spec.json` now include `server/**` so specs here run with the rest.
 */

import { existsSync, mkdtempSync, readFileSync, rmSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { managedSecretRefFor } from '@opus/catalog-ingest';

/**
 * A fresh directory per test, pointed at by `OPUS_SECRET_DIR`.
 *
 * No module mocking: the Angular unit-test system does not support `vi.mock` on relative imports, and
 * needing it was a sign the directory should have been configurable in the first place — a deployment
 * wants the encrypted files on a mounted volume with its own backup policy, not inside the application
 * directory. So the test uses the same override an operator would.
 */
let directory: string;

async function store(environment: Record<string, string | undefined> = {}) {
  for (const [key, value] of Object.entries(environment)) {
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
  process.env['OPUS_SECRET_DIR'] = directory;
  return import('./secret-store');
}

const REFERENCE = managedSecretRefFor('edm-prod');

beforeEach(() => {
  directory = mkdtempSync(join(tmpdir(), 'opus-secret-test-'));
  delete process.env['OPUS_SECRET_KEY'];
  delete process.env['OPUS_ENV'];
});

afterEach(() => {
  rmSync(directory, { recursive: true, force: true });
  delete process.env['OPUS_SECRET_KEY'];
  delete process.env['OPUS_ENV'];
  delete process.env['OPUS_SECRET_DIR'];
});

const KEY = Buffer.alloc(32, 7).toString('base64');

describe('storing a password', () => {
  it('round-trips it, and never writes it in the clear', async () => {
    const secrets = await store({ OPUS_SECRET_KEY: KEY });
    secrets.writeSecret(REFERENCE, 'Sup3r!Secret', 'Sam Steward');

    expect(secrets.readManagedSecret(REFERENCE)).toBe('Sup3r!Secret');

    // The file is the real assertion: ciphertext, a nonce, a tag, and no password.
    const [file] = [REFERENCE].map((reference) =>
      join(directory, `${reference.replace(/[/]/g, '__')}.json`),
    );
    const raw = readFileSync(file!, 'utf8');
    expect(raw).not.toContain('Sup3r!Secret');
    expect(JSON.parse(raw)).toMatchObject({ alg: 'aes-256-gcm', writtenBy: 'Sam Steward' });
  });

  it('writes it readable only by its owner', async () => {
    const secrets = await store({ OPUS_SECRET_KEY: KEY });
    secrets.writeSecret(REFERENCE, 'p', 'steward');

    const file = join(directory, `${REFERENCE.replace(/[/]/g, '__')}.json`);
    // 0600. Created that way rather than chmodded afterwards — a file created 0644 is readable in between.
    expect(statSync(file).mode & 0o777).toBe(0o600);
  });

  it('produces different bytes for the same password twice', async () => {
    const secrets = await store({ OPUS_SECRET_KEY: KEY });
    const file = join(directory, `${REFERENCE.replace(/[/]/g, '__')}.json`);

    secrets.writeSecret(REFERENCE, 'same', 'steward');
    const first = readFileSync(file, 'utf8');
    secrets.writeSecret(REFERENCE, 'same', 'steward');

    // A fresh nonce each time. Identical ciphertext would tell a reader two sources share a password.
    expect(readFileSync(file, 'utf8')).not.toBe(first);
    expect(secrets.readManagedSecret(REFERENCE)).toBe('same');
  });

  it('refuses an empty secret rather than storing one', async () => {
    const secrets = await store({ OPUS_SECRET_KEY: KEY });
    expect(() => secrets.writeSecret(REFERENCE, '', 'steward')).toThrow(/empty/i);
  });

  it('refuses to write outside its own namespace', async () => {
    const secrets = await store({ OPUS_SECRET_KEY: KEY });
    // Not this platform's to write, so not this platform's to overwrite.
    expect(() => secrets.writeSecret('kv/edm/reader', 'p', 'steward')).toThrow(/manages/);
    // And a reference that is not a name at all never becomes a path.
    expect(() => secrets.writeSecret('opus/sources/../../etc/shadow', 'p', 'steward')).toThrow();
  });

  it('deletes one, and reports it gone', async () => {
    const secrets = await store({ OPUS_SECRET_KEY: KEY });
    secrets.writeSecret(REFERENCE, 'p', 'steward');
    expect(secrets.managedSecretExists(REFERENCE)).toBe(true);

    secrets.deleteSecret(REFERENCE);
    expect(secrets.managedSecretExists(REFERENCE)).toBe(false);
    expect(secrets.readManagedSecret(REFERENCE)).toBeUndefined();
  });
});

describe('detecting tampering and a changed key', () => {
  it('refuses an edited ciphertext rather than decrypting it to rubbish', async () => {
    const secrets = await store({ OPUS_SECRET_KEY: KEY });
    secrets.writeSecret(REFERENCE, 'Sup3r!Secret', 'steward');

    const file = join(directory, `${REFERENCE.replace(/[/]/g, '__')}.json`);
    const sealed = JSON.parse(readFileSync(file, 'utf8')) as { ciphertext: string };
    // Flip the ciphertext. GCM authenticates, so this must fail rather than yield a wrong password —
    // a wrong password would be sent to a database and lock the account out.
    const tampered = Buffer.from(sealed.ciphertext, 'base64');
    tampered[0] ^= 0xff;
    const { writeFileSync } = await import('node:fs');
    writeFileSync(file, JSON.stringify({ ...sealed, ciphertext: tampered.toString('base64') }));

    expect(() => secrets.readManagedSecret(REFERENCE)).toThrow(/did not decrypt/);
  });

  it('says the key changed rather than reporting the secret missing', async () => {
    const first = await store({ OPUS_SECRET_KEY: KEY });
    first.writeSecret(REFERENCE, 'Sup3r!Secret', 'steward');

    const second = await store({ OPUS_SECRET_KEY: Buffer.alloc(32, 9).toString('base64') });
    // Returning "no secret" here would send an operator to look at a registration when the problem is
    // the key, so this throws with the cause and the fix.
    expect(() => second.readManagedSecret(REFERENCE)).toThrow(/OPUS_SECRET_KEY has changed/);
  });
});

describe('where the key comes from', () => {
  it('generates one in development, and keeps it', async () => {
    const secrets = await store();
    expect(secrets.canStoreSecrets()).toBe(true);
    secrets.writeSecret(REFERENCE, 'Sup3r!Secret', 'steward');

    const keyFile = join(directory, '.local-key');
    expect(existsSync(keyFile)).toBe(true);
    expect(statSync(keyFile).mode & 0o777).toBe(0o600);

    /*
      Reading it back must reuse the key on disk rather than making a new one. A key regenerated per
      process would leave every stored password undecryptable after a restart, which is
      indistinguishable from the platform being broken — and the file's mtime is the proof it was not
      rewritten.
    */
    const stamp = statSync(keyFile).mtimeMs;
    expect(secrets.readManagedSecret(REFERENCE)).toBe('Sup3r!Secret');
    expect(statSync(keyFile).mtimeMs).toBe(stamp);
  });

  it('refuses in production, naming the variable and the alternative', async () => {
    /*
      `OPUS_ENV` rather than `NODE_ENV`, and that is the finding rather than a workaround: bundlers
      replace `NODE_ENV` at build time, so the compiled module reads a literal and a runtime change has
      no effect. A security decision resting on it alone is one that stops being made the day something
      bundles the file, which is why the store checks both.
    */
    const secrets = await store({ OPUS_ENV: 'production' });

    expect(secrets.canStoreSecrets()).toBe(false);
    expect(secrets.storeUnavailableReason()).toMatch(/OPUS_SECRET_KEY/);
    // The other route needs no key, and the message has to say so or it is a dead end.
    expect(secrets.storeUnavailableReason()).toMatch(/name of a secret/);
    // No key file is written in production, so nothing is silently protected by a local key.
    expect(existsSync(join(directory, '.local-key'))).toBe(false);
  });

  it('prefers a configured key over the generated one', async () => {
    const secrets = await store();
    secrets.writeSecret(REFERENCE, 'written-with-local-key', 'steward');

    // The key is read per call, so setting one now is what a deployment supplying a key looks like —
    // and it must be used in preference to whatever a previous run left on disk.
    process.env['OPUS_SECRET_KEY'] = KEY;
    expect(() => secrets.readManagedSecret(REFERENCE)).toThrow(/did not decrypt/);
  });

  it('rejects a key of the wrong length rather than padding it', async () => {
    const secrets = await store({ OPUS_SECRET_KEY: Buffer.alloc(16, 1).toString('base64') });
    expect(secrets.canStoreSecrets()).toBe(false);
    expect(secrets.storeUnavailableReason()).toMatch(/needs exactly 32/);
  });
});

describe('comparing secrets', () => {
  it('is constant-time and length-safe', async () => {
    const secrets = await store({ OPUS_SECRET_KEY: KEY });
    expect(secrets.secretsEqual('abc', 'abc')).toBe(true);
    expect(secrets.secretsEqual('abc', 'abd')).toBe(false);
    // Different lengths must not throw, which is what `timingSafeEqual` does unguarded.
    expect(secrets.secretsEqual('abc', 'abcd')).toBe(false);
  });
});
