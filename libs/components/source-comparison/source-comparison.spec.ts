/**
 * business.source-comparison — FR-15, §28 step 7.
 *
 * These tests are about the four things that make this a component rather than a `data.table` binding,
 * because those are its only reasons to exist:
 *
 *   1. it **pivots** long-form contributions into a field-by-source matrix,
 *   2. a **missing** contribution is not an empty value,
 *   3. the **winning** contribution is marked,
 *   4. **disagreement** is computed — including the case where every source agrees and the mastered
 *      value does not, which is the one a steward most needs and the one a naive check misses.
 *
 * Driven through the component's own computed signals rather than the DOM, for the reason
 * `exception-queue.spec.ts` gives: the pivot is where this is right or wrong, and asserting it through
 * markup would report a styling change as a mastering bug.
 */

import { TestBed } from '@angular/core/testing';
import { describe, beforeEach, expect, it } from 'vitest';
import type { ComponentContext, DataRow } from '@opus/contracts';

import { SourceComparisonComponent, type SourceComparisonConfig } from './source-comparison.component';

/** Role bindings as a page declares them, using the shipped catalog's own field names. */
const BINDINGS = {
  field: { field: 'field-label' },
  source: { field: 'source-system' },
  value: { field: 'vendor-value' },
  current: { field: 'golden-value' },
  winner: { field: 'is-golden' },
  agreement: { field: 'match-status' },
  confidence: { field: 'confidence' },
};

/** One contribution: one vendor's value for one field. */
function contribution(over: Partial<Record<string, unknown>> = {}): DataRow {
  return {
    'field-label': 'Country of risk',
    'source-system': 'Bloomberg',
    'vendor-value': 'GB',
    'golden-value': 'GB',
    'is-golden': true,
    'match-status': 'MATCH',
    confidence: 98,
    ...over,
  } as DataRow;
}

const CONTEXT = {
  pageId: 'security-overview',
  params: { 'security-id': 'SEC-1' },
  filters: {},
  selections: {},
  breakpoint: 'lg',
  user: { id: 'ci', capabilities: [] },
  locale: 'en-GB',
  density: 'comfortable',
  evaluate: () => null,
  format: (value: unknown) => String(value ?? ''),
} as unknown as ComponentContext;

interface Cell {
  source: string;
  value: string;
  won: boolean;
  confidence: number | null;
}

interface Row {
  label: string;
  current: string;
  cells: readonly (Cell | undefined)[];
  disagrees: boolean;
  contributed: number;
}

function comparison(
  rows: DataRow[],
  config: SourceComparisonConfig = {},
  bindings: Record<string, { field: string }> = BINDINGS,
) {
  const fixture = TestBed.createComponent(SourceComparisonComponent);
  fixture.componentRef.setInput('context', CONTEXT);
  fixture.componentRef.setInput('bindings', bindings);
  fixture.componentRef.setInput('config', config);
  fixture.componentRef.setInput('data', { state: 'ready', rows });
  fixture.detectChanges();
  return fixture.componentInstance as unknown as {
    sources: () => string[];
    fields: () => Row[];
    shown: () => Row[];
    disagreementCount: () => number;
    hasCurrent: () => boolean;
    onlyDisagreements: { set: (value: boolean) => void };
  };
}

beforeEach(() => TestBed.configureTestingModule({}));

// ── the pivot, which is the whole component ─────────────────────────────────

