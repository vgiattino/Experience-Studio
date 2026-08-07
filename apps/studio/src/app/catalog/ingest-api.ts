/**
 * The browser's side of `/api/sources`.
 *
 * ── WHY A THIN CLIENT AND NOT A CLEVER ONE ──────────────────────────────────────────────
 * Every shape crossing this boundary is already a type in `@opus/catalog-ingest`, so this file has
 * nothing to model. What it does have to do is three things the fetch calls would otherwise repeat:
 * carry the persona header, turn an RFC 9457 problem document into an `Error` with the server's own
 * sentence in it, and refuse to guess when the response is not JSON.
 *
 * That last one matters more than it sounds. A host with no API behind it answers `/api/sources` with
 * its own index.html or a 404, and `response.json()` on that throws "Unexpected token <" — which is the
 * error a steward would otherwise be shown for a perfectly healthy backend on another origin.
 *
 * ── AND WHY THE PROBE REPORTS A CAUSE, NOT A CONCLUSION ─────────────────────────────────
 * `probe()` used to collapse everything into "offline", and the screen said "The backend is not
 * running". That is a guess presented as a fact, and it is wrong for most of the ways this actually
 * fails: a 502 from a misconfigured reverse proxy, a 500 from the API itself, a CORS rejection, a DNS
 * failure, a static host answering with HTML. Each has a different fix and the sentence sent the reader
 * to the wrong one.
 *
 * So the probe returns *what happened* — the URL it tried, the HTTP status if there was one, and which
 * of four distinguishable things went wrong — and the screen renders that. A diagnostic a steward can
 * act on is worth more than a tidy one.
 */

import { apiBaseUrl, personaHeader } from './api-config';
import type {
  CatalogDraft,
  DriftReport,
  FieldChange,
  PhysicalSchema,
  PromotionNote,
  SourceEdit,
  SourceKind,
  SourceSummary,
  StewardDecisions,
} from '@opus/catalog-ingest';

/** A registered source as the API describes it: redacted, plus how far its ingestion has got. */
export interface ApiSource extends SourceSummary {
  promotedAt?: string;
  promotedBy?: string;
  /** True when a promotion has left a scan to diff a re-scan against. */
  hasBaseline: boolean;
}

export interface ScanResult {
  schema: PhysicalSchema;
  draft: CatalogDraft;
  decisions: StewardDecisions;
  drift?: DriftReport;
}

export interface PromotionSummary {
  counts: { entities: number; attributes: number; measures: number; relationships: number };
  notes: PromotionNote[];
  catalogVersion: number;
  /** How many of the published entities this caller's projection contains. See the route's comment. */
  visible: number;
}

/** The sources root, resolved at call time so a deployment's runtime config is honoured. */
function base(): string {
  return `${apiBaseUrl()}/sources`;
}

/**
 * Request headers, with the demo persona only where it means something.
 *
 * In production the server resolves identity from a verified token; a production build sending
 * `x-persona` is at best noise and at worst an invitation. `personaHeader()` returns nothing there.
 */
function headers(): HeadersInit {
  const persona = personaHeader();
  return {
    'content-type': 'application/json',
    ...(persona ? { 'x-persona': persona } : {}),
  };
}

/**
 * A refusal the caller may need to *branch* on, not only display.
 *
 * Every failure carries the server's sentence as its message, which is what a screen shows. Some also
 * need to be recognised: a 409 `baseline-reset-required` is not an error to report but a question to
 * ask, and the only honest way to tell it apart from a 409 about something else is the code the server
 * put in the problem document. Matching on the message text would work until somebody improved the
 * wording.
 */
export class ApiProblem extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly code: string,
    /** Whatever else the problem document carried — the changed fields, on a baseline refusal. */
    readonly body: Record<string, unknown>,
  ) {
    super(message);
    this.name = 'ApiProblem';
  }
}

/**
 * The server's own sentence, or a description of why there wasn't one.
 *
 * A problem document's `detail` is written for the person reading it — "the login does not have
 * permission to read primary keys", "no secret named kv/edm/reader is available to this process" — and
 * replacing that with "Request failed (502)" throws away the only part that tells a steward what to do.
 */
