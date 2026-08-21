/**
 * business.source-comparison — PRD FR-15, §5.1's four Source Comparison screens, §28 step 7.
 *
 * §28's own sentence is the specification:
 *
 *   > "Put the current record and contributing source values **side by side**."
 *
 * ── WHY THIS IS NOT `data.table`, AND THE ANSWER IS ONE WORD: PIVOT ──────────
 *
 * The data is long. `securities.source-value` is *one vendor's value for one field of one security* —
 * so a security with twelve fields and four contributing sources is forty-eight rows. Both pages that
 * bind it today render exactly that: a flat list of `(field, vendor value, golden value, match)`.
 *
 * Every row in it is true and the question is still unanswered. To see whether Bloomberg and Refinitiv
 * disagree about `country-of-risk`, a reader has to find two non-adjacent rows and hold both in their
 * head. Multiply by twelve fields. "Side by side" is not a styling preference — it is the difference
 * between data that contains the answer and a screen that shows it:
 *
 *     Field              Current        Bloomberg      Refinitiv      ICE
 *     Country of risk    GB             GB ✓           US             GB
 *     Issuer name        Vodafone Grp   Vodafone Grp ✓ Vodafone Group Vodafone Grp
 *
 * One row per field, one column per source, the mastered value first. The pivot is the component.
 *
 * ── THREE THINGS A GENERAL GRID WOULD GET WRONG ──────────────────────────────
 *
 *   1. **A missing contribution is not an empty value.** A source that did not supply a field and a
 *      source that supplied it blank are different facts, and in master data the difference decides
 *      whether you chase the vendor. The long form distinguishes them by the *absence of a row*, which
 *      a pivot would flatten into the same empty cell unless it is careful. This is careful.
 *   2. **Which source won is the mastering decision.** It is the one thing a steward is looking for,
 *      so it is marked on the cell rather than left to a separate column somewhere else on the page.
 *   3. **Disagreement is a row-level state.** A field where the sources differ is the unit of work.
 *      It is counted, it can be filtered to, and it is marked in text as well as colour.
 *
 * ── AND WHAT IT DOES NOT DO ─────────────────────────────────────────────────
 *
 * It never resolves anything. Choosing which source should win is a stewardship action with an audit
 * trail behind it, and this component reports that somebody asked — `overrideRequested` — leaving the
 * page to bind an action to it. The same contract every component in this library keeps, and the reason
 * a governance component does not become a second place where business rules live.
 */

import { ChangeDetectionStrategy, Component, computed, input, output, signal } from '@angular/core';
import type {
  ComponentActionEvent,
  ComponentContext,
  DataRow,
  DataView,
  FieldBinding,
} from '@opus/contracts';

export interface SourceComparisonConfig {
  /**
   * Mark fields where the contributing sources do not agree. On by default: a comparison that does not
   * point at the disagreements is a comparison the reader has to perform themselves, which is the
   * failure this component exists to fix.
   */
  emphasiseDisagreements?: boolean;
  /** Start with only the disagreeing fields shown. Off by default — the whole record is the context. */
  disagreementsOnly?: boolean;
  showConfidence?: boolean;
  /** What to call the mastered value. "Current" is §28's word; a tenant may say "Golden" or "Published". */
  currentLabel?: string;
  maxHeight?: string;
}

/** One source's contribution to one field. */
interface Contribution {
  source: string;
  value: string;
  /** True when this contribution became the mastered value. */
  won: boolean;
  agreement: string;
  confidence: number | null;
  row: DataRow;
}

interface FieldRow {
  key: string;
  label: string;
  current: string;
  /** One entry per source column, in column order. `undefined` means this source did not contribute. */
  cells: readonly (Contribution | undefined)[];
  /** The sources disagree with each other, or with the mastered value. */
  disagrees: boolean;
  /** How many sources supplied this field at all. */
  contributed: number;
}

