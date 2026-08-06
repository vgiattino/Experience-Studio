/**
 * The flow map — pages as nodes, navigation as edges.
 *
 * Ported from `vgiattino/MDE@opus-angular-port`, the Flow tab of
 * `frontend/src/app/screens/page-builder/page-builder.ts`.
 *
 * The canvas next door shows one page. This shows how an end user gets from one page to the next,
 * which is the thing an author cannot check by looking at pages one at a time.
 *
 * ── WHY THIS IS ITS OWN COMPONENT, AND WHY IT OWNS NOTHING ─────────────────────────────
 * It renders `pages` and `links` and it *asks* for changes. Every mutation — a node placed, a link
 * drawn, a link cut — leaves as an output and is applied by the builder, which stays the single owner
 * of the page list and its one persistence path. A map that wrote to the pages itself would be a
 * second writer to the same state, and the two would drift the first time either grew a rule.
 *
 * What that buys beyond tidiness: the geometry here is pure. `edgePath`, `edgeMid` and `autoLayout`
 * take pages and links and return coordinates, so they can be asserted on directly.
 */

import {
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  HostListener,
  ViewChild,
  computed,
  input,
  output,
  signal,
} from '@angular/core';
import { IconComponent } from '@opus/design-system';

import {
  COL_GAP,
  NODE_H,
  NODE_W,
  SKIP_LANE,
  autoLayout,
  type NodePos,
  type PageDef,
  type PageLink,
} from './model';

/** A link being drawn: where it started, and where the pointer is now, both in flow pixels. */
interface LinkDrag {
  from: string;
  x: number;
  y: number;
}

