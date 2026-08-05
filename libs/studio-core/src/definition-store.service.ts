/**
 * The Definition Store (architecture/frontend-architecture.md §4.3).
 *
 * ONE DOCUMENT. ONE LOG. EVERY CHANGE IS A PATCH.
 *
 * The store deliberately has no idea where a patch came from. A drag, a property edit, an AI
 * refinement and a hand-edit of the JSON all arrive through `apply()`, and that indistinguish-
 * ability is the design: it is what makes undo work uniformly, what lets AI refinement survive
 * manual edits without merge logic, and what makes the patch log a review diff and an audit
 * trail at the same time.
 *
 * It is also state tier 2 of the four in §4.2, and the boundary matters: **server data never
 * enters this store.** Query results in the definition store would be serialized into saved
 * definitions, cached across entitlement scopes, and captured in undo history. The third is a
 * security defect, so the separation is not stylistic.
 */

import { Injectable, computed, signal } from '@angular/core';
import type { PageDefinition } from '@opus/contracts';

import {
  applyPatch,
  describeOp,
  invertPatch,
  PatchError,
  type PatchOp,
} from './json-patch';
import { isRefusal, type Command } from './commands';

export interface HistoryEntry {
  /** Monotonic within a session, so the UI can key on it. */
  seq: number;
  label: string;
  /** Who produced it. Recorded because provenance for an AI edit is an audit requirement. */
  origin: 'user' | 'ai' | 'json';
  ops: readonly PatchOp[];
  /** The patch that undoes it, computed at apply time against the pre-state. */
  inverse: readonly PatchOp[];
  at: string;
}

export interface ApplyOutcome {
  ok: boolean;
  /** Set when the command refused or the patch could not be applied. */
  problem?: string;
}

@Injectable()
export class DefinitionStore {
  private readonly _definition = signal<PageDefinition | null>(null);
  private readonly _history = signal<readonly HistoryEntry[]>([]);
  /** Index of the next undo. Equal to history length when nothing is undone. */
  private readonly _cursor = signal(0);
  private readonly _savedAt = signal<string | null>(null);
  private readonly _savedSeq = signal(0);
  private readonly _problem = signal<string | null>(null);
  private seq = 0;

  readonly definition = this._definition.asReadonly();
  readonly history = this._history.asReadonly();
  readonly cursor = this._cursor.asReadonly();
  readonly problem = this._problem.asReadonly();
  readonly savedAt = this._savedAt.asReadonly();

  readonly canUndo = computed(() => this._cursor() > 0);
  readonly canRedo = computed(() => this._cursor() < this._history().length);

  /**
   * Dirty is measured against the last SAVED sequence, not against a boolean flag.
   *
   * A flag gets it wrong in the one case users notice: edit, then undo back to the saved
   * state. The document is identical to what is on disk, and a flag still says unsaved.
   */
  readonly dirty = computed(() => this.currentSeq() !== this._savedSeq());

  /** The undo/redo-visible entries, newest first, with which one is current. */
  readonly timeline = computed(() => {
    const history = this._history();
    const cursor = this._cursor();
    return history.map((entry, index) => ({
      ...entry,
      undone: index >= cursor,
      summary: entry.ops.map(describeOp).join(', '),
    }));
  });

  private currentSeq(): number {
    const cursor = this._cursor();
    return cursor === 0 ? 0 : (this._history()[cursor - 1]?.seq ?? 0);
  }

  /** Install a definition as the editing baseline. Clears history: it is a different document. */
  open(definition: PageDefinition): void {
    this._definition.set(definition);
    this._history.set([]);
    this._cursor.set(0);
    this.seq = 0;
    this._savedSeq.set(0);
    this._savedAt.set(null);
    this._problem.set(null);
  }

  close(): void {
    this._definition.set(null);
    this._history.set([]);
    this._cursor.set(0);
    this.seq = 0;
    this._savedSeq.set(0);
  }

  /**
   * Run a command and record it.
   *
   * A command is a *function* of the current definition rather than a prepared patch, so it
   * cannot be applied against a document it was not computed from — the stale-patch bug that
   * appears the moment two sources of edits exist.
   */
  run(
    command: (definition: PageDefinition) => Command,
    origin: HistoryEntry['origin'] = 'user',
  ): ApplyOutcome {
    const definition = this._definition();
    if (!definition) return { ok: false, problem: 'No page is open' };
    const result = command(definition);
    if (isRefusal(result)) {
      this._problem.set(result.refused);
      return { ok: false, problem: result.refused };
    }
    return this.apply(result.ops, result.label, origin);
  }

