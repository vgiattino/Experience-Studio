/**
 * Product Standard ↔ Client Experience lineage (PRD §16).
 *
 * The refusals matter more than the successes, and one refusal matters more than the rest: **a save
 * must not reach a product standard.** Principle 2 says client customisation must never modify the
 * product standard, and every conversational verb this PRD asks for is a modification — so a gap here
 * is not a missing feature, it is a path by which the product's own baseline gets overwritten at speed.
 *
 * The other thing under test is the version arithmetic, because §16.6 asks for two independent version
 * lines against one page and the easy mistake is to compare the wrong pair. `standard.version` moves
 * with product releases; `version.artifactVersion` moves with saves. A test that passed while comparing
 * artifact versions would look right and answer "is an update available" wrongly forever.
 */

import { describe, expect, it } from 'vitest';
import type { ExperienceDefinition } from '@opus/contracts';

import {
  compareStandardVersions,
  declineUpdate,
  deriveClientExperience,
  derivedIdFor,
  describeUpdate,
  isClientVariant,
  isStandard,
  refuseStandardWrite,
  updateAvailableFor,
} from './index';

const NOW = '2026-08-19T12:00:00.000Z';

function experience(over: Partial<ExperienceDefinition> = {}): ExperienceDefinition {
  return {
    schemaVersion: '1.0',
    id: 'security-master-overview',
    name: 'Security Master Overview',
    kind: 'application',
    pages: { home: { schemaVersion: '1.0', id: 'home', title: 'Home' } },
    version: {
      schemaVersion: '1.0',
      artifactVersion: 1,
      lifecycleState: 'draft',
      pins: { catalogVersion: 14, registryVersion: '1.1.0' },
    },
    ...over,
  } as ExperienceDefinition;
}

function standard(version = '1.0', over: Partial<ExperienceDefinition> = {}): ExperienceDefinition {
  return experience({
    standard: {
      standardId: 'security-master-overview',
      version,
      productRelease: '2026.08',
      releaseNotes: 'Initial product standard.',
    },
    owner: { userId: 'edm-product-team', assignedAt: NOW, assignedBy: 'edm-product-team' },
    ...over,
  });
}

// ── the refusal ─────────────────────────────────────────────────────────────

describe('a standard is deployed, never saved', () => {
  it('refuses a write to a product standard and names the way forward', () => {
    const refusal = refuseStandardWrite(standard());
    expect(refusal).not.toBeNull();
    expect(refusal?.code).toBe('standardNotEditable');
    // A refusal that does not name the alternative is a dead end.
    expect(refusal?.deriveTo).toBe('security-master-overview.client');
    expect(refusal?.detail).toContain('derive');
    expect(refusal?.detail).toContain('v1.0');
  });

  it('permits a write to an ordinary experience', () => {
    expect(refuseStandardWrite(experience())).toBeNull();
  });

  it('permits a write to a client variant of a standard', () => {
    // The whole point: the variant is the writable thing. If this refused, §16 would have no path at all.
    const derived = deriveClientExperience({ standard: standard(), actorId: 'ana' }, NOW);
    expect(derived.ok).toBe(true);
    if (derived.ok) expect(refuseStandardWrite(derived.definition)).toBeNull();
  });

  it('does not gate the refusal on who is asking', () => {
    /*
      There is deliberately no capability parameter. §16.2 makes a new standard version a deployment,
      so no caller has a right to save one — and making the product's most important invariant depend
      on a permission list would make it depend on the least stable list in the codebase.
    */
    expect(refuseStandardWrite.length).toBe(1);
  });
});

describe('telling a standard from a variant from neither', () => {
  it('recognises all three states', () => {
    expect(isStandard(standard())).toBe(true);
    expect(isClientVariant(standard())).toBe(false);

    const derived = deriveClientExperience({ standard: standard(), actorId: 'ana' }, NOW);
    if (!derived.ok) throw new Error(derived.detail);
    expect(isStandard(derived.definition)).toBe(false);
    expect(isClientVariant(derived.definition)).toBe(true);

    // Neither. An experience somebody built from scratch is outside the standard lifecycle, and that
    // is a third state rather than a missing value.
    expect(isStandard(experience())).toBe(false);
    expect(isClientVariant(experience())).toBe(false);
  });
});

