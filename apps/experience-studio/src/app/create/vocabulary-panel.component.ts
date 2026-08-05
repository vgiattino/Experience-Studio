/**
 * What the system can build from — the vocabulary, before the user types.
 *
 * Two halves, and both are answers to "what can I ask for?":
 *
 *  - **Components** come from the registry's manifests, so this list cannot promise a widget the
 *    generator is unable to emit. Each shows what a prompt might say to get it.
 *  - **Business concepts** come from the caller's own catalog projection, so a persona without the
 *    party master does not see parties offered. That is not a UI nicety: retrieval is
 *    entitlement-scoped before ranking, and showing concepts the caller cannot use would invite
 *    prompts that can only ever be declined.
 */

import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { MatChipsModule } from '@angular/material/chips';
import { MatIconModule } from '@angular/material/icon';
import { MatTooltipModule } from '@angular/material/tooltip';
import { PALETTE } from '@opus/component-library';
import { CatalogClient } from '@opus/metadata-service';

@Component({
  selector: 'opus-vocabulary-panel',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [MatIconModule, MatChipsModule, MatTooltipModule],
  template: `
    <section>
      <h3>Components it can use</h3>
      <ul class="palette">
        @for (entry of palette; track entry.type) {
          <li>
            <mat-icon>{{ entry.icon }}</mat-icon>
            <span class="text">
              <strong>{{ entry.label }}</strong>
              <small>{{ entry.description }}</small>
              <em>try: {{ entry.generates }}</em>
            </span>
          </li>
        }
      </ul>
    </section>

    <section>
      <h3>
        Business concepts you can name
        <span class="count">{{ entities().length }}</span>
      </h3>
      <p class="note">
        From the catalog as your identity may see it — {{ measureCount() }} measures across
        {{ entities().length }} entities. Concepts you are not entitled to are absent, not hidden.
      </p>
      <mat-chip-set>
        @for (entity of entities(); track entity.id) {
          <mat-chip [matTooltip]="entity.tip">{{ entity.label }}</mat-chip>
        }
      </mat-chip-set>
    </section>
  `,
  styles: `
    :host {
      display: flex;
      flex-direction: column;
      gap: 22px;
    }

    h3 {
      display: flex;
      align-items: center;
      gap: 8px;
      margin: 0 0 10px;
      font-size: 0.72rem;
      font-weight: 600;
      letter-spacing: 0.07em;
      text-transform: uppercase;
      opacity: 0.62;
    }

    .count {
      font-size: 0.7rem;
      padding: 1px 7px;
      border-radius: 999px;
      background: var(--mat-sys-surface-container-highest);
      letter-spacing: 0;
    }

    .palette {
      margin: 0;
      padding: 0;
      list-style: none;
      display: flex;
      flex-direction: column;
      gap: 14px;
    }

    .palette li {
      display: grid;
      grid-template-columns: 22px 1fr;
      gap: 10px;
    }

    .palette mat-icon {
      font-size: 20px;
      inline-size: 20px;
      block-size: 20px;
      color: var(--mat-sys-primary);
    }

    .text {
      display: flex;
      flex-direction: column;
      gap: 2px;
      min-inline-size: 0;
    }

    .text strong {
      font-size: 0.8rem;
    }

    .text small {
      font-size: 0.72rem;
      line-height: 1.4;
      opacity: 0.75;
    }

    .text em {
      font-size: 0.7rem;
      font-style: normal;
      opacity: 0.6;
      font-family: var(--opus-font-mono);
    }

    .note {
      margin: -4px 0 10px;
      font-size: 0.72rem;
      line-height: 1.45;
      opacity: 0.7;
    }
  `,
})
export class VocabularyPanelComponent {
  private readonly catalog = inject(CatalogClient);

  protected readonly palette = PALETTE;

  protected readonly measureCount = computed(() => this.catalog.measureCount());

  protected readonly entities = computed(() => {
    const snapshot = this.catalog.snapshot();
    if (!snapshot) return [];
    return Object.values(snapshot.entities).map((entity) => ({
      id: entity.id,
      label: entity.pluralName ?? entity.businessName,
      tip: `${Object.keys(entity.measures ?? {}).length} measures, ${
        Object.keys(entity.attributes ?? {}).length
      } attributes${entity.description ? ` — ${entity.description}` : ''}`,
    }));
  });
}