@Component({
  selector: 'opus-source-comparison',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="wrap">
      @if (title()) {
        <h3 class="title">{{ title() }}</h3>
      }

      @if (data().state === 'loading') {
        <p class="note">Loading contributions…</p>
      } @else if (data().state === 'denied') {
        <p class="note">
          You do not have access to the contributing source values for this record.
        </p>
      } @else if (data().state === 'error') {
        <div class="note error">
          <span>The source comparison could not be loaded.</span>
          <button type="button" class="link" (click)="action.emit({ event: 'retryRequested', payload: {} })">
            Retry
          </button>
        </div>
      } @else if (!fields().length) {
        <!--
          No contributions is a result. A record mastered from one source with nothing to compare is
          normal, and saying "no data" would read as a fault.
        -->
        <p class="note">
          No contributing source values for this record — nothing has been received to compare.
        </p>
      } @else {
        <div class="bar">
          <span class="count">
            {{ fields().length }} field{{ fields().length === 1 ? '' : 's' }} ·
            {{ sources().length }} source{{ sources().length === 1 ? '' : 's' }}
            @if (disagreementCount()) {
              · <b class="differ">{{ disagreementCount() }} disagree</b>
            } @else {
              · <span class="agree">all sources agree</span>
            }
          </span>
          @if (disagreementCount() && !onlyDisagreements()) {
            <button type="button" class="link" (click)="onlyDisagreements.set(true)">
              Show only disagreements
            </button>
          } @else if (onlyDisagreements()) {
            <button type="button" class="link" (click)="onlyDisagreements.set(false)">
              Show all {{ fields().length }} fields
            </button>
          }
        </div>

        <div class="scroll" [style.max-height]="config().maxHeight || null">
          <table class="matrix">
            <thead>
              <tr>
                <th scope="col" class="field-head">Field</th>
                @if (hasCurrent()) {
                  <th scope="col" class="current-head">{{ config().currentLabel || 'Current' }}</th>
                }
                @for (source of sources(); track source) {
                  <th scope="col">{{ source }}</th>
                }
              </tr>
            </thead>
            <tbody>
              @for (field of shown(); track field.key) {
                <tr [attr.data-disagrees]="field.disagrees && emphasise()">
                  <th scope="row" class="field">
                    {{ field.label }}
                    @if (field.disagrees && emphasise()) {
                      <!-- Text as well as colour: a coloured row is never the only signal. -->
                      <span class="flag">sources differ</span>
                    }
                  </th>

                  @if (hasCurrent()) {
                    <td class="current">{{ field.current || '—' }}</td>
                  }

                  @for (cell of field.cells; track $index) {
                    @if (cell) {
                      <td
                        [attr.data-won]="cell.won"
                        [attr.data-agreement]="cell.agreement.toLowerCase() || null"
                        [attr.title]="cellTitle(field, cell)"
                        tabindex="0"
                        (click)="activate(field, cell)"
                        (keydown.enter)="activate(field, cell)"
                      >
                        <span class="value">{{ cell.value || '(blank)' }}</span>
                        @if (cell.won) {
                          <span class="won" aria-label="mastered from this source">mastered</span>
                        }
                        @if (config().showConfidence && cell.confidence !== null) {
                          <span class="conf">{{ cell.confidence }}%</span>
                        }
                      </td>
                    } @else {
                      <!--
                        NOT the same as a blank value, and the distinction is the point. A source that
                        supplied nothing is a vendor to chase; a source that supplied an empty string is
                        a data problem at the vendor. Rendering both as an empty cell loses the one fact
                        a steward acts on.
                      -->
                      <td class="absent" title="This source did not supply this field.">
                        <span class="value">not supplied</span>
                      </td>
                    }
                  }
                </tr>
              }
            </tbody>
          </table>
        </div>

        @if (onlyDisagreements() && shown().length < fields().length) {
          <p class="note">
            Showing {{ shown().length }} of {{ fields().length }} fields.
          </p>
        }
      }
    </div>
  `,
  styles: `
    :host {
      display: block;
      container-type: inline-size;
    }

    .title {
      margin: 0 0 var(--opus-space-2);
      font-size: var(--opus-text-md);
      font-weight: var(--opus-weight-semibold);
      color: var(--opus-text);
    }

    .note {
      margin: 0;
      padding: var(--opus-space-3) 0;
      font-size: var(--opus-text-sm);
      color: var(--opus-text-muted);
      line-height: var(--opus-leading-normal);
    }

    .note.error {
      display: flex;
      align-items: center;
      gap: var(--opus-space-2);
      color: var(--opus-text-secondary);
    }

    .link {
      border: 0;
      background: none;
      padding: 0;
      font: inherit;
      color: var(--opus-accent);
      cursor: pointer;
      text-decoration: underline;
    }

    .bar {
      display: flex;
      align-items: baseline;
      justify-content: space-between;
      gap: var(--opus-space-3);
      flex-wrap: wrap;
      padding-block-end: var(--opus-space-2);
      font-size: var(--opus-text-sm);
      color: var(--opus-text-secondary);
    }

    .differ {
      color: var(--opus-emphasis-warning);
    }

    .agree {
      color: var(--opus-emphasis-positive);
    }

    .scroll {
      overflow: auto;
    }

    .matrix {
      inline-size: 100%;
      border-collapse: collapse;
      font-size: var(--opus-text-sm);
    }

    /*
      The header sticks because a wide comparison scrolls, and a column of vendor values whose source
      name has scrolled off the top is a column of unattributed strings.
    */
    .matrix thead th {
      position: sticky;
      inset-block-start: 0;
      z-index: 1;
      background: var(--opus-surface);
      text-align: start;
      padding: var(--opus-space-2);
      border-block-end: 1px solid var(--opus-border-strong);
      font-weight: var(--opus-weight-semibold);
      color: var(--opus-text-secondary);
      white-space: nowrap;
    }

    .matrix tbody th,
    .matrix tbody td {
      padding: var(--opus-space-2);
      border-block-end: 1px solid var(--opus-border);
      vertical-align: top;
      text-align: start;
    }

    .field {
      font-weight: var(--opus-weight-medium);
      color: var(--opus-text);
      white-space: nowrap;
    }

    /* The field column stays put for the same reason the header does. */
    .matrix tbody th.field,
    .matrix thead th.field-head {
      position: sticky;
      inset-inline-start: 0;
      background: var(--opus-surface);
      z-index: 1;
    }

    .matrix thead th.field-head {
      z-index: 2;
    }

    .flag {
      display: block;
      margin-block-start: 2px;
      font-size: var(--opus-text-xs);
      font-weight: var(--opus-weight-regular);
      color: var(--opus-emphasis-warning);
    }

    /* The mastered value leads, and reads as the answer rather than as one column among several. */
    .current {
      font-weight: var(--opus-weight-semibold);
      color: var(--opus-text);
      background: var(--opus-surface-sunken);
    }

    tr[data-disagrees='true'] th.field,
    tr[data-disagrees='true'] td {
      background: var(--opus-emphasis-warning-bg);
    }

    td[data-won='true'] .value {
      font-weight: var(--opus-weight-semibold);
      color: var(--opus-text);
    }

    .won {
      display: block;
      margin-block-start: 2px;
      font-size: var(--opus-text-xs);
      color: var(--opus-emphasis-positive);
    }

    .conf {
      display: block;
      margin-block-start: 2px;
      font-size: var(--opus-text-xs);
      color: var(--opus-text-muted);
    }

    /* A source that supplied nothing reads as absent, not as empty. */
    .absent .value {
      color: var(--opus-text-faint);
      font-style: italic;
    }

    .matrix td[tabindex]:hover {
      background: var(--opus-surface-hover);
      cursor: pointer;
    }

    .matrix td[tabindex]:focus-visible {
      outline: 2px solid var(--opus-focus-ring);
      outline-offset: -2px;
    }

    /*
      Narrow: the matrix scrolls sideways rather than reflowing. Stacking a pivot destroys the one
      property it exists for — values in a column being comparable at a glance — so the honest
      small-screen behaviour is a scroll with the field name pinned, which the sticky column gives.
    */
    @container (max-width: 500px) {
      .matrix {
        font-size: var(--opus-text-xs);
      }
    }
  `,
})
export class SourceComparisonComponent {
  readonly config = input<SourceComparisonConfig>({});
  readonly data = input<DataView>({ state: 'ready', rows: [] });
  readonly context = input.required<ComponentContext>();
  readonly title = input<string>('');
  /**
   * Which field plays which role, keyed by the role names the manifest declares.
   *
   * The platform's own mechanism, as `business.exception-queue` uses it. The component never guesses a
   * column name: one that looked for a field called `source-system` would work against this catalog and
   * silently show a single unnamed column against the next.
   */
  readonly bindings = input<Record<string, FieldBinding | readonly FieldBinding[]>>({});

  readonly action = output<ComponentActionEvent>();

  protected readonly onlyDisagreements = signal(false);

  private readonly fieldFor = (role: string): string | undefined => {
    const bound = this.bindings()[role];
    const binding = Array.isArray(bound) ? bound[0] : (bound as FieldBinding | undefined);
    return binding?.field;
  };

  private readonly text = (row: DataRow, field: string | undefined): string => {
    if (!field) return '';
    const value = row[field];
    return value === null || value === undefined ? '' : String(value);
  };

  protected readonly hasCurrent = computed(() => this.fieldFor('current') !== undefined);
  protected readonly emphasise = computed(() => this.config().emphasiseDisagreements !== false);

  /**
   * The source columns, in first-seen order.
   *
   * Deliberately not sorted alphabetically. The query's order is the page's choice — a data source can
   * sort by contribution time, or by a vendor precedence the tenant configured — and re-sorting here
   * would override a decision the page made on purpose.
   */
  protected readonly sources = computed<string[]>(() => {
    const field = this.fieldFor('source');
    if (!field) return [];
    const seen: string[] = [];
    for (const row of this.data().rows) {
      const source = this.text(row, field);
      if (source && !seen.includes(source)) seen.push(source);
    }
    return seen;
  });

  /**
   * The pivot: one row per field, one cell per source.
   *
   * Long form in, matrix out. Field order is first-seen for the same reason source order is.
   */
  protected readonly fields = computed<FieldRow[]>(() => {
    const fieldKey = this.fieldFor('field');
    const sourceKey = this.fieldFor('source');
    const valueKey = this.fieldFor('value');
    if (!fieldKey || !sourceKey || !valueKey) return [];

    const currentKey = this.fieldFor('current');
    const agreementKey = this.fieldFor('agreement');
    const winnerKey = this.fieldFor('winner');
    const confidenceKey = this.fieldFor('confidence');
    const sources = this.sources();

    const byField = new Map<string, { label: string; current: string; cells: (Contribution | undefined)[] }>();
    const order: string[] = [];

    for (const row of this.data().rows) {
      const label = this.text(row, fieldKey);
      if (!label) continue;
      const source = this.text(row, sourceKey);
      const column = sources.indexOf(source);
      if (column < 0) continue;

      if (!byField.has(label)) {
        byField.set(label, {
          label,
          // Read from whichever contribution carries it. The mastered value is a property of the field,
          // repeated on every contributing row, so the first row that has one is as good as any.
          current: currentKey ? this.text(row, currentKey) : '',
          cells: new Array<Contribution | undefined>(sources.length).fill(undefined),
        });
        order.push(label);
      }
      const entry = byField.get(label)!;
      if (!entry.current && currentKey) entry.current = this.text(row, currentKey);

      const rawConfidence = confidenceKey ? row[confidenceKey] : undefined;
      const confidence =
        rawConfidence === null || rawConfidence === undefined ? null : Number(rawConfidence);

      entry.cells[column] = {
        source,
        value: this.text(row, valueKey),
        won: winnerKey ? isTrue(row[winnerKey]) : false,
        agreement: agreementKey ? this.text(row, agreementKey) : '',
        confidence: confidence !== null && Number.isFinite(confidence) ? Math.round(confidence) : null,
        row,
      };
    }

    return order.map((label) => {
      const entry = byField.get(label)!;
      const supplied = entry.cells.filter((cell): cell is Contribution => cell !== undefined);
      return {
        key: label,
        label,
        current: entry.current,
        cells: entry.cells,
        disagrees: disagrees(supplied, entry.current, this.hasCurrent()),
        contributed: supplied.length,
      };
    });
  });

  protected readonly disagreementCount = computed(
    () => this.fields().filter((field) => field.disagrees).length,
  );

  protected readonly shown = computed(() =>
    this.onlyDisagreements() ? this.fields().filter((f) => f.disagrees) : this.fields(),
  );

  protected cellTitle(field: FieldRow, cell: Contribution): string {
    const parts = [`${cell.source} supplied “${cell.value || '(blank)'}” for ${field.label}`];
    if (cell.won) parts.push('and it became the mastered value');
    if (cell.agreement) parts.push(`(${cell.agreement})`);
    return `${parts.join(' ')}.`;
  }

  /**
   * Report that somebody asked about a contribution. It resolves nothing.
   *
   * Choosing which source should win is a stewardship action with an audit trail behind it, so the page
   * binds an action to this and owns what it means.
   */
  protected activate(field: FieldRow, cell: Contribution): void {
    this.action.emit({
      event: 'contributionActivated',
      payload: { field: field.label, source: cell.source, value: cell.value, row: cell.row },
    });
  }
}

/** `true`, `"true"`, `"Y"`, `1` — a boolean arriving from a database is any of these. */
function isTrue(value: unknown): boolean {
  if (typeof value === 'boolean') return value;
  if (typeof value === 'number') return value === 1;
  if (typeof value === 'string') return ['true', 'y', 'yes', '1', 't'].includes(value.trim().toLowerCase());
  return false;
}

/**
 * Whether a field's sources disagree.
 *
 * Two tests, and the second is the one that matters in master data:
 *
 *   1. The supplying sources differ from **each other**.
 *   2. A supplying source differs from the **mastered value** — which happens even when every source
 *      agrees, if the mastered value came from a manual override or a stale run. A comparison that only
 *      checked (1) would call that field settled, and it is the field a steward most needs to see.
 *
 * A source that supplied nothing is not disagreeing. It has said nothing, which is reported separately
 * and is not a conflict.
 */
function disagrees(
  supplied: readonly Contribution[],
  current: string,
  hasCurrent: boolean,
): boolean {
  if (supplied.length === 0) return false;
  const values = new Set(supplied.map((cell) => cell.value));
  if (values.size > 1) return true;
  if (!hasCurrent || !current) return false;
  return !values.has(current);
}
