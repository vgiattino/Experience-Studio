/**
 * The model provider registry — the ONE seam a real LLM plugs into.
 *
 * `POST /api/ai/generate` is the only endpoint that reaches a model, and it reaches it through this
 * registry. That placement is the architectural requirement, not a convenience: provider
 * credentials exist server-side only, never in a browser
 * (architecture/security-architecture.md §7), so the browser holds the *pipeline* and the server
 * holds the *model call*.
 *
 * Swapping the mock for Claude or OpenAI is:
 *
 *   1. implement `complete(request)` in `claude.ts` (the file already exists and states its shape),
 *   2. set `AI_PROVIDER=claude` and the API key in the environment,
 *   3. nothing else.
 *
 * Not the pipeline, not the prompts, not the response schemas, not the validation cascade, not the
 * repair loop, not the fallback. Those are all provider-agnostic by construction and live in
 * `@opus/generation`, unchanged since the milestone that built them.
 */

import type { ModelRequest, ModelResponse } from '@opus/generation';

import { AI_PROVIDER } from '../../config';
import { mockProvider, type MockSimulationInput } from './mock';
import { claudeProvider } from './claude';
import { openaiProvider } from './openai';

export interface ServerModelProvider {
  readonly id: string;
  readonly version: string;
  /** True when the provider reaches a third party — drives egress policy and audit. */
  readonly isExternal: boolean;
  readonly configured: boolean;
  /**
   * `simulation` is a MOCK-ONLY channel and is documented as such at every layer.
   *
   * A rules-based stand-in cannot read a grounding pack out of prose, so the client sends the
   * structured decision inputs alongside the prompt. A real provider receives `system`, `user` and
   * `responseSchema` and ignores `simulation` entirely — which is exactly what `claude.ts` and
   * `openai.ts` do, so the difference is visible in code rather than promised in a comment.
   */
  complete(request: ModelRequest, simulation?: MockSimulationInput): Promise<ModelResponse>;
}

const PROVIDERS: Record<string, ServerModelProvider> = {
  mock: mockProvider,
  openai: openaiProvider,
  claude: claudeProvider,
};

export function activeProvider(): ServerModelProvider {
  const provider = PROVIDERS[AI_PROVIDER];
  if (!provider) {
    throw Object.assign(new Error(`Unknown AI_PROVIDER "${AI_PROVIDER}"`), { status: 500 });
  }
  return provider;
}

export function providerCatalogue(): { id: string; version: string; external: boolean; configured: boolean; active: boolean }[] {
  return Object.entries(PROVIDERS).map(([key, p]) => ({
    id: key,
    version: p.version,
    external: p.isExternal,
    configured: p.configured,
    active: key === AI_PROVIDER,
  }));
}

export type { MockSimulationInput };
