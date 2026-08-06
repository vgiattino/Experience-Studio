/**
 * EDM Administration — the Opus EDM console's home screen, recreated natively.
 *
 * Ported from `vgiattino/MDE@fea3616`, `frontend/src/app/features/dashboard/`: the eight task cards,
 * the Open items list with its sort and progress rows, and the Recent visited aside. Same content,
 * same information architecture, same reading order.
 *
 * ── WHAT RECREATING BOUGHT OVER FRAMING IT ────────────────────────────────────────────
 * An iframe was the previous approach and it worked, but it was another application in a box. Three
 * things are only true of a native recreation:
 *
 *   1. **It themes.** The original hardcodes its icon tiles — `iconBg: '#eaf2fc'` with
 *      `iconFg: '#1968d3'`, four pastel pairs — which is fine in a product with one theme and a white
 *      smear on a dark surface. Here the tiles are emphasis variants, so they keep the same four-way
 *      grouping and survive the theme switch.
 *   2. **It costs nothing.** The frame carried 5.7 MB of vendored React and Babel. This is one
 *      component and a shared stylesheet.
 *   3. **Its icons are names.** The original repeats `ICON_PATHS` and a `DomSanitizer` per feature —
 *      three near-identical `getIcon` methods in the file this came from. Here an icon is a name in
 *      the platform registry, which is what makes the card list *data* rather than markup.
 *
 * ── WHAT IT DELIBERATELY IS NOT ───────────────────────────────────────────────────────
 * The seed data is the console's, verbatim, and it is **mock**: Saul Goodman's SFTP configuration is
 * not a real work item, and nothing here reads or writes EDM. The destinations are console routes that
 * do not exist in this application, so a card reports where it *would* go rather than pretending to
 * navigate. Saying so in the UI is the difference between a recreation and a fake.
 */

import { ChangeDetectionStrategy, Component, computed, signal } from '@angular/core';
import { IconComponent } from '@opus/design-system';

/** The four-way emphasis grouping that replaces the original's four hardcoded pastel pairs. */
type TileTone = 'info' | 'accent' | 'positive' | 'neutral';

interface TaskCard {
  readonly id: string;
  readonly title: string;
  readonly desc: string;
  readonly icon: string;
  readonly tone: TileTone;
  /** The console route this opens. Named, not followed — see the header. */
  readonly goto: string;
}

interface WorkItem {
  readonly id: string;
  readonly name: string;
  readonly leftKey: string;
  readonly leftVal: string;
  readonly midKey?: string;
  readonly midVal?: string;
  readonly warn?: boolean;
  readonly progress?: number;
  readonly by: string;
  readonly accessed: string;
  /** Sortable form of `accessed`, because "10 Sep 2023 01:31 PM" does not sort as a string. */
  readonly at: number;
}

interface RecentItem {
  readonly id: string;
  readonly title: string;
  readonly sub: string;
  readonly icon: string;
  readonly goto: string;
}

const CARDS: readonly TaskCard[] = [
  {
    id: 'sources',
    title: 'Modify sources',
    desc: 'Manage the fields included in your source requests for each data vendor',
    icon: 'database',
    tone: 'info',
    goto: '/porter',
  },
  {
    id: 'attribs',
    title: 'Add attributes',
    desc: 'Create new attributes to customize the master model to suite your business needs',
    icon: 'attribute',
    tone: 'accent',
    goto: '/rules',
  },
  {
    id: 'models',
    title: 'Browse data models',
    desc: 'Explore existing data models and make minor adjustments as needed.',
    icon: 'model',
    tone: 'positive',
    goto: '/metadata',
  },
  {
    id: 'match',
    title: 'Adjust match settings',
    desc: 'Customize and fine-tune the settings for your data matching process',
    icon: 'matcher',
    tone: 'info',
    goto: '/matcher',
  },
  {
    id: 'master',
    title: 'Adjust mastering settings',
    desc: 'Configure and refine the settings for your data mastering process',
    icon: 'sliders',
    tone: 'accent',
    goto: '/constructor',
  },
  {
    id: 'flow',
    title: 'Modify a flow',
    desc: 'Refine your data using filters, validation, and transformations.',
    icon: 'flow',
    tone: 'positive',
    goto: '/flow',
  },
  {
    id: 'users',
    title: 'Manage users',
    desc: 'Manage individual user accounts',
    icon: 'user',
    tone: 'neutral',
    goto: '/security',
  },
  {
    id: 'groups',
    title: 'Manage groups',
    desc: 'Create and organize user groups for efficient access management',
    icon: 'users',
    tone: 'neutral',
    goto: '/security',
  },
];

