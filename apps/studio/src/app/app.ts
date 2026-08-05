/**
 * Studio shell.
 *
 * A SECOND APPLICATION, SHARING ONE RENDERER (frontend-architecture.md §2.1, decision F1). The
 * alternative — a lazy `/studio` route in the Viewer — is simpler to deploy and was rejected: it
 * makes every business user pay for authoring code in shared chunks, gives the authoring surface
 * the same origin and CSP as the latency-critical runtime, and couples the release cadence of a
 * high-churn tool to a page load that has a budget.
 *
 * The shell owns the workspace: which page is open, the panels around the canvas, save, and the
 * keyboard shortcuts. It owns no editing logic — every mutation goes through `EditorService` to
 * the `DefinitionStore` as a patch.
 */

import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  HostListener,
  inject,
  signal,
} from '@angular/core';
import { CatalogService } from '@opus/catalog';
import { GatewayService, loadFixtureTables, type PhysicalResolver } from '@opus/data-client';
import { PageLoaderService } from '@opus/renderer';
import { text, type ExperienceDefinition, type UserContext } from '@opus/contracts';
import { TelemetryService } from '@opus/platform';
import {
  DefinitionStore,
  DraftStore,
  PREVIEW_SIZES,
  SelectionService,
  walkLayout,
  type PageListing,
  type PreviewSize,
} from '@opus/studio-core';
import {
  CanvasComponent,
  DragStateService,
  EditorService,
  HistoryPanelComponent,
  InspectorComponent,
  JsonViewComponent,
  OutlineComponent,
  PaletteComponent,
} from '@opus/studio-ui';
import type { ValidationReport } from '@opus/validator';

import { AUTHOR } from './session';

const DEFINITIONS_BASE = 'definitions';
const DATA_BASE = 'data';
const CATALOG_URL = 'catalog/securities.catalog.json';
const EXPERIENCE_URL = `${DEFINITIONS_BASE}/securities-operations.experience.json`;

type LeftTab = 'palette' | 'outline';
type RightTab = 'inspector' | 'history' | 'json';

