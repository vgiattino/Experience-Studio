/**
 * The experience library — §5 · §16 · §26, FR-01 · FR-20 · FR-21.
 *
 * ── WHY THIS IS THREE LISTS AND NOT ONE ──────────────────────────────────────
 *
 * It used to be one flat list of everything the store held, sorted by date, with the product's own
 * shipped pages mixed into it under an `origin: 'seed'` chip. That is a *storage* view, and it made
 * FR-01's gap exactly what the reconciliation said it was: the standards were files that happened to
 * ship rather than a library of product capabilities.
 *
 * §2 names three levels of interaction and says the initial priority is the first two:
 *
 *   Level 1 — **Use**        consume the standard screens the product delivers
 *   Level 2 — **Configure**  modify one through configuration or natural language
 *   Level 3 — **Create**     describe a new experience from scratch  (Phase 4, P2)
 *
 * So the library is grouped by that, because the group an experience is in *is* the answer to "what
 * may I do with this". A product standard can be opened and customised, and cannot be edited. A client
 * variant can be edited and may have a product update waiting. Something built from scratch has no
 * standard behind it and never will. Those are three different sets of affordances, and one list with a
 * chip on it cannot express them — the chip says what an artifact *is* while the reader needs to know
 * what they can *do*.
 *
 * ── THE NOTIFICATION LIVES ON THE CARD ───────────────────────────────────────
 *
 * §16.3 asks for a notification when a new standard version is available. It is rendered on the variant
 * it concerns rather than in a global tray, because every one of its five actions is about *that*
 * experience — a notification the reader has to go and find the subject of is a notification that gets
 * dismissed unread.
 *
 * Two of those five actions are Compare Changes and Sync with Standard, which are §16.4 and §16.5 and
 * are not built. They are named as what is coming rather than rendered as buttons that do nothing: a
 * disabled control teaches the reader the feature is broken, and a sentence teaches them it is next.
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
import {
  ExperienceRepository,
  type StandardListing,
  type StandardUpdateNotice,
} from '@opus/metadata-service';
import type { ExperienceSummary } from '@opus/experience-model';

/** A client variant with §16.3's answer attached, once it has been asked for. */
interface VariantRow {
  summary: ExperienceSummary;
  notice?: StandardUpdateNotice;
  /** Set by Review Later: hides the notice for this visit and records nothing. */
  deferred?: boolean;
}

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
            Production-ready experiences ship with the product. Configure one in your own words and you
            get your own version — the product standard is never changed, and product updates keep
            reaching you.
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

      <!--
        §26's progression, stated once. It is the frame the three sections below sit in, and without it
        a reader has to infer from three headings why the same platform has three lists.
      -->
      <ol class="levels" aria-label="How an experience evolves">
        <li><span class="step">Use</span> what the product ships</li>
        <li><span class="step">Configure</span> it in your own words</li>
        <li><span class="step">Create</span> something new <em>— later phase</em></li>
      </ol>

      <!-- ── Level 1 ─────────────────────────────────────────────────────── -->
      <section class="group">
        <header class="group-head">
          <mat-icon>inventory_2</mat-icon>
          <div>
            <h2>Product standards</h2>
            <p>
              Delivered and versioned by the product. These cannot be edited — customising one creates
              your own version and leaves the standard as it is.
            </p>
          </div>
        </header>

        @if (standards().length === 0) {
          <p class="none">No product standards are installed in this tenant.</p>
        }

        <div class="cards">
          @for (item of standards(); track item.standardId) {
            <mat-card appearance="outlined" class="card standard">
              <mat-card-header>
                <mat-icon mat-card-avatar class="avatar">inventory_2</mat-icon>
                <mat-card-title>{{ item.name }}</mat-card-title>
                <mat-card-subtitle>
                  Standard v{{ item.version }}
                  @if (item.productRelease) {
                    · release {{ item.productRelease }}
                  }
                  · {{ item.pageCount }} page{{ item.pageCount === 1 ? '' : 's' }}
                </mat-card-subtitle>
              </mat-card-header>

              <mat-card-content>
                @if (item.releaseNotes) {
                  <p class="description">{{ item.releaseNotes }}</p>
                }
                @if (item.derivedId) {
                  <p class="lineage-note">
                    <mat-icon inline>call_split</mat-icon>
                    You have your own version of this.
                  </p>
                }
              </mat-card-content>

              <mat-card-actions align="end">
                @if (item.derivedId) {
                  <button mat-button (click)="open(item.derivedId!)">
                    <mat-icon>edit_note</mat-icon>
                    Open your version
                  </button>
                } @else {
                  <button
                    mat-button
                    [disabled]="deriving() === item.id"
                    (click)="customize(item)"
                    matTooltip="Creates your own version, derived from this standard. The standard is not changed."
                  >
                    <mat-icon>call_split</mat-icon>
                    Customize
                  </button>
                }
                <button mat-flat-button (click)="open(item.id)">
                  <mat-icon>play_arrow</mat-icon>
                  Use
                </button>
              </mat-card-actions>
            </mat-card>
          }
        </div>
      </section>

      <!-- ── Level 2 ─────────────────────────────────────────────────────── -->
      <section class="group">
        <header class="group-head">
          <mat-icon>call_split</mat-icon>
          <div>
            <h2>Your versions</h2>
            <p>
              Derived from a product standard and owned by you. Each one keeps a link to the standard it
              came from, which is what lets the product tell you when a newer one ships.
            </p>
          </div>
        </header>

        @if (variants().length === 0) {
          <p class="none">
            Nothing derived yet. Customize a product standard above and it will appear here.
          </p>
        }

        <div class="cards">
          @for (row of variants(); track row.summary.id) {
            <mat-card appearance="outlined" class="card">
              <mat-card-header>
                <mat-icon mat-card-avatar class="avatar">edit_note</mat-icon>
                <mat-card-title>{{ row.summary.name }}</mat-card-title>
                <mat-card-subtitle>
                  Your v{{ row.summary.artifactVersion }} · {{ row.summary.lifecycleState }}
                </mat-card-subtitle>
              </mat-card-header>

              <mat-card-content>
                <!--
                  §16.1's lineage, as a definition list rather than a chip row: it is six named facts
                  about one relationship, and a chip row would flatten them into six adjectives.
                -->
                <dl class="lineage">
                  <dt>Standard</dt>
                  <dd>{{ standardName(row.summary.derivedFromStandard) }}</dd>
                  <dt>Based on</dt>
                  <dd>v{{ row.summary.basedOnVersion }}</dd>
                  <dt>Your version</dt>
                  <dd>v{{ row.summary.artifactVersion }}</dd>
                  @if (row.summary.acknowledgedVersion) {
                    <dt>Declined</dt>
                    <dd>v{{ row.summary.acknowledgedVersion }}</dd>
                  }
                </dl>

                @if (row.notice?.update && !row.deferred) {
                  <div class="notice" role="status">
                    <p class="notice-message">{{ row.notice!.message }}</p>
                    @if (row.notice!.update!.releaseNotes) {
                      <p class="notice-notes">{{ row.notice!.update!.releaseNotes }}</p>
                    }
                    <div class="notice-actions">
                      <button
                        mat-button
                        (click)="preview(row)"
                        matTooltip="Opens the new standard so you can see it before deciding"
                      >
                        <mat-icon>visibility</mat-icon>
                        Preview new version
                      </button>
                      <button mat-button (click)="keepMine(row)">
                        <mat-icon>lock</mat-icon>
                        Keep my version
                      </button>
                      <button mat-button (click)="reviewLater(row)">
                        <mat-icon>schedule</mat-icon>
                        Review later
                      </button>
                    </div>
                    <!--
                      Said rather than shown as two dead buttons. §16.3 lists five actions; three of
                      them work, and a disabled control would read as broken where a sentence reads as
                      forthcoming.
                    -->
                    <p class="notice-next">
                      Compare Changes and Sync with Standard are the next step — they need the
                      per-change comparison §16.4 describes, so that synchronising can be selective
                      rather than all-or-nothing.
                    </p>
                  </div>
                } @else if (row.notice && !row.notice.update) {
                  <!--
                    A null update means the server has nothing to say, and that covers TWO states the
                    reader must not have conflated. A variant that declined v2.0 is not up to date — it
                    is holding, on purpose — and telling its owner otherwise would be the quiet kind of
                    untruth this feature exists to avoid. The declined version is what separates them.
                  -->
                  @if (row.summary.acknowledgedVersion) {
                    <p class="lineage-note current">
                      <mat-icon inline>lock</mat-icon>
                      Holding at v{{ row.summary.basedOnVersion }} — you declined v{{
                        row.summary.acknowledgedVersion
                      }}. You will hear about the next release.
                    </p>
                  } @else {
                    <p class="lineage-note current">
                      <mat-icon inline>check_circle</mat-icon>
                      Up to date with the product standard.
                    </p>
                  }
                }
              </mat-card-content>

              <mat-card-actions align="end">
                <button mat-button (click)="remove(row.summary.id)" matTooltip="Delete this experience">
                  <mat-icon>delete_outline</mat-icon>
                </button>
                <button mat-flat-button (click)="open(row.summary.id)">
                  <mat-icon>play_arrow</mat-icon>
                  Open
                </button>
              </mat-card-actions>
            </mat-card>
          }
        </div>
      </section>

      <!-- ── Level 3 ─────────────────────────────────────────────────────── -->
      @if (standalone().length) {
        <section class="group">
          <header class="group-head">
            <mat-icon>auto_awesome</mat-icon>
            <div>
              <h2>Created here</h2>
              <p>
                Built from scratch rather than derived from a standard, so there is no product version
                behind them and nothing to synchronise with.
              </p>
            </div>
          </header>

          <div class="cards">
            @for (item of standalone(); track item.id) {
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
        </section>
      }
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
      margin-block-end: 20px;
    }

    .intro h1 {
      margin: 0 0 6px;
      font-size: 1.6rem;
      font-weight: 600;
      letter-spacing: -0.015em;
    }

    .intro p {
      margin: 0;
      max-inline-size: 68ch;
      font-size: 0.875rem;
      line-height: 1.6;
      opacity: 0.75;
    }

    .levels {
      display: flex;
      flex-wrap: wrap;
      gap: 8px 20px;
      margin: 0 0 28px;
      padding: 12px 16px;
      list-style: none;
      border-radius: 12px;
      background: var(--mat-sys-surface-container-low);
      font-size: 0.8rem;
    }

    .levels li {
      display: flex;
      align-items: center;
      gap: 8px;
      opacity: 0.82;
    }

    .levels .step {
      font-weight: 600;
      padding: 2px 8px;
      border-radius: 999px;
      background: var(--mat-sys-secondary-container);
      color: var(--mat-sys-on-secondary-container);
    }

    .levels em {
      opacity: 0.6;
      font-style: normal;
    }

    .group {
      margin-block-end: 36px;
    }

    .group-head {
      display: flex;
      gap: 12px;
      align-items: flex-start;
      margin-block-end: 14px;
    }

    .group-head > mat-icon {
      opacity: 0.55;
      margin-block-start: 2px;
    }

    .group-head h2 {
      margin: 0 0 3px;
      font-size: 1.05rem;
      font-weight: 600;
    }

    .group-head p {
      margin: 0;
      max-inline-size: 74ch;
      font-size: 0.8rem;
      line-height: 1.6;
      opacity: 0.7;
    }

    .none {
      margin: 0;
      padding: 18px 20px;
      border: 1px dashed var(--mat-sys-outline-variant);
      border-radius: 12px;
      font-size: 0.8rem;
      opacity: 0.7;
    }

    .cards {
      display: grid;
      grid-template-columns: repeat(auto-fill, minmax(340px, 1fr));
      gap: 16px;
    }

    .card {
      display: flex;
      flex-direction: column;
    }

    /* A name long enough to wrap — "Securities Operations — Acme" — pushed the subtitle into the
       content below it, so the client version read as the first row of the lineage list. */
    .card mat-card-title {
      line-height: 1.3;
    }

    .card mat-card-header {
      margin-block-end: 12px;
    }

    /* A standard reads as product-owned before anything is read, because that is the fact that
       governs what may be done with it. */
    .card.standard {
      border-color: var(--mat-sys-primary);
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

    .lineage {
      display: grid;
      grid-template-columns: auto 1fr;
      gap: 2px 12px;
      margin: 0 0 12px;
      font-size: 0.78rem;
    }

    .lineage dt {
      opacity: 0.6;
    }

    .lineage dd {
      margin: 0;
      font-weight: 500;
    }

    .lineage-note {
      display: flex;
      align-items: center;
      gap: 6px;
      margin: 0;
      font-size: 0.78rem;
      opacity: 0.75;
    }

    .lineage-note.current {
      opacity: 0.65;
    }

    .notice {
      margin-block-start: 4px;
      padding: 12px 14px;
      border-radius: 10px;
      background: var(--mat-sys-tertiary-container);
      color: var(--mat-sys-on-tertiary-container);
    }

    .notice-message {
      margin: 0;
      font-size: 0.82rem;
      line-height: 1.55;
      font-weight: 500;
    }

    .notice-notes {
      margin: 8px 0 0;
      font-size: 0.78rem;
      line-height: 1.5;
      opacity: 0.85;
    }

    .notice-actions {
      display: flex;
      flex-wrap: wrap;
      gap: 4px;
      margin-block-start: 8px;
    }

    .notice-next {
      margin: 8px 0 0;
      font-size: 0.72rem;
      line-height: 1.5;
      opacity: 0.72;
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
  `,
})
export class LibraryComponent {
  protected readonly repository = inject(ExperienceRepository);
  private readonly router = inject(Router);
  private readonly snack = inject(MatSnackBar);

  protected readonly standards = signal<readonly StandardListing[]>([]);
  protected readonly deriving = signal<string | null>(null);
  /** §16.3 answers, keyed by variant id. Fetched per variant because the route is per experience. */
  private readonly notices = signal<Readonly<Record<string, StandardUpdateNotice>>>({});
  private readonly deferred = signal<readonly string[]>([]);

  /**
   * Client variants — §2's Level 2.
   *
   * Selected on `derivedFromStandard` rather than on `origin`, and the distinction is the one FR-01's
   * gap was about: `origin` says how the bytes arrived (`copy`, `ai`, `human`) while `derivedFrom` says
   * whether there is a standing relationship to a product standard. A variant somebody then refined
   * with AI has `origin: 'aiRefined'` and is still a variant.
   */
  protected readonly variants = computed<readonly VariantRow[]>(() =>
    this.repository
      .summaries()
      .filter((s) => !!s.derivedFromStandard)
      .map((summary) => ({
        summary,
        notice: this.notices()[summary.id],
        deferred: this.deferred().includes(summary.id),
      })),
  );

  /** Neither a standard nor derived from one. A third state, not a missing value. */
  protected readonly standalone = computed(() =>
    this.repository.summaries().filter((s) => !s.derivedFromStandard && !s.standard),
  );

  constructor() {
    void this.load();
  }

  private async load(): Promise<void> {
    const [, standards] = await Promise.all([this.repository.refresh(), this.safeStandards()]);
    this.standards.set(standards);
    await this.loadNotices();
  }

  private async safeStandards(): Promise<readonly StandardListing[]> {
    try {
      return await this.repository.standards();
    } catch {
      // A tenant with no standards installed is a legitimate state, and so is an older API. Neither is
      // worth a red banner over a page that still shows everything else.
      return [];
    }
  }

  /**
   * Ask §16.3's question for every variant, in parallel.
   *
   * One request per variant because the route is per experience, which is the right granularity for a
   * question whose answer names a specific standard version — and cheap, because there is one variant
   * per standard by construction.
   */
  private async loadNotices(): Promise<void> {
    const rows = this.repository.summaries().filter((s) => !!s.derivedFromStandard);
    const results = await Promise.all(
      rows.map(async (row) => {
        try {
          return [row.id, await this.repository.standardUpdate(row.id)] as const;
        } catch {
          return null;
        }
      }),
    );
    this.notices.set(Object.fromEntries(results.filter((r): r is NonNullable<typeof r> => !!r)));
  }

  protected standardName(standardId: string | undefined): string {
    return this.standards().find((s) => s.standardId === standardId)?.name ?? standardId ?? 'unknown';
  }

  protected open(id: string): void {
    void this.router.navigate(['/x', id]);
  }

  /** §2's Level 1 → Level 2 step. FR-20. */
  protected async customize(item: StandardListing): Promise<void> {
    this.deriving.set(item.id);
    try {
      const derived = await this.repository.derive(item.id);
      this.standards.set(await this.safeStandards());
      await this.loadNotices();
      this.snack.open(
        `Created “${this.nameOf(derived)}”. The standard is unchanged — edits go to your version.`,
        undefined,
        { duration: 5000 },
      );
    } catch (error) {
      this.snack.open(this.reason(error, 'Could not create your version'), 'Dismiss', { duration: 6000 });
    } finally {
      this.deriving.set(null);
    }
  }

  /** §16.3 — Preview New Version. Opens the standard itself, which is what "the new version" is. */
  protected preview(row: VariantRow): void {
    const standardId = row.summary.derivedFromStandard;
    const shipped = this.standards().find((s) => s.standardId === standardId);
    if (!shipped) {
      this.snack.open('That standard is no longer installed, so there is nothing to preview.', 'Dismiss', {
        duration: 5000,
      });
      return;
    }
    void this.router.navigate(['/x', shipped.id]);
  }

  /**
   * §16.3 — Keep My Version.
   *
   * Sends the version that was on the screen rather than letting the server pick, so the decision
   * recorded is the decision the person made.
   */
  protected async keepMine(row: VariantRow): Promise<void> {
    const version = row.notice?.update?.availableVersion;
    if (!version) return;
    try {
      await this.repository.declineUpdate(row.summary.id, version);
      await this.loadNotices();
      this.snack.open(
        `Keeping your version. You will hear about the next standard after v${version}.`,
        undefined,
        { duration: 5000 },
      );
    } catch (error) {
      this.snack.open(this.reason(error, 'Could not record that'), 'Dismiss', { duration: 6000 });
    }
  }

  /**
   * §16.3 — Review Later.
   *
   * Records nothing, deliberately. The notice comes back on the next visit, which is the difference a
   * reader of §16.3's list would expect between this and Keep My Version — and the reason both are
   * offered rather than one.
   */
  protected reviewLater(row: VariantRow): void {
    this.deferred.update((ids) => [...ids, row.summary.id]);
  }

  protected async remove(id: string): Promise<void> {
    try {
      await this.repository.remove(id);
      this.standards.set(await this.safeStandards());
      // The store keeps the deleted body under versions/, so "deleted" is recoverable rather than
      // final — worth saying, because a user who believes it is final will not try it.
      this.snack.open(`Deleted “${id}”. The last version is kept in the store's history.`, undefined, {
        duration: 4000,
      });
    } catch (error) {
      this.snack.open(this.reason(error, 'Could not delete'), 'Dismiss', { duration: 5000 });
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
      case 'copy':
        return 'content_copy';
      default:
        return 'edit_note';
    }
  }

  protected originTip(origin: string): string {
    switch (origin) {
      case 'ai':
        return 'Generated from a prompt. Its provenance records which model and which catalog version.';
      case 'aiRefined':
        return 'Refined conversationally. Every accepted refinement is an ordinary, undoable edit.';
      case 'seed':
        return 'Shipped with the repository and deployed into the store on first run.';
      default:
        return 'Authored by a person.';
    }
  }

  private nameOf(record: { definition?: { name?: unknown }; id?: string }): string {
    const name = record.definition?.name;
    if (typeof name === 'string') return name;
    if (name && typeof name === 'object' && 'default' in name) {
      return String((name as { default: unknown }).default);
    }
    return record.id ?? 'your version';
  }

  private reason(error: unknown, fallback: string): string {
    return error instanceof Error && error.message ? error.message : fallback;
  }
}
