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
import type { Comparison, Difference, ExperienceSummary, StoredExperience } from '@opus/experience-model';

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

  /**
   * FR-22 — §16.4's comparison, through the baseline both sides descend from.
   *
   * Refusals come back as thrown errors carrying the server's `code`, because the four of them call for
   * different things from the caller: `baselineUnavailable` means offer Keep My Version and say why a
   * comparison is not possible, where `notDerived` means the caller asked about the wrong artifact.
   */
  async compareWithStandard(id: string): Promise<Comparison> {
    return apiRequest<Comparison>(`/experiences/${id}/compare-standard`, {
      persona: this.identity.personaId(),
    });
  }

  /**
   * FR-23 — §16.5's **Sync all changes**, and its **Preview before sync**.
   *
   * One method for both, because they are one route: `preview` decides whether the merge is saved. Two
   * code paths would let the previewed result and the saved result diverge, and a preview a reader cannot
   * trust is worse than none — they stop reading it and press the button.
   *
   * `adopt` is §16.5's deferred *selective* synchronisation. Omitted means every change the product made.
   */
  async syncWithStandard(
    id: string,
    options: { preview?: boolean; adopt?: readonly string[] } = {},
  ): Promise<SyncReport> {
    const report = await apiRequest<SyncReport>(`/experiences/${id}/sync-standard`, {
      method: 'POST',
      persona: this.identity.personaId(),
      body: {
        ...(options.preview ? { preview: true } : {}),
        ...(options.adopt ? { adopt: options.adopt } : {}),
      },
    });
    if (!options.preview) await this.refresh();
    return report;
  }

  /**
   * FR-23 — §16.5's **Revert to standard**.
   *
   * The destructive one, so the preview matters more here than anywhere: it names what will be lost
   * before anything is written. The store's append-only history makes it recoverable afterwards, but
   * "recoverable by whoever knows about the versions directory" is not being told first.
   */
  async revertToStandard(id: string, options: { preview?: boolean } = {}): Promise<SyncReport> {
    const report = await apiRequest<SyncReport>(`/experiences/${id}/revert-to-standard`, {
      method: 'POST',
      persona: this.identity.personaId(),
      body: options.preview ? { preview: true } : {},
    });
    if (!options.preview) await this.refresh();
    return report;
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

/**
 * What a sync or a revert did, or would do.
 *
 * `preview` is echoed back rather than assumed by the caller, so a UI rendering a report cannot get the
 * two states confused — the one thing a preview must never be ambiguous about is whether it happened.
 */
export interface SyncReport {
  preview: boolean;
  from: string;
  to: string;
  applied: readonly Difference[];
  skipped: readonly { difference: Difference; reason: string }[];
  keptCustomisations: readonly Difference[];
  supersededCustomisations: readonly Difference[];
  /** Present when something could not be computed — a revert with no baseline cannot list what it drops. */
  note?: string;
  /** The merged artifact. Only on a preview; a real sync returns the saved record instead. */
  definition?: ExperienceDefinition;
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
