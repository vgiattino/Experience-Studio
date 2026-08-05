/**
 * Mock Data Gateway.
 *
 * Stands in for the real gateway (architecture/backend-architecture.md §2.2) so M1
 * can prove the data source model is *executable* rather than merely well-formed:
 * filters, aggregation, grouping, sorting and paging are all resolved from the
 * declarative model, with no SQL and no physical object named anywhere.
 *
 * WHAT THIS MOCK DELIBERATELY MIRRORS FROM THE REAL DESIGN
 *   - one batch call per page render, with per-query independent status
 *   - the server, not the client, decides cache TTL
 *   - every response carries an entitlement scope hash
 *   - column entitlement produces `partial`; row entitlement produces `denied`
 *
 * WHAT IT CANNOT MIRROR
 *   - real enforcement. Here the "entitlements" are fixture configuration. In
 *     production they are resolved from the caller's identity against EDM, and
 *     that resolution is the security boundary — never anything in a definition.
 */

import type {
  BatchRequest,
  BatchResponse,
  DataRow,
  DataSource,
  FilterClause,
  FilterNode,
  QueryResult,
  Select,
} from '@opus/contracts';

export interface MockEntityTable {
  entity: string;
  rows: readonly DataRow[];
  /** Attributes requiring a capability the caller may lack — produces `partial`. */
  restrictedAttributes?: Readonly<Record<string, string>>;
  /** Capability required to read any row at all — its absence produces `denied`. */
  rowCapability?: string;
  /**
   * Logical attribute id → physical column. Supplied by the catalog's `physical` block,
   * which is server-side only and never appears in a definition or in anything the model
   * sees (schemas/README.md R6).
   *
   * The gateway is where the two vocabularies meet, and it is the ONLY place they may.
   * A definition says `security-id`; the store holds `security_id`; nothing between them
   * needs to know. Without this, a generated page binds to catalog identifiers and reads
   * nothing, and the natural fix — renaming catalog ids to match columns — would leak the
   * physical schema into the semantic layer and make every EDM rename a breaking change
   * to every page.
   *
   * An absent entry means the logical id is also the column, so a fixture that happens to
   * match needs no map at all.
   */
  fields?: Readonly<Record<string, string>>;
  /**
   * Logical measure id → physical column. `null` means the measure needs no column
   * because it counts rows (`late-file-count` is a count over a filter, not a stored
   * number), in which case a distinct-count falls back to the primary key.
   */
  measureFields?: Readonly<Record<string, string | null>>;
  /** Logical primary key, used when a countable measure has no column of its own. */
  primaryKey?: readonly string[];
}

export interface MockGatewayOptions {
  tables: readonly MockEntityTable[];
  /** Capabilities the simulated caller holds. */
  capabilities: readonly string[];
  entitlementScopeHash: string;
  /** Artificial latency, so loading states are visible and testable. */
  latencyMs?: number;
  /** Forces every query into one outcome. Drives the ?simulate= demo switch. */
  simulate?: 'none' | 'denied' | 'error' | 'empty' | 'slow';
  now?: () => Date;
}

const DEFAULT_TTL = 60;

export class MockGateway {
  constructor(private readonly options: MockGatewayOptions) {}

  private table(entity: string): MockEntityTable | undefined {
    return this.options.tables.find((t) => t.entity === entity);
  }