async function fail(response: Response): Promise<never> {
  let detail = `${response.status} ${response.statusText}`;
  let body: Record<string, unknown> = {};
  try {
    body = (await response.json()) as Record<string, unknown>;
    if (typeof body?.['detail'] === 'string') detail = body['detail'];
  } catch {
    // Not JSON. The status line is all there is.
  }
  throw new ApiProblem(detail, response.status, String(body['code'] ?? ''), body);
}

async function json<T>(response: Response): Promise<T> {
  if (!response.ok) return fail(response);
  return (await response.json()) as T;
}

/** Why the API could not be used, in enough detail to act on. */
export interface ApiUnreachable {
  status: 'unreachable';
  /** What was tried, so a reader can see whether the base URL is what they expected. */
  url: string;
  reason:
    /** No HTTP response at all: wrong host, nothing listening, DNS, or a CORS rejection. */
    | 'no-response'
    /** An HTTP response, but an error status. `httpStatus` says which. */
    | 'http-error'
    /** A 2xx that is not this API — a static host or SPA fallback answering with HTML. */
    | 'not-the-api';
  httpStatus?: number;
  /** One sentence naming the likely cause and the fix. */
  detail: string;
}

export type ProbeResult =
  | {
      status: 'available';
      sources: ApiSource[];
      /** Whether this deployment can store a password the steward types. */
      canStorePassword: boolean;
      /** Why not, when it cannot — shown in place of the password field. */
      passwordUnavailableReason?: string;
    }
  | { status: 'forbidden'; detail: string }
  | ApiUnreachable;

/**
 * Is the API there, does it answer as itself, and does this caller hold catalog stewardship?
 *
 * Four outcomes rather than two, because they lead to four different things to do.
 */
export async function probe(): Promise<ProbeResult> {
  const url = base();

  let response: Response;
  try {
    response = await fetch(url, { headers: headers() });
  } catch (error) {
    /*
      `fetch` rejects for a small set of reasons that all look identical from here, and CORS is the one
      worth naming: a browser reports a blocked cross-origin response as a network failure, so a
      correctly-running API on another origin that has not allowed this one is indistinguishable from an
      API that is not there. The message says both possibilities rather than picking one.
    */
    return {
      status: 'unreachable',
      url,
      reason: 'no-response',
      detail:
        `Nothing answered at ${url}. Either no API is listening there, or it is on another origin and has ` +
        `not allowed this one (a browser reports a blocked cross-origin response as a network failure). ` +
        `${error instanceof Error && error.message ? `The browser said: ${error.message}.` : ''}`,
    };
  }

  if (response.status === 403) {
    const body = (await response.json().catch(() => ({}))) as { detail?: string };
    return { status: 'forbidden', detail: body.detail ?? 'This caller may not steward the catalog.' };
  }

  if (!response.ok) {
    return {
      status: 'unreachable',
      url,
      reason: 'http-error',
      httpStatus: response.status,
      detail:
        response.status === 404
          ? `${url} returned 404. Most often this means the app is served without a reverse proxy for /api — ` +
            `set window.OPUS_CONFIG.apiBaseUrl to the API's own URL, or route /api through to it.`
          : response.status >= 500
            ? `${url} returned ${response.status}. The API or something in front of it is failing; its logs will say why.`
            : `${url} returned ${response.status} ${response.statusText}.`,
    };
  }

  /*
    A 2xx is not evidence the API replied.

    A static host with SPA fallback answers every unknown path with index.html and a 200, which is
    exactly what a built Studio deployed without an API proxy does. Checking the *shape* is the only way
    to tell that apart from a real response.
  */
  const body = (await response.json().catch(() => null)) as
    | { sources?: ApiSource[]; canStorePassword?: boolean; passwordUnavailableReason?: string }
    | null;
  if (!body || !Array.isArray(body.sources)) {
    return {
      status: 'unreachable',
      url,
      reason: 'not-the-api',
      httpStatus: response.status,
      detail:
        `${url} answered ${response.status} but not with this API's response. Something else is serving that ` +
        `path — usually a static host returning index.html for unknown paths. Point ` +
        `window.OPUS_CONFIG.apiBaseUrl at the API, or proxy /api to it.`,
    };
  }

  return {
    status: 'available',
    sources: body.sources,
    // Absent from an older server: treat that as "cannot", which fails towards not offering a field
    // the server would refuse after the steward had typed a real credential into it.
    canStorePassword: body.canStorePassword === true,
    passwordUnavailableReason: body.passwordUnavailableReason,
  };
}