@Component({
  selector: 'opus-studio-root',
  changeDetection: ChangeDetectionStrategy.OnPush,
  // Provided here rather than at the root: an editing session belongs to an open document, and
  // state tier 2 is per-experience by design (§4.2). A second window opens a second session.
  providers: [DefinitionStore, SelectionService, DragStateService, EditorService],
  imports: [
    CanvasComponent,
    HistoryPanelComponent,
    InspectorComponent,
    JsonViewComponent,
    OutlineComponent,
    PaletteComponent,
  ],
  template: `
    <div class="studio">
      <header class="topbar">
        <div class="brand">
          <span class="mark" aria-hidden="true">◈</span>
          <div>
            <p class="product">Opus Experience Studio</p>
            <p class="context">{{ experienceName() }}</p>
          </div>
        </div>

        <label class="page-picker">
          <span class="sr-only">Page</span>
          <select [disabled]="!listings().length" (change)="onPageChange($any($event.target).value)">
            @if (!listings().length) {
              <option value="">Loading pages…</option>
            }
            @for (listing of listings(); track listing.id) {
              <option [value]="listing.id" [selected]="listing.id === openPageId()">
                {{ listing.name }}{{ listing.hasDraft ? ' •' : '' }}
              </option>
            }
          </select>
        </label>

        @if (dirty()) {
          <span class="dirty" title="Unsaved changes">Unsaved</span>
        } @else if (store.savedAt()) {
          <span class="saved">Saved</span>
        }

        <div class="spacer"></div>

        <div class="viewport" role="group" aria-label="Preview width">
          @for (size of previewSizes; track size.id) {
            <button
              type="button"
              [attr.data-preview]="size.id"
              [class.active]="preview().id === size.id"
              [attr.aria-pressed]="preview().id === size.id"
              [title]="size.hint"
              (click)="selection.setPreview(size)"
            >
              {{ size.label }}
            </button>
          }
        </div>

        <button
          type="button"
          class="mode"
          [class.active]="mode() === 'preview'"
          [attr.aria-pressed]="mode() === 'preview'"
          (click)="toggleMode()"
        >
          {{ mode() === 'preview' ? '✓ Preview' : 'Preview' }}
        </button>

        <button type="button" (click)="store.undo()" [disabled]="!store.canUndo()" title="Undo (⌘Z)">↶</button>
        <button type="button" (click)="store.redo()" [disabled]="!store.canRedo()" title="Redo (⇧⌘Z)">↷</button>
        <button type="button" class="primary" [disabled]="!dirty()" (click)="save()">Save draft</button>
        <button type="button" (click)="revertToPublished()" [disabled]="!hasDraft()">Discard draft</button>
      </header>

      @if (message(); as note) {
        <p class="banner" [attr.data-kind]="note.kind" role="status">{{ note.text }}</p>
      }

      <div class="body">
        <aside class="left">
          <nav class="tabs">
            <button type="button" [class.active]="leftTab() === 'palette'" (click)="leftTab.set('palette')">
              Add
            </button>
            <button type="button" [class.active]="leftTab() === 'outline'" (click)="leftTab.set('outline')">
              Structure
            </button>
          </nav>
          @if (leftTab() === 'palette') {
            <opus-palette />
          } @else {
            <opus-outline />
          }
        </aside>

        <main class="middle">
          @if (store.definition()) {
            <opus-canvas [user]="author" />
          } @else {
            <div class="centred">
              <p>Select a page to start editing.</p>
            </div>
          }
        </main>

        <aside class="right">
          <nav class="tabs">
            <button type="button" [class.active]="rightTab() === 'inspector'" (click)="rightTab.set('inspector')">
              Properties
            </button>
            <button type="button" [class.active]="rightTab() === 'history'" (click)="rightTab.set('history')">
              History
              @if (store.history().length) {
                <span class="badge">{{ store.history().length }}</span>
              }
            </button>
            <button type="button" [class.active]="rightTab() === 'json'" (click)="rightTab.set('json')">
              JSON
            </button>
          </nav>
          @switch (rightTab()) {
            @case ('inspector') {
              <opus-inspector />
            }
            @case ('history') {
              <opus-history-panel />
            }
            @case ('json') {
              <opus-json-view />
            }
          }
        </aside>
      </div>

      <footer class="statusbar">
        @if (validation(); as report) {
          <button
            type="button"
            class="validity"
            [attr.data-valid]="report.valid"
            [attr.aria-expanded]="showFindings()"
            [disabled]="!report.findings.length"
            (click)="showFindings.set(!showFindings())"
          >
            {{ report.valid ? '✓ Valid' : '✗ Invalid' }} · {{ report.findings.length }} finding(s)
            @if (report.findings.length) {
              {{ showFindings() ? '▾' : '▸' }}
            }
          </button>
          <span class="levels">
            ran {{ report.levelsRun.join(', ') }}
            @if (report.levelsNotRun.length) {
              · not run {{ report.levelsNotRun.join(', ') }}
            }
          </span>
        } @else {
          <span class="levels">Not yet validated</span>
        }
        <span class="spacer"></span>
        <span class="counts">
          {{ widgetCount() }} widget(s) · {{ sourceCount() }} data source(s)
        </span>
      </footer>

      <!--
        An "Invalid" status with no explanation is useless to an author, and worse than none: it
        says something is wrong and gives them no way to find it. Each finding names its level, its
        path and its reason, and clicking one selects the widget it implicates.
      -->
      @if (showFindings() && findings().length) {
        <ul class="findings">
          @for (finding of findings(); track $index) {
            <li [attr.data-severity]="finding.severity">
              <button type="button" (click)="revealFinding(finding.path)">
                <span class="level">{{ finding.level }}</span>
                <span class="code">{{ finding.code }}</span>
                <span class="msg">{{ finding.message }}</span>
                <span class="path">{{ finding.path }}</span>
              </button>
            </li>
          }
        </ul>
      }
    </div>
  `,
  styles: `
    :host {
      display: block;
      block-size: 100vh;
      overflow: hidden;
      background: var(--opus-canvas);
      color: var(--opus-text);
      font-family: var(--opus-font-sans);
    }

    .studio {
      display: grid;
      grid-template-rows: auto auto minmax(0, 1fr) auto auto;
      block-size: 100vh;
    }

    .topbar {
      display: flex;
      align-items: center;
      gap: var(--opus-space-2);
      padding: var(--opus-space-2) var(--opus-space-3);
      background: var(--opus-surface);
      border-block-end: 1px solid var(--opus-border);
    }

    .brand {
      display: flex;
      align-items: center;
      gap: var(--opus-space-2);
    }

    .mark {
      display: grid;
      place-items: center;
      inline-size: 1.6rem;
      block-size: 1.6rem;
      color: var(--opus-text-inverse);
      background: var(--opus-emphasis-info);
      border-radius: var(--opus-radius-sm);
    }

    .product {
      margin: 0;
      font-size: var(--opus-text-xs);
      color: var(--opus-text-muted);
    }

    .context {
      margin: 0;
      font-size: var(--opus-text-sm);
      font-weight: var(--opus-weight-semibold);
    }

    .spacer {
      flex: 1;
    }

    select,
    button {
      font: inherit;
      font-size: var(--opus-text-xs);
      padding: 4px var(--opus-space-2);
      color: var(--opus-text);
      background: var(--opus-surface);
      border: 1px solid var(--opus-border);
      border-radius: var(--opus-radius-sm);
      cursor: pointer;
    }

    select {
      font-size: var(--opus-text-sm);
      max-inline-size: 18rem;
    }

    button:disabled {
      opacity: 0.45;
      cursor: not-allowed;
    }

    button.primary:not(:disabled) {
      color: var(--opus-text-inverse);
      background: var(--opus-emphasis-info);
      border-color: var(--opus-emphasis-info);
    }

    button.active,
    .mode.active {
      color: var(--opus-text-inverse);
      background: var(--opus-emphasis-info);
      border-color: var(--opus-emphasis-info);
    }

    select:focus-visible,
    button:focus-visible {
      outline: 2px solid var(--opus-focus-ring);
      outline-offset: 1px;
    }

    .viewport {
      display: flex;
      gap: 1px;
    }

    .viewport button {
      border-radius: 0;
    }

    .viewport button:first-child {
      border-start-start-radius: var(--opus-radius-sm);
      border-end-start-radius: var(--opus-radius-sm);
    }

    .viewport button:last-child {
      border-start-end-radius: var(--opus-radius-sm);
      border-end-end-radius: var(--opus-radius-sm);
    }

    .dirty,
    .saved {
      font-size: var(--opus-text-xs);
      padding: 2px var(--opus-space-2);
      border-radius: 999px;
    }

    .dirty {
      color: var(--opus-text-inverse);
      background: var(--opus-emphasis-warning);
    }

    .saved {
      color: var(--opus-text-muted);
      border: 1px solid var(--opus-border);
    }

    .banner {
      margin: 0;
      padding: var(--opus-space-2) var(--opus-space-3);
      font-size: var(--opus-text-xs);
      border-block-end: 1px solid var(--opus-border);
    }

    .banner[data-kind='error'] {
      background: color-mix(in srgb, var(--opus-emphasis-negative) 12%, transparent);
    }

    .banner[data-kind='info'] {
      background: color-mix(in srgb, var(--opus-emphasis-info) 10%, transparent);
    }

    .body {
      display: grid;
      grid-template-columns: 17rem minmax(0, 1fr) 21rem;
      min-block-size: 0;
    }

    .left,
    .right {
      display: grid;
      grid-template-rows: auto minmax(0, 1fr);
      min-block-size: 0;
      background: var(--opus-surface);
    }

    .left {
      border-inline-end: 1px solid var(--opus-border);
    }

    .right {
      border-inline-start: 1px solid var(--opus-border);
    }

    .tabs {
      display: flex;
      border-block-end: 1px solid var(--opus-border);
    }

    .tabs button {
      flex: 1;
      border: 0;
      border-radius: 0;
      border-block-end: 2px solid transparent;
      background: none;
      color: var(--opus-text-muted);
      padding-block: var(--opus-space-2);
    }

    .tabs button.active {
      color: var(--opus-text);
      background: none;
      border-block-end-color: var(--opus-emphasis-info);
    }

    .badge {
      margin-inline-start: 4px;
      padding: 0 5px;
      font-size: 0.6rem;
      color: var(--opus-text-inverse);
      background: var(--opus-text-muted);
      border-radius: 999px;
    }

    .middle {
      min-inline-size: 0;
      min-block-size: 0;
      overflow: auto;
    }

    .centred {
      display: grid;
      place-items: center;
      min-block-size: 60vh;
      color: var(--opus-text-muted);
    }

    .statusbar {
      display: flex;
      align-items: center;
      gap: var(--opus-space-2);
      padding: 4px var(--opus-space-3);
      font-family: var(--opus-font-mono);
      font-size: var(--opus-text-xs);
      color: var(--opus-text-muted);
      background: var(--opus-surface);
      border-block-start: 1px solid var(--opus-border);
    }

    .validity {
      font-family: inherit;
      font-size: var(--opus-text-xs);
      padding: 1px var(--opus-space-1);
      border: 0;
      background: none;
    }

    .validity[data-valid='false'] {
      color: var(--opus-emphasis-negative);
    }

    .validity[data-valid='true'] {
      color: var(--opus-emphasis-positive);
    }

    .findings {
      list-style: none;
      margin: 0;
      padding: 0;
      max-block-size: 9rem;
      overflow-y: auto;
      background: var(--opus-surface);
      border-block-start: 1px solid var(--opus-border);
    }

    .findings li[data-severity='error'] {
      border-inline-start: 3px solid var(--opus-emphasis-negative);
    }

    .findings li[data-severity='warning'] {
      border-inline-start: 3px solid var(--opus-emphasis-warning);
    }

    .findings button {
      display: grid;
      grid-template-columns: 5rem 11rem minmax(0, 1fr) auto;
      gap: var(--opus-space-2);
      inline-size: 100%;
      text-align: start;
      border: 0;
      border-radius: 0;
      background: none;
      font-size: var(--opus-text-xs);
      padding: 3px var(--opus-space-2);
    }

    .findings .level,
    .findings .code,
    .findings .path {
      font-family: var(--opus-font-mono);
      font-size: 0.65rem;
      color: var(--opus-text-muted);
    }

    .findings .msg {
      color: var(--opus-text);
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }

    .sr-only {
      position: absolute;
      inline-size: 1px;
      block-size: 1px;
      overflow: hidden;
      clip-path: inset(50%);
    }

    @media (max-width: 1100px) {
      .body {
        grid-template-columns: 12rem minmax(0, 1fr) 16rem;
      }
    }
  `,
})
export class StudioApp {
  private readonly loader = inject(PageLoaderService);
  private readonly gateway = inject(GatewayService);
  private readonly catalog = inject(CatalogService);
  private readonly telemetry = inject(TelemetryService);
  private readonly drafts = inject(DraftStore);
  private readonly editor = inject(EditorService);

