/**
 * The ingestion session: registered sources, their scans, and the drafts under review.
 *
 * ── TWO TRANSPORTS, AND THE SCREEN ALWAYS SAYS WHICH ────────────────────────────────────
 * When `/api/sources` answers, every scan is a real connection to a real database: the backend resolves
 * the source's secret, opens a pooled TDS connection with the `mssql` driver, runs the introspection
 * SQL, and returns what the server said about itself. Nothing about the schema is simulated.
 *
 * When it does not answer — the API is not running — the same pipeline runs in the browser over
 * `FixtureExecutor`, which answers the same statements from a built-in Opus EDM schema. That is not a
 * fallback for its own sake; it is what keeps this workspace demonstrable and testable without a
 * database. But it is a materially different claim, so `mode` is a signal the screen renders rather
 * than a detail: a scan that appears to have read production and did not is the worst thing this
 * surface could imply.
 *
 * A third state exists and is not a failure: `forbidden`. The API is running and refused this caller,
 * because a draft carries physical table and column names and the routes require catalog stewardship.
 * Reporting that as "offline" would send a steward to look at a server that is working.
 *
 * ── WHAT THIS HOLDS AND WHAT THE LIBRARY HOLDS ──────────────────────────────────────────
 * `@opus/catalog-ingest` holds the pipeline and knows nothing about Angular or HTTP. This service holds
 * the *session* — which sources exist, which one is open, what the last scan found, which decisions the
 * steward has made so far. That split is why the pipeline is testable without a browser and this screen
 * is testable without a database.
 */

import { Injectable, computed, signal } from '@angular/core';
import { CatalogService, type CatalogSnapshot } from '@opus/catalog';
import {
  FIXTURE_SCHEMAS,
  FixtureExecutor,
  MsSqlProbe,
  type CatalogDraft,
  type DriftReport,
  type PhysicalSchema,
  type PromotionNote,
  type SourceRegistration,
  type SourceSummary,
  type SqlExecutor,
  type StewardDecisions,
  blockingProblems,
  checkRegistration,
  defaultDecisions,
  detectDrift,
  infer,
  normalise,
  promote,
  redactForClient,
} from '@opus/catalog-ingest';

import * as api from './ingest-api';
import { PublishedCatalogService } from './published-catalog.service';

/** What a source's ingestion has reached. Drives which pane the screen shows. */
export type SourceStage = 'registered' | 'scanned' | 'promoted';

/** Where scans come from. Rendered, not hidden — see the note at the top of the file. */
export type Transport =
  /** A real connection through the backend. */
  | 'api'
  /** The backend is not running; the pipeline runs in the browser over the built-in schema. */
  | 'fixture'
  /** The backend is running and refused this caller. */
  | 'forbidden';

export interface SourceState {
  summary: SourceSummary & { promotedAt?: string; promotedBy?: string; hasBaseline?: boolean };
  stage: SourceStage;
  /** The most recent scan. */
  schema?: PhysicalSchema;
  draft?: CatalogDraft;
  decisions?: StewardDecisions;
  /** Only in fixture mode: the API keeps its own baseline on the server. */
  promotedSchema?: PhysicalSchema;
  promotion?: {
    counts: { entities: number; attributes: number; measures: number; relationships: number };
    notes: PromotionNote[];
    catalogVersion: number;
    /** Present over the API only: the server counts what this caller can see. */
    visible?: number;
  };
  drift?: DriftReport;
  /** Set by a connection test, so the screen can show the server it actually reached. */
  reached?: { target: string; serverVersion: string };
}

/**
 * The source the browser-only mode offers.
 *
 * Registered exactly as the form would register it, through the same `normalise`, so fixture mode is
 * the same code path with a different executor rather than a special case. It is absent in API mode:
 * there, the roster is whatever the server has stored.
 */
const FIXTURE_SOURCE = normalise(
  {
    name: 'Opus EDM — built-in schema',
    kind: 'mssql',
    host: 'sql-edm-prod-01',
    port: 1433,
    database: 'OpusEDM',
    auth: 'integrated',
    schemas: [...FIXTURE_SCHEMAS],
    encrypt: true,
    trustServerCertificate: false,
    registeredBy: 'built in',
  },
  'opus-edm-fixture',
  '2026-08-06T08:30:00.000Z',
);

@Injectable()
export class IngestService {
  private readonly states = signal<SourceState[]>([]);

