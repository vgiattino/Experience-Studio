/**
 * Product identification from intent (FR-3).
 *
 * "The AI can identify which Opus product(s) a described Experience concerns from the prompt content,
 * without the user naming the product explicitly." The FR states two consequences and both are
 * implemented here as the whole of the behaviour:
 *
 *   · identification decides which metadata, components and AI Context ground the generation
 *   · where intent plausibly spans more than one product, the AI ASKS rather than silently picking one
 *
 * ── THE ONE IDEA WORTH READING ───────────────────────────────────────────────
 *
 * A signal only counts if it discriminates. The index is built across the whole registry first, and any
 * word claimed by more than one product is then worth nothing to either of them. "Exception" means
 * something in every data platform ever built; if two products both register it, a prompt about
 * exceptions has told us nothing about which one, and scoring it for both would produce a confident
 * tie that then resolves by load order. Discarding it produces a low score, which produces a question.
 *
 * That is why `sharedSignals` is returned rather than hidden: a product owner looking at why their
 * product is never identified should be able to see that every word they registered is a word somebody
 * else registered too.
 *
 * ── WHY THIS IS RULES AND NOT A MODEL CALL ───────────────────────────────────
 *
 * The same reason `intake.ts` gives for classification: free, deterministic, testable, and correct for
 * the shape of the problem. Identification is a lookup against vocabulary a product *declared*, not a
 * judgement about meaning. A real deployment may replace the scorer with a model call over the same
 * index; the interesting part — the index, and the refusal to guess between two plausible answers — is
 * the part that would stay.
 */

import type { CatalogSnapshot } from '@opus/catalog';
import { text } from '@opus/experience-model';

import type { ProductRegistration } from './contract';
import type { ComposedRegistry } from './registry';

/** Where a matched signal came from, so an explanation can cite it. */
export type SignalOrigin = 'intentSignal' | 'terminology' | 'glossary' | 'domain' | 'entity' | 'name';

export interface MatchedSignal {
  signal: string;
  origin: SignalOrigin;
  weight: number;
}

export interface ProductScore {
  productId: string;
  score: number;
  matched: MatchedSignal[];
}

export type ProductIdentification =
  | {
      outcome: 'resolved';
      productId: string;
      scores: ProductScore[];
      /** True when the registry holds one identifiable product, so nothing was actually discriminated. */
      soleProduct: boolean;
      /** One line naming what made the decision, for the generation trace. */
      because: string;
    }
  | {
      outcome: 'ambiguous';
      candidates: string[];
      scores: ProductScore[];
      /** The single question to put to the user. FR-3 requires asking; this is the wording. */
      question: string;
    }
  | {
      outcome: 'unresolved';
      scores: ProductScore[];
      question: string;
      /** Words the prompt matched that belong to more than one product, and so decided nothing. */
      sharedSignals: string[];
    };

/**
 * How close the runner-up may get before the answer is "ask".
 *
 * 0.7 rather than something tighter because the failure modes are asymmetric. Asking an unnecessary
 * question costs one click. Grounding a Control dashboard in EDM's metadata produces a page that is
 * fluent, plausible, and about the wrong system — which somebody may not notice until it is in front
 * of a client.
 */
const AMBIGUITY_RATIO = 0.7;

const WEIGHTS: Record<SignalOrigin, number> = {
  // The product's own name is the strongest signal there is: the user said it.
  name: 6,
  // Vocabulary the product registered specifically so it would be identified by it.
  intentSignal: 3,
  terminology: 2,
  glossary: 2,
  // Structural: a domain name or a business entity name.
  domain: 2,
  entity: 1,
};

function normalise(value: string): string {
  return value.trim().toLowerCase().replace(/\s+/g, ' ');
}

/**
 * The shortest signal worth indexing.
 *
 * Two, not three, because domain names are routinely abbreviated — `dq` is the demo catalog's real
 * domain for data quality — and whole-word matching makes a short signal safe in a way substring
 * matching would not. One character is excluded: a signal of "a" or "x" matches everything.
 */
const MIN_SIGNAL_LENGTH = 2;

const ESCAPE = /[.*+?^${}()|[\]\\]/g;

