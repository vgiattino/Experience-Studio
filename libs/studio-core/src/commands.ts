/**
 * The editing vocabulary: every mutation the builder can make, as a function from the current
 * definition to a JSON Patch.
 *
 * This file is the reason the architecture's claim in §4.3 is true rather than aspirational.
 * A command is pure — definition in, patch out — which means:
 *
 *   - dragging a widget, editing a property and an AI refinement all arrive at the store as a
 *     patch, and the store cannot tell them apart;
 *   - undo is the inverse patch, so it works identically across all three;
 *   - a command is testable without a DOM, a store, or Angular.
 *
 * ONE COMMAND IS ONE PATCH, EVEN WHEN IT TOUCHES SEVERAL PLACES. Deleting a widget removes its
 * layout node, its component instance, and its data source if nothing else reads it — as a
 * single patch, so one undo restores all three. Emitting three patches would make the user
 * press undo three times to reverse one action they think of as one action, and would leave
 * the definition briefly invalid between them.
 *
 * NO COMMAND INVENTS A SEPARATE MODEL. Every path is a pointer into the page definition the
 * runtime interprets.
 */

import type {
  ComponentInstance,
  ComponentManifest,
  ComponentTypeRef,
  Container,
  DataSource,
  Gap,
  Identifier,
  LayoutNode,
  PageDefinition,
} from '@opus/contracts';

import { parsePointer, pointer, type PatchOp } from './json-patch';
import { referencesTo } from './describe';
import {
  childListsOf,
  locateNode,
  referencedComponentIds,
  referencedDataSourceIds,
  walkLayout,
  wouldCreateCycle,
} from './layout-tree';

/** A command result: the patch, plus what to select afterwards and what to call it in history. */
export interface CommandResult {
  label: string;
  ops: PatchOp[];
  /** Node to select once applied. `null` clears selection. */
  select?: Identifier | null;
}

/** A command that cannot be performed, with a reason a user can act on. */
export interface CommandRefusal {
  label: string;
  refused: string;
}

export type Command = CommandResult | CommandRefusal;

export function isRefusal(command: Command): command is CommandRefusal {
  return 'refused' in command;
}

// ── id generation ────────────────────────────────────────────────────────────────────

/**
 * A readable, stable, kebab-case id derived from a base, unique within the definition.
 *
 * Ids are user-visible: they appear in the outline, in the JSON view, in validation messages
 * and in URLs for deep-linked tabs. `kpi-card-2` is a name a person can find in a diff;
 * a uuid is not. The identifier pattern in `common.schema.json` requires kebab-case anyway.
 */
export function uniqueId(base: string, taken: ReadonlySet<string>): Identifier {
  const slug =
    base
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .replace(/-{2,}/g, '-') || 'item';
  if (!taken.has(slug)) return slug;
  for (let n = 2; ; n++) {
    const candidate = `${slug}-${n}`;
    if (!taken.has(candidate)) return candidate;
  }
}

function allIds(definition: PageDefinition): Set<string> {
  const ids = new Set<string>(Object.keys(definition.components));
  for (const id of Object.keys(definition.dataSources ?? {})) ids.add(id);
  for (const id of Object.keys(definition.actions ?? {})) ids.add(id);
  const walk = (node: LayoutNode): void => {
    ids.add(node.id);
    if (node.kind === 'container') {
      for (const list of childListsOf(node.container)) list.nodes.forEach(walk);
    }
  };
  walk(definition.layout);
  return ids;
}

/** Defaults from the manifest's property schema, so a new widget is configured, not blank. */
export function defaultConfigFor(manifest: ComponentManifest): Record<string, unknown> {
  const schema = manifest.properties as {
    properties?: Record<string, { default?: unknown }>;
  };
  const config: Record<string, unknown> = {};
  for (const [key, property] of Object.entries(schema.properties ?? {})) {
    if (property && typeof property === 'object' && 'default' in property) {
      config[key] = property.default;
    }
  }
  return config;
}

const FULL_WIDTH = { colStart: 1, colSpan: 12 } as const;

/** A KPI is a quarter-width card on a desktop and full width on a phone — mobile-first. */
const KPI_PLACEMENT = {
  colSpan: 12,
  breakpoints: { sm: { colSpan: 6 }, lg: { colSpan: 3 } },
} as const;

// ── structural commands ──────────────────────────────────────────────────────────────

export interface AddWidgetInput {
  manifest: ComponentManifest;
  /** Container node to add into. Defaults to the root. */
  parentId?: Identifier;
  /** Index within the container's child list. Appends when omitted. */
  index?: number;
  /** Which child list, for a container that has more than one. */
  listPath?: string;
}

