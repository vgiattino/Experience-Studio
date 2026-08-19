/**
 * ── PARKED ────────────────────────────────────────────────────────────────────────────
 *
 * This workspace is no longer on the nav rail and is not bundled. Nothing was deleted: the component,
 * its model, its AI panel and all of their tests are intact and still run under `npm test`.
 *
 * WHY. The EDM Experience Framework PRD (`docs/PRD.md`) supersedes the requirement this served. Its
 * §16 makes every standard page a product-owned, product-versioned artifact that a client derives from,
 * compares against and synchronises with. This builder edits its own page model — ad-hoc widget props,
 * literal data arrays, `localStorage` — and a page that cannot carry a standard version cannot be
 * compared to one. FR-16 needs enforced security and FR-13 needs real search; neither is reachable
 * without the catalog binding this model does not have.
 *
 * The file header below already made this argument as a follow-on. The PRD forced it.
 *
 * MINED FIRST, NOT AFTER. The `ai/` folder beside this file is the best conversational-refinement
 * architecture in the repository, and its ideas are the foundation of the new refinement engine:
 * a proposal is not an action; the model emits decisions and code assembles the page; the model names
 * things and never invents numbers; grounding drops what the design cannot support and keeps the
 * reason. `docs/PARKED.md` §4 records where each of those went.
 *
 * TO BRING BACK. Re-add the rail entry and the `edm-page-builder` workspace member in
 * `apps/studio/src/app/app.ts`. It remains the only side-by-side reference for how the customer's
 * actual console behaves, which is worth keeping for as long as anyone is still comparing the two.
 * ─────────────────────────────────────────────────────────────────────────────────────
 */

/**
 * EDM Page Builder — the console's low-code studio, recreated natively.
 *
 * Ported from `vgiattino/MDE`, branch **`opus-angular-port`**,
 * `frontend/src/app/screens/page-builder/page-builder.ts` (1,576 lines).
 *
 * "Assemble dashboards and multi-page workflows from a palette of widgets — drag to arrange, link
 * pages together, then preview the flow." The subtitle is the original's, and it is an accurate
 * description of what this does.
 *
 * ── WHAT IS HERE ──────────────────────────────────────────────────────────────────────
 *   · the palette: six groups, twenty widget kinds, click to add
 *   · a 12-column × 40px grid canvas with drag-to-move and drag-to-resize
 *   · multiple pages with icons, reorder, duplicate, delete, and an Add page control
 *   · page links **derived** from nav-button targets, with the outgoing count on each tab
 *   · an inspector: page settings, and properties for the selected widget
 *   · the **Flow map** — pages as draggable nodes, SVG edges, drag a port to link two pages, and an
 *     Auto-arrange that layers the workflow left to right from its entry pages
 *   · a **structure** panel, the page as a tree derived from the geometry
 *   · an **AI** bar: describe a page, instruct a change, be told what is wrong, undo any of it
 *   · **catalog bindings** — a widget can read a governed measure through the same Data Gateway the
 *     runtime uses, and shows what that gateway said, entitlements and all
 *   · Edit, Flow and Preview modes
 *   · the whole design persisted to localStorage, as the original does
 *
 * ── WHAT IS NOT, AND IS NOT PRETENDED TO BE ───────────────────────────────────────────
 *   · **Kendo fidelity**: the Data grid renders rows but does not page, sort, filter or group; the
 *     gauge and progress are SVG rather than Kendo widgets. The platform has no Kendo dependency.
 *   · the **spline, funnel, radar, waterfall and scatter** chart kinds.
 *   · **filters on a binding** — the query shape supports them; there is no UI for them yet, so an
 *     entity the gateway refuses unfiltered cannot be bound.
 * Each is named in the UI where its absence would otherwise read as a bug.
 *
 * ── AND THE THING WORTH SAYING OUT LOUD ───────────────────────────────────────────────
 * This is a *second* page model in a repository whose whole architecture rests on one. Experience
 * Studio's own builder edits a validated `PageDefinition` that the runtime interprets, bound to a
 * governed catalog, with JSON-Patch undo. This edits ad-hoc widget props in localStorage. Both are
 * in the rail, under different sections, deliberately — see `model.ts` and the doc.
 */

import {
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  HostListener,
  ViewChild,
  computed,
  effect,
  inject,
  signal,
} from '@angular/core';
import { IconComponent } from '@opus/design-system';

import {
  COLS,
  DEF_SIZE,
  KEY_TYPE,
  ROW_H,
  defProps,
  linksOf,
  minH,
  paintOrder,
  seedPages,
  typeLabelOf,
  type PageDef,
  type PageLink,
  type PaletteItem,
  type Widget,
} from './model';
import { FlowMapComponent } from './flow-map.component';
import { PaletteComponent } from './palette.component';
import { AiPanelComponent, type AcceptedPage } from './ai/ai-panel.component';
import { PageBuilderDataService } from './data/data.service';
import { applyEdits } from './ai/apply';
import type { CanvasEdit } from './ai/decisions';
import type { Finding } from './ai/review';
import type { Resolved } from './data/data.service';
import { bindingTitle, type WidgetBinding } from './data/binding';
import { InspectorComponent } from './inspector.component';
import { StructureComponent } from './structure.component';
import { WidgetViewComponent } from './widget-view.component';

const STORE = 'opus.edm.pagebuilder.v1';

type Mode = 'edit' | 'flow' | 'preview';

/** Which panel the left dock shows. */
type Dock = 'widgets' | 'structure';

