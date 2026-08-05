/**
 * The patch log, shown.
 *
 * Not a debugging aid. It is the argument of §4.3 made visible: a drag, a property edit and an
 * AI refinement appear in one list, tagged by origin, each with the operations it produced. That
 * is the diff a reviewer reads, the audit trail governance needs, and the thing that makes undo
 * legible rather than a mystery — a user who can see that "Add KPI Card" was three operations
 * understands why one undo removed all three.
 */

import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';

import { EditorService } from './editor.service';

@Component({
  selector: 'opus-history-panel',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="history">
      <div class="controls">
        <button type="button" [disabled]="!store.canUndo()" (click)="store.undo()">↶ Undo</button>
        <button type="button" [disabled]="!store.canRedo()" (click)="store.redo()">↷ Redo</button>
        <span class="count">{{ store.history().length }} change(s)</span>
      </div>

      @if (store.problem(); as problem) {
        <p class="problem" role="alert">
          {{ problem }}
          <button type="button" class="dismiss" (click)="store.clearProblem()" aria-label="Dismiss">×</button>
        </p>
      }

      @if (!entries().length) {
        <p class="muted">No changes yet.</p>
      }

      <ol>
        @for (entry of entries(); track entry.seq) {
          <li [class.undone]="entry.undone" [attr.data-origin]="entry.origin">
            <div class="head">
              <span class="label">{{ entry.label }}</span>
              <span class="origin">{{ entry.origin }}</span>
            </div>
            <code>{{ entry.summary }}</code>
          </li>
        }
      </ol>
    </div>
  `,
  styles: `
    :host {
      display: block;
      overflow-y: auto;
    }

    .history {
      padding: var(--opus-space-3);
    }

    .controls {
      display: flex;
      align-items: center;
      gap: var(--opus-space-2);
      margin-block-end: var(--opus-space-2);
    }

    button {
      font: inherit;
      font-size: var(--opus-text-xs);
      padding: 3px var(--opus-space-2);
      color: var(--opus-text-secondary);
      background: var(--opus-surface);
      border: 1px solid var(--opus-border);
      border-radius: var(--opus-radius-sm);
      cursor: pointer;
    }

    button:disabled {
      opacity: 0.45;
      cursor: not-allowed;
    }

    button:focus-visible {
      outline: 2px solid var(--opus-focus-ring);
      outline-offset: 1px;
    }

    .count,
    .muted {
      font-size: var(--opus-text-xs);
      color: var(--opus-text-muted);
    }

    .problem {
      display: flex;
      align-items: flex-start;
      gap: var(--opus-space-2);
      margin: 0 0 var(--opus-space-2);
      padding: var(--opus-space-2);
      font-size: var(--opus-text-xs);
      color: var(--opus-text);
      background: color-mix(in srgb, var(--opus-emphasis-negative) 10%, transparent);
      border-inline-start: 3px solid var(--opus-emphasis-negative);
      border-radius: var(--opus-radius-sm);
    }

    .dismiss {
      margin-inline-start: auto;
      padding: 0 4px;
      border: 0;
      background: none;
      font-size: var(--opus-text-md);
      line-height: 1;
    }

    ol {
      list-style: none;
      margin: 0;
      padding: 0;
      display: flex;
      flex-direction: column-reverse;
      gap: 2px;
    }

    li {
      padding: 4px var(--opus-space-2);
      background: var(--opus-surface);
      border: 1px solid var(--opus-border);
      border-radius: var(--opus-radius-sm);
    }

    /* An undone entry is still shown, because it is still redoable. */
    li.undone {
      opacity: 0.45;
      border-style: dashed;
    }

    .head {
      display: flex;
      justify-content: space-between;
      gap: var(--opus-space-2);
      font-size: var(--opus-text-xs);
    }

    .label {
      font-weight: var(--opus-weight-medium);
    }

    .origin {
      font-family: var(--opus-font-mono);
      font-size: 0.65rem;
      text-transform: uppercase;
      color: var(--opus-text-muted);
    }

    li[data-origin='ai'] .origin {
      color: var(--opus-emphasis-info);
    }

    li[data-origin='json'] .origin {
      color: var(--opus-emphasis-warning);
    }

    code {
      display: block;
      font-family: var(--opus-font-mono);
      font-size: 0.65rem;
      line-height: 1.4;
      color: var(--opus-text-muted);
      overflow-wrap: anywhere;
    }
  `,
})
export class HistoryPanelComponent {
  private readonly editor = inject(EditorService);
  protected readonly store = this.editor.store;

  protected readonly entries = computed(() => this.store.timeline());
}
