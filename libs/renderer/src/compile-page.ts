/**
 * Page compilation: definition → immutable CompiledPage plan.
 *
 * The most important performance decision in the runtime
 * (architecture/runtime-architecture.md §5): compilation depends only on the
 * definition, so it is memoized per definition version. Published versions are
 * immutable, so that cache can never be stale. Re-rendering, navigating away and
 * back, or changing a filter does not recompile.
 *
 * The payoff is the DEPENDENCY GRAPH. Derived statically by walking the JSON — no
 * expression is executed and no query is issued — it tells the runtime exactly
 * which data sources a given filter change invalidates. Without it the only safe
 * behaviour on any state change is to re-query everything, which is what makes
 * comparable dashboards feel slow.
 */

import {
  isExpression,
  isFilterRef,
  isParamRef,
  isSelectionRef,
  text,
  type ComponentInstance,
  type ComputableValue,
  type Container,
  type DataSource,
  type GridPlacement,
  type Identifier,
  type LayoutNode,
  type PageDefinition,
  type StaticTab,
} from '@opus/contracts';
import { compileCached, type CompiledExpression } from '@opus/platform';

export interface SourceDependencies {
  params: readonly string[];
  filters: readonly string[];
  selections: readonly string[];
  /** True when the source's inputs are all constant — it need only ever run once. */
  static: boolean;
}

export interface CompiledTab {
  id: Identifier;
  label: string;
  icon?: string;
  deepLinkId: string;
  badge?: ComputableValue;
  visible?: CompiledExpression;
  content: readonly CompiledNode[];
}

export interface CompiledContainer {
  spec: Container;
  children: readonly CompiledNode[];
  primary?: readonly CompiledNode[];
  secondary?: readonly CompiledNode[];
  tabs?: readonly CompiledTab[];
  template?: readonly CompiledNode[];
}

export type CompiledNode =
  | {
      kind: 'widget';
      id: Identifier;
      componentId: Identifier;
      placement?: GridPlacement;
      visible?: CompiledExpression;
    }
  | { kind: 'spacer'; id: Identifier; placement?: GridPlacement }
  | {
      kind: 'container';
      id: Identifier;
      container: CompiledContainer;
      placement?: GridPlacement;
      visible?: CompiledExpression;
    };

export interface CompiledPage {
  definition: PageDefinition;
  /** Memoization key: page id plus artifact version. */
  cacheKey: string;
  layout: CompiledNode;
  overlays: Readonly<Record<Identifier, CompiledNode>>;
  dependencies: Readonly<Record<Identifier, SourceDependencies>>;
  /** Sources in the first batch. */
  eagerSources: readonly Identifier[];
  /** Sources that wait for their consumer to become visible. */
  deferredSources: readonly Identifier[];
  /** Data sources each widget consumes, so a widget's state follows its queries. */
  widgetSources: Readonly<Record<Identifier, readonly Identifier[]>>;
  /** Widgets consuming each source — the reverse index, used when results arrive. */
  sourceWidgets: Readonly<Record<Identifier, readonly Identifier[]>>;
  compileMs: number;
}

const compileCache = new Map<string, CompiledPage>();

export function compilePage(
  definition: PageDefinition,
  options: { useCache?: boolean } = {},
): { page: CompiledPage; cacheHit: boolean } {
  const cacheKey = `${definition.id}@${definition.version.artifactVersion}`;
  if (options.useCache !== false) {
    const cached = compileCache.get(cacheKey);
    if (cached) return { page: cached, cacheHit: true };
  }

  const startedAt = performance.now();

  const layout = compileNode(definition.layout);
  const overlays = Object.fromEntries(
    Object.entries(definition.overlays ?? {}).map(([id, node]) => [id, compileNode(node)]),
  );

  const dependencies = buildDependencyGraph(definition);
  const { widgetSources, sourceWidgets } = buildSourceIndex(definition);
  const { eager, deferred } = partitionSources(definition, layout);

  const page: CompiledPage = {
    definition,
    cacheKey,
    layout,
    overlays,
    dependencies,
    eagerSources: eager,
    deferredSources: deferred,
    widgetSources,
    sourceWidgets,
    compileMs: performance.now() - startedAt,
  };

  compileCache.set(cacheKey, page);
  return { page, cacheHit: false };
}

export function clearCompileCache(): void {
  compileCache.clear();
}

// ── layout ──────────────────────────────────────────────────────────────────

