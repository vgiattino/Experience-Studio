/**
 * One widget, rendered.
 *
 * Split out from the builder shell because the shell is about *arranging* widgets and this is about
 * *drawing* them — and the switch over twenty types is long enough that having it inside the canvas
 * made the drag logic hard to find.
 *
 * ── THE CHARTS ARE INLINE SVG, NOT KENDO ──────────────────────────────────────────────
 * The original binds `@progress/kendo-angular-charts` through a wrapper component. Experience Studio
 * has no Kendo dependency and should not gain 16 packages and a licence to draw six chart kinds of
 * literal arrays. So column, bar, line, area, pie and donut are drawn here — about 60 lines of SVG,
 * theme-aware because the axes and gridlines are tokens.
 *
 * What that costs is honest to state: no tooltips, no animation, no legend interaction, and the
 * original's spline, funnel, radar, waterfall and scatter kinds are not offered. A page that needs
 * real charting has the platform's own `analytics.chart` component, which is bound to a governed data
 * source rather than to an array typed into an inspector.
 */

import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import { IconComponent } from '@opus/design-system';

import { CONTROL_TYPES, type Segment, type Widget } from './model';
import type { Resolved } from './data/data.service';

/** A slice of a pie or donut, pre-computed as an SVG path. */
interface Slice {
  path: string;
  color: string;
  label: string;
  percent: number;
}

