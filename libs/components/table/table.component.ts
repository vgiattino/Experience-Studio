/**
 * data.table
 *
 * Columns come from the repeated `columns` binding role, so the column set is
 * page metadata rather than component code. Cell presentation is limited to the
 * closed `renderAs` set — a definition can never supply markup, which removes an
 * injection surface rather than mitigating one.
 *
 * M1 scope: client-side sort over the returned page, no virtualization. The
 * manifest declares `virtualized: false` so it is not claimed. See
 * docs/M1-IMPLEMENTATION.md §6 for what that defers.
 */

import { ChangeDetectionStrategy, Component, computed, input, output, signal } from '@angular/core';
import { BadgeComponent, StateShellComponent } from '@opus/design-system';
import {
  type ComponentActionEvent,
  type ComponentContext,
  type DataRow,
  type DataView,
  type Emphasis,
  type FieldBinding,
} from '@opus/contracts';

export interface TableConfig {
  density?: 'comfortable' | 'compact';
  selectionMode?: 'none' | 'single';
  showRowCount?: boolean;
  zebra?: boolean;
  maxHeight?: string;
}

interface Column {
  binding: FieldBinding;
  label: string;
  width?: string;
  align: 'start' | 'center' | 'end';
  sortable: boolean;
}

interface Cell {
  text: string;
  raw: unknown;
  emphasis: Emphasis;
  renderAs: NonNullable<FieldBinding['renderAs']>;
  actionId?: string;
}

