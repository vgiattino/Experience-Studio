/**
 * The Catalog — the governed business vocabulary, browsable.
 *
 * ── WHY THIS BELONGS IN THE RAIL ────────────────────────────────────────────────────────
 * Every claim this product makes rests on the semantic catalog: pages bind to it, generation is
 * grounded in it, the review checks against it, and the Data Gateway enforces entitlements over it.
 * Until now it was the one subsystem with no surface — an author could bind a widget to
 * `late-file-count` from a dropdown and had nowhere to go to ask *what that means*, what it may be
 * aggregated by, or what else the business has defined.
 *
 * That question is not a developer's. "What can I build a page about" is the first thing a business
 * analyst asks, and the answer is this list.
 *
 * ── AND WHAT IT IS HONEST ABOUT ─────────────────────────────────────────────────────────
 * This is **your projection, not the catalog**. The Catalog Service removes entities and columns the
 * caller's capabilities do not cover — removes, rather than blanks, because an attribute name is itself
 * sometimes a disclosure. So the counts here are what *you* may see, and the panel says so rather than
 * letting an author conclude the business has five entities.
 *
 * It shows no data. Every figure a reader sees comes from the gateway at render time; the catalog holds
 * meaning — names, types, aggregations, what may be grouped, what is sensitive — and that is all that
 * is shown here. Sample values in a metadata browser would be the one place they could leak past the
 * entitlement checks that guard the query path.
 */

import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  signal,
} from '@angular/core';
import { IconComponent, ListPanelComponent, type ListPanelItem } from '@opus/design-system';
import { CatalogService } from '@opus/catalog';
import { text, type Aggregation, type DataType, type Sensitivity } from '@opus/contracts';

import { AUTHOR } from '../session';

interface MeasureRow {
  ref: string;
  name: string;
  description?: string;
  aggregations: readonly Aggregation[];
  defaultAggregation: Aggregation;
  unit?: string;
  higherIsBetter?: boolean;
  thresholds: number;
  sensitive: boolean;
  whenToUse?: string;
}

interface AttributeRow {
  ref: string;
  name: string;
  dataType: DataType;
  semanticType?: string;
  /** The four capabilities that decide what a page may do with it. */
  can: string[];
  enumValues?: string[];
  unit?: string;
  sensitivity?: Sensitivity;
  masked: boolean;
}

interface EntityDetail {
  ref: string;
  name: string;
  plural: string;
  description?: string;
  domain?: string;
  primaryKey: string[];
  labelAttribute?: string;
  effectiveDating?: string;
  requiresFilter: boolean;
  costClass?: string;
  typicalRows?: number;
  whenToUse?: string;
  examples: string[];
  measures: MeasureRow[];
  attributes: AttributeRow[];
  related: { name: string; to: string; cardinality: string }[];
}

