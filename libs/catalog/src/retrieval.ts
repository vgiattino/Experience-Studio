/**
 * Hybrid catalog retrieval (ai-architecture.md §3).
 *
 * Three complementary strategies, because each fails differently:
 *
 *   LEXICAL   trigram/token overlap on business names and synonyms. Catches exact domain
 *             vocabulary — "ISIN", "SEDOL", "late files" — where embeddings are weak.
 *   SEMANTIC  a similarity score standing in for an embedding index.
 *   GRAPH     relationship expansion, so naming "security" also surfaces its exceptions.
 *
 * WHAT IS REAL HERE and what is a stand-in, stated plainly:
 *   - Real: the fusion, the entitlement scoping (the input snapshot is already projected for
 *     the caller), the graph expansion bounded by traversal cost, the reranking, and the
 *     budget truncation. Swapping in pgvector changes `semanticScore` and nothing else.
 *   - Stand-in: `semanticScore` is lexical-overlap-based, not a learned embedding. It will
 *     match paraphrase far less well than a real index. That limit is the reason
 *     ai-architecture.md §3.1 wants all three strategies rather than vectors alone.
 */

import type { QualifiedRef } from '@opus/contracts';
import { text } from '@opus/contracts';

import type { CatalogAttribute, CatalogEntity, CatalogMeasure, CatalogSnapshot } from './types';

export interface RetrievalQuery {
  /** Free text — normally the extracted concepts, not the raw prompt. */
  terms: readonly string[];
  /** Entities the caller named explicitly, if any. */
  entityHints?: readonly QualifiedRef[];
  /** Maximum entities to return after fusion. */
  maxEntities?: number;
  /** Relationship hops to expand from a seed entity. */
  graphHops?: number;
}

export interface ScoredConcept<T> {
  concept: T;
  score: number;
  /** Which strategies contributed, for explainability in the dev panel. */
  via: ('lexical' | 'semantic' | 'graph' | 'hint')[];
}

export interface RetrievalResult {
  entities: ScoredConcept<CatalogEntity>[];
  measures: ScoredConcept<CatalogMeasure>[];
  attributes: ScoredConcept<CatalogAttribute>[];
  /** Entities reached only by graph expansion, so the caller can see what was inferred. */
  expandedFrom: Record<QualifiedRef, QualifiedRef[]>;
}

const TRAVERSAL_COST_BUDGET: Record<string, number> = {
  low: 1,
  medium: 0.6,
  high: 0.25,
  veryHigh: 0,
};

function normalize(value: string): string[] {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, ' ')
    .split(/[\s-]+/)
    .filter((t) => t.length > 1 && !STOP_WORDS.has(t));
}

const STOP_WORDS = new Set([
  'the', 'and', 'for', 'with', 'show', 'showing', 'create', 'me', 'my', 'a', 'an', 'of', 'in',
  'on', 'to', 'by', 'all', 'any', 'that', 'this', 'dashboard', 'page', 'view', 'please',
]);

/** Token overlap, length-normalised. Stands in for an embedding similarity. */
function similarity(queryTokens: readonly string[], candidate: string): number {
  const candidateTokens = normalize(candidate);
  if (!candidateTokens.length || !queryTokens.length) return 0;
  const set = new Set(candidateTokens);
  let hits = 0;
  for (const token of queryTokens) {
    if (set.has(token)) {
      hits += 1;
      continue;
    }
    // Partial credit for stem-like prefixes: "exceptions" ~ "exception".
    for (const candidateToken of set) {
      if (candidateToken.startsWith(token) || token.startsWith(candidateToken)) {
        hits += 0.6;
        break;
      }
    }
  }
  return hits / Math.sqrt(queryTokens.length * candidateTokens.length);
}

/** Exact or synonym match, which should outrank fuzzy similarity. */
function lexical(queryTokens: readonly string[], names: readonly string[]): number {
  let best = 0;
  for (const name of names) {
    const nameTokens = normalize(name);
    if (!nameTokens.length) continue;
    const matched = nameTokens.filter((t) => queryTokens.includes(t)).length;
    if (matched === 0) continue;
    // A fully-matched short name is the strongest signal available.
    best = Math.max(best, matched / nameTokens.length);
  }
  return best;
}

function namesOf(concept: { businessName: unknown; synonyms?: readonly string[]; id: string }): string[] {
  return [text(concept.businessName as never), ...(concept.synonyms ?? []), concept.id];
}

