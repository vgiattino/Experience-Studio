/**
 * The closed function library (schemas/expression-grammar.md §4).
 *
 * Closed by design: a function not listed here is a *design-time* validation
 * error, so an AI-generated expression calling an invented function is caught
 * before publication rather than failing at render.
 *
 * Every function is total — it returns null rather than throwing, so one bad
 * expression degrades one widget instead of failing a page (§6).
 */

export interface FunctionDef {
  minArgs: number;
  /** null means variadic. */
  maxArgs: number | null;
  /** Lazily-evaluated arguments, so `if` does not evaluate both branches. */
  lazy?: boolean;
  apply: (args: unknown[], ctx: FunctionContext) => unknown;
}

export interface FunctionContext {
  /** Render-pass instant. Constant within a pass, so expressions stay deterministic. */
  now: Date;
  timezone: string;
  locale: string;
  /** Used only by `lazy` functions. */
  evaluate?: (index: number) => unknown;
}

const num = (v: unknown): number | null => {
  if (typeof v === 'number') return Number.isFinite(v) ? v : null;
  if (typeof v === 'string' && v.trim() !== '') {
    const n = Number(v);
    return Number.isFinite(n) ? n : null;
  }
  if (typeof v === 'boolean') return v ? 1 : 0;
  return null;
};

const str = (v: unknown): string => {
  if (v === null || v === undefined) return '';
  if (v instanceof Date) return v.toISOString();
  if (typeof v === 'object') return JSON.stringify(v);
  return String(v);
};

const asDate = (v: unknown): Date | null => {
  if (v instanceof Date) return Number.isNaN(v.getTime()) ? null : v;
  if (typeof v === 'number') return new Date(v);
  if (typeof v === 'string') {
    const d = new Date(v);
    return Number.isNaN(d.getTime()) ? null : d;
  }
  return null;
};

const asArray = (v: unknown): unknown[] | null => (Array.isArray(v) ? v : null);

/** Flatten a path result that may be a single value or a mapped array of values. */
const numericValues = (v: unknown): number[] => {
  const arr = Array.isArray(v) ? v : [v];
  return arr.map(num).filter((n): n is number => n !== null);
};

const MS: Record<string, number> = {
  minute: 60_000,
  hour: 3_600_000,
  day: 86_400_000,
  week: 604_800_000,
};

function dateDiff(a: unknown, b: unknown, unit: unknown): number | null {
  const from = asDate(a);
  const to = asDate(b);
  const u = str(unit);
  if (!from || !to) return null;
  const ms = to.getTime() - from.getTime();
  if (MS[u] !== undefined) return ms / MS[u]!;
  switch (u) {
    case 'month':
      return (
        (to.getFullYear() - from.getFullYear()) * 12 + (to.getMonth() - from.getMonth())
      );
    case 'quarter':
      return (
        ((to.getFullYear() - from.getFullYear()) * 12 + (to.getMonth() - from.getMonth())) / 3
      );
    case 'year':
      return to.getFullYear() - from.getFullYear();
    case 'businessDay': {
      // Inclusive-of-start, exclusive-of-end weekday count.
      const step = ms >= 0 ? 1 : -1;
      let days = 0;
      const cursor = new Date(from.getTime());
      while (step > 0 ? cursor < to : cursor > to) {
        cursor.setDate(cursor.getDate() + step);
        const day = cursor.getDay();
        if (day !== 0 && day !== 6) days += step;
      }
      return days;
    }
    default:
      return null;
  }
}

function dateAdd(v: unknown, n: unknown, unit: unknown): Date | null {
  const d = asDate(v);
  const amount = num(n);
  const u = str(unit);
  if (!d || amount === null) return null;
  const out = new Date(d.getTime());
  if (MS[u] !== undefined) {
    out.setTime(out.getTime() + amount * MS[u]!);
    return out;
  }
  switch (u) {
    case 'month':
      out.setMonth(out.getMonth() + amount);
      return out;
    case 'quarter':
      out.setMonth(out.getMonth() + amount * 3);
      return out;
    case 'year':
      out.setFullYear(out.getFullYear() + amount);
      return out;
    case 'businessDay': {
      const step = amount >= 0 ? 1 : -1;
      let remaining = Math.abs(amount);
      while (remaining > 0) {
        out.setDate(out.getDate() + step);
        const day = out.getDay();
        if (day !== 0 && day !== 6) remaining--;
      }
      return out;
    }
    default:
      return null;
  }
}

function startOf(v: unknown, unit: unknown): Date | null {
  const d = asDate(v);
  if (!d) return null;
  const out = new Date(d.getTime());
  switch (str(unit)) {
    case 'minute':
      out.setSeconds(0, 0);
      return out;
    case 'hour':
      out.setMinutes(0, 0, 0);
      return out;
    case 'day':
      out.setHours(0, 0, 0, 0);
      return out;
    case 'week': {
      out.setHours(0, 0, 0, 0);
      const shift = (out.getDay() + 6) % 7; // Monday-first
      out.setDate(out.getDate() - shift);
      return out;
    }
    case 'month':
      out.setHours(0, 0, 0, 0);
      out.setDate(1);
      return out;
    case 'quarter':
      out.setHours(0, 0, 0, 0);
      out.setMonth(Math.floor(out.getMonth() / 3) * 3, 1);
      return out;
    case 'year':
      out.setHours(0, 0, 0, 0);
      out.setMonth(0, 1);
      return out;
    default:
      return null;
  }
}