  protected readonly store = inject(DefinitionStore);
  protected readonly selection = inject(SelectionService);

  protected readonly author: UserContext = AUTHOR;
  protected readonly previewSizes = PREVIEW_SIZES;

  protected readonly experience = signal<ExperienceDefinition | null>(null);
  protected readonly listings = this.drafts.listings;
  protected readonly openPageId = signal<string | null>(null);
  protected readonly leftTab = signal<LeftTab>('palette');
  protected readonly rightTab = signal<RightTab>('inspector');
  protected readonly message = signal<{ kind: 'info' | 'error'; text: string } | null>(null);
  protected readonly validation = signal<ValidationReport | null>(null);
  protected readonly showFindings = signal(false);

  /** Findings as a plain list, so the template never has to narrow an optional report. */
  protected readonly findings = computed(() => this.validation()?.findings ?? []);

  protected readonly dirty = this.store.dirty;
  protected readonly preview = this.selection.preview;
  protected readonly mode = this.selection.mode;

  protected readonly experienceName = computed(
    () => text(this.experience()?.name) || 'Loading…',
  );

  protected readonly hasDraft = computed(() => {
    const id = this.openPageId();
    return Boolean(id && this.listings().find((listing) => listing.id === id)?.hasDraft);
  });

  protected readonly widgetCount = computed(
    () => Object.keys(this.store.definition()?.components ?? {}).length,
  );
  protected readonly sourceCount = computed(
    () => Object.keys(this.store.definition()?.dataSources ?? {}).length,
  );

