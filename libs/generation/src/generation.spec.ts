import { beforeEach, describe, expect, it } from 'vitest';
import { TestBed } from '@angular/core/testing';
import { provideZonelessChangeDetection } from '@angular/core';
import {
  ALL_CAPABILITIES,
  CatalogService,
  buildGroundingPack,
  retrieve,
  testCatalog,
  type CatalogSnapshot,
} from '@opus/catalog';
import { loadAllManifests, registeredTypes } from '@opus/component-registry';
import type { PageDefinition, UserContext } from '@opus/contracts';

import { assembleContext } from './context';
import { GenerationService } from './generation.service';
import { intake } from './intake';
import { selectTemplate } from './templates';

/** The request this milestone was specified against, verbatim. */
const THE_PROMPT =
  'Create a Security Master dashboard showing today’s processing status, failed files, late files, new securities, and exceptions.';

function user(capabilities: readonly string[] = ALL_CAPABILITIES): UserContext {
  return {
    id: 'author@test',
    displayName: 'Test Author',
    tenantId: 'test-tenant',
    locale: 'en-GB',
    timezone: 'Europe/London',
    roles: ['experienceAuthor'],
    capabilities: [...capabilities],
    entitlementScopeHash: capabilities.join('|') || 'none',
  };
}

function snapshotFor(capabilities: readonly string[] = ALL_CAPABILITIES): CatalogSnapshot {
  const catalog = new CatalogService();
  catalog.hydrate(testCatalog());
  return catalog.projectionFor(user(capabilities));
}

// ── intake ────────────────────────────────────────────────────────────────────────────

describe('intake', () => {
  it('classifies the specified request as a create, dashboard-intent, today-scoped', () => {
    const result = intake(THE_PROMPT);

    expect(result.intent).toBe('create');
    expect(result.pageIntent).toBe('dashboard');
    expect(result.concepts.timeframe).toBe('today');
    expect(result.decline).toBeUndefined();
    expect(result.clarification).toBeUndefined();
  });

  it('strips framing language from the retrieval terms', () => {
    const { concepts } = intake(THE_PROMPT);

    // "create", "showing" and "dashboard" are framing; the domain nouns must survive.
    expect(concepts.terms).not.toContain('create');
    expect(concepts.terms).not.toContain('showing');
    expect(concepts.terms).not.toContain('dashboard');
    expect(concepts.terms).toContain('failed');
    expect(concepts.terms).toContain('exceptions');
  });

  it('declines a request to change data rather than attempting it', () => {
    const result = intake('Delete every security that matured last year.');

    expect(result.intent).toBe('outOfScope');
    expect(result.decline).toContain('deleting data');
    // A decline names no catalog concept, so it cannot leak what is modelled.
    expect(result.concepts.terms).toEqual([]);
  });

  it('asks exactly one question when the request names nothing to build from', () => {
    const result = intake('Make me something nice.');

    expect(result.clarification).toBeTruthy();
    expect(result.clarification).toContain('business area');
  });

  it('treats a modification as a refinement only when there is a page to refine', () => {
    expect(intake('also add a chart by source', false).intent).toBe('create');
    expect(intake('also add a chart by source', true).intent).toBe('refine');
  });

  it('reads an explicit relative timeframe', () => {
    expect(intake('show exceptions from the last 7 days').concepts.timeframe).toEqual({
      unit: 'day',
      count: 7,
    });
  });
});

// ── template selection ────────────────────────────────────────────────────────────────

