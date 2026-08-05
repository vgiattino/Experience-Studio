/**
 * Studio application configuration.
 *
 * Identical to the Viewer's, and deliberately so: the canvas runs the production renderer, and a
 * renderer observed under different change-detection semantics than it ships with is not a
 * preview of anything (architecture/frontend-architecture.md §3.7).
 */

import {
  ApplicationConfig,
  provideBrowserGlobalErrorListeners,
  provideZonelessChangeDetection,
} from '@angular/core';

export const studioConfig: ApplicationConfig = {
  providers: [provideBrowserGlobalErrorListeners(), provideZonelessChangeDetection()],
};
