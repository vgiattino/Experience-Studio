/**
 * The aspect summaries.
 *
 * Two classes of assertion, and the second is the one that matters.
 *
 * The *rendering* tests check that a filter tree, an action and a source read correctly — a summary
 * that reads badly is a cosmetic defect. The *reverse index* tests check the two claims a panel makes
 * that an author will act on destructively: "nothing reads this source" (they will delete it) and
 * "nothing can reach this action" (they will delete that too). A false positive on either destroys
 * work, so both are asserted against the shapes that would produce one — a conditional event mapping,
 * a composite step, a page action.
 *
 * The last test runs every shipped page through the summariser, because the honest test of a describer
 * is real artifacts rather than fixtures written to satisfy it.
 */

import { describe, expect, it } from 'vitest';
import type { PageDefinition } from '@opus/contracts';

import exceptionManagement from '../../../apps/viewer/public/definitions/exception-management.page.json';
import operationsDashboard from '../../../apps/viewer/public/definitions/operations-dashboard.page.json';
import securityOverview from '../../../apps/viewer/public/definitions/security-overview.page.json';
import {
  aspectCounts,
  describeAction,
  describeFilter,
  summariseActions,
  summariseSource,
  summariseSources,
} from './describe';

const SHIPPED = [
  ['exception-management', exceptionManagement],
  ['operations-dashboard', operationsDashboard],
  ['security-overview', securityOverview],
] as const;

function page(overrides: Partial<PageDefinition> = {}): PageDefinition {
  return {
    schemaVersion: '1.0',
    id: 'p',
    name: 'P',
    kind: 'dashboard',
    components: {
      kpi: {
        id: 'kpi',
        type: 'analytics.kpi-card',
        typeVersion: '1.4.0',
        title: 'Open',
        dataSource: 'src',
      },
    },
    dataSources: {
      src: {
        id: 'src',
        entity: 'dq.exception',
        kind: 'aggregate',
        select: {
          measures: [{ measure: 'exception-count', aggregation: 'count', alias: 'count-value' }],
        },
      },
    },
    layout: {
      kind: 'container',
      id: 'root',
      container: {
        type: 'grid',
        columns: 12,
        gap: 'lg',
        children: [{ kind: 'widget', id: 'w-kpi', component: 'kpi' }],
      },
    },
    version: {
      schemaVersion: '1.0',
      artifactVersion: 1,
      lifecycleState: 'draft',
      immutable: false,
      pins: { catalogVersion: 1, registryVersion: '1.0.0' },
    },
    ...overrides,
  } as unknown as PageDefinition;
}

// ── data sources ─────────────────────────────────────────────────────────────────────

