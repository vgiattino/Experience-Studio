/**
 * Runtime observability panel.
 *
 * Not chrome for its own sake: it makes the architecture's central claims visible
 * and checkable in the running app — that compilation is memoized, that a filter
 * change re-queries only the affected sources, that widget states are independent,
 * and that validation levels 3/5/6/8 are absent rather than silently passing.
 */

import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { TelemetryService } from '@opus/platform';
import { GatewayService } from '@opus/data-client';
import { PageLoaderService } from '@opus/renderer';

@Component({
  selector: 'opus-dev-panel',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <button
      type="button"
      class="toggle"
      [attr.aria-expanded]="open()"
      aria-controls="dev-panel-body"
      (click)="open.set(!open())"
    >
      Runtime {{ open() ? '▾' : '▸' }}
      @if (problemCount()) {
        <span class="pill">{{ problemCount() }}</span>
      }
    </button>

    @if (open()) {
      <div class="body" id="dev-panel-body">
        @if (render(); as r) {
          <section>
            <h4>Render</h4>
            <dl>
              <dt>Page</dt>
              <dd>{{ r.pageId }} v{{ r.definitionVersion }}</dd>
              <dt>Compile</dt>
              <dd>
                {{ r.compileMs }}ms
                <span [class.hit]="r.compileCacheHit">{{
                  r.compileCacheHit ? '(cache hit)' : '(compiled)'
                }}</span>
              </dd>
              <dt>First batch</dt>
              <dd>{{ r.firstBatchMs ?? '—' }}ms</dd>
              <dt>Widgets</dt>
              <dd>{{ r.widgetCount }}</dd>
            </dl>
          </section>
        }

        <section>
          <h4>Widget states</h4>
          <ul class="states">
            @for (entry of stateCounts(); track entry.state) {
              <li [attr.data-state]="entry.state">{{ entry.state }} × {{ entry.count }}</li>
            }
          </ul>
        </section>

        <section>
          <h4>
            Queries
            <span class="muted">cache {{ cacheHitPercent() }}% · {{ cacheSize() }} entries</span>
          </h4>
          <ul class="queries">
            @for (q of recentQueries(); track $index) {
              <li>
                <code>{{ q.dataSourceId }}</code>
                <span [attr.data-status]="q.status">{{ q.status }}</span>
                <span class="muted">{{ q.rowCount }} rows · {{ q.durationMs }}ms</span>
                @if (q.fromCache) {
                  <span class="cached">cached</span>
                }
              </li>
            }
          </ul>
          <p class="note">
            Change a filter — only the data sources that declare a dependency on it re-run.
          </p>
        </section>

        @if (report(); as rep) {
          <section>
            <h4>Validation</h4>
            <p class="muted">
              status <strong>{{ rep.status }}</strong> · {{ rep.durationMs }}ms
            </p>
            <p class="muted">ran: {{ rep.levelsRun.join(', ') }}</p>
            <p class="muted">not run (needs server): {{ rep.levelsNotRun.join(', ') || 'none' }}</p>
            @if (rep.findings.length) {
              <ul class="findings">
                @for (f of rep.findings.slice(0, 8); track $index) {
                  <li [attr.data-severity]="f.severity">
                    <code>{{ f.code }}</code> {{ f.path }} — {{ f.message }}
                  </li>
                }
              </ul>
            }
          </section>
        }

        @if (problems().length) {
          <section>
            <h4>Problems</h4>
            <ul class="findings">
              @for (p of problems().slice(-8); track $index) {
                <li data-severity="warning"><code>{{ p.code }}</code> {{ p.detail }}</li>
              }
            </ul>
          </section>
        }
      </div>
    }
  `,
  styles: `
    :host {
      display: block;
      font-size: var(--opus-text-xs);
    }

    .toggle {
      display: inline-flex;
      align-items: center;
      gap: var(--opus-space-2);
      inline-size: 100%;
      padding: var(--opus-space-2) var(--opus-space-3);
      font: inherit;
      font-weight: var(--opus-weight-medium);
      text-align: start;
      color: var(--opus-text-secondary);
      background: none;
      border: 0;
      border-block-start: 1px solid var(--opus-border);
      cursor: pointer;
    }

    .toggle:focus-visible {
      outline: 2px solid var(--opus-focus-ring);
      outline-offset: -2px;
    }

    .pill {
      padding: 0 var(--opus-space-1);
      color: var(--opus-emphasis-warning);
      background: var(--opus-emphasis-warning-bg);
      border-radius: var(--opus-radius-sm);
    }

    .body {
      max-block-size: 46vh;
      overflow-y: auto;
      padding: 0 var(--opus-space-3) var(--opus-space-3);
    }

    section {
      margin-block-start: var(--opus-space-3);
    }

    h4 {
      display: flex;
      justify-content: space-between;
      gap: var(--opus-space-2);
      margin: 0 0 var(--opus-space-1);
      font-size: var(--opus-text-xs);
      font-weight: var(--opus-weight-semibold);
      text-transform: uppercase;
      letter-spacing: 0.04em;
      color: var(--opus-text-muted);
    }

    dl {
      display: grid;
      grid-template-columns: auto 1fr;
      gap: 2px var(--opus-space-2);
      margin: 0;
    }

    dt {
      color: var(--opus-text-muted);
    }

    dd {
      margin: 0;
      color: var(--opus-text-secondary);
      font-variant-numeric: tabular-nums;
    }

    ul {
      margin: 0;
      padding: 0;
      list-style: none;
    }

    .states {
      display: flex;
      flex-wrap: wrap;
      gap: var(--opus-space-1);
    }

    .states li {
      padding: 0 var(--opus-space-2);
      border-radius: var(--opus-radius-sm);
      background: var(--opus-emphasis-neutral-bg);
      color: var(--opus-emphasis-neutral);
    }

    .states li[data-state='ready'] {
      background: var(--opus-emphasis-positive-bg);
      color: var(--opus-emphasis-positive);
    }
    .states li[data-state='partial'],
    .states li[data-state='empty'] {
      background: var(--opus-emphasis-warning-bg);
      color: var(--opus-emphasis-warning);
    }
    .states li[data-state='error'],
    .states li[data-state='denied'] {
      background: var(--opus-emphasis-negative-bg);
      color: var(--opus-emphasis-negative);
    }

    .queries li,
    .findings li {
      display: flex;
      flex-wrap: wrap;
      gap: var(--opus-space-2);
      padding-block: 1px;
      color: var(--opus-text-secondary);
    }

    code {
      font-family: var(--opus-font-mono);
      color: var(--opus-text);
    }

    [data-status='ok'] {
      color: var(--opus-emphasis-positive);
    }
    [data-status='partial'],
    [data-status='empty'] {
      color: var(--opus-emphasis-warning);
    }
    [data-status='denied'],
    [data-status='error'] {
      color: var(--opus-emphasis-negative);
    }

    .cached {
      color: var(--opus-emphasis-info);
    }

    .muted {
      color: var(--opus-text-muted);
      font-weight: var(--opus-weight-regular);
      text-transform: none;
      letter-spacing: 0;
    }

    .note {
      margin: var(--opus-space-1) 0 0;
      color: var(--opus-text-muted);
      font-style: italic;
    }

    .findings li[data-severity='error'] code {
      color: var(--opus-emphasis-negative);
    }

    .hit {
      color: var(--opus-emphasis-info);
    }
  `,
})
export class DevPanelComponent {
  private readonly telemetry = inject(TelemetryService);
  private readonly gateway = inject(GatewayService);
  private readonly loader = inject(PageLoaderService);

  protected readonly open = signal(false);

  protected readonly render = this.telemetry.lastRender;
  protected readonly problems = this.telemetry.problems;
  protected readonly report = this.loader.lastReport;

  protected readonly problemCount = computed(() => this.telemetry.problems().length);
  protected readonly recentQueries = computed(() => [...this.telemetry.queries()].slice(-10).reverse());
  protected readonly cacheHitPercent = computed(() => Math.round(this.telemetry.cacheHitRate() * 100));

  protected readonly stateCounts = computed(() =>
    Object.entries(this.telemetry.widgetStateCounts()).map(([state, count]) => ({ state, count })),
  );

  protected cacheSize(): number {
    return this.gateway.cacheSize();
  }
}
