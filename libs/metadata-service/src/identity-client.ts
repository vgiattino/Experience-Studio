/**
 * Identity, resolved server-side.
 *
 * The client holds a *persona id* and nothing else. Roles, capabilities and the entitlement scope
 * hash come from the server, because a value the browser can edit is not an authorization input
 * (security-architecture.md P3). Switching persona re-fetches rather than recomputing locally, so
 * the demo cannot drift from what the gateway will actually enforce.
 */

import { Injectable, computed, signal } from '@angular/core';
import type { UserContext } from '@opus/experience-model';

import { apiRequest } from './api';

export interface PersonaSummary {
  id: string;
  label: string;
  description: string;
  displayName: string;
  capabilities: readonly string[];
  dataCapabilities: readonly string[];
}

@Injectable({ providedIn: 'root' })
export class IdentityClient {
  private readonly personas = signal<readonly PersonaSummary[]>([]);
  private readonly selected = signal('analyst');
  private readonly resolved = signal<UserContext | null>(null);

  readonly available = computed(() => this.personas());
  readonly persona = computed(() => this.personas().find((p) => p.id === this.selected()) ?? null);

  personaId(): string {
    return this.selected();
  }

  user(): UserContext | null {
    return this.resolved();
  }

  /**
   * Load the persona list and resolve the current one.
   *
   * The user context is assembled from what the server reports rather than from a client-side
   * table: the prototype's whole point is that the browser stops being the authority.
   */
  async load(): Promise<void> {
    const personas = await apiRequest<PersonaSummary[]>('/personas');
    this.personas.set(personas);
    this.resolveSelected();
  }

  select(id: string): void {
    this.selected.set(id);
    this.resolveSelected();
  }

  private resolveSelected(): void {
    const persona = this.personas().find((p) => p.id === this.selected());
    if (!persona) {
      this.resolved.set(null);
      return;
    }
    this.resolved.set({
      id: `${persona.id}@demo-tenant`,
      displayName: persona.displayName,
      tenantId: 'demo-tenant',
      roles: [],
      capabilities: persona.capabilities,
      locale: 'en-GB',
      timezone: 'Europe/London',
      entitlementScopeHash: `scope-${persona.id}`,
    });
  }
}