  constructor() {
    void this.bootstrap();

    /**
     * Validate continuously, with the catalog, so level 3 runs.
     *
     * The Studio is the one place a definition is *invalid on purpose* — mid-edit, between two
     * property changes — so validation has to be an ambient status rather than a gate. The status
     * bar names the levels that ran, because a validator whose absent levels are invisible reads
     * as a validator that passed.
     */
    effect(() => {
      const definition = this.store.definition();
      if (!definition) {
        this.validation.set(null);
        return;
      }
      void this.validate(definition);
    });
  }

  private async validate(definition: unknown): Promise<void> {
    try {
      const [{ validatePage }, manifests] = await Promise.all([
        import('@opus/validator'),
        this.editor.manifests().length
          ? Promise.resolve(this.editor.manifests())
          : import('@opus/component-registry').then((m) => m.loadAllManifests()),
      ]);
      const snapshot = this.editor.catalog();
      this.validation.set(
        validatePage(definition, {
          manifests,
          registeredTypes: this.editor.registeredTypes(),
          ...(snapshot ? { catalog: snapshot } : {}),
        }),
      );
    } catch {
      this.validation.set(null);
    }
  }

  private async bootstrap(): Promise<void> {
    this.telemetry.reset();
    await this.editor.loadManifests();

    try {
      await this.catalog.load(CATALOG_URL);
      const snapshot = this.catalog.projectionFor(this.author);
      this.editor.setCatalog(snapshot);

      // The canvas renders live data, so the gateway is configured exactly as the Viewer
      // configures it. A builder previewing placeholder data hides the problems real data
      // causes — a column of nulls, a chart with one point, a table that overflows.
      this.gateway.configure({
        tables: await loadFixtureTables(DATA_BASE, physicalResolver(this.catalog)),
        user: this.author,
        latencyMs: 90,
      });
    } catch (error) {
      this.message.set({
        kind: 'error',
        text: `Could not load the catalog or fixtures: ${asText(error)}`,
      });
    }

    const experience = await this.loader.loadExperience(EXPERIENCE_URL);
    if (!experience) {
      this.message.set({ kind: 'error', text: `Could not load ${EXPERIENCE_URL}` });
      return;
    }
    this.experience.set(experience);
    await this.drafts.loadListings(experience, DEFINITIONS_BASE);

    const requested = new URLSearchParams(window.location.search).get('page');
    const first = this.listings().find((listing) => listing.id === requested) ?? this.listings()[0];
    if (first) await this.openPage(first);
  }

