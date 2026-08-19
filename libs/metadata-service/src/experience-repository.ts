/**
 * The Definition Service client.
 *
 * Save is a PUT of the whole definition rather than a patch, and that is a deliberate prototype
 * simplification with a named cost: the real endpoint takes a JSON Patch with a mandatory `If-Match`
 * (backend-architecture.md §3.2), which is what gives optimistic concurrency and a server-side diff
 * for the audit trail. Two authors editing one experience here would silently overwrite each other.
 * The visual builder in `@opus/studio-core` already produces patches, so closing this is wiring the
 * two together rather than new design — it is the second item on the M2 list.
 */

import { Injectable, inject, signal } from '@angular/core';
import type { ExperienceDefinition } from '@opus/experience-model';
import type { ExperienceSummary, StoredExperience } from '@opus/experience-model';

import { apiRequest } from './api';
import { IdentityClient } from './identity-client';

@Injectable({ providedIn: 'root' })
export class ExperienceRepository {
  private readonly identity = inject(IdentityClient);

  readonly summaries = signal<readonly ExperienceSummary[]>([]);
  readonly loading = signal(false);

  async refresh(): Promise<readonly ExperienceSummary[]> {
    this.loading.set(true);
    try {
      const list = await apiRequest<ExperienceSummary[]>('/experiences', {
        persona: this.identity.personaId(),
      });
      this.summaries.set(list);
      return list;
    } finally {
      this.loading.set(false);
    }
  }

  async get(id: string): Promise<StoredExperience> {
    return apiRequest<StoredExperience>(`/experiences/${id}`, { persona: this.identity.personaId() });
  }

  async save(definition: ExperienceDefinition, origin: StoredExperience['origin'] = 'human'): Promise<StoredExperience> {
    const saved = await apiRequest<StoredExperience>(`/experiences/${definition.id}`, {
      method: 'PUT',
      persona: this.identity.personaId(),
      /*
        No `actorId`. It used to be sent here alongside the persona, which was the same identity twice
        — once verifiable and once merely asserted — and the server trusted the asserted one. The
        server now derives the actor from the persona it already resolves, and refuses a body that
        carries one, so sending it would be a 400.
      */
      body: { definition, origin },
    });
    await this.refresh();
    return saved;
  }

  async remove(id: string): Promise<void> {
    await apiRequest<void>(`/experiences/${id}`, { method: 'DELETE', persona: this.identity.personaId() });
    await this.refresh();
  }
}
