/**
 * Page runtime state (architecture/frontend-architecture.md §4.1, tier 3).
 *
 * Provided at the RENDERER root, not the application root. Multiple pages must be
 * able to coexist — a Studio preview beside a canvas, a drawer containing a second
 * page, side-by-side comparison — and an application-global page state makes all of
 * that impossible.
 *
 * Components never write here. They emit an action; the dispatcher writes. That is
 * what keeps interaction declarative and therefore generatable.
 */

import { Injectable, computed, inject, signal } from '@angular/core';
import {
  type DataType,
  isContextRef,
  isExpression,
  isFilterRef,
  isParamRef,
  isSelectionRef,
  type Breakpoint,
  type ComponentContext,
  type ComputableValue,
  type DataRow,
  type FieldBinding,
  type Identifier,
  type PageDefinition,
  type UserContext,
} from '@opus/contracts';
import { compileCached, formatValue, truthy, type EvaluationScope } from '@opus/platform';

export interface PageStateChange {
  params?: readonly Identifier[];
  filters?: readonly Identifier[];
  selections?: readonly Identifier[];
}

@Injectable()
export class PageContextService {
  private readonly _params = signal<Record<string, unknown>>({});
  private readonly _filters = signal<Record<string, unknown>>({});
  private readonly _selections = signal<Record<string, unknown>>({});
  private readonly _breakpoint = signal<Breakpoint>('lg');
  private readonly _rowsBySource = signal<Record<string, readonly DataRow[]>>({});
  private readonly _user = signal<UserContext | null>(null);
  private readonly _pageId = signal<Identifier>('');
  private readonly _density = signal<'comfortable' | 'compact'>('comfortable');
  private readonly _activeTabs = signal<Record<string, string>>({});

  /** Constant within a render pass, so expressions stay deterministic. */
  private renderNow = new Date();

  private _paramTypes: Record<string, DataType> = {};
  private _filterTypes: Record<string, DataType> = {};

  readonly params = this._params.asReadonly();
  readonly filters = this._filters.asReadonly();
  readonly selections = this._selections.asReadonly();
  readonly breakpoint = this._breakpoint.asReadonly();
  readonly user = this._user.asReadonly();
  readonly activeTabs = this._activeTabs.asReadonly();

  readonly locale = computed(() => this._user()?.locale ?? 'en-GB');
  readonly timezone = computed(() => this._user()?.timezone ?? 'UTC');

  /** Emitted whenever page state changes, so the orchestrator can re-query. */
  private readonly _lastChange = signal<PageStateChange | null>(null);
  readonly lastChange = this._lastChange.asReadonly();

  initialize(definition: PageDefinition, user: UserContext, initialParams: Record<string, unknown> = {}): void {
    this._pageId.set(definition.id);
    this._user.set(user);
    this._density.set(definition.presentation?.density ?? 'comfortable');
    this.renderNow = new Date();

    // Values are coerced to the declared dataType. A `date` parameter defaulting to
    // today() must become a date-only value, not a timestamp: comparing a Date
    // against EDM's date-only column would silently match nothing.
    this._paramTypes = Object.fromEntries(
      Object.entries(definition.parameters ?? {}).map(([id, spec]) => [id, spec.dataType]),
    );
    this._filterTypes = Object.fromEntries(
      Object.entries(definition.filters ?? {}).map(([id, spec]) => [id, spec.dataType]),
    );

    const params: Record<string, unknown> = {};
    for (const [id, spec] of Object.entries(definition.parameters ?? {})) {
      const raw =
        initialParams[id] !== undefined
          ? initialParams[id]
          : this.resolveComputable(spec.default, {});
      params[id] = coerce(raw, spec.dataType);
    }
    this._params.set(params);

    const filters: Record<string, unknown> = {};
    for (const [id, spec] of Object.entries(definition.filters ?? {})) {
      const raw = this.resolveComputable(spec.default, {});
      filters[id] = coerce(raw, spec.dataType) ?? (spec.multiValued ? [] : null);
    }
    this._filters.set(filters);

    const selections: Record<string, unknown> = {};
    for (const id of Object.keys(definition.selections ?? {})) selections[id] = null;
    this._selections.set(selections);

    this._rowsBySource.set({});
    this._lastChange.set(null);
  }

