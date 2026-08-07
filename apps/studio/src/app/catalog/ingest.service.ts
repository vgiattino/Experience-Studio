/**
 * The ingestion session: registered sources, their scans, and the drafts under review.
 *
 * ── THE API IS THE PRODUCT; THE FIXTURE IS A DEVELOPMENT AFFORDANCE ─────────────────────
 * When the API answers, every scan is a real connection to a real database: the backend resolves the
 * source's secret, opens a pooled TDS connection with the `mssql` driver, runs the introspection SQL,
 * and returns what the server said about itself. Nothing about the schema is simulated.
 *
 * When it does not answer, what happens depends on the build, and that distinction is the point:
 *
 *   · **a development build** falls back to running the same pipeline in the browser over
 *     `FixtureExecutor`, which answers the same statements from a built-in Opus EDM schema. This is
 *     what keeps the workspace demonstrable and testable without a database.
 *   · **a production build does not.** It reports that the catalog service is unreachable, with the
 *     cause, and offers no scan at all.
 *
 * The second half was missing and it was the serious defect. A production build that quietly substitutes
 * a fixture is a production build in which a steward can review and publish a catalog derived from a
 * fabricated schema — and the screen would have told them the backend was not running while their
 * backend was running perfectly on another origin. `fixtureFallbackAllowed()` is the gate, and it keys
 * off the build mode rather than a preference.
 *
 * A fourth state is not a failure at all: `forbidden`. The API is running and refused this caller,
 * because a draft carries physical table and column names and the routes require catalog stewardship.
 * Reporting that as "not running" would send a steward to look at a server that is working.
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
  applyEdit,
  blockingProblems,
  changedFields,
  checkEdit,
  checkRegistration,
  defaultDecisions,
  detectDrift,
  editContextOf,
  editableView,
  infer,
  materialChanges,
  normalise,
  promote,
  redactForClient,
  type EditContext,
  type FieldChange,
  type SourceEdit,
} from '@opus/catalog-ingest';

import { AUTHOR } from '../session';
import { apiBaseUrl, fixtureFallbackAllowed, personaHeader } from './api-config';
import * as api from './ingest-api';
import { PublishedCatalogService } from './published-catalog.service';

/** Who an edit is attributed to in browser-only mode. Over the API the server uses the caller. */
const AUTHOR_NAME = AUTHOR.displayName;

/**
 * What came of an edit.
 *
 * `needs-confirmation` is not a failure and is deliberately not modelled as one: the edit is valid, and
 * what the steward has not yet done is agree to what it costs the drift baseline.
 */
export type EditOutcome =
  | { status: 'saved'; changed: FieldChange[]; baselineCleared: boolean }
  | { status: 'needs-confirmation'; detail: string; changed: FieldChange[] }
  | { status: 'failed'; detail: string };

/** The current values, or why they could not be read. Never a bare null — see `loadEditable`. */
export type LoadedEdit =
  | { status: 'loaded'; value: api.EditableSource }
  | { status: 'failed'; detail: string };

/** What a source's ingestion has reached. Drives which pane the screen shows. */
export type SourceStage = 'registered' | 'scanned' | 'promoted';

