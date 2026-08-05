/**
 * Application boot: identity, catalog, gateway.
 *
 * The order matters and is not arbitrary:
 *
 *   1. **Identity first.** Everything after it is scoped to a caller. Loading the catalog before
 *      knowing who is asking would mean fetching a projection for nobody.
 *   2. **Catalog second.** It is the vocabulary both authoring and generation bind to, and its
 *      version is what a saved definition pins.
 *   3. **Gateway last**, configured with an HTTP transport pointed at the server.
 *
 * Re-running on a persona change is the interesting part. The catalog projection and the gateway's
 * entitlement scope both depend on the caller, so switching persona must re-resolve both — otherwise
 * the app would show one identity's catalog while querying as another, and the mismatch would look
 * like a data bug rather than a state bug.
 */

import { Injectable, computed, inject, signal } from '@angular/core';
import { GatewayService } from '@opus/data-client';
import {
  CatalogClient,
  HealthClient,
  HttpGatewayTransport,
  IdentityClient,
} from '@opus/metadata-service';

export type BootStatus = 'starting' | 'ready' | 'degraded' | 'failed';

@Injectable({ providedIn: 'root' })
export class BootService {
  private readonly identity = inject(IdentityClient);
  private readonly catalog = inject(CatalogClient);
  private readonly health = inject(HealthClient);
  private readonly gateway = inject(GatewayService);

  private readonly transport = new HttpGatewayTransport({ personaId: 'analyst' });

  readonly status = signal<BootStatus>('starting');
  readonly problem = signal<string | null>(null);

  readonly apiReachable = this.health.reachable;
  readonly serverHealth = this.health.health;
  readonly catalogVersion = this.catalog.catalogVersion;
  readonly personas = this.identity.available;
  readonly persona = this.identity.persona;
  readonly user = computed(() => this.identity.user());
  readonly gatewayLabel = this.gateway.transportLabel;

  async start(): Promise<void> {
    this.status.set('starting');
    this.problem.set(null);

    const health = await this.health.check();
    if (!health) {
      // A missing API is a *stated* condition, not a crash: the shell renders, says the API is not
      // reachable, and offers a retry. An app that fails to boot teaches nothing about why.
      this.status.set('failed');
      this.problem.set('The Experience Studio API is not reachable. Start it with `npm run api`.');
      return;
    }

    try {
      await this.identity.load();
      await this.applyCaller();
      this.status.set('ready');
    } catch (error) {
      this.status.set('failed');
      this.problem.set(error instanceof Error ? error.message : String(error));
    }
  }

  async selectPersona(id: string): Promise<void> {
    this.identity.select(id);
    await this.applyCaller();
  }

  /** Re-resolve everything that depends on who is asking. */
  private async applyCaller(): Promise<void> {
    const user = this.identity.user();
    if (!user) throw new Error('Identity did not resolve');

    await this.catalog.load();

    this.transport.update({ personaId: this.identity.personaId() });
    this.gateway.configure({ user, transport: this.transport });
  }
}
