/**
 * Layout repair. Deterministic, and the reason there is no model call in it.
 *
 * "Tidy this up" is the single most common thing a non-technical author wants after ten minutes of
 * dragging, and it is *arithmetic*: nothing overlaps, nothing hangs off the right edge, nothing floats
 * six rows below the thing above it. A model would produce a different answer each time for a question
 * that has one right answer, so this is code — and it is in the AI panel because that is where the
 * author asks for it, not because a model is involved.
 *
 * Reading order is preserved, never reinvented. An author who put the chart before the table meant it,
 * so tidying keeps that order and only closes the space between them.
 */

import { COLS, minH, structureOf, type Widget } from '../model';

export interface TidyResult {
  widgets: Widget[];
  /** What changed, in the author's language. Empty means the page was already tidy. */
  changes: string[];
}

/**
 * Tidy a page.
 *
 * Sections are left where they are and their contents move with them. A section is a *frame* an author
 * drew deliberately, and repacking one to the top of the page would take every widget out of it — the
 * containment is derived from the geometry, so moving the frame is moving the meaning.
 */
export function tidy(widgets: readonly Widget[]): TidyResult {
  const changes: string[] = [];
  if (!widgets.length) return { widgets: [...widgets], changes };

  const nested = new Set(
    structureOf(widgets)
      .filter((row) => row.parentId !== null)
      .map((row) => row.widget.id),
  );

  // Reading order, which is the order the author sees.
  const loose = widgets
    .filter((widget) => !nested.has(widget.id) && widget.type !== 'section')
    .slice()
    .sort((a, b) => a.y - b.y || a.x - b.x);
  const frames = widgets.filter((widget) => widget.type === 'section' || nested.has(widget.id));

  let clamped = 0;
  let grown = 0;
  const fixed = loose.map((widget) => {
    const next = { ...widget };
    if (next.w > COLS) {
      next.w = COLS;
      clamped += 1;
    }
    if (next.x + next.w > COLS) {
      next.x = Math.max(0, COLS - next.w);
      clamped += 1;
    }
    const floor = minH(next);
    if (next.h < floor) {
      next.h = floor;
      grown += 1;
    }
    return next;
  });

  // Repack: fill each row left to right, and start a new row when the next widget will not fit.
  let y = 0;
  let x = 0;
  let tallest = 0;
  let moved = 0;
  for (const widget of fixed) {
    if (x + widget.w > COLS) {
      y += tallest;
      x = 0;
      tallest = 0;
    }
    if (widget.x !== x || widget.y !== y) moved += 1;
    widget.x = x;
    widget.y = y;
    x += widget.w;
    tallest = Math.max(tallest, widget.h);
  }

  if (moved) changes.push(`Moved ${moved} widget(s) to close gaps and remove overlaps.`);
  if (clamped) changes.push(`Pulled ${clamped} widget(s) back inside the 12-column grid.`);
  if (grown) changes.push(`Grew ${grown} widget(s) that were too short for their content.`);
  if (frames.length) {
    changes.push(`Left ${frames.length} widget(s) in place: sections and what is inside them.`);
  }

  // Frames keep their array positions, so paint order and z-order are untouched by a tidy.
  const byId = new Map(fixed.map((widget) => [widget.id, widget]));
  return { widgets: widgets.map((widget) => byId.get(widget.id) ?? widget), changes };
}
