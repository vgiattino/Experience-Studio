/**
 * Simulated model provider.
 *
 * WHAT THIS IS, AND WHAT IT IS NOT.
 *
 * It is not a canned response. It reasons over the *actual* grounding pack and the *actual*
 * component vocabulary that context assembly produced, so changing the catalog changes the
 * output, and asking for something else produces something else. That is the difference
 * between a simulation and a demo: this one can be wrong in the ways a real model is wrong,
 * which is what makes the validation cascade worth having.
 *
 * It is not a language model. It cannot handle paraphrase the retriever missed, it will not
 * infer intent from context the rules do not encode, and its titles come from the catalog
 * rather than from writing. Those are precisely the capabilities a real model adds, and the
 * reason the ModelProvider port exists.
 *
 * FAULT INJECTION. `faults` makes the provider produce the specific mistakes a real model
 * makes — an aggregation the measure disallows, a field that does not exist, a hallucinated
 * component type — so the validation cascade, the repair loop and the deterministic fallback
 * are exercised rather than merely asserted. Enabled from the UI, and used by the tests.
 */

import type { GroundedEntity, GroundingPack } from '@opus/catalog';

import type { ExtractedConcepts, PageIntent } from './intake';
import type { GenerationPlan, PlanWidget, WidgetFill } from './plan';
import {
  ModelProviderError,
  type ModelProvider,
  type ModelRequest,
  type ModelResponse,
} from './model-provider';
import type { TemplateMatch } from './templates';

export type SimulatedFault =
  /** Uses an aggregation the measure does not allow — the commonest real failure. */
  | 'invalidAggregation'
  /** Binds a field that no data source selects. */
  | 'unknownField'
  /** Names a component type that is not in the registry. */
  | 'unknownComponent'
  /** Emits a chart with no dimension, which cannot have an x axis. */
  | 'chartWithoutDimension'
  /** Fails outright, so the deterministic fallback is exercised. */
  | 'providerFailure';

export interface SimulationInput {
  concepts: ExtractedConcepts;
  pageIntent: PageIntent;
  grounding: GroundingPack;
  templateMatch: TemplateMatch;
  /** Component types the registry offers, so the provider cannot invent one by accident. */
  availableComponents: readonly string[];
  faults?: readonly SimulatedFault[];
}

const MAX_KPIS = 4;

export class SimulatedModelProvider implements ModelProvider {
  readonly id = 'simulated-rules';
  readonly version = '1.0.0';
  /** False: nothing leaves the browser. A real provider sets this true, which turns on the
   *  egress policy and the audit requirements in security-architecture.md §7. */
  readonly isExternal = false;

  /** Attempt counter, so a repair request can produce a corrected answer. */
  private attempts = new Map<string, number>();

  constructor(private input: SimulationInput) {}

  update(input: SimulationInput): void {
    this.input = input;
    this.attempts.clear();
  }

  async complete(request: ModelRequest): Promise<ModelResponse> {
    const startedAt = performance.now();
    const faults = this.input.faults ?? [];

    if (faults.includes('providerFailure') && request.purpose !== 'repair') {
      throw new ModelProviderError('Simulated provider outage', true, request.purpose);
    }

    // Latency, so the UI's pending state is real rather than theoretical.
    await new Promise((resolve) => setTimeout(resolve, request.purpose === 'plan' ? 320 : 90));

    const attempt = (this.attempts.get(request.purpose) ?? 0) + 1;
    this.attempts.set(request.purpose, attempt);

    let output: unknown;
    switch (request.purpose) {
      case 'plan':
        output = this.plan();
        break;
      case 'fill':
        output = this.fill(request, attempt);
        break;
      case 'repair':
        // A repair request carries the validation errors. The simulated provider corrects by
        // re-deriving without the injected fault — which is exactly what a real model does
        // when told precisely what was wrong.
        output = this.fill(request, attempt, true);
        break;
      default:
        throw new ModelProviderError(`Unsupported purpose ${request.purpose}`, false, request.purpose);
    }

    return {
      output,
      modelId: this.id,
      modelVersion: this.version,
      tokensIn: Math.ceil((request.system.length + request.user.length) / 4),
      tokensOut: Math.ceil(JSON.stringify(output).length / 4),
      durationMs: Math.round(performance.now() - startedAt),
      note: faults.length ? `faults injected: ${faults.join(', ')}` : undefined,
    };
  }

