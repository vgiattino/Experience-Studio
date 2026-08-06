/**
 * The stand-in provider: this feature works with no model configured.
 *
 * ── WHY A STAND-IN IS A FEATURE AND NOT A MOCK ─────────────────────────────────────────
 * `libs/generation/src/simulated-provider.ts` makes the argument and this follows it: a stand-in that
 * *reasons over the same inputs a model would receive* is worth having permanently. It keeps the screen
 * usable with no endpoint, no key and no egress; it makes every test deterministic; and because it is
 * held to the same schema through the same port, swapping in a real model changes nothing above it.
 *
 * What it is not is canned. Change the prompt and the plan changes; change the palette and its
 * vocabulary changes with it. It reads the concepts `intake()` extracted — the same extraction a real
 * provider's prompt is built from — and decides which widgets answer the request.
 *
 * ── WHERE IT IS WEAKER THAN A MODEL, SAID PLAINLY ──────────────────────────────────────
 * It matches phrases. It will not understand "the thing we discussed on Tuesday", it cannot infer that
 * "settlement fails" implies a status breakdown, and its titles are the author's own words rearranged
 * rather than better words. A real model does all three. The panel names the provider on screen for
 * exactly this reason: an author should know which one answered.
 */

import {
  ModelProviderError,
  type ExtractedConcepts,
  type ModelProvider,
  type ModelRequest,
  type ModelResponse,
} from '@opus/generation';

import { ACCENTS, labelOf, type PageDef, type Widget } from '../model';
import { bandOf } from './assemble';
import { CHART_KINDS, type Band, type CanvasEdit, type CanvasPlan, type PlannedWidget } from './decisions';

export interface CanvasDecisionInputs {
  prompt: string;
  concepts: ExtractedConcepts;
  pages: readonly PageDef[];
  pageId: string;
  /** The selected widget, when there is one. An instruction usually means "this". */
  selected: Widget | null;
}

/** Chart words an author actually types, mapped to the kinds this builder draws. */
const CHART_WORDS: readonly (readonly [RegExp, string])[] = [
  [/\bdonuts?\b/i, 'donut'],
  [/\bpie\b/i, 'pie'],
  [/\b(bar)\b/i, 'bar'],
  [/\b(line|trend|over time|trending)\b/i, 'line'],
  [/\b(area|volume)\b/i, 'area'],
  [/\b(column|bars?|histogram)\b/i, 'column'],
];

/**
 * The words that describe a chart's *shape*, with the time words removed.
 *
 * "Late files by source with a weekly trend" asks for two charts: a breakdown and a trend. Deciding the
 * breakdown's shape from the whole prompt made it a line chart too, because "trend" was in the sentence
 * — and a line chart of four sources is a wrong picture, not a stylistic difference. The trend widget
 * asks for a line explicitly; everything else picks its shape from these.
 */
const SHAPE_WORDS: readonly (readonly [RegExp, string])[] = [
  [/\bdonuts?\b/i, 'donut'],
  [/\bpie\b/i, 'pie'],
  [/\bbar\b/i, 'bar'],
  [/\barea\b/i, 'area'],
  [/\b(column|histogram)\b/i, 'column'],
];

const COLOUR_WORDS: readonly (readonly [RegExp, string])[] = [
  [/\b(magenta|pink|brand)\b/i, ACCENTS[0]],
  [/\b(indigo|purple|violet)\b/i, ACCENTS[1]],
  [/\b(teal|cyan)\b/i, ACCENTS[2]],
  [/\b(green|good|healthy)\b/i, ACCENTS[3]],
  [/\b(amber|orange|warning)\b/i, ACCENTS[4]],
  [/\b(red|bad|critical)\b/i, ACCENTS[5]],
];

export class CanvasStandIn implements ModelProvider {
  readonly id = 'canvas-stand-in';
  readonly version = '1.0.0';
  /** Nothing leaves the browser, which is why no egress policy applies to it. */
  readonly isExternal = false;

  private inputs: CanvasDecisionInputs | null = null;

  useDecisionInputs(inputs: unknown): void {
    this.inputs = inputs as CanvasDecisionInputs;
  }