describe('the pivot — long form in, matrix out', () => {
  it('makes one row per field and one column per source', () => {
    /*
      Six contributions, two fields, three sources. A `data.table` would show six rows and leave the
      reader to do this in their head — which is the failure §28's "side by side" names.
    */
    const c = comparison([
      contribution({ 'field-label': 'Country of risk', 'source-system': 'Bloomberg', 'vendor-value': 'GB' }),
      contribution({ 'field-label': 'Country of risk', 'source-system': 'Refinitiv', 'vendor-value': 'US' }),
      contribution({ 'field-label': 'Country of risk', 'source-system': 'ICE', 'vendor-value': 'GB' }),
      contribution({ 'field-label': 'Issuer name', 'source-system': 'Bloomberg', 'vendor-value': 'Vodafone Grp' }),
      contribution({ 'field-label': 'Issuer name', 'source-system': 'Refinitiv', 'vendor-value': 'Vodafone Grp' }),
      contribution({ 'field-label': 'Issuer name', 'source-system': 'ICE', 'vendor-value': 'Vodafone Grp' }),
    ]);

    expect(c.sources()).toEqual(['Bloomberg', 'Refinitiv', 'ICE']);
    expect(c.fields().map((f) => f.label)).toEqual(['Country of risk', 'Issuer name']);
    expect(c.fields()[0]!.cells.map((cell) => cell?.value)).toEqual(['GB', 'US', 'GB']);
    expect(c.fields()[1]!.cells.map((cell) => cell?.value)).toEqual([
      'Vodafone Grp',
      'Vodafone Grp',
      'Vodafone Grp',
    ]);
  });

  it('keeps the query’s source order rather than sorting alphabetically', () => {
    /*
      The page's data source may sort by contribution time or by a vendor precedence the tenant
      configured. Re-sorting here would override a decision the page made on purpose.
    */
    const c = comparison([
      contribution({ 'source-system': 'Refinitiv' }),
      contribution({ 'source-system': 'Bloomberg' }),
      contribution({ 'source-system': 'ICE' }),
    ]);
    expect(c.sources()).toEqual(['Refinitiv', 'Bloomberg', 'ICE']);
  });

  it('puts each source in its own column even when the rows arrive interleaved', () => {
    // The gateway makes no promise about grouping, and a pivot that assumed one would silently drop
    // contributions into the wrong column.
    const c = comparison([
      contribution({ 'field-label': 'A', 'source-system': 'X', 'vendor-value': 'ax' }),
      contribution({ 'field-label': 'B', 'source-system': 'Y', 'vendor-value': 'by' }),
      contribution({ 'field-label': 'A', 'source-system': 'Y', 'vendor-value': 'ay' }),
      contribution({ 'field-label': 'B', 'source-system': 'X', 'vendor-value': 'bx' }),
    ]);
    expect(c.sources()).toEqual(['X', 'Y']);
    expect(c.fields()[0]!.cells.map((cell) => cell?.value)).toEqual(['ax', 'ay']);
    expect(c.fields()[1]!.cells.map((cell) => cell?.value)).toEqual(['bx', 'by']);
  });

  it('reads the mastered value from whichever contribution carries it', () => {
    // It is a property of the field, repeated on every contributing row, so the first one that has it
    // is as good as any — and a page whose query only populates it on the winning row still works.
    const c = comparison([
      contribution({ 'source-system': 'Bloomberg', 'golden-value': '' }),
      contribution({ 'source-system': 'Refinitiv', 'golden-value': 'GB' }),
    ]);
    expect(c.fields()[0]!.current).toBe('GB');
  });

  it('produces nothing without the three required roles, rather than guessing a column name', () => {
    // A component that looked for a field called `source-system` would work against this catalog and
    // show a single unnamed column against the next.
    const c = comparison([contribution()], {}, { field: { field: 'field-label' } });
    expect(c.fields()).toEqual([]);
    expect(c.sources()).toEqual([]);
  });
});

// ── a missing contribution is not an empty value ────────────────────────────

describe('not supplied is not the same as blank', () => {
  it('leaves a cell undefined when a source did not contribute the field', () => {
    /*
      In master data these are different facts and they lead to different actions: a source that
      supplied nothing is a vendor to chase, and a source that supplied an empty string is a data
      problem at the vendor. The long form distinguishes them by the absence of a row, and a pivot that
      filled every gap with '' would lose the distinction entirely.
    */
    const c = comparison([
      contribution({ 'field-label': 'ESG score', 'source-system': 'Bloomberg', 'vendor-value': 'AA' }),
      contribution({ 'field-label': 'ESG score', 'source-system': 'Refinitiv', 'vendor-value': '' }),
      contribution({ 'field-label': 'Country of risk', 'source-system': 'Bloomberg', 'vendor-value': 'GB' }),
      // Refinitiv supplied no country of risk at all — there is simply no row.
    ]);

    const esg = c.fields().find((f) => f.label === 'ESG score')!;
    const country = c.fields().find((f) => f.label === 'Country of risk')!;

    expect(esg.cells[1]?.value).toBe('');
    expect(esg.contributed).toBe(2);
    expect(country.cells[1]).toBeUndefined();
    expect(country.contributed).toBe(1);
  });

  it('does not count a silent source as disagreeing', () => {
    // Saying nothing is not a conflict. Counting it would make every partially-covered field look like
    // work, which is how a disagreement count stops being read.
    const c = comparison([
      contribution({ 'field-label': 'A', 'source-system': 'X', 'vendor-value': 'same', 'golden-value': 'same' }),
      contribution({ 'field-label': 'B', 'source-system': 'X', 'vendor-value': 'same', 'golden-value': 'same' }),
      contribution({ 'field-label': 'B', 'source-system': 'Y', 'vendor-value': 'same', 'golden-value': 'same' }),
    ]);
    expect(c.disagreementCount()).toBe(0);
    expect(c.fields()[0]!.cells[1]).toBeUndefined();
  });
});

// ── the mastering decision ──────────────────────────────────────────────────

