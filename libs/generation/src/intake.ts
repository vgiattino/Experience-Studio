/**
 * Intake, intent classification and concept extraction (ai-architecture.md §2.1–2.2).
 *
 * Two jobs that are separated deliberately:
 *
 *  1. CLASSIFY. Route to create / refine / explain / out-of-scope. Out-of-scope is a real
 *     branch, not a fallback: "delete last month's pricing data" is not a generation request,
 *     and the correct response is a plain decline rather than a best-effort attempt.
 *
 *  2. EXTRACT CONCEPTS. Build a retrieval query, not a restatement of the prompt. Prompts
 *     carry framing language ("show me a dashboard for the ops team that…") which measurably
 *     pollutes similarity search. Separating extraction improves retrieval precision.
 *
 * M1 implements both with rules. A real deployment may use a cheap model call for
 * classification — the ModelProvider `purpose: 'classify'` exists for that — but rules are
 * the right default: they are free, deterministic, and testable.
 */

export type IntentClass = 'create' | 'refine' | 'explain' | 'outOfScope';

export type PageIntent = 'dashboard' | 'search' | 'detail' | 'workspace';

export interface ExtractedConcepts {
  /** Terms for retrieval, with framing language removed. */
  terms: string[];
  /** Words suggesting an aggregate figure the user wants to read at a glance. */
  measureHints: string[];
  /** Words suggesting a record-level list. */
  listHints: string[];
  /** Words suggesting a trend over time. */
  temporalHints: string[];
  /** Explicit timeframe, when one was stated. */
  timeframe?: { unit: 'day' | 'week' | 'month'; count: number } | 'today';
  /** Words suggesting a breakdown by category. */
  breakdownHints: string[];
}

export interface IntakeResult {
  intent: IntentClass;
  pageIntent: PageIntent;
  concepts: ExtractedConcepts;
  /** Set when the request cannot be served, with a plain reason. */
  decline?: string;
  /** Set when one clarification is genuinely required. Bounded to a single round. */
  clarification?: string;
}

const OUT_OF_SCOPE = [
  { pattern: /\b(delete|drop|truncate|purge|wipe)\b/i, reason: 'deleting data' },
  { pattern: /\b(grant|revoke)\s+(access|permission|entitlement)/i, reason: 'changing entitlements' },
  { pattern: /\b(approve|reject)\b.*\b(override|correction|trade)\b/i, reason: 'approving records' },
  { pattern: /\b(email|send|export to)\b.*\b(client|customer|external)\b/i, reason: 'sending data externally' },
];

const REFINE_MARKERS =
  /\b(add|remove|change|make|instead|also|swap|rename|move|drop the|replace|now show)\b/i;
const EXPLAIN_MARKERS = /\b(explain|describe|what does|why does|how does)\b.*\b(page|dashboard|this)\b/i;

const MEASURE_WORDS = [
  'count', 'total', 'number', 'how many', 'sum', 'average', 'status', 'health', 'kpi',
  'volume', 'rate', 'age', 'oldest', 'outstanding',
];
const LIST_WORDS = [
  'list', 'queue', 'table', 'rows', 'records', 'detail', 'details', 'which', 'breakdown of',
  'itemised', 'exceptions', 'files',
];
const TEMPORAL_WORDS = ['trend', 'over time', 'history', 'daily', 'weekly', 'by day', 'last'];
const BREAKDOWN_WORDS = ['by', 'per', 'split', 'grouped', 'breakdown', 'across'];

/**
 * Two word lists, stripped together but distinct in what they mean.
 *
 * FRAMING is the grammatical scaffolding around a real request — "create a dashboard showing
 * …". Removing it improves retrieval precision, because "dashboard" matches nothing in a data
 * catalog and dilutes the terms that do.
 *
 * FILLER is different, and the distinction is what makes the vagueness check work: these are
 * words that carry no retrievable content at all. "Make me something nice" is not a request
 * with framing around it; it is framing with nothing inside. Counting surviving terms without
 * removing filler classified that prompt as specific — two terms, "something" and "nice" —
 * and sent it to retrieval, which found nothing and produced a decline about the catalog. The
 * user's problem was not the catalog.
 */
