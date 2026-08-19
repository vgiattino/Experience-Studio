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

import type { ExperienceDefinition, ProvenanceOrigin } from '@opus/contracts';

import { DATA_ROOT, PATHS } from '../config';

export interface StoredExperience {
  id: string;
  definition: ExperienceDefinition;
  updatedAt: string;
  updatedBy: string;
  /**
   * Every provenance the contract allows, plus `seed`.
   *
   * Derived from the contract rather than restated, because a restated copy is a copy that drifts —
   * this one had already lost `import`, `migration` and `copy`, so a record saved from an imported
   * definition carried an origin this type declared impossible. `seed` is added here and not in the
   * contract because being seeded is a fact about the store, not about the definition.
   */
  origin: ProvenanceOrigin | 'seed';
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
  /**
   * Who answers for it. Absent on a seeded artifact, and that is not an oversight — a baseline the
   * product ships has no individual owner until somebody adopts it by saving it, at which point
   * `ownerFor` assigns one.
   */
  owner?: string;
  /**
   * Which Opus product it belongs to — FR-12's and FR-28's product filter.
   *
   * Read from the definition rather than recomputed here, because the route derives it on save from the
   * entities the experience reads and the store has no catalog to derive it from. Absent means one of
   * three things the route distinguishes and this field cannot: nothing claims what it reads, it spans
   * two products, or it was saved before any catalog was promoted.
   */
  product?: string;
  prompt?: string;
  tags: readonly string[];
}

const VERSIONS = 'versions';

/**
 * Where the store writes, resolved per call rather than at module load.
 *
 * `PATHS` is computed once when `config.ts` is first imported, which is fine for a running server and
 * wrong for anything that needs to point the store somewhere else afterwards — an operator moving the
 * data directory, and a test wanting a real filesystem it can throw away. `secret-store.ts` reads
 * `OPUS_SECRET_DIR` the same way and for the same reason.
 */
function dataDir(): string {
  return process.env['OPUS_DATA_DIR']?.trim() || DATA_ROOT;
}

function experiencesDir(): string {
  return join(dataDir(), 'experiences');
}

function auditPath(): string {
  return join(dataDir(), 'audit.log.jsonl');
}

function ensureDirs(): void {
  mkdirSync(experiencesDir(), { recursive: true });
  mkdirSync(join(experiencesDir(), VERSIONS), { recursive: true });
}

