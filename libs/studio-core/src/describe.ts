/**
 * Human summaries of a page's non-visual aspects.
 *
 * WHY THIS EXISTS. The builder could show the canvas and nothing else, and for a while it did. But a
 * shipped page carries eight or nine data sources, ten to fourteen actions, parameters, filter
 * channels, security and performance policy — and every one of those was invisible unless the author
 * opened the JSON tab and read the artifact. An author who has to read JSON Pointers to find out
 * which widget reads a source is not using a builder; they are using a text editor with a preview.
 *
 * WHY IT IS PURE FUNCTIONS IN THIS LIBRARY. Two reasons, and the second is the load-bearing one:
 *
 *   1. `studio-core` depends on `contracts` and `platform` only, so all of this is testable without a
 *      DOM, a store or Angular — which is what the library's header promises about the whole editing
 *      vocabulary.
 *   2. **A summary must not be able to lie.** Every sentence here is derived from the artifact at the
 *      moment it is read; nothing is cached, denormalised or maintained alongside. The reverse
 *      indexes — which widgets read a source, which events dispatch an action — are recomputed rather
 *      than stored, because a stale index is worse than no index: it tells an author a source is
 *      unused and they delete something a widget was reading.
 *
 * These functions describe. They never mutate. Everything the panels *do* still goes through
 * `commands.ts`.
 */

import { text, type Action, type DataSource, type PageDefinition } from '@opus/contracts';

import { walkLayout } from './layout-tree';

// ── data sources ─────────────────────────────────────────────────────────────────────

/** One selected thing, flattened across measures, dimensions and attributes. */
export interface SelectedField {
  role: 'measure' | 'dimension' | 'attribute';
  /** The catalog ref — what the author chose. */
  ref: string;
  /** The alias bindings resolve against. The distinction matters: a binding names the alias. */
  alias: string;
  /** Aggregation for a measure, granularity for a temporal dimension. */
  detail?: string;
}

export interface SourceSummary {
  id: string;
  entity: string;
  kind: string;
  fields: readonly SelectedField[];
  /** A one-line rendering of the filter tree, or null when the source is unfiltered. */
  filter: string | null;
  sort: string | null;
  paging: string | null;
  loadPolicy: string;
  cacheTtlSeconds: number | null;
  costClass: string | null;
  /** Component ids whose `dataSource` is this source. Recomputed, never stored. */
  readers: readonly string[];
  /** Layout node ids for those components, so a panel can select one on the canvas. */
  readerNodes: readonly string[];
  /**
   * Container node ids that read it *structurally* — a data-driven tab set generating one tab per row.
   * Separate from `readers` because no component points at it, and because the panel says so
   * differently: "generates the tabs of X" is not "displayed by X".
   */
  layoutReaders: readonly string[];
  /**
   * Every other place in the artifact that names it, as JSON Pointers — an action that refreshes or
   * exports it, an expression reading `$data.<source>.<alias>`, a container naming it. See the note in
   * `summariseSource`: this is what makes "unread" safe to act on.
   */
  references: readonly string[];
  /** True when nothing reads it at all. An unread source still costs a gateway round trip. */
  orphan: boolean;
}

