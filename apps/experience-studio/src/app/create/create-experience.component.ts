/**
 * Create an Experience — the screen the whole prototype exists to demonstrate.
 *
 * The flow, and what each step is evidence of:
 *
 *   1. The user describes a business experience in their own words.
 *   2. The pipeline runs and reports every stage, so the system's understanding is inspectable
 *      rather than implied.
 *   3. The generated JSON is shown, because the JSON *is* the artifact — reviewed, versioned,
 *      promoted, rendered.
 *   4. The result renders in the same engine the saved runtime uses. Not a preview renderer: the
 *      renderer. That is why "it worked in preview" cannot happen here.
 *   5. Saving puts it in the store, from where it is routable, re-openable and re-renderable.
 *
 * The screen deliberately shows failure paths as first-class outcomes. A vague prompt asks one
 * question; an out-of-scope prompt is declined plainly; a request for data the caller cannot see is
 * refused without revealing whether the data exists. None of those are errors, and presenting them as
 * red boxes would teach users to distrust the honest answers.
 */

import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatCardModule } from '@angular/material/card';
import { MatChipsModule } from '@angular/material/chips';
import { MatDividerModule } from '@angular/material/divider';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatProgressBarModule } from '@angular/material/progress-bar';
import { MatSnackBar } from '@angular/material/snack-bar';
import { MatTabsModule } from '@angular/material/tabs';
import { MatTooltipModule } from '@angular/material/tooltip';
import { Router } from '@angular/router';

import { AiExperienceService, EXAMPLE_PROMPTS, type BuildOutcome } from '@opus/ai-service';
import { describeExperience, type ExperienceDefinition } from '@opus/experience-model';
import { ExperienceHostComponent } from '@opus/page-renderer';
import { ExperienceRepository } from '@opus/metadata-service';

import { BootService } from '../boot.service';
import { JsonViewerComponent } from './json-viewer.component';
import { StageTimelineComponent } from './stage-timeline.component';
import { VocabularyPanelComponent } from './vocabulary-panel.component';

