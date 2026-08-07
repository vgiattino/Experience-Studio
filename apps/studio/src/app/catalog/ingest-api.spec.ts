/**
 * The transport rules — the two that would be dangerous to get wrong.
 *
 *   1. **A production build may not substitute a fixture.** If `fixtureFallbackAllowed()` ever returns
 *      true by default outside development, a steward can review and publish a governed catalog derived
 *      from a built-in schema, while the screen tells them the backend is down.
 *   2. **The probe reports a cause, not a conclusion.** It previously collapsed every failure into
 *      "offline" and the screen asserted "the backend is not running" — which is wrong for a 502 from a
 *      reverse proxy, a 500 from the API, a CORS rejection, or a static host answering with HTML, and
 *      sent the reader to the wrong fix each time.
 *
 * `fetch` is stubbed rather than mocked through a framework: the thing under test is a handful of
 * branches over a `Response`, and constructing one is the clearest way to say which branch is meant.
 */

import { afterEach, describe, expect, it, vi } from 'vitest';

import { apiBaseUrl, fixtureFallbackAllowed, personaHeader } from './api-config';
import { ApiProblem, editable, probe, update } from './ingest-api';

/** Install a `fetch` that answers once with whatever this test is about. */
function respondWith(response: Response | Error): void {
  vi.stubGlobal(
    'fetch',
    vi.fn(async () => {
      if (response instanceof Error) throw response;
      return response;
    }),
  );
}

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

afterEach(() => {
  vi.unstubAllGlobals();
  delete (window as { OPUS_CONFIG?: unknown }).OPUS_CONFIG;
});

describe('runtime configuration', () => {
  it('defaults to same-origin /api, which is what a reverse-proxied deployment wants', () => {
    expect(apiBaseUrl()).toBe('/api');
  });

  it('honours a deployment’s base URL, and never keeps a trailing slash', () => {
    window.OPUS_CONFIG = { apiBaseUrl: 'https://edm-studio-api.internal/api/' };
    expect(apiBaseUrl()).toBe('https://edm-studio-api.internal/api');
  });

  it('allows the fixture only where a build says so', () => {
    // The unit-test build runs in development mode, so the default is permissive here — and the point
    // of the test is that it is a *decision* rather than an accident.
    window.OPUS_CONFIG = { allowFixtureFallback: false };
    expect(fixtureFallbackAllowed()).toBe(false);

    window.OPUS_CONFIG = { allowFixtureFallback: true };
    expect(fixtureFallbackAllowed()).toBe(true);
  });

  it('lets a deployment set the persona header, and does not invent one', () => {
    window.OPUS_CONFIG = { personaHeader: 'catalog-steward' };
    expect(personaHeader()).toBe('catalog-steward');
  });
});

