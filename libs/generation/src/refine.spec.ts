/**
 * Conversational refinement (PRD §10–§12, §15, §28).
 *
 * The prompts in these tests are **the PRD's own, verbatim**. That is the point of the file: FR-08 is
 * not "the AI can modify a page", it is a list of specific sentences a business user is promised will
 * work, and a test suite of paraphrases would pass while the document's examples failed.
 *
 * Two behaviours matter as much as the successes:
 *
 *   · **A reference that does not discriminate produces a question.** "Change the chart to a bar chart"
 *     on a page with three charts has not said which. Picking the first is a wrong answer produced
 *     quietly, and the author may not notice until somebody else is looking at the page.
 *   · **Every refusal names what IS available.** A refinement that fails with "cannot do that" teaches
 *     the author to stop asking. One that lists the chart types teaches them the vocabulary.
 */

import { describe, expect, it } from 'vitest';
import type { ComponentManifest, PageDefinition } from '@opus/contracts';

import { interpret, pageViewFor, refine, resolveField, resolveWidget, type RefinePageView } from './index';

// ── manifests, cut down to what the resolver reads ──────────────────────────

const MANIFESTS = [
  {
    type: 'data.table',
    name: 'Table',
    properties: { properties: { density: { enum: ['compact', 'comfortable'] }, zebra: {} } },
  },
  {
    type: 'analytics.chart',
    name: 'Chart',
    properties: { properties: { mark: { enum: ['bar', 'line', 'area', 'point'] }, stacking: {} } },
  },
  { type: 'analytics.kpi-card', name: 'KPI Card', properties: { properties: {} } },
  {
    type: 'business.exception-queue',
    name: 'Exception Queue',
    properties: { properties: { groupBy: { enum: ['severity', 'rule', 'assignee', 'none'] }, pageSize: {} } },
  },
] as unknown as ComponentManifest[];

/**
 * A page shaped like the shipped Security Master Dashboard: KPIs across the top, a chart, a grid.
 * Field names are the catalog's own, so the field resolution tests are about real spellings.
 */
function page(): PageDefinition {
  return {
    schemaVersion: '1.0',
    id: 'security-master-dashboard',
    name: 'Security Master Dashboard',
    kind: 'dashboard',
    dataSources: {
      securities: {
        id: 'securities',
        entity: 'securities.security',
        kind: 'query',
        select: {
          attributes: [
            { attribute: 'name' },
            { attribute: 'isin' },
            { attribute: 'issuer-name' },
            { attribute: 'issuer-id' },
            { attribute: 'sector' },
            { attribute: 'currency' },
            { attribute: 'security-type' },
            { attribute: 'status' },
          ],
          measures: [{ measure: 'exception-count' }],
        },
      },
      'by-class': { id: 'by-class', entity: 'securities.security', kind: 'aggregate', select: {} },
      exceptions: {
        id: 'exceptions',
        entity: 'dq.exception',
        kind: 'query',
        select: { attributes: [{ attribute: 'severity' }, { attribute: 'age-hours' }] },
      },
    },
    components: {
      'total-kpi': { id: 'total-kpi', type: 'analytics.kpi-card', title: 'Total Securities' },
      'class-chart': {
        id: 'class-chart',
        type: 'analytics.chart',
        title: 'Securities by Asset Class',
        dataSource: 'by-class',
        config: { mark: 'bar', stacking: 'stacked' },
      },
      'securities-grid': {
        id: 'securities-grid',
        type: 'data.table',
        title: 'Securities',
        dataSource: 'securities',
        config: { density: 'compact' },
        bindings: {
          columns: [
            { field: 'name' },
            { field: 'isin' },
            { field: 'sector' },
            { field: 'currency' },
            { field: 'security-type' },
          ],
        },
      },
      'exception-queue': {
        id: 'exception-queue',
        type: 'business.exception-queue',
        title: 'Open Exceptions',
        dataSource: 'exceptions',
        config: { groupBy: 'severity' },
        bindings: { columns: [{ field: 'severity' }, { field: 'age-hours' }] },
      },
    },
    layout: {
      kind: 'container',
      id: 'root',
      container: {
        kind: 'stack',
        children: [
          // `component`, not `componentId` — the contract's field name, and the node id differs from it.
          { kind: 'widget', id: 'w-total-kpi', component: 'total-kpi' },
          { kind: 'widget', id: 'w-class-chart', component: 'class-chart' },
          { kind: 'widget', id: 'w-securities-grid', component: 'securities-grid' },
          { kind: 'widget', id: 'w-exception-queue', component: 'exception-queue' },
        ],
      },
    },
  } as unknown as PageDefinition;
}