export const FUNCTIONS: Record<string, FunctionDef> = {
  // ── conditional (lazy, so only the taken branch evaluates)
  if: {
    minArgs: 3,
    maxArgs: 3,
    lazy: true,
    apply: (_args, ctx) => (ctx.evaluate!(0) ? ctx.evaluate!(1) : ctx.evaluate!(2)),
  },

  // ── null and type
  isNull: { minArgs: 1, maxArgs: 1, apply: ([v]) => v === null || v === undefined },
  isEmpty: {
    minArgs: 1,
    maxArgs: 1,
    apply: ([v]) =>
      v === null ||
      v === undefined ||
      v === '' ||
      (Array.isArray(v) && v.length === 0) ||
      (typeof v === 'object' && !Array.isArray(v) && Object.keys(v as object).length === 0),
  },
  coalesce: {
    minArgs: 1,
    maxArgs: null,
    apply: (args) => args.find((a) => a !== null && a !== undefined) ?? null,
  },
  toNumber: { minArgs: 1, maxArgs: 1, apply: ([v]) => num(v) },
  toText: { minArgs: 1, maxArgs: 1, apply: ([v]) => str(v) },
  toDate: { minArgs: 1, maxArgs: 1, apply: ([v]) => asDate(v) },

  // ── text
  concat: { minArgs: 1, maxArgs: null, apply: (args) => args.map(str).join('') },
  upper: { minArgs: 1, maxArgs: 1, apply: ([v]) => str(v).toUpperCase() },
  lower: { minArgs: 1, maxArgs: 1, apply: ([v]) => str(v).toLowerCase() },
  trim: { minArgs: 1, maxArgs: 1, apply: ([v]) => str(v).trim() },
  contains: { minArgs: 2, maxArgs: 2, apply: ([s, sub]) => str(s).includes(str(sub)) },
  startsWith: { minArgs: 2, maxArgs: 2, apply: ([s, p]) => str(s).startsWith(str(p)) },
  endsWith: { minArgs: 2, maxArgs: 2, apply: ([s, p]) => str(s).endsWith(str(p)) },
  length: {
    minArgs: 1,
    maxArgs: 1,
    apply: ([v]) => (Array.isArray(v) ? v.length : str(v).length),
  },
  substring: {
    minArgs: 2,
    maxArgs: 3,
    apply: ([s, start, len]) => {
      const from = num(start) ?? 0;
      const count = len === undefined ? undefined : (num(len) ?? undefined);
      return count === undefined ? str(s).slice(from) : str(s).slice(from, from + count);
    },
  },
  replace: {
    minArgs: 3,
    maxArgs: 3,
    apply: ([s, find, withText]) => str(s).split(str(find)).join(str(withText)),
  },
  split: { minArgs: 2, maxArgs: 2, apply: ([s, sep]) => str(s).split(str(sep)) },
  format: {
    minArgs: 1,
    maxArgs: null,
    apply: (args) => {
      const template = str(args[0]);
      return template.replace(/\{(\d+)\}/g, (_m, index: string) => {
        const value = args[Number(index) + 1];
        return value === undefined ? '' : str(value);
      });
    },
  },

  // ── numeric
  abs: { minArgs: 1, maxArgs: 1, apply: ([v]) => { const n = num(v); return n === null ? null : Math.abs(n); } },
  round: {
    minArgs: 1,
    maxArgs: 2,
    apply: ([v, dp]) => {
      const n = num(v);
      if (n === null) return null;
      const places = num(dp) ?? 0;
      const factor = 10 ** places;
      return Math.round(n * factor) / factor;
    },
  },
  floor: { minArgs: 1, maxArgs: 1, apply: ([v]) => { const n = num(v); return n === null ? null : Math.floor(n); } },
  ceil: { minArgs: 1, maxArgs: 1, apply: ([v]) => { const n = num(v); return n === null ? null : Math.ceil(n); } },
  min: {
    minArgs: 1,
    maxArgs: null,
    apply: (args) => {
      const values = args.flatMap(numericValues);
      return values.length ? Math.min(...values) : null;
    },
  },
  max: {
    minArgs: 1,
    maxArgs: null,
    apply: (args) => {
      const values = args.flatMap(numericValues);
      return values.length ? Math.max(...values) : null;
    },
  },
  clamp: {
    minArgs: 3,
    maxArgs: 3,
    apply: ([v, lo, hi]) => {
      const n = num(v);
      const low = num(lo);
      const high = num(hi);
      if (n === null || low === null || high === null) return null;
      return Math.min(Math.max(n, low), high);
    },
  },
  percentChange: {
    minArgs: 2,
    maxArgs: 2,
    apply: ([from, to]) => {
      const a = num(from);
      const b = num(to);
      if (a === null || b === null || a === 0) return null;
      return ((b - a) / Math.abs(a)) * 100;
    },
  },
  safeDivide: {
    minArgs: 2,
    maxArgs: 2,
    apply: ([a, b]) => {
      const x = num(a);
      const y = num(b);
      if (x === null || y === null || y === 0) return null;
      return x / y;
    },
  },

  // ── date and time
  now: { minArgs: 0, maxArgs: 0, apply: (_a, ctx) => ctx.now },
  today: {
    minArgs: 0,
    maxArgs: 0,
    apply: (_a, ctx) => {
      const d = new Date(ctx.now.getTime());
      d.setHours(0, 0, 0, 0);
      return d;
    },
  },
  dateAdd: { minArgs: 3, maxArgs: 3, apply: ([d, n, u]) => dateAdd(d, n, u) },
  dateDiff: { minArgs: 3, maxArgs: 3, apply: ([a, b, u]) => dateDiff(a, b, u) },
  startOf: { minArgs: 2, maxArgs: 2, apply: ([d, u]) => startOf(d, u) },
  endOf: {
    minArgs: 2,
    maxArgs: 2,
    apply: ([d, u]) => {
      const start = startOf(d, u);
      if (!start) return null;
      const next = dateAdd(start, 1, u);
      return next ? new Date(next.getTime() - 1) : null;
    },
  },
  isBefore: {
    minArgs: 2,
    maxArgs: 2,
    apply: ([a, b]) => {
      const x = asDate(a);
      const y = asDate(b);
      return x && y ? x.getTime() < y.getTime() : null;
    },
  },
  isAfter: {
    minArgs: 2,
    maxArgs: 2,
    apply: ([a, b]) => {
      const x = asDate(a);
      const y = asDate(b);
      return x && y ? x.getTime() > y.getTime() : null;
    },
  },
  businessDaysBetween: {
    minArgs: 2,
    maxArgs: 2,
    apply: ([a, b]) => dateDiff(a, b, 'businessDay'),
  },

  // ── aggregates over a data source
  // Deliberately limited: a real cross-row calculation belongs in the catalog as a
  // governed measure, not buried in a page definition.
  count: {
    minArgs: 1,
    maxArgs: 1,
    apply: ([v]) => (Array.isArray(v) ? v.length : v === null || v === undefined ? 0 : 1),
  },
  sum: {
    minArgs: 1,
    maxArgs: 1,
    apply: ([v]) => numericValues(v).reduce((a, b) => a + b, 0),
  },
  avg: {
    minArgs: 1,
    maxArgs: 1,
    apply: ([v]) => {
      const values = numericValues(v);
      return values.length ? values.reduce((a, b) => a + b, 0) / values.length : null;
    },
  },
  minOf: {
    minArgs: 1,
    maxArgs: 1,
    apply: ([v]) => {
      const values = numericValues(v);
      return values.length ? Math.min(...values) : null;
    },
  },
  maxOf: {
    minArgs: 1,
    maxArgs: 1,
    apply: ([v]) => {
      const values = numericValues(v);
      return values.length ? Math.max(...values) : null;
    },
  },
  anyMatch: {
    minArgs: 2,
    maxArgs: 2,
    apply: ([v, target]) => {
      const arr = Array.isArray(v) ? v : [v];
      return arr.some((item) => item === target || str(item) === str(target));
    },
  },
  countWhere: {
    minArgs: 3,
    maxArgs: 3,
    apply: ([v, operator, target]) => {
      const arr = Array.isArray(v) ? v : [v];
      const op = str(operator);
      return arr.filter((item) => {
        switch (op) {
          case 'eq':
            return item === target || str(item) === str(target);
          case 'ne':
            return str(item) !== str(target);
          case 'gt':
            return (num(item) ?? -Infinity) > (num(target) ?? Infinity);
          case 'gte':
            return (num(item) ?? -Infinity) >= (num(target) ?? Infinity);
          case 'lt':
            return (num(item) ?? Infinity) < (num(target) ?? -Infinity);
          case 'lte':
            return (num(item) ?? Infinity) <= (num(target) ?? -Infinity);
          default:
            return false;
        }
      }).length;
    },
  },

  // ── arrays
  arrayContains: {
    minArgs: 2,
    maxArgs: 2,
    apply: ([arr, v]) => (asArray(arr) ?? []).some((item) => item === v || str(item) === str(v)),
  },
  arrayLength: { minArgs: 1, maxArgs: 1, apply: ([arr]) => (asArray(arr) ?? []).length },
  first: { minArgs: 1, maxArgs: 1, apply: ([arr]) => (asArray(arr) ?? [])[0] ?? null },
  arrayJoin: {
    minArgs: 2,
    maxArgs: 2,
    apply: ([arr, sep]) => (asArray(arr) ?? []).map(str).join(str(sep)),
  },
};

export const FUNCTION_NAMES = Object.keys(FUNCTIONS);