@Component({
  selector: 'opus-edm-page-builder',
  changeDetection: ChangeDetectionStrategy.OnPush,
  providers: [PageBuilderDataService],
  imports: [
    AiPanelComponent,
    FlowMapComponent,
    IconComponent,
    InspectorComponent,
    PaletteComponent,
    StructureComponent,
    WidgetViewComponent,
  ],
  template: `
    <div class="pb">
      <header class="pb-head">
        <span class="pb-head-icon"><opus-icon name="page" [size]="22" /></span>
        <div class="pb-title">
          <h1>Page Builder</h1>
          <p>
            Assemble dashboards and multi-page workflows from a palette of widgets — drag to arrange,
            link pages together, then preview the flow.
          </p>
        </div>
        <span class="pb-saved" role="status">
          <opus-icon name="check" [size]="13" [weight]="2" />
          {{ savedLabel() }}
        </span>

        <!--
          Undo is not a convenience here, it is the precondition for the AI panel below. A feature that
          rewrites a page in one press has to be reversible in one press, or a non-technical author
          cannot afford to try it.
        -->
        <div class="pb-history">
          <button
            type="button"
            class="opus-icon-btn"
            [disabled]="!past().length"
            [title]="undoTitle()"
            (click)="undo()"
          >
            <opus-icon name="undo" [size]="16" />
          </button>
          <button
            type="button"
            class="opus-icon-btn"
            [disabled]="!future().length"
            [title]="redoTitle()"
            (click)="redo()"
          >
            <opus-icon name="redo" [size]="16" />
          </button>
        </div>
        <div class="pb-modes" role="group" aria-label="Mode">
          <button type="button" [class.on]="mode() === 'edit'" (click)="setEdit()">
            <opus-icon name="edit" [size]="13" [weight]="2" />
            Edit
          </button>
          <button type="button" [class.on]="mode() === 'flow'" (click)="setFlow()">
            <opus-icon name="flow" [size]="13" [weight]="2" />
            Flow
          </button>
          <button type="button" [class.on]="mode() === 'preview'" (click)="setPreview()">
            <opus-icon name="eye" [size]="13" [weight]="2" />
            Preview
          </button>
        </div>
      </header>

      <!-- The page strip IS the multi-page workflow: one tab per page, with its outgoing link count. -->
      <nav class="pb-pages" aria-label="Pages">
        @for (page of pages(); track page.id; let i = $index) {
          <div class="pb-ptab" [class.active]="page.id === currentId()">
            <button type="button" class="pb-ptab-open" (click)="goToPage(page.id)">
              <opus-icon [name]="page.icon" [size]="13" />
              <span>{{ page.name }}</span>
            </button>
            @if (mode() === 'edit' && page.id === currentId()) {
              <button
                type="button"
                class="pb-ptab-x"
                title="Move earlier"
                [disabled]="i === 0"
                (click)="movePage(-1)"
              >
                <opus-icon name="chevron-left" [size]="12" [weight]="2" />
              </button>
              <button
                type="button"
                class="pb-ptab-x"
                title="Move later"
                [disabled]="i === pages().length - 1"
                (click)="movePage(1)"
              >
                <opus-icon name="chevron-right" [size]="12" [weight]="2" />
              </button>
              <button
                type="button"
                class="pb-ptab-x danger"
                title="Delete page"
                [disabled]="pages().length <= 1"
                (click)="deletePage(page.id)"
              >
                <opus-icon name="trash" [size]="12" [weight]="2" />
              </button>
            }
            @if (outCount(page); as count) {
              <span class="pb-ptab-links" [title]="count + ' outgoing link(s)'">
                {{ count }}<opus-icon name="chevron-right" [size]="11" [weight]="2" />
              </span>
            }
          </div>
        }
        @if (mode() === 'edit') {
          <button type="button" class="pb-addpage" (click)="addPage()">
            <opus-icon name="plus" [size]="13" [weight]="2" />
            Add page
          </button>
        }
      </nav>

      @if (mode() === 'edit') {
        <opus-pb-ai
          [pages]="pages()"
          [pageId]="currentId()"
          [selected]="sel()"
          [nextId]="seq + 1"
          [catalog]="data.view()"
          [resolved]="data.results()"
          (acceptPage)="addGeneratedPage($event)"
          (acceptEdits)="applyProposal($event.edits, $event.label)"
          (reveal)="revealFinding($event)"
        />
      }

      <div class="pb-work" [attr.data-mode]="mode()">
        <!--
          One left dock, two tabs — the same shape the platform builder's rail gives its list panel.
          A fourth column would take the space from the canvas, and the canvas is where the 12-column
          grid has to stay legible.
        -->
        @if (mode() === 'edit') {
          <aside class="pb-dock">
            <div class="opus-tabs pb-dock-tabs" role="tablist">
              <button
                type="button"
                class="opus-tab"
                role="tab"
                [class.active]="dock() === 'widgets'"
                [attr.aria-selected]="dock() === 'widgets'"
                (click)="dock.set('widgets')"
              >
                Widgets
              </button>
              <button
                type="button"
                class="opus-tab"
                role="tab"
                [class.active]="dock() === 'structure'"
                [attr.aria-selected]="dock() === 'structure'"
                (click)="dock.set('structure')"
              >
                Structure
                <span class="opus-tab-badge">{{ page().widgets.length }}</span>
              </button>
            </div>

            @if (dock() === 'widgets') {
              <opus-pb-palette (add)="addWidget($event)" />
            } @else {
              <opus-pb-structure
                [widgets]="page().widgets"
                [selectedId]="selId()"
                (select)="selId.set($event)"
                (hover)="hovId.set($event)"
                (restack)="restack($event)"
                (remove)="removeWidget($event)"
              />
            }
          </aside>
        }

        @if (mode() !== 'flow') {
          <main class="pb-canvas-wrap">
            <div
              #canvas
              class="pb-canvas"
              [attr.data-mode]="mode()"
              [style.min-height.px]="canvasHeight()"
              (mousedown)="onCanvasDown($event)"
            >
              @if (!page().widgets.length) {
                <div class="pb-empty">
                  <opus-icon name="grid" [size]="30" />
                  <div class="t">This page is empty</div>
                  <div class="s">Add a widget from the palette on the left to get started.</div>
                </div>
              }

              <!--
                Painted in structure order, not array order: a Section added after the widgets it
                surrounds is later in the array and would cover them. See paintOrder.
              -->
              @for (widget of painted(); track widget.id) {
                <div
                  class="pb-w"
                  [class.sel]="selId() === widget.id && mode() === 'edit'"
                  [class.hov]="hovId() === widget.id && mode() === 'edit'"
                  [style.left.px]="widget.x * unitW()"
                  [style.top.px]="widget.y * ROW_H"
                  [style.width.px]="widget.w * unitW()"
                  [style.height.px]="widget.h * ROW_H"
                  (mousedown)="onWidgetDown($event, widget)"
                >
                  <div class="pb-w-inner">
                    <opus-pb-widget [widget]="widget" [resolved]="resolvedFor(widget)" />
                  </div>
                  @if (mode() === 'edit') {
                    <span class="pb-w-type">{{ typeLabel(widget) }}</span>
                    <!--
                      A corner handle rather than edge handles: the grid snaps to 12 columns and 40px
                      rows, so a single diagonal drag reaches every reachable size, and four handles on
                      a 3-column widget would overlap each other.
                    -->
                    <span class="pb-resize" (mousedown)="onResizeDown($event, widget)"></span>
                  }
                </div>
              }
            </div>
          </main>
        }

        <!--
          ── the flow map ──────────────────────────────────────────────────────────────────
          The other half of "multi-page workflow". The canvas shows one page; this shows how an end
          user gets from one to the next, which is the thing an author cannot check by looking at
          pages one at a time.

          Every edge is a nav button on the source page — the map reads the same widgets the canvas
          edits and stores no edge of its own. So the map asks and this component writes: drawing a
          link adds a button, cutting one clears that button's target, and the page list keeps a
          single owner either way.
        -->
        @if (mode() === 'flow') {
          <opus-pb-flow-map
            [pages]="pages()"
            [links]="links()"
            [currentId]="currentId()"
            (open)="openFromFlow($event)"
            (editWidget)="editLinkWidget($event)"
            (place)="placeNode($event)"
            (link)="linkPages($event.from, $event.to)"
            (cut)="cutLink($event)"
            (arrange)="autoArrange()"
          />
        }

        @if (mode() === 'edit') {
          <opus-pb-inspector
            [widget]="sel()"
            [page]="page()"
            [pages]="pages()"
            [entities]="data.view()"
            (clear)="selId.set(null)"
            (bind)="setBinding($event)"
            (prop)="setProp($event.key, $event.value, $event.numeric)"
            (resize)="nudge($event.dim, $event.delta)"
            (duplicateWidget)="duplicateSelected()"
            (deleteWidget)="removeSelected()"
            (renamePage)="renamePage($event)"
            (pageIcon)="setPageIcon($event)"
            (duplicatePage)="duplicatePage()"
            (clearPage)="clearPage()"
          />
        }
      </div>
    </div>
  `,
  styles: `
    :host {
      display: block;
      block-size: 100%;
      min-block-size: 0;
      overflow: hidden;
      background: var(--opus-canvas);
    }

    .pb {
      display: flex;
      flex-direction: column;
      block-size: 100%;
      min-block-size: 0;
    }

    /* ── head */
    .pb-head {
      display: flex;
      align-items: flex-start;
      gap: var(--opus-space-3);
      padding: 18px 20px 12px;
      flex-shrink: 0;
      flex-wrap: wrap;
    }

    .pb-head-icon {
      display: inline-grid;
      place-items: center;
      inline-size: 36px;
      block-size: 36px;
      border-radius: var(--opus-radius-md);
      background: var(--opus-accent-soft);
      color: var(--opus-accent);
      flex-shrink: 0;
    }

    .pb-title {
      flex: 1;
      min-inline-size: 14rem;
    }

    .pb-title h1 {
      margin: 0;
      font-size: var(--opus-text-xl);
      font-weight: var(--opus-weight-semibold);
      color: var(--opus-text);
    }

    .pb-title p {
      margin: 4px 0 0;
      font-size: var(--opus-text-sm);
      color: var(--opus-text-muted);
      max-inline-size: 52rem;
      line-height: var(--opus-leading-normal);
    }

    .pb-saved {
      display: inline-flex;
      align-items: center;
      gap: 4px;
      font-size: var(--opus-text-sm);
      color: var(--opus-emphasis-positive);
    }

    .pb-history {
      display: inline-flex;
    }

    .pb-modes {
      display: inline-flex;
      gap: 2px;
    }

    .pb-modes button {
      display: inline-flex;
      align-items: center;
      gap: 5px;
      padding: 7px 13px;
      font: inherit;
      font-size: var(--opus-text-sm);
      font-weight: var(--opus-weight-medium);
      border: 1px solid var(--opus-border-strong);
      background: var(--opus-surface);
      color: var(--opus-text-secondary);
      cursor: pointer;
    }

    .pb-modes button:first-child {
      border-start-start-radius: var(--opus-radius-sm);
      border-end-start-radius: var(--opus-radius-sm);
    }

    .pb-modes button:last-child {
      border-start-end-radius: var(--opus-radius-sm);
      border-end-end-radius: var(--opus-radius-sm);
    }

    .pb-modes button.on {
      background: var(--opus-accent);
      border-color: var(--opus-accent);
      color: var(--opus-accent-contrast);
    }

    /* ── page strip */
    .pb-pages {
      display: flex;
      align-items: center;
      gap: var(--opus-space-1);
      padding: 0 20px 10px;
      flex-wrap: wrap;
      flex-shrink: 0;
    }

    .pb-ptab {
      display: inline-flex;
      align-items: center;
      gap: 4px;
      padding-inline-end: 6px;
      border: 1px solid transparent;
      border-radius: 999px;
      font-size: var(--opus-text-sm);
      color: var(--opus-text-secondary);
    }

    .pb-ptab:hover {
      background: var(--opus-surface-hover);
    }

    .pb-ptab.active {
      background: var(--opus-surface);
      border-color: var(--opus-border-strong);
      color: var(--opus-text);
    }

    .pb-ptab-open {
      display: inline-flex;
      align-items: center;
      gap: 5px;
      padding: 6px 4px 6px 11px;
      background: none;
      border: 0;
      font: inherit;
      color: inherit;
      cursor: pointer;
      white-space: nowrap;
    }

    .pb-ptab-x {
      display: inline-grid;
      place-items: center;
      inline-size: 20px;
      block-size: 20px;
      border: 0;
      border-radius: var(--opus-radius-sm);
      background: none;
      color: var(--opus-text-muted);
      cursor: pointer;
    }

    .pb-ptab-x:hover:not(:disabled) {
      background: var(--opus-surface-active);
      color: var(--opus-text);
    }

    .pb-ptab-x.danger:hover:not(:disabled) {
      color: var(--opus-emphasis-negative);
    }

    .pb-ptab-x:disabled {
      opacity: 0.3;
      cursor: default;
    }

    .pb-ptab-links {
      display: inline-flex;
      align-items: center;
      gap: 1px;
      padding: 1px 6px;
      border-radius: 999px;
      background: var(--opus-accent-soft);
      color: var(--opus-accent);
      font-size: var(--opus-text-xs);
      font-weight: var(--opus-weight-semibold);
    }

    .pb-addpage {
      display: inline-flex;
      align-items: center;
      gap: 5px;
      padding: 6px 12px;
      border: 1px dashed var(--opus-border-strong);
      border-radius: 999px;
      background: none;
      font: inherit;
      font-size: var(--opus-text-sm);
      color: var(--opus-accent);
      cursor: pointer;
    }

    .pb-addpage:hover {
      background: var(--opus-accent-soft);
    }

    /* ── work area */
    .pb-work {
      flex: 1;
      min-block-size: 0;
      display: grid;
      grid-template-columns: 210px minmax(0, 1fr) 260px;
      border-block-start: 1px solid var(--opus-border);
      overflow: hidden;
    }

    .pb-work[data-mode='preview'],
    .pb-work[data-mode='flow'] {
      grid-template-columns: minmax(0, 1fr);
    }

    /* ── left dock */
    .pb-dock {
      display: flex;
      flex-direction: column;
      min-block-size: 0;
      background: var(--opus-surface);
      border-inline-end: 1px solid var(--opus-border);
    }

    .pb-dock-tabs {
      padding-inline: 8px;
    }

    .pb-dock-tabs .opus-tab {
      padding: 8px 9px;
      font-size: var(--opus-text-sm);
    }

    .pb-dock opus-pb-palette,
    .pb-dock opus-pb-structure {
      flex: 1;
      min-block-size: 0;
      border-inline-end: 0;
    }

    /* ── canvas */
    .pb-canvas-wrap {
      overflow: auto;
      padding: 16px;
      min-inline-size: 0;
    }

    .pb-canvas {
      position: relative;
      background: var(--opus-surface);
      border: 1px solid var(--opus-border);
      border-radius: var(--opus-radius-lg);
      padding: 4px;
    }

    /*
      The grid is visible while editing and gone in preview — an author needs to see what they are
      snapping to, and a reviewer needs to see the page.
    */
    .pb-canvas[data-mode='edit'] {
      background-image:
        repeating-linear-gradient(
          to right,
          var(--opus-border) 0 1px,
          transparent 1px calc(100% / 12)
        ),
        repeating-linear-gradient(to bottom, var(--opus-border) 0 1px, transparent 1px 40px);
      background-position: 4px 4px;
      background-size: calc(100% - 8px) calc(100% - 8px);
    }

    .pb-empty {
      display: grid;
      place-items: center;
      gap: 6px;
      min-block-size: 18rem;
      color: var(--opus-text-muted);
      text-align: center;
    }

    .pb-empty .t {
      font-size: var(--opus-text-md);
      font-weight: var(--opus-weight-medium);
      color: var(--opus-text);
    }

    .pb-empty .s {
      font-size: var(--opus-text-sm);
    }

    .pb-w {
      position: absolute;
      padding: 4px;
      box-sizing: border-box;
    }

    .pb-canvas[data-mode='edit'] .pb-w {
      cursor: grab;
    }

    .pb-w-inner {
      block-size: 100%;
      overflow: hidden;
      border-radius: var(--opus-radius-md);
    }

    .pb-canvas[data-mode='edit'] .pb-w:hover .pb-w-inner,
    .pb-w.hov .pb-w-inner {
      outline: 1px dashed var(--opus-border-strong);
      outline-offset: 1px;
    }

    /* Hovering a structure row has to point at something, or the tree is a list of guesses. */
    .pb-w.hov .pb-w-inner {
      outline: 2px dashed var(--opus-accent);
    }

    .pb-w.sel .pb-w-inner {
      outline: 2px solid var(--opus-accent);
      outline-offset: 1px;
    }

    /* The type label names what a widget is while it is selected — a KPI and a gauge look alike at
       small sizes, and the inspector heading is on the other side of the screen. */
    .pb-w-type {
      position: absolute;
      inset-block-start: -9px;
      inset-inline-start: 6px;
      padding: 0 5px;
      border-radius: 3px;
      background: var(--opus-accent);
      color: var(--opus-accent-contrast);
      font-size: 9.5px;
      font-weight: var(--opus-weight-semibold);
      text-transform: uppercase;
      letter-spacing: 0.04em;
      opacity: 0;
      pointer-events: none;
      transition: opacity var(--opus-duration-fast) var(--opus-easing);
    }

    .pb-w.sel .pb-w-type,
    .pb-w:hover .pb-w-type {
      opacity: 1;
    }

    .pb-resize {
      position: absolute;
      inset-block-end: 1px;
      inset-inline-end: 1px;
      inline-size: 14px;
      block-size: 14px;
      cursor: nwse-resize;
      border-inline-end: 2px solid var(--opus-accent);
      border-block-end: 2px solid var(--opus-accent);
      border-end-end-radius: 3px;
      opacity: 0;
    }

    .pb-w.sel .pb-resize,
    .pb-w:hover .pb-resize {
      opacity: 1;
    }

    @media (max-width: 1200px) {
      .pb-work {
        grid-template-columns: 190px minmax(0, 1fr);
      }

      /* The inspector becomes an overlay rather than a third column — below this width three columns
         leave the canvas narrower than the 12-column grid it is meant to show. */
      opus-pb-inspector {
        position: absolute;
        inset-block: 0;
        inset-inline-end: 0;
        inline-size: 260px;
        z-index: 5;
        box-shadow: var(--opus-shadow-overlay);
      }

      .pb {
        position: relative;
      }
    }

    @media (max-width: 760px) {
      .pb-work {
        grid-template-columns: minmax(0, 1fr);
      }

      .pb-dock {
        display: none;
      }
    }
  `,
})
export class EdmPageBuilderComponent {
  @ViewChild('canvas') private canvasRef?: ElementRef<HTMLElement>;

