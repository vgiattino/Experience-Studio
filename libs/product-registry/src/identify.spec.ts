/**
 * Product identification from intent (FR-3).
 *
 * These tests run against the **shipped registrations** — the real `products/*.product.json` files —
 * rather than fixtures, deliberately. Identification is only as good as the vocabulary products
 * declare, so a test over invented vocabulary would prove the scorer works and tell us nothing about
 * whether Opus EDM is actually identifiable. When somebody edits a registration's `intentSignals`,
 * this is what tells them whether they helped.
 *
 * The synthetic cases below it test the rules the shipped pair cannot: a three-way collision, a
 * deprecated product, a registry of one.
 *
 * The behaviour under test is as much the refusals as the answers. FR-3 says "where intent plausibly
 * spans more than one product, the AI asks rather than silently picking one" — so the interesting
 * assertions are the ones where nothing is returned.
 */

import { describe, expect, it } from 'vitest';
import type { CatalogSnapshot } from '@opus/catalog';

import EDM from '../../../products/opus-edm.product.json';
import CONTROL from '../../../products/opus-control.product.json';
import {
  buildSignalIndex,
  composeRegistry,
  identifyProduct,
  type ProductRegistration,
} from './index';

const SHIPPED = [EDM as ProductRegistration, CONTROL as ProductRegistration];
const REGISTRY = composeRegistry(SHIPPED);

function snapshot(entities: Record<string, { domain: string; businessName: string; synonyms?: string[] }>): CatalogSnapshot {
  return {
    catalogVersion: 1,
    tenantId: 'test',
    relationships: [],
    entities: Object.fromEntries(
      Object.entries(entities).map(([id, e]) => [
        id,
        { id, businessName: e.businessName, synonyms: e.synonyms ?? [], domain: e.domain, primaryKey: ['id'], attributes: {}, measures: {} },
      ]),
    ),
  } as unknown as CatalogSnapshot;
}

/** The demo tenant's catalog in miniature: EDM's domains present, Control's absent. */
const CATALOG = snapshot({
  'securities.security': { domain: 'securities', businessName: 'Security' },
  'dq.exception': { domain: 'dq', businessName: 'Data quality exception' },
  'processing.file-load': { domain: 'processing', businessName: 'File load' },
});

function resolved(prompt: string) {
  const outcome = identifyProduct(prompt, REGISTRY, CATALOG);
  return outcome.outcome === 'resolved' ? outcome.productId : outcome.outcome;
}

// ── the shipped pair ─────────────────────────────────────────────────────────

describe('the two shipped registrations, identified from real prompts', () => {
  it('identifies Opus EDM from the PRD’s own worked example', () => {
    // UJ-1's prompt, verbatim. If this one fails, FR-3 fails for the journey the PRD leads with.
    expect(
      resolved(
        'Create a Security Master Operations Dashboard showing today’s files processed, late files, failed files, exceptions, new securities, and data quality KPIs.',
      ),
    ).toBe('opus-edm');
  });

  it('identifies Opus EDM from vocabulary only EDM registers', () => {
    expect(resolved('show the oldest unassigned data quality exceptions')).toBe('opus-edm');
    expect(resolved('which vendor feeds were late this week')).toBe('opus-edm');
    expect(resolved('trace the golden copy back to each source value')).toBe('opus-edm');
    expect(resolved('a party master hierarchy view')).toBe('opus-edm');
  });

  it('identifies Opus Control from its vocabulary even though its data is not in this tenant', () => {
    /*
      The point of registering a product whose metadata has not been ingested. Identification is a
      question about intent; grounding is a question about the catalog. Conflating them is what makes a
      platform answer a reconciliation question with a securities dashboard.
    */
    expect(resolved('show me aged reconciliation breaks by custodian')).toBe('opus-control');
    expect(resolved('a nostro cash reconciliation proof for month end')).toBe('opus-control');
  });

  it('names the product by name when the user names it', () => {
    expect(resolved('build something for Opus Control')).toBe('opus-control');
    expect(resolved('an Opus EDM landing page')).toBe('opus-edm');
  });

  it('asks rather than guessing when the request names no product vocabulary at all', () => {
    const outcome = identifyProduct('build me a dashboard with some charts on it', REGISTRY, CATALOG);
    expect(outcome.outcome).toBe('unresolved');
    if (outcome.outcome === 'unresolved') {
      // The question names the options, so answering it takes one word rather than a guess.
      expect(outcome.question).toContain('Opus EDM');
      expect(outcome.question).toContain('Opus Control');
    }
  });

  it('cites what it matched, so the decision is reviewable', () => {
    const outcome = identifyProduct('the exception queue by severity', REGISTRY, CATALOG);
    expect(outcome.outcome).toBe('resolved');
    if (outcome.outcome === 'resolved') {
      expect(outcome.because).toContain('exception queue');
      expect(outcome.because).toContain('Opus EDM');
    }
  });

  it('composes the two without a blocking problem', () => {
    // Which is also the assertion that the two shipped files do not collide on a domain or a component.
    expect(REGISTRY.problems.filter((p) => p.severity === 'blocking')).toEqual([]);
  });
});