export function addWidget(definition: PageDefinition, input: AddWidgetInput): Command {
  const parentId = input.parentId ?? definition.layout.id;
  const parent = locateNode(definition, parentId);
  if (!parent) return { label: 'Add component', refused: `No node "${parentId}"` };
  if (parent.node.kind !== 'container') {
    return { label: 'Add component', refused: 'Components can only be added inside a container' };
  }

  const lists = childListsOf(parent.node.container);
  const list = input.listPath ? lists.find((l) => l.path === input.listPath) : lists[0];
  if (!list) return { label: 'Add component', refused: 'That container has nowhere to put a component' };

  const taken = allIds(definition);
  const shortType = input.manifest.type.split('.').pop() ?? 'widget';
  const componentId = uniqueId(shortType, taken);
  taken.add(componentId);
  const nodeId = uniqueId(`w-${componentId}`, taken);

  const component: ComponentInstance = {
    id: componentId,
    type: input.manifest.type,
    typeVersion: input.manifest.version,
    title: nameOf(input.manifest),
    ...(Object.keys(defaultConfigFor(input.manifest)).length
      ? { config: defaultConfigFor(input.manifest) }
      : {}),
  };

  const node: LayoutNode = {
    kind: 'widget',
    id: nodeId,
    component: componentId,
    placement:
      input.manifest.dataRequirement.shape === 'scalar'
        ? { ...KPI_PLACEMENT }
        : { ...FULL_WIDTH },
  };

  const index = input.index ?? list.nodes.length;
  return {
    label: `Add ${textOf(nameOf(input.manifest))}`,
    select: nodeId,
    ops: [
      { op: 'add', path: pointer('components', componentId), value: component },
      { op: 'add', path: `${parent.path}${list.path}${pointer(index)}`, value: node },
    ],
  };
}

export function addContainer(
  definition: PageDefinition,
  input: { type: Container['type']; parentId?: Identifier; index?: number; listPath?: string },
): Command {
  const parentId = input.parentId ?? definition.layout.id;
  const parent = locateNode(definition, parentId);
  if (!parent || parent.node.kind !== 'container') {
    return { label: 'Add container', refused: 'Containers can only be added inside a container' };
  }
  const lists = childListsOf(parent.node.container);
  const list = input.listPath ? lists.find((l) => l.path === input.listPath) : lists[0];
  if (!list) return { label: 'Add container', refused: 'That container has nowhere to put a child' };

  const nodeId = uniqueId(input.type, allIds(definition));
  const node: LayoutNode = {
    kind: 'container',
    id: nodeId,
    container: emptyContainer(input.type),
    placement: { ...FULL_WIDTH },
  };

  return {
    label: `Add ${input.type}`,
    select: nodeId,
    ops: [
      {
        op: 'add',
        path: `${parent.path}${list.path}${pointer(input.index ?? list.nodes.length)}`,
        value: node,
      },
    ],
  };
}

export function addSpacer(
  definition: PageDefinition,
  input: { parentId?: Identifier; index?: number } = {},
): Command {
  const parentId = input.parentId ?? definition.layout.id;
  const parent = locateNode(definition, parentId);
  if (!parent || parent.node.kind !== 'container') {
    return { label: 'Add spacer', refused: 'A spacer needs a container' };
  }
  const list = childListsOf(parent.node.container)[0];
  if (!list) return { label: 'Add spacer', refused: 'That container has nowhere to put a spacer' };
  const nodeId = uniqueId('spacer', allIds(definition));
  return {
    label: 'Add spacer',
    select: nodeId,
    ops: [
      {
        op: 'add',
        path: `${parent.path}${list.path}${pointer(input.index ?? list.nodes.length)}`,
        value: { kind: 'spacer', id: nodeId, placement: { ...FULL_WIDTH } },
      },
    ],
  };
}

/**
 * Remove a node, and with it anything that existed only to serve it.
 *
 * The cascade is the point. A widget's component instance and its data source are not
 * independently meaningful, so leaving them behind produces a definition carrying invisible
 * state: unreferenced components that validation flags, and data sources the runtime still
 * queries on every render, costing a round trip for a widget that no longer exists.
 */
