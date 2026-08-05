/**
 * The Generation Service — the orchestrator (ai-architecture.md §2, §5).
 *
 * Pipeline, in order:
 *   intake → concepts → retrieval → context assembly → plan → fill (parallel) →
 *   assemble → validation cascade → bounded repair → deterministic fallback → provenance
 *
 * Three properties are the substance of this design, and each is a decision the architecture
 * argued for before any of it was built:
 *
 *  1. THE MODEL NEVER EMITS A PAGE. It emits decisions; the platform assembles the artifact
 *     (plan.ts, assemble.ts). The surface where a model can be wrong is exactly the choices
 *     needing judgement.
 *
 *  2. VALIDATION IS THE SAME VALIDATOR THE LOADER USES. Not a generation-specific check. A
 *     definition this service accepts cannot be one the runtime rejects.
 *
 *  3. A USER NEVER SEES A VALIDATION TRACE. Repair is bounded to two attempts, then the
 *     closest template is instantiated and the user is told plainly what happened. A partial,
 *     honest, working result beats a failure, and keeps the artifact editable forward.
 */

import { Injectable, computed, inject, signal } from '@angular/core';
import {
  buildGroundingPack,
  retrieve,
  type CatalogSnapshot,
  type GroundedEntity,
  type GroundingPack,
} from '@opus/catalog';
import { loadAllManifests, registeredTypes, REGISTRY_VERSION } from '@opus/component-registry';
import { TelemetryService } from '@opus/platform';
import type { ComponentManifest, PageDefinition, UserContext } from '@opus/contracts';
import type { ValidationFinding, ValidationReport } from '@opus/validator';

import { assemblePage } from './assemble';
import { assembleContext, projectDefinition, type AssembledContext } from './context';
import { intake, type IntakeResult } from './intake';
import {
  FILL_RESPONSE_SCHEMA,
  PLAN_RESPONSE_SCHEMA,
  type FillFilter,
  type GenerationPlan,
  type PlanWidget,
  type WidgetFill,
} from './plan';
import {
  ModelProviderError,
  PolicyEnforcingProvider,
  type ModelProvider,
} from './model-provider';
import { SimulatedModelProvider, type SimulatedFault } from './simulated-provider';
import { exemplarsFor, selectTemplate, type TemplateMatch } from './templates';

export type StageName =
  | 'intake'
  | 'retrieval'
  | 'context'
  | 'plan'
  | 'fill'
  | 'assemble'
  | 'validate'
  | 'repair'
  | 'fallback'
  | 'provenance';

export interface StageRecord {
  stage: StageName;
  status: 'ok' | 'warning' | 'failed' | 'skipped';
  durationMs: number;
  /** One line a reviewer can read. */
  summary: string;
  detail?: unknown;
}

export interface GenerationOutcome {
  status: 'generated' | 'repaired' | 'fallback' | 'declined' | 'needsClarification' | 'failed';
  definition?: PageDefinition;
  /** Plain-language message for the user. Never a validation trace. */
  message: string;
  stages: StageRecord[];
  intake: IntakeResult;
  grounding?: GroundingPack;
  context?: AssembledContext;
  plan?: GenerationPlan;
  validation?: ValidationReport;
  templateMatch?: TemplateMatch;
  correlationId: string;
  totalMs: number;
  tokensIn: number;
  tokensOut: number;
}

export interface GenerateRequest {
  prompt: string;
  user: UserContext;
  snapshot: CatalogSnapshot;
  /** Present for a refinement turn. */
  currentDefinition?: PageDefinition;
  faults?: readonly SimulatedFault[];
}

const MAX_REPAIR_ATTEMPTS = 2;

@Injectable({ providedIn: 'root' })
export class GenerationService {
  private readonly telemetry = inject(TelemetryService);

  private manifests: ComponentManifest[] = [];
  private simulated: SimulatedModelProvider | null = null;

  /**
   * A signal, not a field: `providerLabel` is a computed over it, and a computed reading a
   * plain field never re-evaluates — the UI showed "not configured" indefinitely after the
   * provider had been installed and used.
   */
  private readonly providerRef = signal<ModelProvider | null>(null);

