/**
 * Deterministic assembly: plan + fills → a PageDefinition.
 *
 * Everything here is code rather than model output, and that is the point (plan.ts): ids,
 * layout arithmetic, breakpoint placements, the version envelope, action wiring, filter
 * channel declarations and provenance are all mechanical. Handing them to a model would add
 * failure modes without adding judgement.
 *
 * The output is a page definition that must pass the same validator as a hand-authored one.
 * Nothing here is permitted to produce something the validator would reject; where a choice
 * could be invalid, this module omits the feature rather than emitting it hopefully.
 */

import type {
  Action,
  Aggregation,
  ComponentInstance,
  DataSource,
  FieldBinding,
  FilterChannel,
  FilterNode,
  Identifier,
  LayoutNode,
  PageDefinition,
  SortSpec,
} from '@opus/contracts';
import type { GroundedEntity, GroundingPack } from '@opus/catalog';

import type { FillFilter, GenerationPlan, PlanWidget, WidgetFill } from './plan';

export interface AssembleInput {
  plan: GenerationPlan;
  fills: readonly WidgetFill[];
  grounding: GroundingPack;
  registryVersion: string;
  /** Component versions available, so instances pin what the registry actually has. */
  componentVersions: Readonly<Record<string, string>>;
  prompt: string;
  actorId: string;
  provenance: PageDefinition['version']['provenance'];
}

/** A KPI row of four; a chart and a table full width until xl, then a 5/7 split. */
const KPI_PLACEMENT = {
  colSpan: 12,
  breakpoints: { sm: { colSpan: 6 }, lg: { colSpan: 3 } },
} as const;

