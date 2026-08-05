/**
 * The Experience host: give it a definition and a page id, get a rendered page.
 *
 * It owns the experience-level behaviour a single page cannot: resolving which page to show, seeding
 * parameters, and acting on what the page asks for next — navigate, drill down, open a URL, export.
 * Those requests arrive as declared *actions*, never as component code, which is what makes them
 * expressible in JSON and therefore generatable.
 *
 * **This is the only rendering path in the application.** The Create screen's preview and the saved
 * runtime both mount this component; they differ in where the definition came from. A second preview
 * renderer is the standard origin of "it worked in preview" defects.
 */

import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  inject,
  input,
  output,
  signal,
} from '@angular/core';
import { PageRendererComponent, type NavigationRequest } from '@opus/renderer';
import type { ExperienceDefinition, Identifier, UserContext } from '@opus/experience-model';

import { ExperienceRuntimeService } from './experience-runtime.service';

@Component({
  selector: 'opus-experience-host',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [PageRendererComponent],
  template: `
    @let state = runtime.state();

    @if (state.status === 'ready' && state.page) {
      <opus-page-renderer
        [page]="state.page"
        [user]="user()"
        [initialParams]="params()"
        [experienceNavigation]="navigation()"
        (navigationRequested)="onNavigation($event)"
        (exportRequested)="exportRequested.emit($event)"
      />
    } @else if (state.status === 'loading' || state.status === 'idle') {
      <!-- A skeleton rather than a spinner: the page's own widgets have manifest-supplied skeletons,
           so this only covers the compile step, which is sub-millisecond for a real definition. -->
      <div class="loading" role="status" aria-live="polite">
        <div class="bar"></div>
        <div class="bar short"></div>
      </div>
    } @else {
      <!-- A failure states what went wrong and at which stage. A compile failure is an authoring
           problem and a fetch failure is an infrastructure one; showing the same message for both
           sends the reader looking in the wrong place. -->
      <div class="failed" role="alert">
        <p class="what">This page could not be rendered.</p>
        <p class="why">{{ state.message }}</p>
        @if (state.stage) {
          <p class="stage">Failed at: {{ state.stage }}</p>
        }
      </div>
    }
  `,
  styles: `
    :host {
      display: block;
      min-block-size: 12rem;
    }

    .loading {
      display: flex;
      flex-direction: column;
      gap: 12px;
      padding: 24px;
    }

    .bar {
      block-size: 96px;
      border-radius: 12px;
      background: color-mix(in srgb, currentColor 8%, transparent);
      animation: pulse 1.4s ease-in-out infinite;
    }

    .bar.short {
      block-size: 48px;
      inline-size: 60%;
    }

    @keyframes pulse {
      0%, 100% { opacity: 0.45; }
      50% { opacity: 0.85; }
    }

    @media (prefers-reduced-motion: reduce) {
      .bar { animation: none; }
    }

    .failed {
      margin: 24px;
      padding: 20px 24px;
      border-radius: 12px;
      border: 1px solid color-mix(in srgb, currentColor 16%, transparent);
      background: color-mix(in srgb, currentColor 4%, transparent);
    }

    .what {
      margin: 0 0 6px;
      font-weight: 600;
    }

    .why,
    .stage {
      margin: 0;
      font-size: 0.875rem;
      opacity: 0.8;
    }

    .stage {
      margin-top: 8px;
      font-family: ui-monospace, SFMono-Regular, monospace;
    }
  `,
})
export class ExperienceHostComponent {
  protected readonly runtime = inject(ExperienceRuntimeService);

  readonly experience = input.required<ExperienceDefinition>();
  readonly pageId = input.required<Identifier>();
  readonly user = input.required<UserContext>();
  readonly initialParams = input<Record<string, unknown>>({});
  readonly validate = input(true);

  /** A page asked to go somewhere. The shell decides whether that is a route change. */
  readonly navigate = output<NavigationRequest>();
  readonly exportRequested = output<{ dataSource: string; format: string; reason?: string }>();

  private readonly extraParams = signal<Record<string, unknown>>({});

  protected readonly navigation = computed(() => this.experience().navigation);

  /**
   * Parameters merged from the caller and from the last in-experience navigation.
   *
   * A drill-down carries key parameters — a security id, an as-of date — and they have to survive the
   * hop or the detail page renders empty. Merging here rather than making the shell round-trip
   * through a route is what lets a drawer or a preview navigate without a URL at all.
   */
  protected readonly params = computed(() => ({ ...this.initialParams(), ...this.extraParams() }));

  constructor() {
    effect(() => {
      const experience = this.experience();
      const pageId = this.pageId();
      const validate = this.validate();
      // Compile whenever either input changes. Deliberately not memoized on (id, version): a draft
      // mutates while keeping both, so caching on that pair freezes the preview at the first
      // generated version — a defect this repository has already shipped once.
      void this.runtime.open(experience, pageId, { validate });
    });
  }

  protected onNavigation(request: NavigationRequest): void {
    // In-experience navigation is handled here so a drill-down works in a preview that has no route.
    if (!request.experienceId || request.experienceId === this.experience().id) {
      this.extraParams.update((current) => ({ ...current, ...request.params }));
    }
    this.navigate.emit(request);
  }
}
