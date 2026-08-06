/**
 * The EDM Page Builder's model — ported from `vgiattino/MDE`, branch `opus-angular-port`,
 * `frontend/src/app/screens/page-builder/page-builder.ts`.
 *
 * ── WHY THIS IS A SEPARATE MODEL FROM THE PLATFORM'S PAGE DEFINITIONS ─────────────────
 * Stated plainly rather than discovered later. Experience Studio's own visual builder edits a
 * `PageDefinition` — a validated artifact the runtime interprets, bound to a governed catalog, edited
 * through JSON Patch with undo. *This* builder is a recreation of a different product's low-code
 * studio: its widgets carry ad-hoc `props`, its data is literal arrays, and its state persists to
 * localStorage. The two are not the same thing and pretending otherwise would break both.
 *
 * So this model lives here, under `edm/`, and nothing in the platform reads it. What that buys is
 * fidelity: the screen behaves as the console's does, and can be judged against it. What it costs is
 * a second page model in one repository — which is the honest argument for eventually backing this UI
 * with `PageDefinition` instead, and is recorded as the first follow-on in the doc.
 *
 * The grid maths, the widget types, the palette grouping and the default props are the original's,
 * kept verbatim so a side-by-side comparison is meaningful.
 */

/** 12 columns, 40px rows — the original's grid, and the reason widget sizes transfer unchanged. */
export const COLS = 12;
export const ROW_H = 40;

/** The original's accent ramp, used for KPI values and chart series. */
export const ACCENTS = [
  '#a11478',
  '#4338ca',
  '#0e7490',
  '#15803d',
  '#b45309',
  '#991b1b',
  '#7c3aed',
] as const;

export type WidgetType =
  | 'heading'
  | 'text'
  | 'divider'
  | 'image'
  | 'kpi'
  | 'table'
  | 'chart'
  | 'button'
  | 'section'
  | 'dropdown'
  | 'date'
  | 'radio'
  | 'segment'
  | 'list'
  | 'buttonlist'
  | 'checkbox'
  | 'textinput'
  | 'grid'
  | 'gauge'
  | 'progress';

/** Controls whose height depends on whether a caption is shown. */
export const CONTROL_TYPES: readonly WidgetType[] = [
  'dropdown',
  'date',
  'radio',
  'segment',
  'list',
  'buttonlist',
  'checkbox',
  'textinput',
];

/** Controls that carry an option list. */
export const OPTION_CONTROLS: readonly WidgetType[] = [
  'dropdown',
  'radio',
  'segment',
  'list',
  'buttonlist',
];

/** Chart kinds this port renders. The original also has spline, funnel, radar, waterfall, scatter. */
export type ChartKind = 'column' | 'bar' | 'line' | 'area' | 'pie' | 'donut';

export interface Segment {
  label: string;
  value: number;
  color: string;
}

/** Deliberately loose, as the original's is: a widget's shape is its type's business. */
export type WidgetProps = Record<string, unknown>;

export interface Widget {
  id: string;
  type: WidgetType;
  /** Grid units: x and w in columns of 12, y and h in rows of 40px. */
  x: number;
  y: number;
  w: number;
  h: number;
  props: WidgetProps;
}

export interface PageDef {
  id: string;
  name: string;
  /** A name in the platform icon registry. The original stores its own `IcPages` keys. */
  icon: string;
  widgets: Widget[];
  /**
   * Where the author dragged this page's node on the flow map, in flow pixels.
   *
   * Absent means "wherever the auto-layout puts it", which is deliberate rather than lazy: a page
   * added after the map was arranged should appear in the computed layout instead of at 0,0, and
   * Auto-arrange works by *deleting* these two fields rather than by recomputing and storing
   * coordinates. So absence is the live state, not a missing value.
   */
  fx?: number;
  fy?: number;
}

export interface PaletteItem {
  key: string;
  type: WidgetType;
  label: string;
  icon: string;
}

export interface PaletteGroup {
  group: string;
  items: readonly PaletteItem[];
}

/**
 * The palette, group for group and label for label as the console has it.
 *
 * Chart sub-types all map to the `chart` widget type and differ by their `kind` prop — which is why
 * "Column" and "Bar" are two palette entries and one component.
 */