  readonly selectedId = signal<string>('');
  readonly busy = signal<string | null>(null);
  readonly problem = signal<string | null>(null);
  readonly mode = signal<Transport>('fixture');
  /** Why the API was refused, when it was. The server's own sentence. */
  readonly refusal = signal<string | null>(null);
  readonly ready = signal(false);

  readonly sources = computed(() => this.states());
  readonly selected = computed(
    () => this.states().find((state) => state.summary.id === this.selectedId()) ?? null,
  );

  /** Fixture mode only: the registrations the browser holds, for its own executor. */
  private readonly local = new Map<string, SourceRegistration>();

  constructor(
    private readonly catalog: CatalogService,
    private readonly published: PublishedCatalogService,
  ) {
    void this.connect();
  }

  /**
   * Decide the transport once, at construction, and load the roster.
   *
   * Once rather than per call: a screen whose mode flickers between requests is a screen that cannot
   * label itself honestly, and re-probing on every scan would double the round trips to answer a
   * question whose answer does not change while a page is open.
   */
  private async connect(): Promise<void> {
    const result = await api.probe();

    if (result.status === 'available') {
      this.mode.set('api');
      this.setSources(
        result.sources.map((source) => ({
          summary: source,
          stage: source.promotedAt ? 'promoted' : 'registered',
        })),
      );
    } else if (result.status === 'forbidden') {
      this.mode.set('forbidden');
      this.refusal.set(result.detail);
      this.setSources([]);
    } else {
      this.mode.set('fixture');
      this.local.set(FIXTURE_SOURCE.id, FIXTURE_SOURCE);
      this.setSources([{ summary: redactForClient(FIXTURE_SOURCE), stage: 'registered' }]);
    }
    this.ready.set(true);
  }

  private setSources(states: SourceState[]): void {
    this.states.set(states);
    if (states.length && !states.some((state) => state.summary.id === this.selectedId())) {
      this.selectedId.set(states[0]!.summary.id);
    }
  }

  // ── registration ─────────────────────────────────────────────────────────────────────

  /** Validation as the steward types. The same function the server runs before storing. */
  check(input: Parameters<typeof checkRegistration>[0]) {
    return checkRegistration(input);
  }

  async register(input: Parameters<typeof checkRegistration>[0]): Promise<string | null> {
    // Blocking only. A warning is a judgement this caller is allowed to make; the server agrees.
    const problems = blockingProblems(this.check(input));
    if (problems.length) return problems[0]!.message;

    if (this.mode() === 'api') {
      try {
        const created = await api.register(input as unknown as Record<string, unknown>);
        this.states.update((states) => [...states, { summary: created, stage: 'registered' }]);
        this.selectedId.set(created.id);
        return null;
      } catch (error) {
        return asText(error);
      }
    }

    const registration = normalise(input, `src-${this.states().length + 1}`, new Date().toISOString());
    this.local.set(registration.id, registration);
    this.states.update((states) => [
      ...states,
      { summary: redactForClient(registration), stage: 'registered' },
    ]);
    this.selectedId.set(registration.id);
    return null;
  }

  // ── connection test ──────────────────────────────────────────────────────────────────

  /**
   * Ask whether the registration can connect at all.
   *
   * Only meaningful over the API, because that is the only mode with a network in it. In fixture mode
   * the button is absent rather than answering "yes" about a connection nobody made.
   */
  async test(): Promise<void> {
    const state = this.selected();
    if (!state || this.mode() !== 'api') return;

    this.busy.set('Connecting…');
    this.problem.set(null);
    try {
      const reached = await api.test(state.summary.id);
      this.patch(state.summary.id, { reached });
    } catch (error) {
      this.problem.set(asText(error));
    } finally {
      this.busy.set(null);
    }
  }

  // ── scan and infer ───────────────────────────────────────────────────────────────────

  async scan(sampleEnumerations: boolean): Promise<void> {
    const state = this.selected();
    if (!state) return;

    this.busy.set(this.mode() === 'api' ? 'Connecting and reading the schema…' : 'Reading the schema…');
    this.problem.set(null);
    try {
      const result: api.ScanResult =
        this.mode() === 'api'
          ? await api.scan(state.summary.id, sampleEnumerations)
          : await this.scanLocally(state, sampleEnumerations);

      this.patch(state.summary.id, {
        schema: result.schema,
        draft: result.draft,
        decisions: result.decisions,
        drift: result.drift,
        stage: 'scanned',
      });
    } catch (error) {
      this.problem.set(asText(error));
    } finally {
      this.busy.set(null);
    }
  }

