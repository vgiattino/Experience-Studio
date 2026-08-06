/**
 * @opus/studio-core — the editing model.
 *
 * There isn't one. That is the point, and it is the single most important property of this
 * library: the editor's model IS the page definition the runtime interprets
 * (architecture/frontend-architecture.md §4.3). No scene graph, no editor envelope, no sidecar
 * of canvas positions. Every editing position is a JSON Pointer into the definition, every
 * mutation is a JSON Patch, and undo is the inverse patch.
 *
 * The layering consequence: this library depends on `contracts` and `platform` only. It knows
 * nothing about Angular components, the DOM, or drag events — which is why the whole editing
 * vocabulary is testable as pure functions.
 */

export {
  applyPatch,
  describeOp,
  encodeSegment,
  getAtPointer,
  hasPointer,
  invertPatch,
  parsePointer,
  PatchError,
  pointer,
  type PatchOp,
} from './json-patch';

export {
  acceptsChildren,
  ancestorsOf,
  childListsOf,
  labelForNode,
  locateNode,
  referencedComponentIds,
  referencedDataSourceIds,
  walkLayout,
  wouldCreateCycle,
  type ChildList,
  type LocatedNode,
} from './layout-tree';

export {
  addBoundWidget,
  addContainer,
  addSpacer,
  addWidget,
  attachDataSource,
  createDataSource,
  defaultConfigFor,
  duplicateNode,
  isRefusal,
  moveNode,
  removeDataSourceIfUnused,
  removeNode,
  setBindingField,
  setComponentConfig,
  setContainerOption,
  setContainerType,
  setGap,
  setPageProperty,
  setPlacement,
  setValue,
  uniqueId,
  wrapInContainer,
  type AddBoundWidgetInput,
  type AddWidgetInput,
  type Command,
  type CommandRefusal,
  type CommandResult,
  type CreateDataSourceInput,
  type MoveNodeInput,
} from './commands';

export {
  DefinitionStore,
  type ApplyOutcome,
  type HistoryEntry,
} from './definition-store.service';

export {
  aspectCounts,
  describeAction,
  describeFilter,
  summariseActions,
  summariseSource,
  summariseSources,
  tabSourceOf,
  type ActionSummary,
  type AspectCounts,
  type SelectedField,
  type SourceSummary,
} from './describe';

export { SelectionService, PREVIEW_SIZES, type PreviewSize } from './selection.service';
export { DraftStore, type PageListing } from './draft-store.service';
