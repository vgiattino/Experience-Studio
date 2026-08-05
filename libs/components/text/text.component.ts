/**
 * content.text
 *
 * Prose and headings in a page. Text is interpolated, never injected as markup:
 * `body` accepts a template with {token} placeholders resolved from expressions
 * declared in `tokens`, so a definition cannot smuggle in HTML. That removes the
 * XSS surface entirely rather than sanitizing it
 * (architecture/security-architecture.md §9).
 */

import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import type { ComponentContext, DataView, Expression } from '@opus/contracts';

export interface TextConfig {
  variant?: 'heading' | 'subheading' | 'body' | 'caption';
  /** Template text. `{tokenName}` placeholders are replaced from `tokens`. */
  body?: string;
  /** Named expressions supplying placeholder values. */
  tokens?: Record<string, Expression>;
  align?: 'start' | 'center';
  emphasis?: 'default' | 'muted';
}

@Component({
  selector: 'opus-text',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="text" [attr.data-variant]="variant()" [attr.data-align]="config().align ?? 'start'">
      @if (title()) {
        @switch (variant()) {
          @case ('heading') {
            <h2>{{ title() }}</h2>
          }
          @case ('subheading') {
            <h3>{{ title() }}</h3>
          }
          @default {
            <p class="label">{{ title() }}</p>
          }
        }
      }
      @if (resolvedBody()) {
        <p class="body" [attr.data-emphasis]="config().emphasis ?? 'default'">{{ resolvedBody() }}</p>
      }
    </div>
  `,
  styles: `
    :host {
      display: block;
      container-type: inline-size;
    }

    .text[data-align='center'] {
      text-align: center;
    }

    h2 {
      margin: 0 0 var(--opus-space-1);
      font-size: var(--opus-text-xl);
      font-weight: var(--opus-weight-semibold);
      line-height: var(--opus-leading-tight);
      color: var(--opus-text);
    }

    h3 {
      margin: 0 0 var(--opus-space-1);
      font-size: var(--opus-text-lg);
      font-weight: var(--opus-weight-semibold);
      color: var(--opus-text);
    }

    .label {
      margin: 0 0 var(--opus-space-1);
      font-size: var(--opus-text-sm);
      font-weight: var(--opus-weight-medium);
      color: var(--opus-text-secondary);
    }

    .body {
      margin: 0;
      max-inline-size: 80ch;
      font-size: var(--opus-text-md);
      line-height: var(--opus-leading-normal);
      color: var(--opus-text-secondary);
    }

    .text[data-variant='caption'] .body {
      font-size: var(--opus-text-xs);
      color: var(--opus-text-muted);
    }

    .body[data-emphasis='muted'] {
      color: var(--opus-text-muted);
    }
  `,
})
export class TextComponent {
  readonly config = input<TextConfig>({});
  readonly data = input<DataView>({ state: 'ready', rows: [] });
  readonly context = input.required<ComponentContext>();
  readonly title = input<string>('');

  protected readonly variant = computed(() => this.config().variant ?? 'body');

  protected readonly resolvedBody = computed(() => {
    const template = this.config().body;
    if (!template) return '';
    const tokens = this.config().tokens ?? {};
    return template.replace(/\{([A-Za-z][A-Za-z0-9]*)\}/g, (match, name: string) => {
      const expr = tokens[name];
      if (!expr) return match;
      const value = this.context().evaluate(expr.$expr, { row: this.data().rows[0] });
      return value === null || value === undefined ? '' : this.context().format(value);
    });
  });
}