@Component({
  selector: 'opus-pb-flow-map',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [IconComponent],
  template: `
    <div class="fm">
      <div class="fm-bar">
        <opus-icon name="flow" [size]="15" />
        <b>{{ pages().length }} pages · {{ links().length }} links</b>
        <span class="fm-hint">
          Drag a page to place it. Drag the dot on its right edge onto another page to link them — a
          link is a nav button, so one is added to the source page.
          @if (noEntry(); as start) {
            <b class="fm-warn">
              No entry page: every page is linked to from somewhere, so this map is laid out from
              "{{ start }}".
            </b>
          }
        </span>
        <button
          type="button"
          class="opus-btn sm"
          title="Lay every page out by its distance from an entry page"
          (click)="arrange.emit()"
        >
          <opus-icon name="revert" [size]="13" [weight]="2" />
          Auto-arrange
        </button>
      </div>

      <div class="fm-scroll">
        <div
          #surface
          class="fm-surface"
          [style.width.px]="width()"
          [style.height.px]="height()"
          (mousedown)="onSurfaceDown($event)"
        >
          <svg class="fm-edges" [attr.width]="width()" [attr.height]="height()">
            <defs>
              <marker
                id="pbArrow"
                viewBox="0 0 9 9"
                refX="8"
                refY="4.5"
                markerWidth="7"
                markerHeight="7"
                orient="auto-start-reverse"
              >
                <path class="fm-arrow" d="M 1 1 L 8 4.5 L 1 8 z" />
              </marker>
              <marker
                id="pbArrowSel"
                viewBox="0 0 9 9"
                refX="8"
                refY="4.5"
                markerWidth="7"
                markerHeight="7"
                orient="auto-start-reverse"
              >
                <path class="fm-arrow sel" d="M 1 1 L 8 4.5 L 1 8 z" />
              </marker>
            </defs>

            @for (edge of links(); track edge.id) {
              <!-- A wide invisible twin, because a 1.5px curve is not a clickable target. -->
              <path class="fm-hit" [attr.d]="edgePath(edge)" (mousedown)="pickEdge($event, edge.id)" />
              <path
                class="fm-edge"
                [class.sel]="selEdge() === edge.id"
                [attr.d]="edgePath(edge)"
                [attr.marker-end]="selEdge() === edge.id ? 'url(#pbArrowSel)' : 'url(#pbArrow)'"
              />
            }

            @if (linkDrag(); as draft) {
              <path class="fm-edge draft" [attr.d]="draftPath(draft)" />
            }
          </svg>

          @for (node of pages(); track node.id) {
            <div
              class="fm-node"
              [class.current]="node.id === currentId()"
              [class.droptarget]="dropId() === node.id"
              [style.left.px]="posOf(node).x"
              [style.top.px]="posOf(node).y"
              [style.width.px]="NODE_W"
              [style.height.px]="NODE_H"
              (mousedown)="onNodeDown($event, node)"
            >
              <div class="fm-node-h">
                <opus-icon [name]="node.icon" [size]="13" />
                <span class="fm-node-name">{{ node.name }}</span>
                @if (isEntry(node)) {
                  <span class="fm-entry" title="Nothing links here — a way in">Entry</span>
                }
              </div>
              <div class="fm-node-sub">
                {{ node.widgets.length }} widget(s) · {{ outCount(node) }} out · {{ inCount(node) }} in
              </div>
              <button
                type="button"
                class="fm-open"
                (mousedown)="$event.stopPropagation()"
                (click)="open.emit(node.id)"
              >
                Open
                <opus-icon name="chevron-right" [size]="11" [weight]="2" />
              </button>
              <span
                class="fm-port"
                title="Drag onto another page to link to it"
                (mousedown)="onPortDown($event, node)"
              ></span>
            </div>
          }

          <!--
            Labels last, so they paint over the nodes. A label that lands on a node is readable; a
            label hidden behind one leaves an unidentifiable edge, and identifying the edge — naming
            the button it stands for — is the label's whole job.
          -->
          @for (edge of links(); track edge.id) {
            <button
              type="button"
              class="fm-lbl"
              [class.sel]="selEdge() === edge.id"
              [style.left.px]="edgeMid(edge).x"
              [style.top.px]="edgeMid(edge).y"
              (mousedown)="pickEdge($event, edge.id)"
            >
              {{ edge.label }}
            </button>
          }
        </div>
      </div>

      @if (edge(); as picked) {
        <div class="fm-bar picked" role="status">
          <opus-icon name="flow" [size]="14" />
          <b>{{ nameOf(picked.from) }}</b>
          <opus-icon name="chevron-right" [size]="12" [weight]="2" />
          <b>{{ nameOf(picked.to) }}</b>
          <span class="fm-via">via the "{{ picked.label }}" button</span>
          <button type="button" class="opus-btn sm" (click)="editWidget.emit(picked)">
            <opus-icon name="edit" [size]="13" [weight]="2" />
            Edit that button
          </button>
          <button type="button" class="opus-btn sm danger" (click)="cutEdge(picked)">
            <opus-icon name="close" [size]="13" [weight]="2" />
            Cut link
          </button>
          <span class="fm-note">Cutting clears the button's target. The button stays on the page.</span>
        </div>
      }
    </div>
  `,
  styles: `
    :host {
      display: block;
      min-block-size: 0;
      min-inline-size: 0;
    }

    .fm {
      display: flex;
      flex-direction: column;
      block-size: 100%;
      min-block-size: 0;
    }

    .fm-bar {
      display: flex;
      align-items: center;
      gap: var(--opus-space-2);
      padding: 9px 16px;
      flex-shrink: 0;
      flex-wrap: wrap;
      font-size: var(--opus-text-sm);
      color: var(--opus-text-secondary);
      background: var(--opus-surface);
      border-block-end: 1px solid var(--opus-border);
    }

    /* The picked-edge bar sits below the map, so its hairline is on the other side. */
    .fm-bar.picked {
      border-block-end: 0;
      border-block-start: 1px solid var(--opus-border);
    }

    .fm-bar b {
      color: var(--opus-text);
      font-weight: var(--opus-weight-semibold);
    }

    .fm-bar .opus-icon {
      color: var(--opus-accent);
    }

    .fm-hint,
    .fm-note {
      flex: 1;
      min-inline-size: 11rem;
      font-size: var(--opus-text-xs);
      color: var(--opus-text-muted);
      line-height: var(--opus-leading-normal);
    }

    .fm-via {
      color: var(--opus-text-muted);
    }

    .fm-warn {
      color: var(--opus-emphasis-warning);
    }

    .fm-bar .danger {
      color: var(--opus-emphasis-negative);
      border-color: var(--opus-emphasis-negative);
    }

    .fm-scroll {
      flex: 1;
      min-block-size: 0;
      overflow: auto;
      padding: 8px;
    }

    /*
      A dotted field rather than a plain one: an empty surface gives a dragged node nothing to be
      positioned against, and the dots make it obvious that the map scrolls past its edge.
    */
    .fm-surface {
      position: relative;
      background-image: radial-gradient(var(--opus-border-strong) 1px, transparent 1px);
      background-size: 22px 22px;
      border-radius: var(--opus-radius-lg);
    }

    .fm-edges {
      position: absolute;
      inset-block-start: 0;
      inset-inline-start: 0;
      overflow: visible;
      /* Edges must not swallow a click meant for a node they run under; the hit paths opt back in. */
      pointer-events: none;
    }

    .fm-edge {
      fill: none;
      stroke: var(--opus-border-strong);
      stroke-width: 1.5;
    }

    .fm-edge.sel {
      stroke: var(--opus-accent);
      stroke-width: 2.5;
    }

    .fm-edge.draft {
      stroke: var(--opus-accent);
      stroke-width: 2;
      stroke-dasharray: 5 4;
    }

    .fm-hit {
      fill: none;
      stroke: transparent;
      stroke-width: 14;
      pointer-events: stroke;
      cursor: pointer;
    }

    .fm-arrow {
      fill: var(--opus-border-strong);
    }

    .fm-arrow.sel {
      fill: var(--opus-accent);
    }

    /* The label names the button that *is* the link, so two edges out of one page are told apart. */
    .fm-lbl {
      position: absolute;
      transform: translate(-50%, -50%);
      max-inline-size: 9rem;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
      padding: 1px 7px;
      border: 1px solid var(--opus-border);
      border-radius: 999px;
      background: var(--opus-surface);
      color: var(--opus-text-muted);
      font: inherit;
      font-size: var(--opus-text-xs);
      cursor: pointer;
    }

    .fm-lbl.sel {
      border-color: var(--opus-accent);
      background: var(--opus-accent-soft);
      color: var(--opus-accent);
      font-weight: var(--opus-weight-semibold);
    }

    .fm-node {
      position: absolute;
      box-sizing: border-box;
      display: flex;
      flex-direction: column;
      gap: 3px;
      padding: 8px 10px;
      border: 1px solid var(--opus-border-strong);
      border-radius: var(--opus-radius-md);
      background: var(--opus-surface);
      box-shadow: var(--opus-shadow-raised);
      cursor: grab;
      user-select: none;
    }

    .fm-node:hover {
      border-color: var(--opus-accent);
    }

    .fm-node.current {
      border-color: var(--opus-accent);
      box-shadow: 0 0 0 2px var(--opus-accent-soft);
    }

    .fm-node.droptarget {
      border-color: var(--opus-emphasis-positive);
      box-shadow: 0 0 0 3px var(--opus-emphasis-positive-bg);
    }

    .fm-node-h {
      display: flex;
      align-items: center;
      gap: 5px;
      min-inline-size: 0;
    }

    .fm-node-h .opus-icon {
      color: var(--opus-accent);
      flex-shrink: 0;
    }

    .fm-node-name {
      font-size: var(--opus-text-md);
      font-weight: var(--opus-weight-semibold);
      color: var(--opus-text);
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }

    .fm-entry {
      margin-inline-start: auto;
      padding: 0 5px;
      border-radius: 3px;
      background: var(--opus-emphasis-positive-bg);
      color: var(--opus-emphasis-positive);
      font-size: 9.5px;
      font-weight: var(--opus-weight-semibold);
      text-transform: uppercase;
      letter-spacing: 0.04em;
      flex-shrink: 0;
    }

    .fm-node-sub {
      font-size: var(--opus-text-xs);
      color: var(--opus-text-muted);
    }

    .fm-open {
      align-self: flex-start;
      display: inline-flex;
      align-items: center;
      gap: 1px;
      margin-block-start: auto;
      padding: 0;
      border: 0;
      background: none;
      font: inherit;
      font-size: var(--opus-text-xs);
      font-weight: var(--opus-weight-medium);
      color: var(--opus-accent);
      cursor: pointer;
    }

    .fm-open:hover {
      text-decoration: underline;
    }

    .fm-port {
      position: absolute;
      inset-inline-end: -7px;
      inset-block-start: 50%;
      transform: translateY(-50%);
      inline-size: 13px;
      block-size: 13px;
      border-radius: 50%;
      border: 2px solid var(--opus-surface);
      background: var(--opus-border-strong);
      cursor: crosshair;
    }

    .fm-node:hover .fm-port,
    .fm-node.current .fm-port {
      background: var(--opus-accent);
    }
  `,
})
export class FlowMapComponent {
  @ViewChild('surface') private surfaceRef?: ElementRef<HTMLElement>;