  setBreakpoint(breakpoint: Breakpoint): void {
    if (this._breakpoint() !== breakpoint) this._breakpoint.set(breakpoint);
  }

  setParam(id: Identifier, value: unknown): void {
    const coerced = coerce(value, this._paramTypes[id]);
    this._params.update((current) => ({ ...current, [id]: coerced }));
    this._lastChange.set({ params: [id] });
  }

  setFilter(id: Identifier, value: unknown): void {
    const coerced = Array.isArray(value)
      ? value.map((v) => coerce(v, this._filterTypes[id]))
      : coerce(value, this._filterTypes[id]);
    this._filters.update((current) => ({ ...current, [id]: coerced }));
    this._lastChange.set({ filters: [id] });
  }

  clearFilters(ids?: readonly Identifier[]): void {
    const targets = ids?.length ? ids : Object.keys(this._filters());
    this._filters.update((current) => {
      const next = { ...current };
      for (const id of targets) next[id] = Array.isArray(current[id]) ? [] : null;
      return next;
    });
    this._lastChange.set({ filters: targets });
  }

  setSelection(id: Identifier, value: unknown): void {
    this._selections.update((current) => ({ ...current, [id]: value }));
    this._lastChange.set({ selections: [id] });
  }

  setActiveTab(containerId: string, tabId: string): void {
    this._activeTabs.update((current) => ({ ...current, [containerId]: tabId }));
  }

  activeTab(containerId: string): string | undefined {
    return this._activeTabs()[containerId];
  }

  /** Called by the orchestrator when results arrive, so $data becomes readable. */
  publishRows(rowsBySource: Readonly<Record<Identifier, readonly DataRow[]>>): void {
    this._rowsBySource.set({ ...rowsBySource });
  }

  rowsFor(sourceId: Identifier): readonly DataRow[] {
    return this._rowsBySource()[sourceId] ?? [];
  }

  /**
   * Evaluation scope. `$data.<sourceId>` resolves to the row object for a
   * single-row result and to the row array otherwise, which is what makes
   * `$data.header.name` and `sum($data.list.value)` both read naturally.
   */
  scope(extra: Partial<EvaluationScope> = {}): EvaluationScope {
    const data: Record<string, unknown> = {};
    for (const [id, rows] of Object.entries(this._rowsBySource())) {
      data[id] = rows.length === 1 ? rows[0] : rows;
    }
    const user = this._user();
    return {
      params: this._params(),
      filters: this._filters(),
      selections: this._selections(),
      data,
      user: user
        ? {
            id: user.id,
            displayName: user.displayName,
            locale: user.locale,
            timezone: user.timezone,
            roles: user.roles,
            capabilities: user.capabilities,
          }
        : {},
      tenant: user ? { id: user.tenantId } : {},
      page: { id: this._pageId(), breakpoint: this._breakpoint() },
      now: this.renderNow,
      locale: this.locale(),
      timezone: this.timezone(),
      ...extra,
    };
  }

  evaluate(source: string, extra: Partial<EvaluationScope> = {}): unknown {
    try {
      return compileCached(source).evaluate(this.scope(extra));
    } catch {
      // A malformed expression is a design-time error caught by validation. If one
      // reaches here, degrade this value rather than fail the page.
      return null;
    }
  }

  test(source: string | undefined, extra: Partial<EvaluationScope> = {}): boolean {
    if (!source) return true;
    try {
      return compileCached(source).test(this.scope(extra));
    } catch {
      // Unresolvable visibility resolves to visible, for layout stability.
      return true;
    }
  }

