/**
 * Page structure — the page as a tree, and the way to reach a widget the canvas cannot.
 *
 * The same feature as the platform builder's structure panel (`libs/studio-ui/outline.component.ts`),
 * built for this builder's model. The platform's walks a nested `PageDefinition.layout` where parentage
 * is recorded; this one reads `structureOf`, which derives nesting from the rectangles — see the long
 * note there for why.
 *
 * ── WHAT A STRUCTURE PANEL IS ACTUALLY FOR ────────────────────────────────────────────
 * Not a second view of the canvas. Three jobs the canvas cannot do:
 *
 *   · **Reach a widget you cannot click.** One row high, behind a section, scrolled out of sight, or a
 *     Divider that is two pixels of hairline. On the canvas those are unselectable in practice.
 *   · **See what is inside what.** A widget dropped on a section looks contained and, in this model,
 *     is not recorded as contained by anything. The panel is where that shows.
 *   · **Change stacking.** The widget array is paint order, so which of two overlapping widgets is on
 *     top is a property of list position and of nothing visible. Rows that overlap a sibling say so,
 *     and alt+arrows move them.
 *
 * Selection and hover run both ways: a row highlights what the canvas has selected, and hovering a row
 * outlines the widget on the canvas. Without that a tree of "Metric" rows is a guessing game.
 *
 * It owns nothing. Rows are a projection of the widgets; every change leaves as an output.
 */

import {
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  computed,
  effect,
  inject,
  input,
  output,
} from '@angular/core';
import { IconComponent } from '@opus/design-system';

import { labelOf, structureOf, typeLabelOf, type StructureRow, type Widget } from './model';

/** Which icon stands for a kind. Sections read as a container; the rest by their palette family. */
const ICONS: Record<string, string> = {
  section: 'layers',
  heading: 'page',
  text: 'document',
  divider: 'chevron-left',
  image: 'library',
  kpi: 'model',
  table: 'grid',
  grid: 'grid',
  chart: 'model',
  button: 'chevron-right',
  gauge: 'attribute',
  progress: 'sliders',
};

