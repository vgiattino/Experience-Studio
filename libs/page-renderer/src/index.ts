/**
 * @opus/page-renderer — rendering an Experience, JSON in and pixels out.
 *
 * The engine is `@opus/renderer` and it is not reimplemented here. What this library adds is the
 * level above a single page: **an Experience host** that resolves a page from an experience, seeds
 * its parameters, renders it, and handles what the page asks for next — navigate, drill down, open a
 * URL. Those are experience-level concerns, and putting them in the app would mean every surface that
 * renders an experience (the Create preview, the runtime, a future thumbnail) re-implemented them.
 *
 * One renderer, three surfaces. The Create screen's preview and the saved-experience runtime differ
 * only in where the definition came from — never in code path. A separate preview renderer is the
 * standard origin of "it worked in preview" defects, and this prototype does not have one.
 */

export { ExperienceHostComponent } from './experience-host.component';
export { ExperienceRuntimeService, type PageLoadState } from './experience-runtime.service';
export { RENDERABLE_STATES, stateLabel } from './states';

// Re-exported so an application never needs to reach past this library to render.
export {
  PageRendererComponent,
  PageLoaderService,
  type CompiledPage,
  type LoadOutcome,
  type NavigationRequest,
} from '@opus/renderer';
