/**
 * Sources — register a database, scan it, review what it proposes, publish it.
 *
 * ── WHY THE REVIEW IS THE SCREEN ────────────────────────────────────────────────────────
 * The register form is eleven fields and the scan is a button. The part that took the design is the
 * middle: a machine has read a database and proposed a business vocabulary, and a steward has to decide
 * whether it is right. That decision is only possible if the proposal shows its reasoning, so every
 * inference here is rendered with the *because* beside it — "typed it as amount, the name reads as a
 * monetary amount", "a page may not group by it, grouping by string would produce about one bucket per
 * row". A review screen that showed only conclusions would be a screen where the only available action
 * is to trust it.
 *
 * ── AND WHY REFUSALS ARE AS PROMINENT AS RESULTS ─────────────────────────────────────────
 * Two tables of this Opus EDM schema cannot become entities, five columns hold personal data, one
 * foreign key points outside the scan, and three columns have no honest business type. All of that is on
 * the screen at the same size as the ten entities that worked. A scan reported as "10 entities found" is
 * a scan whose gaps a steward discovers later, from a page that does not work.
 *
 * ── AND THE BANNER IS NOT DECORATION ────────────────────────────────────────────────────
 * A scan is either a real connection to a real database through the backend, or the same pipeline run in
 * this browser over a built-in schema. Those are materially different claims and the screen leads with
 * which one it is making. Everything below the banner looks identical either way — which is the point of
 * the port, and exactly why the difference has to be stated rather than inferred.
 */

import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  signal,
} from '@angular/core';
import { FormsModule } from '@angular/forms';
import { IconComponent, ListPanelComponent, type ListPanelItem } from '@opus/design-system';
import type {
  AuthMode,
  DraftEntity,
  EditContext,
  FieldChange,
  SourceEdit,
  SourceKind,
} from '@opus/catalog-ingest';
import { SOURCE_KINDS } from '@opus/catalog-ingest';

import { AUTHOR } from '../session';
import { CatalogService } from '@opus/catalog';

import type { EditableSource } from './ingest-api';
import { IngestService, type SourceState } from './ingest.service';

interface RegisterForm {
  name: string;
  kind: SourceKind;
  host: string;
  port: number;
  database: string;
  auth: 'integrated' | 'sqlLogin' | 'managedIdentity';
  username: string;
  /** Which of the two credential routes the steward chose. Explicit, never inferred. */
  credential: 'password' | 'secretRef';
  secretRef: string;
  password: string;
  /** Comma separated as typed; split when the form is read. */
  schemas: string;
  encrypt: boolean;
  trustServerCertificate: boolean;
}

/**
 * The edit form's fields — deliberately not `RegisterForm`.
 *
 * Three of that type's fields have no meaning here and sharing it would put all three on the screen:
 * `kind` cannot change, and `credential`/`password` belong to the credential route. A form that renders
 * a disabled password box beside an edit is a form that invites somebody to type a password into
 * something that will not store it.
 */
interface EditForm {
  name: string;
  host: string;
  port: number | null;
  database: string;
  auth: AuthMode;
  username: string;
  secretRef: string;
  /** Comma separated as typed, like the register form. */
  schemas: string;
  encrypt: boolean;
  trustServerCertificate: boolean;
}

/**
 * An edit in progress.
 *
 * ── WHY THE FORM IS NULLABLE, AND THE SESSION IS NOT ────────────────────────────────────
 * Because entering edit mode and having the values to edit are two different events, and the first
 * must not wait for the second. The first version created this whole object only *after* the fetch
 * succeeded, so a failed fetch left the screen exactly as it was — an Edit button that visibly did
 * nothing, which is precisely how it was reported.
 *
 * Now the click opens the pane immediately and the pane says which of three states it is in: waiting
 * for the values, holding them, or unable to read them and saying why. A button whose only failure
 * mode is silence is indistinguishable from a button that is not wired up.
 *
 * `context` is held beside the form because the check needs both: whether a SQL login still has a
 * credential depends on what the source holds *today*, not only on what has been typed.
 */
interface EditSession {
  id: string;
  /** From the roster, so the heading names the source before anything has loaded. */
  name: string;
  /**
   * Carried on the session rather than read back from the selection.
   *
   * The retry needs it, and by then the selection is whatever the user has since clicked — a retry
   * that reached across to the currently-selected source would attribute one record's provenance to
   * another's edit.
   */
  registeredBy: string;
  /** Null while loading, and if the load failed. */
  form: EditForm | null;
  context: EditContext | null;
  /** True when a promoted scan exists, so a material change has a baseline to cost. */
  hasBaseline: boolean;
  revisions: EditableSource['revisions'];
  /** Why the current values could not be read. Rendered in place of the form, with a retry. */
  loadError: string | null;
}