  // ── stage 1: the layout plan ─────────────────────────────────────────────────────

  private plan(): GenerationPlan {
    const { grounding, concepts, templateMatch } = this.input;
    const shape = templateMatch.template.shape;
    const faults = this.input.faults ?? [];

    const widgets: PlanWidget[] = [];

    if (shape.intro) {
      widgets.push({
        id: 'page-intro',
        kind: 'text',
        title: 'Summary',
        purpose: 'State what the page covers and the reporting date.',
      });
    }

    // ── KPIs: one per retrieved measure, ranked by how directly the prompt named it.
    const measures = rankMeasures(grounding, concepts).slice(0, Math.min(MAX_KPIS, shape.kpiCount[1]));

    for (const { entity, measure } of measures) {
      widgets.push({
        id: `kpi-${measure.ref}`,
        kind: 'kpi',
        title: measure.name,
        purpose: measure.description ?? `Headline figure for ${measure.name.toLowerCase()}.`,
        entityRef: entity.ref,
        measureRef: measure.ref,
        group: 'kpi-row',
      });
    }

    // ── chart: needs a measure and a groupable dimension. Trend prefers a date.
    if (shape.chart !== 'none') {
      const chart = chooseChart(grounding, concepts, shape.chart);
      if (chart) {
        /**
         * The title has to describe what is actually plotted. A chart split by status is not
         * narrowed to one status, so calling it "Late Files by Business Date" while it shows
         * every status would be a label contradicting its own content — the subject is the
         * entity, and the status is the split.
         */
        const subject = chart.series?.enumValues?.some((value) =>
          chart.measure.ref.toLowerCase().includes(value.toLowerCase()),
        )
          ? (chart.entity.plural ?? chart.entity.name)
          : chart.measure.name;

        widgets.push({
          id: 'trend',
          kind: 'chart',
          title: `${subject} by ${chart.dimension.name}`,
          purpose: `Show how ${subject.toLowerCase()} varies by ${chart.dimension.name.toLowerCase()}.`,
          entityRef: chart.entity.ref,
          measureRef: chart.measure.ref,
          dimensionRef: faults.includes('chartWithoutDimension') ? undefined : chart.dimension.ref,
          seriesRef: chart.series?.ref,
        });
      }
    }

    // ── tables: one per entity the prompt asked for records from.
    if (shape.tables > 0) {
      const tableEntities = chooseTableEntities(grounding, concepts, shape.tables);
      for (const entity of tableEntities) {
        widgets.push({
          id: `queue-${shortRef(entity.ref)}`,
          kind: 'table',
          title: entity.plural ?? entity.name,
          purpose: `List individual ${(entity.plural ?? entity.name).toLowerCase()} for review.`,
          entityRef: entity.ref,
          attributeRefs: chooseColumns(entity),
        });
      }
    }

    return {
      pageName: derivePageName(grounding, concepts),
      pageDescription: describePage(widgets),
      introSentence: 'Reporting for {asOf}.',
      templateId: templateMatch.template.id,
      widgets,
    };
  }

  // ── stage 2: fill one widget ─────────────────────────────────────────────────────

