/**
 * Assist: AI suggestions for the open page, as patches the author can accept or ignore.
 *
 * ── WHERE THE BOUNDARY IS ─────────────────────────────────────────────────────────────
 * `@opus/generation` produces **proposals** and knows nothing about editing. `@opus/studio-core`
 * produces **patches** and knows nothing about AI. This service is the only thing that knows both,
 * and it is deliberately the smallest of the three: a proposal comes in, a `Command` goes out, and
 * the command goes to the store like any other.
 *
 * That layering is not tidiness. It is what makes the panel's central claim true — *an accepted
 * suggestion is an ordinary edit*. It arrives as one patch tagged `origin: 'ai'`, undo reverses it,
 * the history panel shows who made it, the validator runs on the result, and the definition never
 * enters a state that only an AI edit could produce. Had generation been allowed to emit patches,
 * every one of those properties would have had to be re-established here and re-tested.
 *
 * ── WHY SUGGESTING IS NOT AUTOMATIC ───────────────────────────────────────────────────
 * The panel asks, on a click. An editor that re-suggests on every keystroke trains the author to
 * ignore the panel, and each run is a model call with a cost and an audit record. So the trigger is
 * explicit, the result is cached until the page changes materially, and the author is told when what
 * they are looking at is stale rather than being silently re-run.
 */

import { Injectable, computed, inject, signal } from '@angular/core';
import { buildGroundingPack, retrieve, type CatalogSnapshot } from '@opus/catalog';
import type { ComponentManifest, PageDefinition } from '@opus/contracts';
import {
  ASSIST_RESPONSE_SCHEMA,
  analysePage,
  assistPrompt,
  componentTypeFor,
  keepGroundedProposals,
  mandatoryFilterFor,
  viewOfPage,
  type AssistInput,
  type AssistProposal,
  type AssistResponse,
  type ModelProvider,
} from '@opus/generation';
import {
  addBoundWidget,
  DefinitionStore,
  setPageProperty,
  setValue,
  type ApplyOutcome,
  type Command,
} from '@opus/studio-core';

import { EditorService } from './editor.service';

/** A proposal plus what happened to it in this session. */
export interface AssistSuggestion {
  proposal: AssistProposal;
  /** Set once accepted, so the row can report the outcome rather than vanishing. */
  applied?: { label: string; at: string };
  /** Set when accepting failed, with the command's own reason. */
  problem?: string;
}

export type AssistStatus = 'idle' | 'thinking' | 'ready' | 'error';

@Injectable()
export class AssistService {
  private readonly editor = inject(EditorService);
  private readonly store = inject(DefinitionStore);

  private readonly _suggestions = signal<readonly AssistSuggestion[]>([]);
  private readonly _status = signal<AssistStatus>('idle');
  private readonly _note = signal<string | null>(null);
  private readonly _rejected = signal<readonly { id: string; reason: string }[]>([]);
  private readonly _dismissed = signal<ReadonlySet<string>>(new Set());
  private readonly _providerId = signal<string | null>(null);
  /**
   * The artifact version the current suggestions were computed against.
   *
   * Compared with the store's live version to mark the panel stale. A count of applied patches
   * rather than a hash: what matters is "has the page moved since I asked", and the store already
   * counts that exactly.
   */
  private readonly _computedAt = signal<number | null>(null);

  readonly suggestions = this._suggestions.asReadonly();
  readonly status = this._status.asReadonly();
  readonly note = this._note.asReadonly();
  readonly rejected = this._rejected.asReadonly();
  readonly providerId = this._providerId.asReadonly();

  /** Open suggestions: not yet accepted, not dismissed. What the panel counts. */
  readonly open = computed(() =>
    this._suggestions().filter(
      (suggestion) => !suggestion.applied && !this._dismissed().has(suggestion.proposal.id),
    ),
  );

  readonly visible = computed(() =>
    this._suggestions().filter((suggestion) => !this._dismissed().has(suggestion.proposal.id)),
  );

  /** True when the page has changed since these suggestions were computed. */
  readonly stale = computed(() => {
    const at = this._computedAt();
    return at !== null && this.store.history().length !== at;
  });

  private provider: ModelProvider | null = null;

  /**
   * Install a provider. Without one, assist still works — `analysePage` runs in-process.
   *
   * The same seam `GenerationService.useProvider` uses, and for the same reason: the shell decides
   * whether a model is reachable, and nothing below it has to know.
   */
  useProvider(provider: ModelProvider | null): void {
    this.provider = provider;
    this._providerId.set(provider?.id ?? null);
  }

