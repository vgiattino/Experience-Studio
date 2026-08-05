/**
 * A small but structurally real catalog for tests.
 *
 * Deliberately not a toy: it carries column entitlement on one attribute and row
 * entitlement on one entity, a measure with a restricted allowed-aggregation set, a
 * measure whose physical column differs from its logical id, and relationships with
 * differing traversal costs. Every one of those exists because a behaviour under test
 * depends on it, and a fixture without them would let the behaviour regress unnoticed.
 */

import type { RawCatalog } from './types';

export function testCatalog(): RawCatalog {
  return {
    schemaVersion: '1.0',
    catalogVersion: 3,
    tenantId: 'test-tenant',
    lifecycleState: 'published',
    entities: {
      'processing.file-load': {
        id: 'processing.file-load',
        businessName: 'File Load',
        pluralName: 'File Loads',
        synonyms: ['feed', 'inbound file'],
        description: 'An inbound vendor file processed by EDM.',
        domain: 'processing',
        primaryKey: ['load-id'],
        labelAttribute: 'file-name',
        logicalDataSourceId: 'edm-file-processing',
        rowEntitlementDomain: 'edm.processing.read',
        cost: { class: 'low' },
        attributes: {
          'load-id': {
            id: 'load-id',
            businessName: 'Load ID',
            dataType: 'identifier',
            physical: { ref: 'load_id' },
          },
          'file-name': { id: 'file-name', businessName: 'File Name', dataType: 'string' },
          'source-system': { id: 'source-system', businessName: 'Source', dataType: 'string' },
          'business-date': { id: 'business-date', businessName: 'Business Date', dataType: 'date' },
          'load-status': {
            id: 'load-status',
            businessName: 'Status',
            dataType: 'enum',
            enumValues: [
              { value: 'COMPLETE', label: 'Complete' },
              { value: 'FAILED', label: 'Failed' },
              { value: 'LATE', label: 'Late' },
            ],
          },
        },
        measures: {
          'failed-file-count': {
            id: 'failed-file-count',
            businessName: 'Failed Files',
            valueType: 'integer',
            allowedAggregations: ['count'],
            defaultAggregation: 'count',
            higherIsBetter: false,
          },
          'rows-processed': {
            id: 'rows-processed',
            businessName: 'Rows Processed',
            valueType: 'integer',
            allowedAggregations: ['sum', 'avg'],
            defaultAggregation: 'sum',
            physical: { ref: 'row-count' },
          },
        },
      },
      'dq.exception': {
        id: 'dq.exception',
        businessName: 'Data Quality Exception',
        pluralName: 'Data Quality Exceptions',
        synonyms: ['exception', 'break'],
        description: 'An instance of a data quality rule failing.',
        domain: 'dq',
        primaryKey: ['exception-id'],
        labelAttribute: 'rule-name',
        logicalDataSourceId: 'edm-dq-exceptions',
        rowEntitlementDomain: 'edm.dq.read',
        sensitivity: 'confidential',
        cost: { class: 'medium' },
        attributes: {
          'exception-id': { id: 'exception-id', businessName: 'Exception ID', dataType: 'identifier' },
          'rule-name': { id: 'rule-name', businessName: 'Rule', dataType: 'string' },
          severity: {
            id: 'severity',
            businessName: 'Severity',
            dataType: 'enum',
            enumValues: [
              { value: 'HIGH', label: 'High' },
              { value: 'LOW', label: 'Low' },
            ],
          },
          'detected-at': { id: 'detected-at', businessName: 'Detected', dataType: 'datetime' },
          'assigned-to': {
            id: 'assigned-to',
            businessName: 'Assigned To',
            dataType: 'string',
            sensitivity: 'pii',
            columnEntitlement: 'edm.dq.assignee.read',
          },
        },
        measures: {
          'exception-count': {
            id: 'exception-count',
            businessName: 'Exception Count',
            synonyms: ['number of breaks'],
            valueType: 'integer',
            allowedAggregations: ['count', 'countDistinct'],
            defaultAggregation: 'count',
          },
        },
      },
      'securities.security': {
        id: 'securities.security',
        businessName: 'Security',
        pluralName: 'Securities',
        synonyms: ['instrument'],
        domain: 'securities',
        primaryKey: ['security-id'],
        labelAttribute: 'name',
        logicalDataSourceId: 'edm-security-master',
        rowEntitlementDomain: 'edm.security.read',
        cost: { class: 'medium', requiresFilter: true },
        attributes: {
          'security-id': {
            id: 'security-id',
            businessName: 'Security ID',
            dataType: 'identifier',
            physical: { ref: 'security_id' },
          },
          name: { id: 'name', businessName: 'Security Name', dataType: 'string' },
          'asset-class': { id: 'asset-class', businessName: 'Asset Class', dataType: 'enum' },
          'created-at': { id: 'created-at', businessName: 'Created', dataType: 'datetime' },
        },
        measures: {
          'security-count': {
            id: 'security-count',
            businessName: 'Security Count',
            valueType: 'integer',
            allowedAggregations: ['count'],
            defaultAggregation: 'count',
          },
        },
      },
    },
    relationships: {
      'securities.security.exceptions': {
        id: 'securities.security.exceptions',
        businessName: 'Data Quality Exceptions',
        from: 'securities.security',
        to: 'dq.exception',
        cardinality: 'one-to-many',
        keyMapping: [{ fromAttribute: 'security-id', toAttribute: 'exception-id' }],
        traversalCost: 'low',
      },
      'dq.exception.security': {
        id: 'dq.exception.security',
        businessName: 'Security',
        from: 'dq.exception',
        to: 'securities.security',
        cardinality: 'many-to-one',
        keyMapping: [{ fromAttribute: 'exception-id', toAttribute: 'security-id' }],
        // High cost, so expansion in this direction is heavily discounted.
        traversalCost: 'high',
      },
    },
  };
}

/** Capabilities of a full-access caller, for the baseline case. */
export const ALL_CAPABILITIES = [
  'edm.processing.read',
  'edm.dq.read',
  'edm.dq.assignee.read',
  'edm.security.read',
];
