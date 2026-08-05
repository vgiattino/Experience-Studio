import { describe, expect, it, beforeEach } from 'vitest';
import type { PageDefinition } from '@opus/contracts';

import { clearCompileCache, compilePage, sourcesAffectedBy } from './compile-page';

/** Minimal but structurally real page, so the compiler is exercised as it will be. */
function page(overrides: Partial<PageDefinition> = {}): PageDefinition {
  return {
    schemaVersion: '1.0',
    id: 'test-page',
    name: 'Test',
    kind: 'dashboard',
    parameters: {
      'as-of': { dataType: 'date', scope: 'experience' },
    },
    filters: {
      severity: { dataType: 'enum', multiValued: true },
      region: { dataType: 'enum' },
    },
    selections: {
      'focused-row': { mode: 'single' },
    },
    dataSources: {
      'kpi-total': {
        id: 'kpi-total',
        entity: 'dq.exception',
        kind: 'aggregate',
        select: { measures: [{ measure: 'exception-count', aggregation: 'count', alias: 'total' }] },
        filter: {
          all: [
            { target: 'severity', operator: 'in', value: { $filter: 'severity' } },
            { target: 'business-date', operator: 'eq', value: { $param: 'as-of' } },
          ],
        },
      },
      'static-list': {
        id: 'static-list',
        entity: 'securities.security',
        kind: 'list',
        select: { attributes: [{ attribute: 'name', alias: 'name' }] },
        filter: { all: [{ target: 'status', operator: 'eq', value: 'ACTIVE' }] },
      },
      'selection-detail': {
        id: 'selection-detail',
        entity: 'dq.exception',
        kind: 'single',
        select: {
          attributes: [{ attribute: 'rule-name', alias: 'rule' }],
          key: { 'exception-id': { $selection: 'focused-row' } },
        },
      },
      'deferred-source': {
        id: 'deferred-source',
        entity: 'processing.file-load',
        kind: 'list',
        select: { attributes: [{ attribute: 'file-name', alias: 'file' }] },
      },
      'expression-source': {
        id: 'expression-source',
        entity: 'dq.exception',
        kind: 'list',
        select: { attributes: [{ attribute: 'rule-name', alias: 'rule' }] },
        filter: {
          all: [{ target: 'region', operator: 'eq', value: { $expr: "$filters.region ?? 'ALL'" } }],
        },
      },
    },
    components: {
      kpi: { id: 'kpi', type: 'analytics.kpi-card', typeVersion: '1.4.0', dataSource: 'kpi-total' },
      list: { id: 'list', type: 'data.table', typeVersion: '1.0.0', dataSource: 'static-list' },
      detail: { id: 'detail', type: 'data.table', typeVersion: '1.0.0', dataSource: 'selection-detail' },
      deferred: {
        id: 'deferred',
        type: 'data.table',
        typeVersion: '1.0.0',
        dataSource: 'deferred-source',
      },
      expr: {
        id: 'expr',
        type: 'data.table',
        typeVersion: '1.0.0',
        dataSource: 'expression-source',
      },
    },
    layout: {
      kind: 'container',
      id: 'root',
      container: {
        type: 'grid',
        children: [
          { kind: 'widget', id: 'w-kpi', component: 'kpi' },
          { kind: 'widget', id: 'w-list', component: 'list' },
          { kind: 'widget', id: 'w-detail', component: 'detail' },
          { kind: 'widget', id: 'w-expr', component: 'expr' },
          {
            kind: 'container',
            id: 'tabs',
            container: {
              type: 'tabs',
              deferContent: true,
              source: {
                mode: 'static',
                tabs: [
                  {
                    id: 'first',
                    label: 'First',
                    content: [{ kind: 'widget', id: 't-list', component: 'list' }],
                  },
                  {
                    id: 'second',
                    label: 'Second',
                    content: [{ kind: 'widget', id: 't-deferred', component: 'deferred' }],
                  },
                ],
              },
            },
          },
        ],
      },
    },
    version: {
      schemaVersion: '1.0',
      artifactVersion: 1,
      lifecycleState: 'published',
      pins: { catalogVersion: 7, registryVersion: '1.0.0' },
    },
    ...overrides,
  };
}