  protected readonly ROW_H = ROW_H;

  protected readonly pages = signal<PageDef[]>(this.load());
  protected readonly currentId = signal(this.pages()[0]!.id);
  protected readonly selId = signal<string | null>(null);
  protected readonly mode = signal<Mode>('edit');
  protected readonly dock = signal<Dock>('widgets');
  /** Hovered from the structure panel, so the canvas can point at what a row means. */
  protected readonly hovId = signal<string | null>(null);
  /** Column width in px, measured from the canvas — the grid is proportional, not fixed. */
  protected readonly unitW = signal(80);

  protected seq = 1000;

  protected readonly page = computed(
    () => this.pages().find((page) => page.id === this.currentId()) ?? this.pages()[0]!,
  );

  protected readonly sel = computed(
    () => this.page().widgets.find((widget) => widget.id === this.selId()) ?? null,
  );

  /** Three rows of headroom below the lowest widget, so there is always somewhere to drop. */
  protected readonly data = inject(PageBuilderDataService);

  /** What the gateway said about a widget, or null when it reads nothing. */
  protected resolvedFor(widget: Widget): Resolved | null {
    return this.data.results().get(widget.id) ?? null;
  }

  /** The page's widgets in paint order — a container behind what it holds. */
  protected readonly painted = computed(() => paintOrder(this.page().widgets));

