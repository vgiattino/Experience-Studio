/** Page, experience and versioning models. */

import type {
  ComputableValue,
  Condition,
  DataType,
  I18nString,
  Identifier,
  QualifiedRef,
  Sensitivity,
} from './common';
import type { ComponentInstance } from './component';
import type { DataSource } from './data-source';
import type { LayoutNode } from './layout';
import type { Action } from './action';

export type PageKind = 'dashboard' | 'search' | 'detail' | 'workspace' | 'process' | 'blank';

export type ParameterScope = 'page' | 'experience' | 'session';

export interface PageParameter {
  label?: I18nString;
  dataType: DataType;
  required?: boolean;
  multiValued?: boolean;
  default?: ComputableValue;
  scope?: ParameterScope;
  syncToUrl?: boolean;
  boundToEntity?: QualifiedRef;
  boundToAttribute?: QualifiedRef;
  allowedValues?: readonly (string | number | boolean)[];
  description?: I18nString;
}

export interface FilterChannel {
  label?: I18nString;
  dataType: DataType;
  multiValued?: boolean;
  default?: ComputableValue;
  boundToAttribute?: QualifiedRef;
  syncToUrl?: boolean;
  persist?: 'none' | 'session' | 'user';
  clearable?: boolean;
  description?: I18nString;
}

export interface SelectionChannel {
  label?: I18nString;
  mode?: 'single' | 'multiple';
  entity?: QualifiedRef;
  keyFields?: readonly Identifier[];
  syncToUrl?: boolean;
}

export interface ArtifactSecurity {
  intendedAudience?: string;
  requiredRoles?: readonly string[];
  requiredCapabilities?: readonly string[];
  workspaceScope?: 'personal' | 'workspace' | 'tenant' | 'platform';
  deniedDataPolicy?: 'showDeniedState' | 'hideComponent';
  sensitivityDeclaration?: {
    maxSensitivity: Sensitivity;
    contributingRefs?: readonly QualifiedRef[];
    computedAt?: string;
    computedFromCatalogVersion?: number;
  };
  exportPolicy?: {
    allowed?: boolean;
    formats?: readonly string[];
    maxRows?: number;
    requiresReason?: boolean;
    watermark?: boolean;
  };
  auditProfile?: 'standard' | 'elevated';
  sharingPolicy?: {
    allowCopy?: boolean;
    allowTemplate?: boolean;
    allowCrossTenantExemplar?: boolean;
  };
}

/**
 * Where a definition came from.
 *
 * Named rather than inline because a second copy of the list had already drifted from it: the server's
 * experience store declared its own narrower union, so a definition whose provenance was `import`
 * produced a stored record with an origin its own type said was impossible. Nothing type-checked the
 * server, so the lie was invisible — see `tsconfig.server.json`.
 */
export type ProvenanceOrigin =
  | 'human'
  | 'ai'
  | 'aiRefined'
  | 'template'
  | 'import'
  | 'migration'
  | 'copy';

export interface VersionEnvelope {
  schemaVersion: string;
  artifactVersion: number;
  lifecycleState: 'draft' | 'inReview' | 'approved' | 'published' | 'deprecated' | 'archived';
  immutable?: boolean;
  pins: { catalogVersion: number; registryVersion: string };
  lineage?: Record<string, unknown>;
  provenance?: {
    origin: ProvenanceOrigin;
    actorId: string;
    createdAt: string;
    generation?: {
      prompt?: string;
      intentClass?: string;
      promptTemplateVersion?: string;
      modelId: string;
      modelVersion: string;
      temperature?: number;
      retrievedConcepts?: readonly QualifiedRef[];
      exemplarTemplateIds?: readonly string[];
      validationAttempts?: number;
      repairedStages?: readonly string[];
      fallbackUsed?: boolean;
      correlationId?: string;
      [k: string]: unknown;
    };
    editSummary?: Record<string, unknown>;
    migration?: Record<string, unknown>;
  };
  validation?: {
    status: 'valid' | 'validWithWarnings' | 'invalid';
    stagesPassed?: readonly string[];
    warnings?: readonly { stage: string; path?: string; code: string; message: string }[];
    validatedAt?: string;
  };
  governance?: Record<string, unknown>;
  audit?: Record<string, unknown>;
}

