/**
 * The canvas: the page, rendered by the Viewer's renderer, with an editing overlay on top.
 *
 * THE PREVIEW IS THE PRODUCTION RENDERER, UNMODIFIED (frontend-architecture.md §2.1). A second
 * "preview renderer" is how preview-versus-production divergence bugs are born, and they are the
 * bugs that destroy trust in a builder: the author arranges a page that looks right and it ships
 * looking different. So `PageRendererComponent` is used exactly as the Viewer uses it, and the
 * editor adds only what sits *around* it.
 *
 * HOW SELECTION WORKS WITHOUT TOUCHING THE RENDERER. The renderer publishes `data-node` on every
 * node it renders. The canvas listens on its own wrapper and walks up from the event target with
 * `closest('[data-node]')`, so the editor reads identity out of the DOM instead of the renderer
 * having to know what selection is. Highlighting is CSS on the same attribute.
 *
 * RESPONSIVE PREVIEW IS FREE, and that is a consequence of a decision made much earlier: the
 * renderer resolves its breakpoint from a ResizeObserver on its OWN element rather than the
 * viewport (§5.3). Constraining the canvas width therefore genuinely changes what the renderer
 * reports — no iframe, no media-query emulation, no second code path. Had the breakpoint come
 * from `window.matchMedia`, an honest responsive preview would have needed an iframe.
 */

import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  inject,
  input,
  signal,
  untracked,
} from '@angular/core';
import type { Breakpoint, PageDefinition, UserContext } from '@opus/contracts';
import { PageLoaderService, PageRendererComponent, type CompiledPage } from '@opus/renderer';
import { StateShellComponent } from '@opus/design-system';
import { locateNode } from '@opus/studio-core';

import { DragStateService, positionWithin } from './drag-state.service';
import { EditorService } from './editor.service';

@Component({
  selector: 'opus-canvas',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [PageRendererComponent, StateShellComponent],
  template: `
    <div class="canvas-outer">
      <!--
        A DEFINITION IS INVALID MID-EDIT, ROUTINELY. Adding a chart before binding it, or clearing a
        field before typing the next one, both produce a document the validator rejects — and an
        editor that blanks the canvas at that moment takes away the thing the author needs in order
        to finish. So the last good render stays on screen and the problem is reported above it.
      -->
      @if (compileError(); as problem) {
        <p class="stale" role="status">
          <strong>Showing the last version that rendered.</strong> {{ problem }}
        </p>
      }

      <div
        class="frame"
        [class.constrained]="width() !== undefined"
        [class.stale-content]="compileError() !== null"
        [style.inline-size.px]="width()"
        [attr.data-mode]="mode()"
      >
        @if (compileError() && !compiled()) {
          <div class="centred">
            <opus-state-shell
              state="error"
              title="This page cannot be rendered"
              [message]="compileError()!"
            />
          </div>
        } @else if (compiled(); as page) {
          <div
            class="surface"
            [attr.data-selected]="selectedId()"
            [attr.data-drop]="dropNodeId()"
            [attr.data-drop-position]="dropPosition()"
            (click)="onClick($event)"
            (dblclick)="onDoubleClick($event)"
            (dragover)="onDragOver($event)"
            (drop)="onDrop($event)"
            (dragleave)="onDragLeave($event)"
          >
            <opus-page-renderer
              [page]="page"
              [user]="user()"
              (breakpointChange)="reported.set($event)"
            />
          </div>
        } @else {
          <div class="centred">
            <opus-state-shell state="loading" label="page" skeleton="block" />
          </div>
        }
      </div>

      @if (width(); as requested) {
        <p class="ruler" [attr.data-mismatch]="mismatched()">
          {{ requested }} px
          @if (actualWidth() && actualWidth() !== requested) {
            <!-- Only shown when it differs, and it differs when the canvas is narrower than the
                 width being previewed. Reporting the requested width alone would be a lie: the
                 page would be laid out for the width it actually got. -->
            (actually {{ actualWidth() }} px)
          }
          · renderer reports <strong>{{ reported() ?? '—' }}</strong>
          @if (mismatched()) {
            — expected <strong>{{ expected() }}</strong>
          }
        </p>
      }
    </div>
  `,
  styles: `
    :host {
      display: block;
      overflow: auto;
      background: var(--opus-canvas);
    }

    .canvas-outer {
      display: block;
      inline-size: max-content;
      min-inline-size: 100%;
      padding: var(--opus-space-4);
      min-block-size: 100%;
    }

    /*
      The frame is its requested width and the canvas scrolls, rather than the frame being capped
      at the canvas width. Capping is what makes a device preview dishonest: the label says 1680
      and the page is laid out for whatever it actually received.
      Block layout with auto inline margins keeps it centred while it fits and lets it overflow to
      the scrollable end when it does not — which flex centring cannot do without clipping the
      start of the overflow.
    */
    .frame {
      inline-size: 100%;
      max-inline-size: 100%;
      margin-inline: auto;
      background: var(--opus-canvas);
    }

    .frame.constrained {
      max-inline-size: none;
    }

    .stale {
      inline-size: 100%;
      margin: 0;
      padding: var(--opus-space-2) var(--opus-space-3);
      font-size: var(--opus-text-xs);
      color: var(--opus-text);
      background: color-mix(in srgb, var(--opus-emphasis-warning) 14%, transparent);
      border: 1px solid var(--opus-emphasis-warning);
      border-radius: var(--opus-radius-sm);
    }

    .frame.stale-content {
      opacity: 0.6;
    }

    /* A constrained frame is shown as a device: a border and a shadow, so it is obvious the
       page is being viewed at a width rather than actually being that narrow. */
    .frame.constrained {
      border: 1px solid var(--opus-border);
      border-radius: var(--opus-radius-md);
      box-shadow: 0 6px 24px rgb(0 0 0 / 12%);
      overflow: hidden;
    }

    .surface {
      position: relative;
      min-block-size: 12rem;
    }

    .ruler {
      margin: var(--opus-space-2) 0 0;
      text-align: center;
      font-family: var(--opus-font-mono);
      font-size: var(--opus-text-xs);
      color: var(--opus-text-muted);
    }

    .ruler[data-mismatch='true'] {
      color: var(--opus-emphasis-warning);
    }

    .centred {
      display: grid;
      place-items: center;
      min-block-size: 16rem;
      padding: var(--opus-space-5);
    }

    /*
      THE EDITING OVERLAY IS NOT HERE. Selection, hover and drop indicators target the data-node
      attribute published by PageRendererComponent, which renders in its own view with its own
      encapsulation scope — so rules written here would be rewritten to require *this* component's
      scope attribute and would match nothing. They live in styles/editing-overlay.scss, which an
      app imports globally. See that file's header: this was a real defect, not a preference.
    */
  `,
})
export class CanvasComponent {
  private readonly editor = inject(EditorService);
  private readonly drag = inject(DragStateService);
  private readonly loader = inject(PageLoaderService);

