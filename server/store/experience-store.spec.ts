/**
 * Ownership and actor attribution in the definition store.
 *
 * These exist because of a specific finding rather than for coverage. The PRD asks (NFR-10) for an
 * immutable record "sufficient to reconstruct why any published Experience looks the way it does",
 * and the store's actor arrived in the request body — defaulting to `'anonymous'` when omitted, and
 * when supplied, asserted by the party being audited. Meanwhile nothing recorded *ownership* at all,
 * which FR-47, FR-49, FR-51 and FR-54 all key on.
 *
 * So the invariant under test is narrow and load-bearing: **no path through `save` stores an
 * experience nobody answers for**, and the actor on the record is the one the route resolved.
 *
 * Tested against a real filesystem, not a mock. The store's whole substance is append-only versioning
 * and refusing to overwrite — properties a mock would assert about itself.
 */

import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import type { ExperienceDefinition } from '@opus/contracts';

let directory: string;

/**
 * A fresh store per test, pointed at by `OPUS_DATA_DIR`.
 *
 * The same approach `secret-store.spec.ts` uses and for the same reason: the Angular unit-test system
 * cannot `vi.mock` a relative import, and needing to was the signal that the directory should have
 * been configurable for operators in the first place.
 */
async function store(): Promise<typeof import('./experience-store')> {
  process.env['OPUS_DATA_DIR'] = directory;
  // A plain import: the store resolves its directory per call, so one module instance serves every
  // test and each still gets its own filesystem.
  return import('./experience-store');
}

function definition(overrides: Partial<ExperienceDefinition> = {}): ExperienceDefinition {
  return {
    schemaVersion: '1.0.0',
    id: 'owned-thing',
    name: 'Owned Thing',
    pages: {},
    version: { schemaVersion: '1.0.0', artifactVersion: 1, lifecycleState: 'draft' },
    ...overrides,
  } as ExperienceDefinition;
}

beforeEach(() => {
  directory = mkdtempSync(join(tmpdir(), 'opus-store-'));
});

afterEach(() => {
  delete process.env['OPUS_DATA_DIR'];
  rmSync(directory, { recursive: true, force: true });
});

describe('ownership', () => {
  it('assigns the saver as owner when an experience has none', async () => {
    const s = await store();
    const saved = s.save({ definition: definition(), actorId: 'ana@demo-tenant' });

    expect(saved.definition.owner?.userId).toBe('ana@demo-tenant');
    // Self-assigned at creation, which is what makes a later transfer visible as a difference.
    expect(saved.definition.owner?.assignedBy).toBe('ana@demo-tenant');
    expect(saved.definition.owner?.assignedAt).toBeTruthy();
  });

  it('does not make an editor the owner', async () => {
    /*
      The case FR-49 depends on: a co-editor saving somebody else's experience is an edit, not a
      takeover. Without this the first collaborator to press save would silently acquire it.
    */
    const s = await store();
    s.save({ definition: definition(), actorId: 'ana@demo-tenant' });
    const edited = s.save({ definition: definition({ name: 'Edited' }), actorId: 'sam@demo-tenant' });

    expect(edited.definition.owner?.userId).toBe('ana@demo-tenant');
    expect(edited.updatedBy).toBe('sam@demo-tenant');
  });

  it('keeps the original assignment stamp across an ordinary edit', async () => {
    const s = await store();
    const first = s.save({ definition: definition(), actorId: 'ana@demo-tenant' });
    const again = s.save({ definition: definition({ name: 'Edited' }), actorId: 'ana@demo-tenant' });

    // Re-stamping on every save would make "when did this become Ana's" unanswerable.
    expect(again.definition.owner?.assignedAt).toBe(first.definition.owner?.assignedAt);
  });

  it('records a transfer, with who performed it', async () => {
    const s = await store();
    s.save({ definition: definition(), actorId: 'ana@demo-tenant' });

    const transferred = s.save({
      definition: definition({ owner: { userId: 'sam@demo-tenant' } }),
      actorId: 'ana@demo-tenant',
    });

    expect(transferred.definition.owner?.userId).toBe('sam@demo-tenant');
    // The transfer is self-evidencing on the record: owner and assigner differ.
    expect(transferred.definition.owner?.assignedBy).toBe('ana@demo-tenant');
  });

  it('refuses to leave an experience unowned', async () => {
    /*
      FR-47: ownership "can be transferred but not left unassigned". A definition arriving with a blank
      owner keeps the one it had rather than losing it — the failure mode being an experience that
      nobody answers for, which no screen would ever show.
    */
    const s = await store();
    s.save({ definition: definition(), actorId: 'ana@demo-tenant' });

    const blanked = s.save({
      definition: definition({ owner: { userId: '   ' } }),
      actorId: 'sam@demo-tenant',
    });
    expect(blanked.definition.owner?.userId).toBe('ana@demo-tenant');

    const removed = s.save({ definition: definition({ owner: undefined }), actorId: 'sam@demo-tenant' });
    expect(removed.definition.owner?.userId).toBe('ana@demo-tenant');
  });

  it('backfills an owner onto an artifact written before ownership existed', async () => {
    const s = await store();
    // No owner field at all — every artifact in the store today.
    const saved = s.save({ definition: definition(), actorId: 'sam@demo-tenant' });
    expect(saved.definition.owner?.userId).toBe('sam@demo-tenant');
  });

  it('puts the owner on the catalog summary', async () => {
    // FR-12 lists owner among the fields a catalog entry must carry; it is what a reuser checks
    // before extending somebody else's work.
    const s = await store();
    s.save({ definition: definition(), actorId: 'ana@demo-tenant' });
    expect(s.list()[0]?.owner).toBe('ana@demo-tenant');
  });
});