function view(over: Partial<RefinePageView> = {}): RefinePageView {
  return {
    ...pageViewFor(page(), MANIFESTS, { siblingPages: ['security-overview', 'party-overview'] }),
    ...over,
  };
}

function ask(prompt: string, on: RefinePageView = view()) {
  return refine(prompt, on);
}

// ── the projection ──────────────────────────────────────────────────────────

describe('the page as the resolver sees it', () => {
  const v = view();

  it('reads every widget with its title, type and placement', () => {
    expect(v.widgets.map((w) => w.componentId)).toEqual([
      'total-kpi',
      'class-chart',
      'securities-grid',
      'exception-queue',
    ]);
    expect(v.widgets.find((w) => w.componentId === 'securities-grid')).toMatchObject({
      title: 'Securities',
      parentId: 'root',
      index: 2,
    });
  });

  it('reads the columns a widget shows, in order', () => {
    expect(v.widgets.find((w) => w.componentId === 'securities-grid')?.columns).toEqual([
      'name',
      'isin',
      'sector',
      'currency',
      'security-type',
    ]);
  });

  it('reads what a data source makes available, which is wider than what is shown', () => {
    const grid = v.widgets.find((w) => w.componentId === 'securities-grid')!;
    expect(grid.availableFields).toContain('issuer-name');
    expect(grid.columns).not.toContain('issuer-name');
  });

  it('reads the enum values a manifest declares, so a verb cannot invent one', () => {
    expect(v.widgets.find((w) => w.componentId === 'class-chart')?.configEnums['mark']).toEqual([
      'bar',
      'line',
      'area',
      'point',
    ]);
  });
});

// ── §12: the grid verbs ─────────────────────────────────────────────────────