/** Where scans come from. Rendered, not hidden — see the note at the top of the file. */
export type Transport =
  /** Still deciding. The screen shows nothing scannable until this resolves. */
  | 'connecting'
  /** A real connection through the backend. */
  | 'api'
  /** No API, and this build permits the browser-only pipeline over the built-in schema. */
  | 'fixture'
  /** No API, and this build does not permit a substitute. Nothing is scannable. */
  | 'unavailable'
  /** The API is running and refused this caller. */
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
  readonly mode = signal<Transport>('connecting');
  /** Why the API was refused, when it was. The server's own sentence. */
  readonly refusal = signal<string | null>(null);
  /** Why the API could not be reached, when it could not. The cause, not a guess. */
  readonly unreachable = signal<api.ApiUnreachable | null>(null);
  /**
   * Whether this deployment can store a password the steward types.
   *
   * From the server, because only the server knows whether it has an encryption key. The form asks
   * before rendering the field: offering one the server will refuse is worse than not offering it, since
   * the steward types a real credential in first.
   */
  readonly canStorePassword = signal(false);
  readonly passwordUnavailableReason = signal<string | undefined>(undefined);
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
   * Decide the transport, and load the roster.
   *
   * Once per attempt rather than per request: a screen whose mode flickers between calls cannot label
   * itself honestly, and re-probing on every scan would double the round trips to answer a question
   * whose answer does not change while a page is open.
   *
   * `attempt` exists because of a race that is not the user's fault. `npm run demo` starts the API and
   * the dev server together, and a browser that loads before the API finishes booting probes once,
   * fails, and settles into the built-in schema — where the password option is disabled and the reason
   * is two clicks away. A steward then reports that the password field does not work, which is exactly
   * what it looks like. So a failed probe retries a few times, briefly, and the mode heals itself.
   *
   * Only *unreachable* retries. A 403 is a decision, and repeating a request somebody already refused
   * is noise in an audit log.
   */
  async connect(attempts = 4): Promise<void> {
    this.mode.set('connecting');
    this.refusal.set(null);
    this.unreachable.set(null);
    this.ready.set(false);

    const result = await api.probe();

    if (result.status === 'available') {
      this.mode.set('api');
      this.canStorePassword.set(result.canStorePassword);
      this.passwordUnavailableReason.set(result.passwordUnavailableReason);
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
    } else if (attempts > 1) {
      /*
        Wait, then ask again — the API is probably still starting.

        Kept short and finite: three retries over about three seconds covers a process race and does not
        turn a genuinely absent backend into a screen that spins. The mode stays `connecting` throughout,
        so nothing claims to be reading a built-in schema while the question is still open.
      */
      await new Promise((wake) => setTimeout(wake, 900));
      return this.connect(attempts - 1);
    } else if (fixtureFallbackAllowed()) {
      this.mode.set('fixture');
      /*
        Fixture mode cannot store a password, and has to say why.

        Left unset, `passwordUnavailableReason` was undefined here and the form rendered an empty box
        where the explanation should have been — the same "it is broken" reading as the disabled radio.
        There is no server, so there is nowhere for a credential to go, and that is the sentence.
      */
      this.canStorePassword.set(false);
      this.passwordUnavailableReason.set(
        'There is no catalog service running, so there is nowhere to store a password. This mode reads a built-in schema and connects to nothing.',
      );
      this.unreachable.set(result);
      this.local.set(FIXTURE_SOURCE.id, FIXTURE_SOURCE);
      this.setSources([{ summary: redactForClient(FIXTURE_SOURCE), stage: 'registered' }]);
    } else {
      /*
        No API and no substitute. The screen shows the diagnostic and a retry, and nothing scannable.

        Deliberately not a fixture: publishing a catalog inferred from a built-in schema would be a
        governed vocabulary describing a database nobody connected to.
      */
      this.mode.set('unavailable');
      this.unreachable.set(result);
      this.setSources([]);
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

  // ── editing a registration ───────────────────────────────────────────────────────────

  /** Validation as the steward types, on an edit. The same function the server runs before storing. */
  checkEdit(context: EditContext, edit: SourceEdit) {
    return checkEdit(context, edit);
  }

  /**
   * The current values, wide enough to fill an edit form.
   *
   * Fetched rather than derived from the roster, because the roster is redacted: it has
   * `host:port/database` as one string and no username at all, so a form built from it would open with
   * three empty fields and overwrite them with blanks on save.
   *
   * ── WHY THIS RETURNS A REASON RATHER THAN NULL ──────────────────────────────────────────
   * Because the first version returned null, the screen had nowhere to put a null, and the result was
   * an Edit button that did nothing at all — reported as exactly that. The failure is not hypothetical
   * either: `npm run demo` runs the API as a separate process that does not reload on a pull, so a
   * developer who updates the Studio is left with a server that has no `/editable` route, and the
   * button silently stops working. A screen cannot report a cause it was never handed.
   */
  async loadEditable(id: string): Promise<LoadedEdit> {
    if (this.mode() === 'api') {
      try {
        return { status: 'loaded', value: await api.editable(id) };
      } catch (error) {
        return { status: 'failed', detail: describeEditableFailure(error) };
      }
    }

    const registration = this.local.get(id);
    if (!registration) {
      return {
        status: 'failed',
        detail:
          'This source is not held in this browser, and there is no catalog service to ask. Reload the page to rebuild the roster.',
      };
    }
    return {
      status: 'loaded',
      value: {
        editable: editableView(registration),
        hasBaseline: !!this.states().find((state) => state.summary.id === id)?.promotedSchema,
        revisions: [],
      },
    };
  }

  /**
   * Save an edit, or report that it needs a second yes.
   *
   * Three outcomes rather than a boolean, because the middle one is not a failure. A change that would
   * invalidate the promoted baseline is a legitimate edit the steward has not yet been told the cost of,
   * and collapsing it into "failed" would put a red message under a form whose contents are perfectly
   * valid.
   *
   * The server decides which outcome it is, in both modes — `materialChanges` here runs the same
   * function the route runs, so the browser-only mode asks the same question rather than a simpler one.
   */
  async updateSource(id: string, edit: SourceEdit, confirmBaselineReset = false): Promise<EditOutcome> {
    if (this.mode() === 'api') {
      this.busy.set('Saving…');
      try {
        const result = await api.update(id, edit, confirmBaselineReset);
        this.patch(id, {
          summary: result,
          // The baseline lived on the server; when it goes, so does any drift computed against it.
          ...(result.baselineCleared ? { drift: undefined } : {}),
        });
        return { status: 'saved', changed: result.changed, baselineCleared: result.baselineCleared };
      } catch (error) {
        if (error instanceof api.ApiProblem && error.code === 'baseline-reset-required') {
          return {
            status: 'needs-confirmation',
            detail: error.message,
            changed: (error.body['changes'] as FieldChange[] | undefined) ?? [],
          };
        }
        return { status: 'failed', detail: asText(error) };
      } finally {
        this.busy.set(null);
      }
    }

    const current = this.local.get(id);
    if (!current) return { status: 'failed', detail: 'That source is not held in this browser.' };

    const problems = blockingProblems(checkEdit(editContextOf(current), edit));
    if (problems.length) return { status: 'failed', detail: problems[0]!.message };

    const next = applyEdit(current, edit, new Date().toISOString(), AUTHOR_NAME);
    const changed = changedFields(current, next);
    if (!changed.length) return { status: 'saved', changed: [], baselineCleared: false };

    const state = this.states().find((held) => held.summary.id === id);
    const clearsBaseline = materialChanges(changed).length > 0 && !!state?.promotedSchema;
    if (clearsBaseline && !confirmBaselineReset) {
      return {
        status: 'needs-confirmation',
        detail:
          'This changes what the next scan reads, so the promoted scan can no longer be used as a baseline. Saving discards it — drift reports nothing until this source is scanned and published again.',
        changed: materialChanges(changed),
      };
    }

    this.local.set(id, next);
    this.patch(id, {
      summary: { ...redactForClient(next), hasBaseline: !clearsBaseline },
      ...(clearsBaseline ? { promotedSchema: undefined, drift: undefined } : {}),
    });
    return { status: 'saved', changed, baselineCleared: clearsBaseline };
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

  /**
   * Replace a source's password.
   *
   * Returns the server's message on failure and nothing on success, the same shape as `register` — and
   * like `register` it holds the password only as an argument. Nothing on this service stores it.
   */
  async rotateCredential(id: string, credential: { username?: string; password: string }): Promise<string | null> {
    if (this.mode() !== 'api') {
      return 'Rotating a credential needs the catalog service; this is the built-in schema.';
    }
    this.busy.set('Storing the new password…');
    try {
      const updated = await api.rotateCredential(id, credential);
      this.patch(id, { summary: updated });
      return null;
    } catch (error) {
      return error instanceof Error ? error.message : String(error);
    } finally {
      this.busy.set(null);
    }
  }

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
      // The configured base, not a hardcoded path — the same reason `ingest-api` resolves it at call time.
      const persona = personaHeader();
      const response = await fetch(`${apiBaseUrl()}/catalog`, {
        headers: persona ? { 'x-persona': persona } : {},
      });
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

/**
 * Why the current values could not be read — naming the one cause that is not about this source.
 *
 * A 404 from this route has two completely different meanings and only one of them is about the id.
 * The route answers an unknown source with a problem document, so it carries a `code`; a *missing
 * route* is answered by Express itself with HTML and no code at all. That absence is the signal, and
 * it is worth spending a branch on: it means the catalog service is older than this screen, which is
 * the ordinary outcome of pulling while `npm run api` keeps running, and no amount of retrying or
 * re-registering fixes it.
 */
function describeEditableFailure(error: unknown): string {
  if (error instanceof api.ApiProblem && error.status === 404 && !error.code) {
    // Plain text: this goes into a paragraph, and backticks would render as backticks.
    return (
      'The catalog service answered, but it has no route for reading a source back — which means it is ' +
      'older than this screen. The API does not reload when you pull, so stop it and run npm run demo ' +
      'again, then try once more.'
    );
  }
  return asText(error);
}