export function summariseSource(definition: PageDefinition, sourceId: string): SourceSummary | null {
  const source = definition.dataSources?.[sourceId];
  if (!source) return null;

  const readers = Object.values(definition.components)
    .filter((component) => component.dataSource === sourceId)
    .map((component) => component.id);

  const readerSet = new Set(readers);
  const readerNodes = walkLayout(definition)
    .filter((entry) => entry.node.kind === 'widget' && readerSet.has(entry.node.component))
    .map((entry) => entry.node.id);

  const layoutReaders = walkLayout(definition)
    .filter((entry) => entry.node.kind === 'container' && tabSourceOf(entry.node) === sourceId)
    .map((entry) => entry.node.id);

  /**
   * ── WHY "UNREAD" IS A CATCH-ALL SCAN AND NOT A LIST OF KNOWN CONSUMERS ──────────────
   *
   * Three times in a row, enumerating the ways a source can be consumed produced a FALSE claim that
   * one was unread — and the panel offers to delete what it calls unread, so each was a bug that
   * would have destroyed a working page:
   *
   *   1. a data-driven tab set naming it as the source of its tabs (`rule-tabs`);
   *   2. a panel's `headerActions` reaching an action that exports it (`export-rule-queue`);
   *   3. an EXPRESSION in a text widget's config reading `$data.<source>.<alias>`
   *      (`oldest-exception-age` — caught by the validator, not by this file).
   *
   * The third made the pattern clear: a source id can legitimately appear anywhere in the artifact,
   * including inside an expression string, and any enumeration of consumers is a list of the places
   * we happened to think of. So the rule is inverted. `readers` still names the components that
   * DISPLAY it, because the panel needs to offer "select the widget"; but "unread" now means *the id
   * appears nowhere else in the artifact at all*, which cannot be wrong by omission.
   *
   * The cost is a false NEGATIVE: a genuinely dead source whose id happens to appear in a comment-like
   * string would not be flagged. That is the right way round — failing to mention a wasted query is a
   * missed optimisation, and wrongly offering to delete a live one loses an author's work.
   */
  /**
   * References OTHER than the ones already named as readers.
   *
   * `/components/kpi-open/dataSource` is the very fact "read by kpi-open" states, so listing it again
   * as a raw pointer is noise that makes the genuinely interesting reference — an expression, an
   * export action — harder to spot in the same cell.
   */
  const readerPointers = new Set(readers.map((id) => `/components/${id}/dataSource`));
  const references = referencesTo(definition, sourceId).filter(
    (pointer) => !readerPointers.has(pointer),
  );

  return {
    id: sourceId,
    entity: source.entity,
    kind: source.kind,
    fields: fieldsOf(source),
    filter: describeFilter(source.filter),
    sort: source.sort?.length
      ? source.sort.map((spec) => `${spec.field} ${spec.direction ?? 'asc'}`).join(', ')
      : null,
    paging: source.paging
      ? [
          source.paging.mode ?? 'none',
          source.paging.pageSize ? `${source.paging.pageSize} per page` : null,
          source.paging.maxRows ? `max ${source.paging.maxRows}` : null,
        ]
          .filter(Boolean)
          .join(' · ')
      : null,
    loadPolicy: source.loadPolicy ?? 'eager',
    cacheTtlSeconds: source.cacheTtlHintSeconds ?? null,
    costClass: source.expectedCostClass ?? null,
    readers,
    readerNodes,
    layoutReaders,
    references,
    orphan: readers.length === 0 && layoutReaders.length === 0 && references.length === 0,
  };
}

/**
 * Every place in the artifact that names this source, other than its own declaration.
 *
 * Returned as JSON Pointers, so the panel can say *where* rather than only *whether* — an author told
 * "something references this" and not what will go looking through 40,000 characters of JSON.
 *
 * String values are matched as well as keys, because an expression reads a source as
 * `$data.<source>.<alias>` inside a string. Matched on a word boundary so `open-total` does not
 * appear to be referenced by `open-total-extra`.
 */
