/**
 * The Catalog workspace: the vocabulary, and where it came from.
 *
 * ── WHY TABS AND NOT A SECOND RAIL ITEM ─────────────────────────────────────────────────
 * The rail was deliberately reduced to one Data entry — "Catalog" — because a business analyst asks one
 * question, "what can I build a page about", and a rail that answers it twice is a rail they have to
 * read. Sources is not a second answer to that question; it is the same subject seen from the other end,
 * and the two are read in sequence: a steward registers a database and publishes its vocabulary, then an
 * analyst browses the vocabulary. Tabs are how one subject holds two surfaces.
 *
 * The order is deliberate too. Vocabulary is first because it is the surface most people open, and
 * Sources second because registering a database is a thing done occasionally by someone with a
 * governance role. Neither is a sub-feature of the other.
 */

import { ChangeDetectionStrategy, Component, signal } from '@angular/core';
import { IconComponent } from '@opus/design-system';

import { CatalogBrowserComponent } from './catalog-browser.component';
import { IngestService } from './ingest.service';
import { SourcesComponent } from './sources.component';

type Tab = 'vocabulary' | 'sources';

@Component({
  selector: 'opus-catalog-workspace',
  changeDetection: ChangeDetectionStrategy.OnPush,
  // Provided here rather than at the root: an ingestion session belongs to this workspace, and its
  // state — which draft is under review, which decisions are made — has no meaning outside it.
  providers: [IngestService],
  imports: [CatalogBrowserComponent, IconComponent, SourcesComponent],
  template: `
    <div class="cw">
      <nav class="opus-tabs" aria-label="Catalog views">
        <button
          type="button"
          class="opus-tab"
          [class.active]="tab() === 'vocabulary'"
          [attr.aria-current]="tab() === 'vocabulary' ? 'page' : null"
          (click)="tab.set('vocabulary')"
        >
          <opus-icon name="database" [size]="14" />
          Vocabulary
        </button>
        <button
          type="button"
          class="opus-tab"
          [class.active]="tab() === 'sources'"
          [attr.aria-current]="tab() === 'sources' ? 'page' : null"
          (click)="tab.set('sources')"
        >
          <opus-icon name="server" [size]="14" />
          Sources
        </button>
      </nav>

      <!--
        Both kept alive, hidden rather than destroyed.

        A steward part-way through reviewing a draft of ninety attributes who looks something up in the
        vocabulary must not come back to an empty form. A conditional block would destroy the component and its
        decisions with it, so the inactive tab is display:none — the one case where hiding beats
        conditional rendering, because the state is the user's work.
      -->
      <div class="cw-pane" [class.hidden]="tab() !== 'vocabulary'">
        <opus-catalog-browser />
      </div>
      <div class="cw-pane" [class.hidden]="tab() !== 'sources'">
        <opus-sources />
      </div>
    </div>
  `,
  styles: `
    :host {
      display: block;
      block-size: 100%;
      min-block-size: 0;
      overflow: hidden;
      background: var(--opus-canvas);
    }

    .cw {
      display: flex;
      flex-direction: column;
      block-size: 100%;
      min-block-size: 0;
    }

    .cw-pane {
      flex: 1;
      min-block-size: 0;
      overflow: hidden;
    }

    /* Hiding it is not enough on its own — the flex-basis has to go too, or the hidden pane still
       claims its share of the column and the visible one gets half the height. */
    .cw-pane.hidden {
      display: none;
      flex: 0 0 0;
    }
  `,
})
export class CatalogWorkspaceComponent {
  protected readonly tab = signal<Tab>('vocabulary');
}
