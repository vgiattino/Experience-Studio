/**
 * @opus/ai-service — the client's half of the generation seam.
 *
 * The division of labour is the architectural point, not an implementation detail:
 *
 *   THE PIPELINE runs here.        intake → grounding → context → plan → fill → assemble →
 *                                 validate → repair → fallback → provenance. All of it is platform
 *                                 logic in `@opus/generation`, all of it provider-agnostic, none of
 *                                 it needs a secret.
 *
 *   THE MODEL CALL crosses the     `HttpModelProvider` POSTs to `/api/ai/generate`, which is the one
 *   network.                       place a provider is reached. Credentials, rate limits, cost caps
 *                                  and egress policy live there because they cannot live in a tab.
 *
 * Putting the whole pipeline behind the network instead would move a great deal of code that has
 * nothing to do with the model, and would make the Studio's continuous validation a round trip.
 *
 * Swapping the mock for a real model changes nothing in this library. It changes one environment
 * variable and one server file — see `server/ai/providers/claude.ts`.
 */

export { AiExperienceService, type BuildOutcome, type BuildRequest } from './ai-experience.service';
export { HttpModelProvider, type HttpProviderInfo } from './http-model-provider';
export { EXAMPLE_PROMPTS, type ExamplePrompt } from './example-prompts';
