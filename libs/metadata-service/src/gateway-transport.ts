/**
 * The Data Gateway transport: one HTTP batch per render.
 *
 * This is the file that moves enforcement out of the browser. `GatewayService` keeps doing what a
 * client should — batching, caching by (source, params, entitlement scope), never inventing a TTL —
 * and the answer now comes from a process that holds the logical→physical map and resolves the
 * caller's row and column entitlements. Before this, the same `MockGateway` ran in the tab that was
 * asking it questions, which demonstrates the shape of enforcement without being enforcement.
 *
 * The honest deviation, stated at the seam rather than in a footnote: **the request carries the data
 * source definitions.** A production gateway resolves them server-side from the pinned definition
 * version and never trusts a client-supplied query shape — a tampered shape is exactly threat T1.
 * The prototype needs it because a generated draft is previewed before it is saved, so its sources
 * do not exist server-side yet. What still holds: entitlements, cost guards and the fan-out cap are
 * all applied by the server, so a tampered shape can ask a different question but cannot widen the
 * answer.
 */

import type { GatewayTransport } from '@opus/data-client';
import type { BatchRequest, BatchResponse, DataSource } from '@opus/experience-model';

import { apiRequest } from './api';

export interface HttpGatewayOptions {
  personaId: string;
  simulate?: 'none' | 'denied' | 'error' | 'empty' | 'slow';
}

export class HttpGatewayTransport implements GatewayTransport {
  readonly label = 'HTTP → /api/data/batch';

  constructor(private options: HttpGatewayOptions) {}

  update(options: HttpGatewayOptions): void {
    this.options = options;
  }

  async queryBatch(
    request: BatchRequest,
    sources: Readonly<Record<string, DataSource>>,
  ): Promise<BatchResponse> {
    // Only the sources this batch actually needs are sent. A page with nine sources querying four of
    // them should not ship the other five: the payload is smaller, and what the server is asked to
    // trust is narrower.
    const needed: Record<string, DataSource> = {};
    for (const query of request.queries) {
      const source = sources[query.dataSourceId];
      if (source) needed[query.dataSourceId] = source;
    }

    return apiRequest<BatchResponse>('/data/batch', {
      method: 'POST',
      persona: this.options.personaId,
      body: { batch: request, sources: needed, simulate: this.options.simulate ?? 'none' },
    });
  }
}

export function createHttpGatewayTransport(options: HttpGatewayOptions): HttpGatewayTransport {
  return new HttpGatewayTransport(options);
}
