/**
 * A widget's binding to the governed catalog, and the query it becomes.
 *
 * ── WHAT CHANGES WHEN THERE IS A CATALOG BEHIND THIS ────────────────────────────────────
 * Until now every value on this canvas was a literal in `props`: an author typed "94%" and a chart
 * carried its own array of numbers. That is what a prototype of a page builder looks like. A *binding*
 * replaces the literal with a reference — this figure is `late-file-count` on `processing.file-load`,
 * summed — and the value comes from the same Data Gateway the runtime uses.
 *
 * Three things follow, and they are the reason this step matters more than any feature above it:
 *
 *   · **The figures are real.** The em dash the AI panel had to write because nothing was bound
 *     becomes a number the gateway returned, formatted by the catalog's own `format` spec.
 *   · **The vocabulary is governed.** A binding can only name an entity, measure or attribute in the
 *     author's *entitlement-scoped projection*. An author who cannot see a column cannot bind to it,
 *     because the projection they were handed never mentioned it.
 *   · **The AI stops inventing titles.** A bound widget is named by the catalog's `businessName`, so
 *     "Late File Count" is the business's word for it rather than the model's paraphrase.
 *
 * ── WHAT A BINDING IS NOT ───────────────────────────────────────────────────────────────
 * It is not a query. `sourceFor` turns a binding into a `DataSource` — the platform's own contract,
 * the same one the runtime and the validator use — and the gateway decides everything else: which
 * rows the caller may see, what it costs, how long the answer may be cached. The builder states what
 * it wants in business terms and is told what it is allowed to have.
 */

import type {
  Aggregation,
  DataSource,
  FilterClause,
  FilterNode,
  FilterOperator,
  FormatSpec,
  QualifiedRef,
} from '@opus/contracts';
import { text } from '@opus/contracts';
import type { CatalogEntity, CatalogSnapshot } from '@opus/catalog';

import type { Widget } from '../model';

export interface BindingFilter {
  attribute: string;
  operator: FilterOperator;
  value: string | number | boolean;
}

export interface WidgetBinding {
  /** A catalog entity ref, e.g. `processing.file-load`. */
  entity: QualifiedRef;
  /** The measure a figure or a chart's series reads. */
  measure?: string;
  aggregation?: Aggregation;
  /** The attribute a chart groups by, or a table's leading column. */
  dimension?: string;
  /** A list's columns. */
  attributes?: string[];
  filters?: BindingFilter[];
  /** Row cap for a list, or category cap for a chart. */
  limit?: number;
}

/** What shape of query a widget's kind implies. Not the author's decision — its type's. */
export type BindingShape = 'figure' | 'series' | 'list' | 'none';

export function shapeOf(widget: Widget): BindingShape {
  switch (widget.type) {
    case 'kpi':
    case 'gauge':
    case 'progress':
      return 'figure';
    case 'chart':
      return 'series';
    case 'table':
    case 'grid':
      return 'list';
    default:
      return 'none';
  }
}

/** True when a widget of this kind could carry a binding, whether or not it does. */
export function isBindable(widget: Widget): boolean {
  return shapeOf(widget) !== 'none';
}

// ── reading the catalog ───────────────────────────────────────────────────────────────

export interface CatalogMeasureView {
  ref: string;
  name: string;
  allowedAggregations: readonly Aggregation[];
  defaultAggregation: Aggregation;
  format?: FormatSpec;
  higherIsBetter?: boolean;
  description?: string;
}

export interface CatalogAttributeView {
  ref: string;
  name: string;
  groupable: boolean;
  filterable: boolean;
  isTemporal: boolean;
  format?: FormatSpec;
}

export interface CatalogEntityView {
  ref: QualifiedRef;
  name: string;
  plural: string;
  description?: string;
  /** The gateway refuses an unfiltered query on these, so the UI has to say so first. */
  requiresFilter: boolean;
  measures: CatalogMeasureView[];
  attributes: CatalogAttributeView[];
}

const TEMPORAL = new Set(['date', 'datetime', 'time']);