describe('template selection', () => {
  it('chooses the KPI/trend/queue shape for an operational status request', () => {
    const { pageIntent, concepts } = intake(THE_PROMPT);
    const match = selectTemplate(pageIntent, concepts.terms, {
      measureCount: 4,
      hasTemporalAttribute: true,
      wantsList: true,
      wantsBreakdown: false,
    });

    expect(match.template.id).toBe('platform.ops-dashboard-kpi-trend-queue');
    expect(match.rationale).toBeTruthy();
  });

  /**
   * The absence of a date attribute penalises a trend shape without vetoing it, and that is
   * the right strength. A shape is a maximum, not a mandate: assembly emits no chart when no
   * dimension exists, so an overwhelmingly well-matched shape should still win rather than
   * push the page onto a worse-fitting layout for want of one widget.
   */
  it('penalises a trend shape when no date attribute exists, and says so', () => {
    const { pageIntent, concepts } = intake(THE_PROMPT);
    const signals = {
      measureCount: 4,
      wantsList: true,
      wantsBreakdown: false,
    };

    const withDate = selectTemplate(pageIntent, concepts.terms, {
      ...signals,
      hasTemporalAttribute: true,
    });
    const withoutDate = selectTemplate(pageIntent, concepts.terms, {
      ...signals,
      hasTemporalAttribute: false,
    });

    expect(withoutDate.score).toBeLessThan(withDate.score);
    expect(withoutDate.rationale).toContain('no date attribute');
  });

  it('prefers the breakdown shape when the prompt asks for a categorical split', () => {
    const { pageIntent, concepts } = intake('Failed files by source system');
    const match = selectTemplate(pageIntent, concepts.terms, {
      measureCount: 2,
      hasTemporalAttribute: false,
      wantsList: false,
      wantsBreakdown: true,
    });

    expect(match.template.shape.chart).toBe('breakdown');
  });
});

// ── context assembly ──────────────────────────────────────────────────────────────────

describe('context assembly', () => {
  async function assemble(budgetTokens?: number) {
    const snapshot = snapshotFor();
    const { pageIntent, concepts } = intake(THE_PROMPT);
    const grounding = buildGroundingPack(snapshot, retrieve(snapshot, { terms: concepts.terms }));
    const templateMatch = selectTemplate(pageIntent, concepts.terms, {
      measureCount: 4,
      hasTemporalAttribute: true,
      wantsList: true,
      wantsBreakdown: false,
    });

    return assembleContext({
      prompt: THE_PROMPT,
      pageIntent,
      concepts,
      grounding,
      manifests: await loadAllManifests(),
      templateMatch,
      exemplars: [templateMatch.template],
      budgetTokens,
    });
  }

  it('puts the cacheable contract and component vocabulary in the system prefix', async () => {
    const context = await assemble();

    expect(context.system).toContain('Opus Experience Studio');
    expect(context.system).toContain('analytics.kpi-card');
    // Request-specific content must not be in the cacheable prefix.
    expect(context.system).not.toContain(THE_PROMPT);
    expect(context.user).toContain(THE_PROMPT);
  });

  it('states the rules whose violation the validator would otherwise have to catch', async () => {
    const { system } = await assemble();

    expect(system).toContain('allowed aggregations');
    expect(system).toContain('A chart needs a dimension');
    expect(system).toContain('REQUIRES A FILTER');
  });

  it('fits inside a generous budget with nothing evicted', async () => {
    const context = await assemble(12_000);

    expect(context.withinBudget).toBe(true);
    expect(context.evicted).toEqual([]);
  });

  /**
   * The eviction contract from ai-architecture.md §4: lowest priority first, and never the
   * grounding pack — a generation with no catalog is worse than a smaller one, and silently
   * dropping it yields a plausible page bound to concepts that were never offered.
   */
  it('evicts from the bottom of the priority list and never the grounding pack', async () => {
    const context = await assemble(400);

    expect(context.evicted).toContain('layoutHeuristics');
    expect(context.evicted).toContain('exemplars');
    expect(context.evicted).not.toContain('groundingPack');
    expect(context.evicted).not.toContain('systemContract');
    expect(context.evicted).not.toContain('userPrompt');
    // Eviction is reported per layer, so a reviewer sees what the model did not receive.
    const heuristics = context.layers.find((l) => l.name === 'layoutHeuristics')!;
    expect(heuristics.reduced).toBeTruthy();
  });

  it('reduces each component to a generation view rather than its full schema', async () => {
    const { system } = await assemble();

    expect(system).toContain('use when:');
    // The full JSON Schema for a component would carry its property types; the view does not.
    expect(system).not.toContain('"additionalProperties"');
  });
});