export function retrieve(snapshot: CatalogSnapshot, query: RetrievalQuery): RetrievalResult {
  const tokens = query.terms.flatMap(normalize);
  const maxEntities = query.maxEntities ?? 4;
  const hops = query.graphHops ?? 1;

  const entityScores = new Map<QualifiedRef, ScoredConcept<CatalogEntity>>();

  const bump = (
    entity: CatalogEntity,
    score: number,
    via: ScoredConcept<CatalogEntity>['via'][number],
  ) => {
    const existing = entityScores.get(entity.id);
    if (existing) {
      existing.score = Math.max(existing.score, score);
      if (!existing.via.includes(via)) existing.via.push(via);
    } else {
      entityScores.set(entity.id, { concept: entity, score, via: [via] });
    }
  };

  // ── entities: lexical + semantic, plus explicit hints
  for (const entity of Object.values(snapshot.entities)) {
    const names = namesOf(entity);
    if (entity.pluralName) names.push(text(entity.pluralName));
    const lex = lexical(tokens, names);
    const sem = similarity(tokens, [...names, entity.description ?? ''].join(' '));
    if (lex > 0) bump(entity, 1 + lex, 'lexical');
    if (sem > 0.12) bump(entity, sem, 'semantic');
  }
  for (const hint of query.entityHints ?? []) {
    const entity = snapshot.entities[hint];
    if (entity) bump(entity, 3, 'hint');
  }

  // ── measures and attributes, scored independently so a page can be built from a
  //    measure the prompt named even when its entity was not named.
  const measureScores: ScoredConcept<CatalogMeasure>[] = [];
  const attributeScores: ScoredConcept<CatalogAttribute>[] = [];

  for (const entity of Object.values(snapshot.entities)) {
    for (const measure of Object.values(entity.measures)) {
      const names = namesOf(measure);
      const lex = lexical(tokens, names);
      const sem = similarity(tokens, [...names, measure.description ?? ''].join(' '));
      const score = lex > 0 ? 1 + lex : sem;
      if (score > 0.12) {
        measureScores.push({ concept: measure, score, via: lex > 0 ? ['lexical'] : ['semantic'] });
        // A named measure implies its entity, even if the entity itself was not named.
        bump(entity, Math.max(0.9, score * 0.9), lex > 0 ? 'lexical' : 'semantic');
      }
    }
    for (const attribute of Object.values(entity.attributes)) {
      const names = namesOf(attribute);
      const lex = lexical(tokens, names);
      const sem = similarity(tokens, [...names, attribute.description ?? ''].join(' '));
      const score = lex > 0 ? 1 + lex : sem;
      if (score > 0.18) {
        attributeScores.push({
          concept: attribute,
          score,
          via: lex > 0 ? ['lexical'] : ['semantic'],
        });
      }
    }
  }

  // ── graph expansion from the seeds, bounded by traversal cost so a highly-connected
  //    entity cannot pull in the whole catalog.
  const expandedFrom: Record<QualifiedRef, QualifiedRef[]> = {};
  let frontier = [...entityScores.values()].filter((e) => e.score >= 0.9).map((e) => e.concept.id);

  for (let hop = 0; hop < hops; hop++) {
    const next: QualifiedRef[] = [];
    for (const relationship of snapshot.relationships) {
      if (!frontier.includes(relationship.from)) continue;
      const target = snapshot.entities[relationship.to];
      if (!target) continue;
      const costFactor = TRAVERSAL_COST_BUDGET[relationship.traversalCost ?? 'medium'] ?? 0.6;
      if (costFactor === 0) continue;
      const seedScore = entityScores.get(relationship.from)?.score ?? 1;
      const score = seedScore * costFactor * 0.5;
      if (score <= 0.1) continue;
      if (!entityScores.has(target.id)) {
        (expandedFrom[target.id] ??= []).push(relationship.from);
        next.push(target.id);
      }
      bump(target, score, 'graph');
    }
    frontier = next;
    if (!frontier.length) break;
  }

  const byScore = <T>(a: ScoredConcept<T>, b: ScoredConcept<T>) => b.score - a.score;

  const entities = [...entityScores.values()].sort(byScore).slice(0, maxEntities);
  const keptEntityIds = new Set(entities.map((e) => e.concept.id));

  return {
    entities,
    // Truncate by rank, and only within the entities that survived.
    measures: measureScores
      .filter((m) => keptEntityIds.has(m.concept.entityId))
      .sort(byScore)
      .slice(0, 12),
    attributes: attributeScores
      .filter((a) => keptEntityIds.has(a.concept.entityId))
      .sort(byScore)
      .slice(0, 24),
    expandedFrom,
  };
}
