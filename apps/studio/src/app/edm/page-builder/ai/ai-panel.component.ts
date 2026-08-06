/**
 * The AI surface: one prompt, one proposal, one list of things that are wrong.
 *
 * ── WHY IT IS A FULL-WIDTH BAR AND NOT A THIRD COLUMN ───────────────────────────────────
 * A non-technical author does not go looking for AI in a tab. The prompt is the first thing under the
 * page strip, always visible, with examples in it — because the hardest part of using a page builder is
 * knowing what to ask for, and four example sentences teach that better than any tour. Full width also
 * buys the one thing a proposal needs: room to be *read*. A summary and six reasons in a 260px column
 * is a scrollbar, and a scrollbar is where the author stops reading and starts pressing buttons.
 *
 * ── AND WHY IT SAYS WHO ANSWERED ────────────────────────────────────────────────────────
 * The label names the provider on every answer. With no model configured that reads "canvas-stand-in",
 * which is honest about what the author is getting: rules that match phrases, not a model that
 * understands them. Hiding that would make the good answers untrustworthy along with the bad ones.
 */

import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  input,
  output,
  signal,
} from '@angular/core';
import { IconComponent } from '@opus/design-system';

import type { PageDef, Widget } from '../model';
import { PageBuilderAiService, type Proposal } from './ai.service';
import type { CanvasEdit } from './decisions';
import type { Finding } from './review';

/**
 * What to type, for someone who has never done this.
 *
 * Whole sentences rather than keywords, because they are the instruction *and* the lesson: an author who
 * clicks the third one learns that this thing takes plain requests, not commands.
 */
const EXAMPLES: readonly string[] = [
  'A dashboard of late file loads by source, with a trend and a table',
  'Security master coverage by asset type for the ops team',
  'A search page to look up a security by ISIN',
  'An exception review workspace with approve and reject',
];

export interface AcceptedPage {
  name: string;
  widgets: Widget[];
  notes: string[];
}

