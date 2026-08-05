/**
 * The model provider port.
 *
 * THIS IS THE SEAM FOR REAL LLM INTEGRATION. Everything else in this library — intake,
 * retrieval, context assembly, the validation cascade, repair, fallback, provenance — is
 * provider-agnostic and unchanged by swapping the implementation.
 *
 * The contract is deliberately shaped like a structured-output call, because that is what
 * ai-architecture.md §5.1 requires: the service never parses JSON out of prose. A provider
 * is handed a prompt and a JSON Schema, and must return an object conforming to it or fail.
 *
 * To integrate a real model, implement this interface server-side and register it in place of
 * SimulatedModelProvider. Nothing above it moves. See docs/AI-GENERATION-WORKFLOW.md §8 for
 * the checklist, including the parts that MUST be added at the same time: credentials held
 * server-side only, per-tenant rate and cost caps, and the egress policy.
 */

export interface ModelRequest {
  /** Stable instruction prefix. Cacheable — identical across calls of the same kind. */
  system: string;
  /** Request-specific context: grounding pack, exemplars, the user's prompt. */
  user: string;
  /**
   * JSON Schema the response must conform to. A real provider passes this as a tool or
   * response-format constraint; it is never a suggestion in the prompt text.
   */
  responseSchema: object;
  /** Low by default: generation should be reproducible, not creative. */
  temperature?: number;
  maxOutputTokens?: number;
  /** Names the call site, for cost attribution and evaluation slicing. */
  purpose: 'classify' | 'plan' | 'fill' | 'repair';
}

export interface ModelResponse {
  /** Validated against `responseSchema` by the provider before returning. */
  output: unknown;
  modelId: string;
  modelVersion: string;
  tokensIn: number;
  tokensOut: number;
  durationMs: number;
  /** Set when the provider fell back or truncated, so provenance can record it. */
  note?: string;
}

export class ModelProviderError extends Error {
  constructor(
    message: string,
    readonly retryable: boolean,
    readonly purpose: ModelRequest['purpose'],
  ) {
    super(message);
    this.name = 'ModelProviderError';
  }
}

export interface ModelProvider {
  readonly id: string;
  readonly version: string;
  /** True when the provider reaches a third party — drives the egress policy and audit. */
  readonly isExternal: boolean;
  complete(request: ModelRequest): Promise<ModelResponse>;
}

/**
 * Guardrails a real provider must respect. Enforced here rather than left to the adapter,
 * because these are platform policy, not provider configuration
 * (architecture/security-architecture.md §7).
 */
export interface ProviderPolicy {
  /** Refuse a request whose context exceeds the budget rather than silently truncating. */
  maxContextTokens: number;
  maxOutputTokens: number;
  /** Per-session ceiling. A real deployment enforces this per tenant and per user. */
  maxCallsPerSession: number;
  /** Region the provider may run in, for data residency. */
  requiredRegion?: string;
  /** Whether sample data values may enter context. Default false: metadata only. */
  allowSampleValues: boolean;
}

export const DEFAULT_PROVIDER_POLICY: ProviderPolicy = {
  maxContextTokens: 24_000,
  maxOutputTokens: 4_000,
  maxCallsPerSession: 40,
  allowSampleValues: false,
};

/** Wraps a provider with the policy checks every provider must pass. */
export class PolicyEnforcingProvider implements ModelProvider {
  private calls = 0;

  constructor(
    private readonly inner: ModelProvider,
    private readonly policy: ProviderPolicy = DEFAULT_PROVIDER_POLICY,
  ) {}

  get id(): string {
    return this.inner.id;
  }
  get version(): string {
    return this.inner.version;
  }
  get isExternal(): boolean {
    return this.inner.isExternal;
  }

  async complete(request: ModelRequest): Promise<ModelResponse> {
    if (this.calls >= this.policy.maxCallsPerSession) {
      throw new ModelProviderError(
        `Session call cap reached (${this.policy.maxCallsPerSession})`,
        false,
        request.purpose,
      );
    }
    const estimated = Math.ceil((request.system.length + request.user.length) / 4);
    if (estimated > this.policy.maxContextTokens) {
      // Refuse rather than truncate: a silently shortened grounding pack produces a
      // plausible page bound to concepts that were dropped.
      throw new ModelProviderError(
        `Context of ~${estimated} tokens exceeds the ${this.policy.maxContextTokens} budget`,
        false,
        request.purpose,
      );
    }
    this.calls += 1;
    return this.inner.complete({
      ...request,
      maxOutputTokens: Math.min(request.maxOutputTokens ?? this.policy.maxOutputTokens, this.policy.maxOutputTokens),
    });
  }

  callsMade(): number {
    return this.calls;
  }
}
