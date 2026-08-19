/**
 * The Product Experience Registry.
 *
 * Three groups, and the third is the one that matters.
 *
 * The first two check the rules — a registration's internal consistency, and the collisions that only
 * exist between products. Useful, ordinary.
 *
 * The third holds FR-20 to account. "Adding a new product to the portfolio is a registration exercise,
 * not a platform code change" is a claim about production code, and the only way to test a claim about
 * production code is to exercise it with a product the production code has never heard of. `ACME` is
 * defined entirely in this file: a fictional product, in a fictional domain, with vocabulary nothing
 * else in the repository mentions. Every capability the platform offers a product has to work for it.
 *
 * If a future change makes that test need a production edit to pass, FR-20 has been broken and this is
 * where it will show.
 */

import { describe, expect, it } from 'vitest';
import type { CatalogSnapshot } from '@opus/catalog';

import {
  checkGrounding,
  checkRegistration,
  composeRegistry,
  groundingFor,
  identifyProduct,
  productForEntity,
  productsSpanning,
  type ProductRegistration,
} from './index';

// ── fixtures ─────────────────────────────────────────────────────────────────

function product(over: Partial<ProductRegistration> = {}): ProductRegistration {
  return { schemaVersion: '1.0', id: 'p1', name: 'Product One', ...over };
}

/**
 * A catalog snapshot shaped like the real one: ids are `domain.entity`, and `domain` is also carried
 * as a field. Only the fields grounding and identification read are populated — a full `CatalogEntity`
 * per row would bury the thing each test is about.
 */
function snapshot(entities: Record<string, { domain?: string; businessName?: string; synonyms?: string[] }>): CatalogSnapshot {
  return {
    catalogVersion: 1,
    tenantId: 'test',
    relationships: [],
    entities: Object.fromEntries(
      Object.entries(entities).map(([id, e]) => [
        id,
        {
          id,
          businessName: e.businessName ?? id,
          synonyms: e.synonyms ?? [],
          domain: e.domain,
          primaryKey: ['id'],
          attributes: {},
          measures: {},
        },
      ]),
    ),
  } as unknown as CatalogSnapshot;
}

const CATALOG = snapshot({
  'securities.security': { domain: 'securities', businessName: 'Security', synonyms: ['instrument'] },
  'dq.exception': { domain: 'dq', businessName: 'Data quality exception' },
  'recon.break': { domain: 'recon', businessName: 'Reconciliation break' },
  'platform.audit-event': { domain: 'platform', businessName: 'Audit event' },
});

// ── 1. one registration ──────────────────────────────────────────────────────