  protected readonly NODE_W = NODE_W;
  protected readonly NODE_H = NODE_H;

  readonly pages = input.required<readonly PageDef[]>();
  readonly links = input.required<readonly PageLink[]>();
  readonly currentId = input<string | null>(null);

  /** Open a page in the canvas. */
  readonly open = output<string>();
  /** Open the page an edge starts from with its nav button selected — the edge *is* that button. */
  readonly editWidget = output<PageLink>();
  /** A node was dragged to a place. */
  readonly place = output<{ id: string; x: number; y: number }>();
  /** Two pages should be linked. The builder decides what widget makes that true. */
  readonly link = output<{ from: string; to: string }>();
  /** An edge should stop existing. */
  readonly cut = output<PageLink>();
  /** Forget every placed position and fall back to the layout. */
  readonly arrange = output<void>();

  protected readonly selEdge = signal<string | null>(null);
  protected readonly dropId = signal<string | null>(null);
  protected readonly linkDrag = signal<LinkDrag | null>(null);

  private nodeDrag: { id: string; sx: number; sy: number; ox: number; oy: number } | null = null;
  /** The surface's rect, captured when a drag starts — one read instead of one per mousemove. */
  private surfaceRect: DOMRect | null = null;

  /** Re-read from `links()`, so a cut or a rename cannot leave a stale selection on screen. */
  protected readonly edge = computed(
    () => this.links().find((candidate) => candidate.id === this.selEdge()) ?? null,
  );