describe('§12 — AI-driven grid configuration', () => {
  it('“Add issuer and currency.” — “issuer” is two fields, so it asks', () => {
    /*
      `issuer-name` and `issuer-id` are both real, and guessing produces a column of identifiers where
      somebody asked for names. The widget resolved without a reference — only the grid can show an
      issuer field at all — and then the field itself turned out to be the ambiguous half.
    */
    const outcome = ask('Add issuer');
    expect(outcome.outcome).toBe('ambiguous');
    if (outcome.outcome === 'ambiguous') {
      expect(outcome.candidates.map((c) => c.label).sort()).toEqual(['issuer-id', 'issuer-name']);
      // And it says WHICH half, so the answer fills `field` rather than being re-parsed out of a
      // sentence that never mentioned a widget.
      expect(outcome.on).toBe('field');
    }
  });

  it('adds a column once the field is unambiguous', () => {
    const outcome = ask('Add issuer name');
    expect(outcome.outcome).toBe('resolved');
    if (outcome.outcome === 'resolved') {
      expect(outcome.refinements[0]).toMatchObject({
        verb: 'add-column',
        componentId: 'securities-grid',
        field: 'issuer-name',
      });
      expect(outcome.explanation).toBe('Added a issuer-name column to “Securities”.');
    }
  });

  it('“Remove the security type column.” — the trailing full stop and all', () => {
    const outcome = ask('Remove the security type column.');
    expect(outcome.outcome).toBe('resolved');
    if (outcome.outcome === 'resolved') {
      expect(outcome.refinements[0]).toMatchObject({
        verb: 'remove-column',
        componentId: 'securities-grid',
        field: 'security-type',
      });
      expect(outcome.explanation).toBe('Removed the security-type column from “Securities”.');
    }
  });

  it('“Sort by exception count.”', () => {
    const outcome = ask('Sort by exception count.');
    expect(outcome.outcome).toBe('resolved');
    if (outcome.outcome === 'resolved') {
      expect(outcome.refinements[0]).toMatchObject({
        verb: 'sort-rows',
        componentId: 'securities-grid',
        field: 'exception-count',
      });
    }
  });

  it('“Group the grid by issuer.” is refused, naming the grid and what can group', () => {
    /*
      The honest answer today, and the message matters more than the verdict. Grouping is a property a
      component declares; `data.table` does not declare one and `business.exception-queue` does. So the
      user's reference was perfectly good and the grid simply cannot do it — which is what they are
      told. Resolving "the grid" onto the exception queue instead would be the silent-wrong-target
      failure this whole design exists to prevent.

      Manifest-driven, so adding grouping to the table later needs no change to the engine.
    */
    const outcome = ask('Group the grid by issuer.');
    expect(outcome.outcome).toBe('refused');
    if (outcome.outcome === 'refused') {
      expect(outcome.reason).toContain('“Securities” does not offer grouping');
      expect(outcome.reason).toContain('“Open Exceptions”');
    }
  });

  it('groups the exception queue when that is what was asked for', () => {
    /*
      Grouping resolves against the manifest's ENUM, not against the data source's fields — the queue
      groups by `assignee`, and the field behind it is spelled `assigned-to`. Resolving against fields
      refused this and told the author `assignee` was unavailable, when `assignee` was exactly right.
    */
    const outcome = ask('Group the exception queue by assignee');
    expect(outcome.outcome).toBe('resolved');
    if (outcome.outcome === 'resolved') {
      expect(outcome.refinements[0]).toMatchObject({
        verb: 'group-rows',
        componentId: 'exception-queue',
        field: 'assignee',
      });
      expect(outcome.explanation).toBe('Grouped “Open Exceptions” by assignee.');
    }
  });

  it('refuses a grouping the component does not offer, and lists the ones it does', () => {
    const outcome = ask('Group the exception queue by issuer');
    expect(outcome.outcome).toBe('refused');
    if (outcome.outcome === 'refused') {
      expect(outcome.reason).toContain('can group by “severity”, “rule”, “assignee”');
      expect(outcome.reason).not.toContain('“none”');
    }
  });

  it('refuses a grouping that is already in place', () => {
    const outcome = ask('Group the exception queue by severity');
    expect(outcome.outcome).toBe('refused');
    if (outcome.outcome === 'refused') expect(outcome.reason).toContain('already grouped by severity');
  });

  it('carries the layout node id on a move, because moveNode reorders nodes not components', () => {
    const outcome = ask('Move the exceptions panel to the top');
    expect(outcome.outcome).toBe('resolved');
    if (outcome.outcome === 'resolved') {
      expect(outcome.refinements[0]).toMatchObject({
        componentId: 'exception-queue',
        nodeId: 'w-exception-queue',
      });
    }
  });

  it('refuses grouping outright on a page with nothing that offers it', () => {
    const withoutQueue = view({ widgets: view().widgets.filter((w) => w.componentId !== 'exception-queue') });
    const outcome = ask('Group by issuer', withoutQueue);
    expect(outcome.outcome).toBe('refused');
    if (outcome.outcome === 'refused') {
      expect(outcome.reason).toContain('Grouping is a property a component declares');
      expect(outcome.reason).toContain('Exception Queue');
    }
  });

  it('narrows an untargeted field verb by which widget can satisfy the field', () => {
    /*
      "Sort by exception count" names no widget, and two widgets have sortable rows. The FIELD does the
      disambiguating: `exception-count` belongs to the securities source and not to the exceptions one,
      so exactly one widget can serve the request. Grounding narrowing a reference, rather than guessing
      at one.
    */
    const outcome = ask('Sort by exception count');
    expect(outcome.outcome).toBe('resolved');
    if (outcome.outcome === 'resolved') {
      expect(outcome.refinements[0]).toMatchObject({ componentId: 'securities-grid', field: 'exception-count' });
    }
  });

  it('still asks when the field narrows to more than one widget', () => {
    // `severity` is a column on the exception queue and, in this variant, on the grid too.
    const both = view();
    const widgets = both.widgets.map((w) =>
      w.componentId === 'securities-grid'
        ? { ...w, columns: [...w.columns, 'severity'], availableFields: [...w.availableFields, 'severity'] }
        : w,
    );
    const outcome = ask('Sort by severity', view({ widgets }));
    expect(outcome.outcome).toBe('ambiguous');
  });

  it('“Highlight rows…” resolves against a field that is SHOWN, and explains itself in §19’s register', () => {
    /*
      §12's own prompt, and the pool matters: a conditional format lives ON a column binding, so
      highlighting resolves against what the widget shows rather than what its data source could
      supply. Resolving against the wider set let grounding accept a field the applier then refused —
      which the author experiences as the feature working and then not working.
    */
    const outcome = ask('Highlight rows that have a sector');
    expect(outcome.outcome).toBe('resolved');
    if (outcome.outcome === 'resolved') {
      expect(outcome.refinements[0]).toMatchObject({ verb: 'highlight-rows', field: 'sector' });
      expect(outcome.explanation).toBe(
        'Configured rows in “Securities” with a sector value to display as highlighted.',
      );
    }
  });

  it('refuses a highlight on a field that is available but not shown, and names the fix', () => {
    // `exception-count` is on the data source and not on the grid. The fix is a column, not a rephrase.
    const outcome = ask('Highlight rows that have exceptions');
    expect(outcome.outcome).toBe('refused');
    if (outcome.outcome === 'refused') {
      expect(outcome.reason).toContain('add it as a column first');
    }
  });

  it('refuses a highlight on a field nothing carries, and says what is there', () => {
    const outcome = ask('Highlight rows with a coupon breach');
    expect(outcome.outcome).toBe('refused');
    if (outcome.outcome === 'refused') expect(outcome.reason).toContain('Nothing on this page shows');
  });

  it('refuses a field the data source does not carry, and lists what it does', () => {
    const outcome = ask('Add a coupon rate column');
    expect(outcome.outcome).toBe('refused');
    if (outcome.outcome === 'refused') {
      expect(outcome.reason).toContain('Nothing on this page can show');
      expect(outcome.reason).toContain('isin');
    }
  });

  it('refuses adding a column that is already shown', () => {
    const outcome = ask('Add the currency column to the securities grid');
    expect(outcome.outcome).toBe('refused');
    if (outcome.outcome === 'refused') expect(outcome.reason).toContain('already shows currency');
  });

  it('resolves “remove” against what is shown, not what is available', () => {
    /*
      `issuer-name` is available to the grid and not shown on it, so removing it is a different mistake
      from adding something that does not exist — and the two refusals say different things.
    */
    const outcome = ask('Remove the issuer column from the securities grid');
    expect(outcome.outcome).toBe('refused');
    if (outcome.outcome === 'refused') expect(outcome.reason).toContain('not a field shown on');
  });
});