/**
 * The catalog as the builder needs it: entities, their measures, their attributes.
 *
 * A projection of the projection. The snapshot is already entitlement-scoped by the Catalog Service —
 * this only flattens the parts the pickers, the AI and the review all read, so three call sites do not
 * each learn the shape of `CatalogEntity`.
 */
export function catalogView(snapshot: CatalogSnapshot | null): CatalogEntityView[] {
  if (!snapshot) return [];
  return Object.values(snapshot.entities)
    .map((entity) => viewOfEntity(entity))
    .sort((a, b) => a.name.localeCompare(b.name));
}

function viewOfEntity(entity: CatalogEntity): CatalogEntityView {
  return {
    ref: entity.id,
    name: text(entity.businessName) || entity.id,
    plural: text(entity.pluralName) || text(entity.businessName) || entity.id,
    description: entity.description,
    requiresFilter: entity.cost?.requiresFilter === true,
    measures: Object.values(entity.measures ?? {}).map((measure) => ({
      ref: measure.id,
      name: text(measure.businessName) || measure.id,
      allowedAggregations: measure.allowedAggregations,
      defaultAggregation: measure.defaultAggregation,
      format: measure.format,
      higherIsBetter: measure.higherIsBetter,
      description: measure.description,
    })),
    attributes: Object.values(entity.attributes).map((attribute) => ({
      ref: attribute.id,
      name: text(attribute.businessName) || attribute.id,
      groupable: attribute.groupable !== false,
      filterable: attribute.filterable !== false,
      isTemporal: TEMPORAL.has(attribute.dataType),
      format: attribute.format,
    })),
  };
}

export function entityIn(view: readonly CatalogEntityView[], ref: string): CatalogEntityView | undefined {
  return view.find((entity) => entity.ref === ref);
}

/** The catalog's name for what a bound widget shows — the business's word, not the model's. */
export function bindingTitle(view: readonly CatalogEntityView[], binding: WidgetBinding): string {
  const entity = entityIn(view, binding.entity);
  if (!entity) return binding.measure ?? binding.entity;
  const measure = entity.measures.find((candidate) => candidate.ref === binding.measure);
  const dimension = entity.attributes.find((candidate) => candidate.ref === binding.dimension);
  if (measure && dimension) return `${measure.name} by ${dimension.name}`;
  if (measure) return measure.name;
  if (dimension) return `${entity.plural} by ${dimension.name}`;
  return entity.plural;
}

// ── grounding ─────────────────────────────────────────────────────────────────────────

export interface BindingCheck {
  /** The binding with anything unsupported removed, or null when nothing is left of it. */
  binding: WidgetBinding | null;
  /** One line per correction, in the author's language. */
  problems: string[];
}

/**
 * Check a binding against the catalog the author actually has.
 *
 * Every arm of this is a mistake a model or a stale stored design can make, and every one of them
 * would otherwise surface as an empty widget with no explanation:
 *
 *   · an entity that is not in the projection — either it does not exist, or this author is not
 *     entitled to it, and the two are deliberately indistinguishable from here;
 *   · a measure or attribute that is not on that entity;
 *   · an aggregation the measure does not allow — `avg` on a count is the common one;
 *   · a dimension that is not groupable, which the gateway would reject.
 *
 * Corrections are preferred to rejections where one is obvious: an unsupported aggregation becomes the
 * measure's default rather than dropping the whole binding, because the author's intent was the
 * measure.
 */
