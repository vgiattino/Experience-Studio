/**
 * The layout outline: the structural view of the page, and the precise drag surface.
 *
 * WHY THE OUTLINE IS THE PRIMARY DRAG SURFACE AND THE CANVAS IS SECONDARY. On a canvas, "put
 * this between those two" is a guess about pixels — and it is ambiguous by nature, because a
 * grid cell's visual position says nothing about which container it belongs to. On a tree,
 * every position is explicit, hit targets are uniform, nesting is visible, and the whole
 * interaction works from the keyboard. Builders that offer only canvas dragging are the ones
 * where users cannot get a widget out of a panel once it is in one.
 *
 * The tree is a projection of `definition.layout`, not a copy: each row is a node the walk
 * found, addressed by the id the definition gave it.
 */

import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import type { Identifier } from '@opus/contracts';
import { childListsOf, labelForNode, walkLayout, type LocatedNode } from '@opus/studio-core';

import { DragStateService, positionWithin, type DropPosition } from './drag-state.service';
import { EditorService } from './editor.service';

interface OutlineRow {
  node: LocatedNode;
  label: string;
  depth: number;
  kind: 'widget' | 'container' | 'spacer';
  detail: string;
  canHoldChildren: boolean;
  /** Absolute pointer of the list this row sits in — carried so a sibling drop knows the list. */
  listPath?: string;
}

