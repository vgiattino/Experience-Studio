/**
 * The ingestion session: registered sources, their scans, and the drafts under review.
 *
 * ── WHAT IS A SERVICE AND WHAT IS A LIBRARY ─────────────────────────────────────────────
 * `@opus/catalog-ingest` holds the pipeline and knows nothing about Angular. This service holds the
 * *session* — which sources exist, which one is open, what the last scan found, which decisions the
 * steward has made so far — and that split is the reason the pipeline is testable without a browser and
 * this screen is testable without a database.
 *
 * ── AND WHERE THE SCAN ACTUALLY RUNS, SAID PLAINLY ──────────────────────────────────────
 * Against a fixture, in the browser. A browser cannot open a TDS connection: SQL Server's wire protocol
 * is not HTTP, and no amount of client-side code changes that. So the executor here is
 * `FixtureExecutor`, answering the same statements a server would over a realistic Opus EDM schema.
 *
 * That is a milestone-one honesty, not a design: the deployment step is a route that resolves the
 * source's `secretRef`, opens a pooled connection with the `mssql` package, and implements the same
 * fifteen-line `SqlExecutor`. Everything above the port — the SQL, the type mapping, the inference, the
 * review, the promotion, the drift diff — is the code that will run in production, unchanged. The screen
 * says so where a steward will read it, because a scan that appears to have read a production database
 * and did not is the worst thing this surface could imply.
 */

import { Injectable, computed, signal } from '@angular/core';
import { CatalogService, type RawCatalog } from '@opus/catalog';
import {
  FIXTURE_SCHEMAS,
  FixtureExecutor,
  MsSqlProbe,
  type CatalogDraft,
  type DriftReport,
  type PhysicalSchema,
  type PromotionResult,
  type SourceRegistration,
  type SourceSummary,
  type SqlExecutor,
  checkRegistration,
  defaultDecisions,
  detectDrift,
  infer,
  normalise,
  promote,
  redactForClient,
  type StewardDecisions,
} from '@opus/catalog-ingest';

/** What a source's ingestion has reached. Drives which pane the screen shows. */
export type SourceStage = 'registered' | 'scanned' | 'promoted';

export interface SourceState {
  registration: SourceRegistration;
  summary: SourceSummary;
  stage: SourceStage;
  /** The most recent scan. */
  schema?: PhysicalSchema;
  draft?: CatalogDraft;
  decisions?: StewardDecisions;
  /** The scan that was promoted, kept so a re-scan has something to diff against. */
  promotedSchema?: PhysicalSchema;
  promotion?: PromotionResult;
  drift?: DriftReport;
}

/**
 * The source this application ships pre-registered.
 *
 * Not a demo convenience: registering a source is a form with eleven fields and a set of decisions
 * about encryption and entitlement, and a steward evaluating this feature should be able to see what a
 * scan produces before filling one in. It is registered exactly as the form would register it, through
 * the same `normalise`.
 */
const SEEDED = normalise(
  {
    name: 'Opus EDM — production',
    kind: 'mssql',
    host: 'sql-edm-prod-01',
    port: 1433,
    database: 'OpusEDM',
    auth: 'integrated',
    schemas: [...FIXTURE_SCHEMAS],
    encrypt: true,
    trustServerCertificate: false,
    registeredBy: 'vincent.giattino@greshamtech.com',
  },
  'opus-edm-prod',
  '2026-08-06T08:30:00.000Z',
);

@Injectable()
export class IngestService {
  private readonly states = signal<SourceState[]>([
    { registration: SEEDED, summary: redactForClient(SEEDED), stage: 'registered' },
  ]);

  readonly selectedId = signal<string>(SEEDED.id);
  readonly busy = signal<string | null>(null);
  readonly problem = signal<string | null>(null);

  readonly sources = computed(() => this.states());
  readonly selected = computed(
    () => this.states().find((state) => state.registration.id === this.selectedId()) ?? null,
  );

  /** The live catalog, so a promotion merges into what is already published rather than replacing it. */
  constructor(private readonly catalog: CatalogService) {}

  // ── registration ─────────────────────────────────────────────────────────────────────

  /** Validation as the steward types. The same function the server would call before storing. */
  check(input: Parameters<typeof checkRegistration>[0]) {
    return checkRegistration(input);
  }

  register(input: Parameters<typeof checkRegistration>[0]): string | null {
    const problems = this.check(input);
    if (problems.length) return problems[0]!.message;

    const registration = normalise(input, `src-${this.states().length + 1}`, new Date().toISOString());
    this.states.update((states) => [
      ...states,
      { registration, summary: redactForClient(registration), stage: 'registered' },
    ]);
    this.selectedId.set(registration.id);
    return null;
  }

  // ── scan and infer ───────────────────────────────────────────────────────────────────