// ── deriving ────────────────────────────────────────────────────────────────

describe('deriving a client experience', () => {
  const derived = deriveClientExperience({ standard: standard(), actorId: 'ana' }, NOW);
  const definition = derived.ok ? derived.definition : null;

  it('records the standing relationship, not just where the bytes came from', () => {
    expect(definition?.derivedFrom).toEqual({
      standardId: 'security-master-overview',
      standardVersion: '1.0',
      productRelease: '2026.08',
      derivedAt: NOW,
      derivedBy: 'ana',
    });
  });

  it('keeps the intra-artifact copy record as well, because they answer different questions', () => {
    // `copiedFrom` says where these bytes came from. `derivedFrom` says what the relationship is.
    expect(definition?.version.lineage).toMatchObject({
      copiedFrom: { experienceId: 'security-master-overview' },
    });
  });

  it('takes the id and the name §16 uses', () => {
    expect(definition?.id).toBe('security-master-overview.client');
    expect(definition?.name).toBe('Security Master Overview — Client Version');
  });

  it('is no longer a standard', () => {
    // Leaving `standard` on would make the store refuse to save the very artifact this creates.
    expect(definition?.standard).toBeUndefined();
  });

  it('drops the product team’s ownership rather than copying it', () => {
    /*
      Copying it would misdirect every accountability question afterwards: the client's page would
      answer "who is responsible for this" with the name of a team that has never seen it. The store
      assigns the saver instead.
    */
    expect(definition?.owner).toBeUndefined();
  });

  it('starts a fresh version line rather than inheriting the standard’s', () => {
    expect(definition?.version.artifactVersion).toBe(1);
    expect(definition?.version.lifecycleState).toBe('draft');
    expect(definition?.version.immutable).toBeUndefined();
    // No approvals carried across: a variant must not arrive pre-approved by people who have not seen it.
    expect(definition?.version.governance).toBeUndefined();
  });

  it('carries everything that makes it the same experience', () => {
    // A fork that differed from its standard on day one could never be compared against it meaningfully.
    expect(Object.keys(definition?.pages ?? {})).toEqual(['home']);
    expect(definition?.version.pins).toEqual({ catalogVersion: 14, registryVersion: '1.1.0' });
  });

  it('accepts an id and a name for a tenant with its own conventions', () => {
    const custom = deriveClientExperience(
      { standard: standard(), actorId: 'ana', id: 'acme-security-overview', name: 'Acme Securities' },
      NOW,
    );
    expect(custom.ok).toBe(true);
    if (custom.ok) {
      expect(custom.definition.id).toBe('acme-security-overview');
      expect(custom.definition.name).toBe('Acme Securities');
    }
  });

  it('refuses to derive from something that is not a standard', () => {
    const outcome = deriveClientExperience({ standard: experience(), actorId: 'ana' }, NOW);
    expect(outcome.ok).toBe(false);
    if (!outcome.ok) expect(outcome.code).toBe('notAStandard');
  });

  it('refuses to derive from a derivation', () => {
    // A chain is not something §16 describes how to synchronise, so it is refused rather than allowed
    // and left for whoever hits the second sync to work out.
    const first = deriveClientExperience({ standard: standard(), actorId: 'ana' }, NOW);
    if (!first.ok) throw new Error(first.detail);
    const second = deriveClientExperience({ standard: first.definition, actorId: 'ana' }, NOW);
    expect(second.ok).toBe(false);
    if (!second.ok) expect(second.code).toBe('alreadyDerived');
  });

  it('never mutates the standard it was given', () => {
    const source = standard();
    const before = JSON.stringify(source);
    deriveClientExperience({ standard: source, actorId: 'ana' }, NOW);
    expect(JSON.stringify(source)).toBe(before);
  });
});

describe('the derived id', () => {
  it('is deterministic, so one standard has one client variant', () => {
    expect(derivedIdFor('security-master-overview')).toBe('security-master-overview.client');
    expect(derivedIdFor('securities.operations')).toBe('securities.operations.client');
  });
});

// ── the product version line ────────────────────────────────────────────────