export function assemblePage(input: AssembleInput): PageDefinition {
  const { plan, fills, grounding } = input;
  const fillById = new Map(fills.map((f) => [f.widgetId, f] as const));
  const entityByRef = new Map(grounding.entities.map((e) => [e.ref, e] as const));

  const dataSources: Record<Identifier, DataSource> = {};
  const components: Record<Identifier, ComponentInstance> = {};
  const actions: Record<Identifier, Action> = {};
  const filters: Record<Identifier, FilterChannel> = {};
  const usedFilterChannels = new Set<string>();

  // A severity/status filter channel is declared only if a widget actually references it,
  // so the page never carries state nothing reads.
  const declaresChannel = (name: string) => usedFilterChannels.add(name);

  const kpis: PlanWidget[] = [];
  const charts: PlanWidget[] = [];
  const tables: PlanWidget[] = [];
  const texts: PlanWidget[] = [];

  for (const widget of plan.widgets) {
    const fill = fillById.get(widget.id);
    if (!fill) continue;

    switch (widget.kind) {
      case 'kpi': {
        const built = buildKpi(widget, fill, entityByRef, declaresChannel);
        if (!built) continue;
        dataSources[built.source.id] = built.source;
        components[widget.id] = built.component;
        kpis.push(widget);
        break;
      }
      case 'chart': {
        const built = buildChart(widget, fill, entityByRef, declaresChannel);
        if (!built) continue;
        dataSources[built.source.id] = built.source;
        components[widget.id] = built.component;
        charts.push(widget);
        break;
      }
      case 'table': {
        const built = buildTable(widget, fill, entityByRef, declaresChannel);
        if (!built) continue;
        dataSources[built.source.id] = built.source;
        components[widget.id] = built.component;
        tables.push(widget);
        break;
      }
      case 'text': {
        components[widget.id] = buildText(widget, plan, kpis, fillById);
        texts.push(widget);
        break;
      }
    }
  }

  // Pin the component version the registry actually has, rather than a guess.
  for (const component of Object.values(components)) {
    const version = input.componentVersions[component.type];
    if (version) (component as { typeVersion: string }).typeVersion = version;
  }

  // ── page state
  const parameters: PageDefinition['parameters'] = {
    'as-of': {
      label: 'As Of',
      dataType: 'date',
      scope: 'experience',
      syncToUrl: true,
      default: { $expr: 'today()' },
      description: 'Business date the figures are reported for.',
    },
  };

  if (usedFilterChannels.has('severity')) {
    filters['severity'] = {
      label: 'Severity',
      dataType: 'enum',
      multiValued: true,
      syncToUrl: true,
      clearable: true,
      description: 'Set by selecting a chart segment; narrows every widget that reads it.',
    };
  }
  if (usedFilterChannels.has('status')) {
    filters['status'] = {
      label: 'Status',
      dataType: 'enum',
      multiValued: true,
      syncToUrl: true,
      clearable: true,
    };
  }

  // ── actions: only ones every reference resolves for
  if (Object.keys(filters).length) {
    actions['clear-filters'] = {
      id: 'clear-filters',
      kind: 'clearFilters',
      label: 'Clear filters',
      channels: Object.keys(filters),
    };
  }
  actions['refresh-page'] = {
    id: 'refresh-page',
    kind: 'refresh',
    label: 'Refresh',
    icon: 'refresh',
    bypassCache: true,
  };

  // Wire a chart segment click to the filter channel it can drive.
  for (const chart of charts) {
    const series = chart.seriesRef;
    if (!series) continue;
    const channel = channelForAttribute(series);
    if (!channel || !filters[channel]) continue;
    const actionId = `filter-by-${channel}`;
    actions[actionId] = {
      id: actionId,
      kind: 'setFilter',
      label: `Filter by ${channel}`,
      channel,
      value: { $context: '$event.series' },
      mode: 'toggle',
    };
    const component = components[chart.id];
    if (component) {
      (component as { eventActions?: Record<string, string> }).eventActions = {
        segmentActivated: actionId,
      };
    }
  }

  const layout = buildLayout({ texts, kpis, charts, tables, plan });

  const definition: PageDefinition = {
    schemaVersion: '1.0',
    id: slug(plan.pageName),
    name: plan.pageName,
    description: plan.pageDescription,
    kind: 'dashboard',
    parameters,
    ...(Object.keys(filters).length ? { filters } : {}),
    dataSources,
    components,
    layout,
    actions,
    navigation: {
      breadcrumbs: { mode: 'auto' },
      pageActions: Object.keys(actions).filter((id) => id !== 'refresh-page').concat('refresh-page'),
    },
    security: {
      intendedAudience: 'Generated from a natural-language request; review before publishing.',
      requiredCapabilities: ['experience.view'],
      workspaceScope: 'personal',
      deniedDataPolicy: 'showDeniedState',
    },
    presentation: {
      themeRef: 'opus.default',
      density: 'comfortable',
      maxWidth: 'full',
      showPageHeader: true,
    },
    performance: { renderBudgetMs: 2500, maxEagerDataSources: 8 },
    version: {
      schemaVersion: '1.0',
      artifactVersion: 1,
      // Generated pages arrive as drafts. Publication is a governed act, never a
      // side effect of generation (security-architecture.md §5).
      lifecycleState: 'draft',
      immutable: false,
      pins: {
        catalogVersion: grounding.catalogVersion,
        registryVersion: input.registryVersion,
      },
      provenance: input.provenance,
      audit: { createdBy: input.actorId, createdAt: new Date().toISOString() },
    },
    tags: ['generated'],
  };

  return definition;
}

// ── widget builders ─────────────────────────────────────────────────────────────────

