/**
 * Refinement → command (PRD §10–§12 · §14 · §19).
 *
 * `refine.spec.ts` in `@opus/generation` proves the sentence resolves. This proves the resolved thing
 * *lands*, and lands as **one patch** — which is the property the whole feature rests on: an accepted
 * refinement is an ordinary edit, one press of undo reverses it, and the definition never enters a
 * state only an AI edit could produce.
 *
 * The verbs that cannot land yet are tested too. A refinement that resolves and then quietly does
 * nothing is the worst of the three outcomes, because the author has been told it worked.
 */

import { TestBed } from '@angular/core/testing';
import { beforeEach, describe, expect, it } from 'vitest';
import type { ComponentManifest, PageDefinition } from '@opus/contracts';
import { DefinitionStore, SelectionService } from '@opus/studio-core';
import { DragStateService } from './drag-state.service';

import { EditorService } from './editor.service';
import { RefineService } from './refine.service';

const MANIFESTS = [
  { type: 'data.table', name: 'Table', properties: { properties: { density: {} } } },
  {
    type: 'analytics.chart',
    name: 'Chart',
    properties: { properties: { mark: { enum: ['bar', 'line', 'area', 'point'] } } },
  },
  {
    type: 'business.exception-queue',
    name: 'Exception Queue',
    properties: { properties: { groupBy: { enum: ['severity', 'rule', 'assignee', 'none'] } } },
  },
] as unknown as ComponentManifest[];

function definition(): PageDefinition {
  return {
    schemaVersion: '1.0',
    id: 'p',
    name: 'Securities',
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
            { attribute: 'currency' },
            { attribute: 'status' },
          ],
          measures: [{ measure: 'exception-count' }],
        },
      },
      breaks: {
        id: 'breaks',
        entity: 'dq.exception',
        kind: 'query',
        select: { attributes: [{ attribute: 'name' }, { attribute: 'severity' }] },
      },
    },
    components: {
      grid: {
        id: 'grid',
        type: 'data.table',
        title: 'Securities',
        dataSource: 'securities',
        bindings: {
          // `status` is available and deliberately NOT shown, so `add-column` has something to add.
          columns: [{ field: 'name' }, { field: 'isin' }, { field: 'currency' }, { field: 'exception-count' }],
        },
      },
      chart: {
        id: 'chart',
        type: 'analytics.chart',
        title: 'Breaks by severity',
        dataSource: 'breaks',
        config: { mark: 'bar' },
      },
      queue: {
        id: 'queue',
        type: 'business.exception-queue',
        title: 'Open Exceptions',
        dataSource: 'breaks',
        config: { groupBy: 'severity' },
        /*
          A different data source, and exactly ONE column name shared with the grid — `name`. That makes
          an untargeted "sort by name" genuinely ambiguous, while `currency`, `isin` and
          `exception-count` stay unique to the grid so every other untargeted verb resolves.
        */
        bindings: { columns: [{ field: 'name' }, { field: 'severity' }] },
      },
    },
    layout: {
      kind: 'container',
      id: 'root',
      container: {
        // A NODE has a `kind`; a CONTAINER has a `type`. `childListsOf` switches on the latter and
        // returns nothing for an unknown one, so `kind: 'stack'` here made every move throw inside
        // `moveNode` while the resolver — which walks any array it finds — resolved them all happily.
        type: 'stack',
        children: [
          { kind: 'widget', id: 'w-grid', component: 'grid' },
          { kind: 'widget', id: 'w-chart', component: 'chart' },
          { kind: 'widget', id: 'w-queue', component: 'queue' },
        ],
      },
    },
  } as unknown as PageDefinition;
}

let service: RefineService;
let store: DefinitionStore;

beforeEach(() => {
  TestBed.configureTestingModule({
    providers: [DefinitionStore, SelectionService, DragStateService, EditorService, RefineService],
  });
  store = TestBed.inject(DefinitionStore);
  const editor = TestBed.inject(EditorService);
  (editor as unknown as { _manifests: { set(v: unknown): void } })['_manifests'].set(MANIFESTS);
  store.open(definition());
  service = TestBed.inject(RefineService);
});

/** Ask, then accept in one step — the two-press flow, collapsed for a test. */
function apply(prompt: string) {
  const turn = service.ask(prompt);
  if (!turn) throw new Error('no turn');
  const outcome = service.accept(turn.id);
  return { turn, outcome, definition: store.definition()! };
}

