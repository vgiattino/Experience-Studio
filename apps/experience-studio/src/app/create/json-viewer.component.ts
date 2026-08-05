/**
 * The generated definition, as JSON.
 *
 * Shown prominently and not tucked behind a developer toggle, because the JSON *is* the artifact: it
 * is what gets reviewed, versioned, promoted and rendered. A business user does not need to read it,
 * but being able to see it — and copy it, and download it — is what makes the platform's central
 * claim checkable rather than asserted.
 *
 * Rendered as text, never as markup. Definition content is author-supplied and model-supplied, so it
 * is interpolated through Angular's own escaping; a "pretty printed" JSON view built with innerHTML
 * would be an XSS surface fed by exactly the two least trusted authors in the system.
 */

import { ChangeDetectionStrategy, Component, computed, inject, input, signal } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatSnackBar } from '@angular/material/snack-bar';
import { MatTooltipModule } from '@angular/material/tooltip';

@Component({
  selector: 'opus-json-viewer',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [MatButtonModule, MatIconModule, MatTooltipModule],
  template: `
    <div class="bar">
      <span class="meta">{{ lineCount() }} lines · {{ sizeLabel() }}</span>
      <span class="grow"></span>
      <button mat-button (click)="copy()" matTooltip="Copy to the clipboard">
        <mat-icon>content_copy</mat-icon>
        Copy
      </button>
      <button mat-button (click)="download()" matTooltip="Save the definition as a file">
        <mat-icon>download</mat-icon>
        Download
      </button>
    </div>
    <pre class="json" tabindex="0">{{ pretty() }}</pre>
  `,
  styles: `
    :host {
      display: flex;
      flex-direction: column;
      min-block-size: 0;
    }

    .bar {
      display: flex;
      align-items: center;
      gap: 4px;
      padding: 4px 8px 4px 12px;
      border-block-end: 1px solid var(--mat-sys-outline-variant);
    }

    .meta {
      font-size: 0.72rem;
      font-family: var(--opus-font-mono);
      opacity: 0.6;
    }

    .grow {
      flex: 1;
    }

    .json {
      flex: 1;
      margin: 0;
      padding: 14px 16px;
      overflow: auto;
      font-family: var(--opus-font-mono);
      font-size: 0.72rem;
      line-height: 1.55;
      tab-size: 2;
      white-space: pre;
      background: var(--mat-sys-surface-container-lowest);
    }
  `,
})
export class JsonViewerComponent {
  private readonly snack = inject(MatSnackBar);

  readonly value = input<unknown>(null);
  readonly fileName = input('experience.json');

  protected readonly pretty = computed(() => JSON.stringify(this.value() ?? {}, null, 2));
  protected readonly lineCount = computed(() => this.pretty().split('\n').length);
  protected readonly sizeLabel = computed(() => `${(this.pretty().length / 1024).toFixed(1)} kB`);

  protected async copy(): Promise<void> {
    try {
      await navigator.clipboard.writeText(this.pretty());
      this.snack.open('Definition copied', undefined, { duration: 2000 });
    } catch {
      // Clipboard access can be refused; say so rather than appearing to succeed.
      this.snack.open('The browser refused clipboard access', undefined, { duration: 3000 });
    }
  }

  protected download(): void {
    const blob = new Blob([this.pretty()], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = this.fileName();
    anchor.click();
    URL.revokeObjectURL(url);
  }
}