export const PALETTE: readonly PaletteGroup[] = [
  {
    group: 'Content',
    items: [
      { key: 'heading', type: 'heading', label: 'Heading', icon: 'page' },
      { key: 'text', type: 'text', label: 'Text block', icon: 'document' },
      { key: 'divider', type: 'divider', label: 'Divider', icon: 'chevron-left' },
      { key: 'image', type: 'image', label: 'Image', icon: 'library' },
    ],
  },
  {
    group: 'Data',
    items: [
      { key: 'kpi', type: 'kpi', label: 'Metric / KPI', icon: 'model' },
      { key: 'table', type: 'table', label: 'Data table', icon: 'grid' },
    ],
  },
  {
    group: 'Inputs',
    items: [
      { key: 'dropdown', type: 'dropdown', label: 'Dropdown', icon: 'chevron-down' },
      { key: 'date', type: 'date', label: 'Date', icon: 'history' },
      { key: 'radio', type: 'radio', label: 'Radio group', icon: 'attribute' },
      { key: 'segment', type: 'segment', label: 'Segments', icon: 'sliders' },
      { key: 'list', type: 'list', label: 'List', icon: 'grid' },
      { key: 'buttonlist', type: 'buttonlist', label: 'Button list', icon: 'layers' },
      { key: 'checkbox', type: 'checkbox', label: 'Checkbox', icon: 'check' },
      { key: 'textinput', type: 'textinput', label: 'Text input', icon: 'edit' },
    ],
  },
  {
    group: 'Reporting',
    items: [
      { key: 'grid', type: 'grid', label: 'Data grid', icon: 'grid' },
      { key: 'gauge', type: 'gauge', label: 'Gauge', icon: 'attribute' },
      { key: 'progress', type: 'progress', label: 'Progress', icon: 'sliders' },
    ],
  },
  {
    group: 'Charts',
    items: [
      { key: 'column', type: 'chart', label: 'Column', icon: 'model' },
      { key: 'bar', type: 'chart', label: 'Bar', icon: 'model' },
      { key: 'line', type: 'chart', label: 'Line', icon: 'flow' },
      { key: 'area', type: 'chart', label: 'Area', icon: 'flow' },
      { key: 'pie', type: 'chart', label: 'Pie', icon: 'attribute' },
      { key: 'donut', type: 'chart', label: 'Donut', icon: 'attribute' },
    ],
  },
  {
    group: 'Flow',
    items: [
      { key: 'button', type: 'button', label: 'Button / Nav', icon: 'chevron-right' },
      { key: 'section', type: 'section', label: 'Section', icon: 'layers' },
    ],
  },
];

/** Palette key → widget type. Chart sub-types collapse onto `chart`. */
export const KEY_TYPE: Record<string, WidgetType> = Object.fromEntries(
  PALETTE.flatMap((group) => group.items.map((item) => [item.key, item.type])),
);

/** Default grid size per palette key, verbatim from the original. */
export const DEF_SIZE: Record<string, { w: number; h: number }> = {
  heading: { w: 12, h: 1 },
  text: { w: 6, h: 2 },
  divider: { w: 12, h: 1 },
  image: { w: 4, h: 4 },
  kpi: { w: 4, h: 3 },
  table: { w: 8, h: 6 },
  column: { w: 6, h: 6 },
  bar: { w: 6, h: 6 },
  line: { w: 6, h: 6 },
  area: { w: 6, h: 6 },
  pie: { w: 5, h: 6 },
  donut: { w: 5, h: 6 },
  grid: { w: 8, h: 7 },
  gauge: { w: 3, h: 4 },
  progress: { w: 4, h: 2 },
  dropdown: { w: 3, h: 2 },
  date: { w: 3, h: 2 },
  radio: { w: 4, h: 2 },
  segment: { w: 4, h: 2 },
  list: { w: 3, h: 4 },
  buttonlist: { w: 4, h: 2 },
  checkbox: { w: 3, h: 1 },
  textinput: { w: 4, h: 2 },
  button: { w: 3, h: 2 },
  section: { w: 12, h: 5 },
};

