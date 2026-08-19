/**
 * The registry as the server loads it, against the real `products/` directory and the real catalog.
 *
 * Deliberately not fixtures. `@opus/product-registry` already has 40-odd tests over synthetic
 * registrations, and repeating them here would test the same functions twice. What is untested without
 * this file is everything specific to the server: that the two shipped registrations parse, that they
 * compose without a blocking problem, that Opus EDM's domain claim actually matches the domains this
 * tenant's catalog contains, and that Opus Control comes out as ungrounded rather than as grounded in
 * somebody else's entities.
 *
 * Those are the assertions that break when a registration is edited, and they are the reason the file
 * exists: a domain renamed in the catalog and not in the registration is a silent product outage, and
 * this is what makes it a red test instead.
 */

import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import type { ExperienceDefinition } from '@opus/contracts';

import {
  entitiesRead,
  identifyProductFromPrompt,
  productOf,
  productProblems,
  productViews,
  products,
  unreadableRegistrations,
} from './product-registry';

/*
  Both inputs pointed at the real files. Under a bundler `import.meta.url` is the bundle's location, so
  `config.ts`'s ROOT-derived paths resolve somewhere else entirely — which is why both are overridable.

  The catalog is the checked-in SEED, deterministically: `publishedCatalog` lives under `DATA_ROOT` and
  is absent here. That matters for the counts below, because the seed carries four of Opus EDM's six
  claimed domains and a promoted catalog carries all six.
*/
process.env['OPUS_CATALOG_PATH'] = join(process.cwd(), 'apps/viewer/public/catalog/securities.catalog.json');
process.env['OPUS_PRODUCTS_DIR'] = join(process.cwd(), 'products');

function experience(dataSources: Record<string, string>): ExperienceDefinition {
  return {
    schemaVersion: '1.0.0',
    id: 'x',
    name: 'X',
    pages: {
      home: {
        schemaVersion: '1.0.0',
        id: 'home',
        title: 'Home',
        dataSources: Object.fromEntries(
          Object.entries(dataSources).map(([id, entity]) => [id, { id, entity, kind: 'query', select: {} }]),
        ),
        layout: { kind: 'stack', id: 'root', children: [] },
      },
    },
  } as unknown as ExperienceDefinition;
}

describe('loading what ships', () => {
  it('reads every registration in products/', () => {
    expect(unreadableRegistrations()).toEqual([]);
    expect(products().products.map((p) => p.id).sort()).toEqual(['opus-control', 'opus-edm']);
  });

  it('composes them with no blocking problem', () => {
    /*
      The assertion that the shipped pair does not collide — on a catalog domain, a component type or an
      id. Any of those would make the registry undecidable, and a registry nobody checked is a registry
      that resolves by load order.
    */
    expect(productProblems().filter((p) => p.severity === 'blocking')).toEqual([]);
  });

  it('reports Opus Control as ungrounded, and says which domains are missing', () => {
    // The honest state, and the whole reason for registering a product whose data is not here.
    const problems = productProblems().filter((p) => p.code === 'ungroundedProduct');
    expect(problems.map((p) => p.productIds[0])).toEqual(['opus-control']);
    expect(problems[0]?.severity).toBe('warning');
    expect(problems[0]?.message).toContain('recon');
  });
});

describe('the view the API returns', () => {
  const views = productViews();
  const edm = views.find((v) => v.id === 'opus-edm');
  const control = views.find((v) => v.id === 'opus-control');

  it('grounds Opus EDM in real entities from the catalog', () => {
    /*
      The test that catches a renamed domain. Every entity in the seed catalog sits in a domain EDM
      claims, so if the catalog stops using one of those names this drops and somebody has to look at
      why — which is the failure this file exists to turn red.
    */
    expect(edm?.entityCount).toBe(5);
    expect(edm?.ungrounded).toBe(false);
    expect(edm?.status).toBe('active');
  });

  it('reports the domains EDM claims that this catalog has not ingested yet', () => {
    /*
      Not a defect in either the registration or the catalog. `vendor` and `master` are real domains,
      present once a scan has been promoted against the live database and absent from the checked-in
      seed — a claim ahead of its ingestion, which is exactly the state `unknownDomains` names. The
      alternative designs are both worse: refuse the registration, or report the product as fully
      grounded and let a generation fail later with no explanation.
    */
    expect(edm?.unknownDomains).toEqual(['vendor', 'master']);
  });

  it('shows what EDM contributes', () => {
    expect(edm?.counts.systemPages).toBe(5);
    expect(edm?.counts.systemJourneys).toBe(2);
    expect(edm?.counts.actions).toBeGreaterThan(0);
    // Zero, and correctly so: every component in the library today is platform-native.
    expect(edm?.counts.components).toBe(0);
  });

  it('shows Control as contributing vocabulary and nothing else', () => {
    expect(control?.ungrounded).toBe(true);
    expect(control?.counts.terms).toBeGreaterThan(0);
    expect(control?.counts.systemPages).toBe(0);
    expect(control?.entityCount).toBe(0);
  });
});

describe('resolving an experience’s product from what it reads', () => {
  it('reads every data source across the experience and its pages', () => {
    expect(entitiesRead(experience({ a: 'dq.exception', b: 'securities.security' }))).toEqual([
      'dq.exception',
      'securities.security',
    ]);
  });

  it('resolves a single-product experience', () => {
    const resolution = productOf(experience({ a: 'dq.exception', b: 'securities.security' }));
    expect(resolution.outcome).toBe('resolved');
    if (resolution.outcome === 'resolved') expect(resolution.productId).toBe('opus-edm');
  });

  it('reports an experience that reads nothing as unclaimed rather than guessing', () => {
    const resolution = productOf(experience({}));
    expect(resolution.outcome).toBe('unclaimed');
  });

  it('reports an entity no product claims', () => {
    const resolution = productOf(experience({ a: 'nowhere.thing' }));
    expect(resolution.outcome).toBe('unclaimed');
    if (resolution.outcome === 'unclaimed') expect(resolution.unclaimed).toEqual(['nowhere.thing']);
  });
});

describe('FR-3 through the service', () => {
  it('identifies EDM from the PRD’s worked prompt', () => {
    const outcome = identifyProductFromPrompt(
      'Create a Security Master Operations Dashboard showing today’s files processed, late files, failed files, exceptions, new securities, and data quality KPIs.',
    );
    expect(outcome.outcome).toBe('resolved');
    if (outcome.outcome === 'resolved') expect(outcome.productId).toBe('opus-edm');
  });

  it('identifies Control, even though Control has no metadata here', () => {
    // Identification is about intent; grounding is about the catalog. Conflating the two is how a
    // platform answers a reconciliation question with a securities dashboard.
    const outcome = identifyProductFromPrompt('aged reconciliation breaks by custodian');
    expect(outcome.outcome).toBe('resolved');
    if (outcome.outcome === 'resolved') expect(outcome.productId).toBe('opus-control');
  });

  it('asks when the prompt names no product', () => {
    expect(identifyProductFromPrompt('a dashboard with some charts').outcome).toBe('unresolved');
  });
});