  private async openPage(listing: PageListing): Promise<void> {
    const definition = await this.drafts.resolve(listing);
    if (!definition) {
      this.message.set({ kind: 'error', text: `Could not load "${listing.name}"` });
      return;
    }
    /**
     * The working copy is a DRAFT, whatever it was on disk.
     *
     * Opening a published artifact for editing does not edit the published artifact — publication
     * appends an immutable version rather than overwriting one — so carrying `published` and
     * `immutable: true` on the document being mutated would be a false claim about its governance
     * state, and one the compile cache is entitled to believe.
     */
    this.store.open({
      ...definition,
      version: { ...definition.version, lifecycleState: 'draft', immutable: false },
    });
    if (listing.hasDraft) this.store.markSaved(listing.savedAt);
    this.selection.select(null);
    this.openPageId.set(listing.id);
    this.message.set(null);

    const url = new URL(window.location.href);
    url.searchParams.set('page', listing.id);
    window.history.replaceState({}, '', url);
  }

  protected async onPageChange(pageId: string): Promise<void> {
    if (pageId === this.openPageId()) return;
    // Switching away from unsaved work must be a decision, not a side effect of a dropdown.
    if (this.dirty() && !window.confirm('This page has unsaved changes. Discard them?')) {
      return;
    }
    const listing = this.listings().find((entry) => entry.id === pageId);
    if (listing) await this.openPage(listing);
  }

