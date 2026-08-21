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

  // ── §16: the standard lifecycle ───────────────────────────────────────────

  /**
   * Every product standard installed in this tenant — §5's library, as the store holds it.
   *
   * Read from the store rather than from the definitions directory, and the server's comment on that
   * route says why: the store is the authority on which version is *installed*, and reading the files
   * would answer what the release *contains*, which is a different question.
   */
  async standards(): Promise<readonly StandardListing[]> {
    return apiRequest<StandardListing[]>('/standards', { persona: this.identity.personaId() });
  }

  /**
   * FR-20 — fork a standard into a client variant. §2's Level 1 → Level 2 step.
   *
   * Idempotent server-side: asking twice returns the existing variant rather than making a second one,
   * because §16 speaks of "your current experience" in the singular.
   */
  async derive(standardExperienceId: string): Promise<StoredExperience & { derived?: boolean }> {
    const derived = await apiRequest<StoredExperience & { derived?: boolean }>(
      `/experiences/${standardExperienceId}/derive`,
      { method: 'POST', persona: this.identity.personaId(), body: {} },
    );
    await this.refresh();
    return derived;
  }

  /** FR-21 — §16.3's notification for one client variant. `update: null` means nothing to say. */
  async standardUpdate(id: string): Promise<StandardUpdateNotice> {
    return apiRequest<StandardUpdateNotice>(`/experiences/${id}/standard-update`, {
      persona: this.identity.personaId(),
    });
  }

  /**
   * §16.3's **Keep My Version**.
   *
   * The version is sent rather than inferred, because the server must record what was *on offer when
   * the person decided* — inferring it would record a decline of whatever happens to be current when
   * the request lands. §16.3's "Review Later" has no method here: it records nothing, and that is the
   * difference between the two buttons.
   */
  async declineUpdate(id: string, version: string): Promise<StoredExperience> {
    const saved = await apiRequest<StoredExperience>(`/experiences/${id}/decline-update`, {
      method: 'POST',
      persona: this.identity.personaId(),
      body: { version },
    });
    await this.refresh();
    return saved;
  }
}

/** One row of `GET /standards`. */
export interface StandardListing {
  id: string;
  name: string;
  standardId: string;
  version: string;
  productRelease?: string;
  releaseNotes?: string;
  pageCount: number;
  /** The client variant of this standard, when this tenant has already forked it. */
  derivedId: string | null;
}

export interface StandardUpdateNotice {
  update: {
    standardId: string;
    currentVersion: string;
    availableVersion: string;
    availableRelease?: string;
    releaseNotes?: string;
    customised: boolean;
  } | null;
  /** §16.3's sentence, generated on the server because the wording is a requirement. */
  message?: string;
}
