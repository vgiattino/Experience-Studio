/** Action model. Mirrors schemas/action.schema.json. */

import type {
  ComputableValue,
  Condition,
  ElementSecurity,
  Expression,
  I18nString,
  Identifier,
  QualifiedRef,
} from './common';

export interface ActionCommon {
  id: Identifier;
  label?: I18nString;
  description?: I18nString;
  icon?: string;
  emphasis?: 'primary' | 'secondary' | 'tertiary' | 'destructive';
  enabled?: Condition;
  visible?: Condition;
  security?: ElementSecurity;
  confirm?: {
    title?: I18nString;
    message: I18nString;
    confirmLabel?: I18nString;
    requiresReason?: boolean;
  };
  auditProfile?: 'standard' | 'elevated';
  keyboardShortcut?: string;
}

export interface NavigationTarget {
  experience?: string;
  page: Identifier;
  tab?: Identifier;
}

export type OpenIn = 'self' | 'newTab' | 'drawer' | 'modal';

export type ParamMap = Readonly<Record<Identifier, ComputableValue>>;

export interface NavigateAction extends ActionCommon {
  kind: 'navigate';
  target: NavigationTarget;
  params?: ParamMap;
  carryContext?: boolean;
  openIn?: OpenIn;
}

export interface DrilldownAction extends ActionCommon {
  kind: 'drilldown';
  entity: QualifiedRef;
  key?: ParamMap;
  targetOverride?: NavigationTarget;
  additionalParams?: ParamMap;
  carryContext?: boolean;
  openIn?: OpenIn;
}

export interface SetFilterAction extends ActionCommon {
  kind: 'setFilter';
  channel: Identifier;
  value: ComputableValue;
  mode?: 'replace' | 'add' | 'remove' | 'toggle';
}

export interface ClearFiltersAction extends ActionCommon {
  kind: 'clearFilters';
  channels?: readonly Identifier[];
}

export interface SetParameterAction extends ActionCommon {
  kind: 'setParameter';
  parameter: Identifier;
  value: ComputableValue;
  updateUrl?: boolean;
}

export interface SetSelectionAction extends ActionCommon {
  kind: 'setSelection';
  channel: Identifier;
  value?: ComputableValue;
  mode?: 'replace' | 'add' | 'remove' | 'toggle' | 'clear';
}

export interface RefreshAction extends ActionCommon {
  kind: 'refresh';
  dataSources?: readonly Identifier[];
  bypassCache?: boolean;
}

export interface ExportAction extends ActionCommon {
  kind: 'export';
  dataSource: Identifier;
  scope?: 'view' | 'all';
  format: 'csv' | 'xlsx' | 'pdf' | 'json';
  fileNameTemplate?: string;
  includeMetadata?: boolean;
}

export interface OpenUrlAction extends ActionCommon {
  kind: 'openUrl';
  urlTemplate: string;
  params?: ParamMap;
  target?: 'newTab' | 'self';
}

export interface OpenOverlayAction extends ActionCommon {
  kind: 'openOverlay';
  overlay: Identifier;
  params?: ParamMap;
}

export interface CompositeAction extends ActionCommon {
  kind: 'composite';
  steps: readonly Identifier[];
  onError?: 'abort' | 'continue';
}

/** RESERVED — v2 write-back. Rejected by the M1 validator. */
export interface InvokeAction extends ActionCommon {
  kind: 'invoke';
  operation: string;
  payload?: ParamMap;
  targetSelection?: Identifier;
  idempotencyKeyFrom?: Expression;
  optimisticConcurrency?: Identifier;
  onSuccess?: readonly Identifier[];
  onFailure?: readonly Identifier[];
}

/** RESERVED — v3 workflow. Rejected by the M1 validator. */
export interface WorkflowAction extends ActionCommon {
  kind: 'workflow';
  operation:
    | 'start'
    | 'completeTask'
    | 'approve'
    | 'reject'
    | 'reassign'
    | 'escalate'
    | 'comment'
    | 'cancel';
  processDefinition?: string;
  taskRef?: ComputableValue;
  payload?: ParamMap;
  assignTo?: ComputableValue;
  onSuccess?: readonly Identifier[];
}

export type Action =
  | NavigateAction
  | DrilldownAction
  | SetFilterAction
  | ClearFiltersAction
  | SetParameterAction
  | SetSelectionAction
  | RefreshAction
  | ExportAction
  | OpenUrlAction
  | OpenOverlayAction
  | CompositeAction
  | InvokeAction
  | WorkflowAction;

export type ActionKind = Action['kind'];

/** Kinds the v1 runtime executes. `invoke` and `workflow` are reserved seams. */
export const STABLE_ACTION_KINDS: readonly ActionKind[] = [
  'navigate',
  'drilldown',
  'setFilter',
  'clearFilters',
  'setParameter',
  'setSelection',
  'refresh',
  'export',
  'openUrl',
  'openOverlay',
  'composite',
];

export const RESERVED_ACTION_KINDS: readonly ActionKind[] = ['invoke', 'workflow'];