  /**
   * Where the layout wants each page, computed once per change rather than once per node.
   *
   * A page with `fx`/`fy` still gets an entry here and simply ignores it, which is what lets
   * Auto-arrange be a deletion of two fields rather than a recomputation of coordinates.
   */
  private readonly autoPos = computed(() => autoLayout(this.pages(), this.links()));

  /**
   * The page the layout had to start from when no page qualifies as an entry, or null.
   *
   * Worth saying rather than leaving to be noticed: a workflow where every page has a "Back to …"
   * button has no page with nothing pointing at it, so no Entry badge appears anywhere and the first
   * column looks arbitrary. It is not — it is the first page in the strip — but an author cannot tell
   * that from the picture, and a badge that never shows reads as a broken badge.
   */
  protected readonly noEntry = computed(() => {
    const pages = this.pages();
    if (!pages.length || pages.some((page) => this.isEntry(page))) return null;
    return pages[0]!.name;
  });

  protected readonly width = computed(() =>
    this.pages().reduce((max, page) => Math.max(max, this.posOf(page).x + NODE_W + 90), 640),
  );

  /** Tall enough for the nodes *and* the return bus under them, or the deepest lane is unscrollable. */
  protected readonly height = computed(() => {
    const lanes = this.backLanes().length;
    return Math.max(380, this.busY(lanes - 1) + 40);
  });

  // ── geometry ───────────────────────────────────────────────────────────────────────

  /** Stored position if the author placed the node, otherwise wherever the layout puts it. */
  protected posOf(page: PageDef): NodePos {
    if (page.fx != null && page.fy != null) return { x: page.fx, y: page.fy };
    return this.autoPos().get(page.id) ?? { x: 34, y: 30 };
  }

  /** A way in: nothing navigates here. A self-link does not count, or a loop could never be one. */
  protected isEntry(page: PageDef): boolean {
    return this.links().every((link) => link.to !== page.id || link.from === page.id);
  }

  protected outCount(page: PageDef): number {
    return this.links().filter((link) => link.from === page.id).length;
  }

  protected inCount(page: PageDef): number {
    return this.links().filter((link) => link.to === page.id).length;
  }

  protected nameOf(id: string): string {
    return this.pages().find((page) => page.id === id)?.name ?? id;
  }

