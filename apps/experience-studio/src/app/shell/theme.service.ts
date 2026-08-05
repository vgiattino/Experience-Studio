/**
 * Theme: system, light or dark.
 *
 * Three states rather than two. "System" is the default and is not the same as "light" — a user whose
 * OS is dark should not be shown a light app because the toggle only had two positions.
 *
 * The mechanism is one attribute on `<html>`. Material follows it through `color-scheme`, and the
 * platform's design tokens have their own `[data-theme]` overrides, so the shell and the rendered
 * experience change together. A second mechanism for the rendered page is how a dashboard ends up
 * light inside a dark application.
 */

import { Injectable, effect, signal } from '@angular/core';

export type ThemeMode = 'system' | 'light' | 'dark';

const STORAGE_KEY = 'opus.experience-studio.theme';

@Injectable({ providedIn: 'root' })
export class ThemeService {
  readonly mode = signal<ThemeMode>(readStored());

  constructor() {
    effect(() => {
      const mode = this.mode();
      const root = document.documentElement;
      if (mode === 'system') root.removeAttribute('data-theme');
      else root.setAttribute('data-theme', mode);
      try {
        localStorage.setItem(STORAGE_KEY, mode);
      } catch {
        // A blocked localStorage must not break theming — the preference simply does not persist.
      }
    });
  }

  cycle(): void {
    this.mode.update((current) =>
      current === 'system' ? 'light' : current === 'light' ? 'dark' : 'system',
    );
  }

  set(mode: ThemeMode): void {
    this.mode.set(mode);
  }

  icon(): string {
    const mode = this.mode();
    return mode === 'light' ? 'light_mode' : mode === 'dark' ? 'dark_mode' : 'brightness_auto';
  }

  label(): string {
    const mode = this.mode();
    return mode === 'light' ? 'Light theme' : mode === 'dark' ? 'Dark theme' : 'Match system theme';
  }
}

function readStored(): ThemeMode {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored === 'light' || stored === 'dark' || stored === 'system') return stored;
  } catch {
    // Ignored: an unavailable localStorage means no stored preference, which is the default anyway.
  }
  return 'system';
}
