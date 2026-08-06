/**
 * Page assist — the second thing AI does at design time.
 *
 * Generation answers "build me a page from a sentence". Assist answers a different question, and it
 * is the question an author actually has once a page exists: **what is this page missing?** The
 * author is looking at four figures over the exception queue and cannot see, from the canvas, that
 * the catalog also exposes an ageing measure and a severity breakdown they never bound.
 *
 * ── THE DECISION THAT MAKES THIS SAFE ─────────────────────────────────────────────────
 * A suggestion is not a page, not a patch, and not prose. It is a **proposal**: a small, strictly
 * schematised statement of *which* catalog concept to show *how*, exactly like `PlanWidget` in
 * plan.ts. The platform turns a proposal into a `Command`, and the command into a patch. Three
 * consequences, all of which are the point:
 *
 *   - A proposal names refs the grounding pack contains, so a suggestion cannot reference a measure
 *     the author is not entitled to — the pack was already entitlement-scoped before ranking.
 *   - Accepting one is an ordinary edit. It arrives at the store as a patch, tagged `origin: 'ai'`,
 *     and one undo reverses it. The store cannot tell it from a drag (commands.ts header).
 *   - Nothing here can produce markup, CSS, an expression, or a component type outside the registry,
 *     because the proposal vocabulary has no way to say those things.
 *
 * ── WHY THE ANALYSER IS DETERMINISTIC, AND STILL BEHIND THE MODEL SEAM ────────────────
 * `analysePage` is a set of rules over the grounding pack: an unbound measure is a candidate figure,
 * a groupable temporal attribute is a candidate trend, a page with no prose has no description. It
 * needs no model, so assist works with no provider configured at all — which matters, because an
 * authoring aid that goes away when the model endpoint is down is an authoring aid nobody relies on.
 *
 * A provider, when installed, is asked the same question with the same grounding and held to
 * `ASSIST_RESPONSE_SCHEMA`. What a real model adds is judgement the rules cannot have: which of nine
 * candidate measures matter for *this* page, how to phrase the rationale, and when the honest answer
 * is "nothing — this page is complete". The rules cannot say that last one; they can only rank.
 */

import type { GroundedEntity, GroundingPack } from '@opus/catalog';
import { text, type I18nString } from '@opus/contracts';

import type { FillFilter } from './plan';

// ── the proposal vocabulary ──────────────────────────────────────────────────────────

/** Common to every proposal: identity, what the button says, and why. */
interface ProposalBase {
  /**
   * Stable across re-runs for the same underlying gap.
   *
   * Derived from the kind and the refs, never counted, because dismissal has to survive a re-run:
   * an author who dismissed "add an ageing figure" must not be offered it again under a new id the
   * moment they add something else.
   */
  id: string;
  /** Imperative, short: what accepting it does. */
  title: string;
  /** One sentence. The author is being asked to trust a change to their page. */
  rationale: string;
}

/** The three additive kinds all name the title the *widget* should carry, separately from the
 *  button label. They are different strings — "Add a “Late Files” figure" versus "Late Files" — and
 *  deriving one from the other means a widget titled with the button's punctuation. */
interface AddsWidget {
  widgetTitle: string;
}

export type AssistProposal =
  /** A scalar figure over a measure nothing on the page reads. */
  | (ProposalBase &
      AddsWidget & {
        kind: 'add-figure';
        entityRef: string;
        measureRef: string;
        aggregation: string;
      })
  /** The same measure, split by a dimension — a trend when the dimension is temporal. */
  | (ProposalBase &
      AddsWidget & {
        kind: 'add-breakdown';
        entityRef: string;
        measureRef: string;
        aggregation: string;
        dimensionRef: string;
        temporal: boolean;
      })
  /** A list of an entity's identifying attributes: the rows behind the figures. */
  | (ProposalBase &
      AddsWidget & {
        kind: 'add-list';
        entityRef: string;
        attributeRefs: readonly string[];
      })
  /** Page prose. Not decoration — it is what the library card and the AI grounding pack read. */
  | (ProposalBase & { kind: 'set-page-description'; value: string })
  /** A widget still carrying its component's generic name. */
  | (ProposalBase & { kind: 'retitle-widget'; componentId: string; value: string });