  readonly running = signal(false);
  readonly stages = signal<readonly StageRecord[]>([]);
  readonly lastOutcome = signal<GenerationOutcome | null>(null);

  readonly providerLabel = computed(() => {
    const provider = this.providerRef();
    return provider ? `${provider.id}@${provider.version}` : 'not configured';
  });

  /**
   * Install a provider. Called with the simulated one by default; a real deployment
   * substitutes a server-backed implementation here and nothing else changes.
   */
  useProvider(provider: ModelProvider): void {
    this.providerRef.set(new PolicyEnforcingProvider(provider));
  }

  async generate(request: GenerateRequest): Promise<GenerationOutcome> {
    const startedAt = performance.now();
    const correlationId = `gen-${Math.floor(startedAt).toString(36)}-${Object.keys(request.snapshot.entities).length}`;
    const stages: StageRecord[] = [];
    let tokensIn = 0;
    let tokensOut = 0;

    this.running.set(true);
    this.stages.set([]);

    const record = (r: StageRecord) => {
      stages.push(r);
      this.stages.set([...stages]);
    };

    const finish = (outcome: Omit<GenerationOutcome, 'totalMs' | 'stages' | 'correlationId' | 'tokensIn' | 'tokensOut'>): GenerationOutcome => {
      const full: GenerationOutcome = {
        ...outcome,
        stages,
        correlationId,
        totalMs: Math.round(performance.now() - startedAt),
        tokensIn,
        tokensOut,
      };
      this.running.set(false);
      this.lastOutcome.set(full);
      this.telemetry.recordProblem({
        scope: 'generation',
        code: full.status,
        detail: `${full.message} (${full.totalMs}ms, ${tokensIn}+${tokensOut} tokens, ${correlationId})`,
      });
      return full;
    };

    // ── 1. intake
    let t = performance.now();
    const intakeResult = intake(request.prompt, request.currentDefinition !== undefined);

    if (intakeResult.intent === 'outOfScope') {
      record({
        stage: 'intake',
        status: 'failed',
        durationMs: ms(t),
        summary: 'Request declined as out of scope',
      });
      return finish({
        status: 'declined',
        message: intakeResult.decline!,
        intake: intakeResult,
      });
    }
    if (intakeResult.clarification) {
      record({
        stage: 'intake',
        status: 'warning',
        durationMs: ms(t),
        summary: 'Request is too vague to build from',
      });
      return finish({
        status: 'needsClarification',
        message: intakeResult.clarification,
        intake: intakeResult,
      });
    }
    record({
      stage: 'intake',
      status: 'ok',
      durationMs: ms(t),
      summary: `Intent ${intakeResult.intent} / ${intakeResult.pageIntent}; ${intakeResult.concepts.terms.length} concepts extracted`,
      detail: intakeResult.concepts,
    });

    // ── 2. retrieval — over the caller's projection, so entitlement scoping precedes ranking
    t = performance.now();
    const retrieval = retrieve(request.snapshot, {
      terms: intakeResult.concepts.terms,
      maxEntities: 4,
      graphHops: 1,
    });
    const grounding = buildGroundingPack(request.snapshot, retrieval);

    if (!grounding.entities.length) {
      record({
        stage: 'retrieval',
        status: 'failed',
        durationMs: ms(t),
        summary: 'Nothing in the catalog matched, or nothing matched that you may see',
      });
      return finish({
        status: 'declined',
        // Honest about both possibilities without disclosing which.
        message:
          'I could not find anything in the data catalog matching that request — either those concepts are not modelled, or they are outside your entitlements. Try naming a business area such as file processing, securities, or data quality exceptions.',
        intake: intakeResult,
        grounding,
      });
    }

    record({
      stage: 'retrieval',
      status: 'ok',
      durationMs: ms(t),
      summary: `${grounding.entities.length} entities, ${grounding.entities.reduce((n, e) => n + e.measures.length, 0)} measures (~${grounding.estimatedTokens} tokens)`,
      detail: {
        kept: grounding.entities.map((e) => ({ ref: e.ref, via: e.retrievedVia })),
        dropped: grounding.droppedEntities,
        expandedFrom: retrieval.expandedFrom,
      },
    });

    // ── 3. context assembly
    t = performance.now();
    if (!this.manifests.length) this.manifests = await loadAllManifests();

    const templateMatch = selectTemplate(intakeResult.pageIntent, intakeResult.concepts.terms, {
      measureCount: grounding.entities.reduce((n, e) => n + e.measures.length, 0),
      hasTemporalAttribute: grounding.entities.some((e) => e.attributes.some((a) => a.isTemporal)),
      wantsList: intakeResult.concepts.listHints.length > 0,
      wantsBreakdown: intakeResult.concepts.breakdownHints.length > 0,
    });

    const context = assembleContext({
      prompt: request.prompt,
      pageIntent: intakeResult.pageIntent,
      concepts: intakeResult.concepts,
      grounding,
      manifests: this.manifests,
      templateMatch,
      exemplars: exemplarsFor(templateMatch),
      currentDefinitionProjection: request.currentDefinition
        ? projectDefinition(request.currentDefinition)
        : undefined,
    });

    record({
      stage: 'context',
      status: context.withinBudget ? 'ok' : 'warning',
      durationMs: ms(t),
      summary: `Template "${templateMatch.template.id}"; ~${context.estimatedTokens}/${context.budgetTokens} tokens${context.evicted.length ? `, evicted ${context.evicted.join(', ')}` : ''}`,
      detail: { rationale: templateMatch.rationale, layers: context.layers.map((l) => ({ name: l.name, tokens: l.estimatedTokens, reduced: l.reduced })) },
    });

    // ── provider
    //
    // An installed provider wins. `useProvider` used to be overridden on the first call by the
    // built-in simulated one, which made the seam the library advertises unusable from outside: the
    // prototype installs an HTTP provider so the model call happens server-side, and it was being
    // replaced by the in-browser stand-in before the first prompt.
    //
    // The decision inputs are offered to whichever provider is installed, through the port's
    // optional channel. A real provider does not implement it; a stand-in behind a transport does,
    // and the orchestrator does not need to know which it is holding.
    const available = registeredTypes();
    const decisionInputs = {
      concepts: intakeResult.concepts,
      pageIntent: intakeResult.pageIntent,
      grounding,
      templateMatch,
      availableComponents: available,
      faults: request.faults,
    };

    if (!this.providerRef()) {
      this.simulated = new SimulatedModelProvider(decisionInputs);
      this.useProvider(this.simulated);
    }
    const provider = this.providerRef()!;
    provider.useDecisionInputs?.(decisionInputs);

    // ── 4. plan
    t = performance.now();
    let plan: GenerationPlan;
    try {
      const response = await provider.complete({
        system: context.system,
        user: context.user,
        responseSchema: PLAN_RESPONSE_SCHEMA,
        temperature: 0.2,
        purpose: 'plan',
      });
      tokensIn += response.tokensIn;
      tokensOut += response.tokensOut;
      plan = response.output as GenerationPlan;
    } catch (error) {
      record({
        stage: 'plan',
        status: 'failed',
        durationMs: ms(t),
        summary: error instanceof Error ? error.message : String(error),
      });
      return await this.fallback(request, intakeResult, grounding, templateMatch, context, stages, finish, 'The generator could not produce a layout');
    }

    if (!plan.widgets.length) {
      record({ stage: 'plan', status: 'failed', durationMs: ms(t), summary: 'Plan contained no widgets' });
      return await this.fallback(request, intakeResult, grounding, templateMatch, context, stages, finish, 'The generator produced an empty layout');
    }

    record({
      stage: 'plan',
      status: 'ok',
      durationMs: ms(t),
      summary: `${plan.widgets.length} widgets: ${plan.widgets.map((w) => w.kind).join(', ')}`,
      detail: plan,
    });

    // ── 5. fill, one focused call per widget, in parallel
    t = performance.now();
    const fills: WidgetFill[] = [];
    const fillFailures: string[] = [];

    const results = await Promise.all(
      plan.widgets.map(async (widget) => {
        try {
          const response = await provider.complete({
            system: context.system,
            // A focused context: the widget being filled, plus the shared grounding. A
            // smaller context produces better binding decisions than one describing twelve.
            user: `WIDGET:${widget.id}\n${JSON.stringify(widget)}\n\n${context.user}`,
            responseSchema: FILL_RESPONSE_SCHEMA,
            temperature: 0.1,
            purpose: 'fill',
          });
          tokensIn += response.tokensIn;
          tokensOut += response.tokensOut;
          return response.output as WidgetFill;
        } catch (error) {
          fillFailures.push(
            `${widget.id}: ${error instanceof ModelProviderError ? error.message : String(error)}`,
          );
          return null;
        }
      }),
    );
    for (const fill of results) if (fill) fills.push(fill);

    record({
      stage: 'fill',
      status: fillFailures.length ? 'warning' : 'ok',
      durationMs: ms(t),
      summary: `${fills.length}/${plan.widgets.length} widgets configured${fillFailures.length ? `; ${fillFailures.length} failed` : ''}`,
      detail: fillFailures.length ? { failures: fillFailures } : undefined,
    });

    if (!fills.length) {
      return await this.fallback(request, intakeResult, grounding, templateMatch, context, stages, finish, 'No widget could be configured');
    }

    // ── 6–8. assemble, validate, repair
    const componentVersions = Object.fromEntries(this.manifests.map((m) => [m.type, m.version]));
    let definition = this.assemble(plan, fills, grounding, request, componentVersions);
    let report = await this.validate(definition, request.snapshot);
    let attempts = 0;
    let repaired = false;

    record({
      stage: 'assemble',
      status: 'ok',
      durationMs: 0,
      summary: `${Object.keys(definition.components).length} components, ${Object.keys(definition.dataSources ?? {}).length} data sources`,
    });

    while (!report.valid && attempts < MAX_REPAIR_ATTEMPTS) {
      attempts += 1;
      const failing = failingWidgets(report, definition);

      record({
        stage: 'validate',
        status: 'warning',
        durationMs: report.durationMs,
        summary: `Attempt ${attempts}: ${report.findings.filter((f) => f.severity === 'error').length} error(s) in ${failing.size || 'the page'}`,
        detail: report.findings.filter((f) => f.severity === 'error').slice(0, 6),
      });

      // Repair only the failing widgets. Regenerating the whole page risks changing the
      // widgets that were already correct — the behaviour users find most alarming.
      const t2 = performance.now();
      const repairedFills: WidgetFill[] = [];
      for (const fill of fills) {
        if (!failing.has(fill.widgetId)) {
          repairedFills.push(fill);
          continue;
        }
        const errors = report.findings
          .filter((f) => f.path.includes(fill.widgetId))
          .map((f) => `${f.code}: ${f.message}`);
        try {
          const response = await provider.complete({
            system: context.system,
            user: `WIDGET:${fill.widgetId}\nThe previous attempt was rejected:\n${errors.map((e) => `- ${e}`).join('\n')}\nCorrect only this widget.\n\n${context.user}`,
            responseSchema: FILL_RESPONSE_SCHEMA,
            temperature: 0,
            purpose: 'repair',
          });
          tokensIn += response.tokensIn;
          tokensOut += response.tokensOut;
          repairedFills.push(response.output as WidgetFill);
          repaired = true;
        } catch {
          // Drop the widget rather than keep a known-invalid one. A page missing one widget
          // is usable; a page that fails validation is not.
          repaired = true;
        }
      }

      definition = this.assemble(plan, repairedFills, grounding, request, componentVersions);
      report = await this.validate(definition, request.snapshot);
      fills.length = 0;
      fills.push(...repairedFills);

      record({
        stage: 'repair',
        status: report.valid ? 'ok' : 'warning',
        durationMs: ms(t2),
        summary: report.valid
          ? `Repaired ${failing.size} widget(s); definition now valid`
          : `Repair attempt ${attempts} did not resolve every error`,
      });
    }

    if (!report.valid) {
      record({
        stage: 'validate',
        status: 'failed',
        durationMs: report.durationMs,
        summary: `Still invalid after ${attempts} repair attempt(s)`,
        detail: report.findings.filter((f) => f.severity === 'error').slice(0, 6),
      });
      return await this.fallback(
        request,
        intakeResult,
        grounding,
        templateMatch,
        context,
        stages,
        finish,
        'The generated page did not pass validation',
        report,
      );
    }

    record({
      stage: 'validate',
      status: report.findings.length ? 'warning' : 'ok',
      durationMs: report.durationMs,
      summary: `Valid (${report.levelsRun.join(', ')}); ${report.findings.length} warning(s). Not run: ${report.levelsNotRun.join(', ')}`,
      detail: report.findings.slice(0, 6),
    });

    // ── 9. provenance
    const t3 = performance.now();
    definition = {
      ...definition,
      version: {
        ...definition.version,
        provenance: {
          origin: request.currentDefinition ? 'aiRefined' : 'ai',
          actorId: request.user.id,
          createdAt: new Date().toISOString(),
          generation: {
            prompt: request.prompt,
            intentClass: intakeResult.intent === 'refine' ? 'refine' : 'create',
            promptTemplateVersion: '1.0.0',
            modelId: provider.id,
            modelVersion: provider.version,
            temperature: 0.2,
            retrievedConcepts: grounding.entities.flatMap((e) => [
              e.ref,
              ...e.measures.map((m) => `${e.ref}.${m.ref}`),
            ]),
            exemplarTemplateIds: [templateMatch.template.id],
            validationAttempts: attempts + 1,
            repairedStages: repaired ? ['binding', 'component'] : [],
            fallbackUsed: false,
            tokensIn,
            tokensOut,
            durationMs: Math.round(performance.now() - startedAt),
            correlationId,
          },
        },
        validation: {
          status: report.findings.length ? 'validWithWarnings' : 'valid',
          stagesPassed: [...report.levelsRun],
          warnings: report.findings.map((f) => ({
            stage: f.level,
            path: f.path,
            code: f.code,
            message: f.message,
          })),
          validatedAt: new Date().toISOString(),
        },
      },
    };
    record({
      stage: 'provenance',
      status: 'ok',
      durationMs: ms(t3),
      summary: `Stamped: ${provider.id}@${provider.version}, catalog v${grounding.catalogVersion}, registry ${REGISTRY_VERSION}`,
    });

    return finish({
      status: repaired ? 'repaired' : 'generated',
      definition,
      message: repaired
        ? `Generated a ${plan.widgets.length}-widget page. One or more widgets needed correcting before it validated; the page is a draft for you to review.`
        : `Generated a ${plan.widgets.length}-widget page. It is a draft — review it before publishing.`,
      intake: intakeResult,
      grounding,
      context,
      plan,
      validation: report,
      templateMatch,
    });
  }

