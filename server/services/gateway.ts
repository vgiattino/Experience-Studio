/**
 * The prototype's Data Gateway.
 *
 * It runs `MockGateway` — the platform's own query engine over fixture rows — inside the server
 * process, which is the arrangement the architecture requires and the earlier milestones could not
 * have: **one enforcement point, and it is not in the browser**
 * (architecture/security-architecture.md P2).
 *
 * What that buys, concretely, over running the same class in the client:
 *
 *  - The logical→physical map never crosses the network. The catalog's `physical` blocks stay in
 *    this process; the client projection has them stripped.
 *  - Row and column entitlement are resolved from the caller's capabilities here, so a client that
 *    asked for a restricted column receives `partial` and cannot see what it was denied.
 *  - One batch, one entitlement resolution, one correlation id — the audit unit is the render.
 *
 * The prototype's honest deviation, stated here because it is a real one: **the client sends the
 * data source definitions with the batch.** A production gateway resolves them server-side from
 * the pinned definition version and never trusts a client-supplied query shape. The prototype needs
 * it because a generated draft is previewed before it is saved, so its sources do not yet exist in
 * the store. The mitigation is that the shapes are still validated against the catalog and the cost
 * guards still apply — but a tampered shape is accepted here in a way it must never be later.
 * Recorded in docs/implementation-status.md as the first thing M2 must close.
 */

import { readFile } from 'node:fs/promises';
import { join } from 'node:path';

import { MockGateway, buildFixtureTables, type MockEntityTable } from '@opus/data-client';
import type { BatchRequest, BatchResponse, DataSource, UserContext } from '@opus/contracts';

import { GATEWAY_LATENCY_MS, PATHS } from '../config';
import { physicalMapFor, primaryKeyFor } from './catalog';

let tables: MockEntityTable[] | null = null;

async function ensureTables(): Promise<MockEntityTable[]> {
  if (tables) return tables;
  tables = await buildFixtureTables(
    async (file) => JSON.parse(await readFile(join(PATHS.fixtures, file), 'utf8')),
    (entity) => {
      const map = physicalMapFor(entity);
      if (!map) return undefined;
      return {
        fields: map.attributes,
        measureFields: map.measures,
        primaryKey: primaryKeyFor(entity),
      };
    },
  );
  return tables;
}

export interface ExecuteOptions {
  user: UserContext;
  /** Simulated EDM data entitlements for the caller — the row/column axis EDM owns. */
  dataCapabilities: readonly string[];
  simulate?: 'none' | 'denied' | 'error' | 'empty' | 'slow';
}

export async function executeBatch(
  request: BatchRequest,
  sources: Readonly<Record<string, DataSource>>,
  options: ExecuteOptions,
): Promise<BatchResponse> {
  const gateway = new MockGateway({
    tables: await ensureTables(),
    // Data entitlements, NOT platform capabilities. The two axes are orthogonal, and conflating
    // them is the most common conceptual error available here: being allowed to open a page is not
    // being allowed to see its rows.
    capabilities: options.dataCapabilities,
    entitlementScopeHash: options.user.entitlementScopeHash,
    latencyMs: GATEWAY_LATENCY_MS,
    simulate: options.simulate ?? 'none',
  });
  return gateway.queryBatch(request, sources);
}

/** Entities the gateway can actually answer for, so `/api/health` can say so. */
export async function servedEntities(): Promise<string[]> {
  return (await ensureTables()).map((t) => t.entity);
}
