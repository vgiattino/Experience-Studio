/**
 * The prototype's Definition Service: experiences on local disk as JSON.
 *
 * Three properties of the real storage model are kept, because they are the ones that change how
 * calling code is written (architecture/backend-architecture.md §4.2):
 *
 *  1. **A save creates a new version.** `artifactVersion` increments and the previous body is kept
 *     under `versions/`. Nothing overwrites a saved state, which is what makes the version history
 *     and rollback in a later milestone a read rather than a reconstruction.
 *  2. **Published versions are immutable.** A save against a published version is refused, not
 *     silently applied — the same refusal a database trigger would give.
 *  3. **Every mutation is audited** with actor, origin and correlation id.
 *
 * What is deliberately NOT reproduced: transactions, optimistic concurrency via ETags, tenancy and
 * row-level security. Their absence is listed in docs/implementation-status.md rather than papered
 * over, because a prototype that pretends to have them teaches the wrong lesson about what is done.
 */

import {
  copyFileSync,
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { join } from 'node:path';

import type { ExperienceDefinition } from '@opus/contracts';

import { PATHS } from '../config';

export interface StoredExperience {
  id: string;
  definition: ExperienceDefinition;
  updatedAt: string;
  updatedBy: string;
  origin: 'human' | 'ai' | 'aiRefined' | 'template' | 'seed';
}

export interface ExperienceSummary {
  id: string;
  name: string;
  description?: string;
  kind?: string;
  pageCount: number;
  artifactVersion: number;
  lifecycleState: string;
  origin: string;
  updatedAt: string;
  prompt?: string;
  tags: readonly string[];
}

const VERSIONS = 'versions';

function ensureDirs(): void {
  mkdirSync(PATHS.experiences, { recursive: true });
  mkdirSync(join(PATHS.experiences, VERSIONS), { recursive: true });
}

function fileFor(id: string): string {
  // Ids come from the client, so they are validated rather than trusted: an id containing a path
  // separator would write outside the store.
  if (!/^[a-z][a-z0-9]*(?:[-.][a-z0-9]+)*$/.test(id)) {
    throw Object.assign(new Error(`Invalid experience id "${id}"`), { status: 400 });
  }
  return join(PATHS.experiences, `${id}.experience.json`);
}

function read(id: string): StoredExperience | null {
  const path = fileFor(id);
  if (!existsSync(path)) return null;
  return JSON.parse(readFileSync(path, 'utf8')) as StoredExperience;
}

function write(record: StoredExperience): void {
  ensureDirs();
  writeFileSync(fileFor(record.id), `${JSON.stringify(record, null, 2)}\n`, 'utf8');
}

function audit(entry: Record<string, unknown>): void {
  ensureDirs();
  const line = `${JSON.stringify({ at: new Date().toISOString(), ...entry })}\n`;
  writeFileSync(PATHS.audit, line, { encoding: 'utf8', flag: 'a' });
}

/**
 * Seed the store from the repository's shipped definitions.
 *
 * Additive rather than once-only: a shipped experience added after the store was created should still
 * appear, and an experience already present is never overwritten — a seed that clobbered a user's work
 * would be worse than no seed at all.
 *
 * The sample experience is a FILE, not code — the prototype's central rule. Seeding copies it in
 * rather than generating it, so what the app renders on first open is exactly what an author would
 * have saved.
 */
export function seedMissing(): { seeded: string[] } {
  ensureDirs();
  const known = new Set(list().map((summary) => summary.id));

  const seeded: string[] = [];
  if (!existsSync(PATHS.seed)) return { seeded };

  for (const file of readdirSync(PATHS.seed).filter((f) => f.endsWith('.experience.json'))) {
    const definition = JSON.parse(readFileSync(join(PATHS.seed, file), 'utf8')) as ExperienceDefinition;
    // Already in the store: leave it alone. Re-seeding would overwrite whatever the user has done to
    // it since, which is the one thing a seed must never do.
    if (known.has(definition.id)) continue;
    // Page refs are resolved at seed time: the store holds whole experiences, so a `$pageRef` that
    // pointed at a sibling file in the Viewer's asset folder would dangle here.
    const pages: Record<string, unknown> = {};
    for (const [pageId, page] of Object.entries(definition.pages ?? {})) {
      if (page && typeof page === 'object' && '$pageRef' in page) {
        const ref = (page as { $pageRef: string }).$pageRef;
        const refFile = join(PATHS.seed, ref.endsWith('.json') ? ref : `${ref}.page.json`);
        if (existsSync(refFile)) {
          pages[pageId] = JSON.parse(readFileSync(refFile, 'utf8'));
          continue;
        }
      }
      pages[pageId] = page;
    }

    write({
      id: definition.id,
      definition: { ...definition, pages: pages as ExperienceDefinition['pages'] },
      updatedAt: new Date().toISOString(),
      updatedBy: 'seed',
      origin: 'seed',
    });
    seeded.push(definition.id);
  }

  // Loose page definitions are also offered, wrapped as single-page experiences, so every shipped
  // artifact is reachable in the new app rather than only those an experience happens to list.
  audit({ event: 'seed', ids: seeded });
  return { seeded };
}

export function list(): ExperienceSummary[] {
  ensureDirs();
  const files = readdirSync(PATHS.experiences).filter((f) => f.endsWith('.experience.json'));
  const summaries = files.map((file) => {
    const record = JSON.parse(readFileSync(join(PATHS.experiences, file), 'utf8')) as StoredExperience;
    return summarize(record);
  });
  return summaries.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
}

export function summarize(record: StoredExperience): ExperienceSummary {
  const d = record.definition;
  const name = typeof d.name === 'string' ? d.name : (d.name as { default: string })?.default ?? d.id;
  const description =
    typeof d.description === 'string'
      ? d.description
      : (d.description as { default?: string } | undefined)?.default;
  return {
    id: d.id,
    name,
    description,
    kind: d.kind,
    pageCount: Object.keys(d.pages ?? {}).length,
    artifactVersion: d.version?.artifactVersion ?? 1,
    lifecycleState: d.version?.lifecycleState ?? 'draft',
    origin: record.origin,
    updatedAt: record.updatedAt,
    prompt: d.version?.provenance?.generation?.prompt,
    tags: d.tags ?? [],
  };
}

export function get(id: string): StoredExperience | null {
  return read(id);
}

export interface SaveRequest {
  definition: ExperienceDefinition;
  actorId?: string;
  origin?: StoredExperience['origin'];
}

export function save(request: SaveRequest): StoredExperience {
  const { definition } = request;
  if (!definition?.id) {
    throw Object.assign(new Error('definition.id is required'), { status: 400 });
  }

  const previous = read(definition.id);

  if (previous && previous.definition.version?.lifecycleState === 'published') {
    // Immutability is a storage property, not a convention. Refusing here is what makes "the
    // version a reviewer approved is the version running" true of the prototype too.
    throw Object.assign(
      new Error(
        `Experience "${definition.id}" is published and immutable. Publishing a change means saving a new draft version.`,
      ),
      { status: 409 },
    );
  }

  if (previous) {
    // Append-only history: the superseded body is kept, so a later milestone gets diff and
    // restore for free rather than having to reconstruct them.
    ensureDirs();
    const v = previous.definition.version?.artifactVersion ?? 1;
    writeFileSync(
      join(PATHS.experiences, VERSIONS, `${definition.id}.v${v}.json`),
      `${JSON.stringify(previous, null, 2)}\n`,
      'utf8',
    );
  }

  const nextVersion = (previous?.definition.version?.artifactVersion ?? 0) + 1;
  const record: StoredExperience = {
    id: definition.id,
    definition: {
      ...definition,
      version: { ...definition.version, artifactVersion: nextVersion },
    },
    updatedAt: new Date().toISOString(),
    updatedBy: request.actorId ?? 'anonymous',
    origin: request.origin ?? definition.version?.provenance?.origin ?? 'human',
  };
  write(record);
  audit({
    event: 'save',
    id: record.id,
    artifactVersion: nextVersion,
    origin: record.origin,
    actorId: record.updatedBy,
    correlationId: definition.version?.provenance?.generation?.correlationId,
  });
  return record;
}

export function remove(id: string): boolean {
  const record = read(id);
  if (!record) return false;
  // A delete keeps the last body under versions/, for the same reason a save does.
  ensureDirs();
  const v = record.definition.version?.artifactVersion ?? 1;
  writeFileSync(
    join(PATHS.experiences, VERSIONS, `${id}.v${v}.deleted.json`),
    `${JSON.stringify(record, null, 2)}\n`,
    'utf8',
  );
  copyFileSync(fileFor(id), join(PATHS.experiences, VERSIONS, `${id}.last.json`));
  rmSync(fileFor(id));
  audit({ event: 'delete', id });
  return true;
}
