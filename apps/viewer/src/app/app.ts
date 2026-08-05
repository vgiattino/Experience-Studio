/**
 * Viewer shell.
 *
 * The shell owns what is *experience*-level: navigation, shared parameters exposed
 * in the chrome, the drill-down graph, and session identity. It owns nothing
 * page-level — that all lives in PageRendererComponent, which is why the same
 * renderer will serve Studio preview unchanged
 * (architecture/frontend-architecture.md §2.1).
 *
 * Nothing here knows what a dashboard looks like. It loads JSON.
 */

import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  inject,
  signal,
} from '@angular/core';
import { GatewayService, loadFixtureTables, type PhysicalResolver } from '@opus/data-client';
import { NavigationComponent, type NavigationSelection } from '@opus/components/navigation';
import { PageLoaderService, PageRendererComponent, type CompiledPage, type NavigationRequest } from '@opus/renderer';
import { StateShellComponent } from '@opus/design-system';
import { TelemetryService } from '@opus/platform';
import { text, type DataRow, type ExperienceDefinition, type NavItem } from '@opus/contracts';

import { CatalogService, type CatalogSnapshot } from '@opus/catalog';

import { DevPanelComponent } from './dev-panel.component';
import { GenerationStudioComponent } from './generation-studio.component';
import { PERSONAS, readSessionOptions, type SessionOptions } from './session';

const DEFINITIONS_BASE = 'definitions';
const DATA_BASE = 'data';
const CATALOG_URL = 'catalog/securities.catalog.json';
const EXPERIENCE_URL = `${DEFINITIONS_BASE}/securities-operations.experience.json`;

