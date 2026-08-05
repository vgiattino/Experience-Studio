/**
 * @opus/contracts — TypeScript projection of the metadata schemas in /schemas.
 *
 * Layer 1 of the dependency stack (see architecture/frontend-architecture.md §2.2).
 * Zero runtime dependencies. Every other library binds to these types.
 *
 * M1 NOTE: these types are hand-written and kept deliberately close to the JSON
 * Schemas. They are the subset the M1 runtime interprets — the schemas remain
 * authoritative and are the thing validated against. Generating this file from
 * the schemas is a milestone-1 follow-up (see docs/M1-IMPLEMENTATION.md §7).
 */

export * from './common';
export * from './data-source';
export * from './component';
export * from './layout';
export * from './action';
export * from './page';
export * from './runtime';