  protected readonly canvasHeight = computed(() => {
    const lowest = this.page().widgets.reduce((max, w) => Math.max(max, w.y + w.h), 0);
    return Math.max(lowest + 3, 14) * ROW_H;
  });

  protected readonly links = computed(() => linksOf(this.pages()));

  protected readonly savedLabel = computed(() =>
    this.pages().length ? 'Saved' : 'Nothing to save',
  );

  constructor() {
    /*
      Resolve the open page's bindings whenever they change.

      Keyed on the *bindings*, not on the page: moving a widget or renaming a label must not re-query, and
      an effect that watched `page()` would do exactly that on every drag frame. The gateway caches by
      source and entitlement scope, so a repeat is cheap — but a repeat per mouse move is not.
    */
    effect(() => {
      const page = this.page();
      const signature = page.widgets
        .map((widget) => (widget.binding ? JSON.stringify(widget.binding) : ''))
        .join('|');
      void signature;
      void this.data.view();
      void this.data.resolve(page);
    });

    // Persist on every change. The original saves on each mutation; an effect says the same thing
    // once instead of at twenty call sites, and cannot be forgotten by a new one.
    effect(() => {
      const pages = this.pages();
      try {
        localStorage.setItem(STORE, JSON.stringify(pages));
      } catch {
        // A blocked localStorage costs persistence, not the session.
      }
    });
  }

