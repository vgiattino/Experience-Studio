import { describe, expect, it } from 'vitest';
import type { BatchRequest, DataSource } from '@opus/contracts';

import { MockGateway, type MockEntityTable } from './mock-gateway';

const NOW = new Date('2026-08-04T12:00:00Z');

const exceptions: MockEntityTable = {
  entity: 'dq.exception',
  rowCapability: 'edm.dq.read',
  restrictedAttributes: { 'assigned-to': 'edm.dq.assignee.read' },
  rows: [
    { 'exception-id': 'E1', severity: 'HIGH', status: 'OPEN', 'assigned-to': 'Priya', 'detected-at': '2026-08-04T08:00:00Z', 'age-hours': 4 },
    { 'exception-id': 'E2', severity: 'HIGH', status: 'OPEN', 'assigned-to': null, 'detected-at': '2026-08-03T08:00:00Z', 'age-hours': 28 },
    { 'exception-id': 'E3', severity: 'LOW', status: 'RESOLVED', 'assigned-to': 'Tom', 'detected-at': '2026-07-20T08:00:00Z', 'age-hours': 388 },
    { 'exception-id': 'E4', severity: 'MEDIUM', status: 'OPEN', 'assigned-to': 'Tom', 'detected-at': '2026-08-04T09:00:00Z', 'age-hours': 3 },
  ],
};

function gateway(capabilities: string[], simulate: 'none' | 'denied' | 'error' | 'empty' = 'none') {
  return new MockGateway({
    tables: [exceptions],
    capabilities,
    entitlementScopeHash: `scope-${capabilities.length}`,
    latencyMs: 0,
    simulate,
    now: () => NOW,
  });
}

const listSource: DataSource = {
  id: 'queue',
  entity: 'dq.exception',
  kind: 'list',
  select: {
    attributes: [
      { attribute: 'exception-id', alias: 'id' },
      { attribute: 'severity', alias: 'severity' },
      { attribute: 'status', alias: 'status' },
      { attribute: 'assigned-to', alias: 'assignee' },
    ],
  },
  filter: { all: [{ target: 'status', operator: 'eq', value: 'OPEN' }] },
};

const request = (key: string, params: Record<string, unknown> = {}): BatchRequest => ({
  context: { pageId: 'p', definitionVersion: 1 },
  queries: [{ key, dataSourceId: key, params }],
});

const FULL = ['edm.dq.read', 'edm.dq.assignee.read'];

describe('projection', () => {
  it('returns only the selected attributes, keyed by alias', () => {
    return gateway(FULL)
      .queryBatch(request('queue'), { queue: listSource })
      .then(({ results }) => {
        expect(results[0]!.status).toBe('ok');
        expect(Object.keys(results[0]!.rows[0]!).sort()).toEqual([
          'assignee',
          'id',
          'severity',
          'status',
        ]);
      });
  });
});

describe('column entitlement produces `partial`, not a lie', () => {
  it('removes the denied column from the projection and reports it', async () => {
    const { results } = await gateway(['edm.dq.read']).queryBatch(request('queue'), {
      queue: listSource,
    });
    expect(results[0]!.status).toBe('partial');
    expect(results[0]!.deniedFields).toEqual(['assignee']);
    expect(results[0]!.rows[0]).not.toHaveProperty('assignee');
  });

  it('returns `ok` when the caller holds the column entitlement', async () => {
    const { results } = await gateway(FULL).queryBatch(request('queue'), { queue: listSource });
    expect(results[0]!.status).toBe('ok');
    expect(results[0]!.deniedFields).toBeUndefined();
  });
});

describe('row entitlement produces `denied`', () => {
  it('returns no rows and an entitlement problem when the capability is absent', async () => {
    const { results } = await gateway([]).queryBatch(request('queue'), { queue: listSource });
    expect(results[0]!.status).toBe('denied');
    expect(results[0]!.rows).toHaveLength(0);
    expect(results[0]!.problem?.category).toBe('entitlement');
  });
});

describe('filters', () => {
  const withFilter = (filter: DataSource['filter']): DataSource => ({ ...listSource, filter });

  it('applies eq and in', async () => {
    const { results } = await gateway(FULL).queryBatch(request('queue'), {
      queue: withFilter({ all: [{ target: 'severity', operator: 'in', value: ['HIGH'] }] }),
    });
    expect(results[0]!.rows.map((r) => r['id'])).toEqual(['E1', 'E2']);
  });

  it('skips an empty clause by default, so an unset filter means no constraint', async () => {
    // This default removes the commonest cause of mysteriously empty dashboards.
    const { results } = await gateway(FULL).queryBatch(request('queue'), {
      queue: withFilter({ all: [{ target: 'severity', operator: 'in', value: [] }] }),
    });
    expect(results[0]!.rows).toHaveLength(4);
  });

  it('honours skipWhenEmpty: false as match-nothing', async () => {
    const { results } = await gateway(FULL).queryBatch(request('queue'), {
      queue: withFilter({
        all: [{ target: 'severity', operator: 'in', value: [], skipWhenEmpty: false }],
      }),
    });
    expect(results[0]!.status).toBe('empty');
  });

  it('resolves inLast against the supplied clock', async () => {
    const { results } = await gateway(FULL).queryBatch(request('queue'), {
      queue: withFilter({
        all: [{ target: 'detected-at', operator: 'inLast', value: 2, unit: 'day' }],
      }),
    });
    expect(results[0]!.rows.map((r) => r['id'])).toEqual(['E1', 'E2', 'E4']);
  });

  it('supports any and not', async () => {
    const { results } = await gateway(FULL).queryBatch(request('queue'), {
      queue: withFilter({
        any: [
          { target: 'severity', operator: 'eq', value: 'LOW' },
          { not: { target: 'status', operator: 'eq', value: 'OPEN' } },
        ],
      }),
    });
    expect(results[0]!.rows.map((r) => r['id'])).toEqual(['E3']);
  });

  it('resolves parameter values passed by the orchestrator', async () => {
    const { results } = await gateway(FULL).queryBatch(
      request('queue', { severity: ['MEDIUM'] }),
      {
        queue: withFilter({
          all: [{ target: 'severity', operator: 'in', value: { $filter: 'severity' } }],
        }),
      },
    );
    expect(results[0]!.rows.map((r) => r['id'])).toEqual(['E4']);
  });
});