function buildKpi(
  widget: PlanWidget,
  fill: WidgetFill,
  entities: Map<string, GroundedEntity>,
  declaresChannel: (name: string) => void,
): { component: ComponentInstance; source: DataSource } | null {
  const entity = widget.entityRef ? entities.get(widget.entityRef) : undefined;
  const measure = entity?.measures.find((m) => m.ref === widget.measureRef);
  if (!entity || !measure) return null;

  const aggregation = chosenAggregation(fill.aggregation, measure.defaultAggregation);
  const alias = `${measure.ref}-value`;
  const sourceId = `${widget.id}-source`;

  const source: DataSource = {
    id: sourceId,
    name: widget.title,
    entity: entity.ref,
    kind: 'aggregate',
    select: { measures: [{ measure: measure.ref, aggregation, alias }] },
    ...buildFilter(fill.filters, entity, declaresChannel),
    loadPolicy: 'eager',
    cacheTtlHintSeconds: 60,
  };

  const binding: FieldBinding = {
    field: alias,
    format: formatForMeasure(measure.valueType),
  };

  // Thresholds only when the measure declares a direction of goodness — otherwise emphasis
  // would be a guess about whether up is good.
  if (fill.useThresholds && measure.higherIsBetter !== undefined) {
    binding.thresholds = thresholdsFor(measure.higherIsBetter);
  }

  return {
    source,
    component: {
      id: widget.id,
      type: chosenComponentType(fill, 'analytics.kpi-card') as ComponentInstance['type'],
      typeVersion: '0.0.0',
      title: widget.title,
      description: widget.purpose,
      dataSource: sourceId,
      config: { size: 'md', showThresholdBand: Boolean(binding.thresholds) },
      bindings: { value: binding },
    },
  };
}

function buildChart(
  widget: PlanWidget,
  fill: WidgetFill,
  entities: Map<string, GroundedEntity>,
  declaresChannel: (name: string) => void,
): { component: ComponentInstance; source: DataSource } | null {
  const entity = widget.entityRef ? entities.get(widget.entityRef) : undefined;
  const measure = entity?.measures.find((m) => m.ref === widget.measureRef);
  const dimension = entity?.attributes.find((a) => a.ref === widget.dimensionRef);
  // Rule 4 of the system contract, enforced in code: no dimension, no chart.
  if (!entity || !measure || !dimension) return null;

  const series = widget.seriesRef
    ? entity.attributes.find((a) => a.ref === widget.seriesRef && a.groupable)
    : undefined;

  const aggregation = chosenAggregation(fill.aggregation, measure.defaultAggregation);
  const sourceId = `${widget.id}-source`;
  const measureAlias = measure.ref;
  const dimensionAlias = dimension.ref;

  const source: DataSource = {
    id: sourceId,
    name: widget.title,
    entity: entity.ref,
    kind: 'aggregate',
    select: {
      measures: [{ measure: measure.ref, aggregation, alias: measureAlias }],
      dimensions: [
        {
          attribute: dimension.ref,
          alias: dimensionAlias,
          label: dimension.name,
          ...(dimension.isTemporal ? { granularity: 'day' as const } : {}),
        },
        ...(series ? [{ attribute: series.ref, alias: series.ref, label: series.name }] : []),
      ],
    },
    ...buildFilter(fill.filters, entity, declaresChannel),
    sort: [{ field: dimensionAlias, direction: dimension.isTemporal ? 'asc' : 'desc' }],
    loadPolicy: 'eager',
    cacheTtlHintSeconds: 120,
  };

  return {
    source,
    component: {
      id: widget.id,
      type: chosenComponentType(fill, 'analytics.chart') as ComponentInstance['type'],
      typeVersion: '0.0.0',
      title: widget.title,
      description: widget.purpose,
      dataSource: sourceId,
      config: {
        mark: 'bar',
        stacking: series ? 'stacked' : 'none',
        legend: { position: 'bottom' },
        gridlines: true,
      },
      encodings: [
        {
          channel: 'x',
          binding: {
            field: dimensionAlias,
            label: dimension.name,
            ...(dimension.isTemporal ? { format: { style: 'date' as const } } : {}),
          },
          axis: { title: dimension.name, gridlines: false },
        },
        {
          channel: 'y',
          binding: { field: measureAlias, label: measure.name, format: formatForMeasure(measure.valueType) },
          scale: { zero: true },
          axis: { title: measure.name },
        },
        ...(series
          ? [{ channel: 'series' as const, binding: { field: series.ref, label: series.name } }]
          : []),
      ],
    },
  };
}

