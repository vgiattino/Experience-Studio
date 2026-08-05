/**
 * analytics.chart
 *
 * One component type configured by an encoding model (mark + channel mappings)
 * rather than a family of near-duplicate chart components. That gives the AI a
 * compositional choice — pick a mark, map fields to channels — instead of a menu
 * of twenty similar components (architecture/frontend-architecture.md §3.4).
 *
 * Rendered as inline SVG with no charting dependency: full control of the palette
 * and of accessibility, and nothing to load from a CDN.
 */

import { NgTemplateOutlet } from '@angular/common';
import { ChangeDetectionStrategy, Component, computed, input, output } from '@angular/core';
import { StateShellComponent } from '@opus/design-system';
import {
  type ComponentActionEvent,
  type ComponentContext,
  type DataView,
  type EncodingBinding,
  type FieldBinding,
} from '@opus/contracts';

export type ChartMark = 'bar' | 'line' | 'area' | 'point';

export interface ChartConfig {
  mark?: ChartMark;
  stacking?: 'none' | 'stacked' | 'normalized';
  legend?: { position?: 'top' | 'bottom' | 'end' | 'none' };
  gridlines?: boolean;
  emptyMessage?: string;
}

interface Series {
  key: string;
  label: string;
  colorIndex: number;
}

interface Segment {
  seriesKey: string;
  xKey: string;
  value: number;
  x: number;
  y: number;
  width: number;
  height: number;
  colorIndex: number;
}

const PALETTE_SIZE = 6;
const PLOT = { top: 12, right: 12, bottom: 34, left: 52 };
const VIEW = { width: 720, height: 260 };

