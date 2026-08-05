import { bootstrapApplication } from '@angular/platform-browser';
import { StudioApp } from './app/app';
import { studioConfig } from './app/app.config';

bootstrapApplication(StudioApp, studioConfig).catch((error: unknown) => {
  console.error('[opus:studio] bootstrap failed', error);
});
