/**
 * Conversational refinement — the PRD's central capability (§10 · §11 · §12 · §15, FR-08 · FR-10 ·
 * FR-11 · FR-12).
 *
 * ── WHAT THIS IS, AND WHAT ASSIST ALREADY WAS ────────────────────────────────
 *
 * `assist.ts` answers *"what is this page missing?"* and proposes **additions from the catalog**. That
 * is a real capability and it is not this one. Every worked prompt in the PRD is a *change to what is
 * already there*:
 *
 *     "Change the pie chart to a bar chart."          §11
 *     "Move this chart above the grid."               §11
 *     "Remove the security type column."              §12
 *     "Group the grid by issuer."                     §12
 *     "Highlight securities with unresolved exceptions." §12
 *     "Move the exceptions panel to the top."         §15
 *
 * None of those adds anything. Assist could not express one of them, which is why FR-08 was the
 * largest gap in the reconciliation despite the model supporting every one of these edits already.
 *
 * ── THE INSIGHT THAT MADE THIS SMALL ────────────────────────────────────────
 *
 * `libs/studio-core/src/commands.ts` already has every mutation these verbs need — `moveNode`,
 * `setComponentConfig`, `setBindingField`, `setValue`, `setPageProperty`. A person can already do all
 * of it by hand in the builder. So refinement is **not new mutation machinery**; it is two things the
 * codebase did not have:
 *
 *   1. a closed vocabulary of *what may be asked for*, and
 *   2. **reference resolution** — turning "the pie chart" into a component id.
 *
 * The second is the hard half, and it is where the discipline lives.
 *
 * ── A REFERENCE THAT DOES NOT DISCRIMINATE PRODUCES A QUESTION ──────────────
 *
 * The same rule product identification uses, for the same reason. "Change the chart to a bar chart"
 * on a page with three charts has not said which. Picking the first one is a wrong answer produced
 * quietly, and the author may not notice until the page is in front of somebody. So the resolver
 * scores a reference against every widget and asks when the top two are close.
 *
 * ── NOTHING HERE MUTATES ANYTHING ───────────────────────────────────────────
 *
 * Mined from the parked builder's `ai/ai.service.ts`, whose rule this keeps verbatim: *a proposal is
 * not an action*. This module returns resolved refinements and a sentence describing them; the caller
 * turns them into commands and the author accepts or discards. §19's explainability is that same idea
 * with the PRD's name on it.
 *
 * ── AND IT IS RULES, WORKING WITHOUT A PROVIDER ─────────────────────────────
 *
 * `interpret()` is deterministic, for the reason `assist.ts` gives about its analyser: an authoring
 * aid that stops working when the model endpoint is down is an authoring aid nobody relies on. A
 * provider, when installed, is held to `REFINE_RESPONSE_SCHEMA` and emits the same `RefinementIntent`
 * the rules do — so the resolution, grounding and explanation below are shared, and the model's only
 * job is the part rules are bad at: reading a sentence.
 */

import type { ComponentManifest, PageDefinition } from '@opus/contracts';

// ── 1. the vocabulary ───────────────────────────────────────────────────────

/**
 * What may be asked for. Closed, and closed deliberately: a verb that is not here cannot be
 * requested, which is what stops a refinement from producing markup, an expression, or a component
 * type outside the registry — the same argument `assist.ts` makes about its proposal vocabulary.
 *
 * Every verb maps onto commands that already exist. The mapping is the caller's, and it is one or two
 * commands each.
 */
export type RefinementVerb =
  /** FR-10 — the grid verbs of §12. */
  | 'add-column'
  | 'remove-column'
  | 'sort-rows'
  | 'group-rows'
  | 'highlight-rows'
  /** FR-11 — the visualisation verbs of §11. */
  | 'change-chart-type'
  /** §11, §15 — placement. */
  | 'move-widget'
  /** FR-12 — navigation. */
  | 'set-drilldown'
  /** Housekeeping the PRD's examples imply. */
  | 'retitle-widget';

/** Where a widget should end up. A band, not coordinates — §11 and §15 both speak in these terms. */
export type MovePosition = 'top' | 'bottom' | 'before' | 'after';

/**
 * One thing the user asked for, before anything has been resolved.
 *
 * `target` and `field` are the user's own words. Resolving them is `resolve()`'s job, and keeping them
 * loose here is what lets the rules and a model emit the same shape.
 */
export interface RefinementIntent {
  verb: RefinementVerb;
  /** How the user referred to the widget: "the pie chart", "the exceptions panel", "the grid". */
  target?: string;
  /** How the user referred to a field: "issuer", "currency", "exception count". */
  field?: string;
  /** For `change-chart-type`, as the user said it — "bar", "pie", "area". */
  chartType?: string;
  direction?: 'ascending' | 'descending';
  position?: MovePosition;
  /** For `move-widget` with `before`/`after`, and for `set-drilldown`. */
  relativeTo?: string;
  /** For `retitle-widget`, and for `set-drilldown`'s destination page. */
  value?: string;
}

/** A refinement with every reference resolved to something the page actually contains. */
export interface ResolvedRefinement {
  verb: RefinementVerb;
  /** The component this acts on. Absent only for page-level verbs. */
  componentId?: string;
  /** The layout node, for `move-widget` — which reorders nodes, not components. */
  nodeId?: string;
  /** The resolved field name, exactly as the data source spells it. */
  field?: string;
  chartType?: string;
  direction?: 'ascending' | 'descending';
  position?: MovePosition;
  relativeToComponentId?: string;
  value?: string;
  /** One sentence, in §19's register, describing what this does. */
  explanation: string;
}

export type RefineOutcome =
  | { outcome: 'resolved'; refinements: ResolvedRefinement[]; explanation: string }
  /**
   * A reference matched more than one thing. FR-08's equivalent of FR-3's ask-rather-than-guess.
   *
   * `on` names the FIELD OF THE INTENT that was ambiguous, so answering is `{ ...intent, [on]: label }`
   * and nothing has to be re-parsed. It is not decoration: a sentence carries up to three references —
   * "move the chart above the grid" has a target and an anchor — and a caller that had to guess which
   * one the question was about would guess wrong. Re-parsing instead is worse still: appending the
   * chosen name to the sentence turns "Sort by name" into "Sort by name — Securities", whose field
   * capture is then "name — Securities".
   */
  | {
      outcome: 'ambiguous';
      on: 'target' | 'field' | 'relativeTo';
      question: string;
      candidates: { componentId: string; label: string }[];
    }
  /** Understood, and cannot be done. The reason is always specific about what IS available. */
  | { outcome: 'refused'; reason: string }
  /** Not understood as a refinement at all. */
  | { outcome: 'notUnderstood'; reason: string };