@Component({
  selector: 'opus-pb-widget',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [IconComponent],
  template: `
    @switch (widget().type) {
      @case ('heading') {
        <div class="pb-heading" [attr.data-level]="str('level', '2')">{{ str('text') }}</div>
      }
      @case ('text') {
        <p class="pb-text" [style.text-align]="str('align', 'left')" [class.muted]="bool('muted')">
          {{ str('text') }}
        </p>
      }
      @case ('divider') {
        <div class="pb-divider"><span [class.spacer]="bool('spacer')"></span></div>
      }
      @case ('image') {
        @if (str('url')) {
          <img class="pb-img" [src]="str('url')" [alt]="str('caption')" />
        } @else {
          <div class="pb-placeholder">
            <opus-icon name="library" [size]="26" />
            <span>{{ str('caption', 'Image') }}</span>
          </div>
        }
      }
      @case ('kpi') {
        <div class="pb-kpi">
          <span class="label">
            {{ str('label') }}
            @if (badge()) {
              <span class="pb-live" [attr.data-tone]="tone()">{{ badge() }}</span>
            }
          </span>
          <span class="value" [style.color]="raw('accent')">{{ figure() }}</span>
          @if (problem()) {
            <span class="pb-problem">{{ problem() }}</span>
          } @else {
            <span class="delta" [attr.data-dir]="str('dir', 'flat')">
              @if (str('dir', 'flat') !== 'flat') {
                <opus-icon [name]="str('dir', 'flat') === 'up' ? 'chevron-up' : 'chevron-down'" [size]="12" [weight]="2" />
              }
              {{ str('delta') }}
            </span>
          }
        </div>
      }
      @case ('table') {
        <div class="pb-card">
          <div class="pb-card-h">
            {{ str('title') }}
            @if (badge()) {
              <span class="pb-live" [attr.data-tone]="tone()">{{ badge() }}</span>
            }
          </div>
          @if (problem()) {
            <div class="pb-problem row">{{ problem() }}</div>
          }
          <div class="pb-scroll">
            <table class="pb-table">
              <thead>
                <tr>
                  @for (col of columns(); track col) {
                    <th>{{ col }}</th>
                  }
                </tr>
              </thead>
              <tbody>
                @for (row of rows(); track $index) {
                  <tr>
                    @for (cell of row; track $index) {
                      <td>{{ cell }}</td>
                    }
                  </tr>
                }
              </tbody>
            </table>
          </div>
        </div>
      }
      @case ('grid') {
        <!--
          The console's Data grid is a Kendo grid with paging, sorting, filtering, grouping and Excel
          export. This draws the same data with the column headers marked as sortable and says what it
          is not, rather than implying a grid that does nothing when clicked.
        -->
        <div class="pb-card">
          <div class="pb-card-h">
            {{ str('title') }}
            @if (badge()) {
              <span class="pb-live" [attr.data-tone]="tone()">{{ badge() }}</span>
            }
            <span class="pb-note">reporting grid — display only in this port</span>
          </div>
          @if (problem()) {
            <div class="pb-problem row">{{ problem() }}</div>
          }
          <div class="pb-scroll">
            <table class="pb-table grid">
              <thead>
                <tr>
                  @for (col of columns(); track col) {
                    <th>{{ col }} <span class="sort">↕</span></th>
                  }
                </tr>
              </thead>
              <tbody>
                @for (row of rows(); track $index) {
                  <tr>
                    @for (cell of row; track $index) {
                      <td>{{ cell }}</td>
                    }
                  </tr>
                }
              </tbody>
            </table>
          </div>
        </div>
      }
      @case ('chart') {
        <div class="pb-card">
          <div class="pb-card-h">
            {{ str('title') }}
            @if (badge()) {
              <span class="pb-live" [attr.data-tone]="tone()">{{ badge() }}</span>
            }
          </div>
          @if (problem()) {
            <div class="pb-problem row">{{ problem() }}</div>
          }
          <div class="pb-chart">
            @if (isPie()) {
              <svg [attr.viewBox]="'0 0 ' + PIE + ' ' + PIE" preserveAspectRatio="xMidYMid meet">
                @for (slice of slices(); track slice.label) {
                  <path [attr.d]="slice.path" [attr.fill]="slice.color" />
                }
                @if (str('kind', 'pie') === 'donut') {
                  <circle [attr.cx]="PIE / 2" [attr.cy]="PIE / 2" [attr.r]="PIE / 4" fill="var(--opus-surface)" />
                }
              </svg>
              <ul class="pb-legend">
                @for (slice of slices(); track slice.label) {
                  <li>
                    <span class="dot" [style.background]="slice.color"></span>
                    {{ slice.label }} <b>{{ slice.percent }}%</b>
                  </li>
                }
              </ul>
            } @else {
              <svg [attr.viewBox]="'0 0 ' + CW + ' ' + CH" preserveAspectRatio="none">
                <!-- Four gridlines and a baseline. Tokens, so the chart reads in both themes. -->
                @for (line of gridLines(); track line) {
                  <line
                    [attr.x1]="PAD_L"
                    [attr.x2]="CW - PAD_R"
                    [attr.y1]="line"
                    [attr.y2]="line"
                    stroke="var(--opus-chart-grid)"
                    stroke-width="1"
                  />
                }
                @switch (str('kind', 'column')) {
                  @case ('bar') {
                    @for (bar of bars(); track $index) {
                      <rect
                        [attr.x]="PAD_L"
                        [attr.y]="bar.y"
                        [attr.width]="bar.len"
                        [attr.height]="bar.thick"
                        [attr.fill]="accent()"
                        rx="2"
                      />
                    }
                  }
                  @case ('area') {
                    <path [attr.d]="areaPath()" [attr.fill]="accent()" fill-opacity="0.18" />
                    <path [attr.d]="linePath()" fill="none" [attr.stroke]="accent()" stroke-width="2" />
                  }
                  @case ('line') {
                    <path [attr.d]="linePath()" fill="none" [attr.stroke]="accent()" stroke-width="2" />
                    @for (point of points(); track $index) {
                      <circle [attr.cx]="point.x" [attr.cy]="point.y" r="3" [attr.fill]="accent()" />
                    }
                  }
                  @default {
                    @for (bar of bars(); track $index) {
                      <rect
                        [attr.x]="bar.x"
                        [attr.y]="bar.y"
                        [attr.width]="bar.thick"
                        [attr.height]="bar.len"
                        [attr.fill]="accent()"
                        rx="2"
                      />
                    }
                  }
                }
              </svg>
              <div class="pb-cats">
                @for (cat of categories(); track cat) {
                  <span>{{ cat }}</span>
                }
              </div>
            }
          </div>
        </div>
      }
      @case ('gauge') {
        <div class="pb-card">
          <div class="pb-card-h">{{ str('title') }}</div>
          <div class="pb-gauge">
            <svg viewBox="0 0 100 58">
              <path d="M8 50 A42 42 0 0 1 92 50" fill="none" stroke="var(--opus-surface-active)" stroke-width="10" stroke-linecap="round" />
              <path
                d="M8 50 A42 42 0 0 1 92 50"
                fill="none"
                [attr.stroke]="str('color', 'var(--opus-accent)')"
                stroke-width="10"
                stroke-linecap="round"
                [attr.stroke-dasharray]="ARC"
                [attr.stroke-dashoffset]="ARC * (1 - ratio())"
              />
            </svg>
            <span class="reading">{{ num('value') }}{{ str('suffix') }}</span>
          </div>
        </div>
      }
      @case ('progress') {
        <div class="pb-progress">
          <span class="label">{{ str('title') }}</span>
          <div class="track">
            <i [style.inline-size.%]="ratio() * 100" [style.background]="raw('color')"></i>
          </div>
          <span class="reading">{{ num('value') }} / {{ num('max', 100) }}</span>
        </div>
      }
      @case ('button') {
        <button type="button" class="pb-btn" [attr.data-style]="str('style', 'primary')">
          {{ str('label', 'Button') }}
          @if (str('action') === 'navigate') {
            <opus-icon name="chevron-right" [size]="14" [weight]="2" />
          }
        </button>
      }
      @case ('section') {
        <div class="pb-section">
          <span class="title">{{ str('title', 'Section') }}</span>
          @if (str('desc')) {
            <span class="desc">{{ str('desc') }}</span>
          }
        </div>
      }
      @default {
        <!-- Every input control: an optional caption above the control itself. -->
        <div class="pb-control" [class.captioned]="isCaptioned()">
          @if (isCaptioned()) {
            <span class="caption">{{ str('label') }}</span>
          }
          @switch (widget().type) {
            @case ('dropdown') {
              <div class="fake-select">
                {{ str('value') }}
                <opus-icon name="chevron-down" [size]="14" [weight]="2" />
              </div>
            }
            @case ('date') {
              <div class="fake-select">
                {{ str('value') }}
                <opus-icon name="history" [size]="14" [weight]="2" />
              </div>
            }
            @case ('textinput') {
              <div class="fake-input">{{ str('value') || str('placeholder') }}</div>
            }
            @case ('checkbox') {
              <label class="fake-check">
                <span class="box" [class.on]="bool('value')">
                  @if (bool('value')) {
                    <opus-icon name="check" [size]="11" [weight]="3" />
                  }
                </span>
                {{ str('label') }}
              </label>
            }
            @case ('segment') {
              <div class="fake-segments">
                @for (option of options(); track option) {
                  <span [class.on]="option === str('value')">{{ option }}</span>
                }
              </div>
            }
            @case ('buttonlist') {
              <div class="fake-buttons">
                @for (option of options(); track option) {
                  <span [class.on]="option === str('value')">{{ option }}</span>
                }
              </div>
            }
            @case ('radio') {
              <div class="fake-radios">
                @for (option of options(); track option) {
                  <span><i [class.on]="option === str('value')"></i>{{ option }}</span>
                }
              </div>
            }
            @default {
              <ul class="fake-list">
                @for (option of options(); track option) {
                  <li [class.on]="option === str('value')">{{ option }}</li>
                }
              </ul>
            }
          }
        </div>
      }
    }
  `,
  styles: `
    :host {
      display: block;
      block-size: 100%;
      min-inline-size: 0;
      overflow: hidden;
    }

    .pb-heading {
      font-weight: var(--opus-weight-semibold);
      color: var(--opus-text);
      font-size: var(--opus-text-xl);
      line-height: 1.25;
    }

    .pb-heading[data-level='2'] {
      font-size: var(--opus-text-lg);
    }

    .pb-heading[data-level='3'] {
      font-size: var(--opus-text-md);
    }

    .pb-text {
      margin: 0;
      font-size: var(--opus-text-md);
      color: var(--opus-text-secondary);
      line-height: var(--opus-leading-normal);
    }

    .pb-text.muted {
      color: var(--opus-text-muted);
    }

    .pb-divider {
      display: flex;
      align-items: center;
      block-size: 100%;
    }

    .pb-divider span {
      flex: 1;
      border-block-start: 1px solid var(--opus-border);
    }

    .pb-divider span.spacer {
      border-block-start: 0;
    }

    .pb-img {
      inline-size: 100%;
      block-size: 100%;
      object-fit: cover;
      border-radius: var(--opus-radius-md);
    }

    .pb-placeholder {
      display: grid;
      place-items: center;
      gap: var(--opus-space-1);
      block-size: 100%;
      border: 1px dashed var(--opus-border-strong);
      border-radius: var(--opus-radius-md);
      color: var(--opus-text-muted);
      font-size: var(--opus-text-sm);
    }

    /* ── KPI */
    .pb-kpi {
      display: flex;
      flex-direction: column;
      gap: 2px;
      block-size: 100%;
      padding: 12px 14px;
      background: var(--opus-surface);
      border: 1px solid var(--opus-border);
      border-radius: var(--opus-radius-md);
    }

    .pb-kpi .label {
      font-size: var(--opus-text-sm);
      color: var(--opus-text-secondary);
    }

    .pb-kpi .value {
      font-size: 26px;
      font-weight: 700;
      color: var(--opus-text);
      line-height: 1.15;
    }

    .pb-kpi .delta {
      display: inline-flex;
      align-items: center;
      gap: 2px;
      font-size: var(--opus-text-sm);
      color: var(--opus-text-muted);
    }

    .pb-kpi .delta[data-dir='up'] {
      color: var(--opus-emphasis-positive);
    }

    .pb-kpi .delta[data-dir='down'] {
      color: var(--opus-emphasis-negative);
    }

    /* ── cards, tables */
    .pb-card {
      display: flex;
      flex-direction: column;
      block-size: 100%;
      background: var(--opus-surface);
      border: 1px solid var(--opus-border);
      border-radius: var(--opus-radius-md);
      overflow: hidden;
    }

    .pb-card-h {
      display: flex;
      align-items: baseline;
      gap: var(--opus-space-2);
      padding: 10px 12px;
      font-size: var(--opus-text-md);
      font-weight: var(--opus-weight-semibold);
      color: var(--opus-text);
      border-block-end: 1px solid var(--opus-border);
      flex-shrink: 0;
    }

    .pb-note {
      font-size: var(--opus-text-xs);
      font-weight: var(--opus-weight-regular);
      color: var(--opus-text-muted);
    }

    .pb-scroll {
      flex: 1;
      overflow: auto;
      min-block-size: 0;
    }

    .pb-table {
      inline-size: 100%;
      border-collapse: collapse;
      font-size: var(--opus-text-sm);
    }

    .pb-table th {
      text-align: start;
      padding: 7px 12px;
      font-size: var(--opus-text-xs);
      text-transform: uppercase;
      letter-spacing: 0.04em;
      color: var(--opus-text-muted);
      background: var(--opus-surface-sunken);
      border-block-end: 1px solid var(--opus-border);
      position: sticky;
      inset-block-start: 0;
      white-space: nowrap;
    }

    .pb-table .sort {
      color: var(--opus-text-faint);
    }

    .pb-table td {
      padding: 7px 12px;
      border-block-end: 1px solid var(--opus-border);
      color: var(--opus-text-secondary);
      white-space: nowrap;
    }

    /* ── charts */
    .pb-chart {
      flex: 1;
      min-block-size: 0;
      padding: 10px 12px;
      display: flex;
      flex-direction: column;
      gap: var(--opus-space-1);
    }

    .pb-chart svg {
      flex: 1;
      min-block-size: 0;
      inline-size: 100%;
    }

    .pb-cats {
      display: flex;
      justify-content: space-around;
      gap: 2px;
      font-size: 10px;
      color: var(--opus-chart-axis);
      flex-shrink: 0;
    }

    .pb-cats span {
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
      text-align: center;
      flex: 1;
    }

    .pb-legend {
      list-style: none;
      margin: 0;
      padding: 0;
      display: flex;
      flex-wrap: wrap;
      gap: var(--opus-space-1) var(--opus-space-3);
      font-size: var(--opus-text-xs);
      color: var(--opus-text-secondary);
      flex-shrink: 0;
    }

    .pb-legend li {
      display: inline-flex;
      align-items: center;
      gap: 4px;
    }

    .pb-legend .dot {
      inline-size: 8px;
      block-size: 8px;
      border-radius: 2px;
    }

    /* ── gauge, progress */
    .pb-gauge {
      flex: 1;
      min-block-size: 0;
      display: grid;
      place-items: center;
      position: relative;
      padding: var(--opus-space-2);
    }

    .pb-gauge svg {
      inline-size: 100%;
      max-block-size: 100%;
    }

    .pb-gauge .reading {
      position: absolute;
      inset-block-end: 8px;
      font-size: var(--opus-text-lg);
      font-weight: 700;
      color: var(--opus-text);
    }

    .pb-progress {
      display: flex;
      flex-direction: column;
      gap: var(--opus-space-1);
      justify-content: center;
      block-size: 100%;
    }

    .pb-progress .label {
      font-size: var(--opus-text-sm);
      color: var(--opus-text-secondary);
    }

    .pb-progress .track {
      block-size: 8px;
      background: var(--opus-surface-active);
      border-radius: 4px;
      overflow: hidden;
    }

    .pb-progress .track i {
      display: block;
      block-size: 100%;
      background: var(--opus-accent);
    }

    .pb-progress .reading {
      font-size: var(--opus-text-xs);
      color: var(--opus-text-muted);
    }

    /* ── button, section */
    .pb-btn {
      display: inline-flex;
      align-items: center;
      gap: 6px;
      padding: 9px 16px;
      border-radius: var(--opus-radius-sm);
      border: 1px solid var(--opus-accent);
      background: var(--opus-accent);
      color: var(--opus-accent-contrast);
      font: inherit;
      font-size: var(--opus-text-md);
      font-weight: var(--opus-weight-medium);
      cursor: pointer;
      pointer-events: none;
    }

    .pb-btn[data-style='secondary'] {
      background: var(--opus-surface);
      color: var(--opus-text);
      border-color: var(--opus-border-strong);
    }

    .pb-btn[data-style='ghost'] {
      background: transparent;
      color: var(--opus-accent);
      border-color: transparent;
    }

    .pb-section {
      display: flex;
      flex-direction: column;
      gap: 2px;
      block-size: 100%;
      padding: 12px 14px;
      border: 1px dashed var(--opus-border-strong);
      border-radius: var(--opus-radius-md);
      background: var(--opus-surface-sunken);
    }

    .pb-section .title {
      font-size: var(--opus-text-md);
      font-weight: var(--opus-weight-semibold);
      color: var(--opus-text);
    }

    .pb-section .desc {
      font-size: var(--opus-text-sm);
      color: var(--opus-text-muted);
    }

    /* ── controls. Rendered as static mock-ups, because a builder canvas shows what a control will
       look like; making them live would let an author change a value they are only arranging. */
    .pb-control {
      display: flex;
      flex-direction: column;
      gap: 4px;
      justify-content: center;
      block-size: 100%;
    }

    .pb-control .caption {
      font-size: var(--opus-text-sm);
      font-weight: var(--opus-weight-medium);
      color: var(--opus-text);
    }

    .fake-select,
    .fake-input {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: var(--opus-space-2);
      padding: 8px 10px;
      border: 1px solid var(--opus-border-strong);
      border-radius: var(--opus-radius-sm);
      background: var(--opus-surface);
      font-size: var(--opus-text-md);
      color: var(--opus-text);
    }

    .fake-input {
      color: var(--opus-text-muted);
    }

    .fake-check {
      display: inline-flex;
      align-items: center;
      gap: var(--opus-space-2);
      font-size: var(--opus-text-md);
      color: var(--opus-text);
    }

    .fake-check .box {
      inline-size: 16px;
      block-size: 16px;
      border: 1.5px solid var(--opus-border-strong);
      border-radius: 3px;
      display: inline-grid;
      place-items: center;
      color: #fff;
    }

    .fake-check .box.on {
      background: var(--opus-accent);
      border-color: var(--opus-accent);
    }

    .fake-segments,
    .fake-buttons {
      display: inline-flex;
      gap: 2px;
      flex-wrap: wrap;
    }

    .fake-segments span,
    .fake-buttons span {
      padding: 6px 12px;
      font-size: var(--opus-text-sm);
      border: 1px solid var(--opus-border-strong);
      background: var(--opus-surface);
      color: var(--opus-text-secondary);
    }

    .fake-segments span:first-child {
      border-start-start-radius: var(--opus-radius-sm);
      border-end-start-radius: var(--opus-radius-sm);
    }

    .fake-segments span:last-child {
      border-start-end-radius: var(--opus-radius-sm);
      border-end-end-radius: var(--opus-radius-sm);
    }

    .fake-buttons span {
      border-radius: var(--opus-radius-sm);
    }

    .fake-segments span.on,
    .fake-buttons span.on {
      background: var(--opus-accent);
      border-color: var(--opus-accent);
      color: var(--opus-accent-contrast);
    }

    .fake-radios {
      display: flex;
      gap: var(--opus-space-3);
      flex-wrap: wrap;
      font-size: var(--opus-text-md);
      color: var(--opus-text-secondary);
    }

    .fake-radios span {
      display: inline-flex;
      align-items: center;
      gap: 5px;
    }

    .fake-radios i {
      inline-size: 13px;
      block-size: 13px;
      border: 1.5px solid var(--opus-border-strong);
      border-radius: 50%;
      display: inline-block;
    }

    .fake-radios i.on {
      border-color: var(--opus-accent);
      border-width: 4px;
    }

    .fake-list {
      list-style: none;
      margin: 0;
      padding: 0;
      border: 1px solid var(--opus-border-strong);
      border-radius: var(--opus-radius-sm);
      background: var(--opus-surface);
      overflow: auto;
      flex: 1;
      min-block-size: 0;
    }

    .fake-list li {
      padding: 6px 10px;
      font-size: var(--opus-text-md);
      color: var(--opus-text-secondary);
    }

    .fake-list li.on {
      background: var(--opus-accent-soft);
      color: var(--opus-accent);
    }

    /* Where a number came from. See the note on the badge computed. */
    .pb-live {
      margin-inline-start: 5px;
      padding: 0 5px;
      border-radius: 3px;
      font-size: 9px;
      font-weight: var(--opus-weight-semibold);
      text-transform: uppercase;
      letter-spacing: 0.04em;
      vertical-align: middle;
      background: var(--opus-emphasis-positive-bg);
      color: var(--opus-emphasis-positive);
    }

    .pb-live[data-tone='negative'] {
      background: var(--opus-emphasis-negative-bg);
      color: var(--opus-emphasis-negative);
    }

    .pb-live[data-tone='warning'] {
      background: var(--opus-emphasis-warning-bg);
      color: var(--opus-emphasis-warning);
    }

    .pb-problem {
      font-size: var(--opus-text-xs);
      color: var(--opus-emphasis-warning);
      line-height: var(--opus-leading-normal);
    }

    .pb-problem.row {
      padding: 4px 10px;
      background: var(--opus-emphasis-warning-bg);
    }
  `,
})
export class WidgetViewComponent {
  readonly widget = input.required<Widget>();