/** Default props per palette key, verbatim from the original so seeded content matches. */
export function defProps(key: string): WidgetProps {
  switch (key) {
    case 'heading':
      return { text: 'Section heading', level: 2 };
    case 'text':
      return { text: 'Add a short description of what this page shows.', align: 'left', muted: false };
    case 'divider':
      return { style: 'solid', spacer: false };
    case 'image':
      return { caption: 'Image', url: '', fit: 'cover' };
    case 'kpi':
      return { label: 'Metric', value: '0', delta: '0%', dir: 'flat', accent: ACCENTS[0] };
    case 'table':
      return {
        title: 'Data table',
        columns: ['Security', 'Asset Type', 'Status'],
        rows: [
          ['US0378331005', 'Equity', 'Complete'],
          ['GB0002634946', 'Bond', 'Partial'],
          ['FR0000131104', 'Equity', 'Complete'],
        ],
      };
    case 'dropdown':
      return { caption: true, label: 'Asset type', options: ['Equity', 'Bond', 'FX', 'Derivative'], value: 'Equity' };
    case 'date':
      return { caption: true, label: 'As-of date', value: '2026-07-03' };
    case 'radio':
      return { caption: true, label: 'Frequency', options: ['Daily', 'Weekly', 'Monthly'], value: 'Daily' };
    case 'segment':
      return { caption: true, label: 'View', options: ['Day', 'Week', 'Month'], value: 'Week' };
    case 'list':
      return {
        caption: true,
        label: 'Sources',
        options: ['Bloomberg', 'Refinitiv', 'ICE', 'Markit'],
        value: 'Bloomberg',
      };
    case 'buttonlist':
      return { caption: true, label: 'Decision', options: ['Approve', 'Reject', 'Defer'], value: 'Approve' };
    case 'checkbox':
      return { caption: false, label: 'Include inactive records', value: true };
    case 'textinput':
      return { caption: true, label: 'Search', value: '', placeholder: 'Search records…' };
    case 'column':
      return {
        title: 'Records by asset type',
        kind: 'column',
        accent: ACCENTS[0],
        categories: ['Equity', 'Bond', 'FX', 'Deriv', 'Cash', 'Loan'],
        series: [820, 540, 610, 470, 380, 290],
      };
    case 'bar':
      return {
        title: 'Records by asset type',
        kind: 'bar',
        accent: ACCENTS[2],
        categories: ['Equity', 'Bond', 'FX', 'Deriv', 'Cash', 'Loan'],
        series: [820, 540, 610, 470, 380, 290],
      };
    case 'line':
      return {
        title: 'Trend',
        kind: 'line',
        accent: ACCENTS[1],
        categories: ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'],
        series: [30, 42, 38, 55, 48, 63, 58],
      };
    case 'area':
      return {
        title: 'Volume',
        kind: 'area',
        accent: ACCENTS[3],
        categories: ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun'],
        series: [120, 180, 150, 220, 260, 240],
      };
    case 'pie':
    case 'donut':
      return {
        title: 'Coverage',
        kind: key,
        segments: [
          { label: 'Covered', value: 72, color: '#15803d' },
          { label: 'Partial', value: 18, color: '#b45309' },
          { label: 'Missing', value: 10, color: '#991b1b' },
        ],
      };
    case 'grid':
      return {
        title: 'Securities',
        columns: ['Security', 'Asset Type', 'Market', 'Currency', 'Coverage', 'Status'],
        rows: [
          ['US0378331005', 'Equity', 'Public', 'USD', '98%', 'Complete'],
          ['GB0002634946', 'Fixed Income', 'Public', 'GBP', '91%', 'Partial'],
          ['PRIV-00432', 'Fund', 'Private', 'EUR', '84%', 'Complete'],
          ['XS2345678901', 'Fixed Income', 'Public', 'USD', '96%', 'Complete'],
          ['DE0005140008', 'Equity', 'Public', 'EUR', '88%', 'Partial'],
          ['JP3633400001', 'Equity', 'Public', 'JPY', '94%', 'Complete'],
        ],
      };
    case 'gauge':
      return { title: 'Data readiness', value: 88, max: 100, color: '#15803d', suffix: '%' };
    case 'progress':
      return { title: 'Files loaded', value: 21, max: 24 };
    case 'button':
      return { label: 'Continue', style: 'primary', action: 'navigate', target: '' };
    case 'section':
      return { title: 'Section', desc: '' };
    default:
      return {};
  }
}