  private fill(request: ModelRequest, attempt: number, isRepair = false): WidgetFill {
    // The widget being filled is named in the request body, so a real provider receives the
    // same focused context: one widget, and only the grounding it needs.
    const match = /^WIDGET:(\S+)$/m.exec(request.user);
    const widgetId = match?.[1];
    const plan = this.plan();
    const widget = plan.widgets.find((w) => w.id === widgetId);
    if (!widget) {
      throw new ModelProviderError(`No planned widget named ${widgetId}`, false, request.purpose);
    }

    const faults = isRepair ? [] : (this.input.faults ?? []);
    const entity = this.input.grounding.entities.find((e) => e.ref === widget.entityRef);

    const componentType = ((): string => {
      if (faults.includes('unknownComponent') && widget.kind === 'kpi') {
        return 'analytics.gauge-dial';
      }
      switch (widget.kind) {
        case 'kpi':
          return 'analytics.kpi-card';
        case 'chart':
          return 'analytics.chart';
        case 'table':
          return 'data.table';
        case 'text':
          return 'content.text';
      }
    })();

    if (!this.input.availableComponents.includes(componentType) && !faults.length) {
      throw new ModelProviderError(
        `Component ${componentType} is not in the vocabulary`,
        false,
        request.purpose,
      );
    }

    const filters = entity ? this.filtersFor(widget, entity) : [];

    const measure = entity?.measures.find((m) => m.ref === widget.measureRef);

    const fill: WidgetFill = {
      widgetId: widget.id,
      componentType,
      config: {},
      filters,
      useThresholds: widget.kind === 'kpi',
      ...(measure
        ? {
            aggregation: faults.includes('invalidAggregation')
              ? invalidAggregationFor(measure.allowedAggregations)
              : measure.defaultAggregation,
          }
        : {}),
    };

    if (widget.kind === 'table') {
      fill.pageSize = 50;
      const sortable = entity?.attributes.find((a) => a.isTemporal);
      if (sortable) fill.sort = [{ attributeRef: sortable.ref, direction: 'desc' }];
      if (faults.includes('unknownField')) {
        fill.sort = [{ attributeRef: 'nonexistent-column', direction: 'desc' }];
      }
    }

    void attempt;
    return fill;
  }

  /**
   * Filters. Two rules that keep the generated page correct rather than merely plausible:
   * an entity marked REQUIRES A FILTER always gets one, and a status-like attribute is
   * narrowed to its "open" values rather than showing resolved records in a work queue.
   */
  private filtersFor(widget: PlanWidget, entity: GroundedEntity) {
    const filters: WidgetFill['filters'] = [];
    const { concepts } = this.input;

    const businessDate = entity.attributes.find(
      (a) => a.isTemporal && /business.?date/.test(a.ref) && a.filterable,
    );
    const detected = entity.attributes.find(
      (a) => a.isTemporal && !/business.?date/.test(a.ref) && a.filterable,
    );

    // A CHART OVER TIME NEEDS MORE THAN ONE POINT, whatever the prompt's timeframe says.
    // "Today's processing status" as a figure means today; as a trend it means the run-up to
    // today, and reading it literally produced a bar chart with a single bar. The window is
    // the reading a person would give the request, so it is the reading to generate.
    const trendAxis = widget.kind === 'chart' && widget.dimensionRef
      ? entity.attributes.find((a) => a.ref === widget.dimensionRef && a.isTemporal && a.filterable)
      : undefined;

    if (trendAxis) {
      filters.push({ attributeRef: trendAxis.ref, operator: 'inLast', value: 14, unit: 'day' });
    } else if (concepts.timeframe === 'today') {
      if (businessDate) {
        filters.push({ attributeRef: businessDate.ref, operator: 'eq', valueFrom: 'asOfParameter' });
      } else if (detected) {
        // Applies to a table as much as a figure: "new securities today" in a record list
        // means today's, and an unfiltered list is both wrong and a full scan.
        filters.push({ attributeRef: detected.ref, operator: 'onOrAfterToday', valueFrom: 'today' });
      }
    } else if (typeof concepts.timeframe === 'object' && detected) {
      filters.push({
        attributeRef: detected.ref,
        operator: 'inLast',
        value: concepts.timeframe.count,
        unit: concepts.timeframe.unit,
      });
    } else if (widget.kind === 'chart' && detected) {
      // A trend with no stated window would plot the entire history.
      filters.push({ attributeRef: detected.ref, operator: 'inLast', value: 14, unit: 'day' });
    } else if (businessDate) {
      filters.push({ attributeRef: businessDate.ref, operator: 'eq', valueFrom: 'asOfParameter' });
    }

    const status = entity.attributes.find(
      (a) => a.enumValues?.length && /status/.test(a.ref) && a.filterable,
    );
    if (status?.enumValues) {
      /**
       * A MEASURE'S NAME NARROWS ITS OWN STATUS. `late-file-count` and `failed-file-count` are
       * distinct measures over the same rows, and neither carries a predicate the mock gateway
       * can execute, so counting both over the same "unresolved" filter made them show the
       * identical number — two figures on one page contradicting their own labels.
       *
       * Matching the measure's name against the status enum values recovers the distinction
       * from the catalog rather than from a hardcoded rule, which is exactly the inference a
       * real model makes from the measure name and its description.
       */
      const named = status.enumValues.filter((value) =>
        widget.measureRef?.toLowerCase().includes(value.toLowerCase()),
      );
      const open = status.enumValues.filter((v) => /open|progress|await|late|fail/i.test(v));
      const chosen = named.length ? named : open;

      // Narrowing the very attribute a chart splits on collapses the comparison the split
      // exists to draw — one series, and a legend with a single entry.
      const isChartAxis =
        widget.kind === 'chart' &&
        (widget.seriesRef === status.ref || widget.dimensionRef === status.ref);

      if (chosen.length && chosen.length < status.enumValues.length && !isChartAxis) {
        filters.push({ attributeRef: status.ref, operator: 'in', value: chosen });
      }
    }

    // A severity-like attribute becomes a shared filter channel, so a chart click can
    // narrow the whole page.
    const severity = entity.attributes.find(
      (a) => a.enumValues?.length && /severity/.test(a.ref) && a.filterable,
    );
    if (severity) {
      filters.push({ attributeRef: severity.ref, operator: 'in', valueFrom: 'severityFilter' });
    }

    // An entity the catalog marks REQUIRES A FILTER must receive one that always constrains,
    // or level-3 validation rejects the page. A date is the better choice — it is what an
    // operational question means anyway — and an enum over its full value set is the fallback,
    // because it bounds the scan without hiding anything the reader expected to see.
    if (entity.requiresFilter && !filters.length) {
      const temporal = entity.attributes.find((a) => a.isTemporal && a.filterable);
      const enumAttribute = entity.attributes.find((a) => a.enumValues?.length && a.filterable);
      if (temporal) {
        filters.push({ attributeRef: temporal.ref, operator: 'onOrAfterToday', valueFrom: 'today' });
      } else if (enumAttribute?.enumValues?.length) {
        filters.push({
          attributeRef: enumAttribute.ref,
          operator: 'in',
          value: enumAttribute.enumValues,
        });
      }
    }

    return filters;
  }
}