export interface PageDefinition {
  schemaVersion: string;
  id: Identifier;
  name: I18nString;
  description?: I18nString;
  kind: PageKind;
  route?: string;
  parameters?: Readonly<Record<Identifier, PageParameter>>;
  filters?: Readonly<Record<Identifier, FilterChannel>>;
  selections?: Readonly<Record<Identifier, SelectionChannel>>;
  dataSources?: Readonly<Record<Identifier, DataSource>>;
  components: Readonly<Record<Identifier, ComponentInstance>>;
  layout: LayoutNode;
  overlays?: Readonly<Record<Identifier, LayoutNode>>;
  actions?: Readonly<Record<Identifier, Action>>;
  navigation?: PageNavigation;
  security?: ArtifactSecurity;
  presentation?: {
    themeRef?: string;
    density?: 'comfortable' | 'compact';
    maxWidth?: 'contained' | 'full';
    showPageHeader?: boolean;
    headerSummary?: Identifier;
  };
  localization?: {
    defaultLocale?: string;
    supportedLocales?: readonly string[];
    stringTableRef?: string;
  };
  performance?: {
    renderBudgetMs?: number;
    maxEagerDataSources?: number;
    autoRefreshSeconds?: number;
  };
  version: VersionEnvelope;
  tags?: readonly string[];
}

// ── Navigation ──────────────────────────────────────────────────────────────

export interface PageNavigation {
  breadcrumbs?: {
    mode?: 'auto' | 'explicit' | 'none';
    items?: readonly { label: I18nString; page?: Identifier; params?: Record<string, unknown> }[];
    titleFrom?: ComputableValue;
  };
  backBehaviour?: 'history' | 'declaredParent' | 'none';
  relatedLinks?: readonly {
    id: Identifier;
    label: I18nString;
    action: Identifier;
    visible?: Condition;
  }[];
  pageActions?: readonly Identifier[];
}

export interface NavBadge {
  source: Identifier;
  field: Identifier;
  emphasis?: string;
}

export type NavItem =
  | {
      kind: 'page';
      id: Identifier;
      label: I18nString;
      icon?: string;
      page: Identifier;
      params?: Record<string, ComputableValue>;
      badge?: NavBadge;
      visible?: Condition;
    }
  | {
      kind: 'group';
      id: Identifier;
      label: I18nString;
      icon?: string;
      collapsedByDefault?: boolean;
      children: readonly NavItem[];
      visible?: Condition;
    }
  | {
      kind: 'experienceLink';
      id: Identifier;
      label: I18nString;
      icon?: string;
      experience: string;
      page: Identifier;
      params?: Record<string, ComputableValue>;
      visible?: Condition;
    }
  | {
      kind: 'external';
      id: Identifier;
      label: I18nString;
      icon?: string;
      urlTemplate: string;
      visible?: Condition;
    }
  | { kind: 'divider'; id: Identifier; label?: I18nString };

export interface ExperienceNavigation {
  mode?: 'sidebar' | 'topbar' | 'sidebarCollapsed' | 'none';
  items: readonly NavItem[];
  homePage?: Identifier;
  showSearch?: { enabled?: boolean; entity?: QualifiedRef; placeholder?: I18nString };
  drilldownTargets?: Readonly<
    Record<QualifiedRef, { page: Identifier; tab?: Identifier; openIn?: string }>
  >;
}

/**
 * Who answers for an experience.
 *
 * Deliberately not any of the three fields it sits next to. `version.audit.createdBy` is who first
 * made it, `version.provenance.actorId` is who produced one particular version, and `workspaceId` is
 * where it lives — an experience can outlive all three and still need somebody accountable for it.
 *
 * `userId` is a person, never a role or a group. Accountability that cannot be addressed to somebody
 * is not accountability, and the approval step exists to put a name against a decision.
 */
export interface ExperienceOwner {
  userId: string;
  assignedAt?: string;
  /** Equal to `userId` at creation; different after a transfer, which is what evidences the transfer. */
  assignedBy?: string;
}

export interface ExperienceDefinition {
  schemaVersion: string;
  id: string;
  name: I18nString;
  description?: I18nString;
  icon?: string;
  kind?: 'application' | 'single' | 'process';
  workspaceId?: string;
  /** Optional here so pre-ownership artifacts type-check; the server never stores one without it. */
  owner?: ExperienceOwner;
  pages: Readonly<Record<Identifier, PageDefinition | { $pageRef: string }>>;
  navigation?: ExperienceNavigation;
  parameters?: Readonly<Record<Identifier, PageParameter & { exposedInShell?: boolean }>>;
  dataSources?: Readonly<Record<Identifier, DataSource>>;
  actions?: Readonly<Record<Identifier, Action>>;
  security?: ArtifactSecurity;
  presentation?: Record<string, unknown>;
  localization?: Record<string, unknown>;
  environments?: readonly string[];
  version: VersionEnvelope;
  tags?: readonly string[];
}

export const isPageRef = (v: unknown): v is { $pageRef: string } =>
  typeof v === 'object' && v !== null && '$pageRef' in v;