export function removeNode(definition: PageDefinition, nodeId: Identifier): Command {
  const located = locateNode(definition, nodeId);
  if (!located) return { label: 'Delete', refused: `No node "${nodeId}"` };
  if (located.listPath === undefined) {
    return { label: 'Delete', refused: 'The root layout cannot be deleted' };
  }

  const ops: PatchOp[] = [{ op: 'remove', path: located.path }];

  // What the removal orphans is computed against the definition AFTER the node is gone,
  // because a component may be referenced from more than one node.
  const remaining = structuredClone(definition) as PageDefinition;
  const survivor = removeFromTree(remaining, nodeId);
  if (survivor) {
    const stillUsedComponents = referencedComponentIds(remaining);
    const orphanComponents = Object.keys(definition.components).filter(
      (id) => !stillUsedComponents.has(id),
    );
    for (const id of orphanComponents) {
      ops.push({ op: 'remove', path: pointer('components', id) });
      delete (remaining.components as Record<string, ComponentInstance>)[id];
    }
    const stillUsedSources = referencedDataSourceIds(remaining);
    for (const id of Object.keys(definition.dataSources ?? {})) {
      if (!stillUsedSources.has(id)) ops.push({ op: 'remove', path: pointer('dataSources', id) });
    }
  }

  return { label: 'Delete', select: null, ops };
}

/** Mutating helper used only on a throwaway clone, to compute what a removal orphans. */
function removeFromTree(definition: PageDefinition, nodeId: Identifier): boolean {
  const visit = (node: LayoutNode): boolean => {
    if (node.kind !== 'container') return false;
    for (const list of childListsOf(node.container)) {
      const array = resolveMutableList(node, list.path);
      if (!array) continue;
      const index = array.findIndex((child) => child.id === nodeId);
      if (index >= 0) {
        array.splice(index, 1);
        return true;
      }
      for (const child of array) if (visit(child)) return true;
    }
    return false;
  };
  return visit(definition.layout);
}

function resolveMutableList(node: LayoutNode, listPath: string): LayoutNode[] | undefined {
  let current: unknown = node;
  for (const segment of listPath.split('/').filter(Boolean)) {
    if (current === null || typeof current !== 'object') return undefined;
    current = (current as Record<string, unknown>)[segment];
  }
  return Array.isArray(current) ? (current as LayoutNode[]) : undefined;
}

export interface MoveNodeInput {
  nodeId: Identifier;
  targetParentId: Identifier;
  index: number;
  listPath?: string;
}

/**
 * Move a node. Expressed as remove-then-add rather than a `move` op, because the destination
 * index a user means is an index in the list *as they see it*, and a raw `move` leaves the
 * caller to reason about whether the removal shifted it.
 */
export function moveNode(definition: PageDefinition, input: MoveNodeInput): Command {
  const located = locateNode(definition, input.nodeId);
  if (!located) return { label: 'Move', refused: `No node "${input.nodeId}"` };
  if (located.listPath === undefined) return { label: 'Move', refused: 'The root cannot be moved' };

  const parent = locateNode(definition, input.targetParentId);
  if (!parent || parent.node.kind !== 'container') {
    return { label: 'Move', refused: 'A node can only move into a container' };
  }
  if (wouldCreateCycle(definition, input.nodeId, input.targetParentId)) {
    return { label: 'Move', refused: 'A container cannot be placed inside itself' };
  }

  const lists = childListsOf(parent.node.container);
  const list = input.listPath ? lists.find((l) => l.path === input.listPath) : lists[0];
  if (!list) return { label: 'Move', refused: 'That container has nowhere to put it' };

  const destinationList = `${parent.path}${list.path}`;
  let index = Math.max(0, Math.min(input.index, list.nodes.length));

  // Same list, moving down: the removal shifts everything after it left by one.
  if (located.listPath === destinationList && located.index !== undefined && located.index < index) {
    index -= 1;
  }
  if (located.listPath === destinationList && index === located.index) {
    return { label: 'Move', refused: 'Already there' };
  }

  return {
    label: 'Move',
    select: input.nodeId,
    ops: [
      { op: 'remove', path: located.path },
      { op: 'add', path: `${destinationList}${pointer(index)}`, value: located.node },
    ],
  };
}

export function duplicateNode(definition: PageDefinition, nodeId: Identifier): Command {
  const located = locateNode(definition, nodeId);
  if (!located || located.listPath === undefined || located.index === undefined) {
    return { label: 'Duplicate', refused: 'That node cannot be duplicated' };
  }

  const taken = allIds(definition);
  const ops: PatchOp[] = [];

  // Every id inside the copy must be fresh, and every internal reference rewritten to match.
  // A duplicate sharing component ids would look right until the first property edit changed
  // both copies at once.
  const clone = cloneWithFreshIds(definition, located.node, taken, ops);

  ops.push({
    op: 'add',
    path: `${located.listPath}${pointer(located.index + 1)}`,
    value: clone,
  });

  return { label: 'Duplicate', select: clone.id, ops };
}