  readonly user = input.required<UserContext>();

  protected readonly compiled = signal<CompiledPage | null>(null);
  protected readonly compileError = signal<string | null>(null);
  protected readonly selectedId = this.editor.selection.selected;
  protected readonly mode = this.editor.selection.mode;
  protected readonly width = this.editor.selection.previewWidth;

  protected readonly dropNodeId = computed(() => this.drag.target()?.nodeId ?? null);
  protected readonly dropPosition = computed(() => this.drag.target()?.position ?? null);

  /**
   * What the renderer resolved, reported by the renderer itself.
   *
   * Shown next to the frame width so a mismatch between "I am previewing at 390 px" and "the page
   * is laid out for lg" is visible rather than inferred. It is the renderer's own answer, not a
   * recomputation of it — restating the arithmetic here would make the panel agree with itself by
   * construction and verify nothing.
   */
  protected readonly reported = signal<Breakpoint | null>(null);

  /** The width the renderer actually received, which is not always the width that was asked for. */
  protected readonly actualWidth = signal<number | null>(null);

  protected readonly expected = this.editor.selection.expectedBreakpoint;

  /**
   * True when the renderer resolved a different breakpoint than the chosen width implies.
   *
   * Surfaced rather than assumed, because this preview's honesty rests on a chain of three
   * things — the frame really being that wide, the ResizeObserver firing, and the cascade
   * resolving mobile-first — and a silent disagreement anywhere in it turns the whole panel into
   * theatre.
   */
  protected readonly mismatched = computed(() => {
    const expected = this.expected();
    const reported = this.reported();
    return Boolean(expected && reported && expected !== reported);
  });