@Component({
  selector: 'opus-pb-structure',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [IconComponent],
  template: `
    @if (!rows().length) {
      <p class="st-empty">
        Nothing on this page yet. Add a widget from <b>Widgets</b> and it will appear here.
      </p>
    } @else {
      <p class="st-help">
        Click a row to select it on the canvas. <b>Alt</b> + <b>↑</b>/<b>↓</b> restacks a widget that
        overlaps another; <b>Delete</b> removes it.
      </p>

      <div class="st-tree" role="tree" aria-label="Page structure">
        @for (row of rows(); track row.widget.id) {
          <div
            class="st-row"
            role="treeitem"
            tabindex="0"
            [attr.aria-level]="row.depth + 1"
            [attr.aria-selected]="row.widget.id === selectedId()"
            [attr.data-structure-row]="row.widget.id"
            [class.sel]="row.widget.id === selectedId()"
            [class.section]="row.widget.type === 'section'"
            [style.padding-inline-start.px]="7 + row.depth * 14"
            (click)="select.emit(row.widget.id)"
            (keydown)="onKeydown($event, row)"
            (mouseenter)="hover.emit(row.widget.id)"
            (mouseleave)="hover.emit(null)"
          >
            <opus-icon [name]="iconOf(row.widget)" [size]="13" />
            <span class="st-text">
              <span class="st-label" [title]="labelOf(row.widget)">{{ labelOf(row.widget) }}</span>
              <span class="st-detail">{{ detailOf(row.widget) }}</span>
            </span>
            @if (row.stacked) {
              <button
                type="button"
                class="st-stack"
                title="Overlaps another widget — click to bring it to the front"
                (click)="toFront($event, row)"
              >
                {{ row.index + 1 }}
              </button>
            }
          </div>
        }
      </div>
    }
  `,
  styles: `
    :host {
      display: block;
      overflow-y: auto;
      padding-block-end: 20px;
    }

    .st-help,
    .st-empty {
      margin: 0;
      padding: 10px 12px;
      font-size: var(--opus-text-xs);
      color: var(--opus-text-muted);
      line-height: var(--opus-leading-normal);
    }

    .st-help b {
      color: var(--opus-text-secondary);
      font-weight: var(--opus-weight-semibold);
    }

    /*
      Two lines, not two columns. The label is what an author scans for and the detail is a reference —
      side by side in a 210px dock the detail's max-content width wins and every label truncates to
      three characters. Vertical space is the cheap axis in a scrolling list.
    */
    .st-row {
      display: grid;
      grid-template-columns: 13px minmax(0, 1fr) minmax(0, max-content);
      align-items: center;
      gap: 6px;
      padding-block: 5px;
      padding-inline-end: 8px;
      font-size: var(--opus-text-xs);
      color: var(--opus-text-secondary);
      cursor: pointer;
      user-select: none;
    }

    .st-text {
      display: grid;
      min-inline-size: 0;
    }

    .st-row:hover {
      background: var(--opus-surface-hover);
      color: var(--opus-text);
    }

    .st-row.sel {
      background: var(--opus-accent);
      color: var(--opus-accent-contrast);
    }

    .st-row.sel .st-detail,
    .st-row.sel .st-stack {
      color: var(--opus-accent-contrast);
      opacity: 0.85;
    }

    .st-row:focus-visible {
      outline: 2px solid var(--opus-focus-ring);
      outline-offset: -2px;
    }

    .st-row.section .st-label {
      font-weight: var(--opus-weight-semibold);
    }

    .st-label {
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }

    .st-detail {
      font-size: 10px;
      color: var(--opus-text-muted);
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }

    .st-stack {
      padding: 0 5px;
      border: 0;
      border-radius: 999px;
      background: var(--opus-emphasis-warning-bg);
      color: var(--opus-emphasis-warning);
      font: inherit;
      font-size: 9.5px;
      font-weight: var(--opus-weight-semibold);
      cursor: pointer;
    }
  `,
})
export class StructureComponent {
  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);

  readonly widgets = input.required<readonly Widget[]>();
  readonly selectedId = input<string | null>(null);

  readonly select = output<string>();
  readonly hover = output<string | null>();
  /** Move a widget through paint order. Negative sends it back, positive brings it forward. */
  readonly restack = output<{ id: string; delta: number }>();
  readonly remove = output<string>();

  protected readonly rows = computed(() => structureOf(this.widgets()));
  protected readonly labelOf = labelOf;

  constructor() {
    // Follow the canvas: a widget selected by clicking it should not be somewhere off the scroll.
    effect(() => {
      const id = this.selectedId();
      if (!id) return;
      requestAnimationFrame(() => {
        const element = this.host.nativeElement.querySelector<HTMLElement>(
          `[data-structure-row="${cssEscape(id)}"]`,
        );
        element?.scrollIntoView({ block: 'nearest' });
      });
    });
  }

  protected iconOf(widget: Widget): string {
    return ICONS[widget.type] ?? 'grid';
  }

  /** Kind and place, in grid units — the numbers the inspector and the canvas both work in. */
  protected detailOf(widget: Widget): string {
    return `${typeLabelOf(widget)} · ${widget.w}×${widget.h} @ ${widget.x + 1},${widget.y + 1}`;
  }

  protected toFront(event: MouseEvent, row: StructureRow): void {
    event.stopPropagation();
    this.select.emit(row.widget.id);
    this.restack.emit({ id: row.widget.id, delta: this.widgets().length });
  }

  /**
   * Everything the panel does, from the keyboard.
   *
   * The point is not tidiness: a Divider one row high cannot reliably be clicked, and a widget behind
   * a section cannot be clicked at all. If the panel needed a mouse it would not solve the problem it
   * exists for.
   */
  protected onKeydown(event: KeyboardEvent, row: StructureRow): void {
    const id = row.widget.id;

    if (event.altKey && (event.key === 'ArrowUp' || event.key === 'ArrowDown')) {
      event.preventDefault();
      this.restack.emit({ id, delta: event.key === 'ArrowUp' ? -1 : 1 });
      return;
    }
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault();
      const rows = this.rows();
      const at = rows.findIndex((candidate) => candidate.widget.id === id);
      const next = rows[at + (event.key === 'ArrowDown' ? 1 : -1)];
      if (!next) return;
      this.select.emit(next.widget.id);
      this.focus(next.widget.id);
      return;
    }
    if (event.key === 'Delete' || event.key === 'Backspace') {
      event.preventDefault();
      this.remove.emit(id);
      return;
    }
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      this.select.emit(id);
    }
  }

  /** Keep focus on the row the selection moved to, or the next keypress goes to the old one. */
  private focus(id: string): void {
    requestAnimationFrame(() => {
      const element = this.host.nativeElement.querySelector<HTMLElement>(
        `[data-structure-row="${cssEscape(id)}"]`,
      );
      element?.focus();
    });
  }
}

function cssEscape(value: string): string {
  return typeof CSS !== 'undefined' && CSS.escape ? CSS.escape(value) : value;
}
