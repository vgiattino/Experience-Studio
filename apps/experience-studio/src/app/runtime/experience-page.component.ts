/**
 * The runtime: one route for every experience.
 *
 * `/x/:experienceId/:pageId` renders whatever the store holds. There is no component per dashboard
 * and no route per experience, which is the claim a metadata-driven runtime has to be able to make.
 * Adding a fifth experience adds a JSON file.
 *
 * The page also carries the experience's own navigation, so a multi-page experience gets its page
 * switcher from metadata rather than from a hand-written menu — and a drill-down declared in a
 * definition changes the route, which is what makes every filtered view a shareable link.
 */

import { ChangeDetectionStrategy, Component, computed, effect, inject, input, signal } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatProgressBarModule } from '@angular/material/progress-bar';
import { MatSnackBar } from '@angular/material/snack-bar';
import { MatTabsModule } from '@angular/material/tabs';
import { MatTooltipModule } from '@angular/material/tooltip';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { toSignal } from '@angular/core/rxjs-interop';

import {
  describeExperience,
  pageIdsOf,
  text,
  type ExperienceDefinition,
} from '@opus/experience-model';
import { ExperienceHostComponent, type NavigationRequest } from '@opus/page-renderer';
import { ExperienceRepository } from '@opus/metadata-service';

import { BootService } from '../boot.service';

@Component({
  selector: 'opus-experience-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    RouterLink,
    MatIconModule,
    MatButtonModule,
    MatTabsModule,
    MatTooltipModule,
    MatProgressBarModule,
    ExperienceHostComponent,
  ],
  template: `
    @let definition = experience();

    <div class="bar">
      <a mat-button routerLink="/experiences" class="back">
        <mat-icon>arrow_back</mat-icon>
        Experiences
      </a>

      @if (definition) {
        <span class="crumb">{{ text(definition.name, definition.id) }}</span>

        @if (pages().length > 1) {
          <nav class="pages" aria-label="Pages in this experience">
            @for (page of pages(); track page.id) {
              <button
                class="page-tab"
                [class.active]="page.id === activePageId()"
                [attr.aria-current]="page.id === activePageId() ? 'page' : null"
                (click)="goToPage(page.id)"
              >
                {{ page.name }}
              </button>
            }
          </nav>
        }

        <span class="grow"></span>

        <span class="badge" [matTooltip]="provenanceTip()">
          <mat-icon inline>{{ definition.version.provenance?.origin === 'ai' ? 'auto_awesome' : 'edit_note' }}</mat-icon>
          v{{ definition.version.artifactVersion }}
        </span>
      }
    </div>

    @if (loading()) {
      <mat-progress-bar mode="indeterminate" />
    }

    @if (problem(); as message) {
      <div class="problem" role="alert">
        <mat-icon>error_outline</mat-icon>
        <div>
          <h2>This experience could not be opened</h2>
          <p>{{ message }}</p>
          <a mat-stroked-button routerLink="/experiences">Back to experiences</a>
        </div>
      </div>
    } @else if (definition && user()) {
      <div class="surface">
        <opus-experience-host
          [experience]="definition"
          [pageId]="activePageId()"
          [user]="user()!"
          [initialParams]="params()"
          (navigate)="onNavigate($event)"
        />
      </div>
    }
  `,
  styles: `
    :host {
      display: block;
      min-block-size: 100%;
      background: var(--opus-canvas);
      color: var(--opus-text);
      font-family: var(--opus-font-sans);
    }

    .bar {
      display: flex;
      align-items: center;
      gap: 12px;
      padding: 6px 16px;
      background: var(--mat-sys-surface-container-low);
      border-block-end: 1px solid var(--mat-sys-outline-variant);
      position: sticky;
      inset-block-start: 0;
      z-index: 3;
      flex-wrap: wrap;
    }

    .crumb {
      font-size: 0.85rem;
      font-weight: 600;
    }

    .pages {
      display: flex;
      gap: 4px;
      flex-wrap: wrap;
    }

    .page-tab {
      font: inherit;
      font-size: 0.78rem;
      padding: 5px 12px;
      border-radius: 999px;
      border: 1px solid var(--mat-sys-outline-variant);
      background: transparent;
      color: inherit;
      cursor: pointer;
    }

    .page-tab.active {
      background: var(--mat-sys-secondary-container);
      color: var(--mat-sys-on-secondary-container);
      border-color: transparent;
    }

    .grow {
      flex: 1;
    }

    .badge {
      display: inline-flex;
      align-items: center;
      gap: 5px;
      font-size: 0.72rem;
      font-family: var(--opus-font-mono);
      padding: 3px 9px;
      border-radius: 999px;
      border: 1px solid var(--mat-sys-outline-variant);
      opacity: 0.85;
    }

    /* The rendered experience gets a container-query context of its own, so a definition's
       breakpoint overrides resolve against the space the page actually has. */
    .surface {
      container-type: inline-size;
    }

    .problem {
      display: flex;
      gap: 18px;
      margin: 40px auto;
      max-inline-size: 38rem;
      padding: 24px 28px;
      border-radius: 16px;
      border: 1px solid var(--mat-sys-outline-variant);
      background: var(--mat-sys-surface-container);
    }

    .problem mat-icon {
      color: var(--mat-sys-error);
      font-size: 30px;
      inline-size: 30px;
      block-size: 30px;
    }

    .problem h2 {
      margin: 0 0 6px;
      font-size: 1.1rem;
    }

    .problem p {
      margin: 0 0 16px;
      font-size: 0.85rem;
      line-height: 1.55;
      opacity: 0.82;
    }
  `,
})
export class ExperiencePageComponent {
  private readonly repository = inject(ExperienceRepository);
  private readonly router = inject(Router);
  private readonly snack = inject(MatSnackBar);
  private readonly boot = inject(BootService);

