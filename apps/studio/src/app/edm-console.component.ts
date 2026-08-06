/**
 * The Opus EDM console prototype, hosted inside the page builder for comparison.
 *
 * ── WHY AN IFRAME, WHICH IS NORMALLY THE WRONG ANSWER ─────────────────────────────────
 * The prototype is a React application with a 122 KB global stylesheet that sets `--magenta`,
 * `--ink`, `--bg` on `:root` and resets `body`. Rendered into this document it would fight the
 * platform's own tokens in both directions — its variables would leak into the builder's chrome, and
 * the builder's reset would break its layout. A same-origin iframe gives it its own document, its own
 * CSS scope and its own React root, for the cost of one frame. It is also honest about what this is:
 * *another application*, shown next to ours, not a feature of ours.
 *
 * ── WHY THE SESSION IS SEEDED ─────────────────────────────────────────────────────────
 * The prototype's own root component reads `opus.session.user` from localStorage and, when it finds
 * one, skips its email → login → first-run-setup wizard: "Skip directly to app if already authed via
 * Angular". That escape hatch exists for exactly this embedding, so the host uses it rather than
 * asking someone comparing two products to fill in a login form first.
 *
 * There is no authentication here and nothing behind it — every screen in the prototype is seeded mock
 * data. Writing these keys grants access to nothing. Same origin is what makes it possible at all, and
 * is also why the frame is sandboxed no further than it needs to be.
 *
 * ── WHAT THIS DELIBERATELY DOES NOT DO ────────────────────────────────────────────────
 * It does not talk to the frame, and the frame does not talk back. No postMessage bridge, no shared
 * state, no navigation sync. A comparison harness that started exchanging messages with the thing it
 * is comparing would become a dependency on another product's internals, at which point deleting it
 * stops being free — and deleting it should stay free.
 */

import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { DomSanitizer, type SafeResourceUrl } from '@angular/platform-browser';
import { IconComponent } from '@opus/design-system';

/** Where the vendored copy lives, relative to the app's base href. See its PROVENANCE.md. */
const CONSOLE_URL = 'edm-console/index.html';

/** The prototype's own keys. Values are its own shapes, read from `app.jsx` and `screens/setup.jsx`. */
const SESSION_KEY = 'opus.session.user';
const SETUP_KEY = 'opus.setup.complete';

@Component({
  selector: 'opus-edm-console',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [IconComponent],
  template: `
    <div class="console">
      <p class="note" role="note">
        <opus-icon name="info" [size]="15" />
        <span>
          <strong>The Opus EDM console prototype</strong>, vendored at
          <code>fea3616</code> and shown here for comparison — this is another application in a frame,
          not part of Experience Studio. Every screen is seeded mock data.
        </span>
        <span class="spacer"></span>
        <a class="opus-btn sm" [href]="url()" target="_blank" rel="noopener">
          <opus-icon name="library" [size]="13" [weight]="2" />
          Open in its own tab
        </a>
        <button type="button" class="opus-btn sm" (click)="reload()" title="Reload the frame">
          <opus-icon name="revert" [size]="13" [weight]="2" />
          Reload
        </button>
      </p>

      <!--
        A title attribute rather than aria-label: a frame's accessible name comes from its title, and
        a screen-reader user tabbing into an embedded application needs to be told which one it is.
      -->
      <iframe
        [src]="safeUrl"
        [attr.data-reload]="reloads()"
        title="Opus EDM console prototype"
        loading="lazy"
      ></iframe>
    </div>
  `,
  styles: `
    :host {
      display: block;
      block-size: 100%;
      min-block-size: 0;
    }

    .console {
      display: flex;
      flex-direction: column;
      block-size: 100%;
      min-block-size: 0;
    }

    .note {
      display: flex;
      align-items: center;
      gap: var(--opus-space-2);
      margin: 0;
      padding: 8px 16px;
      border-block-end: 1px solid var(--opus-border);
      background: var(--opus-surface-sunken);
      font-size: var(--opus-text-sm);
      color: var(--opus-text-secondary);
      flex-shrink: 0;
      flex-wrap: wrap;
    }

    .note strong {
      color: var(--opus-text);
    }

    .note code {
      font-family: var(--opus-font-mono);
      font-size: var(--opus-text-xs);
    }

    .note .spacer {
      flex: 1;
    }

    .note .opus-btn {
      text-decoration: none;
    }

    iframe {
      flex: 1;
      min-block-size: 0;
      inline-size: 100%;
      border: 0;
      /* Its own background, so a light frame inside a dark builder does not flash the canvas colour. */
      background: #fff;
    }

    @media (max-width: 700px) {
      .note {
        font-size: var(--opus-text-xs);
      }
    }
  `,
})
export class EdmConsoleComponent {
  private readonly sanitizer = inject(DomSanitizer);

  protected readonly url = signal(CONSOLE_URL);
  /**
   * Bumped to force the frame to reload.
   *
   * An attribute change rather than re-setting `src`: assigning the same URL does not reliably
   * re-navigate a frame, and a "Reload" button that sometimes does nothing is worse than none.
   */
  protected readonly reloads = signal(0);

  /**
   * A constant URL under our own origin, so the bypass is not reachable from any input.
   *
   * Angular refuses an unsanitised resource URL on an iframe `src` — correctly, since that sink can
   * load anything. The value here is a compile-time constant pointing at a vendored directory; there
   * is no path by which caller data becomes part of it.
   */
  protected readonly safeUrl: SafeResourceUrl;

  constructor() {
    this.seedSession();
    this.safeUrl = this.sanitizer.bypassSecurityTrustResourceUrl(CONSOLE_URL);
  }

  protected reload(): void {
    this.reloads.update((n) => n + 1);
    const frame = document.querySelector<HTMLIFrameElement>('opus-edm-console iframe');
    // `location.reload()` on the frame's own window, which re-runs its Babel compilation too.
    frame?.contentWindow?.location.reload();
  }

  /**
   * Seed the prototype's session so it opens on the console.
   *
   * Written before the frame is created, because its root component reads these once at module
   * evaluation. Failures are swallowed: a blocked localStorage means the visitor sees the prototype's
   * own login screen, which is a degraded experience rather than a broken one.
   */
  private seedSession(): void {
    try {
      if (!localStorage.getItem(SESSION_KEY)) {
        localStorage.setItem(
          SESSION_KEY,
          JSON.stringify({
            name: 'Priya Raman',
            email: 'priya.raman@demo-tenant',
            initials: 'PR',
          }),
        );
      }
      localStorage.setItem(SETUP_KEY, 'true');
    } catch {
      // Ignored — see above.
    }
  }
}
