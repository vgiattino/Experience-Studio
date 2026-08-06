/**
 * Draft + steward decisions → a catalog. The gate between a machine's guess and a governed vocabulary.
 *
 * ── INCLUSION IS EXPLICIT, AND THAT IS THE WHOLE DESIGN ─────────────────────────────────
 * Nothing reaches the catalog because a scan found it. Every entity, attribute and measure is in the
 * catalog because a `StewardDecisions` entry says `include: true`. `defaultDecisions()` exists so the
 * review starts from "all of it" rather than an empty form — but the default is *data a UI renders and a
 * person submits*, not a code path that promotes unreviewed.
 *
 * The distinction is not pedantry. A scan of an EDM database finds staging tables, audit tables, a
 * `PASSWORD_HISTORY` somebody left in `dbo`, and forty columns of ETL bookkeeping. A pipeline that
 * promotes what it finds produces a catalog whose vocabulary is a database's internals, and business
 * users then search a "governed" catalog full of `ROWID_BATCH_SEQ`.
 *
 * ── THREE RULES THIS ENFORCES REGARDLESS OF WHAT THE DECISIONS SAY ──────────────────────
 *   1. **A suspected-personal column needs an entitlement or an explicit acknowledgement.** Without one
 *      it is left out and reported. Defaulting the other way makes the first promotion of an HR-adjacent
 *      schema a disclosure, and "the steward clicked accept" is not a control.
 *   2. **An entity needs a row entitlement.** `projectionFor` treats an absent one as "everyone", so an
 *      entity promoted without one is visible to every user of the tenant. One is derived and reported
 *      rather than omitted, because an over-tight default is a support ticket and an absent one is a leak.
 *   3. **Entities the catalog already has are never dropped by a promotion.** A source that no longer
 *      exposes a table keeps its entity, marked and reported. Removing it silently breaks every page
 *      bound to it, and un-breaking a page is much harder than deleting an entity a steward meant to
 *      delete.
 *
 * ── AND WHY IT MERGES RATHER THAN REPLACES ──────────────────────────────────────────────
 * A catalog spans sources. Promoting a scan of the vendor schema must not touch entities built over
 * another database, so the merge is keyed on `physical.sourceId` and everything else is carried through
 * untouched.
 */

import type { Aggregation, QualifiedRef, Sensitivity } from '@opus/contracts';
import type {
  RawAttribute,
  RawCatalog,
  RawEntity,
  RawMeasure,
  RawRelationship,
} from '@opus/catalog';

import type { CatalogDraft, DraftAttribute, DraftEntity, DraftMeasure } from './infer';

export interface AttributeDecision {
  include: boolean;
  /** Overrides the inferred name. The most common edit a steward makes. */
  businessName?: string;
  description?: string;
  synonyms?: string[];
  sensitivity?: Sensitivity;
  /** The capability a caller needs to see this attribute at all. */
  columnEntitlement?: string;
  maskingPolicy?: string;
  /**
   * Set when a steward has looked at a personal-data flag and decided it is not personal data.
   *
   * Explicit because the flag is a guess and a wrong guess in either direction is expensive: a
   * securities master's `ISSUER_ADDRESS_LINE_1` is not somebody's home address, and treating it as one
   * puts an entitlement on a column every page needs.
   */
  notPersonal?: boolean;
}

export interface MeasureDecision {
  include: boolean;
  businessName?: string;
  description?: string;
  synonyms?: string[];
  /** A business fact inference deliberately leaves unset. See `inferMeasures`. */
  higherIsBetter?: boolean;
  defaultAggregation?: Aggregation;
  columnEntitlement?: string;
}

export interface EntityDecision {
  include: boolean;
  businessName?: string;
  pluralName?: string;
  description?: string;
  synonyms?: string[];
  domain?: string;
  sensitivity?: Sensitivity;
  /** The capability a caller needs to see this entity's rows. Required; derived if absent. */
  rowEntitlementDomain?: string;
  /** The logical data source the gateway routes through. Derived from the source if absent. */
  logicalDataSourceId?: string;
  attributes: Record<string, AttributeDecision>;
  measures: Record<string, MeasureDecision>;
}

export interface StewardDecisions {
  /** Who approved it. Recorded in the catalog's audit block — a promotion has an author. */
  approvedBy: string;
  /** Keyed by draft entity ref. An entity absent from this map is not promoted. */
  entities: Record<string, EntityDecision>;
}

/**
 * Why a note exists, machine-readable.
 *
 * Beside the prose rather than instead of it, and both are needed. The message is what a steward reads;
 * the code is what a screen groups by — a promotion of ten entities produces ten near-identical
 * "no row entitlement was set" notes, and a list that prints all ten buries the two refusals that
 * actually need a decision. Grouping on the message text would work until somebody improved a sentence.
 */
