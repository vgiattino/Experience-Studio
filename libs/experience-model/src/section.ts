/**
 * Sections — the layout vocabulary, mapped onto the model rather than parallel to it.
 *
 * A **Section** is a container node in a page's layout tree: the grid, stack, panel or tab set that
 * groups widgets into the regions a user perceives as "the KPI row", "the charts", "the queue".
 *
 * It is a *view* of the model, not an addition to it. The functions here walk the layout tree the
 * schemas define; nothing stores a section. That matters for two reasons the prototype depends on:
 * layout keeps referencing components by id (so a JSON Patch path into a component survives a
 * sibling being added), and the generator keeps its two-stage seam (plan the sections, then fill
 * each component independently).
 *
 * The irregular part is deliberate and worth knowing about: containers hold their children under
 * DIFFERENT KEYS. A grid and a stack use `children`; a split uses `primary` and `secondary`; a tab
 * set holds one list per static tab plus a shared `template` for generated tabs. `childNodesOf`
 * exists so no caller has to know that, and so adding a container type does not mean auditing every
 * traversal in the codebase.
 */

import type { Container, ContainerNode, Identifier, LayoutNode, WidgetNode } from '@opus/contracts';

/** A layout container node. The thing this app calls a section. */
export type Section = ContainerNode;

export type ContainerType = Container['type'];

/**
 * Container types the runtime renders today. `split`, `drawer` and `repeater` are in the schema and
 * render a stated placeholder, which is why they are listed separately rather than silently absent:
 * an unimplemented container must be visible, never an empty box.
 */
export const SECTION_TYPES = {
  rendered: ['grid', 'stack', 'panel', 'tabs'] as const,
  placeholder: ['split', 'drawer', 'repeater'] as const,
};

export function isSection(node: LayoutNode): node is Section {
  return node.kind === 'container';
}

export function isWidget(node: LayoutNode): node is WidgetNode {
  return node.kind === 'widget';
}

/**
 * Every child list of a container, flattened.
 *
 * One function rather than a switch at each call site: the shape is irregular (see the file note)
 * and every traversal that reimplements it is a place a new container type gets forgotten.
 */
export function childNodesOf(container: Container): readonly LayoutNode[] {
  const c = container as Container & {
    children?: readonly LayoutNode[];
    primary?: readonly LayoutNode[];
    secondary?: readonly LayoutNode[];
    template?: readonly LayoutNode[];
    source?: { mode: string; tabs?: readonly { content: readonly LayoutNode[] }[]; template?: readonly LayoutNode[]; pinnedTabs?: readonly { content: readonly LayoutNode[] }[] };
  };
  const out: LayoutNode[] = [];
  if (c.children) out.push(...c.children);
  if (c.primary) out.push(...c.primary);
  if (c.secondary) out.push(...c.secondary);
  if (c.template) out.push(...c.template);
  if (c.source?.tabs) for (const tab of c.source.tabs) out.push(...tab.content);
  if (c.source?.pinnedTabs) for (const tab of c.source.pinnedTabs) out.push(...tab.content);
  if (c.source?.template) out.push(...c.source.template);
  return out;
}

/** Depth-first walk of a layout tree, root included. */
export function* walk(root: LayoutNode): Generator<LayoutNode> {
  yield root;
  if (root.kind !== 'container') return;
  for (const child of childNodesOf(root.container)) yield* walk(child);
}

/** Sections in document order, so an outline reads the way the page reads. */
export function sectionsOf(root: LayoutNode): Section[] {
  return [...walk(root)].filter(isSection);
}

export function widgetNodesOf(root: LayoutNode): WidgetNode[] {
  return [...walk(root)].filter(isWidget);
}

export function componentIdsOf(root: LayoutNode): Identifier[] {
  return widgetNodesOf(root).map((node) => node.component);
}

/**
 * A human label for a section.
 *
 * Panels carry a title; the rest do not, because a grid is a layout decision rather than a named
 * region. Rather than invent one, this reports the container type — an outline that says "grid"
 * where there is no title is honest, and an outline that says "Section 3" is noise.
 */
export function sectionTitle(section: Section): string {
  const container = section.container as Container & { title?: unknown };
  const title = container.title;
  if (typeof title === 'string') return title;
  if (title && typeof title === 'object' && 'default' in title) {
    return String((title as { default: string }).default);
  }
  return container.type;
}
