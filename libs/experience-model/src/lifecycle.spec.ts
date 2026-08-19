/**
 * The lifecycle gate.
 *
 * FR-33 has three testable consequences and all three are here: Validate must pass before an
 * experience proceeds, Approve requires a named approver recorded with who/what/when, and Publish is
 * the only stage that exposes anything. What the enum had before was the right six words and no rules,
 * so these tests are about the rules.
 *
 * The refusals matter more than the successes — a gate that opens correctly and also opens incorrectly
 * is not a gate.
 */

import { describe, expect, it } from 'vitest';

import {
  APPROVE_CAPABILITY,
  PUBLISH_CAPABILITY,
  applyTransition,
  canTransition,
  transitionsFrom,
  type LifecycleState,
  type VersionEnvelope,
} from './index';

const NOW = '2026-08-19T12:00:00.000Z';
const APPROVER = [APPROVE_CAPABILITY, PUBLISH_CAPABILITY];

function version(state: LifecycleState = 'draft', governance: Record<string, unknown> = {}): VersionEnvelope {
  return {
    schemaVersion: '1.0',
    artifactVersion: 3,
    lifecycleState: state,
    pins: { catalogVersion: 10, registryVersion: '1.1.0' },
    governance,
  } as VersionEnvelope;
}

/** Walk an experience to `approved` the way the chain actually runs, for tests that start there. */
function approved(): VersionEnvelope {
  const submitted = applyTransition(version('draft'), { transition: 'submit', actorId: 'ana', validated: true }, NOW);
  if (!submitted.ok) throw new Error(submitted.detail);
  const signed = applyTransition(
    submitted.version,
    { transition: 'approve', actorId: 'sam', capabilities: APPROVER },
    NOW,
  );
  if (!signed.ok) throw new Error(signed.detail);
  return signed.version;
}

describe('the transition table', () => {
  it('allows only the four steps FR-33 describes, from the states that can take them', () => {
    expect(transitionsFrom('draft')).toEqual(['submit']);
    expect(transitionsFrom('inReview')).toEqual(['approve', 'reject']);
    expect(transitionsFrom('approved')).toEqual(['reject', 'publish']);
    // Nothing moves out of published. A change to a published experience is a new draft version, which
    // the store enforces separately by refusing a save against it.
    expect(transitionsFrom('published')).toEqual([]);
  });

  it('refuses a jump straight from draft to published', () => {
    expect(canTransition('draft', 'publish')).toBe(false);
    const outcome = applyTransition(version('draft'), { transition: 'publish', actorId: 'sam', capabilities: APPROVER }, NOW);
    expect(outcome.ok).toBe(false);
    if (!outcome.ok) {
      expect(outcome.code).toBe('illegalTransition');
      // The refusal says what IS available, so the reader is not left guessing the graph.
      expect(outcome.detail).toContain('submit');
    }
  });
});

describe('submit — Validate is a precondition, not a suggestion', () => {
  it('refuses a submit that has not passed validation', () => {
    const outcome = applyTransition(version('draft'), { transition: 'submit', actorId: 'ana', validated: false }, NOW);
    expect(outcome.ok).toBe(false);
    if (!outcome.ok) expect(outcome.code).toBe('notValidated');
  });

  it('treats an unknown validation state as not validated', () => {
    // A submit whose validation state nobody established is not a validated submit.
    const outcome = applyTransition(version('draft'), { transition: 'submit', actorId: 'ana' }, NOW);
    expect(outcome.ok).toBe(false);
    if (!outcome.ok) expect(outcome.code).toBe('notValidated');
  });

  it('records who submitted it and when', () => {
    const outcome = applyTransition(version('draft'), { transition: 'submit', actorId: 'ana', validated: true }, NOW);
    expect(outcome.ok).toBe(true);
    if (outcome.ok) {
      expect(outcome.state).toBe('inReview');
      expect(outcome.version.governance).toMatchObject({ submittedBy: 'ana', submittedAt: NOW });
    }
  });

  it('starts approvals over on a resubmission', () => {
    /*
      Carrying approvals forward would let a signature given to one version stand for a later one —
      exactly what an approval exists to prevent.
    */
    const rejected = applyTransition(approved(), { transition: 'reject', actorId: 'sam', capabilities: APPROVER }, NOW);
    if (!rejected.ok) throw new Error(rejected.detail);

    const resubmitted = applyTransition(rejected.version, { transition: 'submit', actorId: 'ana', validated: true }, NOW);
    if (!resubmitted.ok) throw new Error(resubmitted.detail);
    expect(resubmitted.version.governance).not.toHaveProperty('approvedBy');
  });
});

