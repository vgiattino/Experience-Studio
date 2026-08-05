import { beforeEach, describe, expect, it } from 'vitest';
import { TestBed } from '@angular/core/testing';
import { provideZonelessChangeDetection } from '@angular/core';
import type { Container, ContainerNode, LayoutNode, PageDefinition, ComponentManifest } from '@opus/contracts';

import {
  addContainer,
  addWidget,
  attachDataSource,
  createDataSource,
  duplicateNode,
  isRefusal,
  moveNode,
  removeNode,
  setComponentConfig,
  setContainerType,
  setPlacement,
  wrapInContainer,
} from './commands';
import { DefinitionStore } from './definition-store.service';
import { applyPatch, invertPatch, parsePointer, pointer, type PatchOp } from './json-patch';
import { childListsOf, locateNode, walkLayout, wouldCreateCycle } from './layout-tree';

// ── typed accessors, so the assertions below read the model rather than casting past it ──

function nodeOf(definition: PageDefinition, nodeId: string): LayoutNode {
  const located = locateNode(definition, nodeId);
  if (!located) throw new Error(`No node "${nodeId}"`);
  return located.node;
}

function containerOf(definition: PageDefinition, nodeId: string): Container {
  const node = nodeOf(definition, nodeId);
  if (node.kind !== 'container') throw new Error(`"${nodeId}" is not a container`);
  return node.container;
}

/** Every child of a container, across whichever lists its type uses. */
function childrenOf(definition: PageDefinition, nodeId: string): LayoutNode[] {
  return childListsOf(containerOf(definition, nodeId)).flatMap((list) => [...list.nodes]);
}

function childIdsOf(definition: PageDefinition, nodeId: string): string[] {
  return childrenOf(definition, nodeId).map((child) => child.id);
}

function widgetOf(definition: PageDefinition, nodeId: string): { id: string; component: string } {
  const node = nodeOf(definition, nodeId);
  if (node.kind !== 'widget') throw new Error(`"${nodeId}" is not a widget`);
  return node;
}

// ── fixtures ──────────────────────────────────────────────────────────────────────────

/** A small but structurally real page: nested containers, two widgets, a shared data source. */
function page(): PageDefinition {
  return {
    schemaVersion: '1.0',
    id: 'test-page',
    name: 'Test Page',
    kind: 'dashboard',
    dataSources: {
      'total-source': {
        id: 'total-source',
        entity: 'dq.exception',
        kind: 'aggregate',
        select: { measures: [{ measure: 'exception-count', aggregation: 'count', alias: 'total' }] },
      },
      'list-source': {
        id: 'list-source',
        entity: 'dq.exception',
        kind: 'list',
        select: { attributes: [{ attribute: 'rule-name', alias: 'rule' }] },
      },
    },
    components: {
      kpi: {
        id: 'kpi',
        type: 'analytics.kpi-card',
        typeVersion: '1.4.0',
        title: 'Open Exceptions',
        dataSource: 'total-source',
        bindings: { value: { field: 'total' } },
      },
      queue: {
        id: 'queue',
        type: 'data.table',
        typeVersion: '1.0.0',
        title: 'Queue',
        dataSource: 'list-source',
        bindings: { columns: [{ field: 'rule' }] },
      },
    },
    layout: {
      kind: 'container',
      id: 'root',
      container: {
        type: 'grid',
        columns: 12,
        gap: 'lg',
        children: [
          {
            kind: 'container',
            id: 'kpi-row',
            placement: { colStart: 1, colSpan: 12 },
            container: {
              type: 'stack',
              direction: 'row',
              gap: 'md',
              children: [{ kind: 'widget', id: 'w-kpi', component: 'kpi', placement: { colSpan: 6 } }],
            },
          },
          { kind: 'widget', id: 'w-queue', component: 'queue', placement: { colStart: 1, colSpan: 12 } },
        ],
      },
    },
    version: {
      schemaVersion: '1.0',
      artifactVersion: 1,
      lifecycleState: 'draft',
      immutable: false,
      pins: { catalogVersion: 3, registryVersion: '1.0.0' },
    },
  } as unknown as PageDefinition;
}

