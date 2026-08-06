/**
 * `opus-list-panel` — the left half of the CODA workbench: a searchable, collapsible list.
 *
 * Ported from the Opus EDM console, where every editor is the same shape — a list of the things you
 * can work on, and the one you are working on. It replaces the page builder's `<select>` page picker,
 * and that is a functional change rather than a cosmetic one:
 *
 *   - a filter box, so a page is found by typing instead of by scrolling a closed dropdown;
 *   - persistent context, so the author can see which sibling pages exist while editing one;
 *   - a per-item hint, which is where the unsaved-draft marker now lives — a `<select>` had nowhere
 *     to put it except a bullet glued to the option text;
 *   - collapse, so the canvas can have the width back on a small screen.
 *
 * Filtering happens here, over `items`. That is deliberate: the filter is a property of the *view*,
 * and pushing it to the host would mean every host reimplementing the same case-insensitive match.
 * Hosts that need server-side search can pass already-filtered items and hide the box.
 */

import {
  ChangeDetectionStrategy,
  Component,
  computed,
  input,
  model,
  output,
  signal,
} from '@angular/core';

import { IconComponent } from './icon.component';

/** One selectable thing. `hint` is the trailing detail — a state, a count, a timestamp. */
export interface ListPanelItem {
  readonly id: string;
  readonly label: string;
  readonly hint?: string;
  readonly icon?: string;
}

@Component({
  selector: 'opus-list-panel',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [IconComponent],
  template: `
    <div class="opus-wb-list">
      <div class="opus-wb-list-head">
        @if (!collapsed()) {
          <span class="title">{{ title() }}</span>
          <span class="count">{{ countLabel() }}</span>
        }
        <span class="spacer"></span>
        <button
          type="button"
          class="opus-icon-btn"
          [attr.aria-expanded]="!collapsed()"
          [title]="collapsed() ? 'Show ' + title().toLowerCase() : 'Hide ' + title().toLowerCase()"
          (click)="collapsed.set(!collapsed())"
        >
          <opus-icon [name]="collapsed() ? 'chevron-right' : 'chevron-left'" [size]="16" />
        </button>
      </div>

      @if (!collapsed()) {
        @if (searchable()) {
          <div class="opus-wb-list-search">
            <div class="opus-search-wrap">
              <span class="opus-search-icon">
                <opus-icon name="search" [size]="14" [weight]="2" />
              </span>
              <input
                class="opus-input"
                type="search"
                [placeholder]="placeholder()"
                [value]="filter()"
                (input)="filter.set($any($event.target).value)"
                [attr.aria-label]="placeholder()"
              />
            </div>
          </div>
        }

        <ul class="opus-wb-list-items" role="listbox" [attr.aria-label]="title()">
          @for (item of visible(); track item.id) {
            <li>
              <button
                type="button"
                class="opus-wb-list-item"
                role="option"
                [class.active]="item.id === selectedId()"
                [attr.aria-selected]="item.id === selectedId()"
                (click)="pick.emit(item.id)"
              >
                @if (item.icon) {
                  <opus-icon [name]="item.icon" [size]="15" />
                }
                <!-- Titled, because a 260px column truncates real names and hover is the only way back. -->
                <span class="label" [title]="item.label">{{ item.label }}</span>
                @if (item.hint) {
                  <span class="hint">{{ item.hint }}</span>
                }
              </button>
            </li>
          } @empty {
            <!--
              Two different empty states. "No matches" is the author's filter and is fixed by
              clearing it; "nothing here yet" is the app's state and is not. Collapsing both into one
              message sends an author looking for a typo in an empty list.
            -->
            <li class="empty">{{ items().length ? 'No matches for “' + filter() + '”' : emptyText() }}</li>
          }
        </ul>
      }
    </div>
  `,
  styles: `
    :host {
      display: contents;
    }

    .empty {
      padding: var(--opus-space-4) 14px;
      font-size: var(--opus-text-sm);
      color: var(--opus-text-muted);
      line-height: var(--opus-leading-normal);
    }
  `,
})
export class ListPanelComponent {
  readonly title = input('Items');
  readonly items = input.required<readonly ListPanelItem[]>();
  readonly selectedId = input<string | null>(null);
  readonly searchable = input(true);
  readonly placeholder = input('Filter…');
  readonly emptyText = input('Nothing here yet.');

  /** A model so a host can collapse the panel from its own toolbar. */
  readonly collapsed = model(false);

  readonly pick = output<string>();

  protected readonly filter = signal('');

  protected readonly visible = computed(() => {
    const needle = this.filter().trim().toLowerCase();
    if (!needle) return this.items();
    return this.items().filter(
      (item) =>
        item.label.toLowerCase().includes(needle) ||
        item.id.toLowerCase().includes(needle) ||
        (item.hint?.toLowerCase().includes(needle) ?? false),
    );
  });

  /** "7" when nothing is filtered, "3 of 7" when something is — so the filter is never invisible. */
  protected readonly countLabel = computed(() => {
    const total = this.items().length;
    const shown = this.visible().length;
    return shown === total ? `${total}` : `${shown} of ${total}`;
  });
}
