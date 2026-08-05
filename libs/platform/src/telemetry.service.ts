/**
 * Observability (architecture/runtime-architecture.md §13).
 *
 * Signals rather than a log stream, so the dev panel can display live state and
 * so tests can assert on what a render actually did. Every record is tagged with
 * the definition version, making regressions attributable.
 */

import { Injectable, computed, signal } from '@angular/core';
import type { WidgetStateName, WidgetTelemetry } from '@opus/contracts';

export interface QueryRecord {
  dataSourceId: string;
  status: string;
  durationMs: number;
  rowCount: number;
  fromCache: boolean;
  at: number;
}

export interface RenderRecord {
  pageId: string;
  definitionVersion: number;
  compileMs: number;
  compileCacheHit: boolean;
  firstBatchMs?: number;
  widgetCount: number;
  at: number;
}

export interface ProblemRecord {
  scope: string;
  code: string;
  detail: string;
  at: number;
}

@Injectable({ providedIn: 'root' })
export class TelemetryService {
  private readonly _renders = signal<readonly RenderRecord[]>([]);
  private readonly _queries = signal<readonly QueryRecord[]>([]);
  private readonly _widgets = signal<readonly WidgetTelemetry[]>([]);
  private readonly _problems = signal<readonly ProblemRecord[]>([]);

  readonly renders = this._renders.asReadonly();
  readonly queries = this._queries.asReadonly();
  readonly widgets = this._widgets.asReadonly();
  readonly problems = this._problems.asReadonly();

  readonly lastRender = computed(() => this._renders().at(-1));

  readonly widgetStateCounts = computed(() => {
    const counts: Partial<Record<WidgetStateName, number>> = {};
    for (const w of this._widgets()) {
      counts[w.state] = (counts[w.state] ?? 0) + 1;
    }
    return counts;
  });

  readonly cacheHitRate = computed(() => {
    const queries = this._queries();
    if (!queries.length) return 0;
    return queries.filter((q) => q.fromCache).length / queries.length;
  });

  recordRender(record: Omit<RenderRecord, 'at'>): void {
    this._renders.update((list) => [...list, { ...record, at: Date.now() }].slice(-50));
  }

  updateLastRender(patch: Partial<RenderRecord>): void {
    this._renders.update((list) => {
      if (!list.length) return list;
      const head = list.slice(0, -1);
      return [...head, { ...list[list.length - 1]!, ...patch }];
    });
  }

  recordQuery(record: Omit<QueryRecord, 'at'>): void {
    this._queries.update((list) => [...list, { ...record, at: Date.now() }].slice(-200));
  }

  /** Widget records are keyed by id: the latest state per widget replaces the previous. */
  recordWidget(record: WidgetTelemetry): void {
    this._widgets.update((list) => [...list.filter((w) => w.widgetId !== record.widgetId), record]);
  }

  recordProblem(record: Omit<ProblemRecord, 'at'>): void {
    this._problems.update((list) => [...list, { ...record, at: Date.now() }].slice(-100));
    // Surface in the console too — a widget degrading silently is a support burden.
    console.warn(`[opus:${record.scope}] ${record.code}: ${record.detail}`);
  }

  reset(): void {
    this._renders.set([]);
    this._queries.set([]);
    this._widgets.set([]);
    this._problems.set([]);
  }
}
