/**
 * The Exception Queue — the first of the PRD's Enterprise family (FR-30).
 *
 * These tests are about the three things that make it a queue rather than a grid, because those are
 * the only reasons for it to exist alongside `data.table`: it orders by the decision, it treats
 * unassigned as a state, and it refuses to invent an ageing threshold.
 *
 * Driven through the component's own computed signals rather than the rendered DOM. The ordering and
 * grouping are where a queue is right or wrong, and asserting them through markup would test the
 * template as well and report a styling change as a triage bug.
 */

import { TestBed } from '@angular/core/testing';
import { describe, beforeEach, expect, it } from 'vitest';
import type { ComponentContext, DataRow } from '@opus/contracts';

import { ExceptionQueueComponent, type ExceptionQueueConfig } from './exception-queue.component';

/** Role bindings as a page declares them, keyed by the manifest's role names. */
const BINDINGS = {
  subject: { field: 'security-name' },
  severity: { field: 'severity' },
  status: { field: 'exception-status' },
  age: { field: 'age-hours' },
  assignee: { field: 'assigned-to' },
  rule: { field: 'rule-name' },
  detail: { field: 'detail' },
};

/** The catalog's own field names, so the fixtures look like what the gateway actually returns. */
function row(over: Partial<Record<string, unknown>> = {}): DataRow {
  return {
    'security-name': 'Nestle SA',
    severity: 'Medium',
    'exception-status': 'Open',
    'age-hours': 10,
    'assigned-to': 'ana',
    'rule-name': 'price-tolerance',
    detail: 'Vendor price differs by 4%',
    ...over,
  } as DataRow;
}

const CONTEXT = {
  pageId: 'queue',
  params: {},
  filters: {},
  selections: {},
  breakpoint: 'lg',
  user: { id: 'ci', capabilities: [] },
  locale: 'en-GB',
  density: 'comfortable',
  evaluate: () => null,
  format: (value: unknown) => String(value ?? ''),
} as unknown as ComponentContext;

function queue(rows: DataRow[], config: ExceptionQueueConfig = {}) {
  const fixture = TestBed.createComponent(ExceptionQueueComponent);
  fixture.componentRef.setInput('context', CONTEXT);
  fixture.componentRef.setInput('bindings', BINDINGS);
  fixture.componentRef.setInput('config', config);
  fixture.componentRef.setInput('data', { state: 'ready', rows });
  fixture.detectChanges();
  // The computed signals are protected on the class; reached here deliberately, because they are the
  // component's actual contract with the page and asserting them through the DOM tests the template too.
  return fixture.componentInstance as unknown as {
    rows: () => { subject: string; severity: string; assignee: string; age: number | null; breaching: boolean }[];
    groups: () => { label: string; rows: { subject: string }[] }[];
    breachCount: () => number;
    unassignedCount: () => number;
    shown: () => number;
    hidden: () => boolean;
    labelFor: (item: never) => string;
  };
}

beforeEach(() => TestBed.configureTestingModule({}));

describe('ordering — by the decision, not by the data', () => {
  it('puts the worst severity first regardless of the order rows arrived in', () => {
    const q = queue([
      row({ 'security-name': 'low one', severity: 'Low' }),
      row({ 'security-name': 'critical one', severity: 'Critical' }),
      row({ 'security-name': 'medium one', severity: 'Medium' }),
      row({ 'security-name': 'high one', severity: 'High' }),
    ]);
    expect(q.rows().map((r) => r.subject)).toEqual(['critical one', 'high one', 'medium one', 'low one']);
  });

  it('ranks an unrecognised severity last rather than dropping the row', () => {
    /*
      The worst possible failure for a queue is hiding work. A severity nobody anticipated is still
      somebody's job, so it sorts to the end and is labelled "unclassified" rather than vanishing.
    */
    const q = queue([
      row({ 'security-name': 'weird', severity: 'Cataclysmic' }),
      row({ 'security-name': 'low', severity: 'Low' }),
    ]);
    expect(q.rows().map((r) => r.subject)).toEqual(['low', 'weird']);
    expect(q.rows()).toHaveLength(2);
  });

  it('breaks a severity tie with the oldest first', () => {
    const q = queue([
      row({ 'security-name': 'newer', severity: 'High', 'age-hours': 4 }),
      row({ 'security-name': 'older', severity: 'High', 'age-hours': 40 }),
    ]);
    expect(q.rows().map((r) => r.subject)).toEqual(['older', 'newer']);
  });

  it('is case- and whitespace-insensitive about severity, because a code list rarely is', () => {
    const q = queue([
      row({ 'security-name': 'a', severity: 'low' }),
      row({ 'security-name': 'b', severity: ' CRITICAL ' }),
    ]);
    expect(q.rows()[0]?.subject).toBe('b');
  });
});