/**
 * The minimum rows a widget needs for its content not to clip.
 *
 * The original enforces this on add, on resize and **on load** — a stored design whose widget is
 * shorter than its content is repaired rather than rendered broken. Kept, because it is the rule that
 * stops a drag from producing an unreadable card.
 */
export function minH(widget: Widget): number {
  const captioned = widget.props['caption'] === true;
  switch (widget.type) {
    case 'heading':
    case 'divider':
    case 'checkbox':
      return 1;
    case 'text':
      return 2;
    case 'kpi':
      return 3;
    case 'table':
    case 'grid':
      return 4;
    case 'chart':
      return 4;
    case 'gauge':
      return 3;
    case 'progress':
      return 2;
    case 'section':
      return 3;
    default:
      return CONTROL_TYPES.includes(widget.type) ? (captioned ? 2 : 1) : 2;
  }
}

/** A link between pages, derived from every nav button's target — never stored. */
export interface PageLink {
  id: string;
  from: string;
  to: string;
  label: string;
  widgetId: string;
}

/**
 * Links, computed from the pages.
 *
 * The original derives these rather than storing them, which is the right call and worth keeping: a
 * link *is* a nav button pointing at a page, so a stored edge could disagree with the button that
 * created it. A page may branch to many, and back-links are ordinary edges.
 */
export function linksOf(pages: readonly PageDef[]): PageLink[] {
  const ids = new Set(pages.map((page) => page.id));
  const out: PageLink[] = [];
  for (const page of pages) {
    for (const widget of page.widgets) {
      if (widget.type !== 'button') continue;
      const target = widget.props['target'];
      if (
        widget.props['action'] === 'navigate' &&
        typeof target === 'string' &&
        ids.has(target)
      ) {
        out.push({
          id: `${page.id}>${widget.id}`,
          from: page.id,
          to: target,
          label: String(widget.props['label'] ?? 'Open'),
          widgetId: widget.id,
        });
      }
    }
  }
  return out;
}

/* ── page structure ─────────────────────────────────────────────────────────────────────── */

/** A widget's title, if it has one worth reading, otherwise its kind. */
export function labelOf(widget: Widget): string {
  for (const key of ['label', 'title', 'text', 'caption'] as const) {
    const value = widget.props[key];
    if (typeof value === 'string' && value.trim()) return value.trim();
  }
  return typeLabelOf(widget);
}

/** What kind of thing a widget is, in the palette's words. */
export function typeLabelOf(widget: Widget): string {
  if (widget.type === 'chart') return `${String(widget.props['kind'] ?? 'chart')} chart`;
  const found = PALETTE.flatMap((group) => group.items).find(
    (item) => KEY_TYPE[item.key] === widget.type,
  );
  return found?.label ?? widget.type;
}

export interface StructureRow {
  widget: Widget;
  /** Nesting depth: 0 at the top level, one more inside each enclosing section. */
  depth: number;
  parentId: string | null;
  /** Index in the page's widget array — which is paint order, and so the thing restacking moves. */
  index: number;
  /** True when another widget at the same level overlaps this one, so stacking order matters. */
  stacked: boolean;
}

const area = (widget: Widget): number => widget.w * widget.h;

/** Does `outer` fully enclose `inner`? Partial overlap is deliberately not containment. */
function encloses(outer: Widget, inner: Widget): boolean {
  return (
    inner.x >= outer.x &&
    inner.y >= outer.y &&
    inner.x + inner.w <= outer.x + outer.w &&
    inner.y + inner.h <= outer.y + outer.h
  );
}

function intersects(a: Widget, b: Widget): boolean {
  return (
    a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h
  );
}

