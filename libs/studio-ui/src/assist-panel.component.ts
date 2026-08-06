/**
 * The assist panel: suggestions for the open page, with a reason and two buttons each.
 *
 * ── WHY EVERY ROW SHOWS ITS REASON ────────────────────────────────────────────────────
 * The author is being asked to accept a change to a page they are responsible for. A row reading
 * "Add a Late Files figure" with an Add button asks for trust it has not earned; the same row with
 * *"Processing exposes Late Files — files that arrived after their SLA — and no widget on this page
 * reads it"* states a checkable fact about the catalog. The rationale is not decoration, it is the
 * difference between a suggestion an analyst can evaluate and one they can only gamble on.
 *
 * ── WHAT THE PANEL DELIBERATELY SHOWS THAT USUALLY GETS HIDDEN ─────────────────────────
 *   - Which provider answered, or that the deterministic analyser did. An author who cannot tell
 *     whether a model was involved cannot calibrate how much to trust the list.
 *   - Proposals that were **rejected** for naming something outside the author's grounded scope.
 *     A silently filtered response looks like a model that made no mistakes.
 *   - That the list is **stale** once the page moves, rather than re-running and appearing to have
 *     opinions about a page state it never saw.
 *   - The empty case as a *result* ("nothing to add") rather than an empty box, because on a complete
 *     page that is the correct answer and it should read like one.
 */

import { ChangeDetectionStrategy, Component, computed, inject, output } from '@angular/core';
import { IconComponent } from '@opus/design-system';

import { AssistService } from './assist.service';

