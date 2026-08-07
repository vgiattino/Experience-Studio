/**
 * Where the API is, and what this build is allowed to do without it.
 *
 * ── THE DEFECT THIS FILE EXISTS TO FIX ──────────────────────────────────────────────────
 * The first version of the Sources screen called `/api/sources` — a same-origin relative path — which
 * works in development because the Angular dev server proxies `/api` to `localhost:4000`. `proxyConfig`
 * is a dev-server option. A *built* Studio served from any static host has no proxy, so `/api/sources`
 * returns whatever that host says about an unknown path, and the screen reported "the backend is not
 * running" about a backend that was running perfectly on another origin.
 *
 * It then did something worse: it fell back to scanning a built-in schema, in a production build,
 * without the deployment having asked for that. A steward could review and publish a catalog derived
 * from a fixture and nothing would have stopped them.
 *
 * ── ONE BUILD, MANY ENVIRONMENTS ────────────────────────────────────────────────────────
 * The base URL is read at *runtime* from a global a deployment sets in `index.html`, not from a
 * build-time environment file. That is the difference between shipping one artifact promoted through
 * dev → staging → production and shipping three artifacts that are supposed to be identical:
 *
 *   <script>window.OPUS_CONFIG = { apiBaseUrl: 'https://edm-studio-api.internal/api' };</script>
 *
 * Absent, it falls back to same-origin `/api`, which is correct for the ordinary deployment where a
 * reverse proxy fronts both the app and the API — and correct in development, where the dev server is
 * that reverse proxy.
 */

import { isDevMode } from '@angular/core';

export interface OpusRuntimeConfig {
  /** Absolute or same-origin-relative. No trailing slash. */
  apiBaseUrl?: string;
  /**
   * Allow the browser-only fixture pipeline when the API is unreachable.
   *
   * Defaults to `isDevMode()`, which is the only defensible default. A deployment that genuinely wants
   * the offline demo — a conference stand, an air-gapped walkthrough — sets it explicitly, and the
   * screen still says loudly which schema it is reading.
   */
  allowFixtureFallback?: boolean;
  /**
   * The demo persona header.
   *
   * Development only. In production the server resolves identity from a verified token and this header
   * is either ignored or a hole; either way a production build has no business sending it.
   */
  personaHeader?: string;
}

declare global {
  interface Window {
    OPUS_CONFIG?: OpusRuntimeConfig;
  }
}

function config(): OpusRuntimeConfig {
  return (typeof window === 'undefined' ? undefined : window.OPUS_CONFIG) ?? {};
}

/** The API root, without a trailing slash. */
export function apiBaseUrl(): string {
  const configured = config().apiBaseUrl?.trim();
  return (configured || '/api').replace(/\/+$/, '');
}

/**
 * May this build scan without a server?
 *
 * The gate is the build mode, not a preference. A production build that silently substitutes a fixture
 * is a production build that can publish a fabricated catalog.
 */
export function fixtureFallbackAllowed(): boolean {
  return config().allowFixtureFallback ?? isDevMode();
}

/** The persona header to send, or nothing. See `OpusRuntimeConfig.personaHeader`. */
export function personaHeader(): string | undefined {
  const configured = config().personaHeader?.trim();
  if (configured) return configured;
  return isDevMode() ? 'steward' : undefined;
}
