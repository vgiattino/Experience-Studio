/**
 * Compare Experience — PRD §16.4.
 *
 * The property under test is the one §16.4's goal sentence states and a two-way diff cannot deliver:
 * **which side made each change.** So nearly every test here sets up the same shape — a baseline, a
 * product change, a client change — and asserts the attribution rather than the count. A comparison
 * that finds the right number of differences and puts them on the wrong side is worse than one that
 * finds none, because it will be acted on.
 *
 * The second property is that a difference is *addressable*: §16.5's deferred selective sync can only
 * ever be built on stable ids, so an id that moved when a list reordered would quietly close that door.
 */

import { describe, expect, it } from 'vitest';
import type { ExperienceDefinition, PageDefinition } from '@opus/contracts';

import { compareWithStandard, deriveClientExperience, type Difference } from './index';

const NOW = '2026-08-21T12:00:00.000Z';

// ── the fixture ─────────────────────────────────────────────────────────────

function page(over: Partial<PageDefinition> = {}): PageDefinition {
  return {
    schemaVersion: '1.0',
    id: 'overview',
    name: 'Security Master Overview',
    kind: 'dashboard',
    filters: { assetClass: { id: 'assetClass' } },
    dataSources: {
      securities: {
        id: 'securities',
        entity: 'securities.security',
        kind: 'query',
        select: { attributes: [{ attribute: 'name' }, { attribute: 'isin' }] },
      },
    },
    components: {
      grid: {
        id: 'grid',
        type: 'data.table',
        typeVersion: '1.0.0',
        title: 'Securities',
        dataSource: 'securities',
        bindings: { columns: [{ field: 'name' }, { field: 'isin' }] },
      },
      coverage: {
        id: 'coverage',
        type: 'analytics.chart',
        typeVersion: '1.0.0',
        title: 'Coverage by asset class',
        dataSource: 'securities',
        config: { mark: 'bar' },
      },
      find: {
        id: 'find',
        type: 'input.filter-bar',
        typeVersion: '1.0.0',
        title: 'Find a security',
        config: { placeholder: 'Search by name' },
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

function standard(version = '1.0', over: Partial<ExperienceDefinition> = {}): ExperienceDefinition {
  return {
    schemaVersion: '1.0',
    id: 'security-master',
    name: 'Security Master Overview',
    kind: 'application',
    pages: { overview: page() },
    navigation: { mode: 'sidebar', items: [{ id: 'n-overview', label: 'Overview', page: 'overview' }] },
    standard: { standardId: 'security-master', version, productRelease: '2026.08' },
    version: { schemaVersion: '1.0', artifactVersion: 1, lifecycleState: 'published' },
    ...over,
  } as unknown as ExperienceDefinition;
}

/** The baseline, and a variant derived from it — the real starting state of every §16.4 question. */
function derived(baseline: ExperienceDefinition): ExperienceDefinition {
  const outcome = deriveClientExperience({ standard: baseline, actorId: 'ana' }, NOW);
  if (!outcome.ok) throw new Error(outcome.detail);
  return outcome.definition;
}

/**
 * Apply an edit to the one page every fixture has.
 *
 * Used for both sides, which is the point: the product's edit and the client's edit go through the same
 * function, so a test that reports them differently is reporting the comparison rather than the setup.
 */
function edited(
  base: ExperienceDefinition,
  edit: (p: PageDefinition) => PageDefinition,
): ExperienceDefinition {
  return {
    ...base,
    pages: { overview: edit(base.pages!['overview'] as PageDefinition) },
  } as ExperienceDefinition;
}

function compare(client: ExperienceDefinition, newStandard: ExperienceDefinition, baseline: ExperienceDefinition) {
  const outcome = compareWithStandard({ client, standard: newStandard, baseline });
  if (!outcome.ok) throw new Error(`${outcome.code}: ${outcome.detail}`);
  return outcome.comparison;
}

function find(differences: readonly Difference[], predicate: (d: Difference) => boolean): Difference {
  const found = differences.find(predicate);
  if (!found) {
    throw new Error(`no matching difference among: ${differences.map((d) => `${d.id} (${d.side})`).join(', ')}`);
  }
  return found;
}

// ── attribution, which is the requirement ───────────────────────────────────

describe('§16.4 — which side changed it', () => {
  it('attributes a product change to the product', () => {
    const baseline = standard('1.0');
    const client = derived(baseline);
    const shipped = edited(standard('2.0'), (p) => ({
      ...p,
      components: {
        ...p.components,
        grid: { ...p.components['grid']!, bindings: { columns: [{ field: 'name' }, { field: 'isin' }, { field: 'currency' }] } },
      },
    }));

    const { differences, counts } = compare(client, shipped, baseline);
    const columns = find(differences, (d) => d.category === 'columns-changed');
    expect(columns.side).toBe('product');
    expect(columns.summary).toContain('added “currency”');
    expect(counts).toEqual({ product: 1, client: 0, conflicts: 0 });
  });

  it('attributes a client change to the client', () => {
    const baseline = standard('1.0');
    const client = edited(derived(baseline), (p) => ({
      ...p,
      components: {
        ...p.components,
        grid: { ...p.components['grid']!, bindings: { columns: [{ field: 'name' }] } },
      },
    }));

    const { differences, counts } = compare(client, standard('2.0'), baseline);
    const columns = find(differences, (d) => d.category === 'columns-changed');
    expect(columns.side).toBe('client');
    expect(columns.summary).toContain('removed “isin”');
    expect(counts).toEqual({ product: 0, client: 1, conflicts: 0 });
  });

  it('cannot be answered by a two-way diff, and this is the case that proves it', () => {
    /*
      Two runs, both ending with a variant whose grid lacks `currency` while the standard has it. A diff
      of client-against-standard sees the same thing in both. The difference — and it decides opposite
      actions — is that in the first the PRODUCT added a column, and in the second the CLIENT removed
      one the product had already shipped.
    */
    const productAdded = compare(
      derived(standard('1.0')),
      edited(standard('2.0'), (p) => ({
        ...p,
        components: {
          ...p.components,
          grid: { ...p.components['grid']!, bindings: { columns: [{ field: 'name' }, { field: 'isin' }, { field: 'currency' }] } },
        },
      })),
      standard('1.0'),
    );

    const withCurrency = edited(standard('1.0'), (p) => ({
      ...p,
      components: {
        ...p.components,
        grid: { ...p.components['grid']!, bindings: { columns: [{ field: 'name' }, { field: 'isin' }, { field: 'currency' }] } },
      },
    }));
    const clientRemoved = compare(
      edited(derived(withCurrency), (p) => ({
        ...p,
        components: {
          ...p.components,
          grid: { ...p.components['grid']!, bindings: { columns: [{ field: 'name' }, { field: 'isin' }] } },
        },
      })),
      { ...withCurrency, standard: { ...withCurrency.standard!, version: '2.0' } } as ExperienceDefinition,
      withCurrency,
    );

    expect(find(productAdded.differences, (d) => d.category === 'columns-changed').side).toBe('product');
    expect(find(clientRemoved.differences, (d) => d.category === 'columns-changed').side).toBe('client');
  });

  it('calls it a conflict when both sides touched the same subject, and says what each did', () => {
    const baseline = standard('1.0');
    const client = edited(derived(baseline), (p) => ({
      ...p,
      components: {
        ...p.components,
        coverage: { ...p.components['coverage']!, config: { mark: 'area' } },
      },
    }));
    const shipped = edited(standard('2.0'), (p) => ({
      ...p,
      components: {
        ...p.components,
        coverage: { ...p.components['coverage']!, config: { mark: 'line' } },
      },
    }));

    const { differences, counts } = compare(client, shipped, baseline);
    const conflict = find(differences, (d) => d.side === 'both');
    expect(counts.conflicts).toBe(1);
    // The two halves are kept apart, because "what did each of them do" is the reader's next question.
    expect(conflict.productChange).toContain('line chart');
    expect(conflict.clientChange).toContain('area chart');
    expect(conflict.summary).toContain('Both the product and this experience changed');
  });

  it('does not call it a conflict when the two sides changed different things', () => {
    // The case a merge keyed too coarsely would get wrong: same page, same category, different widget.
    const baseline = standard('1.0');
    const client = edited(derived(baseline), (p) => ({
      ...p,
      components: {
        ...p.components,
        grid: { ...p.components['grid']!, bindings: { columns: [{ field: 'name' }] } },
      },
    }));
    const shipped = edited(standard('2.0'), (p) => ({
      ...p,
      components: {
        ...p.components,
        coverage: { ...p.components['coverage']!, config: { mark: 'line' } },
      },
    }));

    const { counts } = compare(client, shipped, baseline);
    expect(counts).toEqual({ product: 1, client: 1, conflicts: 0 });
  });

  it('reports nothing when nobody changed anything', () => {
    // A freshly derived variant against a standard whose version moved but whose content did not — a
    // real case, since a release can renumber without editing every experience in it.
    const baseline = standard('1.0');
    const { differences } = compare(derived(baseline), standard('2.0'), baseline);
    expect(differences).toEqual([]);
  });
});

// ── §16.4's eight kinds ─────────────────────────────────────────────────────

describe('§16.4 — the categories it asks for', () => {
  const baseline = standard('1.0');

  it('added capabilities — a new widget', () => {
    const shipped = edited(standard('2.0'), (p) => ({
      ...p,
      components: {
        ...p.components,
        esg: { id: 'esg', type: 'analytics.kpi-card', typeVersion: '1.0.0', title: 'ESG coverage' },
      },
    }));
    const d = find(compare(derived(baseline), shipped, baseline).differences, (x) => x.category === 'capability-added');
    expect(d.summary).toContain('ESG coverage');
    expect(d.summary).toContain('kpi card');
  });

  it('added capabilities — a whole new screen, which is the largest one there is', () => {
    const shipped = {
      ...standard('2.0'),
      pages: { overview: page(), prices: page({ id: 'prices', name: 'Price History' }) },
    } as ExperienceDefinition;
    const d = find(compare(derived(baseline), shipped, baseline).differences, (x) => x.id === 'page:prices');
    expect(d.category).toBe('capability-added');
    expect(d.summary).toContain('A new screen, “Price History”');
    expect(d.summary).toContain('3 widgets');
  });

  it('removed capabilities', () => {
    const shipped = edited(standard('2.0'), (p) => {
      const { find: _dropped, ...rest } = p.components as Record<string, unknown>;
      return { ...p, components: rest } as PageDefinition;
    });
    const d = find(compare(derived(baseline), shipped, baseline).differences, (x) => x.category === 'capability-removed');
    expect(d.summary).toContain('“Find a security” is gone');
  });

  it('changed layouts — a reorder, named', () => {
    const shipped = edited(standard('2.0'), (p) => ({
      ...p,
      layout: {
        kind: 'container',
        id: 'root',
        container: {
          type: 'stack',
          children: [
            { kind: 'widget', id: 'w-coverage', component: 'coverage' },
            { kind: 'widget', id: 'w-find', component: 'find' },
            { kind: 'widget', id: 'w-grid', component: 'grid' },
          ],
        },
      },
    } as unknown as PageDefinition));
    const d = find(compare(derived(baseline), shipped, baseline).differences, (x) => x.category === 'layout-changed');
    expect(d.summary).toContain('reordered');
    expect(d.summary).toContain('Coverage by asset class');
  });

  it('does NOT report a layout change for a widget that was added or removed', () => {
    /*
      Adding a widget shifts every widget after it, so an order comparison that included the new one
      would report "the layout changed" alongside "a capability was added" for one edit. Every added
      widget in every release would produce a spurious layout row.
    */
    const shipped = edited(standard('2.0'), (p) => ({
      ...p,
      components: {
        ...p.components,
        esg: { id: 'esg', type: 'analytics.kpi-card', typeVersion: '1.0.0', title: 'ESG coverage' },
      },
      layout: {
        kind: 'container',
        id: 'root',
        container: {
          type: 'stack',
          children: [
            { kind: 'widget', id: 'w-esg', component: 'esg' },
            { kind: 'widget', id: 'w-find', component: 'find' },
            { kind: 'widget', id: 'w-grid', component: 'grid' },
            { kind: 'widget', id: 'w-coverage', component: 'coverage' },
          ],
        },
      },
    } as unknown as PageDefinition));
    const { differences } = compare(derived(baseline), shipped, baseline);
    expect(differences.filter((d) => d.category === 'layout-changed')).toEqual([]);
    expect(differences.filter((d) => d.category === 'capability-added')).toHaveLength(1);
  });

  it('new/removed columns, naming both halves', () => {
    const shipped = edited(standard('2.0'), (p) => ({
      ...p,
      components: {
        ...p.components,
        grid: { ...p.components['grid']!, bindings: { columns: [{ field: 'name' }, { field: 'currency' }] } },
      },
    }));
    const d = find(compare(derived(baseline), shipped, baseline).differences, (x) => x.category === 'columns-changed');
    expect(d.summary).toContain('added “currency”');
    expect(d.summary).toContain('removed “isin”');
  });

  it('changed filters — the page’s channels', () => {
    const shipped = edited(standard('2.0'), (p) => ({
      ...p,
      filters: { assetClass: { id: 'assetClass' }, reviewState: { id: 'reviewState' } },
    } as unknown as PageDefinition));
    const d = find(compare(derived(baseline), shipped, baseline).differences, (x) => x.id === 'filters:overview');
    expect(d.category).toBe('filters-changed');
    expect(d.summary).toContain('added “reviewState”');
  });

  it('changed filters — a filter component’s own configuration', () => {
    const shipped = edited(standard('2.0'), (p) => ({
      ...p,
      components: {
        ...p.components,
        find: { ...p.components['find']!, config: { placeholder: 'Search by name or ISIN' } },
      },
    }));
    const d = find(compare(derived(baseline), shipped, baseline).differences, (x) => x.category === 'filters-changed');
    expect(d.subject).toBe('Find a security');
  });

  it('changed charts — the mark', () => {
    const shipped = edited(standard('2.0'), (p) => ({
      ...p,
      components: { ...p.components, coverage: { ...p.components['coverage']!, config: { mark: 'line' } } },
    }));
    const d = find(compare(derived(baseline), shipped, baseline).differences, (x) => x.category === 'chart-changed');
    expect(d.summary).toBe('“Coverage by asset class” is now a line chart, was a bar chart.');
  });

  it('changed charts — what it plots, which is a bigger change than how it draws it', () => {
    const shipped = edited(standard('2.0'), (p) => ({
      ...p,
      components: {
        ...p.components,
        coverage: {
          ...p.components['coverage']!,
          encodings: [
            { channel: 'x', binding: { field: 'asset-class' } },
            { channel: 'y', binding: { field: 'exception-count' } },
          ],
        },
      },
    }));
    const d = find(compare(derived(baseline), shipped, baseline).differences, (x) => x.id.endsWith(':encodings'));
    expect(d.category).toBe('chart-changed');
    expect(d.summary).toContain('What “Coverage by asset class” plots');
  });

  it('changed navigation — the menu', () => {
    const shipped = {
      ...standard('2.0'),
      navigation: {
        mode: 'sidebar',
        items: [
          { id: 'n-overview', label: 'Overview', page: 'overview' },
          { id: 'n-prices', label: 'Prices', page: 'prices' },
        ],
      },
    } as unknown as ExperienceDefinition;
    const d = find(compare(derived(baseline), shipped, baseline).differences, (x) => x.id === 'nav:items');
    expect(d.category).toBe('navigation-changed');
    expect(d.summary).toContain('added “Prices”');
  });

  it('changed navigation — what a row click does', () => {
    const shipped = edited(standard('2.0'), (p) => ({
      ...p,
      components: {
        ...p.components,
        grid: { ...p.components['grid']!, eventActions: { rowActivate: 'openSecurity' } },
      },
    }));
    const d = find(compare(derived(baseline), shipped, baseline).differences, (x) => x.id.startsWith('events:'));
    expect(d.category).toBe('navigation-changed');
    expect(d.summary).toContain('interact with “Securities”');
  });

  it('changed business rules — a new action', () => {
    const shipped = edited(standard('2.0'), (p) => ({
      ...p,
      actions: { ...p.actions, escalate: { id: 'escalate', kind: 'mutate', label: 'Escalate' } },
    } as unknown as PageDefinition));
    const d = find(compare(derived(baseline), shipped, baseline).differences, (x) => x.category === 'business-rules-changed');
    expect(d.summary).toContain('A new action, “Escalate”');
  });

  it('changed business rules — an action that kept its name and changed what it does', () => {
    // The most consequential change in the list, and the one a name-only comparison would miss.
    const shipped = edited(standard('2.0'), (p) => ({
      ...p,
      actions: { suppress: { id: 'suppress', kind: 'navigate', label: 'Suppress' } },
    } as unknown as PageDefinition));
    const d = find(compare(derived(baseline), shipped, baseline).differences, (x) => x.id === 'action:overview:suppress');
    expect(d.summary).toContain('is now a navigate action, was mutate');
  });

  it('changed business rules — when a widget is shown', () => {
    const shipped = edited(standard('2.0'), (p) => ({
      ...p,
      components: {
        ...p.components,
        coverage: { ...p.components['coverage']!, visible: { $expr: 'user.hasCapability("esg.read")' } },
      },
    } as unknown as PageDefinition));
    const d = find(compare(derived(baseline), shipped, baseline).differences, (x) => x.id.endsWith(':visible'));
    expect(d.category).toBe('business-rules-changed');
  });

  it('reports a rename, which §16.4’s eight kinds have no slot for', () => {
    /*
      Found by running the comparison on the real shipped standard, not here: a client had retitled a
      chart and the comparison reported only the product's change to the same chart. Omitting a rename
      means a synchronisation silently discards the client's own name for a widget — the exact class of
      loss §16 exists to prevent — so it is reported under the closest of the eight.
    */
    const client = edited(derived(baseline), (p) => ({
      ...p,
      components: {
        ...p.components,
        coverage: { ...p.components['coverage']!, title: 'Coverage — Acme view' },
      },
    }));
    const d = find(compare(client, standard('2.0'), baseline).differences, (x) => x.id.endsWith(':title'));
    expect(d.side).toBe('client');
    expect(d.summary).toBe('Renamed “Coverage by asset class” to “Coverage — Acme view”.');
  });

  it('a rename on one side and a mark change on the other are two differences, not a conflict', () => {
    // Because the merge is keyed on the difference id, not on the component. Both touched the chart;
    // neither touched what the other touched, and a coarser key would report a conflict that is not one.
    const client = edited(derived(baseline), (p) => ({
      ...p,
      components: { ...p.components, coverage: { ...p.components['coverage']!, title: 'Coverage — Acme view' } },
    }));
    const shipped = edited(standard('2.0'), (p) => ({
      ...p,
      components: { ...p.components, coverage: { ...p.components['coverage']!, config: { mark: 'line' } } },
    }));
    expect(compare(client, shipped, baseline).counts).toEqual({ product: 1, client: 1, conflicts: 0 });
  });

  it('reports a reconfiguration as ONE difference naming its keys, not one per key', () => {
    // A reader who reconfigured a widget made one change. Three rows would make a real release
    // unreadable, and naming the keys means nothing is hidden by the grouping.
    const shipped = edited(standard('2.0'), (p) => ({
      ...p,
      components: {
        ...p.components,
        grid: { ...p.components['grid']!, config: { density: 'compact', pageSize: 50, groupBy: 'issuer' } },
      },
    }));
    const configChanges = compare(derived(baseline), shipped, baseline).differences.filter((d) =>
      d.id.endsWith(':config'),
    );
    expect(configChanges).toHaveLength(1);
    expect(configChanges[0]!.summary).toContain('density, groupBy, pageSize');
  });
});

// ── addressability, which §16.5 depends on ──────────────────────────────────

describe('a difference is addressable, because selective sync will name it', () => {
  it('keys on the subject, so an id survives a reorder', () => {
    const baseline = standard('1.0');
    const one = edited(standard('2.0'), (p) => ({
      ...p,
      components: { ...p.components, coverage: { ...p.components['coverage']!, config: { mark: 'line' } } },
    }));
    // The same edit, with an unrelated change ahead of it that shifts its position in the list.
    const two = edited(standard('2.0'), (p) => ({
      ...p,
      actions: { ...p.actions, escalate: { id: 'escalate', kind: 'mutate', label: 'Escalate' } },
      components: { ...p.components, coverage: { ...p.components['coverage']!, config: { mark: 'line' } } },
    } as unknown as PageDefinition));

    const a = find(compare(derived(baseline), one, baseline).differences, (d) => d.category === 'chart-changed');
    const b = find(compare(derived(baseline), two, baseline).differences, (d) => d.category === 'chart-changed');
    expect(a.id).toBe(b.id);
    expect(a.id).toBe('component:overview:coverage:mark');
  });

  it('orders stably, so two refreshes read identically', () => {
    const baseline = standard('1.0');
    const shipped = edited(standard('2.0'), (p) => ({
      ...p,
      actions: { ...p.actions, escalate: { id: 'escalate', kind: 'mutate', label: 'Escalate' } },
      components: {
        ...p.components,
        coverage: { ...p.components['coverage']!, config: { mark: 'line' } },
        esg: { id: 'esg', type: 'analytics.kpi-card', typeVersion: '1.0.0', title: 'ESG coverage' },
      },
    } as unknown as PageDefinition));
    const first = compare(derived(baseline), shipped, baseline).differences.map((d) => d.id);
    const second = compare(derived(baseline), shipped, baseline).differences.map((d) => d.id);
    expect(first).toEqual(second);
    expect(first.length).toBeGreaterThan(1);
  });
});

// ── the refusals ────────────────────────────────────────────────────────────

describe('what it refuses to guess at', () => {
  it('refuses without the baseline, rather than producing a two-way diff and calling it three-way', () => {
    /*
      The refusal that matters. A comparison with a guessed baseline attributes the product's changes to
      the client and the client's to the product — confidently, and in a screen somebody acts on. This
      is why `deployStandards` archives the standard it replaces.
    */
    const outcome = compareWithStandard({
      client: derived(standard('1.0')),
      standard: standard('2.0'),
      baseline: null,
    });
    expect(outcome.ok).toBe(false);
    if (outcome.ok) return;
    expect(outcome.code).toBe('baselineUnavailable');
    expect(outcome.detail).toContain('v1.0');
    // And it says what the reader can still do, because a dead end teaches them to stop looking.
    expect(outcome.detail).toContain('Keeping your version');
  });

  it('refuses on an experience that derives from no standard', () => {
    const outcome = compareWithStandard({
      client: standard('1.0'),
      standard: standard('2.0'),
      baseline: standard('1.0'),
    });
    expect(outcome.ok).toBe(false);
    if (!outcome.ok) expect(outcome.code).toBe('notDerived');
  });

  it('refuses when the thing to compare against is not a standard', () => {
    const notAStandard = { ...standard('2.0'), standard: undefined } as ExperienceDefinition;
    const outcome = compareWithStandard({
      client: derived(standard('1.0')),
      standard: notAStandard,
      baseline: standard('1.0'),
    });
    expect(outcome.ok).toBe(false);
    if (!outcome.ok) expect(outcome.code).toBe('standardNotShipped');
  });

  it('refuses on an unresolved page reference rather than silently omitting the page', () => {
    // Cannot happen through the store, which is why refusing is right: if it ever fires, resolution
    // has a hole, and a comparison that looked complete would be the worst possible way to find out.
    const withRef = {
      ...standard('2.0'),
      pages: { overview: page(), prices: { $pageRef: 'prices.page.json' } },
    } as unknown as ExperienceDefinition;
    const outcome = compareWithStandard({
      client: derived(standard('1.0')),
      standard: withRef,
      baseline: standard('1.0'),
    });
    expect(outcome.ok).toBe(false);
    if (!outcome.ok) {
      expect(outcome.code).toBe('pagesUnresolved');
      expect(outcome.detail).toContain('prices');
    }
  });
});

// ── the ninth item ──────────────────────────────────────────────────────────

describe('§16.4’s ninth item is a slice, not a category', () => {
  it('client-specific customizations are the client-side differences, whatever kind they are', () => {
    /*
      §16.4 lists "Client-specific customizations" alongside eight kinds of change. Treating it as a
      tenth category would double-count: a client column change would appear once as a column change
      and once as a customisation, and twelve differences would mean six.
    */
    const baseline = standard('1.0');
    const client = edited(derived(baseline), (p) => ({
      ...p,
      components: {
        ...p.components,
        grid: { ...p.components['grid']!, bindings: { columns: [{ field: 'name' }] } },
        coverage: { ...p.components['coverage']!, config: { mark: 'area' } },
      },
    }));

    const { differences, counts } = compare(client, standard('2.0'), baseline);
    const customisations = differences.filter((d) => d.side === 'client');
    expect(counts.client).toBe(customisations.length);
    expect(customisations.map((d) => d.category).sort()).toEqual(['chart-changed', 'columns-changed']);
    // Each appears exactly once — under its kind, with its provenance on it.
    expect(new Set(differences.map((d) => d.id)).size).toBe(differences.length);
  });
});