  ngAfterViewInit(): void {
    setTimeout(() => this.measure(), 0);
    // The app's bootstrap loads the catalog; this reads whatever it managed to load, once the first
    // paint is done so a slow catalog cannot hold up the canvas.
    setTimeout(() => this.data.refreshCatalog(), 0);
  }

  @HostListener('window:resize')
  protected measure(): void {
    const el = this.canvasRef?.nativeElement;
    if (el) this.unitW.set((el.clientWidth - 8) / COLS);
  }

  // ── undo, and the AI changes that need it ──────────────────────────────────────────

  /**
   * History as snapshots, not as a patch log.
   *
   * The platform's builder records JSON Patches against a `PageDefinition`, which is the right design
   * *there*: the artifact is large, the ops are small, and the patch list is itself a reviewable record.
   * Here a whole design is a handful of pages of plain objects — small enough that a snapshot is
   * cheaper to hold than a patch is to compute, and impossible to get subtly wrong. Thirty deep, which
   * is more than a session of hand editing produces and enough to walk back any single AI change.
   *
   * Marked *before* the change, with the change's name, so the button can say what it will undo.
   */
  protected readonly past = signal<{ pages: PageDef[]; label: string }[]>([]);
  protected readonly future = signal<{ pages: PageDef[]; label: string }[]>([]);
  /** The gesture currently being dragged, so a drag is one history entry rather than forty. */
  private gesture: string | null = null;

  protected undoTitle(): string {
    const last = this.past().at(-1);
    return last ? `Undo ${last.label}` : 'Nothing to undo';
  }