@Component({
  selector: 'opus-root',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    NavigationComponent,
    PageRendererComponent,
    StateShellComponent,
    DevPanelComponent,
    GenerationStudioComponent,
  ],
  template: `
    <div class="shell">
      <aside class="sidebar">
        <div class="brand">
          <span class="mark" aria-hidden="true">◈</span>
          <div>
            <p class="product">Opus Experience Studio</p>
            <p class="experience">{{ experienceName() }}</p>
          </div>
        </div>

        <button
          type="button"
          class="create"
          [class.active]="mode() === 'studio'"
          [attr.aria-pressed]="mode() === 'studio'"
          (click)="openStudio()"
        >
          <span aria-hidden="true">✦</span> Create with AI
        </button>

        @if (experience()?.navigation; as nav) {
          <opus-navigation
            [items]="navItems()"
            [activePage]="mode() === 'studio' ? null : activePageId()"
            [badgeData]="badgeData()"
            [ariaLabel]="experienceName() + ' navigation'"
            (navigate)="onNavigate($event)"
          />
        }

        <div class="sidebar-footer">
          <div class="control">
            <label for="persona">Persona</label>
            <select id="persona" (change)="onPersonaChange($event)">
              @for (p of personas; track p.id) {
                <!-- [selected] per option, not [value] on the select: the select's
                     value is applied before @for has rendered its options. -->
                <option [value]="p.id" [selected]="p.id === session().persona.id">
                  {{ p.label }}
                </option>
              }
            </select>
            <p class="hint">{{ session().persona.description }}</p>
          </div>

          <div class="control">
            <label for="simulate">Simulate</label>
            <select id="simulate" (change)="onSimulateChange($event)">
              @for (option of simulations; track option.value) {
                <option [value]="option.value" [selected]="option.value === session().simulate">
                  {{ option.label }}
                </option>
              }
            </select>
          </div>

          <button type="button" class="theme" (click)="toggleTheme()">
            {{ theme() === 'dark' ? '☀ Light' : '☾ Dark' }}
          </button>

          <opus-dev-panel />
        </div>
      </aside>

      <main class="content">
        @if (mode() === 'studio') {
          <opus-generation-studio [user]="generationUser()" [snapshot]="snapshot()" />
        } @else if (status() === 'loading') {
          <div class="centred">
            <opus-state-shell state="loading" label="experience" skeleton="block" />
          </div>
        } @else if (status() === 'error') {
          <div class="centred">
            <opus-state-shell
              state="error"
              [title]="errorTitle()"
              [message]="errorDetail()"
              (retry)="reload()"
            />
          </div>
        } @else if (page(); as compiled) {
          <opus-page-renderer
            [page]="compiled"
            [user]="session().persona.user"
            [initialParams]="initialParams()"
            [experienceNavigation]="experience()?.navigation"
            (navigationRequested)="onNavigationRequested($event)"
            (exportRequested)="onExport($event)"
          />
        }
      </main>
    </div>
  `,
  styles: `
    :host {
      display: block;
      min-block-size: 100vh;
      background: var(--opus-canvas);
      color: var(--opus-text);
      font-family: var(--opus-font-sans);
    }

    .shell {
      display: grid;
      grid-template-columns: var(--opus-shell-nav-width) minmax(0, 1fr);
      min-block-size: 100vh;
    }

    .sidebar {
      display: flex;
      flex-direction: column;
      gap: var(--opus-space-4);
      padding-block: var(--opus-space-4);
      background: var(--opus-surface);
      border-inline-end: 1px solid var(--opus-border);
      position: sticky;
      inset-block-start: 0;
      block-size: 100vh;
      overflow-y: auto;
    }

    .brand {
      display: flex;
      align-items: center;
      gap: var(--opus-space-2);
      padding-inline: var(--opus-space-4);
    }

    .mark {
      display: grid;
      place-items: center;
      inline-size: 1.75rem;
      block-size: 1.75rem;
      font-size: var(--opus-text-md);
      color: var(--opus-text-inverse);
      background: var(--opus-accent);
      border-radius: var(--opus-radius-sm);
      flex-shrink: 0;
    }

    .product {
      margin: 0;
      font-size: var(--opus-text-xs);
      color: var(--opus-text-muted);
    }

    .experience {
      margin: 0;
      font-size: var(--opus-text-sm);
      font-weight: var(--opus-weight-semibold);
      color: var(--opus-text);
    }

    opus-navigation {
      padding-inline: var(--opus-space-2);
    }

    .sidebar-footer {
      margin-block-start: auto;
      display: flex;
      flex-direction: column;
      gap: var(--opus-space-3);
    }

    .control {
      display: flex;
      flex-direction: column;
      gap: 2px;
      padding-inline: var(--opus-space-4);
    }

    label {
      font-size: var(--opus-text-xs);
      font-weight: var(--opus-weight-medium);
      color: var(--opus-text-muted);
    }

    select {
      font: inherit;
      font-size: var(--opus-text-sm);
      padding: var(--opus-space-1) var(--opus-space-2);
      color: var(--opus-text);
      background: var(--opus-surface);
      border: 1px solid var(--opus-border);
      border-radius: var(--opus-radius-sm);
    }

    select:focus-visible,
    .theme:focus-visible {
      outline: 2px solid var(--opus-focus-ring);
      outline-offset: 2px;
    }

    .hint {
      margin: 2px 0 0;
      font-size: var(--opus-text-xs);
      line-height: 1.4;
      color: var(--opus-text-muted);
    }

    .create {
      margin-inline: var(--opus-space-4);
      display: flex;
      align-items: center;
      gap: var(--opus-space-2);
      padding: var(--opus-space-2) var(--opus-space-3);
      font: inherit;
      font-size: var(--opus-text-sm);
      font-weight: var(--opus-weight-medium);
      text-align: start;
      color: var(--opus-text);
      background: var(--opus-canvas);
      border: 1px dashed var(--opus-border);
      border-radius: var(--opus-radius-sm);
      cursor: pointer;
    }

    .create.active {
      color: var(--opus-text-inverse);
      background: var(--opus-accent);
      border-style: solid;
      border-color: var(--opus-accent);
    }

    .create:focus-visible {
      outline: 2px solid var(--opus-focus-ring);
      outline-offset: 2px;
    }

    .theme {
      margin-inline: var(--opus-space-4);
      padding: var(--opus-space-1) var(--opus-space-2);
      font: inherit;
      font-size: var(--opus-text-xs);
      color: var(--opus-text-secondary);
      background: var(--opus-surface);
      border: 1px solid var(--opus-border);
      border-radius: var(--opus-radius-sm);
      cursor: pointer;
    }

    .content {
      min-inline-size: 0;
    }

    .centred {
      display: grid;
      place-items: center;
      min-block-size: 60vh;
      padding: var(--opus-space-6);
    }

    @media (max-width: 860px) {
      .shell {
        grid-template-columns: minmax(0, 1fr);
      }

      .sidebar {
        position: static;
        block-size: auto;
        border-inline-end: 0;
        border-block-end: 1px solid var(--opus-border);
      }
    }
  `,
})
export class App {
  private readonly loader = inject(PageLoaderService);
  private readonly gateway = inject(GatewayService);
  private readonly telemetry = inject(TelemetryService);
  private readonly catalog = inject(CatalogService);

  protected readonly personas = PERSONAS;

  protected readonly simulations = [
    { value: 'none', label: 'Normal' },
    { value: 'empty', label: 'Empty results' },
    { value: 'denied', label: 'Entitlement denied' },
    { value: 'error', label: 'Upstream error' },
    { value: 'slow', label: 'Slow gateway' },
  ] as const;