@Component({
  selector: 'opus-table',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [StateShellComponent, BadgeComponent],
  template: `
    <opus-state-shell
      [state]="data().state"
      [label]="title()"
      [skeleton]="'table'"
      [title]="stateTitle()"
      [message]="stateMessage() || partialMessage()"
      (retry)="emit('retryRequested', {})"
    >
      <div class="table-wrap" [style.max-block-size]="config().maxHeight ?? null">
        <table
          [attr.data-density]="config().density ?? 'comfortable'"
          [attr.data-zebra]="config().zebra !== false"
        >
          <caption class="sr-only">
            {{ title() }} — {{ rows().length }} of {{ data().totalRows ?? rows().length }} rows
          </caption>
          <thead>
            <tr>
              @for (col of columns(); track col.binding.field) {
                <th
                  scope="col"
                  [style.width]="col.width ?? null"
                  [attr.data-align]="col.align"
                  [attr.aria-sort]="ariaSort(col)"
                >
                  @if (col.sortable) {
                    <button type="button" class="sort" (click)="toggleSort(col.binding.field)">
                      {{ col.label }}
                      <span class="sort-glyph" aria-hidden="true">{{ sortGlyph(col) }}</span>
                    </button>
                  } @else {
                    {{ col.label }}
                  }
                </th>
              }
            </tr>
          </thead>
          <tbody>
            @for (row of rows(); track $index) {
              <tr
                [attr.data-selected]="isSelected($index)"
                [attr.tabindex]="rowInteractive() ? 0 : null"
                [attr.role]="rowInteractive() ? 'button' : null"
                (click)="activateRow(row, $index)"
                (keydown.enter)="activateRow(row, $index)"
              >
                @for (cell of cellsFor(row); track $index) {
                  <td [attr.data-align]="columns()[$index]!.align">
                    @switch (cell.renderAs) {
                      @case ('badge') {
                        <opus-badge [label]="cell.text" [emphasis]="cell.emphasis" />
                      }
                      @case ('code') {
                        <code>{{ cell.text }}</code>
                      }
                      @case ('link') {
                        <button
                          type="button"
                          class="cell-link"
                          (click)="activateCell($event, cell, row)"
                        >
                          {{ cell.text }}
                        </button>
                      }
                      @default {
                        <span [attr.data-emphasis]="cell.emphasis">{{ cell.text }}</span>
                      }
                    }
                  </td>
                }
              </tr>
            }
          </tbody>
        </table>
      </div>

      @if (config().showRowCount !== false) {
        <p class="row-count">
          Showing {{ rows().length }}
          @if (data().totalRows && data().totalRows! > rows().length) {
            of {{ data().totalRows }}
          }
          row{{ rows().length === 1 ? '' : 's' }}
        </p>
      }
    </opus-state-shell>
  `,
  styles: `
    :host {
      display: block;
      block-size: 100%;
      container-type: inline-size;
    }

    .sr-only {
      position: absolute;
      inline-size: 1px;
      block-size: 1px;
      overflow: hidden;
      clip-path: inset(50%);
      white-space: nowrap;
    }

    /* Wide content scrolls inside its own container; the page never scrolls sideways. */
    .table-wrap {
      overflow: auto;
      border: 1px solid var(--opus-border);
      border-radius: var(--opus-radius-md);
      background: var(--opus-surface);
    }

    table {
      inline-size: 100%;
      border-collapse: collapse;
      font-size: var(--opus-text-sm);
    }

    thead th {
      position: sticky;
      inset-block-start: 0;
      z-index: 1;
      padding: var(--opus-space-2) var(--opus-space-3);
      text-align: start;
      font-weight: var(--opus-weight-semibold);
      color: var(--opus-text-secondary);
      background: var(--opus-surface-sunken);
      border-block-end: 1px solid var(--opus-border);
      white-space: nowrap;
    }

    th[data-align='end'],
    td[data-align='end'] {
      text-align: end;
    }

    th[data-align='center'],
    td[data-align='center'] {
      text-align: center;
    }

    td {
      padding: var(--opus-space-2) var(--opus-space-3);
      color: var(--opus-text);
      border-block-end: 1px solid var(--opus-border);
      vertical-align: middle;
    }

    table[data-density='compact'] td,
    table[data-density='compact'] thead th {
      padding: var(--opus-space-1) var(--opus-space-2);
    }

    table[data-zebra='true'] tbody tr:nth-child(even) {
      background: color-mix(in srgb, var(--opus-surface-sunken) 45%, transparent);
    }

    tbody tr[role='button'] {
      cursor: pointer;
    }

    tbody tr:hover {
      background: var(--opus-surface-hover);
    }

    tbody tr[data-selected='true'] {
      background: var(--opus-accent-soft);
    }

    tbody tr:focus-visible {
      outline: 2px solid var(--opus-focus-ring);
      outline-offset: -2px;
    }

    td span[data-emphasis='negative'] {
      color: var(--opus-emphasis-negative);
      font-weight: var(--opus-weight-medium);
    }

    td span[data-emphasis='warning'] {
      color: var(--opus-emphasis-warning);
    }

    td span[data-emphasis='positive'] {
      color: var(--opus-emphasis-positive);
    }

    td span[data-emphasis='muted'] {
      color: var(--opus-text-muted);
    }

    code {
      font-family: var(--opus-font-mono);
      font-size: var(--opus-text-xs);
      color: var(--opus-text-secondary);
    }

    .sort,
    .cell-link {
      display: inline-flex;
      align-items: center;
      gap: var(--opus-space-1);
      padding: 0;
      font: inherit;
      color: inherit;
      background: none;
      border: 0;
      cursor: pointer;
    }

    .cell-link {
      color: var(--opus-emphasis-info);
      text-decoration: underline;
      text-underline-offset: 2px;
    }

    .sort:focus-visible,
    .cell-link:focus-visible {
      outline: 2px solid var(--opus-focus-ring);
      outline-offset: 2px;
      border-radius: var(--opus-radius-sm);
    }

    .sort-glyph {
      color: var(--opus-text-muted);
      font-size: var(--opus-text-xs);
    }

    .row-count {
      margin: var(--opus-space-2) 0 0;
      font-size: var(--opus-text-xs);
      color: var(--opus-text-muted);
    }
  `,
})
export class TableComponent {
  readonly config = input<TableConfig>({});
  readonly data = input.required<DataView>();
  readonly context = input.required<ComponentContext>();
  readonly title = input<string>('');
  readonly bindings = input<Record<string, FieldBinding | readonly FieldBinding[]>>({});
  readonly stateTitle = input<string>('');
  readonly stateMessage = input<string>('');

  readonly action = output<ComponentActionEvent>();