  private assemble(
    plan: GenerationPlan,
    fills: readonly WidgetFill[],
    grounding: GroundingPack,
    request: GenerateRequest,
    componentVersions: Record<string, string>,
  ): PageDefinition {
    return assemblePage({
      plan,
      fills,
      grounding,
      registryVersion: REGISTRY_VERSION,
      componentVersions,
      prompt: request.prompt,
      actorId: request.user.id,
      provenance: {
        origin: 'ai',
        actorId: request.user.id,
        createdAt: new Date().toISOString(),
      },
    });
  }

  /**
   * The same validator the page loader runs — not a generation-specific check.
   *
   * Level 3 is enabled here by supplying the catalog, which is what makes an illegal model
   * decision (a disallowed aggregation, an invented field) a reported error with a path
   * rather than something assembly quietly papered over. The runtime loader validates
   * without a catalog and therefore reports level 3 as not run; that asymmetry is correct —
   * at load time the definition was already checked against the catalog it pins.
   */
  private async validate(
    definition: PageDefinition,
    snapshot: CatalogSnapshot,
  ): Promise<ValidationReport> {
    const { validatePage } = await import('@opus/validator');
    return validatePage(definition, {
      manifests: this.manifests,
      registeredTypes: registeredTypes(),
      catalog: snapshot,
    });
  }