  protected readonly session = signal<SessionOptions>(readSessionOptions(window.location.search));
  protected readonly experience = signal<ExperienceDefinition | null>(null);
  protected readonly page = signal<CompiledPage | null>(null);
  protected readonly activePageId = signal<string | null>(null);
  protected readonly status = signal<'loading' | 'ready' | 'error'>('loading');
  protected readonly errorTitle = signal('Could not load the experience');
  protected readonly errorDetail = signal('');
  protected readonly initialParams = signal<Record<string, unknown>>({});
  protected readonly badgeData = signal<Record<string, readonly DataRow[]>>({});
  protected readonly mode = signal<'viewer' | 'studio'>('viewer');

  /**
   * The catalog AS THIS PERSONA MAY SEE IT. Recomputed when the persona changes, which is
   * the demonstrable point: switch to a persona without `edm.dq.read` and the generator
   * cannot bind to exceptions at all — not because a prompt told it not to, but because
   * the concepts are absent from the projection it reasons over.
   */
  protected readonly snapshot = signal<CatalogSnapshot | null>(null);

  /** The generation author's identity, with data capabilities resolved as the gateway sees them. */
  protected readonly generationUser = computed(() => {
    const persona = this.session().persona;
    return {
      ...persona.user,
      capabilities: [...persona.user.capabilities, ...persona.dataCapabilities],
    };
  });