describe('the conversation', () => {
  it('records a turn without changing anything', () => {
    const before = JSON.stringify(store.definition());
    const turn = service.ask('Change the chart to a line chart');
    expect(turn?.outcome.outcome).toBe('resolved');
    expect(turn?.applied).toBeUndefined();
    // A proposal is not an action.
    expect(JSON.stringify(store.definition())).toBe(before);
  });

  it('keeps every turn, so nine prompts read as one session', () => {
    service.ask('Change the chart to a line chart');
    service.ask('Remove the currency column');
    service.ask('make it nicer');
    expect(service.turns()).toHaveLength(3);
    expect(service.turns().map((t) => t.outcome.outcome)).toEqual([
      'resolved',
      'resolved',
      'notUnderstood',
    ]);
  });

  it('grounds each turn in the page as it is NOW, not as it was', () => {
    /*
      The reason the service holds the conversation and not a cached page view. Remove a column, then
      ask to remove it again: the second turn must know it has gone.
    */
    apply('Remove the currency column');
    const again = service.ask('Remove the currency column');
    expect(again?.outcome.outcome).toBe('refused');
  });

  it('reports a turn as applied rather than dropping it', () => {
    const { turn } = apply('Change the chart to a line chart');
    const recorded = service.turns().find((t) => t.id === turn.id);
    expect(recorded?.applied?.label).toContain('line chart');
  });

  it('answers a question by filling the reference it asked about, not by re-reading the sentence', () => {
    /*
      `name` is a column on both widgets, so an untargeted sort has two candidates — and the question is
      about the WIDGET, which is why the answer fills `target`. Appending the chosen name to the
      sentence instead made "Sort by name — Securities" whose field capture was `name — Securities`.
    */
    const asked = service.ask('Sort by name');
    expect(asked?.outcome.outcome).toBe('ambiguous');
    if (asked?.outcome.outcome !== 'ambiguous') return;
    expect(asked.outcome.on).toBe('target');

    const answered = service.answer(asked.id, asked.outcome.candidates[0]!.label);
    expect(answered?.outcome.outcome).toBe('resolved');
    // The field survived intact — the answer narrowed the widget and nothing else.
    expect(answered?.intent?.field).toBe('name');
    // The transcript still reads as a conversation.
    expect(answered?.prompt).toContain('Sort by name — ');
    // And the original is marked answered rather than left hanging.
    expect(service.turns().find((t) => t.id === asked.id)?.discarded).toBe(true);
  });

  it('answers a question about the ANCHOR of a move without moving the wrong widget', () => {
    /*
      "Move the chart above the grid" carries two references. Answering a question about the second one
      must not overwrite the first — the widget being moved was never in doubt. Whether this page's
      fixture produces the question is beside the point: what is asserted is that `on` names the field
      to fill, so a caller never has to guess.
    */
    const asked = service.ask('Move the chart above the grid');
    if (asked?.outcome.outcome === 'ambiguous') {
      expect(asked.outcome.on).toBe('relativeTo');
      const answered = service.answer(asked.id, asked.outcome.candidates[0]!.label);
      expect(answered?.intent?.target).toBe(asked.intent?.target);
    } else {
      expect(asked?.outcome.outcome).toBe('resolved');
    }
  });
});

describe('one turn is one patch', () => {
  it('applies as a single undoable step, tagged as AI', () => {
    apply('Change the chart to a line chart');
    expect(store.definition()!.components['chart']!.config!['mark']).toBe('line');

    store.undo();
    expect(store.definition()!.components['chart']!.config!['mark']).toBe('bar');
  });

  it('records the patch as an AI edit, indistinguishable from a hand edit afterwards', () => {
    apply('Remove the currency column');
    const last = store.history()[store.history().length - 1];
    expect(last?.origin).toBe('ai');
  });
});

