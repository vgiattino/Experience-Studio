/**
 * @opus/product-registry — the Product Experience Registry and the Product Integration Contract
 * (PRD §4.5, FR-20…FR-24; §9–10 of the source draft).
 *
 * ── WHAT WAS MISSING ────────────────────────────────────────────────────────
 *
 * The PRD's central architectural claim is that Experience Studio is one platform across Opus EDM,
 * Prime, Control, Pulse and whatever comes next: "adding a new product to the portfolio is a
 * registration exercise, not a platform code change."
 *
 * Before this library that claim was true and worthless. There was no product-specific branching in
 * the core because there was no product concept at all — nothing named a product, nothing owned a
 * slice of the catalog, nothing said which vocabulary the AI should speak. FR-20 was trivially
 * satisfied the way an empty function satisfies every postcondition. The traceability note put it
 * plainly: *"the first second product is what tests it."*
 *
 * So this library is the concept, and the two registrations under `/products` are the test. One of
 * them is Opus EDM, which is real: its domains are the six this tenant actually ingested, its
 * components are manifests that exist, its templates are page definitions that ship. The other is a
 * peer product registered with its own vocabulary and no metadata in this tenant — which is not a
 * placeholder but the honest case, and the one that proves both halves of FR-24: a second product
 * needs no core change, and a product whose data has not been ingested is reported as ungrounded
 * rather than quietly grounded in somebody else's catalog.
 *
 * ── THE THREE PIECES ────────────────────────────────────────────────────────
 *
 *   contract.ts   what a product may register — the contract as types
 *   registry.ts   checking one registration, composing many, and the join to the catalog
 *   identify.ts   FR-3: which product a prompt concerns, and when to ask instead of guess
 *
 * ── THE RULE THAT KEEPS FR-20 HONEST ────────────────────────────────────────
 *
 * No file under `libs/` or `server/` may branch on a product id. Everything a product needs the
 * platform to know is a field in `contract.ts`; everything the platform needs to decide is a function
 * over those fields. `registry.spec.ts` holds that to account with a product this codebase has never
 * heard of, registered entirely from test data, and asserts that identification, grounding and
 * component ownership all work for it. If that test ever needs a production-code change to pass,
 * FR-20 has been broken.
 */

export type {
  ProductActionRegistration,
  ProductAiContext,
  ProductCapability,
  ProductComponentFamily,
  ProductComponentRegistration,
  ProductGlossaryEntry,
  ProductMetadataClaim,
  ProductRegistration,
  ProductRole,
  ProductSecurityRegistration,
  ProductStatus,
  ProductTemplateRegistration,
  ProductTerm,
  SystemJourneyRegistration,
  SystemPageRegistration,
} from './contract';

export {
  blockingRegistryProblems,
  checkGrounding,
  checkRegistration,
  composeRegistry,
  groundingFor,
  productForEntity,
  productsSpanning,
  type ComposedRegistry,
  type ProductGrounding,
  type RegistryProblem,
  type RegistryProblemSeverity,
} from './registry';

export {
  buildSignalIndex,
  identifyProduct,
  type IndexedSignal,
  type MatchedSignal,
  type ProductIdentification,
  type ProductScore,
  type SignalOrigin,
} from './identify';
