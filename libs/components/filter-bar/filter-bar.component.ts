/**
 * input.filter-bar
 *
 * Search and faceted filtering — the affordance the three v1 journeys all need and the one
 * component vocabulary gap that made "search" unexpressible.
 *
 * IT WRITES NOTHING ITSELF. The component emits `searchChanged` / `facetChanged` / `cleared`, and
 * the page maps those to `setFilter` and `clearFilters` actions. A component that wrote page state
 * directly would be the second write path into the runtime's state tiers, and the reason the
 * architecture routes every state change through a declared action is that the declaration is what
 * makes the dependency graph derivable — the compiler learns which data sources a filter change
 * invalidates by reading the definition, not by observing components at runtime
 * (architecture/runtime-architecture.md §5).
 *
 * THE FACETS ARE METADATA, NOT MARKUP. Their channels, labels and options are declared in `config`
 * and validated against the manifest's property schema, so a page gains a new facet by editing
 * JSON. The option values come from the catalog's `enumValues` when the page is authored or
 * generated, which is why the component itself needs no catalog access.
 *
 * DEBOUNCING IS THE COMPONENT'S JOB, not the page's. A search box that dispatched an action per
 * keystroke would issue a query per keystroke — and since every widget reading the channel
 * re-queries, that is a dashboard's worth of round trips per letter typed.
 */

import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  computed,
  inject,
  input,
  output,
  signal,
} from '@angular/core';
import type { ComponentActionEvent, ComponentContext } from '@opus/contracts';

let instanceCount = 0;

export interface FilterFacet {
  /** Filter channel this facet writes, via the mapped action. */
  channel: string;
  label: string;
  /** Several values at once. Renders as toggle chips rather than a single-choice select. */
  multi?: boolean;
  options: readonly { value: string; label?: string }[];
}

export interface FilterBarConfig {
  searchPlaceholder?: string;
  /** Omitted, the search box is not rendered — a facet-only bar is legitimate. */
  searchChannel?: string;
  /** Milliseconds of quiet before a search change is emitted. */
  debounceMs?: number;
  facets?: readonly FilterFacet[];
  showClearAll?: boolean;
  /** A short line under the bar, e.g. how many records matched. */
  summary?: string;
  density?: 'comfortable' | 'compact';
}