@Component({
  selector: 'opus-sources',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [FormsModule, IconComponent, ListPanelComponent],
  template: `
    <div class="src">
      <!--
        Said once, at the top, before anything that looks like a result.

        Three different claims, and the difference between them matters more than anything else on the
        screen: a scan that appears to have read a production database and did not is the worst thing
        this surface could imply. So the transport is rendered, not logged.
      -->
      @switch (ingest.mode()) {
        @case ('connecting') {
          <p class="src-note">
            <opus-icon name="server" [size]="14" />
            <span>Checking whether the catalog service is available…</span>
          </p>
        }
        @case ('api') {
          <p class="src-note live">
            <opus-icon name="server" [size]="14" />
            <span>
              <b>Live.</b> Every scan below opens a real connection: the backend resolves the source's
              secret, connects with the <code>mssql</code> driver and runs the introspection SQL against
              the server. Nothing about the schema is simulated, and nothing is written — the scanner
              issues SELECT only.
            </span>
          </p>
        }
        @case ('forbidden') {
          <p class="src-note warn">
            <opus-icon name="shield" [size]="14" />
            <span>{{ ingest.refusal() }}</span>
          </p>
        }
        @case ('fixture') {
          <!--
            A development build with no API. The fixture is named, the diagnostic is the server's, and the
            fix is a command — because the previous version asserted "the backend is not running", which
            is a guess and is wrong for most of the ways this fails.
          -->
          <p class="src-note warn">
            <opus-icon name="warning" [size]="14" />
            <span>
              <b>No catalog service, so this is reading a built-in schema.</b>
              {{ ingest.unreachable()?.detail }}
              Nothing below has touched a database. Run <code>npm run demo</code> for a live scan — this
              substitution happens only in a development build.
              <button type="button" class="opus-btn sm src-retry" (click)="ingest.connect()">
                <opus-icon name="refresh" [size]="13" />
                Try again
              </button>
            </span>
          </p>
        }
        @default {
          <!--
            A production build with no API. No fixture, no scan, and the cause rather than a conclusion.
          -->
          <p class="src-note error">
            <opus-icon name="warning" [size]="14" />
            <span>
              <b>The catalog service is unavailable.</b>
              {{ ingest.unreachable()?.detail }}
              @if (ingest.unreachable(); as failure) {
                <span class="src-diag">
                  <code>{{ failure.url }}</code>
                  @if (failure.httpStatus) {
                    <span class="src-chip warn">HTTP {{ failure.httpStatus }}</span>
                  }
                  <span class="src-chip">{{ failure.reason }}</span>
                </span>
              }
              <button type="button" class="opus-btn sm src-retry" (click)="ingest.connect()">
                <opus-icon name="refresh" [size]="13" />
                Try again
              </button>
            </span>
          </p>
        }
      }

      @if (ingest.mode() === 'unavailable' || ingest.mode() === 'forbidden') {
        <!--
          No roster, no form, no scan button. A screen that offered "Register a source" while unable to
          reach the service that stores registrations would be a screen whose buttons lie.
        -->
        <p class="src-lead src-blocked">
          Registering a source, scanning it and publishing a catalog all happen in the catalog service.
          Until it is reachable there is nothing this screen can do.
          <a href="https://github.com/vgiattino/Experience-Studio/blob/main/docs/CATALOG-INGESTION.md">
            Deployment notes
          </a>
        </p>
      } @else {
      <div class="src-body">
        <div class="src-list">
          <opus-list-panel
            title="Sources"
            placeholder="Filter sources…"
            emptyText="No source is registered."
            [items]="listItems()"
            [selectedId]="ingest.selectedId()"
            (pick)="onPick($event)"
          />
          <button
            type="button"
            class="opus-btn sm"
            (click)="registering() ? registering.set(false) : openRegisterForm()"
          >
            <opus-icon [name]="registering() ? 'close' : 'plus'" [size]="14" />
            {{ registering() ? 'Cancel' : 'Register a source' }}
          </button>
        </div>

        <section class="src-detail">
          @if (editing(); as session) {
            <h2 class="src-h2">Edit {{ session.name }}</h2>
            <!--
              What an edit is for, and what it deliberately is not.

              Said here rather than in a tooltip because the two exclusions are the two things somebody
              opening this screen is most likely to be looking for: the dialect, and the password.
            -->
            <p class="src-lead">
              Where this source points and what it is allowed to read. The <b>kind</b> cannot change —
              the introspection SQL, the type mapping and the identifier quoting are all dialect
              specific, so a source that became another dialect would be a new registration, not this
              one renamed. The <b>password</b> does not change here either; that is its own act, on its
              own screen, and this form never carries one.
            </p>

            <!--
              Three states, and the pane says which. The click opens this immediately, so waiting and
              failing are both visible — a form that appeared only on success made every failure look
              like a button that was never wired up.
            -->
            @if (session.loadError; as detail) {
              <p class="src-problems src-problems-solo">{{ detail }}</p>
              <div class="src-actions">
                <button
                  type="button"
                  class="opus-btn primary"
                  (click)="loadEditValues(session.id, session.registeredBy)"
                >
                  <opus-icon name="refresh" [size]="14" />
                  Try again
                </button>
                <button type="button" class="opus-btn" (click)="cancelEdit()">
                  <opus-icon name="close" [size]="14" />
                  Cancel
                </button>
              </div>
            } @else if (session.form; as form) {
              <dl class="src-facts">
                <div>
                  <dt>Kind</dt>
                  <dd>{{ session.context?.kind }} — fixed at registration</dd>
                </div>
                <div>
                  <dt>Credential</dt>
                  <dd>
                    {{
                      session.context?.credential === 'managed'
                        ? 'a password this platform stores'
                        : session.context?.credential === 'reference'
                          ? 'a secret your deployment holds'
                          : 'none'
                    }}
                  </dd>
                </div>
                <div>
                  <dt>Baseline</dt>
                  <dd>
                    {{
                      session.hasBaseline
                        ? 'a promoted scan drift is measured against'
                        : 'none — nothing published yet to compare against'
                    }}
                  </dd>
                </div>
              </dl>

              <div class="src-form">
                <label class="opus-field">
                  <span class="opus-field-label">Name</span>
                  <input
                    class="opus-input"
                    [ngModel]="form.name"
                    (ngModelChange)="editField('name', $event)"
                  />
                  <span class="opus-field-help">A label. Changing it costs nothing.</span>
                </label>

                <label class="opus-field">
                  <span class="opus-field-label">Host</span>
                  <input
                    class="opus-input"
                    [ngModel]="form.host"
                    (ngModelChange)="editField('host', $event)"
                  />
                  <span class="opus-field-help">A name, an address, or HOST\\INSTANCE.</span>
                </label>

                <label class="opus-field">
                  <span class="opus-field-label">Port</span>
                  <input
                    class="opus-input"
                    type="number"
                    [ngModel]="form.port"
                    (ngModelChange)="editField('port', $event)"
                  />
                </label>

                <label class="opus-field">
                  <span class="opus-field-label">Database</span>
                  <input
                    class="opus-input"
                    [ngModel]="form.database"
                    (ngModelChange)="editField('database', $event)"
                  />
                </label>

                <label class="opus-field">
                  <span class="opus-field-label">Authentication</span>
                  <select
                    class="opus-select"
                    [ngModel]="form.auth"
                    (ngModelChange)="editField('auth', $event)"
                  >
                    <option value="integrated">Integrated — the host's own identity, no secret</option>
                    <option value="managedIdentity">Managed identity — resolved by the host</option>
                    <option value="sqlLogin">SQL login — a username and a password</option>
                  </select>
                  <span class="opus-field-help">
                    Moving away from a SQL login deletes the password this platform stored for it.
                  </span>
                </label>

                @if (form.auth === 'sqlLogin') {
                  <label class="opus-field">
                    <span class="opus-field-label">Username</span>
                    <input
                      class="opus-input"
                      [ngModel]="form.username"
                      (ngModelChange)="editField('username', $event)"
                      autocomplete="off"
                    />
                  </label>

                  <!--
                    Only the *reference* route is editable here, and the field says which case it is in.

                    A secret this platform wrote has a name this platform generated; showing it would
                    invite somebody to retype it into something else, and the useful action on it is to
                    store a new password rather than to rename it.
                  -->
                  <label class="opus-field">
                    <span class="opus-field-label">Secret name</span>
                    <input
                      class="opus-input"
                      [ngModel]="form.secretRef"
                      (ngModelChange)="editField('secretRef', $event)"
                      placeholder="kv/edm/reader"
                      autocomplete="off"
                    />
                    <span class="opus-field-help">
                      @if (session.context?.credential === 'managed') {
                        This source uses a password this platform stores, so this is blank. Naming a
                        secret here switches it to your deployment's store and deletes the stored
                        password.
                      } @else {
                        The name of a secret your deployment already holds — never the secret. Leave it
                        blank to leave this source without a credential until you set a password.
                      }
                    </span>
                  </label>
                }

                <label class="opus-field src-wide">
                  <span class="opus-field-label">Schemas to scan</span>
                  <input
                    class="opus-input"
                    [ngModel]="form.schemas"
                    (ngModelChange)="editField('schemas', $event)"
                    placeholder="dq, master, processing, vendor"
                  />
                  <span class="opus-field-help">Comma separated.</span>
                </label>

                <label class="src-check">
                  <input
                    type="checkbox"
                    [ngModel]="form.encrypt"
                    (ngModelChange)="editField('encrypt', $event)"
                  />
                  <span>Encrypt the transport</span>
                </label>
                <label class="src-check">
                  <input
                    type="checkbox"
                    [ngModel]="form.trustServerCertificate"
                    (ngModelChange)="editField('trustServerCertificate', $event)"
                  />
                  <span>Trust an unverified certificate</span>
                </label>
              </div>

              @if (editBlockedBy().length) {
                <ul class="src-problems">
                  @for (problem of editBlockedBy(); track problem.field + problem.message) {
                    <li>
                      <code>{{ problem.field }}</code>
                      {{ problem.message }}
                    </li>
                  }
                </ul>
              }
              @if (editRisks().length) {
                <ul class="src-problems accepted">
                  @for (problem of editRisks(); track problem.field + problem.message) {
                    <li>
                      <code>{{ problem.field }}</code>
                      {{ problem.message }}
                      <b>Saving records that you accepted this.</b>
                    </li>
                  }
                </ul>
              }

              <!--
                The second yes.

                Rendered as a question with the fields in it, not as an error: the edit is valid, and
                what the steward has not yet done is agree to what it costs. Listing the changes matters
                more than the sentence — "host, database" is the part that tells them whether they meant
                it.
              -->
              @if (editConfirm(); as confirmation) {
                <div class="src-confirm">
                  <h3 class="src-h3">
                    <opus-icon name="warning" [size]="15" />
                    This discards the drift baseline
                  </h3>
                  <ul class="src-changes">
                    @for (change of confirmation.changed; track change.field) {
                      <li>
                        <code>{{ change.field }}</code>
                        <span class="src-was">{{ change.from || '(none)' }}</span>
                        →
                        <b>{{ change.to || '(none)' }}</b>
                      </li>
                    }
                  </ul>
                  <p>{{ confirmation.detail }}</p>
                  <div class="src-actions">
                    <button type="button" class="opus-btn primary" (click)="saveEdit(true)">
                      <opus-icon name="check" [size]="14" />
                      Save and discard the baseline
                    </button>
                    <button type="button" class="opus-btn" (click)="editConfirm.set(null)">
                      <opus-icon name="close" [size]="14" />
                      Keep editing
                    </button>
                  </div>
                </div>
              }

              @if (editError(); as detail) {
                <p class="src-problems src-problems-solo">{{ detail }}</p>
              }

              @if (!editConfirm()) {
                <div class="src-actions">
                  <button
                    type="button"
                    class="opus-btn primary"
                    [disabled]="editBlockedBy().length > 0 || !!ingest.busy()"
                    (click)="saveEdit()"
                  >
                    <opus-icon name="check" [size]="14" />
                    Save
                  </button>
                  <button type="button" class="opus-btn" (click)="cancelEdit()">
                    <opus-icon name="close" [size]="14" />
                    Cancel
                  </button>
                </div>
              }

              <!--
                What has been changed before, and whether it cost a baseline.

                On the edit screen rather than the detail screen because this is where the question gets
                asked: "has anybody moved this source before" is what somebody about to move it wants to
                know.
              -->
              @if (session.revisions.length) {
                <h3 class="src-h3">Previous edits</h3>
                <ul class="src-revisions">
                  @for (revision of session.revisions; track revision.at) {
                    <li>
                      <span class="src-rev-when">{{ when(revision.at) }} · {{ revision.by }}</span>
                      <ul class="src-changes">
                        @for (change of revision.changed; track change.field) {
                          <li>
                            <code>{{ change.field }}</code>
                            <span class="src-was">{{ change.from || '(none)' }}</span>
                            →
                            <b>{{ change.to || '(none)' }}</b>
                          </li>
                        }
                      </ul>
                      @if (revision.baselineCleared) {
                        <span class="src-rev-note">The drift baseline was discarded by this edit.</span>
                      }
                    </li>
                  }
                </ul>
              }
            } @else {
              <p class="src-status">Reading this source's current values…</p>
            }
          } @else if (registering()) {
            <h2 class="src-h2">Register a source</h2>
            <!--
              Repeated here, because this is where somebody is standing when it matters.

              The banner at the top says the transport, but a steward filling in a form has scrolled past
              it and is looking at a disabled password option. Saying it again, next to the thing that is
              disabled because of it, is the difference between a diagnosis and a mystery.
            -->
            @if (ingest.mode() === 'fixture') {
              <p class="src-problems src-problems-solo">
                <b>No catalog service is answering</b>, so this form registers a source in the browser
                only — it cannot store a password and it cannot connect to a database. If the API is
                starting, give it a moment and
                <button type="button" class="opus-btn sm src-retry" (click)="ingest.connect()">
                  <opus-icon name="refresh" [size]="13" />
                  try again
                </button>
              </p>
            }
            <p class="src-lead">
              Two halves: what the source <b>is</b> — read by a reviewer, recorded in an audit log — and
              how the platform <b>authenticates</b> to it. The second never becomes part of the first. A
              password may travel from here to the catalog service, once; it does not travel back, and it
              is not stored on the registration. What is stored is the name of a secret, which is why this
              record can be logged, diffed and shown to a reviewer without any of those being a
              disclosure.
            </p>

            <div class="src-form">
              <label class="opus-field">
                <span class="opus-field-label">Name</span>
                <input
                  class="opus-input"
                  [ngModel]="form().name"
                  (ngModelChange)="edit('name', $event)"
                  placeholder="Opus EDM — production"
                />
                <span class="opus-field-help">What a steward calls it, not a host name.</span>
              </label>

              <label class="opus-field">
                <span class="opus-field-label">Kind</span>
                <select
                  class="opus-select"
                  [ngModel]="form().kind"
                  (ngModelChange)="edit('kind', $event)"
                >
                  @for (kind of kinds; track kind) {
                    <option [value]="kind">{{ kind }}{{ kind === 'mssql' ? '' : ' (no probe yet)' }}</option>
                  }
                </select>
                <span class="opus-field-help">
                  The introspection SQL, the type mapping and the identifier quoting are all
                  dialect-specific. MS SQL Server has a probe; the rest register and report it.
                </span>
              </label>

              <label class="opus-field">
                <span class="opus-field-label">Host</span>
                <input
                  class="opus-input"
                  [ngModel]="form().host"
                  (ngModelChange)="edit('host', $event)"
                  placeholder="sql-edm-prod-01"
                />
                <span class="opus-field-help">A name, an address, or HOST\\INSTANCE.</span>
              </label>

              <label class="opus-field">
                <span class="opus-field-label">Port</span>
                <input
                  class="opus-input"
                  type="number"
                  [ngModel]="form().port"
                  (ngModelChange)="edit('port', $event)"
                  placeholder="1433"
                />
              </label>

              <label class="opus-field">
                <span class="opus-field-label">Database</span>
                <input
                  class="opus-input"
                  [ngModel]="form().database"
                  (ngModelChange)="edit('database', $event)"
                  placeholder="OpusEDM"
                />
              </label>

              <label class="opus-field">
                <span class="opus-field-label">Authentication</span>
                <select
                  class="opus-select"
                  [ngModel]="form().auth"
                  (ngModelChange)="edit('auth', $event)"
                >
                  <option value="integrated">Integrated — the host's own identity, no secret</option>
                  <option value="managedIdentity">Managed identity — resolved by the host</option>
                  <option value="sqlLogin">SQL login — a username and a password</option>
                </select>
              </label>

              @if (form().auth === 'sqlLogin') {
                <label class="opus-field">
                  <span class="opus-field-label">Username</span>
                  <input
                    class="opus-input"
                    [ngModel]="form().username"
                    (ngModelChange)="edit('username', $event)"
                    placeholder="edm_reader"
                    autocomplete="off"
                  />
                </label>

                <!--
                  Two ways to give the credential, and the choice is explicit rather than inferred from
                  which box has text in it. Inferring it means a steward who fills in both gets whichever
                  the code happens to prefer — and a wrong credential against a production account locks
                  it out, so the ambiguity is refused rather than resolved.
                -->
                <div class="opus-field src-wide">
                  <span class="opus-field-label">Credential</span>
                  <div class="src-choice">
                    <label class="src-check" [class.unavailable]="!ingest.canStorePassword()">
                      <input
                        type="radio"
                        name="credential"
                        [checked]="form().credential === 'password'"
                        [disabled]="!ingest.canStorePassword()"
                        (change)="edit('credential', 'password')"
                      />
                      <span>Type the password</span>
                      <!--
                        The reason sits on the control, not only under it.

                        A radio that is merely disabled reads as a broken form — which is exactly how
                        this was reported. Six words here turn "it does not work" into "it is not
                        configured", and the full explanation is still below.
                      -->
                      @if (!ingest.canStorePassword()) {
                        <span class="src-chip warn">not configured</span>
                      }
                    </label>
                    <label class="src-check">
                      <input
                        type="radio"
                        name="credential"
                        [checked]="form().credential === 'secretRef'"
                        (change)="edit('credential', 'secretRef')"
                      />
                      <span>Name a secret my deployment already holds</span>
                    </label>
                  </div>

                  <!--
                    Why the option is unavailable, once, under the choice it applies to.

                    Not only inside the password branch: after the fix the form opens on the *other*
                    route when this one is off, so a reason rendered only in the branch nobody is looking
                    at is a reason nobody reads — and the chip alone says "not configured" without saying
                    what to configure.
                  -->
                  @if (!ingest.canStorePassword() && ingest.passwordUnavailableReason(); as reason) {
                    <span class="opus-field-help src-why-not">{{ reason }}</span>
                  }

                  @if (form().credential === 'password') {
                    @if (ingest.canStorePassword()) {
                      <input
                        class="opus-input"
                        type="password"
                        [ngModel]="form().password"
                        (ngModelChange)="edit('password', $event)"
                        placeholder="the password for this login"
                        autocomplete="new-password"
                      />
                      <!--
                        Said where it is typed, not in a help centre. Somebody entering a production
                        credential into a browser is entitled to know exactly what becomes of it.
                      -->
                      <span class="opus-field-help">
                        Sent once to the catalog service, encrypted there with AES-256-GCM, and never
                        returned. The registration stores only the name of the stored secret, so nothing
                        that is logged, exported or shown to a reviewer contains it.
                      </span>
                    } @else {
                      <p class="src-problems src-problems-solo">
                        {{ ingest.passwordUnavailableReason() }}
                      </p>
                    }
                  } @else {
                    <input
                      class="opus-input"
                      [ngModel]="form().secretRef"
                      (ngModelChange)="edit('secretRef', $event)"
                      placeholder="kv/edm/reader"
                      autocomplete="off"
                    />
                    <span class="opus-field-help">
                      The name of the secret, not the password. The platform resolves it on every scan, so
                      rotating it in your own store takes effect without touching this registration.
                    </span>
                  }
                </div>
              }

              <label class="opus-field src-wide">
                <span class="opus-field-label">Schemas to scan</span>
                <input
                  class="opus-input"
                  [ngModel]="form().schemas"
                  (ngModelChange)="edit('schemas', $event)"
                  placeholder="dq, master, processing, vendor"
                />
                <span class="opus-field-help">
                  Comma separated. Scanning everything a login can see finds system catalogs and other
                  applications' tables, and a steward then rejects them one at a time.
                </span>
              </label>

              <label class="src-check">
                <input
                  type="checkbox"
                  [ngModel]="form().encrypt"
                  (ngModelChange)="edit('encrypt', $event)"
                />
                <span>Encrypt the transport</span>
              </label>
              <label class="src-check">
                <input
                  type="checkbox"
                  [ngModel]="form().trustServerCertificate"
                  (ngModelChange)="edit('trustServerCertificate', $event)"
                />
                <span>Trust an unverified certificate</span>
              </label>
            </div>

            <!--
              Blocked and accepted, told apart.

              A malformed host is a mistake and stops the form; an unverified certificate is a risk with
              an owner. Rendering both the same way meant the button stayed disabled on a judgement the
              steward was entitled to make — which made a development instance impossible to register
              using a message that said it was acceptable.
            -->
            @if (blockedBy().length) {
              <ul class="src-problems">
                @for (problem of blockedBy(); track problem.field + problem.message) {
                  <li>
                    <code>{{ problem.field }}</code>
                    {{ problem.message }}
                  </li>
                }
              </ul>
            }
            @if (acceptedRisks().length) {
              <ul class="src-problems accepted">
                @for (problem of acceptedRisks(); track problem.field + problem.message) {
                  <li>
                    <code>{{ problem.field }}</code>
                    {{ problem.message }}
                    <b>Registering records that you accepted this.</b>
                  </li>
                }
              </ul>
            }

            @if (submitError(); as detail) {
              <p class="src-problems src-problems-solo">{{ detail }}</p>
            }

            <div class="src-actions">
              <button
                type="button"
                class="opus-btn primary"
                [disabled]="blockedBy().length > 0"
                (click)="submit()"
              >
                <opus-icon name="check" [size]="14" />
                Register
              </button>
            </div>
          } @else if (ingest.selected(); as state) {
            <!--
              What the last save changed, once, on the record it changed.

              A form that closes silently leaves the steward to compare the facts panel against their
              memory of what they typed — and the one edit worth being certain about is the one that
              discarded the baseline, which is invisible everywhere else on this screen.
            -->
            @if (editSaved(); as saved) {
              <div class="src-saved">
                <opus-icon name="check" [size]="14" />
                <span>
                  @if (saved.changed.length) {
                    Saved:
                    @for (change of saved.changed; track change.field) {
                      <code>{{ change.field }}</code>
                    }
                    @if (saved.baselineCleared) {
                      <b>
                        The drift baseline was discarded — scan and publish again to establish a new
                        one.
                      </b>
                    }
                  } @else {
                    Nothing changed, so nothing was saved.
                  }
                </span>
                <button type="button" class="opus-btn sm" (click)="editSaved.set(null)">
                  <opus-icon name="close" [size]="13" />
                  Dismiss
                </button>
              </div>
            }

            <div class="src-detail-h">
              <h2 class="src-h2">{{ state.summary.name }}</h2>
              <span class="src-chip">{{ state.summary.kind }}</span>
              @if (!state.summary.scannable) {
                <span class="src-chip warn">no probe yet</span>
              }
              <span class="src-chip">read only</span>
            </div>

            <dl class="src-facts">
              <div>
                <dt>Target</dt>
                <dd>{{ state.summary.target }}</dd>
              </div>
              <div>
                <dt>Authentication</dt>
                <dd>{{ state.summary.auth }}</dd>
              </div>
              <div>
                <dt>Schemas</dt>
                <dd>{{ state.summary.schemas.join(', ') }}</dd>
              </div>
              <div>
                <dt>Transport</dt>
                <dd>
                  {{ state.summary.encrypt ? 'encrypted' : 'CLEAR TEXT' }}
                  {{ state.summary.trustServerCertificate ? ', certificate unverified' : '' }}
                </dd>
              </div>
              <div>
                <dt>Registered by</dt>
                <dd>{{ state.summary.registeredBy }}</dd>
              </div>
              <!--
                Shown beside the registrar rather than instead of it. "Who brought this database in" and
                "who last changed where it points" are different questions, and a reviewer looking at a
                source registered against a development instance needs to see that somebody has since
                aimed it somewhere else.
              -->
              @if (state.summary.updatedBy) {
                <div>
                  <dt>Last edited by</dt>
                  <dd>{{ state.summary.updatedBy }} · {{ when(state.summary.updatedAt) }}</dd>
                </div>
              }
              @if (state.reached) {
                <div>
                  <dt>Reached</dt>
                  <dd>{{ state.reached.serverVersion }}</dd>
                </div>
              }
            </dl>

            <!--
              Risks the registering steward accepted, shown on the record rather than only at the moment
              of registering. Six months later "why is this registered with certificate checking off" has
              an answer, and it is here beside who registered it.
            -->
            @if (state.summary.acknowledged.length) {
              <ul class="src-warnings">
                @for (field of state.summary.acknowledged; track field) {
                  <li>
                    <opus-icon name="warning" [size]="13" />
                    <span>
                      <code>{{ field }}</code> — accepted by {{ state.summary.registeredBy }} when this
                      source was registered.
                    </span>
                  </li>
                }
              </ul>
            }

            <div class="src-actions">
              <button
                type="button"
                class="opus-btn primary"
                [disabled]="!!scanBlockedBecause(state)"
                [title]="scanBlockedBecause(state) ?? 'Read the schema from this source'"
                (click)="ingest.scan(sample())"
              >
                <opus-icon name="refresh" [size]="14" />
                {{ state.schema ? 'Re-scan' : 'Scan' }}
              </button>
              <!--
                A disabled button says why, beside itself.

                The same fault as a disabled radio with the reason two clicks away: "Scan is greyed out"
                and "this source's kind has no probe" are the same pixel and completely different
                problems, and only one of them is something the reader can fix.
              -->
              @if (scanBlockedBecause(state); as reason) {
                <span class="opus-field-help src-inline-help">{{ reason }}</span>
              }
              <!--
                Editing is offered in both modes, unlike Test and the credential form.

                Those two need a network; changing where a registration points does not. Hiding it in
                browser-only mode would make the screen untestable without a database for no reason
                other than symmetry with the buttons beside it.
              -->
              <button
                type="button"
                class="opus-btn"
                [disabled]="!!ingest.busy()"
                title="Change where this source points and what it may read"
                (click)="openEditForm()"
              >
                <opus-icon name="edit" [size]="14" />
                Edit
              </button>
              @if (ingest.mode() === 'api') {
                <button
                  type="button"
                  class="opus-btn"
                  [disabled]="!!ingest.busy()"
                  (click)="ingest.test()"
                >
                  <opus-icon name="check" [size]="14" />
                  Test the connection
                </button>
                <!--
                  Set or change, one button, because they are the same act on the same route — and a
                  source can now arrive at "SQL login with no credential" by being edited, which is a
                  state the old "only if a managed password exists" condition gave no way out of.

                  A credential held in the deployment's own store is absent from this entirely: it is
                  rotated there, and the platform resolves the reference on every scan.
                -->
                @if (credentialAction(state); as action) {
                  <button
                    type="button"
                    class="opus-btn"
                    [disabled]="!!ingest.busy()"
                    (click)="rotating.set(!rotating())"
                  >
                    <opus-icon [name]="rotating() ? 'close' : 'shield'" [size]="14" />
                    {{ rotating() ? 'Cancel' : action === 'set' ? 'Set a password' : 'Change the password' }}
                  </button>
                }
              }
              <label class="src-check">
                <input type="checkbox" [ngModel]="sample()" (ngModelChange)="sample.set($event)" />
                <span>Sample values to find code lists</span>
              </label>
              <span class="opus-field-help src-inline-help">
                The one part of a scan that reads data rather than metadata, so it is off unless you ask.
              </span>
            </div>

            @if (rotating()) {
              <div class="src-rotate">
                <label class="opus-field">
                  <span class="opus-field-label">
                    {{ credentialAction(state) === 'set' ? 'Password' : 'New password' }}
                  </span>
                  <input
                    class="opus-input"
                    type="password"
                    [ngModel]="newPassword()"
                    (ngModelChange)="newPassword.set($event)"
                    autocomplete="new-password"
                  />
                  <span class="opus-field-help">
                    @if (credentialAction(state) === 'set') {
                      This source has no credential — an edit changed its authentication, or it was
                      registered without one. Storing a password here gives it one and unblocks the scan.
                    } @else {
                      Replaces the stored secret. Any pooled connection is dropped, so the next scan
                      proves the new password rather than continuing on the old one until it idles out.
                    }
                  </span>
                </label>
                <button
                  type="button"
                  class="opus-btn primary"
                  [disabled]="!newPassword().trim() || !!ingest.busy()"
                  (click)="rotate(state.summary.id)"
                >
                  <opus-icon name="check" [size]="14" />
                  Store it
                </button>
              </div>
            }

            @if (ingest.busy(); as busy) {
              <p class="src-status">{{ busy }}</p>
            }
            @if (ingest.problem(); as problem) {
              <p class="src-problems src-problems-solo">{{ problem }}</p>
            }

            @if (state.schema; as schema) {
              <h3 class="src-h3">
                What the scan found
                <span class="src-count">{{ schema.tables.length }} objects</span>
              </h3>
              <dl class="src-facts">
                <div>
                  <dt>Server</dt>
                  <dd>{{ schema.serverVersion ?? 'unreported' }}</dd>
                </div>
                <div>
                  <dt>Scanned at</dt>
                  <dd>{{ schema.scannedAt }}</dd>
                </div>
                <div>
                  <dt>Tables</dt>
                  <dd>{{ tableCount() }}</dd>
                </div>
                <div>
                  <dt>Views</dt>
                  <dd>{{ viewCount() }}</dd>
                </div>
              </dl>

              @if (schema.warnings.length) {
                <ul class="src-warnings">
                  @for (warning of schema.warnings; track warning) {
                    <li><opus-icon name="warning" [size]="13" />{{ warning }}</li>
                  }
                </ul>
              }
            }

            @if (state.draft; as draft) {
              @if (blocking().length) {
                <h3 class="src-h3">
                  Cannot become entities
                  <span class="src-count warn">{{ blocking().length }}</span>
                </h3>
                <ul class="src-warnings">
                  @for (problem of blocking(); track problem.subject) {
                    <li>
                      <opus-icon name="warning" [size]="13" />
                      <span><code>{{ problem.subject }}</code> — {{ problem.message }}</span>
                    </li>
                  }
                </ul>
              }

              <h3 class="src-h3">
                Proposed vocabulary
                <span class="src-count">{{ includedCount() }} of {{ draft.entities.length }} included</span>
              </h3>
              <p class="src-lead">
                Nothing here is in the catalog yet. Everything promotable starts included so this is a
                list to remove from rather than a form to fill in — but the promotion is a separate act,
                and what it does with each decision is shown when you make it.
              </p>

              <div class="src-entities">
                @for (entity of draft.entities; track entity.ref) {
                  <article class="src-entity" [class.out]="!isIncluded(entity.ref)">
                    <header (click)="toggleOpen(entity.ref)">
                      <label class="src-check" (click)="$event.stopPropagation()">
                        <input
                          type="checkbox"
                          [ngModel]="isIncluded(entity.ref)"
                          (ngModelChange)="ingest.setEntityIncluded(entity.ref, $event)"
                        />
                      </label>
                      <div class="src-entity-name">
                        <b>{{ entity.pluralName }}</b>
                        <code>{{ entity.ref }}</code>
                      </div>
                      <span class="src-chip">
                        {{ entity.attributes.length }}
                        {{ entity.attributes.length === 1 ? 'attribute' : 'attributes' }}
                      </span>
                      <span class="src-chip">
                        {{ entity.measures.length }}
                        {{ entity.measures.length === 1 ? 'measure' : 'measures' }}
                      </span>
                      <!--
                        The row count on the collapsed row, not only in the detail.

                        It is the fact that explains the two chips beside it: "needs a filter" and the
                        cost class are computed from it, so showing the conclusion without the number
                        makes them look like settings rather than measurements.
                      -->
                      @if (entity.approxRows !== undefined) {
                        <span class="src-chip">~{{ entity.approxRows.toLocaleString() }} rows</span>
                      }
                      @if (entity.requiresFilter) {
                        <span class="src-chip warn">needs a filter</span>
                      }
                      <span class="src-chip">{{ entity.costClass }} cost</span>
                      @if (personalIn(entity).length) {
                        <span class="src-chip warn">
                          {{ personalIn(entity).length }} personal
                        </span>
                      }
                      <opus-icon [name]="open().has(entity.ref) ? 'chevron-up' : 'chevron-down'" [size]="14" />
                    </header>

                    @if (open().has(entity.ref)) {
                      <div class="src-entity-body">
                        <dl class="src-facts">
                          <div>
                            <dt>Physical table</dt>
                            <dd>{{ entity.physicalTable }}</dd>
                          </div>
                          <div>
                            <dt>Identified by</dt>
                            <dd>{{ entity.primaryKey.join(', ') }}</dd>
                          </div>
                          <div>
                            <dt>Labelled by</dt>
                            <dd>{{ entity.labelAttribute ?? 'the key' }}</dd>
                          </div>
                          <div>
                            <dt>Estimated rows</dt>
                            <dd>{{ entity.approxRows ? entity.approxRows.toLocaleString() : 'unknown' }}</dd>
                          </div>
                        </dl>

                        <label class="opus-field src-entitlement">
                          <span class="opus-field-label">Row entitlement</span>
                          <input
                            class="opus-input"
                            [ngModel]="rowEntitlement(entity.ref)"
                            (ngModelChange)="ingest.setRowEntitlement(entity.ref, $event)"
                            [placeholder]="entity.domain + '.read'"
                          />
                          <span class="opus-field-help">
                            The capability a caller needs to see these rows. Left blank, one is derived
                            from the domain — because an absent entitlement means everyone.
                          </span>
                        </label>

                        @if (entity.decisions.length) {
                          <ul class="src-decisions">
                            @for (decision of entity.decisions; track decision.what) {
                              <li>
                                <b>{{ decision.what }}</b>
                                <span>— {{ decision.because }}</span>
                                <span class="src-conf {{ decision.confidence }}">{{ decision.confidence }}</span>
                              </li>
                            }
                          </ul>
                        }

                        <h4 class="src-h4">Attributes</h4>
                        <div class="src-scroll">
                          <table class="src-table">
                            <thead>
                              <tr>
                                <th class="src-tick">In</th>
                                <th>Attribute</th>
                                <th>Type</th>
                                <th>A page may</th>
                                <th>Because</th>
                              </tr>
                            </thead>
                            <tbody>
                              @for (attribute of entity.attributes; track attribute.id) {
                                <tr [class.out]="!isAttributeIncluded(entity.ref, attribute.id)">
                                  <td class="src-tick">
                                    <input
                                      type="checkbox"
                                      [ngModel]="isAttributeIncluded(entity.ref, attribute.id)"
                                      (ngModelChange)="
                                        ingest.setAttributeIncluded(entity.ref, attribute.id, $event)
                                      "
                                    />
                                  </td>
                                  <td>
                                    <b>{{ attribute.businessName }}</b>
                                    <code>{{ attribute.physicalRef }}</code>
                                  </td>
                                  <td class="src-nowrap">
                                    {{ attribute.dataType }}
                                    @if (attribute.semanticType) {
                                      <span class="src-chip">{{ attribute.semanticType }}</span>
                                    }
                                    @if (attribute.enumValues?.length) {
                                      <span class="src-chip">
                                        {{ attribute.enumValues!.length }} values
                                      </span>
                                    }
                                  </td>
                                  <td class="src-nowrap">
                                    @for (verb of verbs(attribute); track verb) {
                                      <span class="src-verb">{{ verb }}</span>
                                    }
                                  </td>
                                  <td>
                                    @for (decision of attribute.decisions; track decision.what) {
                                      <span class="src-why">{{ decision.because }}</span>
                                    }
                                    @if (attribute.suspectedPersonal) {
                                      <!--
                                        Editable here rather than in a separate governance screen: the
                                        promotion refuses this column without an entitlement, so the
                                        field that unblocks it belongs beside the reason it is blocked.
                                      -->
                                      <input
                                        class="opus-input src-cap"
                                        [ngModel]="entitlement(entity.ref, attribute.id)"
                                        (ngModelChange)="
                                          ingest.setEntitlement(entity.ref, attribute.id, $event)
                                        "
                                        placeholder="capability to see it, e.g. edm.customer.pii.read"
                                      />
                                    }
                                  </td>
                                </tr>
                              }
                            </tbody>
                          </table>
                        </div>

                        @if (entity.skipped.length) {
                          <h4 class="src-h4">Columns left out</h4>
                          <ul class="src-warnings">
                            @for (skip of entity.skipped; track skip.column) {
                              <li>
                                <opus-icon name="warning" [size]="13" />
                                <span><code>{{ skip.column }}</code> — {{ skip.reason }}</span>
                              </li>
                            }
                          </ul>
                        }

                        <h4 class="src-h4">Measures</h4>
                        <div class="src-scroll">
                          <table class="src-table">
                            <thead>
                              <tr>
                                <th class="src-tick">In</th>
                                <th>Measure</th>
                                <th>Aggregations</th>
                                <th>Because</th>
                              </tr>
                            </thead>
                            <tbody>
                              @for (measure of entity.measures; track measure.id) {
                                <tr [class.out]="!isMeasureIncluded(entity.ref, measure.id)">
                                  <td class="src-tick">
                                    <input
                                      type="checkbox"
                                      [ngModel]="isMeasureIncluded(entity.ref, measure.id)"
                                      (ngModelChange)="
                                        ingest.setMeasureIncluded(entity.ref, measure.id, $event)
                                      "
                                    />
                                  </td>
                                  <td>
                                    <b>{{ measure.businessName }}</b>
                                    <code>{{ measure.physicalRef ?? 'a row count' }}</code>
                                  </td>
                                  <td class="src-nowrap">
                                    @for (option of measure.allowedAggregations; track option) {
                                      <span class="src-verb" [class.on]="option === measure.defaultAggregation">
                                        {{ option }}
                                      </span>
                                    }
                                  </td>
                                  <td>
                                    @for (decision of measure.decisions; track decision.what) {
                                      <span class="src-why">{{ decision.because }}</span>
                                    }
                                  </td>
                                </tr>
                              }
                            </tbody>
                          </table>
                        </div>
                      </div>
                    }
                  </article>
                }
              </div>

              @if (draft.relationships.length) {
                <h3 class="src-h3">
                  Relationships
                  <span class="src-count">{{ draft.relationships.length }}</span>
                </h3>
                <ul class="src-rels">
                  @for (relationship of draft.relationships; track relationship.id) {
                    <li>
                      <b>{{ relationship.businessName }}</b>
                      <code>{{ relationship.from }}</code>
                      <span>→</span>
                      <code>{{ relationship.to }}</code>
                      <span class="src-chip">{{ relationship.cardinality }}</span>
                    </li>
                  }
                </ul>
                <p class="opus-field-help">
                  Read from declared foreign keys only. A column named like a reference with no
                  constraint behind it is not a relationship — the server checks a constraint and does
                  not check a name.
                </p>
              }

              @if (warnings().length) {
                <h3 class="src-h3">Worth knowing</h3>
                <ul class="src-warnings">
                  @for (problem of warnings(); track problem.subject + problem.message) {
                    <li>
                      <opus-icon name="info" [size]="13" />
                      <span><code>{{ problem.subject }}</code> — {{ problem.message }}</span>
                    </li>
                  }
                </ul>
              }

              <div class="src-actions src-promote">
                <button type="button" class="opus-btn primary" (click)="ingest.promoteSelected(sample())">
                  <opus-icon name="check" [size]="14" />
                  Publish {{ includedCount() }} entities to the catalog
                </button>
                <span class="opus-field-help src-inline-help">
                  Merges into the published catalog — nothing another source contributed is touched.
                </span>
              </div>
            }

            @if (state.promotion; as promotion) {
              <h3 class="src-h3">
                Published
                <span class="src-count ok">
                  {{ promotion.counts.entities }} entities · {{ promotion.counts.attributes }} attributes ·
                  {{ promotion.counts.measures }} measures · {{ promotion.counts.relationships }}
                  relationships
                </span>
              </h3>
              <p class="src-lead">
                Live: the builder's entity picker, the AI's grounding and the validator all read this
                catalog, so the next page built can bind to what was just published.
              </p>
              <!--
                Said here because otherwise the next click is confusing.

                A steward publishes ten entities, opens Vocabulary and sees none of them — because each
                one requires a row entitlement nobody has been granted yet. That is the design working,
                and it looks exactly like the publish having failed. The sentence turns a mystery into a
                next step.
              -->
              <p class="src-lead">
                <b>{{ visibleNow() }} of {{ promotion.counts.entities }}</b> appear in Vocabulary for
                {{ author.displayName }} right now. The rest require a row entitlement nobody holds yet —
                which is what an entitlement is for, and why none of them was left blank. Grant the
                capabilities listed below, and they appear.
              </p>
              <!--
                Derived entitlements, summarised.

                Ten entities produce ten notes reading "no row entitlement was set, so X was derived",
                and printing all ten pushed the handful of refusals — the ones that need a decision —
                off the bottom of the section. One line, the distinct capabilities named.
              -->
              @if (derivedEntitlements().length) {
                <p class="src-lead">
                  <b>{{ derivedNoteCount() }} entities</b> had no row entitlement set, so one was derived
                  per domain: {{ derivedEntitlements().join(', ') }}. Grant these to see them.
                </p>
              }
              @if (notableNotes().length) {
                <ul class="src-warnings">
                  @for (note of notableNotes(); track note.subject + note.code) {
                    <li [class.refused]="note.kind === 'refused'">
                      <opus-icon [name]="note.kind === 'refused' ? 'warning' : 'info'" [size]="13" />
                      <span><code>{{ note.subject }}</code> — {{ note.message }}</span>
                    </li>
                  }
                </ul>
              }
            }

            @if (state.drift; as drift) {
              <h3 class="src-h3">
                Changed since the published scan
                <span class="src-count" [class.warn]="!drift.safe" [class.ok]="drift.safe">
                  {{ drift.counts.breaking }} breaking · {{ drift.counts.behavioural }} behavioural ·
                  {{ drift.counts.additive }} additive
                </span>
              </h3>
              @if (!drift.changes.length) {
                <p class="src-lead">Nothing changed.</p>
              } @else {
                <div class="src-scroll">
                  <table class="src-table">
                    <thead>
                      <tr>
                        <th>Where</th>
                        <th>What</th>
                        <th>Breaks</th>
                        <th>What to do</th>
                      </tr>
                    </thead>
                    <tbody>
                      @for (change of drift.changes; track change.subject + change.kind) {
                        <tr>
                          <td>
                            <b>{{ change.subject }}</b>
                            <code>{{ change.kind }}</code>
                          </td>
                          <td>{{ change.detail }}</td>
                          <td>
                            <span class="src-chip {{ change.severity }}">{{ change.severity }}</span>
                            @for (ref of change.affects; track ref) {
                              <code class="src-affects">{{ ref }}</code>
                            }
                          </td>
                          <td>{{ change.remedy }}</td>
                        </tr>
                      }
                    </tbody>
                  </table>
                </div>
              }
            }
          }
        </section>
      </div>
      }
    </div>
  `,
  styles: `
    :host {
      display: block;
      block-size: 100%;
      min-block-size: 0;
      overflow: hidden;
    }

    .src {
      display: flex;
      flex-direction: column;
      block-size: 100%;
      min-block-size: 0;
    }

    .src-note {
      display: flex;
      align-items: flex-start;
      gap: var(--opus-space-2);
      margin: 12px 20px;
      padding: 8px 11px;
      border-inline-start: 2px solid var(--opus-emphasis-info);
      background: var(--opus-emphasis-info-bg);
      font-size: var(--opus-text-xs);
      color: var(--opus-text-secondary);
      line-height: var(--opus-leading-normal);
      flex-shrink: 0;
    }

    .src-note.live {
      border-inline-start-color: var(--opus-emphasis-positive);
      background: var(--opus-emphasis-positive-bg);
    }

    .src-note.warn {
      border-inline-start-color: var(--opus-emphasis-warning);
      background: var(--opus-emphasis-warning-bg);
    }

    /* A stop, not a caution: nothing on this screen works until it is resolved. */
    .src-note.error {
      border-inline-start-color: var(--opus-emphasis-negative, var(--opus-emphasis-warning));
      background: var(--opus-emphasis-negative-bg, var(--opus-emphasis-warning-bg));
    }

    .src-retry {
      margin-inline-start: var(--opus-space-2);
      vertical-align: middle;
    }

    /* The URL and the failure kind, on their own line so the sentence above stays readable. */
    .src-diag {
      display: flex;
      align-items: center;
      gap: var(--opus-space-2);
      flex-wrap: wrap;
      margin-block-start: 6px;
    }

    /* The rotation form: one field and a button, inline rather than a dialogue. */
    .src-rotate {
      display: flex;
      align-items: flex-start;
      gap: var(--opus-space-3);
      flex-wrap: wrap;
      margin-block-start: var(--opus-space-4);
      padding: var(--opus-space-3);
      border: 1px solid var(--opus-border);
      border-radius: var(--opus-radius-md);
      background: var(--opus-surface);
      max-inline-size: 40rem;
    }

    .src-rotate .opus-field {
      flex: 1 1 18rem;
      margin-block-end: 0;
    }

    /*
      The baseline question, styled as a decision rather than as an error.

      The warning stripe is deliberately not reused: src-problems means "something is wrong", and this
      is a valid edit with a cost. Given its own block, with the changes listed inside it, so the thing
      being agreed to is on the screen next to the button that agrees.
    */
    .src-confirm {
      margin-block-start: var(--opus-space-4);
      padding: var(--opus-space-3) var(--opus-space-4);
      border: 1px solid var(--opus-emphasis-warning);
      border-radius: var(--opus-radius-md);
      background: var(--opus-emphasis-warning-bg);
      max-inline-size: 46rem;
    }

    .src-confirm .src-h3 {
      margin-block-start: 0;
    }

    .src-confirm p {
      margin: var(--opus-space-2) 0 0;
      font-size: var(--opus-text-xs);
      color: var(--opus-text-secondary);
      line-height: var(--opus-leading-normal);
    }

    .src-confirm .src-actions {
      margin-block-start: var(--opus-space-3);
    }

    /* from → to, one line per field. Monospace on the field so a list of them scans vertically. */
    .src-changes {
      margin: var(--opus-space-2) 0 0;
      padding: 0;
      list-style: none;
      font-size: var(--opus-text-xs);
      color: var(--opus-text-secondary);
    }

    .src-changes li {
      display: flex;
      align-items: baseline;
      flex-wrap: wrap;
      gap: var(--opus-space-2);
      padding: 3px 0;
    }

    .src-changes code {
      min-inline-size: 9rem;
      color: var(--opus-text);
    }

    /* The old value, visibly the past tense of the pair. */
    .src-was {
      text-decoration: line-through;
      color: var(--opus-text-muted);
    }

    .src-revisions {
      margin: var(--opus-space-2) 0 0;
      padding: 0;
      list-style: none;
      max-inline-size: 46rem;
    }

    .src-revisions > li {
      padding: var(--opus-space-3) 0;
      border-block-end: 1px solid var(--opus-border);
    }

    .src-revisions > li:last-child {
      border-block-end: 0;
    }

    .src-rev-when {
      font-size: var(--opus-text-xs);
      color: var(--opus-text-muted);
    }

    .src-rev-note {
      display: block;
      margin-block-start: var(--opus-space-2);
      font-size: var(--opus-text-xs);
      color: var(--opus-emphasis-warning);
    }

    /* Confirmation of a save, dismissible. Informational, so it takes the info emphasis. */
    .src-saved {
      display: flex;
      align-items: flex-start;
      gap: var(--opus-space-2);
      margin-block-end: var(--opus-space-3);
      padding: 8px 11px;
      border-inline-start: 2px solid var(--opus-emphasis-info);
      background: var(--opus-emphasis-info-bg);
      font-size: var(--opus-text-xs);
      color: var(--opus-text-secondary);
      line-height: var(--opus-leading-normal);
    }

    .src-saved code {
      margin-inline-end: var(--opus-space-2);
      color: var(--opus-text);
    }

    .src-saved b {
      display: block;
      margin-block-start: 4px;
      color: var(--opus-text);
    }

    .src-saved .opus-btn {
      margin-inline-start: auto;
      flex-shrink: 0;
    }

    .src-blocked {
      margin: 0 20px;
      padding-block: var(--opus-space-4);
    }

    .src-note code {
      font-family: var(--opus-font-mono);
    }

    .src-note .opus-icon {
      flex-shrink: 0;
      margin-block-start: 1px;
    }

    .src-body {
      flex: 1;
      min-block-size: 0;
      display: grid;
      grid-template-columns: 260px minmax(0, 1fr);
      border-block-start: 1px solid var(--opus-border);
      overflow: hidden;
    }

    .src-list {
      display: flex;
      flex-direction: column;
      min-block-size: 0;
      border-inline-end: 1px solid var(--opus-border);
      background: var(--opus-surface);
    }

    .src-list opus-list-panel {
      flex: 1;
      min-block-size: 0;
      overflow: hidden;
    }

    .src-list > .opus-btn {
      margin: 8px 10px 10px;
      justify-content: center;
    }

    .src-detail {
      overflow-y: auto;
      padding: 16px 20px 40px;
      min-inline-size: 0;
    }

    .src-detail-h {
      display: flex;
      align-items: baseline;
      gap: var(--opus-space-2);
      flex-wrap: wrap;
    }

    .src-h2 {
      margin: 0;
      font-size: var(--opus-text-lg);
      font-weight: var(--opus-weight-semibold);
      color: var(--opus-text);
    }

    .src-h3 {
      display: flex;
      align-items: center;
      gap: var(--opus-space-2);
      flex-wrap: wrap;
      margin: 24px 0 8px;
      font-size: var(--opus-text-md);
      font-weight: var(--opus-weight-semibold);
      color: var(--opus-text);
    }

    .src-h4 {
      margin: 14px 0 6px;
      font-size: var(--opus-text-sm);
      font-weight: var(--opus-weight-semibold);
      color: var(--opus-text-secondary);
      text-transform: uppercase;
      letter-spacing: 0.05em;
    }

    .src-lead {
      margin: 6px 0 0;
      font-size: var(--opus-text-sm);
      color: var(--opus-text-secondary);
      line-height: var(--opus-leading-normal);
      max-inline-size: 60rem;
    }

    .src-count {
      padding: 1px 7px;
      border-radius: 999px;
      background: var(--opus-accent-soft);
      color: var(--opus-accent);
      font-size: 10px;
      font-weight: var(--opus-weight-semibold);
    }

    .src-count.warn {
      background: var(--opus-emphasis-warning-bg);
      color: var(--opus-emphasis-warning);
    }

    .src-count.ok {
      background: var(--opus-emphasis-positive-bg);
      color: var(--opus-emphasis-positive);
    }

    code {
      font-family: var(--opus-font-mono);
      font-size: var(--opus-text-xs);
      color: var(--opus-text-muted);
    }

    .src-chip {
      padding: 1px 6px;
      border-radius: 999px;
      background: var(--opus-emphasis-muted-bg);
      color: var(--opus-text-secondary);
      font-size: 10px;
      font-weight: var(--opus-weight-medium);
      white-space: nowrap;
    }

    .src-chip.warn,
    .src-chip.breaking {
      background: var(--opus-emphasis-warning-bg);
      color: var(--opus-emphasis-warning);
    }

    .src-chip.behavioural {
      background: var(--opus-emphasis-info-bg);
      color: var(--opus-emphasis-info);
    }

    .src-chip.additive {
      background: var(--opus-emphasis-positive-bg);
      color: var(--opus-emphasis-positive);
    }

    .src-facts {
      display: flex;
      gap: var(--opus-space-5);
      flex-wrap: wrap;
      margin: 12px 0 0;
    }

    .src-facts dt {
      font-size: 10px;
      font-weight: var(--opus-weight-semibold);
      text-transform: uppercase;
      letter-spacing: 0.06em;
      color: var(--opus-text-muted);
    }

    .src-facts dd {
      margin: 2px 0 0;
      font-size: var(--opus-text-sm);
      color: var(--opus-text);
      font-family: var(--opus-font-mono);
    }

    /* Two columns of fields, so eleven of them are a form rather than a scroll. */
    .src-form {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(15rem, 1fr));
      gap: 0 var(--opus-space-4);
      margin-block-start: var(--opus-space-4);
      max-inline-size: 56rem;
    }

    .src-wide {
      grid-column: 1 / -1;
    }

    /* The reason an option is unavailable: present, and not competing with the field that is. */
    .src-why-not {
      display: block;
      margin-block-end: 6px;
    }

    /* An option that is present but not available: legible, and visibly not a live control. */
    .src-check.unavailable {
      opacity: 0.65;
      cursor: not-allowed;
    }

    /* The two credential routes, side by side above the field they choose between. */
    .src-choice {
      display: flex;
      gap: var(--opus-space-4);
      flex-wrap: wrap;
      margin-block-end: 6px;
    }

    .src-choice .src-check {
      margin-block-end: 0;
    }

    .src-check {
      display: inline-flex;
      align-items: center;
      gap: 6px;
      font-size: var(--opus-text-sm);
      color: var(--opus-text-secondary);
      margin-block-end: var(--opus-space-3);
      cursor: pointer;
    }

    .src-actions {
      display: flex;
      align-items: center;
      gap: var(--opus-space-3);
      flex-wrap: wrap;
      margin-block-start: var(--opus-space-4);
    }

    .src-actions .src-check {
      margin-block-end: 0;
    }

    .src-inline-help {
      flex: 1 1 14rem;
      min-inline-size: 0;
    }

    .src-promote {
      margin-block-start: var(--opus-space-5);
      padding-block-start: var(--opus-space-4);
      border-block-start: 1px solid var(--opus-border);
    }

    .src-status {
      margin: var(--opus-space-3) 0 0;
      font-size: var(--opus-text-sm);
      color: var(--opus-text-muted);
    }

    .src-problems {
      margin: var(--opus-space-3) 0 0;
      padding: 8px 11px 8px 28px;
      border-inline-start: 2px solid var(--opus-emphasis-warning);
      background: var(--opus-emphasis-warning-bg);
      font-size: var(--opus-text-xs);
      color: var(--opus-text-secondary);
      line-height: var(--opus-leading-normal);
    }

    /* A risk, not a mistake: informational rather than the warning stripe used for a blocked field. */
    .src-problems.accepted {
      border-inline-start-color: var(--opus-emphasis-info);
      background: var(--opus-emphasis-info-bg);
    }

    .src-problems.accepted b {
      color: var(--opus-text);
    }

    .src-problems-solo {
      padding-inline-start: 11px;
    }

    .src-warnings {
      margin: var(--opus-space-2) 0 0;
      padding: 0;
      list-style: none;
    }

    .src-warnings li {
      display: flex;
      align-items: flex-start;
      gap: var(--opus-space-2);
      padding: 5px 0;
      border-block-end: 1px solid var(--opus-border);
      font-size: var(--opus-text-xs);
      color: var(--opus-text-secondary);
      line-height: var(--opus-leading-normal);
    }

    .src-warnings li:last-child {
      border-block-end: 0;
    }

    .src-warnings .opus-icon {
      flex-shrink: 0;
      margin-block-start: 2px;
      color: var(--opus-emphasis-warning);
    }

    .src-warnings li.refused {
      color: var(--opus-text);
    }

    .src-entities {
      display: flex;
      flex-direction: column;
      gap: var(--opus-space-2);
      margin-block-start: var(--opus-space-3);
    }

    .src-entity {
      border: 1px solid var(--opus-border);
      border-radius: var(--opus-radius-md);
      background: var(--opus-surface);
      overflow: hidden;
    }

    /* Excluded, not hidden: a steward has to be able to see what they took out. */
    .src-entity.out {
      opacity: 0.55;
    }

    .src-entity > header {
      display: flex;
      align-items: center;
      gap: var(--opus-space-2);
      padding: 8px 10px;
      cursor: pointer;
      flex-wrap: wrap;
    }

    .src-entity > header:hover {
      background: var(--opus-surface-hover);
    }

    .src-entity > header .src-check {
      margin-block-end: 0;
    }

    .src-entity-name {
      flex: 1 1 12rem;
      min-inline-size: 0;
      display: flex;
      flex-direction: column;
    }

    .src-entity-name b {
      font-size: var(--opus-text-md);
      font-weight: var(--opus-weight-medium);
      color: var(--opus-text);
    }

    .src-entity-body {
      padding: 4px 12px 14px;
      border-block-start: 1px solid var(--opus-border);
    }

    .src-entitlement {
      max-inline-size: 28rem;
      margin-block-start: var(--opus-space-4);
    }

    .src-decisions {
      margin: var(--opus-space-3) 0 0;
      padding: 0;
      list-style: none;
    }

    .src-decisions li {
      display: flex;
      align-items: baseline;
      gap: 6px;
      flex-wrap: wrap;
      font-size: var(--opus-text-xs);
      color: var(--opus-text-muted);
      padding: 2px 0;
    }

    .src-decisions b {
      color: var(--opus-text-secondary);
      font-weight: var(--opus-weight-medium);
    }

    /* Confidence, so a guess does not read like a fact. */
    .src-conf {
      padding: 0 5px;
      border-radius: 999px;
      font-size: 9px;
      text-transform: uppercase;
      letter-spacing: 0.05em;
      background: var(--opus-emphasis-muted-bg);
      color: var(--opus-text-muted);
    }

    .src-conf.guess {
      background: var(--opus-emphasis-warning-bg);
      color: var(--opus-emphasis-warning);
    }

    .src-scroll {
      overflow-x: auto;
      border: 1px solid var(--opus-border);
      border-radius: var(--opus-radius-md);
      background: var(--opus-canvas);
    }

    .src-table {
      inline-size: 100%;
      border-collapse: collapse;
      font-size: var(--opus-text-sm);
    }

    .src-table th {
      text-align: start;
      padding: 6px 9px;
      border-block-end: 1px solid var(--opus-border);
      font-size: 10px;
      font-weight: var(--opus-weight-semibold);
      text-transform: uppercase;
      letter-spacing: 0.06em;
      color: var(--opus-text-muted);
      white-space: nowrap;
    }

    .src-table td {
      padding: 6px 9px;
      border-block-end: 1px solid var(--opus-border);
      color: var(--opus-text-secondary);
      vertical-align: top;
      line-height: var(--opus-leading-normal);
    }

    .src-table tr:last-child td {
      border-block-end: 0;
    }

    .src-table tr.out {
      opacity: 0.5;
    }

    .src-table b {
      display: block;
      color: var(--opus-text);
      font-weight: var(--opus-weight-medium);
    }

    .src-tick {
      inline-size: 2.2rem;
      text-align: center;
    }

    .src-nowrap {
      white-space: nowrap;
    }

    .src-verb {
      display: inline-block;
      padding: 0 5px;
      margin-inline-end: 3px;
      border: 1px solid var(--opus-border-strong);
      border-radius: 3px;
      font-family: var(--opus-font-mono);
      font-size: 10px;
      color: var(--opus-text-secondary);
    }

    .src-verb.on {
      border-color: var(--opus-accent);
      background: var(--opus-accent-soft);
      color: var(--opus-accent);
      font-weight: var(--opus-weight-semibold);
    }

    /* The reason, one per line, so several reasons read as several reasons. */
    .src-why {
      display: block;
      font-size: var(--opus-text-xs);
      color: var(--opus-text-muted);
      line-height: var(--opus-leading-normal);
    }

    .src-cap {
      margin-block-start: 4px;
      font-size: var(--opus-text-xs);
      padding: 3px 6px;
      min-inline-size: 16rem;
    }

    .src-affects {
      display: block;
    }

    .src-rels {
      margin: var(--opus-space-2) 0 0;
      padding: 0;
      list-style: none;
      font-size: var(--opus-text-sm);
    }

    .src-rels li {
      display: flex;
      align-items: baseline;
      gap: var(--opus-space-2);
      flex-wrap: wrap;
      padding: 3px 0;
      color: var(--opus-text-secondary);
    }

    .src-rels b {
      color: var(--opus-text);
      font-weight: var(--opus-weight-medium);
    }

    @media (max-width: 900px) {
      .src-body {
        grid-template-columns: minmax(0, 1fr);
      }

      .src-list {
        border-inline-end: 0;
        border-block-end: 1px solid var(--opus-border);
        max-block-size: 14rem;
      }
    }
  `,
})
export class SourcesComponent {
  protected readonly ingest = inject(IngestService);
  private readonly catalog = inject(CatalogService);

