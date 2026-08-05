/**
 * The one place an HTTP call is made.
 *
 * Two things it enforces so no caller has to remember them:
 *
 *  1. **The persona header travels with every request.** In this prototype it is the demo identity
 *     switch; in production it would be an access token. Either way it belongs on the transport, not
 *     sprinkled through call sites — an unauthenticated request that succeeds because someone forgot
 *     the header is the shape of a real defect.
 *  2. **Failures arrive as a typed category**, not a string. `ApiError.category` is the closed
 *     taxonomy from backend-architecture.md §3.4, and the UI branches on it: `entitlement` reads as
 *     "not available to you", `cost` reads as a design-time problem the author can fix, `upstream`
 *     offers a retry. Free-text messages would make all three the same red box.
 */

export const API_BASE = '/api';

export type ProblemCategory =
  | 'validation'
  | 'semantic'
  | 'entitlement'
  | 'cost'
  | 'concurrency'
  | 'upstream'
  | 'provider'
  | 'capability'
  | 'network';

export class ApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly category: ProblemCategory,
    readonly code: string,
  ) {
    super(message);
    this.name = 'ApiError';
  }

  /** Whether retrying the same request could plausibly succeed. */
  get retryable(): boolean {
    return this.category === 'upstream' || this.category === 'network' || this.status >= 500;
  }
}

export interface RequestOptions {
  method?: 'GET' | 'POST' | 'PUT' | 'DELETE';
  body?: unknown;
  /** Demo identity. Sent as a header on every call. */
  persona?: string;
  signal?: AbortSignal;
}

export async function apiRequest<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const { method = 'GET', body, persona, signal } = options;

  let response: Response;
  try {
    response = await fetch(`${API_BASE}${path}`, {
      method,
      headers: {
        ...(body === undefined ? {} : { 'content-type': 'application/json' }),
        ...(persona ? { 'x-persona': persona } : {}),
      },
      body: body === undefined ? undefined : JSON.stringify(body),
      signal,
    });
  } catch (error) {
    // A dead API is a distinct condition from a rejected request, and the UI says so rather than
    // showing a validation error for a server that is not running.
    throw new ApiError(
      `Cannot reach the Experience Studio API. Is it running? (npm run api)`,
      0,
      'network',
      'apiUnreachable',
    );
  }

  if (response.status === 204) return undefined as T;

  const text = await response.text();
  const payload = text ? (JSON.parse(text) as unknown) : undefined;

  if (!response.ok) {
    const problem = (payload ?? {}) as { detail?: string; category?: ProblemCategory; code?: string };
    throw new ApiError(
      problem.detail ?? `HTTP ${response.status}`,
      response.status,
      problem.category ?? 'upstream',
      problem.code ?? 'httpError',
    );
  }

  return payload as T;
}