  async queryBatch(
    request: BatchRequest,
    sources: Readonly<Record<string, DataSource>>,
  ): Promise<BatchResponse> {
    const startedAt = Date.now();
    const simulate = this.options.simulate ?? 'none';
    const latency = (this.options.latencyMs ?? 0) * (simulate === 'slow' ? 8 : 1);
    if (latency > 0) await new Promise((resolve) => setTimeout(resolve, latency));

    const results = request.queries.map((query): QueryResult => {
      const source = sources[query.dataSourceId];
      const queryStart = Date.now();

      if (!source) {
        return {
          key: query.key,
          status: 'error',
          rows: [],
          problem: {
            category: 'semantic',
            code: 'unknownDataSource',
            detail: `Data source "${query.dataSourceId}" is not declared on this page`,
          },
          durationMs: Date.now() - queryStart,
        };
      }

      if (simulate === 'error') {
        return {
          key: query.key,
          status: 'error',
          rows: [],
          problem: {
            category: 'upstream',
            code: 'simulatedUpstreamFailure',
            detail: 'Simulated EDM failure (?simulate=error)',
          },
          entitlementScopeHash: this.options.entitlementScopeHash,
          durationMs: Date.now() - queryStart,
        };
      }

      const table = this.table(source.entity);
      if (!table) {
        return {
          key: query.key,
          status: 'error',
          rows: [],
          problem: {
            category: 'semantic',
            code: 'unknownEntity',
            detail: `No fixture table for entity "${source.entity}"`,
          },
          durationMs: Date.now() - queryStart,
        };
      }

      // Row-level entitlement. In production this becomes predicates injected
      // server-side from the caller's identity; here it is all-or-nothing.
      const rowDenied =
        simulate === 'denied' ||
        (table.rowCapability !== undefined &&
          !this.options.capabilities.includes(table.rowCapability));

      if (rowDenied) {
        return {
          key: query.key,
          status: 'denied',
          rows: [],
          problem: {
            category: 'entitlement',
            code: 'rowEntitlementDenied',
            detail: `Caller is not entitled to ${source.entity}`,
          },
          entitlementScopeHash: this.options.entitlementScopeHash,
          durationMs: Date.now() - queryStart,
        };
      }

      // Column-level entitlement: denied fields are removed from the projection
      // AND reported, so the widget can degrade to `partial` rather than lie.
      const deniedFields = this.deniedFieldsFor(source.select, table);

      let rows = simulate === 'empty' ? [] : [...table.rows];
      rows = rows.filter((row) => this.matches(row, source.filter, query.params, table));
      rows = this.project(rows, source, query.params, deniedFields, table);
      rows = this.sort(rows, source);

      const totalRows = rows.length;
      const limit = source.paging?.pageSize ?? source.paging?.maxRows;
      const paged = limit ? rows.slice(0, limit) : rows;

      const status: QueryResult['status'] =
        paged.length === 0 ? 'empty' : deniedFields.length ? 'partial' : 'ok';

      return {
        key: query.key,
        status,
        rows: paged,
        totalRows,
        deniedFields: deniedFields.length ? deniedFields : undefined,
        ttlSeconds: source.cacheTtlHintSeconds ?? DEFAULT_TTL,
        entitlementScopeHash: this.options.entitlementScopeHash,
        durationMs: Date.now() - queryStart,
      };
    });

    return {
      results,
      correlationId: `mock-${startedAt.toString(36)}`,
      durationMs: Date.now() - startedAt,
    };
  }

  private deniedFieldsFor(select: Select, table: MockEntityTable): string[] {
    const restricted = table.restrictedAttributes ?? {};
    const denied: string[] = [];
    for (const attribute of select.attributes ?? []) {
      const required = restricted[attribute.attribute];
      if (required && !this.options.capabilities.includes(required)) denied.push(attribute.alias);
    }
    return denied;
  }

  // ── logical → physical resolution ─────────────────────────────────────────

  /** The column an attribute id reads from. Unmapped ids are their own column. */
  private column(table: MockEntityTable, attributeId: string): string {
    return table.fields?.[attributeId] ?? attributeId;
  }

  /** The column a measure aggregates over, or null when it counts rows. */
  private measureColumn(table: MockEntityTable, measureId: string): string | null {
    const map = table.measureFields;
    if (map && Object.prototype.hasOwnProperty.call(map, measureId)) {
      const physical = map[measureId];
      return physical ?? this.column(table, table.primaryKey?.[0] ?? measureId);
    }
    return this.column(table, measureId);
  }

  // ── filtering ─────────────────────────────────────────────────────────────

