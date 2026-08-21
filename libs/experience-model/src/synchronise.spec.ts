/**
 * Synchronization and Reversion — PRD §16.5.
 *
 * Two properties carry this file, and both are losses rather than features.
 *
 * **Principle 5** — "Product updates must never automatically overwrite client customizations." A sync
 * that adopts a product change and quietly takes a customisation with it is the failure §16 exists to
 * prevent, so most of what follows asserts what *survived* rather than what changed.
 *
 * **Nothing exists that never renders.** Adopting a new widget has to reach the layout as well as the
 * component map. A component the layout does not place is a page that validates and is missing
 * something — the worst kind of bug here, because it looks like success.
 */

import { describe, expect, it } from 'vitest';
import type { ExperienceDefinition, LayoutNode, PageDefinition } from '@opus/contracts';

import {
  compareWithStandard,
  deriveClientExperience,
  revertToStandard,
  synchronise,
  type Comparison,
} from './index';

const NOW = '2026-08-21T12:00:00.000Z';

// ── the fixture ─────────────────────────────────────────────────────────────

function page(over: Partial<PageDefinition> = {}): PageDefinition {
  return {
    schemaVersion: '1.0',
    id: 'overview',
    name: 'Security Master Overview',
    kind: 'dashboard',
    filters: { assetClass: { id: 'assetClass' } },
    components: {
      find: { id: 'find', type: 'input.filter-bar', typeVersion: '1.0.0', title: 'Find a security' },
      grid: {
        id: 'grid',
        type: 'data.table',
        typeVersion: '1.0.0',
        title: 'Securities',
        config: { density: 'comfortable' },
        bindings: { columns: [{ field: 'name' }, { field: 'isin' }] },
      },
      coverage: {
        id: 'coverage',
        type: 'analytics.chart',
        typeVersion: '1.0.0',
        title: 'Coverage by asset class',
        config: { mark: 'bar' },
      },
    },
    layout: {
      kind: 'container',
      id: 'root',
      container: {
        type: 'stack',
        children: [
          { kind: 'widget', id: 'w-find', component: 'find' },
          { kind: 'widget', id: 'w-grid', component: 'grid' },
          { kind: 'widget', id: 'w-coverage', component: 'coverage' },
        ],
      },
    },
    actions: { suppress: { id: 'suppress', kind: 'mutate', label: 'Suppress' } },
    version: { schemaVersion: '1.0', artifactVersion: 1, lifecycleState: 'published' },
    ...over,
  } as unknown as PageDefinition;
}

function standard(version = '1.0', pageOver: Partial<PageDefinition> = {}): ExperienceDefinition {
  return {
    schemaVersion: '1.0',
    id: 'security-master',
    name: 'Security Master Overview',
    kind: 'application',
    pages: { overview: page(pageOver) },
    navigation: { mode: 'sidebar', items: [{ id: 'n-overview', label: 'Overview', page: 'overview' }] },
    standard: { standardId: 'security-master', version, productRelease: '2026.08' },
    version: { schemaVersion: '1.0', artifactVersion: 1, lifecycleState: 'published' },
  } as unknown as ExperienceDefinition;
}

function derived(baseline: ExperienceDefinition): ExperienceDefinition {
  const outcome = deriveClientExperience({ standard: baseline, actorId: 'ana' }, NOW);
  if (!outcome.ok) throw new Error(outcome.detail);
  return outcome.definition;
}

function edited(
  base: ExperienceDefinition,
  edit: (p: PageDefinition) => PageDefinition,
): ExperienceDefinition {
  return {
    ...base,
    pages: { overview: edit(base.pages!['overview'] as PageDefinition) },
  } as ExperienceDefinition;
}

function comparisonOf(client: ExperienceDefinition, shipped: ExperienceDefinition, baseline: ExperienceDefinition): Comparison {
  const outcome = compareWithStandard({ client, standard: shipped, baseline });
  if (!outcome.ok) throw new Error(`${outcome.code}: ${outcome.detail}`);
  return outcome.comparison;
}

function sync(
  client: ExperienceDefinition,
  shipped: ExperienceDefinition,
  baseline: ExperienceDefinition,
  adopt?: readonly string[],
) {
  const outcome = synchronise({
    client,
    standard: shipped,
    comparison: comparisonOf(client, shipped, baseline),
    ...(adopt ? { adopt } : {}),
    actorId: 'ana',
    now: NOW,
  });
  if (!outcome.ok) throw new Error(`${outcome.code}: ${outcome.detail}`);
  return outcome.result;
}