describe('summariseSource', () => {
  it('separates the catalog ref from the alias bindings resolve against', () => {
    // The commonest binding bug in this codebase has been a widget bound to the ref instead of the
    // alias — which validates and then renders "no data". The panel shows both, so the summary must
    // keep them distinct rather than collapsing them into one "field".
    const summary = summariseSource(page(), 'src')!;
    expect(summary.fields).toEqual([
      { role: 'measure', ref: 'exception-count', alias: 'count-value', detail: 'count' },
    ]);
  });

  it('computes readers rather than trusting the artifact, and names the node to select', () => {
    const summary = summariseSource(page(), 'src')!;
    expect(summary.readers).toEqual(['kpi']);
    expect(summary.readerNodes).toEqual(['w-kpi']);
    expect(summary.orphan).toBe(false);
  });

  it('flags a source nothing reads — the claim an author acts on destructively', () => {
    const orphaned = page({ components: {} } as Partial<PageDefinition>);
    const summary = summariseSource(orphaned, 'src')!;
    expect(summary.readers).toEqual([]);
    expect(summary.orphan).toBe(true);
  });

  it('does not count the declaration itself as a reference to itself', () => {
    // Without this exception every source looks referenced — its own key under `/dataSources` matches —
    // and the panel can never report a genuine orphan. The bug is silent in the other direction: the
    // orphan test above is the only thing that catches it.
    const orphaned = page({ components: {} } as Partial<PageDefinition>);
    expect(summariseSource(orphaned, 'src')!.references).toEqual([]);
  });

  it('counts any other reference in the artifact — including inside an expression', () => {
    /**
     * The third false positive, and the reason "unread" stopped being a list of known consumers.
     *
     * `oldest-exception-age` on the shipped Security Master Operations page is read by an expression in
     * a text widget's config: `$data.oldest-exception-age.max-age-hours`. Nothing points at it
     * structurally. Enumerating consumers missed it, the panel called it unread, and removing it broke
     * the page — caught by the validator, not by this file.
     */
    const viaExpression = page({
      components: {
        intro: {
          id: 'intro',
          type: 'content.text',
          typeVersion: '1.0.0',
          config: { tokens: { age: { $expr: 'round($data.src.count-value ?? 0, 0)' } } },
        },
      },
    } as unknown as Partial<PageDefinition>);

    const summary = summariseSource(viaExpression, 'src')!;
    expect(summary.readers).toEqual([]);
    expect(summary.references).toEqual(['/components/intro/config/tokens/age/$expr']);
    expect(summary.orphan).toBe(false);
  });

  it('does not repeat a reader as a raw pointer', () => {
    // "read by kpi" and "/components/kpi/dataSource" are the same fact. Listing both buries the
    // reference that actually adds something — an expression, an export action — in duplication.
    const summary = summariseSource(page(), 'src')!;
    expect(summary.readers).toEqual(['kpi']);
    expect(summary.references).toEqual([]);
  });

  it('matches on a word boundary, so a longer id is not mistaken for this one', () => {
    const similar = page({
      components: {
        kpi: {
          id: 'kpi',
          type: 'analytics.kpi-card',
          typeVersion: '1.4.0',
          dataSource: 'src-extra',
        },
      },
      dataSources: {
        src: { id: 'src', entity: 'dq.exception', kind: 'aggregate', select: { measures: [] } },
        'src-extra': {
          id: 'src-extra',
          entity: 'dq.exception',
          kind: 'aggregate',
          select: { measures: [] },
        },
      },
    } as unknown as Partial<PageDefinition>);
    // `src-extra` must not make `src` look referenced, or a real orphan hides behind a similar name.
    expect(summariseSource(similar, 'src')!.orphan).toBe(true);
  });

  it('counts a container that GENERATES from a source as a reader', () => {
    /**
     * The false positive this test exists for. A data-driven tab set names a source to build one tab
     * per row; no component points at it. The first index missed that and called `rule-tabs` on the
     * shipped Exception Management page unread — the panel would have offered to delete it, and
     * deleting it removes the page's tabs.
     */
    const tabbed = page({
      components: {},
      layout: {
        kind: 'container',
        id: 'root',
        container: {
          type: 'tabs',
          source: { mode: 'dataDriven', source: 'src', idField: 'k', labelField: 'k', template: [] },
        },
      },
    } as unknown as Partial<PageDefinition>);

    const summary = summariseSource(tabbed, 'src')!;
    expect(summary.readers).toEqual([]);
    expect(summary.layoutReaders).toEqual(['root']);
    // Not an orphan: something reads it, just not a component.
    expect(summary.orphan).toBe(false);
  });

  it('returns null for a source that is not there, rather than an empty summary', () => {
    // An empty summary would render as a real source with no fields, which is a different (and
    // alarming) statement about the page than "there is no such source".
    expect(summariseSource(page(), 'nope')).toBeNull();
  });

  it('reports an unfiltered source as unfiltered', () => {
    expect(summariseSource(page(), 'src')!.filter).toBeNull();
  });
});

describe('describeFilter', () => {
  it('renders a clause with its operator and value', () => {
    expect(describeFilter({ target: 'severity', operator: 'in', value: ['High', 'Medium'] })).toBe(
      'severity in ["High", "Medium"]',
    );
  });

  it('parenthesises a nested group, so an "any" inside an "all" cannot read as a flat list', () => {
    // The one way a filter summary can actively mislead: without the brackets this reads as three
    // conditions that must all hold, which is a different page.
    const rendered = describeFilter({
      all: [
        { target: 'status', operator: 'eq', value: 'Open' },
        {
          any: [
            { target: 'severity', operator: 'eq', value: 'High' },
            { target: 'age-hours', operator: 'gt', value: 48 },
          ],
        },
      ],
    });
    expect(rendered).toBe('status eq "Open" and (severity eq "High" or age-hours gt 48)');
  });

  it('marks a clause that may constrain nothing at render time', () => {
    // `skipWhenEmpty` is the difference between a page that filters and a page that appears to.
    expect(
      describeFilter({ target: 'severity', operator: 'in', valueFrom: 'severityFilter', skipWhenEmpty: true }),
    ).toBe('severity in ←severityFilter [skip when empty]');
  });

  it('renders an expression as written rather than paraphrasing it', () => {
    expect(describeFilter({ target: 'created-at', operator: 'eq', value: { $param: 'as-of' } })).toBe(
      'created-at eq $param(as-of)',
    );
  });

  it('returns null for nothing, so a caller can say "unfiltered" in its own words', () => {
    expect(describeFilter(undefined)).toBeNull();
    expect(describeFilter({ all: [] })).toBeNull();
  });
});

// ── actions ──────────────────────────────────────────────────────────────────────────

describe('describeAction', () => {
  it('describes each kind in the terms that kind uses', () => {
    expect(
      describeAction({ id: 'a', kind: 'setFilter', channel: 'severity', value: 'High' } as never),
    ).toBe('Set the "severity" filter to "High"');

    expect(
      describeAction({
        id: 'a',
        kind: 'export',
        dataSource: 'rows',
        format: 'csv',
        scope: 'all',
      } as never),
    ).toBe('Export rows as CSV (all rows, not just the current view)');

    expect(
      describeAction({ id: 'a', kind: 'clearFilters' } as never),
    ).toBe('Clear every filter on the page');

    expect(
      describeAction({ id: 'a', kind: 'composite', steps: ['one', 'two'] } as never),
    ).toBe('Run 2 step(s) in order: one → two');
  });

  it('says plainly that a reserved kind does not run', () => {
    // `invoke` and `workflow` validate as declarations and are rejected by the M1 validator. A summary
    // that described them as if they worked would be the most misleading sentence in the panel.
    expect(describeAction({ id: 'a', kind: 'invoke', operation: 'dq.assign' } as never)).toMatch(
      /^RESERVED \(v2 write-back\)/,
    );
  });
});

