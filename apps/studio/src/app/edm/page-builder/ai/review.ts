/**
 * The review: what is wrong with this design, offered before anyone asks.
 *
 * ── WHY THIS IS THE MOST VALUABLE AI FEATURE HERE, AND IT HAS NO MODEL IN IT ────────────
 * A non-technical author does not know what a good page looks like, and will not know what to ask for.
 * Generation answers a question they thought of. This answers the ones they did not: a button that
 * navigates nowhere, a page nothing can reach, two widgets on top of each other, six placeholder
 * titles left over from the palette. Every one of those is invisible to the person who made it and
 * obvious to anyone else — which is the definition of the feedback worth automating.
 *
 * It is rules, not a model, because these findings must be *complete and stable*. An author who fixes
 * everything the panel lists has to be able to trust that the list was the whole list, and a model that
 * mentions two of four overlaps this run and three next run destroys exactly that. The platform's own
 * assist (`libs/generation/src/assist.ts`) puts a model in front of a page for the judgement calls that
 * genuinely need one — "this dashboard has no trend and the request was about a trend" — and grounds
 * its output against the catalog afterwards. Same division here: rules for what is checkable, the model
 * for what needs reading.
 *
 * Every finding either carries a `fix` — an edit from the one union, applied through the one path, in
 * one undo step — or is honest that only the author can decide. A suggestion with an automatic fix that
 * guesses is worse than a suggestion without one.
 */

import { labelOf, linksOf, structureOf, type PageDef } from '../model';
import type { CanvasEdit } from './decisions';

export type Severity = 'issue' | 'polish';

export interface Finding {
  id: string;
  severity: Severity;
  /** The page this is about — a review covers the whole design, not just the open page. */
  pageId: string;
  widgetId?: string;
  /** A few words, for the list. */
  title: string;
  /** A sentence, in the author's language. Says what is wrong *and why it matters*. */
  detail: string;
  /** The change that resolves it, when one can be decided without guessing. */
  fix?: CanvasEdit;
}

/** Titles the palette hands out. A page still wearing them has not been finished. */
const PLACEHOLDERS = new Set([
  'Section heading',
  'Metric',
  'Data table',
  'Securities',
  'Section',
  'Continue',
  'Image',
  'Trend',
  'Volume',
  'Coverage',
  'Records by asset type',
  'Files loaded',
  'Data readiness',
  'Add a short description of what this page shows.',
]);

/**
 * Review the whole design.
 *
 * The whole design rather than the open page, because the two findings that matter most — a page
 * nothing links to, and a page with no way out — cannot be seen from inside a single page. That is also
 * why this takes the page list: the flow *is* part of the design.
 */