beforeEach(() => clearCompileCache());

describe('dependency graph', () => {
  it('records the filter and parameter each source depends on', () => {
    const { page: compiled } = compilePage(page());
    expect(compiled.dependencies['kpi-total']).toMatchObject({
      params: ['as-of'],
      filters: ['severity'],
      selections: [],
      static: false,
    });
  });

  it('marks a source with only literal inputs as static', () => {
    const { page: compiled } = compilePage(page());
    expect(compiled.dependencies['static-list']!.static).toBe(true);
  });

  it('records selection dependencies from a key binding', () => {
    const { page: compiled } = compilePage(page());
    expect(compiled.dependencies['selection-detail']!.selections).toEqual(['focused-row']);
  });

  it('extracts dependencies from inside an expression', () => {
    const { page: compiled } = compilePage(page());
    expect(compiled.dependencies['expression-source']!.filters).toEqual(['region']);
  });
});

describe('targeted invalidation — the point of the graph', () => {
  it('affects only the sources that declare the changed filter', () => {
    const { page: compiled } = compilePage(page());
    expect(sourcesAffectedBy(compiled, { filters: ['severity'] })).toEqual(['kpi-total']);
  });

  it('does not wake unrelated sources', () => {
    const { page: compiled } = compilePage(page());
    const affected = sourcesAffectedBy(compiled, { filters: ['region'] });
    expect(affected).toEqual(['expression-source']);
    expect(affected).not.toContain('static-list');
  });

  it('affects every source depending on a changed parameter', () => {
    const { page: compiled } = compilePage(page());
    expect(sourcesAffectedBy(compiled, { params: ['as-of'] })).toEqual(['kpi-total']);
  });

  it('reports nothing for a channel no source reads', () => {
    const { page: compiled } = compilePage(page());
    expect(sourcesAffectedBy(compiled, { filters: ['unused'] })).toEqual([]);
  });
});

describe('eager / deferred partition', () => {
  it('defers sources reached only from a non-first tab', () => {
    const { page: compiled } = compilePage(page());
    expect(compiled.deferredSources).toContain('deferred-source');
    expect(compiled.eagerSources).not.toContain('deferred-source');
  });

  it('keeps a source used by the first tab eager', () => {
    const { page: compiled } = compilePage(page());
    expect(compiled.eagerSources).toContain('static-list');
  });

  it('defers rather than drops sources beyond the eager budget', () => {
    const { page: compiled } = compilePage(
      page({ performance: { maxEagerDataSources: 2 } }),
    );
    expect(compiled.eagerSources).toHaveLength(2);
    // Silent truncation would make a page look complete when it is not.
    const total = compiled.eagerSources.length + compiled.deferredSources.length;
    expect(total).toBe(Object.keys(page().dataSources ?? {}).length);
  });
});

describe('source index', () => {
  it('maps widgets to the sources they consume, and back', () => {
    const { page: compiled } = compilePage(page());
    expect(compiled.widgetSources['kpi']).toEqual(['kpi-total']);
    expect(compiled.sourceWidgets['static-list']).toEqual(['list']);
  });
});

describe('memoization', () => {
  it('reuses the compiled plan for the same definition version', () => {
    const definition = page();
    const first = compilePage(definition);
    const second = compilePage(definition);
    expect(first.cacheHit).toBe(false);
    expect(second.cacheHit).toBe(true);
    expect(second.page).toBe(first.page);
  });

  it('recompiles when the artifact version changes', () => {
    compilePage(page());
    const next = compilePage(
      page({
        version: {
          schemaVersion: '1.0',
          artifactVersion: 2,
          lifecycleState: 'published',
          pins: { catalogVersion: 7, registryVersion: '1.0.0' },
        },
      }),
    );
    expect(next.cacheHit).toBe(false);
  });
});