/**
 * The forms of a signal's final word that should also match.
 *
 * Business vocabulary is used in the plural constantly — "the oldest exceptions", "which vendor feeds",
 * "aged breaks" — while a registration declares the singular, because that is how a glossary is
 * written. Without this, EDM registers "data quality exception" and fails to be identified by a prompt
 * about data quality exceptions, which is not a subtle miss.
 *
 * Deliberately naive: an -s/-es/-ies rule, plus the reverse for a signal declared in the plural. A real
 * stemmer would be a dependency and a source of surprises ("processing" → "process"), and every case it
 * would additionally catch is one a product owner can fix by adding an `intentSignal` — which is the
 * mechanism FR-20 wants exercised anyway.
 */
function inflections(word: string): string[] {
  const forms = new Set([word]);
  if (/[^aeiou]y$/.test(word)) forms.add(`${word.slice(0, -1)}ies`);
  else if (/(?:s|x|z|ch|sh)$/.test(word)) forms.add(`${word}es`);
  else forms.add(`${word}s`);

  // A signal already in the plural should match a singular prompt: "late files" against "a late file".
  const singular = /ies$/.test(word)
    ? `${word.slice(0, -3)}y`
    : /[^s]s$/.test(word)
      ? word.slice(0, -1)
      : null;
  if (singular && singular.length >= MIN_SIGNAL_LENGTH) forms.add(singular);

  return [...forms];
}

/** A signal matches when it appears as a whole word or phrase, not as a substring. */
function mentions(haystack: string, signal: string): boolean {
  if (signal.length < MIN_SIGNAL_LENGTH) return false;
  const words = signal.split(' ');
  const last = words[words.length - 1]!;
  const head = words.slice(0, -1).map((w) => w.replace(ESCAPE, '\\$&'));
  const tail = inflections(last).map((w) => w.replace(ESCAPE, '\\$&'));
  const phrase = [...head, `(?:${tail.join('|')})`].join('\\s+');
  return new RegExp(`(?:^|[^a-z0-9])${phrase}(?:$|[^a-z0-9])`, 'i').test(haystack);
}

export interface IndexedSignal {
  origin: SignalOrigin;
  productIds: Set<string>;
}

/**
 * Build the signal index for a registry.
 *
 * Exported because it is the thing a product owner wants to look at when identification behaves
 * unexpectedly, and because building it is the expensive half — a caller identifying many prompts
 * against one registry should build it once.
 */
export function buildSignalIndex(
  products: readonly ProductRegistration[],
  snapshot?: CatalogSnapshot,
): Map<string, IndexedSignal> {
  const index = new Map<string, IndexedSignal>();

  const add = (raw: string | undefined, origin: SignalOrigin, productId: string) => {
    if (!raw) return;
    const signal = normalise(raw);
    if (signal.length < MIN_SIGNAL_LENGTH) return;
    const existing = index.get(signal);
    if (existing) {
      existing.productIds.add(productId);
      // Keep the strongest origin: a word that is both a domain name and a registered term should be
      // scored as the term, which is the more deliberate declaration.
      if (WEIGHTS[origin] > WEIGHTS[existing.origin]) existing.origin = origin;
      return;
    }
    index.set(signal, { origin, productIds: new Set([productId]) });
  };

  for (const product of products) {
    add(text(product.name, product.id), 'name', product.id);
    add(product.id, 'name', product.id);
    for (const domain of product.metadata?.domains ?? []) add(domain, 'domain', product.id);
    for (const entry of product.metadata?.glossary ?? []) add(entry.term, 'glossary', product.id);
    for (const term of product.aiContext?.terminology ?? []) add(term.term, 'terminology', product.id);
    for (const signal of product.aiContext?.intentSignals ?? []) add(signal, 'intentSignal', product.id);
  }

  // Entity business names, where a snapshot is available. These are the weakest signals and the most
  // numerous, which is the right combination: they broaden coverage without being able to outvote a
  // product's own declared vocabulary.
  if (snapshot) {
    for (const product of products) {
      const domains = new Set(product.metadata?.domains ?? []);
      const explicit = new Set(product.metadata?.entities ?? []);
      for (const [entityId, entity] of Object.entries(snapshot.entities)) {
        const domain = entity.domain ?? entityId.split('.')[0];
        if (!explicit.has(entityId) && !(domain && domains.has(domain))) continue;
        add(text(entity.businessName, ''), 'entity', product.id);
        for (const synonym of entity.synonyms ?? []) add(synonym, 'entity', product.id);
      }
    }
  }

  return index;
}