  protected redoTitle(): string {
    const next = this.future()[0];
    return next ? `Redo ${next.label}` : 'Nothing to redo';
  }

  /** Take a snapshot before a change. Call it with the name of the thing about to happen. */
  private mark(label: string): void {
    this.past.update((entries) => [...entries.slice(-29), { pages: clone(this.pages()), label }]);
    this.future.set([]);
  }

  protected undo(): void {
    const last = this.past().at(-1);
    if (!last) return;
    this.future.update((entries) => [{ pages: clone(this.pages()), label: last.label }, ...entries]);
    this.past.update((entries) => entries.slice(0, -1));
    this.restore(last.pages);
  }

  protected redo(): void {
    const next = this.future()[0];
    if (!next) return;
    this.past.update((entries) => [...entries, { pages: clone(this.pages()), label: next.label }]);
    this.future.update((entries) => entries.slice(1));
    this.restore(next.pages);
  }

  /**
   * Put a snapshot back, and keep the view pointing at something that exists.
   *
   * Undoing the creation of a page while looking at it would otherwise leave the builder on a page that
   * is no longer in the list, and every computed that reads `page()` would fall back to the first one
   * without the tab strip agreeing.
   */
  private restore(pages: PageDef[]): void {
    this.pages.set(clone(pages));
    if (!pages.some((page) => page.id === this.currentId())) {
      this.currentId.set(pages[0]!.id);
    }
    if (!this.page().widgets.some((widget) => widget.id === this.selId())) this.selId.set(null);
  }

  /** A generated page arrives as a new page, selected, with the author looking at it. */
  protected addGeneratedPage(page: AcceptedPage): void {
    this.mark(`AI: page "${page.name}"`);
    const id = `p${++this.seq}`;
    // The assembler numbered its widgets from the counter it was given; move past them so the next
    // hand-added widget cannot reuse an id.
    this.seq += page.widgets.length + 1;
    this.pages.update((pages) => [
      ...pages,
      { id, name: page.name, icon: 'model', widgets: page.widgets },
    ]);
    this.goToPage(id);
  }

  /**
   * Apply a proposal the author accepted.
   *
   * One `mark`, so the whole set is one press of undo however many edits it contained — which is the
   * promise the panel makes on screen, and the reason an author is willing to press Accept.
   */
  protected applyProposal(edits: readonly CanvasEdit[], label: string): void {
    if (!edits.length) return;
    this.mark(label);
    const result = applyEdits(edits, this.pages(), this.currentId(), this.seq);
    this.seq += edits.length + 1;
    this.pages.set(result.pages);
    if (result.selectId) this.selId.set(result.selectId);
  }

  /** Take the author to what a review finding is about. */
  protected revealFinding(finding: Finding): void {
    if (finding.pageId !== this.currentId()) this.goToPage(finding.pageId);
    this.selId.set(finding.widgetId ?? null);
    this.setEdit();
  }

  // ── loading ────────────────────────────────────────────────────────────────────────

  /**
   * Load, repairing any widget shorter than its content needs.
   *
   * The original does this on load too, and the reason is worth keeping: a stored design predates the
   * current minimum heights, so a page saved before a widget's content grew would render clipped
   * rather than merely small.
   */
  private load(): PageDef[] {
    let pages: PageDef[] | null = null;
    try {
      const raw = localStorage.getItem(STORE);
      if (raw) {
        const parsed: unknown = JSON.parse(raw);
        if (Array.isArray(parsed) && parsed.length) pages = parsed as PageDef[];
      }
    } catch {
      // A corrupt store falls back to the seed rather than an empty builder.
    }
    const result = pages ?? seedPages();
    for (const page of result) {
      for (const widget of page.widgets) widget.h = Math.max(widget.h, minH(widget));
    }
    return result;
  }

  // ── pages ──────────────────────────────────────────────────────────────────────────

  protected outCount(page: PageDef): number {
    return this.links().filter((link) => link.from === page.id).length;
  }

  protected goToPage(id: string): void {
    this.currentId.set(id);
    this.selId.set(null);
  }

  protected addPage(): void {
    this.mark('Add page');
    const id = `p${++this.seq}`;
    this.pages.update((pages) => [
      ...pages,
      { id, name: `Page ${pages.length + 1}`, icon: 'page', widgets: [] },
    ]);
    this.goToPage(id);
  }

  protected deletePage(id: string): void {
    if (this.pages().length <= 1) return;
    this.mark('Delete page');
    const index = this.pages().findIndex((page) => page.id === id);
    this.pages.update((pages) => pages.filter((page) => page.id !== id));
    if (this.currentId() === id) {
      const next = this.pages()[Math.max(0, index - 1)];
      if (next) this.goToPage(next.id);
    }
  }

  protected duplicatePage(): void {
    this.mark('Duplicate page');
    const source = this.page();
    const id = `p${++this.seq}`;
    // New widget ids, or the copy's nav buttons would share identity with the original's and the
    // derived link list would carry duplicates.
    const widgets = source.widgets.map((widget) => ({
      ...widget,
      id: `w${++this.seq}`,
      props: { ...widget.props },
    }));
    this.pages.update((pages) => [...pages, { ...source, id, name: `${source.name} copy`, widgets }]);
    this.goToPage(id);
  }

  protected clearPage(): void {
    this.mark('Clear page');
    this.patchPage({ widgets: [] });
    this.selId.set(null);
  }

  protected movePage(direction: -1 | 1): void {
    this.mark('Reorder pages');
    const pages = [...this.pages()];
    const from = pages.findIndex((page) => page.id === this.currentId());
    const to = from + direction;
    if (from < 0 || to < 0 || to >= pages.length) return;
    const [moved] = pages.splice(from, 1);
    pages.splice(to, 0, moved!);
    this.pages.set(pages);
  }