export type AssistProposalKind = AssistProposal['kind'];

/**
 * What the analyser and the model are told about the open page.
 *
 * A projection, not the definition. Two reasons: a 500-line artifact spends the context budget on
 * layout maths that has no bearing on what is missing, and a proposal must be expressible against
 * *concepts* — so the useful summary is which entities and measures the page already reads.
 */
export interface AssistPageView {
  name: string;
  description: string;
  /** Entity refs any data source on the page reads. */
  entities: readonly string[];
  /** Measure refs any data source selects. The heart of the gap analysis. */
  boundMeasures: readonly string[];
  /** Attribute refs used as a dimension or a column. */
  boundAttributes: readonly string[];
  widgets: readonly {
    componentId: string;
    type: string;
    title: string;
    /** True when the title is still the component's generic name — "KPI Card", "Table". */
    genericTitle: boolean;
    hasData: boolean;
    /**
     * The entity and measures THIS widget's own data source reads.
     *
     * Per-widget rather than per-page, and that distinction was a defect before it was a design: a
     * retitle proposal derived from "the first measure the page binds" gave two generically-titled
     * widgets the same suggested name, and the panel showed two rows the author could not tell
     * apart. A widget can only be named after what it actually reads.
     */
    readsEntity?: string;
    readsMeasures: readonly string[];
  }[];
  counts: { kpi: number; chart: number; table: number; text: number };
}

export interface AssistInput {
  page: AssistPageView;
  /** Entitlement-scoped, and scoped to the page's own entities: assist widens depth, not reach. */
  grounding: GroundingPack;
  /** Component types the registry offers, so a proposal cannot name one that is not there. */
  availableComponents: readonly string[];
  /** Ceiling on proposals returned. A panel of fifteen suggestions is a panel nobody reads. */
  max?: number;
}

const DEFAULT_MAX = 5;

/** Component types a proposal kind needs. A kind whose type is unregistered is not offered. */
const REQUIRED_COMPONENT: Record<AssistProposalKind, string | null> = {
  'add-figure': 'analytics.kpi-card',
  'add-breakdown': 'analytics.chart',
  'add-list': 'data.table',
  'set-page-description': null,
  'retitle-widget': null,
};

export function componentTypeFor(kind: AssistProposalKind): string | null {
  return REQUIRED_COMPONENT[kind];
}

// ── the page projection ──────────────────────────────────────────────────────────────

/**
 * Minimal structural shape of a page definition, so this module does not import the runtime
 * contracts wholesale. It reads what a data source *selects*, which is where bindings actually
 * resolve from — reading `components[].bindings` instead would report aliases, and an alias is not
 * a catalog ref.
 */
interface PageLike {
  name?: unknown;
  description?: unknown;
  components: Record<
    string,
    { id?: string; type: string; title?: unknown; dataSource?: string }
  >;
  dataSources?: Record<
    string,
    {
      entity: string;
      select?: {
        measures?: readonly { measure: string }[];
        dimensions?: readonly { attribute: string }[];
        attributes?: readonly { attribute: string }[];
      };
    }
  >;
}

/** Generic names a freshly-dropped widget carries, so "still generic" is a fact rather than a guess. */
const GENERIC_TITLES = new Set(['kpi card', 'table', 'chart', 'text', 'filter bar', 'navigation']);

/**
 * Component types a retitle proposal applies to.
 *
 * A positive list, and a deliberately short one. An untitled text block is IDIOMATIC — the text
 * component renders its body as the heading, so the title is empty on purpose — and an untitled
 * filter bar has nothing to be named after. The first version of this rule proposed titles for both,
 * and on the party page it offered to name two headings after the entity they sat above. A widget is
 * worth naming only when it displays a figure, a series or rows.
 */