  protected save(): void {
    const definition = this.store.definition();
    const pageId = this.openPageId();
    if (!definition || !pageId) return;

    const outcome = this.drafts.save(pageId, definition);
    if (!outcome.ok) {
      this.message.set({ kind: 'error', text: outcome.problem ?? 'Save failed' });
      return;
    }
    this.store.markSaved();
    this.message.set({
      kind: 'info',
      text: `Saved as a draft. ${this.store.history().length} change(s) recorded; publishing is a separate, reviewed step.`,
    });
    const experience = this.experience();
    if (experience) void this.drafts.loadListings(experience, DEFINITIONS_BASE);
  }

  /** Throw the draft away and reopen the published definition. */
  protected async revertToPublished(): Promise<void> {
    const pageId = this.openPageId();
    if (!pageId) return;
    if (!window.confirm('Discard this draft and reopen the published page?')) return;
    this.drafts.discard(pageId);
    const experience = this.experience();
    if (experience) await this.drafts.loadListings(experience, DEFINITIONS_BASE);
    const listing = this.listings().find((entry) => entry.id === pageId);
    if (listing) await this.openPage(listing);
  }

  /**
   * Jump from a validation finding to the thing it is about.
   *
   * A finding paths at the artifact — `/components/kpi-late/bindings/value` — and an author
   * thinks in widgets, so the path is walked back to the layout node that renders it. Without
   * this the author has to read JSON Pointers to act on their own page.
   */
  protected revealFinding(path: string): void {
    const definition = this.store.definition();
    if (!definition) return;

    const componentMatch = /^\/components\/([^/]+)/.exec(path);
    const sourceMatch = /^\/dataSources\/([^/]+)/.exec(path);

    let componentId = componentMatch?.[1];
    if (!componentId && sourceMatch) {
      componentId = Object.values(definition.components).find(
        (component) => component.dataSource === sourceMatch[1],
      )?.id;
    }

    if (componentId) {
      const node = walkLayout(definition).find(
        (entry) => entry.node.kind === 'widget' && entry.node.component === componentId,
      );
      if (node) {
        this.selection.select(node.node.id);
        this.rightTab.set('inspector');
        return;
      }
    }

    const nodeMatch = /^\/layout/.test(path);
    if (nodeMatch) this.rightTab.set('json');
  }

  protected toggleMode(): void {
    this.selection.setMode(this.mode() === 'preview' ? 'design' : 'preview');
  }

  /**
   * Editor shortcuts. Bound on the window rather than a panel, because the selection they act on
   * is global to the session — an author who selected a widget on the canvas expects ⌫ to delete
   * it without first having to focus the outline.
   */
  @HostListener('window:keydown', ['$event'])
  protected onKeydown(event: KeyboardEvent): void {
    const target = event.target as HTMLElement | null;
    // Never steal a keystroke from a field the author is typing in.
    const typing =
      target?.tagName === 'INPUT' ||
      target?.tagName === 'TEXTAREA' ||
      target?.tagName === 'SELECT' ||
      target?.isContentEditable === true;

    const meta = event.metaKey || event.ctrlKey;

    if (meta && event.key.toLowerCase() === 'z') {
      event.preventDefault();
      if (event.shiftKey) this.store.redo();
      else this.store.undo();
      return;
    }
    if (meta && event.key.toLowerCase() === 's') {
      event.preventDefault();
      this.save();
      return;
    }
    if (typing) return;

    const selected = this.selection.selected();
    if (!selected) return;

    if (event.key === 'Delete' || event.key === 'Backspace') {
      event.preventDefault();
      this.editor.remove(selected);
      return;
    }
    if (meta && event.key.toLowerCase() === 'd') {
      event.preventDefault();
      this.editor.duplicate(selected);
      return;
    }
    if (event.altKey && (event.key === 'ArrowUp' || event.key === 'ArrowDown')) {
      event.preventDefault();
      this.editor.nudge(selected, event.key === 'ArrowUp' ? -1 : 1);
      return;
    }
    if (event.key === 'Escape') {
      this.selection.select(null);
    }
  }
}

function asText(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
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