  /**
   * What the gateway returned for this widget's binding, when it has one.
   *
   * An input rather than an injected service, so this component stays a pure function of what it is
   * given: the same renderer draws a sketch with literal props and a bound widget with live rows, and it
   * cannot tell — or need to tell — which page it is on or whether a query is in flight.
   */
  readonly resolved = input<Resolved | null>(null);

  /** Chart viewport. Fixed units with `preserveAspectRatio="none"`, so the SVG scales to the cell. */
  protected readonly CW = 300;
  protected readonly CH = 140;
  protected readonly PAD_L = 4;
  protected readonly PAD_R = 4;
  protected readonly PIE = 100;
  /** Half a circle of r=42 — the gauge arc's length, for the dash offset. */
  protected readonly ARC = Math.PI * 42;

  /**
   * Prop accessors, one per type rather than one generic.
   *
   * A generic `prop<T>(key, fallback: T): T` infers T from the fallback's LITERAL type, so
   * `str('kind', 'column') === 'bar'` is a compile error comparing '"column"' with '"bar"'. Three
   * concrete readers say the same thing and keep the template's comparisons legal.
   */
  protected str(key: string, fallback = ''): string {
    const value = this.widget().props[key];
    return value === undefined || value === null ? fallback : String(value);
  }

  protected num(key: string, fallback = 0): number {
    const value = Number(this.widget().props[key]);
    return Number.isFinite(value) ? value : fallback;
  }