@Component({
  selector: 'opus-create-experience',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    FormsModule,
    MatButtonModule,
    MatCardModule,
    MatChipsModule,
    MatDividerModule,
    MatFormFieldModule,
    MatIconModule,
    MatInputModule,
    MatProgressBarModule,
    MatTabsModule,
    MatTooltipModule,
    ExperienceHostComponent,
    JsonViewerComponent,
    StageTimelineComponent,
    VocabularyPanelComponent,
  ],
  template: `
    <div class="page">
      <header class="intro">
        <h1>Describe the experience you need</h1>
        <p>
          A prompt becomes a validated Experience definition, and the runtime renders it. No page is
          hardcoded — what you see below is JSON interpreted by the same engine that serves saved
          experiences.
        </p>
      </header>

      <div class="grid">
        <!-- ── left: prompt, stages, vocabulary ───────────────────────────── -->
        <section class="col compose">
          <mat-card appearance="outlined" class="prompt-card">
            <mat-card-content>
              <mat-form-field appearance="outline" class="prompt-field">
                <mat-label>What should this experience show?</mat-label>
                <textarea
                  matInput
                  rows="5"
                  [(ngModel)]="prompt"
                  [disabled]="running()"
                  (keydown.control.enter)="generate()"
                  (keydown.meta.enter)="generate()"
                  placeholder="Create a Security Master Operations Dashboard showing today’s files processed, late files, exceptions, new securities, and processing KPIs."
                ></textarea>
                <mat-hint>⌘/Ctrl + Enter to generate</mat-hint>
              </mat-form-field>

              <div class="actions">
                <button
                  mat-flat-button
                  class="generate"
                  [disabled]="running() || !prompt().trim() || boot.status() !== 'ready'"
                  (click)="generate()"
                >
                  <mat-icon>auto_awesome</mat-icon>
                  {{ running() ? 'Generating…' : 'Generate experience' }}
                </button>
                @if (outcome()?.experience) {
                  <button mat-stroked-button [disabled]="saving()" (click)="save()">
                    <mat-icon>save</mat-icon>
                    Save
                  </button>
                  <button mat-stroked-button (click)="openFull()">
                    <mat-icon>open_in_full</mat-icon>
                    Open
                  </button>
                }
              </div>

              @if (running()) {
                <mat-progress-bar mode="indeterminate" />
              }

              <div class="examples">
                <span class="examples-label">Try:</span>
                <mat-chip-set>
                  @for (example of examples; track example.prompt) {
                    <mat-chip
                      [matTooltip]="example.demonstrates"
                      [disabled]="running()"
                      (click)="use(example.prompt)"
                    >
                      <mat-icon matChipAvatar>{{ example.icon }}</mat-icon>
                      {{ example.label }}
                    </mat-chip>
                  }
                </mat-chip-set>
              </div>
            </mat-card-content>
          </mat-card>

          <mat-card appearance="outlined">
            <mat-card-header>
              <mat-card-title>Pipeline</mat-card-title>
              <mat-card-subtitle>
                {{ providerNote() }}
              </mat-card-subtitle>
            </mat-card-header>
            <mat-card-content>
              <opus-stage-timeline [stages]="stages()" />
            </mat-card-content>
          </mat-card>

          <mat-card appearance="outlined">
            <mat-card-content>
              <opus-vocabulary-panel />
            </mat-card-content>
          </mat-card>
        </section>

        <!-- ── right: outcome, JSON, live render ──────────────────────────── -->
        <section class="col result">
          @let built = outcome();

          @if (!built) {
            <div class="placeholder">
              <mat-icon>auto_awesome_mosaic</mat-icon>
              <h2>Nothing generated yet</h2>
              <p>
                The result appears here: what the request was understood to mean, the definition that
                was produced, and the experience rendered from it.
              </p>
            </div>
          } @else {
            <mat-card appearance="outlined" [attr.data-status]="built.generation.status" class="verdict">
              <mat-card-content>
                <div class="verdict-head">
                  <mat-icon>{{ verdictIcon(built.generation.status) }}</mat-icon>
                  <div>
                    <h2>{{ verdictTitle(built.generation.status) }}</h2>
                    <p>{{ built.generation.message }}</p>
                  </div>
                </div>

                <dl class="facts">
                  <div>
                    <dt>Took</dt>
                    <dd>{{ built.generation.totalMs }}ms</dd>
                  </div>
                  <div>
                    <dt>Model call</dt>
                    <dd>{{ built.servedBy }}</dd>
                  </div>
                  <div>
                    <dt>Tokens</dt>
                    <dd>{{ built.generation.tokensIn }} in / {{ built.generation.tokensOut }} out</dd>
                  </div>
                  <div>
                    <dt>Validation</dt>
                    <dd>{{ validationNote() }}</dd>
                  </div>
                  @if (outline(); as o) {
                    <div>
                      <dt>Produced</dt>
                      <dd>{{ o.totalWidgets }} widgets over {{ o.entities.length }} entities</dd>
                    </div>
                  }
                </dl>

                @if (built.degradedToLocal) {
                  <p class="degraded">
                    <mat-icon inline>warning</mat-icon>
                    The API was unreachable, so the in-browser stand-in answered instead. The result is
                    the same; where it came from is not.
                  </p>
                }
              </mat-card-content>
            </mat-card>

            @if (built.experience; as experience) {
              <mat-card appearance="outlined" class="output">
                <mat-tab-group class="tabs" [preserveContent]="true">
                  <mat-tab label="Rendered">
                    <div class="render-frame">
                      <opus-experience-host
                        [experience]="experience"
                        [pageId]="firstPageId(experience)"
                        [user]="user()!"
                        (navigate)="onNavigate()"
                      />
                    </div>
                  </mat-tab>

                  <mat-tab label="Definition">
                    <opus-json-viewer
                      class="json"
                      [value]="experience"
                      [fileName]="experience.id + '.experience.json'"
                    />
                  </mat-tab>

                  <mat-tab label="Structure">
                    <div class="structure">
                      @if (outline(); as o) {
                        <p class="lead">{{ o.name }} — {{ o.pages.length }} page(s)</p>
                        @for (page of o.pages; track page.id) {
                          <div class="page-outline">
                            <h4>{{ page.name }} <span class="kind">{{ page.kind }}</span></h4>
                            <ul>
                              <li>{{ page.sections }} sections, {{ page.widgets }} widgets</li>
                              <li>{{ page.dataSources }} data sources, {{ page.actions }} actions</li>
                              <li>components: {{ page.componentTypes.join(', ') }}</li>
                              <li>entities: {{ page.entities.join(', ') }}</li>
                              @if (page.parameters.length) {
                                <li>parameters: {{ page.parameters.join(', ') }}</li>
                              }
                              @if (page.filters.length) {
                                <li>filter channels: {{ page.filters.join(', ') }}</li>
                              }
                            </ul>
                          </div>
                        }
                      }
                    </div>
                  </mat-tab>

                  <mat-tab label="Grounding">
                    <div class="structure">
                      @if (built.generation.grounding; as grounding) {
                        <p class="lead">
                          The catalog projection the model was given — {{ grounding.entities.length }}
                          entities, about {{ grounding.estimatedTokens }} tokens.
                        </p>
                        @for (entity of grounding.entities; track entity.ref) {
                          <div class="page-outline">
                            <h4>
                              {{ entity.name }}
                              <span class="kind">{{ entity.retrievedVia.join(' + ') }}</span>
                            </h4>
                            <ul>
                              <li>measures: {{ measureNames(entity) }}</li>
                              <li>attributes: {{ entity.attributes.length }} offered</li>
                            </ul>
                          </div>
                        }
                        @if (grounding.droppedEntities.length) {
                          <p class="dropped">
                            Withheld: {{ grounding.droppedEntities.join(', ') }} — either outside the
                            request or outside your entitlements.
                          </p>
                        }
                      } @else {
                        <p class="lead">Retrieval did not run for this request.</p>
                      }
                    </div>
                  </mat-tab>
                </mat-tab-group>
              </mat-card>
            }
          }
        </section>
      </div>
    </div>
  `,
  styles: `
    :host {
      display: block;
    }

    .page {
      padding: 28px 32px 48px;
      max-inline-size: 1720px;
      margin-inline: auto;
    }

    .intro h1 {
      margin: 0 0 6px;
      font-size: 1.6rem;
      font-weight: 600;
      letter-spacing: -0.015em;
    }

    .intro p {
      margin: 0 0 24px;
      max-inline-size: 62ch;
      font-size: 0.875rem;
      line-height: 1.6;
      opacity: 0.75;
    }

    .grid {
      display: grid;
      grid-template-columns: minmax(340px, 400px) minmax(0, 1fr);
      gap: 20px;
      align-items: start;
    }

    .col {
      display: flex;
      flex-direction: column;
      gap: 16px;
      min-inline-size: 0;
    }

    .prompt-field {
      inline-size: 100%;
    }

    textarea {
      font-family: var(--opus-font-sans);
      line-height: 1.55;
      resize: vertical;
    }

    .actions {
      display: flex;
      flex-wrap: wrap;
      gap: 8px;
      margin-block: 4px 12px;
    }

    .generate {
      font-weight: 600;
    }

    .examples {
      display: flex;
      flex-direction: column;
      gap: 8px;
      margin-block-start: 14px;
    }

    .examples-label {
      font-size: 0.7rem;
      letter-spacing: 0.07em;
      text-transform: uppercase;
      opacity: 0.6;
    }

    mat-chip {
      cursor: pointer;
    }

    .placeholder {
      display: grid;
      place-items: center;
      gap: 10px;
      padding: 88px 32px;
      text-align: center;
      border: 1px dashed var(--mat-sys-outline-variant);
      border-radius: 16px;
      background: var(--mat-sys-surface-container-lowest);
    }

    .placeholder mat-icon {
      font-size: 44px;
      inline-size: 44px;
      block-size: 44px;
      opacity: 0.35;
    }

    .placeholder h2 {
      margin: 0;
      font-size: 1.05rem;
      font-weight: 600;
    }

    .placeholder p {
      margin: 0;
      max-inline-size: 46ch;
      font-size: 0.82rem;
      line-height: 1.6;
      opacity: 0.7;
    }

    .verdict-head {
      display: grid;
      grid-template-columns: 28px 1fr;
      gap: 12px;
      align-items: start;
    }

    .verdict-head mat-icon {
      font-size: 26px;
      inline-size: 26px;
      block-size: 26px;
    }

    .verdict[data-status='generated'] .verdict-head mat-icon,
    .verdict[data-status='repaired'] .verdict-head mat-icon {
      color: var(--mat-sys-primary);
    }

    .verdict[data-status='fallback'] .verdict-head mat-icon,
    .verdict[data-status='needsClarification'] .verdict-head mat-icon {
      color: #b26a00;
    }

    .verdict[data-status='declined'] .verdict-head mat-icon,
    .verdict[data-status='failed'] .verdict-head mat-icon {
      color: var(--mat-sys-error);
    }

    .verdict-head h2 {
      margin: 0 0 2px;
      font-size: 1rem;
      font-weight: 600;
    }

    .verdict-head p {
      margin: 0;
      font-size: 0.83rem;
      line-height: 1.55;
      opacity: 0.82;
    }

    .facts {
      display: flex;
      flex-wrap: wrap;
      gap: 8px 28px;
      margin: 18px 0 0;
      padding-block-start: 14px;
      border-block-start: 1px solid var(--mat-sys-outline-variant);
    }

    .facts div {
      display: flex;
      flex-direction: column;
      gap: 1px;
    }

    .facts dt {
      font-size: 0.65rem;
      letter-spacing: 0.07em;
      text-transform: uppercase;
      opacity: 0.55;
    }

    .facts dd {
      margin: 0;
      font-size: 0.8rem;
      font-family: var(--opus-font-mono);
    }

    .degraded {
      display: flex;
      align-items: center;
      gap: 8px;
      margin: 14px 0 0;
      padding: 10px 12px;
      border-radius: 8px;
      font-size: 0.78rem;
      line-height: 1.5;
      background: color-mix(in srgb, #b26a00 12%, transparent);
    }

    .output {
      padding: 0;
      overflow: hidden;
    }

    .tabs {
      --mat-tab-header-divider-height: 1px;
    }

    /* The render frame is a real container query context, so the rendered page adapts to the width it
       actually has rather than to the window's — which is what makes the same definition correct in a
       preview pane, a drawer and a full page. */
    .render-frame {
      container-type: inline-size;
      min-block-size: 60vh;
      background: var(--opus-canvas);
      color: var(--opus-text);
      font-family: var(--opus-font-sans);
    }

    .json {
      display: flex;
      block-size: min(60vh, 640px);
    }

    .structure {
      padding: 18px 20px;
      max-block-size: min(60vh, 640px);
      overflow-y: auto;
    }

    .lead {
      margin: 0 0 14px;
      font-size: 0.82rem;
      opacity: 0.8;
    }

    .page-outline {
      padding: 12px 0;
      border-block-start: 1px solid var(--mat-sys-outline-variant);
    }

    .page-outline h4 {
      display: flex;
      align-items: center;
      gap: 8px;
      margin: 0 0 6px;
      font-size: 0.85rem;
      font-weight: 600;
    }

    .kind {
      font-size: 0.65rem;
      font-weight: 500;
      padding: 2px 7px;
      border-radius: 999px;
      background: var(--mat-sys-surface-container-highest);
      opacity: 0.85;
    }

    .page-outline ul {
      margin: 0;
      padding-inline-start: 18px;
      display: flex;
      flex-direction: column;
      gap: 3px;
      font-size: 0.76rem;
      opacity: 0.8;
    }

    .dropped {
      margin: 14px 0 0;
      font-size: 0.76rem;
      opacity: 0.7;
    }

    @media (max-width: 1240px) {
      .grid {
        grid-template-columns: minmax(0, 1fr);
      }

      .page {
        padding: 20px 16px 40px;
      }
    }
  `,
})
export class CreateExperienceComponent {
  private readonly ai = inject(AiExperienceService);
  private readonly repository = inject(ExperienceRepository);
  private readonly router = inject(Router);
  private readonly snack = inject(MatSnackBar);

