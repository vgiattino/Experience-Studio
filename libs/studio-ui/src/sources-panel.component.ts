/**
 * The Data aspect: every data source the page declares.
 *
 * WHAT THIS MADE VISIBLE. A shipped page has eight or nine data sources. Before this tab, the only way
 * to see one was to select the widget that read it and look at a dropdown, and the only way to see
 * *all* of them was to read the JSON. So the questions an author actually has — which of these is
 * unfiltered, which one is the expensive one, does anything still read this — had no answer short of
 * reading the artifact by hand.
 *
 * THE COLUMN THAT ONLY THIS TAB CAN SHOW is the reverse index: which widgets read each source. It is
 * not in the artifact — a source does not know its readers — so it cannot be read off the JSON at all,
 * only computed. That is also why the panel can flag an **unread source**: it costs a gateway round
 * trip on every page load and puts nothing on the screen, and nothing else in the product would ever
 * tell the author it was there.
 *
 * Everything it *does* — select a reader, delete an unread source — goes through the ordinary command
 * layer, so it is one patch and one undo like any other edit.
 */

import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { IconComponent } from '@opus/design-system';
import {
  DefinitionStore,
  SelectionService,
  removeDataSourceIfUnused,
  summariseSources,
  type SourceSummary,
} from '@opus/studio-core';