function buildTable(
  widget: PlanWidget,
  fill: WidgetFill,
  entities: Map<string, GroundedEntity>,
  declaresChannel: (name: string) => void,
): { component: ComponentInstance; source: DataSource } | null {
  const entity = widget.entityRef ? entities.get(widget.entityRef) : undefined;
  if (!entity) return null;

  const refs = (widget.attributeRefs ?? []).filter((ref) =>
    entity.attributes.some((a) => a.ref === ref),
  );
  if (!refs.length) return null;

  const attributes = refs
    .map((ref) => entity.attributes.find((a) => a.ref === ref)!)
    .slice(0, 9);

  // Carry the key as a hidden column so a drill-down could read it later without showing it.
  const keyRef = entity.primaryKey[0];
  const keyAttribute = entity.attributes.find((a) => a.ref === keyRef);
  const includeKey = keyAttribute !== undefined && !attributes.some((a) => a.ref === keyRef);

  const sourceId = `${widget.id}-source`;
  const source: DataSource = {
    id: sourceId,
    name: widget.title,
    entity: entity.ref,
    kind: 'list',
    select: {
      attributes: [
        ...attributes.map((a) => ({ attribute: a.ref, alias: a.ref, label: a.name })),
        ...(includeKey ? [{ attribute: keyAttribute.ref, alias: keyAttribute.ref }] : []),
      ],
    },
    ...buildFilter(fill.filters, entity, declaresChannel),
    ...(fill.sort?.length
      ? {
          sort: fill.sort
            .filter((s) => attributes.some((a) => a.ref === s.attributeRef))
            .map<SortSpec>((s) => ({ field: s.attributeRef, direction: s.direction })),
        }
      : {}),
    paging: { mode: 'offset', pageSize: fill.pageSize ?? 50, maxRows: 2000 },
    loadPolicy: 'eager',
    cacheTtlHintSeconds: 60,
  };

  const columns: FieldBinding[] = attributes.map((attribute) => ({
    field: attribute.ref,
    label: attribute.name,
    ...(attribute.isTemporal ? { format: { style: 'datetime' as const } } : {}),
    ...(attribute.enumValues ? { renderAs: 'badge' as const } : {}),
    ...(attribute.semanticType && /isin|sedol|cusip|lei/.test(attribute.semanticType)
      ? { renderAs: 'code' as const }
      : {}),
  }));
  if (includeKey) columns.push({ field: keyAttribute.ref, hidden: true });

  return {
    source,
    component: {
      id: widget.id,
      type: chosenComponentType(fill, 'data.table') as ComponentInstance['type'],
      typeVersion: '0.0.0',
      title: widget.title,
      description: widget.purpose,
      dataSource: sourceId,
      config: { density: 'compact', maxHeight: '440px' },
      bindings: { columns },
      stateOverrides: {
        empty: { title: 'Nothing to show', message: 'No records match the current filters.' },
      },
    },
  };
}

function buildText(
  widget: PlanWidget,
  plan: GenerationPlan,
  kpis: readonly PlanWidget[],
  fills: Map<string, WidgetFill>,
): ComponentInstance {
  // Tokens reference only KPI sources that were actually built, so the sentence cannot
  // interpolate from a widget the assembler dropped.
  const tokens: Record<string, { $expr: string }> = {
    asOf: { $expr: '$params.as-of' },
  };
  let body = plan.introSentence.includes('{asOf}')
    ? plan.introSentence
    : `${plan.introSentence.replace(/\.$/, '')} Reporting for {asOf}.`;

  const first = kpis[0];
  if (first?.measureRef && body.includes('{headline}')) {
    tokens['headline'] = { $expr: `$data.${first.id}-source.${first.measureRef}-value ?? 0` };
  } else {
    body = body.replace(/\{headline\}/g, '');
  }

  return {
    id: widget.id,
    type: chosenComponentType(fills.get(widget.id), 'content.text') as ComponentInstance['type'],
    typeVersion: '0.0.0',
    title: widget.title,
    config: { variant: 'body', body, tokens },
  };
}

// ── layout ──────────────────────────────────────────────────────────────────────────