/** What the layout actually places, in order — the only thing that decides whether a widget renders. */
function placed(definition: ExperienceDefinition): string[] {
  const out: string[] = [];
  const walk = (node: unknown): void => {
    if (!node || typeof node !== 'object') return;
    const c = node as { kind?: string; component?: string; container?: Record<string, unknown> };
    if (c.kind === 'widget' && c.component) return void out.push(c.component);
    for (const value of Object.values(c.container ?? {})) if (Array.isArray(value)) value.forEach(walk);
  };
  walk((definition.pages!['overview'] as PageDefinition).layout as LayoutNode);
  return out;
}

function componentsOf(definition: ExperienceDefinition): string[] {
  return Object.keys((definition.pages!['overview'] as PageDefinition).components ?? {}).sort();
}

function widgetOf(definition: ExperienceDefinition, id: string) {
  return (definition.pages!['overview'] as PageDefinition).components?.[id];
}

function columnsOf(definition: ExperienceDefinition, id: string): string[] {
  const bindings = (widgetOf(definition, id)?.bindings ?? {}) as Record<string, { field?: string }[]>;
  return (bindings['columns'] ?? []).map((c) => c.field).filter((f): f is string => !!f);
}

// ── Principle 5, which is what a sync is judged on ──────────────────────────

describe('§16.5 sync all — a rebase, not an overwrite', () => {
  const baseline = standard('1.0');

  it('adopts the product’s change and keeps the client’s', () => {
    /*
      The central case. The product added a column to the grid; the client renamed the chart. Both must
      be present afterwards — this is Principle 5, and a sync that took the standard wholesale would
      lose the rename without mentioning it.
    */
    const client = edited(derived(baseline), (p) => ({
      ...p,
      components: { ...p.components, coverage: { ...p.components['coverage']!, title: 'Coverage — Acme' } },
    }));
    const shipped = edited(standard('2.0'), (p) => ({
      ...p,
      components: {
        ...p.components,
        grid: { ...p.components['grid']!, bindings: { columns: [{ field: 'name' }, { field: 'isin' }, { field: 'currency' }] } },
      },
    }));

    const result = sync(client, shipped, baseline);
    expect(columnsOf(result.definition, 'grid')).toEqual(['name', 'isin', 'currency']);
    expect(widgetOf(result.definition, 'coverage')?.title).toBe('Coverage — Acme');
    expect(result.applied).toHaveLength(1);
    expect(result.supersededCustomisations).toEqual([]);
    expect(result.keptCustomisations).toHaveLength(1);
  });

  it('moves the baseline, and records that it moved', () => {
    const result = sync(derived(baseline), edited(standard('2.0'), (p) => ({
      ...p,
      components: { ...p.components, coverage: { ...p.components['coverage']!, config: { mark: 'line' } } },
    })), baseline);

    expect(result.definition.derivedFrom).toMatchObject({
      standardVersion: '2.0',
      syncedFromVersion: '1.0',
      syncedBy: 'ana',
      syncedAt: NOW,
    });
  });

  it('clears a decline, because adopting answers the question the other way', () => {
    // A variant that declined v2.0 and then synced it must not stay silent about v2.0 — and must hear
    // about v3.0. Leaving `declinedVersion` set would do both wrong things at once.
    const client = {
      ...derived(baseline),
      derivedFrom: {
        ...derived(baseline).derivedFrom!,
        declinedVersion: '2.0',
        declinedBy: 'ana',
        declinedAt: NOW,
      },
    } as ExperienceDefinition;
    const shipped = edited(standard('2.0'), (p) => ({
      ...p,
      components: { ...p.components, coverage: { ...p.components['coverage']!, config: { mark: 'line' } } },
    }));

    const result = sync(client, shipped, baseline);
    expect(result.definition.derivedFrom?.declinedVersion).toBeUndefined();
  });

  it('names what a conflict cost, rather than reporting a clean success', () => {
    /*
      §16.5 offers no third option for a conflict: adopting takes the product's value over the reader's.
      The honest report says which customisation was superseded — a sync that returned "done" would leave
      them to discover it.
    */
    const client = edited(derived(baseline), (p) => ({
      ...p,
      components: { ...p.components, coverage: { ...p.components['coverage']!, config: { mark: 'area' } } },
    }));
    const shipped = edited(standard('2.0'), (p) => ({
      ...p,
      components: { ...p.components, coverage: { ...p.components['coverage']!, config: { mark: 'line' } } },
    }));

    const result = sync(client, shipped, baseline);
    expect(widgetOf(result.definition, 'coverage')?.config?.['mark']).toBe('line');
    expect(result.supersededCustomisations).toHaveLength(1);
    expect(result.supersededCustomisations[0]!.clientChange).toContain('area chart');
  });

  it('takes only the config keys the difference covers', () => {
    /*
      The trap `DifferenceTarget.keys` exists for. The product changed the chart's mark; the client
      changed the grid's density. Both live in `config`, on different components — but the same collision
      happens on ONE component, and copying the object wholesale would take the density with the mark.
    */
    const client = edited(derived(baseline), (p) => ({
      ...p,
      components: { ...p.components, coverage: { ...p.components['coverage']!, config: { mark: 'bar', height: 400 } } },
    }));
    const shipped = edited(standard('2.0'), (p) => ({
      ...p,
      components: { ...p.components, coverage: { ...p.components['coverage']!, config: { mark: 'line' } } },
    }));

    const result = sync(client, shipped, baseline);
    expect(widgetOf(result.definition, 'coverage')?.config?.['mark']).toBe('line');
    // The client's own key survived, even though it is in the same object as the adopted one.
    expect(widgetOf(result.definition, 'coverage')?.config?.['height']).toBe(400);
  });

  it('leaves alone every part of the artifact nobody reported a difference in', () => {
    // The reason a sync starts from the CLIENT. Anything the comparison did not decompose stays as the
    // client has it, rather than being absent from a result rebuilt out of the standard.
    const client = {
      ...derived(baseline),
      tags: ['acme', 'operations'],
      description: 'Acme’s own security master view',
    } as ExperienceDefinition;
    const shipped = edited(standard('2.0'), (p) => ({
      ...p,
      components: { ...p.components, coverage: { ...p.components['coverage']!, config: { mark: 'line' } } },
    }));

    const result = sync(client, shipped, baseline);
    expect(result.definition.tags).toEqual(['acme', 'operations']);
    expect(result.definition.description).toBe('Acme’s own security master view');
  });
});