const FRAMING = new Set([
  'create', 'build', 'make', 'show', 'showing', 'shows', 'display', 'give', 'me', 'a', 'an',
  'the', 'and', 'with', 'for', 'of', 'in', 'on', 'to', 'my', 'our', 'please', 'dashboard',
  'page', 'screen', 'view', 'report', 'that', 'which', 'all', 'some', 'i', 'want', 'need',
  'would', 'like', 'see', 'operational', 'team',
]);

// Deliberately excludes "data" and "new": "data quality exceptions" and "new securities" both
// carry retrievable content, and a filler list that swallows domain vocabulary is worse than
// none. A word earns a place here only if it cannot narrow a catalog search.
const FILLER = new Set([
  'something', 'anything', 'everything', 'nothing', 'whatever', 'nice', 'nicer', 'good',
  'better', 'best', 'cool', 'pretty', 'interesting', 'useful', 'helpful', 'simple', 'basic',
  'quick', 'thing', 'things', 'stuff',
]);

function tokenize(prompt: string): string[] {
  return prompt
    .toLowerCase()
    .replace(/[^a-z0-9\s'-]/g, ' ')
    .split(/\s+/)
    .filter(Boolean);
}

function detectTimeframe(prompt: string): ExtractedConcepts['timeframe'] {
  if (/\b(today|today's|current|now)\b/i.test(prompt)) return 'today';
  const relative = /\b(?:last|past|previous)\s+(\d+)?\s*(day|week|month)s?\b/i.exec(prompt);
  if (relative) {
    const count = relative[1] ? Number(relative[1]) : 1;
    return { unit: relative[2]!.toLowerCase() as 'day' | 'week' | 'month', count };
  }
  return undefined;
}

function matches(prompt: string, words: readonly string[]): string[] {
  const lower = prompt.toLowerCase();
  return words.filter((w) => lower.includes(w));
}

export function intake(prompt: string, hasExistingPage = false): IntakeResult {
  const trimmed = prompt.trim();

  // ── out of scope
  for (const { pattern, reason } of OUT_OF_SCOPE) {
    if (pattern.test(trimmed)) {
      return {
        intent: 'outOfScope',
        pageIntent: 'dashboard',
        concepts: emptyConcepts(),
        decline: `That asks about ${reason}, which this platform does not do from a prompt. Experience Studio designs pages over governed data; changing or sending data is a separate, audited operation.`,
      };
    }
  }

  // ── classify
  let intent: IntentClass = 'create';
  if (EXPLAIN_MARKERS.test(trimmed)) intent = 'explain';
  else if (hasExistingPage && REFINE_MARKERS.test(trimmed)) intent = 'refine';

  // ── page intent
  const lower = trimmed.toLowerCase();
  let pageIntent: PageIntent = 'dashboard';
  if (/\b(search|find|look up|lookup)\b/.test(lower)) pageIntent = 'search';
  else if (/\b(detail|overview of|profile|single)\b/.test(lower)) pageIntent = 'detail';
  else if (/\b(review|remediat|correct|approve|workspace)\b/.test(lower)) pageIntent = 'workspace';

  // ── extract concepts
  const terms = tokenize(trimmed).filter(
    (t) => !FRAMING.has(t) && !FILLER.has(t) && t.length > 2,
  );
  const concepts: ExtractedConcepts = {
    terms: [...new Set(terms)],
    measureHints: matches(trimmed, MEASURE_WORDS),
    listHints: matches(trimmed, LIST_WORDS),
    temporalHints: matches(trimmed, TEMPORAL_WORDS),
    breakdownHints: matches(trimmed, BREAKDOWN_WORDS),
    timeframe: detectTimeframe(trimmed),
  };

  // ── ambiguity, bounded to one question
  // Interrogation is worse UX than a reviewable first attempt, so this fires only when the
  // request names nothing to build from at all.
  if (concepts.terms.length < 2) {
    return {
      intent,
      pageIntent,
      concepts,
      clarification:
        'Which business area should this cover — processing health, data quality exceptions, or the security master?',
    };
  }

  return { intent, pageIntent, concepts };
}

function emptyConcepts(): ExtractedConcepts {
  return {
    terms: [],
    measureHints: [],
    listHints: [],
    temporalHints: [],
    breakdownHints: [],
  };
}
