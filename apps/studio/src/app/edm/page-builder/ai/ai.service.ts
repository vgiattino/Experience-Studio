/**
 * The orchestrator: prompt in, *proposal* out. Nothing here changes a page.
 *
 * ── THE ONE RULE THAT MAKES AI SAFE FOR A NON-TECHNICAL AUTHOR ──────────────────────────
 * A proposal is not an action. Every answer this service produces is a description plus a set of
 * grounded edits, and the author accepts or discards it. That is not politeness — it is what lets
 * someone who cannot read the store trust the feature at all: they see the sentence, they see the
 * count, they press Accept, and if it was wrong one press of Undo puts it back exactly.
 *
 * The alternative — apply and let them undo — reads faster in a demo and is worse in use. An author
 * who cannot predict what a button will do stops pressing it.
 *
 * ── THE PIPELINE, AND WHOSE JOB EACH STEP IS ────────────────────────────────────────────
 *   1. `intake()` from @opus/generation — classify, extract concepts, decline, or ask one question.
 *      Reused rather than rewritten: "delete last month's pricing data" is out of scope for a page
 *      builder whatever page model is underneath, and that judgement is already made and tested.
 *   2. build the prompt and hand it to a `ModelProvider` with a JSON Schema. Never parse prose.
 *   3. `ground()` — drop what this design cannot support, and keep the reason.
 *   4. return a proposal. The builder applies it, in one undo step, if the author says so.
 *
 * The provider is wrapped in `PolicyEnforcingProvider`, so the context budget and the per-session call
 * cap apply here exactly as they do to platform generation. A second AI surface with its own quiet
 * rules would be a second place to forget them.
 */

import { Injectable, signal } from '@angular/core';
import {
  DEFAULT_PROVIDER_POLICY,
  ModelProviderError,
  PolicyEnforcingProvider,
  intake,
  type ModelProvider,
} from '@opus/generation';

import { labelOf, linksOf, structureOf, type PageDef, type Widget } from '../model';
import { assemblePlan } from './assemble';
import { ground } from './apply';
import {
  CANVAS_EDIT_SCHEMA,
  CANVAS_PLAN_SCHEMA,
  type CanvasEdit,
  type CanvasEditSet,
  type CanvasPlan,
} from './decisions';
import { review, type Finding } from './review';
import { CanvasStandIn, type CanvasDecisionInputs } from './stand-in';

export type ProposalKind = 'page' | 'edits' | 'explain' | 'declined' | 'question';

export interface Proposal {
  kind: ProposalKind;
  /** The prompt this answers, so a proposal that survives a click elsewhere still makes sense. */
  prompt: string;
  /** One sentence, in the author's language. Always present, including for a refusal. */
  summary: string;
  /** Bullet lines: the widgets a page would gain, or the changes a set would make. */
  lines: string[];
  /** What was asked for and could not be done. Shown, never swallowed. */
  dropped: string[];
  /** Present for `page` — the assembled widgets, ready to become a new page. */
  page?: { name: string; widgets: Widget[]; notes: string[] };
  /** Present for `edits`. */
  edits?: CanvasEdit[];
  /** Which provider answered. Shown on screen: an author should know. */
  servedBy: string;
}

export interface AskContext {
  pages: readonly PageDef[];
  pageId: string;
  selected: Widget | null;
  /** The builder's id counter, so assembled widgets cannot collide with existing ones. */
  nextId: number;
}

const SYSTEM_PLAN = [
  'You design pages for Opus Experience Studio\'s EDM Page Builder.',
  'Return decisions only: which widgets, what each is called, and why it is there.',
  'You may name axis labels and column headings. You may never supply figures, series values or table rows.',
  'Use only the widget kinds in the provided palette vocabulary.',
].join(' ');

const SYSTEM_REFINE = [
  'You change an existing page in Opus Experience Studio\'s EDM Page Builder.',
  'Return the smallest set of edits that satisfies the instruction, each with a one-line reason.',
  'Refer only to widgets and pages that exist in the provided page summary.',
  'If the instruction is not something you can do to this page, return no edits.',
].join(' ');

@Injectable()
export class PageBuilderAiService {
  private readonly standIn = new CanvasStandIn();
  private provider: ModelProvider = new PolicyEnforcingProvider(
    this.standIn,
    DEFAULT_PROVIDER_POLICY,
  );

  readonly running = signal(false);
  readonly proposal = signal<Proposal | null>(null);

  /**
   * Install a real model.
   *
   * The whole seam. Everything above — intake, the prompts, the schemas, grounding, the proposal, the
   * undo entry — is unchanged by this call, which is the property that makes the stand-in a stage rather
   * than a dead end.
   */
  useProvider(provider: ModelProvider): void {
    this.provider = new PolicyEnforcingProvider(provider, DEFAULT_PROVIDER_POLICY);
  }

