/**
 * The prototype's Catalog Service.
 *
 * It runs `@opus/catalog` — the same projection code the browser used to run — on the server, which
 * is where it belongs. That relocation is the point of this file rather than an implementation
 * detail: the projection is what strips `physical` and removes attributes the caller's capabilities
 * do not cover, and a projection performed in the browser has already sent the client everything it
 * was meant to withhold.
 *
 * Two surfaces, and the split is the same one the architecture draws:
 *
 *   projectionFor(user)  → what a caller may SEE. Sent to clients and to models.
 *   physicalMaps()       → logical→physical. Never leaves this process.
 */

import { readFileSync } from 'node:fs';

import { CatalogService, type PhysicalMap } from '@opus/catalog';
import type { QualifiedRef, UserContext } from '@opus/contracts';

import { PATHS } from '../config';

const service = new CatalogService();
let loaded = false;

function ensureLoaded(): CatalogService {
  if (!loaded) {
    service.hydrate(JSON.parse(readFileSync(PATHS.catalog, 'utf8')));
    loaded = true;
  }
  return service;
}

export function catalogVersion(): number {
  return ensureLoaded().catalogVersion();
}

/**
 * The entitlement-scoped client projection: no `physical`, no unentitled members.
 *
 * The two capability axes are unioned here, and only here, because this is the one process that
 * legitimately holds both. `projectionFor` tests an entity's `rowEntitlementDomain` and an attribute's
 * `columnEntitlement` — which are DATA entitlements owned by EDM — against the caller's capability
 * list. A caller's platform capabilities alone therefore project an empty catalog, which is exactly
 * the symptom that led here: every entity filtered out, retrieval matching nothing, and generation
 * honestly reporting that it could not find the concepts.
 *
 * Keeping the union server-side matters: the browser never learns which data capabilities the caller
 * holds, only the resulting projection.
 */
export function projectionFor(user: UserContext, dataCapabilities: readonly string[] = []) {
  const caller: UserContext = {
    ...user,
    capabilities: [...user.capabilities, ...dataCapabilities],
  };
  return ensureLoaded().projectionFor(caller);
}

/** SERVER-ONLY. The gateway's logical→physical map. */
export function physicalMaps(): ReadonlyMap<QualifiedRef, PhysicalMap> {
  return ensureLoaded().physicalMaps();
}

export function physicalMapFor(entity: QualifiedRef): PhysicalMap | undefined {
  return ensureLoaded().physicalMapFor(entity);
}

export function primaryKeyFor(entity: QualifiedRef): readonly string[] | undefined {
  return ensureLoaded().primaryKeyFor(entity);
}
