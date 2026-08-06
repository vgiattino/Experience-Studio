/**
 * Plan → widgets. The half of generation that is arithmetic, and therefore code.
 *
 * The model chose which widgets, what they are called and which band they belong in. Everything from
 * here down is mechanical: ids, x/y/w/h on the 12-column grid, minimum heights, prop defaults, and
 * nav targets resolved to real page ids. None of it needs judgement, so none of it is asked for.
 *
 * ── WHY BANDS RATHER THAN COORDINATES ──────────────────────────────────────────────────
 * Asking a model for x/y/w/h produces overlapping widgets and off-grid columns, and then the author's
 * first experience of AI in this product is dragging things apart. Asking for "this is a metric" and
 * laying out the metrics row here produces the same page every time and cannot overlap by
 * construction. The layout convention is the one every seeded page already follows — metrics across
 * the top, charts under them, detail below, actions last — so a generated page and a hand-built one
 * are indistinguishable, which is the point.
 */

import {
  COLS,
  DEF_SIZE,
  KEY_TYPE,
  defProps,
  minH,
  type PageDef,
  type Widget,
  type WidgetProps,
} from '../model';
import { BANDS, type Band, type CanvasPlan, type PlannedWidget } from './decisions';
import {
  bindingTitle,
  checkBinding,
  isBindable,
  shapeOf,
  type CatalogEntityView,
  type WidgetBinding,
} from '../data/binding';

/** How wide each band's members are, and how many sit side by side. */
const BAND_LAYOUT: Record<Band, { perRow: number }> = {
  metrics: { perRow: 3 },
  charts: { perRow: 2 },
  detail: { perRow: 1 },
  actions: { perRow: 4 },
};

export interface AssembleResult {
  widgets: Widget[];
  /** Notes for the author about what the assembler decided on the plan's behalf. */
  notes: string[];
}

/**
 * Which band a widget belongs to when the plan did not say.
 *
 * A fallback rather than a requirement, because a plan that omits the band is a plan with one less
 * thing to get wrong — and the widget's kind already implies its band in every case that matters.
 */
export function bandOf(kind: string): Band {
  if (kind === 'kpi' || kind === 'gauge' || kind === 'progress') return 'metrics';
  if (['column', 'bar', 'line', 'area', 'pie', 'donut'].includes(kind)) return 'charts';
  if (kind === 'button' || kind === 'buttonlist') return 'actions';
  return 'detail';
}

/**
 * Build a page's widgets from a plan.
 *
 * `startId` seeds the ids so a generated page cannot collide with widgets already on it — the builder
 * owns its counter and passes it in, rather than this module keeping state a second copy of.
 */
export function assemblePlan(
  plan: CanvasPlan,
  pages: readonly PageDef[],
  startId: number,
  catalog: readonly CatalogEntityView[] = [],
): AssembleResult {
  const notes: string[] = [];
  let seq = startId;
  const widgets: Widget[] = [];

  // The heading is not a band member: it is the page's title line and always comes first. A plan that
  // asks for one gets it here; a plan that forgets gets one anyway, because a page whose purpose is
  // only in the tab strip reads as unfinished.
  const planned = [...plan.widgets];
  const headingAt = planned.findIndex((widget) => widget.kind === 'heading');
  const heading =
    headingAt >= 0
      ? planned.splice(headingAt, 1)[0]!
      : { id: 'title', kind: 'heading', title: plan.pageName, purpose: 'Names the page.' };
  if (headingAt < 0) notes.push('Added a heading, so the page names itself.');

  let y = 0;
  widgets.push(place(heading, 0, y, 12, 1, seq++, pages, plan, catalog, notes));
  y += 1;

  for (const band of BANDS) {
    const members = planned.filter((widget) => (widget.band ?? bandOf(widget.kind)) === band);
    if (!members.length) continue;

    const perRow = BAND_LAYOUT[band].perRow;
    let column = 0;
    let tallest = 0;

    for (const member of members) {
      const size = DEF_SIZE[member.kind] ?? { w: 4, h: 3 };
      // Share the row evenly, but never widen a widget past its natural size: three KPIs across is a
      // metrics row, and one KPI stretched to twelve columns is a mistake that looks deliberate.
      const w = Math.min(size.w, Math.max(1, Math.floor(COLS / perRow)));
      if (column + w > COLS) {
        y += tallest;
        column = 0;
        tallest = 0;
      }
      const widget = place(member, column, y, w, size.h, seq++, pages, plan, catalog, notes);
      widgets.push(widget);
      column += widget.w;
      tallest = Math.max(tallest, widget.h);
    }
    y += tallest;
  }

  const unresolved = widgets.filter(
    (widget) => widget.type === 'button' && widget.props['target'] === '',
  );
  if (unresolved.length) {
    notes.push(
      `${unresolved.length} button(s) have no destination yet — pick one in the inspector, or on the Flow map.`,
    );
  }

  return { widgets, notes };
}

