/**
 * The widget palette — six groups, twenty-five entries, click to add.
 *
 * Ported from `vgiattino/MDE@opus-angular-port`, the palette column of the console's page builder.
 *
 * Its own component for the same reason as the flow map: it renders `PALETTE` and emits the item that
 * was chosen, owning nothing. The builder decides where a widget lands and what its props are, because
 * that decision needs the page — and a palette that knew about pages would be a palette that has to
 * change every time the canvas does.
 */

import { ChangeDetectionStrategy, Component, output } from '@angular/core';
import { IconComponent } from '@opus/design-system';

import { PALETTE, type PaletteItem } from './model';

@Component({
  selector: 'opus-pb-palette',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [IconComponent],
  template: `
    <div class="pal-h">Widgets</div>
    <p class="pal-help">Click to add to the page, then drag to arrange.</p>
    @for (group of palette; track group.group) {
      <div class="pal-group">{{ group.group }}</div>
      <div class="pal-grid">
        @for (item of group.items; track item.key) {
          <button type="button" class="pal-item" [title]="'Add ' + item.label" (click)="add.emit(item)">
            <span class="pal-ic"><opus-icon [name]="item.icon" [size]="16" /></span>
            <span class="pal-lbl">{{ item.label }}</span>
          </button>
        }
      </div>
    }
  `,
  styles: `
    :host {
      display: block;
      overflow-y: auto;
      padding: 12px 10px 24px;
      background: var(--opus-surface);
      border-inline-end: 1px solid var(--opus-border);
    }

    .pal-h {
      font-size: var(--opus-text-md);
      font-weight: var(--opus-weight-semibold);
      color: var(--opus-text);
    }

    .pal-help {
      margin: 2px 0 12px;
      font-size: var(--opus-text-xs);
      color: var(--opus-text-muted);
      line-height: var(--opus-leading-normal);
    }

    .pal-group {
      font-size: 10px;
      font-weight: var(--opus-weight-semibold);
      text-transform: uppercase;
      letter-spacing: 0.07em;
      color: var(--opus-text-muted);
      margin: 12px 0 6px;
    }

    .pal-grid {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 6px;
    }

    .pal-item {
      display: flex;
      flex-direction: column;
      align-items: center;
      gap: 5px;
      padding: 9px 4px;
      border: 1px solid var(--opus-border);
      border-radius: var(--opus-radius-md);
      background: var(--opus-surface);
      font: inherit;
      cursor: pointer;
      color: var(--opus-text-secondary);
    }

    .pal-item:hover {
      border-color: var(--opus-accent);
      color: var(--opus-accent);
    }

    .pal-ic {
      display: inline-grid;
      place-items: center;
      inline-size: 26px;
      block-size: 26px;
      border-radius: var(--opus-radius-sm);
      background: var(--opus-accent-soft);
      color: var(--opus-accent);
    }

    .pal-lbl {
      font-size: 10.5px;
      text-align: center;
      line-height: 1.25;
    }
  `,
})
export class PaletteComponent {
  protected readonly palette = PALETTE;

  /** The chosen widget kind. Where it goes on the page is the builder's business, not this one's. */
  readonly add = output<PaletteItem>();
}