/**
 * The page as a tree: sections as parents, everything else as leaves, in reading order.
 *
 * ── WHY THIS IS DERIVED FROM GEOMETRY ─────────────────────────────────────────────────
 * The platform's own structure panel walks a nested `PageDefinition.layout`, where parentage is
 * recorded. This model has no nesting: a page is a flat array of widgets on a 12-column grid, and a
 * Section widget is a titled box that other widgets are dropped *on top of*. So the containment that
 * an author can plainly see is not written down anywhere.
 *
 * Deriving it from the rectangles is the same choice this file already makes for page links — read the
 * structure out of what the author did rather than keep a second record that can disagree with it. Drag
 * a KPI onto a section and it is inside it, in the panel and on the screen, with nothing to sync.
 *
 * The rule is **full enclosure**, not overlap: a widget hanging over a section's edge stays at the top
 * level. That is honest about an ambiguous case instead of guessing, and it makes the relation a strict
 * ordering — a section only ever parents something smaller than itself, or something the same size that
 * was added earlier — so the tree cannot contain a cycle.
 *
 * Siblings are ordered by row then column, because reading order is the order an author scans for. It
 * is *not* the array order: that is paint order, which only matters where widgets overlap, and is
 * surfaced per row as `stacked` rather than imposed on the whole list.
 */
function parentMap(widgets: readonly Widget[]): Map<string, string | null> {
  const indexOf = new Map<string, number>(widgets.map((widget, index) => [widget.id, index]));
  const parentOf = new Map<string, string | null>();
  for (const widget of widgets) {
    let best: Widget | null = null;
    for (const candidate of widgets) {
      if (candidate.type !== 'section' || candidate.id === widget.id) continue;
      if (!encloses(candidate, widget)) continue;
      // A strict order, so nothing can end up its own ancestor: strictly bigger wins, and an exact
      // tie is broken by which was added first.
      const bigger =
        area(candidate) > area(widget) ||
        (area(candidate) === area(widget) &&
          indexOf.get(candidate.id)! < indexOf.get(widget.id)!);
      if (!bigger) continue;
      if (
        !best ||
        area(candidate) < area(best) ||
        (area(candidate) === area(best) && indexOf.get(candidate.id)! < indexOf.get(best.id)!)
      ) {
        best = candidate;
      }
    }
    parentOf.set(widget.id, best?.id ?? null);
  }
  return parentOf;
}

/** Widgets grouped by parent, each group in array order. */
function childMap(
  widgets: readonly Widget[],
  parentOf: Map<string, string | null>,
): Map<string | null, Widget[]> {
  const children = new Map<string | null, Widget[]>();
  for (const widget of widgets) {
    const key = parentOf.get(widget.id) ?? null;
    const list = children.get(key) ?? [];
    list.push(widget);
    children.set(key, list);
  }
  return children;
}

/**
 * The order the canvas paints in: a container before everything it holds.
 *
 * This is *not* the array order, and the difference is a defect the structure panel exposed. A Section
 * added after the widgets it ends up around is later in the array, so it painted over them — drag a KPI
 * into a section and the KPI vanished behind an opaque box, unclickable and only findable in the
 * structure tree. Walking the derived tree fixes it by construction: an ancestor is always emitted
 * first, so a section can never cover its own contents however it was built.
 *
 * Siblings keep **array order**, unlike the structure panel's reading order, because among siblings the
 * array *is* the z-order and reordering it is what restacking does. Two orders for two jobs, from one
 * tree.
 */
export function paintOrder(widgets: readonly Widget[]): Widget[] {
  const children = childMap(widgets, parentMap(widgets));
  const out: Widget[] = [];
  const emit = (parentId: string | null): void => {
    for (const widget of children.get(parentId) ?? []) {
      out.push(widget);
      emit(widget.id);
    }
  };
  emit(null);
  return out;
}

export function structureOf(widgets: readonly Widget[]): StructureRow[] {
  const indexOf = new Map<string, number>(widgets.map((widget, index) => [widget.id, index]));
  const parentOf = parentMap(widgets);
  const children = childMap(widgets, parentOf);
  for (const list of children.values()) {
    list.sort((a, b) => a.y - b.y || a.x - b.x || indexOf.get(a.id)! - indexOf.get(b.id)!);
  }

  const rows: StructureRow[] = [];
  const emit = (parentId: string | null, depth: number): void => {
    for (const widget of children.get(parentId) ?? []) {
      const siblings = children.get(parentId) ?? [];
      rows.push({
        widget,
        depth,
        parentId,
        index: indexOf.get(widget.id)!,
        stacked: siblings.some((other) => other.id !== widget.id && intersects(other, widget)),
      });
      emit(widget.id, depth + 1);
    }
  };
  emit(null, 0);
  return rows;
}

/* ── the flow map ───────────────────────────────────────────────────────────────────────── */

