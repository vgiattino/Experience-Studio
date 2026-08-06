/**
 * Assist: the rules, and the guard that runs on every response.
 *
 * The guard tests matter more than the rule tests. A rule that ranks badly produces a suggestion
 * nobody clicks; the guard failing produces a suggestion that binds a measure the author is not
 * entitled to, or one the validator will reject — so those cases are asserted against a response
 * that is *deliberately wrong* in each way a model can be wrong.
 */

import { describe, expect, it } from 'vitest';
import {
  ALL_CAPABILITIES,
  CatalogService,
  buildGroundingPack,
  retrieve,
  testCatalog,
  type CatalogSnapshot,
  type GroundingPack,
} from '@opus/catalog';
import type { UserContext } from '@opus/contracts';

import {
  analysePage,
  assistPrompt,
  keepGroundedProposals,
  mandatoryFilterFor,
  viewOfPage,
  type AssistInput,
  type AssistPageView,
  type AssistProposal,
} from './assist';

const COMPONENTS = ['analytics.kpi-card', 'analytics.chart', 'data.table', 'content.text'];

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

function snapshot(capabilities: readonly string[] = ALL_CAPABILITIES): CatalogSnapshot {
  const catalog = new CatalogService();
  catalog.hydrate(testCatalog());
  return catalog.projectionFor(user(capabilities));
}

function groundingFor(entities: readonly string[], caps?: readonly string[]): GroundingPack {
  const projection = snapshot(caps);
  return buildGroundingPack(
    projection,
    retrieve(projection, {
      terms: entities.map((ref) => ref.split('.').pop() ?? ref),
      entityHints: entities as never,
      maxEntities: 6,
      graphHops: 1,
    }),
  );
}

/**
 * A page reading ONE of the four measures the file-load entity exposes.
 *
 * Deliberately not the exception queue: it has a single measure, so a page that binds it has no
 * unread measure left and the gap rule correctly finds nothing — which makes it useless as a fixture
 * for testing that the rule finds something.
 */
function pageView(overrides: Partial<AssistPageView> = {}): AssistPageView {
  return {
    name: 'File Processing',
    description: 'Today’s loads.',
    entities: ['processing.file-load'],
    boundMeasures: ['failed-file-count'],
    boundAttributes: [],
    widgets: [
      {
        componentId: 'kpi-failed',
        type: 'analytics.kpi-card',
        title: 'Failed Files',
        genericTitle: false,
        hasData: true,
        readsEntity: 'processing.file-load',
        readsMeasures: ['failed-file-count'],
      },
    ],
    counts: { kpi: 1, chart: 0, table: 0, text: 0 },
    ...overrides,
  };
}

function inputFor(page = pageView(), entities = ['processing.file-load']): AssistInput {
  return { page, grounding: groundingFor(entities), availableComponents: COMPONENTS, max: 8 };
}

// ── the projection ────────────────────────────────────────────────────────────────────

describe('viewOfPage', () => {
  it('reads concepts from what the data sources select, not from the bindings', () => {
    // The distinction is the whole reason this function exists: a binding names an ALIAS, and an
    // alias is not a catalog ref. Reading bindings would report "exception-count-value" and the gap
    // analysis would then believe no measure was bound at all.
    const view = viewOfPage({
      name: 'Queue',
      components: {
        kpi: {
          id: 'kpi',
          type: 'analytics.kpi-card',
          title: 'Open',
          dataSource: 'src',
        },
      },
      dataSources: {
        src: {
          entity: 'dq.exception',
          select: {
            measures: [{ measure: 'exception-count' }],
            dimensions: [{ attribute: 'severity' }],
          },
        },
      },
    });

    expect(view.entities).toEqual(['dq.exception']);
    expect(view.boundMeasures).toEqual(['exception-count']);
    expect(view.boundAttributes).toEqual(['severity']);
    expect(view.counts.kpi).toBe(1);
  });

  it('marks a widget still carrying its component name as generically titled', () => {
    const view = viewOfPage({
      components: {
        a: { id: 'a', type: 'analytics.kpi-card', title: 'KPI Card', dataSource: 's' },
        b: { id: 'b', type: 'analytics.kpi-card', title: 'Late Files', dataSource: 's' },
        c: { id: 'c', type: 'data.table' },
      },
      dataSources: { s: { entity: 'dq.exception', select: {} } },
    });

    expect(view.widgets.find((w) => w.componentId === 'a')?.genericTitle).toBe(true);
    expect(view.widgets.find((w) => w.componentId === 'b')?.genericTitle).toBe(false);
    // No data source: not a retitling candidate, because there is nothing to name it after.
    expect(view.widgets.find((w) => w.componentId === 'c')?.hasData).toBe(false);
  });
});

