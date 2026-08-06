/**
 * The AI pipeline, asserted where being wrong would be quiet.
 *
 * Three properties matter more than any single output, and each has tests here:
 *   · **grounded** — nothing reaches a page that the page cannot support, and the drop is explained;
 *   · **complete** — the review finds every instance of what it checks for, every time;
 *   · **honest** — the model names things and never supplies figures.
 */

import { intake } from '@opus/generation';

import { KEY_TYPE, minH, seedPages, type PageDef, type Widget } from '../model';
import { assemblePlan, bandOf } from './assemble';
import { applyEdits, ground } from './apply';
import { type CanvasEdit, type CanvasPlan } from './decisions';
import { review } from './review';
import { CanvasStandIn, type CanvasDecisionInputs } from './stand-in';
import { tidy } from './tidy';
import { ALL_CAPABILITIES, CatalogService, testCatalog } from '@opus/catalog';

import { catalogView, type CatalogEntityView } from '../data/binding';

/** Every capability the fixture catalog knows about — an author who can see all of it. */
const ALL_CAPS = [...ALL_CAPABILITIES];

function widget(
  id: string,
  type: Widget['type'],
  x: number,
  y: number,
  w: number,
  h: number,
  props: Record<string, unknown> = {},
): Widget {
  return { id, type, x, y, w, h, props };
}

function page(id: string, name: string, widgets: Widget[]): PageDef {
  return { id, name, icon: 'page', widgets };
}

/** Drive the stand-in the way the service does: intake, then decision inputs, then the call. */
async function ask(
  prompt: string,
  pages: readonly PageDef[] = [],
  pageId = 'p1',
  selected: Widget | null = null,
  catalog: readonly CatalogEntityView[] = [],
): Promise<{ plan?: CanvasPlan; edits?: CanvasEdit[] }> {
  const standIn = new CanvasStandIn();
  const result = intake(prompt, pages.some((one) => one.id === pageId && one.widgets.length));
  const inputs: CanvasDecisionInputs = {
    prompt,
    concepts: result.concepts,
    pages,
    pageId,
    selected,
    catalog,
  };
  standIn.useDecisionInputs(inputs);
  const refine = result.intent === 'refine' || !!selected;
  const response = await standIn.complete({
    system: '',
    user: prompt,
    responseSchema: {},
    purpose: refine ? 'refine' : 'plan',
  });
  return refine
    ? { edits: (response.output as { edits: CanvasEdit[] }).edits }
    : { plan: response.output as CanvasPlan };
}