@Component({
  selector: 'opus-pb-ai',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [IconComponent],
  providers: [PageBuilderAiService],
  template: `
    <div class="ai">
      <div class="ai-bar">
        <span class="ai-mark" [class.busy]="ai.running()">
          <opus-icon name="sparkle" [size]="16" />
        </span>
        <input
          #box
          class="ai-input opus-input"
          type="text"
          [attr.placeholder]="placeholder()"
          [value]="text()"
          (input)="text.set($any($event.target).value)"
          (keydown.enter)="ask()"
        />
        <button type="button" class="opus-btn primary sm" [disabled]="ai.running()" (click)="ask()">
          {{ ai.running() ? 'Working…' : 'Ask' }}
        </button>
        <button
          type="button"
          class="ai-review"
          [class.on]="showReview()"
          [class.clean]="!findings().length"
          [title]="reviewTitle()"
          (click)="showReview.set(!showReview())"
        >
          <opus-icon [name]="findings().length ? 'warning' : 'check'" [size]="13" [weight]="2" />
          {{ findings().length ? findings().length + ' to look at' : 'Nothing to flag' }}
        </button>
      </div>

      @if (!proposal() && !showReview()) {
        <div class="ai-eg">
          <span>Try:</span>
          @for (example of examples; track example) {
            <button type="button" class="ai-chip" (click)="askFor(example)">{{ example }}</button>
          }
        </div>
      }

      @if (showReview()) {
        <div class="ai-list">
          @if (!findings().length) {
            <p class="ai-none">
              Nothing to flag across {{ pages().length }} page(s): every page has a heading, every button
              goes somewhere, every page can be reached, and nothing overlaps.
            </p>
          }
          @for (finding of findings(); track finding.id) {
            <div class="ai-find" [attr.data-severity]="finding.severity">
              <span class="ai-dot"></span>
              <div class="ai-find-text">
                <b>{{ finding.title }}</b>
                <span>{{ finding.detail }}</span>
              </div>
              <button type="button" class="opus-btn sm" (click)="reveal.emit(finding)">Show me</button>
              @if (finding.fix) {
                <button type="button" class="opus-btn sm primary" (click)="fix(finding)">Fix it</button>
              }
            </div>
          }
        </div>
      }

      @if (proposal(); as answer) {
        <div class="ai-card" [attr.data-kind]="answer.kind">
          <div class="ai-card-h">
            <opus-icon [name]="iconFor(answer)" [size]="15" />
            <b>{{ heading(answer) }}</b>
            <span class="ai-served">{{ answer.servedBy }}</span>
            <button type="button" class="opus-icon-btn" title="Dismiss" (click)="ai.clear()">
              <opus-icon name="close" [size]="15" [weight]="2" />
            </button>
          </div>

          <p class="ai-summary">{{ answer.summary }}</p>

          @if (answer.lines.length) {
            <ul class="ai-lines">
              @for (line of answer.lines; track line) {
                <li>{{ line }}</li>
              }
            </ul>
          }

          @for (note of answer.page?.notes ?? []; track note) {
            <p class="ai-note">{{ note }}</p>
          }

          @if (answer.dropped.length) {
            <div class="ai-dropped">
              <b>Not done:</b>
              @for (line of answer.dropped; track line) {
                <span>{{ line }}</span>
              }
            </div>
          }

          @if (answer.kind === 'page' || answer.kind === 'edits') {
            <div class="ai-actions">
              <button type="button" class="opus-btn primary sm" (click)="accept(answer)">
                {{ answer.kind === 'page' ? 'Add this page' : verb(answer) }}
              </button>
              <button type="button" class="opus-btn sm" (click)="ai.clear()">Discard</button>
              <span class="ai-undo-hint">You can undo this in one step.</span>
            </div>
          }
        </div>
      }
    </div>
  `,
  styles: `
    :host {
      display: block;
      border-block-end: 1px solid var(--opus-border);
      background: var(--opus-surface);
      flex-shrink: 0;
    }

    .ai {
      padding: 8px 20px 10px;
    }

    .ai-bar {
      display: flex;
      align-items: center;
      gap: var(--opus-space-2);
      flex-wrap: wrap;
    }

    .ai-mark {
      display: inline-grid;
      place-items: center;
      inline-size: 28px;
      block-size: 28px;
      border-radius: var(--opus-radius-sm);
      background: var(--opus-accent-soft);
      color: var(--opus-accent);
      flex-shrink: 0;
    }

    .ai-mark.busy {
      animation: ai-pulse 1s var(--opus-easing) infinite;
    }

    @keyframes ai-pulse {
      50% {
        opacity: 0.45;
      }
    }

    .ai-input {
      flex: 1;
      min-inline-size: 12rem;
    }

    .ai-review {
      display: inline-flex;
      align-items: center;
      gap: 5px;
      padding: 6px 11px;
      border: 1px solid var(--opus-emphasis-warning);
      border-radius: 999px;
      background: var(--opus-emphasis-warning-bg);
      color: var(--opus-emphasis-warning);
      font: inherit;
      font-size: var(--opus-text-sm);
      font-weight: var(--opus-weight-medium);
      cursor: pointer;
      white-space: nowrap;
    }

    .ai-review.clean {
      border-color: var(--opus-border-strong);
      background: none;
      color: var(--opus-text-muted);
    }

    .ai-review.on {
      outline: 2px solid var(--opus-accent);
      outline-offset: 1px;
    }

    .ai-eg {
      display: flex;
      align-items: center;
      gap: 6px;
      margin-block-start: 7px;
      flex-wrap: wrap;
      font-size: var(--opus-text-xs);
      color: var(--opus-text-muted);
    }

    .ai-chip {
      padding: 3px 9px;
      border: 1px dashed var(--opus-border-strong);
      border-radius: 999px;
      background: none;
      font: inherit;
      font-size: var(--opus-text-xs);
      color: var(--opus-text-secondary);
      cursor: pointer;
      text-align: start;
    }

    .ai-chip:hover {
      border-style: solid;
      border-color: var(--opus-accent);
      color: var(--opus-accent);
    }

    .ai-card,
    .ai-list {
      margin-block-start: 9px;
      border: 1px solid var(--opus-border);
      border-radius: var(--opus-radius-md);
      background: var(--opus-canvas);
      padding: 10px 12px;
    }

    /*
      The list of reasons scrolls; the card does not.

      Capping the card was the obvious way to stop a fourteen-widget plan pushing the canvas off screen,
      and it cut the Accept button in half — the one element that must never be the thing clipped. A
      proposal an author cannot accept without scrolling to find the button is a proposal they abandon.
    */
    .ai-list {
      max-block-size: 15rem;
      overflow-y: auto;
    }

    .ai-lines {
      max-block-size: 8.5rem;
      overflow-y: auto;
    }

    .ai-card[data-kind='declined'] {
      border-color: var(--opus-emphasis-negative);
    }

    .ai-card-h {
      display: flex;
      align-items: center;
      gap: var(--opus-space-2);
      font-size: var(--opus-text-md);
      color: var(--opus-text);
    }

    .ai-card-h .opus-icon {
      color: var(--opus-accent);
    }

    .ai-served {
      margin-inline-start: auto;
      font-size: var(--opus-text-xs);
      color: var(--opus-text-muted);
      font-family: var(--opus-font-mono);
    }

    .ai-summary {
      margin: 5px 0 0;
      font-size: var(--opus-text-sm);
      color: var(--opus-text-secondary);
      line-height: var(--opus-leading-normal);
      max-inline-size: 60rem;
    }

    .ai-lines {
      margin: 7px 0 0;
      padding-inline-start: 18px;
      font-size: var(--opus-text-sm);
      color: var(--opus-text-secondary);
    }

    .ai-lines li {
      margin-block-end: 2px;
    }

    .ai-note,
    .ai-dropped {
      margin: 7px 0 0;
      font-size: var(--opus-text-xs);
      color: var(--opus-text-muted);
      line-height: var(--opus-leading-normal);
    }

    .ai-dropped {
      display: grid;
      gap: 2px;
      padding: 6px 8px;
      border-inline-start: 2px solid var(--opus-emphasis-warning);
      background: var(--opus-emphasis-warning-bg);
      color: var(--opus-text-secondary);
    }

    .ai-actions {
      display: flex;
      align-items: center;
      gap: 7px;
      margin-block-start: 10px;
    }

    .ai-undo-hint {
      font-size: var(--opus-text-xs);
      color: var(--opus-text-muted);
    }

    .ai-none {
      margin: 0;
      font-size: var(--opus-text-sm);
      color: var(--opus-text-muted);
      line-height: var(--opus-leading-normal);
    }

    .ai-find {
      display: flex;
      align-items: center;
      gap: var(--opus-space-2);
      padding-block: 6px;
      border-block-end: 1px solid var(--opus-border);
    }

    .ai-find:last-child {
      border-block-end: 0;
    }

    .ai-dot {
      inline-size: 7px;
      block-size: 7px;
      border-radius: 50%;
      flex-shrink: 0;
      background: var(--opus-emphasis-warning);
    }

    .ai-find[data-severity='issue'] .ai-dot {
      background: var(--opus-emphasis-negative);
    }

    .ai-find-text {
      flex: 1;
      min-inline-size: 0;
      font-size: var(--opus-text-sm);
      color: var(--opus-text-secondary);
      line-height: var(--opus-leading-normal);
    }

    .ai-find-text b {
      color: var(--opus-text);
      margin-inline-end: 5px;
    }

    @media (max-width: 760px) {
      .ai {
        padding-inline: 12px;
      }

      .ai-find {
        flex-wrap: wrap;
      }
    }
  `,
})
export class AiPanelComponent {
  protected readonly ai = inject(PageBuilderAiService);
  protected readonly examples = EXAMPLES;