function cloneWithFreshIds(
  definition: PageDefinition,
  node: LayoutNode,
  taken: Set<string>,
  ops: PatchOp[],
): LayoutNode {
  const nodeId = uniqueId(`${node.id}-copy`, taken);
  taken.add(nodeId);

  if (node.kind === 'spacer') return { ...node, id: nodeId };

  if (node.kind === 'widget') {
    const source = definition.components[node.component];
    if (!source) return { ...node, id: nodeId };
    const componentId = uniqueId(`${node.component}-copy`, taken);
    taken.add(componentId);
    ops.push({
      op: 'add',
      path: pointer('components', componentId),
      // The data source is shared, not copied: two widgets over the same query is normal and
      // desirable, and duplicating the source would double the page's round trips.
      value: { ...structuredClone(source), id: componentId },
    });
    return { ...node, id: nodeId, component: componentId };
  }

  const container = structuredClone(node.container) as Container;
  for (const list of childListsOf(node.container)) {
    const target = resolveMutableList({ ...node, container } as LayoutNode, list.path);
    if (!target) continue;
    const copies = list.nodes.map((child) => cloneWithFreshIds(definition, child, taken, ops));
    target.splice(0, target.length, ...copies);
  }
  return { ...node, id: nodeId, container };
}

/**
 * Wrap a node in a new container, in place.
 *
 * The operation a user reaches for when a page needs structure it was not built with — "put
 * these two in a panel". Doing it by hand means add container, move node, fix placement, three
 * undos to reverse.
 */
export function wrapInContainer(
  definition: PageDefinition,
  nodeId: Identifier,
  type: Container['type'],
): Command {
  const located = locateNode(definition, nodeId);
  if (!located || located.listPath === undefined || located.index === undefined) {
    return { label: 'Wrap', refused: 'That node cannot be wrapped' };
  }

  const wrapperId = uniqueId(type, allIds(definition));
  const inner: LayoutNode = { ...located.node, placement: { colStart: 1, colSpan: 12 } };
  const wrapper: LayoutNode = {
    kind: 'container',
    id: wrapperId,
    container: withChildren(emptyContainer(type), [inner]),
    placement: located.node.placement ? structuredClone(located.node.placement) : { ...FULL_WIDTH },
  };

  return {
    label: `Wrap in ${type}`,
    select: wrapperId,
    ops: [
      { op: 'remove', path: located.path },
      { op: 'add', path: `${located.listPath}${pointer(located.index)}`, value: wrapper },
    ],
  };
}

/**
 * Change a container's type while keeping its children.
 *
 * Containers differ in where children live, so this is not a property edit: turning a grid
 * into a split has to decide what "primary" means. Children go to the first list of the new
 * type and nothing is dropped, because silently discarding a user's widgets is never the
 * right answer to a layout change.
 */
export function setContainerType(
  definition: PageDefinition,
  nodeId: Identifier,
  type: Container['type'],
): Command {
  const located = locateNode(definition, nodeId);
  if (!located || located.node.kind !== 'container') {
    return { label: 'Change layout', refused: 'That node is not a container' };
  }
  if (located.node.container.type === type) {
    return { label: 'Change layout', refused: `Already a ${type}` };
  }

  const existing = childListsOf(located.node.container).flatMap((list) => [...list.nodes]);
  if ((type === 'tabs' || type === 'repeater') && existing.length) {
    return {
      label: 'Change layout',
      refused: `A ${type} needs a data source and its own structure — add one and move these into it`,
    };
  }

  return {
    label: `Change layout to ${type}`,
    select: nodeId,
    ops: [
      {
        op: 'replace',
        path: `${located.path}/container`,
        value: withChildren(emptyContainer(type), existing),
      },
    ],
  };
}

function emptyContainer(type: Container['type']): Container {
  switch (type) {
    case 'grid':
      return { type: 'grid', columns: 12, gap: 'lg', children: [] };
    case 'stack':
      return { type: 'stack', direction: 'row', wrap: true, gap: 'md', children: [] };
    case 'panel':
      return { type: 'panel', title: 'Panel', variant: 'bordered', children: [] };
    case 'split':
      return { type: 'split', orientation: 'horizontal', initialRatio: 0.5, primary: [], secondary: [] };
    case 'drawer':
      return { type: 'drawer', title: 'Details', side: 'end', size: 'md', children: [] };
    case 'tabs':
      return { type: 'tabs', variant: 'underline', source: { mode: 'static', tabs: [] } };
    case 'repeater':
      return { type: 'repeater', source: '', keyField: '', template: [] };
  }
}

function withChildren(container: Container, children: readonly LayoutNode[]): Container {
  switch (container.type) {
    case 'grid':
    case 'stack':
    case 'panel':
    case 'drawer':
      return { ...container, children };
    case 'split':
      return { ...container, primary: children, secondary: [] };
    case 'repeater':
      return { ...container, template: children };
    case 'tabs':
      return container;
  }
}

// ── property commands ────────────────────────────────────────────────────────────────

