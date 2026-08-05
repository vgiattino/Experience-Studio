/**
 * Level-3 validation of the artifacts this repository actually ships.
 *
 * THE CHECK THAT WAS MISSING. `npm run validate` validates every definition structurally, the
 * unit tests validate synthetic pages semantically, and neither validated the REAL pages against
 * the REAL catalog — so nothing in CI compared the two artifacts that have to agree. Building the
 * Studio surfaced it immediately, because the editor validates continuously with a catalog and
 * therefore reported both shipped pages as invalid the moment they were opened.
 *
 * Two genuine defects were found, and both had been rendering correctly for the whole of M1:
 *
 *   - `processing-detail` aggregated `row-count`, which is an *attribute*; the measure over that
 *     column is `rows-processed`.
 *   - `security-master-operations` selected `age-hours` as an *attribute* of `dq.exception`, where
 *     the catalog declared it only as a measure.
 *
 * Both worked because the mock gateway reads whatever column name it is handed. Against a
 * catalog-backed gateway the first would have failed outright and the second would have queried a
 * column the semantic layer did not admit.
 */

import { describe, expect, it } from 'vitest';
import { CatalogService } from '@opus/catalog';
import { loadAllManifests, registeredTypes } from '@opus/component-registry';
import type { PageDefinition, UserContext } from '@opus/contracts';

import catalogJson from '../../../apps/viewer/public/catalog/securities.catalog.json';
import securityMasterOperations from '../../../apps/viewer/public/definitions/security-master-operations.page.json';
import processingDetail from '../../../apps/viewer/public/definitions/processing-detail.page.json';
import securityMasterDashboard from '../../../apps/viewer/public/definitions/security-master-dashboard.page.json';
import securityOverview from '../../../apps/viewer/public/definitions/security-overview.page.json';
import partyOverview from '../../../apps/viewer/public/definitions/party-overview.page.json';
import exceptionManagement from '../../../apps/viewer/public/definitions/exception-management.page.json';
import { validatePage } from './validate-page';

/** Every entitlement the fixtures define, so the check is about correctness and not access. */
const FULLY_ENTITLED: UserContext = {
  id: 'ci',
  displayName: 'CI',
  tenantId: 'demo-tenant',
  locale: 'en-GB',
  timezone: 'UTC',
  roles: ['experienceAuthor'],
  capabilities: [
    'edm.processing.read',
    'edm.security.read',
    'edm.dq.read',
    'edm.dq.assignee.read',
    'edm.party.read',
  ],
  entitlementScopeHash: 'ci-full',
};

const PAGES: Record<string, unknown> = {
  'security-master-operations': securityMasterOperations,
  'processing-detail': processingDetail,
  // The four EDM business templates. They bind far more of the catalog than the M1 references —
  // five entities, twenty-odd measures and every filter channel a real page needs — so level 3
  // over them is the check that the catalog and the templates were designed against each other.
  'security-master-dashboard': securityMasterDashboard,
  'security-overview': securityOverview,
  'party-overview': partyOverview,
  'exception-management': exceptionManagement,
};

describe('shipped definitions against the shipped catalog', () => {
  const catalog = new CatalogService();
  catalog.hydrate(catalogJson as never);
  const snapshot = catalog.projectionFor(FULLY_ENTITLED);

  for (const [name, page] of Object.entries(PAGES)) {
    it(`${name} passes every implemented level`, async () => {
      const report = validatePage(page as PageDefinition, {
        manifests: await loadAllManifests(),
        registeredTypes: registeredTypes(),
        catalog: snapshot,
      });

      // Printed rather than counted, so a regression names itself.
      const errors = report.findings
        .filter((finding) => finding.severity === 'error')
        .map((finding) => `${finding.code} at ${finding.path}: ${finding.message}`);

      expect(errors).toEqual([]);
      expect(report.levelsRun).toContain('semantic');
    });
  }

  it('pins the catalog version the definitions were authored against', () => {
    for (const page of Object.values(PAGES) as PageDefinition[]) {
      expect(page.version.pins.catalogVersion).toBeGreaterThan(0);
    }
  });
});