  protected readonly boot = inject(BootService);
  protected readonly examples = EXAMPLE_PROMPTS;

  protected readonly prompt = signal(EXAMPLE_PROMPTS[0].prompt);
  protected readonly saving = signal(false);
  protected readonly outcome = signal<BuildOutcome | null>(null);

  protected readonly running = this.ai.running;
  protected readonly stages = this.ai.stages;
  protected readonly user = this.boot.user;

  protected readonly outline = computed(() => {
    const experience = this.outcome()?.experience;
    return experience ? describeExperience(experience) : null;
  });

  protected readonly providerNote = computed(() => {
    const health = this.boot.serverHealth();
    const active = health?.ai.providers.find((p) => p.active);
    if (!active) return 'The model call is served by /api/ai/generate';
    return `Model call → /api/ai/generate · provider "${active.id}"${
      active.external ? '' : ' (no model is called; a rules engine stands in)'
    }`;
  });

  protected readonly validationNote = computed(() => {
    const report = this.outcome()?.generation.validation;
    if (!report) return 'not reported';
    const errors = report.findings.filter((f) => f.severity === 'error').length;
    const warnings = report.findings.filter((f) => f.severity === 'warning').length;
    const levels = report.levelsRun.join(', ');
    return errors
      ? `${errors} error(s) at levels ${levels}`
      : `${report.status}${warnings ? ` (${warnings} warning)` : ''} · levels ${levels}`;
  });

