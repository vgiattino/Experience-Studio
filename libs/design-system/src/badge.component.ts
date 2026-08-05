import { ChangeDetectionStrategy, Component, input } from '@angular/core';
import type { Emphasis } from '@opus/contracts';

/**
 * Semantic badge. Takes an `emphasis`, never a colour — see tokens.scss.
 * Meaning is never conveyed by colour alone: the label text always carries it,
 * which is what keeps generated content WCAG-conformant without review.
 */
@Component({
  selector: 'opus-badge',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `<span class="badge" [attr.data-emphasis]="emphasis()">{{ label() }}</span>`,
  styles: `
    .badge {
      display: inline-flex;
      align-items: center;
      padding: 0.125rem var(--opus-space-2);
      font-size: var(--opus-text-xs);
      font-weight: var(--opus-weight-medium);
      line-height: 1.4;
      white-space: nowrap;
      border-radius: var(--opus-radius-sm);
      color: var(--opus-emphasis-neutral);
      background: var(--opus-emphasis-neutral-bg);
    }

    .badge[data-emphasis='positive'] {
      color: var(--opus-emphasis-positive);
      background: var(--opus-emphasis-positive-bg);
    }

    .badge[data-emphasis='warning'] {
      color: var(--opus-emphasis-warning);
      background: var(--opus-emphasis-warning-bg);
    }

    .badge[data-emphasis='negative'] {
      color: var(--opus-emphasis-negative);
      background: var(--opus-emphasis-negative-bg);
    }

    .badge[data-emphasis='info'] {
      color: var(--opus-emphasis-info);
      background: var(--opus-emphasis-info-bg);
    }

    .badge[data-emphasis='muted'] {
      color: var(--opus-emphasis-muted);
      background: var(--opus-emphasis-muted-bg);
    }
  `,
})
export class BadgeComponent {
  readonly label = input.required<string>();
  readonly emphasis = input<Emphasis>('neutral');
}