describe('actor attribution', () => {
  it('records the actor the caller was resolved to, never "anonymous"', async () => {
    const s = await store();
    const saved = s.save({ definition: definition(), actorId: 'ana@demo-tenant' });
    expect(saved.updatedBy).toBe('ana@demo-tenant');
  });

  it('writes an audit line naming the actor and the owner', async () => {
    const s = await store();
    s.save({ definition: definition(), actorId: 'ana@demo-tenant' });

    const lines = readFileSync(join(directory, 'audit.log.jsonl'), 'utf8').trim().split('\n');
    const entry = JSON.parse(lines.at(-1)!) as Record<string, unknown>;
    expect(entry['actorId']).toBe('ana@demo-tenant');
    expect(entry['owner']).toBe('ana@demo-tenant');
  });

  it('marks the audit line only on the save that moved ownership', async () => {
    /*
      The reason this is conditional: an `ownerChangedFrom` on every line is noise that buries the one
      line somebody auditing a transfer is looking for.
    */
    const s = await store();
    s.save({ definition: definition(), actorId: 'ana@demo-tenant' });
    s.save({ definition: definition({ name: 'Edited' }), actorId: 'ana@demo-tenant' });
    s.save({
      definition: definition({ owner: { userId: 'sam@demo-tenant' } }),
      actorId: 'ana@demo-tenant',
    });

    const entries = readFileSync(join(directory, 'audit.log.jsonl'), 'utf8')
      .trim()
      .split('\n')
      .map((line) => JSON.parse(line) as Record<string, unknown>)
      .filter((entry) => entry['event'] === 'save');

    // Creation is a change from nothing; the ordinary edit is not a change at all.
    expect(entries[0]?.['ownerChangedFrom']).toBeNull();
    expect(entries[1]).not.toHaveProperty('ownerChangedFrom');
    expect(entries[2]?.['ownerChangedFrom']).toBe('ana@demo-tenant');
  });
});

