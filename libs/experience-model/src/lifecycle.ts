/**
 * The Experience Lifecycle as a gate rather than a label.
 *
 * ── WHAT WAS WRONG ──────────────────────────────────────────────────────────────────────
 * `lifecycleState` already had the right six values and nothing checked them. Worse, a client PUT the
 * whole definition — `version.lifecycleState` included — so anything could set `published` directly and
 * skip every stage FR-33 describes. Validation existed, was good, and was a precondition for nothing.
 * The distance between "fast to build" and "ungoverned in production" was one JSON field.
 *
 * ── THE DESIGN ──────────────────────────────────────────────────────────────────────────
 * State is no longer something a save can carry. It moves only through a named transition, and each
 * transition is refused unless its preconditions hold:
 *
 *   draft ──submit──▶ inReview ──approve──▶ approved ──publish──▶ published
 *     ▲                   │                     │
 *     └──── reject ───────┘                     └──── reject (withdraw after approval)
 *
 * Four transitions, because four is what FR-33's chain needs. `deprecated` and `archived` are reachable
 * states in the model and have no transition here — they are a retirement flow the requirement does not
 * describe, and inventing one would be inventing policy.
 *
 * ── AND WHY THIS FILE IS PURE ───────────────────────────────────────────────────────────
 * It takes a version envelope, a request and a policy, and returns either the next envelope or a
 * refusal. No store, no HTTP, no clock of its own. That is what makes the interesting cases — a
 * self-approval, a submit that skipped validation, a second approver — testable as arithmetic rather
 * than as an integration scenario.
 */

import type { VersionEnvelope } from '@opus/contracts';

export type LifecycleState = VersionEnvelope['lifecycleState'];

/** The four transitions FR-33's chain needs. See the note above about retirement. */
export type LifecycleTransition = 'submit' | 'approve' | 'reject' | 'publish';

/**
 * The capability an approver must hold.
 *
 * Named here rather than inline at the route so the client can ask the same question when deciding
 * whether to render the button — a disabled control and a server refusal disagreeing about the same
 * rule is how a screen ends up lying about what a user may do.
 */
export const APPROVE_CAPABILITY = 'experience.approve';
export const PUBLISH_CAPABILITY = 'experience.publish';

/**
 * Tenant policy, as `security.schema.json#/$defs/lifecycleTransitionPolicy` already models it.
 *
 * Defaults match that schema's: separation of duties on, one approver. Both are deliberately
 * overridable — the schema's own comment says some clients accept the risk and others are
 * contractually forbidden from doing so, and a platform that hardcodes the strict answer gets worked
 * around rather than complied with.
 */
export interface TransitionPolicy {
  separationOfDuties?: boolean;
  minApprovers?: number;
}

export const DEFAULT_TRANSITION_POLICY: Required<TransitionPolicy> = {
  separationOfDuties: true,
  minApprovers: 1,
};

export interface TransitionRequest {
  transition: LifecycleTransition;
  actorId: string;
  /** What the actor holds. Checked here so the rule lives in one place. */
  capabilities?: readonly string[];
  /**
   * Whether Validate passed, for `submit`.
   *
   * Passed in rather than computed here because validation needs a catalog and component manifests,
   * and this module deliberately has neither. Undefined is treated as "not validated" — a submit
   * whose validation state is unknown is not a validated submit.
   */
  validated?: boolean;
  /** Why, for a rejection; a note on an approval. */
  note?: string;
  /** Environments a publish makes it live in. */
  environments?: readonly string[];
  policy?: TransitionPolicy;
}

export type TransitionCode =
  | 'illegalTransition'
  | 'notValidated'
  | 'missingCapability'
  | 'selfApproval'
  | 'alreadyApproved'
  | 'awaitingApprovers';

export type TransitionOutcome =
  | { ok: true; version: VersionEnvelope; state: LifecycleState }
  | { ok: false; code: TransitionCode; detail: string };

/** Which states each transition may be taken from. */
const LEGAL_FROM: Record<LifecycleTransition, readonly LifecycleState[]> = {
  submit: ['draft'],
  approve: ['inReview'],
  // From `approved` too: withdrawing an approved-but-unpublished version back to draft is a rejection
  // of the same kind, and the alternative is publishing something somebody has since had second
  // thoughts about because the model offered no way back.
  reject: ['inReview', 'approved'],
  publish: ['approved'],
};

export function canTransition(from: LifecycleState, transition: LifecycleTransition): boolean {
  return LEGAL_FROM[transition].includes(from);
}

/** The transitions available from a state — what a UI needs to decide which buttons exist. */
export function transitionsFrom(state: LifecycleState): LifecycleTransition[] {
  return (Object.keys(LEGAL_FROM) as LifecycleTransition[]).filter((t) => canTransition(state, t));
}

function governanceOf(version: VersionEnvelope): Record<string, unknown> {
  return { ...((version.governance ?? {}) as Record<string, unknown>) };
}

/**
 * Apply a transition, or refuse it with a reason.
 *
 * Returns a new envelope; never mutates. The refusals are the point of the function, so each carries a
 * code a caller can branch on *and* a sentence a person can act on — the pattern the ingestion routes
 * already use.
 */
