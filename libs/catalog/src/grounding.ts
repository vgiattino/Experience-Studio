/**
 * The grounding pack (ai-architecture.md §3.3).
 *
 * A compact, designed projection of the retrieved catalog subset — not a database dump.
 * Serializing raw catalog JSON is wasteful and, more importantly, harmful: irrelevant
 * structure dilutes attention and degrades binding accuracy. This is a designed
 * representation with its own tests.
 *
 * It also carries exactly what the generator needs to avoid the mistakes the validator
 * would otherwise catch: allowed aggregations, filterability, groupability, real enum
 * values, and whether an entity requires a filter.
 */

import { text, type Aggregation, type DataType, type QualifiedRef } from '@opus/contracts';

import type { RetrievalResult } from './retrieval';
import type { CatalogSnapshot } from './types';

export interface GroundedAttribute {
  ref: string;
  name: string;
  dataType: DataType;
  semanticType?: string;
  filterable: boolean;
  groupable: boolean;
  /** Included only when the set is small enough to be useful. */
  enumValues?: string[];
  isTemporal: boolean;
  isKey: boolean;
}

export interface GroundedMeasure {
  ref: string;
  name: string;
  valueType: string;
  allowedAggregations: Aggregation[];
  defaultAggregation: Aggregation;
  higherIsBetter?: boolean;
  hasThresholds: boolean;
  description?: string;
}

export interface GroundedEntity {
  ref: QualifiedRef;
  name: string;
  plural?: string;
  description?: string;
  primaryKey: string[];
  labelAttribute?: string;
  requiresFilter: boolean;
  costClass?: string;
  whenToUse?: string;
  attributes: GroundedAttribute[];
  measures: GroundedMeasure[];
  /** Why this entity is in the pack — useful when reviewing a generation. */
  retrievedVia: string[];
}

export interface GroundingPack {
  catalogVersion: number;
  entities: GroundedEntity[];
  relationships: { from: QualifiedRef; to: QualifiedRef; name: string; cardinality: string }[];
  /** Concepts the retriever considered but dropped, for explainability. */
  droppedEntities: QualifiedRef[];
  /** Rough token estimate, so context assembly can enforce a budget. */
  estimatedTokens: number;
}

const MAX_ENUM_VALUES = 8;
const TEMPORAL_TYPES = new Set<DataType>(['date', 'datetime', 'time']);

export function buildGroundingPack(
  snapshot: CatalogSnapshot,
  retrieval: RetrievalResult,
): GroundingPack {
  const keptIds = retrieval.entities.map((e) => e.concept.id);

  const entities: GroundedEntity[] = retrieval.entities.map((scored) => {
    const entity = scored.concept;

    // Attributes: the retrieved ones first, then enough of the rest to make the entity
    // usable — a table needs columns the prompt never mentioned.
    const retrievedRefs = new Set(
      retrieval.attributes
        .filter((a) => a.concept.entityId === entity.id)
        .map((a) => a.concept.id),
    );

    const all = Object.values(entity.attributes);
    const ordered = [
      ...all.filter((a) => retrievedRefs.has(a.id)),
      ...all.filter((a) => !retrievedRefs.has(a.id) && !a.deprecated),
    ];

    const attributes = ordered.slice(0, 14).map<GroundedAttribute>((attribute) => ({
      ref: attribute.id,
      name: text(attribute.businessName),
      dataType: attribute.dataType,
      semanticType:
        attribute.semanticType && attribute.semanticType !== 'none'
          ? attribute.semanticType
          : undefined,
      filterable: attribute.filterable !== false,
      groupable: attribute.groupable !== false,
      enumValues:
        attribute.enumValues && attribute.enumValues.length <= MAX_ENUM_VALUES
          ? attribute.enumValues.map((v) => v.value)
          : undefined,
      isTemporal: TEMPORAL_TYPES.has(attribute.dataType),
      isKey: entity.primaryKey.includes(attribute.id),
    }));

    const measures = Object.values(entity.measures)
      .filter((m) => !m.deprecated)
      .map<GroundedMeasure>((measure) => ({
        ref: measure.id,
        name: text(measure.businessName),
        valueType: measure.valueType,
        allowedAggregations: [...measure.allowedAggregations],
        defaultAggregation: measure.defaultAggregation,
        higherIsBetter: measure.higherIsBetter,
        hasThresholds: (measure.defaultThresholds?.length ?? 0) > 0,
        description: measure.description,
      }));

    return {
      ref: entity.id,
      name: text(entity.businessName),
      plural: entity.pluralName ? text(entity.pluralName) : undefined,
      description: entity.description,
      primaryKey: entity.primaryKey,
      labelAttribute: entity.labelAttribute,
      requiresFilter: entity.cost?.requiresFilter === true,
      costClass: entity.cost?.class,
      whenToUse: entity.aiHints?.whenToUse,
      attributes,
      measures,
      retrievedVia: scored.via,
    };
  });

  const relationships = snapshot.relationships
    .filter((r) => keptIds.includes(r.from) && keptIds.includes(r.to))
    .map((r) => ({
      from: r.from,
      to: r.to,
      name: text(r.businessName),
      cardinality: r.cardinality,
    }));

  const dropped = Object.keys(snapshot.entities).filter((id) => !keptIds.includes(id));

  const pack: GroundingPack = {
    catalogVersion: snapshot.catalogVersion,
    entities,
    relationships,
    droppedEntities: dropped,
    estimatedTokens: 0,
  };
  pack.estimatedTokens = estimateTokens(pack);
  return pack;
}

