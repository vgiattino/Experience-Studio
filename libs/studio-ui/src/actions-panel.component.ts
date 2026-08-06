/**
 * The Actions aspect: what the page can do, and what reaches it.
 *
 * A shipped page declares ten to fourteen actions. None of them was visible in the builder: an action
 * has no widget, so the canvas cannot show it, and the inspector only ever showed the *selected*
 * component. The result was that the entire interactive behaviour of a page — every drill-down, every
 * filter chip, every export — lived exclusively in the JSON.
 *
 * TWO REVERSE INDEXES DO THE WORK, and neither is in the artifact:
 *
 *   - **What dispatches it.** Wiring lives on the *component* (`eventActions`), so an action does not
 *     know what fires it. Walking every component's map is the only way to answer "what happens when
 *     the author clicks this row", and it is the first question they have.
 *   - **Whether anything reaches it at all.** An action nothing dispatches, nothing lists as a page
 *     action and no composite names as a step is dead weight — it validates, it ships, and it can
 *     never run. Flagged here because nothing else in the product would ever say so.
 *
 * The panel is read-and-navigate, not read-and-edit. Editing an action means editing a condition, a
 * parameter map and an expression, and that belongs in a form built against the action schema rather
 * than in a summary view — see the follow-on note in `docs/PAGE-BUILDER.md`. What it *does* do is get
 * the author from an action to the widget that fires it in one click, which is the trip that used to
 * require grepping the JSON.
 */

import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { IconComponent } from '@opus/design-system';
import {
  DefinitionStore,
  SelectionService,
  summariseActions,
  type ActionSummary,
} from '@opus/studio-core';

/** Icons per kind, so the list is scannable by shape before it is read. */
const KIND_ICON: Record<string, string> = {
  navigate: 'chevron-right',
  drilldown: 'search',
  setFilter: 'grid',
  clearFilters: 'close',
  setParameter: 'edit',
  setSelection: 'check',
  refresh: 'revert',
  export: 'document',
  openUrl: 'library',
  openOverlay: 'layers',
  composite: 'layers',
  invoke: 'warning',
  workflow: 'warning',
};

/** Kinds the v1 runtime does not execute. Reserved seams, and the panel says so rather than implying. */
const RESERVED = new Set(['invoke', 'workflow']);

