/**
 * Level 3: semantic validation against the catalog (schemas/README.md §5).
 *
 * The level that answers "do the things this page names actually exist, and may they be used
 * the way this page uses them?" It was listed as server-only in M1 because it needs a catalog,
 * and it is implemented here now because the AI generator needs it: without it, an illegal
 * model decision is either silently corrected — which makes provenance a lie and leaves the
 * repair loop unexercised — or reaches the gateway and fails at render.
 *
 * WHY THIS IS NOT COUPLED TO @opus/catalog. The validator takes a minimal structural
 * interface, which `CatalogSnapshot` satisfies without either library depending on the other.
 * That keeps the validator usable server-side against a stored catalog, client-side against a
 * projection, and in tests against a literal — and it keeps the dependency direction of the
 * layering intact.
 *
 * ENTITLEMENT IS NOT VALIDATED HERE. Level 3 checks that a reference is *meaningful*; level 5
 * checks that the caller may *use* it. Conflating them would make a definition's validity
 * depend on who validated it, and a definition is not a security boundary
 * (security-architecture.md §4).
 */

import type { DataSource, FilterNode, PageDefinition } from '@opus/contracts';

import type { ValidationFinding } from './types';

/** The shape level 3 needs. `CatalogSnapshot` satisfies it structurally. */
export interface SemanticCatalog {
  entities: Readonly<
    Record<
      string,
      {
        attributes: Readonly<
          Record<string, { groupable?: boolean; filterable?: boolean; dataType?: string }>
        >;
        measures: Readonly<Record<string, { allowedAggregations: readonly string[] }>>;
        cost?: { requiresFilter?: boolean };
      }
    >
  >;
}

/** Operators that constrain nothing on their own and so cannot satisfy `requiresFilter`. */
const NON_SELECTIVE = new Set(['isNull', 'isNotNull']);

export function validateSemantics(
  def: PageDefinition,
  catalog: SemanticCatalog,
  findings: ValidationFinding[],
): void {
  for (const [id, source] of Object.entries(def.dataSources ?? {})) {
    const path = `/dataSources/${id}`;
    const entity = catalog.entities[source.entity];

    if (!entity) {
      findings.push({
        level: 'semantic',
        severity: 'error',
        category: 'semantic',
        path: `${path}/entity`,
        code: 'semantic.unknownEntity',
        message: `Entity "${source.entity}" is not in the catalog`,
      });
      // Everything below would report the same root cause a dozen times over.
      continue;
    }

    for (const [index, attribute] of (source.select.attributes ?? []).entries()) {
      if (!entity.attributes[attribute.attribute]) {
        findings.push({
          level: 'semantic',
          severity: 'error',
          category: 'semantic',
          path: `${path}/select/attributes/${index}/attribute`,
          code: 'semantic.unknownAttribute',
          message: `"${attribute.attribute}" is not an attribute of ${source.entity}`,
        });
      }
    }

    for (const [index, measure] of (source.select.measures ?? []).entries()) {
      const defined = entity.measures[measure.measure];
      if (!defined) {
        findings.push({
          level: 'semantic',
          severity: 'error',
          category: 'semantic',
          path: `${path}/select/measures/${index}/measure`,
          code: 'semantic.unknownMeasure',
          message: `"${measure.measure}" is not a measure of ${source.entity}`,
        });
        continue;
      }
      if (measure.aggregation && !defined.allowedAggregations.includes(measure.aggregation)) {
        findings.push({
          level: 'semantic',
          severity: 'error',
          category: 'semantic',
          path: `${path}/select/measures/${index}/aggregation`,
          code: 'semantic.disallowedAggregation',
          message: `Measure "${measure.measure}" does not allow "${measure.aggregation}" — allowed: ${defined.allowedAggregations.join(', ')}`,
        });
      }
    }

    for (const [index, dimension] of (source.select.dimensions ?? []).entries()) {
      const attribute = entity.attributes[dimension.attribute];
      if (!attribute) {
        findings.push({
          level: 'semantic',
          severity: 'error',
          category: 'semantic',
          path: `${path}/select/dimensions/${index}/attribute`,
          code: 'semantic.unknownAttribute',
          message: `"${dimension.attribute}" is not an attribute of ${source.entity}`,
        });
        continue;
      }
      // Grouping by a high-cardinality identifier produces one row per record: a chart with
      // a million categories, or an aggregate that is not one.
      if (attribute.groupable === false) {
        findings.push({
          level: 'semantic',
          severity: 'error',
          category: 'semantic',
          path: `${path}/select/dimensions/${index}/attribute`,
          code: 'semantic.notGroupable',
          message: `Attribute "${dimension.attribute}" cannot be used as a grouping dimension`,
        });
      }
    }

    const targets = filterTargets(source.filter);
    for (const target of targets) {
      const attribute = entity.attributes[target.name];
      if (!attribute) {
        findings.push({
          level: 'semantic',
          severity: 'error',
          category: 'semantic',
          path: `${path}/filter`,
          code: 'semantic.unknownFilterTarget',
          message: `Filter targets "${target.name}", which is not an attribute of ${source.entity}`,
        });
        continue;
      }
      if (attribute.filterable === false) {
        findings.push({
          level: 'semantic',
          severity: 'error',
          category: 'semantic',
          path: `${path}/filter`,
          code: 'semantic.notFilterable',
          message: `Attribute "${target.name}" is not filterable`,
        });
      }
    }

    // A `requiresFilter` entity is one whose unfiltered scan is a cost incident. An unset
    // optional filter channel does not count: `skipWhenEmpty` means it may constrain nothing.
    if (entity.cost?.requiresFilter) {
      const binding = targets.some((t) => !NON_SELECTIVE.has(t.operator) && !t.skipWhenEmpty);
      if (!binding) {
        findings.push({
          level: 'semantic',
          severity: 'error',
          category: 'semantic',
          path: `${path}/filter`,
          code: 'semantic.filterRequired',
          message: `Entity "${source.entity}" requires at least one filter that always constrains`,
        });
      }
    }
  }
}

interface FilterTarget {
  name: string;
  operator: string;
  skipWhenEmpty: boolean;
}

function filterTargets(node: FilterNode | undefined): FilterTarget[] {
  if (!node) return [];
  if ('all' in node) return node.all.flatMap(filterTargets);
  if ('any' in node) return node.any.flatMap(filterTargets);
  if ('not' in node) return filterTargets(node.not);
  return [
    {
      name: node.target,
      operator: node.operator,
      // The schema default is true, so an omitted flag means "may constrain nothing".
      skipWhenEmpty: node.skipWhenEmpty !== false && isDeferredValue(node.value),
    },
  ];
}

/** A page-state wrapper may resolve to nothing at render; a literal cannot. */
function isDeferredValue(value: unknown): boolean {
  if (value === null || value === undefined) return false;
  if (typeof value !== 'object' || Array.isArray(value)) return false;
  const keys = Object.keys(value as object);
  return (
    keys.length === 1 &&
    ['$param', '$filter', '$selection', '$expr', '$context'].includes(keys[0]!)
  );
}

/** Exposed so the semantic level can be run on a single source, e.g. during editing. */
export function semanticFindingsFor(
  source: DataSource,
  catalog: SemanticCatalog,
): ValidationFinding[] {
  const findings: ValidationFinding[] = [];
  validateSemantics(
    { dataSources: { [source.id]: source } } as unknown as PageDefinition,
    catalog,
    findings,
  );
  return findings;
}