describe('the stand-in plans a page', () => {
  it('names the page from the request, not from the request’s framing', async () => {
    const { plan } = await ask('Can you build me a dashboard of late file loads by source');
    expect(plan!.pageName).toBe('Late File Loads by Source');
  });

  it('asks for a breakdown when the request says "by"', async () => {
    const { plan } = await ask('Security master coverage by asset type');
    const breakdown = plan!.widgets.find((one) => one.id === 'breakdown');
    expect(breakdown).toBeTruthy();
    expect(breakdown!.title).toContain('by asset type');
  });

  it('asks for a trend only when the request mentions time', async () => {
    const withTime = await ask('Exceptions by desk with a weekly trend');
    const without = await ask('Exceptions by desk');
    expect(withTime.plan!.widgets.some((one) => one.id === 'trend')).toBe(true);
    expect(without.plan!.widgets.some((one) => one.id === 'trend')).toBe(false);
  });

  it('honours the chart kind the request asks for', async () => {
    const { plan } = await ask('Coverage by market as a donut');
    expect(plan!.widgets.find((one) => one.id === 'breakdown')!.kind).toBe('donut');
  });

  it('never supplies figures — only labels', async () => {
    const { plan } = await ask('Late files by source with a table');
    for (const planned of plan!.widgets) {
      const json = JSON.stringify(planned);
      expect(json).not.toMatch(/"\d+"|:\s*\d+(?![\d"]*\})/);
      expect(Object.keys(planned).every((key) => key !== 'series' && key !== 'rows')).toBe(true);
    }
  });

  it('always names the page on the page itself', async () => {
    const { plan } = await ask('Settlement fails');
    expect(plan!.widgets[0]!.kind).toBe('heading');
  });
});

describe('assembling a plan', () => {
  const plan: CanvasPlan = {
    pageName: 'Coverage',
    pageSummary: 'x',
    widgets: [
      { id: 'k1', kind: 'kpi', title: 'Total', purpose: 'p' },
      { id: 'k2', kind: 'kpi', title: 'Covered', purpose: 'p' },
      { id: 'k3', kind: 'kpi', title: 'Missing', purpose: 'p' },
      { id: 'c1', kind: 'column', title: 'By type', purpose: 'p' },
      { id: 't1', kind: 'table', title: 'Detail', purpose: 'p' },
    ],
  };

  it('lays every widget out inside the 12-column grid, never overlapping', () => {
    const { widgets } = assemblePlan(plan, [], 1);
    for (const one of widgets) {
      expect(one.x).toBeGreaterThanOrEqual(0);
      expect(one.x + one.w).toBeLessThanOrEqual(12);
      expect(one.h).toBeGreaterThanOrEqual(minH(one));
    }
    for (let i = 0; i < widgets.length; i++) {
      for (let j = i + 1; j < widgets.length; j++) {
        const a = widgets[i]!;
        const b = widgets[j]!;
        const overlaps =
          a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;
        expect(overlaps).toBe(false);
      }
    }
  });

  it('puts the metrics in one row and the heading above them', () => {
    const { widgets } = assemblePlan(plan, [], 1);
    expect(widgets[0]!.type).toBe('heading');
    const kpis = widgets.filter((one) => one.type === 'kpi');
    expect(kpis.length).toBe(3);
    expect(new Set(kpis.map((one) => one.y)).size).toBe(1);
    expect(kpis.map((one) => one.x)).toEqual([0, 4, 8]);
  });

  it('writes the plan’s words and the palette’s values', () => {
    const { widgets } = assemblePlan(plan, [], 1);
    const kpi = widgets.find((one) => one.type === 'kpi')!;
    expect(kpi.props['label']).toBe('Total');
    // The figure is unmistakably unbound — not a zero, which would read as a measurement.
    expect(kpi.props['value']).toBe('—');
    expect(kpi.props['delta']).toBe('');
  });

  it('stretches a sample series to the labels it was given', () => {
    const { widgets } = assemblePlan(
      {
        ...plan,
        widgets: [{ id: 'c', kind: 'column', title: 'By source', purpose: 'p', categories: ['A', 'B'] }],
      },
      [],
      1,
    );
    const chart = widgets.find((one) => one.type === 'chart')!;
    expect(chart.props['categories']).toEqual(['A', 'B']);
    expect((chart.props['series'] as number[]).length).toBe(2);
  });

  it('never points a button at a page that does not exist', () => {
    const { widgets, notes } = assemblePlan(
      {
        ...plan,
        widgets: [{ id: 'b', kind: 'button', title: 'Open', purpose: 'p', target: 'nowhere' }],
      },
      [],
      1,
    );
    expect(widgets.find((one) => one.type === 'button')!.props['target']).toBe('');
    expect(notes.join(' ')).toContain('no destination');
  });

  it('resolves a target given by page name', () => {
    const pages = [page('p-real', 'Private Markets', [])];
    const { widgets } = assemblePlan(
      {
        ...plan,
        widgets: [{ id: 'b', kind: 'button', title: 'Open', purpose: 'p', target: 'private markets' }],
      },
      pages,
      1,
    );
    expect(widgets.find((one) => one.type === 'button')!.props['target']).toBe('p-real');
  });

  it('gives every widget an id that cannot collide with the page it joins', () => {
    const { widgets } = assemblePlan(plan, [], 500);
    expect(widgets.every((one) => Number(one.id.slice(1)) >= 500)).toBe(true);
  });

  it('sorts a widget into a band by its kind when the plan does not say', () => {
    expect(bandOf('kpi')).toBe('metrics');
    expect(bandOf('donut')).toBe('charts');
    expect(bandOf('table')).toBe('detail');
    expect(bandOf('button')).toBe('actions');
  });
});

describe('the stand-in reads an instruction', () => {
  const chart = widget('w1', 'chart', 0, 1, 6, 6, { title: 'By source', kind: 'column' });
  const pages = [page('p1', 'Loads', [chart]), page('p2', 'Detail', [])];

  it('changes a chart’s kind', async () => {
    const { edits } = await ask('make it a bar chart', pages, 'p1', chart);
    expect(edits).toEqual([
      { op: 'chart-kind', widgetId: 'w1', kind: 'bar', why: 'Draws By source as a bar chart.' },
    ]);
  });

  it('renames the selection', async () => {
    const { edits } = await ask('call it Coverage by source', pages, 'p1', chart);
    expect(edits![0]).toMatchObject({ op: 'retitle', widgetId: 'w1', title: 'Coverage by source' });
  });

  it('resizes relative to the current size', async () => {
    const { edits } = await ask('make it wider', pages, 'p1', chart);
    expect(edits![0]).toMatchObject({ op: 'resize', w: 8, h: 6 });
    const full = await ask('make it full width', pages, 'p1', chart);
    expect(full.edits![0]).toMatchObject({ op: 'resize', w: 12 });
  });

  it('adds a widget, with the name the instruction gave it', async () => {
    const { edits } = await ask('add a table called Outstanding items', pages, 'p1', chart);
    expect(edits![0]).toMatchObject({ op: 'add', kind: 'table', title: 'Outstanding items' });
  });

  it('links to another page by name', async () => {
    const { edits } = await ask('add a button to link to Detail', pages, 'p1', chart);
    expect(edits![0]).toMatchObject({ op: 'link', targetPageId: 'p2' });
  });

  it('reads "tidy up" as the deterministic layout repair', async () => {
    const { edits } = await ask('tidy up the layout', pages, 'p1', chart);
    expect(edits![0]).toMatchObject({ op: 'tidy', pageId: 'p1' });
  });

  it('returns nothing rather than guessing', async () => {
    const { edits } = await ask('make it more strategic', pages, 'p1', chart);
    expect(edits).toEqual([]);
  });
});

describe('grounding', () => {
  const kpi = widget('w1', 'kpi', 0, 0, 4, 3, { label: 'Total' });
  const pages = [page('p1', 'One', [kpi]), page('p2', 'Two', [])];

  it('drops a change to a widget that is not there, and says so', () => {
    const { kept, dropped } = ground(
      [{ op: 'retitle', widgetId: 'ghost', title: 'x', why: 'y' }],
      pages,
      'p1',
    );
    expect(kept).toEqual([]);
    expect(dropped[0]).toContain('not on this page');
  });

  it('drops a property the widget type does not have', () => {
    const { kept, dropped } = ground(
      [{ op: 'set-prop', widgetId: 'w1', key: 'sql', value: 'select 1', why: 'y' }],
      pages,
      'p1',
    );
    expect(kept).toEqual([]);
    expect(dropped[0]).toContain('no such property');
  });

  it('keeps a property the widget type does have', () => {
    const { kept } = ground(
      [{ op: 'set-prop', widgetId: 'w1', key: 'value', value: '42', why: 'y' }],
      pages,
      'p1',
    );
    expect(kept.length).toBe(1);
  });

  it('refuses to change the chart type of something that is not a chart', () => {
    const { kept, dropped } = ground(
      [{ op: 'chart-kind', widgetId: 'w1', kind: 'bar', why: 'y' }],
      pages,
      'p1',
    );
    expect(kept).toEqual([]);
    expect(dropped[0]).toContain('not a chart');
  });

  it('drops a widget kind that is not in the palette', () => {
    const { kept, dropped } = ground([{ op: 'add', kind: 'iframe', title: 'x', why: 'y' }], pages, 'p1');
    expect(kept).toEqual([]);
    expect(dropped[0]).toContain('no such widget');
  });

  it('drops a link to a page that does not exist, and a link to itself', () => {
    const missing = ground(
      [{ op: 'link', targetPageId: 'p9', label: 'x', why: 'y' }],
      pages,
      'p1',
    );
    expect(missing.kept).toEqual([]);
    const self = ground([{ op: 'link', targetPageId: 'p1', label: 'x', why: 'y' }], pages, 'p1');
    expect(self.kept).toEqual([]);
    expect(self.dropped[0]).toContain('to itself');
  });
});

describe('applying edits', () => {
  const kpi = widget('w1', 'kpi', 0, 1, 4, 3, { label: 'Total' });
  const chart = widget('w2', 'chart', 4, 1, 6, 6, { title: 'By source', kind: 'column' });
  const pages = [page('p1', 'One', [kpi, chart]), page('p2', 'Two', [])];

  it('retitles through the right prop for the type', () => {
    const result = applyEdits(
      [{ op: 'retitle', widgetId: 'w1', title: 'Coverage', why: 'y' }],
      pages,
      'p1',
      100,
    );
    expect(result.pages[0]!.widgets[0]!.props['label']).toBe('Coverage');
    const onChart = applyEdits(
      [{ op: 'retitle', widgetId: 'w2', title: 'Split', why: 'y' }],
      pages,
      'p1',
      100,
    );
    expect(onChart.pages[0]!.widgets[1]!.props['title']).toBe('Split');
  });

  it('puts an added heading at the top and pushes the page down', () => {
    const result = applyEdits(
      [{ op: 'add', kind: 'heading', title: 'Loads', why: 'y' }],
      pages,
      'p1',
      100,
    );
    const widgets = result.pages[0]!.widgets;
    expect(widgets[0]!.type).toBe('heading');
    expect(widgets[0]!.y).toBe(0);
    expect(widgets[1]!.y).toBe(2);
  });

  it('adds anything else below the existing content', () => {
    const result = applyEdits(
      [{ op: 'add', kind: 'table', title: 'Detail', why: 'y' }],
      pages,
      'p1',
      100,
    );
    const added = result.pages[0]!.widgets.at(-1)!;
    expect(added.type).toBe('table');
    expect(added.y).toBe(7);
  });

  it('adds a nav button for a link, which is what a link is here', () => {
    const result = applyEdits(
      [{ op: 'link', targetPageId: 'p2', label: 'Two', why: 'y' }],
      pages,
      'p1',
      100,
    );
    const button = result.pages[0]!.widgets.at(-1)!;
    expect(button.type).toBe('button');
    expect(button.props).toMatchObject({ action: 'navigate', target: 'p2', label: 'Two' });
  });

  it('applies a link to the page the edit names, not always the open one', () => {
    const result = applyEdits(
      [{ op: 'link', pageId: 'p2', targetPageId: 'p1', label: 'Back', why: 'y' }],
      pages,
      'p1',
      100,
    );
    expect(result.pages[0]!.widgets.length).toBe(2);
    expect(result.pages[1]!.widgets.length).toBe(1);
  });

  it('leaves the pages it was given untouched, which is what undo relies on', () => {
    const before = JSON.stringify(pages);
    applyEdits([{ op: 'remove', widgetId: 'w1', why: 'y' }], pages, 'p1', 100);
    expect(JSON.stringify(pages)).toBe(before);
  });

  it('reports what it did, one line per edit', () => {
    const result = applyEdits(
      [
        { op: 'retitle', widgetId: 'w1', title: 'A', why: 'Renamed the metric.' },
        { op: 'remove', widgetId: 'w2', why: 'Removed the chart.' },
      ],
      pages,
      'p1',
      100,
    );
    expect(result.applied).toEqual(['Renamed the metric.', 'Removed the chart.']);
  });
});

describe('tidy', () => {
  it('separates overlapping widgets and closes the gaps', () => {
    const widgets = [
      widget('a', 'kpi', 0, 0, 6, 3, {}),
      widget('b', 'kpi', 3, 0, 6, 3, {}),
      widget('c', 'kpi', 0, 40, 4, 3, {}),
    ];
    const { widgets: out, changes } = tidy(widgets);
    for (let i = 0; i < out.length; i++) {
      for (let j = i + 1; j < out.length; j++) {
        const a = out[i]!;
        const b = out[j]!;
        expect(a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h).toBe(false);
      }
    }
    expect(Math.max(...out.map((one) => one.y))).toBeLessThan(10);
    expect(changes.join(' ')).toContain('Moved');
  });

  it('pulls a widget back inside the grid', () => {
    const { widgets, changes } = tidy([widget('a', 'kpi', 10, 0, 6, 3, {})]);
    expect(widgets[0]!.x + widgets[0]!.w).toBeLessThanOrEqual(12);
    expect(changes.join(' ')).toContain('inside the 12-column grid');
  });

  it('leaves a section and its contents where the author put them', () => {
    const widgets = [
      widget('sec', 'section', 0, 4, 12, 6, {}),
      widget('in', 'kpi', 1, 5, 4, 3, {}),
      widget('out', 'kpi', 0, 0, 4, 3, {}),
    ];
    const { widgets: out } = tidy(widgets);
    expect(out.find((one) => one.id === 'sec')).toMatchObject({ x: 0, y: 4 });
    expect(out.find((one) => one.id === 'in')).toMatchObject({ x: 1, y: 5 });
  });

  it('says nothing changed when the page is already tidy', () => {
    const { changes } = tidy([widget('a', 'kpi', 0, 0, 4, 3, {})]);
    expect(changes.filter((line) => line.startsWith('Moved'))).toEqual([]);
  });
});

describe('the design review', () => {
  it('flags a button that goes nowhere, and fixes it when there is only one candidate', () => {
    const pages = [
      page('p1', 'One', [widget('b', 'button', 0, 0, 3, 2, { label: 'Next', action: 'navigate', target: '' })]),
      page('p2', 'Two', [widget('h', 'heading', 0, 0, 12, 1, { text: 'Two' })]),
    ];
    const finding = review(pages).find((one) => one.id.includes('dead-button'))!;
    expect(finding.severity).toBe('issue');
    expect(finding.fix).toMatchObject({ op: 'set-prop', key: 'target', value: 'p2' });
  });

  it('does not guess a destination when there are several', () => {
    const pages = [
      page('p1', 'One', [widget('b', 'button', 0, 0, 3, 2, { label: 'Next', action: 'navigate', target: '' })]),
      page('p2', 'Two', []),
      page('p3', 'Three', []),
    ];
    const finding = review(pages).find((one) => one.id.includes('dead-button'))!;
    expect(finding.fix).toBeUndefined();
  });

  it('flags a page nothing can reach, and offers a link from the entry page', () => {
    const pages = [page('p1', 'Entry', []), page('p2', 'Orphan', [])];
    const finding = review(pages).find((one) => one.id === 'p2:unreachable')!;
    expect(finding.detail).toContain('ever see it');
    expect(finding.fix).toMatchObject({ op: 'link', pageId: 'p1', targetPageId: 'p2' });
  });

  it('never calls the first page unreachable — it is the way in', () => {
    const pages = [page('p1', 'Entry', []), page('p2', 'Two', [])];
    expect(review(pages).some((one) => one.id === 'p1:unreachable')).toBe(false);
  });

  it('flags overlapping widgets once per page, with a tidy as the fix', () => {
    const pages = [
      page('p1', 'One', [
        widget('h', 'heading', 0, 0, 12, 1, { text: 'One' }),
        widget('a', 'kpi', 0, 1, 6, 3, { label: 'A' }),
        widget('b', 'kpi', 3, 1, 6, 3, { label: 'B' }),
      ]),
    ];
    const overlaps = review(pages).filter((one) => one.id.endsWith(':overlap'));
    expect(overlaps.length).toBe(1);
    expect(overlaps[0]!.fix).toMatchObject({ op: 'tidy', pageId: 'p1' });
  });

  it('flags a missing heading and offers to add one named after the page', () => {
    const pages = [page('p1', 'Coverage', [widget('a', 'kpi', 0, 0, 4, 3, { label: 'A' })])];
    const finding = review(pages).find((one) => one.id === 'p1:no-heading')!;
    expect(finding.fix).toMatchObject({ op: 'add', kind: 'heading', title: 'Coverage' });
  });

  it('flags an empty page and does not also flag it for everything else', () => {
    const findings = review([page('p1', 'Empty', [])]);
    expect(findings.map((one) => one.id)).toEqual(['p1:empty']);
  });

  it('puts problems before polish', () => {
    const pages = [
      page('p1', 'One', [widget('a', 'kpi', 0, 0, 4, 3, { label: 'A' })]),
      page('p2', 'Two', [widget('b', 'kpi', 0, 0, 4, 3, { label: 'B' })]),
    ];
    const severities = review(pages).map((one) => one.severity);
    expect(severities).toEqual([...severities].sort((a, b) => (a === b ? 0 : a === 'issue' ? -1 : 1)));
  });

  it('every fix it offers survives grounding', () => {
    const pages = seedPages();
    for (const finding of review(pages)) {
      if (!finding.fix) continue;
      const { kept, dropped } = ground([finding.fix], pages, finding.pageId);
      expect(dropped).toEqual([]);
      expect(kept.length).toBe(1);
    }
  });

  it('finds nothing to flag on a design that has been fixed', () => {
    // Two pages, each with a heading, linked both ways, nothing overlapping.
    const pages = [
      page('p1', 'One', [
        widget('h1', 'heading', 0, 0, 12, 1, { text: 'One' }),
        widget('b1', 'button', 0, 1, 3, 2, { label: 'Open Two', action: 'navigate', target: 'p2' }),
      ]),
      page('p2', 'Two', [
        widget('h2', 'heading', 0, 0, 12, 1, { text: 'Two' }),
        widget('b2', 'button', 0, 1, 3, 2, { label: 'Back', action: 'navigate', target: 'p1' }),
      ]),
    ];
    expect(review(pages)).toEqual([]);
  });
});

describe('intake still guards the door', () => {
  it('declines a request to change data, whatever the page model underneath', () => {
    expect(intake('delete last month’s pricing data').decline).toBeTruthy();
    expect(intake('grant access to the ops team').decline).toBeTruthy();
  });

  it('treats a plain page request as a create', () => {
    expect(intake('a dashboard of late files by source').intent).toBe('create');
  });

  it('treats an instruction against an existing page as a refine', () => {
    expect(intake('add a table of the records', true).intent).toBe('refine');
  });
});

describe('the palette vocabulary is the whole vocabulary', () => {
  it('every kind a plan may name is a real palette key', async () => {
    const prompts = [
      'a dashboard of late files by source with a trend and a table',
      'a search page to look up a security by isin',
      'an exception review workspace with approve and reject',
      'coverage by asset type as a donut, filtered by date',
    ];
    for (const prompt of prompts) {
      const { plan } = await ask(prompt);
      for (const planned of plan!.widgets) {
        expect(KEY_TYPE[planned.kind]).toBeTruthy();
      }
    }
  });
});

/**
 * Planning against a real catalog.
 *
 * The step that changes what a plan *is*: from a list of titles somebody has to bind later, to refs the
 * gateway can answer. Asserted against `testCatalog()` — the platform's own fixture — so the entities,
 * measures and entitlement rules are the ones the catalog library tests itself with.
 */
describe('planning with a catalog behind it', () => {
  const catalog = (capabilities: string[] = ALL_CAPS): CatalogEntityView[] => {
    const service = new CatalogService();
    service.hydrate(testCatalog());
    return catalogView(
      service.projectionFor({
        id: 'a@demo',
        displayName: 'A',
        tenantId: 'demo-tenant',
        locale: 'en-GB',
        timezone: 'Europe/London',
        roles: ['experienceAuthor'],
        capabilities,
        entitlementScopeHash: capabilities.join(','),
      }),
    );
  };

  it('binds to the entity the request is about', async () => {
    const view = catalog();
    const { plan } = await ask('late file loads by source', [], 'p1', null, view);
    const bound = plan!.widgets.filter((one) => one.entityRef);
    expect(bound.length).toBeGreaterThan(0);
    for (const widget of bound) {
      const entity = view.find((one) => one.ref === widget.entityRef);
      expect(entity).toBeTruthy();
    }
  });

  it('names widgets from the catalog rather than paraphrasing the prompt', async () => {
    const view = catalog();
    const { plan } = await ask('file loads', [], 'p1', null, view);
    const kpi = plan!.widgets.find((one) => one.kind === 'kpi' && one.measureRef);
    expect(kpi).toBeTruthy();
    const entity = view.find((one) => one.ref === kpi!.entityRef)!;
    const measure = entity.measures.find((one) => one.ref === kpi!.measureRef)!;
    expect(kpi!.title).toBe(measure.name);
  });

  it('only ever names a measure that is on the entity it named', async () => {
    const view = catalog();
    for (const prompt of ['file loads by source', 'securities coverage', 'data quality exceptions']) {
      const { plan } = await ask(prompt, [], 'p1', null, view);
      for (const widget of plan!.widgets) {
        if (!widget.measureRef) continue;
        const entity = view.find((one) => one.ref === widget.entityRef)!;
        expect(entity.measures.some((one) => one.ref === widget.measureRef)).toBe(true);
      }
    }
  });

  it('only ever breaks down by something the catalog says is groupable', async () => {
    const view = catalog();
    const { plan } = await ask('file loads by source with a trend', [], 'p1', null, view);
    for (const widget of plan!.widgets) {
      if (!widget.dimensionRef) continue;
      const entity = view.find((one) => one.ref === widget.entityRef)!;
      const attribute = entity.attributes.find((one) => one.ref === widget.dimensionRef)!;
      expect(attribute.groupable).toBe(true);
    }
  });

  it('uses an aggregation the measure allows', async () => {
    const view = catalog();
    const { plan } = await ask('file loads by source', [], 'p1', null, view);
    for (const widget of plan!.widgets) {
      if (!widget.measureRef || !widget.aggregation) continue;
      const entity = view.find((one) => one.ref === widget.entityRef)!;
      const measure = entity.measures.find((one) => one.ref === widget.measureRef)!;
      expect(measure.allowedAggregations).toContain(widget.aggregation);
    }
  });

  it('cannot bind to an entity the author is not entitled to', async () => {
    const narrow = catalog(['edm.processing.read']);
    // A request squarely about data quality, from an author who cannot see it.
    const { plan } = await ask('data quality exceptions by severity', [], 'p1', null, narrow);
    for (const widget of plan!.widgets) {
      if (!widget.entityRef) continue;
      expect(narrow.some((one) => one.ref === widget.entityRef)).toBe(true);
      expect(widget.entityRef.startsWith('dq.')).toBe(false);
    }
  });

  it('binds nothing when there is no catalog, and says so', async () => {
    const { plan } = await ask('late file loads by source', [], 'p1', null, []);
    expect(plan!.widgets.every((one) => !one.entityRef)).toBe(true);
    expect(plan!.pageSummary).toContain('catalog has not loaded');
  });

  it('names what the catalog does hold when nothing in it matches', async () => {
    const view = catalog();
    const { plan } = await ask('widget sprocket throughput by colour', [], 'p1', null, view);
    expect(plan!.widgets.every((one) => !one.entityRef)).toBe(true);
    expect(plan!.pageSummary).toContain('Your catalog covers');
    expect(plan!.pageSummary).toContain('none of which matches');
  });

  it('says what it matched and how, so a wrong guess is correctable', async () => {
    const { plan } = await ask('file loads by source', [], 'p1', null, catalog());
    expect(plan!.pageSummary).toMatch(/read live data — matched to .+ by /);
  });
});

describe('assembling a bound plan', () => {
  const view = (): CatalogEntityView[] => {
    const service = new CatalogService();
    service.hydrate(testCatalog());
    return catalogView(
      service.projectionFor({
        id: 'a@demo',
        displayName: 'A',
        tenantId: 'demo-tenant',
        locale: 'en-GB',
        timezone: 'Europe/London',
        roles: ['experienceAuthor'],
        capabilities: ALL_CAPS,
        entitlementScopeHash: 'all',
      }),
    );
  };

  it('puts the binding on the widget and the catalog’s name in its label', () => {
    const catalog = view();
    const entity = catalog.find((one) => one.measures.length)!;
    const measure = entity.measures[0]!;
    const { widgets } = assemblePlan(
      {
        pageName: 'x',
        pageSummary: 'x',
        widgets: [
          {
            id: 'k',
            kind: 'kpi',
            title: 'Whatever the model called it',
            purpose: 'p',
            entityRef: entity.ref,
            measureRef: measure.ref,
            aggregation: measure.defaultAggregation,
          },
        ],
      },
      [],
      1,
      catalog,
    );
    const kpi = widgets.find((one) => one.type === 'kpi')!;
    expect(kpi.binding).toMatchObject({ entity: entity.ref, measure: measure.ref });
    expect(kpi.props['label']).toBe(measure.name);
  });

  it('leaves a widget unbound and reports why when the ref does not exist', () => {
    const catalog = view();
    const { widgets, notes } = assemblePlan(
      {
        pageName: 'x',
        pageSummary: 'x',
        widgets: [
          { id: 'k', kind: 'kpi', title: 'Ghost', purpose: 'p', entityRef: 'not.real', measureRef: 'nope' },
        ],
      },
      [],
      1,
      catalog,
    );
    expect(widgets.find((one) => one.type === 'kpi')!.binding).toBeUndefined();
    expect(notes.join(' ')).toContain('does not exist or you are not entitled');
  });

  it('refuses to bind a chart that has a measure and nothing to break it down by', () => {
    const catalog = view();
    const entity = catalog.find((one) => one.measures.length)!;
    const { widgets, notes } = assemblePlan(
      {
        pageName: 'x',
        pageSummary: 'x',
        widgets: [
          {
            id: 'c',
            kind: 'column',
            title: 'Half a chart',
            purpose: 'p',
            entityRef: entity.ref,
            measureRef: entity.measures[0]!.ref,
          },
        ],
      },
      [],
      1,
      catalog,
    );
    expect(widgets.find((one) => one.type === 'chart')!.binding).toBeUndefined();
    expect(notes.join(' ')).toContain('needs a measure and something to break it down by');
  });

  it('binds nothing at all when no catalog was supplied', () => {
    const { widgets } = assemblePlan(
      {
        pageName: 'x',
        pageSummary: 'x',
        widgets: [{ id: 'k', kind: 'kpi', title: 'T', purpose: 'p', entityRef: 'processing.file-load' }],
      },
      [],
      1,
    );
    expect(widgets.every((one) => !one.binding)).toBe(true);
  });
});

describe('the review reads bindings too', () => {
  const catalog = (): CatalogEntityView[] => {
    const service = new CatalogService();
    service.hydrate(testCatalog());
    return catalogView(
      service.projectionFor({
        id: 'a@demo',
        displayName: 'A',
        tenantId: 'demo-tenant',
        locale: 'en-GB',
        timezone: 'Europe/London',
        roles: ['experienceAuthor'],
        capabilities: ALL_CAPS,
        entitlementScopeHash: 'all',
      }),
    );
  };

  it('says nothing about bindings when there is no catalog to bind to', () => {
    const pages = [
      page('p1', 'One', [
        widget('h', 'heading', 0, 0, 12, 1, { text: 'One' }),
        widget('k', 'kpi', 0, 1, 4, 3, { label: 'Typed in' }),
      ]),
    ];
    expect(review(pages).some((one) => one.id.endsWith(':unbound'))).toBe(false);
  });

  it('flags widgets showing typed-in numbers once a catalog exists', () => {
    const pages = [
      page('p1', 'One', [
        widget('h', 'heading', 0, 0, 12, 1, { text: 'One' }),
        widget('k', 'kpi', 0, 1, 4, 3, { label: 'Typed in' }),
      ]),
    ];
    const finding = review(pages, catalog()).find((one) => one.id === 'p1:unbound')!;
    expect(finding.detail).toContain('never change');
  });

  it('flags a binding that has gone stale, as a problem rather than polish', () => {
    const stale = widget('k', 'kpi', 0, 1, 4, 3, { label: 'Was fine' });
    stale.binding = { entity: 'gone.away', measure: 'also-gone' };
    const pages = [page('p1', 'One', [widget('h', 'heading', 0, 0, 12, 1, { text: 'One' }), stale])];
    const finding = review(pages, catalog()).find((one) => one.id.endsWith(':binding'))!;
    expect(finding.severity).toBe('issue');
    expect(finding.detail).toContain('no longer entitled');
  });
});