@Component({
  selector: 'opus-chart',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [StateShellComponent, NgTemplateOutlet],
  template: `
    <opus-state-shell
      [state]="data().state"
      [label]="title()"
      [skeleton]="'chart'"
      [title]="stateTitle()"
      [message]="stateMessage() || config().emptyMessage || ''"
      (retry)="emit('retryRequested', {})"
    >
      <figure class="chart">
        @if (legendPosition() === 'top') {
          <ng-container [ngTemplateOutlet]="legendTpl" />
        }

        <svg
          [attr.viewBox]="'0 0 ' + view.width + ' ' + view.height"
          preserveAspectRatio="none"
          role="img"
          [attr.aria-label]="ariaLabel()"
        >
          <!-- gridlines and y axis -->
          @for (tick of yTicks(); track tick.value) {
            @if (config().gridlines !== false) {
              <line
                class="gridline"
                [attr.x1]="plot.left"
                [attr.x2]="view.width - plot.right"
                [attr.y1]="tick.y"
                [attr.y2]="tick.y"
              />
            }
            <text class="axis-label" [attr.x]="plot.left - 8" [attr.y]="tick.y + 4" text-anchor="end">
              {{ tick.label }}
            </text>
          }

          <!-- x axis -->
          <line
            class="axis"
            [attr.x1]="plot.left"
            [attr.x2]="view.width - plot.right"
            [attr.y1]="view.height - plot.bottom"
            [attr.y2]="view.height - plot.bottom"
          />
          @for (tick of xTicks(); track tick.key) {
            <text
              class="axis-label"
              [attr.x]="tick.x"
              [attr.y]="view.height - plot.bottom + 16"
              text-anchor="middle"
            >
              {{ tick.label }}
            </text>
          }

          <!-- marks -->
          @if (mark() === 'bar') {
            @for (seg of segments(); track seg.seriesKey + seg.xKey) {
              <rect
                class="bar"
                [attr.data-color]="seg.colorIndex"
                [attr.x]="seg.x"
                [attr.y]="seg.y"
                [attr.width]="seg.width"
                [attr.height]="seg.height"
                [attr.tabindex]="interactive() ? 0 : null"
                [attr.role]="interactive() ? 'button' : null"
                [attr.aria-label]="segmentLabel(seg)"
                (click)="activateSegment(seg)"
                (keydown.enter)="activateSegment(seg)"
              >
                <title>{{ segmentLabel(seg) }}</title>
              </rect>
            }
          } @else {
            @for (line of linePaths(); track line.seriesKey) {
              @if (mark() === 'area') {
                <path class="area" [attr.data-color]="line.colorIndex" [attr.d]="line.areaPath" />
              }
              @if (mark() !== 'point') {
                <path class="line" [attr.data-color]="line.colorIndex" [attr.d]="line.linePath" />
              }
              @for (pt of line.points; track pt.xKey) {
                <circle
                  class="point"
                  [attr.data-color]="line.colorIndex"
                  [attr.cx]="pt.x"
                  [attr.cy]="pt.y"
                  r="3.5"
                  [attr.tabindex]="interactive() ? 0 : null"
                  [attr.role]="interactive() ? 'button' : null"
                  (click)="activateSegment(pt)"
                  (keydown.enter)="activateSegment(pt)"
                >
                  <title>{{ segmentLabel(pt) }}</title>
                </circle>
              }
            }
          }
        </svg>

        @if (legendPosition() === 'bottom') {
          <ng-container [ngTemplateOutlet]="legendTpl" />
        }

        <!-- A data table equivalent, available to assistive technology. -->
        <figcaption class="sr-only">
          <table>
            <caption>
              {{ title() }}
            </caption>
            <tbody>
              @for (seg of segments(); track seg.seriesKey + seg.xKey) {
                <tr>
                  <th scope="row">{{ seg.xKey }} — {{ seriesLabel(seg.seriesKey) }}</th>
                  <td>{{ formatValue(seg.value) }}</td>
                </tr>
              }
            </tbody>
          </table>
        </figcaption>
      </figure>

      <ng-template #legendTpl>
        @if (series().length > 1) {
          <ul class="legend">
            @for (s of series(); track s.key) {
              <li>
                <span class="swatch" [attr.data-color]="s.colorIndex" aria-hidden="true"></span>
                {{ s.label }}
              </li>
            }
          </ul>
        }
      </ng-template>
    </opus-state-shell>
  `,
  styles: `
    :host {
      display: block;
      block-size: 100%;
      container-type: inline-size;
    }

    .chart {
      display: flex;
      flex-direction: column;
      gap: var(--opus-space-2);
      block-size: 100%;
      margin: 0;
    }

    svg {
      inline-size: 100%;
      flex: 1;
      min-block-size: 180px;
      overflow: visible;
    }

    .sr-only {
      position: absolute;
      inline-size: 1px;
      block-size: 1px;
      overflow: hidden;
      clip-path: inset(50%);
      white-space: nowrap;
    }

    .gridline {
      stroke: var(--opus-chart-grid);
      stroke-width: 1;
    }

    .axis {
      stroke: var(--opus-chart-axis);
      stroke-width: 1;
    }

    .axis-label {
      fill: var(--opus-chart-axis);
      font-size: 11px;
      font-family: var(--opus-font-sans);
    }

    .bar {
      transition: opacity var(--opus-duration-fast) var(--opus-easing);
    }

    .bar[role='button'],
    .point[role='button'] {
      cursor: pointer;
    }

    .bar:hover {
      opacity: 0.82;
    }

    .bar:focus-visible,
    .point:focus-visible {
      outline: 2px solid var(--opus-focus-ring);
      outline-offset: 1px;
    }

    .line {
      fill: none;
      stroke-width: 2;
    }

    .area {
      opacity: 0.16;
      stroke: none;
    }

    [data-color='0'] {
      fill: var(--opus-chart-1);
      stroke: var(--opus-chart-1);
    }
    [data-color='1'] {
      fill: var(--opus-chart-2);
      stroke: var(--opus-chart-2);
    }
    [data-color='2'] {
      fill: var(--opus-chart-3);
      stroke: var(--opus-chart-3);
    }
    [data-color='3'] {
      fill: var(--opus-chart-4);
      stroke: var(--opus-chart-4);
    }
    [data-color='4'] {
      fill: var(--opus-chart-5);
      stroke: var(--opus-chart-5);
    }
    [data-color='5'] {
      fill: var(--opus-chart-6);
      stroke: var(--opus-chart-6);
    }

    .legend {
      display: flex;
      flex-wrap: wrap;
      gap: var(--opus-space-2) var(--opus-space-4);
      margin: 0;
      padding: 0;
      list-style: none;
      font-size: var(--opus-text-xs);
      color: var(--opus-text-secondary);
    }

    .legend li {
      display: flex;
      align-items: center;
      gap: var(--opus-space-1);
    }

    .swatch {
      inline-size: 0.625rem;
      block-size: 0.625rem;
      border-radius: 2px;
    }
  `,
})
export class ChartComponent {
  readonly config = input<ChartConfig>({});
  readonly data = input.required<DataView>();
  readonly context = input.required<ComponentContext>();
  readonly title = input<string>('');
  readonly encodings = input<readonly EncodingBinding[]>([]);
  readonly stateTitle = input<string>('');
  readonly stateMessage = input<string>('');

