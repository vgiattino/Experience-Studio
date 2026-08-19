/**
 * @opus/generation — the AI page generation workflow (architecture/ai-architecture.md).
 *
 * The shape of this library is the architecture's central claim made concrete: AI is a
 * DESIGN-TIME author, not a runtime interpreter. Nothing in here runs while a business user
 * views a page. A generation call produces a JSON artifact, that artifact is validated by the
 * same validator the loader uses, and from then on the page is deterministic metadata that
 * renders identically forever — with or without a model available.
 *
 * The pipeline, and the file that owns each step:
 *
 *   1. intake.ts             classify the request, extract concepts, decline or clarify
 *   2. @opus/catalog         retrieve grounding, entitlement-scoped BEFORE ranking
 *   3. context.ts            assemble layered context within an explicit token budget
 *   4. templates.ts          select a proven layout and its exemplars
 *   5. plan.ts               the two response schemas the model is held to
 *   6. model-provider.ts     the ONE seam a real LLM plugs into
 *   7. assemble.ts           build the page definition deterministically from decisions
 *   8. generation.service.ts orchestrate, validate, repair, fall back, stamp provenance
 *
 * ── SUBSTITUTING A REAL MODEL ─────────────────────────────────────────────────
 * Implement `ModelProvider` against a real endpoint and call
 * `GenerationService.useProvider(yours)`. Nothing else changes: the prompts, the response
 * schemas, the validation cascade, the repair loop and the fallback are all provider-agnostic
 * by construction. `SimulatedModelProvider` is not a canned response — it reasons over the
 * same grounding pack and the same component manifests a real model would receive, so a
 * change to the catalog changes its output, and its fault injection exercises repair and
 * fallback for real rather than by assertion.
 */

export {
  GenerationService,
  type GenerateRequest,
  type GenerationOutcome,
  type StageName,
  type StageRecord,
} from './generation.service';

export {
  DEFAULT_PROVIDER_POLICY,
  ModelProviderError,
  PolicyEnforcingProvider,
  type ModelProvider,
  type ModelRequest,
  type ModelResponse,
  type ProviderPolicy,
} from './model-provider';

export {
  SimulatedModelProvider,
  rankMeasures,
  type SimulatedFault,
  type SimulationInput,
} from './simulated-provider';

export {
  intake,
  type ExtractedConcepts,
  type IntakeResult,
  type IntentClass,
  type PageIntent,
} from './intake';

export {
  TEMPLATES,
  exemplarsFor,
  selectTemplate,
  templateById,
  type LayoutTemplate,
  type TemplateMatch,
} from './templates';

export {
  assembleContext,
  componentGenerationView,
  projectDefinition,
  serializeComponentVocabulary,
  type AssembledContext,
  type AssemblyInput,
  type ContextLayer,
  type ContextLayerName,
} from './context';

export {
  FILL_RESPONSE_SCHEMA,
  PLAN_RESPONSE_SCHEMA,
  type FillFilter,
  type GenerationPlan,
  type PlanWidget,
  type WidgetFill,
  type WidgetKind,
} from './plan';

export { assemblePage, type AssembleInput } from './assemble';

export {
  ASSIST_RESPONSE_SCHEMA,
  analysePage,
  assistPrompt,
  componentTypeFor,
  keepGroundedProposals,
  mandatoryFilterFor,
  viewOfPage,
  type AssistInput,
  type AssistPageView,
  type AssistProposal,
  type AssistProposalKind,
  type AssistResponse,
} from './assist';

export {
  REFINE_RESPONSE_SCHEMA,
  ground,
  interpret,
  pageViewFor,
  refine,
  resolveField,
  resolveWidget,
  type MovePosition,
  type RefineOutcome,
  type RefinePageView,
  type RefineWidget,
  type RefinementIntent,
  type RefinementVerb,
  type ResolutionScore,
  type ResolvedRefinement,
} from './refine';
