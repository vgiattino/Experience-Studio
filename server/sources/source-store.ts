/**
 * Where registrations, scans and promotions live.
 *
 * ── WHAT IS PERSISTED, AND WHAT IS NOT ──────────────────────────────────────────────────
 * Registrations and the *promoted* scan are written to disk. The draft under review is not: it is
 * derived from a scan by a pure function, so persisting it would create a second copy of something
 * that can be recomputed, and the two would disagree the first time inference improved.
 *
 * The promoted scan is the exception, and it is the whole reason this file writes anything at all.
 * Drift is a diff against the schema that was promoted, so that schema has to outlive the process —
 * otherwise a restart silently resets the baseline and the next re-scan reports "nothing changed"
 * about a database that changed.
 *
 * ── LOCAL JSON, DELIBERATELY ────────────────────────────────────────────────────────────
 * Same choice as the experience store, for the same reason: the shapes match a real repository closely
 * enough that PostgreSQL is a swap rather than a redesign, and nothing here pretends to be it. What it
 * does do is what a store must: write atomically (temp file, then rename) so a crash mid-write leaves
 * the previous state rather than half a JSON document.
 *
 * ── AND THE ONE THING IT REFUSES TO WRITE ───────────────────────────────────────────────
 * A secret. `SourceRegistration` holds `secretRef`, and the assertion in `save` is not defensive
 * decoration — this file writes to a path that ends up in a backup, so a check that the record has no
 * password field belongs at the moment of writing rather than in a code review.
 */

import { mkdirSync, readFileSync, readdirSync, renameSync, writeFileSync, existsSync, unlinkSync } from 'node:fs';
import { join } from 'node:path';

import type { PhysicalSchema, SourceRegistration } from '@opus/catalog-ingest';

import { PATHS } from '../config';

export interface StoredSource {
  registration: SourceRegistration;
  /** The scan that was promoted, kept as the baseline a re-scan is diffed against. */
  promotedSchema?: PhysicalSchema;
  promotedAt?: string;
  promotedBy?: string;
}

const DIR = PATHS.sources;

function ensureDir(): void {
  mkdirSync(DIR, { recursive: true });
}

function pathFor(id: string): string {
  /*
    The id is generated here, not supplied by a client — but it is used to build a path, so it is
    checked anyway. An id of `../catalog` is a file write outside the store if nobody looks.
  */
  if (!/^[A-Za-z0-9_-]{1,64}$/.test(id)) throw new Error(`"${id}" is not a source id.`);
  return join(DIR, `${id}.json`);
}

/** Write atomically: a crash mid-write leaves the previous file, not half of the new one. */
function writeAtomic(path: string, value: unknown): void {
  const temporary = `${path}.tmp`;
  writeFileSync(temporary, JSON.stringify(value, null, 2), 'utf8');
  renameSync(temporary, path);
}

export function list(): StoredSource[] {
  ensureDir();
  return readdirSync(DIR)
    .filter((name) => name.endsWith('.json'))
    .map((name) => JSON.parse(readFileSync(join(DIR, name), 'utf8')) as StoredSource)
    .sort((a, b) => a.registration.registeredAt.localeCompare(b.registration.registeredAt));
}

export function get(id: string): StoredSource | undefined {
  const path = pathFor(id);
  if (!existsSync(path)) return undefined;
  return JSON.parse(readFileSync(path, 'utf8')) as StoredSource;
}

export function save(source: StoredSource): StoredSource {
  ensureDir();

  /*
    The rule, asserted where the bytes are written.

    Not a type check — TypeScript already says `SourceRegistration` has no password field, and a value
    that arrived as JSON from an HTTP body does not respect that. So the record is inspected.
  */
  for (const [field, value] of Object.entries(source.registration)) {
    if (typeof value !== 'string') continue;
    if (/\b(password|pwd)\s*[:=]/i.test(value) || /^password$|^pwd$/i.test(field)) {
      throw new Error(
        `Refusing to store source ${source.registration.id}: "${field}" looks like a credential. Registrations hold the name of a secret, never a secret.`,
      );
    }
  }

  writeAtomic(pathFor(source.registration.id), source);
  return source;
}

export function remove(id: string): boolean {
  const path = pathFor(id);
  if (!existsSync(path)) return false;
  unlinkSync(path);
  return true;
}

/** The next id. Sequential and readable, because it appears in an audit trail a person reads. */
export function nextId(name: string): string {
  const slug =
    name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '')
      .slice(0, 40) || 'source';
  const taken = new Set(list().map((source) => source.registration.id));
  if (!taken.has(slug)) return slug;
  for (let suffix = 2; ; suffix++) {
    const candidate = `${slug}-${suffix}`;
    if (!taken.has(candidate)) return candidate;
  }
}
