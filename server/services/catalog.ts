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

import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';

import { CatalogService, type PhysicalMap, type RawCatalog } from '@opus/catalog';
import type { QualifiedRef, UserContext } from '@opus/contracts';

import { PATHS, catalogSeedPath } from '../config';

const service = new CatalogService();
let loaded = false;

/**
 * The published catalog if a promotion has produced one, else the checked-in seed.
 *
 * The order matters and is the whole reason `publishedCatalog` is a separate path: the seed is a
 * fixture, so a promotion writes beside it rather than over it. Deleting the published file is the
 * documented way back to the starting point.
 */
function ensureLoaded(): CatalogService {
  if (!loaded) {
    const path = existsSync(PATHS.publishedCatalog) ? PATHS.publishedCatalog : catalogSeedPath();
    service.hydrate(JSON.parse(readFileSync(path, 'utf8')) as RawCatalog);
    loaded = true;
  }
  return service;
}

/** SERVER-ONLY. The stored catalog, for a promotion that has to merge into what is published. */
export function storedCatalog(): RawCatalog | undefined {
  return ensureLoaded().stored();
}

/**
 * Install a promoted catalog: written first, then hydrated.
 *
 * That order is deliberate. Hydrating first and writing second means a failed write leaves a process
 * serving a catalog that does not survive its own restart — the promotion appears to have worked, and
 * un-does itself hours later. Writing first makes the persisted state the truth.
 */
export function publish(raw: RawCatalog): void {
  mkdirSync(dirname(PATHS.publishedCatalog), { recursive: true });
  const temporary = `${PATHS.publishedCatalog}.tmp`;
  writeFileSync(temporary, JSON.stringify(raw, null, 2), 'utf8');
  renameSync(temporary, PATHS.publishedCatalog);

  service.hydrate(raw);
  loaded = true;
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