// ── nothing may exist that never renders ────────────────────────────────────

describe('adopting a widget reaches the layout, not just the component map', () => {
  const baseline = standard('1.0');

  it('places an adopted widget, so it actually renders', () => {
    /*
      The comparison deliberately reports NO layout change for an added widget — otherwise every addition
      in every release would produce a spurious reorder row — which makes the placement the applier's
      job and nobody else's. A component the layout does not place is a page that validates and is
      missing something.
    */
    const shipped = {
      ...standard('2.0'),
      pages: {
        overview: {
          ...page(),
          components: {
            ...page().components,
            esg: { id: 'esg', type: 'analytics.kpi-card', typeVersion: '1.0.0', title: 'ESG coverage' },
          },
          layout: {
            kind: 'container',
            id: 'root',
            container: {
              type: 'stack',
              children: [
                { kind: 'widget', id: 'w-find', component: 'find' },
                { kind: 'widget', id: 'w-esg', component: 'esg' },
                { kind: 'widget', id: 'w-grid', component: 'grid' },
                { kind: 'widget', id: 'w-coverage', component: 'coverage' },
              ],
            },
          },
        },
      },
    } as unknown as ExperienceDefinition;

    const result = sync(derived(baseline), shipped, baseline);
    expect(componentsOf(result.definition)).toContain('esg');
    expect(placed(result.definition)).toContain('esg');
  });

  it('puts it where the product put it, not at the bottom', () => {
    // Appending is simpler and would drop every adopted KPI under the grid: technically present and
    // visibly wrong. The anchor is the nearest preceding widget the client also has.
    const shipped = {
      ...standard('2.0'),
      pages: {
        overview: {
          ...page(),
          components: {
            ...page().components,
            esg: { id: 'esg', type: 'analytics.kpi-card', typeVersion: '1.0.0', title: 'ESG coverage' },
          },
          layout: {
            kind: 'container',
            id: 'root',
            container: {
              type: 'stack',
              children: [
                { kind: 'widget', id: 'w-find', component: 'find' },
                { kind: 'widget', id: 'w-esg', component: 'esg' },
                { kind: 'widget', id: 'w-grid', component: 'grid' },
                { kind: 'widget', id: 'w-coverage', component: 'coverage' },
              ],
            },
          },
        },
      },
    } as unknown as ExperienceDefinition;

    const result = sync(derived(baseline), shipped, baseline);
    expect(placed(result.definition)).toEqual(['find', 'esg', 'grid', 'coverage']);
  });

  it('removes the layout node with the component, so nothing points at nothing', () => {
    const shipped = {
      ...standard('2.0'),
      pages: {
        overview: {
          ...page(),
          components: { find: page().components['find']!, grid: page().components['grid']! },
        },
      },
    } as unknown as ExperienceDefinition;

    const result = sync(derived(baseline), shipped, baseline);
    expect(componentsOf(result.definition)).toEqual(['find', 'grid']);
    // A widget node pointing at a component that is gone is a render error, not a tidiness issue.
    expect(placed(result.definition)).not.toContain('coverage');
  });

  it('adopting a reorder does not change WHICH widgets are on the page', () => {
    /*
      The loss this guards against. The client added a widget and removed another; the product reordered.
      Taking the standard's tree wholesale would delete the client's addition and resurrect their
      removal — silently, as a side effect of adopting a reorder.
    */
    const client = edited(derived(baseline), (p) => {
      const { coverage: _dropped, ...kept } = p.components as Record<string, unknown>;
      return {
        ...p,
        components: {
          ...kept,
          notes: { id: 'notes', type: 'content.text', typeVersion: '1.0.0', title: 'Acme notes' },
        },
        layout: {
          kind: 'container',
          id: 'root',
          container: {
            type: 'stack',
            children: [
              { kind: 'widget', id: 'w-find', component: 'find' },
              { kind: 'widget', id: 'w-grid', component: 'grid' },
              { kind: 'widget', id: 'w-notes', component: 'notes' },
            ],
          },
        },
      } as unknown as PageDefinition;
    });

    const shipped = edited(standard('2.0'), (p) => ({
      ...p,
      layout: {
        kind: 'container',
        id: 'root',
        container: {
          type: 'stack',
          children: [
            { kind: 'widget', id: 'w-grid', component: 'grid' },
            { kind: 'widget', id: 'w-find', component: 'find' },
            { kind: 'widget', id: 'w-coverage', component: 'coverage' },
          ],
        },
      },
    } as unknown as PageDefinition));

    const result = sync(client, shipped, baseline);
    // The standard's order for the widgets both have, the client's own additions after them, and
    // nothing resurrected.
    expect(placed(result.definition)).toEqual(['grid', 'find', 'notes']);
    expect(componentsOf(result.definition)).not.toContain('coverage');
  });
});

