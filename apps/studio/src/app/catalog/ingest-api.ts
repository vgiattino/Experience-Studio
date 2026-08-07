/**
 * The browser's side of `/api/sources`.
 *
 * ── WHY A THIN CLIENT AND NOT A CLEVER ONE ──────────────────────────────────────────────
 * Every shape crossing this boundary is already a type in `@opus/catalog-ingest`, so this file has
 * nothing to model. What it does have to do is three things the fetch calls would otherwise repeat:
 * carry the persona header, turn an RFC 9457 problem document into an `Error` with the server's own
 * sentence in it, and refuse to guess when the response is not JSON.
 *
 * That last one matters more than it sounds. When the API is not running, a dev server answers `/api`
 * with its index.html, and `response.json()` on that throws "Unexpected token <" — which is the error a
 * steward would otherwise be shown for "the backend is not running". `reachable()` exists so the screen
 * can ask the question directly instead.
 */

import type {
  CatalogDraft,
  DriftReport,
  PhysicalSchema,
  PromotionNote,
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

/**
 * The persona this application authenticates as.
 *
 * The server resolves identity from this header and treats it as the demo switch it is — the
 * capability check behind it is real. `steward` is the persona holding `catalog.edit`, which is what
 * this workspace needs; the Studio has one author and that author is a steward.
 */
const PERSONA = 'steward';

const BASE = '/api/sources';

function headers(): HeadersInit {
  return { 'content-type': 'application/json', 'x-persona': PERSONA };
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
  try {
    const body = (await response.json()) as { detail?: string; category?: string };
    if (body?.detail) detail = body.detail;
  } catch {
    // Not JSON. The status line is all there is.
  }
  throw new Error(detail);
}

async function json<T>(response: Response): Promise<T> {
  if (!response.ok) return fail(response);
  return (await response.json()) as T;
}

/**
 * Is the API there, and does this caller hold catalog stewardship?
 *
 * Three answers rather than two, because they lead to three different things to say: the backend is
 * not running, the backend is running and refused this caller, or it is available.
 */
export async function probe(): Promise<
  { status: 'available'; sources: ApiSource[] } | { status: 'forbidden'; detail: string } | { status: 'offline' }
> {
  try {
    const response = await fetch(BASE, { headers: headers() });
    if (response.status === 403) {
      const body = (await response.json().catch(() => ({}))) as { detail?: string };
      return { status: 'forbidden', detail: body.detail ?? 'This caller may not steward the catalog.' };
    }
    if (!response.ok) return { status: 'offline' };

    /*
      Checked, not assumed.

      A dev server with no backend behind it answers `/api/sources` with index.html and a 200, so an
      `ok` response is not evidence the API replied. The shape is.
    */
    const body = (await response.json().catch(() => null)) as { sources?: ApiSource[] } | null;
    if (!body || !Array.isArray(body.sources)) return { status: 'offline' };
    return { status: 'available', sources: body.sources };
  } catch {
    return { status: 'offline' };
  }
}

export async function register(input: Record<string, unknown>): Promise<ApiSource> {
  return json(await fetch(BASE, { method: 'POST', headers: headers(), body: JSON.stringify(input) }));
}

export async function remove(id: string): Promise<void> {
  const response = await fetch(`${BASE}/${encodeURIComponent(id)}`, { method: 'DELETE', headers: headers() });
  if (!response.ok) await fail(response);
}

export async function test(id: string): Promise<{ target: string; serverVersion: string }> {
  return json(
    await fetch(`${BASE}/${encodeURIComponent(id)}/test`, { method: 'POST', headers: headers() }),
  );
}

export async function scan(id: string, sampleEnumerations: boolean): Promise<ScanResult> {
  return json(
    await fetch(`${BASE}/${encodeURIComponent(id)}/scan`, {
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
    await fetch(`${BASE}/${encodeURIComponent(id)}/promote`, {
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