function place(
  planned: PlannedWidget,
  x: number,
  y: number,
  w: number,
  h: number,
  seq: number,
  pages: readonly PageDef[],
  plan: CanvasPlan,
  catalog: readonly CatalogEntityView[],
  notes: string[],
): Widget {
  const widget: Widget = {
    id: `w${seq}`,
    type: KEY_TYPE[planned.kind] ?? 'text',
    x,
    y,
    w,
    h,
    props: propsFor(planned, pages, plan),
  };

  const bound = bindingFor(widget, planned, catalog, notes);
  if (bound) {
    widget.binding = bound;
    // The catalog's own name wins over the plan's paraphrase. "Late File Count" is what the business
    // calls it, and a page whose labels match the catalog is a page two people can discuss.
    widget.props[titleKey(widget)] = bindingTitle(catalog, bound);
  }

  widget.h = Math.max(widget.h, minH(widget));
  return widget;
}

/**
 * The binding a planned widget asked for, checked against the author's catalog.
 *
 * Returns null — an unbound widget with literal placeholders — whenever the plan named nothing, named
 * something that does not exist, or named a widget kind that cannot read data. Every rejection is
 * *reported*, because "the chart is empty" and "you asked for a measure your catalog does not have" need
 * different actions and look identical on a canvas.
 */
function bindingFor(
  widget: Widget,
  planned: PlannedWidget,
  catalog: readonly CatalogEntityView[],
  notes: string[],
): WidgetBinding | null {
  if (!planned.entityRef || !isBindable(widget) || !catalog.length) return null;

  const wanted: WidgetBinding = {
    entity: planned.entityRef,
    ...(planned.measureRef ? { measure: planned.measureRef } : {}),
    ...(planned.aggregation ? { aggregation: planned.aggregation as WidgetBinding['aggregation'] } : {}),
    ...(planned.dimensionRef ? { dimension: planned.dimensionRef } : {}),
    ...(planned.attributeRefs?.length ? { attributes: [...planned.attributeRefs] } : {}),
  };

  const checked = checkBinding(wanted, catalog);
  for (const problem of checked.problems) notes.push(`${planned.title}: ${problem}`);
  if (!checked.binding) return null;

  // A shape needs its parts. A chart with a measure and no breakdown is one bar, which is a mistake
  // that renders — the worst kind — so it stays unbound and says what is missing.
  const shape = shapeOf(widget);
  if (shape === 'figure' && !checked.binding.measure) return null;
  if (shape === 'series' && (!checked.binding.measure || !checked.binding.dimension)) {
    notes.push(`${planned.title}: needs a measure and something to break it down by, so it is not bound.`);
    return null;
  }
  if (shape === 'list' && !checked.binding.attributes?.length) return null;

  return checked.binding;
}

function titleKey(widget: Widget): string {
  if (widget.type === 'kpi') return 'label';
  return 'title';
}

