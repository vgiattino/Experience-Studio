/**
 * Context assembly (ai-architecture.md §4).
 *
 * Layers with a fixed priority order and an explicit budget. When the budget binds,
 * eviction proceeds from the bottom of the priority list — never opportunistically, because
 * a silently shortened grounding pack produces a plausible page bound to concepts that were
 * dropped.
 *
 * The assembled context is returned as data, not sent anywhere, so it can be inspected in
 * the UI and asserted in tests. That inspectability is the point: this is the artifact a real
 * model would consume, and if it is wrong the generation is wrong.
 *
 * The COMPONENT GENERATION VIEW (§4.2) is the other half. Full JSON Schemas for the whole
 * library would exhaust the budget and describe far more than the model needs to choose well,
 * so manifests are reduced to purpose / whenToUse / dataRequirement / key properties. The
 * reduction is safe because validation is NOT reduced: a wrong guess is caught and named.
 */

import { text, type ComponentManifest } from '@opus/contracts';
import { serializeGroundingPack, type GroundingPack } from '@opus/catalog';

import type { ExtractedConcepts, PageIntent } from './intake';
import type { LayoutTemplate, TemplateMatch } from './templates';

export type ContextLayerName =
  | 'systemContract'
  | 'componentView'
  | 'groundingPack'
  | 'currentDefinition'
  | 'exemplars'
  | 'layoutHeuristics'
  | 'userPrompt';

export interface ContextLayer {
  name: ContextLayerName;
  priority: number;
  content: string;
  estimatedTokens: number;
  evictable: boolean;
  /** Set when the layer was reduced or dropped to fit the budget. */
  reduced?: string;
}

export interface AssembledContext {
  /** Stable prefix: cacheable, and identical across calls of the same kind. */
  system: string;
  /** Request-specific content. */
  user: string;
  layers: ContextLayer[];
  estimatedTokens: number;
  budgetTokens: number;
  withinBudget: boolean;
  /** Layers dropped or reduced, so a reviewer sees what the model did not receive. */
  evicted: ContextLayerName[];
}

const TOKENS = (s: string) => Math.ceil(s.length / 4);

/**
 * The system contract. Never evicted, and deliberately terse: rules the model must not
 * break, plus the shape of the answer. It says nothing about a specific request, so a
 * provider can cache it.
 */
const SYSTEM_CONTRACT = `You design enterprise data experiences for Opus Experience Studio.

You do not write code or SQL. You choose from a fixed component vocabulary and bind those
components to a governed data catalog. You return structured data conforming to the supplied
schema — never prose, never markup.

Hard rules:
1. Reference ONLY entity, measure and attribute identifiers that appear in the supplied data
   catalog. Never invent an identifier, and never guess at one that "should" exist.
2. Use ONLY an aggregation listed in that measure's allowed aggregations.
3. Use ONLY a component type listed in the component vocabulary.
4. A chart needs a dimension for its x axis. If no suitable attribute exists, do not emit a
   chart.
5. An entity marked REQUIRES A FILTER must be filtered.
6. Prefer fewer, well-chosen widgets over many. A reader should understand the page at a
   glance.
7. Every widget needs a title a business user would recognise, taken from the catalog's
   business names rather than invented.

You are choosing WHAT the page shows. The platform assembles the page definition, validates
it, and renders it. If a choice you make is invalid you will be told precisely why and asked
to correct only that choice.`;

/** Reduce a manifest to the projection the model needs (§4.2). */
export function componentGenerationView(manifest: ComponentManifest): string {
  const lines: string[] = [`- ${manifest.type} — ${text(manifest.name)}`];
  lines.push(`  purpose: ${manifest.generation.purpose}`);
  lines.push(`  use when: ${manifest.generation.whenToUse}`);
  if (manifest.generation.whenNotToUse) {
    lines.push(`  do not use: ${manifest.generation.whenNotToUse}`);
  }
  lines.push(`  data: ${manifest.dataRequirement.shape}`);
  const roles = manifest.dataRequirement.roles ?? [];
  if (roles.length) {
    lines.push(
      `  bindings: ${roles
        .map((r) => `${r.role}${r.required ? '*' : ''}${r.repeated ? '[]' : ''} (${r.accepts.join('|')})`)
        .join(', ')}`,
    );
  }
  const keyProps = manifest.generation.keyProperties ?? [];
  if (keyProps.length) lines.push(`  key options: ${keyProps.join(', ')}`);
  return lines.join('\n');
}

export function serializeComponentVocabulary(manifests: readonly ComponentManifest[]): string {
  const eligible = manifests.filter((m) => m.generation.eligible !== false);
  return ['# Component vocabulary', ...eligible.map(componentGenerationView)].join('\n');
}

function serializeExemplars(exemplars: readonly LayoutTemplate[], chosen: TemplateMatch): string {
  const lines = ['# Proven layouts for requests like this'];
  for (const template of exemplars) {
    lines.push(
      `- ${template.id}: ${template.summary}` + (template.id === chosen.template.id ? '  <- selected' : ''),
    );
  }
  lines.push(`Selected because: ${chosen.rationale}.`);
  return lines.join('\n');
}

