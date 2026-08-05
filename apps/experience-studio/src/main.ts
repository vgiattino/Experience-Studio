import { bootstrapApplication } from '@angular/platform-browser';

import { ShellComponent } from './app/shell/shell.component';
import { appConfig } from './app/app.config';

bootstrapApplication(ShellComponent, appConfig).catch((error: unknown) => {
  console.error('[opus] bootstrap failed', error);
});