const TITLEABLE = new Set(['analytics.kpi-card', 'analytics.chart', 'data.table']);

export function viewOfPage(definition: PageLike): AssistPageView {
  const entities = new Set<string>();
  const measures = new Set<string>();
  const attributes = new Set<string>();

  for (const source of Object.values(definition.dataSources ?? {})) {
    entities.add(source.entity);
    for (const measure of source.select?.measures ?? []) measures.add(measure.measure);
    for (const dimension of source.select?.dimensions ?? []) attributes.add(dimension.attribute);
    for (const attribute of source.select?.attributes ?? []) attributes.add(attribute.attribute);
  }

  const counts = { kpi: 0, chart: 0, table: 0, text: 0 };
  const widgets = Object.entries(definition.components).map(([id, component]) => {
    const title = text(component.title as I18nString | undefined) || '';
    if (component.type === 'analytics.kpi-card') counts.kpi += 1;
    else if (component.type === 'analytics.chart') counts.chart += 1;
    else if (component.type === 'data.table') counts.table += 1;
    else if (component.type === 'content.text') counts.text += 1;

    const source = component.dataSource
      ? definition.dataSources?.[component.dataSource]
      : undefined;

    return {
      componentId: component.id ?? id,
      type: component.type,
      title,
      genericTitle: !title || GENERIC_TITLES.has(title.trim().toLowerCase()),
      hasData: Boolean(component.dataSource),
      ...(source ? { readsEntity: source.entity } : {}),
      readsMeasures: (source?.select?.measures ?? []).map((measure) => measure.measure),
    };
  });

  return {
    name: text(definition.name as I18nString | undefined) || '',
    description: text(definition.description as I18nString | undefined) || '',
    entities: [...entities],
    boundMeasures: [...measures],
    boundAttributes: [...attributes],
    widgets,
    counts,
  };
}

// ── the deterministic analyser ───────────────────────────────────────────────────────

/**
 * Rules over the grounding pack, ordered by how much the author is likely to want them.
 *
 * The ordering is the only editorial judgement here, and it is deliberate: an unread measure is the
 * most valuable thing to surface because it is a *fact about the catalog* the canvas cannot show. A
 * missing description is the least valuable because the author knows it is missing.
 *
 * WHAT THE RULES REFUSE TO DO. They never propose a widget over an entity that requires a filter
 * unless the entity offers an attribute that can carry one — inventing a filter value would be
 * exactly the plausible-but-wrong output the validation cascade exists to catch, and proposing a
 * page the validator will reject teaches the author to distrust the panel.
 */
