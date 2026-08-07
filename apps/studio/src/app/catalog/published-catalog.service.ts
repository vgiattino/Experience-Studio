/**
 * The catalog projection the *server* computed, when there is one.
 *
 * ── WHY THIS IS NOT JUST HYDRATED INTO CatalogService ───────────────────────────────────
 * `CatalogService.hydrate` takes a **raw** catalog — one with `physical` blocks and every entitled
 * member present — because it is the thing that computes the projection and the gateway's logical-to-
 * physical map. A projection is what comes *out* of it.
 *
 * In API mode the browser is only ever given a projection, which is exactly what the architecture says
 * a client should hold. Feeding that back into `hydrate` would produce a catalog whose physical map is
 * empty and which cannot tell that it is: every binding would resolve a column name to itself and the
 * gateway would query columns that do not exist. So the server's projection is held here, beside the
 * locally-hydrated one rather than inside it, and the Vocabulary tab prefers it when it exists.
 *
 * ── AND WHY IT IS AT THE ROOT ───────────────────────────────────────────────────────────
 * Two screens need it and neither owns it: Sources sets it after publishing, Vocabulary reads it. The
 * ingestion session is per-workspace and this outlives it — a promotion's effect on the vocabulary does
 * not stop mattering when the steward closes the tab it was made in.
 */

import { Injectable, signal } from '@angular/core';
import type { CatalogSnapshot } from '@opus/catalog';

@Injectable({ providedIn: 'root' })
export class PublishedCatalogService {
  /** The server's projection for this caller. Null until a promotion or a bootstrap fetch supplies one. */
  readonly projection = signal<CatalogSnapshot | null>(null);

  /** Where it came from, so a screen can say "published" rather than implying it read a database. */
  readonly source = signal<'server' | null>(null);

  install(projection: CatalogSnapshot): void {
    this.projection.set(projection);
    this.source.set('server');
  }
}
