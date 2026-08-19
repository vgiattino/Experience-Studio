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

import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
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