function compileNode(node: LayoutNode): CompiledNode {
  if (node.kind === 'widget') {
    return {
      kind: 'widget',
      id: node.id,
      componentId: node.component,
      placement: node.placement,
      visible: node.visible ? compileCached(node.visible.$expr) : undefined,
    };
  }
  if (node.kind === 'spacer') {
    return { kind: 'spacer', id: node.id, placement: node.placement };
  }
  return {
    kind: 'container',
    id: node.id,
    container: compileContainer(node.container),
    placement: node.placement,
    visible: node.visible ? compileCached(node.visible.$expr) : undefined,
  };
}

function compileContainer(container: Container): CompiledContainer {
  switch (container.type) {
    case 'grid':
    case 'stack':
    case 'panel':
    case 'drawer':
      return { spec: container, children: container.children.map(compileNode) };
    case 'split':
      return {
        spec: container,
        children: [],
        primary: container.primary.map(compileNode),
        secondary: container.secondary.map(compileNode),
      };
    case 'tabs': {
      const source = container.source;
      if (source.mode === 'static') {
        return { spec: container, children: [], tabs: source.tabs.map(compileTab) };
      }
      return {
        spec: container,
        children: [],
        tabs: (source.pinnedTabs ?? []).map(compileTab),
        template: source.template.map(compileNode),
      };
    }
    case 'repeater':
      return { spec: container, children: [], template: container.template.map(compileNode) };
  }
}

function compileTab(tab: StaticTab): CompiledTab {
  return {
    id: tab.id,
    label: text(tab.label),
    icon: tab.icon,
    deepLinkId: tab.deepLinkId ?? tab.id,
    badge: tab.badge,
    visible: tab.visible ? compileCached(tab.visible.$expr) : undefined,
    content: tab.content.map(compileNode),
  };
}

// ── dependency graph ────────────────────────────────────────────────────────

/**
 * Walk each data source's JSON for the analysable wrappers ($param, $filter,
 * $selection) and for expression references. This is why those wrappers exist as
 * distinct forms rather than one general expression: the graph falls out of a JSON
 * walk, with no parsing on the hot path.
 */
function buildDependencyGraph(
  definition: PageDefinition,
): Record<Identifier, SourceDependencies> {
  const out: Record<Identifier, SourceDependencies> = {};

  for (const [id, source] of Object.entries(definition.dataSources ?? {})) {
    const params = new Set<string>();
    const filters = new Set<string>();
    const selections = new Set<string>();

    walkValues(source, (value) => {
      if (isParamRef(value)) params.add(value.$param);
      else if (isFilterRef(value)) filters.add(value.$filter);
      else if (isSelectionRef(value)) selections.add(value.$selection);
      else if (isExpression(value)) {
        for (const ref of compileCached(value.$expr).references) {
          if (ref.root === 'params' && ref.name) params.add(ref.name);
          if (ref.root === 'filters' && ref.name) filters.add(ref.name);
          if (ref.root === 'selections' && ref.name) selections.add(ref.name);
        }
      }
    });

    out[id] = {
      params: [...params],
      filters: [...filters],
      selections: [...selections],
      static: params.size === 0 && filters.size === 0 && selections.size === 0,
    };
  }

  return out;
}

/** Which sources a change to a given channel invalidates. */
export function sourcesAffectedBy(
  page: CompiledPage,
  change: { params?: readonly string[]; filters?: readonly string[]; selections?: readonly string[] },
): Identifier[] {
  const affected: Identifier[] = [];
  for (const [sourceId, deps] of Object.entries(page.dependencies)) {
    const hit =
      (change.params ?? []).some((p) => deps.params.includes(p)) ||
      (change.filters ?? []).some((f) => deps.filters.includes(f)) ||
      (change.selections ?? []).some((s) => deps.selections.includes(s));
    if (hit) affected.push(sourceId);
  }
  return affected;
}

// ── source indexes ──────────────────────────────────────────────────────────

function sourcesOfComponent(instance: ComponentInstance): Identifier[] {
  const ids = new Set<Identifier>();
  if (instance.dataSource) ids.add(instance.dataSource);
  for (const value of Object.values(instance.bindings ?? {})) {
    const list = Array.isArray(value) ? value : [value];
    for (const binding of list) if (binding.source) ids.add(binding.source);
  }
  for (const encoding of instance.encodings ?? []) {
    if (encoding.binding.source) ids.add(encoding.binding.source);
  }
  return [...ids];
}

