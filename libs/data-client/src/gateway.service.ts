/**
 * Client for the Data Gateway.
 *
 * Two properties of the real design are reproduced exactly, because they are the
 * ones that matter architecturally:
 *
 *  1. ONE BATCH PER RENDER. A twelve-widget dashboard issues one request, not
 *     twelve — one entitlement resolution, one correlation id, one audit event
 *     (architecture/backend-architecture.md §3.3).
 *
 *  2. THE ENTITLEMENT SCOPE IS PART OF EVERY CACHE KEY. Omitting it serves one
 *     user's rows to another — an authorization bypass that no amount of correct
 *     enforcement code prevents, because enforcement is never reached
 *     (architecture/security-architecture.md §6.4).
 */

import { Injectable, inject, signal } from '@angular/core';
import { TelemetryService } from '@opus/platform';
import type {
  BatchRequest,
  BatchResponse,
  DataSource,
  QueryRequest,
  QueryResult,
  UserContext,
} from '@opus/contracts';

import { MockGateway, type MockEntityTable } from './mock-gateway';

export interface GatewayConfig {
  tables: readonly MockEntityTable[];
  user: UserContext;
  latencyMs?: number;
  simulate?: 'none' | 'denied' | 'error' | 'empty' | 'slow';
}

interface CacheEntry {
  result: QueryResult;
  expiresAt: number;
}

@Injectable({ providedIn: 'root' })
export class GatewayService {
  private readonly telemetry = inject(TelemetryService);

  private gateway: MockGateway | null = null;
  private config: GatewayConfig | null = null;
  private readonly cache = new Map<string, CacheEntry>();

  readonly configured = signal(false);
  readonly inFlight = signal(0);

  configure(config: GatewayConfig): void {
    this.config = config;
    this.gateway = new MockGateway({
      tables: config.tables,
      capabilities: config.user.capabilities,
      entitlementScopeHash: config.user.entitlementScopeHash,
      latencyMs: config.latencyMs ?? 140,
      simulate: config.simulate ?? 'none',
    });
    this.cache.clear();
    this.configured.set(true);
  }

  /**
   * Cache key. `dataSourceId` alone is not sufficient, and neither is
   * `dataSourceId + params` — the caller's resolved entitlement scope must be in
   * the key or cached rows cross users.
   */
  private cacheKey(query: QueryRequest, scopeHash: string): string {
    return `${query.dataSourceId}|${stableHash(query.params)}|${scopeHash}`;
  }

  async queryBatch(
    request: BatchRequest,
    sources: Readonly<Record<string, DataSource>>,
    options: { bypassCache?: boolean } = {},
  ): Promise<BatchResponse> {
    if (!this.gateway || !this.config) {
      throw new Error('GatewayService.configure() must be called before querying');
    }

    const scopeHash = this.config.user.entitlementScopeHash;
    const now = Date.now();
    const cached: QueryResult[] = [];
    const toFetch: QueryRequest[] = [];

    for (const query of request.queries) {
      if (options.bypassCache) {
        toFetch.push(query);
        continue;
      }
      const entry = this.cache.get(this.cacheKey(query, scopeHash));
      if (entry && entry.expiresAt > now) {
        cached.push({ ...entry.result, key: query.key, fromCache: true });
      } else {
        toFetch.push(query);
      }
    }

    for (const result of cached) {
      this.telemetry.recordQuery({
        dataSourceId: result.key,
        status: result.status,
        durationMs: 0,
        rowCount: result.rows.length,
        fromCache: true,
      });
    }

    if (!toFetch.length) {
      return { results: cached, correlationId: 'cache', durationMs: 0 };
    }

    this.inFlight.update((n) => n + 1);
    try {
      const response = await this.gateway.queryBatch({ ...request, queries: toFetch }, sources);

      for (const result of response.results) {
        const query = toFetch.find((q) => q.key === result.key);
        // Only successful results are cached. A denied or errored query must be
        // re-asked, because the reason may be transient or entitlement may change.
        if (query && (result.status === 'ok' || result.status === 'partial' || result.status === 'empty')) {
          this.cache.set(this.cacheKey(query, scopeHash), {
            result,
            expiresAt: Date.now() + (result.ttlSeconds ?? 60) * 1000,
          });
        }
        this.telemetry.recordQuery({
          dataSourceId: result.key,
          status: result.status,
          durationMs: result.durationMs ?? 0,
          rowCount: result.rows.length,
          fromCache: false,
        });
        if (result.problem) {
          this.telemetry.recordProblem({
            scope: `gateway/${result.key}`,
            code: result.problem.code,
            detail: result.problem.detail,
          });
        }
      }

      return {
        results: [...cached, ...response.results],
        correlationId: response.correlationId,
        durationMs: response.durationMs,
      };
    } finally {
      this.inFlight.update((n) => n - 1);
    }
  }

  /** Invalidate cached results. Called after a write action, or by a refresh action. */
  invalidate(dataSourceIds?: readonly string[]): void {
    if (!dataSourceIds?.length) {
      this.cache.clear();
      return;
    }
    for (const key of [...this.cache.keys()]) {
      const id = key.split('|')[0];
      if (id && dataSourceIds.includes(id)) this.cache.delete(key);
    }
  }

  cacheSize(): number {
    return this.cache.size;
  }
}

/** Order-independent hash of resolved parameters, so key order cannot split the cache. */
function stableHash(value: unknown): string {
  const json = JSON.stringify(value, (_key, v) => {
    if (v && typeof v === 'object' && !Array.isArray(v)) {
      return Object.fromEntries(Object.entries(v as object).sort(([a], [b]) => a.localeCompare(b)));
    }
    return v;
  });
  let hash = 0;
  for (let i = 0; i < json.length; i++) {
    hash = (hash * 31 + json.charCodeAt(i)) | 0;
  }
  return (hash >>> 0).toString(36);
}
