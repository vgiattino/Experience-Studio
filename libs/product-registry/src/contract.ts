/**
 * The Product Integration Contract, as types.
 *
 * Mirrors `schemas/product.schema.json` field for field. The schema is the contract of record — it is
 * what a product author validates against and what a reviewer reads — and these interfaces are how
 * TypeScript sees it.
 *
 * ── WHY A CLAIM AND NOT A COPY ───────────────────────────────────────────────
 *
 * A registration says which entities are the product's; it does not carry them. The catalog is where
 * entities live, because ingestion put them there against a real database, and a second copy inside a
 * registration would be a second answer to "what is a Security". `groundingFor()` in `registry.ts` is
 * the join, evaluated against whatever snapshot the caller holds — which also means a product's
 * grounding is correctly *empty* in a tenant that has not ingested its data, rather than notionally
 * present.
 */

import type { ComponentTypeRef, I18nString, Identifier } from '@opus/contracts';

export type ProductStatus = 'active' | 'registered' | 'deprecated';

/** The six families of FR-30, plus the declared escape hatch FR-30 allows. */
export type ProductComponentFamily =
  | 'layout'
  | 'data'
  | 'visualization'
  | 'forms'
  | 'business'
  | 'extension';

export interface ProductGlossaryEntry {
  term: string;
  definition: string;
  seeAlso?: string[];
}

export interface ProductMetadataClaim {
  /** Catalog domains this product owns. A domain resolves to exactly one product. */
  domains?: string[];
  /** Individual entities owned beyond the domains. */
  entities?: string[];
  dataSources?: { id: string; label?: string }[];
  glossary?: ProductGlossaryEntry[];
  apis?: { id: string; label?: string; purpose?: string }[];
}

export interface ProductComponentRegistration {
  type: ComponentTypeRef;
  family?: ProductComponentFamily;
  extensionFamily?: string;
}

export interface ProductTemplateRegistration {
  id: Identifier;
  name: I18nString;
  definitionRef?: string;
  intent?: string;
}

export interface SystemPageRegistration {
  id: Identifier;
  name: I18nString;
  definitionRef?: string;
  override?: 'extend' | 'replace' | 'none';
}

export interface SystemJourneyRegistration {
  id: Identifier;
  name: I18nString;
  description?: string;
  /** Every step names a System Page this same product registered. */
  steps: Identifier[];
}

export interface ProductActionRegistration {
  id: Identifier;
  label: I18nString;
  description?: string;
  capability?: string;
  api?: string;
  mutates?: boolean;
}

export interface ProductCapability {
  id: string;
  label?: string;
  description?: string;
  /** `platform` is what a user may do in the Studio; `data` is which rows the product permits. */
  axis?: 'platform' | 'data';
}

export interface ProductRole {
  id: string;
  label?: string;
  description?: string;
  capabilities?: string[];
}

export interface ProductSecurityRegistration {
  capabilities?: ProductCapability[];
  roles?: ProductRole[];
}

export interface ProductTerm {
  term: string;
  means: string;
  notToBeConfusedWith?: string;
}

export interface ProductAiContext {
  terminology?: ProductTerm[];
  instructions?: string[];
  /** Supplementary identification vocabulary; see the schema's note on why it is a supplement. */
  intentSignals?: string[];
  hints?: { whenToUse?: string; exampleQuestions?: string[] };
}

export interface ProductRegistration {
  schemaVersion: string;
  id: string;
  name: I18nString;
  description?: string;
  productVersion?: string;
  icon?: string;
  status?: ProductStatus;
  metadata?: ProductMetadataClaim;
  components?: ProductComponentRegistration[];
  templates?: ProductTemplateRegistration[];
  systemPages?: SystemPageRegistration[];
  systemJourneys?: SystemJourneyRegistration[];
  actions?: ProductActionRegistration[];
  security?: ProductSecurityRegistration;
  aiContext?: ProductAiContext;
  notes?: string;
}