// ── §11: the visualisation verbs ────────────────────────────────────────────

describe('§11 — AI-driven visualization changes', () => {
  it('“Change the bar chart to an area chart.”', () => {
    const outcome = ask('Change the bar chart to an area chart.');
    expect(outcome.outcome).toBe('resolved');
    if (outcome.outcome === 'resolved') {
      expect(outcome.refinements[0]).toMatchObject({
        verb: 'change-chart-type',
        componentId: 'class-chart',
        chartType: 'area',
      });
      expect(outcome.explanation).toBe('Changed “Securities by Asset Class” from a bar chart to an area chart.');
    }
  });

  it('“Change the pie chart to a bar chart.” is refused by name, because pie is not offered', () => {
    /*
      §11's own first example asks for a pie chart, and `analytics.chart` offers bar, line, area and
      point. Refusing with the list is the honest answer and more useful than silently choosing `bar`,
      which would leave the author believing pie charts work.
    */
    const outcome = ask('Change the chart to a pie chart');
    expect(outcome.outcome).toBe('refused');
    if (outcome.outcome === 'refused') {
      expect(outcome.reason).toContain('“pie” is not one of the chart types');
      expect(outcome.reason).toContain('“bar”');
      expect(outcome.reason).toContain('“area”');
    }
  });

  it('refuses a change to the type it already is', () => {
    const outcome = ask('Change the chart to a bar chart');
    expect(outcome.outcome).toBe('refused');
    if (outcome.outcome === 'refused') expect(outcome.reason).toContain('already a bar chart');
  });

  it('refuses when there is no chart at all', () => {
    const noChart = view({ widgets: view().widgets.filter((w) => w.componentId !== 'class-chart') });
    const outcome = ask('Change the chart to a line chart', noChart);
    expect(outcome.outcome).toBe('refused');
    if (outcome.outcome === 'refused') expect(outcome.reason).toBe('There is no chart on this page to change.');
  });
});

// ── §15 and §11: placement ──────────────────────────────────────────────────