const WORK: readonly WorkItem[] = [
  {
    id: 'oi-1',
    name: 'My custom source',
    leftKey: 'TYPE',
    leftVal: 'Source',
    midKey: 'STEP',
    midVal: 'SFTP configuration',
    warn: true,
    by: 'saul.goodman@hhm.com',
    accessed: '10 Sep 2023 01:31 PM',
    at: Date.parse('2023-09-10T13:31:00Z'),
  },
  {
    id: 'oi-2',
    name: 'Add an attribute',
    leftKey: 'MODEL',
    leftVal: 'Master security',
    progress: 40,
    by: 'chuck.mcgill@hhm.com',
    accessed: '10 Sep 2023 01:31 PM',
    at: Date.parse('2023-09-10T13:31:00Z'),
  },
  {
    id: 'oi-3',
    name: 'Add an attribute',
    leftKey: 'MODEL',
    leftVal: 'Master security',
    progress: 80,
    by: 'kim.wexler@email.com',
    accessed: '10 Sep 2023 01:31 PM',
    at: Date.parse('2023-09-10T13:31:00Z'),
  },
  {
    id: 'oi-4',
    name: 'My custom source',
    leftKey: 'TYPE',
    leftVal: 'Source',
    midKey: 'STEP',
    midVal: 'SFTP configuration',
    warn: true,
    by: 'saul.goodman@hhm.com',
    accessed: '09 Sep 2023 03:15 PM',
    at: Date.parse('2023-09-09T15:15:00Z'),
  },
];

const RECENT: readonly { group: string; items: readonly RecentItem[] }[] = [
  {
    group: 'Last week',
    items: [
      { id: 'r1', title: 'Matching', sub: 'Model: Security master', icon: 'matcher', goto: '/matcher' },
      { id: 'r2', title: 'Master security', sub: 'Mastering', icon: 'mastering', goto: '/constructor' },
    ],
  },
  {
    group: 'Older',
    items: [
      { id: 'r3', title: 'Bloomberg flow', sub: 'Flows', icon: 'flow', goto: '/flow' },
      { id: 'r4', title: 'Master fixed income', sub: 'Model: Security master', icon: 'model', goto: '/metadata' },
      { id: 'r5', title: 'BPS', sub: 'Sources', icon: 'database', goto: '/porter' },
      { id: 'r6', title: 'Master equity', sub: 'Mastering', icon: 'mastering', goto: '/constructor' },
      { id: 'r7', title: 'Refinitiv', sub: 'Sources', icon: 'database', goto: '/porter' },
    ],
  },
];

type SortKey = 'newest' | 'oldest' | 'name' | 'by';

const SORTS: readonly { key: SortKey; label: string }[] = [
  { key: 'newest', label: 'Last accessed (Newest)' },
  { key: 'oldest', label: 'Last accessed (Oldest)' },
  { key: 'name', label: 'Name (A–Z)' },
  { key: 'by', label: 'Started by' },
];

