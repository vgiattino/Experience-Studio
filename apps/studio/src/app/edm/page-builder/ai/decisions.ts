/**
 * What the model is allowed to decide, and the schemas it is held to.
 *
 * ── THE CENTRAL SPLIT, TAKEN FROM THE PLATFORM ─────────────────────────────────────────
 * `libs/generation/src/plan.ts` makes a decision this file copies deliberately: **the model does not
 * emit a page.** It emits a small, strictly-schematised set of decisions — which widgets, called what,
 * there for what reason — and code assembles the page from them (see `assemble.ts`). Ids, the grid
 * maths, minimum heights, prop defaults and nav wiring are all mechanical, and code does not
 * hallucinate.
 *
 * ── AND ONE RULE OF ITS OWN: THE MODEL NAMES THINGS, IT NEVER INVENTS NUMBERS ──────────
 * A plan may say a chart shows "Equity, Bond, FX, Derivatives" — those are *labels*, structure the
 * request implies. It may not supply the bars' heights, a KPI's figure, or a table's rows. Those come
 * from `defProps`, the same placeholders a palette click gives you.
 *
 * The reason is not caution for its own sake. This builder has no data binding yet, so any figure on
 * the canvas is a placeholder — and a placeholder a *model* wrote reads like a finding. "Late files:
 * 47" is a number someone will repeat in a meeting. "Late files: 3", from the palette's defaults, is
 * visibly furniture. When binding arrives the values come from the catalog and this rule stops
 * mattering; until then it is the difference between a prototype and a fabrication.
 *
 * ── WHY THESE SCHEMAS ARE SMALL ────────────────────────────────────────────────────────
 * Small enough to be genuinely enforced by a provider's structured-output mode, and small enough that
 * a wrong answer is wrong in one identifiable place. Everything here is closed: `additionalProperties`
 * is false and every vocabulary is an enum built from the palette, so a kind that does not exist
 * cannot be requested. Grounding (`ground.ts`) then re-checks it, because a schema cannot know which
 * pages exist.
 */

import { KEY_TYPE, PALETTE, type ChartKind, type PageDef, type Widget } from '../model';

/** Every palette key, which is the whole vocabulary a plan may draw on. */
export const PALETTE_KEYS: readonly string[] = PALETTE.flatMap((group) =>
  group.items.map((item) => item.key),
);

export const CHART_KINDS: readonly ChartKind[] = ['column', 'bar', 'line', 'area', 'pie', 'donut'];

/**
 * Where a widget belongs on the page.
 *
 * A band, not coordinates. "Metrics across the top, charts under them, detail below, actions last" is
 * the layout convention every dashboard in the seed follows, and it is a judgement about *reading
 * order* rather than about pixels — so it is the model's to make and the assembler's to realise.
 */
export type Band = 'metrics' | 'charts' | 'detail' | 'actions';

export const BANDS: readonly Band[] = ['metrics', 'charts', 'detail', 'actions'];

export interface PlannedWidget {
  /** A slug, so a later repair round can address one widget without renumbering the rest. */
  id: string;
  /** A palette key — `kpi`, `column`, `table`, `button`… */
  kind: string;
  /** What it says on the page. */
  title: string;
  /** Why it is here. Shown to the author verbatim: this is the panel's explanation of itself. */
  purpose: string;
  /** Axis or option labels, where the request implies them. Structure, not data. */
  categories?: string[];
  /** Column headings for a table or grid. Structure, not data. */
  columns?: string[];
  /** For a nav button: the id of an existing page, or the name of one the plan also asks for. */
  target?: string;
  band?: Band;
}

export interface CanvasPlan {
  pageName: string;
  /** One sentence an author can read back to a stakeholder. */
  pageSummary: string;
  widgets: PlannedWidget[];
}

/**
 * A change to a page that already exists.
 *
 * A closed union rather than a patch language: every arm is something an author could have done by
 * hand, which is what makes each one reviewable in a sentence and reversible in one undo step.
 */
export type CanvasEdit =
  | { op: 'retitle'; widgetId: string; title: string; why: string }
  | { op: 'set-prop'; widgetId: string; key: string; value: string | number | boolean; why: string }
  | { op: 'chart-kind'; widgetId: string; kind: ChartKind; why: string }
  | { op: 'add'; kind: string; title: string; band?: Band; why: string }
  | { op: 'remove'; widgetId: string; why: string }
  | { op: 'resize'; widgetId: string; w: number; h: number; why: string }
  | { op: 'link'; pageId?: string; targetPageId: string; label: string; why: string }
  | { op: 'page-name'; name: string; why: string }
  /**
   * Run the deterministic layout repair on a page.
   *
   * In the union rather than beside it so that every change — typed as an instruction, offered as a
   * suggestion, or asked for as a tidy-up — travels one path, is described in one sentence, and is one
   * step of undo. A second application path is a second place to forget the undo entry.
   */
  | { op: 'tidy'; pageId?: string; why: string };

