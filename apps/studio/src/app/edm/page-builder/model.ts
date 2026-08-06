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
