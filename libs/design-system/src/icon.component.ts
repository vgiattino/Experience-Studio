/**
 * `opus-icon` — the CODA icon set.
 *
 * WHY A REGISTRY AND NOT AN ICON FONT. The Experience Builder prototype self-hosts Material Icons:
 * ~150KB of woff2 for the two dozen glyphs it uses, a flash of ligature text before it loads, and a
 * glyph set whose weight does not match the stroke weight of the console it is meant to look like.
 * The Opus EDM console instead inlines 24×24 stroke-1.6 SVG paths. Ported as a registry, that gives
 * a shell every icon at zero network cost, and — the reason it matters here — it makes the icon a
 * *name* rather than a blob of markup, so a nav section, a toolbar button or a palette entry can
 * carry `icon: 'undo'` as metadata. A template full of inline `<svg>` cannot be generated; a name
 * can, which is the same argument the component registry makes for widgets.
 *
 * WHY `innerHTML` AND A SANITIZER BYPASS. The paths are compile-time constants in this file. There
 * is no path by which caller input reaches the markup: `name` selects a key, it never becomes one.
 * The alternative — one `@switch` arm per icon in the template — is the same bytes with worse
 * ergonomics, and gives a caller no way to ask "is this icon known?".
 *
 * Adding an icon means adding a path here, on purpose: the set is a design decision, and a component
 * that could take arbitrary SVG would let any feature introduce a glyph in the wrong weight.
 */

import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  input,
  type Signal,
} from '@angular/core';
import { DomSanitizer, type SafeHtml } from '@angular/platform-browser';