// ── the analyser ──────────────────────────────────────────────────────────────────────

describe('analysePage', () => {
  it('proposes a figure for a measure the catalog offers and the page does not read', () => {
    const proposals = analysePage(inputFor());
    const figures = proposals.filter((p) => p.kind === 'add-figure');

    expect(figures.length).toBeGreaterThan(0);
    // Never the measure already on the page: that is the one thing this rule must not do.
    expect(figures.map((p) => (p as { measureRef: string }).measureRef)).not.toContain(
      'failed-file-count',
    );
    for (const figure of figures) {
      expect(figure.rationale).toMatch(/no widget on this page reads it/);
      // A catalog description ends in a full stop of its own; spliced before a comma it rendered as
      // "…whatever their outcome., and no widget reads it." in the shipped panel.
      expect(figure.rationale).not.toMatch(/[.;:]\s*,/);
    }
  });

  it('proposes a trend over a groupable date, and says so in the rationale', () => {
    const proposals = analysePage(inputFor());
    const breakdown = proposals.find((p) => p.kind === 'add-breakdown');

    expect(breakdown).toBeDefined();
    expect((breakdown as { temporal: boolean }).temporal).toBe(true);
    expect(breakdown!.rationale).toMatch(/groupable/);
  });

  it('does not propose a table when the page already has one', () => {
    const withTable = analysePage(
      inputFor(pageView({ counts: { kpi: 1, chart: 0, table: 1, text: 0 } })),
    );
    expect(withTable.some((p) => p.kind === 'add-list')).toBe(false);

    const without = analysePage(inputFor());
    expect(without.some((p) => p.kind === 'add-list')).toBe(true);
  });

  it('proposes a description only when there is none', () => {
    const described = analysePage(inputFor());
    expect(described.some((p) => p.kind === 'set-page-description')).toBe(false);

    const bare = analysePage(inputFor(pageView({ description: '  ' })));
    const proposal = bare.find((p) => p.kind === 'set-page-description');
    // A factual sentence about what the page reads — never a claim about what it is for.
    expect((proposal as { value: string } | undefined)?.value).toMatch(/1 figure over/);
  });

  it('falls back to the whole pack for a page with no data sources yet', () => {
    // The empty page is the case most in need of help, and scoping to "the page's own entities"
    // would give it nothing at all.
    const empty = pageView({
      entities: [],
      boundMeasures: [],
      widgets: [],
      counts: { kpi: 0, chart: 0, table: 0, text: 0 },
    });
    const proposals = analysePage(inputFor(empty, ['processing.file-load', 'dq.exception']));
    expect(proposals.length).toBeGreaterThan(0);
  });

  it('refuses to propose a widget over an entity that requires a filter it cannot carry', () => {
    const grounding = groundingFor(['securities.security']);
    const security = grounding.entities.find((e) => e.ref === 'securities.security');
    expect(security?.requiresFilter).toBe(true);
    // This entity CAN carry one — it has a datetime — so it is proposable, and the filter is the
    // one the generator would have used.
    expect(mandatoryFilterFor(security!)).toEqual([
      { attributeRef: 'created-at', operator: 'onOrAfterToday' },
    ]);

    // Strip every filterable date and enum, and the rules must go quiet rather than emit a page
    // level-3 validation will reject.
    const unfilterable = {
      ...grounding,
      entities: grounding.entities.map((entity) =>
        entity.ref === 'securities.security'
          ? {
              ...entity,
              attributes: entity.attributes.map((a) => ({
                ...a,
                isTemporal: false,
                enumValues: undefined,
              })),
            }
          : entity,
      ),
    };
    const proposals = analysePage({
      page: pageView({ entities: ['securities.security'], boundMeasures: [] }),
      grounding: unfilterable,
      availableComponents: COMPONENTS,
    });
    expect(proposals.some((p) => 'entityRef' in p && p.entityRef === 'securities.security')).toBe(
      false,
    );
  });

  it('offers no widget kind whose component is not registered', () => {
    const proposals = analysePage({ ...inputFor(), availableComponents: ['content.text'] });
    expect(proposals.some((p) => p.kind === 'add-figure')).toBe(false);
    expect(proposals.some((p) => p.kind === 'add-breakdown')).toBe(false);
    expect(proposals.some((p) => p.kind === 'add-list')).toBe(false);
  });

  it('gives a proposal an id derived from the gap, so a dismissal survives a re-run', () => {
    const first = analysePage(inputFor());
    // Re-run against a page that gained an unrelated widget. The ids for the gaps that remain must
    // be unchanged, or a dismissed suggestion comes back under a new id.
    const second = analysePage(
      inputFor(
        pageView({
          widgets: [
            ...pageView().widgets,
            {
              componentId: 'text-intro',
              type: 'content.text',
              title: 'Summary',
              genericTitle: false,
              hasData: false,
              readsMeasures: [],
            },
          ],
          counts: { kpi: 1, chart: 0, table: 0, text: 1 },
        }),
      ),
    );
    const kept = second.map((p) => p.id);
    for (const proposal of first.filter((p) => p.kind === 'add-figure')) {
      expect(kept).toContain(proposal.id);
    }
  });

  it('does not offer to title a text block or a filter bar', () => {
    // An untitled text block is idiomatic: the component renders its body as the heading, so the
    // title is empty on purpose. Proposing one is noise, and on a real page it offered to name two
    // headings after the entity they sat above.
    const proposals = analysePage(
      inputFor(
        pageView({
          widgets: [
            {
              componentId: 'intro',
              type: 'content.text',
              title: '',
              genericTitle: true,
              hasData: true,
              readsEntity: 'processing.file-load',
              readsMeasures: ['failed-file-count'],
            },
            {
              componentId: 'kpi-blank',
              type: 'analytics.kpi-card',
              title: 'KPI Card',
              genericTitle: true,
              hasData: true,
              readsEntity: 'processing.file-load',
              readsMeasures: ['rows-processed'],
            },
          ],
          counts: { kpi: 1, chart: 0, table: 0, text: 1 },
        }),
      ),
    );
    const retitles = proposals.filter((p) => p.kind === 'retitle-widget');
    expect(retitles.map((p) => (p as { componentId: string }).componentId)).toEqual(['kpi-blank']);
    // Named after what THAT widget reads, not after the first measure the page happens to bind.
    expect((retitles[0] as { value: string }).value).toBe('Rows Processed');
  });

  it('names the widget in a retitle row, so two rows are never identical', () => {
    const twoBlank = analysePage(
      inputFor(
        pageView({
          widgets: [
            {
              componentId: 'kpi-a',
              type: 'analytics.kpi-card',
              title: 'KPI Card',
              genericTitle: true,
              hasData: true,
              readsEntity: 'processing.file-load',
              readsMeasures: ['rows-processed'],
            },
            {
              componentId: 'kpi-b',
              type: 'analytics.kpi-card',
              title: 'KPI Card',
              genericTitle: true,
              hasData: true,
              readsEntity: 'processing.file-load',
              readsMeasures: ['file-count'],
            },
          ],
          counts: { kpi: 2, chart: 0, table: 0, text: 0 },
        }),
      ),
    );
    const titles = twoBlank.filter((p) => p.kind === 'retitle-widget').map((p) => p.title);
    expect(new Set(titles).size).toBe(titles.length);
  });

  it('respects the ceiling, because a panel of fifteen suggestions is a panel nobody reads', () => {
    const proposals = analysePage({ ...inputFor(), max: 2 });
    expect(proposals).toHaveLength(2);
  });
});

