/**
 * The six widget states, and how this app words them.
 *
 * The wording is the reason this file exists. `denied` must read as "not available to you" and never
 * as a fault: a caller lacking column entitlement is normal governed operation, and a page that
 * reports it as an error trains users to ignore errors. `empty` must read as an answer, because a
 * valid question with no rows is not a failure either.
 */

import type { WidgetStateName } from '@opus/experience-model';

export const RENDERABLE_STATES: readonly WidgetStateName[] = [
  'ready',
  'loading',
  'empty',
  'partial',
  'error',
  'denied',
];

const LABELS: Record<WidgetStateName, string> = {
  ready: 'Ready',
  loading: 'Loading',
  empty: 'No matching data',
  partial: 'Partly available',
  error: 'Could not load',
  denied: 'Not available to you',
};

export function stateLabel(state: WidgetStateName): string {
  return LABELS[state] ?? state;
}
