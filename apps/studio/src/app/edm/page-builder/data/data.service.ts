/**
 * Resolving bindings to values, through the gateway the runtime uses.
 *
 * ── ONE GATEWAY, NOT A PREVIEW MODE ─────────────────────────────────────────────────────
 * The studio app already configures `GatewayService` with the same fixture tables and the same author
 * identity the Viewer uses, precisely so a builder shows what a reader will see. This service does not
 * add a second data path; it injects that one. What an author sees on this canvas is what the gateway
 * returned for *their* entitlements — including `denied` and `partial`, which are the states a preview
 * mode would have hidden and are the ones worth seeing at design time.
 *
 * ── EVERY STATUS IS SHOWN, INCLUDING THE UNHAPPY ONES ───────────────────────────────────
 * A widget whose query was denied says so on the canvas. A widget bound to an entity that requires a
 * filter and has none says that. The alternative — an empty chart — is indistinguishable from "there is
 * no data this week", and the two need completely different actions from the author.
 *
 * ── AND WHY THE CACHE KEY IS NOT MINE TO INVENT ─────────────────────────────────────────
 * `GatewayService` keys its cache on the source, the params and the caller's *resolved entitlement
 * scope*, and honours the TTL the gateway returned. This service asks and reads; it does not memoise on
 * top, because a second cache with a key of my own choosing is how rows cross users.
 */

import { Injectable, computed, inject, signal } from '@angular/core';
import type { DataRow, DataSource, FormatSpec, QueryStatus } from '@opus/contracts';
import { CatalogService } from '@opus/catalog';
import { GatewayService } from '@opus/data-client';
import { formatValue, type FormatContext } from '@opus/platform';

import { AUTHOR } from '../../../session';
import type { PageDef, Widget } from '../model';
import {
  CATEGORY_ALIAS,
  VALUE_ALIAS,
  catalogView,
  checkBinding,
  entityIn,
  shapeOf,
  sourceFor,
  type CatalogEntityView,
  type WidgetBinding,
} from './binding';

/** What a bound widget got back. Exactly one of these states, so a view cannot render a mixture. */
export interface Resolved {
  status: QueryStatus | 'unbound' | 'invalid';
  /** A figure, formatted by the catalog's own spec. */
  value?: string;
  /** A series, for a chart. */
  categories?: string[];
  series?: number[];
  /** A list, for a table. */
  columns?: string[];
  rows?: string[][];
  /** What went wrong, or what was corrected, in the author's language. */
  note?: string;
  /** Columns the caller is not entitled to, which is what makes a result `partial`. */
  denied?: readonly string[];
}

const FORMAT_CONTEXT: FormatContext = {
  locale: AUTHOR.locale,
  timezone: AUTHOR.timezone,
  // The reader's display currency, which the formatter needs to know whether a conversion happened.
  baseCurrency: 'USD',
};

@Injectable()
export class PageBuilderDataService {
  private readonly catalog = inject(CatalogService);
  private readonly gateway = inject(GatewayService);

  /** The author's entitlement-scoped projection, flattened for the pickers, the AI and the review. */
  readonly view = signal<CatalogEntityView[]>([]);
  readonly loaded = computed(() => this.view().length > 0);
  readonly transport = computed(() => this.gateway.transportLabel());
  readonly resolving = signal(false);

  /** widget id → what the gateway said. */
  readonly results = signal<ReadonlyMap<string, Resolved>>(new Map());

  /**
   * Read the catalog the app already loaded.
   *
   * Deliberately not a second load. `CatalogService` is a root singleton the studio app fills during
   * bootstrap, so this is a projection of state that already exists — and if bootstrap failed, `view()`
   * is empty and every binding control says the catalog is unavailable rather than silently offering an
   * empty list of entities.
   */
  refreshCatalog(): void {
    try {
      this.view.set(catalogView(this.catalog.projectionFor(AUTHOR)));
    } catch {
      // The catalog has not loaded. Not an error to report here: the panel that needs it says so.
      this.view.set([]);
    }
  }