  /**
   * Apply a patch directly. The entry point an AI refinement or a JSON edit uses.
   *
   * Application is all-or-nothing: an operation that cannot be applied leaves the document
   * exactly as it was. A partially-applied structural patch is worse than a rejected one,
   * because the user is left holding a definition that is neither what they had nor what they
   * asked for, and undo cannot describe it.
   */
  apply(
    ops: readonly PatchOp[],
    label: string,
    origin: HistoryEntry['origin'] = 'user',
  ): ApplyOutcome {
    const definition = this._definition();
    if (!definition) return { ok: false, problem: 'No page is open' };
    if (!ops.length) return { ok: true };

    let next: PageDefinition;
    let inverse: readonly PatchOp[];
    try {
      inverse = invertPatch(definition, ops);
      next = applyPatch(definition, ops);
    } catch (error) {
      const problem =
        error instanceof PatchError
          ? `${error.message} (${describeOp(error.op)})`
          : error instanceof Error
            ? error.message
            : String(error);
      this._problem.set(problem);
      return { ok: false, problem };
    }

    // A new edit after an undo discards the redo branch. Keeping it would require a history
    // tree and a way for the user to choose between futures, which no editor of this kind
    // offers and none of them need.
    const kept = this._history().slice(0, this._cursor());
    const entry: HistoryEntry = {
      seq: ++this.seq,
      label,
      origin,
      ops,
      inverse,
      at: new Date().toISOString(),
    };

    this._definition.set(next);
    this._history.set([...kept, entry]);
    this._cursor.set(kept.length + 1);
    this._problem.set(null);
    return { ok: true };
  }

  /** Replace the whole document — the advanced JSON editing path. Still one patch, still undoable. */
  replaceDocument(next: PageDefinition, label = 'Edit JSON'): ApplyOutcome {
    return this.apply([{ op: 'replace', path: '', value: next }], label, 'json');
  }

  undo(): ApplyOutcome {
    const cursor = this._cursor();
    if (cursor === 0) return { ok: false, problem: 'Nothing to undo' };
    const entry = this._history()[cursor - 1];
    const definition = this._definition();
    if (!entry || !definition) return { ok: false, problem: 'Nothing to undo' };
    try {
      this._definition.set(applyPatch(definition, entry.inverse));
      this._cursor.set(cursor - 1);
      this._problem.set(null);
      return { ok: true };
    } catch (error) {
      const problem = error instanceof Error ? error.message : String(error);
      this._problem.set(`Undo failed: ${problem}`);
      return { ok: false, problem };
    }
  }

  redo(): ApplyOutcome {
    const cursor = this._cursor();
    const entry = this._history()[cursor];
    const definition = this._definition();
    if (!entry || !definition) return { ok: false, problem: 'Nothing to redo' };
    try {
      this._definition.set(applyPatch(definition, entry.ops));
      this._cursor.set(cursor + 1);
      this._problem.set(null);
      return { ok: true };
    } catch (error) {
      const problem = error instanceof Error ? error.message : String(error);
      this._problem.set(`Redo failed: ${problem}`);
      return { ok: false, problem };
    }
  }

  /** Mark the current state as persisted. */
  markSaved(at = new Date().toISOString()): void {
    this._savedSeq.set(this.currentSeq());
    this._savedAt.set(at);
  }

  clearProblem(): void {
    this._problem.set(null);
  }

  /**
   * Report a problem the store did not itself produce — a drop that could not be resolved, say.
   *
   * The store owns the single "last problem" surface the UI reads, so a failure that bypasses
   * `run()` still has to arrive here or it is invisible. Silence is the failure mode that hid a
   * real drop bug: dropping into a container did nothing, reported nothing, and looked like a
   * missed drop target.
   */
  reportProblem(text: string): void {
    this._problem.set(text);
  }

  /**
   * The patches applied since the last save, flattened — what a "save" actually contains, and
   * the basis for a review diff.
   */
  unsavedOps(): PatchOp[] {
    const savedSeq = this._savedSeq();
    return this._history()
      .slice(0, this._cursor())
      .filter((entry) => entry.seq > savedSeq)
      .flatMap((entry) => [...entry.ops]);
  }
}