/** A page node on the flow map. The original's dimensions, so an arranged map transfers unchanged. */
export const NODE_W = 190;
export const NODE_H = 78;

/**
 * Gaps between auto-placed nodes.
 *
 * The column gap is wide because an edge carries a *label* — the name of the button that is the link —
 * and that label sits at the midpoint of the gap. At the original's 96px the label was wider than the
 * space it had and sat half-under the node on each side, which made a five-page map unreadable.
 */
export const COL_GAP = 150;
const ROW_GAP = 56;
/** Vertical room per edge that skips a column, above the first row and below the return bus. */
export const SKIP_LANE = 34;
const ORIGIN_X = 34;
const ORIGIN_Y = 30;

export interface NodePos {
  x: number;
  y: number;
}

/**
 * Place every page in the column after the last page that navigates to it.
 *
 * Layer 0 is where a workflow starts, and each column after it is one navigation deeper, so reading
 * left to right is reading the workflow in order. That is the map's whole purpose, and the reason this
 * is a layering rather than a force layout: a deterministic picture an author can predict beats a
 * prettier one that rearranges itself every time the screen opens.
 *
 * **Longest path, not shortest** — the part worth explaining, because the obvious BFS is wrong here.
 * Take A → B, A → C and B → C. A shortest-distance BFS puts B and C both one step from A, in the same
 * column, and then B → C is an edge that has to be drawn *sideways*: it comes out of B's right edge,
 * turns back on itself and arrives at C from the left, which on screen is indistinguishable from a
 * "Back to…" return. Layering by the longest path instead puts C behind B, and every real navigation
 * then moves at least one column to the right. That property is what makes the picture legible.
 *
 * Cycles cannot be layered at all, so the edges that close them are found first and set aside: a DFS
 * marks an edge as a *back edge* when it points at a page still on the stack, and the remaining graph
 * is a DAG. Those back edges are the "Back to…" links, and the map draws them as returns underneath —
 * which is what they are.
 *
 * Three cases the naive version gets wrong, all covered by tests:
 *   · **a cycle with no entry at all** (A → B → A and nothing else) has no page with nothing pointing
 *     at it, so the traversal starts from the first page rather than returning an empty map;
 *   · **an island** — a group with no path from any entry — becomes its own flow starting at the left,
 *     rather than a stack of nodes on the origin;
 *   · **a self-link** is not a layering constraint and never counts towards indegree, or a page that
 *     links to itself could not be an entry.
 */