// ── the guard ─────────────────────────────────────────────────────────────────────────

describe('keepGroundedProposals', () => {
  const base = {
    id: 'x',
    title: 'Add something',
    rationale: 'Because the catalog says so, at length enough to pass the schema.',
    widgetTitle: 'Something',
  };

  it('rejects a measure that is not in the grounding pack', () => {
    // The entitlement boundary. A pack is built from an entitlement-scoped projection, so a ref
    // absent from the pack is either hallucinated or out of scope — and both must be dropped.
    const { kept, rejected } = keepGroundedProposals(
      [
        {
          ...base,
          kind: 'add-figure',
          entityRef: 'processing.file-load',
          measureRef: 'salary-total',
          aggregation: 'sum',
        } as AssistProposal,
      ],
      inputFor(),
    );
    expect(kept).toHaveLength(0);
    expect(rejected[0]?.reason).toMatch(/unknown measure/);
  });

  it('rejects an entity the page has no grounded access to', () => {
    const { kept, rejected } = keepGroundedProposals(
      [
        {
          ...base,
          kind: 'add-figure',
          entityRef: 'hr.employee',
          measureRef: 'headcount',
          aggregation: 'sum',
        } as AssistProposal,
      ],
      inputFor(),
    );
    expect(kept).toHaveLength(0);
    expect(rejected[0]?.reason).toMatch(/not in scope/);
  });

  it('rejects an aggregation the measure does not allow', () => {
    // The commonest real failure (simulated-provider.ts lists it first), so it is asserted against
    // a measure whose allowed set genuinely excludes the aggregation being proposed.
    const entity = groundingFor(['processing.file-load']).entities.find(
      (e) => e.ref === 'processing.file-load',
    )!;
    const measure = entity.measures.find((m) => !m.allowedAggregations.includes('avg'));
    expect(measure, 'a measure that disallows avg').toBeDefined();

    const { kept, rejected } = keepGroundedProposals(
      [
        {
          ...base,
          kind: 'add-figure',
          entityRef: entity.ref,
          measureRef: measure!.ref,
          aggregation: 'avg',
        } as AssistProposal,
      ],
      inputFor(),
    );
    expect(kept).toHaveLength(0);
    expect(rejected[0]?.reason).toMatch(/does not allow avg/);
  });

  it('rejects a breakdown over an attribute that is not groupable', () => {
    // Constructed rather than found: the catalog projection defaults `groupable` to true, so no
    // attribute in the test fixture is ungroupable. The guard's contract is "reject what the pack
    // says cannot be grouped", and that is what is asserted.
    const input = inputFor();
    const entity = input.grounding.entities.find((e) => e.ref === 'processing.file-load')!;
    const target = entity.attributes[0]!;
    const grounding = {
      ...input.grounding,
      entities: input.grounding.entities.map((candidate) =>
        candidate.ref === entity.ref
          ? {
              ...candidate,
              attributes: candidate.attributes.map((attribute) =>
                attribute.ref === target.ref ? { ...attribute, groupable: false } : attribute,
              ),
            }
          : candidate,
      ),
    };

    const { kept, rejected } = keepGroundedProposals(
      [
        {
          ...base,
          kind: 'add-breakdown',
          entityRef: entity.ref,
          measureRef: entity.measures[0]!.ref,
          aggregation: entity.measures[0]!.defaultAggregation,
          dimensionRef: target.ref,
          temporal: false,
        } as AssistProposal,
      ],
      { ...input, grounding },
    );
    expect(kept).toHaveLength(0);
    expect(rejected[0]?.reason).toMatch(/not groupable/);
  });

  it('rejects a retitle aimed at a widget that is not on the page', () => {
    const { kept, rejected } = keepGroundedProposals(
      [{ ...base, kind: 'retitle-widget', componentId: 'ghost', value: 'X' } as AssistProposal],
      inputFor(),
    );
    expect(kept).toHaveLength(0);
    expect(rejected[0]?.reason).toMatch(/no widget/);
  });

  it('keeps everything the deterministic analyser produces', () => {
    // The guard runs on the analyser's own output too, and must never reject it: a baseline that
    // fails its own validation would mean the rules and the schema had drifted apart.
    const input = inputFor();
    const { kept, rejected } = keepGroundedProposals(analysePage(input), input);
    expect(rejected).toEqual([]);
    expect(kept.length).toBeGreaterThan(0);
  });
});

// ── the prompt ────────────────────────────────────────────────────────────────────────

describe('assistPrompt', () => {
  it('states what the page already reads, and every ref the model may name', () => {
    const input = inputFor();
    const { system, user: body } = assistPrompt(input);

    expect(system).toMatch(/MUST appear verbatim in the catalog/);
    expect(body).toContain('## Already read by this page');
    // The measure the page already binds is named under "do not propose these again", which is the
    // one instruction in this prompt that prevents a duplicate widget.
    expect(body).toContain('failed-file-count');
    for (const entity of input.grounding.entities) {
      expect(body).toContain(entity.ref);
    }
    // The component list is in the prompt, so a model cannot name an unregistered type "by accident".
    expect(body).toContain('analytics.kpi-card');
  });

  it('marks an entity that requires a filter, so the model does not propose an unfiltered scan', () => {
    const { user: body } = assistPrompt({
      page: pageView({ entities: ['securities.security'] }),
      grounding: groundingFor(['securities.security']),
      availableComponents: COMPONENTS,
    });
    expect(body).toMatch(/securities\.security.*REQUIRES A FILTER/);
  });
});
