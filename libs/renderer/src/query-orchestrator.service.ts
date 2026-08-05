/**
 * Query planning and execution (architecture/runtime-architecture.md §6, §8, §9).
 *
 * Three behaviours here are the substance of the runtime design:
 *
 *  - ONE BATCH for the eager set, so a twelve-widget page issues one request.
 *  - PER-QUERY INDEPENDENT STATUS, so a denied column degrades one widget to
 *    `partial` and a denied entity degrades one widget to `denied`, while its
 *    siblings render normally. Two users open the same page and legitimately see
 *    different widget states; both renders are correct.
 *  - TARGETED RE-QUERY. A filter change consults the compiled dependency graph and
 *    re-runs only the affected sources. Without that graph the only safe behaviour
 *    is to re-query everything.
 */

import { Injectable, computed, effect, inject, signal, untracked } from '@angular/core';
import { GatewayService } from '@opus/data-client';
import { TelemetryService } from '@opus/platform';
import {
  isExpression,
  isFilterRef,
  isParamRef,
  isSelectionRef,
  type DataRow,
  type DataSource,
  type DataView,
  type FilterClause,
  type FilterNode,
  type Identifier,
  type QueryRequest,
  type QueryResult,
  type WidgetStateName,
} from '@opus/contracts';

import { sourcesAffectedBy, type CompiledPage } from './compile-page';
import { PageContextService } from './page-context.service';

type SourceState =
  | { phase: 'idle' }
  | { phase: 'loading' }
  | { phase: 'settled'; result: QueryResult };

@Injectable()
export class QueryOrchestratorService {
  private readonly gateway = inject(GatewayService);
  private readonly context = inject(PageContextService);
  private readonly telemetry = inject(TelemetryService);

  private page: CompiledPage | null = null;
  private readonly states = signal<Record<Identifier, SourceState>>({});
  private readonly activatedDeferred = new Set<Identifier>();
  private lastChangeSeen: unknown = null;

  readonly busy = computed(() =>
    Object.values(this.states()).some((s) => s.phase === 'loading'),
  );

  constructor() {
    /**
     * A page-state change re-queries whatever depends on it, WHOEVER MADE THE CHANGE.
     *
     * The action dispatcher used to be the only caller of `applyChange`, which quietly made
     * "re-query on change" a property of the dispatcher rather than of the state. It held while the
     * dispatcher was the only writer — but the renderer writes page state too, for chrome it owns:
     * selecting a tab writes the container's `selectedTabChannel`. A tab whose content is filtered
     * by that channel then switched its label and kept its old rows, which is worse than not
     * supporting the feature.
     *
     * Reacting to the change signal instead makes the invariant structural. `applyChange` already
     * dedupes on the change object's identity, so the dispatcher's direct calls remain correct and
     * only one of the two paths does the work.
     */
    effect(() => {
      const change = this.context.lastChange();
      // `untracked`: applyChange reads source states, and tracking those would re-run this effect
      // on every query settling — the change signal is the only dependency that should wake it.
      if (change) untracked(() => void this.applyChange());
    });
  }

  attach(page: CompiledPage): void {
    this.page = page;
    this.activatedDeferred.clear();
    this.lastChangeSeen = null;
    const initial: Record<Identifier, SourceState> = {};
    for (const id of Object.keys(page.dependencies)) initial[id] = { phase: 'idle' };
    this.states.set(initial);
  }

  /** Run the eager set as one batch. */
  async runInitialBatch(): Promise<void> {
    const page = this.page;
    if (!page) return;
    await this.run(page.eagerSources);
  }

  /**
   * Activate deferred sources for a region that has just become visible — a tab
   * the user opened. Idempotent: activating twice does not re-query.
   */
  async activateSources(sourceIds: readonly Identifier[]): Promise<void> {
    const fresh = sourceIds.filter(
      (id) => !this.activatedDeferred.has(id) && this.states()[id]?.phase === 'idle',
    );
    if (!fresh.length) return;
    for (const id of fresh) this.activatedDeferred.add(id);
    await this.run(fresh);
  }

  /** Re-query the sources affected by a page-state change. */
  async applyChange(): Promise<void> {
    const page = this.page;
    if (!page) return;
    const change = this.context.lastChange();
    if (!change || change === this.lastChangeSeen) return;
    this.lastChangeSeen = change;

    const affected = sourcesAffectedBy(page, change).filter((id) => {
      const state = this.states()[id];
      // Never wake a deferred source that has not been activated: a hidden tab
      // must not start querying because a filter elsewhere changed.
      if (state?.phase === 'idle' && page.deferredSources.includes(id)) return false;
      return true;
    });

    if (affected.length) {
      this.gateway.invalidate(affected);
      await this.run(affected);
    }
  }

  async refresh(sourceIds?: readonly Identifier[], bypassCache = true): Promise<void> {
    const page = this.page;
    if (!page) return;
    const targets = sourceIds?.length
      ? sourceIds
      : Object.keys(this.states()).filter((id) => this.states()[id]?.phase !== 'idle');
    if (bypassCache) this.gateway.invalidate(targets);
    await this.run(targets);
  }

