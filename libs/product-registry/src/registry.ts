/**
 * The Product Experience Registry (FR-20…FR-24).
 *
 * Two jobs, deliberately separate, because they fail for different reasons and a caller usually wants
 * one of them:
 *
 *  1. CHECK ONE REGISTRATION. Internal consistency — a journey step naming a page nobody ships, a role
 *     granting a capability nobody defined, an action gated on a capability that does not exist. These
 *     are mistakes by the product author, findable without knowing what else is registered.
 *
 *  2. COMPOSE MANY. The rules that only exist between products — two products claiming the same catalog
 *     domain, two registering the same component type, the same word meaning two different things. This
 *     is the layer that makes "the portfolio" a thing rather than a list.
 *
 * ── WHY REFUSING IS THE POINT ────────────────────────────────────────────────
 *
 * The single load-bearing rule here is that **a catalog domain resolves to exactly one product**. Without
 * it, product identification (FR-3) is undecidable: a prompt about exceptions could belong to either
 * claimant and the platform would have to guess, or worse, pick the first one loaded. Making that a
 * blocking problem at composition time means the ambiguity is a registration bug caught once, rather
 * than a wrong answer produced quietly forever.
 *
 * ── AND WHY THERE IS NO PRODUCT NAME IN THIS FILE ────────────────────────────
 *
 * FR-20 says the platform core contains no product-specific logic. That is easy to satisfy by accident
 * while no products exist, so it is worth stating as a rule with teeth: nothing under `libs/` or
 * `server/` may branch on a product id. Everything a product needs the platform to know is a field in
 * `contract.ts`. `registry.spec.ts` exercises that with a product this codebase has never heard of.
 */

import type { CatalogSnapshot } from '@opus/catalog';
import type { ComponentTypeRef } from '@opus/contracts';
import { text } from '@opus/experience-model';

import type { ProductRegistration } from './contract';

export type RegistryProblemSeverity = 'blocking' | 'warning';

export interface RegistryProblem {
  severity: RegistryProblemSeverity;
  /** Machine-readable so a caller can branch; the message is for a human. */
  code:
    | 'duplicateProduct'
    | 'domainClaimedTwice'
    | 'componentClaimedTwice'
    | 'unknownComponentType'
    | 'extensionFamilyMissing'
    | 'journeyStepUnknown'
    | 'unknownCapability'
    | 'duplicateTerm'
    | 'termCollision'
    | 'ungroundedProduct'
    | 'emptyRegistration';
  /** The product the problem belongs to; both products for a collision. */
  productIds: string[];
  message: string;
}

/** One product, joined to the catalog it claims. */
export interface ProductGrounding {
  productId: string;
  /** Entity refs from the snapshot this product owns. */
  entityIds: string[];
  /** Domains claimed that the snapshot does not contain — a registration ahead of its ingestion. */
  unknownDomains: string[];
  /** True when the product owns nothing in this tenant's catalog. Not an error; see below. */
  ungrounded: boolean;
}

export interface ComposedRegistry {
  products: ProductRegistration[];
  problems: RegistryProblem[];
  /** domain → product id. The index product identification and ownership inference both read. */
  domainOwner: Map<string, string>;
  /** component type → product id, for the types products contribute. */
  componentOwner: Map<ComponentTypeRef, string>;
}

function blocking(problems: readonly RegistryProblem[]): RegistryProblem[] {
  return problems.filter((p) => p.severity === 'blocking');
}

/** Convenience for callers that only want to know whether they may proceed. */
export function blockingRegistryProblems(problems: readonly RegistryProblem[]): RegistryProblem[] {
  return blocking(problems);
}

// ── 1. one registration ──────────────────────────────────────────────────────

/**
 * Check one registration for internal consistency.
 *
 * `knownComponentTypes` is passed in rather than imported from `@opus/component-registry` so this
 * library stays free of an Angular dependency — the component registry's entries are lazy `import()`s
 * of Angular components, and pulling it in would make the product registry unusable on the server.
 * The caller holds whichever list it has: the real registry in the browser, the manifest file names on
 * the server.
 */
