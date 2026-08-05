/**
 * Page renderer root.
 *
 * Provides the per-page services (PageContext, QueryOrchestrator, ActionDispatcher)
 * at THIS component's injector rather than the application root, so several pages
 * can coexist — a Studio preview beside a canvas, a page inside a drawer
 * (architecture/frontend-architecture.md §4.1).
 *
 * Also owns the page breakpoint via a ResizeObserver on its own element, which is
 * what makes placement respond to the space the page actually has rather than to the
 * viewport.
 */

import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  ElementRef,
  computed,
  effect,
  inject,
  input,
  output,
  signal,
} from '@angular/core';
import { GatewayService } from '@opus/data-client';
import { breakpointForWidth } from '@opus/platform';
import { text, type Breakpoint, type ExperienceNavigation, type UserContext } from '@opus/contracts';

import type { CompiledPage } from './compile-page';
import { LayoutNodeComponent } from './layout-node.component';
import { PageContextService } from './page-context.service';
import { QueryOrchestratorService } from './query-orchestrator.service';
import { ActionDispatcherService, type NavigationRequest } from './action-dispatcher.service';

@Component({
  selector: 'opus-page-renderer',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [LayoutNodeComponent],
  providers: [PageContextService, QueryOrchestratorService, ActionDispatcherService],
  host: {
    '[attr.data-density]': 'density()',
    '[attr.data-breakpoint]': 'breakpoint()',
  },
  template: `
    <div class="page" [attr.data-width]="maxWidth()">
      @if (showHeader()) {
        <header class="page-header">
          <div>
            <h1>{{ pageName() }}</h1>
            @if (pageDescription()) {
              <p class="page-description">{{ pageDescription() }}</p>
            }
          </div>
          @if (pageActions().length) {
            <div class="page-actions">
              @for (action of pageActions(); track action.id) {
                <button
                  type="button"
                  class="page-action"
                  [attr.data-emphasis]="action.emphasis"
                  (click)="dispatch(action.id)"
                >
                  {{ action.label }}
                </button>
              }
            </div>
          }
        </header>
      }

      <opus-layout-node [node]="page().layout" [page]="page()" />
    </div>
  `,
  styles: `
    :host {
      display: block;
      container-type: inline-size;
    }

    .page {
      display: flex;
      flex-direction: column;
      gap: var(--opus-gap-lg);
      padding: var(--opus-space-5);
      margin-inline: auto;
      inline-size: 100%;
    }

    .page[data-width='contained'] {
      max-inline-size: var(--opus-page-max-width);
    }

    .page-header {
      display: flex;
      align-items: flex-start;
      justify-content: space-between;
      gap: var(--opus-space-4);
      flex-wrap: wrap;
    }

    h1 {
      margin: 0;
      font-size: var(--opus-text-xl);
      font-weight: var(--opus-weight-semibold);
      color: var(--opus-text);
    }

    .page-description {
      margin: var(--opus-space-1) 0 0;
      font-size: var(--opus-text-sm);
      color: var(--opus-text-secondary);
    }

    .page-actions {
      display: flex;
      gap: var(--opus-space-2);
    }

    .page-action {
      padding: var(--opus-space-2) var(--opus-space-4);
      font: inherit;
      font-size: var(--opus-text-sm);
      color: var(--opus-text);
      background: var(--opus-surface);
      border: 1px solid var(--opus-border-strong);
      border-radius: var(--opus-radius-sm);
      cursor: pointer;
    }

    .page-action[data-emphasis='primary'] {
      color: var(--opus-text-inverse);
      background: var(--opus-emphasis-info);
      border-color: var(--opus-emphasis-info);
    }

    .page-action:hover {
      background: var(--opus-surface-hover);
    }

    .page-action[data-emphasis='primary']:hover {
      opacity: 0.9;
      background: var(--opus-emphasis-info);
    }

    .page-action:focus-visible {
      outline: 2px solid var(--opus-focus-ring);
      outline-offset: 2px;
    }

    @container (max-width: 640px) {
      .page {
        padding: var(--opus-space-3);
      }
    }
  `,
})
export class PageRendererComponent {
  readonly page = input.required<CompiledPage>();
  readonly user = input.required<UserContext>();
  readonly initialParams = input<Record<string, unknown>>({});
  readonly experienceNavigation = input<ExperienceNavigation | undefined>(undefined);

  readonly navigationRequested = output<NavigationRequest>();
  readonly exportRequested = output<{ dataSource: string; format: string; reason?: string }>();

  /**
   * The page breakpoint the renderer resolved, as it resolves it.
   *
   * Published because `data-breakpoint` on the host was already there for the same purpose, and
   * an observer reading it back off the DOM cannot know when Angular has finished writing it —
   * the Studio's responsive preview read the *previous* value on every width change. A typed
   * output removes the race and the DOM dependency at once.
   */
  readonly breakpointChange = output<Breakpoint>();

