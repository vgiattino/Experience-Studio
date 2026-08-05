/** Data source and binding models. Mirrors schemas/data-source.schema.json and binding.schema.json. */

import type {
  Aggregation,
  ComputableValue,
  ConditionalFormat,
  Condition,
  EffectiveDating,
  Expression,
  FormatSpec,
  I18nString,
  Identifier,
  MemberName,
  QualifiedRef,
  Threshold,
} from './common';

export type DataSourceKind = 'aggregate' | 'list' | 'single' | 'search' | 'graph';

export type FilterOperator =
  | 'eq'
  | 'ne'
  | 'in'
  | 'notIn'
  | 'gt'
  | 'gte'
  | 'lt'
  | 'lte'
  | 'between'
  | 'contains'
  | 'startsWith'
  | 'endsWith'
  | 'isNull'
  | 'isNotNull'
  | 'inLast'
  | 'inNext'
  | 'onOrAfterToday'
  | 'beforeToday';

export type TimeUnit =
  | 'minute'
  | 'hour'
  | 'day'
  | 'week'
  | 'month'
  | 'quarter'
  | 'year'
  | 'businessDay';

export interface FilterClause {
  target: string;
  operator: FilterOperator;
  value?: ComputableValue;
  unit?: TimeUnit;
  /** Drop the clause when its value is null or empty. Defaults to true. */
  skipWhenEmpty?: boolean;
  caseSensitive?: boolean;
}

export type FilterNode =
  | FilterClause
  | { all: readonly FilterNode[] }
  | { any: readonly FilterNode[] }
  | { not: FilterNode };

export interface AttributeSelect {
  attribute: string;
  alias: Identifier;
  label?: I18nString;
  format?: FormatSpec;
}

export interface MeasureSelect {
  measure: string;
  aggregation?: Aggregation;
  alias: Identifier;
  label?: I18nString;
  format?: FormatSpec;
  filter?: FilterNode;
}

export interface DimensionSelect {
  attribute: string;
  alias: Identifier;
  label?: I18nString;
  granularity?: 'day' | 'week' | 'month' | 'quarter' | 'year' | 'hour' | 'minute';
  limit?: number;
  includeOther?: boolean;
}

export interface Select {
  attributes?: readonly AttributeSelect[];
  measures?: readonly MeasureSelect[];
  dimensions?: readonly DimensionSelect[];
  key?: Readonly<Record<Identifier, ComputableValue>>;
  searchTerm?: ComputableValue;
  searchFields?: readonly Identifier[];
  totals?: { grand?: boolean; byDimension?: readonly Identifier[] };
}

export interface Traversal {
  relationship: QualifiedRef;
  alias: Identifier;
  filter?: FilterNode;
  required?: boolean;
  limit?: number;
  sort?: readonly { attribute: Identifier; direction?: 'asc' | 'desc' }[];
}

export interface SortSpec {
  field: Identifier;
  direction?: 'asc' | 'desc';
  nulls?: 'first' | 'last';
}

export interface DataSource {
  id: Identifier;
  name?: I18nString;
  description?: string;
  entity: QualifiedRef;
  kind: DataSourceKind;
  select: Select;
  filter?: FilterNode;
  traversals?: readonly Traversal[];
  sort?: readonly SortSpec[];
  paging?: { mode?: 'none' | 'offset' | 'cursor'; pageSize?: number; maxRows?: number };
  effectiveDating?: EffectiveDating;
  parameters?: Readonly<
    Record<Identifier, { dataType: string; default?: ComputableValue; required?: boolean }>
  >;
  refresh?: {
    mode?: 'onLoad' | 'interval' | 'manual' | 'onAction';
    intervalSeconds?: number;
    onActions?: readonly Identifier[];
  };
  loadPolicy?: 'eager' | 'deferred' | 'onDemand';
  cacheTtlHintSeconds?: number;
  expectedCostClass?: 'low' | 'medium' | 'high';
}

// ── Bindings ────────────────────────────────────────────────────────────────

export type RenderAs =
  | 'text'
  | 'code'
  | 'badge'
  | 'link'
  | 'icon'
  | 'progress'
  | 'sparkline'
  | 'trafficLight'
  | 'checkbox';

export interface FieldBinding {
  source?: Identifier;
  field: Identifier;
  label?: I18nString;
  format?: FormatSpec;
  transform?: Expression;
  conditionalFormats?: readonly ConditionalFormat[];
  thresholds?: readonly Threshold[];
  emptyValue?: I18nString;
  width?: string;
  align?: 'start' | 'center' | 'end';
  sortable?: boolean;
  filterable?: boolean;
  groupable?: boolean;
  pinned?: 'none' | 'start' | 'end';
  hidden?: boolean;
  visible?: Condition;
  action?: Identifier;
  renderAs?: RenderAs;
}

export type BindingSet = Readonly<Record<MemberName, FieldBinding | readonly FieldBinding[]>>;

export type EncodingChannel =
  | 'x'
  | 'y'
  | 'y2'
  | 'series'
  | 'color'
  | 'size'
  | 'shape'
  | 'tooltip'
  | 'detail';

export interface EncodingBinding {
  channel: EncodingChannel;
  binding: FieldBinding;
  scale?: {
    type?: 'linear' | 'log' | 'time' | 'ordinal' | 'band';
    min?: number | null;
    max?: number | null;
    zero?: boolean;
    reverse?: boolean;
  };
  axis?: {
    title?: I18nString;
    visible?: boolean;
    gridlines?: boolean;
    tickFormat?: FormatSpec;
    labelRotation?: number;
  };
}