// ── selective, which §16.5 defers and this shape gives ──────────────────────

describe('§16.5’s deferred selective synchronisation', () => {
  const baseline = standard('1.0');

  function twoProductChanges() {
    return edited(standard('2.0'), (p) => ({
      ...p,
      components: {
        ...p.components,
        coverage: { ...p.components['coverage']!, config: { mark: 'line' } },
        grid: { ...p.components['grid']!, bindings: { columns: [{ field: 'name' }, { field: 'isin' }, { field: 'currency' }] } },
      },
    }));
  }

  it('adopts one product change and leaves the other, which is the whole point of per-change', () => {
    // §16.5's own example: "Adopt new exception visualization / Keep custom columns."
    const client = derived(baseline);
    const shipped = twoProductChanges();
    const comparison = comparisonOf(client, shipped, baseline);
    const chart = comparison.differences.find((d) => d.category === 'chart-changed')!;

    const result = sync(client, shipped, baseline, [chart.id]);
    expect(widgetOf(result.definition, 'coverage')?.config?.['mark']).toBe('line');
    expect(columnsOf(result.definition, 'grid')).toEqual(['name', 'isin']);
    expect(result.applied).toHaveLength(1);
  });

  it('refuses to “adopt” one of the reader’s own changes, rather than treating it as a no-op', () => {
    /*
      Adopting a client-side difference would overwrite the client's value with the client's own value.
      Absorbing it silently would leave a caller believing something happened; saying so is how they find
      out they wanted Revert.
    */
    const client = edited(derived(baseline), (p) => ({
      ...p,
      components: { ...p.components, coverage: { ...p.components['coverage']!, title: 'Coverage — Acme' } },
    }));
    const shipped = twoProductChanges();
    const comparison = comparisonOf(client, shipped, baseline);
    const mine = comparison.differences.find((d) => d.side === 'client')!;

    const outcome = synchronise({
      client,
      standard: shipped,
      comparison,
      adopt: [mine.id],
      actorId: 'ana',
      now: NOW,
    });
    expect(outcome.ok).toBe(false);
    if (outcome.ok) return;
    expect(outcome.code).toBe('notAdoptable');
    expect(outcome.detail).toContain('reverting to the standard drops them');
  });

  it('refuses when there is nothing the product changed', () => {
    const outcome = synchronise({
      client: derived(baseline),
      standard: standard('2.0'),
      comparison: comparisonOf(derived(baseline), standard('2.0'), baseline),
      actorId: 'ana',
      now: NOW,
    });
    expect(outcome.ok).toBe(false);
    if (!outcome.ok) {
      expect(outcome.code).toBe('nothingToAdopt');
      expect(outcome.detail).toContain('has not changed anything');
    }
  });
});