  providerLabel(): string {
    return `${this.provider.id}@${this.provider.version}${this.provider.isExternal ? ' (external)' : ''}`;
  }

  /** The unasked review. Rules, no model, no call — see `review.ts`. */
  findings(pages: readonly PageDef[]): Finding[] {
    return review(pages);
  }

  /**
   * Answer a prompt.
   *
   * One method for every kind of request, because the author does not know which kind theirs is. They
   * type a sentence; classification is our job, not theirs.
   */
  async ask(prompt: string, context: AskContext): Promise<Proposal> {
    const trimmed = prompt.trim();
    if (!trimmed) return this.stash(this.question('Tell me what you want this page to show.', trimmed));

    const page = context.pages.find((candidate) => candidate.id === context.pageId);
    const hasContent = !!page?.widgets.length;
    const result = intake(trimmed, hasContent);

    if (result.decline) {
      return this.stash({
        kind: 'declined',
        prompt: trimmed,
        summary: result.decline,
        lines: [],
        dropped: [],
        servedBy: this.providerLabel(),
      });
    }
    if (result.clarification) {
      return this.stash(this.question(result.clarification, trimmed));
    }
    if (result.intent === 'explain') {
      return this.stash(this.explain(trimmed, context));
    }

    const refine = result.intent === 'refine' || (hasContent && !!context.selected);
    this.running.set(true);
    try {
      const inputs: CanvasDecisionInputs = {
        prompt: trimmed,
        concepts: result.concepts,
        pages: context.pages,
        pageId: context.pageId,
        selected: context.selected,
      };
      // The stand-in reads the same decision inputs the prompt below was built from. A real provider
      // ignores this and loses nothing — the prompt and the schema are the whole contract.
      this.provider.useDecisionInputs?.(inputs);

      const response = await this.provider.complete({
        system: refine ? SYSTEM_REFINE : SYSTEM_PLAN,
        user: refine ? refinePrompt(trimmed, context) : planPrompt(trimmed, result.concepts),
        responseSchema: refine ? CANVAS_EDIT_SCHEMA : CANVAS_PLAN_SCHEMA,
        temperature: 0,
        purpose: refine ? 'refine' : 'plan',
      });

      return this.stash(
        refine
          ? this.fromEdits(trimmed, response.output as CanvasEditSet, context)
          : this.fromPlan(trimmed, response.output as CanvasPlan, context),
      );
    } catch (error) {
      const message =
        error instanceof ModelProviderError
          ? error.message
          : 'Something went wrong working that out.';
      return this.stash({
        kind: 'declined',
        prompt: trimmed,
        summary: `${message} Nothing was changed.`,
        lines: [],
        dropped: [],
        servedBy: this.providerLabel(),
      });
    } finally {
      this.running.set(false);
    }
  }

  /** Turn one review finding into a proposal, so a suggestion and an instruction land the same way. */
  proposeFix(finding: Finding, context: AskContext): Proposal {
    if (!finding.fix) {
      return this.stash(this.question(finding.detail, finding.title));
    }
    const { kept, dropped } = ground([finding.fix], context.pages, context.pageId);
    return this.stash({
      kind: 'edits',
      prompt: finding.title,
      summary: finding.detail,
      lines: kept.map((edit) => edit.why),
      dropped,
      edits: kept,
      servedBy: 'the design review (rules, no model)',
    });
  }

  clear(): void {
    this.proposal.set(null);
  }

  // ── building proposals ──────────────────────────────────────────────────────────────

  private fromPlan(prompt: string, plan: CanvasPlan, context: AskContext): Proposal {
    const assembled = assemblePlan(plan, context.pages, context.nextId);
    return {
      kind: 'page',
      prompt,
      summary: plan.pageSummary,
      lines: plan.widgets.map((widget) => `${widget.title} — ${widget.purpose}`),
      dropped: [],
      page: { name: plan.pageName, widgets: assembled.widgets, notes: assembled.notes },
      servedBy: this.providerLabel(),
    };
  }

  private fromEdits(prompt: string, set: CanvasEditSet, context: AskContext): Proposal {
    const { kept, dropped } = ground(set.edits ?? [], context.pages, context.pageId);
    if (!kept.length) {
      return {
        kind: 'question',
        prompt,
        summary: dropped.length
          ? 'I could not do that to this page.'
          : `I did not understand "${prompt}". Try naming what to change — "call it Coverage", "make it a bar chart", "add a table", "tidy up the layout".`,
        lines: [],
        dropped,
        servedBy: this.providerLabel(),
      };
    }
    return {
      kind: 'edits',
      prompt,
      summary: set.summary || `${kept.length} change(s) to this page.`,
      lines: kept.map((edit) => edit.why),
      dropped,
      edits: kept,
      servedBy: this.providerLabel(),
    };
  }

