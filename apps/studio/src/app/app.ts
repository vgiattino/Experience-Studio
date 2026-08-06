/**
 * Studio shell — the visual page builder, in the CODA workbench.
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
 *
 * WHY IT LOOKS LIKE THE OPUS EDM CONSOLE. The chrome is CODA, ported from `vgiattino/MDE`: topbar
 * over a hover-expanding icon rail, panels inset as bordered cards, a workbench of a searchable list
 * beside a body with a title row and a toolbar of icon buttons. The reason is not resemblance for
 * its own sake — an analyst who authors an experience in this builder administers the EDM the
 * experience reads from, and two products that share a data model and share nothing visually make
 * the second one feel like a bolt-on. Four things came across as behaviour rather than paint:
 *
 *   - the rail: navigation for 68px instead of 250px, so the canvas keeps the width;
 *   - the list panel: the page picker is a searchable list, not a `<select>` — see below;
 *   - the title row: version and lifecycle as pills, where the console puts them;
 *   - canvas zoom: the console's solution canvas zooms, and a dense dashboard needs it.
 *
 * WHY THE PAGE PICKER STOPPED BEING A `<select>`. A dropdown hides its contents until clicked, has
 * nowhere to put a per-item state, and cannot be filtered. The console's answer is a persistent list
 * with a filter box, which is strictly more capable: the author sees which sibling pages exist while
 * editing one, the unsaved-draft marker becomes a hint column rather than a bullet glued to the
 * option text, and finding a page in a 30-page experience is typing rather than scrolling.
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
import {
  IconComponent,
  ListPanelComponent,
  NavRailComponent,
  ThemeService,
  type ListPanelItem,
  type NavSection,
} from '@opus/design-system';
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
  AssistPanelComponent,
  AssistService,
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

import { EdmAdministrationComponent } from './edm/administration.component';
import { AUTHOR } from './session';

const DEFINITIONS_BASE = 'definitions';
const DATA_BASE = 'data';
const CATALOG_URL = 'catalog/securities.catalog.json';
const EXPERIENCE_URL = `${DEFINITIONS_BASE}/securities-operations.experience.json`;

/** What the left column holds. The rail switches between these; there is no router. */
type LeftPanel = 'pages' | 'add' | 'structure';

/**
 * Which workspace fills the main panel.
 *
 * A workspace is a coarser thing than a left panel: `builder` is this application, and `edm-console`
 * is *another* application shown in a frame for comparison. Separate state rather than a fourth
 * `LeftPanel` value, because the console has no left panel, no page, and nothing to do with the
 * artifact being edited — collapsing the two would put "which panel" and "which product" in one
 * signal and every consumer would have to know the difference anyway.
 */
type Workspace = 'builder' | 'edm-admin';

/** What the right dock holds. */
type RightTab = 'inspector' | 'history' | 'json';

/** Zoom stops, rather than a continuous slider: the author wants 100% back exactly. */
const ZOOM_STEPS = [50, 67, 80, 100, 125, 150] as const;

/**
 * The rail.
 *
 * Grouped the way the console groups: what you are working on, then what you add to it, then the
 * record of what you did. The groups are data, so an entitlement filter or a generated shell can
 * compute them — the same argument the component registry makes for widgets.
 */
const NAV_SECTIONS: readonly NavSection[] = [
  {
    items: [{ id: 'pages', label: 'Pages', icon: 'library' }],
  },
  {
    label: 'Authoring',
    mini: 'AUTHOR',
    items: [
      { id: 'add', label: 'Add a widget', icon: 'grid' },
      { id: 'structure', label: 'Page structure', icon: 'layers' },
    ],
  },
  {
    /**
     * Reference, not navigation to a feature.
     *
     * The Opus EDM console's Administration screen, recreated natively in this application's own
     * design system so the two products can be compared without switching applications. Its own rail
     * section rather than an authoring destination, because it edits nothing in this product — it is
     * a recreation of another one's surface, and its seed data is mock.
     */
    label: 'Reference',
    mini: 'REF',
    items: [{ id: 'edm-admin', label: 'EDM administration', icon: 'settings' }],
  },
];

