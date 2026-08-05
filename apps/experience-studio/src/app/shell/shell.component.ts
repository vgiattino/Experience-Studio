/**
 * The application shell: header, navigation, workspace.
 *
 * It owns chrome and nothing else. No screen's data, no screen's state, no knowledge of what a
 * dashboard is — the shell hosts a router outlet and the experiences arrive as metadata. That
 * separation is what makes the app's size independent of the number of experiences it can render.
 *
 * Two things in the header are there for a reason beyond decoration:
 *
 *  - **The persona switch.** Data authorization is a separate axis from platform authorization, and
 *    the only way to make that visible is to let a viewer change identity and watch widgets become
 *    `denied` while the page stays usable. It is the demo's most honest feature.
 *  - **The API and catalog status.** The app depends on a server; when it is not there, the shell says
 *    so and offers a retry rather than rendering an empty screen.
 */

import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatDividerModule } from '@angular/material/divider';
import { MatIconModule } from '@angular/material/icon';
import { MatListModule } from '@angular/material/list';
import { MatMenuModule } from '@angular/material/menu';
import { MatProgressBarModule } from '@angular/material/progress-bar';
import { MatSidenavModule } from '@angular/material/sidenav';
import { MatToolbarModule } from '@angular/material/toolbar';
import { MatTooltipModule } from '@angular/material/tooltip';
import { RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';

import { BootService } from '../boot.service';
import { ThemeService } from './theme.service';

@Component({
  selector: 'opus-root',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    RouterOutlet,
    RouterLink,
    RouterLinkActive,
    MatToolbarModule,
    MatSidenavModule,
    MatListModule,
    MatIconModule,
    MatButtonModule,
    MatMenuModule,
    MatTooltipModule,
    MatDividerModule,
    MatProgressBarModule,
  ],
  template: `
    <mat-toolbar class="topbar">
      <button
        mat-icon-button
        class="nav-toggle"
        [attr.aria-label]="navOpen() ? 'Hide navigation' : 'Show navigation'"
        (click)="navOpen.set(!navOpen())"
      >
        <mat-icon>menu</mat-icon>
      </button>

      <a class="brand" routerLink="/create">
        <span class="mark" aria-hidden="true">◈</span>
        <span class="brand-text">
          <span class="product">Opus Experience Studio</span>
          <span class="tagline">AI-native experiences over governed EDM data</span>
        </span>
      </a>

      <span class="spacer"></span>

      @if (boot.apiReachable() === true) {
        <span class="status ok" matTooltip="Catalog version pinned by every saved experience">
          <mat-icon inline>hub</mat-icon>
          catalog v{{ boot.catalogVersion() }}
        </span>
        <span class="status ok hide-sm" [matTooltip]="'Queries execute server-side: ' + boot.gatewayLabel()">
          <mat-icon inline>bolt</mat-icon>
          gateway
        </span>
      } @else if (boot.apiReachable() === false) {
        <button mat-button class="status bad" (click)="retry()">
          <mat-icon>cloud_off</mat-icon>
          API offline — retry
        </button>
      }

      <button
        mat-icon-button
        [matTooltip]="theme.label()"
        [attr.aria-label]="theme.label()"
        (click)="theme.cycle()"
      >
        <mat-icon>{{ theme.icon() }}</mat-icon>
      </button>

      <button mat-button [matMenuTriggerFor]="personaMenu" class="persona">
        <mat-icon>account_circle</mat-icon>
        <span class="hide-sm">{{ boot.persona()?.label ?? 'Identity' }}</span>
        <mat-icon>expand_more</mat-icon>
      </button>
      <mat-menu #personaMenu="matMenu">
        <div class="menu-head">
          Identity is resolved by the server. Switching it changes which rows and columns the gateway
          permits — the same page, legitimately different.
        </div>
        <mat-divider />
        @for (persona of boot.personas(); track persona.id) {
          <button mat-menu-item (click)="selectPersona(persona.id)">
            <mat-icon>{{ persona.id === boot.persona()?.id ? 'check' : 'person_outline' }}</mat-icon>
            <span class="persona-item">
              <strong>{{ persona.label }}</strong>
              <small>{{ persona.description }}</small>
            </span>
          </button>
        }
      </mat-menu>
    </mat-toolbar>

    @if (boot.status() === 'starting') {
      <mat-progress-bar mode="indeterminate" />
    }

    <mat-sidenav-container class="shell">
      <mat-sidenav
        class="nav"
        [opened]="navOpen()"
        mode="side"
        [disableClose]="true"
      >
        <nav aria-label="Main">
          <h2 class="nav-title">Workspace</h2>
          <mat-nav-list>
            <a mat-list-item routerLink="/create" routerLinkActive="active">
              <mat-icon matListItemIcon>auto_awesome</mat-icon>
              <span matListItemTitle>Create with AI</span>
              <span matListItemLine>Describe it, then render it</span>
            </a>
            <a mat-list-item routerLink="/experiences" routerLinkActive="active">
              <mat-icon matListItemIcon>dashboard_customize</mat-icon>
              <span matListItemTitle>Experiences</span>
              <span matListItemLine>{{ boot.serverHealth()?.experiences ?? 0 }} saved</span>
            </a>
          </mat-nav-list>

          <mat-divider />

          <h2 class="nav-title">This prototype</h2>
          <ul class="facts">
            <li>
              <mat-icon inline>data_object</mat-icon>
              Every page is JSON. Nothing is hardcoded.
            </li>
            <li>
              <mat-icon inline>smart_toy</mat-icon>
              Model calls go through <code>/api/ai/generate</code>.
            </li>
            <li>
              <mat-icon inline>shield</mat-icon>
              Entitlements are enforced by the server.
            </li>
          </ul>
        </nav>
      </mat-sidenav>

      <mat-sidenav-content class="workspace">
        @if (boot.status() === 'failed') {
          <div class="boot-failure" role="alert">
            <mat-icon>cloud_off</mat-icon>
            <div>
              <h1>The API is not running</h1>
              <p>{{ boot.problem() }}</p>
              <pre>npm run api        # or: npm run dev  (API + app together)</pre>
              <button mat-flat-button (click)="retry()">
                <mat-icon>refresh</mat-icon>
                Try again
              </button>
            </div>
          </div>
        } @else {
          <router-outlet />
        }
      </mat-sidenav-content>
    </mat-sidenav-container>
  `,
  styles: `
    :host {
      display: flex;
      flex-direction: column;
      block-size: 100vh;
      overflow: hidden;
    }

    .topbar {
      position: relative;
      z-index: 2;
      gap: 4px;
      padding-inline: 8px;
      background: var(--mat-sys-surface-container);
      border-block-end: 1px solid var(--mat-sys-outline-variant);
      box-shadow: none;
    }

    .brand {
      display: flex;
      align-items: center;
      gap: 10px;
      text-decoration: none;
      color: inherit;
      padding-inline: 4px;
      border-radius: 8px;
    }

    .mark {
      font-size: 1.5rem;
      line-height: 1;
      color: var(--mat-sys-primary);
    }

    .brand-text {
      display: flex;
      flex-direction: column;
      line-height: 1.15;
    }

    .product {
      font-size: 0.95rem;
      font-weight: 600;
      letter-spacing: -0.01em;
    }

    .tagline {
      font-size: 0.7rem;
      opacity: 0.68;
    }

    .spacer {
      flex: 1;
    }

    .status {
      display: inline-flex;
      align-items: center;
      gap: 6px;
      font-size: 0.75rem;
      padding: 4px 10px;
      border-radius: 999px;
      border: 1px solid var(--mat-sys-outline-variant);
      color: var(--mat-sys-on-surface-variant);
      white-space: nowrap;
    }

    .status.bad {
      color: var(--mat-sys-error);
      border-color: var(--mat-sys-error);
    }

    .persona {
      border-radius: 999px;
    }

    .menu-head {
      max-inline-size: 22rem;
      padding: 12px 16px;
      font-size: 0.75rem;
      opacity: 0.75;
      white-space: normal;
    }

    .persona-item {
      display: flex;
      flex-direction: column;
      line-height: 1.25;
    }

    .persona-item small {
      font-size: 0.7rem;
      opacity: 0.7;
      white-space: normal;
    }

    .shell {
      flex: 1;
      min-block-size: 0;
      background: var(--mat-sys-surface);
    }

    .nav {
      inline-size: 268px;
      padding: 8px 0 24px;
      border-inline-end: 1px solid var(--mat-sys-outline-variant);
      background: var(--mat-sys-surface-container-low);
    }

    .nav-title {
      margin: 16px 20px 6px;
      font-size: 0.7rem;
      font-weight: 600;
      letter-spacing: 0.08em;
      text-transform: uppercase;
      opacity: 0.6;
    }

    a.active {
      background: var(--mat-sys-secondary-container);
      color: var(--mat-sys-on-secondary-container);
    }

    .facts {
      margin: 8px 20px 0;
      padding: 0;
      list-style: none;
      display: flex;
      flex-direction: column;
      gap: 12px;
      font-size: 0.75rem;
      opacity: 0.78;
    }

    .facts li {
      display: grid;
      grid-template-columns: 18px 1fr;
      gap: 8px;
      align-items: start;
      line-height: 1.4;
    }

    .facts code {
      font-family: var(--opus-font-mono);
      font-size: 0.7rem;
    }

    .workspace {
      overflow-y: auto;
      overflow-x: hidden;
    }

    .boot-failure {
      display: flex;
      gap: 20px;
      margin: 48px auto;
      max-inline-size: 40rem;
      padding: 28px 32px;
      border-radius: 16px;
      border: 1px solid var(--mat-sys-outline-variant);
      background: var(--mat-sys-surface-container);
    }

    .boot-failure mat-icon {
      font-size: 32px;
      inline-size: 32px;
      block-size: 32px;
      color: var(--mat-sys-error);
    }

    .boot-failure h1 {
      margin: 0 0 8px;
      font-size: 1.25rem;
    }

    .boot-failure pre {
      margin: 12px 0 20px;
      padding: 12px 14px;
      border-radius: 8px;
      background: var(--mat-sys-surface-container-highest);
      font-family: var(--opus-font-mono);
      font-size: 0.8rem;
      overflow-x: auto;
    }

    @media (max-width: 900px) {
      .hide-sm {
        display: none;
      }

      .tagline {
        display: none;
      }
    }
  `,
})
export class ShellComponent {
  protected readonly boot = inject(BootService);
  protected readonly theme = inject(ThemeService);

  /** Collapsed on narrow viewports, so the workspace gets the width it needs. */
  protected readonly navOpen = signal(window.innerWidth >= 1100);

  protected readonly ready = computed(() => this.boot.status() === 'ready');

  constructor() {
    void this.boot.start();
  }

  protected retry(): void {
    void this.boot.start();
  }

  protected selectPersona(id: string): void {
    void this.boot.selectPersona(id);
  }
}