  private matches(
    row: DataRow,
    node: FilterNode | undefined,
    params: Readonly<Record<string, unknown>>,
    table: MockEntityTable,
  ): boolean {
    if (!node) return true;
    if ('all' in node) return node.all.every((child) => this.matches(row, child, params, table));
    if ('any' in node) return node.any.some((child) => this.matches(row, child, params, table));
    if ('not' in node) return !this.matches(row, node.not, params, table);
    return this.matchesClause(row, node, params, table);
  }

  private matchesClause(
    row: DataRow,
    clause: FilterClause,
    params: Readonly<Record<string, unknown>>,
    table: MockEntityTable,
  ): boolean {
    /**
     * Resolution order matters, and getting it wrong is subtle.
     *
     * The client resolves only values that depend on PAGE STATE ($param, $filter,
     * $selection, $expr) and sends them as params. Literals declared in the
     * definition are the server's to read — it holds the definition. Falling back to
     * the literal here is what makes the gateway correct on its own rather than
     * dependent on the client having echoed the definition back to it.
     */
    const supplied =
      params[`${clause.target}@${clause.operator}`] ?? params[clause.target];
    const value = supplied ?? literalOf(clause.value);
    // The param channel is keyed logically — the client only ever speaks the semantic
    // vocabulary — while the row is read through the physical map.
    const actual = row[this.column(table, clause.target)] ?? null;

    // `skipWhenEmpty` defaults to true: an unset filter channel means "no
    // constraint", not "match nothing". Without it every dashboard needs
    // conditional logic and unset filters silently empty the page.
    const empty =
      value === null ||
      value === undefined ||
      value === '' ||
      (Array.isArray(value) && value.length === 0);
    const needsValue = !['isNull', 'isNotNull', 'onOrAfterToday', 'beforeToday'].includes(
      clause.operator,
    );
    if (needsValue && empty) return clause.skipWhenEmpty !== false;

    const now = (this.options.now ?? (() => new Date()))();

    switch (clause.operator) {
      case 'eq':
        return sameValue(actual, value);
      case 'ne':
        return !sameValue(actual, value);
      case 'in':
        return toArray(value).some((v) => sameValue(actual, v));
      case 'notIn':
        return !toArray(value).some((v) => sameValue(actual, v));
      case 'gt':
        return compareLoose(actual, value) > 0;
      case 'gte':
        return compareLoose(actual, value) >= 0;
      case 'lt':
        return compareLoose(actual, value) < 0;
      case 'lte':
        return compareLoose(actual, value) <= 0;
      case 'between': {
        const [lo, hi] = toArray(value);
        return compareLoose(actual, lo) >= 0 && compareLoose(actual, hi) <= 0;
      }
      case 'contains':
        return normalize(actual, clause).includes(normalize(value, clause));
      case 'startsWith':
        return normalize(actual, clause).startsWith(normalize(value, clause));
      case 'endsWith':
        return normalize(actual, clause).endsWith(normalize(value, clause));
      case 'isNull':
        return actual === null || actual === undefined;
      case 'isNotNull':
        return actual !== null && actual !== undefined;
      case 'inLast': {
        const date = asDate(actual);
        if (!date) return false;
        const from = subtract(now, Number(value) || 0, clause.unit ?? 'day');
        return date.getTime() >= from.getTime() && date.getTime() <= now.getTime();
      }
      case 'inNext': {
        const date = asDate(actual);
        if (!date) return false;
        const to = subtract(now, -(Number(value) || 0), clause.unit ?? 'day');
        return date.getTime() >= now.getTime() && date.getTime() <= to.getTime();
      }
      case 'onOrAfterToday': {
        const date = asDate(actual);
        return date ? date.getTime() >= startOfDay(now).getTime() : false;
      }
      case 'beforeToday': {
        const date = asDate(actual);
        return date ? date.getTime() < startOfDay(now).getTime() : false;
      }
      default:
        return true;
    }
  }

  // ── projection and aggregation ────────────────────────────────────────────