// ── 2. the page as the resolver sees it ─────────────────────────────────────

export interface RefineWidget {
  componentId: string;
  /**
   * The LAYOUT NODE that places this component, which is a different id.
   *
   * `{ kind: 'widget', id: 'w-recent-table', component: 'recent-table' }` — the node is `w-recent-table`
   * and the component is `recent-table`, and `moveNode` operates on the node. Carrying only the
   * component id made every move refuse, on real pages, while a fixture that had conflated the two
   * passed. Both are here so neither caller has to guess.
   */
  nodeId?: string;
  type: string;
  title: string;
  /** The container holding it, and its index there — what `move-widget` needs. */
  parentId?: string;
  index?: number;
  /** The data source id, and the fields it makes available. */
  dataSource?: string;
  availableFields: readonly string[];
  /** Fields currently shown as columns, in order. Empty for a widget with no column role. */
  columns: readonly string[];
  /**
   * The binding role those columns live under — `columns` on a table, and whatever a future component
   * calls its repeated role.
   *
   * Carried so the applier does not have to re-derive it from the definition. Re-deriving would mean
   * two places deciding which binding is "the columns", and the second one would eventually disagree.
   */
  columnRole?: string;
  /**
   * Fields that hold numbers, from the data source's `select.measures`.
   *
   * Needed by `highlight-rows`: a condition on a count is `> 0` and a condition on a status is a
   * comparison to a value nobody has supplied. Knowing which is which is the difference between a
   * sensible default and a guess.
   */
  numericFields: readonly string[];
  /** The component's current config, for verbs that set a property. */
  config: Readonly<Record<string, unknown>>;
  /** Property names the manifest declares, so a verb cannot set one the component does not have. */
  configProperties: readonly string[];
  /** Allowed values for an enum config property, keyed by property. */
  configEnums: Readonly<Record<string, readonly string[]>>;
}

export interface RefinePageView {
  pageId: string;
  title: string;
  widgets: readonly RefineWidget[];
  /** Page ids in the same experience, for `set-drilldown`. */
  siblingPages: readonly string[];
}

/**
 * Build the resolver's view from a page definition and the manifests of the components on it.
 *
 * The manifests are passed in rather than imported, so this stays free of the Angular component
 * registry — the server validates refinements too, and `validate-experience.ts` already reads
 * manifests as JSON for the same reason.
 */
export function pageViewFor(
  definition: PageDefinition,
  manifests: readonly ComponentManifest[],
  options: { siblingPages?: readonly string[]; fieldsForDataSource?: (id: string) => readonly string[] } = {},
): RefinePageView {
  const byType = new Map(manifests.map((m) => [m.type, m]));
  const placement = placementIndex(definition);

  const widgets: RefineWidget[] = Object.entries(definition.components ?? {}).map(([componentId, component]) => {
    const manifest = byType.get(component.type);
    const properties = (manifest?.properties as { properties?: Record<string, { enum?: string[] }> } | undefined)
      ?.properties;
    const configEnums: Record<string, readonly string[]> = {};
    for (const [name, schema] of Object.entries(properties ?? {})) {
      if (Array.isArray(schema?.enum)) configEnums[name] = schema.enum;
    }

    const bindings = (component as { bindings?: Record<string, unknown> }).bindings ?? {};
    const columnRole = Object.entries(bindings).find(([, value]) => Array.isArray(value));
    const columns = Array.isArray(columnRole?.[1])
      ? (columnRole[1] as { field?: string }[]).map((c) => c.field).filter((f): f is string => !!f)
      : [];

    const dataSource = (component as { dataSource?: string }).dataSource;
    const placed = placement.get(componentId);
    return {
      componentId,
      nodeId: placed?.nodeId,
      columnRole: columnRole?.[0],
      numericFields: dataSource ? measuresOf(definition, dataSource) : [],
      type: component.type,
      title: text(component.title) || text(manifest?.name) || component.type,
      parentId: placed?.parentId,
      index: placed?.index,
      dataSource,
      availableFields: dataSource ? (options.fieldsForDataSource?.(dataSource) ?? fieldsOf(definition, dataSource)) : [],
      columns,
      config: (component as { config?: Record<string, unknown> }).config ?? {},
      configProperties: Object.keys(properties ?? {}),
      configEnums,
    };
  });

  return {
    pageId: definition.id,
    title: text(definition.name) || definition.id,
    widgets,
    siblingPages: options.siblingPages ?? [],
  };
}

function text(value: unknown): string {
  if (typeof value === 'string') return value;
  if (value && typeof value === 'object' && 'default' in value) {
    return String((value as { default: string }).default ?? '');
  }
  return '';
}

/**
 * The fields a data source exposes, read from its own `select`.
 *
 * A fallback for callers with no catalog to hand. It reports what the page already *selects*, which is
 * enough for `remove-column` and `sort-rows` and deliberately not enough for `add-column` — you cannot
 * add a column for a field nobody selected. `fieldsForDataSource` is how a caller with the catalog
 * supplies the wider set, and grounding then refuses an unavailable field by name.
 */
/** The numeric fields a data source selects — its measures, by alias where one is given. */
function measuresOf(definition: PageDefinition, dataSourceId: string): string[] {
  const source = (definition.dataSources as Record<string, unknown> | undefined)?.[dataSourceId] as
    | { select?: { measures?: { measure?: string; alias?: string }[] } }
    | undefined;
  return (source?.select?.measures ?? [])
    .map((m) => m.alias ?? m.measure)
    .filter((f): f is string => !!f);
}

function fieldsOf(definition: PageDefinition, dataSourceId: string): string[] {
  const source = (definition.dataSources as Record<string, unknown> | undefined)?.[dataSourceId] as
    | { select?: { attributes?: { attribute?: string; alias?: string }[]; measures?: { measure?: string; alias?: string }[] } }
    | undefined;
  const fields: string[] = [];
  for (const attribute of source?.select?.attributes ?? []) {
    if (attribute.alias) fields.push(attribute.alias);
    else if (attribute.attribute) fields.push(attribute.attribute);
  }
  for (const measure of source?.select?.measures ?? []) {
    if (measure.alias) fields.push(measure.alias);
    else if (measure.measure) fields.push(measure.measure);
  }
  return fields;
}