describe('§16 — a standard is deployed, never saved', () => {
  /*
    Principle 2, at the layer that decides. `lineage.spec.ts` tests the rule as a function; what is
    only testable here is that no path through the STORE reaches a standard — the claim that matters,
    because a route is a door and there is more than one door.

    A release is a directory of shipped experiences, so these tests write one and point `OPUS_SEED_DIR`
    at it. That is the same door a real release uses, which is the point: testing the refusal against a
    standard installed by `save` would be testing a state that cannot occur.
  */
  let release: string;

  beforeEach(() => {
    release = mkdtempSync(join(tmpdir(), 'opus-release-'));
    process.env['OPUS_SEED_DIR'] = release;
  });

  afterEach(() => {
    delete process.env['OPUS_SEED_DIR'];
    rmSync(release, { recursive: true, force: true });
  });

  function ship(version: string, over: Partial<ExperienceDefinition> = {}): void {
    const shipped = definition({
      id: 'shipped-thing',
      name: `Shipped Thing v${version}`,
      standard: { standardId: 'shipped-thing', version, productRelease: `2026.0${version[0]}` },
      version: { schemaVersion: '1.0.0', artifactVersion: 1, lifecycleState: 'published' },
      ...over,
    } as Partial<ExperienceDefinition>);
    writeFileSync(join(release, 'shipped.experience.json'), JSON.stringify(shipped), 'utf8');
  }

  it('installs a standard nobody has yet', async () => {
    const s = await store();
    ship('1.0');
    expect(s.deployStandards()).toEqual({ installed: ['shipped-thing'], upgraded: [] });
    expect(s.get('shipped-thing')?.definition.standard?.version).toBe('1.0');
  });

  it('upgrades an installed standard when the release ships a newer one', async () => {
    const s = await store();
    ship('1.0');
    s.deployStandards();
    ship('2.0');
    expect(s.deployStandards()).toEqual({
      installed: [],
      upgraded: [{ id: 'shipped-thing', from: '1.0', to: '2.0' }],
    });
    expect(s.get('shipped-thing')?.definition.standard?.version).toBe('2.0');
  });

  it('does not reinstall the same version, so a redeploy is quiet', async () => {
    const s = await store();
    ship('1.0');
    s.deployStandards();
    expect(s.deployStandards()).toEqual({ installed: [], upgraded: [] });
  });

  it('does not downgrade, so a rollback stays a deliberate act', async () => {
    const s = await store();
    ship('2.0');
    s.deployStandards();
    ship('1.0');
    expect(s.deployStandards()).toEqual({ installed: [], upgraded: [] });
    expect(s.get('shipped-thing')?.definition.standard?.version).toBe('2.0');
  });

  it('ignores shipped experiences that are not standards', async () => {
    // `seedMissing` owns those, and it must never overwrite. Deploying them would do exactly that.
    const s = await store();
    writeFileSync(
      join(release, 'ordinary.experience.json'),
      JSON.stringify(definition({ id: 'ordinary-thing' })),
      'utf8',
    );
    expect(s.deployStandards()).toEqual({ installed: [], upgraded: [] });
  });

  it('FR-24 — a release never touches the client variant', async () => {
    /*
      The requirement, end to end and in the store. The client's customisation lives in the derived
      artifact, and a release only ever writes artifacts carrying `standard` — which the store refuses
      every client write to. So the set a release can overwrite and the set a client can have edited are
      provably disjoint, and this asserts it rather than trusting the argument.
    */
    const s = await store();
    ship('1.0');
    s.deployStandards();

    const variant = s.save({
      definition: definition({
        id: 'shipped-thing.client',
        name: 'Shipped Thing — Acme',
        derivedFrom: {
          standardId: 'shipped-thing',
          standardVersion: '1.0',
          derivedAt: '2026-08-19T12:00:00.000Z',
          derivedBy: 'ana@demo-tenant',
        },
      } as Partial<ExperienceDefinition>),
      actorId: 'ana@demo-tenant',
    });
    expect(variant.definition.owner?.userId).toBe('ana@demo-tenant');

    ship('2.0');
    s.deployStandards();

    const after = s.get('shipped-thing.client');
    expect(after?.definition.name).toBe('Shipped Thing — Acme');
    expect(after?.definition.derivedFrom?.standardVersion).toBe('1.0');
    expect(after?.definition.version.artifactVersion).toBe(1);
  });

  it('archives the standard it replaces, because §16.4 needs the baseline', async () => {
    /*
      The load-bearing half of FR-22, and it was missing. `deployStandards` overwrote the standard in
      place, so a v2.0 release destroyed the only artifact a three-way comparison can be correct
      against: the version the client variant was derived from. Without it the platform can diff a
      variant against v2.0 and can never say which side of the difference each half came from.

      Keyed on the STANDARD version, not the artifact version, because that is the line that moved.
    */
    const s = await store();
    ship('1.0');
    s.deployStandards();
    ship('2.0');
    s.deployStandards();

    const baseline = s.standardAtVersion('shipped-thing', '1.0');
    expect(baseline?.standard?.version).toBe('1.0');
    expect(baseline?.name).toBe('Shipped Thing v1.0');
    // And the installed one moved on, so the two are genuinely different artifacts.
    expect(s.get('shipped-thing')?.definition.standard?.version).toBe('2.0');
  });

  it('answers for the CURRENTLY installed version without needing an archive', async () => {
    // A variant derived from the version still installed has a baseline too, and asking for it must not
    // depend on a release having happened since.
    const s = await store();
    ship('1.0');
    s.deployStandards();
    expect(s.standardAtVersion('shipped-thing', '1.0')?.standard?.version).toBe('1.0');
  });

  it('reports a missing baseline as missing rather than substituting the current one', async () => {
    /*
      The refusal `compareWithStandard` turns into `baselineUnavailable`. Returning the installed
      standard here would produce a comparison that looked complete and attributed the product's
      changes to the client — confidently, in a screen somebody acts on.
    */
    const s = await store();
    ship('2.0');
    s.deployStandards();
    expect(s.standardAtVersion('shipped-thing', '1.0')).toBeNull();
  });

  it('does not archive on a first install, because there is nothing being replaced', async () => {
    const s = await store();
    ship('1.0');
    s.deployStandards();
    expect(s.standardAtVersion('shipped-thing', '0.9')).toBeNull();
  });

  it('refuses a save of a standard, and names the derive target', async () => {
    const s = await store();
    ship('1.0');
    s.deployStandards();
    const installed = s.get('shipped-thing')!.definition;

    let thrown: unknown;
    try {
      s.save({ definition: { ...installed, name: 'Taken over' }, actorId: 'ana@demo-tenant' });
    } catch (error) {
      thrown = error;
    }
    expect((thrown as { status?: number })?.status).toBe(409);
    expect((thrown as { code?: string })?.code).toBe('standardNotEditable');
    // A refusal that does not name the alternative makes the caller reimplement `derivedIdFor`.
    expect((thrown as { deriveTo?: string })?.deriveTo).toBe('shipped-thing.client');
  });

  it('refuses a save over an installed standard even when the incoming copy hides the marker', async () => {
    /*
      The case that actually happens, and the reason `save` reads the STORED definition as well as the
      incoming one: a client PUTs a body it stripped `standard` from. Checking only the request would
      let that through and silently demote a product asset to an ordinary artifact — after which
      nothing would stop the next save either.
    */
    const s = await store();
    ship('1.0');
    s.deployStandards();

    const stripped = { ...s.get('shipped-thing')!.definition } as Record<string, unknown>;
    delete stripped['standard'];

    expect(() =>
      s.save({ definition: stripped as unknown as ExperienceDefinition, actorId: 'ana@demo-tenant' }),
    ).toThrow(/product-standard/);
    // And the marker is still there afterwards.
    expect(s.get('shipped-thing')?.definition.standard?.version).toBe('1.0');
  });

  it('refuses a lifecycle transition against a standard', async () => {
    // An approval recorded against a product standard attributes a product decision to a client user.
    const s = await store();
    ship('1.0');
    s.deployStandards();

    let thrown: unknown;
    try {
      s.saveTransition({
        id: 'shipped-thing',
        version: { schemaVersion: '1.0.0', artifactVersion: 1, lifecycleState: 'inReview' } as never,
        actorId: 'sam@demo-tenant',
        transition: 'submit',
      });
    } catch (error) {
      thrown = error;
    }
    expect((thrown as { code?: string })?.code).toBe('standardNotEditable');
  });

  it('permits a save of a client variant of a standard', async () => {
    // The whole point: the variant is the writable thing.
    const s = await store();
    ship('1.0');
    s.deployStandards();
    expect(() =>
      s.save({
        definition: definition({
          id: 'shipped-thing.client',
          derivedFrom: {
            standardId: 'shipped-thing',
            standardVersion: '1.0',
            derivedAt: '2026-08-19T12:00:00.000Z',
            derivedBy: 'ana@demo-tenant',
          },
        } as Partial<ExperienceDefinition>),
        actorId: 'ana@demo-tenant',
      }),
    ).not.toThrow();
  });
});

