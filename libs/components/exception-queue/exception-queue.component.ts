/**
 * business.exception-queue
 *
 * The first of the PRD's Enterprise family (FR-30), and the family exists for a reason this component
 * is meant to demonstrate: some components carry business behaviour rather than presentation. A grid
 * shows rows; a queue orders work.
 *
 * ── WHAT MAKES THIS NOT `data.table` ────────────────────────────────────────────────────
 * Three things, each of which a general grid would be wrong to impose:
 *
 *   1. **It orders by the decision, not by the data.** Severity first, then age, because that is the
 *      order somebody working a queue wants. A grid's default order is whatever the query returned.
 *   2. **Unassigned is a state, not a blank cell.** Unowned work is the work most likely to go
 *      unnoticed, so it floats to the top of its group and is labelled.
 *   3. **Ageing is a judgement it refuses to invent.** `ageBreachHours` has no default: a queue that
 *      makes up its own SLA teaches people to ignore the flag. Without the property, nothing is marked.
 *
 * ── AND WHAT IT DELIBERATELY DOES NOT DO ────────────────────────────────────────────────
 * It never triages anything. `triageRequested` reports that somebody asked; the page decides what
 * triage means by binding an action to it. That is the same contract every other component in this
 * library keeps — the component reports an interaction, the page owns the meaning — and it is what
 * stops a governance component from becoming a second place where business rules live.
 */

import { ChangeDetectionStrategy, Component, computed, input, output, signal } from '@angular/core';
import type {
  ComponentActionEvent,
  ComponentContext,
  DataRow,
  DataView,
  FieldBinding,
} from '@opus/contracts';

export interface ExceptionQueueConfig {
  groupBy?: 'severity' | 'rule' | 'assignee' | 'none';
  /** Absent means no breach marking. See the note above about inventing an SLA. */
  ageBreachHours?: number;
  unassignedFirst?: boolean;
  pageSize?: number;
  allowBulkSelection?: boolean;
  showDetail?: boolean;
}

interface QueueRow {
  key: string;
  subject: string;
  severity: string;
  severityRank: number;
  status: string;
  age: number | null;
  breaching: boolean;
  assignee: string;
  rule: string;
  detail: string;
  row: DataRow;
}

interface QueueGroup {
  label: string;
  rows: QueueRow[];
}

/**
 * Severity order, by the words the domain actually uses.
 *
 * A code list rather than a number, because that is what the catalog gives: `dq.exception.severity` is
 * an enum. Unknown values rank last rather than being dropped — a severity nobody anticipated is still
 * work, and hiding it would be the worst possible failure for a queue.
 */
const SEVERITY_RANK: Record<string, number> = {
  critical: 0,
  high: 1,
  major: 1,
  medium: 2,
  moderate: 2,
  low: 3,
  minor: 3,
  info: 4,
  informational: 4,
};

const UNKNOWN_SEVERITY_RANK = 5;