function manifest(overrides: Partial<ComponentManifest> = {}): ComponentManifest {
  return {
    schemaVersion: '1.0',
    type: 'analytics.kpi-card',
    version: '1.4.0',
    name: 'KPI Card',
    category: 'analytics',
    generation: { purpose: 'A headline figure', whenToUse: 'One number' },
    properties: {
      type: 'object',
      properties: {
        size: { type: 'string', enum: ['sm', 'md', 'lg'], default: 'md' },
        showThresholdBand: { type: 'boolean', default: false },
        comparisonLabel: { type: 'string' },
      },
    },
    dataRequirement: {
      shape: 'scalar',
      roles: [{ role: 'value', required: true, accepts: ['measure'] }],
    },
    ...overrides,
  } as ComponentManifest;
}

// ── JSON Patch ────────────────────────────────────────────────────────────────────────

describe('JSON Pointer', () => {
  it('decodes the escapes in the order the RFC requires', () => {
    // `~1` before `~0`, or "~01" decodes to "/" instead of "~1".
    expect(parsePointer('/a~01b')).toEqual(['a~1b']);
    expect(parsePointer('/a~1b')).toEqual(['a/b']);
    expect(parsePointer('')).toEqual([]);
  });

  it('round-trips an id containing a slash', () => {
    expect(parsePointer(pointer('components', 'a/b'))).toEqual(['components', 'a/b']);
  });
});

describe('applyPatch', () => {
  it('never mutates its input', () => {
    const original = page();
    const snapshot = JSON.stringify(original);
    applyPatch(original, [{ op: 'replace', path: '/name', value: 'Changed' }]);
    expect(JSON.stringify(original)).toBe(snapshot);
  });

  it('keeps the identity of subtrees it did not touch', () => {
    const before = page();
    const after = applyPatch(before, [{ op: 'replace', path: '/name', value: 'Changed' }]);

    // The renderer memoizes and uses OnPush inputs, so an edit to the page name must not make
    // every widget look changed.
    expect(after.components).toBe(before.components);
    expect(after.layout).toBe(before.layout);
    expect(after).not.toBe(before);
  });

  it('inserts into an array at an index and appends with "-"', () => {
    const spacer = { kind: 'spacer', id: 's1' };
    const at = applyPatch(page(), [{ op: 'add', path: '/layout/container/children/0', value: spacer }]);
    expect(childIdsOf(at, 'root')[0]).toBe('s1');

    const appended = applyPatch(page(), [{ op: 'add', path: '/layout/container/children/-', value: spacer }]);
    expect(childIdsOf(appended, 'root').at(-1)).toBe('s1');
  });

  it('refuses to replace a member that does not exist', () => {
    expect(() => applyPatch(page(), [{ op: 'replace', path: '/nope', value: 1 }])).toThrow();
  });

  it('refuses an out-of-range array index', () => {
    expect(() =>
      applyPatch(page(), [{ op: 'remove', path: '/layout/container/children/9' }]),
    ).toThrow();
  });

  it('applies move as remove-then-add, so indices shift correctly', () => {
    const moved = applyPatch(page(), [
      { op: 'move', from: '/layout/container/children/0', path: '/layout/container/children/1' },
    ]);
    expect(childIdsOf(moved, 'root')).toEqual(['w-queue', 'kpi-row']);
  });
});