  readonly action = output<ComponentActionEvent>();

  protected readonly view = VIEW;
  protected readonly plot = PLOT;

  protected readonly mark = computed<ChartMark>(() => this.config().mark ?? 'bar');
  protected readonly legendPosition = computed(() => this.config().legend?.position ?? 'bottom');
  protected readonly interactive = computed(() => this.data().state === 'ready');

  private readonly encodingFor = (channel: string): EncodingBinding | undefined =>
    this.encodings().find((e) => e.channel === channel);

  private readonly xBinding = computed(() => this.encodingFor('x')?.binding);
  private readonly yBinding = computed(() => this.encodingFor('y')?.binding);
  private readonly seriesBinding = computed(() => this.encodingFor('series')?.binding);

  /** Distinct x values in first-seen order — the data source is responsible for sorting. */
  private readonly xKeys = computed<string[]>(() => {
    const field = this.xBinding()?.field;
    if (!field) return [];
    const seen: string[] = [];
    for (const row of this.data().rows) {
      const key = String(row[field] ?? '');
      if (!seen.includes(key)) seen.push(key);
    }
    return seen;
  });

  protected readonly series = computed<Series[]>(() => {
    const field = this.seriesBinding()?.field;
    if (!field) {
      const label = this.yBinding() ? labelOf(this.yBinding()!) : 'Value';
      return [{ key: '__single', label, colorIndex: 0 }];
    }
    const keys: string[] = [];
    for (const row of this.data().rows) {
      const key = String(row[field] ?? '');
      if (!keys.includes(key)) keys.push(key);
    }
    return keys.map((key, i) => ({ key, label: key, colorIndex: i % PALETTE_SIZE }));
  });

  /** value[seriesKey][xKey] */
  private readonly matrix = computed<Record<string, Record<string, number>>>(() => {
    const xField = this.xBinding()?.field;
    const yField = this.yBinding()?.field;
    const sField = this.seriesBinding()?.field;
    const out: Record<string, Record<string, number>> = {};
    if (!xField || !yField) return out;

    for (const row of this.data().rows) {
      const xKey = String(row[xField] ?? '');
      const sKey = sField ? String(row[sField] ?? '') : '__single';
      const value = Number(row[yField]);
      if (!Number.isFinite(value)) continue;
      out[sKey] ??= {};
      out[sKey]![xKey] = (out[sKey]![xKey] ?? 0) + value;
    }
    return out;
  });

  private readonly yMax = computed(() => {
    const stacked = this.config().stacking === 'stacked' || this.config().stacking === 'normalized';
    const matrix = this.matrix();
    let max = 0;
    for (const xKey of this.xKeys()) {
      if (stacked) {
        const total = this.series().reduce((sum, s) => sum + (matrix[s.key]?.[xKey] ?? 0), 0);
        max = Math.max(max, total);
      } else {
        for (const s of this.series()) max = Math.max(max, matrix[s.key]?.[xKey] ?? 0);
      }
    }
    const declaredMax = this.encodingFor('y')?.scale?.max;
    if (typeof declaredMax === 'number') return declaredMax;
    return niceCeiling(max);
  });

  private readonly plotWidth = computed(() => VIEW.width - PLOT.left - PLOT.right);
  private readonly plotHeight = computed(() => VIEW.height - PLOT.top - PLOT.bottom);

  private readonly yScale = (value: number): number => {
    const max = this.yMax() || 1;
    return PLOT.top + this.plotHeight() * (1 - value / max);
  };

  protected readonly yTicks = computed(() => {
    const max = this.yMax() || 1;
    const count = 4;
    return Array.from({ length: count + 1 }, (_, i) => {
      const value = (max / count) * i;
      return { value, y: this.yScale(value), label: this.formatValue(value) };
    });
  });

  protected readonly xTicks = computed(() => {
    const keys = this.xKeys();
    const band = this.plotWidth() / Math.max(keys.length, 1);
    // Thin labels so they never overlap at narrow widths.
    const stride = Math.ceil((keys.length * 52) / Math.max(this.plotWidth(), 1));
    return keys
      .map((key, i) => ({
        key,
        x: PLOT.left + band * i + band / 2,
        label: this.formatX(key),
        index: i,
      }))
      .filter((t) => t.index % Math.max(stride, 1) === 0);
  });