@Component({
  selector: 'opus-exception-queue',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="queue" [attr.data-density]="context().density">
      @if (data().state === 'loading') {
        <p class="note">Loading the queue…</p>
      } @else if (data().state === 'denied') {
        <p class="note">
          You do not have access to these exceptions. The page is otherwise usable — only this
          component is withheld.
        </p>
      } @else if (data().state === 'error') {
        <div class="note error">
          <span>The queue could not be loaded.</span>
          <button type="button" class="link" (click)="action.emit({ event: 'retryRequested', payload: {} })">
            Retry
          </button>
        </div>
      } @else if (!rows().length) {
        <p class="note">Nothing open. An empty queue is a result, not a missing one.</p>
      } @else {
        <div class="bar">
          <span class="count">
            {{ rows().length }} open@if (breachCount()) {, <b>{{ breachCount() }} past {{ config().ageBreachHours }}h</b>}@if (unassignedCount()) {, {{ unassignedCount() }} unassigned}
          </span>
          @if (config().allowBulkSelection && selected().size) {
            <button
              type="button"
              class="bulk"
              (click)="requestTriage(selected().size)"
            >
              Triage {{ selected().size }} selected
            </button>
          }
        </div>

        @for (group of groups(); track group.label) {
          @if (group.label) {
            <h4 class="group">{{ group.label }} <span class="group-count">{{ group.rows.length }}</span></h4>
          }
          <ul class="rows" role="list">
            @for (item of group.rows; track item.key) {
              <li
                class="row"
                [attr.data-severity]="item.severityRank"
                [attr.data-breaching]="item.breaching"
                [attr.aria-label]="labelFor(item)"
                tabindex="0"
                (click)="activate(item)"
                (keydown.enter)="activate(item)"
                (keydown.space)="toggle(item, $event)"
              >
                @if (config().allowBulkSelection) {
                  <input
                    type="checkbox"
                    class="pick"
                    [checked]="selected().has(item.key)"
                    [attr.aria-label]="'Select ' + item.subject"
                    (click)="toggle(item, $event)"
                  />
                }
                <span class="sev">
                  <!-- Text as well as colour: a red row is never the only signal. -->
                  {{ item.severity || 'unclassified' }}
                </span>
                <span class="main">
                  <span class="subject">{{ item.subject }}</span>
                  @if (config().showDetail !== false && item.detail) {
                    <span class="detail">{{ item.detail }}</span>
                  }
                  @if (item.rule) {
                    <span class="rule">detected by {{ item.rule }}</span>
                  }
                </span>
                <span class="meta">
                  @if (item.age !== null) {
                    <span class="age" [attr.data-breaching]="item.breaching">
                      {{ item.age }}h
                      @if (item.breaching) {
                        <span class="breach">past due</span>
                      }
                    </span>
                  }
                  <span class="owner" [attr.data-unassigned]="!item.assignee">
                    {{ item.assignee || 'unassigned' }}
                  </span>
                  <span class="status">{{ item.status }}</span>
                </span>
              </li>
            }
          </ul>
        }

        @if (hidden()) {
          <p class="note">
            Showing {{ shown() }} of {{ rows().length }}. The rest are not hidden by choice — the page's
            data source caps what it returns, and a queue that silently truncates is a queue somebody
            works from the wrong end of.
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

    .note {
      margin: 0;
      padding: var(--opus-space-3) 0;
      font-size: var(--opus-text-sm);
      color: var(--opus-text-muted);
      line-height: var(--opus-leading-normal);
    }

    .note.error {
      display: flex;
      align-items: baseline;
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
      align-items: center;
      gap: var(--opus-space-3);
      padding-block-end: var(--opus-space-2);
      font-size: var(--opus-text-xs);
      color: var(--opus-text-secondary);
    }

    .bulk {
      margin-inline-start: auto;
      padding: 3px 10px;
      border: 1px solid var(--opus-border);
      border-radius: var(--opus-radius-sm);
      background: var(--opus-surface);
      font: inherit;
      color: var(--opus-text);
      cursor: pointer;
    }

    .group {
      margin: var(--opus-space-3) 0 var(--opus-space-1);
      font-size: var(--opus-text-xs);
      font-weight: var(--opus-weight-semibold);
      text-transform: uppercase;
      letter-spacing: 0.04em;
      color: var(--opus-text-muted);
    }

    .group-count {
      margin-inline-start: var(--opus-space-2);
      font-weight: var(--opus-weight-regular);
      text-transform: none;
      letter-spacing: 0;
    }

    .rows {
      margin: 0;
      padding: 0;
      list-style: none;
    }

    .row {
      display: flex;
      align-items: flex-start;
      gap: var(--opus-space-3);
      padding: var(--opus-space-2) var(--opus-space-2) var(--opus-space-2) var(--opus-space-3);
      border-block-end: 1px solid var(--opus-border);
      /* The severity stripe. Emphasis, never the only carrier — see the .sev span. */
      border-inline-start: 3px solid var(--opus-border);
      cursor: pointer;
    }

    .row:hover,
    .row:focus-visible {
      background: var(--opus-surface-hover, var(--opus-surface));
      outline: none;
    }

    .row:focus-visible {
      box-shadow: inset 0 0 0 2px var(--opus-accent);
    }

    .row[data-severity='0'] { border-inline-start-color: var(--opus-emphasis-critical, var(--opus-emphasis-warning)); }
    .row[data-severity='1'] { border-inline-start-color: var(--opus-emphasis-warning); }
    .row[data-severity='2'] { border-inline-start-color: var(--opus-emphasis-info); }

    /*
      Breach is a badge, not a wash.

      An earlier version filled the whole row when it was past due, and against a real backlog — the
      shipped fixture's median exception is 160 hours old — that painted nearly every row, drowning the
      severity stripe which is the primary signal. Severity owns the row's colour; breach is carried by
      the coloured age and the PAST DUE badge, which still discriminate row by row.
    */

    .pick {
      margin-block-start: 3px;
    }

    .sev {
      flex: 0 0 6.5rem;
      font-size: var(--opus-text-xs);
      font-weight: var(--opus-weight-semibold);
      text-transform: uppercase;
      letter-spacing: 0.03em;
      color: var(--opus-text-secondary);
    }

    .main {
      display: flex;
      flex-direction: column;
      gap: 2px;
      flex: 1 1 auto;
      min-inline-size: 0;
    }

    .subject {
      font-size: var(--opus-text-sm);
      font-weight: var(--opus-weight-medium);
      color: var(--opus-text);
    }

    .detail,
    .rule {
      font-size: var(--opus-text-xs);
      color: var(--opus-text-muted);
      overflow-wrap: anywhere;
    }

    .meta {
      display: flex;
      align-items: baseline;
      gap: var(--opus-space-3);
      flex: 0 0 auto;
      font-size: var(--opus-text-xs);
      color: var(--opus-text-secondary);
    }

    .age[data-breaching='true'] {
      font-weight: var(--opus-weight-semibold);
      color: var(--opus-emphasis-warning);
    }

    .breach {
      margin-inline-start: 4px;
      text-transform: uppercase;
      letter-spacing: 0.03em;
    }

    .owner[data-unassigned='true'] {
      font-style: italic;
      color: var(--opus-text-muted);
    }

    /*
      Below sm the row becomes a card: severity and age have to stay legible, because they are the two
      values a triage decision is made on, and a horizontal row cannot hold seven columns on a phone.
    */
    @container (max-width: 600px) {
      .row {
        flex-wrap: wrap;
      }

      .sev {
        flex-basis: auto;
      }

      .meta {
        flex-basis: 100%;
        padding-inline-start: 0;
      }
    }
  `,
})
export class ExceptionQueueComponent {
  readonly config = input<ExceptionQueueConfig>({});
  readonly data = input<DataView>({ state: 'ready', rows: [] });
  readonly context = input.required<ComponentContext>();
  readonly title = input<string>('');
  /**
   * Which field plays which role, keyed by the role names the manifest declares.
   *
   * The platform's own mechanism — the renderer passes `bindings` to any component that declares the
   * input, exactly as it does for `analytics.kpi-card`. An earlier draft of this component invented a
   * `fields` map instead, which would have been a second way to say the same thing and the very fault
   * its own workflow model is written to avoid.
   *
   * The component never guesses a column name: a queue that looked for a field called `severity` would
   * work against this catalog and silently show every row as unclassified against the next.
   */
  readonly bindings = input<Record<string, FieldBinding | readonly FieldBinding[]>>({});

  /** One role's field name, or undefined when the page bound nothing to it. */
  private readonly fieldFor = (role: string): string | undefined => {
    const bound = this.bindings()[role];
    const binding = Array.isArray(bound) ? bound[0] : (bound as FieldBinding | undefined);
    return binding?.field;
  };

  readonly action = output<ComponentActionEvent>();

  protected readonly selected = signal(new Set<string>());

  private readonly text = (row: DataRow, field: string | undefined): string => {
    if (!field) return '';
    const value = row[field];
    return value === null || value === undefined ? '' : String(value);
  };

  protected readonly rows = computed<QueueRow[]>(() => {
    const fields = {
      subject: this.fieldFor('subject'),
      severity: this.fieldFor('severity'),
      status: this.fieldFor('status'),
      age: this.fieldFor('age'),
      assignee: this.fieldFor('assignee'),
      rule: this.fieldFor('rule'),
      detail: this.fieldFor('detail'),
    };
    const breachAt = this.config().ageBreachHours;

    const mapped = this.data().rows.map((row, index) => {
      const severity = this.text(row, fields.severity);
      const rawAge = fields.age ? row[fields.age] : undefined;
      const age = typeof rawAge === 'number' ? rawAge : rawAge == null ? null : Number(rawAge);
      const numericAge = age !== null && Number.isFinite(age) ? age : null;

      return {
        // The subject is not guaranteed unique, so the index is part of the key. Two exceptions on the
        // same security are two pieces of work.
        key: `${index}:${this.text(row, fields.subject)}`,
        subject: this.text(row, fields.subject) || '(no subject)',
        severity,
        severityRank: SEVERITY_RANK[severity.trim().toLowerCase()] ?? UNKNOWN_SEVERITY_RANK,
        status: this.text(row, fields.status),
        age: numericAge,
        breaching: breachAt !== undefined && numericAge !== null && numericAge > breachAt,
        assignee: this.text(row, fields.assignee),
        rule: this.text(row, fields.rule),
        detail: this.text(row, fields.detail),
        row,
      } satisfies QueueRow;
    });

    /*
      The queue's ordering, and the whole reason this is not a grid.

      Severity, then unassigned, then oldest. Sorted here rather than asked of the data source, because
      the same query serves a chart and a queue and only one of them wants this order.
    */
    const unassignedFirst = this.config().unassignedFirst !== false;
    return mapped.sort((a, b) => {
      if (a.severityRank !== b.severityRank) return a.severityRank - b.severityRank;
      if (unassignedFirst && !a.assignee !== !b.assignee) return a.assignee ? 1 : -1;
      return (b.age ?? -1) - (a.age ?? -1);
    });
  });

  protected readonly shown = computed(() =>
    Math.min(this.rows().length, this.config().pageSize ?? 25),
  );

  protected readonly hidden = computed(() => this.rows().length > this.shown());

  protected readonly breachCount = computed(() => this.rows().filter((r) => r.breaching).length);

  protected readonly unassignedCount = computed(() => this.rows().filter((r) => !r.assignee).length);

  protected readonly groups = computed<QueueGroup[]>(() => {
    const visible = this.rows().slice(0, this.shown());
    const by = this.config().groupBy ?? 'severity';
    if (by === 'none') return [{ label: '', rows: visible }];

    const buckets = new Map<string, QueueRow[]>();
    for (const row of visible) {
      const key =
        by === 'severity'
          ? row.severity || 'unclassified'
          : by === 'rule'
            ? row.rule || 'no rule recorded'
            : row.assignee || 'unassigned';
      const bucket = buckets.get(key);
      if (bucket) bucket.push(row);
      else buckets.set(key, [row]);
    }
    // Insertion order already follows the row ordering above, so groups come out in severity order
    // without a second sort inventing one.
    return [...buckets.entries()].map(([label, rows]) => ({ label, rows }));
  });

  /**
   * One label per row, rather than seven unlabelled cells.
   *
   * A screen reader moving down this list should hear the decision — what, how bad, how old, whose —
   * in one utterance. Reading it as a table row means hearing "Nestle SA, critical, 72, unassigned,
   * open" with no idea which number is which.
   */
  protected labelFor(item: QueueRow): string {
    const parts = [
      item.subject,
      item.severity ? `severity ${item.severity}` : 'severity unclassified',
      item.age !== null ? `open ${item.age} hours` : '',
      item.breaching ? 'past due' : '',
      item.assignee ? `assigned to ${item.assignee}` : 'unassigned',
      item.status,
    ];
    return parts.filter(Boolean).join(', ');
  }

  protected activate(item: QueueRow): void {
    this.action.emit({ event: 'exceptionActivated', payload: { subject: item.subject } });
  }

  protected requestTriage(count: number): void {
    this.action.emit({ event: 'triageRequested', payload: { count } });
  }

  protected toggle(item: QueueRow, event: Event): void {
    // Stops the row's own activation: selecting is not opening, and a checkbox that also navigated
    // would make bulk selection impossible to use.
    event.stopPropagation();
    event.preventDefault();
    if (!this.config().allowBulkSelection) return;

    const next = new Set(this.selected());
    if (!next.delete(item.key)) next.add(item.key);
    this.selected.set(next);
    this.action.emit({ event: 'selectionChanged', payload: { count: next.size } });
  }
}