export type PromotionNoteCode =
  | 'not-reviewed'
  | 'excluded'
  | 'personal-unentitled'
  | 'no-attributes'
  | 'key-missing'
  | 'measure-column-missing'
  | 'relationship-incomplete'
  | 'entitlement-derived'
  | 'label-dropped'
  | 'kept-though-absent';

export interface PromotionNote {
  subject: string;
  message: string;
  /** `refused` means it did not go in. `applied` means it did, with something worth knowing. */
  kind: 'refused' | 'applied';
  code: PromotionNoteCode;
}

export interface PromotionResult {
  catalog: RawCatalog;
  notes: PromotionNote[];
  counts: { entities: number; attributes: number; measures: number; relationships: number };
}

/**
 * A decision set that includes everything promotable, for a review UI to start from.
 *
 * Two deliberate exceptions to "everything": an entity with a blocking problem is not offered, and a
 * suspected-personal attribute is offered with `include: true` and no entitlement — so it appears in the
 * review, and `promote` refuses it until the steward supplies one. A default that quietly excluded it
 * would hide the decision; a default that quietly included it would make the decision.
 */
export function defaultDecisions(draft: CatalogDraft, approvedBy: string): StewardDecisions {
  const blocked = new Set(
    draft.problems.filter((problem) => problem.severity === 'blocking').map((problem) => problem.subject),
  );

  const entities: Record<string, EntityDecision> = {};
  for (const entity of draft.entities) {
    if (blocked.has(entity.physicalTable)) continue;
    entities[entity.ref] = {
      include: true,
      attributes: Object.fromEntries(
        entity.attributes.map((attribute) => [
          attribute.id,
          { include: true } satisfies AttributeDecision,
        ]),
      ),
      measures: Object.fromEntries(
        entity.measures.map((measure) => [measure.id, { include: true } satisfies MeasureDecision]),
      ),
    };
  }
  return { approvedBy, entities };
}

/**
 * Merge a reviewed draft into a catalog.
 *
 * `base` is the catalog as it stands. Pass `undefined` for the first promotion into an empty tenant;
 * everything else is a merge, because by the second source there is always something to preserve.
 */