/**
 * Set a value at a pointer, choosing the operation from whether the target exists.
 *
 * `replace` on a missing member and `add` on the document root both fail, and an editor cannot
 * know which case it is in without looking — the value being edited may be a property the
 * author has never set. Undefined removes, so clearing an optional field returns the
 * definition to its default rather than storing a null the schema forbids.
 */
export function setValue(
  definition: PageDefinition,
  path: string,
  value: unknown,
  label: string,
  select?: Identifier | null,
): Command {
  const exists = pointerExists(definition, path);
  if (value === undefined || value === '') {
    if (!exists) return { label, refused: 'Nothing to clear' };
    return { label, ops: [{ op: 'remove', path }], select };
  }
  return { label, ops: [{ op: exists ? 'replace' : 'add', path, value }], select };
}

function pointerExists(definition: PageDefinition, path: string): boolean {
  const segments = path.split('/').filter(Boolean);
  let current: unknown = definition;
  for (const raw of segments) {
    const segment = raw.replace(/~1/g, '/').replace(/~0/g, '~');
    if (current === null || typeof current !== 'object') return false;
    if (Array.isArray(current)) {
      const index = Number(segment);
      if (!Number.isInteger(index) || index < 0 || index >= current.length) return false;
      current = current[index];
    } else {
      if (!Object.prototype.hasOwnProperty.call(current, segment)) return false;
      current = (current as Record<string, unknown>)[segment];
    }
  }
  return true;
}

export function setComponentConfig(
  definition: PageDefinition,
  componentId: Identifier,
  property: string,
  value: unknown,
): Command {
  const component = definition.components[componentId];
  if (!component) return { label: 'Set property', refused: `No component "${componentId}"` };
  const ops: PatchOp[] = [];
  // `config` is optional, so the first property set on a component has to create the object.
  if (!component.config) {
    ops.push({ op: 'add', path: pointer('components', componentId, 'config'), value: {} });
  }
  const path = pointer('components', componentId, 'config', property);
  if (value === undefined || value === '') {
    if (component.config && property in component.config) {
      return { label: `Clear ${property}`, ops: [{ op: 'remove', path }] };
    }
    return { label: `Clear ${property}`, refused: 'Nothing to clear' };
  }
  const exists = Boolean(component.config && property in component.config);
  ops.push({ op: exists ? 'replace' : 'add', path, value });
  return { label: `Set ${property}`, ops };
}

/** Placement, at the base or at one breakpoint. Mobile-first, as `common.schema.json` states. */
export function setPlacement(
  definition: PageDefinition,
  nodeId: Identifier,
  key: 'colStart' | 'colSpan' | 'rowSpan' | 'order' | 'minHeight' | 'hidden',
  value: unknown,
  breakpoint?: 'xs' | 'sm' | 'md' | 'lg' | 'xl',
): Command {
  const located = locateNode(definition, nodeId);
  if (!located) return { label: 'Set placement', refused: `No node "${nodeId}"` };

  const ops: PatchOp[] = [];
  const placement = (located.node as { placement?: Record<string, unknown> }).placement;
  if (!placement) {
    ops.push({ op: 'add', path: `${located.path}/placement`, value: {} });
  }

  if (!breakpoint) {
    const path = `${located.path}/placement/${key}`;
    const exists = Boolean(placement && key in placement);
    if (value === undefined || value === '') {
      if (!exists) return { label: `Set ${key}`, refused: 'Nothing to clear' };
      return { label: `Clear ${key}`, ops: [{ op: 'remove', path }], select: nodeId };
    }
    ops.push({ op: exists ? 'replace' : 'add', path, value });
    return { label: `Set ${key}`, ops, select: nodeId };
  }

  const breakpoints = placement?.['breakpoints'] as Record<string, unknown> | undefined;
  if (!breakpoints) {
    ops.push({ op: 'add', path: `${located.path}/placement/breakpoints`, value: {} });
  }
  const override = breakpoints?.[breakpoint] as Record<string, unknown> | undefined;
  if (!override) {
    ops.push({ op: 'add', path: `${located.path}/placement/breakpoints/${breakpoint}`, value: {} });
  }
  const path = `${located.path}/placement/breakpoints/${breakpoint}/${key}`;
  if (value === undefined || value === '') {
    if (!override || !(key in override)) {
      return { label: `Set ${key} at ${breakpoint}`, refused: 'Nothing to clear' };
    }
    return { label: `Clear ${key} at ${breakpoint}`, ops: [{ op: 'remove', path }], select: nodeId };
  }
  ops.push({ op: override && key in override ? 'replace' : 'add', path, value });
  return { label: `Set ${key} at ${breakpoint}`, ops, select: nodeId };
}