  protected readonly segments = computed<Segment[]>(() => {
    const keys = this.xKeys();
    const series = this.series();
    const matrix = this.matrix();
    const stacked = this.config().stacking === 'stacked' || this.config().stacking === 'normalized';
    const band = this.plotWidth() / Math.max(keys.length, 1);
    const inner = band * 0.72;
    const out: Segment[] = [];

    keys.forEach((xKey, xi) => {
      const bandStart = PLOT.left + band * xi + (band - inner) / 2;
      let stackTop = this.yScale(0);

      series.forEach((s, si) => {
        const value = matrix[s.key]?.[xKey];
        if (value === undefined) return;

        if (stacked) {
          const height = this.plotHeight() * (value / (this.yMax() || 1));
          stackTop -= height;
          out.push({
            seriesKey: s.key,
            xKey,
            value,
            x: bandStart,
            y: stackTop,
            width: inner,
            height: Math.max(height, 0),
            colorIndex: s.colorIndex,
          });
        } else {
          const groupWidth = inner / series.length;
          const y = this.yScale(value);
          out.push({
            seriesKey: s.key,
            xKey,
            value,
            x: bandStart + groupWidth * si,
            y,
            width: groupWidth - 1,
            height: Math.max(this.yScale(0) - y, 0),
            colorIndex: s.colorIndex,
          });
        }
      });
    });

    return out;
  });

  protected readonly linePaths = computed(() => {
    const keys = this.xKeys();
    const matrix = this.matrix();
    const band = this.plotWidth() / Math.max(keys.length, 1);
    const baseline = this.yScale(0);

    return this.series().map((s) => {
      const points = keys
        .map((xKey, i) => {
          const value = matrix[s.key]?.[xKey];
          if (value === undefined) return null;
          return {
            seriesKey: s.key,
            xKey,
            value,
            x: PLOT.left + band * i + band / 2,
            y: this.yScale(value),
            width: 0,
            height: 0,
            colorIndex: s.colorIndex,
          } satisfies Segment;
        })
        .filter((p): p is Segment => p !== null);

      const linePath = points.map((p, i) => `${i === 0 ? 'M' : 'L'}${p.x},${p.y}`).join(' ');
      const areaPath = points.length
        ? `${linePath} L${points.at(-1)!.x},${baseline} L${points[0]!.x},${baseline} Z`
        : '';

      return { seriesKey: s.key, colorIndex: s.colorIndex, points, linePath, areaPath };
    });
  });

  protected readonly ariaLabel = computed(() => {
    const seriesNames = this.series().map((s) => s.label).join(', ');
    return `${this.title() || 'Chart'}: ${this.mark()} chart of ${seriesNames} across ${this.xKeys().length} categories. A data table equivalent follows.`;
  });

  protected formatValue(value: number): string {
    return this.context().format(value, this.yBinding() as FieldBinding | undefined);
  }

  protected formatX(key: string): string {
    const binding = this.xBinding();
    const tickFormat = this.encodingFor('x')?.axis?.tickFormat;
    if (tickFormat) return this.context().format(key, { field: binding?.field ?? 'x', format: tickFormat });
    return this.context().format(key, binding);
  }

  protected seriesLabel(key: string): string {
    return this.series().find((s) => s.key === key)?.label ?? key;
  }

  protected segmentLabel(seg: Segment): string {
    const series = this.series().length > 1 ? `${this.seriesLabel(seg.seriesKey)}, ` : '';
    return `${series}${this.formatX(seg.xKey)}: ${this.formatValue(seg.value)}`;
  }

  protected activateSegment(seg: Segment): void {
    if (!this.interactive()) return;
    this.emit('segmentActivated', {
      series: seg.seriesKey === '__single' ? null : seg.seriesKey,
      x: seg.xKey,
      value: seg.value,
    });
  }

  protected emit(event: string, payload: Record<string, unknown>): void {
    this.action.emit({ event, payload });
  }
}

function labelOf(binding: FieldBinding): string {
  if (typeof binding.label === 'string') return binding.label;
  if (binding.label) return binding.label.default;
  return binding.field;
}

/** Round an axis maximum up to a readable value so ticks land on whole numbers. */
function niceCeiling(max: number): number {
  if (max <= 0) return 1;
  const magnitude = 10 ** Math.floor(Math.log10(max));
  const normalized = max / magnitude;
  const step = normalized <= 1 ? 1 : normalized <= 2 ? 2 : normalized <= 5 ? 5 : 10;
  return step * magnitude;
}