describe('summariseActions', () => {
  const withActions = (
    components: Record<string, unknown>,
    actions: Record<string, unknown>,
    navigation?: unknown,
  ) =>
    summariseActions(
      page({
        components: components as never,
        actions: actions as never,
        ...(navigation ? ({ navigation } as never) : {}),
      }),
    );

  it('finds the component and event that dispatch an action', () => {
    const [summary] = withActions(
      {
        table: {
          id: 'table',
          type: 'data.table',
          typeVersion: '1.0.0',
          eventActions: { rowActivated: 'open-detail' },
        },
      },
      { 'open-detail': { id: 'open-detail', kind: 'drilldown', entity: 'dq.exception' } },
    );
    expect(summary!.dispatchedBy).toEqual([{ componentId: 'table', event: 'rowActivated' }]);
    expect(summary!.unreachable).toBe(false);
  });

  it('reads every eventActions shape, not only a bare id', () => {
    // The shape is irregular by design — a bare id, a list, or an object with a condition. A reader
    // that only handled the string case would call a wired action unreachable, and the author would
    // delete working behaviour.
    const summaries = withActions(
      {
        a: { id: 'a', type: 'data.table', typeVersion: '1.0.0', eventActions: { e1: ['one'] } },
        b: {
          id: 'b',
          type: 'data.table',
          typeVersion: '1.0.0',
          eventActions: { e2: { action: 'two', enabled: { $expr: 'true' } } },
        },
        c: {
          id: 'c',
          type: 'data.table',
          typeVersion: '1.0.0',
          eventActions: { e3: [{ action: 'three' }] },
        },
      },
      {
        one: { id: 'one', kind: 'clearFilters' },
        two: { id: 'two', kind: 'clearFilters' },
        three: { id: 'three', kind: 'clearFilters' },
      },
    );
    expect(summaries.filter((s) => s.unreachable)).toEqual([]);
  });

  it('treats a composite step and a page action as reachable', () => {
    const summaries = withActions(
      {},
      {
        step: { id: 'step', kind: 'clearFilters' },
        wrapper: { id: 'wrapper', kind: 'composite', steps: ['step'] },
        header: { id: 'header', kind: 'refresh' },
      },
      { pageActions: ['header'] },
    );
    const byId = new Map(summaries.map((s) => [s.id, s]));
    expect(byId.get('step')!.unreachable).toBe(false);
    expect(byId.get('step')!.usedBySteps).toEqual(['wrapper']);
    expect(byId.get('header')!.isPageAction).toBe(true);
    expect(byId.get('header')!.unreachable).toBe(false);
    // The composite itself: nothing dispatches it, so it genuinely cannot run.
    expect(byId.get('wrapper')!.unreachable).toBe(true);
  });
});

// ── against the shipped artifacts ────────────────────────────────────────────────────

describe('the shipped pages', () => {
  it.each(SHIPPED)('summarises %s without inventing or losing anything', (_name, json) => {
    const definition = json as unknown as PageDefinition;
    const sources = summariseSources(definition);
    const actions = summariseActions(definition);
    const counts = aspectCounts(definition);

    // Every declaration is accounted for — a describer that silently skipped one would make the tab
    // badge disagree with the artifact.
    expect(sources).toHaveLength(Object.keys(definition.dataSources ?? {}).length);
    expect(actions).toHaveLength(Object.keys(definition.actions ?? {}).length);
    expect(counts.dataSources).toBe(sources.length);
    expect(counts.actions).toBe(actions.length);

    for (const source of sources) {
      expect(source.entity, `${source.id} entity`).toBeTruthy();
      expect(source.fields.length, `${source.id} selects nothing`).toBeGreaterThan(0);
    }
    for (const action of actions) {
      expect(action.summary, `${action.id} summary`).toBeTruthy();
      expect(action.summary, `${action.id} is unrecognised`).not.toMatch(/^Unrecognised/);
    }
  });

  it('finds no orphan source and no unreachable action in a hand-authored page', () => {
    // The templates were built by hand and reviewed, so an orphan here would mean the reverse index
    // is wrong rather than that the page is. This is the test that would have caught a false positive
    // before an author acted on one.
    for (const [name, json] of SHIPPED) {
      const counts = aspectCounts(json as unknown as PageDefinition);
      expect(counts.orphanSources, `${name}: unread data sources`).toBe(0);
      expect(counts.unreachableActions, `${name}: unreachable actions`).toBe(0);
    }
  });
});