function fileFor(id: string): string {
  // Ids come from the client, so they are validated rather than trusted: an id containing a path
  // separator would write outside the store.
  if (!/^[a-z][a-z0-9]*(?:[-.][a-z0-9]+)*$/.test(id)) {
    throw Object.assign(new Error(`Invalid experience id "${id}"`), { status: 400 });
  }
  return join(experiencesDir(), `${id}.experience.json`);
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
  writeFileSync(auditPath(), line, { encoding: 'utf8', flag: 'a' });
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
  const files = readdirSync(experiencesDir()).filter((f) => f.endsWith('.experience.json'));
  const summaries = files.map((file) => {
    const record = JSON.parse(readFileSync(join(experiencesDir(), file), 'utf8')) as StoredExperience;
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
    // The catalog entry has to show who answers for this — it is the field a reuser checks before
    // extending somebody else's work, and the one owner-scoped analytics is keyed on.
    owner: d.owner?.userId,
    product: d.productId,
    prompt: d.version?.provenance?.generation?.prompt,
    tags: d.tags ?? [],
  };
}

export function get(id: string): StoredExperience | null {
  return read(id);
}

export interface SaveRequest {
  definition: ExperienceDefinition;
  /**
   * Who is saving — resolved from the caller's identity by the route, never taken from the body.
   *
   * It was optional and body-supplied, which meant it defaulted to `'anonymous'` and that a client
   * could claim to be anybody. Required now, and the route is the only thing that fills it, because an
   * audit trail whose actor is asserted by the party being audited is a log.
   */
  actorId: string;
  origin?: StoredExperience['origin'];
}

/**
 * Ownership across a save. Three cases, and the third is the one worth stating.
 *
 *   1. **No owner yet** — the saver becomes the owner. That covers both a new experience (FR-47's
 *      "defaults to the Studio Builder who created it") and an artifact written before ownership
 *      existed, which is backfilled the first time anybody touches it.
 *   2. **An owner, unchanged** — kept, with its original `assignedAt`/`assignedBy` intact. An ordinary
 *      edit by a collaborator must not silently make them the owner.
 *   3. **A different owner in the incoming definition** — a transfer, stamped with who did it and
 *      when. Deliberately not refused here: transfer is a legitimate act and the route is where the
 *      right to perform it belongs. What is refused is *un*assignment — a definition arriving with a
 *      blank `userId` keeps the owner it had rather than losing one.
 */
function ownerFor(
  incoming: ExperienceDefinition,
  previous: StoredExperience | null,
  actorId: string,
  now: string,
): NonNullable<ExperienceDefinition['owner']> {
  const held = previous?.definition.owner;
  const proposed = incoming.owner?.userId?.trim();

  if (!proposed) {
    return held ?? { userId: actorId, assignedAt: now, assignedBy: actorId };
  }
  if (held && held.userId === proposed) return held;
  return { userId: proposed, assignedAt: now, assignedBy: actorId };
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
      join(experiencesDir(), VERSIONS, `${definition.id}.v${v}.json`),
      `${JSON.stringify(previous, null, 2)}\n`,
      'utf8',
    );
  }

  const nextVersion = (previous?.definition.version?.artifactVersion ?? 0) + 1;
  const now = new Date().toISOString();
  const record: StoredExperience = {
    id: definition.id,
    definition: {
      ...definition,
      // Assigned here rather than trusted from the body, so no path through this function can store
      // an experience nobody answers for. See `ownerFor`.
      owner: ownerFor(definition, previous, request.actorId, now),
      version: { ...definition.version, artifactVersion: nextVersion },
    },
    updatedAt: now,
    updatedBy: request.actorId,
    origin: request.origin ?? definition.version?.provenance?.origin ?? 'human',
  };
  write(record);
  audit({
    event: 'save',
    id: record.id,
    artifactVersion: nextVersion,
    origin: record.origin,
    actorId: record.updatedBy,
    owner: record.definition.owner?.userId,
    // Only when it changed. A field that repeats the owner on every save buries the one save that
    // moved it, which is the save anybody auditing ownership is looking for.
    ...(previous?.definition.owner?.userId !== record.definition.owner?.userId
      ? { ownerChangedFrom: previous?.definition.owner?.userId ?? null }
      : {}),
    correlationId: definition.version?.provenance?.generation?.correlationId,
  });
  return record;
}

/**
 * Persist a lifecycle transition.
 *
 * ── WHY THIS IS NOT `save` ──────────────────────────────────────────────────────────────
 * Three of `save`'s behaviours are right for an edit and wrong for a transition:
 *
 *   1. **It increments `artifactVersion`.** Approving something must not produce a new version of it —
 *      the whole value of an approval is that it attaches to the exact version reviewed.
 *   2. **It refuses a published record.** Publishing has to write the record that marks it published,
 *      so the refusal would block the transition that creates the state it guards.
 *   3. **It archives the previous body under `versions/`.** A transition changes only the governance
 *      stamp, and since the version number does not move, three transitions would write three files
 *      with the same name — leaving one snapshot where the caller might reasonably expect three. The
 *      transition history is already kept twice over: accumulated in `governance` on the artifact, and
 *      per-event in the audit log.
 *
 * Legality is not re-checked here. `applyTransition` owns the transition table and has already refused
 * anything illegal, and a second copy of that table in the store is a second copy that drifts.
 */
export function saveTransition(request: {
  id: string;
  version: ExperienceDefinition['version'];
  actorId: string;
  transition: string;
}): StoredExperience {
  const previous = read(request.id);
  if (!previous) {
    throw Object.assign(new Error(`No experience "${request.id}"`), { status: 404 });
  }

  const record: StoredExperience = {
    ...previous,
    definition: { ...previous.definition, version: request.version },
    updatedAt: new Date().toISOString(),
    updatedBy: request.actorId,
  };
  write(record);
  audit({
    event: 'transition',
    id: record.id,
    transition: request.transition,
    // The state moved from and to, so the log reads as a chain rather than as a set of snapshots.
    from: previous.definition.version?.lifecycleState ?? 'draft',
    to: request.version?.lifecycleState,
    artifactVersion: request.version?.artifactVersion,
    actorId: request.actorId,
    owner: record.definition.owner?.userId,
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
    join(experiencesDir(), VERSIONS, `${id}.v${v}.deleted.json`),
    `${JSON.stringify(record, null, 2)}\n`,
    'utf8',
  );
  copyFileSync(fileFor(id), join(experiencesDir(), VERSIONS, `${id}.last.json`));
  rmSync(fileFor(id));
  audit({ event: 'delete', id });
  return true;
}