/** Path data, viewBox 0 0 24 24, drawn as strokes unless the entry opts into a fill. */
const PATHS: Record<string, string> = {
  // ── navigation
  home: '<path d="M3 11l9-7 9 7v9a1 1 0 0 1-1 1h-5v-6h-6v6H4a1 1 0 0 1-1-1z"/>',
  grid: '<rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/>',
  database:
    '<ellipse cx="12" cy="5" rx="8" ry="3"/><path d="M4 5v6c0 1.7 3.6 3 8 3s8-1.3 8-3V5"/><path d="M4 11v6c0 1.7 3.6 3 8 3s8-1.3 8-3v-6"/>',
  model:
    '<circle cx="12" cy="6" r="2.5"/><circle cx="5" cy="18" r="2.5"/><circle cx="19" cy="18" r="2.5"/><path d="M12 8.5v3M10 13l-3 3M14 13l3 3"/>',
  layers: '<polygon points="12 2 22 8.5 12 15 2 8.5"/><polyline points="2 13.5 12 20 22 13.5"/>',
  shield:
    '<path d="M12 2l8 3v6c0 5-3.5 8.5-8 9-4.5-.5-8-4-8-9V5z"/><circle cx="12" cy="10" r="2.4"/><path d="M8.5 16c.6-1.6 2-2.6 3.5-2.6s2.9 1 3.5 2.6"/>',
  library:
    '<path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"/><path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"/>',
  page: '<path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z"/><polyline points="16 3 16 8 21 8"/>',
  document:
    '<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="8" y1="13" x2="16" y2="13"/><line x1="8" y1="17" x2="13" y2="17"/>',

  // ── editing
  undo: '<polyline points="9 14 4 9 9 4"/><path d="M20 20v-7a4 4 0 0 0-4-4H4"/>',
  redo: '<polyline points="15 14 20 9 15 4"/><path d="M4 20v-7a4 4 0 0 1 4-4h12"/>',
  save: '<path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z"/><polyline points="17 21 17 13 7 13 7 21"/><polyline points="7 3 7 8 15 8"/>',
  edit: '<path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/>',
  trash:
    '<polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/><path d="M10 11v6M14 11v6"/><path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2"/>',
  copy: '<rect x="9" y="9" width="12" height="12" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/>',
  plus: '<line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/>',
  close: '<line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>',
  check: '<polyline points="20 6 9 17 4 12"/>',
  revert: '<path d="M3 12a9 9 0 1 0 3-6.7"/><polyline points="3 4 3 9 8 9"/>',
  /* Two arcs rather than one: a re-run, distinct from `revert`, which undoes. */
  refresh:
    '<path d="M21 12a9 9 0 0 1-15 6.7"/><polyline points="21 20 21 15 16 15"/><path d="M3 12a9 9 0 0 1 15-6.7"/><polyline points="3 4 3 9 8 9"/>',
  /* A database host, as opposed to `database`, which is the schema inside one. */
  server:
    '<rect x="3" y="3" width="18" height="7" rx="2"/><rect x="3" y="14" width="18" height="7" rx="2"/><line x1="7" y1="6.5" x2="7.01" y2="6.5"/><line x1="7" y1="17.5" x2="7.01" y2="17.5"/>',

  // ── running and inspecting
  play: '<polygon points="5 3 19 12 5 21 5 3" fill="currentColor" stroke="none"/>',
  stop: '<rect x="4" y="4" width="16" height="16" rx="2" fill="currentColor" stroke="none"/>',
  eye: '<path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/>',
  history: '<circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/>',
  search: '<circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>',
  'zoom-in':
    '<circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/><line x1="8" y1="11" x2="14" y2="11"/><line x1="11" y1="8" x2="11" y2="14"/>',
  'zoom-out':
    '<circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/><line x1="8" y1="11" x2="14" y2="11"/>',
  settings:
    '<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/>',
  info: '<circle cx="12" cy="12" r="9"/><line x1="12" y1="11" x2="12" y2="16"/><line x1="12" y1="8" x2="12.01" y2="8"/>',
  warning:
    '<path d="M10.3 3.9L1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/>',
  help: '<circle cx="12" cy="12" r="9"/><path d="M9.1 9a3 3 0 0 1 5.8 1c0 2-3 3-3 3"/><line x1="12" y1="17" x2="12.01" y2="17"/>',

  // ── chrome
  bell: '<path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9"/><path d="M10 21a2 2 0 0 0 4 0"/>',
  user: '<path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/>',
  logout:
    '<path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" y1="12" x2="9" y2="12"/>',
  sun: '<circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/>',
  moon: '<path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z"/>',
  'theme-auto':
    '<circle cx="12" cy="12" r="9"/><path d="M12 3a9 9 0 0 0 0 18z" fill="currentColor" stroke="none"/>',
  'chevron-left': '<polyline points="15 18 9 12 15 6"/>',
  'chevron-right': '<polyline points="9 18 15 12 9 6"/>',
  'chevron-down': '<polyline points="6 9 12 15 18 9"/>',
  'chevron-up': '<polyline points="18 15 12 9 6 15"/>',
  'panel-left':
    '<rect x="3" y="3" width="18" height="18" rx="2"/><line x1="9" y1="3" x2="9" y2="21"/>',

  // ── devices, for the preview-width control
  desktop:
    '<rect x="2" y="4" width="20" height="12" rx="2"/><line x1="8" y1="20" x2="16" y2="20"/><line x1="12" y1="16" x2="12" y2="20"/>',
  tablet:
    '<rect x="5" y="2" width="14" height="20" rx="2"/><line x1="11" y1="18" x2="13" y2="18"/>',
  mobile:
    '<rect x="7" y="2" width="10" height="20" rx="2"/><line x1="11" y1="18" x2="13" y2="18"/>',

  // ── EDM administration
  attribute: '<circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="3"/>',
  matcher:
    '<rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/><path d="M10 6.5h4M14 17.5h-4"/>',
  sliders:
    '<line x1="4" y1="21" x2="4" y2="14"/><line x1="4" y1="10" x2="4" y2="3"/><line x1="12" y1="21" x2="12" y2="12"/><line x1="12" y1="8" x2="12" y2="3"/><line x1="20" y1="21" x2="20" y2="16"/><line x1="20" y1="12" x2="20" y2="3"/><line x1="1" y1="14" x2="7" y2="14"/><line x1="9" y1="8" x2="15" y2="8"/><line x1="17" y1="16" x2="23" y2="16"/>',
  flow: '<circle cx="6" cy="6" r="2.5"/><circle cx="6" cy="18" r="2.5"/><circle cx="18" cy="12" r="2.5"/><path d="M8 7l8 4M8 17l8-4"/>',
  users:
    '<path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.9"/><path d="M16 3.1a4 4 0 0 1 0 7.8"/>',
  mastering:
    '<line x1="4" y1="6" x2="20" y2="6"/><circle cx="10" cy="6" r="2"/><line x1="4" y1="12" x2="20" y2="12"/><circle cx="16" cy="12" r="2"/><line x1="4" y1="18" x2="20" y2="18"/><circle cx="8" cy="18" r="2"/>',
  'drag-handle': '<circle cx="9" cy="6" r="1.4"/><circle cx="9" cy="12" r="1.4"/><circle cx="9" cy="18" r="1.4"/><circle cx="15" cy="6" r="1.4"/><circle cx="15" cy="12" r="1.4"/><circle cx="15" cy="18" r="1.4"/>',

  // ── AI: the console's four-point star, filled
  sparkle:
    '<path d="M12 2l2.4 7.4H22l-6.2 4.5 2.4 7.4L12 17l-6.2 4.3 2.4-7.4L2 9.4h7.6z" fill="currentColor" stroke="none"/>',
  'sparkle-outline': '<path d="M12 2l2.4 7.4H22l-6.2 4.5 2.4 7.4L12 17l-6.2 4.3 2.4-7.4L2 9.4h7.6z"/>',
};

/** Every icon the set contains. A caller that needs one not listed adds it here. */
export type OpusIconName = keyof typeof PATHS & string;

export function iconNames(): readonly string[] {
  return Object.keys(PATHS);
}

@Component({
  selector: 'opus-icon',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: '<span class="glyph" [innerHTML]="svg()" aria-hidden="true"></span>',
  styles: `
    :host {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      line-height: 0;
    }

    .glyph {
      display: inline-flex;
    }
  `,
})
export class IconComponent {
  private readonly sanitizer = inject(DomSanitizer);

  readonly name = input.required<string>();
  /** Edge length in px. The console draws 18 in the rail, 14–16 in toolbars. */
  readonly size = input(18);
  /** Stroke weight. Toolbars use 2 for crispness at 14px; the rail uses 1.6. */
  readonly weight = input(1.6);

  protected readonly svg: Signal<SafeHtml> = computed(() => {
    // An unknown name draws a dot rather than nothing: a missing icon that leaves a hole in a
    // toolbar is harder to notice in review than one that renders visibly wrong.
    const paths = PATHS[this.name()] ?? '<circle cx="12" cy="12" r="3"/>';
    const size = this.size();
    return this.sanitizer.bypassSecurityTrustHtml(
      `<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor"` +
        ` stroke-width="${this.weight()}" stroke-linecap="round" stroke-linejoin="round">${paths}</svg>`,
    );
  });
}
