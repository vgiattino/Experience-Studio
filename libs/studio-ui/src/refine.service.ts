/**
 * Conversational refinement, as a session (PRD §10–§12 · §14 · §19, FR-08 · FR-09).
 *
 * ── WHERE THE BOUNDARY IS ────────────────────────────────────────────────────
 *
 * The same three-way split `assist.service.ts` describes, and for the same reasons:
 *
 *   `@opus/generation`   produces **refinements** and knows nothing about editing
 *   `@opus/studio-core`  produces **patches** and knows nothing about AI
 *   this service          is the only thing that knows both, and is the smallest of the three
 *
 * That layering is what makes the panel's central claim true: **an accepted refinement is an ordinary
 * edit.** It arrives as one patch tagged `origin: 'ai'`, undo reverses it, the history panel shows it,
 * the validator runs on the result, and the definition never enters a state only an AI edit could
 * produce.
 *
 * ── WHY THE CONVERSATION IS THE STATE, NOT THE PAGE ─────────────────────────
 *
 * §14 asks for a conversation that is *stateful*: "users should be able to start with a standard page
 * and progressively describe changes without having to specify the entire experience in one prompt."
 *
 * The tempting reading is that the AI needs memory of the *page*. It does not — the page is right
 * there, and `pageViewFor` reads it fresh on every turn, so a refinement is always grounded in what
 * the page is *now* rather than in what it was when the conversation started. That is strictly better
 * than remembering: an author who drags a widget between two prompts does not desynchronise anything.
 *
 * What genuinely needs to persist is the **conversation**: which turns were asked, which were applied,
 * which are still waiting on an answer to a question. That is what this holds, and it is what turns
 * §28's nine prompts into one session rather than nine unrelated requests.
 *
 * ── AND ONE THING IT DELIBERATELY DOES NOT DO ───────────────────────────────
 *
 * Apply on its own. Every turn stops at a proposal with its §19 sentence, and the author accepts or
 * discards. Mined from the parked builder, whose header put it best: *an author who cannot predict
 * what a button will do stops pressing it.*
 */

import { Injectable, computed, inject, signal } from '@angular/core';
import type { Identifier, PageDefinition } from '@opus/contracts';
import {
  ground,
  interpret,
  pageViewFor,
  refine,
  type RefineOutcome,
  type RefinePageView,
  type RefinementIntent,
  type ResolvedRefinement,
} from '@opus/generation';
import {
  DefinitionStore,
  moveNode,
  setComponentConfig,
  setValue,
  type ApplyOutcome,
  type Command,
} from '@opus/studio-core';

import { EditorService } from './editor.service';

/** One exchange in the conversation. */
export interface RefineTurn {
  id: string;
  /** What the author typed. */
  prompt: string;
  at: string;
  outcome: RefineOutcome;
  /**
   * What the sentence was understood to mean, kept so that answering a question re-grounds the intent
   * instead of re-reading the sentence. Absent when nothing was understood.
   */
  intent?: RefinementIntent;
  /** Set once accepted, so the turn reports what happened rather than vanishing. */
  applied?: { label: string; at: string };
  /** Set when accepting failed, with the command's own reason. */
  problem?: string;
  /** Set when the author discarded it. */
  discarded?: boolean;
}

@Injectable()
export class RefineService {
  private readonly editor = inject(EditorService);
  private readonly store = inject(DefinitionStore);

  private readonly _turns = signal<readonly RefineTurn[]>([]);
  readonly turns = this._turns.asReadonly();

  /** The most recent turn still awaiting an accept, discard or answer. */
  readonly pending = computed(() =>
    this._turns().find((turn) => !turn.applied && !turn.discarded && turn.outcome.outcome === 'resolved'),
  );

  /** The most recent turn that asked a question and has not been answered. */
  readonly asking = computed(() => {
    const last = this._turns()[this._turns().length - 1];
    return last && !last.discarded && last.outcome.outcome === 'ambiguous' ? last : undefined;
  });

  readonly count = computed(() => this._turns().length);

