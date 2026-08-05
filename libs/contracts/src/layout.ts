/** Layout model. Mirrors schemas/layout.schema.json. */

import type {
  ComputableValue,
  Condition,
  ElementSecurity,
  GridPlacement,
  I18nString,
  Identifier,
} from './common';

export interface WidgetNode {
  kind: 'widget';
  id: Identifier;
  component: Identifier;
  placement?: GridPlacement;
  visible?: Condition;
}

export interface SpacerNode {
  kind: 'spacer';
  id: Identifier;
  placement?: GridPlacement;
}

export interface ContainerNode {
  kind: 'container';
  id: Identifier;
  container: Container;
  placement?: GridPlacement;
  visible?: Condition;
  security?: ElementSecurity;
}

export type LayoutNode = WidgetNode | SpacerNode | ContainerNode;

export type Gap = 'none' | 'sm' | 'md' | 'lg';

export interface GridContainer {
  type: 'grid';
  columns?: 12;
  gap?: Gap;
  children: readonly LayoutNode[];
}

export interface StackContainer {
  type: 'stack';
  direction?: 'row' | 'column';
  directionByBreakpoint?: Readonly<Record<string, 'row' | 'column'>>;
  wrap?: boolean;
  gap?: Gap;
  align?: 'start' | 'center' | 'end' | 'stretch';
  justify?: 'start' | 'center' | 'end' | 'spaceBetween';
  children: readonly LayoutNode[];
}

export interface PanelContainer {
  type: 'panel';
  title?: I18nString;
  subtitle?: I18nString;
  collapsible?: boolean;
  collapsedByDefault?: boolean;
  variant?: 'plain' | 'bordered' | 'raised';
  headerActions?: readonly Identifier[];
  children: readonly LayoutNode[];
}

export interface SplitContainer {
  type: 'split';
  orientation?: 'horizontal' | 'vertical';
  initialRatio?: number;
  collapseBelow?: string;
  primary: readonly LayoutNode[];
  secondary: readonly LayoutNode[];
}

export interface DrawerContainer {
  type: 'drawer';
  title?: I18nString;
  side?: 'start' | 'end' | 'bottom';
  size?: 'sm' | 'md' | 'lg' | 'full';
  openWhen?: Condition;
  dismissAction?: Identifier;
  children: readonly LayoutNode[];
}

export interface StaticTab {
  id: Identifier;
  label: I18nString;
  icon?: string;
  badge?: ComputableValue;
  visible?: Condition;
  security?: ElementSecurity;
  deepLinkId?: Identifier;
  content: readonly LayoutNode[];
}

export type TabSource =
  | { mode: 'static'; tabs: readonly StaticTab[] }
  | {
      mode: 'dataDriven';
      source: Identifier;
      idField: Identifier;
      labelField: Identifier;
      iconField?: Identifier;
      badgeField?: Identifier;
      orderField?: Identifier;
      maxTabs?: number;
      emptyBehaviour?: 'hideContainer' | 'showEmptyState';
      template: readonly LayoutNode[];
      pinnedTabs?: readonly StaticTab[];
    };

export interface TabsContainer {
  type: 'tabs';
  variant?: 'underline' | 'pill' | 'enclosed';
  position?: 'top' | 'start';
  overflow?: 'scroll' | 'menu' | 'wrap';
  selectedTabChannel?: Identifier;
  deferContent?: boolean;
  keepAliveOnSwitch?: boolean;
  source: TabSource;
}

export interface RepeaterContainer {
  type: 'repeater';
  source: Identifier;
  keyField: Identifier;
  maxItems?: number;
  emptyBehaviour?: 'hideContainer' | 'showEmptyState';
  itemPlacement?: GridPlacement;
  template: readonly LayoutNode[];
}

export type Container =
  | GridContainer
  | StackContainer
  | PanelContainer
  | SplitContainer
  | DrawerContainer
  | TabsContainer
  | RepeaterContainer;