export function analysePage(input: AssistInput): AssistProposal[] {
  const { page, grounding } = input;
  const available = new Set(input.availableComponents);
  const proposals: AssistProposal[] = [];

  const bound = new Set(page.boundMeasures);
  const boundAttributes = new Set(page.boundAttributes);
  const relevant = grounding.entities.filter((entity) => page.entities.includes(entity.ref));
  // A page with no data sources yet has no entities to widen, so fall back to the whole pack —
  // otherwise an empty page, the case most in need of help, gets no suggestions at all.
  const entities = relevant.length ? relevant : grounding.entities;

  // 1. Measures the catalog offers and nothing on the page reads.
  if (available.has('analytics.kpi-card')) {
    for (const entity of entities) {
      if (!canQuery(entity)) continue;
      for (const measure of entity.measures) {
        if (bound.has(measure.ref)) continue;
        proposals.push({
          kind: 'add-figure',
          id: `figure:${measure.ref}`,
          title: `Add a “${measure.name}” figure`,
          rationale:
            `${entity.name} exposes ${measure.name}` +
            (measure.description ? ` — ${spliceable(measure.description)}` : '') +
            `, and no widget on this page reads it.`,
          widgetTitle: measure.name,
          entityRef: entity.ref,
          measureRef: measure.ref,
          aggregation: measure.defaultAggregation,
        });
      }
    }
  }

  // 2. A measure the page *does* read, split by a dimension it does not. Temporal first: "how is
  //    this trending" is the question a figure provokes and cannot answer.
  if (available.has('analytics.chart')) {
    for (const entity of entities) {
      if (!canQuery(entity)) continue;
      const dimension =
        entity.attributes.find((a) => a.isTemporal && a.groupable && !boundAttributes.has(a.ref)) ??
        entity.attributes.find(
          (a) => a.groupable && a.enumValues?.length && !boundAttributes.has(a.ref),
        );
      if (!dimension) continue;

      const measure = entity.measures.find((m) => bound.has(m.ref)) ?? entity.measures[0];
      if (!measure) continue;

      proposals.push({
        kind: 'add-breakdown',
        id: `breakdown:${measure.ref}:${dimension.ref}`,
        title: `Chart ${measure.name} by ${dimension.name}`,
        rationale: dimension.isTemporal
          ? `The page shows ${measure.name} as a single number, and ${dimension.name} is a date the catalog marks groupable — so the same measure can be shown as a trend.`
          : `${dimension.name} has ${dimension.enumValues?.length ?? 0} values and is groupable, so ${measure.name} can be broken down by it.`,
        widgetTitle: dimension.isTemporal
          ? `${measure.name} over time`
          : `${measure.name} by ${dimension.name}`,
        entityRef: entity.ref,
        measureRef: measure.ref,
        aggregation: measure.defaultAggregation,
        dimensionRef: dimension.ref,
        temporal: dimension.isTemporal,
      });
    }
  }

  // 3. The rows behind the figures. Only when the page has none, because a second table over the
  //    same entity is a layout decision the author should make, not a gap in the page.
  if (available.has('data.table') && page.counts.table === 0) {
    for (const entity of entities) {
      if (!canQuery(entity)) continue;
      const columns = tableColumnsFor(entity);
      if (columns.length < 2) continue;
      proposals.push({
        kind: 'add-list',
        id: `list:${entity.ref}`,
        title: `Add a ${entity.plural ?? entity.name} table`,
        rationale: `The page aggregates ${entity.name} but never shows the rows, so a reader cannot get from a number to the records behind it.`,
        widgetTitle: text(entity.plural) || entity.name,
        entityRef: entity.ref,
        attributeRefs: columns,
      });
    }
  }

  // 4. Widgets still carrying a component's generic name. Cheap to fix, and the reason a generated
  //    page reads like a page while a hand-built one reads like a form.
  for (const widget of page.widgets) {
    if (!widget.genericTitle || !widget.hasData || !TITLEABLE.has(widget.type)) continue;
    const suggested = titleForWidget(widget, grounding.entities);
    if (!suggested) continue;
    proposals.push({
      kind: 'retitle-widget',
      id: `retitle:${widget.componentId}`,
      // The widget is named in the row, because two widgets can both be called "KPI Card" and two
      // rows reading "Title it X" would be indistinguishable.
      title: `Title ${widget.componentId} “${suggested}”`,
      rationale: `“${widget.title || 'Untitled'}” names the component, not the content. The catalog calls what ${widget.componentId} reads ${suggested}.`,
      componentId: widget.componentId,
      value: suggested,
    });
  }

  // 5. Page prose. Last, because the author knows.
  if (!page.description.trim()) {
    const value = describePage(page, entities);
    if (value) {
      proposals.push({
        kind: 'set-page-description',
        id: 'describe-page',
        title: 'Describe this page',
        rationale:
          'The page has no description. It is what the experience library shows on the card, and what a future generation call reads as context for this page.',
        value,
      });
    }
  }

  return proposals.slice(0, input.max ?? DEFAULT_MAX);
}

/**
 * Whether a widget over this entity can be proposed at all.
 *
 * An entity the catalog marks `requiresFilter` needs a clause that always constrains, or level-3
 * validation rejects the page. If none of its attributes can carry one, the honest move is to
 * propose nothing over it rather than a widget that will not validate.
 */