/**
 * Where each widget sits: its layout node, its parent container and its index in that container.
 *
 * Keyed by COMPONENT id and carrying the NODE id, because callers arrive with one and `moveNode` needs
 * the other. A widget node is `{ kind: 'widget', id, component }` — the contract's field is `component`,
 * not `componentId`, and reading the wrong one made every move on every real page refuse with "not
 * inside a container that can be reordered" while a fixture that had conflated them passed.
 */
function placementIndex(
  definition: PageDefinition,
): Map<string, { nodeId: string; parentId: string; index: number }> {
  const index = new Map<string, { nodeId: string; parentId: string; index: number }>();
  const walk = (node: unknown): void => {
    if (!node || typeof node !== 'object') return;
    const candidate = node as { kind?: string; id?: string; container?: Record<string, unknown> };
    if (candidate.kind !== 'container' || !candidate.id) return;
    for (const value of Object.values(candidate.container ?? {})) {
      if (!Array.isArray(value)) continue;
      value.forEach((child, position) => {
        const c = child as { kind?: string; component?: string; id?: string };
        if (c?.kind === 'widget' && c.component && c.id) {
          index.set(c.component, { nodeId: c.id, parentId: candidate.id!, index: position });
        }
        walk(child);
      });
    }
  };
  walk((definition as { layout?: unknown }).layout);
  return index;
}

// ── 3. reference resolution ─────────────────────────────────────────────────

/**
 * Words that name a *kind* of widget rather than a particular one.
 *
 * Derived from the component type rather than hard-coded per component, so a new component is
 * referable the day its manifest lands. The type's namespace and its local name are both signals:
 * `data.table` is matched by "table", `business.exception-queue` by "exception" and by "queue".
 */
function typeWords(type: string): string[] {
  return type
    .split(/[.\-_]/)
    .map((part) => part.toLowerCase())
    .filter((part) => part.length > 2 && part !== 'analytics' && part !== 'business' && part !== 'input');
}

/** Synonyms a person uses for a kind of widget that its type name does not contain. */
const KIND_SYNONYMS: Readonly<Record<string, readonly string[]>> = {
  'data.table': ['grid', 'list', 'rows'],
  'analytics.chart': ['graph', 'visualisation', 'visualization', 'plot'],
  'analytics.kpi-card': ['figure', 'metric', 'number', 'tile', 'card'],
  'input.filter-bar': ['filters', 'filter'],
  'business.exception-queue': ['exceptions', 'panel', 'backlog', 'work'],
  'content.text': ['note', 'prose', 'heading'],
};

const STOP_WORDS = new Set([
  'the', 'a', 'an', 'this', 'that', 'my', 'our', 'to', 'of', 'on', 'in', 'for', 'and', 'with', 'it',
  'please', 'above', 'below', 'top', 'bottom', 'up', 'down',
]);

/**
 * Reduce a word to a crude stem, so a plural matches its singular.
 *
 * Prefix matching alone is not enough and the failure is not obvious: `"securities".startsWith("security")`
 * is **false** — they diverge at the y→ies boundary — so "when the user double-clicks a security"
 * matched nothing on a page full of widgets titled "Securities". Stemming both sides fixes it where a
 * prefix cannot.
 *
 * Deliberately crude, and the same three rules the product registry's inflection helper uses. A real
 * stemmer would be a dependency and a source of surprises; every word these rules miss is one an
 * author can work around by naming the widget's own title instead.
 */
function stem(word: string): string {
  if (word.length > 4 && word.endsWith('ies')) return `${word.slice(0, -3)}y`;
  if (word.length > 4 && word.endsWith('es')) return word.slice(0, -2);
  if (word.length > 3 && word.endsWith('s') && !word.endsWith('ss')) return word.slice(0, -1);
  return word;
}

/**
 * Does a word match any in the set, allowing for the plural and for a shortened form?
 *
 * "a security" must match "Securities", "exceptions" must match "exception", and "visualisation" must
 * match "visualization". Stem equality handles the first two; prefix matching, floored at four
 * characters so "id" cannot reach "issuer", handles the third.
 */
function overlaps(word: string, candidates: Iterable<string>): boolean {
  const wordStem = stem(word);
  for (const candidate of candidates) {
    if (candidate === word || stem(candidate) === wordStem) return true;
    if (word.length >= 4 && candidate.length >= 4 && (candidate.startsWith(word) || word.startsWith(candidate))) {
      return true;
    }
  }
  return false;
}

function words(value: string): string[] {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, ' ')
    .split(/\s+/)
    .filter((w) => w.length > 1 && !STOP_WORDS.has(w));
}

export interface ResolutionScore {
  componentId: string;
  score: number;
  matched: string[];
}

/**
 * How close the runner-up may get before the answer is "ask".
 *
 * Tighter than product identification's 0.7, because the cost of asking is lower here: the user is
 * looking at the page and can name the widget in three words. Grounding a refinement in the wrong
 * widget silently rearranges something they were not looking at.
 */
const AMBIGUITY_RATIO = 0.8;

/**
 * Resolve a loose reference to one widget.
 *
 * Scoring, in descending strength:
 *
 *   3  a word from the widget's own title — the most specific thing the user can say
 *   2  a value of the widget's config that the user named ("pie", "bar", "severity")
 *   2  a kind synonym ("grid", "figure", "panel")
 *   1  a word from the component type ("table", "chart", "queue")
 *
 * Title words outrank kind words on purpose. On a page with three charts, "the exceptions chart" must
 * resolve by "exceptions" and not tie on "chart".
 */