// ── revert ──────────────────────────────────────────────────────────────────

describe('§16.5 revert to standard', () => {
  const baseline = standard('1.0');

  it('takes the standard’s content and drops the customisations', () => {
    const client = edited(derived(baseline), (p) => ({
      ...p,
      components: { ...p.components, coverage: { ...p.components['coverage']!, title: 'Coverage — Acme' } },
    }));
    const outcome = revertToStandard({ client, standard: standard('2.0'), actorId: 'ana', now: NOW });
    expect(outcome.ok).toBe(true);
    if (!outcome.ok) return;
    expect(widgetOf(outcome.result.definition, 'coverage')?.title).toBe('Coverage by asset class');
    expect(outcome.result.definition.derivedFrom?.standardVersion).toBe('2.0');
  });

  it('keeps the client’s identity, because reverting content is not ceasing to be a variant', () => {
    /*
      Taking the standard's id would collide with the standard itself and make the variant unreachable —
      and the store would then refuse every save to it, since a `standard` field means product-owned.
    */
    const client = derived(baseline);
    const outcome = revertToStandard({ client, standard: standard('2.0'), actorId: 'ana', now: NOW });
    if (!outcome.ok) throw new Error(outcome.detail);
    expect(outcome.result.definition.id).toBe('security-master.client');
    expect(outcome.result.definition.name).toBe('Security Master Overview — Client Version');
    expect(outcome.result.definition.standard).toBeUndefined();
    expect(outcome.result.definition.derivedFrom).toBeDefined();
  });

  it('records the reversion as a synchronisation, because that is what it is', () => {
    const outcome = revertToStandard({
      client: derived(baseline),
      standard: standard('2.0'),
      actorId: 'ana',
      now: NOW,
    });
    if (!outcome.ok) throw new Error(outcome.detail);
    expect(outcome.result.definition.derivedFrom).toMatchObject({
      syncedFromVersion: '1.0',
      standardVersion: '2.0',
      syncedBy: 'ana',
    });
  });

  it('refuses on an experience that derives from no standard', () => {
    const outcome = revertToStandard({
      client: standard('1.0'),
      standard: standard('2.0'),
      actorId: 'ana',
      now: NOW,
    });
    expect(outcome.ok).toBe(false);
    if (!outcome.ok) expect(outcome.code).toBe('notDerived');
  });
});

// ── preview ─────────────────────────────────────────────────────────────────

describe('§16.5 preview before sync', () => {
  it('changes nothing, because a proposal is not an action', () => {
    /*
      The same rule the refinement panel keeps. Preview and sync are one function returning a definition
      the caller may or may not save, so the previewed result and the saved result cannot differ — which
      is the only way a preview is worth reading.
    */
    const baseline = standard('1.0');
    const client = derived(baseline);
    const before = JSON.stringify(client);
    const shipped = edited(standard('2.0'), (p) => ({
      ...p,
      components: { ...p.components, coverage: { ...p.components['coverage']!, config: { mark: 'line' } } },
    }));

    const first = sync(client, shipped, baseline);
    const second = sync(client, shipped, baseline);
    expect(JSON.stringify(client)).toBe(before);
    expect(JSON.stringify(first.definition)).toBe(JSON.stringify(second.definition));
  });
});

// ── what a partial sync must not do ─────────────────────────────────────────

