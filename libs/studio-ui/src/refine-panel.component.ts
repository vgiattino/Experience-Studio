/**
 * The refinement panel: describe a change, read what it will do, accept or discard.
 *
 * ── WHY THIS IS A TRANSCRIPT AND NOT A SEARCH BOX ────────────────────────────
 *
 * §14 asks for a conversation that is stateful and iterative, and §28 walks through nine prompts in a
 * row. A single input that clears itself after each attempt is not that: the author cannot see what
 * they already asked, cannot tell which of nine changes landed, and has no record to read back when
 * the page looks wrong. So every turn stays on screen with its outcome, and the panel scrolls.
 *
 * ── FOUR OUTCOMES, FOUR DIFFERENT THINGS TO SHOW ─────────────────────────────
 *
 *   resolved       the §19 sentence, and Apply / Discard
 *   ambiguous      the question, and the candidates as buttons — answering re-asks with the name
 *   refused        the reason, which always names what IS available
 *   notUnderstood  the reason, with examples of verbs that work
 *
 * The third and fourth are the ones usually collapsed into "sorry, try again". They are kept apart
 * because they call for different next moves: a refusal means *that* cannot be done and something else
 * can, and a misunderstanding means the sentence needs rephrasing.
 *
 * ── AND WHY APPLY IS A SEPARATE PRESS ────────────────────────────────────────
 *
 * A proposal is not an action. The author reads one sentence describing exactly what will change,
 * presses Apply, and gets one undoable patch. Applying on interpretation would read faster in a demo
 * and be worse in use — an author who cannot predict what a sentence will do stops typing them.
 */

import { ChangeDetectionStrategy, Component, inject, output, signal } from '@angular/core';
import { IconComponent } from '@opus/design-system';

import { RefineService, type RefineTurn } from './refine.service';

