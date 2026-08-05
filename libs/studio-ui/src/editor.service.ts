/**
 * The editor façade: turns interactions into commands, and nothing else.
 *
 * It exists so the UI components stay thin and the drop-resolution logic — which is the fiddly
 * part — has one home and can be reasoned about in one place. Every method here ends in
 * `store.run(...)`, so every interaction is a patch, and the components never touch the
 * definition directly.
 */

import { Injectable, computed, inject, signal } from '@angular/core';
import type { CatalogSnapshot } from '@opus/catalog';
import { loadAllManifests, registeredTypes } from '@opus/component-registry';
import type {
  ComponentManifest,
  ComponentTypeRef,
  Container,
  Identifier,
  PageDefinition,
} from '@opus/contracts';
import {
  addContainer,
  addSpacer,
  addWidget,
  childListsOf,
  attachDataSource,
  createDataSource,
  DefinitionStore,
  duplicateNode,
  isRefusal,
  locateNode,
  moveNode,
  removeNode,
  SelectionService,
  setBindingField,
  setComponentConfig,
  setContainerOption,
  setContainerType,
  setPageProperty,
  setPlacement,
  setValue,
  walkLayout,
  wrapInContainer,
  type ApplyOutcome,
  type Command,
  type CreateDataSourceInput,
} from '@opus/studio-core';

import { DragStateService, type DropTarget } from './drag-state.service';

@Injectable()
export class EditorService {
  readonly store = inject(DefinitionStore);
  readonly selection = inject(SelectionService);
  readonly drag = inject(DragStateService);

  private readonly _manifests = signal<readonly ComponentManifest[]>([]);
  readonly manifests = this._manifests.asReadonly();

  /**
   * The catalog as the AUTHOR may see it — the same entitlement-scoped projection the AI
   * generator reasons over. Binding UX driven by the catalog is what lets an author choose a
   * business measure rather than a column, and scoping it to the author means the editor
   * cannot offer a concept the author is not entitled to (ai-architecture.md §3.2).
   */
  private readonly _catalog = signal<CatalogSnapshot | null>(null);
  readonly catalog = this._catalog.asReadonly();

  setCatalog(snapshot: CatalogSnapshot | null): void {
    this._catalog.set(snapshot);
  }

  readonly manifestByType = computed(() => {
    const map = new Map<string, ComponentManifest>();
    for (const manifest of this._manifests()) map.set(manifest.type, manifest);
    return map;
  });

  /** The manifest for the selected widget, if a widget is selected. */
  readonly selectedManifest = computed(() => {
    const component = this.selectedComponent();
    return component ? this.manifestByType().get(component.type) : undefined;
  });

  readonly selectedNode = computed(() => {
    const definition = this.store.definition();
    const id = this.selection.selected();
    if (!definition || !id) return undefined;
    return locateNode(definition, id);
  });

  readonly selectedComponent = computed(() => {
    const located = this.selectedNode();
    const definition = this.store.definition();
    if (!located || !definition || located.node.kind !== 'widget') return undefined;
    return definition.components[located.node.component];
  });

  async loadManifests(): Promise<void> {
    if (this._manifests().length) return;
    this._manifests.set(await loadAllManifests());
  }

  registeredTypes(): readonly string[] {
    return registeredTypes();
  }

  // ── drop resolution ────────────────────────────────────────────────────────────────

  /**
   * Resolve a drop into a command.
   *
   * The translation from "where the pointer was" to "which container, which index" is the whole
   * of drag-and-drop's difficulty. Two rules keep it predictable:
   *
   *  - `before`/`after` mean *a sibling of the row*, so the parent is the row's parent and the
   *    index comes from the row's own index. Dropping between two widgets must not put the new
   *    widget inside one of them.
   *  - `inside` means *a child of the row*, appended, and only a container has an inside.
   */
  performDrop(target: DropTarget): ApplyOutcome {
    const payload = this.drag.payload();
    this.drag.end();
    if (!payload) return this.refuse('Nothing was being dragged');

    const definition = this.store.definition();
    if (!definition) return this.refuse('No page is open');

    const resolved = this.resolveDestination(definition, target);
    if (!resolved) return this.refuse('That is not a valid place to drop');

    switch (payload.kind) {
      case 'new-widget': {
        const manifest = this.manifestByType().get(payload.componentType);
        if (!manifest) return this.refuse(`Unknown component ${payload.componentType}`);
        return this.commit((d) =>
          addWidget(d, {
            manifest,
            parentId: resolved.parentId,
            index: resolved.index,
            listPath: resolved.listPath,
          }),
        );
      }
      case 'new-container':
        return this.commit((d) =>
          addContainer(d, {
            type: payload.containerType,
            parentId: resolved.parentId,
            index: resolved.index,
            listPath: resolved.listPath,
          }),
        );
      case 'move':
        return this.commit((d) =>
          moveNode(d, {
            nodeId: payload.nodeId,
            targetParentId: resolved.parentId,
            // `moveNode` needs a concrete index, so an append is resolved against the
            // destination list at the moment the command runs.
            index: resolved.index ?? appendIndexOf(d, resolved.parentId, resolved.listPath),
            listPath: resolved.listPath,
          }),
        );
    }
  }

