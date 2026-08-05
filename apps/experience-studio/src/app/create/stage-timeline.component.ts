/**
 * The generation pipeline, stage by stage.
 *
 * This panel is the app's best argument that the system is not a black box. Ten named stages, each
 * with a duration and a one-line summary, and the two that matter most are the ones a demo usually
 * hides: **retrieval** shows what the catalog offered and what it withheld, and **validate** shows
 * that the generated artifact went through the same validator the runtime uses.
 *
 * A user who can see "intake understood 5 concepts, retrieval kept 3 entities and dropped 2,
 * validation passed at levels 1-4 and 7" can judge whether the system understood them. A spinner
 * followed by a result cannot be judged at all.
 */

import { ChangeDetectionStrategy, Component, input } from '@angular/core';
import { MatIconModule } from '@angular/material/icon';
import { MatTooltipModule } from '@angular/material/tooltip';
import type { StageRecord } from '@opus/generation';

@Component({
  selector: 'opus-stage-timeline',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [MatIconModule, MatTooltipModule],
  template: `
    <ol class="stages">
      @for (stage of stages(); track $index) {
        <li [attr.data-status]="stage.status">
          <span class="dot" aria-hidden="true">
            <mat-icon inline>{{ icon(stage.status) }}</mat-icon>
          </span>
          <span class="body">
            <span class="head">
              <span class="name">{{ stage.stage }}</span>
              <span class="ms">{{ stage.durationMs }}ms</span>
            </span>
            <span class="summary">{{ stage.summary }}</span>
          </span>
        </li>
      } @empty {
        <li class="idle">
          <span class="dot" aria-hidden="true"><mat-icon inline>schedule</mat-icon></span>
          <span class="body">
            <span class="summary">
              intake → retrieval → context → plan → fill → assemble → validate → provenance
            </span>
          </span>
        </li>
      }
    </ol>
  `,
  styles: `
    :host {
      display: block;
    }

    .stages {
      margin: 0;
      padding: 0;
      list-style: none;
      display: flex;
      flex-direction: column;
    }

    li {
      display: grid;
      grid-template-columns: 22px 1fr;
      gap: 10px;
      padding: 7px 0;
      position: relative;
    }

    /* The connecting line makes it read as a pipeline rather than a list of events. */
    li:not(:last-child)::before {
      content: '';
      position: absolute;
      inset-inline-start: 10px;
      inset-block: 24px 0;
      inline-size: 1px;
      background: var(--mat-sys-outline-variant);
    }

    .dot {
      display: grid;
      place-items: center;
      inline-size: 22px;
      block-size: 22px;
      border-radius: 50%;
      background: var(--mat-sys-surface-container-highest);
      color: var(--mat-sys-on-surface-variant);
      font-size: 14px;
    }

    li[data-status='ok'] .dot {
      background: color-mix(in srgb, var(--mat-sys-primary) 18%, transparent);
      color: var(--mat-sys-primary);
    }

    li[data-status='warning'] .dot {
      background: color-mix(in srgb, #b26a00 22%, transparent);
      color: #b26a00;
    }

    li[data-status='failed'] .dot {
      background: color-mix(in srgb, var(--mat-sys-error) 18%, transparent);
      color: var(--mat-sys-error);
    }

    .body {
      min-inline-size: 0;
    }

    .head {
      display: flex;
      gap: 8px;
      align-items: baseline;
    }

    .name {
      font-size: 0.8rem;
      font-weight: 600;
      text-transform: capitalize;
    }

    .ms {
      font-size: 0.68rem;
      font-family: var(--opus-font-mono);
      opacity: 0.6;
    }

    .summary {
      display: block;
      font-size: 0.75rem;
      line-height: 1.45;
      opacity: 0.82;
      overflow-wrap: anywhere;
    }

    .idle .summary {
      font-family: var(--opus-font-mono);
      font-size: 0.68rem;
      opacity: 0.5;
    }
  `,
})
export class StageTimelineComponent {
  readonly stages = input<readonly StageRecord[]>([]);

  protected icon(status: StageRecord['status']): string {
    switch (status) {
      case 'ok':
        return 'check';
      case 'warning':
        return 'priority_high';
      case 'failed':
        return 'close';
      default:
        return 'remove';
    }
  }
}
