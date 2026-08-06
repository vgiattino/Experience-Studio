/**
 * Bindings, asserted against a real catalog.
 *
 * `testCatalog()` is the platform's own fixture — the same entities, measures and entitlement rules the
 * catalog library tests itself with — so these are not assertions against a shape invented here. The
 * three properties that matter:
 *
 *   · **governed** — a binding cannot name anything outside the author's projection, and an entitlement
 *     failure is indistinguishable from a concept that does not exist;
 *   · **legal** — an aggregation a measure forbids is corrected, not passed downstream to be rejected;
 *   · **faithful** — the `DataSource` a binding becomes is the platform's contract, aliased so the
 *     resolver reads back what it asked for.
 */

import { CatalogService, testCatalog } from '@opus/catalog';
import type { UserContext } from '@opus/contracts';

import type { Widget } from '../model';
import {
  CATEGORY_ALIAS,
  VALUE_ALIAS,
  bindingTitle,
  catalogView,
  checkBinding,
  entityIn,
  isBindable,
  shapeOf,
  sourceFor,
  type CatalogEntityView,
  type WidgetBinding,
} from './binding';

function userWith(capabilities: string[]): UserContext {
  return {
    id: 'test@demo',
    displayName: 'Test',
    tenantId: 'demo-tenant',
    locale: 'en-GB',
    timezone: 'Europe/London',
    roles: ['experienceAuthor'],
    capabilities,
    entitlementScopeHash: capabilities.join(','),
  };
}

const ALL = [
  'edm.processing.read',
  'edm.security.read',
  'edm.dq.read',
  'edm.dq.assignee.read',
  'edm.party.read',
];

function viewFor(capabilities: string[]): CatalogEntityView[] {
  const service = new CatalogService();
  service.hydrate(testCatalog());
  return catalogView(service.projectionFor(userWith(capabilities)));
}

function widget(type: Widget['type']): Widget {
  return { id: 'w1', type, x: 0, y: 0, w: 4, h: 3, props: {} };
}

describe('the catalog view', () => {
  it('flattens the entities an author is entitled to', () => {
    const view = viewFor(ALL);
    expect(view.length).toBeGreaterThan(1);
    for (const entity of view) {
      expect(entity.name).toBeTruthy();
      expect(entity.plural).toBeTruthy();
      expect(entity.attributes.length).toBeGreaterThan(0);
    }
  });

  it('shows an author nothing of an entity they cannot see', () => {
    const all = viewFor(ALL);
    const narrowed = viewFor(['edm.processing.read']);
    expect(narrowed.length).toBeLessThan(all.length);
    // Not blanked, not greyed: absent. An attribute name is itself sometimes a disclosure.
    expect(narrowed.some((entity) => entity.ref.startsWith('dq.'))).toBe(false);
  });

  it('carries each measure’s allowed aggregations, so an illegal one is never offered', () => {
    const view = viewFor(ALL);
    const measures = view.flatMap((entity) => entity.measures);
    expect(measures.length).toBeGreaterThan(0);
    for (const measure of measures) {
      expect(measure.allowedAggregations.length).toBeGreaterThan(0);
      expect(measure.allowedAggregations).toContain(measure.defaultAggregation);
    }
  });
});

describe('checking a binding', () => {
  const view = viewFor(ALL);
  const entity = view[0]!;
  const measure = view.find((one) => one.measures.length)!.measures[0]!;
  const withMeasure = view.find((one) => one.measures.length)!;

  it('rejects an entity that is not in the projection, without saying which reason', () => {
    const { binding, problems } = checkBinding({ entity: 'made.up' }, view);
    expect(binding).toBeNull();
    // "Does not exist" and "you are not entitled" are deliberately one message.
    expect(problems[0]).toContain('does not exist or you are not entitled');
  });

  it('rejects an entity the author lost access to', () => {
    const narrowed = viewFor(['edm.processing.read']);
    const secured = viewFor(ALL).find((one) => one.ref.startsWith('dq.'))!;
    expect(checkBinding({ entity: secured.ref }, narrowed).binding).toBeNull();
  });

  it('drops a measure that is not on the entity', () => {
    const { binding, problems } = checkBinding(
      { entity: withMeasure.ref, measure: 'not-a-measure' },
      view,
    );
    expect(binding?.measure).toBeUndefined();
    expect(problems[0]).toContain('no measure called');
  });

  it('corrects an aggregation the measure forbids rather than dropping the binding', () => {
    const illegal = (['sum', 'avg', 'min', 'max', 'countDistinct'] as const).find(
      (option) => !measure.allowedAggregations.includes(option),
    );
    if (!illegal) return;
    const { binding, problems } = checkBinding(
      { entity: withMeasure.ref, measure: measure.ref, aggregation: illegal },
      view,
    );
    expect(binding?.measure).toBe(measure.ref);
    expect(binding?.aggregation).toBe(measure.defaultAggregation);
    expect(problems.join(' ')).toContain('cannot be aggregated');
  });

  it('keeps an aggregation the measure allows', () => {
    const { binding, problems } = checkBinding(
      { entity: withMeasure.ref, measure: measure.ref, aggregation: measure.defaultAggregation },
      view,
    );
    expect(binding?.aggregation).toBe(measure.defaultAggregation);
    expect(problems).toEqual([]);
  });

  it('drops a dimension the catalog says cannot be grouped by', () => {
    const ungroupable = view
      .flatMap((one) => one.attributes.map((attribute) => ({ one, attribute })))
      .find(({ attribute }) => !attribute.groupable);
    if (!ungroupable) return;
    const { binding, problems } = checkBinding(
      { entity: ungroupable.one.ref, dimension: ungroupable.attribute.ref },
      view,
    );
    expect(binding?.dimension).toBeUndefined();
    expect(problems.join(' ')).toContain('cannot be grouped by');
  });

  it('drops columns that are not on the entity and keeps the rest', () => {
    const real = entity.attributes[0]!.ref;
    const { binding, problems } = checkBinding(
      { entity: entity.ref, attributes: [real, 'ghost-column'] },
      view,
    );
    expect(binding?.attributes).toEqual([real]);
    expect(problems.join(' ')).toContain('not on');
  });
});

