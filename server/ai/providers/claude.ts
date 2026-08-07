/**
 * Claude provider — REGISTERED BUT NOT IMPLEMENTED.
 *
 * This file exists so the seam is visible in code. Everything a real integration needs is stated
 * here; none of it is stubbed out with something that appears to work, because a provider that
 * silently returns plausible output would be worse than one that refuses.
 *
 * ── To implement ──────────────────────────────────────────────────────────────
 *
 * 1. **Structured output, not prose.** `request.responseSchema` becomes a tool definition and the
 *    call is made with `tool_choice` forcing that tool. The service never parses JSON out of text
 *    (architecture/ai-architecture.md §5.1) — that eliminates a whole class of failure at the
 *    transport layer rather than in a repair loop.
 *
 * 2. **Prompt caching on the stable prefix.** `request.system` is identical across calls of the same
 *    `purpose`; mark it as an ephemeral cache breakpoint. The variable half is `request.user`.
 *
 * 3. **Determinism aids.** `temperature: request.temperature ?? 0`, a pinned model id, and the
 *    prompt template version recorded in provenance. Generation should be reproducible, not
 *    creative.
 *
 * 4. **Return the real token counts.** `tokensIn`/`tokensOut` feed cost attribution and the
 *    evaluation harness. Estimating them makes both meaningless.
 *
 * 5. **Map failures onto `ModelProviderError` with `retryable` set correctly.** A 429 or a 529 is
 *    retryable; a 400 from a malformed schema is not. The repair loop branches on this.
 *
 * ── What must land WITH it, not after it ─────────────────────────────────────
 *
 * These are not follow-ups. Shipping the call without them is the failure mode the security
 * architecture is written to prevent (§7):
 *
 *  - **Credentials server-side only.** `process.env['ANTHROPIC_API_KEY']`, from a managed vault, never
 *    in a client bundle, never in a log line.
 *  - **Egress policy.** Catalog *metadata* only by default. Sample values require a per-tenant
 *    opt-in and are never permitted for PII or restricted classifications. `PolicyEnforcingProvider`
 *    in `@opus/generation` already refuses an over-budget context rather than truncating it — keep
 *    that wrapper on.
 *  - **Untrusted content is delimited.** Client-authored text that enters context — exception
 *    descriptions, investigator notes — is data to be described, never instruction to follow.
 *  - **Per-tenant rate and cost caps**, enforced before the call, alerting well before the cap.
 *  - **Region pinning**, including the inference region: a tenant pinned to an EU deployment whose
 *    prompts are processed elsewhere has not met its residency obligation.
 *  - **Provenance**, stamped on the generated version: model id and version, prompt template
 *    version, temperature, tokens, cost, correlation id.
 *
 * The checklist is in docs/AI-GENERATION-WORKFLOW.md §8.
 */

import type { ModelRequest, ModelResponse } from '@opus/generation';

import type { ServerModelProvider } from './index';

const MODEL = process.env['ANTHROPIC_MODEL'] ?? 'claude-sonnet-4-5';

export const claudeProvider: ServerModelProvider = {
  id: 'claude',
  version: MODEL,
  isExternal: true,
  configured: Boolean(process.env['ANTHROPIC_API_KEY']),

  async complete(_request: ModelRequest): Promise<ModelResponse> {
    throw Object.assign(
      new Error(
        'The Claude provider is a documented seam, not an implementation. See server/ai/providers/claude.ts for what implementing it requires — including the controls that must land at the same time.',
      ),
      { status: 501 },
    );
  },
};