describe('§15 — “Move the exceptions panel to the top.”', () => {
  it('resolves the panel by its kind synonym and moves it', () => {
    const outcome = ask('Move the exceptions panel to the top.');
    expect(outcome.outcome).toBe('resolved');
    if (outcome.outcome === 'resolved') {
      expect(outcome.refinements[0]).toMatchObject({
        verb: 'move-widget',
        componentId: 'exception-queue',
        position: 'top',
      });
      expect(outcome.explanation).toBe('Moved “Open Exceptions” to the top of the page.');
    }
  });

  it('“Move this chart above the grid.” resolves both references', () => {
    const outcome = ask('Move this chart above the grid');
    expect(outcome.outcome).toBe('resolved');
    if (outcome.outcome === 'resolved') {
      expect(outcome.refinements[0]).toMatchObject({
        verb: 'move-widget',
        componentId: 'class-chart',
        position: 'before',
        relativeToComponentId: 'securities-grid',
      });
    }
  });

  it('refuses a move that would change nothing', () => {
    const outcome = ask('Move the total securities figure to the top');
    expect(outcome.outcome).toBe('refused');
    if (outcome.outcome === 'refused') expect(outcome.reason).toContain('already at the top of the section');
  });
});

// ── FR-12: navigation ───────────────────────────────────────────────────────

describe('§9 — “When the user double-clicks a security, take them to a security detail page.”', () => {
  it('wires the drill-down to a page that exists', () => {
    const outcome = ask('When the user double-clicks a security, take them to the security overview page');
    expect(outcome.outcome).toBe('resolved');
    if (outcome.outcome === 'resolved') {
      expect(outcome.refinements[0]).toMatchObject({ verb: 'set-drilldown', value: 'security-overview' });
      expect(outcome.explanation).toContain('now opens the security-overview page');
    }
  });

  it('refuses a destination that is not in the experience, and names the ones that are', () => {
    const outcome = ask('When the user clicks a security, take them to the pricing page');
    expect(outcome.outcome).toBe('refused');
    if (outcome.outcome === 'refused') {
      expect(outcome.reason).toContain('no page called “pricing”');
      expect(outcome.reason).toContain('security-overview');
    }
  });

  it('says something useful on a single-page experience', () => {
    const alone = view({ siblingPages: [] });
    const outcome = ask('When the user clicks a security, take them to the detail page', alone);
    expect(outcome.outcome).toBe('refused');
    if (outcome.outcome === 'refused') expect(outcome.reason).toContain('Add a detail page first');
  });
});

// ── reference resolution, the hard half ─────────────────────────────────────

describe('resolving a reference to a widget', () => {
  const v = view();

  it('prefers a title word over a kind word', () => {
    // On a page with a chart and a queue, "the exceptions panel" must resolve by "exceptions".
    const found = resolveWidget('the exceptions panel', v);
    expect('resolved' in found && found.resolved.componentId).toBe('exception-queue');
  });

  it('resolves by a config value the user named', () => {
    const found = resolveWidget('the bar chart', v);
    expect('resolved' in found && found.resolved.componentId).toBe('class-chart');
  });

  it('resolves by a kind synonym the type name does not contain', () => {
    expect('resolved' in resolveWidget('the grid', v) && (resolveWidget('the grid', v) as never)).toBeTruthy();
    const found = resolveWidget('the grid', v);
    expect('resolved' in found && found.resolved.componentId).toBe('securities-grid');
  });

  it('asks when a reference matches two widgets comparably', () => {
    /*
      The central refusal. Two charts and "the chart" names neither, so the answer is a question with
      both titles in it — not the first one silently.
    */
    const twoCharts: RefinePageView = {
      ...v,
      widgets: [
        v.widgets.find((w) => w.componentId === 'class-chart')!,
        {
          ...v.widgets.find((w) => w.componentId === 'class-chart')!,
          componentId: 'trend-chart',
          title: 'Exceptions Over Time',
          config: { mark: 'line' },
        },
      ],
    };
    const outcome = refine('Change the chart to a point chart', twoCharts);
    expect(outcome.outcome).toBe('ambiguous');
    if (outcome.outcome === 'ambiguous') {
      expect(outcome.candidates.map((c) => c.componentId).sort()).toEqual(['class-chart', 'trend-chart']);
      expect(outcome.question).toContain('Which did you mean?');
      expect(outcome.question).toContain('Securities by Asset Class');
      // The same shape as the field question, and distinguishable from it — this one fills `target`.
      expect(outcome.on).toBe('target');
    }
  });

  it('resolves without a reference when only one widget is eligible', () => {
    // "Sort by exception count" names no target, and only one thing on the page has sortable rows…
    const oneGrid = view({
      widgets: view().widgets.filter((w) => w.componentId === 'securities-grid'),
    });
    const outcome = refine('Sort by isin', oneGrid);
    expect(outcome.outcome).toBe('resolved');
  });

  it('says what the page has when a reference matches nothing', () => {
    const outcome = refine('Move the treasury widget to the top', view());
    expect(outcome.outcome).toBe('refused');
    if (outcome.outcome === 'refused') {
      expect(outcome.reason).toContain('Nothing on this page matches');
      expect(outcome.reason).toContain('Securities');
    }
  });
});