  protected readonly author = AUTHOR;
  protected readonly kinds: readonly SourceKind[] = SOURCE_KINDS;
  protected readonly registering = signal(false);
  protected readonly rotating = signal(false);
  /**
   * The new password, while it is being typed.
   *
   * Cleared the moment it is submitted, successfully or not. A component field is not a secret store,
   * and a value left on one outlives the form: it survives a tab switch, and it is in a heap snapshot.
   */
  protected readonly newPassword = signal('');
  protected readonly sample = signal(false);
  protected readonly open = signal(new Set<string>());

  /**
   * The register form, as a signal.
   *
   * A signal rather than a plain object because the form *is* observed: `formProblems` is a computed
   * over it, and a computed cannot depend on a mutated object. Held as a plain object first, the
   * validation ran once at first render and never again — so the problems stayed frozen at "give the
   * source a name" while the steward filled the form in, and Register was permanently disabled.
   */
  protected readonly form = signal<RegisterForm>({
    name: '',
    kind: 'mssql',
    host: '',
    port: 1433,
    database: '',
    auth: 'integrated',
    username: '',
    credential: 'password',
    secretRef: '',
    password: '',
    schemas: '',
    encrypt: true,
    trustServerCertificate: false,
  });

  protected edit<K extends keyof RegisterForm>(key: K, value: RegisterForm[K]): void {
    this.form.update((form) => ({ ...form, [key]: value }));
  }

