/**
 * Drop resolution: the translation from "where the pointer was" to "which container, which
 * index". Tested directly because it is the part of drag-and-drop that is genuinely hard, and
 * because a failure here is invisible in the UI — a drop that resolves wrongly does nothing at
 * all, which reads to a user as a missed drop target rather than a bug.
 */

import { beforeEach, describe, expect, it } from 'vitest';
import { TestBed } from '@angular/core/testing';
import { provideZonelessChangeDetection } from '@angular/core';
import type { ComponentManifest, LayoutNode, PageDefinition } from '@opus/contracts';
import { childListsOf, DefinitionStore, locateNode, SelectionService } from '@opus/studio-core';

import { DragStateService } from './drag-state.service';
import { EditorService } from './editor.service';

function page(): PageDefinition {
  return {
    schemaVersion: '1.0',
    id: 'p',
    name: 'P',
    kind: 'dashboard',
    components: {
      kpi: { id: 'kpi', type: 'analytics.kpi-card', typeVersion: '1.4.0', title: 'KPI' },
      table: { id: 'table', type: 'data.table', typeVersion: '1.0.0', title: 'Table' },
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
            id: 'row',
            container: {
              type: 'stack',
              direction: 'row',
              gap: 'md',
              children: [{ kind: 'widget', id: 'w-kpi', component: 'kpi' }],
            },
          },
          { kind: 'widget', id: 'w-table', component: 'table' },
        ],
      },
    },
    version: {
      schemaVersion: '1.0',
      artifactVersion: 1,
      lifecycleState: 'draft',
      immutable: false,
      pins: { catalogVersion: 1, registryVersion: '1.0.0' },
    },
  } as unknown as PageDefinition;
}

const KPI_MANIFEST = {
  schemaVersion: '1.0',
  type: 'analytics.kpi-card',
  version: '1.4.0',
  name: 'KPI Card',
  category: 'analytics',
  generation: { purpose: 'p', whenToUse: 'w' },
  properties: { type: 'object', properties: {} },
  dataRequirement: { shape: 'scalar' },
} as unknown as ComponentManifest;

function childIds(definition: PageDefinition, nodeId: string): string[] {
  const node = locateNode(definition, nodeId)?.node;
  if (!node || node.kind !== 'container') throw new Error(`${nodeId} is not a container`);
  return childListsOf(node.container).flatMap((list) => list.nodes.map((child: LayoutNode) => child.id));
}

