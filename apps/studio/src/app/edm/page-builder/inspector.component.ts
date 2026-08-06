/**
 * The inspector — properties of the selected widget, or settings of the page when nothing is selected.
 *
 * Ported from the console's right-hand panel. Its own component for the reason the palette and the flow
 * map are: it renders what it is given and emits what the author asked for, and the builder is the only
 * thing that writes to a page.
 *
 * The property list is a **table**, not a branch per widget type — `FIELDS` is keyed by type, so adding
 * a widget kind is a row here rather than another arm of a template `@switch`. It is deliberately
 * shorter than the original's, which also edits column configs, segment lists, chart legends and axis
 * options; those are named in the doc as outstanding rather than half-built.
 */

import { ChangeDetectionStrategy, Component, computed, input, output } from '@angular/core';
import { IconComponent } from '@opus/design-system';

import { ACCENTS, COLS, typeLabelOf, type PageDef, type Widget } from './model';

/** Icons a page may carry, matching the row of choices the original offers in page settings. */
const PAGE_ICONS = ['page', 'grid', 'layers', 'database', 'model', 'shield', 'settings', 'flow'];

interface Field {
  key: string;
  label: string;
  kind: 'text' | 'textarea' | 'number' | 'select' | 'boolean';
  options?: readonly string[];
  hint?: string;
}

/**
 * Which properties each type offers.
 *
 * The default arm is the control types — dropdown, radio, segments and the rest — which all carry a
 * caption, a label and a value, so they share one row rather than eight identical ones.
 */
const FIELDS: Partial<Record<Widget['type'], readonly Field[]>> = {
  heading: [
    { key: 'text', label: 'Text', kind: 'text' },
    { key: 'level', label: 'Level', kind: 'select', options: ['1', '2', '3'] },
  ],
  text: [
    { key: 'text', label: 'Text', kind: 'textarea' },
    { key: 'align', label: 'Align', kind: 'select', options: ['left', 'center', 'right'] },
    { key: 'muted', label: 'Muted', kind: 'boolean' },
  ],
  divider: [{ key: 'spacer', label: 'Invisible spacer', kind: 'boolean' }],
  image: [
    { key: 'url', label: 'Image URL', kind: 'text', hint: 'Empty shows a placeholder.' },
    { key: 'caption', label: 'Caption', kind: 'text' },
  ],
  kpi: [
    { key: 'label', label: 'Label', kind: 'text' },
    { key: 'value', label: 'Value', kind: 'text' },
    { key: 'delta', label: 'Delta', kind: 'text' },
    { key: 'dir', label: 'Direction', kind: 'select', options: ['up', 'down', 'flat'] },
  ],
  table: [{ key: 'title', label: 'Title', kind: 'text' }],
  grid: [{ key: 'title', label: 'Title', kind: 'text' }],
  chart: [
    { key: 'title', label: 'Title', kind: 'text' },
    {
      key: 'kind',
      label: 'Kind',
      kind: 'select',
      options: ['column', 'bar', 'line', 'area', 'pie', 'donut'],
    },
  ],
  gauge: [
    { key: 'title', label: 'Title', kind: 'text' },
    { key: 'value', label: 'Value', kind: 'number' },
    { key: 'max', label: 'Maximum', kind: 'number' },
    { key: 'suffix', label: 'Suffix', kind: 'text' },
  ],
  progress: [
    { key: 'title', label: 'Label', kind: 'text' },
    { key: 'value', label: 'Value', kind: 'number' },
    { key: 'max', label: 'Maximum', kind: 'number' },
  ],
  button: [
    { key: 'label', label: 'Label', kind: 'text' },
    { key: 'style', label: 'Style', kind: 'select', options: ['primary', 'secondary', 'ghost'] },
  ],
  section: [
    { key: 'title', label: 'Title', kind: 'text' },
    { key: 'desc', label: 'Description', kind: 'text' },
  ],
  checkbox: [
    { key: 'label', label: 'Label', kind: 'text' },
    { key: 'value', label: 'Checked', kind: 'boolean' },
  ],
};