export function promote(
  draft: CatalogDraft,
  decisions: StewardDecisions,
  base: RawCatalog | undefined,
  context: { tenantId: string; promotedAt: string },
): PromotionResult {
  const notes: PromotionNote[] = [];
  const entities: Record<QualifiedRef, RawEntity> = {};
  const relationships: Record<QualifiedRef, RawRelationship> = {};

  // Everything that is not this source's is carried through untouched.
  for (const [ref, entity] of Object.entries(base?.entities ?? {})) {
    if (entity.physical?.sourceId === draft.sourceId) continue;
    entities[ref] = entity;
  }
  for (const [ref, relationship] of Object.entries(base?.relationships ?? {})) {
    if (entities[relationship.from] && entities[relationship.to]) relationships[ref] = relationship;
  }

  const promotedRefs = new Set<string>();
  const addedRelationships = new Set<string>();
  let attributeCount = 0;
  let measureCount = 0;

  for (const entity of draft.entities) {
    const decision = decisions.entities[entity.ref];
    if (!decision?.include) {
      notes.push({
        subject: entity.ref,
        kind: 'refused',
        code: decision ? 'excluded' : 'not-reviewed',
        message: decision
          ? 'Left out: the reviewer excluded it.'
          : 'Left out: no reviewer decision was recorded for it.',
      });
      continue;
    }

    const built = buildEntity(entity, decision, draft, context, notes);
    if (!built) continue;

    entities[built.id] = built;
    promotedRefs.add(built.id);
    attributeCount += Object.keys(built.attributes).length;
    measureCount += Object.keys(built.measures ?? {}).length;
  }

  /*
    Entities this source used to expose and no longer does.

    Kept, not dropped — see rule 3 at the top of the file. Reported so a steward can delete deliberately,
    which is a different act from a scan deciding for them.
  */
  for (const [ref, entity] of Object.entries(base?.entities ?? {})) {
    if (entity.physical?.sourceId !== draft.sourceId) continue;
    if (promotedRefs.has(ref)) continue;
    entities[ref] = entity;
    notes.push({
      subject: ref,
      kind: 'applied',
      code: 'kept-though-absent',
      message:
        'This scan no longer exposes it, so it was kept as it was rather than removed. Pages bound to it keep working; delete it deliberately when you are sure.',
    });
  }

  for (const relationship of draft.relationships) {
    if (!promotedRefs.has(relationship.from) || !promotedRefs.has(relationship.to)) {
      notes.push({
        subject: relationship.id,
        kind: 'refused',
        code: 'relationship-incomplete',
        message: `Left out: it joins ${relationship.from} to ${relationship.to}, and one of those was not promoted.`,
      });
      continue;
    }
    /*
      Both key columns must have survived the attribute review.

      A relationship whose key mapping names an excluded attribute is a join the gateway cannot build —
      and it would fail at query time, on a page, in front of a user, rather than here.
    */
    const missing = relationship.keyMapping.filter(
      (pair) =>
        !entities[relationship.from]?.attributes[pair.fromAttribute] ||
        !entities[relationship.to]?.attributes[pair.toAttribute],
    );
    if (missing.length) {
      notes.push({
        subject: relationship.id,
        kind: 'refused',
        code: 'relationship-incomplete',
        message:
          'Left out: its key columns are not both exposed, so the join could not be built. Include them on both entities, or leave the relationship out.',
      });
      continue;
    }
    addedRelationships.add(relationship.id);
    relationships[relationship.id] = {
      id: relationship.id,
      businessName: relationship.businessName,
      from: relationship.from,
      to: relationship.to,
      cardinality: relationship.cardinality,
      keyMapping: relationship.keyMapping,
      traversalCost: entities[relationship.to]?.cost?.class === 'high' ? 'high' : 'low',
    };
  }

  const domains = { ...(base?.domains ?? {}) };
  for (const ref of promotedRefs) {
    const domain = entities[ref]?.domain;
    if (domain && !domains[domain]) domains[domain] = { businessName: titleCase(domain) };
  }

  const catalog: RawCatalog = {
    schemaVersion: base?.schemaVersion ?? '1.0',
    catalogVersion: (base?.catalogVersion ?? 0) + 1,
    tenantId: context.tenantId,
    name: base?.name,
    description: base?.description,
    lifecycleState: base?.lifecycleState ?? 'draft',
    entities,
    relationships,
    domains,
    audit: {
      ...(base?.audit ?? {}),
      [`promotion-${draft.sourceId}`]: {
        sourceId: draft.sourceId,
        database: draft.database,
        scannedAt: draft.scannedAt,
        serverVersion: draft.serverVersion,
        promotedAt: context.promotedAt,
        approvedBy: decisions.approvedBy,
        entities: [...promotedRefs].sort(),
      },
    },
  };

  return {
    catalog,
    notes: notes.sort((a, b) => a.subject.localeCompare(b.subject)),
    // What *this* promotion contributed, not what the merged catalog now holds. Counting the entities
    // one way and the relationships the other made a report that appeared to double the joins.
    counts: {
      entities: promotedRefs.size,
      attributes: attributeCount,
      measures: measureCount,
      relationships: addedRelationships.size,
    },
  };
}