  protected use(prompt: string): void {
    this.prompt.set(prompt);
    void this.generate();
  }

  protected async generate(): Promise<void> {
    const prompt = this.prompt().trim();
    if (!prompt || this.running()) return;
    this.outcome.set(null);
    try {
      this.outcome.set(await this.ai.build({ prompt }));
    } catch (error) {
      this.snack.open(
        error instanceof Error ? error.message : 'Generation failed unexpectedly',
        'Dismiss',
        { duration: 6000 },
      );
    }
  }

  protected async save(): Promise<void> {
    const experience = this.outcome()?.experience;
    if (!experience) return;
    this.saving.set(true);
    try {
      const saved = await this.repository.save(experience, 'ai');
      this.snack.open(
        `Saved as "${saved.id}" (version ${saved.definition.version.artifactVersion})`,
        'Open',
        { duration: 6000 },
      )
        .onAction()
        .subscribe(() => void this.router.navigate(['/x', saved.id]));
    } catch (error) {
      this.snack.open(error instanceof Error ? error.message : 'Could not save', 'Dismiss', {
        duration: 6000,
      });
    } finally {
      this.saving.set(false);
    }
  }

  /** Save, then route to the full-page runtime — the same definition, rendered outside a tab. */
  protected async openFull(): Promise<void> {
    const experience = this.outcome()?.experience;
    if (!experience) return;
    try {
      await this.repository.save(experience, 'ai');
      await this.router.navigate(['/x', experience.id]);
    } catch (error) {
      this.snack.open(error instanceof Error ? error.message : 'Could not open', 'Dismiss', {
        duration: 6000,
      });
    }
  }

