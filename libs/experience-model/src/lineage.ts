/**
 * Product Standard ↔ Client Experience lineage (PRD §16, FR-20 · FR-21 · FR-24).
 *
 * ── THE REQUIREMENT, AND WHY IT COMES BEFORE EVERYTHING ELSE ─────────────────
 *
 * Principle 2: *"Client customization must never modify the product standard."*
 *
 * Every other P0 in this PRD modifies a page. FR-08 conversational modification, FR-10 grid
 * configuration, FR-11 visualisation changes, FR-12 navigation, FR-14 tabs — all of them. If a
 * modification to a shipped page writes back over the shipped page, then building those verbs means
 * shipping, at speed, the ability to destroy the product's own baseline. So this module exists first,
 * and the store's refusal to save over a standard is the load-bearing line in it.
 *
 * ── THE ONE DISTINCTION THAT MATTERS ────────────────────────────────────────
 *
 * `version.lineage.copiedFrom` already existed and is *not* this. A copy is a snapshot: nothing is
 * expected of the thing it came from ever again. A derivation is a standing relationship — when the
 * standard moves, the client must be told (§16.3), must be able to compare (§16.4), and must be able
 * to synchronise or refuse (§16.5). None of those three questions has an answer without a live link,
 * and a copy record cannot provide one.
 *
 * ── TWO VERSION LINES, NOT ONE ──────────────────────────────────────────────
 *
 * §16.6's example is the specification:
 *
 *     Security Master Overview
 *       Standard v1.0        ← the product's line
 *       Client v1.0          ← the client's line
 *       Standard v2.0 available
 *       Client v1.1
 *
 * `standard.version` and `derivedFrom.standardVersion` are the product line, MAJOR.MINOR, moved by
 * product releases. `version.artifactVersion` is the client line, an integer, moved by saves. They are
 * deliberately different types so that no arithmetic can accidentally mix them.
 *
 * ── A STANDARD IS DEPLOYED, NEVER SAVED ─────────────────────────────────────
 *
 * §16.2: *"New standard versions are deployed as part of product releases."* A deployment, not an
 * authoring action. So standards arrive as files in `apps/viewer/public/definitions/` and the
 * authoring API never writes one — `refuseStandardWrite` is called from the store, where the bytes
 * are, rather than from a route, because a route is a door and there is more than one door.
 *
 * The alternative — capability-gate it, let a "product author" persona save standards — was rejected.
 * It makes the invariant conditional on a permission list, and a prototype's permission list is the
 * least stable thing in it.
 */

import type { ExperienceDefinition, StandardDeclaration, StandardLineage } from '@opus/contracts';

/** Suffix for a derived client experience's id. One client variant per standard, which is §16's model. */
const CLIENT_SUFFIX = 'client';

// ── identity ────────────────────────────────────────────────────────────────

export function isStandard(definition: ExperienceDefinition): boolean {
  return definition.standard !== undefined;
}

export function isClientVariant(definition: ExperienceDefinition): boolean {
  return definition.derivedFrom !== undefined;
}

/**
 * The id a client variant of this standard takes.
 *
 * Deterministic rather than generated, for a reason that shows up in the second edit: §16 speaks of
 * *"your current experience"*, singular — one client variant per standard. A random id would let the
 * same standard be forked twice, and then "is an update available for my Security Master Overview"
 * has two answers.
 */
export function derivedIdFor(standardId: string): string {
  return `${standardId}.${CLIENT_SUFFIX}`;
}

// ── version arithmetic on the product line ──────────────────────────────────

/** Parse MAJOR.MINOR. Returns null for anything else rather than guessing a number out of it. */
function parseVersion(value: string | undefined): [number, number] | null {
  if (!value) return null;
  const match = /^(\d+)\.(\d+)$/.exec(value.trim());
  return match ? [Number(match[1]), Number(match[2])] : null;
}

/**
 * Compare two standard versions: negative if `a` is older, 0 if equal, positive if newer.
 *
 * An unparseable version sorts as *older than everything*, which is the safe direction: it means a
 * client on a malformed baseline is told an update is available and gets to look, rather than being
 * told it is current on the strength of a string nobody could read.
 */
export function compareStandardVersions(a: string | undefined, b: string | undefined): number {
  const left = parseVersion(a);
  const right = parseVersion(b);
  if (!left && !right) return 0;
  if (!left) return -1;
  if (!right) return 1;
  return left[0] - right[0] || left[1] - right[1];
}

// ── deriving a client variant ───────────────────────────────────────────────

export interface DeriveRequest {
  /** The standard being forked. Must carry `standard`. */
  standard: ExperienceDefinition;
  actorId: string;
  /** Optional name for the variant. Defaults to the §16 convention. */
  name?: string;
  /** Optional id override, for a tenant that wants its own naming. */
  id?: string;
}