function buildEntity(
  entity: DraftEntity,
  decision: EntityDecision,
  draft: CatalogDraft,
  context: { tenantId: string; promotedAt: string },
  notes: PromotionNote[],
): RawEntity | null {
  const attributes: Record<string, RawAttribute> = {};

  for (const attribute of entity.attributes) {
    const own = decision.attributes[attribute.id];
    if (!own?.include) continue;

    // Rule 1. A guess about personal data is resolved by a person, not by a default.
    if (attribute.suspectedPersonal && !own.columnEntitlement && !own.notPersonal) {
      notes.push({
        subject: `${entity.ref}.${attribute.id}`,
        kind: 'refused',
        code: 'personal-unentitled',
        message:
          'Left out: its name suggests personal data and no entitlement was set. Give it a column entitlement, or record that it is not personal data.',
      });
      continue;
    }
    attributes[attribute.id] = buildAttribute(attribute, own);
  }

  if (!Object.keys(attributes).length) {
    notes.push({
      subject: entity.ref,
      kind: 'refused',
      code: 'no-attributes',
      message: 'Left out: no attribute survived the review, so there would be nothing to read.',
    });
    return null;
  }

  const keyPresent = entity.primaryKey.every((id) => attributes[id]);
  if (!keyPresent) {
    notes.push({
      subject: entity.ref,
      kind: 'refused',
      code: 'key-missing',
      message: `Left out: its key (${entity.primaryKey.join(', ')}) is not fully exposed, so a row could not be identified. Include the key columns.`,
    });
    return null;
  }

  const measures: Record<string, RawMeasure> = {};
  for (const measure of entity.measures) {
    const own = decision.measures[measure.id];
    if (!own?.include) continue;
    /*
      A measure over an excluded column is refused rather than silently dropped.

      Otherwise excluding an attribute quietly removes the KPI over it, and a steward who hid a column
      from a table discovers weeks later that a dashboard number went with it.
    */
    if (measure.physicalRef && !attributes[measure.id]) {
      notes.push({
        subject: `${entity.ref}.${measure.id}`,
        kind: 'refused',
        code: 'measure-column-missing',
        message:
          'Left out: it aggregates a column that was not included. Include the column, or leave the measure out on purpose.',
      });
      continue;
    }
    measures[measure.id] = buildMeasure(measure, own);
  }

  // Rule 2. An absent row entitlement means "everyone", so one is derived and said out loud.
  let rowEntitlementDomain = decision.rowEntitlementDomain?.trim();
  if (!rowEntitlementDomain) {
    rowEntitlementDomain = `${entity.domain}.read`;
    notes.push({
      subject: entity.ref,
      kind: 'applied',
      code: 'entitlement-derived',
      message: `No row entitlement was set, so "${rowEntitlementDomain}" was derived. Until that capability is granted, nobody sees this entity — which is the safe direction, and is why it was not left blank.`,
    });
  }

  const labelAttribute =
    entity.labelAttribute && attributes[entity.labelAttribute] ? entity.labelAttribute : undefined;
  if (entity.labelAttribute && !labelAttribute) {
    notes.push({
      subject: entity.ref,
      kind: 'applied',
      code: 'label-dropped',
      message: `Rows will be labelled by their key: the proposed label column "${entity.labelAttribute}" was not included.`,
    });
  }

  void context;
  return {
    id: entity.ref,
    businessName: decision.businessName?.trim() || entity.businessName,
    pluralName: decision.pluralName?.trim() || entity.pluralName,
    synonyms: decision.synonyms?.length ? [...decision.synonyms] : undefined,
    description: decision.description?.trim() || entity.description,
    domain: decision.domain?.trim() || entity.domain,
    primaryKey: [...entity.primaryKey],
    labelAttribute,
    logicalDataSourceId: decision.logicalDataSourceId?.trim() || draft.sourceId,
    rowEntitlementDomain,
    sensitivity: decision.sensitivity,
    cost: {
      class: entity.costClass,
      typicalRowCount: entity.approxRows,
      requiresFilter: entity.requiresFilter,
    },
    physical: { ref: entity.physicalTable, sourceId: draft.sourceId },
    attributes,
    measures: Object.keys(measures).length ? measures : undefined,
  };
}

function buildAttribute(attribute: DraftAttribute, decision: AttributeDecision): RawAttribute {
  /*
    Sensitivity: the steward's value, else `pii` for an acknowledged personal column, else nothing.

    Note what this does *not* do — it does not clear `pii` when `notPersonal` is set alongside an
    entitlement. A steward who set both has said the flag was wrong; a steward who set only the
    entitlement has said it was right, and the label stays.
  */
  const sensitivity: Sensitivity | undefined =
    decision.sensitivity ??
    (attribute.suspectedPersonal && !decision.notPersonal ? 'pii' : undefined);

  return {
    id: attribute.id,
    businessName: decision.businessName?.trim() || attribute.businessName,
    synonyms: decision.synonyms?.length ? [...decision.synonyms] : undefined,
    description: decision.description?.trim() || undefined,
    dataType: attribute.dataType,
    semanticType: attribute.semanticType,
    unit: attribute.unit,
    enumValues: attribute.enumValues?.length
      ? attribute.enumValues.map((value, index) => ({ value, label: value, order: index }))
      : undefined,
    nullable: attribute.nullable,
    filterable: attribute.filterable,
    groupable: attribute.groupable,
    sortable: attribute.sortable,
    searchable: attribute.searchable,
    sensitivity,
    columnEntitlement: decision.columnEntitlement?.trim() || undefined,
    maskingPolicy: decision.maskingPolicy?.trim() || undefined,
    physical: { ref: attribute.physicalRef, sourceDataType: undefined },
  };
}

function buildMeasure(measure: DraftMeasure, decision: MeasureDecision): RawMeasure {
  const defaultAggregation =
    decision.defaultAggregation && measure.allowedAggregations.includes(decision.defaultAggregation)
      ? decision.defaultAggregation
      : measure.defaultAggregation;

  return {
    id: measure.id,
    businessName: decision.businessName?.trim() || measure.businessName,
    synonyms: decision.synonyms?.length ? [...decision.synonyms] : undefined,
    description: decision.description?.trim() || measure.description,
    valueType: measure.valueType,
    unit: measure.unit,
    allowedAggregations: [...measure.allowedAggregations],
    defaultAggregation,
    higherIsBetter: decision.higherIsBetter ?? measure.higherIsBetter,
    columnEntitlement: decision.columnEntitlement?.trim() || undefined,
    physical: measure.physicalRef ? { ref: measure.physicalRef } : undefined,
  };
}

function titleCase(raw: string): string {
  return raw
    .split(/[-_\s]+/)
    .filter(Boolean)
    .map((word) => word[0]!.toUpperCase() + word.slice(1))
    .join(' ');
}