describe('invertPatch', () => {
  const roundTrip = (ops: PatchOp[]) => {
    const before = page();
    const inverse = invertPatch(before, ops);
    const after = applyPatch(before, ops);
    const restored = applyPatch(after, inverse);
    return { before, after, restored };
  };

  it('round-trips a replace', () => {
    const { before, restored } = roundTrip([{ op: 'replace', path: '/name', value: 'Changed' }]);
    expect(restored).toEqual(before);
  });

  it('round-trips a remove, restoring the value', () => {
    const { before, restored } = roundTrip([{ op: 'remove', path: '/components/kpi' }]);
    expect(restored).toEqual(before);
  });

  it('round-trips an append', () => {
    const { before, restored } = roundTrip([
      { op: 'add', path: '/layout/container/children/-', value: { kind: 'spacer', id: 's1' } },
    ]);
    expect(restored).toEqual(before);
  });

  /**
   * The bug this exists to prevent: `add` on an existing object member behaves as a replace, so
   * inverting it to `remove` deletes a property undo was supposed to restore.
   */
  it('inverts an add over an existing member to a replace, not a remove', () => {
    const before = page();
    const ops: PatchOp[] = [{ op: 'add', path: '/name', value: 'Overwritten' }];
    const inverse = invertPatch(before, ops);

    expect(inverse).toEqual([{ op: 'replace', path: '/name', value: 'Test Page' }]);
    expect(applyPatch(applyPatch(before, ops), inverse)).toEqual(before);
  });

  /**
   * The other bug: inverting every operation against the ORIGINAL document. Invisible on a
   * single-op patch, and every structural edit is multi-op.
   */
  it('inverts each operation against the state the previous ones left', () => {
    const before = page();
    const ops: PatchOp[] = [
      { op: 'remove', path: '/layout/container/children/1' },
      { op: 'remove', path: '/layout/container/children/0' },
      { op: 'remove', path: '/components/queue' },
    ];

    const restored = applyPatch(applyPatch(before, ops), invertPatch(before, ops));
    expect(restored).toEqual(before);
  });

  it('round-trips a move', () => {
    const { before, restored } = roundTrip([
      { op: 'move', from: '/layout/container/children/0', path: '/layout/container/children/1' },
    ]);
    expect(restored).toEqual(before);
  });
});

// ── layout tree ───────────────────────────────────────────────────────────────────────

describe('layout tree', () => {
  it('addresses every node by a pointer into the definition', () => {
    const walked = walkLayout(page());
    expect(walked.map((entry) => entry.node.id)).toEqual(['root', 'kpi-row', 'w-kpi', 'w-queue']);
    expect(walked.map((entry) => entry.path)).toEqual([
      '/layout',
      '/layout/container/children/0',
      '/layout/container/children/0/container/children/0',
      '/layout/container/children/1',
    ]);
  });

  it('resolves a node pointer that actually reads the node', () => {
    const located = locateNode(page(), 'w-kpi')!;
    const definition = page();
    let value: unknown = definition;
    for (const segment of parsePointer(located.path)) {
      value = (value as Record<string, unknown>)[segment];
    }
    expect((value as { id: string }).id).toBe('w-kpi');
  });

  it('detects placing a container inside itself', () => {
    const definition = page();
    expect(wouldCreateCycle(definition, 'kpi-row', 'w-kpi')).toBe(true);
    expect(wouldCreateCycle(definition, 'kpi-row', 'kpi-row')).toBe(true);
    expect(wouldCreateCycle(definition, 'w-queue', 'kpi-row')).toBe(false);
  });
});

// ── commands ──────────────────────────────────────────────────────────────────────────

function run(definition: PageDefinition, command: ReturnType<typeof addWidget>): PageDefinition {
  if (isRefusal(command)) throw new Error(`refused: ${command.refused}`);
  return applyPatch(definition, command.ops);
}