// ── decision helpers: the provider's "reasoning", made inspectable ──────────────────

interface RankedMeasure {
  entity: GroundedEntity;
  measure: GroundedEntity['measures'][number];
  score: number;
}

/**
 * Whether an entity is in the pack ONLY because expansion pulled it in.
 *
 * `retrievedVia` is the set of strategies that contributed, so an entity the prompt named
 * directly *and* that expansion also reached carries both 'lexical' and 'graph'. Testing for
 * the presence of 'graph' therefore demoted entities the user asked for by name — and the
 * symptom was concrete: a request naming "exceptions" produced a page with no exceptions on
 * it, while showing a "Rows Processed" figure nobody asked for. Only a sole 'graph' origin
 * means inferred.
 */
function reachedOnlyByGraph(entity: GroundedEntity): boolean {
  return entity.retrievedVia.length > 0 && entity.retrievedVia.every((via) => via === 'graph');
}

export function rankMeasures(
  grounding: GroundingPack,
  concepts: ExtractedConcepts,
): RankedMeasure[] {
  const terms = concepts.terms.map((t) => t.toLowerCase());
  const ranked: RankedMeasure[] = [];

  for (const entity of grounding.entities) {
    for (const measure of entity.measures) {
      const haystack = `${measure.ref} ${measure.name}`.toLowerCase();
      let score = 0;
      for (const term of terms) {
        if (haystack.includes(term)) score += 2;
        else if (term.length > 4 && haystack.includes(term.slice(0, term.length - 1))) score += 1;
      }
      // A count measure is the natural headline figure for an operational question.
      if (measure.allowedAggregations.includes('count')) score += 0.5;
      if (measure.higherIsBetter !== undefined) score += 0.25;
      if (score > 0) ranked.push({ entity, measure, score });
    }
  }

  // Entities the prompt named directly rank above ones reached only by graph expansion.
  return ranked.sort((a, b) => {
    const viaA = reachedOnlyByGraph(a.entity) ? 0 : 1;
    const viaB = reachedOnlyByGraph(b.entity) ? 0 : 1;
    if (viaA !== viaB) return viaB - viaA;
    return b.score - a.score;
  });
}