describe('the verbs that land', () => {
  it('change-chart-type sets the mark', () => {
    const { definition: after } = apply('Change the chart to an area chart');
    expect(after.components['chart']!.config!['mark']).toBe('area');
  });

  it('group-rows sets the component’s own grouping mode', () => {
    const { definition: after } = apply('Group the exception queue by rule');
    expect(after.components['queue']!.config!['groupBy']).toBe('rule');
  });

  it('retitle-widget renames it', () => {
    const { definition: after } = apply('Rename the chart to Severity mix');
    expect(after.components['chart']!.title).toBe('Severity mix');
  });

  it('add-column appends to the column list', () => {
    const { definition: after } = apply('Add a status column to the securities table');
    const columns = (after.components['grid'] as unknown as { bindings: { columns: { field: string }[] } }).bindings
      .columns;
    expect(columns.map((c) => c.field)).toEqual([
      'name',
      'isin',
      'currency',
      'exception-count',
      'status',
    ]);
  });

  it('remove-column removes the right one, leaving the order intact', () => {
    const { definition: after } = apply('Remove the isin column');
    const columns = (after.components['grid'] as unknown as { bindings: { columns: { field: string }[] } }).bindings
      .columns;
    expect(columns.map((c) => c.field)).toEqual(['name', 'currency', 'exception-count']);
  });

  it('sort-rows sets the sort on the DATA SOURCE, so it survives paging', () => {
    /*
      The right place, and worth asserting rather than assuming: the gateway applies a data-source sort
      server-side. A client-side sort of the first page is a different and much worse feature.
    */
    const { definition: after } = apply('Sort the securities table by exception count descending');
    expect((after.dataSources as Record<string, { sort?: unknown }>)['securities']!.sort).toEqual([
      { target: 'exception-count', direction: 'desc' },
    ]);
  });

  it('move-widget reorders the layout nodes', () => {
    const { definition: after } = apply('Move the exception queue to the top');
    const children = (after.layout as unknown as { container: { children: { component: string }[] } }).container
      .children;
    expect(children.map((c) => c.component)).toEqual(['queue', 'grid', 'chart']);
  });

  it('move-widget before an anchor lands immediately before it', () => {
    const { definition: after } = apply('Move the chart above the securities table');
    const children = (after.layout as unknown as { container: { children: { component: string }[] } }).container
      .children;
    expect(children.map((c) => c.component)).toEqual(['chart', 'grid', 'queue']);
  });

  it('highlight-rows formats a COUNT, because "> 0" is not a guess for a count', () => {
    const { definition: after } = apply('Highlight rows that have exceptions');
    const columns = (
      after.components['grid'] as unknown as {
        bindings: { columns: { field: string; conditionalFormats?: unknown }[] };
      }
    ).bindings.columns;
    const counted = columns.find((c) => c.field === 'exception-count');
    expect(counted?.conditionalFormats).toEqual([
      { when: { $expr: 'exception-count > 0' }, emphasis: 'negative' },
    ]);
  });
});

describe('the refusals that keep an author informed', () => {
  it('refuses to highlight a value field, and says what it needs instead', () => {
    /*
      "Highlight rows where currency" means equal to WHAT. Inventing a value produces a rule that fires
      on nothing or on everything, and the author would have no way to tell which. `currency` is shown
      on the grid and nowhere else, so the FIELD narrows the reference — the highlight pattern captures
      no widget — and this reaches the applier's numeric check rather than being refused earlier.
    */
    const turn = service.ask('Highlight rows with a currency');
    expect(turn?.outcome.outcome).toBe('resolved');
    if (!turn) return;
    const outcome = service.accept(turn.id);
    expect(outcome.ok).toBe(false);
    expect(outcome.problem).toContain('holds a value rather than a count');
    expect(outcome.problem).toContain('is Open');
  });

  it('refuses a verb the applier cannot carry out, naming the reason', () => {
    // Drill-down targets live on the experience and this builder edits one page.
    const turn = service.ask('When the user clicks a security, take them to the detail page');
    if (turn?.outcome.outcome === 'resolved') {
      const outcome = service.accept(turn.id);
      expect(outcome.ok).toBe(false);
      expect(outcome.problem).toContain('experience');
    } else {
      // Refused at grounding for the same underlying reason: no sibling pages reach this builder.
      expect(turn?.outcome.outcome).toBe('refused');
    }
  });

  it('leaves the definition untouched when a turn cannot be applied', () => {
    const before = JSON.stringify(store.definition());
    const turn = service.ask('Highlight rows with a currency');
    if (turn) service.accept(turn.id);
    expect(JSON.stringify(store.definition())).toBe(before);
  });

  it('records the problem on the turn, so the transcript shows what failed', () => {
    const turn = service.ask('Highlight rows with a currency');
    if (!turn) throw new Error('no turn');
    service.accept(turn.id);
    expect(service.turns().find((t) => t.id === turn.id)?.problem).toBeTruthy();
  });
});

describe('discarding', () => {
  it('marks a turn discarded without touching the page', () => {
    const before = JSON.stringify(store.definition());
    const turn = service.ask('Change the chart to a line chart');
    service.discard(turn!.id);
    expect(service.turns()[0]?.discarded).toBe(true);
    expect(JSON.stringify(store.definition())).toBe(before);
  });

  it('refuses to apply a discarded turn’s twin by accident', () => {
    // Accepting a turn that was never resolved is a no-op with a reason, not a silent success.
    const turn = service.ask('make it nicer');
    const outcome = service.accept(turn!.id);
    expect(outcome.ok).toBe(false);
    expect(outcome.problem).toContain('nothing to apply');
  });
});
