/**
 * Prompt → Experience, with the model call on the server.
 *
 * This service is deliberately thin. It installs the HTTP provider, runs the platform's generation
 * pipeline, wraps the resulting page as an Experience, and stamps provenance. Every judgement — what
 * the request means, what the catalog offers, which template fits, which measures to bind, whether
 * the result validates, whether to repair or fall back — belongs to `@opus/generation` and is not
 * re-decided here.
 *
 * The one piece of real logic is the fallback to the in-browser stand-in when the API is unreachable,
 * and it exists because a demo that dies with the server teaches nothing about the architecture. When
 * it happens the UI is told, because a silent switch between a server-side and a browser-side model
 * would misrepresent where the work happened.
 */

import { Injectable, computed, inject, signal } from '@angular/core';
import {
  GenerationService,
  SimulatedModelProvider,
  type GenerationOutcome,
  type SimulatedFault,
} from '@opus/generation';
import type { CatalogSnapshot } from '@opus/catalog';
import {
  experienceOf,
  stampGenerated,
  text,
  type ExperienceDefinition,
  type UserContext,
} from '@opus/experience-model';
import { CatalogClient, IdentityClient } from '@opus/metadata-service';

import { HttpModelProvider } from './http-model-provider';

export interface BuildRequest {
  prompt: string;
  /** Fault injection, so repair and fallback are demonstrable rather than asserted. */
  faults?: readonly SimulatedFault[];
}

export interface BuildOutcome {
  /** The generation result, stages and all — the thing the UI shows stage by stage. */
  generation: GenerationOutcome;
  /** Present when generation produced something renderable. */
  experience?: ExperienceDefinition;
  /** Where the model call actually happened. Shown, never assumed. */
  servedBy: string;
  /** True when the API was unreachable and the browser stand-in answered instead. */
  degradedToLocal: boolean;
}

@Injectable({ providedIn: 'root' })
export class AiExperienceService {
  private readonly generation = inject(GenerationService);
  private readonly identity = inject(IdentityClient);
  private readonly catalog = inject(CatalogClient);

  private readonly httpProvider = new HttpModelProvider(() => this.identity.personaId());

  readonly running = this.generation.running;
  readonly stages = this.generation.stages;
  readonly lastOutcome = signal<BuildOutcome | null>(null);
  readonly providerLabel = computed(() => this.generation.providerLabel());

  /**
   * Generate an experience from a prompt.
   *
   * The catalog snapshot is the caller's projection, fetched from the server. Passing anything wider
   * would break the property that makes generation safe: a model cannot mention a field the author
   * is not entitled to see, because it was never told the field exists.
   */
  async build(request: BuildRequest): Promise<BuildOutcome> {
    const user = this.identity.user();
    if (!user) throw new Error('Identity has not resolved yet');

    const snapshot = this.catalog.snapshot() ?? (await this.catalog.load());

    // The server-hosted provider is installed for every turn, so a provider swap on the server takes
    // effect without a reload here.
    this.generation.useProvider(this.httpProvider);

    let outcome = await this.generation.generate({
      prompt: request.prompt,
      user,
      snapshot,
      faults: request.faults,
    });

    let degraded = false;
    let servedBy = describeProvider(this.httpProvider.lastProvider());

    if (isProviderUnreachable(outcome)) {
      // The API is down. Fall back to the in-browser stand-in and SAY SO — the demo keeps working
      // and the user is not left believing a server generated this.
      degraded = true;
      this.generation.useProvider(new SimulatedModelProvider({} as never));
      outcome = await this.generation.generate({
        prompt: request.prompt,
        user,
        snapshot,
        faults: request.faults,
      });
      servedBy = 'in-browser stand-in (API unreachable)';
    }

    const built: BuildOutcome = {
      generation: outcome,
      experience: outcome.definition
        ? this.toExperience(outcome, request.prompt, user, snapshot)
        : undefined,
      servedBy,
      degradedToLocal: degraded,
    };
    this.lastOutcome.set(built);
    return built;
  }

  /**
   * Wrap the generated page as an Experience and stamp provenance.
   *
   * A one-page experience rather than a bare page, because the experience is the unit this app
   * stores, routes to and renders — and because a generated page that later gains a detail page
   * should not have to change shape to do so.
   */
  private toExperience(
    outcome: GenerationOutcome,
    prompt: string,
    user: UserContext,
    snapshot: CatalogSnapshot,
  ): ExperienceDefinition {
    const page = outcome.definition!;
    const provider = this.httpProvider.lastProvider();

    const experience = experienceOf(page, {
      id: page.id,
      name: text(page.name, page.id),
      description: text(page.description),
    });

    return {
      ...experience,
      version: stampGenerated(
        {
          ...experience.version,
          pins: {
            catalogVersion: snapshot.catalogVersion ?? experience.version.pins.catalogVersion,
            registryVersion: experience.version.pins.registryVersion,
          },
        },
        {
          prompt,
          intentClass: outcome.intake.pageIntent,
          modelId: provider.id,
          modelVersion: provider.version,
          correlationId: outcome.correlationId,
          validationAttempts: outcome.stages.filter((s) => s.stage === 'validate').length,
          repairedStages: outcome.stages.filter((s) => s.stage === 'repair').map((s) => s.summary),
          fallbackUsed: outcome.status === 'fallback',
          tokensIn: outcome.tokensIn,
          tokensOut: outcome.tokensOut,
          durationMs: outcome.totalMs,
        },
        user.id,
      ),
    };
  }
}

function describeProvider(info: { id: string; version: string; external: boolean }): string {
  return `${info.id}@${info.version}${info.external ? ' (external)' : ''} via /api/ai/generate`;
}

/**
 * Did generation fail because the API is unreachable, rather than because the request was bad?
 *
 * The distinction matters: an unreachable API is worth falling back for, and a declined or vague
 * prompt is not — retrying that locally would produce the same honest refusal with a misleading
 * explanation of where it came from.
 */
function isProviderUnreachable(outcome: GenerationOutcome): boolean {
  if (outcome.status !== 'failed' && outcome.status !== 'fallback') return false;
  return outcome.stages.some(
    (stage) =>
      stage.status === 'failed' &&
      /unreachable|Cannot reach|Failed to fetch|NetworkError/i.test(String(stage.summary)),
  );
}