export function resolveWidget(
  reference: string,
  page: RefinePageView,
  restrictTo?: (widget: RefineWidget) => boolean,
): { resolved: RefineWidget } | { ambiguous: ResolutionScore[] } | { none: true } {
  const candidates = page.widgets.filter((w) => !restrictTo || restrictTo(w));
  if (candidates.length === 0) return { none: true };

  const asked = words(reference);
  if (asked.length === 0) {
    // No reference at all. One eligible widget is unambiguous; more than one is a question.
    return candidates.length === 1
      ? { resolved: candidates[0]! }
      : { ambiguous: candidates.map((w) => ({ componentId: w.componentId, score: 0, matched: [] })) };
  }

  /*
    A named KIND narrows before anything is scored, and this was a defect before it was a design.

    "Move the securities table to the top" on the shipped Security Master Dashboard resolved to a text
    widget titled "Security master coverage" and a filter bar titled "Find a security" — because a title
    word scores 3 and the kind word "table" only 2, so two irrelevant widgets outranked both actual
    tables. Naming a kind is a constraint, not a hint: "the securities table" means *among the tables*,
    the securities one.

    Only applied when the kind matches something. "the exceptions panel" narrows to the queue; "a
    security" names no kind at all and leaves the field open.
  */
  const kindMatched = candidates.filter((widget) =>
    asked.some((word) => overlaps(word, [...typeWords(widget.type), ...(KIND_SYNONYMS[widget.type] ?? [])])),
  );
  const pool = kindMatched.length > 0 ? kindMatched : candidates;

  const scores: ResolutionScore[] = pool.map((widget) => {
    const matched: string[] = [];
    let score = 0;

    const titleWords = words(widget.title);
    const kindWords = [...typeWords(widget.type), ...(KIND_SYNONYMS[widget.type] ?? [])];
    const configValues = Object.values(widget.config)
      .filter((v): v is string => typeof v === 'string')
      .map((v) => v.toLowerCase());

    for (const word of asked) {
      if (overlaps(word, titleWords)) {
        score += 3;
        matched.push(word);
      } else if (overlaps(word, configValues)) {
        score += 2;
        matched.push(word);
      } else if (overlaps(word, kindWords)) {
        score += 2;
        matched.push(word);
      }
    }
    return { componentId: widget.componentId, score, matched };
  });

  const ranked = [...scores].sort((a, b) => b.score - a.score || a.componentId.localeCompare(b.componentId));
  const top = ranked[0]!;
  if (top.score === 0) return { none: true };

  const runnerUp = ranked[1];
  if (runnerUp && runnerUp.score >= top.score * AMBIGUITY_RATIO) {
    return { ambiguous: ranked.filter((s) => s.score >= top.score * AMBIGUITY_RATIO) };
  }
  return { resolved: pool.find((w) => w.componentId === top.componentId)! };
}

/**
 * Resolve a field reference against what a widget's data source offers.
 *
 * Exact match first, then a normalised match, then a word-overlap match — so "exception count"
 * finds `exception-count` and "Issuer" finds `issuer-name`. Returns every plausible field when more
 * than one is plausible, because guessing between `issuer-name` and `issuer-id` produces a column of
 * identifiers where somebody asked for names.
 */
export function resolveField(reference: string, available: readonly string[]): string[] {
  const normalise = (value: string) => value.toLowerCase().replace(/[^a-z0-9]/g, '');
  const asked = normalise(reference);
  if (!asked) return [];

  const exact = available.filter((f) => normalise(f) === asked);
  if (exact.length) return exact;

  const prefix = available.filter((f) => normalise(f).startsWith(asked) || asked.startsWith(normalise(f)));
  if (prefix.length) return prefix;

  const askedWords = words(reference);
  return available.filter((f) => {
    const fieldWords = words(f.replace(/[-_]/g, ' '));
    return askedWords.every((w) => fieldWords.some((fw) => fw.startsWith(w) || w.startsWith(fw)));
  });
}

// ── 4. interpretation, by rules ─────────────────────────────────────────────

interface Pattern {
  test: RegExp;
  build: (match: RegExpExecArray) => RefinementIntent;
}

/**
 * The prompts the PRD actually writes down, as patterns.
 *
 * Not an attempt at natural language. Each of these is lifted from §11, §12, §15 or §28, and the
 * reason to encode them as rules rather than send everything to a model is the one `assist.ts` gives:
 * they are free, deterministic and testable, and refinement has to keep working when the model
 * endpoint does not. A provider handles the sentences these miss, and emits the same intent shape.
 */
const PATTERNS: readonly Pattern[] = [
  // §12 "Add issuer and currency." / "Add ISIN, CUSIP, ticker…"
  {
    test: /^\s*(?:also\s+)?(?:add|include|show)\s+(?:the\s+)?(.+?)(?:\s+(?:column|columns|field|fields))?\s*(?:to\s+(?:the\s+)?(.+?))?\s*$/i,
    build: (m) => ({ verb: 'add-column', field: m[1]!, target: m[2] ?? '' }),
  },
  // §12 "Remove the security type column."
  {
    test: /^\s*(?:remove|drop|delete|hide)\s+(?:the\s+)?(.+?)\s+(?:column|field)\s*(?:from\s+(?:the\s+)?(.+?))?\s*$/i,
    build: (m) => ({ verb: 'remove-column', field: m[1]!, target: m[2] ?? '' }),
  },
  // §12 "Group the grid by issuer." / "Group by security type."
  {
    test: /^\s*group\s+(?:(.+?)\s+)?by\s+(.+?)\s*$/i,
    build: (m) => ({ verb: 'group-rows', target: m[1] ?? '', field: m[2]! }),
  },
  // §12 "Sort by exception count." / "Put the most recently updated securities first."
  {
    test: /^\s*sort\s+(?:(.+?)\s+)?by\s+(.+?)(?:\s+(ascending|descending|asc|desc))?\s*$/i,
    build: (m) => ({
      verb: 'sort-rows',
      target: m[1] ?? '',
      field: m[2]!,
      direction: /desc/i.test(m[3] ?? '') ? 'descending' : 'ascending',
    }),
  },
  // §12 "Highlight securities with unresolved exceptions." / "Highlight rows that have business exceptions."
  {
    test: /^\s*highlight\s+(?:the\s+)?(?:rows?\s+)?(?:that\s+have\s+|with\s+|where\s+)?(.+?)\s*$/i,
    build: (m) => ({ verb: 'highlight-rows', field: m[1]!, target: '' }),
  },
  // §11 "Change the pie chart to a bar chart." / "Change that chart to a bar chart."
  {
    test: /^\s*(?:change|make|turn|switch)\s+(?:the\s+|that\s+|this\s+)?(.*?)\s+(?:to|into)\s+(?:a\s+|an\s+)?(\w+)(?:\s+chart|\s+graph)?\s*$/i,
    build: (m) => ({ verb: 'change-chart-type', target: m[1] ?? '', chartType: m[2]! }),
  },
  // §15 "Move the exceptions panel to the top." / §11 "Move this chart above the grid."
  {
    test: /^\s*move\s+(?:the\s+|this\s+|that\s+)?(.+?)\s+(?:to\s+the\s+)?(top|bottom)\s*$/i,
    build: (m) => ({ verb: 'move-widget', target: m[1]!, position: m[2]!.toLowerCase() as MovePosition }),
  },
  {
    test: /^\s*move\s+(?:the\s+|this\s+|that\s+)?(.+?)\s+(above|below|before|after)\s+(?:the\s+)?(.+?)\s*$/i,
    build: (m) => ({
      verb: 'move-widget',
      target: m[1]!,
      position: /above|before/i.test(m[2]!) ? 'before' : 'after',
      relativeTo: m[3]!,
    }),
  },
  // §9 "When the user double-clicks a security, take them to a security detail page."
  {
    test: /^\s*when\s+(?:the\s+user\s+)?(?:double-?clicks?|clicks?|selects?)\s+(?:a\s+|an\s+)?(.+?),?\s+(?:take\s+them\s+to|go\s+to|open|navigate\s+to)\s+(?:the\s+)?(.+?)(?:\s+page)?\s*$/i,
    build: (m) => ({ verb: 'set-drilldown', target: m[1]!, value: m[2]! }),
  },
  // §10 "Move security status next to the identifier." is a move; retitling is the other housekeeping verb.
  {
    test: /^\s*(?:rename|retitle|call)\s+(?:the\s+)?(.+?)\s+(?:to\s+)?["“']?([^"”']+)["”']?\s*$/i,
    build: (m) => ({ verb: 'retitle-widget', target: m[1]!, value: m[2]!.trim() }),
  },
];