describe('§16.3 — recording a decision must not author the experience', () => {
  /*
    The defect this exists to prevent, found against a live API rather than here.

    §16.3's notification says "Your current experience contains customizations", and `customised` is
    `artifactVersion > 1` — the fork is version 1, so anything above it is a save somebody made.
    Recording **Keep My Version** through `save()` bumped that counter, so declining an update on an
    untouched variant took it to version 2 and the NEXT notification told its owner about
    customizations they had never made. Reading one notification made the following one untrue.
  */
  const lineage = {
    standardId: 'shipped-thing',
    standardVersion: '1.0',
    derivedAt: '2026-08-19T12:00:00.000Z',
    derivedBy: 'ana@demo-tenant',
  };

  async function variant(): Promise<typeof import('./experience-store')> {
    const s = await store();
    s.save({
      definition: definition({
        id: 'shipped-thing.client',
        name: 'Shipped Thing — Acme',
        derivedFrom: lineage,
      } as Partial<ExperienceDefinition>),
      actorId: 'ana@demo-tenant',
    });
    return s;
  }

  it('leaves the client version line exactly where it was', async () => {
    const s = await variant();
    expect(s.get('shipped-thing.client')?.definition.version.artifactVersion).toBe(1);

    s.saveLineage({
      id: 'shipped-thing.client',
      derivedFrom: { ...lineage, declinedVersion: '2.0', declinedBy: 'ana@demo-tenant', declinedAt: 'now' },
      actorId: 'ana@demo-tenant',
      event: 'declineStandardUpdate',
    });

    // The property the bug violated. Anything other than 1 here and §16.3 starts lying.
    expect(s.get('shipped-thing.client')?.definition.version.artifactVersion).toBe(1);
    expect(s.get('shipped-thing.client')?.definition.derivedFrom?.declinedVersion).toBe('2.0');
  });

  it('does not touch anything else about the experience', async () => {
    // A lineage write is not a definition write: it replaces `derivedFrom` and nothing more.
    const s = await variant();
    const before = s.get('shipped-thing.client')!.definition;

    s.saveLineage({
      id: 'shipped-thing.client',
      derivedFrom: { ...lineage, declinedVersion: '2.0' },
      actorId: 'someone-else@demo-tenant',
      event: 'declineStandardUpdate',
    });

    const after = s.get('shipped-thing.client')!.definition;
    expect(after.name).toBe(before.name);
    expect(after.pages).toEqual(before.pages);
    // Ownership survives: recording a decision is not adopting the artifact.
    expect(after.owner?.userId).toBe('ana@demo-tenant');
  });

  it('keeps the baseline, because §16.4 needs it to say what changed', async () => {
    /*
      The one-line implementation of "stop telling me" is to write the declined version into
      `standardVersion`. `lineage.spec.ts` proves the pure function does not; this proves the stored
      artifact does not either.
    */
    const s = await variant();
    s.saveLineage({
      id: 'shipped-thing.client',
      derivedFrom: { ...lineage, declinedVersion: '2.0' },
      actorId: 'ana@demo-tenant',
      event: 'declineStandardUpdate',
    });
    expect(s.get('shipped-thing.client')?.definition.derivedFrom?.standardVersion).toBe('1.0');
  });

  it('records who and what in the audit log, including that the version did not move', async () => {
    const s = await variant();
    s.saveLineage({
      id: 'shipped-thing.client',
      derivedFrom: { ...lineage, declinedVersion: '2.0' },
      actorId: 'ana@demo-tenant',
      event: 'declineStandardUpdate',
    });
    const log = readFileSync(join(directory, 'audit.log.jsonl'), 'utf8')
      .trim()
      .split('\n')
      .map((line) => JSON.parse(line) as Record<string, unknown>);
    const entry = log.find((e) => e['event'] === 'declineStandardUpdate');
    expect(entry).toMatchObject({
      id: 'shipped-thing.client',
      declinedVersion: '2.0',
      artifactVersion: 1,
      actorId: 'ana@demo-tenant',
    });
  });

  it('refuses on an id that does not exist', async () => {
    const s = await variant();
    expect(() =>
      s.saveLineage({
        id: 'no-such-thing',
        derivedFrom: lineage,
        actorId: 'ana@demo-tenant',
        event: 'declineStandardUpdate',
      }),
    ).toThrow(/No experience/);
  });
});