  private readonly sortField = signal<string | null>(null);
  private readonly sortDirection = signal<'asc' | 'desc'>('asc');
  private readonly selectedIndex = signal<number | null>(null);

  protected readonly columns = computed<Column[]>(() => {
    const raw = this.bindings()['columns'];
    const list: readonly FieldBinding[] = Array.isArray(raw)
      ? raw
      : raw
        ? [raw as FieldBinding]
        : [];
    const denied = new Set(this.data().deniedFields ?? []);
    return list
      .filter((b) => !b.hidden)
      .filter((b) => !denied.has(b.field))
      .map((binding) => ({
        binding,
        label: labelOf(binding),
        width: binding.width === 'fit' ? undefined : binding.width,
        align: binding.align ?? 'start',
        sortable: binding.sortable !== false,
      }));
  });

  protected readonly partialMessage = computed(() => {
    const denied = this.data().deniedFields ?? [];
    if (this.data().state !== 'partial' || !denied.length) return '';
    return `${denied.length} column${denied.length === 1 ? '' : 's'} not available to you.`;
  });

  protected readonly rows = computed<readonly DataRow[]>(() => {
    const rows = [...this.data().rows];
    const field = this.sortField();
    if (!field) return rows;
    const direction = this.sortDirection() === 'asc' ? 1 : -1;
    return rows.sort((a, b) => compareValues(a[field], b[field]) * direction);
  });

  protected readonly rowInteractive = computed(
    () => this.data().state === 'ready' || this.data().state === 'partial',
  );

  protected cellsFor(row: DataRow): Cell[] {
    return this.columns().map(({ binding }) => {
      const raw = row[binding.field] ?? null;
      return {
        raw,
        text: this.context().format(raw, binding, row),
        emphasis: this.emphasisFor(binding, row),
        renderAs: binding.renderAs ?? 'text',
        actionId: binding.action,
      };
    });
  }

  private emphasisFor(binding: FieldBinding, row: DataRow): Emphasis {
    for (const cf of binding.conditionalFormats ?? []) {
      if (this.context().evaluate(cf.when.$expr, { row })) return cf.emphasis;
    }
    return 'neutral';
  }

  protected isSelected(index: number): boolean {
    return this.selectedIndex() === index;
  }

  protected toggleSort(field: string): void {
    if (this.sortField() === field) {
      this.sortDirection.update((d) => (d === 'asc' ? 'desc' : 'asc'));
    } else {
      this.sortField.set(field);
      this.sortDirection.set('asc');
    }
  }

  protected sortGlyph(col: Column): string {
    if (this.sortField() !== col.binding.field) return '↕';
    return this.sortDirection() === 'asc' ? '↑' : '↓';
  }

  protected ariaSort(col: Column): string | null {
    if (this.sortField() !== col.binding.field) return col.sortable ? 'none' : null;
    return this.sortDirection() === 'asc' ? 'ascending' : 'descending';
  }

  protected activateRow(row: DataRow, index: number): void {
    if (!this.rowInteractive()) return;
    if (this.config().selectionMode === 'single') {
      this.selectedIndex.set(index);
      this.emit('selectionChanged', { ...row });
    }
    this.emit('rowActivated', { ...row });
  }

  /** A cell-level action supersedes the row action, so a link does not also drill the row. */
  protected activateCell(event: Event, cell: Cell, row: DataRow): void {
    event.stopPropagation();
    this.emit('cellActivated', { ...row, $actionId: cell.actionId ?? null });
  }

  protected emit(event: string, payload: Record<string, unknown>): void {
    this.action.emit({ event, payload });
  }
}

function labelOf(binding: FieldBinding): string {
  if (typeof binding.label === 'string') return binding.label;
  if (binding.label) return binding.label.default;
  return binding.field;
}

function compareValues(a: unknown, b: unknown): number {
  if (a === b) return 0;
  if (a === null || a === undefined) return 1;
  if (b === null || b === undefined) return -1;
  if (typeof a === 'number' && typeof b === 'number') return a - b;
  return String(a).localeCompare(String(b), undefined, { numeric: true, sensitivity: 'base' });
}