  /**
   * Deterministic fallback (ai-architecture.md §5.5). The closest template, instantiated with
   * what retrieval found, and an honest explanation. A user must never receive a validation
   * trace, and a partial working result keeps the artifact editable forward.
   *
   * The fallback is the last thing between a user and an error message, so "guaranteed valid"
   * has to be a guarantee rather than an intention: it is validated like anything else, and
   * any widget that still fails is dropped until what remains passes. A page with two figures
   * instead of three is a result; an invalid page is not.
   */
  private async fallback(
    request: GenerateRequest,
    intakeResult: IntakeResult,
    grounding: GroundingPack,
    templateMatch: TemplateMatch,
    context: AssembledContext,
    stages: StageRecord[],
    finish: (o: Omit<GenerationOutcome, 'totalMs' | 'stages' | 'correlationId' | 'tokensIn' | 'tokensOut'>) => GenerationOutcome,
    reason: string,
    report?: ValidationReport,
  ): Promise<GenerationOutcome> {
    const t = performance.now();

    // One figure per retrieved measure, capped. No chart, because a chart is the widget most
    // likely to have been what failed, and no table, because a table needs column choices.
    const candidates = grounding.entities
      .flatMap((entity) => entity.measures.map((measure) => ({ entity, measure })))
      .slice(0, 3);

    const intro: PlanWidget = {
      id: 'page-intro',
      kind: 'text',
      title: 'Summary',
      purpose: 'State what the page covers.',
    };

    const buildPlan = (
      kept: readonly { entity: GroundedEntity; measure: GroundedEntity['measures'][number] }[],
    ): GenerationPlan => ({
      pageName: `${grounding.entities[0]?.plural ?? 'Generated'} Summary`,
      pageDescription: 'Fallback page assembled from a curated template.',
      introSentence: 'Reporting for {asOf}.',
      templateId: 'platform.kpi-only-summary',
      widgets: [
        intro,
        ...kept.map(({ entity, measure }) => ({
          id: `kpi-${measure.ref}`,
          kind: 'kpi' as const,
          title: measure.name,
          purpose: `Headline figure for ${measure.name.toLowerCase()}.`,
          entityRef: entity.ref,
          measureRef: measure.ref,
        })),
      ],
    });

    const buildFills = (plan: GenerationPlan): WidgetFill[] =>
      plan.widgets.map((widget) => {
        const entity = grounding.entities.find((e) => e.ref === widget.entityRef);
        const measure = entity?.measures.find((m) => m.ref === widget.measureRef);
        return {
          widgetId: widget.id,
          componentType: widget.kind === 'text' ? 'content.text' : 'analytics.kpi-card',
          config: {},
          // The default aggregation is by definition an allowed one, so the fallback cannot
          // reproduce the commonest reason it was needed.
          ...(measure ? { aggregation: measure.defaultAggregation } : {}),
          // An entity that requires a filter must receive one that always constrains, or
          // level 3 rejects it — the fallback would then have the same defect it exists to
          // work around.
          filters: entity ? mandatoryFilterFor(entity) : [],
          useThresholds: false,
        };
      });

    const componentVersions = Object.fromEntries(this.manifests.map((m) => [m.type, m.version]));

    let kept = [...candidates];
    let plan = buildPlan(kept);
    let definition = this.assemble(plan, buildFills(plan), grounding, request, componentVersions);
    let fallbackReport = await this.validate(definition, request.snapshot);
    const dropped: string[] = [];

    // Drop implicated figures one at a time. Bounded by the candidate count, and the intro
    // text has no data source so the loop always terminates on something valid.
    while (!fallbackReport.valid && kept.length) {
      const failing = failingWidgets(fallbackReport, definition);
      const before = kept.length;
      kept = kept.filter(({ measure }) => !failing.has(`kpi-${measure.ref}`));
      if (kept.length === before) kept = kept.slice(0, -1);
      dropped.push(...Array.from(failing));
      plan = buildPlan(kept);
      definition = this.assemble(plan, buildFills(plan), grounding, request, componentVersions);
      fallbackReport = await this.validate(definition, request.snapshot);
    }

    const measures = kept;

    definition.version.provenance = {
      origin: 'ai',
      actorId: request.user.id,
      createdAt: new Date().toISOString(),
      generation: {
        prompt: request.prompt,
        intentClass: 'create',
        modelId: this.providerRef()?.id ?? 'unknown',
        modelVersion: this.providerRef()?.version ?? 'unknown',
        exemplarTemplateIds: ['platform.kpi-only-summary'],
        fallbackUsed: true,
        correlationId: 'fallback',
      },
    };

    stages.push({
      stage: 'fallback',
      status: 'warning',
      durationMs: ms(t),
      summary:
        `Instantiated template "platform.kpi-only-summary" with ${measures.length} figure(s)` +
        (dropped.length ? `; dropped ${dropped.length} that would not validate` : ''),
    });
    this.stages.set([...stages]);

    return finish({
      status: 'fallback',
      definition,
      message: `${reason}, so I have built a simpler summary from a proven template instead. It shows ${measures.length} headline figure${measures.length === 1 ? '' : 's'} — add to it, or rephrase and try again.`,
      intake: intakeResult,
      grounding,
      context,
      plan,
      validation: report,
      templateMatch,
    });
  }
}