@Component({
  selector: 'opus-actions-panel',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [IconComponent],
  template: `
    <div class="opus-aspect">
      @if (!actions().length) {
        <p class="opus-aspect-empty">
          This page declares no actions. A page with no actions renders and reads, but nothing on it
          can be clicked — no drill-down, no filter chip, no export.
        </p>
      } @else {
        <p class="lede">
          {{ actions().length }} action(s).
          @if (unreachable().length) {
            <strong>{{ unreachable().length }} that nothing can reach</strong> — no event dispatches
            them, no composite names them as a step, and they are not page actions.
          }
        </p>

        <div class="filters" role="group" aria-label="Filter actions">
          <button
            type="button"
            class="opus-tag"
            [class.on]="kindFilter() === null"
            (click)="kindFilter.set(null)"
          >
            All {{ actions().length }}
          </button>
          @for (group of kinds(); track group.kind) {
            <button
              type="button"
              class="opus-tag"
              [class.on]="kindFilter() === group.kind"
              (click)="kindFilter.set(group.kind)"
            >
              {{ group.kind }} {{ group.count }}
            </button>
          }
        </div>

        @for (action of visible(); track action.id) {
          <article class="opus-item-card" [attr.data-unreachable]="action.unreachable">
            <header class="opus-item-head">
              <opus-icon [name]="iconFor(action.kind)" [size]="15" />
              <span class="id">{{ action.id }}</span>
              <span class="opus-tag">{{ action.kind }}</span>
              @if (action.label !== action.id) {
                <span class="label">“{{ action.label }}”</span>
              }
              <span class="spacer"></span>

              @if (action.emphasis) {
                <span class="opus-tag">{{ action.emphasis }}</span>
              }
              @if (action.requiresConfirmation) {
                <span class="opus-tag" title="The runtime asks the user to confirm before running it">
                  confirms
                </span>
              }
              @if (action.isPageAction) {
                <span class="opus-env-pill live" title="Rendered as a button in the page header">
                  page action
                </span>
              }
              @if (isReserved(action.kind)) {
                <span
                  class="opus-env-pill warn"
                  title="A reserved seam: the v1 runtime does not execute this kind"
                >
                  reserved
                </span>
              }
              @if (action.unreachable) {
                <span class="opus-env-pill error" title="Nothing on this page can trigger it">
                  unreachable
                </span>
              }
            </header>

            <div class="opus-item-body">
              <p class="what">{{ action.summary }}</p>

              <dl class="opus-kv-table">
                <div class="opus-kv-row">
                  <dt>Dispatched by</dt>
                  <dd>
                    @if (action.dispatchedBy.length) {
                      @for (source of action.dispatchedBy; track source.componentId + source.event) {
                        <button
                          type="button"
                          class="wire"
                          [disabled]="!source.nodeId"
                          [title]="
                            source.nodeId
                              ? 'Select ' + source.componentId + ' on the canvas'
                              : source.componentId + ' has no layout node'
                          "
                          (click)="reveal(source.nodeId)"
                        >
                          {{ source.componentId }}<span class="ev">·{{ source.event }}</span>
                        </button>
                      }
                    } @else if (action.usedBySteps.length) {
                      A step of {{ action.usedBySteps.join(', ') }}
                    } @else if (action.isPageAction) {
                      The page header
                    } @else {
                      Nothing.
                    }
                  </dd>
                </div>
                @if (action.usedBySteps.length && action.dispatchedBy.length) {
                  <div class="opus-kv-row">
                    <dt>Also a step of</dt>
                    <dd>{{ action.usedBySteps.join(', ') }}</dd>
                  </div>
                }
              </dl>
            </div>
          </article>
        } @empty {
          <p class="opus-aspect-empty">No {{ kindFilter() }} actions on this page.</p>
        }
      }
    </div>
  `,
  styles: `
    :host {
      display: block;
    }

    .lede {
      margin: 0 0 var(--opus-space-3);
      font-size: var(--opus-text-md);
      color: var(--opus-text-secondary);
      max-inline-size: 58rem;
      line-height: var(--opus-leading-normal);
    }

    .lede strong {
      color: var(--opus-emphasis-warning);
      font-weight: var(--opus-weight-semibold);
    }

    .filters {
      display: flex;
      flex-wrap: wrap;
      gap: var(--opus-space-1);
      margin-block-end: var(--opus-space-4);
    }

    .filters .opus-tag {
      cursor: pointer;
      font-family: inherit;
    }

    .filters .opus-tag.on {
      background: var(--opus-accent-soft);
      border-color: var(--opus-accent);
      color: var(--opus-accent);
    }

    .opus-item-card[data-unreachable='true'] {
      border-color: var(--opus-emphasis-warning);
    }

    .label {
      color: var(--opus-text-secondary);
      font-size: var(--opus-text-sm);
    }

    .what {
      margin: 0 0 var(--opus-space-3);
      font-size: var(--opus-text-md);
      line-height: var(--opus-leading-normal);
      max-inline-size: 58rem;
    }

    .opus-kv-row {
      grid-template-columns: 9rem minmax(0, 1fr);
    }

    .wire {
      font: inherit;
      font-family: var(--opus-font-mono);
      font-size: var(--opus-text-sm);
      color: var(--opus-accent);
      background: none;
      border: 0;
      padding: 0;
      margin-inline-end: var(--opus-space-3);
      cursor: pointer;
      text-decoration: underline;
      text-underline-offset: 2px;
    }

    .wire:disabled {
      color: var(--opus-text-muted);
      cursor: default;
      text-decoration: none;
    }

    .wire .ev {
      color: var(--opus-text-muted);
      text-decoration: none;
    }

    @media (max-width: 700px) {
      .opus-kv-row {
        grid-template-columns: minmax(0, 1fr);
      }
    }
  `,
})
export class ActionsPanelComponent {
  private readonly store = inject(DefinitionStore);
  private readonly selection = inject(SelectionService);

  protected readonly kindFilter = signal<string | null>(null);

  protected readonly actions = computed<readonly ActionSummary[]>(() => {
    const definition = this.store.definition();
    return definition ? summariseActions(definition) : [];
  });

  protected readonly unreachable = computed(() =>
    this.actions().filter((action) => action.unreachable),
  );

  /** Kinds present on this page with their counts — the filter row is derived, never hardcoded. */
  protected readonly kinds = computed(() => {
    const counts = new Map<string, number>();
    for (const action of this.actions()) {
      counts.set(action.kind, (counts.get(action.kind) ?? 0) + 1);
    }
    return [...counts.entries()]
      .map(([kind, count]) => ({ kind, count }))
      .sort((a, b) => b.count - a.count || a.kind.localeCompare(b.kind));
  });

  protected readonly visible = computed(() => {
    const kind = this.kindFilter();
    return kind ? this.actions().filter((action) => action.kind === kind) : this.actions();
  });

  protected iconFor(kind: string): string {
    return KIND_ICON[kind] ?? 'info';
  }

  protected isReserved(kind: string): boolean {
    return RESERVED.has(kind);
  }

  protected reveal(nodeId: string | undefined): void {
    if (nodeId) this.selection.select(nodeId);
  }
}