export function referencesTo(definition: PageDefinition, sourceId: string): readonly string[] {
  const found: string[] = [];
  const pattern = new RegExp(`(^|[^A-Za-z0-9_-])${escapeRegExp(sourceId)}([^A-Za-z0-9_-]|$)`);

  const walk = (value: unknown, path: string): void => {
    // Its own declaration is not a reference to itself.
    if (path === `/dataSources/${sourceId}`) return;

    if (typeof value === 'string') {
      if (value === sourceId || pattern.test(value)) found.push(path);
      return;
    }
    if (Array.isArray(value)) {
      value.forEach((entry, index) => walk(entry, `${path}/${index}`));
      return;
    }
    if (value && typeof value === 'object') {
      for (const [key, child] of Object.entries(value)) {
        // A KEY equal to the id is a reference — an object keyed by source, say — except the one under
        // `/dataSources`, which is the declaration itself. Missing that exception made every source
        // look referenced, and the panel could never report a genuine orphan.
        if (key === sourceId && path !== '/dataSources') found.push(`${path}/${key}`);
        walk(child, `${path}/${key}`);
      }
    }
  };

  walk(definition, '');
  return found;
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * The source a container generates its children from, if it does that.
 *
 * Only the data-driven tab set does today. Written as a lookup rather than a type guard so a second
 * generating container — a repeater, a data-driven split — is one line here instead of a new false
 * positive in the panel.
 */
export function tabSourceOf(node: { kind: string; container?: unknown }): string | null {
  if (node.kind !== 'container') return null;
  const container = node.container as { source?: { mode?: string; source?: string } } | undefined;
  const source = container?.source;
  return source?.mode === 'dataDriven' && typeof source.source === 'string' ? source.source : null;
}

export function summariseSources(definition: PageDefinition): readonly SourceSummary[] {
  return Object.keys(definition.dataSources ?? {})
    .map((id) => summariseSource(definition, id))
    .filter((summary): summary is SourceSummary => summary !== null);
}

function fieldsOf(source: DataSource): SelectedField[] {
  const select = source.select as {
    measures?: readonly { measure: string; alias: string; aggregation?: string }[];
    dimensions?: readonly { attribute: string; alias: string; granularity?: string }[];
    attributes?: readonly { attribute: string; alias: string }[];
  };

  return [
    ...(select.measures ?? []).map((measure) => ({
      role: 'measure' as const,
      ref: measure.measure,
      alias: measure.alias,
      ...(measure.aggregation ? { detail: measure.aggregation } : {}),
    })),
    ...(select.dimensions ?? []).map((dimension) => ({
      role: 'dimension' as const,
      ref: dimension.attribute,
      alias: dimension.alias,
      ...(dimension.granularity ? { detail: `by ${dimension.granularity}` } : {}),
    })),
    ...(select.attributes ?? []).map((attribute) => ({
      role: 'attribute' as const,
      ref: attribute.attribute,
      alias: attribute.alias,
    })),
  ];
}

/**
 * A filter tree as one line.
 *
 * Rendered rather than counted ("3 clauses" tells an author nothing they can act on), and
 * parenthesised at every nesting level so an `any` inside an `all` cannot read as a flat list — which
 * is the one way a filter summary can be actively misleading about what a page shows.
 *
 * `skipWhenEmpty` is marked, because a clause that constrains nothing at render time is exactly the
 * difference between a page that filters and a page that appears to.
 */
export function describeFilter(node: unknown, depth = 0): string | null {
  if (!node || typeof node !== 'object') return null;
  const filter = node as Record<string, unknown>;

  for (const [key, joiner] of [
    ['all', ' and '],
    ['any', ' or '],
  ] as const) {
    const list = filter[key];
    if (Array.isArray(list)) {
      const parts = list
        .map((child) => describeFilter(child, depth + 1))
        .filter((part): part is string => Boolean(part));
      if (!parts.length) return null;
      const joined = parts.join(joiner);
      return depth === 0 || parts.length === 1 ? joined : `(${joined})`;
    }
  }

  if (filter['not']) {
    const inner = describeFilter(filter['not'], depth + 1);
    return inner ? `not ${inner}` : null;
  }

  const target = filter['target'];
  if (typeof target !== 'string') return null;

  const operator = String(filter['operator'] ?? 'eq');
  const value =
    'value' in filter
      ? formatValue(filter['value'])
      : 'valueFrom' in filter
        ? `←${String(filter['valueFrom'])}`
        : '';
  const skip = filter['skipWhenEmpty'] === true ? ' [skip when empty]' : '';
  return `${target} ${operator}${value ? ` ${value}` : ''}${skip}`;
}

function formatValue(value: unknown): string {
  if (value === null || value === undefined) return '';
  if (Array.isArray(value)) {
    const shown = value.slice(0, 4).map((entry) => formatValue(entry));
    return `[${shown.join(', ')}${value.length > 4 ? `, +${value.length - 4}` : ''}]`;
  }
  if (typeof value === 'object') {
    // A computable value — an expression, or a reference to page state. Shown as written, because
    // paraphrasing an expression is how a summary starts disagreeing with the artifact.
    const record = value as Record<string, unknown>;
    const key = Object.keys(record)[0];
    return key ? `${key}(${String(record[key])})` : '{…}';
  }
  return typeof value === 'string' ? `"${value}"` : String(value);
}

// ── actions ──────────────────────────────────────────────────────────────────────────

export interface ActionSummary {
  id: string;
  kind: string;
  label: string;
  /** One sentence, in the terms the action's own kind uses. */
  summary: string;
  /**
   * What dispatches it: a component's `eventActions`, or a container's `headerActions`.
   *
   * `componentId` holds a container's node id in the second case, and `event` names the slot — so a
   * panel can still offer to select it on the canvas without a second field.
   */
  dispatchedBy: readonly { componentId: string; event: string; nodeId?: string }[];
  /** True when it appears in `navigation.pageActions` — a button in the page header. */
  isPageAction: boolean;
  /** Other actions that name it as a step. A composite's steps are not dispatched directly. */
  usedBySteps: readonly string[];
  emphasis: string | null;
  requiresConfirmation: boolean;
  /** True when nothing reaches it: no event, no page action, no composite step. */
  unreachable: boolean;
}

export function summariseActions(definition: PageDefinition): readonly ActionSummary[] {
  const actions = definition.actions ?? {};
  const pageActions = new Set(definition.navigation?.pageActions ?? []);

  // Reverse index of the event wiring, built once for the whole page rather than per action.
  const nodeByComponent = new Map<string, string>();
  for (const entry of walkLayout(definition)) {
    if (entry.node.kind === 'widget') nodeByComponent.set(entry.node.component, entry.node.id);
  }

  const dispatch = new Map<string, { componentId: string; event: string; nodeId?: string }[]>();
  const record = (actionId: string, entry: { componentId: string; event: string; nodeId?: string }) => {
    dispatch.set(actionId, [...(dispatch.get(actionId) ?? []), entry]);
  };

  for (const component of Object.values(definition.components)) {
    const map = (component as { eventActions?: Record<string, unknown> }).eventActions ?? {};
    for (const [event, target] of Object.entries(map)) {
      for (const actionId of actionIdsIn(target)) {
        const nodeId = nodeByComponent.get(component.id);
        record(actionId, { componentId: component.id, event, ...(nodeId ? { nodeId } : {}) });
      }
    }
  }

  /**
   * A CONTAINER can dispatch too, and missing that produced the second false "unreachable".
   *
   * A panel renders `headerActions` as buttons in its own header — the "Export rule" button on the
   * Exception Management page is one — and no component is involved. Together with the tab-source case
   * in `summariseSource`, the lesson is the same: the layout is a first-class consumer of both actions
   * and data, and any reverse index that only walks `components` will accuse a working page of being
   * broken. Both were caught by running the describer over the shipped artifacts.
   */
  for (const entry of walkLayout(definition)) {
    if (entry.node.kind !== 'container') continue;
    const container = entry.node.container as { headerActions?: unknown; footerActions?: unknown };
    for (const [slot, list] of [
      ['headerActions', container.headerActions],
      ['footerActions', container.footerActions],
    ] as const) {
      for (const actionId of actionIdsIn(list)) {
        record(actionId, { componentId: entry.node.id, event: slot, nodeId: entry.node.id });
      }
    }
  }

  /**
   * A component's BINDINGS can dispatch as well: a table column declares `action` and the runtime
   * fires it when the cell is activated. That is how a drill-down from a link column works, and it is
   * the third place wiring lives — after `eventActions` and a container's action slots.
   */
  for (const component of Object.values(definition.components)) {
    const bindings = (component as { bindings?: Record<string, unknown> }).bindings ?? {};
    for (const [role, binding] of Object.entries(bindings)) {
      for (const entry of Array.isArray(binding) ? binding : [binding]) {
        const action = (entry as { action?: unknown } | null)?.action;
        if (typeof action === 'string') {
          const nodeId = nodeByComponent.get(component.id);
          record(action, { componentId: component.id, event: role, ...(nodeId ? { nodeId } : {}) });
        }
      }
    }
  }

  /** And a related link in the page header names one directly. */
  for (const link of definition.navigation?.relatedLinks ?? []) {
    if (link.action) record(link.action, { componentId: 'navigation', event: 'relatedLink' });
  }

  const steps = new Map<string, string[]>();
  for (const action of Object.values(actions)) {
    if (action.kind !== 'composite') continue;
    for (const step of action.steps ?? []) {
      steps.set(step, [...(steps.get(step) ?? []), action.id]);
    }
  }

  return Object.values(actions).map((action) => {
    const dispatchedBy = dispatch.get(action.id) ?? [];
    const usedBySteps = steps.get(action.id) ?? [];
    return {
      id: action.id,
      kind: action.kind,
      label: text(action.label) || action.id,
      summary: describeAction(action),
      dispatchedBy,
      isPageAction: pageActions.has(action.id),
      usedBySteps,
      emphasis: action.emphasis ?? null,
      requiresConfirmation: Boolean(action.confirm),
      unreachable:
        dispatchedBy.length === 0 && usedBySteps.length === 0 && !pageActions.has(action.id),
    };
  });
}

/**
 * Action ids inside an `eventActions` entry.
 *
 * The shape is irregular by design — a mapping may be a bare id, a list of ids, or an object with an
 * `action` and a condition — so a reader that only handled the string case would report a page's
 * conditional wiring as absent, and the panel would then call a reachable action unreachable.
 */
function actionIdsIn(target: unknown): string[] {
  if (typeof target === 'string') return [target];
  if (Array.isArray(target)) return target.flatMap((entry) => actionIdsIn(entry));
  if (target && typeof target === 'object') {
    const record = target as Record<string, unknown>;
    return actionIdsIn(record['action'] ?? record['actionId'] ?? record['actions']);
  }
  return [];
}

/**
 * What one action does, in a sentence.
 *
 * Written per kind rather than generically, because the useful sentence differs entirely: a navigate
 * is about a destination, a setFilter about a channel and a value, an export about a format. A generic
 * "action of kind setFilter with 3 properties" would be true and useless.
 */
export function describeAction(action: Action): string {
  switch (action.kind) {
    case 'navigate': {
      const where = [action.target.experience, action.target.page, action.target.tab]
        .filter(Boolean)
        .join(' / ');
      const params = paramsOf(action.params);
      return (
        `Open ${where}` +
        (params ? ` with ${params}` : '') +
        (action.openIn && action.openIn !== 'self' ? ` in a ${action.openIn}` : '') +
        (action.carryContext ? ', carrying the current filters' : '')
      );
    }
    case 'drilldown': {
      const key = paramsOf(action.key);
      return (
        `Drill into ${action.entity}` +
        (key ? ` on ${key}` : '') +
        (action.targetOverride?.page ? `, at ${action.targetOverride.page}` : ', at its default page')
      );
    }
    case 'setFilter':
      return `Set the "${action.channel}" filter to ${formatValue(action.value)}${
        action.mode && action.mode !== 'replace' ? ` (${action.mode})` : ''
      }`;
    case 'clearFilters':
      return action.channels?.length
        ? `Clear the ${action.channels.map((c) => `"${c}"`).join(', ')} filter(s)`
        : 'Clear every filter on the page';
    case 'setParameter':
      return `Set the "${action.parameter}" parameter to ${formatValue(action.value)}${
        action.updateUrl === false ? '' : ', and update the URL'
      }`;
    case 'setSelection':
      return action.mode === 'clear'
        ? `Clear the "${action.channel}" selection`
        : `Set the "${action.channel}" selection to ${formatValue(action.value)}`;
    case 'refresh':
      return action.dataSources?.length
        ? `Re-query ${action.dataSources.join(', ')}${action.bypassCache ? ', bypassing the cache' : ''}`
        : 'Re-query every source on the page';
    case 'export':
      return `Export ${action.dataSource} as ${action.format.toUpperCase()}${
        action.scope === 'all' ? ' (all rows, not just the current view)' : ''
      }`;
    case 'openUrl':
      return `Open ${action.urlTemplate}${action.target === 'newTab' ? ' in a new tab' : ''}`;
    case 'openOverlay':
      return `Open the "${action.overlay}" overlay`;
    case 'composite':
      return `Run ${action.steps.length} step(s) in order: ${action.steps.join(' → ')}${
        action.onError === 'continue' ? ', continuing past a failure' : ''
      }`;
    case 'invoke':
      return `RESERVED (v2 write-back): call the "${action.operation}" operation`;
    case 'workflow':
      return `RESERVED (v3 workflow): ${action.operation}`;
    default:
      // Exhaustive above; a new kind should show up as unknown rather than as nothing.
      return `Unrecognised action kind "${(action as { kind: string }).kind}"`;
  }
}

function paramsOf(params: Readonly<Record<string, unknown>> | undefined): string {
  if (!params) return '';
  return Object.entries(params)
    .map(([key, value]) => `${key}=${formatValue(value)}`)
    .join(', ');
}

// ── page-level aspects ───────────────────────────────────────────────────────────────

export interface AspectCounts {
  components: number;
  dataSources: number;
  actions: number;
  parameters: number;
  filters: number;
  selections: number;
  /** Sources nothing reads, and actions nothing reaches. Both cost something and show nothing. */
  orphanSources: number;
  unreachableActions: number;
}

/**
 * What each tab has in it, for the badges on the tab strip.
 *
 * The two "orphan" counts are the reason this is worth computing eagerly: they are the only numbers
 * here an author would want to act on, and they are invisible everywhere else in the product.
 */
export function aspectCounts(definition: PageDefinition | null): AspectCounts {
  if (!definition) {
    return {
      components: 0,
      dataSources: 0,
      actions: 0,
      parameters: 0,
      filters: 0,
      selections: 0,
      orphanSources: 0,
      unreachableActions: 0,
    };
  }
  const sources = summariseSources(definition);
  const actions = summariseActions(definition);
  return {
    components: Object.keys(definition.components).length,
    dataSources: sources.length,
    actions: actions.length,
    parameters: Object.keys(definition.parameters ?? {}).length,
    filters: Object.keys(definition.filters ?? {}).length,
    selections: Object.keys(definition.selections ?? {}).length,
    orphanSources: sources.filter((source) => source.orphan).length,
    unreachableActions: actions.filter((action) => action.unreachable).length,
  };
}