export function checkBinding(
  binding: WidgetBinding,
  view: readonly CatalogEntityView[],
): BindingCheck {
  const problems: string[] = [];
  const entity = entityIn(view, binding.entity);
  if (!entity) {
    return {
      binding: null,
      problems: [
        `There is no "${binding.entity}" in your catalog — it either does not exist or you are not entitled to it.`,
      ],
    };
  }

  const next: WidgetBinding = { entity: entity.ref };

  if (binding.measure) {
    const measure = entity.measures.find((candidate) => candidate.ref === binding.measure);
    if (!measure) {
      problems.push(`${entity.name} has no measure called "${binding.measure}".`);
    } else {
      next.measure = measure.ref;
      const wanted = binding.aggregation ?? measure.defaultAggregation;
      if (measure.allowedAggregations.includes(wanted)) {
        next.aggregation = wanted;
      } else {
        next.aggregation = measure.defaultAggregation;
        problems.push(
          `${measure.name} cannot be aggregated with "${wanted}", so it uses ${measure.defaultAggregation}.`,
        );
      }
    }
  }

  if (binding.dimension) {
    const dimension = entity.attributes.find((candidate) => candidate.ref === binding.dimension);
    if (!dimension) {
      problems.push(`${entity.name} has no attribute called "${binding.dimension}".`);
    } else if (!dimension.groupable) {
      problems.push(`${dimension.name} cannot be grouped by, so the breakdown was dropped.`);
    } else {
      next.dimension = dimension.ref;
    }
  }

  if (binding.attributes?.length) {
    const kept = binding.attributes.filter((ref) =>
      entity.attributes.some((candidate) => candidate.ref === ref),
    );
    if (kept.length !== binding.attributes.length) {
      problems.push(`${binding.attributes.length - kept.length} column(s) are not on ${entity.name}.`);
    }
    if (kept.length) next.attributes = kept;
  }

  if (binding.filters?.length) {
    const kept = binding.filters.filter((filter) =>
      entity.attributes.some(
        (candidate) => candidate.ref === filter.attribute && candidate.filterable,
      ),
    );
    if (kept.length !== binding.filters.length) {
      problems.push(`${binding.filters.length - kept.length} filter(s) name something unfilterable.`);
    }
    if (kept.length) next.filters = kept;
  }

  if (binding.limit) next.limit = binding.limit;

  return { binding: next, problems };
}

// ── the query ─────────────────────────────────────────────────────────────────────────

/** Aliases the resolver reads back. Fixed, so nothing has to guess a column name. */
export const VALUE_ALIAS = 'value';
export const CATEGORY_ALIAS = 'category';

/**
 * The `DataSource` a binding becomes.
 *
 * The platform's contract, not a private one — the same shape the runtime renders, the validator
 * checks and the gateway costs. That is the whole reason this builder can have live data at all
 * without a second query layer: the query language already exists and is already enforced.
 */
export function sourceFor(widget: Widget, binding: WidgetBinding): DataSource | null {
  const shape = shapeOf(widget);
  const id = `pb-${widget.id}`;
  const filter = filterOf(binding);

  if (shape === 'figure') {
    if (!binding.measure) return null;
    return {
      id,
      entity: binding.entity,
      kind: 'aggregate',
      select: {
        measures: [
          { measure: binding.measure, aggregation: binding.aggregation, alias: VALUE_ALIAS },
        ],
      },
      ...(filter ? { filter } : {}),
    };
  }

  if (shape === 'series') {
    if (!binding.measure || !binding.dimension) return null;
    return {
      id,
      entity: binding.entity,
      kind: 'aggregate',
      select: {
        measures: [
          { measure: binding.measure, aggregation: binding.aggregation, alias: VALUE_ALIAS },
        ],
        dimensions: [
          { attribute: binding.dimension, alias: CATEGORY_ALIAS, limit: binding.limit ?? 8 },
        ],
      },
      ...(filter ? { filter } : {}),
      sort: [{ field: VALUE_ALIAS, direction: 'desc' }],
    };
  }

  if (shape === 'list') {
    const attributes = binding.attributes ?? [];
    if (!attributes.length) return null;
    return {
      id,
      entity: binding.entity,
      kind: 'list',
      select: {
        attributes: attributes.map((attribute) => ({ attribute, alias: attribute })),
      },
      ...(filter ? { filter } : {}),
      paging: { mode: 'offset', pageSize: binding.limit ?? 8 },
    };
  }

  return null;
}

function filterOf(binding: WidgetBinding): FilterNode | undefined {
  const filters = binding.filters ?? [];
  if (!filters.length) return undefined;
  // `target`, which is the contract's word: a clause can name an attribute, an alias or a traversal.
  const clauses: FilterClause[] = filters.map((filter) => ({
    target: filter.attribute,
    operator: filter.operator,
    value: filter.value,
  }));
  return clauses.length === 1 ? clauses[0]! : { all: clauses };
}