describe('unassigned is a state, not a blank cell', () => {
  it('floats unowned work above owned work of the same severity', () => {
    const q = queue([
      row({ 'security-name': 'owned', severity: 'High', 'assigned-to': 'ana', 'age-hours': 50 }),
      row({ 'security-name': 'nobody', severity: 'High', 'assigned-to': '', 'age-hours': 2 }),
    ]);
    // Note the ages: the unassigned one is newer and still comes first. Ownership outranks age.
    expect(q.rows().map((r) => r.subject)).toEqual(['nobody', 'owned']);
  });

  it('can be turned off, leaving pure severity-then-age order', () => {
    const q = queue(
      [
        row({ 'security-name': 'owned', severity: 'High', 'assigned-to': 'ana', 'age-hours': 50 }),
        row({ 'security-name': 'nobody', severity: 'High', 'assigned-to': '', 'age-hours': 2 }),
      ],
      { unassignedFirst: false },
    );
    expect(q.rows().map((r) => r.subject)).toEqual(['owned', 'nobody']);
  });

  it('counts unassigned work', () => {
    const q = queue([
      row({ 'assigned-to': '' }),
      row({ 'assigned-to': null }),
      row({ 'assigned-to': 'ana' }),
    ]);
    expect(q.unassignedCount()).toBe(2);
  });
});

describe('ageing — a judgement the component refuses to invent', () => {
  it('marks nothing as breaching when no threshold was configured', () => {
    // A queue that makes up its own SLA teaches people to ignore the flag.
    const q = queue([row({ 'age-hours': 9999 })]);
    expect(q.rows()[0]?.breaching).toBe(false);
    expect(q.breachCount()).toBe(0);
  });

  it('marks only what is past the configured threshold', () => {
    const q = queue(
      [
        row({ 'security-name': 'under', 'age-hours': 47 }),
        row({ 'security-name': 'exactly', 'age-hours': 48 }),
        row({ 'security-name': 'over', 'age-hours': 49 }),
      ],
      { ageBreachHours: 48 },
    );
    const byName = new Map(q.rows().map((r) => [r.subject, r.breaching]));
    expect(byName.get('under')).toBe(false);
    // Exactly at the threshold is not yet past it.
    expect(byName.get('exactly')).toBe(false);
    expect(byName.get('over')).toBe(true);
    expect(q.breachCount()).toBe(1);
  });

  it('treats a missing age as unknown rather than as zero', () => {
    const q = queue([row({ 'age-hours': null })], { ageBreachHours: 1 });
    expect(q.rows()[0]?.age).toBeNull();
    expect(q.rows()[0]?.breaching).toBe(false);
  });
});

describe('grouping', () => {
  it('groups by severity in severity order, not alphabetically', () => {
    const q = queue([
      row({ severity: 'Low' }),
      row({ severity: 'Critical' }),
      row({ severity: 'Medium' }),
    ]);
    expect(q.groups().map((g) => g.label)).toEqual(['Critical', 'Medium', 'Low']);
  });

  it('gives a flat list when grouping is off', () => {
    const q = queue([row({ severity: 'Low' }), row({ severity: 'High' })], { groupBy: 'none' });
    expect(q.groups()).toHaveLength(1);
    expect(q.groups()[0]?.label).toBe('');
  });

  it('labels an empty assignee group rather than leaving it blank', () => {
    const q = queue([row({ 'assigned-to': '' })], { groupBy: 'assignee' });
    expect(q.groups()[0]?.label).toBe('unassigned');
  });
});

describe('truncation is stated, never silent', () => {
  it('reports that it is showing a subset', () => {
    const rows = Array.from({ length: 30 }, (_, i) => row({ 'security-name': `row ${i}` }));
    const q = queue(rows, { pageSize: 10 });
    expect(q.shown()).toBe(10);
    expect(q.hidden()).toBe(true);
    // And the truncation respects the ordering, so what is shown is the top of the queue.
    expect(q.groups()[0]?.rows).toHaveLength(10);
  });

  it('says nothing when everything fits', () => {
    const q = queue([row(), row()], { pageSize: 25 });
    expect(q.hidden()).toBe(false);
  });
});

describe('accessibility — one label per row, not seven cells', () => {
  it('reads as a decision rather than as a row of numbers', () => {
    const q = queue([row({ 'security-name': 'Nestle SA', severity: 'Critical', 'age-hours': 72 })], {
      ageBreachHours: 48,
    });
    const label = q.labelFor(q.rows()[0] as never);
    expect(label).toContain('Nestle SA');
    expect(label).toContain('severity Critical');
    expect(label).toContain('open 72 hours');
    expect(label).toContain('past due');
    expect(label).toContain('assigned to ana');
  });

  it('says "unassigned" rather than omitting ownership', () => {
    const q = queue([row({ 'assigned-to': '' })]);
    expect(q.labelFor(q.rows()[0] as never)).toContain('unassigned');
  });
});

describe('field mapping', () => {
  it('reads nothing when the page has bound nothing', () => {
    /*
      The component never guesses a column name. A queue that looked for a field called `severity`
      would work against this catalog and silently show every row as unclassified against the next.
    */
    const fixture = TestBed.createComponent(ExceptionQueueComponent);
    fixture.componentRef.setInput('context', CONTEXT);
    fixture.componentRef.setInput('config', {});
    fixture.componentRef.setInput('data', { state: 'ready', rows: [row()] });
    fixture.detectChanges();
    const q = fixture.componentInstance as unknown as { rows: () => { subject: string; severity: string }[] };
    expect(q.rows()[0]?.subject).toBe('(no subject)');
    expect(q.rows()[0]?.severity).toBe('');
  });
});
