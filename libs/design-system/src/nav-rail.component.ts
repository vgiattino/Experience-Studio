/**
 * `opus-nav-rail` — the CODA navigation rail: 68px of icons that expands to 240px on hover.
 *
 * Ported from the Opus EDM console's sidebar. Two things make it worth porting rather than
 * reimplementing per app:
 *
 *   1. It costs no horizontal space. An authoring surface has three panels competing for width
 *      already; a 250px permanent nav takes that width from the canvas. The rail gives navigation a
 *      68px permanent cost and borrows the rest only while the pointer is in it.
 *   2. Its sections are DATA. `NavSection[]` in, markup out — so navigation is a metadata array an
 *      app (or a generator, or an entitlement filter) can compute, not a template to edit. That is
 *      the same reason the component registry exists for widgets.
 *
 * Keyboard and touch: expansion is driven by pointer *and* by focus, so tabbing into the rail
 * reveals the labels. Where hover is unavailable the labels stay hidden and each item keeps its
 * `aria-label`, which is what a screen reader and a touch user were reading anyway.
 */

import { ChangeDetectionStrategy, Component, computed, input, model, output } from '@angular/core';
import { RouterLink, RouterLinkActive } from '@angular/router';

import { IconComponent } from './icon.component';

/** One destination. `route` is a router link; `icon` names an entry in the CODA icon set. */
export interface NavItem {
  readonly id?: string;
  readonly label: string;
  readonly icon: string;
  readonly route?: string;
  /** Set when the destination is outside the Angular app — a second surface, or a doc. */
  readonly href?: string;
  readonly hint?: string;
}

/**
 * A labelled group. `label` shows expanded and `mini` shows collapsed, because "STRUCTURE" does not
 * fit in 68px and an ellipsised group heading reads as a broken label rather than a short one.
 */
export interface NavSection {
  readonly label?: string;
  readonly mini?: string;
  readonly items: readonly NavItem[];
}

@Component({
  selector: 'opus-nav-rail',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [IconComponent, RouterLink, RouterLinkActive],
  template: `
    <nav
      class="opus-rail"
      [class.expanded]="expanded()"
      (mouseenter)="expanded.set(true)"
      (mouseleave)="expanded.set(false)"
      (focusin)="expanded.set(true)"
      (focusout)="expanded.set(false)"
      [attr.aria-label]="ariaLabel()"
    >
      @for (section of sections(); track $index) {
        @if (section.label) {
          <div class="opus-rail-section">
            <span class="opus-rail-section-full">{{ section.label }}</span>
            <span class="opus-rail-section-mini">{{ section.mini ?? section.label }}</span>
          </div>
        }
        @for (item of section.items; track item.id ?? item.label) {
          @if (item.route) {
            <a
              class="opus-nav-item"
              [routerLink]="item.route"
              routerLinkActive="active"
              [attr.aria-label]="item.label"
              [title]="expanded() ? '' : item.label"
            >
              <span class="opus-nav-icon">
                <opus-icon [name]="item.icon" />
              </span>
              <span class="opus-nav-label">{{ item.label }}</span>
              @if (!expanded()) {
                <span class="opus-tip" aria-hidden="true">{{ item.label }}</span>
              }
            </a>
          } @else if (item.href) {
            <a class="opus-nav-item" [href]="item.href" [attr.aria-label]="item.label">
              <span class="opus-nav-icon">
                <opus-icon [name]="item.icon" />
              </span>
              <span class="opus-nav-label">{{ item.label }}</span>
              @if (!expanded()) {
                <span class="opus-tip" aria-hidden="true">{{ item.label }}</span>
              }
            </a>
          } @else {
            <!--
              An entry with no destination is an in-app switch, not a broken link. The page builder
              has no router — it is one workspace with several left panels — and a rail that could
              only express routes would have forced a router in to gain a nav.
            -->
            <button
              type="button"
              class="opus-nav-item"
              [class.active]="(item.id ?? item.label) === activeId()"
              [attr.aria-pressed]="(item.id ?? item.label) === activeId()"
              [attr.aria-label]="item.label"
              (click)="select.emit(item.id ?? item.label)"
            >
              <span class="opus-nav-icon">
                <opus-icon [name]="item.icon" />
              </span>
              <span class="opus-nav-label">{{ item.label }}</span>
              @if (!expanded()) {
                <span class="opus-tip" aria-hidden="true">{{ item.label }}</span>
              }
            </button>
          }
        }
      }
    </nav>
  `,
  styles: `
    :host {
      display: contents;
    }

    [aria-disabled='true'] {
      opacity: 0.5;
      cursor: default;
    }
  `,
})
export class NavRailComponent {
  readonly sections = input.required<readonly NavSection[]>();
  readonly label = input('Main navigation');

  /**
   * Which non-route entry is current. Routed entries mark themselves through `routerLinkActive`;
   * an app-driven rail has no URL to compare against, so the host says.
   */
  readonly activeId = input<string | null>(null);

  /** A model, so a host can pin the rail open — a keyboard-only user, or a wide layout. */
  readonly expanded = model(false);

  readonly select = output<string>();

  protected readonly ariaLabel = computed(() => this.label());
}