function canQuery(entity: GroundedEntity): boolean {
  return !entity.requiresFilter || mandatoryFilterFor(entity).length > 0;
}

/**
 * A filter that always constrains, for an entity the catalog marks `requiresFilter`.
 *
 * Prefer a date — a business date narrowed to the reporting day is what an operational page means
 * anyway — then an enum over its full value set, which constrains the scan without excluding
 * anything a reader expected to see. An entity offering neither gets nothing, and the caller drops
 * the widget rather than emitting one the validator will reject.
 *
 * Shared with `GenerationService`, which held a private copy. One rule in one place, because a
 * divergence would mean assist proposing a source the generator would have filtered — the same page
 * valid down one path and rejected down the other.
 */
export function mandatoryFilterFor(entity: GroundedEntity): FillFilter[] {
  if (!entity.requiresFilter) return [];

  const date = entity.attributes.find((a) => a.isTemporal && a.filterable);
  if (date) return [{ attributeRef: date.ref, operator: 'onOrAfterToday' }];

  const enumAttribute = entity.attributes.find((a) => a.enumValues?.length && a.filterable);
  if (enumAttribute?.enumValues) {
    return [
      { attributeRef: enumAttribute.ref, operator: 'in', value: [...enumAttribute.enumValues] },
    ];
  }
  return [];
}

/** Identifying columns first, then whatever else is small enough to read in a row. */
function tableColumnsFor(entity: GroundedEntity): string[] {
  const keys = entity.attributes.filter((a) => a.isKey).map((a) => a.ref);
  const label = entity.labelAttribute ? [entity.labelAttribute] : [];
  const rest = entity.attributes
    .filter((a) => !a.isKey && a.ref !== entity.labelAttribute && a.dataType !== 'json')
    .map((a) => a.ref);
  return [...new Set([...keys, ...label, ...rest])].slice(0, 6);
}

/**
 * What the catalog calls the concept THIS widget reads.
 *
 * Its own measure first, then its entity's plural. Returns null when the widget's source names
 * neither — a widget over an entity the pack does not carry cannot be named from the catalog, and
 * guessing from the page's other widgets is what produced two identical suggestions.
 */
function titleForWidget(
  widget: AssistPageView['widgets'][number],
  entities: readonly GroundedEntity[],
): string | null {
  const entity = entities.find((candidate) => candidate.ref === widget.readsEntity);
  if (!entity) return null;

  for (const ref of widget.readsMeasures) {
    const measure = entity.measures.find((candidate) => candidate.ref === ref);
    if (measure) return measure.name;
  }
  return entity.plural ?? entity.name;
}

/** One factual sentence about what the page reads. Never a claim about what it is *for*. */
function describePage(page: AssistPageView, entities: readonly GroundedEntity[]): string | null {
  const names = entities
    .filter((entity) => page.entities.includes(entity.ref))
    .map((entity) => entity.plural ?? entity.name);
  if (!names.length) return null;

  const parts: string[] = [];
  if (page.counts.kpi) parts.push(`${page.counts.kpi} figure${page.counts.kpi === 1 ? '' : 's'}`);
  if (page.counts.chart) parts.push(`${page.counts.chart} chart${page.counts.chart === 1 ? '' : 's'}`);
  if (page.counts.table) parts.push(`${page.counts.table} table${page.counts.table === 1 ? '' : 's'}`);
  const shown = parts.length ? parts.join(', ').replace(/, ([^,]*)$/, ' and $1') : 'content';
  return `${shown} over ${names.join(' and ')}.`;
}

/**
 * A catalog description, made safe to splice into the middle of a sentence.
 *
 * Two adjustments, both of which were visible defects in the panel before they were rules. The first
 * letter is lowered, because a catalog description is written as its own sentence — applied to
 * *descriptions* only and never to names, since a business name is title-cased on purpose by whoever
 * authored the catalog and lowering it produced rows reading "Chart Late Files by business Date".
 * And trailing sentence punctuation is dropped, because a description ending in a full stop spliced
 * before a comma renders as "…whatever their outcome., and no widget reads it."
 */
