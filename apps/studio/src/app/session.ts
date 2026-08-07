/**
 * The simulated author identity.
 *
 * A single persona, unlike the Viewer's switcher, because the Studio's question is different: the
 * Viewer demonstrates how a page *degrades* for a caller with fewer entitlements, while the
 * Studio needs one authenticated author whose entitlements scope the catalog they can bind to.
 *
 * `experience.author` is a PLATFORM capability — it grants the right to author, and nothing about
 * which rows or columns this person may see. Data entitlements are separate, resolved against EDM,
 * and enforced by the gateway (security-architecture.md §4).
 */

import type { UserContext } from '@opus/contracts';

export const AUTHOR: UserContext = {
  id: 'author@demo-tenant',
  displayName: 'Priya Raman',
  tenantId: 'demo-tenant',
  locale: 'en-GB',
  timezone: 'Europe/London',
  roles: ['experienceAuthor', 'catalogSteward'],
  capabilities: [
    'experience.view',
    'experience.author',
    /*
      Catalog stewardship, because this application has one persona and the Catalog workspace is where
      stewardship happens: registering a database and publishing its vocabulary.

      It is a real capability, not decoration — `/api/sources` refuses every call without it, and an
      analyst persona calling the same routes gets a 403 explaining that a scan exposes physical table
      and column names the catalog projection withholds. Granting it here says what this author is
      allowed to do; it does not weaken the check.
    */
    'catalog.edit',
    // Data capabilities, resolved from EDM in production and simulated here.
    'edm.processing.read',
    'edm.security.read',
    'edm.dq.read',
    'edm.dq.assignee.read',
    'edm.party.read',
  ],
  entitlementScopeHash: 'author-full',
};
