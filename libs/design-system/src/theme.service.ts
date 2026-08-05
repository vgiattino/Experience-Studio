/**
 * Theme: system, light or dark.
 *
 * Three states rather than two. "System" is the default and is not the same as "light" — a user whose
 * OS is dark should not be shown a light app because the toggle only had two positions.
 *
 * The mechanism is one attribute on `<html>`. The design tokens carry `[data-theme]` overrides in
 * both directions, and Material follows the same attribute through `color-scheme`, so the shell and
 * the rendered experience change together. A second mechanism for the rendered page is how a
 * dashboard ends up light inside a dark application.
 *
 * PROMOTED FROM THE PROTOTYPE'S SHELL. It lived in `apps/experience-studio/src/app/shell/` and was
 * needed by a second surface the moment the page builder gained a theme toggle. It carries no icon
 * names: the Builder draws Material glyphs and the page builder draws CODA strokes, and a service
 * that named one of them would make the other import the wrong vocabulary. The storage key is
 * product-wide on purpose — a preference set in the Builder holds when the same person opens the
 * page builder.
 */

import { Injectable, effect, signal } from '@angular/core';

export type ThemeMode = 'system' | 'light' | 'dark';

const STORAGE_KEY = 'opus.theme';

/** Legacy key, read once so an existing preference is not silently reset by the promotion. */
const LEGACY_KEY = 'opus.experience-studio.theme';

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

  label(): string {
    const mode = this.mode();
    return mode === 'light' ? 'Light theme' : mode === 'dark' ? 'Dark theme' : 'Match system theme';
  }

  /** What the toggle will do next, for a tooltip that names the destination rather than the state. */
  nextLabel(): string {
    const mode = this.mode();
    return mode === 'system'
      ? 'Switch to the light theme'
      : mode === 'light'
        ? 'Switch to the dark theme'
        : 'Match the system theme';
  }
}

function readStored(): ThemeMode {
  for (const key of [STORAGE_KEY, LEGACY_KEY]) {
    try {
      const stored = localStorage.getItem(key);
      if (stored === 'light' || stored === 'dark' || stored === 'system') return stored;
    } catch {
      // Ignored: an unavailable localStorage means no stored preference, which is the default anyway.
    }
  }
  return 'system';
}