@Component({
  selector: 'opus-assist-panel',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [IconComponent],
  template: `
    <section class="opus-ai-panel" aria-label="AI suggestions">
      <header class="opus-ai-panel-head">
        <opus-icon name="sparkle" [size]="14" />
        <span>Suggestions for this page</span>
        <span class="opus-ai-badge">AI</span>
        <span class="head-spacer"></span>

        @if (assist.status() === 'thinking') {
          <span class="thinking">
            <opus-icon name="settings" [size]="13" class="opus-spin" />
            Reading the catalog…
          </span>
        } @else {
          <button
            type="button"
            class="opus-btn sm"
            (click)="assist.suggest()"
            [disabled]="!canRun()"
          >
            <opus-icon name="sparkle" [size]="12" />
            {{ assist.status() === 'idle' ? 'Suggest' : 'Suggest again' }}
          </button>
        }
        <button type="button" class="opus-icon-btn" title="Hide suggestions" (click)="close.emit()">
          <opus-icon name="close" [size]="15" [weight]="2" />
        </button>
      </header>

      <div class="opus-ai-panel-body">
        @if (assist.stale() && assist.status() === 'ready') {
          <p class="stale" role="status">
            <opus-icon name="info" [size]="14" />
            The page has changed since these were worked out. Suggest again for a current list.
          </p>
        }

        @for (suggestion of assist.visible(); track suggestion.proposal.id) {
          <div class="row" [attr.data-kind]="suggestion.proposal.kind">
            <span class="ai-ic"><opus-icon name="sparkle" [size]="13" /></span>
            <div class="body">
              <p class="title">{{ suggestion.proposal.title }}</p>
              <p class="why">{{ suggestion.proposal.rationale }}</p>
              @if (suggestion.problem) {
                <p class="problem" role="alert">
                  <opus-icon name="warning" [size]="13" [weight]="2" />
                  {{ suggestion.problem }}
                </p>
              }
            </div>

            @if (suggestion.applied) {
              <!--
                An accepted row stays, reporting what happened, rather than disappearing. The author
                needs to see that their click did something — and the undo that reverses it lives in
                the toolbar, not here, because it is an ordinary undo of an ordinary patch.
              -->
              <span class="applied">
                <opus-icon name="check" [size]="14" [weight]="2" />
                Added
              </span>
            } @else {
              <span class="actions">
                <button
                  type="button"
                  class="opus-btn primary sm"
                  (click)="assist.accept(suggestion.proposal)"
                >
                  {{ verbFor(suggestion.proposal.kind) }}
                </button>
                <button
                  type="button"
                  class="opus-icon-btn"
                  title="Dismiss this suggestion"
                  (click)="assist.dismiss(suggestion.proposal.id)"
                >
                  <opus-icon name="close" [size]="14" [weight]="2" />
                </button>
              </span>
            }
          </div>
        } @empty {
          @if (assist.status() === 'idle') {
            <p class="empty">
              Ask what this page is missing. Suggestions are grounded in the catalog you are
              entitled to, and accepting one is a single, undoable edit.
            </p>
          }
        }

        @if (assist.note(); as note) {
          <p class="note" [class.error]="assist.status() === 'error'" role="status">
            {{ note }}
          </p>
        }

        @if (assist.rejected().length) {
          <details class="rejected">
            <summary>
              {{ assist.rejected().length }} proposal(s) were rejected before you saw them
            </summary>
            <ul>
              @for (rejection of assist.rejected(); track rejection.id) {
                <li><code>{{ rejection.id }}</code> — {{ rejection.reason }}</li>
              }
            </ul>
          </details>
        }

        @if (assist.status() !== 'idle') {
          <p class="provenance">
            {{
              assist.providerId()
                ? 'Answered by ' + assist.providerId() + ', held to the assist response schema.'
                : 'Answered by the deterministic analyser — no model was called.'
            }}
          </p>
        }
      </div>
    </section>
  `,
  styles: `
    :host {
      display: block;
    }

    .head-spacer {
      flex: 1;
    }

    .thinking {
      display: inline-flex;
      align-items: center;
      gap: var(--opus-space-1);
      font-size: var(--opus-text-sm);
      font-weight: var(--opus-weight-regular);
    }

    .row {
      display: flex;
      align-items: flex-start;
      gap: var(--opus-space-2);
      padding-block: var(--opus-space-2);
      border-block-end: 1px solid var(--opus-border);
    }

    .row:last-of-type {
      border-block-end: 0;
    }

    .ai-ic {
      color: var(--opus-accent);
      flex-shrink: 0;
      margin-block-start: 3px;
      display: flex;
    }

    .body {
      flex: 1;
      min-inline-size: 0;
    }

    .title {
      margin: 0;
      font-size: var(--opus-text-md);
      font-weight: var(--opus-weight-medium);
      color: var(--opus-text);
    }

    .why {
      margin: 2px 0 0;
      font-size: var(--opus-text-sm);
      color: var(--opus-text-secondary);
      line-height: var(--opus-leading-normal);
    }

    .problem {
      display: flex;
      align-items: center;
      gap: var(--opus-space-1);
      margin: var(--opus-space-1) 0 0;
      font-size: var(--opus-text-sm);
      color: var(--opus-emphasis-negative);
    }

    .actions {
      display: inline-flex;
      align-items: center;
      gap: var(--opus-space-1);
      flex-shrink: 0;
    }

    .applied {
      display: inline-flex;
      align-items: center;
      gap: var(--opus-space-1);
      font-size: var(--opus-text-sm);
      font-weight: var(--opus-weight-medium);
      color: var(--opus-emphasis-positive);
      flex-shrink: 0;
    }

    .stale {
      display: flex;
      align-items: center;
      gap: var(--opus-space-2);
      margin: 0 0 var(--opus-space-2);
      padding: 6px 10px;
      border-radius: var(--opus-radius-sm);
      background: var(--opus-emphasis-warning-bg);
      color: var(--opus-emphasis-warning);
      font-size: var(--opus-text-sm);
    }

    .empty,
    .note,
    .provenance {
      margin: 0;
      font-size: var(--opus-text-sm);
      color: var(--opus-text-secondary);
      line-height: var(--opus-leading-normal);
    }

    .note.error {
      color: var(--opus-emphasis-negative);
    }

    .provenance {
      font-size: var(--opus-text-xs);
      color: var(--opus-text-muted);
      padding-block-start: var(--opus-space-1);
    }

    .rejected {
      font-size: var(--opus-text-sm);
      color: var(--opus-text-muted);
    }

    .rejected summary {
      cursor: pointer;
    }

    .rejected ul {
      margin: var(--opus-space-1) 0 0;
      padding-inline-start: var(--opus-space-4);
    }

    .rejected code {
      font-family: var(--opus-font-mono);
      font-size: var(--opus-text-xs);
    }

    @media (max-width: 700px) {
      .row {
        flex-wrap: wrap;
      }

      .actions,
      .applied {
        margin-inline-start: calc(13px + var(--opus-space-2));
      }
    }
  `,
})
export class AssistPanelComponent {
  protected readonly assist = inject(AssistService);

  /** The host owns whether the panel is shown, so closing is its decision to make. */
  readonly close = output<void>();

  protected readonly canRun = computed(() => this.assist.status() !== 'thinking');

  /** The button verb matches what the proposal does, so "Add" never sits next to a rename. */
  protected verbFor(kind: string): string {
    return kind === 'set-page-description' || kind === 'retitle-widget' ? 'Apply' : 'Add';
  }
}