describe('aggregation', () => {
  const aggregate = (
    select: DataSource['select'],
    filter?: DataSource['filter'],
  ): DataSource => ({ id: 'agg', entity: 'dq.exception', kind: 'aggregate', select, filter });

  it('produces exactly one row for a dimensionless aggregate', async () => {
    const { results } = await gateway(FULL).queryBatch(request('agg'), {
      agg: aggregate({
        measures: [{ measure: 'exception-count', aggregation: 'count', alias: 'total' }],
      }),
    });
    expect(results[0]!.rows).toHaveLength(1);
    expect(results[0]!.rows[0]!['total']).toBe(4);
  });

  it('groups by a dimension', async () => {
    const { results } = await gateway(FULL).queryBatch(request('agg'), {
      agg: aggregate({
        measures: [{ measure: 'exception-count', aggregation: 'count', alias: 'count' }],
        dimensions: [{ attribute: 'severity', alias: 'severity' }],
      }),
    });
    const rows = results[0]!.rows;
    expect(rows).toHaveLength(3);
    expect(rows.find((r) => r['severity'] === 'HIGH')!['count']).toBe(2);
  });

  it('buckets a datetime dimension by day', async () => {
    const { results } = await gateway(FULL).queryBatch(request('agg'), {
      agg: aggregate({
        measures: [{ measure: 'exception-count', aggregation: 'count', alias: 'count' }],
        dimensions: [{ attribute: 'detected-at', alias: 'day', granularity: 'day' }],
      }),
    });
    const days = results[0]!.rows.map((r) => r['day']);
    expect(days).toContain('2026-08-04');
    expect(results[0]!.rows.find((r) => r['day'] === '2026-08-04')!['count']).toBe(2);
  });

  it('applies sum, avg and max to a measure', async () => {
    const { results } = await gateway(FULL).queryBatch(request('agg'), {
      agg: aggregate({
        measures: [
          { measure: 'age-hours', aggregation: 'sum', alias: 'sum' },
          { measure: 'age-hours', aggregation: 'max', alias: 'max' },
          { measure: 'age-hours', aggregation: 'avg', alias: 'avg' },
        ],
      }),
    });
    const row = results[0]!.rows[0]!;
    expect(row['sum']).toBe(423);
    expect(row['max']).toBe(388);
    expect(row['avg']).toBeCloseTo(105.75, 2);
  });
});

describe('per-query independent status', () => {
  it('statuses each query separately within one batch', async () => {
    const gw = gateway(['edm.dq.read']);
    const { results } = await gw.queryBatch(
      {
        context: { pageId: 'p', definitionVersion: 1 },
        queries: [
          { key: 'queue', dataSourceId: 'queue', params: {} },
          { key: 'missing', dataSourceId: 'missing', params: {} },
        ],
      },
      { queue: listSource },
    );
    expect(results.find((r) => r.key === 'queue')!.status).toBe('partial');
    expect(results.find((r) => r.key === 'missing')!.status).toBe('error');
  });
});

describe('server-decided response metadata', () => {
  it('returns a TTL and an entitlement scope hash on every result', async () => {
    const { results } = await gateway(FULL).queryBatch(request('queue'), {
      queue: { ...listSource, cacheTtlHintSeconds: 30 },
    });
    expect(results[0]!.ttlSeconds).toBe(30);
    expect(results[0]!.entitlementScopeHash).toBe('scope-2');
  });
});

describe('simulation switches', () => {
  it('forces denied', async () => {
    const { results } = await gateway(FULL, 'denied').queryBatch(request('queue'), {
      queue: listSource,
    });
    expect(results[0]!.status).toBe('denied');
  });

  it('forces an upstream error', async () => {
    const { results } = await gateway(FULL, 'error').queryBatch(request('queue'), {
      queue: listSource,
    });
    expect(results[0]!.status).toBe('error');
    expect(results[0]!.problem?.category).toBe('upstream');
  });

  it('forces empty', async () => {
    const { results } = await gateway(FULL, 'empty').queryBatch(request('queue'), {
      queue: listSource,
    });
    expect(results[0]!.status).toBe('empty');
  });
});

describe('sorting and paging', () => {
  it('sorts by the declared field and direction', async () => {
    const { results } = await gateway(FULL).queryBatch(request('queue'), {
      queue: { ...listSource, filter: undefined, sort: [{ field: 'severity', direction: 'asc' }] },
    });
    expect(results[0]!.rows.map((r) => r['severity'])).toEqual(['HIGH', 'HIGH', 'LOW', 'MEDIUM']);
  });

  it('reports totalRows alongside a paged result', async () => {
    const { results } = await gateway(FULL).queryBatch(request('queue'), {
      queue: { ...listSource, filter: undefined, paging: { mode: 'offset', pageSize: 2 } },
    });
    expect(results[0]!.rows).toHaveLength(2);
    expect(results[0]!.totalRows).toBe(4);
  });
});
