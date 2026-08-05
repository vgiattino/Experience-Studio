/**
 * The mock provider — a rules engine standing in for a language model.
 *
 * It is `SimulatedModelProvider` from `@opus/generation`, running here rather than in the browser.
 * Nothing about it is re-implemented: the same class that produced the browser-side demo now serves
 * the REST endpoint, so the prototype's generation output is identical whichever surface calls it.
 *
 * Why it is worth having a *reasoning* mock rather than a canned response: it reads the same
 * grounding pack and the same component manifests a real model would receive, so changing the
 * catalog changes its output. A canned response would make every downstream stage — validation,
 * repair, fallback — untested theatre, and those stages are the ones that make model output safe.
 *
 * It also injects faults on request (`invalidAggregation`, `unknownComponent`, `providerFailure`, …)
 * so the repair loop and the deterministic fallback are exercised for real instead of asserted.
 */

import { SimulatedModelProvider, type ModelRequest, type ModelResponse } from '@opus/generation';

import type { ServerModelProvider } from './index';

/** Structured decision inputs. Mock-only: a real provider receives prose and a schema. */
export interface MockSimulationInput {
  concepts: unknown;
  pageIntent: unknown;
  grounding: unknown;
  templateMatch: unknown;
  availableComponents: readonly string[];
  faults?: readonly string[];
}

/**
 * One provider instance per turn.
 *
 * Deliberately not a singleton: the simulated provider keeps a per-prompt attempt counter so a
 * repair request can produce a corrected answer, and sharing that counter between concurrent
 * callers would let one user's retry satisfy another user's first attempt.
 */
export const mockProvider: ServerModelProvider = {
  id: 'mock',
  version: '1.0.0',
  isExternal: false,
  configured: true,

  async complete(request: ModelRequest, simulation?: MockSimulationInput): Promise<ModelResponse> {
    if (!simulation) {
      throw Object.assign(
        new Error(
          'The mock provider needs the structured decision inputs a rules engine cannot infer from prose. Send `simulation`, or configure a real provider.',
        ),
        { status: 400 },
      );
    }
    const provider = new SimulatedModelProvider(simulation as never);
    const response = await provider.complete(request);
    return { ...response, note: response.note ?? 'served by the mock provider (no model was called)' };
  },
};
