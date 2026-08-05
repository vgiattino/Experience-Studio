/**
 * Experience navigation — the application shell's page tree.
 *
 * Navigation is modelled at the *experience* level, not as a page widget
 * (schemas/navigation.schema.json): it moves between pages, so it cannot be one
 * of them. It is therefore shell chrome imported directly by the app rather than
 * an entry in the component registry — a deliberate distinction, and the reason
 * tabs live in the layout model while navigation lives here.
 *
 * Badge counts come from experience-scoped data sources, so a live count beside
 * a nav item is declarative metadata rather than bespoke shell code.
 */

import { ChangeDetectionStrategy, Component, computed, input, output } from '@angular/core';
import { BadgeComponent } from '@opus/design-system';
import { text, type DataRow, type Emphasis, type Identifier, type NavItem } from '@opus/contracts';

export interface NavigationSelection {
  itemId: Identifier;
  page?: Identifier;
  url?: string;
  params?: Record<string, unknown>;
}

interface Rendered {
  item: NavItem;
  depth: number;
  label: string;
  badge?: { label: string; emphasis: Emphasis };
  active: boolean;
}

@Component({
  selector: 'opus-navigation',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [BadgeComponent],
  template: `
    <nav [attr.aria-label]="ariaLabel()">
      <ul>
        @for (entry of flattened(); track entry.item.id) {
          <li [attr.data-depth]="entry.depth" [attr.data-kind]="entry.item.kind">
            @switch (entry.item.kind) {
              @case ('divider') {
                <hr [attr.aria-hidden]="entry.label ? null : 'true'" />
                @if (entry.label) {
                  <p class="section-label">{{ entry.label }}</p>
                }
              }
              @case ('group') {
                <p class="group-label">
                  @if (entry.item.icon) {
                    <span class="icon" aria-hidden="true">{{ glyph(entry.item.icon) }}</span>
                  }
                  {{ entry.label }}
                </p>
              }
              @case ('external') {
                <a
                  [href]="externalHref(entry.item)"
                  target="_blank"
                  rel="noopener noreferrer"
                  class="item"
                >
                  <span class="icon" aria-hidden="true">{{ glyph(entry.item.icon) }}</span>
                  <span class="label">{{ entry.label }}</span>
                  <span class="external-hint" aria-hidden="true">↗</span>
                  <span class="sr-only">(opens in a new tab)</span>
                </a>
              }
              @default {
                <button
                  type="button"
                  class="item"
                  [attr.aria-current]="entry.active ? 'page' : null"
                  [attr.data-active]="entry.active"
                  (click)="select(entry.item)"
                >
                  <span class="icon" aria-hidden="true">{{ glyph(entry.item.icon) }}</span>
                  <span class="label">{{ entry.label }}</span>
                  @if (entry.badge) {
                    <opus-badge [label]="entry.badge.label" [emphasis]="entry.badge.emphasis" />
                  }
                </button>
              }
            }
          </li>
        }
      </ul>
    </nav>
  `,
  styles: `
    :host {
      display: block;
    }

    .sr-only {
      position: absolute;
      inline-size: 1px;
      block-size: 1px;
      overflow: hidden;
      clip-path: inset(50%);
      white-space: nowrap;
    }

    ul {
      display: flex;
      flex-direction: column;
      gap: 2px;
      margin: 0;
      padding: 0;
      list-style: none;
    }

    li[data-depth='1'] {
      padding-inline-start: var(--opus-space-3);
    }

    .item {
      display: flex;
      align-items: center;
      gap: var(--opus-space-2);
      inline-size: 100%;
      padding: var(--opus-space-2) var(--opus-space-3);
      font: inherit;
      font-size: var(--opus-text-sm);
      text-align: start;
      text-decoration: none;
      color: var(--opus-text-secondary);
      background: none;
      border: 0;
      border-radius: var(--opus-radius-sm);
      cursor: pointer;
    }

    .item:hover {
      color: var(--opus-text);
      background: var(--opus-surface-hover);
    }

    .item[data-active='true'] {
      color: var(--opus-text);
      font-weight: var(--opus-weight-medium);
      background: var(--opus-accent-soft);
    }

    .item:focus-visible {
      outline: 2px solid var(--opus-focus-ring);
      outline-offset: -2px;
    }

    .label {
      flex: 1;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }

    .icon {
      inline-size: 1.125rem;
      text-align: center;
      opacity: 0.85;
    }

    .external-hint {
      font-size: var(--opus-text-xs);
      color: var(--opus-text-muted);
    }

    .group-label,
    .section-label {
      margin: var(--opus-space-3) 0 var(--opus-space-1);
      padding-inline: var(--opus-space-3);
      font-size: var(--opus-text-xs);
      font-weight: var(--opus-weight-semibold);
      letter-spacing: 0.04em;
      text-transform: uppercase;
      color: var(--opus-text-muted);
    }

    hr {
      margin: var(--opus-space-3) var(--opus-space-3) 0;
      border: 0;
      border-block-start: 1px solid var(--opus-border);
    }
  `,
})
export class NavigationComponent {
  readonly items = input.required<readonly NavItem[]>();
  readonly activePage = input<Identifier | null>(null);
  readonly ariaLabel = input<string>('Experience navigation');
  /** Rows of experience-scoped data sources, keyed by data source id, for badges. */
  readonly badgeData = input<Readonly<Record<string, readonly DataRow[]>>>({});
  /** Evaluates a nav item's `visible` condition. Supplied by the shell. */
  readonly conditionEvaluator = input<(expr: string) => boolean>(() => true);

  readonly navigate = output<NavigationSelection>();

  protected readonly flattened = computed<Rendered[]>(() => {
    const out: Rendered[] = [];
    const walk = (items: readonly NavItem[], depth: number) => {
      for (const item of items) {
        if ('visible' in item && item.visible && !this.conditionEvaluator()(item.visible.$expr)) {
          continue;
        }
        out.push({
          item,
          depth,
          label: 'label' in item ? text(item.label) : '',
          badge: this.badgeFor(item),
          active: item.kind === 'page' && item.page === this.activePage(),
        });
        if (item.kind === 'group') walk(item.children, depth + 1);
      }
    };
    walk(this.items(), 0);
    return out;
  });

  private badgeFor(item: NavItem): { label: string; emphasis: Emphasis } | undefined {
    if (item.kind !== 'page' || !item.badge) return undefined;
    const rows = this.badgeData()[item.badge.source];
    const value = rows?.[0]?.[item.badge.field];
    if (value === null || value === undefined || value === 0) return undefined;
    return {
      label: String(value),
      emphasis: (item.badge.emphasis as Emphasis) ?? 'neutral',
    };
  }

  protected externalHref(item: NavItem): string {
    return item.kind === 'external' ? item.urlTemplate : '#';
  }

  protected select(item: NavItem): void {
    if (item.kind === 'page') {
      this.navigate.emit({ itemId: item.id, page: item.page, params: item.params });
    } else if (item.kind === 'experienceLink') {
      this.navigate.emit({ itemId: item.id, page: item.page, params: item.params });
    }
  }

  /**
   * Icon names in metadata are semantic, not glyphs. M1 maps a small set to text
   * symbols so no icon font or sprite is needed; a real icon set is an M2 concern.
   */
  protected glyph(name: string | undefined): string {
    if (!name) return '·';
    const map: Record<string, string> = {
      dashboard: '▤',
      securities: '◈',
      search: '⌕',
      pipeline: '⇉',
      book: '📖',
      settings: '⚙',
      alert: '⚠',
    };
    return map[name] ?? '·';
  }
}