// ── the rules the shipped pair cannot exercise ───────────────────────────────

function product(over: Partial<ProductRegistration>): ProductRegistration {
  return { schemaVersion: '1.0', id: 'p', name: 'P', ...over };
}

describe('a signal only counts if it discriminates', () => {
  it('scores a word claimed by two products for neither of them', () => {
    /*
      The central idea. "Exception" means something in every data platform ever built; if two products
      register it, a prompt about exceptions has said nothing about which. Scoring it for both would
      produce a confident tie that resolves by load order.
    */
    const registry = composeRegistry([
      product({ id: 'a', name: 'A', aiContext: { terminology: [{ term: 'widget', means: 'a thing' }] } }),
      product({ id: 'b', name: 'B', aiContext: { terminology: [{ term: 'widget', means: 'another thing' }] } }),
    ]);
    const outcome = identifyProduct('a page about widget counts', registry);
    expect(outcome.outcome).toBe('unresolved');
    if (outcome.outcome === 'unresolved') {
      // And it says which word wasted its vote, so a product owner can see why they are never picked.
      expect(outcome.sharedSignals).toEqual(['widget']);
    }
  });

  it('lets a discriminating word decide even when a shared word is also present', () => {
    const registry = composeRegistry([
      product({ id: 'a', name: 'A', aiContext: { terminology: [{ term: 'widget', means: 'x' }, { term: 'flange', means: 'y' }] } }),
      product({ id: 'b', name: 'B', aiContext: { terminology: [{ term: 'widget', means: 'z' }] } }),
    ]);
    const outcome = identifyProduct('widget and flange counts', registry);
    expect(outcome.outcome).toBe('resolved');
    if (outcome.outcome === 'resolved') expect(outcome.productId).toBe('a');
  });
});

describe('asking instead of picking', () => {
  it('asks when two products score comparably', () => {
    const registry = composeRegistry([
      product({ id: 'a', name: 'Alpha', aiContext: { intentSignals: ['alpha thing'] } }),
      product({ id: 'b', name: 'Beta', aiContext: { intentSignals: ['beta thing'] } }),
    ]);
    const outcome = identifyProduct('compare the alpha thing with the beta thing', registry);
    expect(outcome.outcome).toBe('ambiguous');
    if (outcome.outcome === 'ambiguous') {
      expect(outcome.candidates).toEqual(['a', 'b']);
      expect(outcome.question).toContain('Alpha');
      expect(outcome.question).toContain('Beta');
      // And it is honest about why it cannot just build both.
      expect(outcome.question).toContain('more than one product');
    }
  });

  it('does not ask when one product clearly leads', () => {
    const registry = composeRegistry([
      product({ id: 'a', name: 'Alpha', aiContext: { intentSignals: ['alpha thing', 'alpha widget'], terminology: [{ term: 'alphagram', means: 'x' }] } }),
      product({ id: 'b', name: 'Beta', aiContext: { intentSignals: ['beta thing'] } }),
    ]);
    const outcome = identifyProduct('the alpha thing, the alpha widget and an alphagram, plus a beta thing', registry);
    expect(outcome.outcome).toBe('resolved');
  });
});