  /**
   * Describe the design in plain language.
   *
   * Rules, not a model call, and worth saying why: this is a *reading* of the page, and a reading that
   * says "three metrics and a chart" when there are four metrics is worse than no reading at all. The
   * counts have to be exact, so they are counted.
   */
  private explain(prompt: string, context: AskContext): Proposal {
    const page = context.pages.find((candidate) => candidate.id === context.pageId);
    if (!page) return this.question('There is no page open to describe.', prompt);

    const links = linksOf(context.pages).filter((link) => link.from === page.id);
    const rows = structureOf(page.widgets);
    const kinds = new Map<string, string[]>();
    for (const row of rows) {
      const group = readingGroup(row.widget);
      kinds.set(group, [...(kinds.get(group) ?? []), labelOf(row.widget)]);
    }

    const lines: string[] = [];
    for (const [group, names] of kinds) {
      lines.push(`${names.length} ${group}${names.length > 1 ? 's' : ''}: ${names.join(', ')}`);
    }
    if (links.length) {
      lines.push(
        `Readers can go to ${links.map((link) => `"${nameOf(context.pages, link.to)}"`).join(' and ')}.`,
      );
    } else {
      lines.push('There is no navigation off this page.');
    }
    const nested = rows.filter((row) => row.parentId);
    if (nested.length) lines.push(`${nested.length} widget(s) sit inside a section.`);

    return {
      kind: 'explain',
      prompt,
      summary: `"${page.name}" has ${page.widgets.length} widget(s) on a 12-column grid.`,
      lines,
      dropped: [],
      servedBy: 'the page itself (rules, no model)',
    };
  }

  private question(summary: string, prompt: string): Proposal {
    return {
      kind: 'question',
      prompt,
      summary,
      lines: [],
      dropped: [],
      servedBy: this.providerLabel(),
    };
  }

  private stash(proposal: Proposal): Proposal {
    this.proposal.set(proposal);
    return proposal;
  }
}

function readingGroup(widget: Widget): string {
  if (widget.type === 'kpi' || widget.type === 'gauge' || widget.type === 'progress') return 'figure';
  if (widget.type === 'chart') return 'chart';
  if (widget.type === 'table' || widget.type === 'grid') return 'table';
  if (widget.type === 'button') return 'link';
  if (widget.type === 'heading') return 'heading';
  if (widget.type === 'text') return 'piece of text';
  if (widget.type === 'section') return 'section';
  return 'control';
}

function nameOf(pages: readonly PageDef[], id: string): string {
  return pages.find((page) => page.id === id)?.name ?? id;
}

/**
 * The prompt for a whole page.
 *
 * The palette vocabulary goes in the *schema*, not here: an enum a provider is held to beats a list it
 * is asked to respect. What goes here is the request and what was extracted from it, which is the part
 * that changes per call.
 */
function planPrompt(prompt: string, concepts: { terms: string[] }): string {
  return [
    `Request: ${prompt}`,
    `Key terms: ${concepts.terms.join(', ') || '(none extracted)'}`,
    'Lay the page out in bands: metrics, charts, detail, actions.',
  ].join('\n');
}

/**
 * The prompt for a change.
 *
 * A page *summary* rather than the page's JSON: ids, labels, kinds and sizes are everything an edit can
 * refer to, and shipping the props of nineteen widgets spends the context budget on values no edit can
 * name. The platform's `viewOfPage` makes the same trade for the same reason.
 */
function refinePrompt(prompt: string, context: AskContext): string {
  const page = context.pages.find((candidate) => candidate.id === context.pageId);
  const widgets = (page?.widgets ?? [])
    .map(
      (widget) =>
        `- ${widget.id}: ${widget.type}${widget.type === 'chart' ? ` (${String(widget.props['kind'])})` : ''} "${labelOf(widget)}" ${widget.w}x${widget.h} at ${widget.x},${widget.y}`,
    )
    .join('\n');
  return [
    `Instruction: ${prompt}`,
    `Open page: ${page?.name ?? '(none)'} (${context.pageId})`,
    context.selected
      ? `Selected widget: ${context.selected.id} — "${labelOf(context.selected)}"`
      : 'Nothing is selected, so the instruction is about the page.',
    'Widgets:',
    widgets || '(none)',
    'Other pages:',
    context.pages
      .filter((candidate) => candidate.id !== context.pageId)
      .map((candidate) => `- ${candidate.id}: "${candidate.name}"`)
      .join('\n') || '(none)',
  ].join('\n');
}