describe('EditorService drop resolution', () => {
  let editor: EditorService;
  let store: DefinitionStore;
  let drag: DragStateService;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [
        provideZonelessChangeDetection(),
        DefinitionStore,
        SelectionService,
        DragStateService,
        EditorService,
      ],
    });
    editor = TestBed.inject(EditorService);
    store = TestBed.inject(DefinitionStore);
    drag = TestBed.inject(DragStateService);
    store.open(page());
    // The palette resolves manifests through the registry; inject one directly so the test does
    // not depend on lazy component loading.
    (editor as unknown as { manifestByType: unknown }).manifestByType = () =>
      new Map([[KPI_MANIFEST.type, KPI_MANIFEST]]);
  });

  const startNew = () => {
    drag.start({ kind: 'new-widget', componentType: 'analytics.kpi-card', label: 'KPI Card' }, {
      dataTransfer: null,
    } as unknown as DragEvent);
  };
  const startMove = (nodeId: string) => {
    drag.start({ kind: 'move', nodeId, label: nodeId }, { dataTransfer: null } as unknown as DragEvent);
  };

  /**
   * The regression this file exists for. `inside` used to resolve to an append *sentinel* of
   * Number.MAX_SAFE_INTEGER, which the commands passed through verbatim as an array index — so
   * the patch was rejected and the drop silently did nothing, while dropping *beside* a node
   * worked. Appending is now expressed as an absent index.
   */
  it('appends when dropping INSIDE a container', () => {
    startNew();
    const outcome = editor.performDrop({ nodeId: 'row', position: 'inside' });

    expect(outcome.ok).toBe(true);
    expect(store.problem()).toBeNull();
    const ids = childIds(store.definition()!, 'row');
    expect(ids).toHaveLength(2);
    expect(ids[0]).toBe('w-kpi');
  });

  it('appends inside the ROOT, which has no siblings to drop beside', () => {
    startNew();
    expect(editor.performDrop({ nodeId: 'root', position: 'inside' }).ok).toBe(true);
    expect(childIds(store.definition()!, 'root')).toHaveLength(3);
  });

  it('inserts as a SIBLING before and after, not as a child', () => {
    startNew();
    editor.performDrop({ nodeId: 'w-table', position: 'before' });
    let ids = childIds(store.definition()!, 'root');
    expect(ids).toEqual(['row', ids[1], 'w-table']);

    startNew();
    editor.performDrop({ nodeId: 'w-table', position: 'after' });
    ids = childIds(store.definition()!, 'root');
    expect(ids.at(-1)).not.toBe('w-table');
    expect(ids.at(-2)).toBe('w-table');
  });

  it('refuses a sibling drop on the root, and says why', () => {
    startNew();
    const outcome = editor.performDrop({ nodeId: 'root', position: 'before' });

    expect(outcome.ok).toBe(false);
    // A silent refusal is what hid the append bug, so the reason has to reach the UI.
    expect(store.problem()).toBeTruthy();
  });

  it('moves a node into another container', () => {
    startMove('w-table');
    expect(editor.performDrop({ nodeId: 'row', position: 'inside' }).ok).toBe(true);

    expect(childIds(store.definition()!, 'row')).toEqual(['w-kpi', 'w-table']);
    expect(childIds(store.definition()!, 'root')).toEqual(['row']);
  });

  it('refuses to drop a container into its own descendant', () => {
    startMove('row');
    drag.setTarget({ nodeId: 'w-kpi', position: 'inside' });
    expect(editor.canDrop({ nodeId: 'w-kpi', position: 'inside' })).toBe(false);

    startMove('row');
    const outcome = editor.performDrop({ nodeId: 'w-kpi', position: 'inside' });
    expect(outcome.ok).toBe(false);
  });

  it('reports canDrop honestly, so the indicator only shows where a drop lands', () => {
    startNew();
    expect(editor.canDrop({ nodeId: 'row', position: 'inside' })).toBe(true);
    expect(editor.canDrop({ nodeId: 'w-kpi', position: 'inside' })).toBe(false);
    expect(editor.canDrop({ nodeId: 'w-kpi', position: 'after' })).toBe(true);
    expect(editor.canDrop({ nodeId: 'root', position: 'after' })).toBe(false);
  });

  it('is a no-op when nothing was being dragged', () => {
    const before = JSON.stringify(store.definition());
    expect(editor.performDrop({ nodeId: 'row', position: 'inside' }).ok).toBe(false);
    expect(JSON.stringify(store.definition())).toBe(before);
  });

  it('nudges a node within its parent, in both directions', () => {
    // root children: [row, w-table]
    expect(editor.nudge('w-table', -1).ok).toBe(true);
    expect(childIds(store.definition()!, 'root')).toEqual(['w-table', 'row']);

    expect(editor.nudge('w-table', 1).ok).toBe(true);
    expect(childIds(store.definition()!, 'root')).toEqual(['row', 'w-table']);
  });

  it('records every drop in the patch log, so a drag is undoable like anything else', () => {
    startNew();
    editor.performDrop({ nodeId: 'row', position: 'inside' });
    startMove('w-table');
    editor.performDrop({ nodeId: 'row', position: 'inside' });

    expect(store.history()).toHaveLength(2);
    const original = page();
    while (store.canUndo()) store.undo();
    expect(JSON.stringify(store.definition())).toBe(JSON.stringify(original));
  });
});