export function setContainerOption(
  definition: PageDefinition,
  nodeId: Identifier,
  key: string,
  value: unknown,
): Command {
  const located = locateNode(definition, nodeId);
  if (!located || located.node.kind !== 'container') {
    return { label: 'Set option', refused: 'That node is not a container' };
  }
  return setValue(
    definition,
    `${located.path}/container/${key}`,
    value,
    `Set ${key}`,
    nodeId,
  );
}

export function setGap(definition: PageDefinition, nodeId: Identifier, gap: Gap): Command {
  return setContainerOption(definition, nodeId, 'gap', gap);
}

// ── data binding ─────────────────────────────────────────────────────────────────────

/**
 * Point a component at one of the page's data sources, and give it bindings that match the
 * component's declared roles.
 *
 * A component with a data source but no bindings renders empty, which reads as a broken
 * widget rather than an unfinished one — so attaching a source seeds the required roles from
 * the source's own aliases. The manifest says which roles exist and what they accept; the
 * source says which aliases are available; the intersection is a working first binding the
 * author can then adjust.
 */
export function attachDataSource(
  definition: PageDefinition,
  componentId: Identifier,
  dataSourceId: Identifier | undefined,
  manifest: ComponentManifest | undefined,
): Command {
  const component = definition.components[componentId];
  if (!component) return { label: 'Set data', refused: `No component "${componentId}"` };

  if (!dataSourceId) {
    const ops: PatchOp[] = [];
    if (component.dataSource) ops.push({ op: 'remove', path: pointer('components', componentId, 'dataSource') });
    if (component.bindings) ops.push({ op: 'remove', path: pointer('components', componentId, 'bindings') });
    if (!ops.length) return { label: 'Clear data', refused: 'Nothing to clear' };
    return { label: 'Clear data', ops };
  }

  const source = definition.dataSources?.[dataSourceId];
  if (!source) return { label: 'Set data', refused: `No data source "${dataSourceId}"` };

  const ops: PatchOp[] = [
    {
      op: component.dataSource ? 'replace' : 'add',
      path: pointer('components', componentId, 'dataSource'),
      value: dataSourceId,
    },
  ];

  const aliases = aliasesOf(source);
  const roles = manifest?.dataRequirement.roles ?? [];
  if (aliases.length && roles.length) {
    const bindings: Record<string, unknown> = {};
    for (const role of roles) {
      if (role.repeated) {
        bindings[role.role] = aliases.map((alias) => ({ field: alias }));
      } else {
        const first = aliases[0];
        if (first) bindings[role.role] = { field: first };
      }
      // Only the required roles are seeded. Filling optional roles with whatever alias came
      // first produces widgets carrying bindings the author never asked for.
      if (!role.required) delete bindings[role.role];
    }
    if (Object.keys(bindings).length) {
      ops.push({
        op: component.bindings ? 'replace' : 'add',
        path: pointer('components', componentId, 'bindings'),
        value: bindings,
      });
    }
  }

  return { label: 'Set data source', ops };
}

function aliasesOf(source: DataSource): string[] {
  const select = source.select;
  return [
    ...(select.measures ?? []).map((m) => m.alias),
    ...(select.dimensions ?? []).map((d) => d.alias),
    ...(select.attributes ?? []).map((a) => a.alias),
  ].filter(Boolean);
}

export interface CreateDataSourceInput {
  entity: string;
  /**
   * A filter the source must carry, for an entity the catalog marks `requiresFilter`.
   *
   * Supplied by the caller because the command layer holds no catalog. Omitting it for such an
   * entity produces a page level-3 validation rejects, and the builder has no filter UI yet — so
   * the author would be handed an invalid page with no way to fix it short of the JSON view.
   */
  mandatoryFilter?: { attribute: string; operator: string; value?: unknown };
  /** An aggregate for a figure or a chart; a list for a table. */
  kind: 'aggregate' | 'list';
  measure?: { ref: string; aggregation: string };
  dimension?: { ref: string; label?: string; temporal?: boolean };
  attributes?: readonly { ref: string; label?: string }[];
  /** Attach to this component once created. */
  componentId?: Identifier;
  manifest?: ComponentManifest;
}

/**
 * Create a data source from catalog concepts, and attach it.
 *
 * The binding UX the roadmap asks for: the author picks a business measure, not a column. The
 * command emits the same declarative data source shape a hand-authored or AI-generated page
 * uses — there is no builder-specific query format, because there is no builder-specific
 * model.
 */