export function review(pages: readonly PageDef[]): Finding[] {
  const findings: Finding[] = [];
  const links = linksOf(pages);
  const entry = pages[0];

  for (const page of pages) {
    const rows = structureOf(page.widgets);

    if (!page.widgets.length) {
      findings.push({
        id: `${page.id}:empty`,
        severity: 'issue',
        pageId: page.id,
        title: 'Empty page',
        detail: `"${page.name}" has nothing on it. Describe what it should show, or delete it — a page in the strip that opens onto nothing reads as broken to whoever you show this to.`,
      });
      continue;
    }

    if (!page.widgets.some((widget) => widget.type === 'heading')) {
      findings.push({
        id: `${page.id}:no-heading`,
        severity: 'polish',
        pageId: page.id,
        title: 'No heading',
        detail: `"${page.name}" does not say what it is. The tab strip names it, but a reader who lands on the page itself has nothing to go on.`,
        fix: {
          op: 'add',
          kind: 'heading',
          title: page.name,
          why: `Names "${page.name}" on the page itself.`,
        },
      });
    }

    // Overlaps. One finding per page rather than per pair: the fix is the same tidy either way, and
    // four findings that share one button is a list that punishes reading it.
    const overlapping = rows.filter((row) => row.stacked);
    if (overlapping.length) {
      const names = overlapping.slice(0, 3).map((row) => labelOf(row.widget));
      findings.push({
        id: `${page.id}:overlap`,
        severity: 'issue',
        pageId: page.id,
        widgetId: overlapping[0]!.widget.id,
        title: `${overlapping.length} widgets overlap`,
        detail: `On "${page.name}", ${names.join(', ')}${overlapping.length > 3 ? ' and others' : ''} sit on top of each other. Whichever is painted last hides the rest, and a reader cannot tell there is anything underneath.`,
        fix: { op: 'tidy', pageId: page.id, why: 'Closes gaps and separates overlapping widgets.' },
      });
    }

    // Buttons that go nowhere.
    for (const widget of page.widgets) {
      if (widget.type !== 'button') continue;
      const target = widget.props['target'];
      if (typeof target === 'string' && target && pages.some((other) => other.id === target)) {
        continue;
      }
      const elsewhere = pages.filter((other) => other.id !== page.id);
      findings.push({
        id: `${page.id}:${widget.id}:dead-button`,
        severity: 'issue',
        pageId: page.id,
        widgetId: widget.id,
        title: `"${labelOf(widget)}" goes nowhere`,
        detail:
          elsewhere.length === 1
            ? `The button does nothing when clicked. "${elsewhere[0]!.name}" is the only other page, so that is almost certainly where it should go.`
            : `The button does nothing when clicked. Only you know which of the ${elsewhere.length} other pages it should open — set it in the inspector or draw the link on the Flow map.`,
        fix:
          elsewhere.length === 1
            ? {
                op: 'set-prop',
                widgetId: widget.id,
                key: 'target',
                value: elsewhere[0]!.id,
                why: `Points "${labelOf(widget)}" at "${elsewhere[0]!.name}".`,
              }
            : undefined,
      });
    }

    // Placeholder titles.
    const stale = page.widgets.filter((widget) => PLACEHOLDERS.has(labelOf(widget)));
    if (stale.length >= 2) {
      findings.push({
        id: `${page.id}:placeholders`,
        severity: 'polish',
        pageId: page.id,
        widgetId: stale[0]!.id,
        title: `${stale.length} placeholder titles`,
        detail: `On "${page.name}", ${stale.length} widgets still carry the names the palette gave them — ${stale
          .slice(0, 3)
          .map((widget) => `"${labelOf(widget)}"`)
          .join(', ')}. Tell me what this page is for and I will rename them, or edit them in the inspector.`,
      });
    }

    // Two widgets saying the same thing.
    const seen = new Map<string, number>();
    for (const widget of page.widgets) {
      const label = labelOf(widget);
      seen.set(label, (seen.get(label) ?? 0) + 1);
    }
    for (const [label, count] of seen) {
      if (count < 2 || PLACEHOLDERS.has(label)) continue;
      findings.push({
        id: `${page.id}:dup:${label}`,
        severity: 'polish',
        pageId: page.id,
        title: `Two widgets called "${label}"`,
        detail: `"${page.name}" has ${count} widgets with the same name. A reader cannot tell them apart, and neither can the structure panel.`,
      });
    }

    // A page with no way out.
    if (pages.length > 1 && !links.some((link) => link.from === page.id)) {
      const inbound = links.find((link) => link.to === page.id);
      findings.push({
        id: `${page.id}:dead-end`,
        severity: 'polish',
        pageId: page.id,
        title: 'No way out',
        detail: inbound
          ? `"${page.name}" has no navigation off it. A reader who arrives from "${nameOf(pages, inbound.from)}" has to use the browser's back button.`
          : `"${page.name}" has no navigation off it, so a reader who reaches it is stuck.`,
        fix: inbound
          ? {
              op: 'link',
              pageId: page.id,
              targetPageId: inbound.from,
              label: `Back to ${nameOf(pages, inbound.from)}`,
              why: `Gives "${page.name}" a way back to where readers come from.`,
            }
          : undefined,
      });
    }
  }

  // Pages nothing reaches. The first page is the way in, so it is exempt by definition.
  for (const page of pages) {
    if (!entry || page.id === entry.id) continue;
    if (links.some((link) => link.to === page.id && link.from !== page.id)) continue;
    findings.push({
      id: `${page.id}:unreachable`,
      severity: 'issue',
      pageId: page.id,
      title: `"${page.name}" cannot be reached`,
      detail: `No page navigates to "${page.name}", so nobody using this experience will ever see it. It exists only in the builder's tab strip.`,
      fix: {
        op: 'link',
        pageId: entry.id,
        targetPageId: page.id,
        label: page.name,
        why: `Adds a button on "${entry.name}" that opens "${page.name}".`,
      },
    });
  }

  // Issues first, then polish, so the list reads worst-first without needing to be sorted by eye.
  return findings.sort((a, b) => (a.severity === b.severity ? 0 : a.severity === 'issue' ? -1 : 1));
}

function nameOf(pages: readonly PageDef[], id: string): string {
  return pages.find((page) => page.id === id)?.name ?? id;
}
