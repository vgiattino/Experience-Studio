/**
 * The AI generation surface.
 *
 * This component is deliberately more than a prompt box and a result, because the thing
 * being demonstrated is not "AI produces a page" — that is easy to fake — but that the
 * pipeline described in architecture/ai-architecture.md is real and inspectable at every
 * stage. So it shows, for each generation:
 *
 *   - what the request was understood to mean (intake)
 *   - what the catalog offered, entitlement-scoped, and what was dropped (retrieval)
 *   - the exact context a real model would receive, layer by layer, with the token budget
 *   - the decisions the model returned (plan), not a page it wrote
 *   - the validation verdict, and any repair the platform had to drive
 *   - the assembled JSON
 *   - the page, rendered by the same renderer that serves hand-authored definitions
 *
 * Two of those are the point. The CONTEXT INSPECTOR is how you tell a grounded generator
 * from a plausible one: if the page binds to something not in that text, the platform is
 * guessing. And the RENDERED RESULT goes through PageLoaderService.loadDefinition(), the
 * same migrate → validate → compile path as a page fetched from disk — so a generation
 * that renders here is a generation that survives being saved and reloaded.
 */

import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  input,
  signal,
} from '@angular/core';
import type { CatalogSnapshot } from '@opus/catalog';
import type { PageDefinition, UserContext } from '@opus/contracts';
import { StateShellComponent } from '@opus/design-system';
import {
  GenerationService,
  type GenerationOutcome,
  type SimulatedFault,
  type StageRecord,
} from '@opus/generation';
import { PageLoaderService, PageRendererComponent, type CompiledPage } from '@opus/renderer';

type Inspector = 'page' | 'json' | 'context' | 'grounding' | 'plan' | 'validation';

/**
 * The first is the request this milestone was specified against, verbatim. The rest probe
 * different branches: a different domain, a refusal, a request too vague to build from.
 */
const EXAMPLES: readonly { label: string; prompt: string }[] = [
  {
    label: 'Security Master dashboard',
    prompt:
      'Create a Security Master dashboard showing today’s processing status, failed files, late files, new securities, and exceptions.',
  },
  {
    label: 'Data quality backlog',
    prompt:
      'Show me open data quality exceptions by severity, with the oldest breaks and how long they have been outstanding.',
  },
  {
    label: 'Late feeds by source',
    prompt: 'Which vendor files are late today, broken down by source system?',
  },
  { label: 'Out of scope', prompt: 'Delete every security that matured last year.' },
  { label: 'Too vague', prompt: 'Make me something nice.' },
];

const FAULTS: readonly { value: SimulatedFault; label: string }[] = [
  { value: 'invalidAggregation', label: 'Model picks a disallowed aggregation' },
  { value: 'unknownField', label: 'Model invents a field' },
  { value: 'unknownComponent', label: 'Model names an unregistered component' },
  { value: 'chartWithoutDimension', label: 'Model emits a chart with no x axis' },
  { value: 'providerFailure', label: 'Provider call fails outright' },
];