export function checkRegistration(
  product: ProductRegistration,
  knownComponentTypes: readonly string[] = [],
): RegistryProblem[] {
  const problems: RegistryProblem[] = [];
  const at = (severity: RegistryProblemSeverity, code: RegistryProblem['code'], message: string) =>
    problems.push({ severity, code, productIds: [product.id], message });

  const name = text(product.name, product.id);

  // ── components
  const known = new Set(knownComponentTypes);
  for (const component of product.components ?? []) {
    if (known.size > 0 && !known.has(component.type)) {
      at(
        'blocking',
        'unknownComponentType',
        `${name} registers component "${component.type}", which no manifest defines. A registration cannot bring a component into existence — the manifest and the implementation come first, and the registration says whose it is.`,
      );
    }
    if (component.family === 'extension' && !component.extensionFamily) {
      at(
        'blocking',
        'extensionFamilyMissing',
        `${name} registers "${component.type}" in the extension family without naming the family. FR-30 allows an extension family only when it is declared, so that a component which does not fit the six is visible rather than quietly uncategorised.`,
      );
    }
  }

  // ── system journeys must walk pages this product ships
  const pageIds = new Set((product.systemPages ?? []).map((p) => p.id));
  for (const journey of product.systemJourneys ?? []) {
    for (const step of journey.steps) {
      if (!pageIds.has(step)) {
        at(
          'blocking',
          'journeyStepUnknown',
          `System Journey "${text(journey.name, journey.id)}" steps through "${step}", which ${name} does not register as a System Page. A journey through a page nobody ships is a dead end for every customer who follows it.`,
        );
      }
    }
  }

  // ── roles and actions may only reference capabilities this product registered
  const capabilities = new Set((product.security?.capabilities ?? []).map((c) => c.id));
  for (const role of product.security?.roles ?? []) {
    for (const capability of role.capabilities ?? []) {
      if (!capabilities.has(capability)) {
        at(
          'blocking',
          'unknownCapability',
          `Role "${role.id}" grants capability "${capability}", which ${name} does not register. FR-23's point is that permissions come from a product's registration — a role granting an undeclared capability grants nothing enforceable.`,
        );
      }
    }
  }
  for (const action of product.actions ?? []) {
    if (action.capability && !capabilities.has(action.capability)) {
      at(
        'blocking',
        'unknownCapability',
        `Action "${action.id}" is gated on capability "${action.capability}", which ${name} does not register. An action gated on a capability nobody defined is an action gated on nothing.`,
      );
    }
  }

  // ── terminology
  const seenTerms = new Set<string>();
  for (const term of product.aiContext?.terminology ?? []) {
    const key = term.term.trim().toLowerCase();
    if (seenTerms.has(key)) {
      at(
        'blocking',
        'duplicateTerm',
        `"${term.term}" is defined twice in ${name}'s AI Context. Two meanings for one word inside one product is not a specialisation, it is a contradiction, and whichever the AI reads first wins.`,
      );
    }
    seenTerms.add(key);
  }

  // ── a registration that contributes nothing
  const contributes =
    (product.metadata?.domains?.length ?? 0) +
    (product.metadata?.entities?.length ?? 0) +
    (product.components?.length ?? 0) +
    (product.templates?.length ?? 0) +
    (product.systemPages?.length ?? 0) +
    (product.actions?.length ?? 0) +
    (product.aiContext?.terminology?.length ?? 0);
  if (contributes === 0) {
    at(
      'warning',
      'emptyRegistration',
      `${name} registers nothing — no metadata, components, templates, System Pages, actions or vocabulary. Legal, and worth saying out loud: a product in this state is invisible to generation, the palette and the catalog alike.`,
    );
  }

  return problems;
}

// ── 2. the portfolio ─────────────────────────────────────────────────────────