@Component({
  selector: 'opus-catalog-browser',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [IconComponent, ListPanelComponent],
  template: `
    <div class="cat">
      <header class="cat-head">
        <span class="cat-head-icon"><opus-icon name="database" [size]="22" /></span>
        <div class="cat-title">
          <h1>Catalog</h1>
          <p>
            The governed business vocabulary this application binds to. Names, types and the rules a
            page must respect — no data: every figure a reader sees comes from the Data Gateway.
          </p>
        </div>
        @if (loaded()) {
          <span class="cat-version" role="status">
            <opus-icon name="check" [size]="13" [weight]="2" />
            v{{ version() }} · {{ entities().length }} entities · {{ measureCount() }} measures ·
            {{ attributeCount() }} attributes
          </span>
        }
      </header>

      @if (!loaded()) {
        <p class="cat-empty">
          <opus-icon name="warning" [size]="16" />
          The catalog has not loaded. Nothing here, and nothing in the builder, can be bound until it
          does.
        </p>
      } @else {
        <!--
          Said before anything is counted, because a count without this caveat is a false statement
          about the business rather than a true one about the caller.
        -->
        <p class="cat-scope">
          <opus-icon name="shield" [size]="14" />
          <!--
            One span, not a run of text nodes. The paragraph is a flex row, so bare text either side of
            the <b> became its own flex item and the sentence laid out as three columns: "This | your |
            projection."
          -->
          <span>
            This is <b>your</b> projection. {{ author.displayName }} holds
            {{ dataCapabilities().length }} data
            {{ dataCapabilities().length === 1 ? 'capability' : 'capabilities' }} —
            {{ dataCapabilities().join(', ') }} — and entities or columns outside them are removed from
            the catalog you receive rather than shown greyed out.
          </span>
        </p>

        <div class="cat-body">
          <opus-list-panel
            title="Entities"
            placeholder="Filter entities…"
            [items]="listItems()"
            [selectedId]="selectedId()"
            (pick)="selectedId.set($event)"
          />

          @if (detail(); as entity) {
            <section class="cat-detail">
              <div class="cat-detail-h">
                <h2>{{ entity.plural }}</h2>
                <code>{{ entity.ref }}</code>
                @if (entity.domain) {
                  <span class="cat-chip">{{ entity.domain }}</span>
                }
                @if (entity.requiresFilter) {
                  <span class="cat-chip warn" title="The gateway refuses an unfiltered query">
                    needs a filter
                  </span>
                }
                @if (entity.costClass) {
                  <span class="cat-chip">{{ entity.costClass }} cost</span>
                }
              </div>

              @if (entity.description) {
                <p class="cat-desc">{{ entity.description }}</p>
              }
              @if (entity.whenToUse) {
                <p class="cat-hint"><b>When to use it:</b> {{ entity.whenToUse }}</p>
              }

              <dl class="cat-facts">
                <div>
                  <dt>Identified by</dt>
                  <dd>{{ entity.primaryKey.join(', ') || '—' }}</dd>
                </div>
                <div>
                  <dt>Labelled by</dt>
                  <dd>{{ entity.labelAttribute ?? '—' }}</dd>
                </div>
                <div>
                  <dt>Effective dating</dt>
                  <dd>{{ entity.effectiveDating ?? 'none' }}</dd>
                </div>
                <div>
                  <dt>Typical rows</dt>
                  <dd>{{ entity.typicalRows ? entity.typicalRows.toLocaleString() : '—' }}</dd>
                </div>
              </dl>

              <!--
                Measures first. An analyst opens an entity to find out what can be *counted*, and the
                aggregations are the part that decides whether a page can be built at all — the
                inspector's picker offers exactly this list.
              -->
              <h3 class="cat-h3">
                Measures
                <span class="cat-count">{{ entity.measures.length }}</span>
              </h3>
              @if (!entity.measures.length) {
                <p class="cat-hint">
                  This entity has no measures, so nothing about it can be shown as a figure or charted.
                  It can still be listed in a table.
                </p>
              } @else {
                <div class="cat-scroll">
                  <table class="cat-table">
                    <thead>
                      <tr>
                        <th>Measure</th>
                        <th>Aggregations</th>
                        <th>Reads</th>
                        <th>Meaning</th>
                      </tr>
                    </thead>
                    <tbody>
                      @for (measure of entity.measures; track measure.ref) {
                        <tr>
                          <td>
                            <b>{{ measure.name }}</b>
                            <code>{{ measure.ref }}</code>
                          </td>
                          <td>
                            @for (option of measure.aggregations; track option) {
                              <span
                                class="cat-agg"
                                [class.on]="option === measure.defaultAggregation"
                                [title]="
                                  option === measure.defaultAggregation ? 'The default' : 'Allowed'
                                "
                              >
                                {{ option }}
                              </span>
                            }
                          </td>
                          <td class="cat-nowrap">
                            @if (measure.higherIsBetter !== undefined) {
                              {{ measure.higherIsBetter ? 'higher is better' : 'lower is better' }}
                            } @else {
                              —
                            }
                            @if (measure.thresholds) {
                              <span class="cat-chip">{{ measure.thresholds }} bands</span>
                            }
                            @if (measure.sensitive) {
                              <span class="cat-chip warn">restricted</span>
                            }
                          </td>
                          <td>
                            {{ measure.description ?? '—' }}
                            @if (measure.whenToUse) {
                              <span class="cat-hint">{{ measure.whenToUse }}</span>
                            }
                          </td>
                        </tr>
                      }
                    </tbody>
                  </table>
                </div>
              }

              <h3 class="cat-h3">
                Attributes
                <span class="cat-count">{{ entity.attributes.length }}</span>
              </h3>
              <div class="cat-scroll">
                <table class="cat-table">
                  <thead>
                    <tr>
                      <th>Attribute</th>
                      <th>Type</th>
                      <th>A page may</th>
                      <th>Values</th>
                    </tr>
                  </thead>
                  <tbody>
                    @for (attribute of entity.attributes; track attribute.ref) {
                      <tr>
                        <td>
                          <b>{{ attribute.name }}</b>
                          <code>{{ attribute.ref }}</code>
                        </td>
                        <td class="cat-nowrap">
                          {{ attribute.dataType }}
                          @if (attribute.semanticType) {
                            <span class="cat-chip">{{ attribute.semanticType }}</span>
                          }
                          @if (attribute.unit) {
                            <span class="cat-chip">{{ attribute.unit }}</span>
                          }
                        </td>
                        <td>
                          @if (attribute.can.length) {
                            @for (verb of attribute.can; track verb) {
                              <span class="cat-agg">{{ verb }}</span>
                            }
                          } @else {
                            <span class="cat-hint">display only</span>
                          }
                        </td>
                        <td>
                          @if (attribute.enumValues?.length) {
                            {{ attribute.enumValues!.join(' · ') }}
                          } @else {
                            —
                          }
                          <!--
                            Only above the internal default. Nearly every attribute in a governed
                            catalog is internal, so chipping them all put a warning on every row and
                            left the two that matter — confidential and pii — indistinguishable.
                          -->
                          @if (elevated(attribute.sensitivity)) {
                            <span class="cat-chip warn">{{ attribute.sensitivity }}</span>
                          }
                          @if (attribute.masked) {
                            <span class="cat-chip warn">masked</span>
                          }
                        </td>
                      </tr>
                    }
                  </tbody>
                </table>
              </div>

              @if (entity.related.length) {
                <h3 class="cat-h3">
                  Related
                  <span class="cat-count">{{ entity.related.length }}</span>
                </h3>
                <ul class="cat-related">
                  @for (link of entity.related; track link.to) {
                    <li>
                      <b>{{ link.name }}</b>
                      <span>→</span>
                      <code>{{ link.to }}</code>
                      <span class="cat-chip">{{ link.cardinality }}</span>
                    </li>
                  }
                </ul>
              }
            </section>
          }
        </div>
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

    .cat {
      display: flex;
      flex-direction: column;
      block-size: 100%;
      min-block-size: 0;
    }

    .cat-head {
      display: flex;
      align-items: flex-start;
      gap: var(--opus-space-3);
      padding: 18px 20px 10px;
      flex-shrink: 0;
      flex-wrap: wrap;
    }

    .cat-head-icon {
      display: inline-grid;
      place-items: center;
      inline-size: 36px;
      block-size: 36px;
      border-radius: var(--opus-radius-md);
      background: var(--opus-accent-soft);
      color: var(--opus-accent);
      flex-shrink: 0;
    }

    .cat-title {
      flex: 1;
      min-inline-size: 14rem;
    }

    .cat-title h1 {
      margin: 0;
      font-size: var(--opus-text-xl);
      font-weight: var(--opus-weight-semibold);
      color: var(--opus-text);
    }

    .cat-title p {
      margin: 4px 0 0;
      font-size: var(--opus-text-sm);
      color: var(--opus-text-muted);
      max-inline-size: 52rem;
      line-height: var(--opus-leading-normal);
    }

    .cat-version {
      display: inline-flex;
      align-items: center;
      gap: 5px;
      font-size: var(--opus-text-sm);
      color: var(--opus-emphasis-positive);
      white-space: nowrap;
    }

    .cat-scope,
    .cat-empty {
      display: flex;
      align-items: flex-start;
      gap: var(--opus-space-2);
      margin: 0 20px 10px;
      padding: 8px 11px;
      border-inline-start: 2px solid var(--opus-emphasis-info);
      background: var(--opus-emphasis-info-bg);
      font-size: var(--opus-text-xs);
      color: var(--opus-text-secondary);
      line-height: var(--opus-leading-normal);
      flex-shrink: 0;
    }

    .cat-empty {
      border-inline-start-color: var(--opus-emphasis-warning);
      background: var(--opus-emphasis-warning-bg);
    }

    .cat-scope .opus-icon,
    .cat-empty .opus-icon {
      flex-shrink: 0;
      margin-block-start: 1px;
    }

    .cat-body {
      flex: 1;
      min-block-size: 0;
      display: grid;
      grid-template-columns: 260px minmax(0, 1fr);
      border-block-start: 1px solid var(--opus-border);
      overflow: hidden;
    }

    opus-list-panel {
      border-inline-end: 1px solid var(--opus-border);
      background: var(--opus-surface);
      min-block-size: 0;
      overflow: hidden;
    }

    .cat-detail {
      overflow-y: auto;
      padding: 16px 20px 32px;
      min-inline-size: 0;
    }

    .cat-detail-h {
      display: flex;
      align-items: baseline;
      gap: var(--opus-space-2);
      flex-wrap: wrap;
    }

    .cat-detail-h h2 {
      margin: 0;
      font-size: var(--opus-text-lg);
      font-weight: var(--opus-weight-semibold);
      color: var(--opus-text);
    }

    code {
      font-family: var(--opus-font-mono);
      font-size: var(--opus-text-xs);
      color: var(--opus-text-muted);
    }

    .cat-chip {
      padding: 1px 6px;
      border-radius: 999px;
      background: var(--opus-emphasis-muted-bg);
      color: var(--opus-text-secondary);
      font-size: 10px;
      font-weight: var(--opus-weight-medium);
      white-space: nowrap;
    }

    .cat-chip.warn {
      background: var(--opus-emphasis-warning-bg);
      color: var(--opus-emphasis-warning);
    }

    .cat-desc,
    .cat-hint {
      margin: 6px 0 0;
      font-size: var(--opus-text-sm);
      color: var(--opus-text-secondary);
      line-height: var(--opus-leading-normal);
      max-inline-size: 58rem;
    }

    .cat-hint {
      display: block;
      font-size: var(--opus-text-xs);
      color: var(--opus-text-muted);
    }

    .cat-facts {
      display: flex;
      gap: var(--opus-space-5);
      flex-wrap: wrap;
      margin: 12px 0 0;
    }

    .cat-facts dt {
      font-size: 10px;
      font-weight: var(--opus-weight-semibold);
      text-transform: uppercase;
      letter-spacing: 0.06em;
      color: var(--opus-text-muted);
    }

    .cat-facts dd {
      margin: 2px 0 0;
      font-size: var(--opus-text-sm);
      color: var(--opus-text);
      font-family: var(--opus-font-mono);
    }

    .cat-h3 {
      display: flex;
      align-items: center;
      gap: var(--opus-space-2);
      margin: 22px 0 8px;
      font-size: var(--opus-text-md);
      font-weight: var(--opus-weight-semibold);
      color: var(--opus-text);
    }

    .cat-count {
      padding: 0 6px;
      border-radius: 999px;
      background: var(--opus-accent-soft);
      color: var(--opus-accent);
      font-size: 10px;
      font-weight: var(--opus-weight-semibold);
    }

    .cat-scroll {
      overflow-x: auto;
      border: 1px solid var(--opus-border);
      border-radius: var(--opus-radius-md);
      background: var(--opus-surface);
    }

    .cat-table {
      inline-size: 100%;
      border-collapse: collapse;
      font-size: var(--opus-text-sm);
    }

    .cat-table th {
      text-align: start;
      padding: 7px 10px;
      border-block-end: 1px solid var(--opus-border);
      font-size: 10px;
      font-weight: var(--opus-weight-semibold);
      text-transform: uppercase;
      letter-spacing: 0.06em;
      color: var(--opus-text-muted);
      white-space: nowrap;
    }

    .cat-table td {
      padding: 7px 10px;
      border-block-end: 1px solid var(--opus-border);
      color: var(--opus-text-secondary);
      vertical-align: top;
      line-height: var(--opus-leading-normal);
    }

    .cat-table tr:last-child td {
      border-block-end: 0;
    }

    .cat-table b {
      display: block;
      color: var(--opus-text);
      font-weight: var(--opus-weight-medium);
    }

    .cat-nowrap {
      white-space: nowrap;
    }

    /* An aggregation, and whether it is the default — the same vocabulary the inspector offers. */
    .cat-agg {
      display: inline-block;
      padding: 0 5px;
      margin-inline-end: 3px;
      border: 1px solid var(--opus-border-strong);
      border-radius: 3px;
      font-family: var(--opus-font-mono);
      font-size: 10px;
      color: var(--opus-text-secondary);
    }

    .cat-agg.on {
      border-color: var(--opus-accent);
      background: var(--opus-accent-soft);
      color: var(--opus-accent);
      font-weight: var(--opus-weight-semibold);
    }

    .cat-related {
      margin: 0;
      padding-inline-start: 18px;
      font-size: var(--opus-text-sm);
      color: var(--opus-text-secondary);
    }

    /* A row, so the ref and the cardinality chip cannot run into each other as one word. */
    .cat-related li {
      display: flex;
      align-items: baseline;
      gap: var(--opus-space-2);
      margin-block-end: 3px;
      flex-wrap: wrap;
    }

    .cat-related b {
      color: var(--opus-text);
      font-weight: var(--opus-weight-medium);
    }

    @media (max-width: 900px) {
      .cat-body {
        grid-template-columns: minmax(0, 1fr);
      }

      /* The list becomes the whole width above the detail rather than a 260px column beside it: two
         panes below this width leave neither readable. */
      opus-list-panel {
        border-inline-end: 0;
        border-block-end: 1px solid var(--opus-border);
        max-block-size: 12rem;
      }
    }
  `,
})
export class CatalogBrowserComponent {
  private readonly catalog = inject(CatalogService);

