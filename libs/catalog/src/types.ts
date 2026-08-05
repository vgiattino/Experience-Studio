/** Catalog types. The raw shape is the stored artifact; the snapshot is the client projection. */

import type {
  Aggregation,
  DataType,
  FormatSpec,
  I18nString,
  QualifiedRef,
  Sensitivity,
  Threshold,
} from '@opus/contracts';

export interface RawPhysical {
  ref: string;
  sourceDataType?: string;
  transform?: string;
}

export interface RawAttribute {
  id: string;
  businessName: I18nString;
  synonyms?: string[];
  description?: string;
  dataType: DataType;
  semanticType?: string;
  unit?: string;
  currencyCode?: string;
  currencyFromAttribute?: string;
  format?: FormatSpec;
  enumValues?: { value: string; label: I18nString; emphasis?: string; order?: number }[];
  nullable?: boolean;
  filterable?: boolean;
  groupable?: boolean;
  sortable?: boolean;
  searchable?: boolean;
  sensitivity?: Sensitivity;
  columnEntitlement?: string;
  maskingPolicy?: string;
  physical?: RawPhysical;
  deprecated?: boolean;
  aiHints?: { whenToUse?: string; whenNotToUse?: string; exampleQuestions?: string[] };
}

export interface RawMeasure {
  id: string;
  businessName: I18nString;
  synonyms?: string[];
  description?: string;
  valueType: string;
  unit?: string;
  currencyCode?: string;
  format?: FormatSpec;
  allowedAggregations: Aggregation[];
  defaultAggregation: Aggregation;
  expression?: string;
  groupableBy?: QualifiedRef[];
  higherIsBetter?: boolean;
  defaultThresholds?: Threshold[];
  targetValue?: number;
  sensitivity?: Sensitivity;
  columnEntitlement?: string;
  physical?: RawPhysical;
  deprecated?: boolean;
  aiHints?: { whenToUse?: string; exampleQuestions?: string[] };
}

export interface RawEntity {
  id: QualifiedRef;
  businessName: I18nString;
  pluralName?: I18nString;
  synonyms?: string[];
  description?: string;
  domain?: string;
  primaryKey: string[];
  labelAttribute?: string;
  effectiveDating?: string;
  logicalDataSourceId: string;
  rowEntitlementDomain?: string;
  sensitivity?: Sensitivity;
  defaultDetailExperience?: string;
  cost?: {
    class?: string;
    typicalRowCount?: number;
    volatilityTtlSeconds?: number;
    requiresFilter?: boolean;
  };
  aiHints?: { whenToUse?: string; exampleQuestions?: string[] };
  attributes: Record<string, RawAttribute>;
  measures?: Record<string, RawMeasure>;
}

export interface RawRelationship {
  id: QualifiedRef;
  businessName: I18nString;
  description?: string;
  from: QualifiedRef;
  to: QualifiedRef;
  cardinality: string;
  inverseId?: QualifiedRef;
  keyMapping: { fromAttribute: string; toAttribute: string }[];
  traversalCost?: string;
  expectedFanout?: number;
  aiHints?: { whenToUse?: string };
}

export interface RawCatalog {
  schemaVersion: string;
  catalogVersion: number;
  tenantId: string;
  name?: I18nString;
  description?: string;
  lifecycleState: string;
  entities: Record<QualifiedRef, RawEntity>;
  relationships?: Record<QualifiedRef, RawRelationship>;
  domains?: Record<string, { businessName: I18nString; order?: number }>;
  drift?: Record<string, unknown>;
  audit?: Record<string, unknown>;
}

// ── client projection: `physical` removed, entity id carried for convenience ──

export type CatalogAttribute = Omit<RawAttribute, 'physical'> & { entityId: QualifiedRef };
export type CatalogMeasure = Omit<RawMeasure, 'physical'> & { entityId: QualifiedRef };

export interface CatalogEntity {
  id: QualifiedRef;
  businessName: I18nString;
  pluralName?: I18nString;
  synonyms: string[];
  description?: string;
  domain?: string;
  primaryKey: string[];
  labelAttribute?: string;
  effectiveDating?: string;
  sensitivity?: Sensitivity;
  defaultDetailExperience?: string;
  cost?: RawEntity['cost'];
  aiHints?: RawEntity['aiHints'];
  attributes: Record<string, CatalogAttribute>;
  measures: Record<string, CatalogMeasure>;
}

export interface CatalogSnapshot {
  catalogVersion: number;
  tenantId: string;
  entities: Record<QualifiedRef, CatalogEntity>;
  relationships: RawRelationship[];
}