describe('commands', () => {
  it('adds a widget with its component and layout node in one patch', () => {
    const before = page();
    const command = addWidget(before, { manifest: manifest(), parentId: 'kpi-row' });
    if (isRefusal(command)) throw new Error(command.refused);

    const after = applyPatch(before, command.ops);
    expect(childrenOf(after, 'kpi-row')).toHaveLength(2);

    const added = Object.values(after.components).find((c) => c.id !== 'kpi' && c.id !== 'queue')!;
    expect(added.type).toBe('analytics.kpi-card');
    expect(added.typeVersion).toBe('1.4.0');
    // Defaults come from the manifest's property schema, so a new widget is configured.
    expect(added.config).toEqual({ size: 'md', showThresholdBand: false });

    // One patch, so one undo reverses the whole action.
    expect(applyPatch(after, invertPatch(before, command.ops))).toEqual(before);
  });

  it('generates readable kebab-case ids that do not collide', () => {
    let definition = page();
    for (let i = 0; i < 3; i++) {
      definition = run(definition, addWidget(definition, { manifest: manifest() }));
    }
    expect(Object.keys(definition.components).sort()).toEqual([
      'kpi',
      'kpi-card',
      'kpi-card-2',
      'kpi-card-3',
      'queue',
    ]);
  });

  it('refuses to add into a widget', () => {
    const command = addWidget(page(), { manifest: manifest(), parentId: 'w-kpi' });
    expect(isRefusal(command)).toBe(true);
  });

  it('deletes a widget together with its component and now-unused data source', () => {
    const before = page();
    const command = removeNode(before, 'w-queue');
    if (isRefusal(command)) throw new Error(command.refused);
    const after = applyPatch(before, command.ops);

    expect(locateNode(after, 'w-queue')).toBeUndefined();
    expect(after.components['queue']).toBeUndefined();
    expect(after.dataSources!['list-source']).toBeUndefined();
    // The other widget's source is untouched — an unused source is removed, a used one is not.
    expect(after.dataSources!['total-source']).toBeDefined();

    expect(applyPatch(after, invertPatch(before, command.ops))).toEqual(before);
  });

  it('keeps a data source that another component still reads', () => {
    let definition = page();
    definition = applyPatch(definition, [
      { op: 'replace', path: '/components/queue/dataSource', value: 'total-source' },
    ]);
    const command = removeNode(definition, 'w-queue');
    if (isRefusal(command)) throw new Error(command.refused);
    const after = applyPatch(definition, command.ops);

    expect(after.dataSources!['total-source']).toBeDefined();
  });

  it('refuses to delete the root layout', () => {
    expect(isRefusal(removeNode(page(), 'root'))).toBe(true);
  });

  it('moves a node between containers', () => {
    const before = page();
    const command = moveNode(before, { nodeId: 'w-queue', targetParentId: 'kpi-row', index: 0 });
    if (isRefusal(command)) throw new Error(command.refused);
    const after = applyPatch(before, command.ops);

    expect(childIdsOf(after, 'kpi-row')).toEqual(['w-queue', 'w-kpi']);
    expect(childIdsOf(after, 'root')).toEqual(['kpi-row']);
  });

  /**
   * Reordering downward within one list: the removal shifts every later index left by one, so
   * the destination index the user pointed at is not the index the add must use.
   */
  it('compensates for the removal when reordering downward in the same list', () => {
    const before = page();
    const command = moveNode(before, { nodeId: 'kpi-row', targetParentId: 'root', index: 2 });
    if (isRefusal(command)) throw new Error(command.refused);
    const after = applyPatch(before, command.ops);

    expect(childIdsOf(after, 'root')).toEqual(['w-queue', 'kpi-row']);
  });

  it('refuses to move a container into its own descendant', () => {
    const command = moveNode(page(), { nodeId: 'kpi-row', targetParentId: 'kpi-row', index: 0 });
    expect(isRefusal(command)).toBe(true);
  });

  it('duplicates a widget with fresh ids and a shared data source', () => {
    const before = page();
    const command = duplicateNode(before, 'w-kpi');
    if (isRefusal(command)) throw new Error(command.refused);
    const after = applyPatch(before, command.ops);

    const children = childIdsOf(after, 'kpi-row');
    expect(children).toHaveLength(2);
    const original = widgetOf(after, children[0]!);
    const copy = widgetOf(after, children[1]!);

    // A copy sharing the component id would make one property edit change both.
    expect(copy.component).not.toBe(original.component);
    expect(after.components[copy.component]!.title).toBe('Open Exceptions');
    // The query is shared, because two widgets over one query is correct and cheaper.
    expect(after.components[copy.component]!.dataSource).toBe('total-source');
  });

  it('duplicates a container with every descendant id rewritten', () => {
    const before = page();
    const command = duplicateNode(before, 'kpi-row');
    if (isRefusal(command)) throw new Error(command.refused);
    const after = applyPatch(before, command.ops);

    const ids = walkLayout(after).map((entry) => entry.node.id);
    expect(new Set(ids).size).toBe(ids.length);
    expect(Object.keys(after.components)).toHaveLength(3);
  });

  it('changes a container type and keeps its children', () => {
    const before = page();
    const command = setContainerType(before, 'kpi-row', 'panel');
    if (isRefusal(command)) throw new Error(command.refused);
    const after = applyPatch(before, command.ops);

    expect(containerOf(after, 'kpi-row').type).toBe('panel');
    expect(childIdsOf(after, 'kpi-row')).toEqual(['w-kpi']);
  });

  it('moves children into the first list when the new type stores them elsewhere', () => {
    const before = page();
    const command = setContainerType(before, 'kpi-row', 'split');
    if (isRefusal(command)) throw new Error(command.refused);
    const after = applyPatch(before, command.ops);

    const container = containerOf(after, 'kpi-row');
    if (container.type !== 'split') throw new Error('expected a split');
    expect(container.primary.map((c) => c.id)).toEqual(['w-kpi']);
    expect(container.secondary).toEqual([]);
  });

  it('refuses a type change that would discard children rather than doing it silently', () => {
    const command = setContainerType(page(), 'kpi-row', 'tabs');
    expect(isRefusal(command)).toBe(true);
    if (isRefusal(command)) expect(command.refused).toContain('move these into it');
  });

  it('wraps a node in a container, preserving its placement on the wrapper', () => {
    const before = page();
    const command = wrapInContainer(before, 'w-queue', 'panel');
    if (isRefusal(command)) throw new Error(command.refused);
    const after = applyPatch(before, command.ops);

    const children = childrenOf(after, 'root');
    expect(children[1]!.kind).toBe('container');
    const wrapper = children[1] as ContainerNode;
    expect(childIdsOf(after, wrapper.id)).toEqual(['w-queue']);
    expect(wrapper.placement?.colSpan).toBe(12);
  });

  it('creates the config object on the first property set', () => {
    const before = applyPatch(page(), [{ op: 'remove', path: '/components/kpi/bindings' }]);
    const command = setComponentConfig(before, 'kpi', 'size', 'lg');
    if (isRefusal(command)) throw new Error(command.refused);
    const after = applyPatch(before, command.ops);
    expect(after.components['kpi']!.config).toEqual({ size: 'lg' });
  });

  it('clears an optional property rather than storing an empty string', () => {
    let definition = run(page(), setComponentConfig(page(), 'kpi', 'size', 'lg') as never);
    const clear = setComponentConfig(definition, 'kpi', 'size', '');
    if (isRefusal(clear)) throw new Error(clear.refused);
    definition = applyPatch(definition, clear.ops);
    expect(definition.components['kpi']!.config).toEqual({});
  });

  it('sets placement at a breakpoint, creating the intermediate objects', () => {
    const before = applyPatch(page(), [{ op: 'remove', path: '/layout/container/children/1/placement' }]);
    const command = setPlacement(before, 'w-queue', 'colSpan', 6, 'lg');
    if (isRefusal(command)) throw new Error(command.refused);
    const after = applyPatch(before, command.ops);

    const node = locateNode(after, 'w-queue')!.node as {
      placement: { breakpoints: { lg: { colSpan: number } } };
    };
    expect(node.placement.breakpoints.lg.colSpan).toBe(6);
    expect(applyPatch(after, invertPatch(before, command.ops))).toEqual(before);
  });

  it('seeds required bindings from the data source aliases when attaching', () => {
    const before = applyPatch(page(), [{ op: 'remove', path: '/components/kpi/bindings' }]);
    const command = attachDataSource(before, 'kpi', 'total-source', manifest());
    if (isRefusal(command)) throw new Error(command.refused);
    const after = applyPatch(before, command.ops);

    expect(after.components['kpi']!.bindings).toEqual({ value: { field: 'total' } });
  });

  it('does not seed optional roles with whatever alias came first', () => {
    const before = applyPatch(page(), [{ op: 'remove', path: '/components/kpi/bindings' }]);
    const optional = manifest({
      dataRequirement: {
        shape: 'scalar',
        roles: [
          { role: 'value', required: true, accepts: ['measure'] },
          { role: 'comparison', required: false, accepts: ['measure'] },
        ],
      },
    });
    const command = attachDataSource(before, 'kpi', 'total-source', optional);
    if (isRefusal(command)) throw new Error(command.refused);
    const after = applyPatch(before, command.ops);

    expect(Object.keys(after.components['kpi']!.bindings!)).toEqual(['value']);
  });

  it('creates a data source in the runtime shape and attaches it', () => {
    const before = page();
    const command = createDataSource(before, {
      entity: 'processing.file-load',
      kind: 'aggregate',
      measure: { ref: 'late-file-count', aggregation: 'count' },
      componentId: 'kpi',
      manifest: manifest(),
    });
    if (isRefusal(command)) throw new Error(command.refused);
    const after = applyPatch(before, command.ops);

    const created = Object.values(after.dataSources!).find((s) => s.entity === 'processing.file-load')!;
    expect(created.kind).toBe('aggregate');
    expect(created.select.measures).toEqual([
      { measure: 'late-file-count', aggregation: 'count', alias: 'late-file-count-value' },
    ]);
    // Attached, and bound to the alias the new source actually produces.
    expect(after.components['kpi']!.dataSource).toBe(created.id);
    expect(after.components['kpi']!.bindings).toEqual({ value: { field: 'late-file-count-value' } });
  });

  it('adds a container that can then accept children', () => {
    let definition = page();
    const add = addContainer(definition, { type: 'panel' });
    if (isRefusal(add)) throw new Error(add.refused);
    definition = applyPatch(definition, add.ops);
    const panelId = add.select!;

    definition = run(definition, addWidget(definition, { manifest: manifest(), parentId: panelId }));
    expect(childrenOf(definition, panelId)).toHaveLength(1);
  });
});