const LAYOUT_HEURISTICS = `# Layout conventions
- Headline figures go in a row at the top, at most four across.
- A trend chart sits below the figures; a record table below that.
- Two record tables belong in tabs, not stacked.
- Give every page one short sentence of context naming the reporting date.`;

export interface AssemblyInput {
  prompt: string;
  pageIntent: PageIntent;
  concepts: ExtractedConcepts;
  grounding: GroundingPack;
  manifests: readonly ComponentManifest[];
  templateMatch: TemplateMatch;
  exemplars: readonly LayoutTemplate[];
  /** Present for a refinement, as a projection rather than the whole document (§4.3). */
  currentDefinitionProjection?: string;
  budgetTokens?: number;
}

const DEFAULT_BUDGET = 12_000;

export function assembleContext(input: AssemblyInput): AssembledContext {
  const budget = input.budgetTokens ?? DEFAULT_BUDGET;

  const groundingText = serializeGroundingPack(input.grounding);
  const componentText = serializeComponentVocabulary(input.manifests);
  const exemplarText = serializeExemplars(input.exemplars, input.templateMatch);

  const promptText = [
    '# Request',
    input.prompt.trim(),
    '',
    `Interpreted as: a ${input.pageIntent} page.`,
    input.concepts.timeframe
      ? `Timeframe: ${input.concepts.timeframe === 'today' ? 'today' : `last ${input.concepts.timeframe.count} ${input.concepts.timeframe.unit}(s)`}.`
      : 'No explicit timeframe.',
  ].join('\n');

  const layers: ContextLayer[] = [
    {
      name: 'systemContract',
      priority: 1,
      content: SYSTEM_CONTRACT,
      estimatedTokens: TOKENS(SYSTEM_CONTRACT),
      evictable: false,
    },
    {
      name: 'componentView',
      priority: 2,
      content: componentText,
      estimatedTokens: TOKENS(componentText),
      evictable: false,
    },
    {
      name: 'groundingPack',
      priority: 3,
      content: groundingText,
      estimatedTokens: TOKENS(groundingText),
      evictable: true,
    },
    ...(input.currentDefinitionProjection
      ? [
          {
            name: 'currentDefinition' as const,
            priority: 4,
            content: `# Current page\n${input.currentDefinitionProjection}`,
            estimatedTokens: TOKENS(input.currentDefinitionProjection),
            evictable: true,
          },
        ]
      : []),
    {
      name: 'exemplars',
      priority: 5,
      content: exemplarText,
      estimatedTokens: TOKENS(exemplarText),
      evictable: true,
    },
    {
      name: 'layoutHeuristics',
      priority: 6,
      content: LAYOUT_HEURISTICS,
      estimatedTokens: TOKENS(LAYOUT_HEURISTICS),
      evictable: true,
    },
    {
      name: 'userPrompt',
      priority: 7,
      content: promptText,
      estimatedTokens: TOKENS(promptText),
      evictable: false,
    },
  ];

  // ── eviction, from the bottom of the priority list
  const evicted: ContextLayerName[] = [];
  let total = layers.reduce((sum, l) => sum + l.estimatedTokens, 0);

  if (total > budget) {
    const order = [...layers]
      .filter((l) => l.evictable)
      .sort((a, b) => b.priority - a.priority);
    for (const layer of order) {
      if (total <= budget) break;
      if (layer.name === 'groundingPack') {
        // The grounding pack is truncated by rank rather than dropped: without it there is
        // nothing to bind to, and a generation with no catalog is worse than a smaller one.
        continue;
      }
      total -= layer.estimatedTokens;
      layer.content = '';
      layer.reduced = 'dropped to fit the context budget';
      evicted.push(layer.name);
    }
  }

  const present = layers.filter((l) => l.content.length > 0);
  const system = present.filter((l) => l.priority <= 2).map((l) => l.content).join('\n\n');
  const user = present.filter((l) => l.priority > 2).map((l) => l.content).join('\n\n');

  return {
    system,
    user,
    layers,
    estimatedTokens: TOKENS(system) + TOKENS(user),
    budgetTokens: budget,
    withinBudget: TOKENS(system) + TOKENS(user) <= budget,
    evicted,
  };
}

/**
 * Projection of an existing page for a refinement turn (§4.3). Not the whole document:
 * layout skeleton, widget types and titles, binding summaries.
 *
 * The definition is the memory, not a chat transcript. A long authoring session therefore
 * does not grow the context, the model reasons about the artifact's actual current state, and
 * a user's direct manipulation is visible to the next prompt with no synchronization.
 */
export function projectDefinition(definition: {
  name: unknown;
  components: Record<string, { type: string; title?: unknown; dataSource?: string }>;
  dataSources?: Record<string, { entity: string; kind: string }>;
}): string {
  const lines = [`name: ${text(definition.name as never)}`, 'widgets:'];
  for (const [id, component] of Object.entries(definition.components)) {
    const source = component.dataSource
      ? definition.dataSources?.[component.dataSource]
      : undefined;
    lines.push(
      `  - ${id}: ${component.type}` +
        (component.title ? ` "${text(component.title as never)}"` : '') +
        (source ? ` <- ${source.entity} (${source.kind})` : ''),
    );
  }
  return lines.join('\n');
}
