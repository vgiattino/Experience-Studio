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
 *   · Edit and Preview modes
 *   · the whole design persisted to localStorage, as the original does
 *
 * ── WHAT IS NOT, AND IS NOT PRETENDED TO BE ───────────────────────────────────────────
 *   · the **Flow map** — pages as draggable nodes with SVG edges, port-drag to link and a BFS
 *     auto-arrange. It is the largest single piece of the original and the next thing to port.
 *   · **Kendo fidelity**: the Data grid renders rows but does not page, sort, filter or group; the
 *     gauge and progress are SVG rather than Kendo widgets. The platform has no Kendo dependency.
 *   · the **spline, funnel, radar, waterfall and scatter** chart kinds.
 *   · **AI generate** from a prompt, and data-source binding.
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
  signal,
} from '@angular/core';
import { IconComponent } from '@opus/design-system';

import {
  ACCENTS,
  COLS,
  DEF_SIZE,
  KEY_TYPE,
  PALETTE,
  ROW_H,
  defProps,
  linksOf,
  minH,
  seedPages,
  type PageDef,
  type PaletteItem,
  type Widget,
} from './model';
import { WidgetViewComponent } from './widget-view.component';

const STORE = 'opus.edm.pagebuilder.v1';

/** Icons a page may carry, matching the row of choices the original offers in page settings. */
const PAGE_ICONS = ['page', 'grid', 'layers', 'database', 'model', 'shield', 'settings', 'flow'];

type Mode = 'edit' | 'preview';

