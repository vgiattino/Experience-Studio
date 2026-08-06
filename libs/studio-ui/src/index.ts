/**
 * @opus/studio-ui — the authoring surface.
 *
 * Every panel here is a *view* of the page definition and a *producer of patches*. None of them
 * holds editing state, none of them writes to the definition directly, and none of them knows
 * anything a component's manifest or the catalog could not tell it — which is what stops the
 * builder from becoming the ceiling of the platform.
 *
 * The canvas uses `PageRendererComponent` exactly as the Viewer does. That is the load-bearing
 * constraint of the whole library (frontend-architecture.md §2.1): preview and production differ
 * in which version is loaded and whose entitlements apply, never in code path.
 */

export { CanvasComponent } from './canvas.component';
export { HistoryPanelComponent } from './history-panel.component';
export { InspectorComponent } from './inspector.component';
export { JsonViewComponent } from './json-view.component';
export { OutlineComponent } from './outline.component';
export { PaletteComponent } from './palette.component';
export { SourcesPanelComponent } from './sources-panel.component';
export { ActionsPanelComponent } from './actions-panel.component';
export { PagePanelComponent } from './page-panel.component';

export { EditorService } from './editor.service';
export {
  AssistService,
  type AssistStatus,
  type AssistSuggestion,
} from './assist.service';
export { AssistPanelComponent } from './assist-panel.component';
export {
  DragStateService,
  DRAG_MIME,
  positionWithin,
  type DragPayload,
  type DropPosition,
  type DropTarget,
} from './drag-state.service';

export {
  coerceFieldValue,
  fieldsForManifest,
  humanize,
  orderedFieldsForManifest,
  type FieldKind,
  type PropertyField,
} from './property-schema';