describe('a partial synchronisation leaves the baseline where it is', () => {
  /*
    Both of these were defects, found by running a selective sync against a live API rather than here.

    A baseline is the point both sides descend from. An experience that adopted the new chart and
    declined the new KPI has cherry-picked from v2.0 and is still *based on* v1.0. Advancing the baseline
    anyway made the next comparison diff against a version the variant did not contain — so every
    un-adopted product change read as a client change, and the reader was told "The kpi card ESG coverage
    is gone" and "The action Escalate is gone" as if they had deleted them.
  */
  const baseline = standard('1.0');

  function twoProductChanges(): ExperienceDefinition {
    return {
      ...standard('2.0'),
      pages: {
        overview: {
          ...page(),
          components: {
            ...page().components,
            coverage: { ...page().components['coverage']!, config: { mark: 'line' } },
            esg: { id: 'esg', type: 'analytics.kpi-card', typeVersion: '1.0.0', title: 'ESG coverage' },
          },
          layout: {
            kind: 'container',
            id: 'root',
            container: {
              type: 'stack',
              children: [
                { kind: 'widget', id: 'w-find', component: 'find' },
                { kind: 'widget', id: 'w-esg', component: 'esg' },
                { kind: 'widget', id: 'w-grid', component: 'grid' },
                { kind: 'widget', id: 'w-coverage', component: 'coverage' },
              ],
            },
          },
        },
      },
    } as unknown as ExperienceDefinition;
  }

  it('does not advance the baseline when something was left behind', () => {
    const client = derived(baseline);
    const shipped = twoProductChanges();
    const comparison = comparisonOf(client, shipped, baseline);
    const chart = comparison.differences.find((d) => d.category === 'chart-changed')!;

    const result = sync(client, shipped, baseline, [chart.id]);
    expect(result.baselineMoved).toBe(false);
    expect(result.definition.derivedFrom?.standardVersion).toBe('1.0');
    // It still records that a sync happened — something was adopted, and the trail should say so.
    expect(result.definition.derivedFrom?.syncedBy).toBe('ana');
  });

  it('advances it when everything was adopted', () => {
    const result = sync(derived(baseline), twoProductChanges(), baseline);
    expect(result.baselineMoved).toBe(true);
    expect(result.definition.derivedFrom?.standardVersion).toBe('2.0');
  });

  it('keeps un-adopted product changes on the PRODUCT side of the next comparison', () => {
    // The consequence of the rule, and the actual bug: attribution has to survive a partial sync.
    const client = derived(baseline);
    const shipped = twoProductChanges();
    const comparison = comparisonOf(client, shipped, baseline);
    const chart = comparison.differences.find((d) => d.category === 'chart-changed')!;

    const after = sync(client, shipped, baseline, [chart.id]).definition;
    const again = comparisonOf(after, shipped, baseline);

    expect(again.counts.client).toBe(0);
    expect(again.differences.map((d) => d.side)).toEqual(['product']);
    expect(again.differences[0]!.summary).toContain('ESG coverage');
  });

  it('does not report an already-adopted change as a conflict', () => {
    /*
      The second defect. After adopting the chart, the variant and the standard both differ from the
      baseline in exactly the same way — which is agreement, not a conflict. Reported as one it would ask
      the reader to decide between two identical values, every time they looked.
    */
    const client = derived(baseline);
    const shipped = twoProductChanges();
    const comparison = comparisonOf(client, shipped, baseline);
    const chart = comparison.differences.find((d) => d.category === 'chart-changed')!;

    const after = sync(client, shipped, baseline, [chart.id]).definition;
    const again = comparisonOf(after, shipped, baseline);

    expect(again.counts.conflicts).toBe(0);
    expect(again.differences.some((d) => d.id === chart.id)).toBe(false);
  });

  it('leaves a decline standing after a partial sync, and clears it after a full one', () => {
    // A partial adoption has not accepted the version, so a decline of that version still stands.
    const declined = {
      ...derived(baseline),
      derivedFrom: { ...derived(baseline).derivedFrom!, declinedVersion: '2.0', declinedBy: 'ana', declinedAt: NOW },
    } as ExperienceDefinition;
    const shipped = twoProductChanges();
    const chart = comparisonOf(declined, shipped, baseline).differences.find((d) => d.category === 'chart-changed')!;

    expect(sync(declined, shipped, baseline, [chart.id]).definition.derivedFrom?.declinedVersion).toBe('2.0');
    expect(sync(declined, shipped, baseline).definition.derivedFrom?.declinedVersion).toBeUndefined();
  });
});