  protected firstPageId(experience: ExperienceDefinition): string {
    return experience.navigation?.homePage ?? Object.keys(experience.pages ?? {})[0] ?? '';
  }

  protected onNavigate(): void {
    // A generated single-page draft has nowhere to navigate to yet. Rather than swallow the request
    // silently, say so: a drill-down that appears to do nothing reads as a broken page.
    this.snack.open(
      'Save the experience first — drill-down targets resolve against saved pages.',
      undefined,
      { duration: 4000 },
    );
  }

  protected verdictIcon(status: string): string {
    switch (status) {
      case 'generated':
        return 'check_circle';
      case 'repaired':
        return 'build_circle';
      case 'fallback':
        return 'shortcut';
      case 'needsClarification':
        return 'help';
      case 'declined':
        return 'block';
      default:
        return 'error';
    }
  }

  protected verdictTitle(status: string): string {
    switch (status) {
      case 'generated':
        return 'Generated and validated';
      case 'repaired':
        return 'Generated after repair';
      case 'fallback':
        return 'Fell back to a curated template';
      case 'needsClarification':
        return 'One question first';
      case 'declined':
        return 'Declined';
      default:
        return 'Could not generate';
    }
  }

  protected measureNames(entity: { measures: readonly { name: string }[] }): string {
    return entity.measures.length ? entity.measures.map((m) => m.name).join(', ') : 'none offered';
  }
}