export function autoLayout(
  pages: readonly PageDef[],
  links: readonly PageLink[],
): Map<string, NodePos> {
  const positions = new Map<string, NodePos>();
  if (!pages.length) return positions;

  const order = pages.map((page) => page.id);
  const out = new Map<string, string[]>(order.map((id) => [id, []]));
  const indegree = new Map<string, number>(order.map((id) => [id, 0]));
  for (const link of links) {
    if (link.from === link.to || !out.has(link.from) || !out.has(link.to)) continue;
    out.get(link.from)!.push(link.to);
    indegree.set(link.to, indegree.get(link.to)! + 1);
  }

  // Entries first, so a workflow's real starting points end up on the left. Then everything else, so
  // an island or a pure cycle is still visited.
  const roots = [
    ...order.filter((id) => indegree.get(id) === 0),
    ...order.filter((id) => indegree.get(id) !== 0),
  ];

  /*
    Iterative DFS. Recursion would be clearer and would also blow the stack on a long enough chain of
    pages, which is a silly way for a design tool to fail.

    `state` is white (absent) → grey (on the stack) → black (done). An edge into a grey page is a back
    edge; every other edge is a layering constraint. `postorder` reversed is a topological order of
    what is left.
  */
  const state = new Map<string, 'grey' | 'black'>();
  const postorder: string[] = [];
  const back = new Set<string>();

  for (const root of roots) {
    if (state.has(root)) continue;
    const stack: { id: string; next: number }[] = [{ id: root, next: 0 }];
    state.set(root, 'grey');
    while (stack.length) {
      const frame = stack[stack.length - 1]!;
      const neighbours = out.get(frame.id)!;
      if (frame.next >= neighbours.length) {
        state.set(frame.id, 'black');
        postorder.push(frame.id);
        stack.pop();
        continue;
      }
      const next = neighbours[frame.next++]!;
      const mark = state.get(next);
      if (mark === 'grey') {
        back.add(`${frame.id}>${next}`);
      } else if (mark === undefined) {
        state.set(next, 'grey');
        stack.push({ id: next, next: 0 });
      }
    }
  }

  const layer = new Map<string, number>(order.map((id) => [id, 0]));
  for (const id of [...postorder].reverse()) {
    for (const next of out.get(id)!) {
      if (back.has(`${id}>${next}`)) continue;
      layer.set(next, Math.max(layer.get(next)!, layer.get(id)! + 1));
    }
  }

  // Within a column, page order — so reordering the tab strip reorders the map, which is what an
  // author who has just dragged a tab expects.
  const columns = new Map<number, string[]>();
  for (const id of order) {
    const depth = layer.get(id) ?? 0;
    const column = columns.get(depth) ?? [];
    column.push(id);
    columns.set(depth, column);
  }

  /*
    Headroom for the edges that skip a column.

    A → C where B sits between them cannot be drawn straight: the line would pass through B, and its
    label — which is the only way to tell one edge out of A from another — would land on B's title. The
    map arcs those edges over the row instead, so the layout has to leave room above the first row for
    them to arc into. One lane each, and enough space for three; a design with four edges skipping a
    column at once shares lanes, and shared lanes are still better than a wall of nodes pushed down.
  */
  const skipping = links.filter((link) => {
    if (link.from === link.to || back.has(`${link.from}>${link.to}`)) return false;
    const from = layer.get(link.from);
    const to = layer.get(link.to);
    return from !== undefined && to !== undefined && to - from >= 2;
  }).length;
  const top = ORIGIN_Y + Math.min(skipping, 3) * SKIP_LANE;

  for (const [depth, ids] of columns) {
    ids.forEach((id, row) => {
      positions.set(id, {
        x: ORIGIN_X + depth * (NODE_W + COL_GAP),
        y: top + row * (NODE_H + ROW_GAP),
      });
    });
  }
  return positions;
}

/**
 * The seed project: a Security Master drill-down plus an operations area.
 *
 * A trimmed version of the original's seed — enough pages that the tab strip and the link counts are
 * real, and enough widgets per page that the canvas shows a designed layout rather than an empty
 * grid. Every value is the console's mock data.
 */