/**
 * The preview-width control, as icons. Labels stay as tooltips — a toolbar has no room for six.
 *
 * Six stops share four glyphs, so the pairs are separated by SIZE: a large phone draws a larger phone
 * than a phone, and a desktop a larger monitor than a laptop. Two identical glyphs side by side read
 * as one control rendered twice, and the author cannot tell which stop they are on without hovering.
 */
const PREVIEW_ICONS: Record<PreviewSize['id'], { name: string; size: number }> = {
  fit: { name: 'panel-left', size: 15 },
  xs: { name: 'mobile', size: 13 },
  sm: { name: 'mobile', size: 16 },
  md: { name: 'tablet', size: 16 },
  lg: { name: 'desktop', size: 14 },
  xl: { name: 'desktop', size: 17 },
};

@Component({
  selector: 'opus-studio-root',
  changeDetection: ChangeDetectionStrategy.OnPush,
  // Provided here rather than at the root: an editing session belongs to an open document, and
  // state tier 2 is per-experience by design (§4.2). A second window opens a second session.
  providers: [DefinitionStore, SelectionService, DragStateService, EditorService, AssistService],
  imports: [
    AssistPanelComponent,
    CanvasComponent,
    EdmAdministrationComponent,
    HistoryPanelComponent,
    IconComponent,
    InspectorComponent,
    JsonViewComponent,
    ListPanelComponent,
    NavRailComponent,
    OutlineComponent,
    PaletteComponent,
  ],
  template: `
    <div class="opus-app">
      <header class="opus-topbar">
        <div class="opus-topbar-group">
          <span class="opus-wordmark">Opus <strong>Experience Studio</strong></span>
          <span class="opus-tool-sep"></span>
          <span class="experience opus-truncate" [title]="experienceName()">
            {{ experienceName() }}
          </span>
        </div>

        <div class="opus-topbar-group">
          @if (dirty()) {
            <span class="opus-env-pill warn" title="This page has unsaved changes">Unsaved</span>
          } @else if (store.savedAt()) {
            <span class="opus-env-pill draft">Saved</span>
          }

          <button
            type="button"
            class="opus-topbar-icon"
            [title]="theme.nextLabel()"
            [attr.aria-label]="theme.nextLabel()"
            (click)="theme.cycle()"
          >
            <opus-icon [name]="themeIcon()" />
          </button>

          <span class="opus-avatar" [title]="author.displayName">{{ initials() }}</span>
        </div>
      </header>

      <div class="opus-body">
        <opus-nav-rail
          [sections]="navSections"
          [activeId]="workspace() === 'builder' ? leftPanel() : workspace()"
          label="Studio navigation"
          (select)="onRailSelect($event)"
        />

        <div class="opus-main">
          @if (message(); as note) {
            <p class="opus-banner {{ note.kind }}" role="status">
              <opus-icon [name]="note.kind === 'error' ? 'warning' : 'info'" [size]="16" />
              <span>{{ note.text }}</span>
            </p>
          }

          @if (workspace() === 'edm-admin') {
            <!--
              The console's Administration screen, native. Rendered instead of the workbench rather
              than beside it: two full surfaces in one viewport is a screenshot, not something either
              can be used in. The builder's state is untouched while this shows — switching back finds
              the same page open, the same selection, the same undo history.
            -->
            <opus-edm-administration />
          } @else {

          <div class="opus-workbench" [class.list-collapsed]="listCollapsed()">
            @switch (leftPanel()) {
              @case ('pages') {
                <opus-list-panel
                  title="Pages"
                  placeholder="Filter pages…"
                  emptyText="This experience declares no pages yet."
                  [items]="pageItems()"
                  [selectedId]="openPageId()"
                  [(collapsed)]="listCollapsed"
                  (pick)="onPageChange($event)"
                />
              }
              @case ('add') {
                <div class="opus-wb-list">
                  <div class="opus-wb-list-head">
                    <span class="title">Add a widget</span>
                    <span class="spacer"></span>
                    <button
                      type="button"
                      class="opus-icon-btn"
                      title="Hide the panel"
                      (click)="listCollapsed.set(true)"
                    >
                      <opus-icon name="chevron-left" [size]="16" />
                    </button>
                  </div>
                  <div class="panel-body">
                    <opus-palette />
                  </div>
                </div>
              }
              @case ('structure') {
                <div class="opus-wb-list">
                  <div class="opus-wb-list-head">
                    <span class="title">Page structure</span>
                    <span class="count">{{ widgetCount() }} widget(s)</span>
                    <span class="spacer"></span>
                    <button
                      type="button"
                      class="opus-icon-btn"
                      title="Hide the panel"
                      (click)="listCollapsed.set(true)"
                    >
                      <opus-icon name="chevron-left" [size]="16" />
                    </button>
                  </div>
                  <div class="panel-body">
                    <opus-outline />
                  </div>
                </div>
              }
            }

            <div class="opus-wb-body">
              <div class="opus-wb-body-head">
                <div class="opus-title-row">
                  @if (listCollapsed()) {
                    <button
                      type="button"
                      class="opus-icon-btn"
                      title="Show the panel"
                      (click)="listCollapsed.set(false)"
                    >
                      <opus-icon name="chevron-right" [size]="16" />
                    </button>
                  }
                  <span class="head-icon"><opus-icon name="page" [size]="16" /></span>
                  <h1 [title]="pageName()">{{ pageName() }}</h1>

                  <!--
                    Version and lifecycle, where the console puts them. The pill is the affordance
                    for history because that is the question a version number provokes: an author who
                    reads "v3" wants to know what the three changes were.
                  -->
                  <button
                    type="button"
                    class="opus-ver-pill"
                    title="Show the change log for this editing session"
                    (click)="rightTab.set('history')"
                  >
                    <opus-icon name="history" [size]="12" [weight]="2" />
                    v{{ artifactVersion() }}
                  </button>
                  <span class="opus-env-pill" [class]="lifecycleClass()">{{ lifecycle() }}</span>

                  <div class="right">
                    <span class="opus-muted">{{ sourceCount() }} data source(s)</span>
                    <!--
                      The console's AI affordance, in the console's position. Bordered rather than
                      filled because it offers rather than acts: clicking it opens a panel of
                      proposals, and nothing changes until the author accepts one.
                    -->
                    <button
                      type="button"
                      class="opus-ai-star"
                      [attr.aria-pressed]="assistOpen()"
                      [disabled]="!store.definition()"
                      [title]="
                        assistOpen()
                          ? 'Hide the AI suggestions'
                          : 'Ask what this page is missing, grounded in the catalog'
                      "
                      (click)="toggleAssist()"
                    >
                      <opus-icon name="sparkle" [size]="15" />
                    </button>
                    @if (assist.open().length) {
                      <span class="opus-ai-badge">{{ assist.open().length }}</span>
                    }
                  </div>
                </div>
                <p class="opus-desc">{{ pageDescription() }}</p>
              </div>

              <div class="opus-wb-toolbar" role="toolbar" aria-label="Editing actions">
                <button
                  type="button"
                  class="opus-icon-btn"
                  (click)="store.undo()"
                  [disabled]="!store.canUndo()"
                  title="Undo (⌘Z)"
                >
                  <opus-icon name="undo" [size]="15" [weight]="2" />
                </button>
                <button
                  type="button"
                  class="opus-icon-btn"
                  (click)="store.redo()"
                  [disabled]="!store.canRedo()"
                  title="Redo (⇧⌘Z)"
                >
                  <opus-icon name="redo" [size]="15" [weight]="2" />
                </button>

                <span class="opus-tool-sep"></span>

                <button type="button" class="opus-btn primary sm" [disabled]="!dirty()" (click)="save()">
                  <opus-icon name="save" [size]="14" [weight]="2" />
                  Save draft
                </button>
                <button
                  type="button"
                  class="opus-btn sm"
                  [disabled]="!hasDraft()"
                  (click)="revertToPublished()"
                  title="Throw the draft away and reopen the published page"
                >
                  <opus-icon name="revert" [size]="14" [weight]="2" />
                  Discard
                </button>

                <span class="opus-tool-sep"></span>

                <button
                  type="button"
                  class="opus-icon-btn"
                  [class.active]="mode() === 'preview'"
                  [attr.aria-pressed]="mode() === 'preview'"
                  title="Preview: hide the editing affordances and behave as the Viewer does"
                  (click)="toggleMode()"
                >
                  <opus-icon name="eye" [size]="15" [weight]="2" />
                </button>

                <div class="widths" role="group" aria-label="Preview width">
                  @for (size of previewSizes; track size.id) {
                    <button
                      type="button"
                      class="opus-icon-btn"
                      [attr.data-preview]="size.id"
                      [class.active]="preview().id === size.id"
                      [attr.aria-pressed]="preview().id === size.id"
                      [title]="size.label + ' — ' + size.hint"
                      (click)="selection.setPreview(size)"
                    >
                      <opus-icon
                        [name]="previewIcon(size.id).name"
                        [size]="previewIcon(size.id).size"
                        [weight]="2"
                      />
                    </button>
                  }
                </div>

                <span class="opus-tool-sep"></span>

                <div class="opus-zoom">
                  <button
                    type="button"
                    class="opus-icon-btn"
                    title="Zoom out"
                    [disabled]="zoom() === zoomSteps[0]"
                    (click)="zoomBy(-1)"
                  >
                    <opus-icon name="zoom-out" [size]="13" [weight]="2" />
                  </button>
                  <button
                    type="button"
                    class="opus-zoom-pct"
                    title="Reset the zoom to 100%"
                    (click)="zoom.set(100)"
                  >
                    {{ zoom() }}%
                  </button>
                  <button
                    type="button"
                    class="opus-icon-btn"
                    title="Zoom in"
                    [disabled]="zoom() === zoomSteps[zoomSteps.length - 1]"
                    (click)="zoomBy(1)"
                  >
                    <opus-icon name="zoom-in" [size]="13" [weight]="2" />
                  </button>
                </div>

                <span class="opus-spacer"></span>

                <!--
                  Validation as an ambient status, in the toolbar rather than a footer. The Studio is
                  the one place a definition is *invalid on purpose* — mid-edit, between two property
                  changes — so this can never be a gate. It names the levels that ran, because a
                  validator whose absent levels are invisible reads as a validator that passed.
                -->
                @if (validation(); as report) {
                  <button
                    type="button"
                    class="validity"
                    [attr.data-valid]="report.valid"
                    [attr.aria-expanded]="showFindings()"
                    [disabled]="!report.findings.length"
                    [title]="levelsTitle(report)"
                    (click)="showFindings.set(!showFindings())"
                  >
                    <opus-icon [name]="report.valid ? 'check' : 'warning'" [size]="14" [weight]="2" />
                    {{ report.valid ? 'Valid' : 'Invalid' }}
                    @if (report.findings.length) {
                      · {{ report.findings.length }} finding(s)
                    }
                  </button>
                } @else {
                  <span class="opus-muted">Not yet validated</span>
                }
              </div>

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

              @if (assistOpen()) {
                <div class="assist-dock">
                  <opus-assist-panel (close)="assistOpen.set(false)" />
                </div>
              }

              <div class="stage opus-wb-tab-body">
                <div class="canvas-dock">
                  @if (store.definition()) {
                    <!--
                      Zoom is a transform on a wrapper, and NOTHING ELSE. The renderer resolves its
                      breakpoint from a ResizeObserver on its own element (§5.3), so anything that
                      changes the layer's layout width changes which layout the author is looking at.
                      A transform does not, which is why zooming out to see a whole dashboard leaves
                      it on the desktop layout instead of silently switching it to the phone one.

                      The first version of this backfilled the space a scaled-down layer leaves, by
                      setting the layer's width to 100/scale per cent — and that measurably broke the
                      guarantee: zooming from 100% to 67% moved the renderer from the md layout to the
                      lg one. Zoom and responsive preview are two controls, and the width belongs to
                      the other one. So the empty space stays.
                    -->
                    <div class="zoom-layer" [style.transform]="'scale(' + zoom() / 100 + ')'">
                      <opus-canvas [user]="author" />
                    </div>
                  } @else {
                    <div class="centred">
                      <opus-icon name="page" [size]="28" />
                      <p>Select a page to start editing.</p>
                    </div>
                  }
                </div>

                <aside class="dock">
                  <nav class="opus-tabs">
                    <button
                      type="button"
                      class="opus-tab"
                      [class.active]="rightTab() === 'inspector'"
                      (click)="rightTab.set('inspector')"
                    >
                      Properties
                    </button>
                    <button
                      type="button"
                      class="opus-tab"
                      [class.active]="rightTab() === 'history'"
                      (click)="rightTab.set('history')"
                    >
                      History
                      @if (store.history().length) {
                        <span class="opus-tab-badge">{{ store.history().length }}</span>
                      }
                    </button>
                    <button
                      type="button"
                      class="opus-tab"
                      [class.active]="rightTab() === 'json'"
                      (click)="rightTab.set('json')"
                    >
                      JSON
                    </button>
                  </nav>
                  <div class="dock-body">
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
                  </div>
                </aside>
              </div>
            </div>
          </div>

          }
        </div>
      </div>
    </div>
  `,
  styles: `
    :host {
      display: block;
      block-size: 100dvh;
      overflow: hidden;
      background: var(--opus-canvas);
      color: var(--opus-text);
      font-family: var(--opus-font-sans);
      font-size: var(--opus-text-md);
    }

    .experience {
      font-size: var(--opus-text-md);
      color: var(--opus-text-secondary);
      max-inline-size: 22rem;
    }

    .opus-banner {
      margin: var(--opus-space-2) var(--opus-space-2) 0;
    }

    /* The workbench fills what is left of the main panel under an optional banner. */
    .opus-main {
      min-block-size: 0;
    }

    .opus-workbench {
      flex: 1;
      min-block-size: 0;
    }

    .panel-body {
      flex: 1;
      overflow-y: auto;
      min-block-size: 0;
    }

    .widths {
      display: inline-flex;
      align-items: center;
      gap: 1px;
    }

    /*
      The panel sits between the toolbar and the canvas, not in the right dock.

      Two reasons. The right dock is 21rem wide and a rationale is a sentence, so it would wrap to
      four lines per row. And accepting a suggestion changes the canvas: the author should see the
      widget appear without the panel that proposed it having to move or close.
    */
    .assist-dock {
      padding: var(--opus-space-3) 20px;
      border-block-end: 1px solid var(--opus-border);
      flex-shrink: 0;
      max-block-size: 40vh;
      overflow-y: auto;
    }

    /* Two-pane stage: canvas and the property dock. */
    .stage {
      display: grid;
      grid-template-columns: minmax(0, 1fr) 21rem;
      min-block-size: 0;
      overflow: hidden;
    }

    .canvas-dock {
      overflow: auto;
      min-inline-size: 0;
      background: var(--opus-canvas);
    }

    /* Origin top-left rather than top-centre: a scaled-up canvas has to stay reachable by scrolling
       from the origin, and a centred origin pushes its left edge out of the scroll range. */
    .zoom-layer {
      transform-origin: top left;
      transition: transform var(--opus-duration-normal) var(--opus-easing);
    }

    .dock {
      display: flex;
      flex-direction: column;
      min-block-size: 0;
      background: var(--opus-surface);
      border-inline-start: 1px solid var(--opus-border);
    }

    .dock .opus-tabs {
      padding-inline: var(--opus-space-2);
    }

    .dock-body {
      flex: 1;
      overflow-y: auto;
      min-block-size: 0;
    }

    .centred {
      display: grid;
      place-items: center;
      gap: var(--opus-space-3);
      min-block-size: 60%;
      padding: var(--opus-space-7);
      color: var(--opus-text-muted);
    }

    .validity {
      display: inline-flex;
      align-items: center;
      gap: var(--opus-space-1);
      font: inherit;
      font-size: var(--opus-text-sm);
      padding: 4px var(--opus-space-2);
      border: 0;
      border-radius: var(--opus-radius-sm);
      background: transparent;
      cursor: pointer;
    }

    .validity:disabled {
      cursor: default;
    }

    .validity:hover:not(:disabled) {
      background: var(--opus-surface-hover);
    }

    .validity[data-valid='false'] {
      color: var(--opus-emphasis-negative);
    }

    .validity[data-valid='true'] {
      color: var(--opus-emphasis-positive);
    }

    /*
      An "Invalid" status with no explanation is useless to an author, and worse than none: it says
      something is wrong and gives them no way to find it. Each finding names its level, its path and
      its reason, and clicking one selects the widget it implicates.
    */
    .findings {
      list-style: none;
      margin: 0;
      padding: 0;
      max-block-size: 9rem;
      overflow-y: auto;
      background: var(--opus-surface-sunken);
      border-block-end: 1px solid var(--opus-border);
      flex-shrink: 0;
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
      background: none;
      font: inherit;
      font-size: var(--opus-text-sm);
      padding: 3px var(--opus-space-3);
      cursor: pointer;
      color: var(--opus-text);
    }

    .findings button:hover {
      background: var(--opus-surface-hover);
    }

    .findings .level,
    .findings .code,
    .findings .path {
      font-family: var(--opus-font-mono);
      font-size: var(--opus-text-xs);
      color: var(--opus-text-muted);
    }

    .findings .msg {
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }

    :focus-visible {
      outline: 2px solid var(--opus-focus-ring);
      outline-offset: 1px;
    }

    /* Below the laptop band the property dock stops being a column and stacks under the canvas. */
    @media (max-width: 1180px) {
      .stage {
        grid-template-columns: minmax(0, 1fr);
        grid-template-rows: minmax(0, 1fr) 18rem;
      }

      .dock {
        border-inline-start: 0;
        border-block-start: 1px solid var(--opus-border);
      }
    }

    /*
      On a phone the two-row grid gives the canvas whatever is left after a fixed 18rem dock — and
      once the list panel and the head and the toolbar have taken their share, what is left is
      nothing: the first version of this showed a property inspector and no page. So below the tablet
      band the stage stops being a grid at all. It becomes one scrollable column, the canvas gets a
      floor rather than a share, and the author scrolls from the page to its properties.
    */
    @media (max-width: 900px) {
      .stage {
        display: block;
        overflow-y: auto;
      }

      .canvas-dock {
        min-block-size: 60vh;
        overflow: visible;
      }

      .dock {
        border-inline-start: 0;
        border-block-start: 1px solid var(--opus-border);
      }

      .dock-body {
        overflow: visible;
      }
    }

    @media (max-width: 900px) {
      .experience {
        display: none;
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
  protected readonly theme = inject(ThemeService);
  protected readonly assist = inject(AssistService);

  protected readonly author: UserContext = AUTHOR;
  protected readonly previewSizes = PREVIEW_SIZES;
  protected readonly navSections = NAV_SECTIONS;
  protected readonly zoomSteps = ZOOM_STEPS;

  protected readonly experience = signal<ExperienceDefinition | null>(null);
  protected readonly listings = this.drafts.listings;
  protected readonly openPageId = signal<string | null>(null);
  protected readonly leftPanel = signal<LeftPanel>('pages');
  protected readonly workspace = signal<Workspace>('builder');
  protected readonly listCollapsed = signal(false);
  protected readonly rightTab = signal<RightTab>('inspector');
  /** `kind` maps straight onto the chrome banner variants, so the shell never translates. */
  protected readonly message = signal<{ kind: 'info' | 'success' | 'error'; text: string } | null>(
    null,
  );
  protected readonly validation = signal<ValidationReport | null>(null);
  protected readonly showFindings = signal(false);
  protected readonly zoom = signal<number>(100);
  protected readonly assistOpen = signal(false);

  /** Findings as a plain list, so the template never has to narrow an optional report. */
  protected readonly findings = computed(() => this.validation()?.findings ?? []);

  protected readonly dirty = this.store.dirty;
  protected readonly preview = this.selection.preview;
  protected readonly mode = this.selection.mode;

  protected readonly experienceName = computed(
    () => text(this.experience()?.name) || 'Loading…',
  );

  protected readonly pageName = computed(
    () => text(this.store.definition()?.name) || 'No page open',
  );

  protected readonly pageDescription = computed(() => {
    const definition = this.store.definition();
    if (!definition) return 'Choose a page from the list to open it on the canvas.';
    return (
      text(definition.description) ||
      `${this.widgetCount()} widget(s) over ${this.sourceCount()} data source(s). Every change is a JSON Patch against the artifact the runtime loads.`
    );
  });

  protected readonly artifactVersion = computed(
    () => this.store.definition()?.version?.artifactVersion ?? 0,
  );

  protected readonly lifecycle = computed(
    () => this.store.definition()?.version?.lifecycleState ?? 'none',
  );

  protected readonly lifecycleClass = computed(() => {
    const state = this.lifecycle();
    return state === 'published' ? 'live' : state === 'deprecated' ? 'warn' : 'draft';
  });

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

  /**
   * The page list, as list-panel items.
   *
   * The hint column carries the unsaved-draft state, which is the whole reason the picker moved out
   * of a `<select>`: an option element had nowhere to say it except by appending a bullet.
   */
  protected readonly pageItems = computed<readonly ListPanelItem[]>(() =>
    this.listings().map((listing) => ({
      id: listing.id,
      label: listing.name,
      icon: 'page',
      ...(listing.hasDraft ? { hint: 'draft' } : {}),
    })),
  );

  protected readonly initials = computed(() =>
    this.author.displayName
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((part) => part[0]?.toUpperCase() ?? '')
      .join(''),
  );

  protected readonly themeIcon = computed(() => {
    const mode = this.theme.mode();
    return mode === 'light' ? 'sun' : mode === 'dark' ? 'moon' : 'theme-auto';
  });

  constructor() {
    void this.bootstrap();

    /** Validate continuously, with the catalog, so level 3 runs. */
    effect(() => {
      const definition = this.store.definition();
      if (!definition) {
        this.validation.set(null);
        return;
      }
      void this.validate(definition);
    });
  }

  protected previewIcon(id: PreviewSize['id']): { name: string; size: number } {
    return PREVIEW_ICONS[id];
  }

  /**
   * Open the panel and, the first time, ask.
   *
   * Asking on first open rather than on every open: the author who clicked the star wants an answer,
   * not a second button to press — but re-asking each time they glance at the panel would spend a
   * model call on a page that has not changed. Once there is a list, the panel reports staleness and
   * offers "Suggest again", which is the author's call to make.
   */
  protected toggleAssist(): void {
    const open = !this.assistOpen();
    this.assistOpen.set(open);
    if (open && this.assist.status() === 'idle') void this.assist.suggest();
  }

  protected levelsTitle(report: ValidationReport): string {
    const notRun = report.levelsNotRun.length ? `; not run: ${report.levelsNotRun.join(', ')}` : '';
    return `Validation levels run: ${report.levelsRun.join(', ')}${notRun}`;
  }

  /** Move one stop through the zoom scale. Stops, so 100% is always reachable exactly. */
  protected zoomBy(direction: 1 | -1): void {
    const steps = ZOOM_STEPS;
    const index = steps.indexOf(this.zoom() as (typeof steps)[number]);
    const from = index === -1 ? steps.indexOf(100) : index;
    const next = steps[Math.min(steps.length - 1, Math.max(0, from + direction))];
    if (next !== undefined) this.zoom.set(next);
  }

  /**
   * The rail switched panels.
   *
   * Selecting a panel reopens the list if it was collapsed: a click on "Add a widget" that changed
   * an invisible panel would read as a dead control.
   */
  protected onRailSelect(id: string): void {
    if (id === 'edm-admin') {
      this.workspace.set('edm-admin');
      return;
    }
    if (id !== 'pages' && id !== 'add' && id !== 'structure') return;
    // Any authoring destination comes back to the builder: the rail is one list, and a click on
    // "Pages" while the console is open plainly means "show me the pages again".
    this.workspace.set('builder');
    this.leftPanel.set(id);
    this.listCollapsed.set(false);
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
    // Suggestions belong to a page, not to the session. Carrying them across a page switch would
    // offer the author a measure that is missing from the page they just closed.
    this.assist.reset();
    this.assistOpen.set(false);

    const url = new URL(window.location.href);
    url.searchParams.set('page', listing.id);
    window.history.replaceState({}, '', url);
  }

  protected async onPageChange(pageId: string): Promise<void> {
    if (pageId === this.openPageId()) return;
    // Switching away from unsaved work must be a decision, not a side effect of a click.
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
      kind: 'success',
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
    // Zoom, on the keys every canvas tool binds them to.
    if (meta && (event.key === '=' || event.key === '+')) {
      event.preventDefault();
      this.zoomBy(1);
      return;
    }
    if (meta && event.key === '-') {
      event.preventDefault();
      this.zoomBy(-1);
      return;
    }
    if (meta && event.key === '0') {
      event.preventDefault();
      this.zoom.set(100);
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