function ms(from: number): number {
  return Math.round(performance.now() - from);
}

/**
 * A filter that always constrains, for an entity the catalog marks `requiresFilter`.
 *
 * Prefer a date — a business date narrowed to the reporting day is what an operational page
 * means anyway — then an enum over its full value set, which constrains the scan without
 * excluding anything a reader expected to see. An entity offering neither gets nothing, and
 * the caller drops the widget rather than emitting one the validator will reject.
 */
function mandatoryFilterFor(entity: GroundedEntity): FillFilter[] {
  if (!entity.requiresFilter) return [];

  const date = entity.attributes.find((a) => a.isTemporal && a.filterable);
  if (date) return [{ attributeRef: date.ref, operator: 'onOrAfterToday' }];

  const enumAttribute = entity.attributes.find((a) => a.enumValues?.length && a.filterable);
  if (enumAttribute?.enumValues) {
    return [
      { attributeRef: enumAttribute.ref, operator: 'in', value: [...enumAttribute.enumValues] },
    ];
  }
  return [];
}

/**
 * Which widgets the validation errors implicate, so repair stays targeted.
 *
 * A finding's path points at the artifact, not at a widget, and the two most common shapes
 * point at different places: a component error at `/components/<id>`, a semantic or binding
 * error at `/dataSources/<id>`. A data source belongs to exactly one widget in a generated
 * page, so the reverse index closes the gap. Without it a level-3 error implicates nothing,
 * repair regenerates nothing, and a perfectly repairable page falls back instead.
 */
function failingWidgets(report: ValidationReport, definition: PageDefinition): Set<string> {
  const ids = new Set<string>();
  const componentIds = Object.keys(definition.components);

  const widgetBySource = new Map<string, string>();
  for (const [id, component] of Object.entries(definition.components)) {
    if (component.dataSource) widgetBySource.set(component.dataSource, id);
  }

  for (const finding of report.findings) {
    if (finding.severity !== 'error') continue;
    for (const id of componentIds) {
      if (finding.path.includes(`/components/${id}`)) ids.add(id);
    }
    for (const [sourceId, widgetId] of widgetBySource) {
      if (finding.path.startsWith(`/dataSources/${sourceId}`)) ids.add(widgetId);
    }
  }
  return ids;
}

export type { ValidationFinding };