  readonly pages = input.required<readonly PageDef[]>();
  readonly pageId = input.required<string>();
  readonly selected = input<Widget | null>(null);
  readonly nextId = input.required<number>();

  readonly acceptEdits = output<{ edits: CanvasEdit[]; label: string }>();
  readonly acceptPage = output<AcceptedPage>();
  /** Take me to what this finding is about. */
  readonly reveal = output<Finding>();

  protected readonly text = signal('');
  protected readonly showReview = signal(false);
  protected readonly proposal = this.ai.proposal;

  protected readonly findings = computed(() => this.ai.findings(this.pages()));

  protected readonly placeholder = computed(() =>
    this.selected()
      ? 'Change the selected widget — "call it Coverage", "make it a bar chart", "make it wider"'
      : 'Describe a page, or an instruction for this one — "tidy up the layout", "add a table"',
  );

  protected reviewTitle(): string {
    const issues = this.findings().filter((finding) => finding.severity === 'issue').length;
    if (!this.findings().length) return 'The design review found nothing to flag';
    return `${issues} problem(s) and ${this.findings().length - issues} thing(s) to polish`;
  }

  protected async ask(): Promise<void> {
    const prompt = this.text().trim();
    if (!prompt) return;
    this.showReview.set(false);
    await this.ai.ask(prompt, this.context());
  }

  protected async askFor(example: string): Promise<void> {
    this.text.set(example);
    await this.ask();
  }

  protected fix(finding: Finding): void {
    this.showReview.set(false);
    this.ai.proposeFix(finding, this.context());
  }

  protected accept(answer: Proposal): void {
    if (answer.kind === 'page' && answer.page) {
      this.acceptPage.emit(answer.page);
    } else if (answer.kind === 'edits' && answer.edits) {
      this.acceptEdits.emit({ edits: answer.edits, label: label(answer) });
    }
    this.text.set('');
    this.ai.clear();
  }

  protected verb(answer: Proposal): string {
    const count = answer.edits?.length ?? 0;
    return count === 1 ? 'Make this change' : `Make these ${count} changes`;
  }

  protected heading(answer: Proposal): string {
    switch (answer.kind) {
      case 'page':
        return `New page: ${answer.page?.name ?? ''}`;
      case 'edits':
        return 'Proposed changes';
      case 'explain':
        return 'What this page does';
      case 'declined':
        return 'Not something I can do';
      default:
        return 'I need a bit more';
    }
  }

  protected iconFor(answer: Proposal): string {
    if (answer.kind === 'declined') return 'warning';
    if (answer.kind === 'explain') return 'document';
    if (answer.kind === 'question') return 'help';
    return 'sparkle';
  }

  private context() {
    return {
      pages: this.pages(),
      pageId: this.pageId(),
      selected: this.selected(),
      nextId: this.nextId(),
    };
  }
}

/** The undo entry's name. Short, and specific enough to recognise a minute later. */
function label(answer: Proposal): string {
  const count = answer.edits?.length ?? 0;
  const first = answer.edits?.[0];
  if (count === 1 && first) return `AI: ${first.op.replace('-', ' ')}`;
  return `AI: ${count} changes`;
}