const CONTROL_FIELDS: readonly Field[] = [
  { key: 'caption', label: 'Show caption', kind: 'boolean' },
  { key: 'label', label: 'Label', kind: 'text' },
  { key: 'value', label: 'Value', kind: 'text' },
];

@Component({
  selector: 'opus-pb-inspector',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [IconComponent],
  template: `
    @if (widget(); as widget) {
      <div class="pb-insp-h">
        <opus-icon name="sliders" [size]="15" />
        {{ typeLabel(widget) }}
        <button type="button" class="opus-icon-btn" title="Clear selection" (click)="clear.emit()">
          <opus-icon name="close" [size]="15" [weight]="2" />
        </button>
      </div>
      <div class="pb-insp-body">
        @for (field of fields(); track field.key) {
          <label class="pb-f">
            {{ field.label }}
            @if (field.kind === 'textarea') {
              <textarea
                class="opus-textarea"
                rows="3"
                [value]="text(widget, field.key)"
                (change)="set(field.key, $any($event.target).value)"
              ></textarea>
            } @else if (field.kind === 'select') {
              <!--
                A selected binding on each option, not a value binding on the select: the
                element's value is assigned before its option loop has created anything, so it
                finds nothing to match and is dropped. The select then displays its *first*
                option — which is not blank, it is wrong. Every Direction, Kind and Align in
                this inspector was reading as the first choice regardless of the stored prop.
              -->
              <select
                class="opus-select"
                (change)="set(field.key, $any($event.target).value)"
              >
                @for (option of field.options ?? []; track option) {
                  <option [value]="option" [selected]="option === text(widget, field.key)">
                    {{ option || '(none)' }}
                  </option>
                }
              </select>
            } @else if (field.kind === 'boolean') {
              <input
                type="checkbox"
                [checked]="flag(widget, field.key)"
                (change)="set(field.key, $any($event.target).checked)"
              />
            } @else {
              <input
                class="opus-input"
                [type]="field.kind === 'number' ? 'number' : 'text'"
                [value]="text(widget, field.key)"
                (change)="set(field.key, $any($event.target).value, field.kind === 'number')"
              />
            }
            @if (field.hint) {
              <span class="pb-hint">{{ field.hint }}</span>
            }
          </label>
        }

        @if (isAccented(widget)) {
          <div class="pb-f">
            Accent
            <div class="pb-swatches">
              @for (accent of accents; track accent) {
                <button
                  type="button"
                  class="pb-swatch"
                  [class.on]="text(widget, 'accent') === accent"
                  [style.background]="accent"
                  [title]="accent"
                  (click)="set('accent', accent)"
                ></button>
              }
            </div>
          </div>
        }

        @if (isNavButton(widget)) {
          <label class="pb-f">
            Links to
            <select class="opus-select" (change)="set('target', $any($event.target).value)">
              <option value="" [selected]="!text(widget, 'target')">(nowhere)</option>
              @for (other of pages(); track other.id) {
                @if (other.id !== page().id) {
                  <option [value]="other.id" [selected]="other.id === text(widget, 'target')">
                    {{ other.name }}
                  </option>
                }
              }
            </select>
            <span class="pb-hint">
              A target here is what draws a link between pages — the strip counts them.
            </span>
          </label>
        }

        <div class="pb-size">
          <span class="pb-f-label">Size</span>
          <div class="pb-size-row">
            <span>Width</span>
            <button type="button" class="opus-icon-btn" (click)="resize.emit({ dim: 'w', delta: -1 })">−</button>
            <b>{{ widget.w }} / {{ COLS }}</b>
            <button type="button" class="opus-icon-btn" (click)="resize.emit({ dim: 'w', delta: 1 })">+</button>
          </div>
          <div class="pb-size-row">
            <span>Height</span>
            <button type="button" class="opus-icon-btn" (click)="resize.emit({ dim: 'h', delta: -1 })">−</button>
            <b>{{ widget.h }} row(s)</b>
            <button type="button" class="opus-icon-btn" (click)="resize.emit({ dim: 'h', delta: 1 })">+</button>
          </div>
        </div>

        <div class="pb-insp-actions">
          <button type="button" class="opus-btn sm" (click)="duplicateWidget.emit()">
            <opus-icon name="copy" [size]="13" [weight]="2" />
            Duplicate
          </button>
          <button type="button" class="opus-btn sm danger" (click)="deleteWidget.emit()">
            <opus-icon name="trash" [size]="13" [weight]="2" />
            Delete
          </button>
        </div>
      </div>
    } @else {
      <div class="pb-insp-h"><opus-icon name="settings" [size]="15" /> Page settings</div>
      <div class="pb-insp-body">
        <label class="pb-f">
          Page name
          <input
            class="opus-input"
            [value]="page().name"
            (change)="renamePage.emit($any($event.target).value)"
          />
        </label>

        <div class="pb-f">
          Icon
          <div class="pb-icons">
            @for (icon of pageIcons; track icon) {
              <button
                type="button"
                class="pb-icon-pick"
                [class.on]="page().icon === icon"
                [title]="icon"
                (click)="pageIcon.emit(icon)"
              >
                <opus-icon [name]="icon" [size]="15" />
              </button>
            }
          </div>
        </div>

        <p class="pb-hint">
          This page has {{ page().widgets.length }} widget(s). Select a widget on the canvas to
          edit it, or add one from the palette.
        </p>

        <div class="pb-insp-actions column">
          <button type="button" class="opus-btn sm" (click)="duplicatePage.emit()">
            <opus-icon name="copy" [size]="13" [weight]="2" />
            Duplicate page
          </button>
          <button type="button" class="opus-btn sm" (click)="clearPage.emit()">
            <opus-icon name="revert" [size]="13" [weight]="2" />
            Clear page
          </button>
        </div>

        <p class="pb-note">
          Not yet ported from the console: Kendo grid paging and sorting, and the
          spline/funnel/radar/waterfall/scatter chart kinds. Widgets carry literal values rather than a
          data source, which is why a generated figure reads "—".
        </p>
      </div>
    }
          
  `,
  styles: `
    :host {
      display: flex;
      flex-direction: column;
      min-block-size: 0;
      background: var(--opus-surface);
      border-inline-start: 1px solid var(--opus-border);
    }

    .pb-insp-h {
      display: flex;
      align-items: center;
      gap: var(--opus-space-2);
      padding: 11px 12px;
      border-block-end: 1px solid var(--opus-border);
      font-size: var(--opus-text-md);
      font-weight: var(--opus-weight-semibold);
      color: var(--opus-text);
      flex-shrink: 0;
    }

    .pb-insp-h .opus-icon-btn {
      margin-inline-start: auto;
    }

    .pb-insp-body {
      flex: 1;
      overflow-y: auto;
      padding: 12px;
      min-block-size: 0;
    }

    .pb-f,
    .pb-f-label {
      display: block;
      font-size: var(--opus-text-sm);
      font-weight: var(--opus-weight-medium);
      color: var(--opus-text);
      margin-block-end: 12px;
    }

    .pb-f .opus-input,
    .pb-f .opus-select,
    .pb-f .opus-textarea {
      margin-block-start: 4px;
    }

    .pb-hint {
      display: block;
      margin-block-start: 3px;
      font-size: var(--opus-text-xs);
      font-weight: var(--opus-weight-regular);
      color: var(--opus-text-muted);
      line-height: var(--opus-leading-normal);
    }

    .pb-swatches,
    .pb-icons {
      display: flex;
      flex-wrap: wrap;
      gap: 4px;
      margin-block-start: 5px;
    }

    .pb-swatch {
      inline-size: 22px;
      block-size: 22px;
      border-radius: 50%;
      border: 2px solid transparent;
      cursor: pointer;
      padding: 0;
    }

    .pb-swatch.on {
      border-color: var(--opus-text);
    }

    .pb-icon-pick {
      display: inline-grid;
      place-items: center;
      inline-size: 28px;
      block-size: 28px;
      border: 1px solid var(--opus-border);
      border-radius: var(--opus-radius-sm);
      background: var(--opus-surface);
      color: var(--opus-text-secondary);
      cursor: pointer;
    }

    .pb-icon-pick.on {
      border-color: var(--opus-accent);
      background: var(--opus-accent-soft);
      color: var(--opus-accent);
    }

    .pb-size {
      padding-block: 4px 10px;
    }

    .pb-size-row {
      display: flex;
      align-items: center;
      gap: 6px;
      font-size: var(--opus-text-sm);
      font-weight: var(--opus-weight-regular);
      color: var(--opus-text-secondary);
      margin-block-start: 5px;
    }

    .pb-size-row span {
      inline-size: 3.5rem;
    }

    .pb-size-row b {
      min-inline-size: 5rem;
      text-align: center;
      color: var(--opus-text);
    }

    .pb-insp-actions {
      display: flex;
      gap: 6px;
      margin-block-start: var(--opus-space-2);
    }

    .pb-insp-actions.column {
      flex-direction: column;
    }

    .pb-insp-actions .danger {
      color: var(--opus-emphasis-negative);
      border-color: var(--opus-emphasis-negative);
    }

    .pb-note {
      margin: var(--opus-space-5) 0 0;
      padding-block-start: var(--opus-space-3);
      border-block-start: 1px solid var(--opus-border);
      font-size: var(--opus-text-xs);
      color: var(--opus-text-muted);
      line-height: var(--opus-leading-normal);
    }
  `,
})
export class InspectorComponent {
  protected readonly COLS = COLS;
  protected readonly accents = ACCENTS;
  protected readonly pageIcons = PAGE_ICONS;
  protected readonly typeLabel = typeLabelOf;

