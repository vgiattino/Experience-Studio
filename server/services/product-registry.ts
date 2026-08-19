/**
 * The Product Experience Registry, as the server holds it (FR-20…FR-24).
 *
 * Reads every `products/*.product.json`, composes them through `@opus/product-registry`, and answers
 * the two questions the rest of the server has: which products exist, and which product an experience
 * belongs to.
 *
 * ── WHY IT LOADS, RATHER THAN IMPORTING ──────────────────────────────────────
 *
 * The registrations are data on disk, read at runtime, not modules compiled in. That is the point of
 * FR-20: a deployment adds a product by putting a file in a directory, and nothing rebuilds. It also
 * means a malformed registration is a startup diagnostic rather than a build failure, which is the
 * right failure mode for something an operator edits.
 *
 * ── WHY DERIVING THE PRODUCT BEATS STORING IT ────────────────────────────────
 *
 * `productOf()` resolves an experience's product from the entities its data sources read. The
 * alternative — a field the author fills in — produces a label that can be wrong and, worse, stays
 * wrong: a page whose data sources are all repointed at another product keeps its old badge forever.
 * Reading it from the data sources means the answer changes when the page does.
 *
 * The interesting case is an experience spanning two products. That is not resolved. The PRD flags
 * cross-product experiences as unaddressed (FR-3's assumption note), and the two ways of resolving it
 * are both worse than reporting it: picking the majority product mislabels the artifact silently, and
 * refusing the save blocks a page that renders perfectly well.
 */

import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

import type { CatalogSnapshot } from '@opus/catalog';
import type { ExperienceDefinition, PageDefinition } from '@opus/contracts';
import {
  checkGrounding,
  composeRegistry,
  groundingFor,
  identifyProduct,
  productsSpanning,
  type ComposedRegistry,
  type ProductGrounding,
  type ProductIdentification,
  type ProductRegistration,
  type RegistryProblem,
} from '@opus/product-registry';

import { PATHS, productsDir } from '../config';
import { storedCatalog } from './catalog';

/** One line per product for the API and for the startup log. */
export interface ProductView {
  id: string;
  name: string;
  description?: string;
  status: string;
  icon?: string;
  domains: string[];
  counts: {
    templates: number;
    systemPages: number;
    systemJourneys: number;
    actions: number;
    components: number;
    terms: number;
  };
  /** Entities of this tenant's catalog the product owns. Empty means registered but not ingested here. */
  entityCount: number;
  ungrounded: boolean;
  unknownDomains: string[];
}

interface LoadedRegistry {
  registry: ComposedRegistry;
  problems: RegistryProblem[];
  /** Registrations that could not be read at all, by file name. */
  unreadable: { file: string; reason: string }[];
}

let cache: LoadedRegistry | null = null;

/**
 * The component types a product may claim, read as JSON off disk.
 *
 * Not through `@opus/component-registry` — its entries resolve the Angular component alongside each
 * manifest, which would pull the framework into this process for information the JSON already holds.
 * `PATHS.components` and `validate-experience.ts` take the same route for the same reason.
 */
function knownComponentTypes(): string[] {
  if (!existsSync(PATHS.components)) return [];
  const types: string[] = [];
  for (const dir of readdirSync(PATHS.components, { withFileTypes: true })) {
    if (!dir.isDirectory()) continue;
    const dirPath = join(PATHS.components, dir.name);
    for (const file of readdirSync(dirPath).filter((f) => f.endsWith('.manifest.json'))) {
      try {
        types.push(JSON.parse(readFileSync(join(dirPath, file), 'utf8')).type);
      } catch {
        // A manifest that will not parse is reported by `npm run validate`, not here — this function
        // exists to build a list, and failing the whole registry over one unreadable manifest would
        // turn a component problem into a product problem.
      }
    }
  }
  return types.filter(Boolean);
}

function load(): LoadedRegistry {
  const dir = productsDir();
  const registrations: ProductRegistration[] = [];
  const unreadable: { file: string; reason: string }[] = [];

  if (existsSync(dir)) {
    for (const file of readdirSync(dir).filter((f) => f.endsWith('.product.json')).sort()) {
      try {
        registrations.push(JSON.parse(readFileSync(join(dir, file), 'utf8')) as ProductRegistration);
      } catch (error) {
        unreadable.push({ file, reason: error instanceof Error ? error.message : String(error) });
      }
    }
  }

  const registry = composeRegistry(registrations, knownComponentTypes());
  const problems = [...registry.problems];
  const snapshot = catalogSnapshot();
  if (snapshot) problems.push(...checkGrounding(registry, snapshot));

  return { registry, problems, unreadable };
}