  /** Bound from the route by `withComponentInputBinding`. */
  readonly experienceId = input.required<string>();
  readonly pageId = input<string | undefined>(undefined);

  protected readonly experience = signal<ExperienceDefinition | null>(null);
  protected readonly loading = signal(false);
  protected readonly problem = signal<string | null>(null);

  /**
   * Page parameters come from the URL, and only from the URL.
   *
   * A component-held signal was the obvious first attempt and it is wrong twice. `/x/:id` and
   * `/x/:id/:pageId` are different routes, so a drill-down destroys this component and recreates it —
   * taking the signal's contents with it, which is why the detail page rendered with no record. And a
   * link that carries its state in a component is not a link: the whole value of deep-linking is that
   * the URL *is* the state, so an analyst can send a colleague the exact view under discussion.
   */
  private readonly queryParams = toSignal(inject(ActivatedRoute).queryParams, { initialValue: {} });

  protected readonly params = computed<Record<string, unknown>>(() => ({ ...this.queryParams() }));

  protected readonly user = this.boot.user;
  protected readonly text = text;

  protected readonly pages = computed(() => {
    const definition = this.experience();
    if (!definition) return [];
    const outline = describeExperience(definition);
    return outline.pages.map((page) => ({ id: page.id, name: page.name }));
  });

  /**
   * Which page to show: the route's, else the experience's declared home, else the first.
   *
   * Falling back to the declared home rather than "page zero" matters — an experience's author chose
   * a landing page, and an object key order is not a choice.
   */
  protected readonly activePageId = computed(() => {
    const definition = this.experience();
    if (!definition) return '';
    const requested = this.pageId();
    const ids = pageIdsOf(definition);
    if (requested && ids.includes(requested)) return requested;
    return definition.navigation?.homePage ?? ids[0] ?? '';
  });

  protected readonly provenanceTip = computed(() => {
    const provenance = this.experience()?.version.provenance;
    if (!provenance) return 'No provenance recorded';
    const generation = provenance.generation;
    if (!generation) return `Authored by ${provenance.actorId} (${provenance.origin})`;
    return `Generated by ${generation.modelId}@${generation.modelVersion} from: “${generation.prompt}”`;
  });

  constructor() {
    effect(() => {
      const id = this.experienceId();
      void this.load(id);
    });
  }

  private async load(id: string): Promise<void> {
    this.loading.set(true);
    this.problem.set(null);
    try {
      const record = await this.repository.get(id);
      this.experience.set(record.definition);
    } catch (error) {
      this.experience.set(null);
      this.problem.set(error instanceof Error ? error.message : String(error));
    } finally {
      this.loading.set(false);
    }
  }

  protected goToPage(pageId: string): void {
    void this.router.navigate(['/x', this.experienceId(), pageId], { queryParamsHandling: 'preserve' });
  }

  /**
   * Act on a declared navigation request.
   *
   * A drill-down inside this experience becomes a route change carrying its key parameters, so the
   * resulting view is a link someone can send. A request to another experience routes there. Anything
   * unresolvable is reported rather than approximated — navigating to a "closest match" is how a user
   * ends up looking at the wrong record and believing it is the right one.
   */
  protected onNavigate(request: NavigationRequest): void {
    const targetExperience = request.experienceId ?? this.experienceId();
    const definition = this.experience();

    if (targetExperience === this.experienceId() && definition && !pageIdsOf(definition).includes(request.pageId)) {
      this.snack.open(
        `This experience has no page "${request.pageId}". The drill-down target is declared but not present.`,
        'Dismiss',
        { duration: 6000 },
      );
      return;
    }

    void this.router.navigate(['/x', targetExperience, request.pageId], {
      queryParams: serializableParams(request.params),
      queryParamsHandling: 'merge',
    });
  }
}

/**
 * Only scalar parameters go in the URL.
 *
 * A parameter whose value is an object cannot round-trip through a query string, and putting a
 * stringified one there produces links that break silently when reopened. Dropping it is worse in one
 * way and better in three: the link still works, the page still renders, and nothing pretends the
 * state was captured.
 */
function serializableParams(params: Record<string, unknown>): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [key, value] of Object.entries(params)) {
    if (value === null || value === undefined) continue;
    if (typeof value === 'object') continue;
    out[key] = String(value);
  }
  return out;
}