describe('edge cases that would otherwise be silent', () => {
  it('resolves a single-product registry but says nothing was discriminated', () => {
    /*
      The state this whole library was written because of. One product means identification cannot be
      wrong, and cannot be right either — `soleProduct` is how a caller knows not to trust the result as
      evidence that FR-3 works.
    */
    const registry = composeRegistry([product({ id: 'only', name: 'Only', metadata: { domains: ['dq'] } })]);
    const outcome = identifyProduct('exceptions in the dq domain', registry);
    expect(outcome.outcome).toBe('resolved');
    if (outcome.outcome === 'resolved') {
      expect(outcome.soleProduct).toBe(true);
      expect(outcome.because).toContain('only product registered');
    }
  });

  it('never proposes a deprecated product', () => {
    const registry = composeRegistry([
      product({ id: 'old', name: 'Old', status: 'deprecated', aiContext: { intentSignals: ['legacy thing'] } }),
      product({ id: 'new', name: 'New', aiContext: { intentSignals: ['modern thing'] } }),
    ]);
    const outcome = identifyProduct('the legacy thing', registry);
    // Its vocabulary is not in the index at all, so this resolves to nothing rather than to the old one.
    expect(outcome.outcome).toBe('unresolved');
  });

  it('says something useful when nothing is registered at all', () => {
    const outcome = identifyProduct('anything', composeRegistry([]));
    expect(outcome.outcome).toBe('unresolved');
    if (outcome.outcome === 'unresolved') {
      expect(outcome.question).toContain('Product Integration Contract');
    }
  });

  it('matches whole words, not substrings', () => {
    // "recon" must not match "reconfigure", or every infrastructure prompt becomes a Control prompt.
    const registry = composeRegistry([product({ id: 'c', name: 'C', metadata: { domains: ['recon'] } })]);
    expect(identifyProduct('reconfigure the layout', registry).outcome).toBe('unresolved');
    expect(identifyProduct('the recon results', registry).outcome).toBe('resolved');
  });

  it('is case- and punctuation-insensitive', () => {
    expect(resolved('GOLDEN COPY, please')).toBe('opus-edm');
  });
});

describe('the signal index', () => {
  it('can be built once and reused across prompts', () => {
    const index = buildSignalIndex(SHIPPED, CATALOG);
    expect(index.size).toBeGreaterThan(40);
    const first = identifyProduct('aged break investigation', REGISTRY, CATALOG, index);
    const second = identifyProduct('vendor feed lateness', REGISTRY, CATALOG, index);
    expect(first.outcome === 'resolved' && first.productId).toBe('opus-control');
    expect(second.outcome === 'resolved' && second.productId).toBe('opus-edm');
  });

  it('picks up entity business names and synonyms from the catalog', () => {
    const withSynonym = snapshot({
      'securities.security': { domain: 'securities', businessName: 'Security', synonyms: ['tradable instrument'] },
    });
    const outcome = identifyProduct('list every tradable instrument', REGISTRY, withSynonym);
    expect(outcome.outcome).toBe('resolved');
    if (outcome.outcome === 'resolved') expect(outcome.productId).toBe('opus-edm');
  });

  it('keeps the stronger origin when a word is both a domain name and a registered term', () => {
    const index = buildSignalIndex([
      product({ id: 'a', name: 'A', metadata: { domains: ['widget'] }, aiContext: { intentSignals: ['widget'] } }),
    ]);
    expect(index.get('widget')?.origin).toBe('intentSignal');
  });
});
