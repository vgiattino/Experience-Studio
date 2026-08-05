/**
 * Semantic Catalog Service (mocked).
 *
 * Stands in for the Catalog Service of architecture/backend-architecture.md §2.2. It is
 * the subsystem the original documentation reduced to a single arrow — "Metadata Context
 * Retrieval" — and the one that determines whether generation works at all.
 *
 * Two properties are reproduced faithfully because they are the architectural ones:
 *
 *  1. THE CLIENT PROJECTION OMITS `physical`. A definition never names a physical object,
 *     and neither does anything the model sees (schemas/README.md R6).
 *
 *  2. ENTITLEMENT FILTERING HAPPENS BEFORE RANKING (ai-architecture.md §3.2). Filtering
 *     afterwards has two failure modes, one of them a disclosure: a model told about a
 *     `clientPnL` attribute may name it in a title, and a definition bound to fields the
 *     author cannot see fails at preview — read as unreliable AI rather than as a boundary.
 */

import { Injectable, signal } from '@angular/core';
import type { QualifiedRef, UserContext } from '@opus/contracts';

import type {
  CatalogAttribute,
  CatalogEntity,
  CatalogMeasure,
  CatalogSnapshot,
  RawCatalog,
} from './types';

/** Physical mapping, resolved server-side only. Never leaves this service. */
export interface PhysicalMap {
  attributes: Record<string, string>;
  /** null means the measure needs no column (a count). */
  measures: Record<string, string | null>;
}

@Injectable({ providedIn: 'root' })
export class CatalogService {
  private raw: RawCatalog | null = null;
  private readonly physical = new Map<QualifiedRef, PhysicalMap>();

  readonly loaded = signal(false);
  readonly catalogVersion = signal(0);

  async load(url: string): Promise<void> {
    const response = await fetch(url);
    if (!response.ok) throw new Error(`Could not load catalog ${url}: HTTP ${response.status}`);
    this.hydrate((await response.json()) as RawCatalog);
  }

  /**
   * Install a catalog already in memory. Transport is not this service's concern — a server
   * deployment reads the catalog from its own store, and tests supply one directly.
   */
  hydrate(raw: RawCatalog): void {
    this.raw = raw;
    this.physical.clear();

    for (const [entityId, entity] of Object.entries(raw.entities)) {
      const attributes: Record<string, string> = {};
      const measures: Record<string, string | null> = {};
      for (const [id, attribute] of Object.entries(entity.attributes ?? {})) {
        attributes[id] = attribute.physical?.ref ?? id;
      }
      for (const [id, measure] of Object.entries(entity.measures ?? {})) {
        measures[id] = measure.physical?.ref ?? null;
      }
      this.physical.set(entityId, { attributes, measures });
    }

    this.catalogVersion.set(raw.catalogVersion);
    this.loaded.set(true);
  }

  /**
   * SERVER-SIDE ONLY. The logical→physical map the gateway needs. Exposed here because M1
   * has no server; in production this never crosses the network.
   */
  physicalMapFor(entityId: QualifiedRef): PhysicalMap | undefined {
    return this.physical.get(entityId);
  }

  physicalMaps(): ReadonlyMap<QualifiedRef, PhysicalMap> {
    return this.physical;
  }

  /**
   * SERVER-SIDE ONLY. The entity's logical primary key, unfiltered by entitlement — the
   * gateway needs it to resolve a countable measure even for a caller who cannot see the
   * entity, because the decision to deny happens after the query is understood, not before.
   */
  primaryKeyFor(entityId: QualifiedRef): readonly string[] | undefined {
    return this.raw?.entities[entityId]?.primaryKey;
  }

  /** Entity ids in the stored catalog, irrespective of entitlement. Server-side only. */
  entityIds(): QualifiedRef[] {
    return Object.keys(this.raw?.entities ?? {});
  }

  /**
   * The catalog as this caller may see it: `physical` stripped, and every attribute or
   * measure whose column entitlement the caller lacks removed entirely — not blanked.
   * An attribute name is itself sometimes sensitive.
   */
  projectionFor(user: UserContext): CatalogSnapshot {
    const raw = this.raw;
    if (!raw) throw new Error('CatalogService.load() must be called first');

    const held = new Set(user.capabilities);
    const permitted = (entitlement: string | undefined): boolean =>
      entitlement === undefined || held.has(entitlement);

    const entities: Record<QualifiedRef, CatalogEntity> = {};

    for (const [entityId, entity] of Object.entries(raw.entities)) {
      // A caller with no row entitlement for the entity does not see the entity at all.
      if (!permitted(entity.rowEntitlementDomain)) continue;

      const attributes: Record<string, CatalogAttribute> = {};
      for (const [id, attribute] of Object.entries(entity.attributes ?? {})) {
        if (!permitted(attribute.columnEntitlement)) continue;
        const { physical: _physical, ...rest } = attribute;
        attributes[id] = { ...rest, entityId };
      }

      const measures: Record<string, CatalogMeasure> = {};
      for (const [id, measure] of Object.entries(entity.measures ?? {})) {
        if (!permitted(measure.columnEntitlement)) continue;
        const { physical: _physical, ...rest } = measure;
        measures[id] = { ...rest, entityId };
      }

      entities[entityId] = {
        id: entityId,
        businessName: entity.businessName,
        pluralName: entity.pluralName,
        synonyms: entity.synonyms ?? [],
        description: entity.description,
        domain: entity.domain,
        primaryKey: entity.primaryKey,
        labelAttribute: entity.labelAttribute,
        effectiveDating: entity.effectiveDating,
        sensitivity: entity.sensitivity,
        cost: entity.cost,
        defaultDetailExperience: entity.defaultDetailExperience,
        aiHints: entity.aiHints,
        attributes,
        measures,
      };
    }

    const relationships = Object.values(raw.relationships ?? {}).filter(
      (r) => entities[r.from] !== undefined && entities[r.to] !== undefined,
    );

    return {
      catalogVersion: raw.catalogVersion,
      tenantId: raw.tenantId,
      entities,
      relationships,
    };
  }

  /** Every attribute and measure the caller may see, flattened for retrieval. */
  searchableConcepts(snapshot: CatalogSnapshot): {
    entities: CatalogEntity[];
    attributes: CatalogAttribute[];
    measures: CatalogMeasure[];
  } {
    const entities = Object.values(snapshot.entities);
    return {
      entities,
      attributes: entities.flatMap((e) => Object.values(e.attributes)),
      measures: entities.flatMap((e) => Object.values(e.measures)),
    };
  }
}