export type DeriveOutcome =
  | { ok: true; definition: ExperienceDefinition }
  | { ok: false; code: 'notAStandard' | 'alreadyDerived'; detail: string };

/** The §16 naming convention, spelled the way the PRD spells it. */
function clientNameFor(definition: ExperienceDefinition): string {
  const base = typeof definition.name === 'string' ? definition.name : definition.name.default;
  return `${base} — Client Version`;
}

/**
 * Fork a standard into a client-specific experience.
 *
 * What is carried, what is dropped, and why each:
 *
 *   carried  pages, layout, data sources, navigation, actions, security, workflows, docs, tests —
 *            everything that makes it the same experience, because a fork that differed from its
 *            standard on day one could never be compared against it meaningfully
 *   dropped  `standard` — the variant is not a standard, and leaving it would make the store refuse
 *            to save the very artifact this function exists to create
 *   dropped  `owner` — assigned by the store to whoever saves it, which for a fork is the forker.
 *            Copying the product team's ownership onto a client's page would misdirect every
 *            accountability question afterwards
 *   reset    the version envelope: a new artifact starts at draft, artifactVersion 1, with no
 *            approvals and no `immutable`. Carrying a standard's approvals forward would mean a
 *            client variant arrived pre-approved by the product team, who have not seen it
 *   added    `derivedFrom`, the whole point
 */
export function deriveClientExperience(request: DeriveRequest, now: string): DeriveOutcome {
  const { standard, actorId } = request;

  /*
    The specific diagnosis first. A client variant has no `standard` field, so checking that first
    would refuse every variant as "not a product standard" — true, useless, and actively misleading to
    somebody who knows perfectly well what they are holding. Both orderings refuse; only one explains.
  */
  if (standard.derivedFrom) {
    return {
      ok: false,
      code: 'alreadyDerived',
      detail: `"${standard.id}" is already a client variant of "${standard.derivedFrom.standardId}" v${standard.derivedFrom.standardVersion}. Deriving from a derivation would produce a chain that §16 does not describe how to synchronise — customise this variant directly instead.`,
    };
  }
  if (!standard.standard) {
    return {
      ok: false,
      code: 'notAStandard',
      detail: `"${standard.id}" is not a product standard, so there is nothing to derive from. A client experience is derived from a standard; an ordinary experience is copied.`,
    };
  }

  const declaration: StandardDeclaration = standard.standard;
  const lineage: StandardLineage = {
    standardId: declaration.standardId,
    standardVersion: declaration.version,
    ...(declaration.productRelease ? { productRelease: declaration.productRelease } : {}),
    derivedAt: now,
    derivedBy: actorId,
  };

  // Destructured out rather than deleted, so the two omissions are visible in one line and a future
  // field added to the standard is carried by default — the safer direction for a fork.
  const { standard: _declaration, owner: _productOwner, version: _standardVersion, ...carried } = standard;

  return {
    ok: true,
    definition: {
      ...carried,
      id: request.id ?? derivedIdFor(declaration.standardId),
      name: request.name ?? clientNameFor(standard),
      derivedFrom: lineage,
      version: {
        schemaVersion: standard.version.schemaVersion,
        artifactVersion: 1,
        lifecycleState: 'draft',
        pins: standard.version.pins,
        provenance: {
          origin: 'copy',
          actorId,
          createdAt: now,
        },
        lineage: {
          // The intra-artifact lineage keeps saying what it always said: where these bytes came from.
          // `derivedFrom` above says what the *relationship* is. Both, because they answer different
          // questions and a reader of either should not have to know about the other.
          copiedFrom: { experienceId: standard.id },
        },
      },
    } as ExperienceDefinition,
  };
}

// ── FR-21: is an update available ───────────────────────────────────────────

export interface StandardUpdate {
  standardId: string;
  /** What the client is based on now. */
  currentVersion: string;
  /** What the product ships now. */
  availableVersion: string;
  availableRelease?: string;
  releaseNotes?: string;
  /** True when the client has customised since deriving — which is what makes §16.3's warning apt. */
  customised: boolean;
}

/**
 * Whether a newer standard exists for this client experience.
 *
 * `customised` is the field §16.3's notification actually turns on: *"Your current experience contains
 * customizations. Review the changes and choose whether to update."* A client variant nobody has
 * touched can adopt an update with no risk at all, and telling that user to review a comparison is
 * ceremony. `artifactVersion > 1` is the test — the fork itself is version 1, so anything above it is
 * a save somebody made.
 */