  protected bool(key: string): boolean {
    return this.widget().props[key] === true;
  }

  /** For a style binding that wants `null` when unset, so the CSS default wins. */
  protected raw(key: string): string | null {
    const value = this.widget().props[key];
    return typeof value === 'string' && value ? value : null;
  }

  protected readonly isCaptioned = computed(() => {
    const widget = this.widget();
    if (widget.type === 'checkbox') return false;
    return CONTROL_TYPES.includes(widget.type) && widget.props['caption'] === true;
  });

  protected readonly options = computed(() => (this.widget().props['options'] as string[]) ?? []);
  /*
    Resolved data first, the widget's own props second.

    The fallback is not a nicety: a bound widget whose query was denied still has to draw *something*, and
    its literal props are the last thing an author saw. Falling back keeps the layout stable while the
    note says why the numbers are not live — where an empty render looks like a broken widget.
  */
  protected readonly columns = computed(
    () => this.resolved()?.columns ?? (this.widget().props['columns'] as string[]) ?? [],
  );
  protected readonly rows = computed(
    () => this.resolved()?.rows ?? (this.widget().props['rows'] as string[][]) ?? [],
  );

  /** A figure: the gateway's formatted value, or the literal one. */
  protected readonly figure = computed(() => this.resolved()?.value ?? this.str('value'));

