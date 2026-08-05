/**
 * @opus/renderer — the deterministic page rendering engine.
 * Layer 5: depends on contracts, platform, design-system, registry and data-client.
 * Notably does NOT depend on `components` — it resolves those through the registry.
 */

export {
  clearCompileCache,
  compilePage,
  sourcesAffectedBy,
  type CompiledContainer,
  type CompiledNode,
  type CompiledPage,
  type CompiledTab,
  type SourceDependencies,
} from './compile-page';
export { CURRENT_SCHEMA_VERSION, MIGRATIONS, migrate, type Migration, type MigrationOutcome } from './migrations';
export { PageContextService, type PageStateChange } from './page-context.service';
export { QueryOrchestratorService } from './query-orchestrator.service';
export {
  ActionDispatcherService,
  type DispatcherHost,
  type NavigationRequest,
} from './action-dispatcher.service';
export { PageLoaderService, type LoadOutcome } from './page-loader.service';
export { PageRendererComponent } from './page-renderer.component';
export { LayoutNodeComponent } from './layout-node.component';
export { WidgetHostComponent } from './widget-host.component';
