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
 * A product-standard experience's own identity and version (PRD §16.2).
 *
 * `version` is MAJOR.MINOR to match the document's vocabulary — §16.6 talks in `v1.0` and `v2.0`.
 */
export interface StandardDeclaration {
  /** Stable across versions, and separate from the experience `id` so a rename is not a new standard. */
  standardId: string;
  /** The standard's product version. Not `artifactVersion`. */
  version: string;
  /** The release that shipped this version, in the product's own vocabulary. */
  productRelease?: string;
  /** What changed, in the product team's words — read beside the computed diff in §16.4. */
  releaseNotes?: string;
}

/**
 * What a client experience was derived from, and how far its baseline has moved since (PRD §16.1).
 *
 * The baseline is `standardVersion`, and it changes: a synchronisation moves it forward and records
 * the step in `syncedFromVersion`. That is why this is not simply a copy record — the whole point is
 * that the relationship has a future.
 */
export interface StandardLineage {
  standardId: string;
  /** The standard version this is currently based on. Compared against the shipped one for §16.3. */
  standardVersion: string;
  productRelease?: string;
  derivedAt: string;
  derivedBy: string;
  /** Absent until the first synchronisation — meaning it is still on its original baseline. */
  syncedAt?: string;
  syncedFromVersion?: string;
  syncedBy?: string;
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

/**
 * One step in an embedded business process.
 *
 * `approval` is a named human decision; `action` invokes one of the experience's own actions. Two
 * kinds because two are what FR-18 states — notification, timer and branch steps are absent on
 * purpose rather than forgotten.
 */
export interface WorkflowStep {
  id: Identifier;
  name: I18nString;
  kind: 'approval' | 'action';
  /** Who may complete it. An approval without one is a decision anybody can make. */
  requiredCapabilities?: readonly string[];
  /** For `kind: 'action'` — an action this experience declares. Checked referentially. */
  actionId?: Identifier;
  note?: string;
}

/**
 * Business process embedded in the experience.
 *
 * The design claim, borrowed from the agent model: a workflow's reach is a **subset of what the
 * experience already declares**. A step that acts invokes one of the experience's own `actions`; it
 * introduces no parallel action system and no new execution path.
 *
 * Declarative only — nothing executes these. Branching, parallelism, loops, timers, escalation and
 * in-flight state are all deliberately absent: the requirement claims order and nothing more, and a
 * speculative process language is worse than none.
 */
export interface Workflow {
  name: I18nString;
  description?: string;
  trigger?: { kind: 'manual' | 'onAction'; actionId?: Identifier };
  /** An array because order is the only structure claimed. */
  steps: readonly WorkflowStep[];
}

/**
 * Terminology and instructions that scope AI behaviour for one experience.
 *
 * `extends: 'product'` layers this over the product-level context rather than replacing it, which is
 * what FR-19 requires. Explicit rather than implied so that standing alone is a visible choice.
 */
export interface ExperienceAiContext {
  extends?: 'product' | 'none';
  terminology?: readonly { term: string; means: string; notToBeConfusedWith?: string }[];
  instructions?: readonly string[];
  hints?: { whenToUse?: string; whenNotToUse?: string; exampleQuestions?: readonly string[]; preferOver?: readonly string[] };
}

export interface ExperienceDocumentation {
  purpose?: string;
  audience?: string;
  notes?: string;
  links?: readonly { label: string; href: string }[];
}

/**
 * One regression test.
 *
 * `expect` is prose because no runner exists, and an executable assertion syntax that nothing executes
 * is a dialect the model never grows into. `covers` is the part that works today: impact analysis reads
 * it to decide which tests a dependency change should re-run.
 */
export interface ExperienceTest {
  name: string;
  origin?: 'authored' | 'generated';
  covers?: {
    pages?: readonly Identifier[];
    dataSources?: readonly Identifier[];
    entities?: readonly string[];
  };
  given?: string;
  expect: string;
  /** Nothing writes this yet — there is no runner. */
  lastRun?: { at: string; result: 'pass' | 'fail' | 'skipped'; detail?: string };
}

export interface ExperienceDefinition {
  schemaVersion: string;
  id: string;
  name: I18nString;
  description?: I18nString;
  icon?: string;
  kind?: 'application' | 'single' | 'process';
  workspaceId?: string;
  /**
   * Set when this artifact IS a product-standard experience (PRD §16).
   *
   * `version` here is the standard's *product* version — the `v1.0` of §16.6 — and is unrelated to
   * `version.artifactVersion`, which counts saves. Two independent version lines against one page is
   * exactly what §16.6 describes, and collapsing them makes "which standard is my page based on"
   * unanswerable.
   *
   * A standard is deployed, never saved: the store refuses any save whose target carries this field.
   */
  standard?: StandardDeclaration;
  /**
   * Set when this artifact is a client-specific experience derived from a standard (PRD §16.1, FR-20).
   *
   * A standing relationship rather than a snapshot, which is what separates it from
   * `version.lineage.copiedFrom`: a copy expects nothing of its source, a derivation expects to be
   * told when the source moves.
   */
  derivedFrom?: StandardLineage;
  /**
   * Which Opus product this belongs to, by its registration id (`@opus/product-registry`).
   *
   * Derived by the server from the entities the data sources read, not asserted by the author — a
   * product is a fact about what an experience reads, and a typed label can be wrong and stay wrong.
   * Absent for an experience over unclaimed entities, and absent when its pages span two products,
   * which is a case the PRD leaves open rather than one the server resolves.
   */
  productId?: string;
  /** Optional here so pre-ownership artifacts type-check; the server never stores one without it. */
  owner?: ExperienceOwner;
  pages: Readonly<Record<Identifier, PageDefinition | { $pageRef: string }>>;
  navigation?: ExperienceNavigation;
  parameters?: Readonly<Record<Identifier, PageParameter & { exposedInShell?: boolean }>>;
  dataSources?: Readonly<Record<Identifier, DataSource>>;
  actions?: Readonly<Record<Identifier, Action>>;
  security?: ArtifactSecurity;
  /** Business process embedded in the artifact rather than bolted on after publish (FR-18). */
  workflows?: Readonly<Record<Identifier, Workflow>>;
  /** Terminology and instructions scoping AI behaviour for this experience (FR-19). */
  aiContext?: ExperienceAiContext;
  documentation?: ExperienceDocumentation;
  /** What impact analysis selects from and generated regression tests populate (FR-19, FR-34, FR-36). */
  tests?: Readonly<Record<Identifier, ExperienceTest>>;
  presentation?: Record<string, unknown>;
  localization?: Record<string, unknown>;
  environments?: readonly string[];
  version: VersionEnvelope;
  tags?: readonly string[];
}

export const isPageRef = (v: unknown): v is { $pageRef: string } =>
  typeof v === 'object' && v !== null && '$pageRef' in v;