export function createDataSource(definition: PageDefinition, input: CreateDataSourceInput): Command {
  const taken = allIds(definition);
  const base = input.componentId ? `${input.componentId}-source` : `${input.entity.split('.').pop()}-source`;
  const id = uniqueId(base, taken);

  const source: DataSource =
    input.kind === 'aggregate'
      ? {
          id,
          entity: input.entity,
          kind: 'aggregate',
          select: {
            measures: input.measure
              ? [
                  {
                    measure: input.measure.ref,
                    aggregation: input.measure.aggregation as never,
                    alias: `${input.measure.ref}-value`,
                  },
                ]
              : [],
            ...(input.dimension
              ? {
                  dimensions: [
                    {
                      attribute: input.dimension.ref,
                      alias: input.dimension.ref,
                      ...(input.dimension.label ? { label: input.dimension.label } : {}),
                      ...(input.dimension.temporal ? { granularity: 'day' as const } : {}),
                    },
                  ],
                }
              : {}),
          },
          ...(input.mandatoryFilter ? { filter: { all: [filterClauseOf(input.mandatoryFilter)] } } : {}),
          loadPolicy: 'eager',
          cacheTtlHintSeconds: 60,
        }
      : {
          id,
          entity: input.entity,
          kind: 'list',
          select: {
            attributes: (input.attributes ?? []).map((attribute) => ({
              attribute: attribute.ref,
              alias: attribute.ref,
              ...(attribute.label ? { label: attribute.label } : {}),
            })),
          },
          ...(input.mandatoryFilter ? { filter: { all: [filterClauseOf(input.mandatoryFilter)] } } : {}),
          paging: { mode: 'offset', pageSize: 50, maxRows: 2000 },
          loadPolicy: 'eager',
          cacheTtlHintSeconds: 60,
        };

  const ops: PatchOp[] = [];
  if (!definition.dataSources) ops.push({ op: 'add', path: '/dataSources', value: {} });
  ops.push({ op: 'add', path: pointer('dataSources', id), value: source });

  if (input.componentId) {
    // Attach against the definition as it will be once the source exists, so the seeded
    // bindings reference aliases that are actually there.
    const withSource = {
      ...definition,
      dataSources: { ...(definition.dataSources ?? {}), [id]: source },
    } as PageDefinition;
    const attach = attachDataSource(withSource, input.componentId, id, input.manifest);
    if (!isRefusal(attach)) ops.push(...attach.ops);
  }

  return { label: 'Add data source', ops };
}

function filterClauseOf(spec: { attribute: string; operator: string; value?: unknown }) {
  return {
    target: spec.attribute,
    operator: spec.operator,
    ...(spec.value === undefined ? {} : { value: spec.value }),
    // An always-constraining clause, so it satisfies `requiresFilter`. A `skipWhenEmpty` clause
    // may constrain nothing at render, which is exactly what the rule exists to prevent.
    skipWhenEmpty: false,
  } as never;
}

export function setBindingField(
  definition: PageDefinition,
  componentId: Identifier,
  role: string,
  field: string,
): Command {
  const component = definition.components[componentId];
  if (!component) return { label: 'Set binding', refused: `No component "${componentId}"` };
  const ops: PatchOp[] = [];
  if (!component.bindings) {
    ops.push({ op: 'add', path: pointer('components', componentId, 'bindings'), value: {} });
  }
  const existing = component.bindings?.[role];
  const path = pointer('components', componentId, 'bindings', role);
  if (Array.isArray(existing)) {
    return { label: 'Set binding', refused: 'That role holds a list — edit it in the JSON view' };
  }
  ops.push({
    op: existing ? 'replace' : 'add',
    path,
    value: { ...(existing ?? {}), field },
  });
  return { label: `Bind ${role}`, ops };
}

// ── composite ────────────────────────────────────────────────────────────────────────

export interface AddBoundWidgetInput extends AddWidgetInput {
  /** Everything the data source needs, minus the component it attaches to. */
  source: Omit<CreateDataSourceInput, 'componentId' | 'manifest'>;
  /** Overrides the manifest's name as the widget title. */
  title?: string;
  /** What history should call this. Defaults to the widget's title. */
  label?: string;
}

/**
 * Add a widget, its data source and its bindings — as ONE patch.
 *
 * WHY THIS EXISTS SEPARATELY FROM `addWidget`. The palette drops an *unbound* widget, because a
 * person drags a shape first and says what it shows second. Everything that decides both at once —
 * an AI suggestion, a "chart this measure" affordance, an import — needs the opposite, and needs it
 * atomically. Composing it from `addWidget` then `createDataSource` at the call site gives two
 * history entries for one action the author thinks of as one action: they press undo, the source
 * disappears and an orphan widget stays behind showing "no data", and they press it again to be rid
 * of that. Worse, the state between the two patches is a widget bound to nothing, which the
 * validator correctly rejects — so a continuously-validating editor reports a page as broken halfway
 * through an operation that was always going to end valid.
 *
 * Composed from the two commands rather than reimplementing them: `addWidget` is run first, its ops
 * are applied to a projected definition, and `createDataSource` runs against *that* — so the id
 * uniqueness check sees the component that is about to exist and cannot collide with it.
 */