// ── the store ─────────────────────────────────────────────────────────────────────────

describe('DefinitionStore', () => {
  let store: DefinitionStore;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [provideZonelessChangeDetection(), DefinitionStore],
    });
    store = TestBed.inject(DefinitionStore);
    store.open(page());
  });

  it('applies a command and records it in the log', () => {
    expect(store.run((d) => addWidget(d, { manifest: manifest() })).ok).toBe(true);
    expect(store.history()).toHaveLength(1);
    expect(store.history()[0]!.label).toBe('Add KPI Card');
    expect(store.canUndo()).toBe(true);
  });

  it('undoes and redoes to identical documents', () => {
    const original = JSON.stringify(store.definition());
    store.run((d) => addWidget(d, { manifest: manifest() }));
    const added = JSON.stringify(store.definition());

    store.undo();
    expect(JSON.stringify(store.definition())).toBe(original);
    store.redo();
    expect(JSON.stringify(store.definition())).toBe(added);
  });

  it('undoes a structural edit in one step', () => {
    const original = JSON.stringify(store.definition());
    store.run((d) => removeNode(d, 'w-queue'));
    // Three operations — node, component, data source — one history entry.
    expect(store.history()[0]!.ops).toHaveLength(3);
    store.undo();
    expect(JSON.stringify(store.definition())).toBe(original);
  });

  it('treats an AI patch and a manual patch identically', () => {
    store.run((d) => addWidget(d, { manifest: manifest() }));
    store.apply([{ op: 'replace', path: '/name', value: 'Renamed by AI' }], 'AI refinement', 'ai');

    expect(store.history().map((entry) => entry.origin)).toEqual(['user', 'ai']);
    store.undo();
    expect(store.definition()!.name).toBe('Test Page');
    // Undoing the AI edit left the manual one in place.
    expect(Object.keys(store.definition()!.components)).toHaveLength(3);
  });

  it('discards the redo branch when a new edit follows an undo', () => {
    store.run((d) => addWidget(d, { manifest: manifest() }));
    store.undo();
    expect(store.canRedo()).toBe(true);

    store.run((d) => addContainer(d, { type: 'panel' }));
    expect(store.canRedo()).toBe(false);
    expect(store.history()).toHaveLength(1);
  });

  it('leaves the document untouched when a patch cannot be applied', () => {
    const before = JSON.stringify(store.definition());
    const outcome = store.apply(
      [
        { op: 'replace', path: '/name', value: 'Partly applied' },
        { op: 'replace', path: '/does/not/exist', value: 1 },
      ],
      'Bad patch',
    );

    expect(outcome.ok).toBe(false);
    // All-or-nothing: a half-applied structural patch is worse than a rejected one.
    expect(JSON.stringify(store.definition())).toBe(before);
    expect(store.history()).toHaveLength(0);
    expect(store.problem()).toBeTruthy();
  });

  it('reports a refusal without recording history', () => {
    const outcome = store.run((d) => removeNode(d, 'root'));
    expect(outcome.ok).toBe(false);
    expect(store.history()).toHaveLength(0);
    expect(store.problem()).toContain('root layout');
  });

  /**
   * Dirty is measured against the saved sequence rather than a flag, so undoing back to the
   * saved state reports clean — the case a boolean flag always gets wrong.
   */
  it('is clean again after undoing back to the saved state', () => {
    store.markSaved();
    expect(store.dirty()).toBe(false);

    store.run((d) => addWidget(d, { manifest: manifest() }));
    expect(store.dirty()).toBe(true);

    store.undo();
    expect(store.dirty()).toBe(false);
  });

  it('reports which patches a save would contain', () => {
    store.run((d) => addWidget(d, { manifest: manifest() }));
    store.markSaved();
    store.run((d) => setComponentConfig(d, 'kpi', 'size', 'lg'));

    const unsaved = store.unsavedOps();
    expect(unsaved.every((op) => op.path.startsWith('/components/kpi/config'))).toBe(true);
  });

  it('treats a whole-document replacement as one undoable edit', () => {
    const original = JSON.stringify(store.definition());
    const replacement = { ...page(), name: 'Pasted' } as PageDefinition;

    expect(store.replaceDocument(replacement).ok).toBe(true);
    expect(store.definition()!.name).toBe('Pasted');
    store.undo();
    expect(JSON.stringify(store.definition())).toBe(original);
  });

  it('survives a long interleaved session, undone all the way back', () => {
    const original = JSON.stringify(store.definition());
    store.run((d) => addWidget(d, { manifest: manifest() }));
    store.run((d) => addContainer(d, { type: 'panel' }));
    store.run((d) => moveNode(d, { nodeId: 'w-queue', targetParentId: 'kpi-row', index: 0 }));
    store.run((d) => setComponentConfig(d, 'kpi', 'size', 'lg'));
    store.run((d) => setPlacement(d, 'w-kpi', 'colSpan', 4, 'lg'));
    store.run((d) => duplicateNode(d, 'w-kpi'));
    store.run((d) => removeNode(d, 'w-queue'));
    store.apply([{ op: 'replace', path: '/name', value: 'AI renamed' }], 'AI', 'ai');

    expect(store.history()).toHaveLength(8);
    while (store.canUndo()) store.undo();
    expect(JSON.stringify(store.definition())).toBe(original);

    while (store.canRedo()) store.redo();
    expect(store.definition()!.name).toBe('AI renamed');
  });
});

