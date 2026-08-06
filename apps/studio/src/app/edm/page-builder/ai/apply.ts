/**
 * Grounding, then application. The only place an AI decision becomes a change to a page.
 *
 * Two steps, separated because they answer different questions at different times:
 *
 *   · **ground** runs *before* the author sees anything. It drops what the page cannot support and says
 *     why. A schema cannot know which widgets or pages exist, so this is where "retitle w7" meets the
 *     fact that there is no w7. Nothing is shown to the author that cannot be applied — a proposal
 *     listing four changes and applying three is a proposal that taught the author to distrust it.
 *
 *   · **apply** runs *after* they accept. Every arm is pure: pages in, pages out, no signals, no store.
 *     That is what makes the whole feature undoable with one snapshot and testable without a browser.
 */

import {
  COLS,
  DEF_SIZE,
  KEY_TYPE,
  defProps,
  labelOf,
  minH,
  type PageDef,
  type Widget,
} from '../model';
import {
  CHART_KINDS,
  EDITABLE_PROPS,
  isPaletteKey,
  titleProp,
  type CanvasEdit,
} from './decisions';
import { tidy } from './tidy';

export interface GroundResult {
  kept: CanvasEdit[];
  /** One line per dropped edit, naming what was asked for and why it could not be done. */
  dropped: string[];
}

/**
 * Keep the edits this design can actually support.
 *
 * Modelled on the platform's `keepGroundedProposals`: the check is not "is this well-formed" — the
 * schema did that — but "does what it refers to exist here".
 */
export function ground(edits: readonly CanvasEdit[], pages: readonly PageDef[], pageId: string): GroundResult {
  const page = pages.find((candidate) => candidate.id === pageId);
  const kept: CanvasEdit[] = [];
  const dropped: string[] = [];
  if (!page) return { kept, dropped: ['That page is no longer open.'] };

  const widgetOf = (id: string): Widget | undefined =>
    page.widgets.find((widget) => widget.id === id);

  for (const edit of edits) {
    switch (edit.op) {
      case 'retitle':
      case 'remove':
      case 'resize':
      case 'set-prop':
      case 'chart-kind': {
        const widget = widgetOf(edit.widgetId);
        if (!widget) {
          dropped.push(`Skipped a change to a widget that is not on this page.`);
          continue;
        }
        if (edit.op === 'set-prop') {
          const allowed = EDITABLE_PROPS[widget.type] ?? [];
          if (!allowed.includes(edit.key)) {
            dropped.push(
              `Skipped setting "${edit.key}" on ${labelOf(widget)} — a ${widget.type} has no such property, so it would have done nothing.`,
            );
            continue;
          }
        }
        if (edit.op === 'chart-kind') {
          if (widget.type !== 'chart') {
            dropped.push(`Skipped changing the chart type of ${labelOf(widget)}, which is not a chart.`);
            continue;
          }
          if (!CHART_KINDS.includes(edit.kind)) {
            dropped.push(`Skipped an unsupported chart type "${edit.kind}".`);
            continue;
          }
        }
        kept.push(edit);
        continue;
      }
      case 'add': {
        if (!isPaletteKey(edit.kind)) {
          dropped.push(`Skipped adding "${edit.kind}" — there is no such widget in the palette.`);
          continue;
        }
        kept.push(edit);
        continue;
      }
      case 'link': {
        const target = pages.find((candidate) => candidate.id === edit.targetPageId);
        const from = edit.pageId ?? pageId;
        if (!target) {
          dropped.push(`Skipped a link to a page that does not exist.`);
          continue;
        }
        if (target.id === from) {
          dropped.push(`Skipped a link from "${target.name}" to itself.`);
          continue;
        }
        kept.push(edit);
        continue;
      }
      case 'page-name': {
        if (!edit.name.trim()) {
          dropped.push('Skipped an empty page name.');
          continue;
        }
        kept.push(edit);
        continue;
      }
      case 'tidy':
        kept.push(edit);
        continue;
    }
  }

  return { kept, dropped };
}

export interface ApplyResult {
  pages: PageDef[];
  /** One line per applied edit, in the order they went on. This is the undo entry's contents. */
  applied: string[];
  /** The widget to select afterwards, so the author's eye lands where the change did. */
  selectId?: string;
}

/**
 * Apply grounded edits.
 *
 * Sequential rather than parallel, because later edits legitimately depend on earlier ones — an added
 * widget can be resized, a tidy has to see everything that came before it. Each arm rebuilds rather
 * than mutates, so a caller holding the previous pages still holds them, which is what undo is.
 */