export function updateAvailableFor(
  client: ExperienceDefinition,
  standards: readonly ExperienceDefinition[],
): StandardUpdate | null {
  const lineage = client.derivedFrom;
  if (!lineage) return null;

  const shipped = standards.find((s) => s.standard?.standardId === lineage.standardId);
  if (!shipped?.standard) return null;

  if (compareStandardVersions(lineage.standardVersion, shipped.standard.version) >= 0) return null;

  /*
    Already offered and declined — §16.3's "Keep My Version".

    Compared with `>=` rather than `===` so that declining v2.0 also silences a v1.5 that arrives late
    out of a rollback, and so that the notification comes back the moment v3.0 ships. A decline is a
    decision about a version, not a permanent opt-out: a client who never hears about a standard again
    is a client the lifecycle in §29 has stopped applying to.
  */
  if (
    lineage.declinedVersion &&
    compareStandardVersions(lineage.declinedVersion, shipped.standard.version) >= 0
  ) {
    return null;
  }

  return {
    standardId: lineage.standardId,
    currentVersion: lineage.standardVersion,
    availableVersion: shipped.standard.version,
    ...(shipped.standard.productRelease ? { availableRelease: shipped.standard.productRelease } : {}),
    ...(shipped.standard.releaseNotes ? { releaseNotes: shipped.standard.releaseNotes } : {}),
    customised: (client.version?.artifactVersion ?? 1) > 1,
  };
}

/**
 * §16.3's notification, as a sentence.
 *
 * Here rather than in a component because the wording is a requirement — the PRD gives the sentence —
 * and a requirement that lives in a template is a requirement that gets reworded by whoever is
 * adjusting the spacing.
 */
export type DeclineOutcome =
  | { ok: true; definition: ExperienceDefinition }
  | { ok: false; code: string; detail: string };

/**
 * §16.3's **Keep My Version** — record that an update was offered and turned down.
 *
 * The one thing this deliberately does not touch is `standardVersion`. Silencing the notification by
 * advancing the baseline would be the obvious one-line implementation and it would be a lie: the
 * variant is still derived from what it was derived from, and §16.4's comparison needs that baseline to
 * say what changed. So the decline is recorded beside it, and the two together answer both questions —
 * "what am I based on" and "what have I already said no to".
 *
 * `Review Later` has no function here on purpose. It records nothing, so the notification returns next
 * time, which is exactly what a reader of §16.3's list would expect the difference to be.
 */
export function declineUpdate(
  client: ExperienceDefinition,
  version: string,
  actorId: string,
  now: string,
): DeclineOutcome {
  const lineage = client.derivedFrom;
  if (!lineage) {
    return {
      ok: false,
      code: 'notDerived',
      detail: `“${client.id}” is not derived from a product standard, so there is no standard update to decline.`,
    };
  }
  if (compareStandardVersions(version, lineage.standardVersion) <= 0) {
    /*
      Declining something at or below the current baseline is not a no-op to accept quietly — it means
      the caller and the server disagree about which version is on offer, and recording it would set
      `declinedVersion` low enough to silence nothing while looking as though a decision was made.
    */
    return {
      ok: false,
      code: 'notAnUpdate',
      detail: `v${version} is not newer than the v${lineage.standardVersion} this experience is based on.`,
    };
  }

  return {
    ok: true,
    definition: {
      ...client,
      derivedFrom: {
        ...lineage,
        declinedVersion: version,
        declinedAt: now,
        declinedBy: actorId,
      },
    } as ExperienceDefinition,
  };
}

export function describeUpdate(update: StandardUpdate, experienceName: string): string {
  const base = `A new version of ${experienceName} is available (v${update.availableVersion}, up from v${update.currentVersion}).`;
  return update.customised
    ? `${base} Your current experience contains customizations. Review the changes and choose whether to update your experience.`
    : `${base} Your experience has no customizations, so it can adopt this update as it stands.`;
}

// ── FR-24: the refusal that keeps Principle 2 ───────────────────────────────

export type StandardWriteRefusal = { code: 'standardNotEditable'; detail: string; deriveTo: string };

/**
 * Refuse a write to a product standard, and say what to do instead.
 *
 * Returns the refusal rather than throwing, so the caller decides the transport — the store raises it
 * as a 409 and the builder turns it into a derive-then-save. The `deriveTo` id is included because a
 * refusal that does not name the alternative is a dead end, and the client would otherwise have to
 * reimplement `derivedIdFor` to recover.
 *
 * Note what is NOT checked here: who is asking. There is no capability that lets a caller save over a
 * standard, because §16.2 makes new standard versions a *deployment*. Gating this on a permission
 * would make the product's most important invariant depend on the least stable list in the codebase.
 */
export function refuseStandardWrite(definition: ExperienceDefinition): StandardWriteRefusal | null {
  const declaration = definition.standard;
  if (!declaration) return null;
  return {
    code: 'standardNotEditable',
    deriveTo: derivedIdFor(declaration.standardId),
    detail:
      `"${definition.id}" is the product-standard experience ${declaration.standardId} v${declaration.version}, which cannot be saved over. ` +
      'A standard is deployed as part of a product release, and a client change to one produces a derived client experience instead (PRD §16, Principle 2). ' +
      `Derive it first — POST /api/experiences/${definition.id}/derive — and save the result.`,
  };
}