// ── the pipeline end to end ───────────────────────────────────────────────────────────

describe('GenerationService', () => {
  let service: GenerationService;

  beforeEach(() => {
    TestBed.configureTestingModule({ providers: [provideZonelessChangeDetection()] });
    service = TestBed.inject(GenerationService);
  });

  /** Every attribute and measure a definition's data sources reference. */
  function referencedFields(definition: PageDefinition): string[] {
    const refs: string[] = [];
    for (const source of Object.values(definition.dataSources ?? {})) {
      refs.push(`entity:${source.entity}`);
      for (const attribute of source.select.attributes ?? []) refs.push(attribute.attribute);
      for (const measure of source.select.measures ?? []) refs.push(measure.measure);
      for (const dimension of source.select.dimensions ?? []) refs.push(dimension.attribute);
    }
    return refs;
  }

  it('generates a valid draft page from the specified request', async () => {
    const outcome = await service.generate({
      prompt: THE_PROMPT,
      user: user(),
      snapshot: snapshotFor(),
    });

    expect(outcome.status).toBe('generated');
    expect(outcome.definition).toBeDefined();
    expect(outcome.validation?.valid).toBe(true);

    const definition = outcome.definition!;
    // Generated pages arrive as drafts: publication is a governed act, never a side effect.
    expect(definition.version.lifecycleState).toBe('draft');
    expect(definition.version.immutable).toBe(false);
    expect(Object.keys(definition.components).length).toBeGreaterThan(2);
  });

  it('runs every stage of the documented pipeline, in order', async () => {
    const outcome = await service.generate({
      prompt: THE_PROMPT,
      user: user(),
      snapshot: snapshotFor(),
    });

    const stages = outcome.stages.map((s) => s.stage);
    expect(stages.slice(0, 6)).toEqual([
      'intake',
      'retrieval',
      'context',
      'plan',
      'fill',
      'assemble',
    ]);
    expect(stages).toContain('validate');
    expect(stages).toContain('provenance');
  });

  it('binds only to identifiers that exist in the catalog', async () => {
    const snapshot = snapshotFor();
    const outcome = await service.generate({ prompt: THE_PROMPT, user: user(), snapshot });

    const known = new Set<string>();
    for (const entity of Object.values(snapshot.entities)) {
      known.add(`entity:${entity.id}`);
      for (const id of Object.keys(entity.attributes)) known.add(id);
      for (const id of Object.keys(entity.measures)) known.add(id);
    }

    for (const ref of referencedFields(outcome.definition!)) {
      expect(known.has(ref), `generated page references unknown "${ref}"`).toBe(true);
    }
  });

  it('never emits an aggregation the measure disallows', async () => {
    const snapshot = snapshotFor();
    const outcome = await service.generate({ prompt: THE_PROMPT, user: user(), snapshot });

    for (const source of Object.values(outcome.definition!.dataSources ?? {})) {
      for (const measure of source.select.measures ?? []) {
        const allowed =
          snapshot.entities[source.entity]?.measures[measure.measure]?.allowedAggregations;
        if (!allowed || !measure.aggregation) continue;
        expect(allowed, `${measure.measure} aggregated by ${measure.aggregation}`).toContain(
          measure.aggregation,
        );
      }
    }
  });

  it('stamps provenance a reviewer can audit', async () => {
    const outcome = await service.generate({
      prompt: THE_PROMPT,
      user: user(),
      snapshot: snapshotFor(),
    });

    const provenance = outcome.definition!.version.provenance!;
    expect(provenance.origin).toBe('ai');
    expect(provenance.generation?.prompt).toBe(THE_PROMPT);
    expect(provenance.generation?.modelId).toBe('simulated-rules');
    expect(provenance.generation?.retrievedConcepts?.length).toBeGreaterThan(0);
    expect(provenance.generation?.correlationId).toBeTruthy();
    // The catalog version the page was generated against, so drift is detectable later.
    expect(outcome.definition!.version.pins.catalogVersion).toBe(3);
  });

  it('pins only component types the registry actually has', async () => {
    const outcome = await service.generate({
      prompt: THE_PROMPT,
      user: user(),
      snapshot: snapshotFor(),
    });

    const available = registeredTypes();
    for (const component of Object.values(outcome.definition!.components)) {
      expect(available).toContain(component.type);
    }
  });

  // ── entitlement ────────────────────────────────────────────────────────────────────

  it('cannot bind to an entity the author is not entitled to see', async () => {
    const outcome = await service.generate({
      prompt: THE_PROMPT,
      user: user(['edm.processing.read', 'edm.security.read']),
      snapshot: snapshotFor(['edm.processing.read', 'edm.security.read']),
    });

    expect(outcome.definition).toBeDefined();
    const serialized = JSON.stringify(outcome.definition);
    expect(serialized).not.toContain('dq.exception');
    // Not even in a title: the concept was absent from the projection, so it was never known.
    expect(serialized).not.toContain('Data Quality');
  });

  it('declines without disclosing whether a concept is unmodelled or merely unentitled', async () => {
    const outcome = await service.generate({
      prompt: 'Show me counterparty credit limits and collateral haircuts by desk.',
      user: user(),
      snapshot: snapshotFor(),
    });

    if (outcome.status === 'declined') {
      expect(outcome.message).toContain('not modelled');
      expect(outcome.message).toContain('entitlements');
    } else {
      // If retrieval found something, it must still be catalog-real.
      expect(outcome.definition).toBeDefined();
    }
  });

  it('declines an out-of-scope request before spending anything on retrieval', async () => {
    const outcome = await service.generate({
      prompt: 'Delete every security that matured last year.',
      user: user(),
      snapshot: snapshotFor(),
    });

    expect(outcome.status).toBe('declined');
    expect(outcome.stages.map((s) => s.stage)).toEqual(['intake']);
    expect(outcome.tokensIn).toBe(0);
    expect(outcome.grounding).toBeUndefined();
  });

  it('asks for clarification instead of guessing', async () => {
    const outcome = await service.generate({
      prompt: 'Make me something nice.',
      user: user(),
      snapshot: snapshotFor(),
    });

    expect(outcome.status).toBe('needsClarification');
    expect(outcome.definition).toBeUndefined();
  });

  // ── the validation cascade, exercised by injected faults ────────────────────────────

  /**
   * The repair contract from ai-architecture.md §5.4, and the reason assembly must NOT
   * silently correct a bad decision: an illegal aggregation has to reach the validator to be
   * reported, and the model has to be told precisely what was wrong to fix it.
   */
  it('catches a disallowed aggregation at level 3 and repairs it', async () => {
    const snapshot = snapshotFor();
    const outcome = await service.generate({
      prompt: THE_PROMPT,
      user: user(),
      snapshot,
      faults: ['invalidAggregation'],
    });

    expect(outcome.status).toBe('repaired');
    expect(outcome.validation?.valid).toBe(true);
    expect(outcome.validation?.levelsRun).toContain('semantic');
    expect(outcome.stages.some((s) => s.stage === 'repair' && s.status === 'ok')).toBe(true);

    for (const source of Object.values(outcome.definition!.dataSources ?? {})) {
      for (const measure of source.select.measures ?? []) {
        const allowed =
          snapshot.entities[source.entity]?.measures[measure.measure]?.allowedAggregations;
        if (allowed && measure.aggregation) expect(allowed).toContain(measure.aggregation);
      }
    }
  });

  it('repairs only the widgets the errors implicate, leaving the correct ones untouched', async () => {
    const snapshot = snapshotFor();
    const clean = await service.generate({ prompt: THE_PROMPT, user: user(), snapshot });
    const repaired = await service.generate({
      prompt: THE_PROMPT,
      user: user(),
      snapshot,
      faults: ['unknownComponent'],
    });

    // The fault only ever touches KPI widgets, so the table and chart must come out identical
    // to the clean run. Regenerating widgets that were already right is the behaviour users
    // find most alarming.
    for (const id of ['trend', 'queue-security']) {
      const before = clean.definition!.components[id];
      const after = repaired.definition!.components[id];
      if (!before) continue;
      expect(JSON.stringify(after)).toBe(JSON.stringify(before));
    }
  });

  it('never publishes a component type the registry does not have, even when the model names one', async () => {
    const outcome = await service.generate({
      prompt: THE_PROMPT,
      user: user(),
      snapshot: snapshotFor(),
      faults: ['unknownComponent'],
    });

    expect(outcome.definition).toBeDefined();
    expect(outcome.validation?.valid).toBe(true);
    for (const component of Object.values(outcome.definition!.components)) {
      expect(registeredTypes()).toContain(component.type);
    }
  });

  it('never emits a chart with no dimension, because it could not have an x axis', async () => {
    const outcome = await service.generate({
      prompt: THE_PROMPT,
      user: user(),
      snapshot: snapshotFor(),
      faults: ['chartWithoutDimension'],
    });

    for (const [id, component] of Object.entries(outcome.definition!.components)) {
      if (component.type !== 'analytics.chart') continue;
      const source = outcome.definition!.dataSources?.[component.dataSource!];
      expect((source?.select.dimensions ?? []).length, `chart ${id} has no dimension`).toBeGreaterThan(0);
    }
  });

  /**
   * The fallback contract from ai-architecture.md §5.5. A user never receives a validation
   * trace, and a partial honest result beats a failure — the artifact stays editable forward.
   */
  it('falls back to a curated template when the provider fails outright', async () => {
    const outcome = await service.generate({
      prompt: THE_PROMPT,
      user: user(),
      snapshot: snapshotFor(),
      faults: ['providerFailure'],
    });

    expect(outcome.status).toBe('fallback');
    expect(outcome.definition).toBeDefined();
    expect(outcome.definition!.version.provenance?.generation?.fallbackUsed).toBe(true);
    expect(outcome.stages.some((s) => s.stage === 'fallback')).toBe(true);

    // The user-facing message explains, in plain language, with no trace and no codes.
    expect(outcome.message).toContain('simpler summary');
    expect(outcome.message).not.toMatch(/\b(schema|ajv|instancePath|level[1-8])\b/i);
  });

  it('exposes the assembled context and plan for inspection, not just the result', async () => {
    const outcome = await service.generate({
      prompt: THE_PROMPT,
      user: user(),
      snapshot: snapshotFor(),
    });

    expect(outcome.context?.layers.length).toBeGreaterThan(3);
    expect(outcome.plan?.widgets.length).toBeGreaterThan(0);
    expect(outcome.grounding?.entities.length).toBeGreaterThan(0);
    expect(outcome.tokensIn).toBeGreaterThan(0);
    expect(outcome.tokensOut).toBeGreaterThan(0);
  });

  it('produces the same page twice for the same request', async () => {
    const first = await service.generate({
      prompt: THE_PROMPT,
      user: user(),
      snapshot: snapshotFor(),
    });
    const second = await service.generate({
      prompt: THE_PROMPT,
      user: user(),
      snapshot: snapshotFor(),
    });

    // Everything except the wall-clock stamps: provenance, audit and validation all carry
    // timestamps, and identical content generated a second later is still identical content.
    const strip = (definition: PageDefinition) =>
      JSON.stringify({
        ...definition,
        version: {
          ...definition.version,
          provenance: undefined,
          audit: undefined,
          validation: undefined,
        },
      });

    expect(strip(second.definition!)).toBe(strip(first.definition!));
  });
});