  constructor() {
    // Recompile whenever the definition changes. The compile cache does not interfere: a draft
    // is `immutable: false`, and `compilePage` refuses to cache those precisely so an editor
    // sees its own edits (runtime-architecture.md §5).
    effect(() => {
      const definition = this.editor.store.definition();
      if (!definition) {
        this.compiled.set(null);
        return;
      }
      void untracked(() => this.render(definition));
    });

    // Mirror selection and drop state onto the rendered DOM. Done as an attribute rather than a
    // class on a renderer-owned element, so the renderer needs no notion of either.
    effect(() => {
      const selected = this.selectedId();
      const drop = this.drag.target();
      // Depend on the compiled page so the marks are reapplied after a re-render, and on the
      // preview width so the readback below reflects the size currently shown.
      this.compiled();
      this.width();
      requestAnimationFrame(() => {
        for (const element of document.querySelectorAll<HTMLElement>('.surface [data-node]')) {
          const id = element.getAttribute('data-node');
          element.toggleAttribute('data-editor-selected', false);
          if (id && id === selected) element.setAttribute('data-editor-selected', 'true');
          else element.removeAttribute('data-editor-selected');
          if (id && drop && id === drop.nodeId) element.setAttribute('data-editor-drop', drop.position);
          else element.removeAttribute('data-editor-drop');
        }
        const renderer = document.querySelector<HTMLElement>('.surface opus-page-renderer');
        this.actualWidth.set(renderer ? Math.round(renderer.getBoundingClientRect().width) : null);
      });
    });
  }

  /** Monotonic render token, so an out-of-order result cannot win. */
  private renderSeq = 0;

  /**
   * Render through the loader, not `compilePage` directly.
   *
   * The same migrate → validate → compile path the Viewer uses, so a draft that renders on the
   * canvas is a draft that will load. An editor that compiled directly could show the author a
   * page the runtime would reject.
   *
   * LOADING IS ASYNCHRONOUS AND EDITS ARRIVE IN BURSTS, so results must be ordered. One inspector
   * action can produce two patches in the same tick — creating a data source and attaching it to
   * a widget — and without a token the earlier render can resolve last and put the older page back
   * on screen. The symptom was a canvas one edit behind the JSON view and behind the Viewer, which
   * reads as the builder having a model of its own: exactly the impression the whole design
   * exists to avoid.
   */
  private async render(definition: PageDefinition): Promise<void> {
    const seq = ++this.renderSeq;
    const outcome = await this.loader.loadDefinition(definition);
    if (seq !== this.renderSeq) return;

    if (outcome.ok) {
      this.compiled.set(outcome.page);
      this.compileError.set(null);
    } else {
      // Keep the last good render on screen and report the problem, rather than blanking the
      // canvas: the author needs to see what they were editing to understand the message.
      this.compileError.set(`${outcome.stage}: ${outcome.detail}`);
    }
  }

  private nodeIdAt(event: Event): string | null {
    const target = event.target as HTMLElement | null;
    return target?.closest<HTMLElement>('[data-node]')?.getAttribute('data-node') ?? null;
  }

  protected onClick(event: MouseEvent): void {
    if (this.mode() === 'preview') return;
    const id = this.nodeIdAt(event);
    // Clicking a widget selects it rather than activating it. A page being edited must not fire
    // its own drill-down actions, or selecting a table row navigates away from the editor.
    if (id) {
      event.preventDefault();
      event.stopPropagation();
    }
    this.editor.selection.select(id);
  }

  /** Double-click selects the parent — the way out of a deeply nested selection. */
  protected onDoubleClick(event: MouseEvent): void {
    if (this.mode() === 'preview') return;
    const definition = this.editor.store.definition();
    const id = this.nodeIdAt(event);
    if (!definition || !id) return;
    event.preventDefault();
    event.stopPropagation();
    const parentId = locateNode(definition, id)?.parentId;
    if (parentId) this.editor.selection.select(parentId);
  }

  protected onDragOver(event: DragEvent): void {
    if (!this.drag.dragging() || this.mode() === 'preview') return;
    const definition = this.editor.store.definition();
    if (!definition) return;

    const element = (event.target as HTMLElement | null)?.closest<HTMLElement>('[data-node]');
    const id = element?.getAttribute('data-node');
    if (!element || !id) return;

    const located = locateNode(definition, id);
    if (!located) return;

    const position = positionWithin(event, element, located.node.kind === 'container');
    const target = { nodeId: id, position };
    if (!this.editor.canDrop(target)) {
      this.drag.setTarget(null);
      return;
    }
    event.preventDefault();
    event.stopPropagation();
    if (event.dataTransfer) {
      event.dataTransfer.dropEffect = this.drag.payload()?.kind === 'move' ? 'move' : 'copy';
    }
    this.drag.setTarget(target);
  }

  protected onDragLeave(event: DragEvent): void {
    // Only clear when the pointer actually left the surface, or every child boundary flickers
    // the indicator off and on.
    const surface = event.currentTarget as HTMLElement;
    const related = event.relatedTarget as Node | null;
    if (!related || !surface.contains(related)) this.drag.setTarget(null);
  }

  protected onDrop(event: DragEvent): void {
    if (this.mode() === 'preview') return;
    event.preventDefault();
    const target = this.drag.target();
    if (target) this.editor.performDrop(target);
    else this.drag.end();
  }
}