  readonly widget = input<Widget | null>(null);
  readonly page = input.required<PageDef>();
  readonly pages = input.required<readonly PageDef[]>();

  readonly clear = output<void>();
  /** A property changed. `numeric` says to coerce, because a number input still hands back a string. */
  readonly prop = output<{ key: string; value: unknown; numeric: boolean }>();
  readonly resize = output<{ dim: 'w' | 'h'; delta: number }>();
  readonly duplicateWidget = output<void>();
  readonly deleteWidget = output<void>();
  readonly renamePage = output<string>();
  readonly pageIcon = output<string>();
  readonly duplicatePage = output<void>();
  readonly clearPage = output<void>();

  protected readonly fields = computed<readonly Field[]>(() => {
    const widget = this.widget();
    if (!widget) return [];
    return FIELDS[widget.type] ?? CONTROL_FIELDS;
  });

  protected set(key: string, value: unknown, numeric = false): void {
    this.prop.emit({ key, value, numeric });
  }

  protected text(widget: Widget, key: string): string {
    const value = widget.props[key];
    return value === undefined || value === null ? '' : String(value);
  }

  protected flag(widget: Widget, key: string): boolean {
    return widget.props[key] === true;
  }

  /** Only a nav button has somewhere to link to, and only then is the target select meaningful. */
  protected isNavButton(widget: Widget): boolean {
    return widget.type === 'button';
  }

  /** Pies and donuts colour their own segments, so an accent would have nothing to apply to. */
  protected isAccented(widget: Widget): boolean {
    const kind = widget.props['kind'];
    return (
      widget.type === 'kpi' || (widget.type === 'chart' && kind !== 'pie' && kind !== 'donut')
    );
  }
}
