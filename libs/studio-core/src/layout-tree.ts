/**
 * Navigation over the layout tree, expressed as JSON Pointers into the definition.
 *
 * THE EDITOR HAS NO MODEL OF ITS OWN. There is no editor-side scene graph, no wrapper objects,
 * no ids invented for the canvas. Every position an editor can talk about is a pointer into
 * the page definition the runtime interprets, so a command is a patch, selection is an id from
 * the definition, and the outline is a projection rather than a copy.
 *
 * The alternative — an editing model synchronised with the definition — is the single most
 * common way a low-code builder becomes unmaintainable: two representations that must agree,
 * a sync layer between them, and a class of bug where the canvas and the saved artifact
 * disagree about what the user built.
 *
 * The awkwardness this creates is real and worth naming: a container holds its children under
 * different keys depending on its type — `children`, `primary`/`secondary`, `template`, or one
 * array per static tab. `childListsOf` is where that irregularity is handled, once.
 */

import type {
  Container,
  ContainerNode,
  Identifier,
  LayoutNode,
  PageDefinition,
} from '@opus/contracts';

import { pointer } from './json-patch';

/** A place children live, addressed relative to the container NODE (not the container). */
export interface ChildList {
  /** Pointer from the container node to the array, e.g. `/container/children`. */
  path: string;
  /** Human label, shown in the outline when a container has more than one list. */
  label: string;
  nodes: readonly LayoutNode[];
  /** False for a list the editor must not restructure — a data-driven tab template. */
  editable: boolean;
}

export function childListsOf(container: Container): ChildList[] {
  switch (container.type) {
    case 'grid':
    case 'stack':
    case 'panel':
    case 'drawer':
      return [
        {
          path: '/container/children',
          label: 'Contents',
          nodes: container.children ?? [],
          editable: true,
        },
      ];
    case 'split':
      return [
        { path: '/container/primary', label: 'Primary', nodes: container.primary ?? [], editable: true },
        {
          path: '/container/secondary',
          label: 'Secondary',
          nodes: container.secondary ?? [],
          editable: true,
        },
      ];
    case 'repeater':
      return [
        {
          path: '/container/template',
          label: 'Row template',
          nodes: container.template ?? [],
          editable: true,
        },
      ];
    case 'tabs': {
      if (container.source.mode === 'static') {
        return container.source.tabs.map((tab, index) => ({
          path: `/container/source/tabs/${index}/content`,
          label: typeof tab.label === 'string' ? tab.label : tab.id,
          nodes: tab.content ?? [],
          editable: true,
        }));
      }
      return [
        {
          path: '/container/source/template',
          label: 'Tab template',
          nodes: container.source.template ?? [],
          // One template renders once per row. Editing it is meaningful; treating it as a
          // drop target for "the third tab" is not, because there is no third tab in the
          // definition — only data that will produce one.
          editable: true,
        },
      ];
    }
  }
}

export interface LocatedNode {
  node: LayoutNode;
  /** Pointer to the node itself. */
  path: string;
  /** Pointer to the array containing it; undefined for the root. */
  listPath?: string;
  index?: number;
  parentId?: Identifier;
  depth: number;
}

/** Depth-first walk, root first, yielding a pointer for every node. */
export function walkLayout(definition: PageDefinition): LocatedNode[] {
  const out: LocatedNode[] = [];

  const visit = (
    node: LayoutNode,
    path: string,
    depth: number,
    listPath?: string,
    index?: number,
    parentId?: Identifier,
  ): void => {
    out.push({ node, path, listPath, index, parentId, depth });
    if (node.kind !== 'container') return;
    for (const list of childListsOf(node.container)) {
      const absoluteList = `${path}${list.path}`;
      list.nodes.forEach((child, i) => {
        visit(child, `${absoluteList}${pointer(i)}`, depth + 1, absoluteList, i, node.id);
      });
    }
  };

  visit(definition.layout, '/layout', 0);
  return out;
}

export function locateNode(definition: PageDefinition, nodeId: Identifier): LocatedNode | undefined {
  return walkLayout(definition).find((entry) => entry.node.id === nodeId);
}

/** Ancestor chain from the root down to (but excluding) the node. */
export function ancestorsOf(definition: PageDefinition, nodeId: Identifier): LocatedNode[] {
  const target = locateNode(definition, nodeId);
  if (!target) return [];
  const all = walkLayout(definition);
  return all.filter((entry) => target.path.startsWith(`${entry.path}/`) && entry.path !== target.path);
}

/** Whether a node may hold children at all — the test for a drop target. */
export function acceptsChildren(node: LayoutNode): node is ContainerNode {
  return node.kind === 'container';
}

/**
 * Would moving `nodeId` into `targetId` place a container inside itself?
 *
 * A tree cannot contain itself, and the drag surfaces make it easy to try: dropping a panel
 * onto one of its own children looks reasonable on screen. Left unchecked the node vanishes
 * from the definition — removed from the tree, then re-added under a path that no longer
 * exists — which reads to a user as "the editor deleted my panel".
 */
export function wouldCreateCycle(
  definition: PageDefinition,
  nodeId: Identifier,
  targetId: Identifier,
): boolean {
  if (nodeId === targetId) return true;
  const source = locateNode(definition, nodeId);
  const target = locateNode(definition, targetId);
  if (!source || !target) return false;
  return target.path.startsWith(`${source.path}/`);
}

/** Which components a layout references, so an unreferenced one can be recognised. */
export function referencedComponentIds(definition: PageDefinition): Set<Identifier> {
  const ids = new Set<Identifier>();
  for (const { node } of walkLayout(definition)) {
    if (node.kind === 'widget') ids.add(node.component);
  }
  for (const overlay of Object.values(definition.overlays ?? {})) {
    const walkOverlay = (node: LayoutNode): void => {
      if (node.kind === 'widget') ids.add(node.component);
      if (node.kind === 'container') {
        for (const list of childListsOf(node.container)) list.nodes.forEach(walkOverlay);
      }
    };
    walkOverlay(overlay);
  }
  return ids;
}

/** Which data sources any component still consumes. */
export function referencedDataSourceIds(definition: PageDefinition): Set<Identifier> {
  const ids = new Set<Identifier>();
  for (const component of Object.values(definition.components)) {
    if (component.dataSource) ids.add(component.dataSource);
  }
  return ids;
}

/** A readable label for a node in the outline. */
export function labelForNode(definition: PageDefinition, node: LayoutNode): string {
  if (node.kind === 'spacer') return 'Spacer';
  if (node.kind === 'container') {
    const container = node.container;
    if (container.type === 'panel' && container.title) {
      return typeof container.title === 'string' ? container.title : node.id;
    }
    return `${container.type[0]!.toUpperCase()}${container.type.slice(1)}`;
  }
  const component = definition.components[node.component];
  if (!component) return `${node.component} (missing)`;
  const title = component.title;
  if (typeof title === 'string' && title) return title;
  if (title && typeof title === 'object' && 'default' in title) {
    return String((title as { default?: unknown }).default ?? node.component);
  }
  return node.component;
}