  /** Set when the author needs to know something: denied, unfilterable, corrected, unreachable. */
  protected readonly problem = computed(() => this.resolved()?.note ?? '');

  /**
   * The badge on a bound widget, and why it is not decoration.
   *
   * An author looking at "1,284" has no way to tell a live figure from one somebody typed in, and the
   * difference decides whether the page is finished. `denied` and `partial` earn a badge for a stronger
   * reason: they answer "what will a reader with fewer entitlements see", at design time rather than
   * after release.
   */
  protected readonly badge = computed(() => {
    const resolved = this.resolved();
    if (!this.widget().binding) return '';
    if (!resolved) return 'binding';
    switch (resolved.status) {
      case 'ok':
        return 'live';
      case 'empty':
        return 'no rows';
      case 'invalid':
      case 'unbound':
        return 'incomplete';
      default:
        return resolved.status;
    }
  });

  /** Three tones, decided here rather than in a list of attribute selectors saying one of three things. */
  protected readonly tone = computed(() => {
    const state = this.badge();
    if (state === 'denied' || state === 'error') return 'negative';
    if (state === 'live') return 'positive';
    return 'warning';
  });
  protected readonly categories = computed(
    () => this.resolved()?.categories ?? (this.widget().props['categories'] as string[]) ?? [],
  );