/**
 * Turn a sentence into an intent, or nothing.
 *
 * The trailing full stop is stripped first. Every prompt in the PRD is written as a sentence and ends
 * with one, and a pattern anchored on `$` matched none of them — which is the kind of defect that makes
 * a feature look broken while every unit test of the regex passes.
 */
export function interpret(prompt: string): RefinementIntent | null {
  const trimmed = prompt.trim().replace(/[.!?\s]+$/, '');
  for (const pattern of PATTERNS) {
    const match = pattern.test.exec(trimmed);
    if (match) return pattern.build(match);
  }
  return null;
}

// ── 5. grounding, and the resolved result ───────────────────────────────────

/** Which widgets a verb can act on at all, expressed through the manifest rather than by type. */
function eligibleFor(verb: RefinementVerb): (widget: RefineWidget) => boolean {
  switch (verb) {
    case 'add-column':
    case 'remove-column':
      return (w) => w.columns.length > 0;
    case 'sort-rows':
    case 'highlight-rows':
      return (w) => w.dataSource !== undefined && w.columns.length > 0;
    case 'group-rows':
      // Manifest-driven rather than type-driven: a component offers grouping if it declares the
      // property. Adding grouping to `data.table` therefore needs no change here.
      return (w) => w.configProperties.includes('groupBy');
    case 'change-chart-type':
      return (w) => w.configProperties.includes('mark');
    case 'set-drilldown':
      // A row can only be activated in something that has rows, which is also what makes
      // "double-clicks a security" resolve to the grid rather than to a chart about securities.
      return (w) => w.columns.length > 0;
    default:
      return () => true;
  }
}

/** A human label for a candidate, for the question a resolver asks. */
/** "a bar chart", "an area chart" — the indefinite article, so the explanation reads as English. */
function article(word: string): string {
  return /^[aeiou]/i.test(word) ? 'an' : 'a';
}

function labelOf(widget: RefineWidget): string {
  return `${widget.title} (${widget.type})`;
}

function ambiguityQuestion(
  reference: string,
  candidates: { componentId: string; label: string }[],
): string {
  const names = candidates.map((c) => `“${c.label}”`);
  const list = names.length <= 2 ? names.join(' or ') : `${names.slice(0, -1).join(', ')} or ${names[names.length - 1]}`;
  return reference.trim()
    ? `“${reference.trim()}” could mean ${list}. Which did you mean?`
    : `There is more than one on this page — ${list}. Which did you mean?`;
}

/**
 * Resolve and ground one intent against a page.
 *
 * Every refusal names what *is* available. A refinement that fails with "cannot do that" teaches the
 * author to stop asking; one that says "this chart offers bar, line, area or point" teaches them the
 * vocabulary.
 */
export function ground(intent: RefinementIntent, page: RefinePageView): RefineOutcome {
  const eligible = eligibleFor(intent.verb);
  const eligibleWidgets = page.widgets.filter(eligible);

  if (eligibleWidgets.length === 0) {
    return { outcome: 'refused', reason: refusalForNoTarget(intent.verb, page) };
  }

  /*
    For most verbs the captured target names a WIDGET. For `set-drilldown` it names the row's subject —
    "when the user double-clicks **a security**" is about a security, not about a widget called one — so
    a reference that matches nothing eligible is not an error there, it is simply not a widget
    reference, and the eligible set answers instead.
  */
  const targetNamesEntity = intent.verb === 'set-drilldown';
  const reference = (intent.target ?? '').trim();
  let widget: RefineWidget;

  if (reference && !(targetNamesEntity && !hasWidgetMatch(reference, eligibleWidgets, page))) {
    /*
      Two passes, and the order is the whole design.

      FIRST against the ELIGIBLE widgets only. "When the user double-clicks a security" on a page with
      three widgets titled "Securities…" has one answer among the two that have rows, and resolving
      against everything first turned that into a three-way tie with a chart and a KPI in it.

      THEN, only if nothing eligible matched, against every widget — to produce the message. Asked to
      group the grid, resolving against eligible widgets alone answered "nothing on this page matches
      the grid" while the grid was plainly on the page. The reference was fine; the grid cannot group,
      and that is what the author needs to be told.
    */
    const found = resolveWidget(reference, page, eligible);
    if ('ambiguous' in found) return askWhich(reference, found.ambiguous, page);
    if ('resolved' in found) {
      widget = found.resolved;
    } else {
      const anywhere = resolveWidget(reference, page);
      if ('resolved' in anywhere) {
        return { outcome: 'refused', reason: ineligibleReason(intent.verb, anywhere.resolved, eligibleWidgets) };
      }
      if ('ambiguous' in anywhere) {
        // Matches several, none of which can take the change. Naming the first is enough to explain why.
        const first = page.widgets.find((w) => w.componentId === anywhere.ambiguous[0]!.componentId)!;
        return { outcome: 'refused', reason: ineligibleReason(intent.verb, first, eligibleWidgets) };
      }
      return {
        outcome: 'refused',
        reason: `Nothing on this page matches “${reference}”. It has ${describeWidgets(page.widgets)}.`,
      };
    }
  } else {
    /*
      No reference at all — "sort by exception count", "add issuer". The field then does the
      disambiguating, and it does it well: `issuer` belongs to the securities source and not to the
      exceptions one, so exactly one widget can satisfy the request even though two have columns.

      This is grounding narrowing a reference rather than guessing at one. Where the field narrows to
      nothing, or to more than one, the answer is still a question.
    */
    const narrowed = narrowByField(intent, eligibleWidgets);
    if (narrowed.length === 1) {
      widget = narrowed[0]!;
    } else if (narrowed.length === 0) {
      return { outcome: 'refused', reason: noWidgetForField(intent, eligibleWidgets) };
    } else {
      return askWhich(
        '',
        narrowed.map((w) => ({ componentId: w.componentId, score: 0, matched: [] })),
        page,
      );
    }
  }

  switch (intent.verb) {
    case 'change-chart-type':
      return groundChartType(intent, widget);
    case 'group-rows':
      return groundGrouping(intent, widget);
    case 'add-column':
    case 'remove-column':
    case 'sort-rows':
    case 'highlight-rows':
      return groundFieldVerb(intent, widget);
    case 'move-widget':
      return groundMove(intent, widget, page);
    case 'set-drilldown':
      return groundDrilldown(intent, widget, page);
    case 'retitle-widget':
      return intent.value
        ? {
            outcome: 'resolved',
            refinements: [
              {
                verb: 'retitle-widget',
                componentId: widget.componentId,
                value: intent.value,
                explanation: `Renamed “${widget.title}” to “${intent.value}”.`,
              },
            ],
            explanation: `Renamed “${widget.title}” to “${intent.value}”.`,
          }
        : { outcome: 'refused', reason: 'A new title is needed.' };
  }
}