export function seedPages(): PageDef[] {
  let n = 0;
  const id = () => `sw${++n}`;

  const heading = (text: string): Widget => ({
    id: id(),
    type: 'heading',
    x: 0,
    y: 0,
    w: 12,
    h: 1,
    props: { text, level: 1 },
  });

  const kpi = (
    x: number,
    y: number,
    label: string,
    value: string,
    delta: string,
    dir: string,
    accent: string,
  ): Widget => ({
    id: id(),
    type: 'kpi',
    x,
    y,
    w: 4,
    h: 3,
    props: { label, value, delta, dir, accent },
  });

  const chart = (
    x: number,
    y: number,
    w: number,
    h: number,
    kind: ChartKind,
    title: string,
    extra: WidgetProps,
  ): Widget => ({ id: id(), type: 'chart', x, y, w, h, props: { title, kind, ...extra } });

  const table = (
    x: number,
    y: number,
    w: number,
    h: number,
    title: string,
    columns: string[],
    rows: string[][],
  ): Widget => ({ id: id(), type: 'table', x, y, w, h, props: { title, columns, rows } });

  const navButton = (x: number, y: number, label: string, target: string): Widget => ({
    id: id(),
    type: 'button',
    x,
    y,
    w: 3,
    h: 2,
    props: { label, style: 'primary', action: 'navigate', target },
  });

  return [
    {
      id: 'p-asset-type',
      name: 'By Asset Type',
      icon: 'grid',
      widgets: [
        heading('Security Master by asset type'),
        kpi(0, 1, 'Instruments', '128,540', '+1.2%', 'up', ACCENTS[0]),
        kpi(4, 1, 'Coverage', '94%', '+0.4%', 'up', ACCENTS[3]),
        kpi(8, 1, 'Exceptions', '312', '-18', 'down', ACCENTS[5]),
        chart(0, 4, 6, 6, 'column', 'Records by asset type', {
          accent: ACCENTS[0],
          categories: ['Equity', 'Bond', 'FX', 'Deriv', 'Cash', 'Loan'],
          series: [820, 540, 610, 470, 380, 290],
        }),
        chart(6, 4, 6, 6, 'donut', 'Public vs private', {
          segments: [
            { label: 'Public', value: 78, color: '#15803d' },
            { label: 'Private', value: 22, color: '#a11478' },
          ],
        }),
        navButton(0, 10, 'Public vs Private', 'p-public-private'),
        navButton(3, 10, 'Private Markets', 'p-private-markets'),
      ],
    },
    {
      id: 'p-public-private',
      name: 'Public vs Private',
      icon: 'layers',
      widgets: [
        heading('Public vs private markets'),
        kpi(0, 1, 'Public instruments', '100,260', '+0.9%', 'up', ACCENTS[1]),
        kpi(4, 1, 'Private instruments', '28,280', '+3.4%', 'up', ACCENTS[0]),
        chart(0, 4, 8, 6, 'bar', 'Coverage by market', {
          accent: ACCENTS[2],
          categories: ['Public', 'Private'],
          series: [96, 84],
        }),
        navButton(0, 10, 'Private Markets', 'p-private-markets'),
        navButton(3, 10, 'Back to asset type', 'p-asset-type'),
      ],
    },
    {
      id: 'p-private-markets',
      name: 'Private Markets',
      icon: 'shield',
      widgets: [
        heading('Private Markets detail'),
        kpi(0, 1, 'Private positions', '42,420', '+5.8%', 'up', ACCENTS[6]),
        kpi(4, 1, 'Valued this month', '86%', '+2.2%', 'up', ACCENTS[3]),
        kpi(8, 1, 'Stale > 90d', '312', '-18', 'down', ACCENTS[5]),
        chart(0, 4, 8, 6, 'column', 'Private positions by type', {
          accent: ACCENTS[6],
          categories: ['Private Equity', 'Real Estate', 'Private Credit', 'Infra', 'Hedge Fund'],
          series: [12800, 8400, 21220, 5200, 6900],
        }),
        table(
          0,
          10,
          12,
          5,
          'By type',
          ['Type', 'Positions', 'Valuation'],
          [
            ['Private Equity', '12,800', 'Quarterly'],
            ['Real Estate', '8,400', 'Annual'],
            ['Private Credit', '21,220', 'Monthly'],
          ],
        ),
        navButton(0, 15, 'Back to markets', 'p-public-private'),
      ],
    },
    {
      id: 'p-ops-readiness',
      name: 'Ops — Readiness',
      icon: 'settings',
      widgets: [
        heading('Operations readiness'),
        {
          id: id(),
          type: 'gauge',
          x: 0,
          y: 1,
          w: 3,
          h: 4,
          props: { title: 'Data readiness', value: 88, max: 100, color: '#15803d', suffix: '%' },
        },
        {
          id: id(),
          type: 'progress',
          x: 3,
          y: 1,
          w: 4,
          h: 2,
          props: { title: 'Files loaded', value: 21, max: 24 },
        },
        chart(0, 5, 8, 6, 'line', 'Load trend', {
          accent: ACCENTS[1],
          categories: ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'],
          series: [30, 42, 38, 55, 48, 63, 58],
        }),
        navButton(0, 11, 'Daily File Load', 'p-daily-load'),
      ],
    },
    {
      id: 'p-daily-load',
      name: 'Daily File Load',
      icon: 'database',
      widgets: [
        heading('Daily file load'),
        kpi(0, 1, 'Files processed', '24', '+2', 'up', ACCENTS[3]),
        kpi(4, 1, 'Late files', '3', '+1', 'down', ACCENTS[4]),
        table(
          0,
          4,
          12,
          6,
          'Loads',
          ['File', 'Source', 'Status'],
          [
            ['BBG_SEC_20260806', 'Bloomberg', 'Complete'],
            ['RFT_PRICE_20260806', 'Refinitiv', 'Late'],
            ['ICE_CORP_20260806', 'ICE', 'Complete'],
          ],
        ),
        navButton(0, 10, 'Back to readiness', 'p-ops-readiness'),
      ],
    },
  ];
}
