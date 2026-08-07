/**
 * Resolving a secret reference to a secret.
 *
 * ── THE POINT OF THE INDIRECTION ────────────────────────────────────────────────────────
 * A registration holds `secretRef` — a *name* — and this is the only code that turns a name into a
 * password. That is what makes a registration safe to store, log, diff, export and show to a
 * reviewer: none of those touch this file.
 *
 * ── WHAT THIS IMPLEMENTATION IS, AND IS NOT ─────────────────────────────────────────────
 * It reads from the environment, and from a file whose path the environment names. That is a real
 * mechanism — it is how a secret reaches a process under Kubernetes, Docker Compose or systemd, where
 * the platform mounts a secret and the process reads it — and it is deliberately not a vault client.
 *
 * A deployment with Key Vault, Secrets Manager or Vault replaces `resolveSecret` and nothing else
 * changes, because nothing else in this codebase knows what a password is. The `SECRET_SOURCES` table
 * below is the seam, in the same spirit as `SourceKind`: named from the first implementation rather
 * than after the second.
 *
 * ── AND THE THREE RULES IT KEEPS ────────────────────────────────────────────────────────
 *   · a resolved secret is returned and never cached, so rotating one takes effect on the next scan
 *     rather than on the next restart;
 *   · a missing secret is an error naming the *reference*, never a fallback to blank — an empty
 *     password is a login attempt, and a failed login attempt on a production account locks it out;
 *   · the reference is validated before it is used to build an environment key or a path, because a
 *     `secretRef` of `../../etc/shadow` is a file read if nobody checks.
 */

import { readFile } from 'node:fs/promises';
import { join, normalize } from 'node:path';

import { checkSecretRef } from '@opus/catalog-ingest';

/** Where the secret directory is mounted, when one is. */
const SECRET_DIR = process.env['SECRET_DIR'] ?? '';

/**
 * Turn a reference into an environment variable name.
 *
 * `kv/edm/reader` → `OPUS_SECRET_KV_EDM_READER`, which is a name a deployment can set without
 * knowing anything about this file.
 */
function envKey(reference: string): string {
  return `OPUS_SECRET_${reference.toUpperCase().replace(/[^A-Z0-9]+/g, '_')}`;
}

type SecretSource = { readonly name: string; read(reference: string): Promise<string | undefined> };

const SECRET_SOURCES: readonly SecretSource[] = [
  {
    name: 'the environment',
    async read(reference) {
      return process.env[envKey(reference)] || undefined;
    },
  },
  {
    name: 'the mounted secret directory',
    async read(reference) {
      if (!SECRET_DIR) return undefined;
      /*
        Joined and then checked to still be inside the directory.

        `checkSecretRef` already refuses a traversal, so this is the second of two independent checks
        rather than the only one. A path check that depends on a validator in another package being
        right is a path check that breaks when somebody relaxes that validator.
      */
      const path = normalize(join(SECRET_DIR, reference));
      if (!path.startsWith(normalize(SECRET_DIR))) return undefined;
      try {
        // Trimmed: a file written with `echo` has a trailing newline, and a password with a newline
        // on the end fails to authenticate in a way that looks like a wrong password.
        return (await readFile(path, 'utf8')).trim() || undefined;
      } catch {
        return undefined;
      }
    },
  },
];

export async function resolveSecret(reference: string | undefined): Promise<string> {
  if (!reference) {
    throw new Error('This source authenticates with a SQL login but names no secret.');
  }
  // The rule lives in the library, where it is tested. See `checkSecretRef`.
  const checked = checkSecretRef(reference);
  if (!checked.ok) throw new Error(checked.reason);

  for (const source of SECRET_SOURCES) {
    const value = await source.read(reference);
    if (value) return value;
  }

  // Names the reference and where it looked. Never falls back to an empty password.
  throw new Error(
    `No secret named "${reference}" is available to this process. Set ${envKey(reference)}, or mount it` +
      `${SECRET_DIR ? ` at ${join(SECRET_DIR, reference)}` : ' and set SECRET_DIR'}.`,
  );
}

/** Whether a reference resolves, without returning it. For a registration's pre-flight check. */
export async function secretIsAvailable(reference: string | undefined): Promise<boolean> {
  try {
    await resolveSecret(reference);
    return true;
  } catch {
    return false;
  }
}
