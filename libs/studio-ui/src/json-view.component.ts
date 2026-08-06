/**
 * The JSON view: the definition, editable directly.
 *
 * WHY AN EDITOR OF A VISUAL BUILDER SHIPS A TEXT VIEW. Three reasons, all of them architectural
 * rather than convenience:
 *
 *  1. IT PROVES THERE IS ONE MODEL. What is shown here is the artifact — the same bytes the
 *     runtime loads and the same bytes a save writes. If the builder had a model of its own, this
 *     panel would be a lossy export, and the difference would be visible immediately.
 *  2. IT IS THE ESCAPE HATCH FOR WHAT THE UI DOES NOT COVER YET. Tabs, repeaters, actions and
 *     overlays are all expressible in the definition and not yet in the inspector. Without this
 *     panel those capabilities would be unreachable, and the builder would define the ceiling of
 *     the platform.
 *  3. IT GOES THROUGH THE SAME STORE. A pasted document is one patch with one inverse, so it is
 *     undoable like anything else. An editor that let text edits bypass the patch log would have
 *     two write paths and an undo stack that lies.
 */

import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  inject,
  signal,
  untracked,
} from '@angular/core';
import type { PageDefinition } from '@opus/contracts';

import { EditorService } from './editor.service';

@Component({
  selector: 'opus-json-view',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="json">
      <div class="bar">
        <span class="muted">The stored artifact, exactly as the runtime loads it.</span>
        <button type="button" [disabled]="!changed()" (click)="applyEdit()">Apply</button>
        <button type="button" [disabled]="!changed()" (click)="revert()">Revert</button>
        <button type="button" (click)="copy()">Copy</button>
      </div>

      @if (parseError(); as problem) {
        <p class="problem" role="alert">{{ problem }}</p>
      }

      <label class="sr-only" for="json-editor">Page definition JSON</label>
      <textarea
        id="json-editor"
        spellcheck="false"
        [value]="draft()"
        (input)="draft.set($any($event.target).value)"
      ></textarea>
    </div>
  `,
  styles: `
    :host {
      display: block;
      min-block-size: 0;
    }

    .json {
      display: flex;
      flex-direction: column;
      gap: var(--opus-space-2);
      block-size: 100%;
      padding: var(--opus-space-3);
    }

    .bar {
      display: flex;
      align-items: center;
      gap: var(--opus-space-2);
      flex-wrap: wrap;
    }

    .muted {
      margin-inline-end: auto;
      font-size: var(--opus-text-xs);
      color: var(--opus-text-muted);
    }

    button {
      font: inherit;
      font-size: var(--opus-text-xs);
      padding: 3px var(--opus-space-2);
      color: var(--opus-text-secondary);
      background: var(--opus-surface);
      border: 1px solid var(--opus-border);
      border-radius: var(--opus-radius-sm);
      cursor: pointer;
    }

    button:disabled {
      opacity: 0.45;
      cursor: not-allowed;
    }

    button:focus-visible,
    textarea:focus-visible {
      outline: 2px solid var(--opus-focus-ring);
      outline-offset: 1px;
    }

    .problem {
      margin: 0;
      padding: var(--opus-space-2);
      font-size: var(--opus-text-xs);
      background: color-mix(in srgb, var(--opus-emphasis-negative) 10%, transparent);
      border-inline-start: 3px solid var(--opus-emphasis-negative);
      border-radius: var(--opus-radius-sm);
    }

    textarea {
      flex: 1;
      min-block-size: 24rem;
      font-family: var(--opus-font-mono);
      font-size: var(--opus-text-xs);
      line-height: 1.5;
      padding: var(--opus-space-2);
      color: var(--opus-text-secondary);
      background: var(--opus-canvas);
      border: 1px solid var(--opus-border);
      border-radius: var(--opus-radius-sm);
      resize: none;
      white-space: pre;
      overflow: auto;
    }

    .sr-only {
      position: absolute;
      inline-size: 1px;
      block-size: 1px;
      overflow: hidden;
      clip-path: inset(50%);
    }
  `,
})
export class JsonViewComponent {
  private readonly editor = inject(EditorService);

  protected readonly draft = signal('');
  protected readonly parseError = signal<string | null>(null);

  private readonly serialized = computed(() => {
    const definition = this.editor.store.definition();
    return definition ? JSON.stringify(definition, null, 2) : '';
  });

  protected readonly changed = computed(() => this.draft() !== this.serialized());

  /** The text as it was when last synchronised from the store. */
  private lastSynced = '';

  constructor() {
    /**
     * Follow the store, unless the author has typed.
     *
     * The text is refreshed only while it still matches what was last put there — so a canvas
     * drag updates this panel, but an unapplied half-typed edit is never silently overwritten,
     * which is the worst thing a text panel can do. Applying re-synchronises, because the
     * serialized document then matches the text again.
     */
    effect(() => {
      const next = this.serialized();
      if (untracked(() => this.draft()) !== this.lastSynced) return;
      this.lastSynced = next;
      this.draft.set(next);
    });
  }

  protected applyEdit(): void {
    let parsed: PageDefinition;
    try {
      parsed = JSON.parse(this.draft()) as PageDefinition;
    } catch (error) {
      this.parseError.set(error instanceof Error ? error.message : String(error));
      return;
    }
    this.parseError.set(null);
    // The store validates by trying to compile it on the canvas; a structurally invalid document
    // shows up there rather than being rejected here, so the author can see what they broke.
    const outcome = this.editor.store.replaceDocument(parsed);
    if (outcome.ok) this.lastSynced = this.draft();
  }

  protected revert(): void {
    const current = this.serialized();
    this.lastSynced = current;
    this.draft.set(current);
    this.parseError.set(null);
  }

  protected copy(): void {
    void navigator.clipboard?.writeText(this.draft());
  }
}