describe('approve — a named human, and not the author', () => {
  it('refuses an approver without the capability', () => {
    const submitted = applyTransition(version('draft'), { transition: 'submit', actorId: 'ana', validated: true }, NOW);
    if (!submitted.ok) throw new Error(submitted.detail);

    const outcome = applyTransition(
      submitted.version,
      { transition: 'approve', actorId: 'ana', capabilities: ['experience.author'] },
      NOW,
    );
    expect(outcome.ok).toBe(false);
    if (!outcome.ok) expect(outcome.code).toBe('missingCapability');
  });

  it('refuses a self-approval by default', () => {
    // Separation of duties: `lifecycleTransitionPolicy.separationOfDuties` defaults to true, and the
    // schema's own comment says some clients are contractually forbidden from turning it off.
    const submitted = applyTransition(version('draft'), { transition: 'submit', actorId: 'sam', validated: true }, NOW);
    if (!submitted.ok) throw new Error(submitted.detail);

    const outcome = applyTransition(
      submitted.version,
      { transition: 'approve', actorId: 'sam', capabilities: APPROVER },
      NOW,
    );
    expect(outcome.ok).toBe(false);
    if (!outcome.ok) expect(outcome.code).toBe('selfApproval');
  });

  it('allows a self-approval when the tenant has turned the rule off', () => {
    const submitted = applyTransition(version('draft'), { transition: 'submit', actorId: 'sam', validated: true }, NOW);
    if (!submitted.ok) throw new Error(submitted.detail);

    const outcome = applyTransition(
      submitted.version,
      {
        transition: 'approve',
        actorId: 'sam',
        capabilities: APPROVER,
        policy: { separationOfDuties: false },
      },
      NOW,
    );
    expect(outcome.ok).toBe(true);
  });

  it('records the approver and the time, immutably on the version', () => {
    const outcome = approved();
    expect(outcome.lifecycleState).toBe('approved');
    expect(outcome.governance).toMatchObject({ approvedBy: ['sam'], approvedAt: NOW });
  });

  it('refuses the same person approving twice', () => {
    const outcome = applyTransition(
      approved(),
      { transition: 'approve', actorId: 'sam', capabilities: APPROVER },
      NOW,
    );
    // Illegal first — `approved` cannot take another approve — which is the stronger refusal anyway.
    expect(outcome.ok).toBe(false);
  });

  it('holds at inReview until enough approvers have signed, keeping the first signature', () => {
    const submitted = applyTransition(version('draft'), { transition: 'submit', actorId: 'ana', validated: true }, NOW);
    if (!submitted.ok) throw new Error(submitted.detail);

    const first = applyTransition(
      submitted.version,
      { transition: 'approve', actorId: 'sam', capabilities: APPROVER, policy: { minApprovers: 2 } },
      NOW,
    );
    expect(first.ok).toBe(true);
    if (!first.ok) return;
    // Recorded, and not yet moved. Returning an error here would have lost the signature.
    expect(first.state).toBe('inReview');
    expect(first.version.governance).toMatchObject({ approvedBy: ['sam'] });

    const second = applyTransition(
      first.version,
      { transition: 'approve', actorId: 'pat', capabilities: APPROVER, policy: { minApprovers: 2 } },
      NOW,
    );
    expect(second.ok).toBe(true);
    if (second.ok) {
      expect(second.state).toBe('approved');
      expect(second.version.governance).toMatchObject({ approvedBy: ['sam', 'pat'] });
    }
  });

  it('refuses a second approval from the same person under a two-approver policy', () => {
    const submitted = applyTransition(version('draft'), { transition: 'submit', actorId: 'ana', validated: true }, NOW);
    if (!submitted.ok) throw new Error(submitted.detail);
    const first = applyTransition(
      submitted.version,
      { transition: 'approve', actorId: 'sam', capabilities: APPROVER, policy: { minApprovers: 2 } },
      NOW,
    );
    if (!first.ok) throw new Error(first.detail);

    const again = applyTransition(
      first.version,
      { transition: 'approve', actorId: 'sam', capabilities: APPROVER, policy: { minApprovers: 2 } },
      NOW,
    );
    expect(again.ok).toBe(false);
    if (!again.ok) expect(again.code).toBe('alreadyApproved');
  });
});

