/**
 * The store's wire shapes, shared by the client and the server.
 *
 * They live in the model library rather than in the API client so both sides of the network compile
 * against the same declaration — the same reason `@opus/catalog` depends on contracts alone. The
 * server imports these types too; a drift between them would be a runtime surprise rather than a
 * build failure.
 */

import type { ExperienceDefinition } from '@opus/contracts';

export interface StoredExperience {
  id: string;
  definition: ExperienceDefinition;
  updatedAt: string;
  updatedBy: string;
  origin: 'human' | 'ai' | 'aiRefined' | 'template' | 'seed';
}

/** What a list view needs, without shipping every definition body to render a card. */
export interface ExperienceSummary {
  id: string;
  name: string;
  description?: string;
  kind?: string;
  pageCount: number;
  artifactVersion: number;
  lifecycleState: string;
  origin: string;
  updatedAt: string;
  /** The prompt that produced it, when a model did. */
  prompt?: string;
  tags: readonly string[];
}
