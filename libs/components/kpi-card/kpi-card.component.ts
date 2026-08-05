/**
 * analytics.kpi-card
 *
 * Contract rules this component obeys, and every renderable component must
 * (architecture/frontend-architecture.md §3.1):
 *   - no service injection for data or navigation
 *   - no cross-component knowledge
 *   - interaction leaves as an `action` output; the page decides what it means
 */

import { ChangeDetectionStrategy, Component, computed, input, output } from '@angular/core';
import { StateShellComponent } from '@opus/design-system';
import { resolveThreshold } from '@opus/platform';
import {
  type ComponentActionEvent,
  type ComponentContext,
  type DataView,
  type Emphasis,
  type FieldBinding,
  type Threshold,
} from '@opus/contracts';

export interface KpiCardConfig {
  size?: 'sm' | 'md' | 'lg';
  showThresholdBand?: boolean;
  showTrendArrow?: boolean;
  comparisonLabel?: string;
  alignment?: 'start' | 'center';
}

@Component({
  selector: 'opus-kpi-card',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [StateShellComponent],
  template: `
    <opus-state-shell
      [state]="data().state"
      [label]="title()"
      [skeleton]="'tile'"
      [title]="stateTitle()"
      [message]="stateMessage()"
      (retry)="emit('retryRequested', {})"
    >
      <div
        class="kpi"
        [attr.data-size]="config().size ?? 'md'"
        [attr.data-align]="config().alignment ?? 'start'"
        [attr.data-emphasis]="emphasis()"
        [attr.role]="interactive() ? 'button' : null"
        [attr.tabindex]="interactive() ? 0 : null"
        [attr.aria-label]="ariaLabel()"
        (click)="activate()"
        (keydown.enter)="activate()"
        (keydown.space)="activate()"
      >
        <p class="kpi-title">{{ title() }}</p>
        <p class="kpi-value">{{ formattedValue() }}</p>

        @if (band(); as b) {
          <p class="kpi-band">
            <span class="band-dot" aria-hidden="true"></span>{{ bandLabel(b) }}
          </p>
        }

        @if (comparison(); as c) {
          <p class="kpi-comparison">
            @if (config().showTrendArrow) {
              <span class="trend" aria-hidden="true">{{ trendGlyph() }}</span>
            }
            <span>{{ c }}</span>
            @if (config().comparisonLabel) {
              <span class="comparison-label">{{ config().comparisonLabel }}</span>
            }
          </p>
        }
      </div>
    </opus-state-shell>
  `,
  styles: `
    /* The card frame lives on the host, not on the ready-state content, so the
       loading, empty, error and denied states are framed identically. */
    :host {
      display: block;
      block-size: 100%;
      container-type: inline-size;
      background: var(--opus-surface);
      border: 1px solid var(--opus-border);
      border-radius: var(--opus-radius-md);
    }

    .kpi {
      display: flex;
      flex-direction: column;
      gap: var(--opus-space-1);
      block-size: 100%;
      padding: var(--opus-space-4);
    }

    .kpi[data-align='center'] {
      align-items: center;
      text-align: center;
    }

    .kpi[role='button'] {
      cursor: pointer;
      transition: border-color var(--opus-duration-fast) var(--opus-easing);
    }

    :host:has(.kpi[role='button']:hover) {
      border-color: var(--opus-border-strong);
      background: var(--opus-surface-hover);
    }

    .kpi[role='button']:focus-visible {
      outline: 2px solid var(--opus-focus-ring);
      outline-offset: 2px;
    }

    .kpi-title {
      margin: 0;
      font-size: var(--opus-text-sm);
      font-weight: var(--opus-weight-medium);
      color: var(--opus-text-secondary);
    }

    .kpi-value {
      margin: 0;
      font-size: var(--opus-text-2xl);
      font-weight: var(--opus-weight-semibold);
      line-height: var(--opus-leading-tight);
      font-variant-numeric: tabular-nums;
      color: var(--opus-text);
    }

    .kpi[data-size='sm'] .kpi-value {
      font-size: var(--opus-text-xl);
    }

    .kpi[data-size='lg'] .kpi-value {
      font-size: var(--opus-text-3xl);
    }

    .kpi[data-emphasis='positive'] .kpi-value {
      color: var(--opus-emphasis-positive);
    }

    .kpi[data-emphasis='warning'] .kpi-value {
      color: var(--opus-emphasis-warning);
    }

    .kpi[data-emphasis='negative'] .kpi-value {
      color: var(--opus-emphasis-negative);
    }

    .kpi-band,
    .kpi-comparison {
      display: flex;
      align-items: center;
      gap: var(--opus-space-1);
      margin: 0;
      font-size: var(--opus-text-xs);
      color: var(--opus-text-secondary);
    }

    /* Threshold state is carried by text as well as by the dot, never colour alone. */
    .band-dot {
      inline-size: 0.5rem;
      block-size: 0.5rem;
      border-radius: 50%;
      background: currentcolor;
    }

    .kpi[data-emphasis='positive'] .kpi-band {
      color: var(--opus-emphasis-positive);
    }

    .kpi[data-emphasis='warning'] .kpi-band {
      color: var(--opus-emphasis-warning);
    }

    .kpi[data-emphasis='negative'] .kpi-band {
      color: var(--opus-emphasis-negative);
    }

    .comparison-label {
      color: var(--opus-text-muted);
    }

    /* Below ~180px of available width, suppress secondary lines rather than crowd. */
    @container (max-width: 180px) {
      .kpi-comparison,
      .kpi-band {
        display: none;
      }
    }
  `,
})
export class KpiCardComponent {
  readonly config = input<KpiCardConfig>({});
  readonly data = input.required<DataView>();
  readonly context = input.required<ComponentContext>();
  readonly title = input<string>('');
  readonly bindings = input<Record<string, FieldBinding | readonly FieldBinding[]>>({});
  readonly stateTitle = input<string>('');
  readonly stateMessage = input<string>('');