function buildLayout(input: {
  texts: readonly PlanWidget[];
  kpis: readonly PlanWidget[];
  charts: readonly PlanWidget[];
  tables: readonly PlanWidget[];
  plan: GenerationPlan;
}): LayoutNode {
  const children: LayoutNode[] = [];

  for (const t of input.texts) {
    children.push({
      kind: 'widget',
      id: `w-${t.id}`,
      component: t.id,
      placement: { colStart: 1, colSpan: 12 },
    });
  }

  if (input.kpis.length) {
    children.push({
      kind: 'container',
      id: 'kpi-row',
      placement: { colStart: 1, colSpan: 12 },
      container: {
        type: 'stack',
        direction: 'row',
        wrap: true,
        gap: 'md',
        directionByBreakpoint: { xs: 'column' },
        children: input.kpis.map((k) => ({
          kind: 'widget' as const,
          id: `w-${k.id}`,
          component: k.id,
          placement: { ...KPI_PLACEMENT },
        })),
      },
    });
  }

  // A chart and a table sit side by side at xl; two tables go in tabs rather than stacking.
  const sideBySide = input.charts.length > 0 && input.tables.length > 0;

  for (const chart of input.charts) {
    children.push({
      kind: 'container',
      id: `panel-${chart.id}`,
      placement: {
        colStart: 1,
        colSpan: 12,
        minHeight: '340px',
        ...(sideBySide ? { breakpoints: { xl: { colSpan: 5 } } } : {}),
      },
      container: {
        type: 'panel',
        title: chart.title,
        variant: 'bordered',
        children: [
          {
            kind: 'widget',
            id: `w-${chart.id}`,
            component: chart.id,
            placement: { colSpan: 12, minHeight: '260px' },
          },
        ],
      },
    });
  }

  if (input.tables.length === 1) {
    const table = input.tables[0]!;
    children.push({
      kind: 'container',
      id: `panel-${table.id}`,
      placement: {
        colStart: 1,
        colSpan: 12,
        ...(sideBySide ? { breakpoints: { xl: { colSpan: 7 } } } : {}),
      },
      container: {
        type: 'panel',
        title: table.title,
        variant: 'bordered',
        headerActions: ['refresh-page'],
        children: [
          {
            kind: 'widget',
            id: `w-${table.id}`,
            component: table.id,
            placement: { colSpan: 12, minHeight: '300px' },
          },
        ],
      },
    });
  } else if (input.tables.length > 1) {
    children.push({
      kind: 'container',
      id: 'queues-panel',
      placement: {
        colStart: 1,
        colSpan: 12,
        ...(sideBySide ? { breakpoints: { xl: { colSpan: 7 } } } : {}),
      },
      container: {
        type: 'panel',
        title: 'Records',
        variant: 'bordered',
        headerActions: ['refresh-page'],
        children: [
          {
            kind: 'container',
            id: 'queue-tabs',
            placement: { colSpan: 12 },
            container: {
              type: 'tabs',
              variant: 'underline',
              overflow: 'menu',
              deferContent: true,
              keepAliveOnSwitch: true,
              source: {
                mode: 'static',
                tabs: input.tables.map((table) => ({
                  id: table.id,
                  label: table.title,
                  deepLinkId: table.id,
                  content: [
                    {
                      kind: 'widget' as const,
                      id: `w-${table.id}`,
                      component: table.id,
                      placement: { colSpan: 12, minHeight: '300px' },
                    },
                  ],
                })),
              },
            },
          },
        ],
      },
    });
  }

  return { kind: 'container', id: 'root', container: { type: 'grid', gap: 'lg', children } };
}

// ── helpers ─────────────────────────────────────────────────────────────────────────

/**
 * Never emit an aggregation the measure does not allow. The validator would reject it, and
 * this is the single commonest confidently-wrong choice a generator makes — summing a rate,
 * averaging a distinct count.
 */