function spliceable(value: string): string {
  const trimmed = value.trim().replace(/[.;:,]+$/, '');
  return trimmed.charAt(0).toLowerCase() + trimmed.slice(1);
}

// ── the prompt, and the schema a provider is held to ─────────────────────────────────

const ASSIST_SYSTEM = [
  'You improve an existing enterprise page definition by proposing small, specific changes.',
  '',
  'Rules:',
  '- Propose only changes expressible in the proposal schema. You never write JSON, markup or code.',
  '- Every entityRef, measureRef, attributeRef and aggregation MUST appear verbatim in the catalog',
  '  excerpt. A ref that is not there is a failed response, not a creative one.',
  '- Use only an aggregation the measure lists as allowed.',
  '- Do not propose a widget that duplicates one the page already has.',
  '- Prefer few, high-value proposals. Returning an empty list is correct when the page is complete.',
  '- A rationale is one sentence, states a fact about the catalog or the page, and never flatters.',
].join('\n');

export function assistPrompt(input: AssistInput): { system: string; user: string } {
  const { page, grounding } = input;
  const lines: string[] = [];

  lines.push('## The page as it stands');
  lines.push(`name: ${page.name || '(none)'}`);
  lines.push(`description: ${page.description || '(none)'}`);
  lines.push(
    `widgets: ${page.counts.kpi} kpi, ${page.counts.chart} chart, ${page.counts.table} table, ${page.counts.text} text`,
  );
  for (const widget of page.widgets) {
    lines.push(
      `  - ${widget.componentId}: ${widget.type} "${widget.title}"` +
        (widget.hasData ? '' : ' (no data source)'),
    );
  }
  lines.push('');
  lines.push('## Already read by this page — do not propose these again');
  lines.push(`entities: ${page.entities.join(', ') || '(none)'}`);
  lines.push(`measures: ${page.boundMeasures.join(', ') || '(none)'}`);
  lines.push(`attributes: ${page.boundAttributes.join(', ') || '(none)'}`);
  lines.push('');
  lines.push('## Catalog excerpt — the ONLY refs you may name');

  for (const entity of grounding.entities) {
    lines.push(
      `- ${entity.ref} (${entity.name})${entity.requiresFilter ? ' | REQUIRES A FILTER' : ''}`,
    );
    for (const measure of entity.measures) {
      lines.push(
        `    measure ${measure.ref} "${measure.name}" agg: ${measure.allowedAggregations.join('|')} default: ${measure.defaultAggregation}`,
      );
    }
    for (const attribute of entity.attributes) {
      const flags = [
        attribute.groupable ? 'groupable' : '',
        attribute.isTemporal ? 'temporal' : '',
        attribute.enumValues?.length ? `enum(${attribute.enumValues.length})` : '',
      ]
        .filter(Boolean)
        .join(' ');
      lines.push(`    attr ${attribute.ref} "${attribute.name}" ${attribute.dataType} ${flags}`);
    }
  }

  lines.push('');
  lines.push(`## Components available: ${input.availableComponents.join(', ')}`);
  lines.push(`## Return at most ${input.max ?? DEFAULT_MAX} proposals.`);

  return { system: ASSIST_SYSTEM, user: lines.join('\n') };
}

export const ASSIST_RESPONSE_SCHEMA = {
  $schema: 'https://json-schema.org/draft/2020-12/schema',
  type: 'object',
  properties: {
    proposals: {
      type: 'array',
      maxItems: 8,
      items: {
        type: 'object',
        properties: {
          kind: {
            type: 'string',
            enum: [
              'add-figure',
              'add-breakdown',
              'add-list',
              'set-page-description',
              'retitle-widget',
            ],
          },
          id: { type: 'string', minLength: 1, maxLength: 120 },
          title: { type: 'string', minLength: 3, maxLength: 80 },
          rationale: { type: 'string', minLength: 10, maxLength: 400 },
          widgetTitle: { type: 'string', minLength: 1, maxLength: 80 },
          entityRef: { type: 'string' },
          measureRef: { type: 'string' },
          dimensionRef: { type: 'string' },
          attributeRefs: { type: 'array', items: { type: 'string' }, maxItems: 8 },
          aggregation: { type: 'string' },
          temporal: { type: 'boolean' },
          componentId: { type: 'string' },
          value: { type: 'string', maxLength: 240 },
        },
        required: ['kind', 'id', 'title', 'rationale'],
        additionalProperties: false,
      },
    },
    /** Why the list is short or empty. Shown to the author, so "nothing to add" is legible. */
    note: { type: 'string', maxLength: 240 },
  },
  required: ['proposals'],
  additionalProperties: false,
} as const;