@Component({
  selector: 'opus-edm-page-builder',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [IconComponent, WidgetViewComponent],
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
        <div class="pb-modes" role="group" aria-label="Mode">
          <button type="button" [class.on]="mode() === 'edit'" (click)="mode.set('edit')">
            <opus-icon name="edit" [size]="13" [weight]="2" />
            Edit
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

      <div class="pb-work" [attr.data-mode]="mode()">
        @if (mode() === 'edit') {
          <aside class="pb-palette">
            <div class="pb-pal-h">Widgets</div>
            <p class="pb-pal-help">Click to add to the page, then drag to arrange.</p>
            @for (group of palette; track group.group) {
              <div class="pb-pal-group">{{ group.group }}</div>
              <div class="pb-pal-grid">
                @for (item of group.items; track item.key) {
                  <button
                    type="button"
                    class="pb-pal-item"
                    [title]="'Add ' + item.label"
                    (click)="addWidget(item)"
                  >
                    <span class="pb-pal-ic"><opus-icon [name]="item.icon" [size]="16" /></span>
                    <span class="pb-pal-lbl">{{ item.label }}</span>
                  </button>
                }
              </div>
            }
          </aside>
        }

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

            @for (widget of page().widgets; track widget.id) {
              <div
                class="pb-w"
                [class.sel]="selId() === widget.id && mode() === 'edit'"
                [style.left.px]="widget.x * unitW()"
                [style.top.px]="widget.y * ROW_H"
                [style.width.px]="widget.w * unitW()"
                [style.height.px]="widget.h * ROW_H"
                (mousedown)="onWidgetDown($event, widget)"
              >
                <div class="pb-w-inner"><opus-pb-widget [widget]="widget" /></div>
                @if (mode() === 'edit') {
                  <span class="pb-w-type">{{ typeLabel(widget) }}</span>
                  <!--
                    A corner handle rather than edge handles: the grid snaps to 12 columns and 40px
                    rows, so a single diagonal drag reaches every reachable size, and four handles on a
                    3-column widget would overlap each other.
                  -->
                  <span class="pb-resize" (mousedown)="onResizeDown($event, widget)"></span>
                }
              </div>
            }
          </div>
        </main>

        @if (mode() === 'edit') {
          <aside class="pb-insp">
            @if (sel(); as widget) {
              <div class="pb-insp-h">
                <opus-icon name="sliders" [size]="15" />
                {{ typeLabel(widget) }}
                <button type="button" class="opus-icon-btn" title="Clear selection" (click)="selId.set(null)">
                  <opus-icon name="close" [size]="15" [weight]="2" />
                </button>
              </div>
              <div class="pb-insp-body">
                @for (field of fieldsFor(widget); track field.key) {
                  <label class="pb-f">
                    {{ field.label }}
                    @if (field.kind === 'textarea') {
                      <textarea
                        class="opus-textarea"
                        rows="3"
                        [value]="text(widget, field.key)"
                        (change)="setProp(field.key, $any($event.target).value)"
                      ></textarea>
                    } @else if (field.kind === 'select') {
                      <select
                        class="opus-select"
                        [value]="text(widget, field.key)"
                        (change)="setProp(field.key, $any($event.target).value)"
                      >
                        @for (option of field.options ?? []; track option) {
                          <option [value]="option">{{ option || '(none)' }}</option>
                        }
                      </select>
                    } @else if (field.kind === 'boolean') {
                      <input
                        type="checkbox"
                        [checked]="flag(widget, field.key)"
                        (change)="setProp(field.key, $any($event.target).checked)"
                      />
                    } @else {
                      <input
                        class="opus-input"
                        [type]="field.kind === 'number' ? 'number' : 'text'"
                        [value]="text(widget, field.key)"
                        (change)="setProp(field.key, $any($event.target).value, field.kind === 'number')"
                      />
                    }
                    @if (field.hint) {
                      <span class="pb-hint">{{ field.hint }}</span>
                    }
                  </label>
                }

                @if (isAccented(widget)) {
                  <div class="pb-f">
                    Accent
                    <div class="pb-swatches">
                      @for (accent of accents; track accent) {
                        <button
                          type="button"
                          class="pb-swatch"
                          [class.on]="text(widget, 'accent') === accent"
                          [style.background]="accent"
                          [title]="accent"
                          (click)="setProp('accent', accent)"
                        ></button>
                      }
                    </div>
                  </div>
                }

                @if (isNavButton(widget)) {
                  <label class="pb-f">
                    Links to
                    <select
                      class="opus-select"
                      [value]="text(widget, 'target')"
                      (change)="setProp('target', $any($event.target).value)"
                    >
                      <option value="">(nowhere)</option>
                      @for (other of pages(); track other.id) {
                        @if (other.id !== currentId()) {
                          <option [value]="other.id">{{ other.name }}</option>
                        }
                      }
                    </select>
                    <span class="pb-hint">
                      A target here is what draws a link between pages — the strip counts them.
                    </span>
                  </label>
                }

                <div class="pb-size">
                  <span class="pb-f-label">Size</span>
                  <div class="pb-size-row">
                    <span>Width</span>
                    <button type="button" class="opus-icon-btn" (click)="nudge('w', -1)">−</button>
                    <b>{{ widget.w }} / {{ COLS }}</b>
                    <button type="button" class="opus-icon-btn" (click)="nudge('w', 1)">+</button>
                  </div>
                  <div class="pb-size-row">
                    <span>Height</span>
                    <button type="button" class="opus-icon-btn" (click)="nudge('h', -1)">−</button>
                    <b>{{ widget.h }} row(s)</b>
                    <button type="button" class="opus-icon-btn" (click)="nudge('h', 1)">+</button>
                  </div>
                </div>

                <div class="pb-insp-actions">
                  <button type="button" class="opus-btn sm" (click)="duplicateWidget(widget)">
                    <opus-icon name="copy" [size]="13" [weight]="2" />
                    Duplicate
                  </button>
                  <button type="button" class="opus-btn sm danger" (click)="removeWidget(widget.id)">
                    <opus-icon name="trash" [size]="13" [weight]="2" />
                    Delete
                  </button>
                </div>
              </div>
            } @else {
              <div class="pb-insp-h"><opus-icon name="settings" [size]="15" /> Page settings</div>
              <div class="pb-insp-body">
                <label class="pb-f">
                  Page name
                  <input
                    class="opus-input"
                    [value]="page().name"
                    (change)="renamePage($any($event.target).value)"
                  />
                </label>

                <div class="pb-f">
                  Icon
                  <div class="pb-icons">
                    @for (icon of pageIcons; track icon) {
                      <button
                        type="button"
                        class="pb-icon-pick"
                        [class.on]="page().icon === icon"
                        [title]="icon"
                        (click)="setPageIcon(icon)"
                      >
                        <opus-icon [name]="icon" [size]="15" />
                      </button>
                    }
                  </div>
                </div>

                <p class="pb-hint">
                  This page has {{ page().widgets.length }} widget(s). Select a widget on the canvas to
                  edit it, or add one from the palette.
                </p>

                <div class="pb-insp-actions column">
                  <button type="button" class="opus-btn sm" (click)="duplicatePage()">
                    <opus-icon name="copy" [size]="13" [weight]="2" />
                    Duplicate page
                  </button>
                  <button type="button" class="opus-btn sm" (click)="clearPage()">
                    <opus-icon name="revert" [size]="13" [weight]="2" />
                    Clear page
                  </button>
                </div>

                <p class="pb-note">
                  Not yet ported from the console: the <b>Flow</b> map, Kendo grid paging and sorting,
                  the spline/funnel/radar/waterfall/scatter chart kinds, AI generation from a prompt,
                  and data-source binding.
                </p>
              </div>
            }
          </aside>
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
      grid-template-columns: 190px minmax(0, 1fr) 260px;
      border-block-start: 1px solid var(--opus-border);
      overflow: hidden;
    }

    .pb-work[data-mode='preview'] {
      grid-template-columns: minmax(0, 1fr);
    }

    .pb-palette {
      border-inline-end: 1px solid var(--opus-border);
      overflow-y: auto;
      padding: 12px 10px 24px;
      background: var(--opus-surface);
    }

    .pb-pal-h {
      font-size: var(--opus-text-md);
      font-weight: var(--opus-weight-semibold);
      color: var(--opus-text);
    }

    .pb-pal-help {
      margin: 2px 0 12px;
      font-size: var(--opus-text-xs);
      color: var(--opus-text-muted);
      line-height: var(--opus-leading-normal);
    }

    .pb-pal-group {
      font-size: 10px;
      font-weight: var(--opus-weight-semibold);
      text-transform: uppercase;
      letter-spacing: 0.07em;
      color: var(--opus-text-muted);
      margin: 12px 0 6px;
    }

    .pb-pal-grid {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 6px;
    }

    .pb-pal-item {
      display: flex;
      flex-direction: column;
      align-items: center;
      gap: 5px;
      padding: 9px 4px;
      border: 1px solid var(--opus-border);
      border-radius: var(--opus-radius-md);
      background: var(--opus-surface);
      font: inherit;
      cursor: pointer;
      color: var(--opus-text-secondary);
    }

    .pb-pal-item:hover {
      border-color: var(--opus-accent);
      color: var(--opus-accent);
    }

    .pb-pal-ic {
      display: inline-grid;
      place-items: center;
      inline-size: 26px;
      block-size: 26px;
      border-radius: var(--opus-radius-sm);
      background: var(--opus-accent-soft);
      color: var(--opus-accent);
    }

    .pb-pal-lbl {
      font-size: 10.5px;
      text-align: center;
      line-height: 1.25;
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

    .pb-canvas[data-mode='edit'] .pb-w:hover .pb-w-inner {
      outline: 1px dashed var(--opus-border-strong);
      outline-offset: 1px;
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

    /* ── inspector */
    .pb-insp {
      border-inline-start: 1px solid var(--opus-border);
      background: var(--opus-surface);
      display: flex;
      flex-direction: column;
      min-block-size: 0;
    }

    .pb-insp-h {
      display: flex;
      align-items: center;
      gap: var(--opus-space-2);
      padding: 11px 12px;
      border-block-end: 1px solid var(--opus-border);
      font-size: var(--opus-text-md);
      font-weight: var(--opus-weight-semibold);
      color: var(--opus-text);
      flex-shrink: 0;
    }

    .pb-insp-h .opus-icon-btn {
      margin-inline-start: auto;
    }

    .pb-insp-body {
      flex: 1;
      overflow-y: auto;
      padding: 12px;
      min-block-size: 0;
    }

    .pb-f,
    .pb-f-label {
      display: block;
      font-size: var(--opus-text-sm);
      font-weight: var(--opus-weight-medium);
      color: var(--opus-text);
      margin-block-end: 12px;
    }

    .pb-f .opus-input,
    .pb-f .opus-select,
    .pb-f .opus-textarea {
      margin-block-start: 4px;
    }

    .pb-hint {
      display: block;
      margin-block-start: 3px;
      font-size: var(--opus-text-xs);
      font-weight: var(--opus-weight-regular);
      color: var(--opus-text-muted);
      line-height: var(--opus-leading-normal);
    }

    .pb-swatches,
    .pb-icons {
      display: flex;
      flex-wrap: wrap;
      gap: 4px;
      margin-block-start: 5px;
    }

    .pb-swatch {
      inline-size: 22px;
      block-size: 22px;
      border-radius: 50%;
      border: 2px solid transparent;
      cursor: pointer;
      padding: 0;
    }

    .pb-swatch.on {
      border-color: var(--opus-text);
    }

    .pb-icon-pick {
      display: inline-grid;
      place-items: center;
      inline-size: 28px;
      block-size: 28px;
      border: 1px solid var(--opus-border);
      border-radius: var(--opus-radius-sm);
      background: var(--opus-surface);
      color: var(--opus-text-secondary);
      cursor: pointer;
    }

    .pb-icon-pick.on {
      border-color: var(--opus-accent);
      background: var(--opus-accent-soft);
      color: var(--opus-accent);
    }

    .pb-size {
      padding-block: 4px 10px;
    }

    .pb-size-row {
      display: flex;
      align-items: center;
      gap: 6px;
      font-size: var(--opus-text-sm);
      font-weight: var(--opus-weight-regular);
      color: var(--opus-text-secondary);
      margin-block-start: 5px;
    }

    .pb-size-row span {
      inline-size: 3.5rem;
    }

    .pb-size-row b {
      min-inline-size: 5rem;
      text-align: center;
      color: var(--opus-text);
    }

    .pb-insp-actions {
      display: flex;
      gap: 6px;
      margin-block-start: var(--opus-space-2);
    }

    .pb-insp-actions.column {
      flex-direction: column;
    }

    .pb-insp-actions .danger {
      color: var(--opus-emphasis-negative);
      border-color: var(--opus-emphasis-negative);
    }

    .pb-note {
      margin: var(--opus-space-5) 0 0;
      padding-block-start: var(--opus-space-3);
      border-block-start: 1px solid var(--opus-border);
      font-size: var(--opus-text-xs);
      color: var(--opus-text-muted);
      line-height: var(--opus-leading-normal);
    }

    @media (max-width: 1200px) {
      .pb-work {
        grid-template-columns: 160px minmax(0, 1fr);
      }

      /* The inspector becomes an overlay rather than a third column — below this width three columns
         leave the canvas narrower than the 12-column grid it is meant to show. */
      .pb-insp {
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

      .pb-palette {
        display: none;
      }
    }
  `,
})
export class EdmPageBuilderComponent {
  @ViewChild('canvas') private canvasRef?: ElementRef<HTMLElement>;

  protected readonly COLS = COLS;
  protected readonly ROW_H = ROW_H;
  protected readonly palette = PALETTE;
  protected readonly accents = ACCENTS;
  protected readonly pageIcons = PAGE_ICONS;

  protected readonly pages = signal<PageDef[]>(this.load());
  protected readonly currentId = signal(this.pages()[0]!.id);
  protected readonly selId = signal<string | null>(null);
  protected readonly mode = signal<Mode>('edit');
  /** Column width in px, measured from the canvas — the grid is proportional, not fixed. */
  protected readonly unitW = signal(80);

  private seq = 1000;

  protected readonly page = computed(
    () => this.pages().find((page) => page.id === this.currentId()) ?? this.pages()[0]!,
  );

  protected readonly sel = computed(
    () => this.page().widgets.find((widget) => widget.id === this.selId()) ?? null,
  );

  /** Three rows of headroom below the lowest widget, so there is always somewhere to drop. */
  protected readonly canvasHeight = computed(() => {
    const lowest = this.page().widgets.reduce((max, w) => Math.max(max, w.y + w.h), 0);
    return Math.max(lowest + 3, 14) * ROW_H;
  });

  private readonly links = computed(() => linksOf(this.pages()));

  protected readonly savedLabel = computed(() =>
    this.pages().length ? 'Saved' : 'Nothing to save',
  );

  constructor() {
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
  }

  @HostListener('window:resize')
  protected measure(): void {
    const el = this.canvasRef?.nativeElement;
    if (el) this.unitW.set((el.clientWidth - 8) / COLS);
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
    const id = `p${++this.seq}`;
    this.pages.update((pages) => [
      ...pages,
      { id, name: `Page ${pages.length + 1}`, icon: 'page', widgets: [] },
    ]);
    this.goToPage(id);
  }

  protected deletePage(id: string): void {
    if (this.pages().length <= 1) return;
    const index = this.pages().findIndex((page) => page.id === id);
    this.pages.update((pages) => pages.filter((page) => page.id !== id));
    if (this.currentId() === id) {
      const next = this.pages()[Math.max(0, index - 1)];
      if (next) this.goToPage(next.id);
    }
  }

  protected duplicatePage(): void {
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
    this.patchPage({ widgets: [] });
    this.selId.set(null);
  }

  protected movePage(direction: -1 | 1): void {
    const pages = [...this.pages()];
    const from = pages.findIndex((page) => page.id === this.currentId());
    const to = from + direction;
    if (from < 0 || to < 0 || to >= pages.length) return;
    const [moved] = pages.splice(from, 1);
    pages.splice(to, 0, moved!);
    this.pages.set(pages);
  }

  protected renamePage(name: string): void {
    this.patchPage({ name: name.trim() || 'Untitled' });
  }

  protected setPageIcon(icon: string): void {
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

  protected duplicateWidget(widget: Widget): void {
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

  protected setProp(key: string, value: unknown, numeric = false): void {
    const widget = this.sel();
    if (!widget) return;
    const parsed = numeric ? (Number(value) || 0) : value;
    const next = { ...widget.props, [key]: parsed };
    // A caption toggle changes the minimum height, so the widget grows rather than clipping its label.
    const patched: Widget = { ...widget, props: next };
    this.patchWidget(widget.id, { props: next, h: Math.max(widget.h, minH(patched)) });
  }

  protected nudge(dim: 'w' | 'h', delta: number): void {
    const widget = this.sel();
    if (!widget) return;
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
  }

  // ── inspector helpers ──────────────────────────────────────────────────────────────

  protected setPreview(): void {
    this.mode.set('preview');
    this.selId.set(null);
  }

  protected typeLabel(widget: Widget): string {
    if (widget.type === 'chart') return `${String(widget.props['kind'] ?? 'chart')} chart`;
    const found = PALETTE.flatMap((group) => group.items).find(
      (item) => KEY_TYPE[item.key] === widget.type,
    );
    return found?.label ?? widget.type;
  }

  protected text(widget: Widget, key: string): string {
    const value = widget.props[key];
    return value === undefined || value === null ? '' : String(value);
  }

  protected flag(widget: Widget, key: string): boolean {
    return widget.props[key] === true;
  }

  protected isAccented(widget: Widget): boolean {
    return widget.type === 'kpi' || (widget.type === 'chart' && !this.isPie(widget));
  }

  private isPie(widget: Widget): boolean {
    return widget.props['kind'] === 'pie' || widget.props['kind'] === 'donut';
  }

  protected isNavButton(widget: Widget): boolean {
    return widget.type === 'button';
  }

  /**
   * Which properties the inspector offers for a type.
   *
   * A table rather than a template branch per type, so adding a widget kind is a row here. Deliberately
   * short of the original's inspector, which also edits column configs, segment lists, chart legends
   * and axis options — those are named in the outstanding list rather than half-built.
   */
  protected fieldsFor(widget: Widget): readonly {
    key: string;
    label: string;
    kind: 'text' | 'textarea' | 'number' | 'select' | 'boolean';
    options?: readonly string[];
    hint?: string;
  }[] {
    switch (widget.type) {
      case 'heading':
        return [
          { key: 'text', label: 'Text', kind: 'text' },
          { key: 'level', label: 'Level', kind: 'select', options: ['1', '2', '3'] },
        ];
      case 'text':
        return [
          { key: 'text', label: 'Text', kind: 'textarea' },
          { key: 'align', label: 'Align', kind: 'select', options: ['left', 'center', 'right'] },
          { key: 'muted', label: 'Muted', kind: 'boolean' },
        ];
      case 'divider':
        return [{ key: 'spacer', label: 'Invisible spacer', kind: 'boolean' }];
      case 'image':
        return [
          { key: 'url', label: 'Image URL', kind: 'text', hint: 'Empty shows a placeholder.' },
          { key: 'caption', label: 'Caption', kind: 'text' },
        ];
      case 'kpi':
        return [
          { key: 'label', label: 'Label', kind: 'text' },
          { key: 'value', label: 'Value', kind: 'text' },
          { key: 'delta', label: 'Delta', kind: 'text' },
          { key: 'dir', label: 'Direction', kind: 'select', options: ['up', 'down', 'flat'] },
        ];
      case 'table':
      case 'grid':
        return [{ key: 'title', label: 'Title', kind: 'text' }];
      case 'chart':
        return [
          { key: 'title', label: 'Title', kind: 'text' },
          {
            key: 'kind',
            label: 'Kind',
            kind: 'select',
            options: ['column', 'bar', 'line', 'area', 'pie', 'donut'],
          },
        ];
      case 'gauge':
        return [
          { key: 'title', label: 'Title', kind: 'text' },
          { key: 'value', label: 'Value', kind: 'number' },
          { key: 'max', label: 'Maximum', kind: 'number' },
          { key: 'suffix', label: 'Suffix', kind: 'text' },
        ];
      case 'progress':
        return [
          { key: 'title', label: 'Label', kind: 'text' },
          { key: 'value', label: 'Value', kind: 'number' },
          { key: 'max', label: 'Maximum', kind: 'number' },
        ];
      case 'button':
        return [
          { key: 'label', label: 'Label', kind: 'text' },
          { key: 'style', label: 'Style', kind: 'select', options: ['primary', 'secondary', 'ghost'] },
        ];
      case 'section':
        return [
          { key: 'title', label: 'Title', kind: 'text' },
          { key: 'desc', label: 'Description', kind: 'text' },
        ];
      case 'checkbox':
        return [
          { key: 'label', label: 'Label', kind: 'text' },
          { key: 'value', label: 'Checked', kind: 'boolean' },
        ];
      default:
        return [
          { key: 'caption', label: 'Show caption', kind: 'boolean' },
          { key: 'label', label: 'Label', kind: 'text' },
          { key: 'value', label: 'Value', kind: 'text' },
        ];
    }
  }
}