/** Products eligible to be identified. Deprecated products still render, but are not proposed. */
function identifiable(products: readonly ProductRegistration[]): ProductRegistration[] {
  return products.filter((p) => (p.status ?? 'active') !== 'deprecated');
}

function listProducts(products: readonly ProductRegistration[]): string {
  const names = products.map((p) => text(p.name, p.id));
  if (names.length <= 1) return names[0] ?? 'none';
  return `${names.slice(0, -1).join(', ')} or ${names[names.length - 1]}`;
}

/**
 * Identify the product a prompt concerns.
 *
 * `prompt` is the user's own words rather than `intake`'s extracted terms, deliberately: extraction
 * strips framing to improve *retrieval* precision, and a product name is exactly the kind of proper
 * noun that framing removal is indifferent to but phrase matching needs intact. Multi-word signals
 * ("file load", "security master") do not survive tokenisation either.
 */
export function identifyProduct(
  prompt: string,
  registry: ComposedRegistry,
  snapshot?: CatalogSnapshot,
  index = buildSignalIndex(identifiable(registry.products), snapshot),
): ProductIdentification {
  const eligible = identifiable(registry.products);
  const haystack = normalise(prompt);

  const scores = new Map<string, ProductScore>();
  for (const product of eligible) {
    scores.set(product.id, { productId: product.id, score: 0, matched: [] });
  }

  const sharedSignals: string[] = [];
  for (const [signal, entry] of index) {
    if (!mentions(haystack, signal)) continue;
    if (entry.productIds.size > 1) {
      // Matched, and worth nothing: it cannot tell these products apart. Recorded so the reason a
      // score is low is inspectable rather than mysterious.
      sharedSignals.push(signal);
      continue;
    }
    const productId = [...entry.productIds][0]!;
    const score = scores.get(productId);
    if (!score) continue;
    score.score += WEIGHTS[entry.origin];
    score.matched.push({ signal, origin: entry.origin, weight: WEIGHTS[entry.origin] });
  }

  const ranked = [...scores.values()].sort(
    (a, b) => b.score - a.score || a.productId.localeCompare(b.productId),
  );
  const top = ranked[0];
  const runnerUp = ranked[1];

  if (!top || top.score === 0) {
    return {
      outcome: 'unresolved',
      scores: ranked,
      question:
        eligible.length === 0
          ? 'No products are registered, so there is no metadata to build against. Register a product through the Product Integration Contract first.'
          : `Which product should this cover — ${listProducts(eligible)}? Nothing in the request names one, and grounding it in the wrong product's metadata would produce a plausible page about the wrong system.`,
      sharedSignals: [...new Set(sharedSignals)].sort(),
    };
  }

  if (runnerUp && runnerUp.score > 0 && runnerUp.score >= top.score * AMBIGUITY_RATIO) {
    const tied = ranked.filter((s) => s.score >= top.score * AMBIGUITY_RATIO);
    const named = tied
      .map((s) => text(eligible.find((p) => p.id === s.productId)?.name, s.productId))
      .join(' or ');
    return {
      outcome: 'ambiguous',
      candidates: tied.map((s) => s.productId),
      scores: ranked,
      question: `This could be ${named} — the request matches both. Which did you mean? (A single Experience spanning more than one product is not something the platform models yet.)`,
    };
  }

  const cited = top.matched
    .slice()
    .sort((a, b) => b.weight - a.weight)
    .slice(0, 3)
    .map((m) => `"${m.signal}"`)
    .join(', ');

  return {
    outcome: 'resolved',
    productId: top.productId,
    scores: ranked,
    soleProduct: eligible.length === 1,
    because:
      eligible.length === 1
        ? `${text(eligible[0]!.name, top.productId)} is the only product registered in this tenant, so nothing was discriminated${cited ? ` (the request did match ${cited})` : ''}.`
        : `Matched ${cited} — vocabulary only ${text(eligible.find((p) => p.id === top.productId)?.name, top.productId)} registers.`,
  };
}