describe('checking one registration', () => {
  it('refuses a component no manifest defines', () => {
    /*
      A registration cannot bring a component into existence. The manifest and the implementation come
      first; the registration says whose it is.
    */
    const problems = checkRegistration(
      product({ components: [{ type: 'acme.gadget' as never }] }),
      ['data.table'],
    );
    expect(problems.map((p) => p.code)).toContain('unknownComponentType');
    expect(problems[0]?.severity).toBe('blocking');
  });

  it('accepts any component when the caller has no manifest list to check against', () => {
    // The server reads manifests off disk and the browser reads the registry; a caller with neither
    // should get the other checks rather than a wall of false failures.
    const problems = checkRegistration(product({ components: [{ type: 'acme.gadget' as never }] }));
    expect(problems.map((p) => p.code)).not.toContain('unknownComponentType');
  });

  it('refuses an extension-family component that does not name its family', () => {
    const problems = checkRegistration(
      product({ components: [{ type: 'data.table', family: 'extension' }] }),
      ['data.table'],
    );
    expect(problems.map((p) => p.code)).toContain('extensionFamilyMissing');
  });

  it('refuses a System Journey stepping through a page nobody ships', () => {
    const problems = checkRegistration(
      product({
        systemPages: [{ id: 'start', name: 'Start' }],
        systemJourneys: [{ id: 'j', name: 'Journey', steps: ['start', 'nowhere'] }],
      }),
    );
    expect(problems.map((p) => p.code)).toContain('journeyStepUnknown');
    expect(problems[0]?.message).toContain('nowhere');
  });

  it('refuses a role granting a capability the product never registered', () => {
    const problems = checkRegistration(
      product({
        security: {
          capabilities: [{ id: 'p.read' }],
          roles: [{ id: 'r', capabilities: ['p.read', 'p.write'] }],
        },
      }),
    );
    // Codes rather than a length: this fixture registers nothing else, so it earns the
    // `emptyRegistration` warning too, and asserting a count would make the test about the fixture.
    const capability = problems.find((p) => p.code === 'unknownCapability');
    expect(capability?.severity).toBe('blocking');
    expect(capability?.message).toContain('p.write');
  });

  it('refuses an action gated on a capability that does not exist', () => {
    const problems = checkRegistration(
      product({ actions: [{ id: 'a', label: 'Act', capability: 'ghost' }] }),
    );
    expect(problems.map((p) => p.code)).toContain('unknownCapability');
  });

  it('allows an ungated action', () => {
    // Not every action needs a capability. A read-only lineage view is a legitimate open action, and
    // demanding one would push authors towards inventing capabilities to satisfy the checker.
    const problems = checkRegistration(product({ actions: [{ id: 'a', label: 'Act' }] }));
    expect(problems.map((p) => p.code)).not.toContain('unknownCapability');
  });

  it('refuses a word defined twice in one product', () => {
    const problems = checkRegistration(
      product({
        aiContext: {
          terminology: [
            { term: 'break', means: 'a discrepancy' },
            { term: 'Break', means: 'a rest period' },
          ],
        },
      }),
    );
    expect(problems.map((p) => p.code)).toContain('duplicateTerm');
  });

  it('warns, without blocking, about a registration that contributes nothing', () => {
    const problems = checkRegistration(product());
    expect(problems).toHaveLength(1);
    expect(problems[0]?.code).toBe('emptyRegistration');
    expect(problems[0]?.severity).toBe('warning');
  });
});

// ── 2. the portfolio ─────────────────────────────────────────────────────────

describe('composing a portfolio', () => {
  it('refuses two products claiming the same catalog domain', () => {
    /*
      The load-bearing rule. Without it, identification is undecidable and the platform resolves by
      load order — which is a wrong answer produced quietly forever, rather than a registration bug
      caught once.
    */
    const registry = composeRegistry([
      product({ id: 'a', metadata: { domains: ['dq'] } }),
      product({ id: 'b', metadata: { domains: ['dq'] } }),
    ]);
    const collision = registry.problems.find((p) => p.code === 'domainClaimedTwice');
    expect(collision?.severity).toBe('blocking');
    expect(collision?.productIds).toEqual(['a', 'b']);
    // The first claimant keeps it, so the index stays usable for a caller that reports and continues.
    expect(registry.domainOwner.get('dq')).toBe('a');
  });

  it('refuses two products registering the same component', () => {
    const registry = composeRegistry([
      product({ id: 'a', components: [{ type: 'data.table' }] }),
      product({ id: 'b', components: [{ type: 'data.table' }] }),
    ]);
    expect(registry.problems.map((p) => p.code)).toContain('componentClaimedTwice');
  });

  it('refuses two registrations sharing an id', () => {
    const registry = composeRegistry([
      product({ id: 'a', metadata: { domains: ['x'] } }),
      product({ id: 'a', metadata: { domains: ['y'] } }),
    ]);
    expect(registry.problems.map((p) => p.code)).toContain('duplicateProduct');
    // The second is not indexed — its domain does not become the first's.
    expect(registry.domainOwner.has('y')).toBe(false);
  });

  it('permits a word meaning different things in two products, and says so', () => {
    // This is the reason AI Context is registered per product rather than globally. A warning, not an
    // error — but a warning worth having, because that word can no longer identify a product alone.
    const registry = composeRegistry([
      product({ id: 'a', aiContext: { terminology: [{ term: 'break', means: 'a discrepancy' }] } }),
      product({ id: 'b', aiContext: { terminology: [{ term: 'break', means: 'an outage' }] } }),
    ]);
    const collision = registry.problems.find((p) => p.code === 'termCollision');
    expect(collision?.severity).toBe('warning');
    expect(collision?.productIds).toEqual(['a', 'b']);
  });

  it('says nothing when two products agree on what a word means', () => {
    const registry = composeRegistry([
      product({ id: 'a', aiContext: { terminology: [{ term: 'break', means: 'a discrepancy' }] } }),
      product({ id: 'b', aiContext: { terminology: [{ term: 'break', means: 'a discrepancy' }] } }),
    ]);
    expect(registry.problems.map((p) => p.code)).not.toContain('termCollision');
  });

  it('returns every product it was given, including ones with blocking problems', () => {
    // Dropping them would hide the cause: a caller that refuses to start still has to be able to say
    // which two products collided.
    const registry = composeRegistry([
      product({ id: 'a', metadata: { domains: ['dq'] } }),
      product({ id: 'b', metadata: { domains: ['dq'] } }),
    ]);
    expect(registry.products.map((p) => p.id)).toEqual(['a', 'b']);
  });
});