  protected readonly series = computed(
    () => this.resolved()?.series ?? (this.widget().props['series'] as number[]) ?? [],
  );
  protected readonly accent = computed(
    () => (this.widget().props['accent'] as string) ?? 'var(--opus-accent)',
  );

  protected readonly isPie = computed(() => {
    const kind = this.widget().props['kind'];
    return kind === 'pie' || kind === 'donut';
  });

  /** Four evenly spaced gridlines plus the baseline. */
  protected readonly gridLines = computed(() =>
    [0, 0.25, 0.5, 0.75, 1].map((f) => Math.round(f * (this.CH - 8)) + 4),
  );

  /** The scale denominator. Guarded, so a series of zeros does not divide by zero. */
  private readonly peak = computed(() => Math.max(1, ...this.series().map((v) => Math.abs(v))));

  protected readonly bars = computed(() => {
    const values = this.series();
    if (!values.length) return [];
    const horizontal = this.widget().props['kind'] === 'bar';
    const span = horizontal ? this.CW - this.PAD_L - this.PAD_R : this.CH - 8;
    const across = horizontal ? this.CH - 8 : this.CW - this.PAD_L - this.PAD_R;
    const slot = across / values.length;
    const thick = Math.max(2, slot * 0.62);

    return values.map((value, index) => {
      const len = (Math.abs(value) / this.peak()) * span;
      const offset = index * slot + (slot - thick) / 2;
      return horizontal
        ? { x: this.PAD_L, y: offset + 4, len, thick }
        : { x: this.PAD_L + offset, y: this.CH - 4 - len, len, thick };
    });
  });