  /**
   * The one curve an edge is, as a cubic bezier — every edge leaves a node's right edge and arrives
   * at a node's left edge, so direction is legible without reading the arrowhead.
   *
   * Path and label share this, deliberately: they were two copies of the same formula for one commit
   * and that is exactly how a label ends up floating off its line.
   *
   * Three shapes, because one does not survive real workflows:
   *   · **forward** (the target is to the right) — horizontal control points, so a row of edges reads
   *     as one flow where straight diagonals cross into a mess as soon as there are three;
   *   · **backward** (the target is level with or left of the source) — routed *under* both nodes.
   *     A back-link drawn like a forward one retraces the forward link almost exactly: two edges land
   *     on the same pixels and their labels on the same point, so an author sees one edge where there
   *     are two. Sagging it below is what makes the pair countable, and a return path under the row
   *     is how a workflow diagram conventionally reads anyway.
   *   · **self** — both endpoints on one node, so it loops out to the right rather than hiding under
   *     the node it belongs to.
   */
  private curve(link: PageLink): readonly [number, number, number, number, number, number, number, number] | null {
    const from = this.pageById(link.from);
    const to = this.pageById(link.to);
    if (!from || !to) return null;
    const a = this.posOf(from);

    if (link.from === link.to) {
      const x = a.x + NODE_W;
      const y1 = a.y + NODE_H * 0.32;
      const y2 = a.y + NODE_H * 0.68;
      return [x, y1, x + 66, y1 - 16, x + 66, y2 + 16, x, y2];
    }

    const b = this.posOf(to);
    const x1 = a.x + NODE_W;
    const y1 = a.y + NODE_H / 2;
    const x2 = b.x;
    const y2 = b.y + NODE_H / 2;

    if (x2 <= x1) {
      const lane = this.laneFor(this.busY(this.backLanes().indexOf(link.id)), y1, y2);
      return [x1, y1, x1 + 56, lane, x2 - 56, lane, x2, y2];
    }

    if (x2 - x1 > COL_GAP * 1.6) {
      const apex = this.skipY(this.skipLanes().indexOf(link.id), Math.min(a.y, b.y));
      const lane = this.laneFor(apex, y1, y2);
      return [x1, y1, x1 + 70, lane, x2 - 70, lane, x2, y2];
    }

    const dx = Math.max(46, (x2 - x1) / 2);
    return [x1, y1, x1 + dx, y1, x2 - dx, y2, x2, y2];
  }

  /**
   * The y an edge that skips a column arcs over: above the row it skips, one lane per such edge.
   *
   * Without this, A → C and A → B leave the same node along the same line, the two curves are one
   * curve on screen, and their labels land on the same pixel — which is exactly what a five-page seed
   * produced. Arcing over also *says* something true: this edge passes a page rather than reaching the
   * next one. The layout reserves the headroom (see SKIP_LANE), so a clamp only bites when nodes have
   * been dragged up by hand.
   */
  private skipY(index: number, topOfPair: number): number {
    return Math.max(8, topOfPair - 22 - Math.max(0, index) * SKIP_LANE);
  }

  /** Column-skipping edges in order, so each keeps a stable lane as the design changes. */
  private readonly skipLanes = computed(() =>
    this.links()
      .filter((link) => {
        if (link.from === link.to) return false;
        const from = this.pageById(link.from);
        const to = this.pageById(link.to);
        if (!from || !to) return false;
        return this.posOf(to).x - (this.posOf(from).x + NODE_W) > COL_GAP * 1.6;
      })
      .map((link) => link.id),
  );

  /**
   * The control-point y that makes a curve actually *reach* a given extreme.
   *
   * A cubic with both control points on one line only travels three quarters of the way to it, so a
   * lane placed 30px below the last node draws a curve that clears it by 22 and a label that does not
   * clear it at all. Every route here names the height it wants and solves for the control point,
   * rather than naming a control point and hoping — that arithmetic was wrong twice by eye.
   */
  private laneFor(extreme: number, y1: number, y2: number): number {
    return (extreme - 0.25 * (y1 + y2)) / 0.75;
  }

  /**
   * How deep a back-link's return runs: a bus below every node, one lane per back-link.
   *
   * Below *everything* rather than below the two nodes involved, because a lane tucked into a row gap
   * is exactly where the forward edges into the next row live — the return would cross them and its
   * label would land on theirs. One bus under the diagram is also how a workflow diagram is
   * conventionally read: forward left to right, returns underneath. A lane each, because two returns
   * sharing a y is the same collision one level down.
   */
  private busY(index: number): number {
    const floor = this.pages().reduce((max, page) => Math.max(max, this.posOf(page).y + NODE_H), 0);
    return floor + 30 + Math.max(0, index) * SKIP_LANE;
  }

  /** Back-links in order, so each gets a stable lane rather than one that shifts as edges change. */
  private readonly backLanes = computed(() =>
    this.links()
      .filter((link) => {
        if (link.from === link.to) return false;
        const from = this.pageById(link.from);
        const to = this.pageById(link.to);
        return !!from && !!to && this.posOf(to).x <= this.posOf(from).x + NODE_W;
      })
      .map((link) => link.id),
  );

  protected edgePath(link: PageLink): string {
    const c = this.curve(link);
    if (!c) return '';
    return `M ${c[0]} ${c[1]} C ${c[2]} ${c[3]}, ${c[4]} ${c[5]}, ${c[6]} ${c[7]}`;
  }