@Component({
  selector: 'opus-generation-studio',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [PageRendererComponent, StateShellComponent],
  template: `
    <div class="studio">
      <header class="composer">
        <div class="composer-head">
          <h1>Create a page</h1>
          <p class="sub">
            Describe the page in your own words. The platform grounds the request in the
            governed catalog, chooses components, and assembles a draft you can review.
          </p>
        </div>

        <label class="sr-only" for="gen-prompt">Describe the page you want</label>
        <textarea
          id="gen-prompt"
          rows="3"
          [value]="prompt()"
          [disabled]="service.running()"
          placeholder="e.g. Create a Security Master dashboard showing today’s processing status…"
          (input)="prompt.set($any($event.target).value)"
          (keydown.control.enter)="run()"
        ></textarea>

        <div class="composer-actions">
          <button type="button" class="primary" [disabled]="!canRun()" (click)="run()">
            {{ service.running() ? 'Generating…' : 'Generate page' }}
          </button>

          <label class="fault">
            <span>Inject fault</span>
            <select
              [disabled]="service.running()"
              (change)="fault.set($any($event.target).value)"
            >
              <option value="" [selected]="fault() === ''">None</option>
              @for (f of faults; track f.value) {
                <option [value]="f.value" [selected]="f.value === fault()">{{ f.label }}</option>
              }
            </select>
          </label>

          <span class="provider">{{ service.providerLabel() }}</span>
        </div>

        <div class="examples">
          @for (example of examples; track example.label) {
            <button
              type="button"
              class="chip"
              [disabled]="service.running()"
              (click)="prompt.set(example.prompt)"
            >
              {{ example.label }}
            </button>
          }
        </div>
      </header>

      @if (service.running() || stages().length) {
        <section class="pipeline" aria-label="Generation pipeline">
          <ol>
            @for (stage of stages(); track $index) {
              <li [attr.data-status]="stage.status">
                <span class="stage-name">{{ stage.stage }}</span>
                <span class="stage-summary">{{ stage.summary }}</span>
                <span class="stage-ms">{{ stage.durationMs }}ms</span>
              </li>
            }
            @if (service.running()) {
              <li data-status="running">
                <span class="stage-name">…</span>
                <span class="stage-summary">working</span>
                <span class="stage-ms"></span>
              </li>
            }
          </ol>
        </section>
      }

      @if (outcome(); as result) {
        <section class="verdict" [attr.data-status]="result.status">
          <p class="message">{{ result.message }}</p>
          <p class="meta">
            {{ result.status }} · {{ result.totalMs }}ms ·
            {{ result.tokensIn }} in / {{ result.tokensOut }} out ·
            {{ result.correlationId }}
          </p>
        </section>

        @if (result.definition) {
          <nav class="inspectors" aria-label="Inspect the generation">
            @for (tab of inspectorTabs; track tab.id) {
              <button
                type="button"
                [class.active]="inspector() === tab.id"
                [attr.aria-pressed]="inspector() === tab.id"
                (click)="inspector.set(tab.id)"
              >
                {{ tab.label }}
              </button>
            }
          </nav>

          <div class="inspector-body">
            @switch (inspector()) {
              @case ('page') {
                @if (compileError()) {
                  <opus-state-shell
                    state="error"
                    title="The generated page did not compile"
                    [message]="compileError()!"
                  />
                } @else if (compiled(); as page) {
                  <div class="preview">
                    <p class="preview-note">
                      Rendered by the same engine, from the JSON on the left tab — no
                      generated Angular, no hardcoded template.
                    </p>
                    <opus-page-renderer [page]="page" [user]="user()" />
                  </div>
                } @else {
                  <opus-state-shell state="loading" label="generated page" skeleton="block" />
                }
              }
              @case ('json') {
                <pre class="code">{{ definitionJson() }}</pre>
              }
              @case ('context') {
                <p class="explain">
                  Exactly what a real model would receive. Layers are ordered by priority;
                  eviction, when the budget binds, proceeds from the bottom.
                </p>
                <table class="layers">
                  <thead>
                    <tr><th>Layer</th><th>Tokens</th><th>Evictable</th><th>State</th></tr>
                  </thead>
                  <tbody>
                    @for (layer of contextLayers(); track layer.name) {
                      <tr>
                        <td>{{ layer.name }}</td>
                        <td class="num">{{ layer.estimatedTokens }}</td>
                        <td>{{ layer.evictable ? 'yes' : 'no' }}</td>
                        <td>{{ layer.reduced ?? 'sent in full' }}</td>
                      </tr>
                    }
                  </tbody>
                </table>
                <pre class="code">{{ contextText() }}</pre>
              }
              @case ('grounding') {
                <p class="explain">
                  Retrieved from the catalog <em>after</em> entitlement scoping, so nothing
                  the author may not see can be named — or leaked in a title.
                </p>
                <pre class="code">{{ groundingJson() }}</pre>
              }
              @case ('plan') {
                <p class="explain">
                  The model returns decisions, not a page. Everything mechanical — ids,
                  layout arithmetic, version envelope, action wiring — is code.
                </p>
                <pre class="code">{{ planJson() }}</pre>
              }
              @case ('validation') {
                <pre class="code">{{ validationJson() }}</pre>
              }
            }
          </div>
        }
      }
    </div>
  `,
  styles: `
    :host {
      display: block;
      min-inline-size: 0;
    }

    .studio {
      display: flex;
      flex-direction: column;
      gap: var(--opus-space-4);
      padding: var(--opus-space-5) var(--opus-space-5) var(--opus-space-6);
      max-inline-size: 100%;
    }

    .composer {
      display: flex;
      flex-direction: column;
      gap: var(--opus-space-3);
      padding: var(--opus-space-4);
      background: var(--opus-surface);
      border: 1px solid var(--opus-border);
      border-radius: var(--opus-radius-md);
    }

    h1 {
      margin: 0;
      font-size: var(--opus-text-lg);
      font-weight: var(--opus-weight-semibold);
    }

    .sub {
      margin: 4px 0 0;
      max-inline-size: 60ch;
      font-size: var(--opus-text-sm);
      color: var(--opus-text-muted);
    }

    textarea {
      font: inherit;
      font-size: var(--opus-text-sm);
      line-height: 1.5;
      padding: var(--opus-space-2);
      resize: vertical;
      color: var(--opus-text);
      background: var(--opus-canvas);
      border: 1px solid var(--opus-border);
      border-radius: var(--opus-radius-sm);
    }

    textarea:focus-visible,
    button:focus-visible,
    select:focus-visible {
      outline: 2px solid var(--opus-focus-ring);
      outline-offset: 2px;
    }

    .composer-actions {
      display: flex;
      align-items: center;
      gap: var(--opus-space-3);
      flex-wrap: wrap;
    }

    .primary {
      font: inherit;
      font-size: var(--opus-text-sm);
      font-weight: var(--opus-weight-medium);
      padding: var(--opus-space-2) var(--opus-space-4);
      color: var(--opus-text-inverse);
      background: var(--opus-emphasis-info);
      border: 0;
      border-radius: var(--opus-radius-sm);
      cursor: pointer;
    }

    .primary:disabled {
      opacity: 0.5;
      cursor: not-allowed;
    }

    .fault {
      display: flex;
      align-items: center;
      gap: var(--opus-space-1);
      font-size: var(--opus-text-xs);
      color: var(--opus-text-muted);
    }

    select {
      font: inherit;
      font-size: var(--opus-text-xs);
      padding: 2px var(--opus-space-1);
      color: var(--opus-text);
      background: var(--opus-surface);
      border: 1px solid var(--opus-border);
      border-radius: var(--opus-radius-sm);
      max-inline-size: 18rem;
    }

    .provider {
      margin-inline-start: auto;
      font-family: var(--opus-font-mono);
      font-size: var(--opus-text-xs);
      color: var(--opus-text-muted);
    }

    .examples {
      display: flex;
      gap: var(--opus-space-2);
      flex-wrap: wrap;
    }

    .chip {
      font: inherit;
      font-size: var(--opus-text-xs);
      padding: 3px var(--opus-space-2);
      color: var(--opus-text-secondary);
      background: var(--opus-canvas);
      border: 1px solid var(--opus-border);
      border-radius: 999px;
      cursor: pointer;
    }

    .chip:hover:not(:disabled) {
      border-color: var(--opus-emphasis-info);
      color: var(--opus-text);
    }

    .pipeline ol {
      list-style: none;
      margin: 0;
      padding: 0;
      display: flex;
      flex-direction: column;
      border: 1px solid var(--opus-border);
      border-radius: var(--opus-radius-md);
      overflow: hidden;
    }

    .pipeline li {
      display: grid;
      grid-template-columns: 6.5rem minmax(0, 1fr) 4rem;
      gap: var(--opus-space-2);
      align-items: baseline;
      padding: var(--opus-space-2) var(--opus-space-3);
      font-size: var(--opus-text-xs);
      background: var(--opus-surface);
      border-block-start: 1px solid var(--opus-border);
    }

    .pipeline li:first-child {
      border-block-start: 0;
    }

    .stage-name {
      font-family: var(--opus-font-mono);
      font-weight: var(--opus-weight-medium);
      text-transform: uppercase;
      letter-spacing: 0.04em;
    }

    .pipeline li[data-status='ok'] .stage-name { color: var(--opus-emphasis-positive); }
    .pipeline li[data-status='warning'] .stage-name { color: var(--opus-emphasis-warning); }
    .pipeline li[data-status='failed'] .stage-name { color: var(--opus-emphasis-negative); }
    .pipeline li[data-status='running'] .stage-name { color: var(--opus-text-muted); }

    .stage-summary { color: var(--opus-text-secondary); }
    .stage-ms { color: var(--opus-text-muted); text-align: end; font-variant-numeric: tabular-nums; }

    .verdict {
      padding: var(--opus-space-3) var(--opus-space-4);
      border: 1px solid var(--opus-border);
      border-inline-start-width: 3px;
      border-radius: var(--opus-radius-md);
      background: var(--opus-surface);
    }

    .verdict[data-status='generated'] { border-inline-start-color: var(--opus-emphasis-positive); }
    .verdict[data-status='repaired'],
    .verdict[data-status='fallback'] { border-inline-start-color: var(--opus-emphasis-warning); }
    .verdict[data-status='declined'],
    .verdict[data-status='needsClarification'],
    .verdict[data-status='failed'] { border-inline-start-color: var(--opus-emphasis-negative); }

    .message {
      margin: 0;
      font-size: var(--opus-text-sm);
      color: var(--opus-text);
    }

    .meta {
      margin: 4px 0 0;
      font-family: var(--opus-font-mono);
      font-size: var(--opus-text-xs);
      color: var(--opus-text-muted);
    }

    .inspectors {
      display: flex;
      gap: 2px;
      flex-wrap: wrap;
      border-block-end: 1px solid var(--opus-border);
    }

    .inspectors button {
      font: inherit;
      font-size: var(--opus-text-sm);
      padding: var(--opus-space-2) var(--opus-space-3);
      color: var(--opus-text-muted);
      background: none;
      border: 0;
      border-block-end: 2px solid transparent;
      cursor: pointer;
    }

    .inspectors button.active {
      color: var(--opus-text);
      border-block-end-color: var(--opus-emphasis-info);
    }

    .inspector-body { min-inline-size: 0; }

    .explain {
      margin: 0 0 var(--opus-space-2);
      font-size: var(--opus-text-xs);
      color: var(--opus-text-muted);
      max-inline-size: 80ch;
    }

    .code {
      margin: 0;
      max-block-size: 30rem;
      overflow: auto;
      padding: var(--opus-space-3);
      font-family: var(--opus-font-mono);
      font-size: var(--opus-text-xs);
      line-height: 1.5;
      white-space: pre-wrap;
      overflow-wrap: anywhere;
      color: var(--opus-text-secondary);
      background: var(--opus-canvas);
      border: 1px solid var(--opus-border);
      border-radius: var(--opus-radius-sm);
    }

    .layers {
      inline-size: 100%;
      border-collapse: collapse;
      margin-block-end: var(--opus-space-3);
      font-size: var(--opus-text-xs);
    }

    .layers th,
    .layers td {
      text-align: start;
      padding: 4px var(--opus-space-2);
      border-block-end: 1px solid var(--opus-border);
    }

    .layers th { color: var(--opus-text-muted); font-weight: var(--opus-weight-medium); }
    .layers .num { text-align: end; font-variant-numeric: tabular-nums; }

    .preview {
      border: 1px dashed var(--opus-border);
      border-radius: var(--opus-radius-md);
      overflow: hidden;
    }

    .preview-note {
      margin: 0;
      padding: var(--opus-space-2) var(--opus-space-3);
      font-size: var(--opus-text-xs);
      color: var(--opus-text-muted);
      background: var(--opus-surface);
      border-block-end: 1px solid var(--opus-border);
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
export class GenerationStudioComponent {
  protected readonly service = inject(GenerationService);
  private readonly loader = inject(PageLoaderService);

  readonly user = input.required<UserContext>();
  readonly snapshot = input.required<CatalogSnapshot | null>();

  protected readonly examples = EXAMPLES;
  protected readonly faults = FAULTS;
  protected readonly inspectorTabs: readonly { id: Inspector; label: string }[] = [
    { id: 'page', label: 'Rendered page' },
    { id: 'json', label: 'Page JSON' },
    { id: 'context', label: 'Model context' },
    { id: 'grounding', label: 'Grounding' },
    { id: 'plan', label: 'Plan' },
    { id: 'validation', label: 'Validation' },
  ];

  protected readonly prompt = signal(EXAMPLES[0]!.prompt);
  protected readonly fault = signal<SimulatedFault | ''>('');
  protected readonly inspector = signal<Inspector>('page');
  protected readonly outcome = signal<GenerationOutcome | null>(null);
  protected readonly compiled = signal<CompiledPage | null>(null);
  protected readonly compileError = signal<string | null>(null);

  protected readonly stages = computed<readonly StageRecord[]>(() => this.service.stages());

  protected readonly canRun = computed(
    () => !this.service.running() && this.prompt().trim().length > 0 && this.snapshot() !== null,
  );

  protected readonly definitionJson = computed(() =>
    JSON.stringify(this.outcome()?.definition ?? {}, null, 2),
  );
  protected readonly groundingJson = computed(() =>
    JSON.stringify(this.outcome()?.grounding ?? {}, null, 2),
  );
  protected readonly planJson = computed(() => JSON.stringify(this.outcome()?.plan ?? {}, null, 2));
  protected readonly validationJson = computed(() =>
    JSON.stringify(this.outcome()?.validation ?? { note: 'Not validated' }, null, 2),
  );
  protected readonly contextLayers = computed(() => this.outcome()?.context?.layers ?? []);
  protected readonly contextText = computed(() => {
    const context = this.outcome()?.context;
    if (!context) return '';
    return `───── SYSTEM ─────\n${context.system}\n\n───── USER ─────\n${context.user}`;
  });

  protected async run(): Promise<void> {
    const snapshot = this.snapshot();
    if (!snapshot || this.service.running()) return;

    this.compiled.set(null);
    this.compileError.set(null);
    this.inspector.set('page');

    const fault = this.fault();
    const result = await this.service.generate({
      prompt: this.prompt(),
      user: this.user(),
      snapshot,
      faults: fault ? [fault] : undefined,
    });
    this.outcome.set(result);

    if (!result.definition) return;
    await this.render(result.definition);
  }

  /**
   * The same load path as a definition fetched from disk. If validation rejects it here
   * the generation was not actually valid, whatever the service concluded — which is why
   * this is not a shortcut to compilePage().
   */
  private async render(definition: PageDefinition): Promise<void> {
    const outcome = await this.loader.loadDefinition(definition);
    if (outcome.ok) {
      this.compiled.set(outcome.page);
      this.compileError.set(null);
    } else {
      this.compiled.set(null);
      this.compileError.set(`${outcome.stage}: ${outcome.detail}`);
    }
  }
}