describe('the winning contribution is marked', () => {
  it('marks the source whose value became the mastered one', () => {
    const c = comparison([
      contribution({ 'source-system': 'Bloomberg', 'vendor-value': 'GB', 'is-golden': true }),
      contribution({ 'source-system': 'Refinitiv', 'vendor-value': 'US', 'is-golden': false }),
    ]);
    expect(c.fields()[0]!.cells.map((cell) => cell?.won)).toEqual([true, false]);
  });

  it('reads the booleans a database actually returns', () => {
    // `true`, `"Y"`, `1`, `"true"` — the gateway passes through whatever the driver produced, and a
    // strict `=== true` would show a mastered record with nothing marked as mastered.
    const c = comparison([
      contribution({ 'source-system': 'A', 'is-golden': 'Y' }),
      contribution({ 'source-system': 'B', 'is-golden': 1 }),
      contribution({ 'source-system': 'C', 'is-golden': 'true' }),
      contribution({ 'source-system': 'D', 'is-golden': 'N' }),
      contribution({ 'source-system': 'E', 'is-golden': 0 }),
    ]);
    expect(c.fields()[0]!.cells.map((cell) => cell?.won)).toEqual([true, true, true, false, false]);
  });

  it('marks nothing when the winner role is not bound, rather than inferring one', () => {
    // Inferring the winner from "the value that equals the mastered value" would mark two sources on
    // every field they agree about, which is not a mastering decision.
    const c = comparison([contribution({ 'is-golden': true })], {}, {
      field: { field: 'field-label' },
      source: { field: 'source-system' },
      value: { field: 'vendor-value' },
      current: { field: 'golden-value' },
    });
    expect(c.fields()[0]!.cells[0]?.won).toBe(false);
  });
});

// ── disagreement ────────────────────────────────────────────────────────────

describe('disagreement is computed, and the hard case is the interesting one', () => {
  it('flags a field whose sources differ from each other', () => {
    const c = comparison([
      contribution({ 'source-system': 'Bloomberg', 'vendor-value': 'GB' }),
      contribution({ 'source-system': 'Refinitiv', 'vendor-value': 'US' }),
    ]);
    expect(c.fields()[0]!.disagrees).toBe(true);
    expect(c.disagreementCount()).toBe(1);
  });

  it('flags a field where every source agrees and the MASTERED value differs', () => {
    /*
      The case a naive check misses, and the one a steward most needs. Every vendor says GB and the
      record publishes US — which happens after a manual override or a stale mastering run. A comparison
      that only compared sources to each other would call this field settled.
    */
    const c = comparison([
      contribution({ 'source-system': 'Bloomberg', 'vendor-value': 'GB', 'golden-value': 'US' }),
      contribution({ 'source-system': 'Refinitiv', 'vendor-value': 'GB', 'golden-value': 'US' }),
    ]);
    expect(c.fields()[0]!.disagrees).toBe(true);
  });

  it('does not flag a field where everything agrees', () => {
    const c = comparison([
      contribution({ 'source-system': 'Bloomberg', 'vendor-value': 'GB', 'golden-value': 'GB' }),
      contribution({ 'source-system': 'Refinitiv', 'vendor-value': 'GB', 'golden-value': 'GB' }),
    ]);
    expect(c.fields()[0]!.disagrees).toBe(false);
    expect(c.disagreementCount()).toBe(0);
  });

  it('does not flag a single-source field against an unbound mastered value', () => {
    // One source, nothing to compare it with. Flagging it would mark every field on a record mastered
    // from one vendor, which is a normal state rather than a problem.
    const c = comparison([contribution()], {}, {
      field: { field: 'field-label' },
      source: { field: 'source-system' },
      value: { field: 'vendor-value' },
    });
    expect(c.hasCurrent()).toBe(false);
    expect(c.fields()[0]!.disagrees).toBe(false);
  });

  it('filters to the disagreeing fields on request, and back', () => {
    const c = comparison([
      contribution({ 'field-label': 'agrees', 'source-system': 'X', 'vendor-value': 'a', 'golden-value': 'a' }),
      contribution({ 'field-label': 'agrees', 'source-system': 'Y', 'vendor-value': 'a', 'golden-value': 'a' }),
      contribution({ 'field-label': 'differs', 'source-system': 'X', 'vendor-value': 'a', 'golden-value': 'a' }),
      contribution({ 'field-label': 'differs', 'source-system': 'Y', 'vendor-value': 'b', 'golden-value': 'a' }),
    ]);
    expect(c.shown()).toHaveLength(2);
    c.onlyDisagreements.set(true);
    expect(c.shown().map((f) => f.label)).toEqual(['differs']);
    c.onlyDisagreements.set(false);
    expect(c.shown()).toHaveLength(2);
  });
});

// ── confidence ──────────────────────────────────────────────────────────────

describe('confidence', () => {
  it('rounds to a whole percent and keeps null distinct from zero', () => {
    // A source with no confidence recorded and a source the mastering engine scored at 0 are different
    // facts, and showing "0%" for the first would be an invention.
    const c = comparison([
      contribution({ 'source-system': 'A', confidence: 98.4 }),
      contribution({ 'source-system': 'B', confidence: 0 }),
      contribution({ 'source-system': 'C', confidence: null }),
    ]);
    expect(c.fields()[0]!.cells.map((cell) => cell?.confidence)).toEqual([98, 0, null]);
  });
});
