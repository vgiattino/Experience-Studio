/** Component manifest and instance models. */

import type {
  ComponentTypeRef,
  Condition,
  DataType,
  ElementSecurity,
  I18nString,
  Identifier,
  MemberName,
} from './common';
import type { BindingSet, EncodingBinding } from './data-source';
import type { LayoutNode } from './layout';

export type ComponentCategory = 'layout' | 'data' | 'analytics' | 'business' | 'input' | 'content';

export type DataShape = 'none' | 'scalar' | 'series' | 'tabular' | 'tree' | 'graph';

export type WidgetStateName = 'ready' | 'loading' | 'empty' | 'partial' | 'error' | 'denied';

export type SkeletonShape = 'block' | 'tile' | 'table' | 'chart' | 'list' | 'text';

export interface BindingRole {
  role: MemberName;
  label?: I18nString;
  required?: boolean;
  repeated?: boolean;
  accepts: readonly ('attribute' | 'measure' | 'dimension' | 'key' | 'any')[];
  dataTypes?: readonly DataType[];
}

export interface ComponentManifest {
  schemaVersion: string;
  type: ComponentTypeRef;
  version: string;
  name: I18nString;
  category: ComponentCategory;
  description?: string;
  icon?: string;
  generation: {
    purpose: string;
    whenToUse: string;
    whenNotToUse?: string;
    keyProperties?: readonly MemberName[];
    exampleConfig?: Record<string, unknown>;
    eligible?: boolean;
  };
  /** JSON Schema for the instance `config` object. Validated at level 2. */
  properties: Record<string, unknown>;
  dataRequirement: {
    shape: DataShape;
    roles?: readonly BindingRole[];
    maxRows?: number;
  };
  slots?: Readonly<
    Record<
      MemberName,
      {
        label?: I18nString;
        minChildren?: number;
        maxChildren?: number;
        allowedCategories?: readonly ComponentCategory[];
        allowedTypes?: readonly ComponentTypeRef[];
      }
    >
  >;
  events?: Readonly<
    Record<
      MemberName,
      {
        label?: I18nString;
        description?: string;
        payload?: Readonly<Record<MemberName, { dataType?: DataType; description?: string }>>;
      }
    >
  >;
  states: readonly WidgetStateName[];
  breakpoints?: Readonly<
    Record<
      string,
      {
        supported?: boolean;
        minColSpan?: number;
        behaviour?: 'full' | 'condensed' | 'stacked' | 'scrollable' | 'summaryOnly' | 'hidden';
        note?: string;
      }
    >
  >;
  accessibility: {
    wcagLevel: 'AA' | 'AAA' | 'pending';
    keyboardContract?: string;
    requiredLabels?: readonly MemberName[];
    colourIndependent?: boolean;
    notes?: string;
  };
  capabilities?: readonly string[];
  performance?: {
    renderBudgetMs?: number;
    virtualized?: boolean;
    skeleton?: { minHeight?: string; shape?: SkeletonShape };
  };
  lifecycle: {
    stability: 'experimental' | 'stable' | 'deprecated';
    since?: string;
    deprecatedIn?: string;
    replacedBy?: ComponentTypeRef;
    migrationNote?: string;
  };
  bundle: { libraryPath: string; exportName: string };
}

export interface StatePresentation {
  title?: I18nString;
  message?: I18nString;
  icon?: string;
  action?: Identifier;
}

export interface ComponentInstance {
  id: Identifier;
  type: ComponentTypeRef;
  typeVersion: string;
  title?: I18nString;
  subtitle?: I18nString;
  description?: I18nString;
  config?: Readonly<Record<string, unknown>>;
  dataSource?: Identifier;
  bindings?: BindingSet;
  encodings?: readonly EncodingBinding[];
  slots?: Readonly<Record<MemberName, readonly LayoutNode[]>>;
  eventActions?: Readonly<Record<MemberName, Identifier | readonly Identifier[]>>;
  writesTo?: { filters?: readonly Identifier[]; selections?: readonly Identifier[] };
  visible?: Condition;
  security?: ElementSecurity;
  stateOverrides?: {
    empty?: StatePresentation;
    error?: StatePresentation;
    denied?: StatePresentation;
    partial?: StatePresentation;
    loading?: { skeleton?: SkeletonShape };
  };
  deniedBehaviour?: 'deniedState' | 'hide' | 'placeholder';
  notes?: string;
}