  protected readonly author = AUTHOR;
  protected readonly selectedId = signal<string | null>(null);

  /**
   * The author's projection, read from the service the app already loaded.
   *
   * A computed over `loaded()` rather than a copy taken once: the catalog arrives during bootstrap, and
   * a snapshot captured in a constructor would leave this screen permanently empty for anyone who opened
   * it fast enough.
   */
  private readonly snapshot = computed(() => {
    if (!this.catalog.loaded()) return null;
    try {
      return this.catalog.projectionFor(AUTHOR);
    } catch {
      return null;
    }
  });

  protected readonly loaded = computed(() => !!this.snapshot());
  protected readonly version = computed(() => this.snapshot()?.catalogVersion ?? 0);

  /** Data capabilities only: `experience.author` says nothing about which rows a caller may see. */
  protected readonly dataCapabilities = computed(() =>
    AUTHOR.capabilities.filter((capability) => !capability.startsWith('experience.')),
  );

  protected readonly entities = computed<EntityDetail[]>(() => {
    const snapshot = this.snapshot();
    if (!snapshot) return [];
    return Object.values(snapshot.entities)
      .map((entity) => ({
        ref: entity.id,
        name: text(entity.businessName) || entity.id,
        plural: text(entity.pluralName) || text(entity.businessName) || entity.id,
        description: entity.description,
        domain: entity.domain,
        primaryKey: entity.primaryKey,
        labelAttribute: entity.labelAttribute,
        effectiveDating: entity.effectiveDating,
        requiresFilter: entity.cost?.requiresFilter === true,
        costClass: entity.cost?.class,
        typicalRows: entity.cost?.typicalRowCount,
        whenToUse: entity.aiHints?.whenToUse,
        examples: entity.aiHints?.exampleQuestions ?? [],
        measures: Object.values(entity.measures ?? {}).map((measure) => ({
          ref: measure.id,
          name: text(measure.businessName) || measure.id,
          description: measure.description,
          aggregations: measure.allowedAggregations,
          defaultAggregation: measure.defaultAggregation,
          unit: measure.unit,
          higherIsBetter: measure.higherIsBetter,
          thresholds: measure.defaultThresholds?.length ?? 0,
          sensitive: !!measure.columnEntitlement,
          whenToUse: measure.aiHints?.whenToUse,
        })),
        attributes: Object.values(entity.attributes).map((attribute) => ({
          ref: attribute.id,
          name: text(attribute.businessName) || attribute.id,
          dataType: attribute.dataType,
          semanticType: attribute.semanticType,
          // The four verbs that decide what a page may do with it. Spelled as verbs rather than as
          // four boolean columns, because "groupable: false" is a fact and "may be grouped" is the
          // thing an author is actually looking for.
          can: [
            attribute.groupable !== false ? 'group' : '',
            attribute.filterable !== false ? 'filter' : '',
            attribute.sortable !== false ? 'sort' : '',
            attribute.searchable ? 'search' : '',
          ].filter(Boolean),
          enumValues: attribute.enumValues?.map((value) => text(value.label) || value.value),
          unit: attribute.unit,
          sensitivity: attribute.sensitivity,
          masked: !!attribute.maskingPolicy,
        })),
        related: snapshot.relationships
          .filter((relationship) => relationship.from === entity.id)
          .map((relationship) => ({
            name: text(relationship.businessName) || relationship.id,
            to: relationship.to,
            cardinality: relationship.cardinality,
          })),
      }))
      .sort((a, b) => a.name.localeCompare(b.name));
  });