  private project(
    rows: readonly DataRow[],
    source: DataSource,
    params: Readonly<Record<string, unknown>>,
    deniedFields: readonly string[],
    table: MockEntityTable,
  ): DataRow[] {
    const { select, kind } = source;

    if (kind === 'aggregate') {
      return this.aggregate(rows, select, table);
    }

    if (kind === 'single') {
      const keyed = rows.filter((row) =>
        Object.entries(select.key ?? {}).every(([attribute]) =>
          sameValue(row[this.column(table, attribute)], params[attribute]),
        ),
      );
      const first = keyed[0] ?? rows[0];
      return first ? [this.selectAttributes(first, select, deniedFields, table)] : [];
    }

    return rows.map((row) => this.selectAttributes(row, select, deniedFields, table));
  }

  private selectAttributes(
    row: DataRow,
    select: Select,
    deniedFields: readonly string[],
    table: MockEntityTable,
  ): DataRow {
    const out: Record<string, unknown> = {};
    for (const attribute of select.attributes ?? []) {
      if (deniedFields.includes(attribute.alias)) continue;
      // Keyed by ALIAS, not by column: everything downstream of the gateway — bindings,
      // expressions, sort specs — addresses the projected row, never the store.
      out[attribute.alias] = row[this.column(table, attribute.attribute)] ?? null;
    }
    return out;
  }

  private aggregate(rows: readonly DataRow[], select: Select, table: MockEntityTable): DataRow[] {
    const dimensions = select.dimensions ?? [];
    const measures = select.measures ?? [];

    const groups = new Map<string, { key: Record<string, unknown>; rows: DataRow[] }>();
    for (const row of rows) {
      const key: Record<string, unknown> = {};
      for (const dimension of dimensions) {
        key[dimension.alias] = bucket(
          row[this.column(table, dimension.attribute)],
          dimension.granularity,
        );
      }
      const signature = JSON.stringify(key);
      const existing = groups.get(signature);
      if (existing) existing.rows.push(row);
      else groups.set(signature, { key, rows: [row] });
    }

    // A dimensionless aggregate is still one group, so a KPI gets exactly one row.
    if (!dimensions.length && !groups.size) {
      groups.set('{}', { key: {}, rows: [] });
    }

    const out: DataRow[] = [];
    for (const { key, rows: groupRows } of groups.values()) {
      const record: Record<string, unknown> = { ...key };
      for (const measure of measures) {
        record[measure.alias] = applyAggregation(
          measure.aggregation ?? 'count',
          groupRows,
          this.measureColumn(table, measure.measure) ?? measure.measure,
        );
      }
      out.push(record);
    }

    for (const dimension of dimensions) {
      if (dimension.limit && out.length > dimension.limit) out.length = dimension.limit;
    }

    return out;
  }

  private sort(rows: DataRow[], source: DataSource): DataRow[] {
    const specs = source.sort ?? [];
    if (!specs.length) return rows;
    return [...rows].sort((a, b) => {
      for (const spec of specs) {
        const direction = spec.direction === 'desc' ? -1 : 1;
        const result = compareLoose(a[spec.field], b[spec.field]) * direction;
        if (result !== 0) return result;
      }
      return 0;
    });
  }
}

// ── helpers ─────────────────────────────────────────────────────────────────

function applyAggregation(
  aggregation: string,
  rows: readonly DataRow[],
  field: string,
): number | null {
  if (aggregation === 'count') return rows.length;
  const values = rows
    .map((row) => Number(row[field]))
    .filter((n) => Number.isFinite(n));

  switch (aggregation) {
    case 'countDistinct':
      return new Set(rows.map((row) => row[field])).size;
    case 'sum':
      return values.reduce((a, b) => a + b, 0);
    case 'avg':
      return values.length ? values.reduce((a, b) => a + b, 0) / values.length : null;
    case 'min':
      return values.length ? Math.min(...values) : null;
    case 'max':
      return values.length ? Math.max(...values) : null;
    case 'median': {
      if (!values.length) return null;
      const sorted = [...values].sort((a, b) => a - b);
      const mid = Math.floor(sorted.length / 2);
      return sorted.length % 2 ? sorted[mid]! : (sorted[mid - 1]! + sorted[mid]!) / 2;
    }
    case 'p90':
    case 'p95':
    case 'p99': {
      if (!values.length) return null;
      const p = Number(aggregation.slice(1)) / 100;
      const sorted = [...values].sort((a, b) => a - b);
      return sorted[Math.min(sorted.length - 1, Math.floor(p * sorted.length))]!;
    }
    case 'first':
      return values[0] ?? null;
    case 'last':
      return values.at(-1) ?? null;
    default:
      return rows.length;
  }
}