  protected renamePage(name: string): void {
    this.mark('Rename page');
    this.patchPage({ name: name.trim() || 'Untitled' });
  }

  protected setPageIcon(icon: string): void {
    this.mark('Change page icon');
    this.patchPage({ icon });
  }

  private patchPage(patch: Partial<PageDef>): void {
    const id = this.currentId();
    this.pages.update((pages) =>
      pages.map((page) => (page.id === id ? { ...page, ...patch } : page)),
    );
  }

  // ── widgets ────────────────────────────────────────────────────────────────────────

  protected addWidget(item: PaletteItem): void {
    this.mark(`Add ${item.label}`);
    const size = DEF_SIZE[item.key] ?? { w: 4, h: 3 };
    const bottom = this.page().widgets.reduce((max, w) => Math.max(max, w.y + w.h), 0);
    const widget: Widget = {
      id: `w${++this.seq}`,
      type: KEY_TYPE[item.key] ?? item.type,
      x: 0,
      y: bottom,
      w: size.w,
      h: size.h,
      props: defProps(item.key),
    };
    widget.h = Math.max(widget.h, minH(widget));
    this.patchPage({ widgets: [...this.page().widgets, widget] });
    this.selId.set(widget.id);
  }

  protected duplicateSelected(): void {
    const widget = this.sel();
    if (widget) this.duplicateWidget(widget);
  }

  protected removeSelected(): void {
    const id = this.selId();
    if (id) this.removeWidget(id);
  }

  protected duplicateWidget(widget: Widget): void {
    this.mark('Duplicate widget');
    const copy: Widget = {
      ...widget,
      id: `w${++this.seq}`,
      y: widget.y + widget.h,
      props: { ...widget.props },
    };
    this.patchPage({ widgets: [...this.page().widgets, copy] });
    this.selId.set(copy.id);
  }

  protected removeWidget(id: string): void {
    this.mark('Delete widget');
    this.patchPage({ widgets: this.page().widgets.filter((widget) => widget.id !== id) });
    if (this.selId() === id) this.selId.set(null);
  }

  private patchWidget(id: string, patch: Partial<Widget>): void {
    this.patchPage({
      widgets: this.page().widgets.map((widget) =>
        widget.id === id ? { ...widget, ...patch } : widget,
      ),
    });
  }

  /**
   * Bind or unbind the selected widget.
   *
   * The title follows the binding, because a widget labelled "Coverage" that reads `late-file-count` is
   * worse than one labelled wrong — an author trusts the label and the number contradicts it silently.
   * Unbinding leaves the title alone: the author's own words are theirs to keep.
   */
  protected setBinding(binding: WidgetBinding | null): void {
    const widget = this.sel();
    if (!widget) return;
    this.mark(binding ? 'Bind to the catalog' : 'Unbind from the catalog');
    const patch: Partial<Widget> = { binding: binding ?? undefined };
    if (binding) {
      const key = widget.type === 'kpi' ? 'label' : 'title';
      patch.props = { ...widget.props, [key]: bindingTitle(this.data.view(), binding) };
    }
    this.patchWidget(widget.id, patch);
  }

  protected setProp(key: string, value: unknown, numeric = false): void {
    const widget = this.sel();
    if (!widget) return;
    this.mark(`Change ${key}`);
    const parsed = numeric ? (Number(value) || 0) : value;
    const next = { ...widget.props, [key]: parsed };
    // A caption toggle changes the minimum height, so the widget grows rather than clipping its label.
    const patched: Widget = { ...widget, props: next };
    this.patchWidget(widget.id, { props: next, h: Math.max(widget.h, minH(patched)) });
  }

  /**
   * Move a widget through paint order.
   *
   * The array *is* the z-order — later is painted on top — so this is the only control over which of
   * two overlapping widgets wins, and there was none before. A delta past either end clamps, which is
   * what makes the structure panel's chip a "bring to front" button rather than a no-op at the top.
   */
  protected restack(move: { id: string; delta: number }): void {
    this.mark('Restack widget');
    const widgets = [...this.page().widgets];
    const from = widgets.findIndex((widget) => widget.id === move.id);
    if (from < 0) return;
    const to = Math.min(widgets.length - 1, Math.max(0, from + move.delta));
    if (to === from) return;
    const [moved] = widgets.splice(from, 1);
    widgets.splice(to, 0, moved!);
    this.patchPage({ widgets });
  }

  protected nudge(dim: 'w' | 'h', delta: number): void {
    const widget = this.sel();
    if (!widget) return;
    this.mark('Resize widget');
    if (dim === 'w') {
      const w = Math.min(COLS - widget.x, Math.max(1, widget.w + delta));
      this.patchWidget(widget.id, { w });
    } else {
      const h = Math.max(minH(widget), widget.h + delta);
      this.patchWidget(widget.id, { h });
    }
  }

  // ── drag and resize ────────────────────────────────────────────────────────────────

  private drag: {
    kind: 'move' | 'resize';
    id: string;
    sx: number;
    sy: number;
    ox: number;
    oy: number;
    ow: number;
    oh: number;
  } | null = null;

  protected onCanvasDown(event: MouseEvent): void {
    if (event.target === this.canvasRef?.nativeElement && this.mode() === 'edit') {
      this.selId.set(null);
    }
  }

  protected onWidgetDown(event: MouseEvent, widget: Widget): void {
    if (this.mode() !== 'edit') return;
    event.stopPropagation();
    this.selId.set(widget.id);
    this.begin('move', event, widget);
  }

  protected onResizeDown(event: MouseEvent, widget: Widget): void {
    if (this.mode() !== 'edit') return;
    event.stopPropagation();
    event.preventDefault();
    this.selId.set(widget.id);
    this.begin('resize', event, widget);
  }