  /**
   * The open page as the resolver sees it, read fresh.
   *
   * Not cached. A cached view is a view that disagrees with the canvas the moment the author drags
   * something, and a refinement grounded in a stale page is the one failure mode this feature cannot
   * afford — it would resolve "the chart" to a widget that is no longer there.
   */
  private view(): RefinePageView | null {
    const definition = this.store.definition();
    if (!definition) return null;
    /*
      No sibling pages. They matter only to `set-drilldown`, which this applier cannot carry out anyway
      — drill-down targets live on the experience and this builder edits one page. Passing an empty
      list means the resolver refuses a drill-down with "this experience has only one page", which is
      the wrong reason for the right answer; `UNSUPPORTED` below carries the right one. Wiring the
      experience's page list through is the change that fixes both at once.
    */
    return pageViewFor(definition, this.editor.manifests(), { siblingPages: [] });
  }

  /** One turn: interpret, resolve, ground, and record. Nothing is applied. */
  ask(prompt: string): RefineTurn | null {
    const trimmed = prompt.trim();
    if (!trimmed) return null;

    const view = this.view();
    if (!view) return null;

    const intent = interpret(trimmed);
    const turn: RefineTurn = {
      id: `turn-${this._turns().length + 1}`,
      prompt: trimmed,
      at: new Date().toISOString(),
      outcome: refine(trimmed, view, intent),
      ...(intent ? { intent } : {}),
    };
    this._turns.update((turns) => [...turns, turn]);
    return turn;
  }

  /**
   * Answer a question the resolver asked, by naming one of the candidates.
   *
   * The answer fills the ONE reference the question was about — `outcome.on` names it — and the intent
   * is re-grounded. It is not re-parsed, and the difference is not cosmetic: appending the chosen name
   * to the sentence turned *"Sort by name"* into *"Sort by name — Securities"*, whose field capture
   * became `name — Securities` and matched nothing. The sentence was never the state; the intent was.
   *
   * The turn still *reads* as a conversation — the new turn's prompt is the original with the chosen
   * name — because the transcript is for the author, and a form-shaped record of a conversation is
   * harder to read back than the sentences that produced it.
   */
  answer(turnId: string, candidateLabel: string): RefineTurn | null {
    const original = this._turns().find((t) => t.id === turnId);
    if (!original || original.outcome.outcome !== 'ambiguous' || !original.intent) return null;

    const view = this.view();
    if (!view) return null;

    // The label carries "(type)" for a widget candidate; the bare name is what the resolver scores on.
    const name = candidateLabel.replace(/\s*\([^)]*\)\s*$/, '').trim();
    const answered: RefinementIntent = { ...original.intent, [original.outcome.on]: name };