  async complete(request: ModelRequest): Promise<ModelResponse> {
    const inputs = this.inputs;
    if (!inputs) {
      throw new ModelProviderError('The stand-in was not given the request context', false, request.purpose);
    }

    const output =
      request.purpose === 'plan' ? this.plan(inputs) : { summary: '', edits: this.edits(inputs) };

    return {
      output,
      modelId: this.id,
      modelVersion: this.version,
      // Honest, not fabricated: the prompt and the answer, measured. A real provider reports the
      // model's own accounting and these numbers are what they cost to produce here — nothing.
      tokensIn: Math.ceil((request.system.length + request.user.length) / 4),
      tokensOut: Math.ceil(JSON.stringify(output).length / 4),
      durationMs: 0,
      note: 'Answered in the browser by the rules stand-in, not by a model.',
    };
  }

  // ── plan a whole page ───────────────────────────────────────────────────────────────

  private plan(inputs: CanvasDecisionInputs): CanvasPlan {
    const { prompt, concepts } = inputs;
    const subject = subjectOf(prompt, concepts);
    const widgets: PlannedWidget[] = [];
    const add = (
      id: string,
      kind: string,
      title: string,
      purpose: string,
      extra: Partial<PlannedWidget> = {},
    ): void => {
      widgets.push({ id, kind, title, purpose, band: bandOf(kind), ...extra });
    };

    add('title', 'heading', subject.title, 'Names the page.');

    // Filters first, because a page with a filter row reads as a tool and one without reads as a
    // report — and "for the ops team to check daily" is a tool.
    if (/\b(filter|by date|as.of|search|look ?up|find)\b/i.test(prompt)) {
      add('as-of', 'date', 'As-of date', 'Lets the reader choose the day being looked at.');
      if (subject.dimension) {
        add('scope', 'dropdown', titleCase(subject.dimension), `Narrows the page to one ${subject.dimension}.`, {
          band: 'detail',
        });
      }
    }

    // Metrics. Three is the row width, and three is also as many as a reader takes in at a glance.
    const metrics = metricTitles(subject, concepts);
    metrics.forEach((title, index) => {
      add(`kpi-${index + 1}`, 'kpi', title, `The headline figure for ${title.toLowerCase()}.`);
    });

    // A breakdown, when the request asks "by" something.
    if (subject.dimension) {
      const kind = chartKindFor(prompt, 'column');
      add(
        'breakdown',
        kind,
        `${subject.noun} by ${subject.dimension}`,
        `Shows where the ${subject.noun.toLowerCase()} are concentrated.`,
      );
    }

    // A trend, when the request mentions time.
    if (concepts.temporalHints.length || /\b(trend|over time|daily|weekly|monthly|history)\b/i.test(prompt)) {
      add('trend', 'line', `${subject.noun} over time`, 'Shows whether it is getting better or worse.');
    }

    // A record list, when the request asks for one — or when nothing else would carry the detail.
    if (concepts.listHints.length || /\b(list|table|records?|detail|rows|breakdown of each)\b/i.test(prompt)) {
      add('records', 'table', `${subject.noun} detail`, 'The records behind the figures above.', {
        columns: subject.columns,
      });
    }

    if (/\b(approve|reject|review|remediat|workflow|action)\b/i.test(prompt)) {
      add('decide', 'buttonlist', 'Decision', 'The action a reviewer takes on the selected record.');
    }

    // A page with metrics and nothing else is a page with nowhere to go next.
    if (!widgets.some((widget) => widget.kind === 'table' || widget.kind === 'grid')) {
      if (widgets.length <= 4) {
        add('records', 'table', `${subject.noun} detail`, 'The records behind the figures above.', {
          columns: subject.columns,
        });
      }
    }

    return {
      pageName: subject.title,
      pageSummary: summaryOf(subject, widgets),
      widgets,
    };
  }

  // ── change a page that exists ───────────────────────────────────────────────────────