@Component({
  selector: 'opus-edm-administration',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [IconComponent],
  template: `
    <div class="opus-page opus-fade-in">
      <p class="disclosure" role="note">
        <opus-icon name="info" [size]="15" />
        <span>
          <strong>Opus EDM Administration</strong>, recreated natively from the console
          (<code>fea3616</code>) in this application's own design system — so it themes, and costs a
          component rather than a framed copy. The seed data is the console's and is mock; the
          destinations are console routes, which this application does not host.
        </span>
      </p>

      <div class="opus-page-head">
        <span class="opus-icon-tile accent">
          <opus-icon name="settings" [size]="20" />
        </span>
        <h1>Administration</h1>
      </div>

      <div class="opus-page-grid">
        <div>
          <div class="opus-card-grid">
            @for (card of cards; track card.id) {
              <button type="button" class="opus-task-card" (click)="open(card.goto)">
                <span class="opus-icon-tile" [class]="card.tone">
                  <opus-icon [name]="card.icon" [size]="20" />
                </span>
                <span class="title">{{ card.title }}</span>
                <span class="desc">{{ card.desc }}</span>
              </button>
            }
          </div>

          <div class="opus-section-head">
            <div>
              <h2>Open items</h2>
              <span class="lead">
                Finish your incomplete items to ensure data is processed correctly
              </span>
            </div>
            <div class="controls">
              <label for="work-sort">Sort by</label>
              <!--
                A native select rather than the Kendo dropdown the original uses. The platform has no
                Kendo dependency and should not gain one for a sort control: a select is keyboard
                accessible, themes from the token set, and needs no library.
              -->
              <select
                id="work-sort"
                class="opus-select"
                [value]="sort()"
                (change)="sort.set($any($event.target).value)"
              >
                @for (option of sorts; track option.key) {
                  <option [value]="option.key">{{ option.label }}</option>
                }
              </select>
            </div>
          </div>

          @for (item of sorted(); track item.id) {
            <div class="opus-work-row">
              <span class="doc"><opus-icon name="document" [size]="18" /></span>

              <span class="name">
                <button type="button" (click)="open('/porter')">{{ item.name }}</button>
              </span>

              @if (item.progress !== undefined) {
                <div class="progress-cell">
                  <span class="opus-pill-count">{{ item.progress }}%</span>
                  <!--
                    The bar carries the ARIA, not the pill: a progressbar role needs its value, and a
                    screen reader reading "40%" twice from two elements is worse than once from one.
                  -->
                  <div
                    class="opus-progress"
                    role="progressbar"
                    [attr.aria-valuenow]="item.progress"
                    aria-valuemin="0"
                    aria-valuemax="100"
                    [attr.aria-label]="item.name + ' progress'"
                  >
                    <i [style.inline-size.%]="item.progress"></i>
                  </div>
                </div>
              } @else {
                <div class="pairs">
                  <div class="opus-field-pair">
                    <span class="k">{{ item.leftKey }}</span>
                    <span class="v">{{ item.leftVal }}</span>
                  </div>
                  @if (item.midKey) {
                    <div class="opus-field-pair">
                      <span class="k">{{ item.midKey }}</span>
                      <span class="v">
                        {{ item.midVal }}
                        @if (item.warn) {
                          <span
                            class="warn"
                            role="img"
                            [attr.aria-label]="item.midVal + ' needs attention'"
                          >
                            <opus-icon name="warning" [size]="15" [weight]="2" />
                          </span>
                        }
                      </span>
                    </div>
                  }
                </div>
              }

              <div class="opus-field-pair">
                <span class="k">Started by</span>
                <span class="v">{{ item.by }}</span>
              </div>
              <div class="opus-field-pair">
                <span class="k">Last accessed</span>
                <span class="v">{{ item.accessed }}</span>
              </div>

              <!--
                The original ends each row with a "⋮" drag affordance. Omitted rather than faked:
                reordering a mock list persists nothing, and a handle that looks draggable and does
                nothing is a worse recreation than one that is honestly absent.
              -->
            </div>
          }
        </div>

        <aside class="opus-aside">
          <h2>Recent visited</h2>
          <p class="lead">Your most recently accessed pages for quick and easy reference</p>

          @for (group of recent; track group.group) {
            <p class="opus-group-label">{{ group.group }}</p>
            @for (item of group.items; track item.id) {
              <button type="button" class="opus-recent-row" (click)="open(item.goto)">
                <span class="opus-icon-tile sm">
                  <opus-icon [name]="item.icon" [size]="17" />
                </span>
                <span class="text">
                  <span class="title">{{ item.title }}</span>
                  <span class="sub">{{ item.sub }}</span>
                </span>
              </button>
            }
          }
        </aside>
      </div>

      @if (opened(); as route) {
        <p class="opened" role="status">
          <opus-icon name="chevron-right" [size]="14" [weight]="2" />
          That opens <code>{{ route }}</code> in the EDM console. This application does not host the
          console's routes, so nothing navigated.
        </p>
      }
    </div>
  `,
  styles: `
    :host {
      display: block;
      block-size: 100%;
      min-block-size: 0;
      overflow: hidden;
      background: var(--opus-canvas);
    }

    .disclosure {
      display: flex;
      align-items: flex-start;
      gap: var(--opus-space-2);
      margin: 0 0 var(--opus-space-5);
      padding: 10px 14px;
      border: 1px solid var(--opus-border);
      border-radius: var(--opus-radius-md);
      background: var(--opus-surface);
      font-size: var(--opus-text-sm);
      color: var(--opus-text-secondary);
      line-height: var(--opus-leading-normal);
      max-inline-size: 64rem;
    }

    .disclosure strong {
      color: var(--opus-text);
    }

    .disclosure code,
    .opened code {
      font-family: var(--opus-font-mono);
      font-size: var(--opus-text-xs);
    }

    .doc {
      color: var(--opus-text-muted);
      display: flex;
      flex-shrink: 0;
    }

    .pairs {
      display: flex;
      align-items: center;
      gap: var(--opus-space-6);
      flex-wrap: wrap;
    }

    .progress-cell {
      display: flex;
      flex-direction: column;
      gap: 2px;
    }

    .warn {
      color: var(--opus-emphasis-warning);
      display: inline-flex;
    }

    /* A live region rather than a toast: it reports what a click would have done, and reporting it
       in place keeps the claim next to the thing that made it. */
    .opened {
      display: flex;
      align-items: center;
      gap: var(--opus-space-2);
      margin: var(--opus-space-5) 0 0;
      padding: 8px 12px;
      border-radius: var(--opus-radius-sm);
      background: var(--opus-emphasis-info-bg);
      color: var(--opus-emphasis-info);
      font-size: var(--opus-text-sm);
      max-inline-size: 64rem;
    }

    .opus-select {
      inline-size: 13.5rem;
    }

    @media (max-width: 760px) {
      .controls {
        inline-size: 100%;
      }

      .opus-select {
        inline-size: 100%;
      }
    }
  `,
})
export class EdmAdministrationComponent {
  protected readonly cards = CARDS;
  protected readonly recent = RECENT;
  protected readonly sorts = SORTS;

  protected readonly sort = signal<SortKey>('newest');
  /** The last destination a card reported. Null until something is clicked. */
  protected readonly opened = signal<string | null>(null);

  /**
   * Sorted work items.
   *
   * Sorted on `at` rather than the formatted `accessed` string, because "10 Sep 2023 01:31 PM" sorts
   * lexicographically as if the 9th came after the 10th. The original reverses the array for "oldest",
   * which is only equivalent while the seed data happens to be in order.
   */
  protected readonly sorted = computed(() => {
    const items = [...WORK];
    switch (this.sort()) {
      case 'oldest':
        return items.sort((a, b) => a.at - b.at);
      case 'name':
        return items.sort((a, b) => a.name.localeCompare(b.name) || a.at - b.at);
      case 'by':
        return items.sort((a, b) => a.by.localeCompare(b.by) || a.at - b.at);
      default:
        return items.sort((a, b) => b.at - a.at);
    }
  });

  protected open(route: string): void {
    this.opened.set(route);
  }
}