  /**
   * Where the label sits: the point halfway *along* the curve, which is not the average of its
   * endpoints — for an arc over a row or a return under one, the difference is the whole arc.
   */
  protected edgeMid(link: PageLink): NodePos {
    const c = this.curve(link);
    if (!c) return { x: 0, y: 0 };
    return {
      x: 0.125 * c[0] + 0.375 * c[2] + 0.375 * c[4] + 0.125 * c[6],
      y: 0.125 * c[1] + 0.375 * c[3] + 0.375 * c[5] + 0.125 * c[7],
    };
  }

  protected draftPath(draft: LinkDrag): string {
    const from = this.pageById(draft.from);
    if (!from) return '';
    const a = this.posOf(from);
    const x1 = a.x + NODE_W;
    const y1 = a.y + NODE_H / 2;
    const dx = Math.max(30, Math.abs(draft.x - x1) / 2);
    return `M ${x1} ${y1} C ${x1 + dx} ${y1}, ${draft.x - dx} ${draft.y}, ${draft.x} ${draft.y}`;
  }

  private pageById(id: string): PageDef | undefined {
    return this.pages().find((page) => page.id === id);
  }

  // ── gestures ───────────────────────────────────────────────────────────────────────

  protected onSurfaceDown(event: MouseEvent): void {
    // Only a click on the surface itself clears the picked edge; one on a node or an edge does not.
    if (event.target === this.surfaceRef?.nativeElement) this.selEdge.set(null);
  }

  protected pickEdge(event: MouseEvent, id: string): void {
    event.stopPropagation();
    this.selEdge.set(this.selEdge() === id ? null : id);
  }

  protected cutEdge(link: PageLink): void {
    this.selEdge.set(null);
    this.cut.emit(link);
  }

  protected onNodeDown(event: MouseEvent, page: PageDef): void {
    event.preventDefault();
    this.selEdge.set(null);
    const at = this.posOf(page);
    this.nodeDrag = { id: page.id, sx: event.clientX, sy: event.clientY, ox: at.x, oy: at.y };
  }

  protected onPortDown(event: MouseEvent, page: PageDef): void {
    event.preventDefault();
    event.stopPropagation();
    this.surfaceRect = this.surfaceRef?.nativeElement.getBoundingClientRect() ?? null;
    const at = this.posOf(page);
    this.linkDrag.set({ from: page.id, x: at.x + NODE_W + 12, y: at.y + NODE_H / 2 });
  }

  /**
   * Bound on the window rather than on the node, because a fast drag leaves the element behind and a
   * listener on the element then stops receiving moves — the node would stick mid-drag.
   */
  @HostListener('window:mousemove', ['$event'])
  protected onMove(event: MouseEvent): void {
    const drag = this.nodeDrag;
    if (drag) {
      event.preventDefault();
      // Free placement, not snapped: a flow map has no grid, and what an author wants here is
      // "roughly there, clear of that edge".
      this.place.emit({
        id: drag.id,
        x: Math.max(0, drag.ox + (event.clientX - drag.sx)),
        y: Math.max(0, drag.oy + (event.clientY - drag.sy)),
      });
      return;
    }

    const draft = this.linkDrag();
    const rect = this.surfaceRect;
    if (!draft || !rect) return;
    event.preventDefault();
    const x = event.clientX - rect.left;
    const y = event.clientY - rect.top;
    this.linkDrag.set({ ...draft, x, y });
    this.dropId.set(this.nodeAt(x, y, draft.from));
  }

  @HostListener('window:mouseup')
  protected onUp(): void {
    this.nodeDrag = null;
    const draft = this.linkDrag();
    const target = this.dropId();
    this.linkDrag.set(null);
    this.dropId.set(null);
    this.surfaceRect = null;
    if (draft && target) this.link.emit({ from: draft.from, to: target });
  }

  /**
   * Which node is under a point.
   *
   * Hit-tested against the node rectangles rather than through the DOM, because the dragged path sits
   * over them and `event.target` would be the SVG on every drop.
   */
  private nodeAt(x: number, y: number, exclude: string): string | null {
    for (const page of this.pages()) {
      if (page.id === exclude) continue;
      const at = this.posOf(page);
      if (x >= at.x && x <= at.x + NODE_W && y >= at.y && y <= at.y + NODE_H) return page.id;
    }
    return null;
  }
}