@Component({
  selector: 'opus-filter-bar',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="bar" [attr.data-density]="config().density ?? 'comfortable'" role="search">
      @if (config().searchChannel) {
        <div class="search">
          <label class="sr-only" [attr.for]="searchId()">{{ config().searchPlaceholder || 'Search' }}</label>
          <span class="glyph" aria-hidden="true">⌕</span>
          <input
            type="search"
            [id]="searchId()"
            [value]="searchText()"
            [attr.placeholder]="config().searchPlaceholder || 'Search'"
            (input)="onSearchInput($any($event.target).value)"
            (keydown.enter)="flushSearch()"
          />
          @if (searchText()) {
            <button type="button" class="icon" (click)="clearSearch()" aria-label="Clear search">×</button>
          }
        </div>
      }

      @for (facet of facets(); track facet.channel) {
        <div class="facet" [attr.data-channel]="facet.channel">
          <span class="facet-label" [id]="facetLabelId(facet)">{{ facet.label }}</span>

          @if (facet.multi) {
            <div class="chips" role="group" [attr.aria-labelledby]="facetLabelId(facet)">
              @for (option of facet.options; track option.value) {
                <button
                  type="button"
                  class="chip"
                  [attr.aria-pressed]="isSelected(facet, option.value)"
                  [class.on]="isSelected(facet, option.value)"
                  (click)="toggleFacet(facet, option.value)"
                >
                  {{ option.label || option.value }}
                </button>
              }
            </div>
          } @else {
            <select
              [attr.aria-labelledby]="facetLabelId(facet)"
              (change)="setFacet(facet, $any($event.target).value)"
            >
              <option value="" [selected]="!selectedValues(facet).length">Any</option>
              @for (option of facet.options; track option.value) {
                <option [value]="option.value" [selected]="isSelected(facet, option.value)">
                  {{ option.label || option.value }}
                </option>
              }
            </select>
          }
        </div>
      }

      @if (config().showClearAll !== false && hasAnyFilter()) {
        <button type="button" class="clear" (click)="clearAll()">Clear all</button>
      }

      @if (config().summary) {
        <p class="summary">{{ config().summary }}</p>
      }
    </div>
  `,
  styles: `
    :host {
      display: block;
      container-type: inline-size;
    }

    .bar {
      display: flex;
      flex-wrap: wrap;
      align-items: center;
      gap: var(--opus-space-3);
      padding: var(--opus-space-3);
      background: var(--opus-surface);
      border: 1px solid var(--opus-border);
      border-radius: var(--opus-radius-md);
    }

    .bar[data-density='compact'] {
      gap: var(--opus-space-2);
      padding: var(--opus-space-2);
    }

    .search {
      display: flex;
      align-items: center;
      gap: var(--opus-space-1);
      flex: 1 1 16rem;
      min-inline-size: 12rem;
      padding-inline: var(--opus-space-2);
      background: var(--opus-canvas);
      border: 1px solid var(--opus-border);
      border-radius: var(--opus-radius-sm);
    }

    .glyph {
      color: var(--opus-text-muted);
    }

    input[type='search'] {
      flex: 1;
      min-inline-size: 0;
      padding-block: var(--opus-space-2);
      font: inherit;
      font-size: var(--opus-text-sm);
      color: var(--opus-text);
      background: none;
      border: 0;
      outline-offset: 3px;
    }

    input[type='search']::-webkit-search-cancel-button {
      display: none;
    }

    .facet {
      display: flex;
      align-items: center;
      gap: var(--opus-space-2);
    }

    .facet-label {
      font-size: var(--opus-text-xs);
      font-weight: var(--opus-weight-medium);
      color: var(--opus-text-muted);
      white-space: nowrap;
    }

    .chips {
      display: flex;
      gap: 4px;
      flex-wrap: wrap;
    }

    .chip,
    .clear,
    .icon {
      font: inherit;
      font-size: var(--opus-text-xs);
      padding: 3px var(--opus-space-2);
      color: var(--opus-text-secondary);
      background: var(--opus-canvas);
      border: 1px solid var(--opus-border);
      border-radius: 999px;
      cursor: pointer;
    }

    .chip.on {
      color: var(--opus-text-inverse);
      background: var(--opus-emphasis-info);
      border-color: var(--opus-emphasis-info);
    }

    .icon {
      border: 0;
      background: none;
      font-size: var(--opus-text-md);
      line-height: 1;
      padding: 0 4px;
    }

    .clear {
      border-radius: var(--opus-radius-sm);
    }

    select {
      font: inherit;
      font-size: var(--opus-text-sm);
      padding: 3px var(--opus-space-1);
      color: var(--opus-text);
      background: var(--opus-canvas);
      border: 1px solid var(--opus-border);
      border-radius: var(--opus-radius-sm);
    }

    input:focus-visible,
    select:focus-visible,
    button:focus-visible {
      outline: 2px solid var(--opus-focus-ring);
      outline-offset: 2px;
    }

    /* Declared here rather than assumed from a global sheet: a component's styles are scoped, so
       an undeclared utility class renders the label as visible text beside the input. */
    .sr-only {
      position: absolute;
      inline-size: 1px;
      block-size: 1px;
      overflow: hidden;
      clip-path: inset(50%);
      white-space: nowrap;
    }

    .summary {
      flex-basis: 100%;
      margin: 0;
      font-size: var(--opus-text-xs);
      color: var(--opus-text-muted);
    }

    /* Below this width the facets stack, so a phone shows a search box and full-width facet
       rows rather than a horizontally scrolling strip. */
    @container (max-width: 40rem) {
      .bar {
        flex-direction: column;
        align-items: stretch;
      }

      .facet {
        justify-content: space-between;
      }
    }
  `,
})
export class FilterBarComponent {
  private readonly destroyRef = inject(DestroyRef);

  readonly config = input<FilterBarConfig>({});
  readonly context = input<ComponentContext | null>(null);
  readonly title = input<string>('');

  readonly action = output<ComponentActionEvent>();

  /** Local echo of the search text, so typing is responsive while the emit is debounced. */
  private readonly localSearch = signal<string | null>(null);
  private timer: ReturnType<typeof setTimeout> | null = null;

  constructor() {
    this.destroyRef.onDestroy(() => {
      if (this.timer !== null) clearTimeout(this.timer);
    });
  }

  protected readonly facets = computed(() => this.config().facets ?? []);

  /**
   * A per-instance id, for `label[for]` and `aria-labelledby`.
   *
   * From an instance counter rather than the component id: `ComponentContext` does not carry one,
   * and two filter bars on one page must not share a label target — a click on the second bar's
   * label would focus the first bar's input.
   */
  private readonly uid = `fb${++instanceCount}`;

  protected readonly searchId = computed(() => `${this.uid}-search`);

  /**
   * The channel value is the source of truth; the local echo only covers the debounce window.
   *
   * Reading the channel back matters for deep links and for Clear All: the box must show what the
   * page is actually filtered by, not what was last typed into it.
   */
  protected readonly searchText = computed(() => {
    const local = this.localSearch();
    if (local !== null) return local;
    const channel = this.config().searchChannel;
    const value = channel ? this.context()?.filters?.[channel] : undefined;
    return value === null || value === undefined ? '' : String(value);
  });

  protected readonly hasAnyFilter = computed(() => {
    if (this.searchText()) return true;
    return this.facets().some((facet) => this.selectedValues(facet).length > 0);
  });

  protected facetLabelId(facet: FilterFacet): string {
    return `${this.uid}-${facet.channel}`;
  }

  protected selectedValues(facet: FilterFacet): readonly string[] {
    const value = this.context()?.filters?.[facet.channel];
    if (value === null || value === undefined || value === '') return [];
    return Array.isArray(value) ? value.map(String) : [String(value)];
  }

  protected isSelected(facet: FilterFacet, option: string): boolean {
    return this.selectedValues(facet).includes(option);
  }

  protected onSearchInput(value: string): void {
    this.localSearch.set(value);
    if (this.timer !== null) clearTimeout(this.timer);
    this.timer = setTimeout(() => this.emitSearch(value), this.config().debounceMs ?? 300);
  }

  protected flushSearch(): void {
    if (this.timer !== null) clearTimeout(this.timer);
    this.timer = null;
    this.emitSearch(this.searchText());
  }

  private emitSearch(value: string): void {
    this.timer = null;
    const channel = this.config().searchChannel;
    if (!channel) return;
    this.action.emit({ event: 'searchChanged', payload: { channel, value } });
    // Release the echo: from here the channel is authoritative again.
    this.localSearch.set(null);
  }

  protected clearSearch(): void {
    if (this.timer !== null) clearTimeout(this.timer);
    this.localSearch.set('');
    this.emitSearch('');
  }

  protected setFacet(facet: FilterFacet, value: string): void {
    this.action.emit({
      event: 'facetChanged',
      payload: { channel: facet.channel, value: value === '' ? null : value },
    });
  }

  protected toggleFacet(facet: FilterFacet, option: string): void {
    const current = this.selectedValues(facet);
    const next = current.includes(option)
      ? current.filter((value) => value !== option)
      : [...current, option];
    this.action.emit({
      event: 'facetChanged',
      // An empty selection is null rather than `[]`, so `skipWhenEmpty` reads it as "no
      // constraint" instead of "match nothing".
      payload: { channel: facet.channel, value: next.length ? next : null },
    });
  }

  protected clearAll(): void {
    if (this.timer !== null) clearTimeout(this.timer);
    this.localSearch.set('');
    this.action.emit({ event: 'cleared', payload: {} });
  }
}