  private resolveDestination(
    definition: PageDefinition,
    target: DropTarget,
  ): { parentId: Identifier; index?: number; listPath?: string } | undefined {
    const located = locateNode(definition, target.nodeId);
    if (!located) return undefined;

    if (target.position === 'inside') {
      if (located.node.kind !== 'container') return undefined;
      /**
       * `index` is left UNDEFINED to mean append, and that distinction is load-bearing.
       *
       * An earlier version used `Number.MAX_SAFE_INTEGER` as an append marker. The commands take
       * `index ?? list.length`, so a huge number is passed through verbatim and becomes an
       * out-of-range array index in the patch — which `applyPatch` correctly rejects. The symptom
       * was silent: dropping a component *into* a container did nothing at all, while dropping it
       * beside one worked, because only the `inside` branch produced the sentinel.
       */
      return { parentId: located.node.id, listPath: target.listPath };
    }

    // A sibling drop needs the row's parent, which the root does not have — so the root only
    // ever accepts `inside`.
    if (located.parentId === undefined || located.index === undefined) return undefined;
    return {
      parentId: located.parentId,
      index: target.position === 'before' ? located.index : located.index + 1,
      listPath: listPathOf(definition, located.parentId, located.listPath),
    };
  }

  /** Whether a drop here would be accepted, so the indicator only appears where it can land. */
  canDrop(target: DropTarget): boolean {
    const payload = this.drag.payload();
    const definition = this.store.definition();
    if (!payload || !definition) return false;

    const resolved = this.resolveDestination(definition, target);
    if (!resolved) return false;

    if (payload.kind !== 'move') return true;
    const command = moveNode(definition, {
      nodeId: payload.nodeId,
      targetParentId: resolved.parentId,
      index: resolved.index ?? appendIndexOf(definition, resolved.parentId, resolved.listPath),
      listPath: resolved.listPath,
    });
    return !isRefusal(command);
  }

  // ── commands ───────────────────────────────────────────────────────────────────────

  /** A failure the store did not produce still has to be visible. */
  private refuse(problem: string): ApplyOutcome {
    this.store.reportProblem(problem);
    return { ok: false, problem };
  }

  private commit(command: (definition: PageDefinition) => Command): ApplyOutcome {
    const definition = this.store.definition();
    if (!definition) return { ok: false, problem: 'No page is open' };
    const result = command(definition);
    const outcome = this.store.run(command);
    if (outcome.ok && !isRefusal(result) && result.select !== undefined) {
      this.selection.select(result.select);
    }
    return outcome;
  }

  addWidgetToSelection(manifest: ComponentManifest): ApplyOutcome {
    const parentId = this.nearestContainerId();
    return this.commit((d) => addWidget(d, { manifest, parentId }));
  }

  addContainerToSelection(type: Container['type']): ApplyOutcome {
    const parentId = this.nearestContainerId();
    return this.commit((d) => addContainer(d, { type, parentId }));
  }

  addSpacerToSelection(): ApplyOutcome {
    return this.commit((d) => addSpacer(d, { parentId: this.nearestContainerId() }));
  }

  /**
   * The container a new component should go into: the selection if it is one, otherwise the
   * selection's parent, otherwise the root. "Add" with a widget selected means "next to this",
   * which is what an author expects and what avoids the refusal they would otherwise get.
   */
  private nearestContainerId(): Identifier | undefined {
    const definition = this.store.definition();
    const located = this.selectedNode();
    if (!definition || !located) return undefined;
    if (located.node.kind === 'container') return located.node.id;
    return located.parentId;
  }

  remove(nodeId: Identifier): ApplyOutcome {
    return this.commit((d) => removeNode(d, nodeId));
  }

  duplicate(nodeId: Identifier): ApplyOutcome {
    return this.commit((d) => duplicateNode(d, nodeId));
  }

  wrap(nodeId: Identifier, type: Container['type']): ApplyOutcome {
    return this.commit((d) => wrapInContainer(d, nodeId, type));
  }

  changeContainerType(nodeId: Identifier, type: Container['type']): ApplyOutcome {
    return this.commit((d) => setContainerType(d, nodeId, type));
  }

  setContainerOption(nodeId: Identifier, key: string, value: unknown): ApplyOutcome {
    return this.commit((d) => setContainerOption(d, nodeId, key, value));
  }