  protected readonly theme = computed(() => {
    const configured = this.session().theme;
    if (configured !== 'system') return configured;
    return window.matchMedia?.('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
  });

  protected readonly experienceName = computed(() => text(this.experience()?.name) || 'Loading…');

  protected readonly navItems = computed<readonly NavItem[]>(
    () => this.experience()?.navigation?.items ?? [],
  );

  constructor() {
    effect(() => {
      const theme = this.session().theme;
      if (theme === 'system') document.documentElement.removeAttribute('data-theme');
      else document.documentElement.setAttribute('data-theme', theme);
    });

    void this.bootstrap();
  }

  private async bootstrap(): Promise<void> {
    this.status.set('loading');
    this.telemetry.reset();

    const session = this.session();

    try {
      // The catalog loads first: it holds the logical→physical mapping the gateway needs,
      // and the projection the generator reasons over. Both are derived from one artifact.
      await this.catalog.load(CATALOG_URL);
      this.snapshot.set(this.catalog.projectionFor(this.generationUser()));

      const tables = await loadFixtureTables(DATA_BASE, physicalResolver(this.catalog));
      // Data entitlements are simulated on the *data*, resolved against the caller.
      this.gateway.configure({
        tables,
        user: this.generationUser(),
        simulate: session.simulate,
        latencyMs: 160,
      });
    } catch (error) {
      this.fail('Could not load the catalog or fixture data', error);
      return;
    }

    const experience = await this.loader.loadExperience(EXPERIENCE_URL);
    if (!experience) {
      this.fail('Could not load the experience definition', `Fetch failed for ${EXPERIENCE_URL}`);
      return;
    }
    this.experience.set(experience);

    const params = new URLSearchParams(window.location.search);
    if (params.get('mode') === 'studio') this.mode.set('studio');
    const requested = params.get('page') ?? experience.navigation?.homePage;
    const pageId = requested ?? Object.keys(experience.pages)[0];
    if (!pageId) {
      this.fail('Experience declares no pages', experience.id);
      return;
    }

    await this.openPage(pageId, this.paramsFromUrl(params));
    await this.loadNavigationBadges(experience);
  }

  private paramsFromUrl(params: URLSearchParams): Record<string, unknown> {
    const out: Record<string, unknown> = {};
    for (const [key, value] of params.entries()) {
      if (['page', 'persona', 'simulate', 'validate', 'theme', 'mode'].includes(key)) continue;
      out[key] = value.includes(',') ? value.split(',') : value;
    }
    return out;
  }

  private async openPage(pageId: string, params: Record<string, unknown> = {}): Promise<void> {
    const experience = this.experience();
    if (!experience) return;

    this.status.set('loading');
    this.initialParams.set(params);

    const outcome = await this.loader.loadPage(experience, pageId, DEFINITIONS_BASE, {
      validate: this.session().validate,
    });

    if (!outcome.ok) {
      this.fail(`Could not load page "${pageId}" (${outcome.stage})`, outcome.detail);
      return;
    }

    this.page.set(outcome.page);
    this.activePageId.set(pageId);
    this.status.set('ready');
    this.syncUrl(pageId, params);
  }

  /**
   * Navigation badges come from experience-scoped data sources, so a live count in
   * the shell is declarative metadata rather than bespoke code.
   */
  private async loadNavigationBadges(experience: ExperienceDefinition): Promise<void> {
    const sources = experience.dataSources ?? {};
    const ids = Object.keys(sources);
    if (!ids.length) return;
    try {
      const response = await this.gateway.queryBatch(
        {
          context: { experienceId: experience.id, pageId: '$shell', definitionVersion: experience.version.artifactVersion },
          queries: ids.map((id) => ({ key: id, dataSourceId: id, params: {} })),
        },
        sources,
      );
      const out: Record<string, readonly DataRow[]> = {};
      for (const result of response.results) out[result.key] = result.rows;
      this.badgeData.set(out);
    } catch {
      // A missing badge must never block the shell.
    }
  }

  private syncUrl(pageId: string, params: Record<string, unknown>): void {
    const url = new URL(window.location.href);
    url.searchParams.set('page', pageId);
    for (const [key, value] of Object.entries(params)) {
      if (value === null || value === undefined || value === '') url.searchParams.delete(key);
      else url.searchParams.set(key, Array.isArray(value) ? value.join(',') : String(value));
    }
    window.history.replaceState({}, '', url);
  }

  private fail(title: string, detail: unknown): void {
    this.errorTitle.set(title);
    this.errorDetail.set(detail instanceof Error ? detail.message : String(detail));
    this.status.set('error');
  }

  protected openStudio(): void {
    this.mode.set('studio');
    this.updateQueryParam('mode', 'studio');
  }

  protected onNavigate(selection: NavigationSelection): void {
    this.mode.set('viewer');
    this.updateQueryParam('mode', null);
    if (selection.page) void this.openPage(selection.page, selection.params ?? {});
  }

  protected onNavigationRequested(request: NavigationRequest): void {
    if (!request.pageId) {
      this.telemetry.recordProblem({
        scope: 'shell',
        code: 'unresolvedNavigation',
        detail: 'A navigation action resolved to no page — check the experience drilldownTargets',
      });
      return;
    }
    const experience = this.experience();
    if (experience && !experience.pages[request.pageId]) {
      // The target is declared in drilldownTargets but is not part of this M1 excerpt.
      this.telemetry.recordProblem({
        scope: 'shell',
        code: 'pageNotInExperience',
        detail: `Navigation to "${request.pageId}" — that page is not included in the M1 experience excerpt`,
      });
      return;
    }
    void this.openPage(request.pageId, request.params);
  }

  /**
   * Export. In production this is a server-side, audited data egress event that
   * carries the exporter's entitlements. M1 writes a CSV client-side from what the
   * gateway already returned, which is the same entitlement scope.
   */
  protected onExport(request: { dataSource: string; format: string; reason?: string }): void {
    this.telemetry.recordProblem({
      scope: 'export',
      code: 'clientSideExport',
      detail: `${request.format} export of "${request.dataSource}"${
        request.reason ? ` (reason: ${request.reason})` : ''
      }. Production exports server-side and audits the egress.`,
    });
  }

  protected onPersonaChange(event: Event): void {
    const id = (event.target as HTMLSelectElement).value;
    this.session.update((s) => ({ ...s, persona: PERSONAS.find((p) => p.id === id) ?? s.persona }));
    this.updateQueryParam('persona', id);
    void this.bootstrap();
  }

  protected onSimulateChange(event: Event): void {
    const value = (event.target as HTMLSelectElement).value as SessionOptions['simulate'];
    this.session.update((s) => ({ ...s, simulate: value }));
    this.updateQueryParam('simulate', value === 'none' ? null : value);
    void this.bootstrap();
  }

  protected toggleTheme(): void {
    const next = this.theme() === 'dark' ? 'light' : 'dark';
    this.session.update((s) => ({ ...s, theme: next }));
    this.updateQueryParam('theme', next);
  }

  protected reload(): void {
    void this.bootstrap();
  }

  private updateQueryParam(key: string, value: string | null): void {
    const url = new URL(window.location.href);
    if (value === null) url.searchParams.delete(key);
    else url.searchParams.set(key, value);
    window.history.replaceState({}, '', url);
  }
}

/**
 * The gateway's view of the catalog's server-only `physical` blocks.
 *
 * Assembled here because this is the "server" half of the demo: the client projection never
 * carries these, and the gateway is the only place the two vocabularies may meet.
 */
function physicalResolver(catalog: CatalogService): PhysicalResolver {
  return (entity) => {
    const map = catalog.physicalMapFor(entity);
    if (!map) return undefined;
    return {
      fields: map.attributes,
      measureFields: map.measures,
      primaryKey: catalog.primaryKeyFor(entity),
    };
  };
}