  /**
   * Read an instruction as edits.
   *
   * Order matters: the most specific readings are tried first, so "make it a bar chart" is a chart
   * change rather than a rename containing the word "bar". An instruction that matches nothing returns
   * nothing, and the service asks a question instead of guessing.
   */
  private edits(inputs: CanvasDecisionInputs): CanvasEdit[] {
    const { prompt, pages, pageId, selected } = inputs;
    const edits: CanvasEdit[] = [];
    const page = pages.find((candidate) => candidate.id === pageId);
    if (!page) return edits;
    const target = selected ? labelOf(selected) : 'the page';

    // Tidy up.
    if (/\b(tidy|clean ?up|align|fix the layout|straighten|sort out the layout)\b/i.test(prompt)) {
      edits.push({ op: 'tidy', pageId, why: 'Closes gaps, removes overlaps and squares up the grid.' });
      return edits;
    }

    // Rename the page.
    const pageName = /\b(?:rename|call) the page (?:to )?["“]?([^"”]+)["”]?/i.exec(prompt);
    if (pageName?.[1]) {
      edits.push({
        op: 'page-name',
        name: clean(pageName[1]),
        why: `Renames the page to "${clean(pageName[1])}".`,
      });
      return edits;
    }

    /*
      Link to another page.

      Several patterns tried in turn, and the first whose capture *resolves to a page* wins — rather
      than the first that matches. "add a button to link to Detail" matches the button pattern first and
      captures "link to Detail", which is not a page; the destination is in the second phrase. Matching
      greedily there produced a Button widget instead of a link, which is a plausible-looking wrong
      answer, and those are the ones an author does not catch.
    */
    const linkPhrases = [
      /\b(?:links?|linking|navigates?|goes|go)\s+to\s+["“]?([^"”.]+)["”]?/i,
      /\b(?:button|link)\s+(?:that\s+)?(?:opens?|shows?)?\s*(?:to\s+)?["“]?([^"”.]+)["”]?/i,
      /\b(?:open|show)\s+(?:the\s+)?["“]?([^"”.]+)["”]?\s+page\b/i,
    ];
    for (const pattern of linkPhrases) {
      const wanted = clean(pattern.exec(prompt)?.[1] ?? '').toLowerCase();
      if (!wanted) continue;
      const match = pages.find(
        (candidate) => candidate.id !== pageId && candidate.name.toLowerCase().includes(wanted),
      );
      if (!match) continue;
      edits.push({
        op: 'link',
        pageId,
        targetPageId: match.id,
        label: match.name,
        why: `Adds a button that opens "${match.name}".`,
      });
      return edits;
    }

    // Change a chart's type.
    if (selected && /\b(make|change|turn|switch|as a)\b/i.test(prompt)) {
      const kind = CHART_WORDS.find(([pattern]) => pattern.test(prompt))?.[1];
      if (kind && CHART_KINDS.includes(kind as (typeof CHART_KINDS)[number])) {
        if (selected.type === 'chart') {
          edits.push({
            op: 'chart-kind',
            widgetId: selected.id,
            kind: kind as (typeof CHART_KINDS)[number],
            why: `Draws ${target} as a ${kind} chart.`,
          });
          return edits;
        }
      }
    }

    // Retitle the selection.
    const retitle =
      /\b(?:call it|rename it to|rename to|title it|label it|name it)\s+["“]?([^"”.]+)["”]?/i.exec(prompt);
    if (selected && retitle?.[1]) {
      edits.push({
        op: 'retitle',
        widgetId: selected.id,
        title: clean(retitle[1]),
        why: `Renames ${target} to "${clean(retitle[1])}".`,
      });
      return edits;
    }

    // Resize the selection.
    if (selected) {
      const resize = sizeChange(prompt, selected);
      if (resize) {
        edits.push({
          op: 'resize',
          widgetId: selected.id,
          w: resize.w,
          h: resize.h,
          why: `Makes ${target} ${resize.words}.`,
        });
        return edits;
      }
    }

    // Recolour the selection.
    if (selected && /\b(colour|color|accent|make it)\b/i.test(prompt)) {
      const accent = COLOUR_WORDS.find(([pattern]) => pattern.test(prompt))?.[1];
      if (accent && (selected.type === 'kpi' || selected.type === 'chart')) {
        edits.push({
          op: 'set-prop',
          widgetId: selected.id,
          key: 'accent',
          value: accent,
          why: `Recolours ${target}.`,
        });
        return edits;
      }
    }

    // Remove the selection.
    if (selected && /\b(remove|delete|get rid of|take out)\b/i.test(prompt)) {
      edits.push({ op: 'remove', widgetId: selected.id, why: `Removes ${target}.` });
      return edits;
    }

    // Add something.
    const wanted = wantedWidget(prompt);
    if (wanted) {
      const named = /\b(?:called|titled|named|for|showing)\s+["“]?([^"”.]+)["”]?/i.exec(prompt);
      const title = named?.[1] ? clean(named[1]) : titleCase(wanted.label);
      edits.push({
        op: 'add',
        kind: wanted.kind,
        title,
        band: bandOf(wanted.kind) as Band,
        why: `Adds a ${wanted.label} called "${title}".`,
      });
      return edits;
    }

    return edits;
  }
}

// ── reading the request ────────────────────────────────────────────────────────────────

