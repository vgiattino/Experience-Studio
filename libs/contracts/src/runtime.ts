/**
 * Runtime contracts shared between the renderer, the components and the data client.
 *
 * These live in `contracts` rather than in `renderer` because components must not
 * depend on the renderer (architecture/frontend-architecture.md §2.2). A component
 * receives data and context; it never fetches, navigates, or mutates.
 */

import type { Breakpoint, Identifier } from './common';
import type { WidgetStateName } from './component';
import type { FieldBinding } from './data-source';

/** One row of a query result. Field keys are data source select aliases. */
export type DataRow = Readonly<Record<string, unknown>>;

export type QueryStatus = 'ok' | 'empty' | 'partial' | 'denied' | 'error' | 'costRejected';

/** Machine-readable error taxonomy (architecture/backend-architecture.md §3.4). */
export type ErrorCategory =
  | 'validation'
  | 'semantic'
  | 'entitlement'
  | 'cost'
  | 'concurrency'
  | 'upstream'
  | 'provider';

export interface QueryProblem {
  category: ErrorCategory;
  code: string;
  detail: string;
}

/** Result of one query within a batch. Statused independently of its siblings. */
export interface QueryResult {
  key: Identifier;
  status: QueryStatus;
  rows: readonly DataRow[];
  /** Total rows available server-side, when paging. */
  totalRows?: number;
  /** Fields the caller is not entitled to see. Drives `partial`. */
  deniedFields?: readonly string[];
  /** Server-decided cache lifetime. The client never invents this. */
  ttlSeconds?: number;
  /** Hash of the caller's resolved entitlement scope. Part of every cache key. */
  entitlementScopeHash?: string;
  problem?: QueryProblem;
  durationMs?: number;
  fromCache?: boolean;
}

export interface QueryRequest {
  key: Identifier;
  dataSourceId: Identifier;
  /** Resolved parameter values — the client resolves page state, the server resolves entitlements. */
  params: Readonly<Record<string, unknown>>;
}

export interface BatchRequest {
  context: { experienceId?: string; pageId: Identifier; definitionVersion: number };
  queries: readonly QueryRequest[];
}

export interface BatchResponse {
  results: readonly QueryResult[];
  correlationId: string;
  durationMs: number;
}

/**
 * What a component receives as its `data` input. Exactly one of the six states,
 * so a component cannot render an inconsistent combination.
 */
export interface DataView {
  state: WidgetStateName;
  rows: readonly DataRow[];
  deniedFields?: readonly string[];
  problem?: QueryProblem;
  totalRows?: number;
  fromCache?: boolean;
}

export const EMPTY_DATA_VIEW: DataView = { state: 'loading', rows: [] };

/** Identity and entitlement summary. Readable by components; never authoritative. */
export interface UserContext {
  id: string;
  displayName: string;
  tenantId: string;
  roles: readonly string[];
  capabilities: readonly string[];
  locale: string;
  timezone: string;
  /** Hash of the resolved entitlement scope, for cache keying. */
  entitlementScopeHash: string;
}

/**
 * Ambient context passed to every component. Read-only: components change page
 * state by emitting an action, never by writing here.
 */
export interface ComponentContext {
  readonly pageId: Identifier;
  readonly params: Readonly<Record<string, unknown>>;
  readonly filters: Readonly<Record<string, unknown>>;
  readonly selections: Readonly<Record<string, unknown>>;
  readonly breakpoint: Breakpoint;
  readonly user: UserContext;
  readonly locale: string;
  readonly density: 'comfortable' | 'compact';
  /** Evaluate a compiled condition or expression in this component's scope. */
  readonly evaluate: (expr: string, extraScope?: Record<string, unknown>) => unknown;
  /** Format a value for display using a binding's format spec. */
  readonly format: (value: unknown, binding?: FieldBinding, row?: DataRow) => string;
}

/**
 * The single output every renderable component emits. The page decides what an
 * interaction means; the component only reports that one happened.
 */
export interface ComponentActionEvent {
  /** Event name declared in the component's manifest. */
  event: string;
  payload: Readonly<Record<string, unknown>>;
}

/** Telemetry emitted per widget render (architecture/runtime-architecture.md §13). */
export interface WidgetTelemetry {
  widgetId: Identifier;
  componentType: string;
  componentVersion: string;
  state: WidgetStateName;
  timeToReadyMs?: number;
  rowCount?: number;
  fromCache?: boolean;
  errorCode?: string;
}