@Component({
  selector: 'opus-refine-panel',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [IconComponent],
  template: `
    <section class="opus-ai-panel" aria-label="Describe a change">
      <header class="opus-ai-panel-head">
        <opus-icon name="sparkle" [size]="14" />
        <span>Describe a change</span>
        <span class="opus-ai-badge">AI</span>
        <span class="head-spacer"></span>
        @if (refine.count() > 0) {
          <button type="button" class="opus-btn sm" (click)="refine.reset()">Clear</button>
        }
        <button type="button" class="opus-icon-btn" (click)="close.emit()" aria-label="Close">
          <opus-icon name="close" [size]="14" />
        </button>
      </header>

      <div class="turns" #scroller>
        @if (refine.count() === 0) {
          <p class="empty">
            Say what to change, in your own words. The change is described back to you before anything
            happens.
          </p>
          <ul class="examples">
            @for (example of EXAMPLES; track example) {
              <li>
                <button type="button" class="example" (click)="submit(example)">{{ example }}</button>
              </li>
            }
          </ul>
        }

        @for (turn of refine.turns(); track turn.id) {
          <article class="turn" [class.spent]="turn.applied || turn.discarded">
            <p class="said">{{ turn.prompt }}</p>

            @switch (turn.outcome.outcome) {
              @case ('resolved') {
                <p class="answer">{{ turn.outcome.explanation }}</p>
                @if (turn.applied) {
                  <p class="done">
                    <opus-icon name="check" [size]="13" />
                    <span>Applied. Undo reverses it as one step.</span>
                  </p>
                } @else if (turn.discarded) {
                  <p class="muted">Discarded.</p>
                } @else {
                  <div class="actions">
                    <button type="button" class="opus-btn primary sm" (click)="apply(turn)">Apply</button>
                    <button type="button" class="opus-btn sm" (click)="refine.discard(turn.id)">
                      Discard
                    </button>
                  </div>
                }
                @if (turn.problem) {
                  <p class="problem">
                    <opus-icon name="warning" [size]="13" />
                    <span>{{ turn.problem }}</span>
                  </p>
                }
              }

              @case ('ambiguous') {
                <p class="answer question">{{ turn.outcome.question }}</p>
                @if (!turn.discarded) {
                  <div class="actions wrap">
                    @for (candidate of turn.outcome.candidates; track candidate.label) {
                      <button
                        type="button"
                        class="opus-btn sm"
                        (click)="refine.answer(turn.id, candidate.label)"
                      >
                        {{ candidate.label }}
                      </button>
                    }
                  </div>
                } @else {
                  <p class="muted">Answered.</p>
                }
              }

              @case ('refused') {
                <p class="answer refused">
                  <opus-icon name="info" [size]="13" />
                  <span>{{ turn.outcome.reason }}</span>
                </p>
              }

              @case ('notUnderstood') {
                <p class="answer refused">
                  <opus-icon name="info" [size]="13" />
                  <span>{{ turn.outcome.reason }}</span>
                </p>
              }
            }
          </article>
        }
      </div>

      <form class="composer" (submit)="onSubmit($event)">
        <input
          type="text"
          [value]="draft()"
          (input)="draft.set($any($event.target).value)"
          placeholder="e.g. change the chart to a line chart"
          aria-label="Describe a change to this page"
        />
        <button type="submit" class="opus-btn primary sm" [disabled]="!draft().trim()">Send</button>
      </form>
    </section>
  `,
  styles: [
    `
      :host {
        display: block;
        height: 100%;
      }
      .opus-ai-panel {
        display: flex;
        flex-direction: column;
        height: 100%;
        min-height: 0;
      }
      .head-spacer {
        flex: 1;
      }
      /*
        The body carries its own surface. The shared opus-ai-panel class tints only its HEAD, and leaves
        the body to opus-ai-panel-body — which this panel does not use, because a scrolling transcript is
        not a padded list. Without a background of its own the whole panel read as one flat block of
        accent, which is exactly how it looked in the browser before this line.
      */
      .turns {
        flex: 1;
        min-height: 0;
        overflow-y: auto;
        padding: var(--opus-space-3);
        background: var(--opus-surface);
        display: flex;
        flex-direction: column;
        gap: var(--opus-space-3);
      }
      .empty {
        margin: 0;
        color: var(--opus-text-muted);
        font-size: var(--opus-text-sm);
        line-height: 1.5;
      }
      .examples {
        list-style: none;
        margin: 0;
        padding: 0;
        display: flex;
        flex-direction: column;
        gap: var(--opus-space-1);
      }
      /* An example is a button, not prose: the fastest way to learn the vocabulary is to press one. */
      .example {
        width: 100%;
        text-align: left;
        border: 1px solid var(--opus-border);
        border-radius: var(--opus-radius-sm);
        background: var(--opus-surface-raised);
        color: var(--opus-text-secondary);
        font: inherit;
        font-size: var(--opus-text-sm);
        padding: var(--opus-space-2);
        cursor: pointer;
      }
      .example:hover {
        border-color: var(--opus-border-strong);
        color: var(--opus-text);
      }
      .turn {
        display: flex;
        flex-direction: column;
        gap: var(--opus-space-1);
        padding-bottom: var(--opus-space-3);
        border-bottom: 1px solid var(--opus-border);
      }
      .turn:last-child {
        border-bottom: none;
        padding-bottom: 0;
      }
      /* A spent turn stays legible and stops competing: the transcript is a record, not a queue. */
      .turn.spent .said,
      .turn.spent .answer {
        color: var(--opus-text-muted);
      }
      .said {
        margin: 0;
        font-size: var(--opus-text-sm);
        font-weight: 600;
        color: var(--opus-text);
      }
      .answer {
        margin: 0;
        font-size: var(--opus-text-sm);
        line-height: 1.5;
        color: var(--opus-text-secondary);
        display: flex;
        gap: var(--opus-space-1);
        align-items: flex-start;
      }
      .answer opus-icon {
        flex: none;
        margin-top: 2px;
      }
      .question {
        color: var(--opus-text);
      }
      .refused {
        color: var(--opus-text-muted);
      }
      .actions {
        display: flex;
        gap: var(--opus-space-1);
        margin-top: var(--opus-space-1);
      }
      .actions.wrap {
        flex-wrap: wrap;
      }
      .done,
      .problem,
      .muted {
        margin: 0;
        font-size: var(--opus-text-xs);
        display: flex;
        gap: var(--opus-space-1);
        align-items: center;
      }
      .done {
        color: var(--opus-emphasis-positive);
      }
      .problem {
        color: var(--opus-emphasis-negative);
      }
      .muted {
        color: var(--opus-text-muted);
      }
      .composer {
        flex: none;
        display: flex;
        gap: var(--opus-space-1);
        padding: var(--opus-space-3);
        background: var(--opus-surface);
        border-top: 1px solid var(--opus-border);
      }
      .composer input {
        flex: 1;
        min-width: 0;
        font: inherit;
        font-size: var(--opus-text-sm);
        padding: var(--opus-space-2);
        border: 1px solid var(--opus-border);
        border-radius: var(--opus-radius-sm);
        background: var(--opus-surface);
        color: var(--opus-text);
      }
      .composer input:focus-visible {
        outline: 2px solid var(--opus-focus-ring);
        outline-offset: 1px;
      }
    `,
  ],
})
export class RefinePanelComponent {
  protected readonly refine = inject(RefineService);
  readonly close = output<void>();

  protected readonly draft = signal('');

  /**
   * Examples drawn from the PRD's own §11, §12 and §15, so the first thing an author reads is a
   * sentence the engine is known to handle rather than an invitation to guess.
   */
  protected readonly EXAMPLES = [
    'Change the chart to a line chart',
    'Remove the currency column',
    'Sort by exception count descending',
    'Move the exceptions panel to the top',
  ];

  protected onSubmit(event: Event): void {
    event.preventDefault();
    this.submit(this.draft());
  }

  protected submit(prompt: string): void {
    if (!prompt.trim()) return;
    this.refine.ask(prompt);
    this.draft.set('');
  }

  protected apply(turn: RefineTurn): void {
    this.refine.accept(turn.id);
  }
}
