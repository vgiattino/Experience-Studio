/**
 * Writing a secret, for the flow where the steward types the password.
 *
 * ── WHY THIS IS SEPARATE FROM `secrets.ts` ──────────────────────────────────────────────
 * Reading and writing are different privileges. Every deployment needs the read path; only the ones
 * that let a steward type a password need the write path, and a deployment that has a vault should be
 * able to keep this file switched off entirely. Splitting them means the write capability is a thing
 * that is present or absent rather than a branch inside a function everything calls.
 *
 * ── ENCRYPTED AT REST, AND NO KEY MEANS NO WRITING ──────────────────────────────────────
 * A password typed into a form has to be kept somewhere the server can read it again on the next scan.
 * Plaintext on disk is not that place: `server/data` ends up in a backup, in a container image layer,
 * in whatever somebody rsyncs to look at a problem.
 *
 * So it is AES-256-GCM, with a key supplied by the deployment in `OPUS_SECRET_KEY`, and **if that key
 * is absent the write path does not exist**. It does not fall back to plaintext, and it does not invent
 * a key and store it next to the ciphertext — a key kept beside the data it protects is obfuscation
 * with a ceremony, and the honest thing is to say so and refuse. The error names the variable to set
 * and the alternative flow that needs no key at all.
 *
 * GCM rather than CBC because it authenticates: a ciphertext somebody edited fails to open rather than
 * decrypting to rubbish that then goes to a database as a password. Each secret gets its own random
 * nonce, stored beside it, which is what makes writing the same password twice produce different bytes.
 *
 * ── WHAT A REAL DEPLOYMENT DOES INSTEAD ─────────────────────────────────────────────────
 * Replaces `writeSecret` and `readManagedSecret` with its vault's client. Two functions, and nothing
 * else in the codebase knows what a password is.
 */

import { createCipheriv, createDecipheriv, randomBytes, timingSafeEqual } from 'node:crypto';
import { mkdirSync, readFileSync, renameSync, rmSync, writeFileSync, existsSync, chmodSync } from 'node:fs';
import { dirname, join } from 'node:path';

import { MANAGED_SECRET_PREFIX, checkSecretRef } from '@opus/catalog-ingest';

import { PATHS } from '../config';

/** AES-256-GCM: a 32-byte key, a 12-byte nonce, a 16-byte tag. */
const KEY_BYTES = 32;
const NONCE_BYTES = 12;

interface SealedSecret {
  /** The algorithm, recorded so a future change can be detected rather than misread. */
  alg: 'aes-256-gcm';
  nonce: string;
  tag: string;
  ciphertext: string;
  writtenAt: string;
  writtenBy: string;
}

/**
 * The key, or a stated reason there is none.
 *
 * Read on every call rather than cached, so rotating the key is a restart of nothing — and so a process
 * that started without one picks it up when the platform provides it.
 */
function key(): { ok: true; value: Buffer } | { ok: false; reason: string } {
  const configured = process.env['OPUS_SECRET_KEY']?.trim();
  if (!configured) {
    return {
      ok: false,
      reason:
        'This platform has no secret-encryption key, so it will not store a password. Set OPUS_SECRET_KEY to 32 random bytes, base64 encoded — `openssl rand -base64 32` — or register the source with the name of a secret your deployment already holds, which needs no key.',
    };
  }

  let decoded: Buffer;
  try {
    decoded = Buffer.from(configured, 'base64');
  } catch {
    return { ok: false, reason: 'OPUS_SECRET_KEY is not valid base64.' };
  }
  if (decoded.length !== KEY_BYTES) {
    return {
      ok: false,
      reason: `OPUS_SECRET_KEY decodes to ${decoded.length} bytes; AES-256 needs exactly ${KEY_BYTES}. Generate one with: openssl rand -base64 32`,
    };
  }
  return { ok: true, value: decoded };
}

/** Whether this process can store a typed password at all. The UI asks before offering the field. */
export function canStoreSecrets(): boolean {
  return key().ok;
}

/** Why not, for the message the UI shows in place of the field. */
export function storeUnavailableReason(): string | undefined {
  const resolved = key();
  return resolved.ok ? undefined : resolved.reason;
}

/**
 * Where a managed secret's file lives.
 *
 * The reference is validated by `checkSecretRef` and then flattened — `/` becomes `__` rather than
 * becoming a directory. Flattening removes a whole class of path problem instead of relying on the
 * validation upstream having been thorough: with no separators in the filename there is no traversal to
 * attempt, whatever the reference turned out to contain.
 */