function bucket(value: unknown, granularity: string | undefined): unknown {
  if (!granularity) return value ?? null;
  const date = asDate(value);
  if (!date) return value ?? null;
  switch (granularity) {
    case 'day':
      return date.toISOString().slice(0, 10);
    case 'month':
      return date.toISOString().slice(0, 7);
    case 'year':
      return String(date.getUTCFullYear());
    case 'week': {
      const start = new Date(date.getTime());
      start.setUTCDate(start.getUTCDate() - ((start.getUTCDay() + 6) % 7));
      return start.toISOString().slice(0, 10);
    }
    case 'quarter':
      return `${date.getUTCFullYear()}-Q${Math.floor(date.getUTCMonth() / 3) + 1}`;
    case 'hour':
      return `${date.toISOString().slice(0, 13)}:00`;
    default:
      return value ?? null;
  }
}

/**
 * A clause value that is a plain literal, rather than a page-state wrapper.
 * Wrappers ($param / $filter / $selection / $expr) are resolved by the client and
 * arrive as params; anything else is a literal the server reads directly.
 */
function literalOf(value: unknown): unknown {
  if (value === null || value === undefined) return undefined;
  if (Array.isArray(value)) return value;
  if (typeof value !== 'object') return value;
  const keys = Object.keys(value as object);
  const isWrapper =
    keys.length === 1 &&
    ['$param', '$filter', '$selection', '$expr', '$context'].includes(keys[0]!);
  return isWrapper ? undefined : value;
}

function toArray(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [value];
}

function sameValue(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (a === null || a === undefined || b === null || b === undefined) return false;
  return String(a) === String(b);
}

function normalize(value: unknown, clause: FilterClause): string {
  const s = value === null || value === undefined ? '' : String(value);
  return clause.caseSensitive ? s : s.toLowerCase();
}

function compareLoose(a: unknown, b: unknown): number {
  if (a === b) return 0;
  if (a === null || a === undefined) return -1;
  if (b === null || b === undefined) return 1;
  const na = Number(a);
  const nb = Number(b);
  if (Number.isFinite(na) && Number.isFinite(nb)) return na - nb;
  const da = asDate(a);
  const db = asDate(b);
  if (da && db) return da.getTime() - db.getTime();
  return String(a).localeCompare(String(b));
}

function asDate(value: unknown): Date | null {
  if (value instanceof Date) return value;
  if (typeof value === 'string' || typeof value === 'number') {
    const d = new Date(value);
    return Number.isNaN(d.getTime()) ? null : d;
  }
  return null;
}

function startOfDay(date: Date): Date {
  const out = new Date(date.getTime());
  out.setHours(0, 0, 0, 0);
  return out;
}

const UNIT_MS: Record<string, number> = {
  minute: 60_000,
  hour: 3_600_000,
  day: 86_400_000,
  week: 604_800_000,
};

function subtract(from: Date, amount: number, unit: string): Date {
  const out = new Date(from.getTime());
  if (UNIT_MS[unit] !== undefined) {
    out.setTime(out.getTime() - amount * UNIT_MS[unit]!);
    return out;
  }
  switch (unit) {
    case 'month':
      out.setMonth(out.getMonth() - amount);
      return out;
    case 'quarter':
      out.setMonth(out.getMonth() - amount * 3);
      return out;
    case 'year':
      out.setFullYear(out.getFullYear() - amount);
      return out;
    case 'businessDay': {
      let remaining = Math.abs(amount);
      const step = amount >= 0 ? -1 : 1;
      while (remaining > 0) {
        out.setDate(out.getDate() + step);
        const day = out.getDay();
        if (day !== 0 && day !== 6) remaining--;
      }
      return out;
    }
    default:
      return out;
  }
}