/**
 * Does this reference name one of the eligible widgets at all?
 *
 * Used only to decide whether a `set-drilldown` target is a widget reference or the row's subject. It
 * asks the same resolver so the two cannot disagree about what "matches" means.
 */
function hasWidgetMatch(reference: string, eligible: readonly RefineWidget[], page: RefinePageView): boolean {
  if (eligible.length === 0) return false;
  const found = resolveWidget(reference, page, (w) => eligible.some((e) => e.componentId === w.componentId));
  return 'resolved' in found || 'ambiguous' in found;
}

/** Which eligible widgets could actually satisfy the field this intent names. */
function narrowByField(intent: RefinementIntent, eligible: readonly RefineWidget[]): RefineWidget[] {
  const field = (intent.field ?? '').trim();
  if (!field) return [...eligible];
  const pool = (widget: RefineWidget) =>
    intent.verb === 'remove-column' || intent.verb === 'highlight-rows'
      ? widget.columns
      : widget.availableFields;
  const matching = eligible.filter((w) => resolveField(field, pool(w)).length > 0);
  // None matching is a refusal with a useful message, not a reason to fall back to all of them —
  // falling back would put the change on a widget that cannot carry it.
  return matching;
}

function noWidgetForField(intent: RefinementIntent, eligible: readonly RefineWidget[]): string {
  const field = (intent.field ?? '').trim();
  const shownOnly = intent.verb === 'remove-column' || intent.verb === 'highlight-rows';
  const where = shownOnly ? 'shows' : 'can show';
  const options = eligible
    .map((w) => `“${w.title}” (${(shownOnly ? w.columns : w.availableFields).slice(0, 5).join(', ') || 'no fields declared'})`)
    .join('; ');
  /*
    When the field is AVAILABLE to something and simply not shown, say so. Highlighting attaches to a
    column binding, so the author's next move is a column rather than a rephrase — and a refusal that
    sends them back to the wording of a sentence that was fine is a refusal that wastes their time.
  */
  const availableSomewhere = shownOnly
    ? eligible.filter((w) => resolveField(field, w.availableFields).length > 0)
    : [];
  const hint = availableSomewhere.length
    ? ` It is available to ${availableSomewhere.map((w) => `“${w.title}”`).join(', ')} — add it as a column first, then highlight it.`
    : '';
  return `Nothing on this page ${where} “${field}”. ${eligible.length === 1 ? 'It has' : 'They have'}: ${options}.${hint}`;
}

function askWhich(
  reference: string,
  scores: readonly ResolutionScore[],
  page: RefinePageView,
): RefineOutcome {
  const candidates = scores.map((s) => ({
    componentId: s.componentId,
    label: labelOf(page.widgets.find((w) => w.componentId === s.componentId)!),
  }));
  return { outcome: 'ambiguous', on: 'target', question: ambiguityQuestion(reference, candidates), candidates };
}

/**
 * The reference was understood and the widget cannot take the change.
 *
 * Names the widget, the reason, and what on the page *can* — because the alternative message,
 * "nothing matches", is both false and unactionable when the thing is right there on the screen.
 */
function ineligibleReason(
  verb: RefinementVerb,
  widget: RefineWidget,
  eligible: readonly RefineWidget[],
): string {
  const alternatives = eligible.map((w) => `“${w.title}”`).join(', ');
  switch (verb) {
    case 'group-rows':
      return `“${widget.title}” does not offer grouping — grouping is a property a component declares, and ${widget.type} does not. On this page ${alternatives} does.`;
    case 'change-chart-type':
      return `“${widget.title}” is not a chart, so it has no chart type. ${alternatives} ${eligible.length === 1 ? 'is' : 'are'} on this page.`;
    case 'add-column':
    case 'remove-column':
      return `“${widget.title}” has no columns. ${alternatives} ${eligible.length === 1 ? 'does' : 'do'}.`;
    case 'sort-rows':
    case 'highlight-rows':
      return `“${widget.title}” has no rows to ${verb === 'sort-rows' ? 'sort' : 'highlight'}. ${alternatives} ${eligible.length === 1 ? 'does' : 'do'}.`;
    case 'set-drilldown':
      return `“${widget.title}” has no rows to activate, so there is nothing to drill down from. ${alternatives} ${eligible.length === 1 ? 'does' : 'do'}.`;
    default:
      return `“${widget.title}” cannot take that change. ${alternatives} can.`;
  }
}

function describeWidgets(widgets: readonly RefineWidget[]): string {
  const labels = widgets.slice(0, 4).map((w) => `“${w.title}”`);
  const more = widgets.length > labels.length ? `, and ${widgets.length - labels.length} more` : '';
  return `${labels.join(', ')}${more}`;
}

function refusalForNoTarget(verb: RefinementVerb, page: RefinePageView): string {
  switch (verb) {
    case 'group-rows':
      return (
        'Nothing on this page offers grouping. Grouping is a property a component declares — the ' +
        'Exception Queue does, and the table does not yet — so this needs a component that supports it ' +
        'rather than a different prompt.'
      );
    case 'change-chart-type':
      return 'There is no chart on this page to change.';
    case 'add-column':
    case 'remove-column':
      return 'There is nothing with columns on this page.';
    case 'sort-rows':
    case 'highlight-rows':
      return 'There is nothing with rows on this page to sort or highlight.';
    default:
      return `This page has nothing that can take that change. It has ${describeWidgets(page.widgets)}.`;
  }
}

