import { describe, expect, it } from 'vitest';
import type { UserContext } from '@opus/contracts';

import { CatalogService } from './catalog.service';
import { buildGroundingPack, serializeGroundingPack } from './grounding';
import { retrieve } from './retrieval';
import { ALL_CAPABILITIES, testCatalog } from './test-catalog';

function service(): CatalogService {
  const catalog = new CatalogService();
  catalog.hydrate(testCatalog());
  return catalog;
}

function user(capabilities: readonly string[]): UserContext {
  return {
    id: 'u1',
    displayName: 'Test Author',
    tenantId: 'test-tenant',
    locale: 'en-GB',
    timezone: 'Europe/London',
    roles: ['experienceAuthor'],
    capabilities: [...capabilities],
    entitlementScopeHash: capabilities.join('|') || 'none',
  };
}

describe('CatalogService projection', () => {
  it('strips physical mappings from everything the client and the model can see', () => {
    const snapshot = service().projectionFor(user(ALL_CAPABILITIES));
    const json = JSON.stringify(snapshot);

    // The physical forms in the fixture: if either leaks, R6 is violated and a definition
    // could be authored against a column name.
    expect(json).not.toContain('security_id');
    expect(json).not.toContain('load_id');
    expect(json).not.toContain('physical');
  });

  it('keeps the physical map available server-side, including for countable measures', () => {
    const catalog = service();

    expect(catalog.physicalMapFor('securities.security')?.attributes['security-id']).toBe(
      'security_id',
    );
    // A measure with a column of its own maps to it; a pure count has none.
    expect(catalog.physicalMapFor('processing.file-load')?.measures['rows-processed']).toBe(
      'row-count',
    );
    expect(catalog.physicalMapFor('processing.file-load')?.measures['failed-file-count']).toBeNull();
  });

  it('hides an entity entirely when the caller lacks its row entitlement', () => {
    const snapshot = service().projectionFor(user(['edm.processing.read']));

    expect(Object.keys(snapshot.entities)).toEqual(['processing.file-load']);
    expect(snapshot.entities['dq.exception']).toBeUndefined();
  });

  it('removes a restricted attribute rather than blanking it — the name is itself sensitive', () => {
    const withAssignee = service().projectionFor(user(ALL_CAPABILITIES));
    const withoutAssignee = service().projectionFor(
      user(['edm.processing.read', 'edm.dq.read', 'edm.security.read']),
    );

    expect(withAssignee.entities['dq.exception']!.attributes['assigned-to']).toBeDefined();
    expect(withoutAssignee.entities['dq.exception']!.attributes['assigned-to']).toBeUndefined();
    expect(JSON.stringify(withoutAssignee)).not.toContain('Assigned To');
  });

  it('drops a relationship whose far side the caller cannot see', () => {
    const snapshot = service().projectionFor(user(['edm.security.read']));
    // securities.security survives; dq.exception does not, so neither edge can stand.
    expect(snapshot.relationships).toEqual([]);
  });
});

describe('retrieval', () => {
  const snapshot = service().projectionFor(user(ALL_CAPABILITIES));

  it('finds the entity a business term names, by synonym', () => {
    const result = retrieve(snapshot, { terms: ['breaks', 'severity'] });
    expect(result.entities[0]!.concept.id).toBe('dq.exception');
  });

  it('surfaces a measure the prompt named even without naming its entity, and implies the entity', () => {
    const result = retrieve(snapshot, { terms: ['failed', 'files'] });

    expect(result.measures.map((m) => m.concept.id)).toContain('failed-file-count');
    expect(result.entities.map((e) => e.concept.id)).toContain('processing.file-load');
  });

  it('expands across a low-cost relationship and records what was inferred', () => {
    const result = retrieve(snapshot, { terms: ['securities', 'instrument'], graphHops: 1 });

    expect(result.entities.map((e) => e.concept.id)).toContain('dq.exception');
    expect(result.expandedFrom['dq.exception']).toEqual(['securities.security']);
    expect(result.entities.find((e) => e.concept.id === 'dq.exception')!.via).toContain('graph');
  });

  it('scores a directly-named entity above one reached only by graph expansion', () => {
    const result = retrieve(snapshot, { terms: ['securities'], graphHops: 1 });
    const named = result.entities.find((e) => e.concept.id === 'securities.security')!;
    const expanded = result.entities.find((e) => e.concept.id === 'dq.exception')!;

    expect(named.score).toBeGreaterThan(expanded.score);
  });

  /**
   * The ordering claim from ai-architecture.md §3.2. Filtering after ranking has two
   * failure modes: a disclosure (the model may echo a field name it should not know) and a
   * definition bound to fields the author cannot preview.
   */
  it('cannot rank a concept the caller is not entitled to, because it was never a candidate', () => {
    const restricted = service().projectionFor(user(['edm.processing.read']));
    const result = retrieve(restricted, { terms: ['exceptions', 'breaks', 'severity'] });

    expect(result.entities.map((e) => e.concept.id)).not.toContain('dq.exception');
    expect(result.attributes.map((a) => a.concept.id)).not.toContain('severity');
  });

  it('truncates measures and attributes to the entities that survived ranking', () => {
    const result = retrieve(snapshot, { terms: ['exceptions'], maxEntities: 1 });
    const kept = new Set(result.entities.map((e) => e.concept.id));

    for (const measure of result.measures) expect(kept.has(measure.concept.entityId)).toBe(true);
    for (const attribute of result.attributes) expect(kept.has(attribute.concept.entityId)).toBe(true);
  });
});

describe('grounding pack', () => {
  const snapshot = service().projectionFor(user(ALL_CAPABILITIES));

  it('carries the constraints that stop the generator making validator-catchable mistakes', () => {
    const pack = buildGroundingPack(
      snapshot,
      retrieve(snapshot, { terms: ['exceptions', 'severity'] }),
    );
    const serialized = serializeGroundingPack(pack);

    // Allowed aggregations, enum values and filter requirements must all be present:
    // each one is a mistake the model would otherwise have to be corrected for.
    expect(serialized).toContain('agg=[count|countDistinct]');
    expect(serialized).toContain('values=[HIGH|LOW]');
    expect(serialized).toContain('REQUIRES A FILTER');
  });

  it('names no physical column', () => {
    const pack = buildGroundingPack(snapshot, retrieve(snapshot, { terms: ['securities', 'rows'] }));
    const serialized = serializeGroundingPack(pack);

    expect(serialized).not.toContain('security_id');
    expect(serialized).not.toContain('row-count');
    expect(serialized).toContain('rows-processed');
  });

  it('serializes identically for identical input, so prompt caching can hit', () => {
    const first = serializeGroundingPack(
      buildGroundingPack(snapshot, retrieve(snapshot, { terms: ['exceptions'] })),
    );
    const second = serializeGroundingPack(
      buildGroundingPack(snapshot, retrieve(snapshot, { terms: ['exceptions'] })),
    );

    expect(first).toBe(second);
  });

  it('reports what retrieval dropped, so a reviewer can see what was not offered', () => {
    const pack = buildGroundingPack(
      snapshot,
      retrieve(snapshot, { terms: ['exceptions'], maxEntities: 1 }),
    );

    expect(pack.droppedEntities.length).toBeGreaterThan(0);
    expect(pack.droppedEntities).not.toContain(pack.entities[0]!.ref);
  });
});