export function applyEdits(
  edits: readonly CanvasEdit[],
  pages: readonly PageDef[],
  pageId: string,
  startId: number,
): ApplyResult {
  let next = pages.map((page) => ({ ...page, widgets: [...page.widgets] }));
  const applied: string[] = [];
  let seq = startId;
  let selectId: string | undefined;

  const onPage = (id: string): PageDef | undefined => next.find((page) => page.id === id);
  const setWidgets = (id: string, widgets: Widget[]): void => {
    next = next.map((page) => (page.id === id ? { ...page, widgets } : page));
  };

  for (const edit of edits) {
    const page = onPage(edit.op === 'link' ? (edit.pageId ?? pageId) : edit.op === 'tidy' ? (edit.pageId ?? pageId) : pageId);
    if (!page) continue;

    switch (edit.op) {
      case 'retitle': {
        setWidgets(
          page.id,
          page.widgets.map((widget) =>
            widget.id === edit.widgetId
              ? { ...widget, props: { ...widget.props, [titleProp(widget)]: edit.title } }
              : widget,
          ),
        );
        applied.push(edit.why);
        selectId = edit.widgetId;
        break;
      }
      case 'set-prop': {
        setWidgets(
          page.id,
          page.widgets.map((widget) => {
            if (widget.id !== edit.widgetId) return widget;
            const props = { ...widget.props, [edit.key]: edit.value };
            // A caption toggle changes the minimum height, exactly as the inspector's own edit does.
            return { ...widget, props, h: Math.max(widget.h, minH({ ...widget, props })) };
          }),
        );
        applied.push(edit.why);
        selectId = edit.widgetId;
        break;
      }
      case 'chart-kind': {
        setWidgets(
          page.id,
          page.widgets.map((widget) =>
            widget.id === edit.widgetId
              ? { ...widget, props: { ...widget.props, kind: edit.kind } }
              : widget,
          ),
        );
        applied.push(edit.why);
        selectId = edit.widgetId;
        break;
      }
      case 'add': {
        const added = newWidget(edit.kind, edit.title, page.widgets, `w${++seq}`);
        // A heading goes to the top and pushes the page down; anything else lands below the content.
        // Appending a heading under six widgets is technically an addition and visibly a mistake.
        if (added.type === 'heading') {
          setWidgets(page.id, [
            { ...added, x: 0, y: 0 },
            ...page.widgets.map((widget) => ({ ...widget, y: widget.y + added.h })),
          ]);
        } else {
          setWidgets(page.id, [...page.widgets, added]);
        }
        applied.push(edit.why);
        selectId = added.id;
        break;
      }
      case 'remove': {
        setWidgets(
          page.id,
          page.widgets.filter((widget) => widget.id !== edit.widgetId),
        );
        applied.push(edit.why);
        break;
      }
      case 'resize': {
        setWidgets(
          page.id,
          page.widgets.map((widget) => {
            if (widget.id !== edit.widgetId) return widget;
            const w = Math.min(COLS - widget.x, Math.max(1, edit.w));
            return { ...widget, w, h: Math.max(minH(widget), edit.h) };
          }),
        );
        applied.push(edit.why);
        selectId = edit.widgetId;
        break;
      }
      case 'link': {
        // A link *is* a nav button, as everywhere else in this builder — the Flow map derives its
        // edges from exactly this, so there is nothing else to write.
        const bottom = page.widgets.reduce((max, widget) => Math.max(max, widget.y + widget.h), 0);
        const button: Widget = {
          id: `w${++seq}`,
          type: 'button',
          x: 0,
          y: bottom,
          w: 3,
          h: 2,
          props: { label: edit.label, style: 'primary', action: 'navigate', target: edit.targetPageId },
        };
        setWidgets(page.id, [...page.widgets, button]);
        applied.push(edit.why);
        if (page.id === pageId) selectId = button.id;
        break;
      }
      case 'page-name': {
        next = next.map((candidate) =>
          candidate.id === pageId ? { ...candidate, name: edit.name.trim() } : candidate,
        );
        applied.push(edit.why);
        break;
      }
      case 'tidy': {
        const result = tidy(page.widgets);
        setWidgets(page.id, result.widgets);
        applied.push(result.changes.length ? result.changes.join(' ') : 'The layout was already tidy.');
        break;
      }
    }
  }

  return { pages: next, applied, selectId };
}

/** A widget as the palette would have made it, with the title the instruction asked for. */
function newWidget(kind: string, title: string, existing: readonly Widget[], id: string): Widget {
  const size = DEF_SIZE[kind] ?? { w: 4, h: 3 };
  const widget: Widget = {
    id,
    type: KEY_TYPE[kind] ?? 'text',
    x: 0,
    y: existing.reduce((max, one) => Math.max(max, one.y + one.h), 0),
    w: size.w,
    h: size.h,
    props: defProps(kind),
  };
  widget.props[titleProp(widget)] = title;
  widget.h = Math.max(widget.h, minH(widget));
  return widget;
}
