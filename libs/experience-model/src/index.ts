/**
 * @opus/experience-model — the Experience model the whole prototype binds to.
 *
 *     Experience
 *       └── Pages
 *             ├── Sections   (layout containers)
 *             ├── Components (configured uses of a registered contract)
 *             ├── Data sources
 *             └── Actions
 *
 * ── WHY THIS IS A FACADE AND NOT A NEW MODEL ─────────────────────────────────
 *
 * The model already exists. `@opus/contracts` is generated from the JSON Schemas in `/schemas`,
 * which are the platform's contract — the renderer, the validator, the builder, the generator, the
 * store and the migration tooling all bind to them. A second set of interfaces named the same
 * things would be a second answer to "what is an Experience", and the two would drift within a
 * milestone. The prototype's brief says everything must use the Experience model; this file is how
 * that is enforced rather than asserted.
 *
 * So what this library adds is the part that was genuinely missing: **names and helpers at the level
 * the prototype talks about.** The schemas describe a page as a layout tree of container nodes; a
 * business user and this app both say "section". `SECTION_TYPES`, `sectionsOf()` and `sectionTitle()`
 * are that vocabulary, mapped onto the model rather than parallel to it.
 *
 * ── SECTION ──────────────────────────────────────────────────────────────────
 *
 * A **Section** is a layout container node — a grid, stack, panel or tab set that groups widgets.
 * It is not a separate model type, and making it one would cost the two properties that make this
 * platform work: layout would stop referencing components by id (so JSON Patch paths into a
 * component would move when a sibling changed), and two-stage generation would lose its seam
 * (plan the sections, then fill each component independently).
 */

// ── The model, re-exported so application code has ONE import for it ─────────
export type {
  // Experience
  ExperienceDefinition,
  ExperienceNavigation,
  NavItem,
  NavBadge,
  // Page
  PageDefinition,
  PageKind,
  PageParameter,
  PageNavigation,
  FilterChannel,
  SelectionChannel,
  ParameterScope,
  // Section / layout
  LayoutNode,
  WidgetNode,
  ContainerNode,
  SpacerNode,
  Container,
  GridContainer,
  StackContainer,
  PanelContainer,
  TabsContainer,
  StaticTab,
  GridPlacement,
  // Component
  ComponentInstance,
  ComponentManifest,
  ComponentCategory,
  ComponentTypeRef,
  WidgetStateName,
  // Data
  DataSource,
  DataSourceKind,
  Select,
  FilterNode,
  FilterClause,
  SortSpec,
  // Data binding
  FieldBinding,
  BindingSet,
  EncodingBinding,
  EncodingChannel,
  FormatSpec,
  // Action
  Action,
  ActionKind,
  NavigateAction,
  DrilldownAction,
  SetFilterAction,
  // Governance
  VersionEnvelope,
  ArtifactSecurity,
  // Runtime
  BatchRequest,
  BatchResponse,
  QueryRequest,
  UserContext,
  DataRow,
  DataView,
  QueryResult,
  Identifier,
  I18nString,
  Expression,
  ComputableValue,
} from '@opus/contracts';

export { isPageRef, STABLE_ACTION_KINDS, RESERVED_ACTION_KINDS } from '@opus/contracts';

export {
  SECTION_TYPES,
  type ContainerType,
  childNodesOf,
  componentIdsOf,
  isSection,
  isWidget,
  sectionTitle,
  sectionsOf,
  widgetNodesOf,
  type Section,
} from './section';

export {
  countWidgets,
  dataSourceIdsOf,
  describeExperience,
  emptyExperience,
  experienceOf,
  pageIdsOf,
  pageOf,
  pageTitle,
  text,
  usedComponentTypes,
  withPage,
  type ExperienceOutline,
  type PageOutline,
} from './experience';

export {
  DRAFT_VERSION,
  isDraft,
  isPublished,
  stampGenerated,
  type GenerationProvenance,
} from './version';

export type { ExperienceSummary, StoredExperience } from './store-types';
