/**
 * Canvas selection and the responsive preview width.
 *
 * Separate from the DefinitionStore on purpose: selecting a widget is not an edit. Putting it
 * in the store would put it in the patch log, which would mean undo stepped backwards through
 * clicks, and a saved definition would carry whichever widget happened to be selected.
 */

import { Injectable, computed, signal } from '@angular/core';
import { BREAKPOINT_MIN_WIDTH } from '@opus/platform';
import type { Breakpoint, Identifier } from '@opus/contracts';

/**
 * Preview widths.
 *
 * These are *device* widths chosen to land inside each breakpoint band rather than exactly on
 * its boundary. Previewing at the boundary itself is how you convince yourself a layout works
 * and then find it broken one pixel narrower.
 */
export interface PreviewSize {
  id: 'xs' | 'sm' | 'md' | 'lg' | 'xl' | 'fit';
  label: string;
  hint: string;
  /** Undefined means "fill the canvas", which is the authoring default. */
  width?: number;
  expectedBreakpoint?: Breakpoint;
}

export const PREVIEW_SIZES: readonly PreviewSize[] = [
  { id: 'fit', label: 'Fit', hint: 'Fill the available canvas' },
  { id: 'xs', label: 'Phone', hint: '390 px — xs', width: 390, expectedBreakpoint: 'xs' },
  { id: 'sm', label: 'Large phone', hint: '600 px — sm', width: 600, expectedBreakpoint: 'sm' },
  { id: 'md', label: 'Tablet', hint: '900 px — md', width: 900, expectedBreakpoint: 'md' },
  { id: 'lg', label: 'Laptop', hint: '1280 px — lg', width: 1280, expectedBreakpoint: 'lg' },
  { id: 'xl', label: 'Desktop', hint: '1680 px — xl', width: 1680, expectedBreakpoint: 'xl' },
];

@Injectable()
export class SelectionService {
  private readonly _selected = signal<Identifier | null>(null);
  private readonly _hovered = signal<Identifier | null>(null);
  private readonly _preview = signal<PreviewSize>(PREVIEW_SIZES[0]!);
  private readonly _mode = signal<'design' | 'preview'>('design');

  readonly selected = this._selected.asReadonly();
  readonly hovered = this._hovered.asReadonly();
  readonly preview = this._preview.asReadonly();
  /** In preview mode the editing affordances are off, so the page behaves as a viewer's would. */
  readonly mode = this._mode.asReadonly();

  readonly previewWidth = computed(() => this._preview().width);

  /** What the renderer should report at this width, so a mismatch is visible rather than assumed. */
  readonly expectedBreakpoint = computed(() => {
    const width = this._preview().width;
    if (width === undefined) return undefined;
    let result: Breakpoint = 'xs';
    for (const [breakpoint, min] of Object.entries(BREAKPOINT_MIN_WIDTH)) {
      if (width >= min) result = breakpoint as Breakpoint;
    }
    return result;
  });

  select(nodeId: Identifier | null): void {
    this._selected.set(nodeId);
  }

  hover(nodeId: Identifier | null): void {
    this._hovered.set(nodeId);
  }

  setPreview(size: PreviewSize): void {
    this._preview.set(size);
  }

  setMode(mode: 'design' | 'preview'): void {
    this._mode.set(mode);
    if (mode === 'preview') this._selected.set(null);
  }
}