describe('layout compilation', () => {
  it('compiles visibility conditions into evaluable expressions', () => {
    const { page: compiled } = compilePage(
      page({
        layout: {
          kind: 'container',
          id: 'root',
          container: {
            type: 'grid',
            children: [
              {
                kind: 'widget',
                id: 'w-kpi',
                component: 'kpi',
                visible: { $expr: "$filters.severity in ['HIGH']" },
              },
            ],
          },
        },
      }),
    );
    const container = compiled.layout;
    expect(container.kind).toBe('container');
    if (container.kind !== 'container') throw new Error('expected a container');
    const child = container.container.children[0]!;
    if (child.kind !== 'widget') throw new Error('expected a widget');
    expect(child.visible?.test({ filters: { severity: ['HIGH'] } })).toBe(true);
    expect(child.visible?.test({ filters: { severity: ['LOW'] } })).toBe(false);
  });
});

/**
 * A data-driven tabs container is the shape every detail page uses: one tab per contributing
 * vendor, per issued instrument, per failing rule. What makes it work is that the tab's identity
 * travels through `selectedTabChannel` into the template's OWN data source — so the compiled
 * artifact has to keep both halves of that link, and the dependency graph has to see it.
 */
function dataDrivenTabsPage(): PageDefinition {
  return page({
    filters: { 'active-vendor': { dataType: 'enum' } },
    dataSources: {
      'vendor-tabs': {
        id: 'vendor-tabs',
        entity: 'securities.source-value',
        kind: 'aggregate',
        select: {
          measures: [{ measure: 'source-value-count', aggregation: 'count', alias: 'count' }],
          dimensions: [{ attribute: 'source-system', alias: 'source-system' }],
        },
      },
      'vendor-rows': {
        id: 'vendor-rows',
        entity: 'securities.source-value',
        kind: 'list',
        select: { attributes: [{ attribute: 'field-label', alias: 'field' }] },
        filter: {
          all: [
            {
              target: 'source-system',
              operator: 'eq',
              value: { $filter: 'active-vendor' },
              skipWhenEmpty: false,
            },
          ],
        },
      },
    },
    components: {
      tabs: { id: 'tabs', type: 'data.table', typeVersion: '1.0.0', dataSource: 'vendor-tabs' },
      rows: { id: 'rows', type: 'data.table', typeVersion: '1.0.0', dataSource: 'vendor-rows' },
    },
    layout: {
      kind: 'container',
      id: 'root',
      container: {
        type: 'grid',
        children: [
          {
            kind: 'container',
            id: 'vendors',
            container: {
              type: 'tabs',
              selectedTabChannel: 'active-vendor',
              deferContent: true,
              source: {
                mode: 'dataDriven',
                source: 'vendor-tabs',
                idField: 'source-system',
                labelField: 'source-system',
                badgeField: 'count',
                template: [{ kind: 'widget', id: 't-rows', component: 'rows' }],
              },
            },
          },
        ],
      },
    },
  });
}

describe('data-driven tabs', () => {
  it('keeps the template and the channel that feeds it', () => {
    const { page: compiled } = compilePage(dataDrivenTabsPage());
    const root = compiled.layout;
    if (root.kind !== 'container') throw new Error('expected a container');
    const tabs = root.container.children[0]!;
    if (tabs.kind !== 'container') throw new Error('expected the tabs container');
    // One compiled template serves every generated tab — twelve vendors cost one template.
    expect(tabs.container.template).toHaveLength(1);
    expect(tabs.container.tabs).toHaveLength(0);
    const spec = tabs.container.spec;
    if (spec.type !== 'tabs') throw new Error('expected a tabs spec');
    expect(spec.selectedTabChannel).toBe('active-vendor');
  });

  it('sees the tab channel as a dependency of the template source', () => {
    const { page: compiled } = compilePage(dataDrivenTabsPage());
    // Without this the tab strip changes its highlight and the rows below it do not change:
    // switching tabs writes the channel, and only the graph turns that write into a re-query.
    expect(sourcesAffectedBy(compiled, { filters: ['active-vendor'] })).toEqual(['vendor-rows']);
  });

  it('defers the template source and keeps the tab-generating source eager', () => {
    const { page: compiled } = compilePage(dataDrivenTabsPage());
    // The tabs cannot be generated before their source returns, so that one must load eagerly;
    // the content behind them must not, or a twelve-vendor page issues twelve queries to show one.
    expect(compiled.eagerSources).toContain('vendor-tabs');
    expect(compiled.deferredSources).toContain('vendor-rows');
  });
});