  /** Fixture mode: the same probe, the same inference, over an executor that needs no network. */
  private async scanLocally(
    state: SourceState,
    sampleEnumerations: boolean,
  ): Promise<api.ScanResult> {
    const registration = this.local.get(state.summary.id);
    if (!registration) throw new Error('That source is not held in this browser.');

    const schema = await new MsSqlProbe(
      registration.id,
      registration.database,
      registration.schemas,
    ).scan(this.executorFor(registration), { sampleEnumerations });
    const draft = infer(schema);

    return {
      schema,
      draft,
      decisions: defaultDecisions(draft, registration.registeredBy),
      drift: state.promotedSchema
        ? detectDrift(state.promotedSchema, schema, this.catalog.stored())
        : undefined,
    };
  }

  private executorFor(registration: SourceRegistration): SqlExecutor {
    if (registration.kind !== 'mssql') {
      throw new Error(`This platform has no probe for ${registration.kind} yet.`);
    }
    return new FixtureExecutor(undefined, { now: new Date().toISOString() });
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

  // ── promotion ────────────────────────────────────────────────────────────────────────

  /**
   * Publish, and reload what this application can see.
   *
   * Over the API the server re-scans, re-infers, promotes, writes the catalog and hydrates its own
   * service — so the client's job afterwards is to fetch its *projection* again, which is the only
   * catalog shape it is allowed. In fixture mode the promotion happens here and installs directly,
   * because there is no server to hold it.
   */
  async promoteSelected(sampleEnumerations: boolean): Promise<void> {
    const state = this.selected();
    if (!state?.decisions) return;

    this.busy.set('Publishing…');
    this.problem.set(null);
    try {
      if (this.mode() === 'api') {
        const summary = await api.promote(state.summary.id, state.decisions, sampleEnumerations);
        this.patch(state.summary.id, { promotion: summary, stage: 'promoted', drift: undefined });
        await this.reloadProjection();
        return;
      }

      if (!state.draft) return;
      const result = promote(state.draft, state.decisions, this.catalog.stored(), {
        tenantId: this.catalog.stored()?.tenantId ?? 'demo-tenant',
        promotedAt: new Date().toISOString(),
      });
      this.catalog.hydrate(result.catalog);
      this.patch(state.summary.id, {
        promotion: { ...result, catalogVersion: result.catalog.catalogVersion },
        promotedSchema: state.schema,
        stage: 'promoted',
        drift: undefined,
      });
    } catch (error) {
      this.problem.set(asText(error));
    } finally {
      this.busy.set(null);
    }
  }

  /**
   * Re-read the catalog from the server after a promotion.
   *
   * The projection, not the catalog — this browser gets what its entitlements permit and nothing
   * physical, exactly as at bootstrap. It goes to `PublishedCatalogService` rather than into
   * `CatalogService.hydrate`, for the reason that file gives: a projection is not a raw catalog, and
   * hydrating one produces an empty physical map that nothing can tell is empty. This is what makes a
   * publish visible in the Vocabulary tab one click away.
   */
  private async reloadProjection(): Promise<void> {
    try {
      const response = await fetch('/api/catalog', { headers: { 'x-persona': 'steward' } });
      if (!response.ok) return;
      const body = (await response.json()) as { snapshot?: CatalogSnapshot };
      if (body?.snapshot) this.published.install(body.snapshot);
    } catch {
      // A failed reload leaves the previous projection, which is stale rather than wrong.
    }
  }

  // ── plumbing ─────────────────────────────────────────────────────────────────────────

  private editDecisions(edit: (decisions: StewardDecisions) => void): void {
    const state = this.selected();
    if (!state?.decisions) return;
    // Cloned rather than mutated: a signal holding a mutated object does not notify, and the review
    // panel would silently stop reflecting the steward's own clicks.
    const decisions = structuredClone(state.decisions) as StewardDecisions;
    edit(decisions);
    this.patch(state.summary.id, { decisions });
  }

  private patch(id: string, changes: Partial<SourceState>): void {
    this.states.update((states) =>
      states.map((state) => (state.summary.id === id ? { ...state, ...changes } : state)),
    );
  }
}

function asText(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
