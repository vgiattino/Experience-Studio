/**
 * Widget host: dynamic instantiation plus a per-widget error boundary.
 *
 * Two architectural jobs.
 *
 * 1. INSTANTIATION THROUGH THE REGISTRY. The renderer never imports a component
 *    directly; it resolves the type string to a lazily-imported class
 *    (architecture/frontend-architecture.md §5.2). Inputs are set rather than the
 *    component recreated, so later data arrivals update it in place.
 *
 * 2. ERROR ISOLATION. Angular has no built-in error boundary, so the renderer must
 *    provide one. This is not defensive programming — definitions are authored by
 *    business users and written by a model, so a malformed widget is an EXPECTED
 *    condition. One failing widget must never blank a twelve-widget dashboard
 *    (architecture/runtime-architecture.md §7).
 *
 * An unknown component type degrades to a placeholder, never a blank page: registry
 * and definition versions can legitimately skew (§10).
 */

import {
  ChangeDetectionStrategy,
  Component,
  ComponentRef,
  DestroyRef,
  ElementRef,
  ViewContainerRef,
  computed,
  effect,
  inject,
  input,
  signal,
  viewChild,
  type Type,
} from '@angular/core';
import { StateShellComponent } from '@opus/design-system';
import { TelemetryService } from '@opus/platform';
import { isRegistered, resolveComponent } from '@opus/component-registry';
import { text, type ComponentActionEvent, type ComponentManifest, type Identifier } from '@opus/contracts';

import { PageContextService } from './page-context.service';
import { QueryOrchestratorService } from './query-orchestrator.service';
import { ActionDispatcherService } from './action-dispatcher.service';
import type { CompiledPage } from './compile-page';

@Component({
  selector: 'opus-widget-host',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [StateShellComponent],
  template: `
    @if (failure()) {
      <div class="boundary" role="alert">
        <opus-state-shell
          state="error"
          [title]="failure()!.title"
          [message]="failure()!.detail"
          [retryable]="failure()!.retryable"
          (retry)="retry()"
        />
      </div>
    }
    <!-- The container is always present so a retry has somewhere to mount. -->
    <ng-container #outlet />
  `,
  styles: `
    :host {
      display: block;
      block-size: 100%;
      min-inline-size: 0;
    }

    .boundary {
      block-size: 100%;
      background: var(--opus-surface);
      border: 1px solid var(--opus-border);
      border-radius: var(--opus-radius-md);
    }
  `,
})
export class WidgetHostComponent {
  readonly componentId = input.required<Identifier>();
  readonly page = input.required<CompiledPage>();

  private readonly outlet = viewChild.required('outlet', { read: ViewContainerRef });
  private readonly context = inject(PageContextService);
  private readonly orchestrator = inject(QueryOrchestratorService);
  private readonly dispatcher = inject(ActionDispatcherService);
  private readonly telemetry = inject(TelemetryService);
  private readonly host = inject(ElementRef<HTMLElement>);
  private readonly destroyRef = inject(DestroyRef);

  protected readonly failure = signal<{ title: string; detail: string; retryable: boolean } | null>(
    null,
  );

  private ref: ComponentRef<unknown> | null = null;
  private manifest: ComponentManifest | null = null;
  private mountedFor: string | null = null;
  private mountedAt = 0;
  private reportedState: string | null = null;

  private readonly instance = computed(() => this.page().definition.components[this.componentId()]);

  private readonly dataView = computed(() => this.orchestrator.viewFor(this.componentId()));

  constructor() {
    // Mount (or re-mount) when the target component changes.
    effect(() => {
      const instance = this.instance();
      const outlet = this.outlet();
      if (!instance) return;
      const key = `${this.componentId()}:${instance.type}@${instance.typeVersion}`;
      if (this.mountedFor === key) return;
      this.mountedFor = key;
      void this.mount(outlet);
    });

    /**
     * Push data and context on every change, rather than recreating the component.
     *
     * BOTH ARE READ BEFORE THE EARLY RETURN, and that ordering is the whole correctness of this
     * effect. An effect tracks only what it actually read: with the `ref` guard placed first, the
     * initial run — before the lazy component has mounted — read `dataView()` and nothing else, so
     * page state was never a dependency. A widget whose data never changes then never received a
     * context update again.
     *
     * That is invisible for a component that reads its values from `data`, which is every M1
     * component. It is immediately visible for one that reads `context.filters`: the filter bar's
     * search box lost its text the moment the debounce released its local echo, while the page
     * stayed correctly filtered — a component and a page disagreeing about the same state.
     */
    effect(() => {
      const view = this.dataView();
      const context = this.context.componentContext();
      const ref = this.ref;
      if (!ref) return;
      try {
        const instance = ref.instance as object;
        if (Object.prototype.hasOwnProperty.call(instance, 'data')) {
          ref.setInput('data', view);
        }
        if (Object.prototype.hasOwnProperty.call(instance, 'context')) {
          ref.setInput('context', context);
        }
        ref.changeDetectorRef.markForCheck();
      } catch (error) {
        this.fail('Could not update widget', error);
      }
      this.reportState(view.state);
    });

    this.destroyRef.onDestroy(() => this.ref?.destroy());
  }