function groundChartType(intent: RefinementIntent, widget: RefineWidget): RefineOutcome {
  const asked = (intent.chartType ?? '').toLowerCase();
  const allowed = widget.configEnums['mark'] ?? [];
  if (!asked) return { outcome: 'refused', reason: 'Which chart type?' };
  if (!allowed.includes(asked)) {
    /*
      §11's own example asks for a pie chart and the chart component does not offer one. Refusing by
      name, with the list, is the honest answer — and it is more useful than silently choosing `bar`,
      which would leave the author believing pie charts work.
    */
    return {
      outcome: 'refused',
      reason: `“${asked}” is not one of the chart types this component offers. It supports ${allowed.map((a) => `“${a}”`).join(', ')}.`,
    };
  }
  if (widget.config['mark'] === asked) {
    return { outcome: 'refused', reason: `“${widget.title}” is already a ${asked} chart.` };
  }
  const current = String(widget.config['mark'] ?? 'default');
  const explanation = `Changed “${widget.title}” from ${article(current)} ${current} chart to ${article(asked)} ${asked} chart.`;
  return {
    outcome: 'resolved',
    refinements: [{ verb: 'change-chart-type', componentId: widget.componentId, chartType: asked, explanation }],
    explanation,
  };
}

/**
 * Grouping is a CONFIG ENUM, not a field.
 *
 * `business.exception-queue` declares `groupBy: 'severity' | 'rule' | 'assignee' | 'none'`. Those are
 * the component's own grouping *modes*, deliberately not arbitrary columns — a queue grouped by an
 * identifier is a queue with one row per group. Resolving "group the queue by assignee" against the
 * data source's field list refused it, because the field is spelled `assigned-to`, and the answer the
 * author needed was that `assignee` is exactly right.
 */
function groundGrouping(intent: RefinementIntent, widget: RefineWidget): RefineOutcome {
  const asked = (intent.field ?? '').trim();
  if (!asked) return { outcome: 'refused', reason: 'Group by what?' };

  const allowed = widget.configEnums['groupBy'] ?? [];
  if (allowed.length === 0) {
    // Declared the property with no enum: it takes a field name, so fall through to field resolution.
    return groundFieldVerb(intent, widget);
  }

  const matches = allowed.filter((option) => resolveField(asked, [option]).length > 0);
  if (matches.length === 0) {
    return {
      outcome: 'refused',
      reason: `“${widget.title}” can group by ${allowed.filter((a) => a !== 'none').map((a) => `“${a}”`).join(', ')} — not by “${asked}”.`,
    };
  }
  if (matches.length > 1) {
    return {
      outcome: 'ambiguous',
      on: 'field',
      question: `“${asked}” could be ${matches.map((m) => `“${m}”`).join(' or ')}. Which did you mean?`,
      candidates: matches.map((m) => ({ componentId: widget.componentId, label: m })),
    };
  }

  const option = matches[0]!;
  if (widget.config['groupBy'] === option) {
    return { outcome: 'refused', reason: `“${widget.title}” is already grouped by ${option}.` };
  }
  const explanation = `Grouped “${widget.title}” by ${option}.`;
  return {
    outcome: 'resolved',
    refinements: [{ verb: 'group-rows', componentId: widget.componentId, field: option, explanation }],
    explanation,
  };
}

function groundFieldVerb(intent: RefinementIntent, widget: RefineWidget): RefineOutcome {
  const reference = (intent.field ?? '').trim();
  if (!reference) return { outcome: 'refused', reason: 'Which field?' };

  /*
    `remove-column` and `highlight-rows` resolve against what is SHOWN; everything else against what is
    AVAILABLE.

    Removing a column that is not there is a different mistake from adding one the data source does not
    carry, and the two refusals should say different things. Highlighting joins the first group because
    a conditional format lives ON a column binding — resolving it against the wider set let grounding
    accept a field the applier then refused, which is a disagreement the author sees as the feature
    working and then not working.
  */
  const shownOnly = intent.verb === 'remove-column' || intent.verb === 'highlight-rows';
  const pool = shownOnly ? widget.columns : widget.availableFields;
  if (pool.length === 0) {
    return {
      outcome: 'refused',
      reason: shownOnly
        ? `“${widget.title}” has no columns to work with.`
        : `Nothing is known about what “${widget.title}” can show — its data source declares no fields.`,
    };
  }

  const matches = resolveField(reference, pool);
  if (matches.length === 0) {
    return {
      outcome: 'refused',
      reason:
        `“${reference}” is not a field ${shownOnly ? 'shown on' : 'available to'} “${widget.title}”. ` +
        `${shownOnly ? 'Shown' : 'Available'}: ${pool.slice(0, 8).join(', ')}${pool.length > 8 ? ', …' : ''}.` +
        // Highlighting attaches to a column binding, so the fix is a column rather than a rephrase.
        (intent.verb === 'highlight-rows' && widget.availableFields.includes(reference)
          ? ` It is available to this widget — add it as a column first, then highlight it.`
          : ''),
    };
  }
  if (matches.length > 1) {
    return {
      outcome: 'ambiguous',
      on: 'field',
      question: `“${reference}” could be ${matches.map((m) => `“${m}”`).join(' or ')}. Which did you mean?`,
      candidates: matches.map((m) => ({ componentId: widget.componentId, label: m })),
    };
  }

  const field = matches[0]!;
  if (intent.verb === 'add-column' && widget.columns.includes(field)) {
    return { outcome: 'refused', reason: `“${widget.title}” already shows ${field}.` };
  }

  const explanation = explainFieldVerb(intent, widget, field);
  return {
    outcome: 'resolved',
    refinements: [
      {
        verb: intent.verb,
        componentId: widget.componentId,
        field,
        ...(intent.direction ? { direction: intent.direction } : {}),
        explanation,
      },
    ],
    explanation,
  };
}

