/**
 * OpenAI provider — REGISTERED BUT NOT IMPLEMENTED.
 *
 * The shape is the same as `claude.ts`; only the transport differs. Read that file for the full
 * checklist, including the controls that must ship with the call rather than after it.
 *
 * The OpenAI-specific notes:
 *
 *  - `request.responseSchema` maps onto `response_format: { type: 'json_schema', json_schema: {
 *    name, schema, strict: true } }`. `strict: true` matters: it is what makes the schema a
 *    constraint rather than a suggestion, which is the whole reason this port takes a schema.
 *  - The schemas in `@opus/generation/plan.ts` are already closed (`additionalProperties: false`
 *    throughout), so they satisfy strict mode as written.
 *  - `seed` plus `temperature: 0` for reproducibility; record both in provenance.
 *  - Token counts come back on `usage`; pass them through rather than estimating.
 *
 * Two things the port already handles that an adapter should not re-do: the context budget is
 * enforced by `PolicyEnforcingProvider` (which refuses rather than truncating, because a silently
 * shortened grounding pack produces a plausible page bound to concepts that were dropped), and
 * repair is bounded upstream. An adapter that added its own retry loop would multiply both.
 */

import type { ModelRequest, ModelResponse } from '@opus/generation';

import type { ServerModelProvider } from './index';

const MODEL = process.env['OPENAI_MODEL'] ?? 'gpt-4.1';

export const openaiProvider: ServerModelProvider = {
  id: 'openai',
  version: MODEL,
  isExternal: true,
  configured: Boolean(process.env['OPENAI_API_KEY']),

  async complete(_request: ModelRequest): Promise<ModelResponse> {
    throw Object.assign(
      new Error(
        'The OpenAI provider is a documented seam, not an implementation. See server/ai/providers/openai.ts and claude.ts for what implementing it requires.',
      ),
      { status: 501 },
    );
  },
};