describe('comparing standard versions', () => {
  it('orders by major then minor', () => {
    expect(compareStandardVersions('1.0', '2.0')).toBeLessThan(0);
    expect(compareStandardVersions('2.0', '1.9')).toBeGreaterThan(0);
    expect(compareStandardVersions('1.2', '1.10')).toBeLessThan(0);
    expect(compareStandardVersions('1.0', '1.0')).toBe(0);
  });

  it('treats an unreadable version as older than everything', () => {
    /*
      The safe direction. A client on a malformed baseline is told an update is available and gets to
      look, rather than being told it is current on the strength of a string nobody could parse.
    */
    expect(compareStandardVersions('rubbish', '1.0')).toBeLessThan(0);
    expect(compareStandardVersions(undefined, '1.0')).toBeLessThan(0);
    expect(compareStandardVersions('rubbish', 'nonsense')).toBe(0);
  });
});

// ── FR-21: is an update available ───────────────────────────────────────────

describe('detecting an available standard update', () => {
  function clientOn(version: string, artifactVersion = 1): ExperienceDefinition {
    const derived = deriveClientExperience({ standard: standard(version), actorId: 'ana' }, NOW);
    if (!derived.ok) throw new Error(derived.detail);
    return {
      ...derived.definition,
      version: { ...derived.definition.version, artifactVersion },
    } as ExperienceDefinition;
  }

  it('reports a newer standard', () => {
    const update = updateAvailableFor(clientOn('1.0'), [standard('2.0')]);
    expect(update).toMatchObject({
      standardId: 'security-master-overview',
      currentVersion: '1.0',
      availableVersion: '2.0',
      availableRelease: '2026.08',
    });
  });

  it('reports nothing when the client is already current', () => {
    expect(updateAvailableFor(clientOn('2.0'), [standard('2.0')])).toBeNull();
  });

  it('reports nothing when the client is somehow ahead', () => {
    // Not an error state to shout about: it happens when a standard is rolled back, and the client's
    // page still works. Silence is the right answer to "should I update".
    expect(updateAvailableFor(clientOn('3.0'), [standard('2.0')])).toBeNull();
  });

  it('reports nothing for an experience that is not derived from anything', () => {
    expect(updateAvailableFor(experience(), [standard('2.0')])).toBeNull();
  });

  it('reports nothing when the standard is no longer shipped', () => {
    // A withdrawn standard leaves the client page working and unadvised, which is better than
    // inventing an update or reporting an error against an artifact that is fine.
    expect(updateAvailableFor(clientOn('1.0'), [])).toBeNull();
  });

  it('compares the product line, not the artifact line', () => {
    /*
      The mistake this test exists to catch. The client below has saved forty times — artifactVersion
      40 — and is still on standard v1.0, so an update to v2.0 IS available. A comparison that reached
      for artifactVersion would find 40 > 2 and report the client as current forever.
    */
    const update = updateAvailableFor(clientOn('1.0', 40), [standard('2.0')]);
    expect(update?.availableVersion).toBe('2.0');
  });

  it('knows whether the client has customised, because §16.3’s warning turns on it', () => {
    expect(updateAvailableFor(clientOn('1.0', 1), [standard('2.0')])?.customised).toBe(false);
    expect(updateAvailableFor(clientOn('1.0', 2), [standard('2.0')])?.customised).toBe(true);
  });

  it('picks the standard by standardId, not by experience id', () => {
    // A renamed artifact is still the same standard — which is why standardId exists separately.
    const renamed = { ...standard('2.0'), id: 'renamed-in-a-later-release' } as ExperienceDefinition;
    expect(updateAvailableFor(clientOn('1.0'), [renamed])?.availableVersion).toBe('2.0');
  });
});

// ── §16.3: Keep My Version ──────────────────────────────────────────────────