  private begin(kind: 'move' | 'resize', event: MouseEvent, widget: Widget): void {
    this.mark(kind === 'move' ? 'Move widget' : 'Resize widget');
    this.drag = {
      kind,
      id: widget.id,
      sx: event.clientX,
      sy: event.clientY,
      ox: widget.x,
      oy: widget.y,
      ow: widget.w,
      oh: widget.h,
    };
  }

  /**
   * Move and resize, snapped to the grid.
   *
   * Bound on the window rather than the widget, because a fast drag leaves the element behind and a
   * listener on the element then stops receiving moves — the widget sticks mid-drag. Clamped to the
   * grid on both axes so a widget cannot be dragged out of the canvas and become unreachable.
   */
  @HostListener('window:mousemove', ['$event'])
  protected onDragMove(event: MouseEvent): void {
    const drag = this.drag;
    if (!drag) return;
    event.preventDefault();

    const dx = Math.round((event.clientX - drag.sx) / this.unitW());
    const dy = Math.round((event.clientY - drag.sy) / ROW_H);
    const widget = this.page().widgets.find((candidate) => candidate.id === drag.id);
    if (!widget) return;

    if (drag.kind === 'move') {
      const x = Math.min(COLS - drag.ow, Math.max(0, drag.ox + dx));
      const y = Math.max(0, drag.oy + dy);
      if (x !== widget.x || y !== widget.y) this.patchWidget(drag.id, { x, y });
      return;
    }

    const w = Math.min(COLS - widget.x, Math.max(1, drag.ow + dx));
    const h = Math.max(minH(widget), drag.oh + dy);
    if (w !== widget.w || h !== widget.h) this.patchWidget(drag.id, { w, h });
  }

  @HostListener('window:mouseup')
  protected endDrag(): void {
    this.drag = null;
    this.gesture = null;
  }

  // ── what the flow map asks for ─────────────────────────────────────────────────────

  /** A node was dragged. Store where, so the layout stops deciding for this page. */
  protected placeNode(at: { id: string; x: number; y: number }): void {
    if (this.gesture !== at.id) {
      this.mark('Move a page on the flow map');
      this.gesture = at.id;
    }
    this.pages.update((pages) =>
      pages.map((page) => (page.id === at.id ? { ...page, fx: at.x, fy: at.y } : page)),
    );
  }

  /** Hand every node back to the layout by forgetting where it was dragged. */
  protected autoArrange(): void {
    this.mark('Auto-arrange the flow');
    this.pages.update((pages) => pages.map(({ fx, fy, ...rest }) => rest));
  }

  protected openFromFlow(id: string): void {
    this.currentId.set(id);
    this.selId.set(null);
    this.setEdit();
  }

  /** Open the page an edge starts from with its nav button selected — the edge *is* that button. */
  protected editLinkWidget(link: PageLink): void {
    this.currentId.set(link.from);
    this.selId.set(link.widgetId);
    this.setEdit();
  }

  /**
   * Draw a link by adding the nav button that *is* the link.
   *
   * There is no edge to store — `linksOf` derives every edge from a button's target — so this is the
   * only honest way to create one, and it has a consequence worth stating rather than hiding: a link
   * drawn on the map puts a button on the source page. It goes below the existing content and is
   * named after its destination, so the page it lands on reads as designed rather than merely valid.
   */
  protected linkPages(from: string, to: string): void {
    const source = this.pages().find((page) => page.id === from);
    // A second edge between the same two pages would be indistinguishable on the map, and would
    // leave a duplicate button behind on the page.
    const already = this.links().some((link) => link.from === from && link.to === to);
    if (!source || already) return;

    this.mark('Link pages');
    const bottom = source.widgets.reduce((max, widget) => Math.max(max, widget.y + widget.h), 0);
    const widget: Widget = {
      id: `w${++this.seq}`,
      type: 'button',
      x: 0,
      y: bottom,
      w: 3,
      h: 2,
      props: { label: this.nameOf(to), style: 'primary', action: 'navigate', target: to },
    };
    this.pages.update((pages) =>
      pages.map((page) =>
        page.id === from ? { ...page, widgets: [...page.widgets, widget] } : page,
      ),
    );
  }

  /**
   * Cut a link by clearing the button's target rather than deleting the button.
   *
   * Deleting is the tidier-looking option and the wrong one: the button may have been placed and
   * styled on the canvas, and this builder has no undo, so losing it to one click on a map is not
   * recoverable. Clearing the target removes the edge, keeps the button, and the inspector then shows
   * it linking to "(nowhere)" — a state the author can see and finish.
   */
  protected cutLink(link: PageLink): void {
    this.mark('Cut link');
    this.pages.update((pages) =>
      pages.map((page) =>
        page.id !== link.from
          ? page
          : {
              ...page,
              widgets: page.widgets.map((widget) =>
                widget.id === link.widgetId
                  ? { ...widget, props: { ...widget.props, target: '' } }
                  : widget,
              ),
            },
      ),
    );
  }

  private nameOf(id: string): string {
    return this.pages().find((page) => page.id === id)?.name ?? id;
  }


  // ── inspector helpers ──────────────────────────────────────────────────────────────

  protected setEdit(): void {
    this.mode.set('edit');
    // The canvas is re-created on the way back in, so its column width has to be re-measured.
    setTimeout(() => this.measure(), 0);
  }

  protected setFlow(): void {
    this.mode.set('flow');
    this.selId.set(null);
  }

  protected setPreview(): void {
    this.mode.set('preview');
    this.selId.set(null);
  }

  protected readonly typeLabel = typeLabelOf;

}

/** A deep-enough copy for a history entry: pages, their widgets, and each widget's props. */
function clone(pages: readonly PageDef[]): PageDef[] {
  return pages.map((page) => ({
    ...page,
    widgets: page.widgets.map((widget) => ({ ...widget, props: { ...widget.props } })),
  }));
}