export function addBoundWidget(definition: PageDefinition, input: AddBoundWidgetInput): Command {
  const added = addWidget(definition, input);
  if (isRefusal(added)) return added;

  // The component id `addWidget` chose. Read back from its own ops rather than recomputed, so the
  // two halves cannot disagree about it.
  const componentOp = added.ops.find(
    (op) => op.op === 'add' && op.path.startsWith('/components/'),
  );
  const componentId = componentOp?.path.split('/')[2];
  if (!componentId) {
    return { label: 'Add component', refused: 'The component could not be created' };
  }

  const ops: PatchOp[] = [...added.ops];

  if (input.title) {
    ops.push({ op: 'replace', path: pointer('components', componentId, 'title'), value: input.title });
  }

  // `createDataSource` needs to see the definition as it will be, for two reasons: id uniqueness,
  // and the binding seeding inside `attachDataSource`, which reads the component's manifest roles
  // against a component that does not exist yet in the original.
  const projected = applyAddedWidget(definition, added.ops);
  const source = createDataSource(projected, {
    ...input.source,
    componentId,
    manifest: input.manifest,
  });
  if (isRefusal(source)) return source;
  ops.push(...source.ops);

  return {
    label: input.label ?? `Add ${input.title ?? textOf(nameOf(input.manifest))}`,
    select: added.select ?? null,
    ops,
  };
}

/**
 * The definition with a widget's ops folded in, for commands that must run against the next state.
 *
 * A narrow, local projection rather than `applyPatch`: this file is the command layer and does not
 * depend on the patch *applier*, only on the patch *vocabulary*. Handling exactly the two shapes
 * `addWidget` emits keeps that boundary intact — anything else is a programming error here, not a
 * runtime case to degrade for.
 */
function applyAddedWidget(definition: PageDefinition, ops: readonly PatchOp[]): PageDefinition {
  let next = definition;
  for (const op of ops) {
    if (op.op !== 'add') continue;
    const segments = parsePointer(op.path);
    if (segments.length === 2 && segments[0] === 'components') {
      next = {
        ...next,
        components: { ...next.components, [segments[1]!]: op.value as ComponentInstance },
      };
    }
    // The layout op is deliberately ignored: `createDataSource` reads components and dataSources,
    // never the tree, so folding the node in would be work with no reader.
  }
  return next;
}

/**
 * Remove a data source, but only when nothing reads it.
 *
 * A gap in the vocabulary until the Data aspect existed: `removeNode` drops a widget's source when
 * nothing else reads it, but there was no way to delete a source directly — so an orphan left behind
 * by an earlier edit was unremovable except in the JSON view.
 *
 * The readership check happens HERE rather than in the caller, against the definition the patch will
 * apply to. A panel computes its summary for a render; between that render and the click the author
 * may have bound a widget to this source, and a command that trusted the caller's stale view would
 * delete a source something reads and leave the page invalid.
 */
export function removeDataSourceIfUnused(definition: PageDefinition, sourceId: Identifier): Command {
  const label = `Remove ${sourceId}`;
  if (!definition.dataSources?.[sourceId]) {
    return { label, refused: `No data source "${sourceId}"` };
  }

  const readers = Object.values(definition.components)
    .filter((component) => component.dataSource === sourceId)
    .map((component) => component.id);
  if (readers.length) {
    return { label, refused: `${readers.join(', ')} still read${readers.length === 1 ? 's' : ''} it` };
  }

  /**
   * ANY reference anywhere in the artifact blocks the delete, not a list of the consumers we thought
   * of. Three enumerations in a row were wrong — a data-driven tab set, a panel's header action, and
   * an expression reading `$data.<source>.<alias>` in a text widget's config — and each would have
   * deleted something a working page depended on. See the note in `describe.ts`.
   */
  const references = referencesTo(definition, sourceId);
  if (references.length) {
    return { label, refused: `it is still referenced at ${references.slice(0, 3).join(', ')}` };
  }

  return { label, ops: [{ op: 'remove', path: pointer('dataSources', sourceId) }] };
}

// ── page-level ───────────────────────────────────────────────────────────────────────

export function setPageProperty(
  definition: PageDefinition,
  key: 'name' | 'description',
  value: string,
): Command {
  return setValue(definition, pointer(key), value, `Set page ${key}`);
}

function nameOf(manifest: ComponentManifest): string {
  return textOf(manifest.name);
}

function textOf(value: unknown): string {
  if (typeof value === 'string') return value;
  if (value && typeof value === 'object' && 'default' in value) {
    return String((value as { default?: unknown }).default ?? '');
  }
  return '';
}