describe('declining an update — §16.3’s Keep My Version', () => {
  function clientOn(version: string, artifactVersion = 1): ExperienceDefinition {
    const derived = deriveClientExperience({ standard: standard(version), actorId: 'ana' }, NOW);
    if (!derived.ok) throw new Error(derived.detail);
    return {
      ...derived.definition,
      version: { ...derived.definition.version, artifactVersion },
    } as ExperienceDefinition;
  }

  it('silences the notification for the version that was declined', () => {
    const client = clientOn('1.0');
    expect(updateAvailableFor(client, [standard('2.0')])).not.toBeNull();

    const declined = declineUpdate(client, '2.0', 'ana', NOW);
    expect(declined.ok).toBe(true);
    if (!declined.ok) return;
    expect(updateAvailableFor(declined.definition, [standard('2.0')])).toBeNull();
  });

  it('does NOT move the baseline, because the comparison needs it', () => {
    /*
      The one-line implementation of "stop telling me" is to write 2.0 into standardVersion. It
      silences the notification and loses what the variant is actually derived from, so §16.4 could
      then only diff against the version the client declined — the opposite of what it needs.
    */
    const declined = declineUpdate(clientOn('1.0'), '2.0', 'ana', NOW);
    if (!declined.ok) throw new Error(declined.detail);
    expect(declined.definition.derivedFrom?.standardVersion).toBe('1.0');
    expect(declined.definition.derivedFrom?.declinedVersion).toBe('2.0');
  });

  it('speaks again when the product ships something newer than what was declined', () => {
    // A decline is a decision about a version, not a permanent opt-out. A client who never hears about
    // a standard again is a client §29's lifecycle has stopped applying to.
    const declined = declineUpdate(clientOn('1.0'), '2.0', 'ana', NOW);
    if (!declined.ok) throw new Error(declined.detail);
    expect(updateAvailableFor(declined.definition, [standard('3.0')])?.availableVersion).toBe('3.0');
  });

  it('stays quiet for a version below the one declined', () => {
    // Which happens on a rollback: 1.5 arriving after 2.0 was declined is not news.
    const declined = declineUpdate(clientOn('1.0'), '2.0', 'ana', NOW);
    if (!declined.ok) throw new Error(declined.detail);
    expect(updateAvailableFor(declined.definition, [standard('1.5')])).toBeNull();
  });

  it('records who declined and when, because it is a decision rather than a setting', () => {
    const declined = declineUpdate(clientOn('1.0'), '2.0', 'ana', NOW);
    if (!declined.ok) throw new Error(declined.detail);
    expect(declined.definition.derivedFrom).toMatchObject({ declinedBy: 'ana', declinedAt: NOW });
  });

  it('refuses to decline something that is not an update', () => {
    /*
      Not a no-op to wave through: it means the caller and the server disagree about what was on offer,
      and recording it would set declinedVersion low enough to silence nothing while looking as though
      a decision had been made.
    */
    const outcome = declineUpdate(clientOn('2.0'), '1.0', 'ana', NOW);
    expect(outcome.ok).toBe(false);
    if (outcome.ok) return;
    expect(outcome.code).toBe('notAnUpdate');
    expect(outcome.detail).toContain('not newer');
  });

  it('refuses on an experience that derives from no standard', () => {
    const outcome = declineUpdate(experience(), '2.0', 'ana', NOW);
    expect(outcome.ok).toBe(false);
    if (outcome.ok) return;
    expect(outcome.code).toBe('notDerived');
  });

  it('leaves the input untouched', () => {
    const client = clientOn('1.0');
    const before = JSON.stringify(client);
    declineUpdate(client, '2.0', 'ana', NOW);
    expect(JSON.stringify(client)).toBe(before);
  });
});

describe('the notification wording', () => {
  it('warns about customizations when there are some, in the PRD’s own register', () => {
    const update = {
      standardId: 's',
      currentVersion: '1.0',
      availableVersion: '2.0',
      customised: true,
    };
    const message = describeUpdate(update, 'Security Master Overview');
    expect(message).toContain('A new version of Security Master Overview is available');
    expect(message).toContain('contains customizations');
    expect(message).toContain('choose whether to update');
  });

  it('says plainly when there is nothing to weigh up', () => {
    const message = describeUpdate(
      { standardId: 's', currentVersion: '1.0', availableVersion: '2.0', customised: false },
      'Security Master Overview',
    );
    expect(message).toContain('no customizations');
    expect(message).not.toContain('Review the changes');
  });
});