    this.discard(turnId);
    const turn: RefineTurn = {
      id: `turn-${this._turns().length + 1}`,
      prompt: `${original.prompt} — ${name}`,
      at: new Date().toISOString(),
      outcome: ground(answered, view),
      intent: answered,
    };
    this._turns.update((turns) => [...turns, turn]);
    return turn;
  }

  /**
   * Accept a turn: translate every refinement to a command, apply as ONE patch, done.
   *
   * One patch for the whole turn, not one per refinement. A turn is what the author asked for, so it
   * is what undo has to reverse — two patches would make a single sentence take two presses of undo,
   * and the author would have no way to know which sentences were which.
   */
  accept(turnId: string): ApplyOutcome {
    const turn = this._turns().find((t) => t.id === turnId);
    if (!turn || turn.outcome.outcome !== 'resolved') {
      return { ok: false, problem: 'That turn has nothing to apply.' };
    }

    const outcome = this.store.run(
      (definition) => this.commandFor(definition, turn.outcome as { refinements: ResolvedRefinement[] }),
      'ai',
    );

    this._turns.update((turns) =>
      turns.map((t) =>
        t.id === turnId
          ? outcome.ok
            ? { ...t, applied: { label: turn.outcome.outcome === 'resolved' ? turn.outcome.explanation : '', at: new Date().toISOString() } }
            : { ...t, problem: outcome.problem ?? 'The change could not be applied' }
          : t,
      ),
    );
    return outcome;
  }

  discard(turnId: string): void {
    this._turns.update((turns) => turns.map((t) => (t.id === turnId ? { ...t, discarded: true } : t)));
  }

  reset(): void {
    this._turns.set([]);
  }

  // ── refinement → command ───────────────────────────────────────────────────

  /**
   * Compose every refinement in a turn into one command.
   *
   * Each verb is one or two patch operations against a definition the *store* holds, which is why
   * this reads the definition rather than the page view: the view is a projection for resolving
   * references, and applying against a projection would mean trusting a copy.
   */
  private commandFor(definition: PageDefinition, turn: { refinements: ResolvedRefinement[] }): Command {
    const ops = [];
    const labels: string[] = [];

    for (const refinement of turn.refinements) {
      const command = this.commandForOne(definition, refinement);
      if (!command) {
        return { label: 'Refine', refused: `“${refinement.verb}” cannot be applied yet. ${UNSUPPORTED[refinement.verb] ?? ''}`.trim() };
      }
      if ('refused' in command && command.refused) return command;
      if ('ops' in command) {
        ops.push(...command.ops);
        labels.push(command.label);
      }
    }

    if (ops.length === 0) return { label: 'Refine', refused: 'Nothing to change.' };
    return { label: labels.length === 1 ? labels[0]! : `Refine (${labels.length} changes)`, ops };
  }

  private commandForOne(definition: PageDefinition, refinement: ResolvedRefinement): Command | null {
    const componentId = refinement.componentId as Identifier | undefined;
    if (!componentId) return null;

    switch (refinement.verb) {
      case 'change-chart-type':
        return setComponentConfig(definition, componentId, 'mark', refinement.chartType);

      case 'group-rows':
        return setComponentConfig(definition, componentId, 'groupBy', refinement.field);

      case 'retitle-widget':
        return setValue(
          definition,
          pointer('components', componentId, 'title'),
          refinement.value,
          'Rename widget',
          componentId,
        );

      case 'move-widget':
        return this.moveCommand(definition, refinement);

      case 'add-column':
        return this.addColumnCommand(definition, refinement);

      case 'remove-column':
        return this.removeColumnCommand(definition, refinement);

      case 'sort-rows':
        return this.sortCommand(definition, refinement);

      case 'highlight-rows':
        return this.highlightCommand(definition, refinement);

      default:
        return null;
    }
  }

  private moveCommand(definition: PageDefinition, refinement: ResolvedRefinement): Command {
    const view = this.view();
    const widget = view?.widgets.find((w) => w.componentId === refinement.componentId);
    if (!widget?.nodeId || widget.parentId === undefined) {
      return { label: 'Move', refused: 'That widget is not inside a container that can be reordered.' };
    }

    const siblings = (view?.widgets ?? [])
      .filter((w) => w.parentId === widget.parentId)
      .sort((a, b) => (a.index ?? 0) - (b.index ?? 0));

    let index: number;
    if (refinement.position === 'top') index = 0;
    else if (refinement.position === 'bottom') index = siblings.length;
    else {
      const anchor = siblings.find((w) => w.componentId === refinement.relativeToComponentId);
      if (!anchor) {
        /*
          The anchor resolved during grounding and is not a sibling — the two widgets are in different
          containers, which is the same limit the refusal in `refine.ts` names. Refusing here rather
          than moving it somewhere plausible: a widget that lands in a container the author was not
          talking about is worse than a change that did not happen.
        */
        return {
          label: 'Move',
          refused: 'Those two are in different sections of the page, and moving between sections is not supported yet.',
        };
      }
      index = (anchor.index ?? 0) + (refinement.position === 'after' ? 1 : 0);
    }

    return moveNode(definition, { nodeId: widget.nodeId as Identifier, targetParentId: widget.parentId as Identifier, index });
  }

  private addColumnCommand(definition: PageDefinition, refinement: ResolvedRefinement): Command {
    const role = this.columnRoleFor(refinement.componentId);
    if (!role) return { label: 'Add column', refused: 'That widget has no column list to add to.' };
    return setValue(
      definition,
      `${pointer('components', refinement.componentId!, 'bindings', role)}/-`,
      { field: refinement.field },
      `Add ${refinement.field} column`,
      refinement.componentId as Identifier,
    );
  }

  private removeColumnCommand(definition: PageDefinition, refinement: ResolvedRefinement): Command {
    const role = this.columnRoleFor(refinement.componentId);
    const columns = this.columnsFor(refinement.componentId);
    const index = columns.indexOf(refinement.field ?? '');
    if (!role || index < 0) {
      return { label: 'Remove column', refused: 'That column is no longer on the widget.' };
    }
    return {
      label: `Remove ${refinement.field} column`,
      select: refinement.componentId as Identifier,
      ops: [{ op: 'remove', path: `${pointer('components', refinement.componentId!, 'bindings', role)}/${index}` }],
    };
  }

  /**
   * Sort is on the DATA SOURCE, not on the widget.
   *
   * Which is the right place and worth saying: the gateway applies it server-side, so a sort survives
   * paging and does not depend on how many rows a component happens to have loaded. A client-side
   * sort of the first page is a different and much worse feature.
   */
  private sortCommand(definition: PageDefinition, refinement: ResolvedRefinement): Command {
    const dataSourceId = this.dataSourceFor(refinement.componentId);
    if (!dataSourceId) return { label: 'Sort', refused: 'That widget reads no data source, so there is nothing to sort.' };
    return setValue(
      definition,
      pointer('dataSources', dataSourceId, 'sort'),
      [{ target: refinement.field, direction: refinement.direction === 'descending' ? 'desc' : 'asc' }],
      `Sort by ${refinement.field}`,
      refinement.componentId as Identifier,
    );
  }

  /**
   * Highlighting needs a CONDITION, and the field's type decides whether one can be inferred.
   *
   * A measure is a count, so "highlight rows with exceptions" means `> 0` and that is not a guess. An
   * attribute is a value, so the same sentence means "equal to *what*" — and inventing a value would
   * produce a rule that fires on nothing or on everything. The second case asks.
   */
  private highlightCommand(definition: PageDefinition, refinement: ResolvedRefinement): Command {
    const role = this.columnRoleFor(refinement.componentId);
    const columns = this.columnsFor(refinement.componentId);
    const index = columns.indexOf(refinement.field ?? '');
    if (!role || index < 0) {
      return { label: 'Highlight', refused: `“${refinement.field}” is not a column on that widget, so there is nothing to format.` };
    }

    const view = this.view();
    const widget = view?.widgets.find((w) => w.componentId === refinement.componentId);
    if (!widget?.numericFields.includes(refinement.field ?? '')) {
      return {
        label: 'Highlight',
        refused:
          `“${refinement.field}” holds a value rather than a count, so a highlight needs to know which value to look for — ` +
          `say for example “highlight rows where ${refinement.field} is Open”.`,
      };
    }

    return setValue(
      definition,
      `${pointer('components', refinement.componentId!, 'bindings', role)}/${index}/conditionalFormats`,
      [{ when: { $expr: `${refinement.field} > 0` }, emphasis: 'negative' }],
      `Highlight by ${refinement.field}`,
      refinement.componentId as Identifier,
    );
  }

  // ── small lookups against the live definition ─────────────────────────────

  private columnRoleFor(componentId: string | undefined): string | undefined {
    return this.view()?.widgets.find((w) => w.componentId === componentId)?.columnRole;
  }

  private columnsFor(componentId: string | undefined): readonly string[] {
    return this.view()?.widgets.find((w) => w.componentId === componentId)?.columns ?? [];
  }

  private dataSourceFor(componentId: string | undefined): string | undefined {
    return this.view()?.widgets.find((w) => w.componentId === componentId)?.dataSource;
  }
}

/**
 * Verbs the resolver can produce and this applier cannot yet carry out, with the reason.
 *
 * Listed rather than silently absent, because a refinement that resolves and then does nothing is the
 * worst of the three outcomes: the author has been told it worked.
 */
const UNSUPPORTED: Partial<Record<ResolvedRefinement['verb'], string>> = {
  'set-drilldown':
    'Drill-down targets live on the experience rather than on the page, and this builder edits one page — so the wiring needs the experience-level editor.',
};

/** JSON Pointer, with the escaping the spec requires. */
function pointer(...segments: (string | number)[]): string {
  return segments.map((s) => `/${String(s).replace(/~/g, '~0').replace(/\//g, '~1')}`).join('');
}
