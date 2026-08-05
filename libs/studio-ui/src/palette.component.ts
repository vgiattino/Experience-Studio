/**
 * The component palette.
 *
 * GENERATED FROM THE MANIFESTS, like everything else in the editor that describes a component.
 * A palette with a hand-written list of entries is a third place a component has to be declared
 * — after its implementation and its manifest — and the one most likely to be forgotten, so a
 * newly added component would exist, validate, render, and be unreachable to authors.
 *
 * Entries are filtered to what the registry can actually resolve, so a manifest without an
 * implementation cannot be dragged onto a page.
 */

import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { text, type ComponentManifest, type Container } from '@opus/contracts';

import { DragStateService } from './drag-state.service';
import { EditorService } from './editor.service';

interface ContainerEntry {
  type: Container['type'];
  label: string;
  hint: string;
}

/**
 * Containers offered for authoring. `tabs` and `repeater` are omitted deliberately: both need a
 * data source and their own inner structure before they render anything, so offering them as a
 * one-click add produces an empty container and a validation error. They are reachable through
 * the JSON view until the editor grows the flows they need.
 */
const CONTAINERS: readonly ContainerEntry[] = [
  { type: 'grid', label: 'Grid', hint: '12-column grid' },
  { type: 'stack', label: 'Stack', hint: 'A row or column' },
  { type: 'panel', label: 'Panel', hint: 'A titled, bordered group' },
  { type: 'split', label: 'Split', hint: 'Two resizable areas' },
];

@Component({
  selector: 'opus-palette',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="palette">
      <section>
        <h3>Components</h3>
        @for (entry of components(); track entry.manifest.type) {
          <button
            type="button"
            class="entry"
            draggable="true"
            [attr.data-palette]="entry.manifest.type"
            [title]="entry.purpose"
            (dragstart)="onDragWidget($event, entry.manifest)"
            (dragend)="drag.end()"
            (click)="editor.addWidgetToSelection(entry.manifest)"
          >
            <span class="name">{{ entry.label }}</span>
            <span class="shape">{{ entry.shape }}</span>
          </button>
        }
        @if (!components().length) {
          <p class="empty">Loading the component vocabulary…</p>
        }
      </section>

      <section>
        <h3>Layout</h3>
        @for (entry of containers; track entry.type) {
          <button
            type="button"
            class="entry"
            draggable="true"
            [attr.data-palette]="'container.' + entry.type"
            [title]="entry.hint"
            (dragstart)="onDragContainer($event, entry)"
            (dragend)="drag.end()"
            (click)="editor.addContainerToSelection(entry.type)"
          >
            <span class="name">{{ entry.label }}</span>
            <span class="shape">{{ entry.hint }}</span>
          </button>
        }
        <button
          type="button"
          class="entry"
          data-palette="spacer"
          title="Empty space, for pushing things apart"
          (click)="editor.addSpacerToSelection()"
        >
          <span class="name">Spacer</span>
          <span class="shape">empty space</span>
        </button>
      </section>

      <p class="hint">
        Drag onto the outline or the canvas, or click to add inside the current selection.
      </p>
    </div>
  `,
  styles: `
    :host {
      display: block;
      overflow-y: auto;
    }

    .palette {
      display: flex;
      flex-direction: column;
      gap: var(--opus-space-4);
      padding: var(--opus-space-3);
    }

    h3 {
      margin: 0 0 var(--opus-space-2);
      font-size: var(--opus-text-xs);
      font-weight: var(--opus-weight-semibold);
      text-transform: uppercase;
      letter-spacing: 0.06em;
      color: var(--opus-text-muted);
    }

    .entry {
      display: flex;
      flex-direction: column;
      gap: 1px;
      inline-size: 100%;
      margin-block-end: 4px;
      padding: var(--opus-space-2);
      font: inherit;
      text-align: start;
      color: var(--opus-text);
      background: var(--opus-surface);
      border: 1px solid var(--opus-border);
      border-radius: var(--opus-radius-sm);
      cursor: grab;
    }

    .entry:hover {
      border-color: var(--opus-accent);
    }

    .entry:focus-visible {
      outline: 2px solid var(--opus-focus-ring);
      outline-offset: 2px;
    }

    .entry:active {
      cursor: grabbing;
    }

    .name {
      font-size: var(--opus-text-sm);
      font-weight: var(--opus-weight-medium);
    }

    .shape,
    .empty,
    .hint {
      font-size: var(--opus-text-xs);
      color: var(--opus-text-muted);
    }

    .hint {
      margin: 0;
      line-height: 1.45;
    }
  `,
})
export class PaletteComponent {
  protected readonly editor = inject(EditorService);
  protected readonly drag = inject(DragStateService);
  protected readonly containers = CONTAINERS;

  protected readonly components = computed(() =>
    this.editor.paletteEntries().map((manifest) => ({
      manifest,
      label: text(manifest.name),
      purpose: manifest.generation.purpose,
      shape: describeShape(manifest),
    })),
  );

  protected onDragWidget(event: DragEvent, manifest: ComponentManifest): void {
    this.drag.start(
      { kind: 'new-widget', componentType: manifest.type, label: text(manifest.name) },
      event,
    );
  }

  protected onDragContainer(event: DragEvent, entry: ContainerEntry): void {
    this.drag.start({ kind: 'new-container', containerType: entry.type, label: entry.label }, event);
  }
}

/** What the component needs, in the author's terms rather than the schema's. */
function describeShape(manifest: ComponentManifest): string {
  switch (manifest.dataRequirement.shape) {
    case 'none':
      return 'no data';
    case 'scalar':
      return 'one number';
    case 'series':
      return 'a series';
    case 'tabular':
      return 'rows';
    default:
      return manifest.dataRequirement.shape;
  }
}
