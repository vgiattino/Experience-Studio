/**
 * Session tier (architecture/frontend-architecture.md §4.1, tier 1).
 *
 * In production this comes from an OIDC token: identity, tenant, platform roles and
 * an entitlement scope hash resolved server-side. M1 simulates it, and the
 * simulation is switchable from the URL so the six widget states and the
 * entitlement paths are demonstrable:
 *
 *   ?persona=analyst | steward | restricted
 *   ?simulate=denied | error | empty | slow
 *   ?validate=0        skip client-side validation
 *   ?theme=dark|light
 *
 * The capabilities below are PLATFORM capabilities (what you may do in the Studio).
 * Data entitlements are a separate axis owned by EDM and are simulated in the mock
 * gateway's fixtures — never here, and never in a page definition.
 */

import type { UserContext } from '@opus/contracts';

export type PersonaId = 'analyst' | 'steward' | 'restricted';

export interface Persona {
  id: PersonaId;
  label: string;
  description: string;
  user: UserContext;
  /** Simulated EDM data entitlements, consumed by the mock gateway's fixtures. */
  dataCapabilities: readonly string[];
}

const BASE = {
  tenantId: 'demo-tenant',
  locale: 'en-GB',
  timezone: 'Europe/London',
} as const;

export const PERSONAS: readonly Persona[] = [
  {
    id: 'analyst',
    label: 'Business Analyst',
    description: 'Full operational view, including exception assignees and export.',
    dataCapabilities: [
      'edm.processing.read',
      'edm.security.read',
      'edm.dq.read',
      'edm.dq.assignee.read',
      'edm.party.read',
    ],
    user: {
      ...BASE,
      id: 'analyst@demo-tenant',
      displayName: 'Ana Analyst',
      roles: ['viewer', 'author'],
      capabilities: ['experience.view', 'export.data', 'dataQuality.view'],
      entitlementScopeHash: 'scope-analyst',
    },
  },
  {
    id: 'steward',
    label: 'Data Steward',
    description: 'Operational view without the assignee column — renders as `partial`.',
    dataCapabilities: [
      'edm.processing.read',
      'edm.security.read',
      'edm.dq.read',
      'edm.party.read',
    ],
    user: {
      ...BASE,
      id: 'steward@demo-tenant',
      displayName: 'Sam Steward',
      roles: ['viewer', 'author', 'catalogSteward'],
      capabilities: ['experience.view', 'dataQuality.view'],
      entitlementScopeHash: 'scope-steward',
    },
  },
  {
    id: 'restricted',
    label: 'Processing Operator',
    description: 'No data-quality entitlement — those widgets render as `denied`.',
    dataCapabilities: ['edm.processing.read', 'edm.security.read'],
    user: {
      ...BASE,
      id: 'operator@demo-tenant',
      displayName: 'Ola Operator',
      roles: ['viewer'],
      capabilities: ['experience.view'],
      entitlementScopeHash: 'scope-restricted',
    },
  },
];

export function personaById(id: string | null): Persona {
  return PERSONAS.find((p) => p.id === id) ?? PERSONAS[0]!;
}

export interface SessionOptions {
  persona: Persona;
  simulate: 'none' | 'denied' | 'error' | 'empty' | 'slow';
  validate: boolean;
  theme: 'system' | 'light' | 'dark';
}

export function readSessionOptions(search: string): SessionOptions {
  const params = new URLSearchParams(search);
  const simulate = params.get('simulate');
  const theme = params.get('theme');
  return {
    persona: personaById(params.get('persona')),
    simulate:
      simulate === 'denied' || simulate === 'error' || simulate === 'empty' || simulate === 'slow'
        ? simulate
        : 'none',
    validate: params.get('validate') !== '0',
    theme: theme === 'dark' || theme === 'light' ? theme : 'system',
  };
}