  protected readonly listItems = computed<ListPanelItem[]>(() =>
    this.ingest.sources().map((state) => ({
      id: state.summary.id,
      label: state.summary.name,
      hint: state.stage === 'promoted' ? 'published' : state.stage === 'scanned' ? 'in review' : 'not scanned',
      icon: 'database',
    })),
  );

  protected readonly blocking = computed(
    () => this.ingest.selected()?.draft?.problems.filter((problem) => problem.severity === 'blocking') ?? [],
  );

  protected readonly warnings = computed(
    () => this.ingest.selected()?.draft?.problems.filter((problem) => problem.severity === 'warning') ?? [],
  );

  protected readonly tableCount = computed(
    () => this.ingest.selected()?.schema?.tables.filter((table) => !table.isView).length ?? 0,
  );

  protected readonly viewCount = computed(
    () => this.ingest.selected()?.schema?.tables.filter((table) => table.isView).length ?? 0,
  );

  protected readonly includedCount = computed(() => {
    const decisions = this.ingest.selected()?.decisions;
    if (!decisions) return 0;
    return Object.values(decisions.entities).filter((entity) => entity.include).length;
  });

  /**
   * How many of the entities this promotion published this author can actually see.
   *
   * The server answers it over the API, because only that process holds both the catalog and the
   * caller's capabilities. In fixture mode the browser holds the promoted catalog itself and can count.
   */
  protected readonly visibleNow = computed(() => {
    const state = this.ingest.selected();
    const promotion = state?.promotion;
    if (!promotion) return 0;
    if ('visible' in promotion && typeof promotion.visible === 'number') return promotion.visible;

    const stored = this.catalog.stored();
    const held = new Set(AUTHOR.capabilities);
    return Object.values(stored?.entities ?? {}).filter(
      (entity) =>
        entity.physical?.sourceId === state!.summary.id &&
        (!entity.rowEntitlementDomain || held.has(entity.rowEntitlementDomain)),
    ).length;
  });