  protected readonly points = computed(() => {
    const values = this.series();
    if (!values.length) return [];
    const span = this.CW - this.PAD_L - this.PAD_R;
    const step = values.length > 1 ? span / (values.length - 1) : 0;
    return values.map((value, index) => ({
      x: this.PAD_L + index * step,
      y: this.CH - 4 - (Math.abs(value) / this.peak()) * (this.CH - 8),
    }));
  });

  protected readonly linePath = computed(() =>
    this.points()
      .map((point, index) => `${index ? 'L' : 'M'}${point.x.toFixed(1)},${point.y.toFixed(1)}`)
      .join(' '),
  );

  protected readonly areaPath = computed(() => {
    const points = this.points();
    if (!points.length) return '';
    const first = points[0]!;
    const last = points[points.length - 1]!;
    return `${this.linePath()} L${last.x.toFixed(1)},${this.CH - 4} L${first.x.toFixed(1)},${this.CH - 4} Z`;
  });

  /**
   * Pie and donut slices.
   *
   * Drawn as arc paths from the top, clockwise. A single-segment chart is special-cased to a full
   * circle, because an arc of exactly 360° collapses to nothing — its start and end points coincide.
   */
  protected readonly slices = computed<Slice[]>(() => {
    const segments = (this.widget().props['segments'] as Segment[]) ?? [];
    const total = segments.reduce((sum, segment) => sum + segment.value, 0);
    if (!total) return [];

    const centre = this.PIE / 2;
    const radius = this.PIE / 2 - 2;
    let angle = -Math.PI / 2;

    return segments.map((segment) => {
      const sweep = (segment.value / total) * Math.PI * 2;
      const end = angle + sweep;
      const path =
        segments.length === 1
          ? `M${centre},${centre - radius} A${radius},${radius} 0 1 1 ${centre - 0.01},${centre - radius} Z`
          : [
              `M${centre},${centre}`,
              `L${(centre + radius * Math.cos(angle)).toFixed(2)},${(centre + radius * Math.sin(angle)).toFixed(2)}`,
              `A${radius},${radius} 0 ${sweep > Math.PI ? 1 : 0} 1 ${(centre + radius * Math.cos(end)).toFixed(2)},${(centre + radius * Math.sin(end)).toFixed(2)}`,
              'Z',
            ].join(' ');
      angle = end;
      return {
        path,
        color: segment.color,
        label: segment.label,
        percent: Math.round((segment.value / total) * 100),
      };
    });
  });

  /** Gauge and progress fill, clamped so a value over `max` cannot overflow the track. */
  protected readonly ratio = computed(() => {
    const value = Number(this.widget().props['value'] ?? 0);
    const max = Number(this.widget().props['max'] ?? 100) || 100;
    return Math.min(1, Math.max(0, value / max));
  });
}