export interface CanvasEditSet {
  /** One sentence covering the set, in the author's language. */
  summary: string;
  edits: CanvasEdit[];
}

/**
 * Which props each widget type will let an instruction touch.
 *
 * An allowlist, not a denylist. A model that may write any key can invent `onClick` or `sql` and the
 * inspector will never show it, so the prop sits in the store forever doing nothing — a silent
 * failure, which is the worst kind. Anything not listed is dropped with a stated reason.
 */
export const EDITABLE_PROPS: Readonly<Record<string, readonly string[]>> = {
  heading: ['text', 'level'],
  text: ['text', 'align', 'muted'],
  divider: ['spacer'],
  image: ['url', 'caption'],
  kpi: ['label', 'value', 'delta', 'dir', 'accent'],
  table: ['title'],
  grid: ['title'],
  chart: ['title', 'kind', 'accent'],
  gauge: ['title', 'value', 'max', 'suffix'],
  progress: ['title', 'value', 'max'],
  button: ['label', 'style', 'action', 'target'],
  section: ['title', 'desc'],
  dropdown: ['label', 'caption', 'value'],
  date: ['label', 'caption', 'value'],
  radio: ['label', 'caption', 'value'],
  segment: ['label', 'caption', 'value'],
  list: ['label', 'caption', 'value'],
  buttonlist: ['label', 'caption', 'value'],
  checkbox: ['label', 'caption', 'value'],
  textinput: ['label', 'caption', 'value', 'placeholder'],
};

/** The prop a widget's headline text lives in, which differs by type. */
export function titleProp(widget: Widget): string {
  if (widget.type === 'heading' || widget.type === 'text') return 'text';
  if (widget.type === 'kpi' || widget.type === 'button') return 'label';
  return 'title';
}

/** True when a page id exists, which is the only thing a nav target may be. */
export function isPageId(pages: readonly PageDef[], id: string): boolean {
  return pages.some((page) => page.id === id);
}

export function isPaletteKey(key: string): boolean {
  return PALETTE_KEYS.includes(key) && KEY_TYPE[key] !== undefined;
}

// ── the schemas a provider is held to ─────────────────────────────────────────────────

export const CANVAS_PLAN_SCHEMA = {
  $schema: 'https://json-schema.org/draft/2020-12/schema',
  type: 'object',
  properties: {
    pageName: { type: 'string', minLength: 2, maxLength: 60 },
    pageSummary: { type: 'string', minLength: 3, maxLength: 240 },
    widgets: {
      type: 'array',
      minItems: 1,
      maxItems: 14,
      items: {
        type: 'object',
        properties: {
          id: { type: 'string', pattern: '^[a-z][a-z0-9]*(?:-[a-z0-9]+)*$' },
          kind: { type: 'string', enum: [...PALETTE_KEYS] },
          title: { type: 'string', minLength: 1, maxLength: 80 },
          purpose: { type: 'string', minLength: 1, maxLength: 200 },
          categories: { type: 'array', items: { type: 'string' }, maxItems: 12 },
          columns: { type: 'array', items: { type: 'string' }, maxItems: 8 },
          target: { type: 'string' },
          band: { type: 'string', enum: [...BANDS] },
        },
        required: ['id', 'kind', 'title', 'purpose'],
        additionalProperties: false,
      },
    },
  },
  required: ['pageName', 'pageSummary', 'widgets'],
  additionalProperties: false,
} as const;

export const CANVAS_EDIT_SCHEMA = {
  $schema: 'https://json-schema.org/draft/2020-12/schema',
  type: 'object',
  properties: {
    summary: { type: 'string', minLength: 3, maxLength: 240 },
    edits: {
      type: 'array',
      /*
        Zero is a legitimate answer. Held to a minimum of one, a provider that did not understand the
        instruction has to invent an edit to satisfy the schema — and an invented edit is applied to a
        real page. An empty list is how "I did not understand that" is said in this contract, and the
        service turns it into a question rather than a change.
      */
      minItems: 0,
      maxItems: 10,
      items: {
        type: 'object',
        properties: {
          op: {
            type: 'string',
            enum: [
              'retitle',
              'set-prop',
              'chart-kind',
              'add',
              'remove',
              'resize',
              'link',
              'page-name',
              'tidy',
            ],
          },
          widgetId: { type: 'string' },
          title: { type: 'string', maxLength: 80 },
          key: { type: 'string', maxLength: 40 },
          value: {},
          kind: { type: 'string' },
          band: { type: 'string', enum: [...BANDS] },
          w: { type: 'integer', minimum: 1, maximum: 12 },
          h: { type: 'integer', minimum: 1, maximum: 20 },
          pageId: { type: 'string' },
          targetPageId: { type: 'string' },
          label: { type: 'string', maxLength: 60 },
          name: { type: 'string', maxLength: 60 },
          why: { type: 'string', minLength: 1, maxLength: 200 },
        },
        required: ['op', 'why'],
        additionalProperties: false,
      },
    },
  },
  required: ['summary', 'edits'],
  additionalProperties: false,
} as const;