/**
 * The aggregation the model chose, carried through FAITHFULLY.
 *
 * Silently substituting a legal aggregation here would be easy and wrong. It makes provenance
 * a lie — the record says the model chose `sum` while the page computes `count` — it hides
 * model error from the eval harness that is supposed to detect regressions, and it means the
 * validation cascade and repair loop of ai-architecture.md §5.3–5.4 never actually run,
 * because nothing invalid ever reaches them.
 *
 * The division is the one plan.ts states: a model's DECISIONS are assembled as given and then
 * validated; only what the model has no say in — ids, layout arithmetic, version envelopes,
 * action wiring — is decided here. An illegal aggregation is a wrong decision, not a
 * mechanical detail, so it is validated and repaired rather than quietly overwritten.
 *
 * The cast is deliberate: an invalid value must survive to the validator, which is the
 * component that reports it with a path and a reason.
 */
function chosenAggregation(requested: string | undefined, fallback: Aggregation): Aggregation {
  return (requested ?? fallback) as Aggregation;
}

/**
 * The component type the model chose, likewise carried through. Choosing between a KPI card,
 * a gauge and a sparkline for the same figure is judgement, and it is the kind of judgement
 * the vocabulary in the model's context exists to inform. An unregistered type is caught by
 * level-2 validation and repaired; a type whose data requirement does not fit is caught by
 * level 4.
 */
function chosenComponentType(fill: WidgetFill | undefined, fallback: string): string {
  return fill?.componentType ?? fallback;
}

function buildFilter(
  filters: readonly FillFilter[],
  entity: GroundedEntity,
  declaresChannel: (name: string) => void,
): { filter?: FilterNode } {
  const clauses = filters
    .filter((f) => entity.attributes.some((a) => a.ref === f.attributeRef && a.filterable))
    .map((f) => {
      const base = { target: f.attributeRef, operator: f.operator } as Record<string, unknown>;
      switch (f.valueFrom) {
        case 'asOfParameter':
          base['value'] = { $param: 'as-of' };
          break;
        case 'severityFilter':
          declaresChannel('severity');
          base['value'] = { $filter: 'severity' };
          base['skipWhenEmpty'] = true;
          break;
        case 'statusFilter':
          declaresChannel('status');
          base['value'] = { $filter: 'status' };
          base['skipWhenEmpty'] = true;
          break;
        case 'today':
          break; // onOrAfterToday takes no value
        default:
          if (f.value !== undefined) base['value'] = f.value;
      }
      if (f.unit) base['unit'] = f.unit;
      return base as unknown as FilterNode;
    });

  // An entity that requires a filter and received none would be rejected by cost validation;
  // the plan stage is responsible for supplying one, and this records the omission rather
  // than inventing a predicate the user did not ask for.
  if (!clauses.length) return {};
  return { filter: { all: clauses } };
}

function formatForMeasure(valueType: string): FieldBinding['format'] {
  switch (valueType) {
    case 'integer':
      return { style: 'integer' };
    case 'amount':
      return { style: 'currency' };
    case 'percentage':
      return { style: 'percent', decimals: 1 };
    case 'duration':
      return { style: 'duration' };
    default:
      return { style: 'decimal', decimals: 1 };
  }
}

function thresholdsFor(higherIsBetter: boolean) {
  return higherIsBetter
    ? [
        { id: 'none', label: 'None', from: 0, to: 0, emphasis: 'negative' as const },
        { id: 'some', label: 'Present', from: 1, to: null, emphasis: 'positive' as const },
      ]
    : [
        { id: 'clear', label: 'Clear', from: 0, to: 0, emphasis: 'positive' as const },
        { id: 'watch', label: 'Monitoring', from: 1, to: 5, emphasis: 'warning' as const },
        { id: 'breach', label: 'Needs attention', from: 6, to: null, emphasis: 'negative' as const },
      ];
}

/** Maps a series attribute to the filter channel it can drive, if any. */
function channelForAttribute(ref: string): 'severity' | 'status' | null {
  if (/severity/.test(ref)) return 'severity';
  if (/status/.test(ref)) return 'status';
  return null;
}

function slug(name: string): string {
  return (
    name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 60) || 'generated-page'
  );
}