describe('probing the catalog service', () => {
  it('reports the roster when the API answers as itself', async () => {
    respondWith(json({ sources: [] }));
    const result = await probe();
    expect(result.status).toBe('available');
  });

  it('separates a refusal from a failure, and keeps the server’s sentence', async () => {
    respondWith(json({ detail: 'Registering a source needs the "catalog.edit" capability.' }, 403));
    const result = await probe();

    expect(result.status).toBe('forbidden');
    if (result.status === 'forbidden') {
      // Reporting this as unreachable would send a steward to look at a server that is working.
      expect(result.detail).toContain('catalog.edit');
    }
  });

  it('names both possibilities when nothing answers, because a browser cannot tell them apart', async () => {
    respondWith(new TypeError('Failed to fetch'));
    const result = await probe();

    expect(result.status).toBe('unreachable');
    if (result.status === 'unreachable') {
      expect(result.reason).toBe('no-response');
      // A blocked cross-origin response and a dead host are the same event from here.
      expect(result.detail).toMatch(/no API is listening|another origin/);
      expect(result.detail).toContain('Failed to fetch');
    }
  });

  it('turns a 404 into the fix, because it almost always means no proxy for /api', async () => {
    respondWith(new Response('Not Found', { status: 404 }));
    const result = await probe();

    expect(result.status).toBe('unreachable');
    if (result.status === 'unreachable') {
      expect(result.reason).toBe('http-error');
      expect(result.httpStatus).toBe(404);
      expect(result.detail).toContain('apiBaseUrl');
    }
  });

  it('points a 5xx at the API’s own logs rather than at the reader', async () => {
    respondWith(new Response('Bad Gateway', { status: 502 }));
    const result = await probe();

    if (result.status === 'unreachable') {
      expect(result.httpStatus).toBe(502);
      expect(result.detail).toMatch(/logs will say why/);
    } else {
      throw new Error(`expected unreachable, got ${result.status}`);
    }
  });

  it('refuses to believe a 200 that is not this API', async () => {
    /*
      The case that made a production build fake a scan: a static host with SPA fallback answers every
      unknown path with index.html and a 200. Checking the status alone reads that as success.
    */
    respondWith(new Response('<!doctype html><html><body>app</body></html>', { status: 200 }));
    const result = await probe();

    expect(result.status).toBe('unreachable');
    if (result.status === 'unreachable') {
      expect(result.reason).toBe('not-the-api');
      expect(result.detail).toContain('index.html');
    }
  });

  it('refuses a 200 whose body is JSON but the wrong JSON', async () => {
    respondWith(json({ message: 'hello' }));
    const result = await probe();
    expect(result.status).toBe('unreachable');
  });

  it('asks the configured URL, and says which one it asked', async () => {
    window.OPUS_CONFIG = { apiBaseUrl: 'https://elsewhere.example/api' };
    respondWith(new Response('nope', { status: 404 }));

    const result = await probe();
    expect(globalThis.fetch).toHaveBeenCalledWith(
      'https://elsewhere.example/api/sources',
      expect.anything(),
    );
    if (result.status === 'unreachable') {
      expect(result.url).toBe('https://elsewhere.example/api/sources');
    }
  });
});

/**
 * Failures an edit has to be able to *branch* on, not merely display.
 *
 * Both of these were found the same way: the Edit button was reported as doing nothing, and the cause
 * was that a refusal arrived as a bare `Error` the screen had nowhere to put. A message is enough to
 * render; it is not enough to decide with, and these two decisions matter — one asks the steward a
 * question, the other tells them their server is out of date.
 */
describe('problem documents an edit branches on', () => {
  it('carries the code and body through, so a baseline refusal is a question and not an error', async () => {
    respondWith(
      json(
        {
          code: 'baseline-reset-required',
          detail: 'This changes what the next scan reads.',
          changes: [{ field: 'database', from: 'OpusEDM', to: 'OpusEDM_UAT', material: true }],
        },
        409,
      ),
    );

    // Called once, deliberately: `respondWith` hands back the same `Response`, and a body can only be
    // read once — a second call would see an already-consumed stream and prove nothing.
    try {
      await update('src-1', {} as never);
      throw new Error('expected a refusal');
    } catch (error) {
      const problem = error as ApiProblem;
      expect(problem).toBeInstanceOf(ApiProblem);
      expect(problem.status).toBe(409);
      expect(problem.code).toBe('baseline-reset-required');
      // Without the body the screen cannot say *which* fields cost the baseline, which is the part
      // that tells a steward whether they meant it.
      expect(problem.body['changes']).toHaveLength(1);
      expect(problem.message).toContain('the next scan reads');
    }
  });

  it('leaves the code empty when the response is not a problem document at all', async () => {
    /*
      An API older than this screen has no `/editable` route, so Express answers with its own HTML 404
      and no code. That absence is exactly how the service tells "this source does not exist" apart from
      "this server predates the feature" — two 404s, two completely different fixes.
    */
    respondWith(new Response('<!doctype html><h1>Cannot GET</h1>', { status: 404 }));

    try {
      await editable('src-1');
      throw new Error('expected a refusal');
    } catch (error) {
      const problem = error as ApiProblem;
      expect(problem).toBeInstanceOf(ApiProblem);
      expect(problem.status).toBe(404);
      expect(problem.code).toBe('');
    }
  });

  it('keeps the server’s own sentence when there is one', async () => {
    respondWith(json({ code: 'semantic', detail: 'No source "src-9" is registered.' }, 404));

    try {
      await editable('src-9');
      throw new Error('expected a refusal');
    } catch (error) {
      const problem = error as ApiProblem;
      expect(problem.code).toBe('semantic');
      expect(problem.message).toBe('No source "src-9" is registered.');
    }
  });
});