export interface AssistResponse {
  proposals: AssistProposal[];
  note?: string;
}

/**
 * Drop anything the response says that the grounding pack does not support.
 *
 * The provider is *told* to name only refs from the excerpt; this is what happens when it does not.
 * A proposal naming a measure that is not in the pack would produce a data source over a concept the
 * author may not be entitled to — so this is an entitlement boundary, not tidying, and it runs on
 * every response including the deterministic one.
 */
export function keepGroundedProposals(
  proposals: readonly AssistProposal[],
  input: AssistInput,
): { kept: AssistProposal[]; rejected: { id: string; reason: string }[] } {
  const kept: AssistProposal[] = [];
  const rejected: { id: string; reason: string }[] = [];
  const available = new Set(input.availableComponents);
  const byRef = new Map(input.grounding.entities.map((entity) => [entity.ref, entity]));
  const componentIds = new Set(input.page.widgets.map((widget) => widget.componentId));

  for (const proposal of proposals) {
    const required = REQUIRED_COMPONENT[proposal.kind];
    if (required && !available.has(required)) {
      rejected.push({ id: proposal.id, reason: `${required} is not registered` });
      continue;
    }

    if (proposal.kind === 'retitle-widget') {
      if (!componentIds.has(proposal.componentId)) {
        rejected.push({ id: proposal.id, reason: `no widget "${proposal.componentId}"` });
        continue;
      }
      kept.push(proposal);
      continue;
    }

    if (proposal.kind === 'set-page-description') {
      kept.push(proposal);
      continue;
    }

    const entity = byRef.get(proposal.entityRef);
    if (!entity) {
      rejected.push({ id: proposal.id, reason: `entity "${proposal.entityRef}" is not in scope` });
      continue;
    }
    if (!canQuery(entity)) {
      rejected.push({ id: proposal.id, reason: `${entity.ref} requires a filter it cannot carry` });
      continue;
    }

    if (proposal.kind === 'add-list') {
      const refs = new Set(entity.attributes.map((a) => a.ref));
      const unknown = proposal.attributeRefs.filter((ref) => !refs.has(ref));
      if (unknown.length) {
        rejected.push({ id: proposal.id, reason: `unknown attribute(s) ${unknown.join(', ')}` });
        continue;
      }
      kept.push(proposal);
      continue;
    }

    const measure = entity.measures.find((m) => m.ref === proposal.measureRef);
    if (!measure) {
      rejected.push({ id: proposal.id, reason: `unknown measure "${proposal.measureRef}"` });
      continue;
    }
    if (!measure.allowedAggregations.includes(proposal.aggregation as never)) {
      rejected.push({
        id: proposal.id,
        reason: `${measure.name} does not allow ${proposal.aggregation}`,
      });
      continue;
    }
    if (proposal.kind === 'add-breakdown') {
      const dimension = entity.attributes.find((a) => a.ref === proposal.dimensionRef);
      if (!dimension) {
        rejected.push({ id: proposal.id, reason: `unknown attribute "${proposal.dimensionRef}"` });
        continue;
      }
      if (!dimension.groupable) {
        rejected.push({ id: proposal.id, reason: `${dimension.name} is not groupable` });
        continue;
      }
    }
    kept.push(proposal);
  }

  return { kept, rejected };
}