/**
 * Compose many registrations into a registry.
 *
 * Returns every product it was given, including ones carrying blocking problems. Dropping them would
 * hide the cause: a caller that refuses to start needs to be able to say which two products collided,
 * and a caller that starts anyway (a dev tenant, a diagnostic screen) still wants the list.
 */
export function composeRegistry(
  registrations: readonly ProductRegistration[],
  knownComponentTypes: readonly string[] = [],
): ComposedRegistry {
  const problems: RegistryProblem[] = [];
  const domainOwner = new Map<string, string>();
  const componentOwner = new Map<ComponentTypeRef, string>();
  const termMeaning = new Map<string, { productId: string; means: string }>();
  const seenIds = new Set<string>();

  for (const product of registrations) {
    problems.push(...checkRegistration(product, knownComponentTypes));

    if (seenIds.has(product.id)) {
      problems.push({
        severity: 'blocking',
        code: 'duplicateProduct',
        productIds: [product.id],
        message: `Two registrations share the id "${product.id}". A product id is how an Experience records which product it belongs to; two products answering to one id makes that record meaningless.`,
      });
      continue;
    }
    seenIds.add(product.id);

    for (const domain of product.metadata?.domains ?? []) {
      const incumbent = domainOwner.get(domain);
      if (incumbent && incumbent !== product.id) {
        problems.push({
          severity: 'blocking',
          code: 'domainClaimedTwice',
          productIds: [incumbent, product.id],
          message: `Catalog domain "${domain}" is claimed by both "${incumbent}" and "${product.id}". A domain resolves to one product; two claimants makes product identification undecidable, and the platform refuses the pair rather than picking one and being quietly wrong about every prompt that touches it.`,
        });
        continue;
      }
      domainOwner.set(domain, product.id);
    }

    for (const component of product.components ?? []) {
      const incumbent = componentOwner.get(component.type);
      if (incumbent && incumbent !== product.id) {
        problems.push({
          severity: 'blocking',
          code: 'componentClaimedTwice',
          productIds: [incumbent, product.id],
          message: `Component "${component.type}" is registered by both "${incumbent}" and "${product.id}". A component has one owner — the product that maintains it — and shared ownership means neither can change it.`,
        });
        continue;
      }
      componentOwner.set(component.type, product.id);
    }

    for (const term of product.aiContext?.terminology ?? []) {
      const key = term.term.trim().toLowerCase();
      const incumbent = termMeaning.get(key);
      if (incumbent && incumbent.productId !== product.id && incumbent.means !== term.means) {
        problems.push({
          severity: 'warning',
          code: 'termCollision',
          productIds: [incumbent.productId, product.id],
          message: `"${term.term}" means different things in "${incumbent.productId}" and "${product.id}". Not an error — this is precisely why AI Context is registered per product rather than globally — but it does mean a prompt using that word alone cannot identify a product from it.`,
        });
      }
      if (!incumbent) termMeaning.set(key, { productId: product.id, means: term.means });
    }
  }

  return { products: [...registrations], problems, domainOwner, componentOwner };
}

// ── 3. the join to the catalog ───────────────────────────────────────────────

function domainOf(entityId: string, snapshot: CatalogSnapshot): string | undefined {
  const entity = snapshot.entities[entityId];
  if (entity?.domain) return entity.domain;
  // The catalog's ids are `domain.entity`; falling back to the prefix keeps grounding working for a
  // snapshot whose entities predate the `domain` field rather than reporting the product as ungrounded.
  const dot = entityId.indexOf('.');
  return dot > 0 ? entityId.slice(0, dot) : undefined;
}

/**
 * Which of a snapshot's entities this product owns.
 *
 * `ungrounded` is the interesting result. A product may be registered in a tenant whose catalog has
 * none of its data — a portfolio-wide registration list against a single-product deployment is the
 * normal case, not an edge one. Reporting that plainly is the alternative to two worse behaviours:
 * pretending the product is available and generating pages over nothing, or dropping it from the
 * registry so nobody can see it was ever meant to be there.
 */
