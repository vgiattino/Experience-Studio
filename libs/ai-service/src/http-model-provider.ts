/**
 * `ModelProvider` over HTTP — the client side of the seam.
 *
 * It implements the same interface `SimulatedModelProvider` does, so the generation pipeline cannot
 * tell which one it is holding. That is what makes "replace the mock with Claude" a configuration
 * change: the pipeline's contract with a model is `(system, user, responseSchema) → object matching
 * the schema`, and both ends of this call honour it.
 *
 * Two properties worth stating because they are easy to lose:
 *
 *  1. **The response is trusted no more than the local mock's was.** Whatever comes back goes through
 *     the same assembly and the same eight-level validation cascade. A provider that returned
 *     nonsense would produce a repair attempt and then a template fallback, not a broken page.
 *
 *  2. **Failure is typed.** `ModelProviderError.retryable` decides whether the pipeline retries, and
 *     a 429 from a real provider must be distinguishable from a 400 caused by a malformed schema.
 *     Losing that distinction turns a rate limit into a permanent failure.
 *
 * The `simulation` payload is a MOCK-ONLY channel: a rules engine cannot read a grounding pack out
 * of prose. It is sent, documented as ignored by real providers, and the server's real-provider files
 * do ignore it — so the asymmetry is visible in code rather than promised in a comment.
 */

import {
  ModelProviderError,
  type ModelProvider,
  type ModelRequest,
  type ModelResponse,
} from '@opus/generation';
import { ApiError, apiRequest } from '@opus/metadata-service';

export interface HttpProviderInfo {
  id: string;
  version: string;
  external: boolean;
}

interface GenerateResponse {
  provider: HttpProviderInfo;
  response: ModelResponse;
}

export class HttpModelProvider implements ModelProvider {
  private info: HttpProviderInfo = { id: 'server', version: 'unknown', external: false };

  /** The structured inputs the mock needs. Set per turn by the caller. */
  private simulation: unknown = undefined;

  constructor(private readonly personaId: () => string) {}

  get id(): string {
    return `http:${this.info.id}`;
  }

  get version(): string {
    return this.info.version;
  }

  /**
   * Reported from what the server said it used, not assumed.
   *
   * `isExternal` turns on the egress policy and the audit requirements, so guessing it would be a
   * policy decision made by a default. The mock is not external; Claude and OpenAI are.
   */
  get isExternal(): boolean {
    return this.info.external;
  }

  lastProvider(): HttpProviderInfo {
    return this.info;
  }

  /** The port's optional channel: the server-hosted stand-in needs these; a real model ignores them. */
  useDecisionInputs(inputs: unknown): void {
    this.simulation = inputs;
  }

  async complete(request: ModelRequest): Promise<ModelResponse> {
    try {
      const payload = await apiRequest<GenerateResponse>('/ai/generate', {
        method: 'POST',
        persona: this.personaId(),
        body: { request, simulation: this.simulation },
      });
      this.info = payload.provider;
      return payload.response;
    } catch (error) {
      if (error instanceof ApiError) {
        throw new ModelProviderError(error.message, error.retryable, request.purpose);
      }
      throw new ModelProviderError(
        error instanceof Error ? error.message : String(error),
        false,
        request.purpose,
      );
    }
  }
}
