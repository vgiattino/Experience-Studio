/**
 * @opus/catalog — the semantic catalog: the governed business vocabulary over EDM.
 *
 * Grounds both human authoring and AI generation. The subsystem whose absence would make
 * "AI first" degrade into plausible JSON referencing fields that do not exist
 * (architecture/architecture-review.md §G1).
 */

export { CatalogService, type PhysicalMap } from './catalog.service';
export { retrieve, type RetrievalQuery, type RetrievalResult, type ScoredConcept } from './retrieval';
export {
  buildGroundingPack,
  estimateTokens,
  serializeGroundingPack,
  type GroundedAttribute,
  type GroundedEntity,
  type GroundedMeasure,
  type GroundingPack,
} from './grounding';
export { ALL_CAPABILITIES, testCatalog } from './test-catalog';
export type {
  CatalogAttribute,
  CatalogEntity,
  CatalogMeasure,
  CatalogSnapshot,
  RawAttribute,
  RawCatalog,
  RawEntity,
  RawMeasure,
  RawPhysical,
  RawRelationship,
} from './types';
