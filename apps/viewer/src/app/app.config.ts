/**
 * Application configuration.
 *
 * Zoneless change detection with signals throughout
 * (architecture/frontend-architecture.md §3.7). The justification is specific to
 * this product: a dashboard is many independent data widgets updating on independent
 * schedules, and zone.js charges every widget for every async event anywhere on the
 * page. Signals invalidate exactly the computed graph that depends on changed data.
 */

import {
  ApplicationConfig,
  provideBrowserGlobalErrorListeners,
  provideZonelessChangeDetection,
} from '@angular/core';

export const appConfig: ApplicationConfig = {
  providers: [provideBrowserGlobalErrorListeners(), provideZonelessChangeDetection()],
};
