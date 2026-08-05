/**
 * The Catalog Service client.
 *
 * It receives a *projection*, never the catalog. `physical` blocks are stripped and members the
 * caller's capabilities do not cover are removed entirely rather than blanked — an attribute name is
 * itself sometimes sensitive, and "we have a clientPnL field" is a real disclosure.
 *
 * That the projection now happens on the server is the difference between this prototype and the
 * milestones before it. A projection computed in the browser has already shipped the client
 * everything it was meant to withhold.
 */

import { Injectable, inject, signal } from '@angular/core';
import type { CatalogSnapshot } from '@opus/catalog';

import { apiRequest } from './api';
import { IdentityClient } from './identity-client';

@Injectable({ providedIn: 'root' })
export class CatalogClient {
  private readonly identity = inject(IdentityClient);

  readonly snapshot = signal<CatalogSnapshot | null>(null);
  readonly catalogVersion = signal(0);

  async load(): Promise<CatalogSnapshot> {
    const payload = await apiRequest<{ catalogVersion: number; snapshot: CatalogSnapshot }>('/catalog', {
      persona: this.identity.personaId(),
    });
    this.snapshot.set(payload.snapshot);
    this.catalogVersion.set(payload.catalogVersion);
    return payload.snapshot;
  }

  entityCount(): number {
    return Object.keys(this.snapshot()?.entities ?? {}).length;
  }

  measureCount(): number {
    return Object.values(this.snapshot()?.entities ?? {}).reduce(
      (n, entity) => n + Object.keys(entity.measures ?? {}).length,
      0,
    );
  }
}
