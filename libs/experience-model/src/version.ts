/**
 * Version envelopes and provenance.
 *
 * `provenance` is why the prototype can answer "why does this page look like this" — the question a
 * reviewer asks about anything a model wrote. It carries the prompt, the provider and its version,
 * the pinned catalog and registry, the correlation id, and how much repair was needed. None of it is
 * read by the renderer: a generated page and a hand-authored one render identically, and provenance
 * is governance data attached to a version rather than an input to rendering.
 */

import type { VersionEnvelope } from '@opus/contracts';

export interface GenerationProvenance {
  prompt: string;
  intentClass?: string;
  modelId: string;
  modelVersion: string;
  temperature?: number;
  correlationId?: string;
  validationAttempts?: number;
  repairedStages?: readonly string[];
  fallbackUsed?: boolean;
  tokensIn?: number;
  tokensOut?: number;
  durationMs?: number;
}

/**
 * A fresh draft envelope.
 *
 * `lifecycleState: 'draft'` and `immutable: false` are the load-bearing pair. A draft mutates while
 * keeping its id and version, which is precisely why the compile cache must not key on that pair —
 * a lesson this repository learned by shipping the bug: a canvas frozen at the version first
 * loaded, and a data source added mid-session that was never queried.
 */
export const DRAFT_VERSION = (
  pins: { catalogVersion?: number; registryVersion?: string } = {},
): VersionEnvelope => ({
  schemaVersion: '1.0',
  artifactVersion: 1,
  lifecycleState: 'draft',
  immutable: false,
  pins: {
    catalogVersion: pins.catalogVersion ?? 10,
    registryVersion: pins.registryVersion ?? '1.1.0',
  },
});

export function isDraft(version: VersionEnvelope | undefined): boolean {
  return (version?.lifecycleState ?? 'draft') === 'draft';
}

export function isPublished(version: VersionEnvelope | undefined): boolean {
  return version?.lifecycleState === 'published';
}

/** Stamp an artifact with where it came from. Returns a new envelope. */
export function stampGenerated(
  version: VersionEnvelope,
  provenance: GenerationProvenance,
  actorId: string,
): VersionEnvelope {
  return {
    ...version,
    provenance: {
      origin: 'ai',
      actorId,
      createdAt: new Date().toISOString(),
      generation: { ...provenance },
    },
  };
}
