/**
 * Breakpoint resolution.
 *
 * Component layout is driven by CSS container queries — a component's correct
 * layout depends on the space it occupies, not the size of the window, so the
 * same KPI card behaves correctly on a dashboard, in a drawer and in a split
 * pane (architecture/frontend-architecture.md §5.3).
 *
 * The value resolved here is the *page* breakpoint, used for placement overrides
 * declared in the definition and exposed to expressions as $page.breakpoint.
 */

import { BREAKPOINT_ORDER, type Breakpoint, type GridPlacement, type PlacementOverride } from '@opus/contracts';

export const BREAKPOINT_MIN_WIDTH: Readonly<Record<Breakpoint, number>> = {
  xs: 0,
  sm: 480,
  md: 768,
  lg: 1200,
  xl: 1600,
};

export function breakpointForWidth(width: number): Breakpoint {
  let result: Breakpoint = 'xs';
  for (const bp of BREAKPOINT_ORDER) {
    if (width >= BREAKPOINT_MIN_WIDTH[bp]) result = bp;
  }
  return result;
}

export interface ResolvedPlacement {
  colStart?: number;
  colSpan: number;
  rowSpan: number;
  order?: number;
  minHeight?: string;
  hidden: boolean;
}

const DEFAULT_COL_SPAN = 12;

/**
 * Resolve a placement for a breakpoint.
 *
 * SEMANTICS — MOBILE-FIRST, matching CSS min-width media queries and the
 * BREAKPOINT_MIN_WIDTH table above. The base placement is the NARROWEST case, and a
 * `breakpoints` entry applies at that breakpoint AND WIDER. Among the entries at or
 * narrower than the active breakpoint, the widest one wins.
 *
 * So { colSpan: 12, breakpoints: { sm: { colSpan: 6 }, lg: { colSpan: 3 } } }
 * resolves to 12 at xs, 6 at sm and md, and 3 at lg and xl — "full width on a
 * phone, halves on a tablet, quarters on a desktop".
 *
 * Choosing a direction matters more than which direction: a definition set that
 * mixes the two silently mislays panels, because an override intended for one end
 * of the scale leaks to the other.
 */
export function resolvePlacement(
  placement: GridPlacement | undefined,
  breakpoint: Breakpoint,
): ResolvedPlacement {
  const base: ResolvedPlacement = {
    colStart: placement?.colStart,
    colSpan: placement?.colSpan ?? DEFAULT_COL_SPAN,
    rowSpan: placement?.rowSpan ?? 1,
    order: placement?.order,
    minHeight: placement?.minHeight,
    hidden: false,
  };

  const overrides = placement?.breakpoints;
  if (!overrides) return base;

  const activeIndex = BREAKPOINT_ORDER.indexOf(breakpoint);
  let applied: PlacementOverride | undefined;

  // Walk upward to the active breakpoint, so the widest applicable declaration is
  // applied last and wins. Entries wider than the active breakpoint never apply.
  for (let i = 0; i <= activeIndex; i++) {
    const candidate = overrides[BREAKPOINT_ORDER[i]!];
    if (candidate) applied = { ...applied, ...candidate };
  }

  if (!applied) return base;

  return {
    colStart: applied.colStart ?? base.colStart,
    colSpan: applied.colSpan ?? base.colSpan,
    rowSpan: applied.rowSpan ?? base.rowSpan,
    order: applied.order ?? base.order,
    minHeight: base.minHeight,
    hidden: applied.hidden ?? false,
  };
}
