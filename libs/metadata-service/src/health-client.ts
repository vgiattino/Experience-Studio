/** Server health, so the app can say what is and is not reachable instead of failing opaquely. */

import { Injectable, signal } from '@angular/core';

import { apiRequest } from './api';

export interface ServerHealth {
  status: string;
  catalogVersion: number;
  entities: string[];
  experiences: number;
  ai: {
    active: string;
    providers: { id: string; version: string; external: boolean; configured: boolean; active: boolean }[];
  };
}

@Injectable({ providedIn: 'root' })
export class HealthClient {
  readonly health = signal<ServerHealth | null>(null);
  readonly reachable = signal<boolean | null>(null);

  async check(): Promise<ServerHealth | null> {
    try {
      const health = await apiRequest<ServerHealth>('/health');
      this.health.set(health);
      this.reachable.set(true);
      return health;
    } catch {
      this.reachable.set(false);
      return null;
    }
  }
}