/** §19's register: what was done, in the words a business user would use. */
function explainFieldVerb(intent: RefinementIntent, widget: RefineWidget, field: string): string {
  switch (intent.verb) {
    case 'add-column':
      return `Added a ${field} column to “${widget.title}”.`;
    case 'remove-column':
      return `Removed the ${field} column from “${widget.title}”.`;
    case 'sort-rows':
      return `Sorted “${widget.title}” by ${field}, ${intent.direction === 'descending' ? 'highest first' : 'lowest first'}.`;
    case 'group-rows':
      return `Grouped “${widget.title}” by ${field}.`;
    case 'highlight-rows':
      return `Configured rows in “${widget.title}” with a ${field} value to display as highlighted.`;
    default:
      return `Changed “${widget.title}”.`;
  }
}

function groundMove(intent: RefinementIntent, widget: RefineWidget, page: RefinePageView): RefineOutcome {
  if (widget.parentId === undefined) {
    return { outcome: 'refused', reason: `“${widget.title}” is not inside a container that can be reordered.` };
  }

  if (intent.position === 'before' || intent.position === 'after') {
    const other = resolveWidget(intent.relativeTo ?? '', page, (w) => w.componentId !== widget.componentId);
    if ('ambiguous' in other) {
      const candidates = other.ambiguous.map((s) => ({
        componentId: s.componentId,
        label: labelOf(page.widgets.find((w) => w.componentId === s.componentId)!),
      }));
      // The ANCHOR is the ambiguous half here, not the widget being moved — "move the chart above the
      // grid" resolved its chart and found two grids. Answering must fill `relativeTo`.
      return {
        outcome: 'ambiguous',
        on: 'relativeTo',
        question: ambiguityQuestion(intent.relativeTo ?? '', candidates),
        candidates,
      };
    }
    if ('none' in other) {
      return { outcome: 'refused', reason: `Nothing on this page matches “${(intent.relativeTo ?? '').trim()}”.` };
    }
    const explanation = `Moved “${widget.title}” ${intent.position} “${other.resolved.title}”.`;
    return {
      outcome: 'resolved',
      refinements: [
        {
          verb: 'move-widget',
          componentId: widget.componentId,
          nodeId: widget.nodeId,
          position: intent.position,
          relativeToComponentId: other.resolved.componentId,
          explanation,
        },
      ],
      explanation,
    };
  }

  const position = intent.position ?? 'top';
  /*
    "Top" means the top of the widget's OWN container, not of the page. On a page whose widgets each sit
    in their own panel that makes the answer "already at the top" for nearly everything, which is
    literally true and not what the author meant. Moving between containers is a larger change than
    reordering within one, and it is recorded as the next step rather than guessed at here.
  */
  if ((position === 'top' && widget.index === 0) || (position === 'bottom' && isLast(widget, page))) {
    return {
      outcome: 'refused',
      reason: `“${widget.title}” is already at the ${position} of the section it is in. Moving it between sections is not supported yet — say “move it above …” or “below …” to reorder within its section.`,
    };
  }
  const explanation = `Moved “${widget.title}” to the ${position} of the page.`;
  return {
    outcome: 'resolved',
    refinements: [
      { verb: 'move-widget', componentId: widget.componentId, nodeId: widget.nodeId, position, explanation },
    ],
    explanation,
  };
}

function isLast(widget: RefineWidget, page: RefinePageView): boolean {
  const siblings = page.widgets.filter((w) => w.parentId === widget.parentId);
  const highest = Math.max(...siblings.map((w) => w.index ?? 0));
  return (widget.index ?? 0) === highest;
}

function groundDrilldown(intent: RefinementIntent, widget: RefineWidget, page: RefinePageView): RefineOutcome {
  const asked = (intent.value ?? '').trim();
  if (!asked) return { outcome: 'refused', reason: 'Which page should it open?' };
  if (page.siblingPages.length === 0) {
    return {
      outcome: 'refused',
      reason: 'This experience has only one page, so there is nowhere to drill down to yet. Add a detail page first.',
    };
  }
  const matches = resolveField(asked, page.siblingPages);
  if (matches.length === 0) {
    return {
      outcome: 'refused',
      reason: `There is no page called “${asked}” in this experience. It has ${page.siblingPages.join(', ')}.`,
    };
  }
  if (matches.length > 1) {
    return {
      outcome: 'ambiguous',
      on: 'field',
      question: `“${asked}” could be ${matches.map((m) => `“${m}”`).join(' or ')}. Which did you mean?`,
      candidates: matches.map((m) => ({ componentId: widget.componentId, label: m })),
    };
  }
  const explanation = `Activating a row in “${widget.title}” now opens the ${matches[0]} page.`;
  return {
    outcome: 'resolved',
    refinements: [
      { verb: 'set-drilldown', componentId: widget.componentId, value: matches[0]!, explanation },
    ],
    explanation,
  };
}

// ── 6. the whole turn ───────────────────────────────────────────────────────

/**
 * One conversational turn: a sentence in, a grounded outcome out.
 *
 * `intent` may be supplied by a caller that used a model, in which case the sentence is only used for
 * the refusal messages. That is the seam: rules and model produce the same shape, and everything after
 * interpretation is shared.
 */
export function refine(prompt: string, page: RefinePageView, intent?: RefinementIntent | null): RefineOutcome {
  const resolved = intent ?? interpret(prompt);
  if (!resolved) {
    return {
      outcome: 'notUnderstood',
      reason:
        'That was not understood as a change to this page. Try naming what to change and how — ' +
        '“add an issuer column”, “sort by exception count”, “change the chart to a line chart”, ' +
        '“move the exception queue to the top”.',
    };
  }
  return ground(resolved, page);
}

/**
 * The schema a model is held to, if one is installed.
 *
 * Closed, and small enough to be genuinely enforced by a structured-output mode — the same argument
 * `plan.ts` and the parked builder's `decisions.ts` both make. Note what it cannot express: a component
 * id, a JSON pointer, a patch. The model reads the sentence; the platform resolves the references.
 */
export const REFINE_RESPONSE_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['verb'],
  properties: {
    verb: {
      type: 'string',
      enum: [
        'add-column',
        'remove-column',
        'sort-rows',
        'group-rows',
        'highlight-rows',
        'change-chart-type',
        'move-widget',
        'set-drilldown',
        'retitle-widget',
      ],
    },
    target: { type: 'string', maxLength: 200, description: 'How the user referred to the widget.' },
    field: { type: 'string', maxLength: 200, description: 'How the user referred to a field.' },
    chartType: { type: 'string', maxLength: 32 },
    direction: { type: 'string', enum: ['ascending', 'descending'] },
    position: { type: 'string', enum: ['top', 'bottom', 'before', 'after'] },
    relativeTo: { type: 'string', maxLength: 200 },
    value: { type: 'string', maxLength: 400 },
  },
} as const;