function chooseChart(
  grounding: GroundingPack,
  concepts: ExtractedConcepts,
  kind: 'trend' | 'breakdown',
): {
  entity: GroundedEntity;
  measure: GroundedEntity['measures'][number];
  dimension: GroundedEntity['attributes'][number];
  series?: GroundedEntity['attributes'][number];
} | null {
  for (const { entity, measure } of rankMeasures(grounding, concepts)) {
    const dimension =
      kind === 'trend'
        ? entity.attributes.find((a) => a.isTemporal && a.groupable)
        : entity.attributes.find((a) => a.groupable && !a.isTemporal && !a.isKey);
    if (!dimension) continue;

    // A series split needs a second groupable attribute with few values, or the chart
    // becomes unreadable.
    const series = entity.attributes.find(
      (a) =>
        a.ref !== dimension.ref &&
        a.groupable &&
        !a.isKey &&
        (a.enumValues?.length ?? 99) <= 5,
    );
    return { entity, measure, dimension, series };
  }
  return null;
}

function chooseTableEntities(
  grounding: GroundingPack,
  concepts: ExtractedConcepts,
  limit: number,
): GroundedEntity[] {
  const terms = concepts.terms.map((t) => t.toLowerCase());
  return [...grounding.entities]
    .map((entity) => {
      const haystack = `${entity.ref} ${entity.name} ${entity.plural ?? ''}`.toLowerCase();
      const score = terms.reduce((sum, term) => sum + (haystack.includes(term) ? 2 : 0), 0);
      return { entity, score: score + (reachedOnlyByGraph(entity) ? -1 : 0) };
    })
    .filter((e) => e.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit)
    .map((e) => e.entity);
}

/** Columns a reader needs: an identifier, the label, then status-like and temporal fields. */
function chooseColumns(entity: GroundedEntity): string[] {
  const picked: string[] = [];
  const add = (ref: string | undefined) => {
    if (ref && !picked.includes(ref)) picked.push(ref);
  };

  add(entity.labelAttribute);
  for (const a of entity.attributes) {
    if (a.semanticType && /isin|sedol|cusip|lei/.test(a.semanticType)) add(a.ref);
  }
  for (const a of entity.attributes) if (a.enumValues?.length) add(a.ref);
  for (const a of entity.attributes) if (a.isTemporal) add(a.ref);
  for (const a of entity.attributes) {
    if (picked.length >= 7) break;
    if (!a.isKey) add(a.ref);
  }
  return picked.slice(0, 7);
}

function derivePageName(grounding: GroundingPack, concepts: ExtractedConcepts): string {
  const named = grounding.entities.filter((e) => !reachedOnlyByGraph(e));
  const subject = named[0];
  const isToday = concepts.timeframe === 'today';
  if (!subject) return 'Generated Dashboard';
  const base = subject.plural ?? subject.name;
  return isToday ? `${base} — Today` : `${base} Overview`;
}

function describePage(widgets: readonly PlanWidget[]): string {
  const counts = widgets.reduce<Record<string, number>>((acc, w) => {
    acc[w.kind] = (acc[w.kind] ?? 0) + 1;
    return acc;
  }, {});
  const parts: string[] = [];
  if (counts['kpi']) parts.push(`${counts['kpi']} headline figure${counts['kpi'] > 1 ? 's' : ''}`);
  if (counts['chart']) parts.push('a trend chart');
  if (counts['table']) parts.push(`${counts['table']} record table${counts['table'] > 1 ? 's' : ''}`);
  return parts.length ? `Generated page with ${parts.join(', ')}.` : 'Generated page.';
}

function invalidAggregationFor(allowed: readonly string[]): string {
  const candidates = ['sum', 'avg', 'stddev', 'p99', 'median'];
  return candidates.find((c) => !allowed.includes(c)) ?? 'stddev';
}

function shortRef(ref: string): string {
  return ref.split('.').pop() ?? ref;
}