  private readonly notes = computed(() => this.ingest.selected()?.promotion?.notes ?? []);

  /** Everything except the derived-entitlement notes, which are summarised in one line above. */
  protected readonly notableNotes = computed(() =>
    this.notes().filter((note) => note.code !== 'entitlement-derived'),
  );

  protected readonly derivedNoteCount = computed(
    () => this.notes().filter((note) => note.code === 'entitlement-derived').length,
  );

  /** The distinct capabilities that were derived — usually one per schema, not one per entity. */
  protected readonly derivedEntitlements = computed(() => {
    const found = new Set<string>();
    for (const note of this.notes()) {
      if (note.code !== 'entitlement-derived') continue;
      const quoted = /"([^"]+)"/.exec(note.message);
      if (quoted) found.add(quoted[1]!);
    }
    return [...found].sort();
  });

  /** The register form's problems, live. The same function the server calls before storing. */
  protected readonly formProblems = computed(() =>
    this.registering() ? this.ingest.check(this.asRegistration()) : [],
  );

  /** What stops the registration. Only these disable the button. */
  protected readonly blockedBy = computed(() =>
    this.formProblems().filter((problem) => problem.severity === 'blocking'),
  );

  /** Risks the steward is allowed to accept, and which the registration will record. */
  protected readonly acceptedRisks = computed(() =>
    this.formProblems().filter((problem) => problem.severity === 'warning'),
  );

  /** The form as the pipeline wants it: schemas split, blanks as undefined. One place, used twice. */
  private asRegistration() {
    const form = this.form();
    return {
      name: form.name,
      kind: form.kind,
      host: form.host,
      port: Number(form.port) || undefined,
      database: form.database,
      auth: form.auth,
      username: form.username || undefined,
      // Exactly one, decided by the radio rather than by which field has content.
      secretRef: form.credential === 'secretRef' ? form.secretRef || undefined : undefined,
      password: form.credential === 'password' ? form.password || undefined : undefined,
      schemas: form.schemas
        .split(',')
        .map((schema) => schema.trim())
        .filter(Boolean),
      encrypt: form.encrypt,
      trustServerCertificate: form.trustServerCertificate,
      registeredBy: AUTHOR.displayName,
    };
  }

  /**
   * Why Scan cannot run, or nothing.
   *
   * One function rather than a condition in the template, because the button's disabled state and the
   * sentence explaining it must never disagree — and they will if they are written twice.
   */
  protected scanBlockedBecause(state: SourceState): string | null {
    if (this.ingest.busy()) return this.ingest.busy();
    if (!state.summary.scannable) {
      return `This platform has no probe for ${state.summary.kind} yet, so its schema cannot be read. MS SQL Server is the dialect implemented today.`;
    }
    if (state.summary.auth === 'sqlLogin' && state.summary.credential === 'none') {
      return 'This source has no credential. Register it again with a password, or with the name of a secret.';
    }
    return null;
  }

  protected async rotate(id: string): Promise<void> {
    const password = this.newPassword();
    // Cleared before the await, not after: an in-flight request must not leave it recoverable if the
    // component is destroyed while waiting.
    this.newPassword.set('');
    const failure = await this.ingest.rotateCredential(id, { password });
    if (failure) {
      this.ingest.problem.set(failure);
      return;
    }
    this.rotating.set(false);
  }

  // ── editing a registration ───────────────────────────────────────────────────────────

  protected readonly editing = signal<EditSession | null>(null);
  protected readonly editError = signal<string | null>(null);
  /** The server's question, when an edit would discard the drift baseline. Not an error. */
  protected readonly editConfirm = signal<{ detail: string; changed: FieldChange[] } | null>(null);
  /** What a save actually changed, shown once afterwards so the steward can see it landed. */
  protected readonly editSaved = signal<{ changed: FieldChange[]; baselineCleared: boolean } | null>(null);

  protected editField<K extends keyof EditForm>(key: K, value: EditForm[K]): void {
    this.editing.update((session) =>
      session?.form ? { ...session, form: { ...session.form, [key]: value } } : session,
    );
    /*
      Any keystroke retracts the confirmation.

      Otherwise a steward answers "yes, discard the baseline" about one set of changes, then edits the
      host again, and the second save goes through on the first answer — consent to a change they were
      never shown.
    */
    this.editConfirm.set(null);
  }

  /** The edit form as the pipeline wants it. The counterpart of `asRegistration`. */
  private asEdit(form: EditForm): SourceEdit {
    return {
      name: form.name,
      host: form.host,
      port: form.port === null || Number.isNaN(form.port) ? undefined : Number(form.port),
      database: form.database,
      auth: form.auth,
      username: form.auth === 'sqlLogin' ? form.username || undefined : undefined,
      secretRef: form.auth === 'sqlLogin' ? form.secretRef || undefined : undefined,
      schemas: form.schemas
        .split(',')
        .map((schema) => schema.trim())
        .filter(Boolean),
      encrypt: form.encrypt,
      trustServerCertificate: form.trustServerCertificate,
    };
  }

  /** The edit's problems, live — the same function the server runs before storing. */
  protected readonly editProblems = computed(() => {
    const session = this.editing();
    if (!session?.form || !session.context) return [];
    return this.ingest.checkEdit(session.context, this.asEdit(session.form));
  });

  protected readonly editBlockedBy = computed(() =>
    this.editProblems().filter((problem) => problem.severity === 'blocking'),
  );

  protected readonly editRisks = computed(() =>
    this.editProblems().filter((problem) => problem.severity === 'warning'),
  );

  /**
   * Open the edit form on the current values.
   *
   * The values are fetched rather than read from the roster, because the roster is redacted:
   * `host:port/database` is one string there and the username is absent entirely. A form built from it
   * would open with blanks in three fields and write those blanks back on save — which is how an edit
   * screen silently erases a registration.
   */
  protected async openEditForm(): Promise<void> {
    const state = this.ingest.selected();
    if (!state) return;

    this.editError.set(null);
    this.editConfirm.set(null);
    this.editSaved.set(null);

    /*
      Edit mode opens *now*, before the request.

      This is the fix for the button that did nothing. The pane is what tells the user their click was
      received, and gating it on a round trip means every way that round trip can fail — an API that
      predates the screen, a proxy, a dropped connection — presents as an inert button.
    */
    this.editing.set({
      id: state.summary.id,
      name: state.summary.name,
      registeredBy: state.summary.registeredBy,
      form: null,
      context: null,
      hasBaseline: false,
      revisions: [],
      loadError: null,
    });

    await this.loadEditValues(state.summary.id, state.summary.registeredBy);
  }

  /** Fetch the current values into the open session. Also the retry, which is why it is separate. */
  protected async loadEditValues(id: string, registeredBy: string): Promise<void> {
    this.editing.update((session) => (session ? { ...session, loadError: null } : session));

    const loaded = await this.ingest.loadEditable(id);

    this.editing.update((session) => {
      // The user may have cancelled or switched source while this was in flight; that decision wins.
      if (!session || session.id !== id) return session;
      if (loaded.status === 'failed') return { ...session, form: null, loadError: loaded.detail };

      const { editable } = loaded.value;
      return {
        ...session,
        loadError: null,
        context: { kind: editable.kind, credential: editable.credential, registeredBy },
        hasBaseline: loaded.value.hasBaseline,
        revisions: loaded.value.revisions,
        form: {
          name: editable.name,
          host: editable.host,
          port: editable.port ?? null,
          database: editable.database,
          auth: editable.auth,
          username: editable.username ?? '',
          secretRef: editable.secretRef ?? '',
          schemas: editable.schemas.join(', '),
          encrypt: editable.encrypt,
          trustServerCertificate: editable.trustServerCertificate,
        },
      };
    });
  }

  /**
   * A timestamp as a business analyst reads one.
   *
   * The record holds ISO 8601 because that is what an audit trail should store — sortable, unambiguous,
   * timezone-explicit. That is not what belongs on the screen: "2026-08-07T21:57:16.478Z" beside a
   * person's name reads as a machine field somebody forgot to format, on a product whose audience is
   * explicitly not developers. Rendered in the author's own locale and zone, so "when" is a question
   * they can answer without doing arithmetic.
   */
  protected when(iso: string | undefined): string {
    if (!iso) return '';
    const at = new Date(iso);
    if (Number.isNaN(at.getTime())) return iso;
    return at.toLocaleString(AUTHOR.locale, {
      dateStyle: 'medium',
      timeStyle: 'short',
      timeZone: AUTHOR.timezone,
    });
  }

  protected cancelEdit(): void {
    this.editing.set(null);
    this.editConfirm.set(null);
    this.editError.set(null);
  }

  /**
   * Save, or surface the question the server asked.
   *
   * `confirm` is passed straight through rather than remembered on the component: the server decides
   * whether a second yes is needed, on each request, from the baseline it holds — so a stale flag here
   * can never authorise a reset the steward was not shown.
   */
  protected async saveEdit(confirm = false): Promise<void> {
    const session = this.editing();
    if (!session?.form) return;

    this.editError.set(null);
    const outcome = await this.ingest.updateSource(session.id, this.asEdit(session.form), confirm);

    if (outcome.status === 'needs-confirmation') {
      this.editConfirm.set({ detail: outcome.detail, changed: outcome.changed });
      return;
    }
    if (outcome.status === 'failed') {
      this.editError.set(outcome.detail);
      return;
    }

    this.editSaved.set({ changed: outcome.changed, baselineCleared: outcome.baselineCleared });
    this.editing.set(null);
    this.editConfirm.set(null);
  }

  /**
   * Whether the credential form should be offered, and as what.
   *
   * Widened from "a managed password exists" to "a SQL login without one is possible", because the edit
   * form can now create exactly that state: switching a source from integrated auth to a SQL login
   * leaves it with no credential, and under the old condition the button that sets one was hidden —
   * so the screen offered a transition it then gave no way to complete.
   */
  protected credentialAction(state: SourceState): 'set' | 'change' | null {
    if (this.ingest.mode() !== 'api') return null;
    if (state.summary.auth !== 'sqlLogin') return null;
    // A reference into the deployment's own store is rotated there; this platform resolves it each scan.
    if (state.summary.credential === 'reference') return null;
    if (!this.ingest.canStorePassword()) return null;
    return state.summary.credential === 'managed' ? 'change' : 'set';
  }

  /**
   * Open the register form on a credential route that is available.
   *
   * The form used to initialise to `password` unconditionally, so on a platform with no encryption key
   * it opened with that option checked *and* disabled — a state the user cannot act on and cannot leave
   * by clicking the thing that looks selected. Which is precisely how it was reported: "the type
   * password field is not working."
   */
  protected openRegisterForm(): void {
    this.form.update((form) => ({
      ...form,
      credential: this.ingest.canStorePassword() ? 'password' : 'secretRef',
    }));
    this.cancelEdit();
    this.registering.set(true);
  }

  protected onPick(id: string): void {
    this.registering.set(false);
    // Abandoned rather than carried across: an edit form holding one source's host over another
    // source's record is a save waiting to point the wrong registration at the wrong database.
    this.cancelEdit();
    this.editSaved.set(null);
    this.ingest.selectedId.set(id);
  }

  /** The server's refusal, when it had one. Registration is a round trip now, so it can fail. */
  protected readonly submitError = signal<string | null>(null);

  protected async submit(): Promise<void> {
    /*
      Awaited, which the first version of this was not.

      `register` returns a promise since it became a request, so `if (!this.ingest.register(...))` tested
      a promise for truthiness — always true — and the form neither closed on success nor showed the
      server's message on failure. It looked like a button that did nothing.
    */
    const problem = await this.ingest.register(this.asRegistration());
    this.submitError.set(problem);
    if (!problem) this.registering.set(false);
  }

  protected toggleOpen(ref: string): void {
    this.open.update((open) => {
      const next = new Set(open);
      if (!next.delete(ref)) next.add(ref);
      return next;
    });
  }

  protected isIncluded(ref: string): boolean {
    return this.ingest.selected()?.decisions?.entities[ref]?.include ?? false;
  }

  protected isAttributeIncluded(entityRef: string, id: string): boolean {
    return this.ingest.selected()?.decisions?.entities[entityRef]?.attributes[id]?.include ?? false;
  }

  protected isMeasureIncluded(entityRef: string, id: string): boolean {
    return this.ingest.selected()?.decisions?.entities[entityRef]?.measures[id]?.include ?? false;
  }

  protected entitlement(entityRef: string, id: string): string {
    return this.ingest.selected()?.decisions?.entities[entityRef]?.attributes[id]?.columnEntitlement ?? '';
  }

  protected rowEntitlement(entityRef: string): string {
    return this.ingest.selected()?.decisions?.entities[entityRef]?.rowEntitlementDomain ?? '';
  }

  protected personalIn(entity: DraftEntity): readonly string[] {
    return entity.attributes.filter((attribute) => attribute.suspectedPersonal).map((a) => a.id);
  }

  /** What a page may do with the attribute, as verbs. "groupable: false" is a fact; "group" is the answer. */
  protected verbs(attribute: DraftEntity['attributes'][number]): string[] {
    return [
      attribute.groupable ? 'group' : '',
      attribute.filterable ? 'filter' : '',
      attribute.sortable ? 'sort' : '',
      attribute.searchable ? 'search' : '',
    ].filter(Boolean);
  }
}
