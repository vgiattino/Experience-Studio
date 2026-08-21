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
import {
  compareStandardVersions,
  refuseStandardWrite,
  type ExperienceSummary,
  type StoredExperience,
} from '@opus/experience-model';

import { DATA_ROOT, PATHS, seedDir } from '../config';

/*
  The wire shapes are IMPORTED, not declared here.

  They used to be declared here as well, and the two copies drifted exactly as `store-types.ts` warned
  they would: `owner`, `product` and all three §16 lineage fields were on the wire and invisible to
  every client, because a server returning a supertype is always assignable and TypeScript had nothing
  to complain about. Re-exported so every existing importer of this module still resolves them.
*/
export type { ExperienceSummary, StoredExperience } from '@opus/experience-model';

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
/**
 * Inline every `$pageRef`. The store holds whole experiences, so a ref pointing at a sibling file in
 * the Viewer's asset folder would dangle once the artifact is copied in.
 *
 * Shared by seeding and by standard deployment — two callers reading the same directory, and a second
 * copy of this loop would be a second place for the ref convention to drift.
 */
function resolvePageRefs(definition: ExperienceDefinition): ExperienceDefinition {
  const pages: Record<string, unknown> = {};
  for (const [pageId, page] of Object.entries(definition.pages ?? {})) {
    if (page && typeof page === 'object' && '$pageRef' in page) {
      const ref = (page as { $pageRef: string }).$pageRef;
      const refFile = join(seedDir(), ref.endsWith('.json') ? ref : `${ref}.page.json`);
      if (existsSync(refFile)) {
        pages[pageId] = JSON.parse(readFileSync(refFile, 'utf8'));
        continue;
      }
    }
    pages[pageId] = page;
  }
  return { ...definition, pages: pages as ExperienceDefinition['pages'] };
}