  protected readonly measureCount = computed(() =>
    this.entities().reduce((total, entity) => total + entity.measures.length, 0),
  );

  protected readonly attributeCount = computed(() =>
    this.entities().reduce((total, entity) => total + entity.attributes.length, 0),
  );

  /**
   * The hint answers one question: can I chart this?
   *
   * Short on purpose. The row's job is to name the entity, and the counts an analyst needs in full are
   * in the detail pane a click away — a hint long enough to crowd the name is a hint that has stopped
   * helping.
   */
  protected readonly listItems = computed<ListPanelItem[]>(() =>
    this.entities().map((entity) => ({
      id: entity.ref,
      label: entity.plural,
      hint:
        entity.measures.length === 1
          ? '1 measure'
          : entity.measures.length
            ? `${entity.measures.length} measures`
            : 'no measures',
      icon: 'model',
    })),
  );

  /** True for a sensitivity worth a badge: beyond the internal default every attribute carries. */
  protected elevated(sensitivity: Sensitivity | undefined): boolean {
    return sensitivity === 'confidential' || sensitivity === 'restricted' || sensitivity === 'pii';
  }

  /** The selected entity, defaulting to the first so the screen is never half-empty on arrival. */
  protected readonly detail = computed(() => {
    const entities = this.entities();
    const selected = entities.find((entity) => entity.ref === this.selectedId());
    return selected ?? entities[0] ?? null;
  });
}