export function groundingFor(
  product: ProductRegistration,
  snapshot: CatalogSnapshot,
): ProductGrounding {
  const domains = new Set(product.metadata?.domains ?? []);
  const explicit = new Set(product.metadata?.entities ?? []);
  const entityIds: string[] = [];

  for (const entityId of Object.keys(snapshot.entities)) {
    const domain = domainOf(entityId, snapshot);
    if (explicit.has(entityId) || (domain !== undefined && domains.has(domain))) {
      entityIds.push(entityId);
    }
  }

  const present = new Set(
    Object.keys(snapshot.entities)
      .map((id) => domainOf(id, snapshot))
      .filter((d): d is string => d !== undefined),
  );
  const unknownDomains = [...domains].filter((d) => !present.has(d));

  return {
    productId: product.id,
    entityIds: entityIds.sort(),
    unknownDomains,
    ungrounded: entityIds.length === 0,
  };
}

/**
 * Report which registered products have no metadata in this tenant.
 *
 * Separate from `composeRegistry` because it needs a catalog and composition does not — a registry can
 * be composed and checked at startup before any snapshot has been built, and a caller without a
 * snapshot should not be denied the structural checks.
 *
 * Every problem here is a warning. An ungrounded product is a normal deployment state, not a fault;
 * what would be a fault is failing to say so, because then a prompt in that product's vocabulary gets
 * grounded in somebody else's catalog and produces a fluent page about the wrong system.
 */
export function checkGrounding(
  registry: ComposedRegistry,
  snapshot: CatalogSnapshot,
): RegistryProblem[] {
  const problems: RegistryProblem[] = [];
  for (const product of registry.products) {
    if ((product.status ?? 'active') === 'deprecated') continue;
    const grounding = groundingFor(product, snapshot);
    if (!grounding.ungrounded) continue;
    const claimed = product.metadata?.domains ?? [];
    problems.push({
      severity: 'warning',
      code: 'ungroundedProduct',
      productIds: [product.id],
      message:
        claimed.length === 0
          ? `${text(product.name, product.id)} claims no catalog domains, so it owns nothing to generate against.`
          : `${text(product.name, product.id)} is registered but ungrounded in this tenant: it claims ${claimed.map((d) => `"${d}"`).join(', ')}, and the catalog holds none of them. Requests in its vocabulary can be identified but not built.`,
    });
  }
  return problems;
}

/**
 * Which product an entity belongs to, or `undefined` when nobody claims it.
 *
 * Unclaimed is a legitimate state: the platform's own catalog can hold entities no product has taken
 * ownership of, and a page over them is a page with no product — which the Experience model allows,
 * because `productId` is optional.
 */
export function productForEntity(
  entityId: string,
  registry: ComposedRegistry,
  snapshot: CatalogSnapshot,
): string | undefined {
  for (const product of registry.products) {
    if (product.metadata?.entities?.includes(entityId)) return product.id;
  }
  const domain = domainOf(entityId, snapshot);
  return domain === undefined ? undefined : registry.domainOwner.get(domain);
}

/**
 * Which products a set of entities spans — the question an Experience's ownership asks.
 *
 * Returns product ids in a stable order plus the entities nobody claims. More than one product is the
 * cross-product case the PRD flags as unspecified (FR-3's assumption note): this reports it rather
 * than resolving it, because resolving it is a product decision nobody has made.
 */
export function productsSpanning(
  entityIds: readonly string[],
  registry: ComposedRegistry,
  snapshot: CatalogSnapshot,
): { productIds: string[]; unclaimed: string[] } {
  const productIds = new Set<string>();
  const unclaimed: string[] = [];
  for (const entityId of entityIds) {
    const productId = productForEntity(entityId, registry, snapshot);
    if (productId) productIds.add(productId);
    else unclaimed.push(entityId);
  }
  return { productIds: [...productIds].sort(), unclaimed: unclaimed.sort() };
}