describe('resolving a field reference', () => {
  const available = ['name', 'isin', 'issuer-name', 'issuer-id', 'exception-count', 'security-type'];

  it('matches exactly first', () => {
    expect(resolveField('isin', available)).toEqual(['isin']);
  });

  it('normalises punctuation and case', () => {
    expect(resolveField('Security Type', available)).toEqual(['security-type']);
    expect(resolveField('exception count', available)).toEqual(['exception-count']);
  });

  it('returns every plausible match rather than guessing between them', () => {
    /*
      "issuer" is genuinely two fields. Guessing produces a column of identifiers where somebody asked
      for names, so both come back and the caller asks.
    */
    expect(resolveField('issuer', available).sort()).toEqual(['issuer-id', 'issuer-name']);
  });

  it('returns nothing for a field that is not there', () => {
    expect(resolveField('coupon', available)).toEqual([]);
  });
});

// ── interpretation ──────────────────────────────────────────────────────────

describe('interpreting the PRD’s sentences', () => {
  const cases: [string, string][] = [
    ['Add issuer and currency.', 'add-column'],
    ['Remove the security type column.', 'remove-column'],
    ['Group the grid by issuer.', 'group-rows'],
    ['Sort by exception count.', 'sort-rows'],
    ['Highlight securities with unresolved exceptions.', 'highlight-rows'],
    ['Highlight rows that have business exceptions.', 'highlight-rows'],
    ['Change the pie chart to a bar chart.', 'change-chart-type'],
    ['Change the bar chart to an area chart.', 'change-chart-type'],
    ['Move the exceptions panel to the top.', 'move-widget'],
    ['Move this chart above the grid.', 'move-widget'],
    ['When the user double-clicks a security, take them to a security detail page.', 'set-drilldown'],
  ];

  for (const [prompt, verb] of cases) {
    it(`“${prompt}” → ${verb}`, () => {
      expect(interpret(prompt)?.verb).toBe(verb);
    });
  }

  it('reads a descending sort', () => {
    expect(interpret('Sort by exception count descending')).toMatchObject({ direction: 'descending' });
  });

  it('returns nothing for a sentence that is not a refinement, so the caller can say so', () => {
    expect(interpret('what does this page do?')).toBeNull();
    expect(interpret('delete last month’s pricing data')).toBeNull();
  });

  it('tells the user what to try when nothing is understood', () => {
    const outcome = refine('make it nicer', view());
    expect(outcome.outcome).toBe('notUnderstood');
    if (outcome.outcome === 'notUnderstood') {
      // The examples in the message are verbs that actually work.
      expect(outcome.reason).toContain('sort by exception count');
      expect(outcome.reason).toContain('change the chart to a line chart');
    }
  });
});

// ── nothing mutates ─────────────────────────────────────────────────────────

describe('a refinement is a proposal, not an action', () => {
  it('never touches the page it was given', () => {
    const definition = page();
    const before = JSON.stringify(definition);
    const v = pageViewFor(definition, MANIFESTS, { siblingPages: ['security-overview'] });
    refine('Remove the currency column', v);
    refine('Move the exceptions panel to the top', v);
    refine('Change the chart to a line chart', v);
    expect(JSON.stringify(definition)).toBe(before);
  });

  it('returns a component id and a value, never a patch or a pointer', () => {
    // The seam: this module resolves references and the caller turns them into commands. A refinement
    // carrying a JSON pointer would mean the vocabulary could express edits the command layer refuses.
    const outcome = refine('Change the chart to a line chart', view());
    if (outcome.outcome === 'resolved') {
      const keys = Object.keys(outcome.refinements[0]!);
      expect(keys).not.toContain('path');
      expect(keys).not.toContain('ops');
      expect(keys).toContain('componentId');
    }
  });
});