  async scan(sampleEnumerations: boolean): Promise<void> {
    const state = this.selected();
    if (!state) return;

    this.busy.set('Reading the schema…');
    this.problem.set(null);
    try {
      const probe = new MsSqlProbe(
        state.registration.id,
        state.registration.database,
        state.registration.schemas,
      );
      const schema = await probe.scan(this.executorFor(state.registration), { sampleEnumerations });
      const draft = infer(schema);

      this.patch(state.registration.id, {
        schema,
        draft,
        // Everything promotable, included, for the steward to remove from — never a path that promotes.
        decisions: defaultDecisions(draft, state.registration.registeredBy),
        stage: 'scanned',
        drift: state.promotedSchema ? detectDrift(state.promotedSchema, schema, this.raw()) : undefined,
      });
    } catch (error) {
      this.problem.set(error instanceof Error ? error.message : String(error));
    } finally {
      this.busy.set(null);
    }
  }

  // ── review ───────────────────────────────────────────────────────────────────────────

  setEntityIncluded(ref: string, include: boolean): void {
    this.editDecisions((decisions) => {
      const entity = decisions.entities[ref];
      if (entity) entity.include = include;
    });
  }

  setAttributeIncluded(entityRef: string, id: string, include: boolean): void {
    this.editDecisions((decisions) => {
      const attribute = decisions.entities[entityRef]?.attributes[id];
      if (attribute) attribute.include = include;
    });
  }

  setMeasureIncluded(entityRef: string, id: string, include: boolean): void {
    this.editDecisions((decisions) => {
      const measure = decisions.entities[entityRef]?.measures[id];
      if (measure) measure.include = include;
    });
  }

  setEntitlement(entityRef: string, id: string, capability: string): void {
    this.editDecisions((decisions) => {
      const attribute = decisions.entities[entityRef]?.attributes[id];
      if (attribute) attribute.columnEntitlement = capability.trim() || undefined;
    });
  }

  setRowEntitlement(entityRef: string, capability: string): void {
    this.editDecisions((decisions) => {
      const entity = decisions.entities[entityRef];
      if (entity) entity.rowEntitlementDomain = capability.trim() || undefined;
    });
  }

  setEntityName(entityRef: string, businessName: string, pluralName: string): void {
    this.editDecisions((decisions) => {
      const entity = decisions.entities[entityRef];
      if (!entity) return;
      entity.businessName = businessName.trim() || undefined;
      entity.pluralName = pluralName.trim() || undefined;
    });
  }

  // ── promotion ────────────────────────────────────────────────────────────────────────

  /**
   * Promote, and install the result.
   *
   * Installed into the live `CatalogService` so the effect is the point rather than a report: the
   * builder's entity picker, the AI's grounding pack and the validator all read the same service, so a
   * promotion that worked is one where the next page an analyst builds can bind to what was promoted.
   */
  promoteSelected(): void {
    const state = this.selected();
    if (!state?.draft || !state.decisions) return;

    const result = promote(state.draft, state.decisions, this.raw(), {
      tenantId: this.raw()?.tenantId ?? 'gresham',
      promotedAt: new Date().toISOString(),
    });

    this.catalog.hydrate(result.catalog);
    this.patch(state.registration.id, {
      promotion: result,
      promotedSchema: state.schema,
      stage: 'promoted',
      drift: undefined,
    });
  }

  // ── plumbing ─────────────────────────────────────────────────────────────────────────

  /**
   * The executor. One place, so replacing it with a server route is one edit.
   *
   * A registration for a kind with no probe never reaches here — `SourceSummary.scannable` is false and
   * the screen offers no scan button — so this throwing on an unimplemented kind is a guard, not a path.
   */
  private executorFor(registration: SourceRegistration): SqlExecutor {
    if (registration.kind !== 'mssql') {
      throw new Error(`This platform has no probe for ${registration.kind} yet.`);
    }
    return new FixtureExecutor(undefined, { now: new Date().toISOString() });
  }

  /**
   * The catalog as stored, for a merge.
   *
   * The *live* one, not the last one this session produced. Promotion merges rather than replaces, and
   * the thing it must not lose is the catalog the application booted with — so the base is whatever
   * `CatalogService` currently holds, which after a promotion is the promoted result and before one is
   * the published catalog.
   */
  private raw(): RawCatalog | undefined {
    return this.catalog.stored();
  }

  private editDecisions(edit: (decisions: StewardDecisions) => void): void {
    const state = this.selected();
    if (!state?.decisions) return;
    // Cloned rather than mutated: a signal holding a mutated object does not notify, and the review
    // panel would silently stop reflecting the steward's own clicks.
    const decisions = structuredClone(state.decisions) as StewardDecisions;
    edit(decisions);
    this.patch(state.registration.id, { decisions });
  }

  private patch(id: string, changes: Partial<SourceState>): void {
    this.states.update((states) =>
      states.map((state) => (state.registration.id === id ? { ...state, ...changes } : state)),
    );
  }
}