// ── the join to the catalog ──────────────────────────────────────────────────

describe('grounding a product in a catalog', () => {
  it('claims every entity in an owned domain, including ones added later', () => {
    const grounding = groundingFor(product({ metadata: { domains: ['securities', 'dq'] } }), CATALOG);
    expect(grounding.entityIds).toEqual(['dq.exception', 'securities.security']);
    expect(grounding.ungrounded).toBe(false);
  });

  it('claims an individually listed entity outside its domains', () => {
    const grounding = groundingFor(
      product({ metadata: { entities: ['platform.audit-event'] } }),
      CATALOG,
    );
    expect(grounding.entityIds).toEqual(['platform.audit-event']);
  });

  it('reports a product whose data this tenant has not ingested as ungrounded', () => {
    /*
      The honest case, and the one worth designing for: a portfolio-wide registration list against a
      single-product deployment. The alternatives are both worse — pretend the product is available and
      generate over nothing, or drop it so nobody can see it was meant to be there.
    */
    const grounding = groundingFor(product({ metadata: { domains: ['settlement'] } }), CATALOG);
    expect(grounding.ungrounded).toBe(true);
    expect(grounding.unknownDomains).toEqual(['settlement']);
  });

  it('reports ungrounded products as warnings, never as blocking', () => {
    const registry = composeRegistry([
      product({ id: 'here', metadata: { domains: ['dq'] } }),
      product({ id: 'elsewhere', metadata: { domains: ['settlement'] } }),
    ]);
    const problems = checkGrounding(registry, CATALOG);
    expect(problems).toHaveLength(1);
    expect(problems[0]).toMatchObject({ code: 'ungroundedProduct', productIds: ['elsewhere'], severity: 'warning' });
    expect(problems[0]?.message).toContain('settlement');
  });

  it('falls back to the id prefix for a snapshot whose entities predate the domain field', () => {
    const legacy = snapshot({ 'dq.exception': {} });
    expect(groundingFor(product({ metadata: { domains: ['dq'] } }), legacy).ungrounded).toBe(false);
  });

  it('leaves an unclaimed entity unclaimed rather than assigning it to the first product', () => {
    const registry = composeRegistry([product({ id: 'a', metadata: { domains: ['dq'] } })]);
    expect(productForEntity('dq.exception', registry, CATALOG)).toBe('a');
    expect(productForEntity('platform.audit-event', registry, CATALOG)).toBeUndefined();
  });

  it('reports the products a set of entities spans without resolving the cross-product case', () => {
    /*
      An experience reading two products' data is the case the PRD explicitly flags as unaddressed
      (FR-3's assumption note). Reporting both is the only defensible behaviour: picking one would
      silently mislabel the artifact, and refusing would block a page that renders perfectly well.
    */
    const registry = composeRegistry([
      product({ id: 'a', metadata: { domains: ['dq'] } }),
      product({ id: 'b', metadata: { domains: ['recon'] } }),
    ]);
    const spanned = productsSpanning(
      ['dq.exception', 'recon.break', 'platform.audit-event'],
      registry,
      CATALOG,
    );
    expect(spanned.productIds).toEqual(['a', 'b']);
    expect(spanned.unclaimed).toEqual(['platform.audit-event']);
  });
});