  readonly action = output<ComponentActionEvent>();

  private readonly valueBinding = computed<FieldBinding | undefined>(() => {
    const b = this.bindings()['value'];
    return Array.isArray(b) ? b[0] : (b as FieldBinding | undefined);
  });

  private readonly comparisonBinding = computed<FieldBinding | undefined>(() => {
    const b = this.bindings()['comparison'];
    return Array.isArray(b) ? b[0] : (b as FieldBinding | undefined);
  });

  private readonly row = computed(() => this.data().rows[0]);

  private readonly rawValue = computed<unknown>(() => {
    const field = this.valueBinding()?.field;
    if (!field) return null;
    return this.row()?.[field] ?? null;
  });

  protected readonly formattedValue = computed(() =>
    this.context().format(this.rawValue(), this.valueBinding(), this.row()),
  );

  protected readonly comparison = computed(() => {
    const binding = this.comparisonBinding();
    if (!binding) return null;
    const value = this.row()?.[binding.field];
    if (value === null || value === undefined) return null;
    return this.context().format(value, binding, this.row());
  });

  protected readonly band = computed<Threshold | undefined>(() => {
    if (!this.config().showThresholdBand) return undefined;
    return resolveThreshold(this.rawValue(), this.valueBinding()?.thresholds);
  });

  protected readonly emphasis = computed<Emphasis>(() => {
    const band = this.band();
    if (band) return band.emphasis;
    // Conditional formats are evaluated in the row scope, like everywhere else.
    for (const cf of this.valueBinding()?.conditionalFormats ?? []) {
      if (this.context().evaluate(cf.when.$expr, { row: this.row() })) return cf.emphasis;
    }
    return 'neutral';
  });

  protected readonly trendGlyph = computed(() => {
    const binding = this.comparisonBinding();
    if (!binding) return '';
    const current = Number(this.rawValue());
    const previous = Number(this.row()?.[binding.field]);
    if (!Number.isFinite(current) || !Number.isFinite(previous) || current === previous) return '→';
    return current > previous ? '↑' : '↓';
  });

  protected readonly interactive = computed(() => this.data().state === 'ready');

  protected readonly ariaLabel = computed(
    () => `${this.title()}: ${this.formattedValue()}${this.band() ? `, ${this.bandLabel(this.band()!)}` : ''}`,
  );

  protected bandLabel(band: Threshold): string {
    if (typeof band.label === 'string') return band.label;
    if (band.label) return band.label.default;
    return band.id;
  }

  protected activate(): void {
    if (!this.interactive()) return;
    this.emit('activated', { value: this.rawValue() });
  }

  protected emit(event: string, payload: Record<string, unknown>): void {
    this.action.emit({ event, payload });
  }
}
