/**
 * The experience library.
 *
 * One card per saved experience, and every card is reachable through the same route because there is
 * no code behind any of them. What the cards show is chosen to make the platform's properties visible
 * at a glance: the **origin** (a model wrote it, a person wrote it, or it shipped as a seed), the
 * **version**, and for generated ones **the prompt that produced it** — which is the question a
 * reviewer asks first and which provenance is there to answer.
 */

import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatCardModule } from '@angular/material/card';
import { MatChipsModule } from '@angular/material/chips';
import { MatIconModule } from '@angular/material/icon';
import { MatProgressBarModule } from '@angular/material/progress-bar';
import { MatSnackBar } from '@angular/material/snack-bar';
import { MatTooltipModule } from '@angular/material/tooltip';
import { Router, RouterLink } from '@angular/router';
import { ExperienceRepository } from '@opus/metadata-service';

@Component({
  selector: 'opus-library',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    RouterLink,
    MatCardModule,
    MatButtonModule,
    MatIconModule,
    MatChipsModule,
    MatTooltipModule,
    MatProgressBarModule,
  ],
  template: `
    <div class="page">
      <header class="intro">
        <div>
          <h1>Experiences</h1>
          <p>
            Everything saved in the definition store. Each one is JSON on disk — open it and the
            runtime interprets it; there is no component for any of them.
          </p>
        </div>
        <button mat-flat-button routerLink="/create">
          <mat-icon>auto_awesome</mat-icon>
          Create with AI
        </button>
      </header>

      @if (repository.loading()) {
        <mat-progress-bar mode="indeterminate" />
      }

      @if (summaries().length === 0 && !repository.loading()) {
        <div class="empty">
          <mat-icon>inbox</mat-icon>
          <h2>Nothing saved yet</h2>
          <p>Generate an experience and save it — it will appear here, routable and re-renderable.</p>
        </div>
      }

      <div class="cards">
        @for (item of summaries(); track item.id) {
          <mat-card appearance="outlined" class="card">
            <mat-card-header>
              <mat-icon mat-card-avatar class="avatar">{{ icon(item.origin) }}</mat-icon>
              <mat-card-title>{{ item.name }}</mat-card-title>
              <mat-card-subtitle>
                {{ item.pageCount }} page{{ item.pageCount === 1 ? '' : 's' }} · v{{
                  item.artifactVersion
                }}
                · {{ item.lifecycleState }}
              </mat-card-subtitle>
            </mat-card-header>

            <mat-card-content>
              @if (item.description) {
                <p class="description">{{ item.description }}</p>
              }
              @if (item.prompt) {
                <p class="prompt" matTooltip="The prompt recorded in this version's provenance">
                  <mat-icon inline>format_quote</mat-icon>
                  {{ item.prompt }}
                </p>
              }
              <mat-chip-set>
                <mat-chip [matTooltip]="originTip(item.origin)">{{ item.origin }}</mat-chip>
                @for (tag of item.tags; track tag) {
                  <mat-chip>{{ tag }}</mat-chip>
                }
              </mat-chip-set>
            </mat-card-content>

            <mat-card-actions align="end">
              <button mat-button (click)="remove(item.id)" matTooltip="Delete this experience">
                <mat-icon>delete_outline</mat-icon>
              </button>
              <button mat-flat-button (click)="open(item.id)">
                <mat-icon>play_arrow</mat-icon>
                Open
              </button>
            </mat-card-actions>
          </mat-card>
        }
      </div>
    </div>
  `,
  styles: `
    .page {
      padding: 28px 32px 48px;
      max-inline-size: 1400px;
      margin-inline: auto;
    }

    .intro {
      display: flex;
      align-items: flex-start;
      justify-content: space-between;
      gap: 24px;
      flex-wrap: wrap;
      margin-block-end: 24px;
    }

    .intro h1 {
      margin: 0 0 6px;
      font-size: 1.6rem;
      font-weight: 600;
      letter-spacing: -0.015em;
    }

    .intro p {
      margin: 0;
      max-inline-size: 62ch;
      font-size: 0.875rem;
      line-height: 1.6;
      opacity: 0.75;
    }

    .cards {
      display: grid;
      grid-template-columns: repeat(auto-fill, minmax(320px, 1fr));
      gap: 16px;
    }

    .card {
      display: flex;
      flex-direction: column;
    }

    .avatar {
      display: grid;
      place-items: center;
      background: var(--mat-sys-secondary-container);
      color: var(--mat-sys-on-secondary-container);
      border-radius: 12px;
    }

    .description {
      margin: 0 0 10px;
      font-size: 0.82rem;
      line-height: 1.55;
      opacity: 0.82;
    }

    .prompt {
      display: flex;
      gap: 6px;
      margin: 0 0 12px;
      padding: 10px 12px;
      border-radius: 8px;
      background: var(--mat-sys-surface-container-highest);
      font-size: 0.76rem;
      line-height: 1.5;
      font-style: italic;
      opacity: 0.85;
    }

    mat-card-content {
      flex: 1;
    }

    .empty {
      display: grid;
      place-items: center;
      gap: 8px;
      padding: 72px 24px;
      text-align: center;
      border: 1px dashed var(--mat-sys-outline-variant);
      border-radius: 16px;
    }

    .empty mat-icon {
      font-size: 40px;
      inline-size: 40px;
      block-size: 40px;
      opacity: 0.35;
    }

    .empty h2 {
      margin: 0;
      font-size: 1.05rem;
    }

    .empty p {
      margin: 0;
      font-size: 0.82rem;
      opacity: 0.7;
    }
  `,
})
export class LibraryComponent {
  protected readonly repository = inject(ExperienceRepository);
  private readonly router = inject(Router);
  private readonly snack = inject(MatSnackBar);

  protected readonly summaries = computed(() => this.repository.summaries());

  constructor() {
    void this.repository.refresh();
  }

  protected open(id: string): void {
    void this.router.navigate(['/x', id]);
  }

  protected async remove(id: string): Promise<void> {
    try {
      await this.repository.remove(id);
      // The store keeps the deleted body under versions/, so "deleted" is recoverable rather than
      // final — worth saying, because a user who believes it is final will not try it.
      this.snack.open(`Deleted "${id}". The last version is kept in the store's history.`, undefined, {
        duration: 4000,
      });
    } catch (error) {
      this.snack.open(error instanceof Error ? error.message : 'Could not delete', 'Dismiss', {
        duration: 5000,
      });
    }
  }

  protected icon(origin: string): string {
    switch (origin) {
      case 'ai':
      case 'aiRefined':
        return 'auto_awesome';
      case 'seed':
        return 'inventory_2';
      case 'template':
        return 'content_copy';
      default:
        return 'edit_note';
    }
  }

  protected originTip(origin: string): string {
    switch (origin) {
      case 'ai':
        return 'Generated from a prompt. Its provenance records which model and which catalog version.';
      case 'seed':
        return 'Shipped with the repository and seeded into the store on first run.';
      default:
        return 'Authored by a person.';
    }
  }
}