  setPlacement(
    nodeId: Identifier,
    key: 'colStart' | 'colSpan' | 'rowSpan' | 'order' | 'minHeight' | 'hidden',
    value: unknown,
    breakpoint?: 'xs' | 'sm' | 'md' | 'lg' | 'xl',
  ): ApplyOutcome {
    return this.commit((d) => setPlacement(d, nodeId, key, value, breakpoint));
  }

  setConfig(componentId: Identifier, property: string, value: unknown): ApplyOutcome {
    return this.commit((d) => setComponentConfig(d, componentId, property, value));
  }

  setComponentField(componentId: Identifier, key: string, value: unknown): ApplyOutcome {
    return this.commit((d) =>
      setValue(d, `/components/${componentId}/${key}`, value, `Set ${key}`),
    );
  }

  setDataSource(componentId: Identifier, dataSourceId: Identifier | undefined): ApplyOutcome {
    const manifest = this.manifestByType().get(
      this.store.definition()?.components[componentId]?.type ?? '',
    );
    return this.commit((d) => attachDataSource(d, componentId, dataSourceId, manifest));
  }

  addDataSource(input: Omit<CreateDataSourceInput, 'manifest'>): ApplyOutcome {
    const manifest = input.componentId
      ? this.manifestByType().get(this.store.definition()?.components[input.componentId]?.type ?? '')
      : undefined;
    return this.commit((d) => createDataSource(d, { ...input, manifest }));
  }

  bindRole(componentId: Identifier, role: string, field: string): ApplyOutcome {
    return this.commit((d) => setBindingField(d, componentId, role, field));
  }

  setPageName(value: string): ApplyOutcome {
    return this.commit((d) => setPageProperty(d, 'name', value));
  }

  setPageDescription(value: string): ApplyOutcome {
    return this.commit((d) => setPageProperty(d, 'description', value));
  }

  /**
   * Nudge a node within its parent. The keyboard equivalent of a drag, and the only way to
   * rearrange a page without a pointer — which makes it an accessibility requirement rather
   * than a convenience.
   */
  nudge(nodeId: Identifier, direction: -1 | 1): ApplyOutcome {
    const definition = this.store.definition();
    if (!definition) return { ok: false, problem: 'No page is open' };
    const located = locateNode(definition, nodeId);
    if (!located || located.parentId === undefined || located.index === undefined) {
      return { ok: false, problem: 'That node cannot be moved' };
    }
    return this.commit((d) =>
      moveNode(d, {
        nodeId,
        targetParentId: located.parentId!,
        // Moving down by one has to skip past the gap the removal leaves, so the target index
        // is +2 rather than +1. `moveNode` compensates for the shift.
        index: direction === -1 ? located.index! - 1 : located.index! + 2,
        listPath: listPathOf(d, located.parentId!, located.listPath),
      }),
    );
  }

  /** Select the next or previous node in document order — arrow-key navigation of the outline. */
  selectRelative(offset: -1 | 1): void {
    const definition = this.store.definition();
    if (!definition) return;
    const nodes = walkLayout(definition);
    const current = this.selection.selected();
    const index = nodes.findIndex((entry) => entry.node.id === current);
    const next = nodes[Math.max(0, Math.min(nodes.length - 1, index + offset))];
    if (next) this.selection.select(next.node.id);
  }

  /** Component types the palette should offer, manifest-first so an unregistered one is skipped. */
  paletteEntries(): readonly ComponentManifest[] {
    const registered = new Set(this.registeredTypes());
    return this._manifests().filter((manifest) => registered.has(manifest.type as ComponentTypeRef));
  }
}

/** The index one past the end of a container's child list. */
function appendIndexOf(
  definition: PageDefinition,
  parentId: Identifier,
  relativeListPath: string | undefined,
): number {
  const parent = locateNode(definition, parentId);
  if (!parent || parent.node.kind !== 'container') return 0;
  const lists = childListsOf(parent.node.container);
  const list = relativeListPath ? lists.find((l) => l.path === relativeListPath) : lists[0];
  return list?.nodes.length ?? 0;
}

/** The absolute pointer of the child list a node lives in, given its parent. */
function listPathOf(
  definition: PageDefinition,
  parentId: Identifier,
  absoluteListPath: string | undefined,
): string | undefined {
  if (!absoluteListPath) return undefined;
  const parent = locateNode(definition, parentId);
  if (!parent) return undefined;
  // Commands take the list path RELATIVE to the container node, because that is what
  // `childListsOf` reports; the tree walk records it absolute. Strip the prefix.
  return absoluteListPath.startsWith(parent.path)
    ? absoluteListPath.slice(parent.path.length)
    : undefined;
}