@Component({
  selector: 'opus-outline',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="outline" role="tree" aria-label="Page structure">
      @for (row of rows(); track row.node.node.id) {
        <div
          class="row"
          role="treeitem"
          [attr.aria-level]="row.depth + 1"
          [attr.aria-selected]="selectedId() === row.node.node.id"
          [attr.data-kind]="row.kind"
          [attr.data-outline-row]="row.node.node.id"
          [class.selected]="selectedId() === row.node.node.id"
          [class.hovered]="hoveredId() === row.node.node.id"
          [class.drop-before]="dropIndicator(row.node.node.id) === 'before'"
          [class.drop-after]="dropIndicator(row.node.node.id) === 'after'"
          [class.drop-inside]="dropIndicator(row.node.node.id) === 'inside'"
          [style.padding-inline-start.px]="8 + row.depth * 14"
          tabindex="0"
          draggable="true"
          (click)="select(row.node.node.id)"
          (keydown)="onKeydown($event, row)"
          (mouseenter)="editor.selection.hover(row.node.node.id)"
          (mouseleave)="editor.selection.hover(null)"
          (dragstart)="onDragStart($event, row)"
          (dragover)="onDragOver($event, row)"
          (dragleave)="onDragLeave(row)"
          (drop)="onDrop($event, row)"
          (dragend)="drag.end()"
        >
          <span class="icon" aria-hidden="true">{{ iconFor(row) }}</span>
          <span class="label">{{ row.label }}</span>
          <span class="detail">{{ row.detail }}</span>
        </div>
      }
    </div>
  `,
  styles: `
    :host {
      display: block;
      overflow-y: auto;
      font-size: var(--opus-text-xs);
    }

    .row {
      display: grid;
      grid-template-columns: 1.1rem minmax(0, 1fr) minmax(0, max-content);
      gap: var(--opus-space-2);
      align-items: center;
      padding-block: 4px;
      padding-inline-end: var(--opus-space-2);
      cursor: pointer;
      border-block-start: 2px solid transparent;
      border-block-end: 2px solid transparent;
      user-select: none;
    }

    .row:hover,
    .row.hovered {
      background: var(--opus-surface-hover, rgb(127 127 127 / 8%));
    }

    .row.selected {
      background: var(--opus-emphasis-info);
      color: var(--opus-text-inverse);
    }

    .row.selected .detail {
      color: var(--opus-text-inverse);
      opacity: 0.75;
    }

    .row:focus-visible {
      outline: 2px solid var(--opus-focus-ring);
      outline-offset: -2px;
    }

    /* The indicator has to say which of the three things a drop will do, or the user finds out
       by doing it. A line means sibling; a filled band means "inside this container". */
    .row.drop-before { border-block-start-color: var(--opus-emphasis-info); }
    .row.drop-after { border-block-end-color: var(--opus-emphasis-info); }
    .row.drop-inside {
      box-shadow: inset 0 0 0 2px var(--opus-emphasis-info);
      border-radius: var(--opus-radius-sm);
    }

    .icon {
      text-align: center;
      opacity: 0.7;
    }

    .label {
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }

    .detail {
      font-family: var(--opus-font-mono);
      font-size: 0.68rem;
      color: var(--opus-text-muted);
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }

    .row[data-kind='container'] .label {
      font-weight: var(--opus-weight-medium);
    }
  `,
})
export class OutlineComponent {
  protected readonly editor = inject(EditorService);
  protected readonly drag = inject(DragStateService);

  protected readonly selectedId = this.editor.selection.selected;
  protected readonly hoveredId = this.editor.selection.hovered;

  protected readonly rows = computed<OutlineRow[]>(() => {
    const definition = this.editor.store.definition();
    if (!definition) return [];
    return walkLayout(definition).map((located) => {
      const node = located.node;
      const kind = node.kind;
      let detail = '';
      if (kind === 'container') {
        const lists = childListsOf(node.container);
        const count = lists.reduce((sum, list) => sum + list.nodes.length, 0);
        detail = `${node.container.type} · ${count}`;
      } else if (kind === 'widget') {
        // The namespace is the same for every entry in a category, so it costs width and adds
        // nothing — and the label is what the author is scanning for.
        const type = definition.components[node.component]?.type;
        detail = type ? (type.split('.').pop() ?? type) : 'missing';
      }
      return {
        node: located,
        label: labelForNode(definition, node),
        depth: located.depth,
        kind,
        detail,
        canHoldChildren: kind === 'container',
        listPath: located.listPath,
      };
    });
  });

  protected iconFor(row: OutlineRow): string {
    if (row.kind === 'spacer') return '␣';
    if (row.kind === 'widget') return '▪';
    return '▤';
  }

  protected select(nodeId: Identifier): void {
    this.editor.selection.select(nodeId);
  }

  protected dropIndicator(nodeId: Identifier): DropPosition | null {
    const target = this.drag.target();
    return target?.nodeId === nodeId ? target.position : null;
  }

  protected onDragStart(event: DragEvent, row: OutlineRow): void {
    // The root is the page's layout: moving it has no meaning, since there is nowhere else.
    if (row.node.parentId === undefined) {
      event.preventDefault();
      return;
    }
    this.drag.start({ kind: 'move', nodeId: row.node.node.id, label: row.label }, event);
  }

  protected onDragOver(event: DragEvent, row: OutlineRow): void {
    if (!this.drag.dragging()) return;
    const element = event.currentTarget as HTMLElement;
    const position = positionWithin(event, element, row.canHoldChildren);
    const target = {
      nodeId: row.node.node.id,
      position,
      listPath: position === 'inside' ? undefined : relativeListPath(row),
    };
    if (!this.editor.canDrop(target)) {
      this.drag.setTarget(null);
      return;
    }
    // preventDefault is what marks the element as a drop target; without it `drop` never fires.
    event.preventDefault();
    if (event.dataTransfer) {
      event.dataTransfer.dropEffect = this.drag.payload()?.kind === 'move' ? 'move' : 'copy';
    }
    this.drag.setTarget(target);
  }

  protected onDragLeave(row: OutlineRow): void {
    if (this.drag.target()?.nodeId === row.node.node.id) this.drag.setTarget(null);
  }

  protected onDrop(event: DragEvent, row: OutlineRow): void {
    event.preventDefault();
    event.stopPropagation();
    const target = this.drag.target();
    if (target) this.editor.performDrop(target);
    else this.drag.end();
    void row;
  }

  /**
   * Keyboard editing. Everything the drag surface does, without a pointer:
   * arrows move the selection, alt+arrows reorder, Delete removes, and Enter selects.
   */
  protected onKeydown(event: KeyboardEvent, row: OutlineRow): void {
    const nodeId = row.node.node.id;
    if (event.key === 'ArrowDown' && !event.altKey) {
      event.preventDefault();
      this.editor.selectRelative(1);
      this.focusSelected();
      return;
    }
    if (event.key === 'ArrowUp' && !event.altKey) {
      event.preventDefault();
      this.editor.selectRelative(-1);
      this.focusSelected();
      return;
    }
    if (event.altKey && (event.key === 'ArrowUp' || event.key === 'ArrowDown')) {
      event.preventDefault();
      this.editor.nudge(nodeId, event.key === 'ArrowUp' ? -1 : 1);
      this.focusSelected();
      return;
    }
    if (event.key === 'Delete' || event.key === 'Backspace') {
      event.preventDefault();
      this.editor.remove(nodeId);
      return;
    }
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      this.select(nodeId);
    }
  }

  /** Keep focus on the row the selection moved to, or the next keypress goes to the old one. */
  private focusSelected(): void {
    const id = this.editor.selection.selected();
    if (!id) return;
    requestAnimationFrame(() => {
      const element = document.querySelector<HTMLElement>(`[data-outline-row="${cssEscape(id)}"]`);
      element?.focus();
    });
  }
}

/** Relative to the container node, which is what the command layer expects. */
function relativeListPath(row: OutlineRow): string | undefined {
  const absolute = row.listPath;
  if (!absolute) return undefined;
  const index = absolute.lastIndexOf('/container');
  return index === -1 ? undefined : absolute.slice(index);
}

function cssEscape(value: string): string {
  return typeof CSS !== 'undefined' && CSS.escape ? CSS.escape(value) : value;
}