/** Reload from disk. Called by the tests, and by anything that has just written a registration. */
export function reloadProducts(): void {
  cache = null;
}

export function products(): ComposedRegistry {
  cache ??= load();
  return cache.registry;
}

export function productProblems(): RegistryProblem[] {
  cache ??= load();
  return cache.problems;
}

export function unreadableRegistrations(): { file: string; reason: string }[] {
  cache ??= load();
  return cache.unreadable;
}

/**
 * The published catalog as a snapshot, or `undefined` before anything has been promoted.
 *
 * The *full* catalog, not a caller's entitlement-scoped projection. Which product owns an entity is a
 * property of the catalog, not of who is looking at it, and resolving it from a projection would make
 * an experience's product depend on the persona that happened to save it.
 */
function catalogSnapshot(): CatalogSnapshot | undefined {
  const raw = storedCatalog();
  if (!raw) return undefined;
  return {
    catalogVersion: raw.catalogVersion,
    tenantId: raw.tenantId,
    entities: raw.entities as unknown as CatalogSnapshot['entities'],
    relationships: Object.values(raw.relationships ?? {}) as unknown as CatalogSnapshot['relationships'],
  };
}

export function productViews(): ProductView[] {
  const snapshot = catalogSnapshot();
  return products().products.map((p) => {
    const grounding: ProductGrounding | undefined = snapshot ? groundingFor(p, snapshot) : undefined;
    return {
      id: p.id,
      name: typeof p.name === 'string' ? p.name : p.name.default,
      description: p.description,
      status: p.status ?? 'active',
      icon: p.icon,
      domains: p.metadata?.domains ?? [],
      counts: {
        templates: p.templates?.length ?? 0,
        systemPages: p.systemPages?.length ?? 0,
        systemJourneys: p.systemJourneys?.length ?? 0,
        actions: p.actions?.length ?? 0,
        components: p.components?.length ?? 0,
        terms: p.aiContext?.terminology?.length ?? 0,
      },
      entityCount: grounding?.entityIds.length ?? 0,
      // Unknown rather than false when there is no catalog yet: claiming a product is grounded before
      // anything has been promoted would be a guess dressed as a fact.
      ungrounded: grounding?.ungrounded ?? true,
      unknownDomains: grounding?.unknownDomains ?? [],
    };
  });
}

/** Every entity an experience's data sources read, across the experience and all of its pages. */
export function entitiesRead(definition: ExperienceDefinition): string[] {
  const entities = new Set<string>();
  for (const source of Object.values(definition.dataSources ?? {})) {
    if (source?.entity) entities.add(source.entity);
  }
  for (const page of Object.values(definition.pages ?? {})) {
    const pageDefinition = page as PageDefinition;
    for (const source of Object.values(pageDefinition.dataSources ?? {})) {
      if (source?.entity) entities.add(source.entity);
    }
  }
  return [...entities].sort();
}

export type ProductResolution =
  | { outcome: 'resolved'; productId: string; entityCount: number }
  /** Reads nothing, or reads only entities no product claims. */
  | { outcome: 'unclaimed'; unclaimed: string[] }
  /** Reads two or more products' data. Recorded, not resolved — see the file header. */
  | { outcome: 'spans'; productIds: string[] }
  /** No catalog has been promoted, so ownership of an entity cannot be established. */
  | { outcome: 'noCatalog' };

/**
 * Which product an experience belongs to, from what it reads.
 */
export function productOf(definition: ExperienceDefinition): ProductResolution {
  const snapshot = catalogSnapshot();
  if (!snapshot) return { outcome: 'noCatalog' };

  const entities = entitiesRead(definition);
  const { productIds, unclaimed } = productsSpanning(entities, products(), snapshot);

  if (productIds.length === 1) {
    return { outcome: 'resolved', productId: productIds[0]!, entityCount: entities.length - unclaimed.length };
  }
  if (productIds.length > 1) return { outcome: 'spans', productIds };
  return { outcome: 'unclaimed', unclaimed };
}

/**
 * FR-3, for the generation service: which product a prompt concerns.
 *
 * Thin on purpose — the decision lives in `@opus/product-registry` so it is testable without a server,
 * and this exists only to supply the registry and the catalog.
 */
export function identifyProductFromPrompt(prompt: string): ProductIdentification {
  return identifyProduct(prompt, products(), catalogSnapshot());
}