  async suggest(): Promise<void> {
    const definition = this.store.definition();
    const catalog = this.editor.catalog();
    if (!definition) {
      this.fail('No page is open');
      return;
    }
    if (!catalog) {
      this.fail('The catalog has not loaded, so nothing can be grounded');
      return;
    }

    this._status.set('thinking');
    this._note.set(null);
    this._rejected.set([]);

    try {
      const input = this.inputFor(definition, catalog);
      const response = await this.ask(input);
      const { kept, rejected } = keepGroundedProposals(response.proposals, input);

      this._suggestions.set(kept.map((proposal) => ({ proposal })));
      this._rejected.set(rejected);
      this._note.set(
        response.note ??
          (kept.length
            ? null
            : 'Nothing to add: every measure and groupable dimension in scope is already on the page.'),
      );
      this._computedAt.set(this.store.history().length);
      this._status.set('ready');
    } catch (error) {
      this.fail(error instanceof Error ? error.message : String(error));
    }
  }

  /**
   * Accept a proposal: translate, apply, done.
   *
   * `origin: 'ai'` is not cosmetic. The history panel renders it, `docs/AI-GENERATION-WORKFLOW.md`
   * requires an AI edit to be attributable, and a reviewer looking at a diff needs to know which
   * changes a person made. The provenance is recorded at the moment of application because that is
   * the only moment it is known for certain.
   */
  accept(proposal: AssistProposal): ApplyOutcome {
    const outcome = this.store.run((definition) => this.commandFor(definition, proposal), 'ai');

    this._suggestions.update((current) =>
      current.map((suggestion) =>
        suggestion.proposal.id === proposal.id
          ? outcome.ok
            ? { ...suggestion, applied: { label: proposal.title, at: new Date().toISOString() } }
            : { ...suggestion, problem: outcome.problem ?? 'The change could not be applied' }
          : suggestion,
      ),
    );
    return outcome;
  }

  /**
   * Dismiss a proposal for this session.
   *
   * Keyed on the proposal id, which `analysePage` derives from the gap rather than counting — so a
   * dismissed suggestion stays dismissed through a re-run. A counter-based id would re-offer it the
   * moment anything else about the page changed, and the author would have to dismiss it forever.
   */
  dismiss(id: string): void {
    this._dismissed.update((current) => new Set([...current, id]));
  }

  reset(): void {
    this._suggestions.set([]);
    this._dismissed.set(new Set());
    this._note.set(null);
    this._rejected.set([]);
    this._computedAt.set(null);
    this._status.set('idle');
  }

  // ── grounding ──────────────────────────────────────────────────────────────────────

  /**
   * The grounding pack for assist: **the page's own entities, expanded one hop**.
   *
   * Deliberately narrower than generation's, which retrieves from a prompt. Assist is a depth
   * question, not a breadth one — the author wants to know what else is available *on what this page
   * already reads*, and a pack seeded from the whole catalog would bury that under entities the page
   * has nothing to do with. One graph hop is kept, so a related entity a natural next widget would
   * need is present.
   *
   * The retrieval still runs against the entitlement-scoped projection, so scope is enforced by
   * construction rather than by this function remembering to.
   */
  private inputFor(definition: PageDefinition, catalog: CatalogSnapshot): AssistInput {
    const page = viewOfPage(definition);
    const terms = [
      page.name,
      ...page.entities.map((ref) => ref.split('.').pop() ?? ref),
    ].filter(Boolean);

    const retrieval = retrieve(catalog, {
      terms,
      entityHints: page.entities as never,
      maxEntities: Math.max(3, page.entities.length + 1),
      graphHops: 1,
    });

    return {
      page,
      grounding: buildGroundingPack(catalog, retrieval),
      availableComponents: this.editor.registeredTypes(),
      max: 5,
    };
  }

  private async ask(input: AssistInput): Promise<AssistResponse> {
    if (!this.provider) {
      // No provider: the deterministic baseline *is* the answer, not a degraded one.
      return { proposals: analysePage(input) };
    }

    // Before the call, not after: a stand-in behind a transport reads these to answer at all, and a
    // real provider does not implement the method and loses nothing (model-provider.ts).
    this.offerDecisionInputs(input);

    const { system, user } = assistPrompt(input);
    const response = await this.provider.complete({
      system,
      user,
      responseSchema: ASSIST_RESPONSE_SCHEMA,
      purpose: 'assist',
      temperature: 0.2,
    });
    return response.output as AssistResponse;
  }

  /** Hand the stand-in the same inputs the prompt was built from, when it asks for them. */
  private offerDecisionInputs(input: AssistInput): void {
    this.provider?.useDecisionInputs?.({
      availableComponents: input.availableComponents,
      assist: input,
    });
  }

