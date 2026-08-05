/**
 * Drag state, shared between the palette, the outline and the canvas.
 *
 * WHY A SERVICE AND NOT JUST `dataTransfer`. The payload is what decides whether a given drop
 * target is valid, and validity has to be known during `dragover` — that is the only moment the
 * cursor and the drop indicator can be set. But `dataTransfer.getData()` returns an empty
 * string during `dragover` by design (the drag data store is in "protected mode" until drop),
 * so a target reading only `dataTransfer` cannot tell a component drag from a file drag, and
 * ends up either accepting everything or highlighting nothing.
 *
 * The payload is still written to `dataTransfer` as well, so a drop that arrives without having
 * passed through our own dragstart — a drag from another window — is inert rather than
 * mysterious.
 */

import { Injectable, computed, signal } from '@angular/core';
import type { Container, Identifier } from '@opus/contracts';

export const DRAG_MIME = 'application/x-opus-studio';

export type DragPayload =
  /** A new component from the palette. */
  | { kind: 'new-widget'; componentType: string; label: string }
  /** A new container from the palette. */
  | { kind: 'new-container'; containerType: Container['type']; label: string }
  /** An existing node being moved. */
  | { kind: 'move'; nodeId: Identifier; label: string };

/** Where a drop would land, relative to the row it is over. */
export type DropPosition = 'before' | 'after' | 'inside';

export interface DropTarget {
  nodeId: Identifier;
  position: DropPosition;
  /** Which child list, for a container with more than one. */
  listPath?: string;
}

@Injectable()
export class DragStateService {
  private readonly _payload = signal<DragPayload | null>(null);
  private readonly _target = signal<DropTarget | null>(null);

  readonly payload = this._payload.asReadonly();
  readonly target = this._target.asReadonly();
  readonly dragging = computed(() => this._payload() !== null);

  start(payload: DragPayload, event: DragEvent): void {
    this._payload.set(payload);
    this._target.set(null);
    if (event.dataTransfer) {
      event.dataTransfer.effectAllowed = payload.kind === 'move' ? 'move' : 'copy';
      event.dataTransfer.setData(DRAG_MIME, JSON.stringify(payload));
      // Some browsers cancel a drag with no text/plain payload.
      event.dataTransfer.setData('text/plain', payload.label);
    }
  }

  setTarget(target: DropTarget | null): void {
    const current = this._target();
    if (
      current?.nodeId === target?.nodeId &&
      current?.position === target?.position &&
      current?.listPath === target?.listPath
    ) {
      return;
    }
    this._target.set(target);
  }

  end(): void {
    this._payload.set(null);
    this._target.set(null);
  }

  /** True when this target is the one currently indicated. */
  isTarget(nodeId: Identifier, position: DropPosition, listPath?: string): boolean {
    const target = this._target();
    return (
      target?.nodeId === nodeId && target.position === position && target.listPath === listPath
    );
  }
}

/**
 * Which third of the row the pointer is in.
 *
 * A container gets a large middle band so "put it in here" is easy to hit; a leaf has no inside
 * at all, so its row splits cleanly in half and every position is reachable.
 */
export function positionWithin(event: DragEvent, element: HTMLElement, canHoldChildren: boolean): DropPosition {
  const box = element.getBoundingClientRect();
  const ratio = box.height > 0 ? (event.clientY - box.top) / box.height : 0.5;
  if (!canHoldChildren) return ratio < 0.5 ? 'before' : 'after';
  if (ratio < 0.25) return 'before';
  if (ratio > 0.75) return 'after';
  return 'inside';
}
