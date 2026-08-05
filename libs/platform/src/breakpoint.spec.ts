import { describe, expect, it } from 'vitest';
import type { GridPlacement } from '@opus/contracts';

import { breakpointForWidth, resolvePlacement } from './breakpoint';

describe('breakpointForWidth', () => {
  it('maps widths to the declared scale', () => {
    expect(breakpointForWidth(320)).toBe('xs');
    expect(breakpointForWidth(600)).toBe('sm');
    expect(breakpointForWidth(900)).toBe('md');
    expect(breakpointForWidth(1350)).toBe('lg');
    expect(breakpointForWidth(1920)).toBe('xl');
  });

  it('treats a boundary width as the wider breakpoint', () => {
    expect(breakpointForWidth(768)).toBe('md');
    expect(breakpointForWidth(767)).toBe('sm');
  });
});

describe('resolvePlacement — mobile-first override direction', () => {
  // The canonical KPI-row placement: full width on a phone, halves on a tablet,
  // quarters on a desktop. Resolving the cascade in the wrong direction renders
  // four quarter-width cards as halves that wrap into a column — how this was
  // originally broken — or leaks a desktop override down to a phone.
  const kpi: GridPlacement = {
    colSpan: 12,
    breakpoints: { sm: { colSpan: 6 }, lg: { colSpan: 3 } },
  };

  it('uses the base placement below every declared override', () => {
    expect(resolvePlacement(kpi, 'xs').colSpan).toBe(12);
  });

  it('applies an override at its own breakpoint', () => {
    expect(resolvePlacement(kpi, 'sm').colSpan).toBe(6);
    expect(resolvePlacement(kpi, 'lg').colSpan).toBe(3);
  });

  it('carries an override upward to undeclared wider breakpoints', () => {
    expect(resolvePlacement(kpi, 'md').colSpan).toBe(6);
    expect(resolvePlacement(kpi, 'xl').colSpan).toBe(3);
  });

  it('never applies an override wider than the active breakpoint', () => {
    // The side-by-side panel case: full width until xl, then a 5/7 split. An xl
    // entry must not narrow the panel at lg.
    const panel: GridPlacement = { colSpan: 12, breakpoints: { xl: { colSpan: 5 } } };
    expect(resolvePlacement(panel, 'lg').colSpan).toBe(12);
    expect(resolvePlacement(panel, 'md').colSpan).toBe(12);
    expect(resolvePlacement(panel, 'xl').colSpan).toBe(5);
  });

  it('lets the widest applicable declaration win when several apply', () => {
    const placement: GridPlacement = {
      colSpan: 12,
      breakpoints: { sm: { colSpan: 6 }, md: { colSpan: 4 }, xl: { colSpan: 2 } },
    };
    expect(resolvePlacement(placement, 'xs').colSpan).toBe(12);
    expect(resolvePlacement(placement, 'sm').colSpan).toBe(6);
    expect(resolvePlacement(placement, 'md').colSpan).toBe(4);
    expect(resolvePlacement(placement, 'lg').colSpan).toBe(4);
    expect(resolvePlacement(placement, 'xl').colSpan).toBe(2);
  });
});

describe('resolvePlacement — defaults and fields', () => {
  it('defaults to a full-width single row', () => {
    expect(resolvePlacement(undefined, 'lg')).toEqual({
      colStart: undefined,
      colSpan: 12,
      rowSpan: 1,
      order: undefined,
      minHeight: undefined,
      hidden: false,
    });
  });

  it('carries colStart, rowSpan, order and minHeight through', () => {
    const resolved = resolvePlacement(
      { colStart: 4, colSpan: 6, rowSpan: 2, order: 3, minHeight: '320px' },
      'lg',
    );
    expect(resolved).toMatchObject({
      colStart: 4,
      colSpan: 6,
      rowSpan: 2,
      order: 3,
      minHeight: '320px',
    });
  });

  it('reports hidden when an applicable breakpoint declares it', () => {
    // Hidden from lg upward, visible below.
    const placement: GridPlacement = { colSpan: 6, breakpoints: { lg: { hidden: true } } };
    expect(resolvePlacement(placement, 'lg').hidden).toBe(true);
    expect(resolvePlacement(placement, 'xl').hidden).toBe(true);
    expect(resolvePlacement(placement, 'md').hidden).toBe(false);
  });

  it('keeps minHeight from the base, since overrides do not carry it', () => {
    const placement: GridPlacement = {
      colSpan: 12,
      minHeight: '260px',
      breakpoints: { lg: { colSpan: 3 } },
    };
    expect(resolvePlacement(placement, 'lg').minHeight).toBe('260px');
  });
});
