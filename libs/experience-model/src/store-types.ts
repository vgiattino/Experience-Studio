/**
 * The store's wire shapes, shared by the client and the server.
 *
 * They live in the model library rather than in the API client so both sides of the network compile
 * against the same declaration — the same reason `@opus/catalog` depends on contracts alone. The
 * server imports these types too; a drift between them would be a runtime surprise rather than a
 * build failure.
 *
 * ── THAT SENTENCE WAS AN ASPIRATION, AND IT DRIFTED ──────────────────────────
 *
 * `server/store/experience-store.ts` declared its **own** `ExperienceSummary` rather than importing
 * this one, so the two grew apart exactly as the comment above warned. `owner`, `product` and all
 * three §16 lineage fields were on the wire and invisible to every client, because the client compiled
 * against the narrower declaration and TypeScript had nothing to complain about — the server was
 * returning a *supertype*, which is always assignable.
 *
 * The failure mode is worth naming because it is silent in both directions: a field the server stops
 * sending would not fail the build either. The store now imports these types, so there is one
 * declaration and drift is a compile error instead of a blank card.
 */

import type { ExperienceDefinition, ProvenanceOrigin } from '@opus/contracts';

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

/** What a list view needs, without shipping every definition body to render a card. */
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
   * product ships has no individual owner until somebody adopts it by saving it.
   */
  owner?: string;
  /**
   * Which Opus product it belongs to. Absent means one of three things the save route distinguishes
   * and this field cannot: nothing claims what it reads, it spans two products, or it was saved
   * before any catalog was promoted.
   */
  product?: string;
  /**
   * §16 lineage, flattened for a list row.
   *
   * `standard` is set on a product-owned artifact and carries its product version; `derivedFromStandard`
   * and `basedOnVersion` are set on a client variant. A row can be **neither** — an experience somebody
   * created from scratch is not part of the standard lifecycle at all, and that is a third state rather
   * than a missing value. The library groups on exactly this distinction.
   */
  standard?: { standardId: string; version: string; productRelease?: string };
  derivedFromStandard?: string;
  basedOnVersion?: string;
  /**
   * The standard version whose update this variant's owner has already seen and declined — §16.3's
   * "Keep My Version". Absent means never asked; equal to the shipped version means asked and declined,
   * and the notification stays quiet until the product releases something newer.
   */
  acknowledgedVersion?: string;
  /** The prompt that produced it, when a model did. */
  prompt?: string;
  tags: readonly string[];
}
