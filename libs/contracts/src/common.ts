/** Shared primitives. Mirrors schemas/common.schema.json. */

/** Authored / catalog identifier. kebab-case. */
export type Identifier = string;

/** Component contract member name (event, role, slot, config property). camelCase. */
export type MemberName = string;

/** Dotted reference into the semantic catalog. */
export type QualifiedRef = string;

/** Component type from the registry, e.g. 'analytics.kpi-card'. */
export type ComponentTypeRef = string;

export type Breakpoint = 'xs' | 'sm' | 'md' | 'lg' | 'xl';

export const BREAKPOINT_ORDER: readonly Breakpoint[] = ['xs', 'sm', 'md', 'lg', 'xl'];

export type DataType =
  | 'string'
  | 'integer'
  | 'decimal'
  | 'boolean'
  | 'date'
  | 'datetime'
  | 'time'
  | 'amount'
  | 'percentage'
  | 'enum'
  | 'identifier'
  | 'json';

export type Sensitivity = 'public' | 'internal' | 'confidential' | 'restricted' | 'pii';

export type Emphasis = 'neutral' | 'positive' | 'warning' | 'negative' | 'info' | 'muted';

export type Aggregation =
  | 'sum'
  | 'avg'
  | 'min'
  | 'max'
  | 'count'
  | 'countDistinct'
  | 'median'
  | 'p90'
  | 'p95'
  | 'p99'
  | 'stddev'
  | 'first'
  | 'last'
  | 'none';

/** Translatable text. A plain string is permitted for authoring convenience. */
export type I18nString = string | { key: string; default: string; context?: string };

export interface Expression {
  $expr: string;
}

/**
 * A value that may be literal or resolved from page state.
 *
 * The non-$expr wrappers are distinct so the renderer can derive the data
 * invalidation graph by walking JSON, without parsing any expression.
 */
export type ComputableValue =
  | string
  | number
  | boolean
  | null
  | readonly (string | number | boolean | null)[]
  | Expression
  | { $param: Identifier }
  | { $filter: Identifier }
  | { $selection: Identifier }
  | { $context: string };

export type Condition = Expression;

export type FormatStyle =
  | 'number'
  | 'integer'
  | 'decimal'
  | 'currency'
  | 'percent'
  | 'date'
  | 'datetime'
  | 'time'
  | 'duration'
  | 'text'
  | 'code'
  | 'boolean';

export interface FormatSpec {
  style?: FormatStyle;
  decimals?: number;
  thousandsSeparator?: boolean;
  currencyCode?: string;
  currencyFrom?: string;
  datePattern?: string;
  timezone?: string;
  nullDisplay?: string;
  prefix?: string;
  suffix?: string;
  abbreviate?: boolean;
}

export interface ConditionalFormat {
  when: Condition;
  emphasis: Emphasis;
  icon?: string;
  label?: I18nString;
}

export interface Threshold {
  id: Identifier;
  label?: I18nString;
  from?: number | null;
  to?: number | null;
  emphasis: Emphasis;
}

export interface PlacementOverride {
  colStart?: number;
  colSpan?: number;
  rowSpan?: number;
  order?: number;
  hidden?: boolean;
}

export interface GridPlacement extends Omit<PlacementOverride, 'hidden'> {
  minHeight?: string;
  breakpoints?: Partial<Record<Breakpoint, PlacementOverride>>;
}

export interface EffectiveDating {
  asOf?: ComputableValue;
  knownAs?: ComputableValue;
}

export interface ElementSecurity {
  requiredCapabilities?: readonly string[];
  requiredRoles?: readonly string[];
  deniedBehaviour?: 'deniedState' | 'hide' | 'disable' | 'placeholder';
  rationale?: string;
}

/** Type guards for the computable value wrappers. */
export const isExpression = (v: unknown): v is Expression =>
  typeof v === 'object' && v !== null && '$expr' in v;

export const isParamRef = (v: unknown): v is { $param: string } =>
  typeof v === 'object' && v !== null && '$param' in v;

export const isFilterRef = (v: unknown): v is { $filter: string } =>
  typeof v === 'object' && v !== null && '$filter' in v;

export const isSelectionRef = (v: unknown): v is { $selection: string } =>
  typeof v === 'object' && v !== null && '$selection' in v;

export const isContextRef = (v: unknown): v is { $context: string } =>
  typeof v === 'object' && v !== null && '$context' in v;

/** Resolve an I18nString to display text. M1 uses the default; a string table is a later concern. */
export function text(value: I18nString | undefined): string {
  if (value === undefined) return '';
  return typeof value === 'string' ? value : value.default;
}
