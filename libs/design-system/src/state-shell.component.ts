/**
 * The six mandated widget states (architecture/frontend-architecture.md §3.5).
 *
 * Mandated at the design-system tier rather than left to each component, because
 * of who authors pages: a human developer notices the missing empty state when
 * they see it, whereas a generated page has no such moment. Providing the six
 * states here is what makes every generated page complete by construction.
 *
 * `denied` is deliberately distinct from `error`: a user lacking entitlement is a
 * normal, expected outcome in a governed platform and must read as "not available
 * to you", not as a fault.
 */

import { ChangeDetectionStrategy, Component, computed, input, output } from '@angular/core';
import type { SkeletonShape, WidgetStateName } from '@opus/contracts';

@Component({
  selector: 'opus-state-shell',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { '[attr.data-state]': 'state()' },
  template: `
    <!--
      IMPORTANT — Angular cannot project <ng-content> into an embedded view, so
      putting it inside @if / @switch silently renders nothing. The projected
      widget content is therefore always instantiated and toggled with CSS, while
      the state presentations are the parts under control flow.
    -->
    @if (state() === 'partial') {
      <div class="partial-banner" role="status">
        <span class="icon" aria-hidden="true">◐</span>
        <span>{{ message() || 'Some information is not available to you.' }}</span>
      </div>
    }

    <div class="projected" [attr.data-hidden]="!showsContent()">
      <ng-content />
    </div>

    @if (state() === 'loading') {
      <div class="skeleton" [attr.data-shape]="skeleton()" aria-busy="true" role="status">
        <span class="sr-only">Loading {{ label() }}</span>
        @switch (skeleton()) {
          @case ('table') {
            @for (row of skeletonRows(); track $index) {
              <div class="bar" [style.width.%]="row"></div>
            }
          }
          @case ('chart') {
            <div class="chart-bars">
              @for (h of skeletonBars(); track $index) {
                <div class="chart-bar" [style.height.%]="h"></div>
              }
            </div>
          }
          @default {
            <div class="bar tall"></div>
            <div class="bar short"></div>
          }
        }
      </div>
    } @else if (!showsContent()) {
      <div class="state" [attr.data-kind]="state()" role="status">
        <span class="state-icon" aria-hidden="true">{{ icon() || defaultIcon() }}</span>
        <p class="state-title">{{ title() || defaultTitle() }}</p>
        @if (message() || defaultMessage()) {
          <p class="state-message">{{ message() || defaultMessage() }}</p>
        }
        @if (state() === 'error' && retryable()) {
          <button type="button" class="state-action" (click)="retry.emit()">Retry</button>
        }
      </div>
    }
  `,
  styles: `
    :host {
      display: block;
      block-size: 100%;
      container-type: inline-size;
    }

    .projected {
      display: contents;
    }

    /* Hidden rather than removed: see the note in the template. */
    .projected[data-hidden='true'] {
      display: none;
    }

    .sr-only {
      position: absolute;
      inline-size: 1px;
      block-size: 1px;
      overflow: hidden;
      clip-path: inset(50%);
      white-space: nowrap;
    }

    .state {
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      gap: var(--opus-space-2);
      min-block-size: 120px;
      block-size: 100%;
      padding: var(--opus-space-5);
      text-align: center;
      color: var(--opus-text-secondary);
    }

    .state-icon {
      font-size: 1.5rem;
      line-height: 1;
      color: var(--opus-text-muted);
    }

    .state[data-kind='error'] .state-icon {
      color: var(--opus-emphasis-negative);
    }

    .state[data-kind='denied'] .state-icon {
      color: var(--opus-emphasis-muted);
    }

    .state-title {
      margin: 0;
      font-size: var(--opus-text-md);
      font-weight: var(--opus-weight-medium);
      color: var(--opus-text);
    }

    .state-message {
      margin: 0;
      max-inline-size: 42ch;
      font-size: var(--opus-text-sm);
      color: var(--opus-text-secondary);
    }

    .state-action {
      margin-block-start: var(--opus-space-2);
      padding: var(--opus-space-1) var(--opus-space-4);
      font: inherit;
      font-size: var(--opus-text-sm);
      color: var(--opus-text);
      background: var(--opus-surface);
      border: 1px solid var(--opus-border-strong);
      border-radius: var(--opus-radius-sm);
      cursor: pointer;
    }

    .state-action:hover {
      background: var(--opus-surface-hover);
    }

    .state-action:focus-visible {
      outline: 2px solid var(--opus-focus-ring);
      outline-offset: 2px;
    }

    .partial-banner {
      display: flex;
      align-items: center;
      gap: var(--opus-space-2);
      padding: var(--opus-space-2) var(--opus-space-3);
      margin-block-end: var(--opus-space-2);
      font-size: var(--opus-text-sm);
      color: var(--opus-emphasis-warning);
      background: var(--opus-emphasis-warning-bg);
      border-radius: var(--opus-radius-sm);
    }

    .skeleton {
      display: flex;
      flex-direction: column;
      gap: var(--opus-space-2);
      padding: var(--opus-space-4);
      block-size: 100%;
    }

    .bar {
      block-size: 0.75rem;
      background: linear-gradient(
        90deg,
        var(--opus-surface-sunken) 25%,
        var(--opus-surface-hover) 50%,
        var(--opus-surface-sunken) 75%
      );
      background-size: 200% 100%;
      border-radius: var(--opus-radius-sm);
      animation: shimmer 1.4s var(--opus-easing) infinite;
    }

    .bar.tall {
      block-size: 2rem;
      inline-size: 60%;
    }

    .bar.short {
      inline-size: 35%;
    }

    .chart-bars {
      display: flex;
      align-items: flex-end;
      gap: var(--opus-space-2);
      block-size: 100%;
      min-block-size: 140px;
    }

    .chart-bar {
      flex: 1;
      background: var(--opus-surface-sunken);
      border-radius: var(--opus-radius-sm) var(--opus-radius-sm) 0 0;
      animation: shimmer 1.4s var(--opus-easing) infinite;
    }

    @keyframes shimmer {
      0% {
        background-position: 200% 0;
        opacity: 0.7;
      }
      100% {
        background-position: -200% 0;
        opacity: 1;
      }
    }

    @media (prefers-reduced-motion: reduce) {
      .bar,
      .chart-bar {
        animation: none;
      }
    }
  `,
})
export class StateShellComponent {
  readonly state = input.required<WidgetStateName>();
  readonly label = input<string>('');
  readonly title = input<string>('');
  readonly message = input<string>('');
  readonly icon = input<string>('');
  readonly skeleton = input<SkeletonShape>('block');
  readonly retryable = input<boolean>(true);

  readonly retry = output<void>();

  /** The projected widget renders for `ready` and, above a banner, for `partial`. */
  protected readonly showsContent = computed(
    () => this.state() === 'ready' || this.state() === 'partial',
  );

  protected readonly skeletonRows = computed(() => [92, 78, 85, 70, 88]);
  protected readonly skeletonBars = computed(() => [45, 70, 35, 85, 55, 65]);

  protected readonly defaultIcon = computed(() => {
    switch (this.state()) {
      case 'empty':
        return '○';
      case 'error':
        return '!';
      case 'denied':
        return '🔒';
      default:
        return '·';
    }
  });

  protected readonly defaultTitle = computed(() => {
    switch (this.state()) {
      case 'empty':
        return 'No data';
      case 'error':
        return 'Could not load';
      case 'denied':
        return 'Not available to you';
      default:
        return '';
    }
  });

  protected readonly defaultMessage = computed(() => {
    switch (this.state()) {
      case 'empty':
        return 'Nothing matches the current filters.';
      case 'error':
        return 'Something went wrong loading this content.';
      case 'denied':
        return 'Your entitlements do not include this information.';
      default:
        return '';
    }
  });
}