interface Subject {
  /** The page's title. */
  title: string;
  /** The thing being counted or listed, e.g. "Late files". */
  noun: string;
  /** What it is broken down by, when the request says "by …". */
  dimension?: string;
  columns?: string[];
}

const FRAMING =
  /^(?:please\s+)?(?:can you\s+)?(?:build|create|make|show|give|design|i want|i need|add|generate)\s+(?:me\s+)?(?:a|an|the)?\s*/i;
const TRAILING = /\b(?:page|dashboard|screen|view|report|experience)\b/gi;

/**
 * What the request is *about*, from the author's own words.
 *
 * The framing is stripped for the same reason `intake` strips it before retrieval: "can you build me a
 * dashboard that shows…" is six words of politeness in front of the subject, and a title built from the
 * raw prompt reads like a transcript.
 */
function subjectOf(prompt: string, concepts: ExtractedConcepts): Subject {
  const stripped = prompt.replace(FRAMING, '').trim();
  const byMatch = /\bby\s+([a-z][a-z ]{2,24})/i.exec(stripped);
  const dimension = byMatch?.[1] ? clean(byMatch[1]).toLowerCase() : undefined;

  let noun = stripped
    .replace(/\bby\s+[a-z][a-z ]{2,24}/i, '')
    .replace(TRAILING, '')
    .replace(/\b(?:with|showing|that shows|over time|and)\b.*$/i, '')
    .replace(/[^a-z0-9 &/-]/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim();

  /*
    Strip what removing the noun left behind, and keep stripping.

    "A dashboard of late file loads" loses "dashboard" and leaves "A of late file loads" — two words of
    debris, not one, so a single pass produced the page title "A of Late File Loads". The loop is bounded
    because the alternative is a regex that has to anticipate every combination.
  */
  for (let pass = 0; pass < 3; pass++) {
    const shorter = noun.replace(/^(?:a|an|the|of|for|about|on|showing|to)\s+/i, '').trim();
    if (shorter === noun) break;
    noun = shorter;
  }

  if (noun.length < 3) noun = concepts.terms.slice(0, 3).join(' ') || 'Records';
  noun = titleWords(noun.split(' ').slice(0, 5).join(' '));

  const title = dimension ? `${noun} by ${titleWords(dimension)}` : noun;
  return { title, noun, dimension, columns: columnsFor(noun, dimension) };
}

/**
 * Column headings for a table.
 *
 * Names, not data: the subject, the dimension the request mentioned, and the two attributes every
 * record in this domain has. Anything more specific would be invention.
 */
function columnsFor(noun: string, dimension?: string): string[] {
  const columns = [singular(noun)];
  if (dimension) columns.push(titleCase(dimension));
  columns.push('Status', 'Updated');
  return columns;
}

/** Up to three metric titles, from what the request asked to be counted. */
function metricTitles(subject: Subject, concepts: ExtractedConcepts): string[] {
  const titles: string[] = [`Total ${subject.noun.toLowerCase()}`];
  if (concepts.measureHints.some((hint) => /coverage|complete|quality|health/.test(hint))) {
    titles.push('Coverage');
  }
  if (concepts.measureHints.some((hint) => /exception|fail|late|break|error|issue/.test(hint))) {
    titles.push('Exceptions');
  }
  if (titles.length === 1) titles.push('Complete', 'Outstanding');
  return titles.slice(0, 3);
}

function summaryOf(subject: Subject, widgets: readonly PlannedWidget[]): string {
  const counts = new Map<string, number>();
  for (const widget of widgets) {
    if (widget.kind === 'heading') continue;
    const label = groupLabel(widget.kind);
    counts.set(label, (counts.get(label) ?? 0) + 1);
  }
  const parts = [...counts].map(([label, count]) => `${count} ${label}${count > 1 ? 's' : ''}`);
  return `A page about ${subject.noun.toLowerCase()} with ${listWords(parts)}. Figures read "—" and chart values are sample shapes: this builder has no data binding yet, so nothing here is a real number.`;
}

function groupLabel(kind: string): string {
  if (kind === 'kpi') return 'metric';
  if (['column', 'bar', 'line', 'area', 'pie', 'donut'].includes(kind)) return 'chart';
  if (kind === 'table' || kind === 'grid') return 'table';
  if (kind === 'button' || kind === 'buttonlist') return 'action';
  return 'control';
}

function listWords(parts: readonly string[]): string {
  if (parts.length <= 1) return parts[0] ?? 'nothing';
  return `${parts.slice(0, -1).join(', ')} and ${parts[parts.length - 1]}`;
}

/** Which palette entry an "add …" instruction is asking for. */
function wantedWidget(prompt: string): { kind: string; label: string } | null {
  const table: readonly (readonly [RegExp, string, string])[] = [
    [/\b(kpi|metric|figure|number|count)\b/i, 'kpi', 'metric'],
    [/\b(donut)\b/i, 'donut', 'donut chart'],
    [/\bpie\b/i, 'pie', 'pie chart'],
    [/\bbar chart\b/i, 'bar', 'bar chart'],
    [/\b(line chart|trend)\b/i, 'line', 'line chart'],
    [/\barea chart\b/i, 'area', 'area chart'],
    [/\b(column chart|chart|graph)\b/i, 'column', 'column chart'],
    [/\b(data ?grid)\b/i, 'grid', 'data grid'],
    [/\b(table|list of records)\b/i, 'table', 'table'],
    [/\bgauge\b/i, 'gauge', 'gauge'],
    [/\bprogress\b/i, 'progress', 'progress bar'],
    [/\b(heading|title)\b/i, 'heading', 'heading'],
    [/\b(paragraph|text|description|note)\b/i, 'text', 'text block'],
    [/\b(divider|separator|rule)\b/i, 'divider', 'divider'],
    [/\b(image|picture|logo)\b/i, 'image', 'image'],
    [/\b(dropdown|picker|select)\b/i, 'dropdown', 'dropdown'],
    [/\b(date|as.of)\b/i, 'date', 'date picker'],
    [/\b(radio|option group)\b/i, 'radio', 'radio group'],
    [/\b(segment|toggle)\b/i, 'segment', 'segmented control'],
    [/\b(checkbox|tick ?box)\b/i, 'checkbox', 'checkbox'],
    [/\b(search box|text input|input|field)\b/i, 'textinput', 'text input'],
    [/\b(section|group|panel|box)\b/i, 'section', 'section'],
    [/\b(button|link)\b/i, 'button', 'button'],
  ];
  if (!/\b(add|insert|put|include|need|want)\b/i.test(prompt)) return null;
  for (const [pattern, kind, label] of table) {
    if (pattern.test(prompt)) return { kind, label };
  }
  return null;
}

/** A relative size instruction, read against the widget's current size. */
function sizeChange(prompt: string, widget: Widget): { w: number; h: number; words: string } | null {
  if (/\bfull ?width\b/i.test(prompt)) return { w: 12, h: widget.h, words: 'the full width' };
  if (/\bhalf ?width\b/i.test(prompt)) return { w: 6, h: widget.h, words: 'half the width' };
  if (/\b(wider|bigger|larger)\b/i.test(prompt)) {
    return { w: Math.min(12, widget.w + 2), h: widget.h, words: 'wider' };
  }
  if (/\b(narrower|smaller|thinner)\b/i.test(prompt)) {
    return { w: Math.max(1, widget.w - 2), h: widget.h, words: 'narrower' };
  }
  if (/\btaller\b/i.test(prompt)) return { w: widget.w, h: widget.h + 2, words: 'taller' };
  if (/\b(shorter|flatter)\b/i.test(prompt)) {
    return { w: widget.w, h: Math.max(1, widget.h - 2), words: 'shorter' };
  }
  return null;
}

function chartKindFor(prompt: string, fallback: string): string {
  return SHAPE_WORDS.find(([pattern]) => pattern.test(prompt))?.[1] ?? fallback;
}

function clean(value: string): string {
  return value.replace(/\s+/g, ' ').replace(/[.,;:]+$/, '').trim();
}

function titleCase(value: string): string {
  const trimmed = clean(value);
  return trimmed ? trimmed[0]!.toUpperCase() + trimmed.slice(1) : trimmed;
}

/** Words that stay lowercase inside a title, so it reads as a title and not as a shout. */
const SMALL = new Set(['by', 'of', 'and', 'the', 'for', 'in', 'to', 'vs', 'per', 'a', 'an', 'on']);

/** Title case for a page name: every word capitalised except the small ones, and never the first. */
function titleWords(value: string): string {
  const words = clean(value).split(' ').filter(Boolean);
  return words
    .map((word, index) =>
      index > 0 && SMALL.has(word.toLowerCase()) ? word.toLowerCase() : titleCase(word),
    )
    .join(' ');
}

function singular(value: string): string {
  return value.endsWith('s') ? value.slice(0, -1) : value;
}
