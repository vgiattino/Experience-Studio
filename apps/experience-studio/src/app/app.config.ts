/**
 * Application configuration.
 *
 * Zoneless change detection with signals throughout. The justification is specific to this product:
 * a dashboard is many independent data widgets updating on independent schedules, and zone.js charges
 * every widget for every async event anywhere on the page. Signals invalidate exactly the computed
 * graph that depends on changed data — which, with dynamically created component trees, is the
 * difference between a dashboard that updates smoothly and one that re-renders itself repeatedly.
 *
 * Animations are provided asynchronously so Material's animation module lands in a lazy chunk rather
 * than the initial bundle: this app's first paint is a prompt box, and it should not wait on the
 * animation engine.
 */

import {
  ApplicationConfig,
  provideBrowserGlobalErrorListeners,
  provideZonelessChangeDetection,
} from '@angular/core';
import { provideAnimationsAsync } from '@angular/platform-browser/animations/async';
import { provideRouter, withComponentInputBinding, withInMemoryScrolling } from '@angular/router';

import { routes } from './app.routes';

export const appConfig: ApplicationConfig = {
  providers: [
    provideBrowserGlobalErrorListeners(),
    provideZonelessChangeDetection(),
    provideAnimationsAsync(),
    provideRouter(
      routes,
      // Route params bind straight to component inputs, so a page component takes an
      // `experienceId` input rather than reading the router — which keeps it testable without one.
      withComponentInputBinding(),
      withInMemoryScrolling({ scrollPositionRestoration: 'top', anchorScrolling: 'enabled' }),
    ),
  ],
};