  private async mount(outlet: ViewContainerRef): Promise<void> {
    const instance = this.instance();
    if (!instance) return;

    this.failure.set(null);
    this.ref?.destroy();
    this.ref = null;
    outlet.clear();
    this.mountedAt = performance.now();

    if (!isRegistered(instance.type)) {
      // Version skew must degrade, never blank the page.
      this.fail(
        'Component unavailable',
        `"${instance.type}" is not in registry version in use. The rest of the page is unaffected.`,
        false,
      );
      this.telemetry.recordWidget({
        widgetId: this.componentId(),
        componentType: instance.type,
        componentVersion: instance.typeVersion,
        state: 'error',
        errorCode: 'unknownComponentType',
      });
      return;
    }

    let resolved: { component: Type<unknown>; manifest: ComponentManifest } | undefined;
    try {
      resolved = await resolveComponent(instance.type);
    } catch (error) {
      this.fail('Could not load component', error);
      return;
    }
    if (!resolved) {
      this.fail('Component unavailable', `"${instance.type}" could not be resolved`, false);
      return;
    }

    this.manifest = resolved.manifest;

    try {
      const ref = outlet.createComponent(resolved.component);
      this.ref = ref;
      this.applyStaticInputs(ref, resolved.manifest);
      this.subscribeToActions(ref);
      ref.changeDetectorRef.markForCheck();
    } catch (error) {
      this.fail('Could not create component', error);
    }
  }

  /**
   * Inputs derived from the definition rather than from data. Set defensively:
   * a component that does not declare an input must not break the mount, since
   * manifests and implementations can drift between versions.
   */
  private applyStaticInputs(ref: ComponentRef<unknown>, manifest: ComponentManifest): void {
    const instance = this.instance()!;
    const overrides = instance.stateOverrides;

    /**
     * Set an input only when the component actually declares it.
     *
     * Probing with try/catch does not work: Angular *logs* NG0303 for an unknown
     * input rather than throwing, so a blind setInput produces console noise the
     * host cannot see. Signal inputs appear as own properties on the instance, so
     * checking first is both quiet and accurate — and a component may legitimately
     * omit optional inputs it has no use for (content.text takes no bindings).
     */
    const declares = (name: string): boolean =>
      Object.prototype.hasOwnProperty.call(ref.instance as object, name);

    const trySet = (name: string, value: unknown) => {
      if (!declares(name)) return;
      try {
        ref.setInput(name, value);
      } catch (error) {
        this.telemetry.recordProblem({
          scope: `widget/${this.componentId()}`,
          code: 'inputRejected',
          detail: `${instance.type} rejected input "${name}": ${String(error)}`,
        });
      }
    };

    trySet('config', instance.config ?? {});
    trySet('title', text(instance.title));
    trySet('bindings', instance.bindings ?? {});
    trySet('encodings', instance.encodings ?? []);
    trySet('data', this.dataView());
    trySet('context', this.context.componentContext());

    const state = this.dataView().state;
    const presentation =
      state === 'empty'
        ? overrides?.empty
        : state === 'error'
          ? overrides?.error
          : state === 'denied'
            ? overrides?.denied
            : state === 'partial'
              ? overrides?.partial
              : undefined;

    trySet('stateTitle', text(presentation?.title));
    trySet('stateMessage', text(presentation?.message));

    // Reserve space from the manifest's skeleton so deferred regions do not shift.
    const minHeight = manifest.performance?.skeleton?.minHeight;
    if (minHeight) this.host.nativeElement.style.setProperty('min-block-size', minHeight);
  }

  private subscribeToActions(ref: ComponentRef<unknown>): void {
    const output = (ref.instance as { action?: { subscribe: (fn: (e: ComponentActionEvent) => void) => void } })
      .action;
    if (!output?.subscribe) return;
    output.subscribe((event: ComponentActionEvent) => {
      void this.dispatcher
        .handleEvent(this.componentId(), event.event, event.payload)
        .catch((error: unknown) => {
          this.telemetry.recordProblem({
            scope: `widget/${this.componentId()}`,
            code: 'actionFailed',
            detail: error instanceof Error ? error.message : String(error),
          });
        });
    });
  }

  private fail(title: string, detail: unknown, retryable = true): void {
    const message = detail instanceof Error ? detail.message : String(detail);
    this.failure.set({ title, detail: message, retryable });
    this.telemetry.recordProblem({
      scope: `widget/${this.componentId()}`,
      code: 'widgetBoundary',
      detail: `${title}: ${message}`,
    });
  }

  protected retry(): void {
    this.mountedFor = null;
    this.failure.set(null);
    void this.mount(this.outlet());
  }

  private reportState(state: string): void {
    if (this.reportedState === state) return;
    this.reportedState = state;
    const instance = this.instance();
    if (!instance) return;
    const view = this.dataView();
    this.telemetry.recordWidget({
      widgetId: this.componentId(),
      componentType: instance.type,
      componentVersion: instance.typeVersion,
      state: view.state,
      timeToReadyMs:
        state === 'ready' || state === 'partial' || state === 'empty'
          ? Math.round(performance.now() - this.mountedAt)
          : undefined,
      rowCount: view.rows.length,
      fromCache: view.fromCache,
      errorCode: view.problem?.code,
    });
  }
}