/**
 * The widget's props: the palette's defaults, with the plan's *words* written over them.
 *
 * Nothing numeric comes from the plan. Where it supplied labels, the sample series is stretched or
 * trimmed to match, so a six-bar default does not silently show four labels against six bars.
 */
function propsFor(
  planned: PlannedWidget,
  pages: readonly PageDef[],
  plan: CanvasPlan,
): WidgetProps {
  const props: WidgetProps = { ...defProps(planned.kind) };
  const type = KEY_TYPE[planned.kind];

  if (type === 'heading' || type === 'text') props['text'] = planned.title;
  else if (type === 'kpi' || type === 'button') props['label'] = planned.title;
  else props['title'] = planned.title;

  /*
    A generated KPI reads "—", not the palette's "0".

    The distinction is between a *shape* and a *claim*. A chart's sample bars are visibly generic — nobody
    reads "Equity 820" off a placeholder and repeats it. "Total late file loads: 0" is a sentence, it is
    false, and it is exactly the kind of thing that ends up in a screenshot. An em dash cannot be
    misread: it says the figure is not bound yet, which is the truth until data binding lands.

    Only the figure, and only where a figure is the whole widget. Charts and gauges keep their sample
    shapes, because a chart with no numbers cannot be drawn at all and a shape is not an assertion.
  */
  if (type === 'kpi') {
    props['value'] = '—';
    props['delta'] = '';
    props['dir'] = 'flat';
  }
  // A bound widget's figure comes from the gateway, so the placeholder is only what shows if the query
  // cannot be answered. Left in deliberately: see the fallback note in the renderer.

  if (planned.categories?.length) {
    if (Array.isArray(props['categories'])) {
      props['categories'] = [...planned.categories];
      props['series'] = fit(props['series'], planned.categories.length);
    }
    if (Array.isArray(props['options'])) props['options'] = [...planned.categories];
    if (Array.isArray(props['segments'])) {
      props['segments'] = fitSegments(props['segments'], planned.categories);
    }
  }

  if (planned.columns?.length && Array.isArray(props['columns'])) {
    props['columns'] = [...planned.columns];
    props['rows'] = fitRows(props['rows'], planned.columns.length);
  }

  if (type === 'button') {
    props['action'] = 'navigate';
    props['target'] = resolveTarget(planned.target, pages, plan);
  }

  return props;
}

/**
 * A nav target, resolved to a page that exists or to nothing.
 *
 * A plan may name a page by id, or by the name of another page in the same request. It may not invent
 * a destination: an unresolvable target becomes an empty one, and the assembler says so in its notes,
 * because a button that navigates nowhere is visible and a button pointing at a page that does not
 * exist is not.
 */
function resolveTarget(
  target: string | undefined,
  pages: readonly PageDef[],
  plan: CanvasPlan,
): string {
  if (!target) return '';
  if (pages.some((page) => page.id === target)) return target;
  const byName = pages.find((page) => page.name.toLowerCase() === target.toLowerCase());
  if (byName) return byName.id;
  void plan;
  return '';
}

/** Stretch or trim a sample series to a label count, keeping its shape. */
function fit(series: unknown, count: number): number[] {
  const base = Array.isArray(series) && series.length ? (series as number[]) : [10];
  return Array.from({ length: count }, (_, index) => base[index % base.length]!);
}

function fitSegments(segments: unknown, labels: readonly string[]): unknown[] {
  const base = Array.isArray(segments) ? segments : [];
  return labels.map((label, index) => {
    const source = (base[index % Math.max(1, base.length)] ?? {}) as Record<string, unknown>;
    return { ...source, label };
  });
}

function fitRows(rows: unknown, width: number): string[][] {
  const base = Array.isArray(rows) ? (rows as string[][]) : [];
  return base.map((row) => Array.from({ length: width }, (_, index) => row[index] ?? '—'));
}