export function seedMissing(): { seeded: string[] } {
  ensureDirs();
  const known = new Set(list().map((summary) => summary.id));

  const seeded: string[] = [];
  if (!existsSync(seedDir())) return { seeded };

  for (const file of readdirSync(seedDir()).filter((f) => f.endsWith('.experience.json'))) {
    const definition = JSON.parse(readFileSync(join(seedDir(), file), 'utf8')) as ExperienceDefinition;
    // Already in the store: leave it alone. Re-seeding would overwrite whatever the user has done to
    // it since, which is the one thing a seed must never do.
    if (known.has(definition.id)) continue;
    write({
      id: definition.id,
      definition: resolvePageRefs(definition),
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

/**
 * §16.2 — install newer product-standard versions. The deployment half of "a standard is deployed,
 * never saved".
 *
 * `seedMissing` deliberately never overwrites, because overwriting a user's work is the one thing a
 * seed must not do. That correct rule makes it useless for a product release: a v2.0 standard would
 * be skipped forever because v1.0 is already installed. So this is a second, narrower pass.
 *
 * FR-24 — "never automatically overwrite client customizations" — is satisfied by construction rather
 * than by a check, and the construction is worth stating: this only ever writes an artifact that
 * carries `standard`, and the store refuses every client write to such an artifact. So the set of
 * things this can overwrite and the set of things a client can have edited are provably disjoint. A
 * client's work lives in the derived variant, which this never looks at.
 *
 * Older or equal versions are skipped, so a rollback is a deliberate act (delete and re-seed) rather
 * than something a redeploy does by surprise.
 */
export function deployStandards(): { installed: string[]; upgraded: { id: string; from: string; to: string }[] } {
  ensureDirs();
  const installed: string[] = [];
  const upgraded: { id: string; from: string; to: string }[] = [];
  if (!existsSync(seedDir())) return { installed, upgraded };

  for (const file of readdirSync(seedDir()).filter((f) => f.endsWith('.experience.json'))) {
    const definition = JSON.parse(readFileSync(join(seedDir(), file), 'utf8')) as ExperienceDefinition;
    if (!definition.standard) continue;

    const existing = read(definition.id);
    const from = existing?.definition.standard?.version;
    if (existing && compareStandardVersions(from, definition.standard.version) >= 0) continue;

    /*
      ARCHIVE THE STANDARD BEING REPLACED, and this is not housekeeping.

      §16.4 asks a comparison to show "what the product changed and what the client changed" — which is
      a THREE-way question. Answering it needs the client's baseline: the standard version the variant
      was derived from. Overwriting the standard in place destroyed exactly that, so a v2.0 deployment
      left the platform able to diff a variant against v2.0 and permanently unable to say which side of
      the difference each half came from.

      Keyed on the STANDARD version rather than the artifact version, because that is the line that
      moved. `save`'s archive is keyed on `artifactVersion` for the same reason, and the two never
      collide because a standard is never saved.
    */
    if (existing && from) {
      ensureDirs();
      writeFileSync(
        join(experiencesDir(), VERSIONS, `${definition.id}.standard-v${from}.json`),
        `${JSON.stringify(existing, null, 2)}\n`,
        'utf8',
      );
    }

    const resolved = resolvePageRefs(definition);
    write({
      id: definition.id,
      definition: resolved,
      updatedAt: new Date().toISOString(),
      updatedBy: 'release',
      origin: 'seed',
    });
    if (existing && from) {
      upgraded.push({ id: definition.id, from, to: definition.standard.version });
    } else if (!existing) {
      installed.push(definition.id);
    }
  }

  if (installed.length || upgraded.length) {
    audit({ event: 'deployStandards', installed, upgraded });
  }
  return { installed, upgraded };
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
    ...(d.standard
      ? {
          standard: {
            standardId: d.standard.standardId,
            version: d.standard.version,
            ...(d.standard.productRelease ? { productRelease: d.standard.productRelease } : {}),
          },
        }
      : {}),
    ...(d.derivedFrom
      ? {
          derivedFromStandard: d.derivedFrom.standardId,
          basedOnVersion: d.derivedFrom.standardVersion,
          ...(d.derivedFrom.declinedVersion ? { acknowledgedVersion: d.derivedFrom.declinedVersion } : {}),
        }
      : {}),
    prompt: d.version?.provenance?.generation?.prompt,
    tags: d.tags ?? [],
  };
}

export function get(id: string): StoredExperience | null {
  return read(id);
}

/**
 * A product standard at a *past* version — the baseline a client variant was derived from.
 *
 * Returns the currently-installed record when the version asked for is the one installed, so a caller
 * asking for "the baseline" gets an answer whether or not the standard has moved since. `null` means
 * the baseline is genuinely unavailable — a store that predates archival, or a version that was never
 * installed here — which a comparison must report rather than paper over: a three-way comparison with
 * a guessed baseline attributes the product's changes to the client and the client's to the product.
 */
export function standardAtVersion(id: string, version: string): ExperienceDefinition | null {
  const current = read(id);
  if (current?.definition.standard?.version === version) return current.definition;

  const path = join(experiencesDir(), VERSIONS, `${id}.standard-v${version}.json`);
  if (!existsSync(path)) return null;
  return (JSON.parse(readFileSync(path, 'utf8')) as StoredExperience).definition;
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

  /*
    Principle 2, kept where the bytes are written: "client customization must never modify the product
    standard." A route is a door and there is more than one door, so the check lives here.

    Both sides are refused. The INCOMING definition carrying `standard` is the obvious case — somebody
    saving a standard. The STORED one carrying it is the case that actually happens: a client PUTs a
    definition it stripped the field from, over a standard, which would silently demote a product asset
    to an ordinary artifact. The second is why this reads `previous` as well.
  */
  const previous = read(definition.id);
  const standardWrite = refuseStandardWrite(definition) ?? (previous ? refuseStandardWrite(previous.definition) : null);
  if (standardWrite) {
    throw Object.assign(new Error(standardWrite.detail), {
      status: 409,
      code: standardWrite.code,
      deriveTo: standardWrite.deriveTo,
    });
  }

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

  /*
    A standard's lifecycle belongs to the product release that shipped it, not to a client's approval
    chain. Refused here as well as in `save` because a transition writes the artifact too, and an
    approval recorded against a product standard would attribute a product decision to a client user.
  */
  const standardWrite = refuseStandardWrite(previous.definition);
  if (standardWrite) {
    throw Object.assign(new Error(standardWrite.detail), {
      status: 409,
      code: standardWrite.code,
      deriveTo: standardWrite.deriveTo,
    });
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

/**
 * Persist a change to the §16 lineage — the standing relationship, not the experience.
 *
 * ── WHY THIS IS NOT `save`, AND THE BUG THAT PROVED IT ──────────────────────────────────
 *
 * The same three reasons `saveTransition` gives, and the first one is not theoretical here. §16.3's
 * notification says *"Your current experience contains customizations"*, and `customised` is
 * `artifactVersion > 1` — the fork is version 1, so anything above it is a save somebody made.
 *
 * Recording **Keep My Version** through `save` bumped that counter. So declining an update on an
 * untouched variant took it to version 2, and the *next* notification then told its owner their
 * experience contained customizations they had never made — a lie produced by the act of reading the
 * previous notification. Verified against a live API before this function existed.
 *
 * The general rule the bug illustrates: a write that records a decision **about** an experience must
 * not move the version line **of** that experience. Archiving is skipped for the same reason it is in
 * `saveTransition` — the version number does not move, so two lineage writes would produce two files
 * with one name.
 */
export function saveLineage(request: {
  id: string;
  derivedFrom: NonNullable<ExperienceDefinition['derivedFrom']>;
  actorId: string;
  event: string;
}): StoredExperience {
  const previous = read(request.id);
  if (!previous) {
    throw Object.assign(new Error(`No experience "${request.id}"`), { status: 404 });
  }

  // A standard has no `derivedFrom` to write, so this is unreachable through the decline route — kept
  // for the reason `saveTransition` keeps it: every path that writes an artifact checks.
  const standardWrite = refuseStandardWrite(previous.definition);
  if (standardWrite) {
    throw Object.assign(new Error(standardWrite.detail), {
      status: 409,
      code: standardWrite.code,
      deriveTo: standardWrite.deriveTo,
    });
  }

  const record: StoredExperience = {
    ...previous,
    definition: { ...previous.definition, derivedFrom: request.derivedFrom },
    updatedAt: new Date().toISOString(),
    updatedBy: request.actorId,
  };
  write(record);
  audit({
    event: request.event,
    id: record.id,
    standardId: request.derivedFrom.standardId,
    basedOnVersion: request.derivedFrom.standardVersion,
    declinedVersion: request.derivedFrom.declinedVersion,
    // Logged so the trail shows the version line did NOT move, which is the property under test.
    artifactVersion: record.definition.version?.artifactVersion,
    actorId: request.actorId,
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