  /**
   * Resolve every bound widget on a page, in one batch.
   *
   * One batch rather than one call per widget, because that is the unit the gateway audits and costs —
   * "the render" — and because five sequential round trips is how a canvas comes to feel slow.
   */
  async resolve(page: PageDef): Promise<void> {
    if (!this.gateway.configured()) return;
    const view = this.view();

    const sources: Record<string, DataSource> = {};
    const queries: { key: string; dataSourceId: string; params: Record<string, never> }[] = [];
    const next = new Map<string, Resolved>();

    for (const widget of page.widgets) {
      const binding = widget.binding as WidgetBinding | undefined;
      if (!binding) continue;

      const checked = checkBinding(binding, view);
      if (!checked.binding) {
        next.set(widget.id, { status: 'invalid', note: checked.problems.join(' ') });
        continue;
      }
      const source = sourceFor(widget, checked.binding);
      if (!source) {
        next.set(widget.id, {
          status: 'unbound',
          note: missingPart(widget, checked.binding),
        });
        continue;
      }
      // An entity the gateway will refuse unfiltered is refused *here*, with the reason, rather than
      // sent to be rejected — a costRejected result reads like a fault, and this is a design mistake.
      const entity = entityIn(view, checked.binding.entity);
      if (entity?.requiresFilter && !checked.binding.filters?.length) {
        next.set(widget.id, {
          status: 'invalid',
          note: `${entity.name} is too large to query unfiltered. Add a filter in the Data section.`,
        });
        continue;
      }

      sources[source.id] = source;
      queries.push({ key: widget.id, dataSourceId: source.id, params: {} });
      if (checked.problems.length) next.set(widget.id, { status: 'ok', note: checked.problems.join(' ') });
    }

    this.results.set(next);
    if (!queries.length) return;

    this.resolving.set(true);
    try {
      const response = await this.gateway.queryBatch(
        { context: { pageId: page.id, definitionVersion: 1 }, queries },
        sources,
      );
      const merged = new Map(next);
      for (const result of response.results) {
        const widget = page.widgets.find((candidate) => candidate.id === result.key);
        if (!widget) continue;
        merged.set(
          result.key,
          this.read(widget, result.status, result.rows, result.deniedFields, merged.get(result.key)?.note),
        );
      }
      this.results.set(merged);
    } catch (error) {
      const merged = new Map(next);
      for (const query of queries) {
        merged.set(query.key, {
          status: 'error',
          note: `The Data Gateway could not be reached: ${message(error)}`,
        });
      }
      this.results.set(merged);
    } finally {
      this.resolving.set(false);
    }
  }

  /** Turn rows into what a widget draws, using the catalog's format spec for every figure. */
  private read(
    widget: Widget,
    status: QueryStatus,
    rows: readonly DataRow[],
    denied: readonly string[] | undefined,
    note: string | undefined,
  ): Resolved {
    if (status !== 'ok' && status !== 'partial' && status !== 'empty') {
      return { status, note: note ?? explain(status), denied };
    }

    const binding = widget.binding as WidgetBinding;
    const entity = entityIn(this.view(), binding.entity);
    const measure = entity?.measures.find((candidate) => candidate.ref === binding.measure);
    const shape = shapeOf(widget);

    if (shape === 'figure') {
      const raw = rows[0]?.[VALUE_ALIAS];
      return {
        status,
        value: format(raw, measure?.format),
        note,
        denied,
      };
    }

    if (shape === 'series') {
      const categories = rows.map((row) => String(row[CATEGORY_ALIAS] ?? '—'));
      const series = rows.map((row) => Number(row[VALUE_ALIAS] ?? 0));
      return { status, categories, series, note, denied };
    }

    const columns = binding.attributes ?? [];
    return {
      status,
      columns: columns.map(
        (ref: string) => entity?.attributes.find((candidate) => candidate.ref === ref)?.name ?? ref,
      ),
      rows: rows.map((row) =>
        columns.map((ref: string) =>
          format(row[ref], entity?.attributes.find((candidate) => candidate.ref === ref)?.format),
        ),
      ),
      note,
      denied,
    };
  }
}

function format(value: unknown, spec: FormatSpec | undefined): string {
  return formatValue(value, spec, FORMAT_CONTEXT);
}

/** What a partly-built binding is still missing, said as the next thing to do. */
function missingPart(widget: Widget, binding: WidgetBinding): string {
  const shape = shapeOf(widget);
  if (shape === 'figure') return 'Pick a measure to show a figure.';
  if (shape === 'series') {
    return binding.measure ? 'Pick something to break it down by.' : 'Pick a measure to chart.';
  }
  return 'Pick the columns this table should show.';
}

/**
 * A gateway status, in the author's language.
 *
 * `denied` is the one that matters: it is not a fault and not an empty result, it is the platform
 * working — this author may not see those rows — and an author who reads "no data" instead will go
 * looking for a bug in their design.
 */
function explain(status: QueryStatus): string {
  switch (status) {
    case 'denied':
      return 'You are not entitled to this data, so a reader without your entitlements will see nothing here either.';
    case 'costRejected':
      return 'The gateway refused this query as too expensive. Add a filter or reduce the number of categories.';
    case 'error':
      return 'The gateway could not answer this query.';
    default:
      return '';
  }
}

function message(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