  private async run(sourceIds: readonly Identifier[]): Promise<void> {
    const page = this.page;
    if (!page || !sourceIds.length) return;
    const definition = page.definition;
    const sources = definition.dataSources ?? {};

    this.states.update((current) => {
      const next = { ...current };
      for (const id of sourceIds) next[id] = { phase: 'loading' };
      return next;
    });

    const queries: QueryRequest[] = sourceIds
      .filter((id) => sources[id])
      .map((id) => ({
        key: id,
        dataSourceId: id,
        params: this.resolveParams(sources[id]!),
      }));

    const startedAt = performance.now();
    try {
      const response = await this.gateway.queryBatch(
        {
          context: {
            pageId: definition.id,
            definitionVersion: definition.version.artifactVersion,
          },
          queries,
        },
        sources,
      );

      this.states.update((current) => {
        const next = { ...current };
        for (const result of response.results) {
          next[result.key] = { phase: 'settled', result };
        }
        return next;
      });
    } catch (error) {
      this.states.update((current) => {
        const next = { ...current };
        for (const id of sourceIds) {
          next[id] = {
            phase: 'settled',
            result: {
              key: id,
              status: 'error',
              rows: [],
              problem: {
                category: 'upstream',
                code: 'batchFailed',
                detail: error instanceof Error ? error.message : String(error),
              },
            },
          };
        }
        return next;
      });
      this.telemetry.recordProblem({
        scope: 'orchestrator',
        code: 'batchFailed',
        detail: error instanceof Error ? error.message : String(error),
      });
    }

    this.publish();
    this.telemetry.updateLastRender({ firstBatchMs: Math.round(performance.now() - startedAt) });
  }

  /**
   * Resolve a data source's declarative inputs against current page state.
   *
   * Only the *values* are resolved here; the filter structure stays in the
   * definition and is executed server-side. Nothing about entitlement is resolved
   * on the client — that happens in the gateway from the caller's identity.
   */
  private resolveParams(source: DataSource): Record<string, unknown> {
    const params: Record<string, unknown> = {};

    const visitClause = (clause: FilterClause) => {
      const resolved = this.context.resolveComputable(clause.value);
      params[clause.target] = resolved ?? null;
      params[`${clause.target}@${clause.operator}`] = resolved ?? null;
    };

    const visitNode = (node: FilterNode | undefined): void => {
      if (!node) return;
      if ('all' in node) return node.all.forEach(visitNode);
      if ('any' in node) return node.any.forEach(visitNode);
      if ('not' in node) return visitNode(node.not);
      visitClause(node);
    };

    visitNode(source.filter);
    for (const traversal of source.traversals ?? []) visitNode(traversal.filter);

    for (const [key, value] of Object.entries(source.select.key ?? {})) {
      params[key] = this.context.resolveComputable(value) ?? null;
    }
    if (source.select.searchTerm !== undefined) {
      params['searchTerm'] = this.context.resolveComputable(source.select.searchTerm) ?? null;
    }
    for (const [name, spec] of Object.entries(source.parameters ?? {})) {
      params[name] = this.context.resolveComputable(spec.default) ?? null;
    }
    if (source.effectiveDating?.asOf !== undefined) {
      params['$asOf'] = this.context.resolveComputable(source.effectiveDating.asOf) ?? null;
    }

    return params;
  }

  private publish(): void {
    const rows: Record<Identifier, readonly DataRow[]> = {};
    for (const [id, state] of Object.entries(this.states())) {
      rows[id] = state.phase === 'settled' ? state.result.rows : [];
    }
    this.context.publishRows(rows);
  }

  /** The DataView a widget receives, merged across every source it consumes. */
  viewFor(widgetId: Identifier): DataView {
    const page = this.page;
    if (!page) return { state: 'loading', rows: [] };

    const sourceIds = page.widgetSources[widgetId] ?? [];
    if (!sourceIds.length) return { state: 'ready', rows: [] };

    const states = sourceIds.map((id) => this.states()[id] ?? { phase: 'idle' as const });

    if (states.some((s) => s.phase === 'loading')) return { state: 'loading', rows: [] };
    if (states.every((s) => s.phase === 'idle')) return { state: 'loading', rows: [] };

    const results = states
      .filter((s): s is { phase: 'settled'; result: QueryResult } => s.phase === 'settled')
      .map((s) => s.result);

    // The primary source supplies the rows; additional sources contribute status
    // only. A widget reading two sources is rare and always has one that is "its".
    const primaryId = sourceIds[0]!;
    const primary = results.find((r) => r.key === primaryId) ?? results[0]!;

    const state = worstState(results.map((r) => stateForStatus(r.status)));

    return {
      state,
      rows: primary.rows,
      totalRows: primary.totalRows,
      deniedFields: primary.deniedFields,
      problem: results.find((r) => r.problem)?.problem,
      fromCache: results.every((r) => r.fromCache),
    };
  }

  resultFor(sourceId: Identifier): QueryResult | undefined {
    const state = this.states()[sourceId];
    return state?.phase === 'settled' ? state.result : undefined;
  }

  /** Rows of a source, for containers that repeat over data. */
  rowsFor(sourceId: Identifier): readonly DataRow[] {
    return this.resultFor(sourceId)?.rows ?? [];
  }
}

function stateForStatus(status: QueryResult['status']): WidgetStateName {
  switch (status) {
    case 'ok':
      return 'ready';
    case 'empty':
      return 'empty';
    case 'partial':
      return 'partial';
    case 'denied':
      return 'denied';
    default:
      return 'error';
  }
}

/** Severity order when a widget reads several sources. */
const SEVERITY: readonly WidgetStateName[] = [
  'ready',
  'empty',
  'partial',
  'loading',
  'denied',
  'error',
];

function worstState(states: readonly WidgetStateName[]): WidgetStateName {
  return states.reduce<WidgetStateName>(
    (worst, state) => (SEVERITY.indexOf(state) > SEVERITY.indexOf(worst) ? state : worst),
    'ready',
  );
}

/** Exported for the compiler's benefit — kept here so the wrappers live in one place. */
export const COMPUTABLE_GUARDS = { isExpression, isParamRef, isFilterRef, isSelectionRef };