describe('the query a binding becomes', () => {
  const view = viewFor(ALL);
  const entity = view.find((one) => one.measures.length)!;
  const measure = entity.measures[0]!;
  const dimension = entity.attributes.find((attribute) => attribute.groupable)!;

  it('builds an aggregate with one measure for a figure', () => {
    const source = sourceFor(widget('kpi'), {
      entity: entity.ref,
      measure: measure.ref,
      aggregation: measure.defaultAggregation,
    })!;
    expect(source.kind).toBe('aggregate');
    expect(source.entity).toBe(entity.ref);
    expect(source.select.measures).toEqual([
      { measure: measure.ref, aggregation: measure.defaultAggregation, alias: VALUE_ALIAS },
    ]);
    expect(source.select.dimensions).toBeUndefined();
  });

  it('builds an aggregate with a dimension for a chart, sorted and capped', () => {
    const source = sourceFor(widget('chart'), {
      entity: entity.ref,
      measure: measure.ref,
      dimension: dimension.ref,
    })!;
    expect(source.select.dimensions?.[0]).toMatchObject({
      attribute: dimension.ref,
      alias: CATEGORY_ALIAS,
      limit: 8,
    });
    expect(source.sort?.[0]).toEqual({ field: VALUE_ALIAS, direction: 'desc' });
  });

  it('builds a list for a table, aliased by attribute so the resolver can read it back', () => {
    const columns = entity.attributes.slice(0, 3).map((attribute) => attribute.ref);
    const source = sourceFor(widget('table'), { entity: entity.ref, attributes: columns })!;
    expect(source.kind).toBe('list');
    expect(source.select.attributes?.map((attribute) => attribute.alias)).toEqual(columns);
    expect(source.paging?.pageSize).toBe(8);
  });

  it('builds nothing from a binding that is missing the part its shape needs', () => {
    expect(sourceFor(widget('kpi'), { entity: entity.ref })).toBeNull();
    expect(sourceFor(widget('chart'), { entity: entity.ref, measure: measure.ref })).toBeNull();
    expect(sourceFor(widget('table'), { entity: entity.ref })).toBeNull();
  });

  it('builds nothing for a widget that reads nothing', () => {
    expect(sourceFor(widget('heading'), { entity: entity.ref })).toBeNull();
    expect(isBindable(widget('heading'))).toBe(false);
    expect(isBindable(widget('kpi'))).toBe(true);
  });

  it('turns filters into clauses on the contract’s own `target` field', () => {
    const filterable = entity.attributes.find((attribute) => attribute.filterable)!;
    const source = sourceFor(widget('kpi'), {
      entity: entity.ref,
      measure: measure.ref,
      filters: [{ attribute: filterable.ref, operator: 'eq', value: 'x' }],
    })!;
    expect(source.filter).toEqual({ target: filterable.ref, operator: 'eq', value: 'x' });
  });

  it('knows which shape each widget kind implies', () => {
    expect(shapeOf(widget('kpi'))).toBe('figure');
    expect(shapeOf(widget('gauge'))).toBe('figure');
    expect(shapeOf(widget('chart'))).toBe('series');
    expect(shapeOf(widget('grid'))).toBe('list');
    expect(shapeOf(widget('button'))).toBe('none');
  });
});

describe('naming a bound widget', () => {
  const view = viewFor(ALL);
  const entity = view.find((one) => one.measures.length)!;
  const measure = entity.measures[0]!;
  const dimension = entity.attributes.find((attribute) => attribute.groupable)!;

  it('uses the catalog’s words, not a paraphrase', () => {
    expect(bindingTitle(view, { entity: entity.ref, measure: measure.ref })).toBe(measure.name);
    expect(
      bindingTitle(view, { entity: entity.ref, measure: measure.ref, dimension: dimension.ref }),
    ).toBe(`${measure.name} by ${dimension.name}`);
    expect(bindingTitle(view, { entity: entity.ref })).toBe(entity.plural);
  });

  it('falls back to the ref when the entity is gone, rather than to an empty label', () => {
    const binding: WidgetBinding = { entity: 'gone', measure: 'also-gone' };
    expect(bindingTitle(view, binding)).toBe('also-gone');
  });

  it('finds an entity by ref', () => {
    expect(entityIn(view, entity.ref)?.ref).toBe(entity.ref);
    expect(entityIn(view, 'nope')).toBeUndefined();
  });
});
