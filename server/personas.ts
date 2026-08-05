/**
 * Demo identities, resolved server-side.
 *
 * Identity lives here rather than in the client for the reason the security architecture gives: a
 * caller's roles, capabilities and entitlement scope are resolved from a verified token, and
 * anything the browser can edit is not an authorization input (P3). The prototype has no IdP, so
 * these three personas stand in — but they stand in *on the server*, and the client can only ask
 * which one it is, never assert it beyond the demo switch that `routes.ts` marks as a deviation.
 *
 * Two axes, deliberately separate, because conflating them produces either a breach or an unusable
 * product (security-architecture.md §2):
 *
 *   capabilities      PLATFORM authorization — what you may DO in the Studio
 *   dataCapabilities  DATA authorization — which rows and columns EDM permits
 *
 * The restricted persona exists to make the second axis visible: it can open every page and see
 * fewer widgets, which is normal governed operation rather than an error.
 */

import type { UserContext } from '@opus/contracts';

export interface Persona {
  id: string;
  label: string;
  description: string;
  user: UserContext;
  dataCapabilities: readonly string[];
}

const BASE = { tenantId: 'demo-tenant', locale: 'en-GB', timezone: 'Europe/London' } as const;

export const PERSONAS: readonly Persona[] = [
  {
    id: 'analyst',
    label: 'Business Analyst',
    description: 'Builds and views experiences. Full operational data view, including exception assignees.',
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
      capabilities: ['experience.view', 'experience.author', 'export.data', 'dataQuality.view'],
      entitlementScopeHash: 'scope-analyst',
    },
  },
  {
    id: 'steward',
    label: 'Data Steward',
    description: 'Owns the catalog. Sees processing and data quality, not the party master.',
    dataCapabilities: ['edm.processing.read', 'edm.security.read', 'edm.dq.read', 'edm.party.read'],
    user: {
      ...BASE,
      id: 'steward@demo-tenant',
      displayName: 'Sam Steward',
      roles: ['viewer', 'author', 'catalogSteward'],
      capabilities: ['experience.view', 'experience.author', 'catalog.edit', 'dataQuality.view'],
      entitlementScopeHash: 'scope-steward',
    },
  },
  {
    id: 'restricted',
    label: 'Restricted Viewer',
    description:
      'Processing data only. Opens the same pages and sees fewer widgets — the entitlement axis made visible.',
    dataCapabilities: ['edm.processing.read'],
    user: {
      ...BASE,
      id: 'restricted@demo-tenant',
      displayName: 'Rob Restricted',
      roles: ['viewer'],
      capabilities: ['experience.view'],
      entitlementScopeHash: 'scope-restricted',
    },
  },
];

export function personaById(id: string): Persona {
  return PERSONAS.find((p) => p.id === id) ?? PERSONAS[0];
}