  /** Resolve a ComputableValue to a concrete value. */
  resolveComputable(value: ComputableValue | undefined, extra: Partial<EvaluationScope> = {}): unknown {
    if (value === undefined) return undefined;
    if (value === null) return null;
    if (typeof value !== 'object') return value;
    if (Array.isArray(value)) return value;
    if (isExpression(value)) return this.evaluate(value.$expr, extra);
    if (isParamRef(value)) return this._params()[value.$param] ?? null;
    if (isFilterRef(value)) return this._filters()[value.$filter] ?? null;
    if (isSelectionRef(value)) return this._selections()[value.$selection] ?? null;
    if (isContextRef(value)) {
      // $context reads the ambient scope, including $event inside action mapping.
      return this.evaluate(`$${value.$context.replace(/^\$/, '')}`, extra);
    }
    return null;
  }

  format(value: unknown, binding?: FieldBinding, row?: DataRow): string {
    let resolved = value;
    if (binding?.transform) {
      resolved = this.evaluate(binding.transform.$expr, { row: row as Record<string, unknown> });
    }
    if ((resolved === null || resolved === undefined) && binding?.emptyValue) {
      return typeof binding.emptyValue === 'string' ? binding.emptyValue : binding.emptyValue.default;
    }
    return formatValue(resolved, binding?.format, {
      locale: this.locale(),
      timezone: this.timezone(),
      baseCurrency: 'GBP',
    }, row);
  }

  /** The read-only view handed to every component. */
  componentContext(extra: Partial<EvaluationScope> = {}): ComponentContext {
    return {
      pageId: this._pageId(),
      params: this._params(),
      filters: this._filters(),
      selections: this._selections(),
      breakpoint: this._breakpoint(),
      user: this._user() ?? ANONYMOUS,
      locale: this.locale(),
      density: this._density(),
      evaluate: (expr, extraScope) =>
        this.evaluate(expr, { ...extra, ...(extraScope as Partial<EvaluationScope>) }),
      format: (value, binding, row) => this.format(value, binding, row),
    };
  }

  /** Truthiness helper exposed for containers evaluating compiled conditions. */
  static truthy = truthy;
}

const ANONYMOUS: UserContext = {
  id: 'anonymous',
  displayName: 'Anonymous',
  tenantId: 'unknown',
  roles: [],
  capabilities: [],
  locale: 'en-GB',
  timezone: 'UTC',
  entitlementScopeHash: 'none',
};

/** Convenience for components created outside an injection context in tests. */
export const injectPageContext = (): PageContextService => inject(PageContextService);

/**
 * Coerce a resolved value to the type its parameter or filter channel declares.
 *
 * The case that matters: EDM date columns are date-only, so a `date` parameter must
 * carry 'YYYY-MM-DD'. Passing a Date — which is what today() naturally produces —
 * would compare a timestamp against a date and silently match nothing, the kind of
 * failure that looks like missing data rather than a type error.
 */
function coerce(value: unknown, dataType: DataType | undefined): unknown {
  if (value === null || value === undefined || dataType === undefined) return value ?? null;

  switch (dataType) {
    case 'date': {
      if (value instanceof Date) return toIsoDate(value);
      if (typeof value === 'string') {
        if (/^\d{4}-\d{2}-\d{2}$/.test(value)) return value;
        const parsed = new Date(value);
        return Number.isNaN(parsed.getTime()) ? value : toIsoDate(parsed);
      }
      return value;
    }
    case 'datetime':
      return value instanceof Date ? value.toISOString() : value;
    case 'integer':
    case 'decimal':
    case 'amount':
    case 'percentage': {
      if (typeof value === 'number') return value;
      const n = Number(value);
      return Number.isFinite(n) ? n : value;
    }
    case 'boolean':
      return typeof value === 'boolean' ? value : value === 'true' ? true : value === 'false' ? false : value;
    default:
      return value;
  }
}

/** Local calendar date, not UTC: "today" means the user's today. */
function toIsoDate(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}