function buildSourceIndex(definition: PageDefinition): {
  widgetSources: Record<Identifier, readonly Identifier[]>;
  sourceWidgets: Record<Identifier, readonly Identifier[]>;
} {
  const widgetSources: Record<Identifier, readonly Identifier[]> = {};
  const sourceWidgets: Record<Identifier, Identifier[]> = {};

  for (const [id, instance] of Object.entries(definition.components)) {
    const sources = sourcesOfComponent(instance);
    widgetSources[id] = sources;
    for (const sourceId of sources) {
      (sourceWidgets[sourceId] ??= []).push(id);
    }
  }

  return { widgetSources, sourceWidgets };
}

/**
 * Eager / deferred partition. Sources consumed only from inside a deferred region
 * — a tab whose content defers — are deferred regardless of their own loadPolicy,
 * so a detail page with eight tabs does not issue eight queries to show one.
 *
 * The page's `maxEagerDataSources` budget applies here: excess sources are
 * DEFERRED, never dropped, and the deferral is recorded. Silent truncation would
 * make a page appear complete when it is not.
 */
function partitionSources(
  definition: PageDefinition,
  layout: CompiledNode,
): { eager: Identifier[]; deferred: Identifier[] } {
  const allSources = Object.keys(definition.dataSources ?? {});
  const deferredByRegion = new Set<Identifier>();

  const componentSources = new Map<Identifier, Identifier[]>(
    Object.entries(definition.components).map(([id, instance]) => [id, sourcesOfComponent(instance)]),
  );

  const collectWidgetSources = (node: CompiledNode, into: Set<Identifier>): void => {
    if (node.kind === 'widget') {
      for (const s of componentSources.get(node.componentId) ?? []) into.add(s);
      return;
    }
    if (node.kind === 'spacer') return;
    const c = node.container;
    for (const child of [
      ...c.children,
      ...(c.primary ?? []),
      ...(c.secondary ?? []),
      ...(c.template ?? []),
      ...(c.tabs ?? []).flatMap((t) => t.content),
    ]) {
      collectWidgetSources(child, into);
    }
  };

  const walkForDeferral = (node: CompiledNode): void => {
    if (node.kind !== 'container') return;
    const spec = node.container.spec;
    const deferred =
      (spec.type === 'tabs' && spec.deferContent !== false) ||
      spec.type === 'drawer';

    if (deferred) {
      const inRegion = new Set<Identifier>();
      // The first static tab renders immediately, so its sources stay eager.
      const tabs = node.container.tabs ?? [];
      tabs.slice(1).forEach((t) => t.content.forEach((c) => collectWidgetSources(c, inRegion)));
      (node.container.template ?? []).forEach((c) => collectWidgetSources(c, inRegion));
      if (spec.type === 'drawer') {
        node.container.children.forEach((c) => collectWidgetSources(c, inRegion));
      }
      for (const s of inRegion) deferredByRegion.add(s);
    }

    const c = node.container;
    for (const child of [
      ...c.children,
      ...(c.primary ?? []),
      ...(c.secondary ?? []),
      ...(c.template ?? []),
      ...(c.tabs ?? []).flatMap((t) => t.content),
    ]) {
      walkForDeferral(child);
    }
  };

  walkForDeferral(layout);

  const eager: Identifier[] = [];
  const deferred: Identifier[] = [];

  for (const id of allSources) {
    const source = definition.dataSources![id]!;
    const policy = source.loadPolicy ?? 'eager';
    if (policy !== 'eager' || deferredByRegion.has(id)) deferred.push(id);
    else eager.push(id);
  }

  const budget = definition.performance?.maxEagerDataSources;
  if (budget && eager.length > budget) {
    deferred.push(...eager.splice(budget));
  }

  return { eager, deferred };
}

// ── traversal ───────────────────────────────────────────────────────────────

function walkValues(node: unknown, visit: (value: object) => void): void {
  if (Array.isArray(node)) {
    for (const item of node) walkValues(item, visit);
    return;
  }
  if (node === null || typeof node !== 'object') return;
  if (isParamRef(node) || isFilterRef(node) || isSelectionRef(node) || isExpression(node)) {
    visit(node);
    return;
  }
  for (const value of Object.values(node)) walkValues(value, visit);
}

/** Resolve which data source ids a source's declarative parameters need. */
export function dataSourceIds(definition: PageDefinition): Identifier[] {
  return Object.keys(definition.dataSources ?? {});
}

export function sourceById(
  definition: PageDefinition,
  id: Identifier,
): DataSource | undefined {
  return definition.dataSources?.[id];
}