/**
 * Serialization sent to the model. Deliberately terse and STABLY ORDERED: identical
 * requests must produce identical context, or prompt caching never hits and generation
 * stops being reproducible.
 */
export function serializeGroundingPack(pack: GroundingPack): string {
  const lines: string[] = [`# Available data (catalog v${pack.catalogVersion})`];

  for (const entity of pack.entities) {
    lines.push('');
    lines.push(`## entity ${entity.ref} — ${entity.name}${entity.plural ? ` (${entity.plural})` : ''}`);
    if (entity.description) lines.push(`   ${entity.description}`);
    if (entity.whenToUse) lines.push(`   use when: ${entity.whenToUse}`);
    lines.push(`   key: ${entity.primaryKey.join(', ')}${entity.requiresFilter ? ' | REQUIRES A FILTER' : ''}`);

    if (entity.measures.length) {
      lines.push('   measures:');
      for (const m of entity.measures) {
        const parts = [
          `${m.ref} (${m.name})`,
          `type=${m.valueType}`,
          `agg=[${m.allowedAggregations.join('|')}]`,
          `default=${m.defaultAggregation}`,
        ];
        if (m.higherIsBetter !== undefined) parts.push(`higherIsBetter=${m.higherIsBetter}`);
        if (m.hasThresholds) parts.push('hasThresholds');
        lines.push(`     - ${parts.join(' ')}`);
      }
    }

    lines.push('   attributes:');
    for (const a of entity.attributes) {
      const parts = [`${a.ref} (${a.name})`, a.dataType];
      if (a.semanticType) parts.push(a.semanticType);
      if (!a.filterable) parts.push('notFilterable');
      if (!a.groupable) parts.push('notGroupable');
      if (a.isTemporal) parts.push('temporal');
      if (a.isKey) parts.push('key');
      if (a.enumValues) parts.push(`values=[${a.enumValues.join('|')}]`);
      lines.push(`     - ${parts.join(' ')}`);
    }
  }

  if (pack.relationships.length) {
    lines.push('');
    lines.push('## relationships');
    for (const r of pack.relationships) {
      lines.push(`   - ${r.from} -> ${r.to} (${r.name}, ${r.cardinality})`);
    }
  }

  return lines.join('\n');
}

/** Four characters per token is the conventional rough estimate; good enough to budget. */
export function estimateTokens(pack: GroundingPack): number {
  return Math.ceil(serializeGroundingPack(pack).length / 4);
}