  // ── proposal → command ─────────────────────────────────────────────────────────────

  /**
   * The translation. Every branch ends in a command from the editing vocabulary — there is no path
   * here that writes a patch by hand, because a hand-written patch is a mutation the command layer's
   * tests do not cover.
   */
  private commandFor(definition: PageDefinition, proposal: AssistProposal): Command {
    switch (proposal.kind) {
      case 'set-page-description':
        return setPageProperty(definition, 'description', proposal.value);

      case 'retitle-widget':
        return setValue(
          definition,
          `/components/${proposal.componentId}/title`,
          proposal.value,
          `AI: title “${proposal.value}”`,
        );

      case 'add-figure': {
        const manifest = this.manifestFor(proposal.kind);
        if (!manifest) return this.missingComponent(proposal.kind);
        return addBoundWidget(definition, {
          manifest,
          title: proposal.widgetTitle,
          label: `AI: ${proposal.title}`,
          source: {
            entity: proposal.entityRef,
            kind: 'aggregate',
            measure: { ref: proposal.measureRef, aggregation: proposal.aggregation },
            ...this.filterFor(proposal.entityRef),
          },
        });
      }

      case 'add-breakdown': {
        const manifest = this.manifestFor(proposal.kind);
        if (!manifest) return this.missingComponent(proposal.kind);
        return addBoundWidget(definition, {
          manifest,
          title: proposal.widgetTitle,
          label: `AI: ${proposal.title}`,
          source: {
            entity: proposal.entityRef,
            kind: 'aggregate',
            measure: { ref: proposal.measureRef, aggregation: proposal.aggregation },
            dimension: { ref: proposal.dimensionRef, temporal: proposal.temporal },
            ...this.filterFor(proposal.entityRef),
          },
        });
      }

      case 'add-list': {
        const manifest = this.manifestFor(proposal.kind);
        if (!manifest) return this.missingComponent(proposal.kind);
        return addBoundWidget(definition, {
          manifest,
          title: proposal.widgetTitle,
          label: `AI: ${proposal.title}`,
          source: {
            entity: proposal.entityRef,
            kind: 'list',
            attributes: proposal.attributeRefs.map((ref) => ({ ref })),
            ...this.filterFor(proposal.entityRef),
          },
        });
      }
    }
  }

  /**
   * The mandatory filter for an entity that requires one, resolved at accept time.
   *
   * Not carried on the proposal, on purpose. It is not a *decision* — it is a governance consequence
   * of the entity, derived by one shared rule (`mandatoryFilterFor`). Putting it on the proposal
   * would make it something a model could get wrong, and a model getting it wrong means a page level
   * 3 rejects with no way for the author to see why.
   */
  private filterFor(
    entityRef: string,
  ): { mandatoryFilter?: { attribute: string; operator: string; value?: unknown } } {
    const catalog = this.editor.catalog();
    if (!catalog) return {};
    const entity = catalog.entities[entityRef as never];
    if (!entity) return {};

    // `mandatoryFilterFor` reads a *grounded* entity, so build the one field it needs from the
    // projection rather than re-running retrieval for a single lookup.
    const filters = mandatoryFilterFor({
      ref: entity.id,
      name: '',
      primaryKey: entity.primaryKey,
      requiresFilter: entity.cost?.requiresFilter === true,
      attributes: Object.values(entity.attributes).map((attribute) => ({
        ref: attribute.id,
        name: '',
        dataType: attribute.dataType,
        filterable: attribute.filterable !== false,
        groupable: attribute.groupable === true,
        isTemporal: ['date', 'datetime', 'time'].includes(attribute.dataType),
        isKey: entity.primaryKey.includes(attribute.id),
        ...(attribute.enumValues?.length
          ? { enumValues: attribute.enumValues.map((value) => value.value) }
          : {}),
      })),
      measures: [],
      retrievedVia: [],
    });

    const first = filters[0];
    if (!first) return {};
    return {
      mandatoryFilter: {
        attribute: first.attributeRef,
        operator: first.operator,
        ...(first.value === undefined ? {} : { value: first.value }),
      },
    };
  }

  private manifestFor(kind: AssistProposal['kind']): ComponentManifest | undefined {
    const type = componentTypeFor(kind);
    return type ? this.editor.manifestByType().get(type) : undefined;
  }

  private missingComponent(kind: AssistProposal['kind']): Command {
    return {
      label: 'Apply suggestion',
      refused: `${componentTypeFor(kind)} is not registered, so this cannot be added`,
    };
  }

  private fail(problem: string): void {
    this._status.set('error');
    this._note.set(problem);
    this._suggestions.set([]);
  }
}