function pathFor(reference: string): string {
  const checked = checkSecretRef(reference);
  if (!checked.ok) throw new Error(`Refusing to write a secret named "${reference}": ${checked.reason}`);
  if (!reference.startsWith(MANAGED_SECRET_PREFIX)) {
    throw new Error(
      `"${reference}" is not a secret this platform manages. Managed names begin with "${MANAGED_SECRET_PREFIX}".`,
    );
  }
  return join(PATHS.secrets, `${reference.replace(/[/]/g, '__')}.json`);
}

export function writeSecret(reference: string, value: string, writtenBy: string): void {
  const resolved = key();
  if (!resolved.ok) throw new Error(resolved.reason);
  if (!value) throw new Error('Refusing to store an empty secret.');

  const nonce = randomBytes(NONCE_BYTES);
  const cipher = createCipheriv('aes-256-gcm', resolved.value, nonce);
  const ciphertext = Buffer.concat([cipher.update(value, 'utf8'), cipher.final()]);

  const sealed: SealedSecret = {
    alg: 'aes-256-gcm',
    nonce: nonce.toString('base64'),
    tag: cipher.getAuthTag().toString('base64'),
    ciphertext: ciphertext.toString('base64'),
    writtenAt: new Date().toISOString(),
    writtenBy,
  };

  const path = pathFor(reference);
  mkdirSync(dirname(path), { recursive: true, mode: 0o700 });
  const temporary = `${path}.tmp`;
  // 0600 at creation, not after: a file created 0644 and then chmodded was readable in between.
  writeFileSync(temporary, JSON.stringify(sealed), { encoding: 'utf8', mode: 0o600 });
  renameSync(temporary, path);
  chmodSync(path, 0o600);
}

/** Read one back, or nothing. Never throws for "absent" — that is a normal answer. */
export function readManagedSecret(reference: string): string | undefined {
  const resolved = key();
  if (!resolved.ok) return undefined;

  let path: string;
  try {
    path = pathFor(reference);
  } catch {
    return undefined;
  }
  if (!existsSync(path)) return undefined;

  const sealed = JSON.parse(readFileSync(path, 'utf8')) as SealedSecret;
  if (sealed.alg !== 'aes-256-gcm') {
    throw new Error(`The secret "${reference}" was written with ${sealed.alg}, which this build cannot read.`);
  }

  const decipher = createDecipheriv('aes-256-gcm', resolved.value, Buffer.from(sealed.nonce, 'base64'));
  decipher.setAuthTag(Buffer.from(sealed.tag, 'base64'));
  try {
    return Buffer.concat([
      decipher.update(Buffer.from(sealed.ciphertext, 'base64')),
      decipher.final(),
    ]).toString('utf8');
  } catch {
    /*
      The tag did not verify. Two causes, one message, because from here they are the same event: the
      key changed, or the file was altered. Either way returning nothing would be worse than throwing —
      a silent "no secret" sends the operator to look at a registration when the problem is the key.
    */
    throw new Error(
      `The secret "${reference}" did not decrypt. Either OPUS_SECRET_KEY has changed since it was written, or the stored file was altered. Re-enter the password to replace it.`,
    );
  }
}

/**
 * Delete one — when a source is removed.
 *
 * Called on delete because otherwise removing a registration leaves its password on disk indefinitely,
 * belonging to nothing, with no screen that would ever mention it again.
 */
export function deleteSecret(reference: string): void {
  try {
    rmSync(pathFor(reference), { force: true });
  } catch {
    // A reference that cannot be turned into a path has no file to remove.
  }
}

/** Does a managed secret exist? Used to report a registration whose credential has gone missing. */
export function managedSecretExists(reference: string): boolean {
  try {
    return existsSync(pathFor(reference));
  } catch {
    return false;
  }
}

/**
 * Constant-time comparison, exported because the temptation to use `===` on secrets is perennial.
 *
 * Nothing in this file needs it today. It is here so that the first piece of code that does — a token
 * check, a webhook signature — finds it rather than reaching for the operator that leaks a length and
 * a prefix through timing.
 */
export function secretsEqual(a: string, b: string): boolean {
  const left = Buffer.from(a, 'utf8');
  const right = Buffer.from(b, 'utf8');
  if (left.length !== right.length) return false;
  return timingSafeEqual(left, right);
}