@Component({
  selector: 'opus-sources-panel',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [IconComponent],
  template: `
    <div class="opus-aspect">
      @if (!sources().length) {
        <p class="opus-aspect-empty">
          This page declares no data sources. Every figure, chart and table reads one — add a widget
          from the palette and bind it, or accept a suggestion from the ★ panel, and the source it
          needs will appear here.
        </p>
      } @else {
        <p class="lede">
          {{ sources().length }} source(s) over {{ entityCount() }} entit{{ entityCount() === 1 ? 'y' : 'ies' }}.
          @if (orphans().length) {
            <strong>{{ orphans().length }} of them nothing reads</strong> — each still costs a gateway
            round trip on every load.
          }
        </p>

        @for (source of sources(); track source.id) {
          <article class="opus-item-card" [attr.data-orphan]="source.orphan">
            <header class="opus-item-head">
              <opus-icon [name]="source.kind === 'list' ? 'grid' : 'model'" [size]="15" />
              <span class="id">{{ source.id }}</span>
              <span class="opus-tag">{{ source.kind }}</span>
              <span class="opus-ref">{{ source.entity }}</span>
              <span class="spacer"></span>

              @if (source.costClass) {
                <span class="opus-tag" [title]="'Expected cost class: ' + source.costClass">
                  {{ source.costClass }} cost
                </span>
              }
              @if (!source.filter) {
                <!--
                  Marked, not hidden. An unfiltered source over a 48-million-row entity is the single
                  most expensive mistake a page can make, and the catalog marks such entities
                  requiresFilter precisely because it is easy to make by accident.
                -->
                <span class="opus-env-pill warn" title="This source constrains nothing">
                  unfiltered
                </span>
              }
              @if (source.orphan) {
                <span class="opus-env-pill error" title="No component on this page reads it">
                  unread
                </span>
                <button
                  type="button"
                  class="opus-btn sm"
                  title="Remove this source. Refused if anything turns out to read it."
                  (click)="remove(source.id)"
                >
                  <opus-icon name="trash" [size]="13" [weight]="2" />
                  Remove
                </button>
              }
            </header>

            <div class="opus-item-body">
              <!--
                Ref AND alias, side by side, deliberately. A binding names the ALIAS, and the commonest
                binding bug in this codebase has been a widget bound to the catalog ref instead — which
                validates and then renders "no data". Showing both makes the distinction legible
                instead of tribal knowledge.
              -->
              <div class="opus-kv-table cols-3">
                <div class="opus-kv-head">
                  <span>Selected</span>
                  <span>Alias bindings use</span>
                  <span>How</span>
                </div>
                @for (field of source.fields; track field.alias) {
                  <div class="opus-kv-row">
                    <span>
                      <span class="opus-tag">{{ field.role }}</span>
                      <span class="opus-ref">{{ field.ref }}</span>
                    </span>
                    <span class="opus-ref alias">{{ field.alias }}</span>
                    <span>{{ field.detail ?? '—' }}</span>
                  </div>
                } @empty {
                  <div class="opus-kv-row empty-row">
                    <span>Selects nothing — this source returns no fields.</span>
                  </div>
                }
              </div>

              <dl class="opus-kv-table meta">
                <div class="opus-kv-row">
                  <dt>Filter</dt>
                  <dd>{{ source.filter ?? 'none — every row of the entity' }}</dd>
                </div>
                @if (source.sort) {
                  <div class="opus-kv-row"><dt>Sort</dt><dd>{{ source.sort }}</dd></div>
                }
                @if (source.paging) {
                  <div class="opus-kv-row"><dt>Paging</dt><dd>{{ source.paging }}</dd></div>
                }
                <div class="opus-kv-row">
                  <dt>Load policy</dt>
                  <dd>
                    {{ source.loadPolicy }}
                    @if (source.cacheTtlSeconds !== null) {
                      · cache hint {{ source.cacheTtlSeconds }}s
                    }
                  </dd>
                </div>
                <div class="opus-kv-row">
                  <dt>Read by</dt>
                  <dd>
                    @if (source.readers.length) {
                      @for (reader of source.readers; track reader; let i = $index) {
                        <button
                          type="button"
                          class="reader"
                          [title]="'Select ' + reader + ' on the canvas'"
                          (click)="reveal(source, i)"
                        >
                          {{ reader }}
                        </button>
                      }
                    }
                    @if (source.layoutReaders.length) {
                      <!--
                        Said separately, because it is a different relationship. A container does not
                        display this source — it GENERATES ITS TABS from it, one per row, and deleting
                        the source removes the tabs.
                      -->
                      <span class="structural">
                        generates the tabs of
                        @for (node of source.layoutReaders; track node) {
                          <button
                            type="button"
                            class="reader"
                            [title]="'Select ' + node + ' on the canvas'"
                            (click)="revealNode(node)"
                          >
                            {{ node }}
                          </button>
                        }
                      </span>
                    }
                    @if (source.references.length) {
                      <!--
                        Named, with pointers, because "something references this" that does not say
                        where sends an author looking through 40,000 characters of JSON.
                      -->
                      <span class="structural">
                        referenced at
                        <span class="pointers">{{ source.references.join(', ') }}</span>
                      </span>
                    }
                    @if (!source.readers.length && !source.layoutReaders.length && !source.references.length) {
                      Nothing on this page — this source is queried on every load and shown nowhere.
                    }
                  </dd>
                </div>
              </dl>
            </div>
          </article>
        }
      }
    </div>
  `,
  styles: `
    :host {
      display: block;
    }

    .lede {
      margin: 0 0 var(--opus-space-4);
      font-size: var(--opus-text-md);
      color: var(--opus-text-secondary);
      max-inline-size: 58rem;
      line-height: var(--opus-leading-normal);
    }

    .lede strong {
      color: var(--opus-emphasis-warning);
      font-weight: var(--opus-weight-semibold);
    }

    .opus-item-card[data-orphan='true'] {
      border-color: var(--opus-emphasis-warning);
    }

    .opus-item-head .opus-ref {
      color: var(--opus-text-secondary);
    }

    .alias {
      color: var(--opus-accent);
    }

    /* The empty row has one cell, so it must not inherit the three-column rhythm. */
    .opus-kv-table.cols-3 .opus-kv-row.empty-row {
      grid-template-columns: minmax(0, 1fr);
      color: var(--opus-text-muted);
    }

    .meta {
      margin: var(--opus-space-3) 0 0;
    }

    .meta .opus-kv-row {
      grid-template-columns: 9rem minmax(0, 1fr);
    }

    .meta dd {
      font-family: var(--opus-font-mono);
      font-size: var(--opus-text-sm);
    }

    .pointers {
      font-family: var(--opus-font-mono);
      font-size: var(--opus-text-xs);
      color: var(--opus-text-muted);
      overflow-wrap: anywhere;
    }

    .structural {
      display: inline-block;
      color: var(--opus-text-secondary);
      font-family: var(--opus-font-sans);
    }

    .reader {
      font: inherit;
      font-family: var(--opus-font-mono);
      font-size: var(--opus-text-sm);
      color: var(--opus-accent);
      background: none;
      border: 0;
      padding: 0;
      margin-inline-end: var(--opus-space-2);
      cursor: pointer;
      text-decoration: underline;
      text-underline-offset: 2px;
    }

    @media (max-width: 700px) {
      .opus-kv-table.cols-3 .opus-kv-head,
      .opus-kv-table.cols-3 .opus-kv-row,
      .meta .opus-kv-row {
        grid-template-columns: minmax(0, 1fr);
      }

      .opus-kv-table.cols-3 .opus-kv-head {
        display: none;
      }
    }
  `,
})
export class SourcesPanelComponent {
  private readonly store = inject(DefinitionStore);
  private readonly selection = inject(SelectionService);

  protected readonly sources = computed<readonly SourceSummary[]>(() => {
    const definition = this.store.definition();
    return definition ? summariseSources(definition) : [];
  });

  protected readonly orphans = computed(() => this.sources().filter((source) => source.orphan));

  protected readonly entityCount = computed(
    () => new Set(this.sources().map((source) => source.entity)).size,
  );

  /** Select the layout node of the nth reader, so the canvas scrolls to what reads this source. */
  protected reveal(source: SourceSummary, index: number): void {
    const nodeId = source.readerNodes[index];
    if (nodeId) this.selection.select(nodeId);
  }

  protected revealNode(nodeId: string): void {
    this.selection.select(nodeId);
  }

  protected remove(sourceId: string): void {
    // The command re-checks readers against the live definition rather than trusting this panel's
    // summary: the summary was computed for a render, and the definition is the authority.
    this.store.run((definition) => removeDataSourceIfUnused(definition, sourceId));
  }
}