export function applyTransition(
  version: VersionEnvelope,
  request: TransitionRequest,
  now: string,
): TransitionOutcome {
  const from: LifecycleState = version.lifecycleState ?? 'draft';
  const policy = { ...DEFAULT_TRANSITION_POLICY, ...request.policy };
  const held = new Set(request.capabilities ?? []);

  if (!canTransition(from, request.transition)) {
    return {
      ok: false,
      code: 'illegalTransition',
      detail: `An experience in "${from}" cannot be ${pastTense(request.transition)}. From "${from}" the available transitions are: ${transitionsFrom(from).join(', ') || 'none'}.`,
    };
  }

  const governance = governanceOf(version);

  switch (request.transition) {
    case 'submit': {
      /*
        FR-33's first consequence, and the one the lifecycle existed without: "Validate performs
        structural and data-binding checks ... before an Experience can proceed to Collaborate."
      */
      if (request.validated !== true) {
        return {
          ok: false,
          code: 'notValidated',
          detail:
            'This experience has not passed validation, so it cannot be submitted for review. Validation checks that every referenced entity, component and action exists and is compatible — a reviewer cannot be asked to catch that by reading.',
        };
      }
      governance['submittedBy'] = request.actorId;
      governance['submittedAt'] = now;
      /*
        A resubmission starts its approvals over.

        Carrying them forward would mean an approval given to one version standing for a later one —
        which is the precise thing an approval is supposed to prevent.
      */
      delete governance['approvedBy'];
      delete governance['approvedAt'];
      delete governance['approvalNote'];
      return { ok: true, version: withState(version, 'inReview', governance), state: 'inReview' };
    }

    case 'approve': {
      if (!held.has(APPROVE_CAPABILITY)) {
        return {
          ok: false,
          code: 'missingCapability',
          detail: `Approving an experience needs the "${APPROVE_CAPABILITY}" capability. FR-33 requires a named human approver, so the approval has to be attributable to somebody entitled to give it.`,
        };
      }

      const approvers = [...((governance['approvedBy'] as string[] | undefined) ?? [])];

      if (approvers.includes(request.actorId)) {
        return {
          ok: false,
          code: 'alreadyApproved',
          detail: `${request.actorId} has already approved this version. A second approval from the same person is not a second approval.`,
        };
      }

      if (policy.separationOfDuties && governance['submittedBy'] === request.actorId) {
        return {
          ok: false,
          code: 'selfApproval',
          detail:
            'You submitted this experience, so you cannot also approve it. Separation of duties is tenant policy and can be turned off, but it is on by default because a self-approved change is an unreviewed change with a signature on it.',
        };
      }

      approvers.push(request.actorId);
      governance['approvedBy'] = approvers;
      if (request.note) governance['approvalNote'] = request.note;

      /*
        More than one approver required: the state stays `inReview` until enough have signed.

        Reported as a refusal-shaped success — the approval IS recorded, and the state simply has not
        moved yet. Returning an error here would lose the signature.
      */
      if (approvers.length < policy.minApprovers) {
        return {
          ok: true,
          version: withState(version, 'inReview', governance),
          state: 'inReview',
        };
      }

      governance['approvedAt'] = now;
      return { ok: true, version: withState(version, 'approved', governance), state: 'approved' };
    }

    case 'reject': {
      if (!held.has(APPROVE_CAPABILITY)) {
        return {
          ok: false,
          code: 'missingCapability',
          detail: `Sending an experience back needs the "${APPROVE_CAPABILITY}" capability — the same authority as approving it, because refusing and accepting are the same decision.`,
        };
      }
      governance['rejectedBy'] = request.actorId;
      governance['rejectedAt'] = now;
      if (request.note) governance['rejectionNote'] = request.note;
      // Approvals do not survive a rejection: the next submit is a fresh review.
      delete governance['approvedBy'];
      delete governance['approvedAt'];
      return { ok: true, version: withState(version, 'draft', governance), state: 'draft' };
    }

    case 'publish': {
      if (!held.has(PUBLISH_CAPABILITY)) {
        return {
          ok: false,
          code: 'missingCapability',
          detail: `Publishing needs the "${PUBLISH_CAPABILITY}" capability. Publish is the only stage that exposes an experience to its audience, so it is the one gated separately from authoring.`,
        };
      }

      const approvers = ((governance['approvedBy'] as string[] | undefined) ?? []).length;
      if (approvers < policy.minApprovers) {
        return {
          ok: false,
          code: 'awaitingApprovers',
          detail: `This version has ${approvers} of ${policy.minApprovers} required approvals.`,
        };
      }

      governance['publishedBy'] = request.actorId;
      governance['publishedAt'] = now;
      if (request.environments?.length) governance['publishedEnvironments'] = [...request.environments];

      /*
        `immutable` is set here rather than left to the store.

        The store already refuses a save against a published version, and this makes the artifact say so
        about itself — so a definition exported, copied or read out of a backup carries the same claim
        as the record it came from.
      */
      return {
        ok: true,
        version: { ...withState(version, 'published', governance), immutable: true },
        state: 'published',
      };
    }
  }
}

function withState(
  version: VersionEnvelope,
  state: LifecycleState,
  governance: Record<string, unknown>,
): VersionEnvelope {
  return { ...version, lifecycleState: state, governance };
}

function pastTense(transition: LifecycleTransition): string {
  return transition === 'submit'
    ? 'submitted'
    : transition === 'approve'
      ? 'approved'
      : transition === 'reject'
        ? 'rejected'
        : 'published';
}