/**
 * Replace a source's password.
 *
 * The password goes up and nothing comes back but the summary — which by construction cannot contain it.
 */
export async function rotateCredential(
  id: string,
  credential: { username?: string; password: string },
): Promise<ApiSource> {
  return json(
    await fetch(`${base()}/${encodeURIComponent(id)}/credential`, {
      method: 'PUT',
      headers: headers(),
      body: JSON.stringify(credential),
    }),
  );
}

export async function register(input: Record<string, unknown>): Promise<ApiSource> {
  return json(await fetch(base(), { method: 'POST', headers: headers(), body: JSON.stringify(input) }));
}

/** What an edit form needs, which is more than the roster says. See the route's comment. */
export interface EditableSource {
  editable: SourceEdit & { kind: SourceKind; credential: SourceSummary['credential'] };
  /** True when a promoted scan exists, so a material change would have something to discard. */
  hasBaseline: boolean;
  revisions: { at: string; by: string; changed: FieldChange[]; baselineCleared: boolean }[];
}

export async function editable(id: string): Promise<EditableSource> {
  return json(await fetch(`${base()}/${encodeURIComponent(id)}/editable`, { headers: headers() }));
}

/** The result of a saved edit: the new summary, plus what actually changed. */
export interface EditResult extends ApiSource {
  changed: FieldChange[];
  baselineCleared: boolean;
}

/**
 * Save an edit.
 *
 * `confirmBaselineReset` is the second yes. Sent false the first time deliberately — the server decides
 * whether the question needs asking, because only it holds the promoted scan, and a client that decided
 * for itself would ask on edits that cost nothing and stay silent on the ones that do.
 */
export async function update(
  id: string,
  edit: SourceEdit,
  confirmBaselineReset = false,
): Promise<EditResult> {
  return json(
    await fetch(`${base()}/${encodeURIComponent(id)}`, {
      method: 'PUT',
      headers: headers(),
      body: JSON.stringify({ ...edit, confirmBaselineReset }),
    }),
  );
}

export async function remove(id: string): Promise<void> {
  const response = await fetch(`${base()}/${encodeURIComponent(id)}`, { method: 'DELETE', headers: headers() });
  if (!response.ok) await fail(response);
}

export async function test(id: string): Promise<{ target: string; serverVersion: string }> {
  return json(
    await fetch(`${base()}/${encodeURIComponent(id)}/test`, { method: 'POST', headers: headers() }),
  );
}

export async function scan(id: string, sampleEnumerations: boolean): Promise<ScanResult> {
  return json(
    await fetch(`${base()}/${encodeURIComponent(id)}/scan`, {
      method: 'POST',
      headers: headers(),
      body: JSON.stringify({ sampleEnumerations }),
    }),
  );
}

export async function promote(
  id: string,
  decisions: StewardDecisions,
  sampleEnumerations: boolean,
): Promise<PromotionSummary> {
  return json(
    await fetch(`${base()}/${encodeURIComponent(id)}/promote`, {
      method: 'POST',
      headers: headers(),
      /*
        The decisions, and the scan options — not the scan.

        The server re-scans and re-infers before promoting rather than trusting a schema posted back to
        it, so the sampling flag has to travel or the promotion would read a different database shape
        than the one that was reviewed. The reasoning is in `server/sources/routes.ts`.
      */
      body: JSON.stringify({ decisions, sampleEnumerations }),
    }),
  );
}