describe('reject — the way back', () => {
  it('returns an experience to draft, recording who sent it back and why', () => {
    const submitted = applyTransition(version('draft'), { transition: 'submit', actorId: 'ana', validated: true }, NOW);
    if (!submitted.ok) throw new Error(submitted.detail);

    const outcome = applyTransition(
      submitted.version,
      { transition: 'reject', actorId: 'sam', capabilities: APPROVER, note: 'The vendor filter is missing.' },
      NOW,
    );
    expect(outcome.ok).toBe(true);
    if (outcome.ok) {
      expect(outcome.state).toBe('draft');
      expect(outcome.version.governance).toMatchObject({
        rejectedBy: 'sam',
        rejectedAt: NOW,
        rejectionNote: 'The vendor filter is missing.',
      });
    }
  });

  it('can withdraw something already approved but not yet published', () => {
    // The alternative is publishing a version somebody has since had second thoughts about, because
    // the model offered no way back.
    const outcome = applyTransition(approved(), { transition: 'reject', actorId: 'sam', capabilities: APPROVER }, NOW);
    expect(outcome.ok).toBe(true);
    if (outcome.ok) expect(outcome.state).toBe('draft');
  });

  it('needs the same authority as approving', () => {
    const submitted = applyTransition(version('draft'), { transition: 'submit', actorId: 'ana', validated: true }, NOW);
    if (!submitted.ok) throw new Error(submitted.detail);
    const outcome = applyTransition(
      submitted.version,
      { transition: 'reject', actorId: 'ana', capabilities: ['experience.author'] },
      NOW,
    );
    expect(outcome.ok).toBe(false);
    if (!outcome.ok) expect(outcome.code).toBe('missingCapability');
  });
});

describe('publish — the only stage that exposes anything', () => {
  it('records the publisher, the time, and the environments, and marks the version immutable', () => {
    const outcome = applyTransition(
      approved(),
      { transition: 'publish', actorId: 'sam', capabilities: APPROVER, environments: ['production'] },
      NOW,
    );
    expect(outcome.ok).toBe(true);
    if (outcome.ok) {
      expect(outcome.state).toBe('published');
      expect(outcome.version.immutable).toBe(true);
      expect(outcome.version.governance).toMatchObject({
        publishedBy: 'sam',
        publishedAt: NOW,
        publishedEnvironments: ['production'],
      });
    }
  });

  it('is gated separately from approving', () => {
    const outcome = applyTransition(
      approved(),
      { transition: 'publish', actorId: 'sam', capabilities: [APPROVE_CAPABILITY] },
      NOW,
    );
    expect(outcome.ok).toBe(false);
    if (!outcome.ok) expect(outcome.code).toBe('missingCapability');
  });

  it('never mutates the envelope it was given', () => {
    // Every transition returns a new envelope. A caller holding the previous state — to report a diff,
    // or to roll back a failed write — must still have it.
    const before = approved();
    const governanceBefore = JSON.stringify(before.governance);
    applyTransition(before, { transition: 'publish', actorId: 'sam', capabilities: APPROVER }, NOW);
    expect(JSON.stringify(before.governance)).toBe(governanceBefore);
    expect(before.lifecycleState).toBe('approved');
  });
});