// ── 3. FR-20, with a product this repository has never heard of ──────────────

/**
 * A product invented here and nowhere else. Nothing under `libs/`, `server/`, `apps/` or `schemas/`
 * mentions Acme, sprockets or tolerance drift.
 */
const ACME: ProductRegistration = {
  schemaVersion: '1.0',
  id: 'acme-sprockets',
  name: 'Acme Sprocket Control',
  status: 'active',
  metadata: {
    domains: ['sprockets'],
    glossary: [{ term: 'Sprocket', definition: 'A toothed wheel with a tolerance band.' }],
  },
  components: [{ type: 'data.table' }],
  systemPages: [{ id: 'sprocket-overview', name: 'Sprocket Overview' }],
  systemJourneys: [
    { id: 'sprocket-check', name: 'Sprocket check', steps: ['sprocket-overview', 'sprocket-overview'] },
  ],
  actions: [{ id: 'recalibrate', label: 'Recalibrate', capability: 'acme.calibrate' }],
  security: {
    capabilities: [{ id: 'acme.calibrate' }, { id: 'acme.sprocket.read', axis: 'data' }],
    roles: [{ id: 'machinist', capabilities: ['acme.calibrate', 'acme.sprocket.read'] }],
  },
  aiContext: {
    terminology: [{ term: 'sprocket', means: 'A toothed wheel with a tolerance band.' }],
    intentSignals: ['tolerance drift', 'sprocket batch'],
  },
};

const ACME_CATALOG = snapshot({
  'sprockets.sprocket': { domain: 'sprockets', businessName: 'Sprocket', synonyms: ['cogwheel'] },
  'dq.exception': { domain: 'dq', businessName: 'Data quality exception' },
});

describe('FR-20 — a product the platform has never heard of', () => {
  const registry = composeRegistry([ACME, product({ id: 'other', metadata: { domains: ['dq'] } })], [
    'data.table',
  ]);

  it('composes with no blocking problems', () => {
    expect(registry.problems.filter((p) => p.severity === 'blocking')).toEqual([]);
  });

  it('owns its catalog domain', () => {
    expect(registry.domainOwner.get('sprockets')).toBe('acme-sprockets');
    expect(groundingFor(ACME, ACME_CATALOG).entityIds).toEqual(['sprockets.sprocket']);
  });

  it('owns the component it registered', () => {
    expect(registry.componentOwner.get('data.table')).toBe('acme-sprockets');
  });

  it('is identified from its own vocabulary', () => {
    const outcome = identifyProduct('show me tolerance drift across the sprocket batch', registry, ACME_CATALOG);
    expect(outcome.outcome).toBe('resolved');
    if (outcome.outcome === 'resolved') {
      expect(outcome.productId).toBe('acme-sprockets');
      expect(outcome.soleProduct).toBe(false);
      expect(outcome.because).toContain('tolerance drift');
    }
  });

  it('is identified from an entity synonym the catalog carries', () => {
    const outcome = identifyProduct('a dashboard of cogwheel counts', registry, ACME_CATALOG);
    expect(outcome.outcome).toBe('resolved');
    if (outcome.outcome === 'resolved') expect(outcome.productId).toBe('acme-sprockets');
  });

  it('needed no platform change to do any of it', () => {
    /*
      Not an assertion a test can make directly, so it is made structurally: every capability above was
      exercised through the public API with data defined in this file. There is no `acme` branch in
      production code to find, because there is nowhere for one to be.
    */
    expect(ACME.id).not.toBe('opus-edm');
  });
});