describe('createDataSource with a mandatory filter', () => {
  /**
   * An entity the catalog marks `requiresFilter` must receive a clause that ALWAYS constrains, or
   * level-3 validation rejects the page — and the builder has no filter UI yet, so an author
   * handed such a page could not fix it without the JSON view.
   */
  it('carries the filter through, marked so it cannot be skipped', () => {
    const before = page();
    const command = createDataSource(before, {
      entity: 'securities.security',
      kind: 'list',
      attributes: [{ ref: 'name', label: 'Name' }],
      mandatoryFilter: { attribute: 'created-at', operator: 'onOrAfterToday' },
    });
    if (isRefusal(command)) throw new Error(command.refused);
    const after = applyPatch(before, command.ops);

    const created = Object.values(after.dataSources!).find(
      (source) => source.entity === 'securities.security',
    )!;
    expect(created.filter).toEqual({
      all: [{ target: 'created-at', operator: 'onOrAfterToday', skipWhenEmpty: false }],
    });
  });

  it('omits the filter entirely when none is required', () => {
    const before = page();
    const command = createDataSource(before, {
      entity: 'dq.exception',
      kind: 'aggregate',
      measure: { ref: 'exception-count', aggregation: 'count' },
    });
    if (isRefusal(command)) throw new Error(command.refused);
    const after = applyPatch(before, command.ops);

    const created = Object.values(after.dataSources!).find((s) => s.id.startsWith('exception-source'))!;
    expect(created.filter).toBeUndefined();
  });
});