  private readonly host = inject(ElementRef<HTMLElement>);
  private readonly destroyRef = inject(DestroyRef);
  private readonly gateway = inject(GatewayService);

  protected readonly context = inject(PageContextService);
  private readonly orchestrator = inject(QueryOrchestratorService);
  private readonly dispatcher = inject(ActionDispatcherService);

  /**
   * The compiled page currently attached, held BY REFERENCE.
   *
   * Not by `cacheKey`: that is `id@artifactVersion`, which is identical for every edit of a
   * mutable document, so a builder adding a data source would never see it queried — the widget
   * sat at "—" forever while the definition was correct. Object identity is exactly the right
   * test, because `compilePage` returns the same object for a cache hit and a new one for a
   * recompile, which is the distinction this guard is trying to make.
   *
   * This was the third place `(id, artifactVersion)` had been used as content identity. It is a
   * valid identity for a published, immutable artifact and for nothing else.
   */
  private attachedTo = signal<CompiledPage | null>(null);

  protected readonly breakpoint = this.context.breakpoint;
  protected readonly density = computed(
    () => this.page().definition.presentation?.density ?? 'comfortable',
  );
  protected readonly maxWidth = computed(
    () => this.page().definition.presentation?.maxWidth ?? 'contained',
  );
  protected readonly showHeader = computed(
    () => this.page().definition.presentation?.showPageHeader !== false,
  );
  protected readonly pageName = computed(() => text(this.page().definition.name));
  protected readonly pageDescription = computed(() => text(this.page().definition.description));

  protected readonly pageActions = computed(() => {
    const definition = this.page().definition;
    const actions = definition.actions ?? {};
    return (definition.navigation?.pageActions ?? [])
      .map((id) => actions[id])
      .filter((a): a is NonNullable<typeof a> => a !== undefined)
      .filter((a) => !a.visible || this.context.test(a.visible.$expr))
      .filter((a) => this.permitted(a.security?.requiredCapabilities))
      .map((a) => ({ id: a.id, label: text(a.label) || a.id, emphasis: a.emphasis ?? 'secondary' }));
  });

  constructor() {
    // Attach the page when it changes, then run the eager batch.
    effect(() => {
      const page = this.page();
      const user = this.user();
      if (this.attachedTo() === page) return;
      this.attachedTo.set(page);

      this.context.initialize(page.definition, user, this.initialParams());
      this.orchestrator.attach(page);
      this.dispatcher.attach(
        page.definition,
        {
          navigate: (request) => this.navigationRequested.emit(request),
          exportData: (dataSource, format, reason) =>
            this.exportRequested.emit({ dataSource, format, reason }),
          confirm: async (message, requiresReason) => {
            if (requiresReason) {
              // A governed export records why. M1 uses a prompt; production captures
              // this in a dialog and writes it to the audit trail server-side.
              const reason = window.prompt(`${message}\n\nReason (recorded in the audit trail):`);
              return reason === null ? null : reason || 'not supplied';
            }
            return window.confirm(message) ? '' : null;
          },
        },
        this.experienceNavigation(),
      );

      void this.orchestrator.runInitialBatch();
    });

    // Auto-refresh, when the definition asks for it.
    effect((onCleanup) => {
      const seconds = this.page().definition.performance?.autoRefreshSeconds;
      if (!seconds) return;
      const handle = setInterval(() => void this.orchestrator.refresh(), seconds * 1000);
      onCleanup(() => clearInterval(handle));
    });

    // Page breakpoint from the element's own width, not the viewport.
    const observer = new ResizeObserver((entries) => {
      const width = entries[0]?.contentRect.width ?? 0;
      if (width <= 0) return;
      const next = breakpointForWidth(width);
      const changed = this.context.breakpoint() !== next;
      this.context.setBreakpoint(next);
      if (changed) this.breakpointChange.emit(next);
    });
    observer.observe(this.host.nativeElement);
    this.destroyRef.onDestroy(() => observer.disconnect());
  }

  /** Platform capability check. Hides an affordance; it never protects data. */
  private permitted(required: readonly string[] | undefined): boolean {
    if (!required?.length) return true;
    const held = this.user().capabilities;
    return required.every((capability) => held.includes(capability));
  }

  protected dispatch(actionId: string): void {
    void this.dispatcher.dispatch(actionId);
  }

  /** Exposed so a shell can trigger a refresh, e.g. from a toolbar. */
  refresh(): void {
    this.gateway.invalidate();
    void this.orchestrator.refresh();
  }
}
