/**
 * The two-stage generation contract (ai-architecture.md §5.2).
 *
 * A CENTRAL DECISION, worth stating plainly: the model does not emit a page definition. It
 * emits a small, strictly-schematised set of DECISIONS — which widgets, over which entity,
 * bound to which measure with which aggregation — and the platform assembles the definition
 * deterministically from them (see assemble.ts).
 *
 * That split matters for three reasons:
 *   - It reduces the surface where a model can be wrong to exactly the choices needing
 *     judgement. Everything mechanical (ids, layout maths, version envelopes, action wiring)
 *     is code, and code does not hallucinate.
 *   - A ~40-line plan is far more reliably produced than a ~500-line page, and cheap to
 *     repair: when widget seven is wrong, only widget seven regenerates, and the six that
 *     were right cannot silently change.
 *   - The response schemas below are small enough to be genuinely enforced by a provider's
 *     structured-output mode.
 */

export type WidgetKind = 'kpi' | 'chart' | 'table' | 'text';

/** Stage 1 output: the layout plan. */
export interface PlanWidget {
  id: string;
  kind: WidgetKind;
  title: string;
  /** Why this widget is here. Recorded in provenance and shown to reviewers. */
  purpose: string;
  entityRef?: string;
  measureRef?: string;
  /** x axis for a chart, or the grouping for an aggregate. */
  dimensionRef?: string;
  /** Series split for a chart. */
  seriesRef?: string;
  /** Columns for a table. */
  attributeRefs?: string[];
  /** Widgets sharing a group render side by side. */
  group?: string;
}

export interface GenerationPlan {
  pageName: string;
  pageDescription: string;
  introSentence: string;
  templateId: string;
  widgets: PlanWidget[];
}

/** Stage 2 output: one widget's configuration, produced per widget in parallel. */
export interface WidgetFill {
  widgetId: string;
  componentType: string;
  config: Record<string, unknown>;
  /**
   * How to aggregate the planned measure.
   *
   * This lives in stage 2 rather than stage 1 deliberately, and the reason is the repair loop.
   * Aggregation is a BINDING decision — the same "which measure, read how" judgement as a
   * filter or a sort — and repair regenerates fills, not plans. Left in the plan, an illegal
   * aggregation was a permanently unrepairable error: validation reported it correctly, the
   * repair call could not change it, and a fixable page fell back instead.
   */
  aggregation?: string;
  /** Filters the widget's data source should apply, expressed against catalog attributes. */
  filters: FillFilter[];
  /** Sort for a table or a dimensioned aggregate. */
  sort?: { attributeRef: string; direction: 'asc' | 'desc' }[];
  /** Only meaningful for a table. */
  pageSize?: number;
  /** Emphasis bands for a KPI, when the measure supports them. */
  useThresholds?: boolean;
}

export interface FillFilter {
  attributeRef: string;
  operator: string;
  /** A literal, or a reference to page state the platform will wire. */
  value?: string | number | boolean | (string | number)[];
  valueFrom?: 'asOfParameter' | 'severityFilter' | 'statusFilter' | 'today';
  unit?: string;
}

// ── JSON Schemas passed to the provider as a structured-output constraint ──────────

export const PLAN_RESPONSE_SCHEMA = {
  $schema: 'https://json-schema.org/draft/2020-12/schema',
  type: 'object',
  properties: {
    pageName: { type: 'string', minLength: 3, maxLength: 80 },
    pageDescription: { type: 'string', minLength: 3, maxLength: 240 },
    introSentence: { type: 'string', minLength: 3, maxLength: 400 },
    templateId: { type: 'string' },
    widgets: {
      type: 'array',
      minItems: 1,
      maxItems: 12,
      items: {
        type: 'object',
        properties: {
          id: { type: 'string', pattern: '^[a-z][a-z0-9]*(?:-[a-z0-9]+)*$' },
          kind: { type: 'string', enum: ['kpi', 'chart', 'table', 'text'] },
          title: { type: 'string', minLength: 1, maxLength: 80 },
          purpose: { type: 'string', minLength: 1, maxLength: 240 },
          entityRef: { type: 'string' },
          measureRef: { type: 'string' },
          dimensionRef: { type: 'string' },
          seriesRef: { type: 'string' },
          attributeRefs: { type: 'array', items: { type: 'string' }, maxItems: 12 },
          group: { type: 'string' },
        },
        required: ['id', 'kind', 'title', 'purpose'],
        additionalProperties: false,
      },
    },
  },
  required: ['pageName', 'pageDescription', 'introSentence', 'templateId', 'widgets'],
  additionalProperties: false,
} as const;

export const FILL_RESPONSE_SCHEMA = {
  $schema: 'https://json-schema.org/draft/2020-12/schema',
  type: 'object',
  properties: {
    widgetId: { type: 'string' },
    componentType: { type: 'string' },
    config: { type: 'object' },
    aggregation: { type: 'string' },
    filters: {
      type: 'array',
      maxItems: 8,
      items: {
        type: 'object',
        properties: {
          attributeRef: { type: 'string' },
          operator: { type: 'string' },
          value: {},
          valueFrom: {
            type: 'string',
            enum: ['asOfParameter', 'severityFilter', 'statusFilter', 'today'],
          },
          unit: { type: 'string' },
        },
        required: ['attributeRef', 'operator'],
        additionalProperties: false,
      },
    },
    sort: {
      type: 'array',
      maxItems: 4,
      items: {
        type: 'object',
        properties: {
          attributeRef: { type: 'string' },
          direction: { type: 'string', enum: ['asc', 'desc'] },
        },
        required: ['attributeRef', 'direction'],
        additionalProperties: false,
      },
    },
    pageSize: { type: 'integer', minimum: 5, maximum: 200 },
    useThresholds: { type: 'boolean' },
  },
  required: ['widgetId', 'componentType', 'config', 'filters'],
  additionalProperties: false,
} as const;
