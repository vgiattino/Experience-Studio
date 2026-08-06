# CODA — the Opus design language, ported into Experience Studio

**What this is.** The look and feel of the Opus EDM console (`vgiattino/MDE`) brought into Opus
Experience Studio as a reusable theme layer, and the parts of its **page-builder chrome** brought
across as behaviour rather than paint.

**Why.** An analyst who authors an experience in this builder administers the EDM the experience
reads from. Two products that share a data model and share nothing visually make the second one feel
like a bolt-on — and in this case the second one is the surface asking business users to trust it
with an application they built by describing it.

---

## 1. What was ported

MDE's stylesheet is 1,601 lines and its shell is three components. Almost none of that is
*structure*: the console's look is carried by one palette, one type scale and about a dozen layout
contracts. So the port is not a copy — it is a second **value set** for tokens this platform already
had, plus the structural classes those values dress.

| From MDE | To Experience Studio | Form |
|---|---|---|
| `--magenta`, `--ink*`, `--bg*`, `--line*` | `libs/design-system/styles/coda-theme.scss` | token values, light + dark |
| `.topbar`, `.sidebar`, `.nav-item`, `.workbench`, `.wb-*`, `.btn`, `.icon-btn`, `.input`, `.tabs`, `.ver-pill`, `.env-pill`, `.ai-panel`, `.popover`, `.menu-item` | `libs/design-system/styles/chrome.scss` | global classes, every colour a token |
| `ICON_PATHS` in `sidebar.component.ts` + inline `<svg>` throughout | `libs/design-system/src/icon.component.ts` | `opus-icon`, a named registry |
| `sidebar.component.ts` | `libs/design-system/src/nav-rail.component.ts` | `opus-nav-rail`, driven by `NavSection[]` |
| `.wb-list` + `filter()` + `filteredConfigs()` (from `features/constructor`) | `libs/design-system/src/list-panel.component.ts` | `opus-list-panel` |
| `.flow-zoom` + `zoom()` (from `features/solutions`) | the page builder's canvas | zoom stops + keyboard |
| `theme.service.ts` | `libs/design-system/src/theme.service.ts` | promoted from the Builder prototype |

### Not ported, deliberately

- **Kendo UI.** MDE builds on `@progress/kendo-angular-*` (16 packages, a licensed theme). Experience
  Studio's widgets are its own, because a page definition names a *component type* from a registry
  and the runtime resolves it — introducing a second component vocabulary would mean a generated page
  could reference widgets the validator does not know. The CODA *look* does not require Kendo; it
  requires the palette, and the palette is 60 lines.
- **The console's features.** `constructor`, `porter`, `matcher`, `rules` and the rest are EDM
  administration. They belong to the console. What came across is the shape they share.
- **MDE's literal colours.** Every ported rule reads a `--opus-*` token. `background: var(--bg-2)`
  became `background: var(--opus-surface-hover)`, which is why the same chrome renders in CODA
  magenta or the platform's original blue, in light or dark, with no duplicate rulesets.

---

## 2. The token layer

`tokens.scss` is the **vocabulary** — what a definition is allowed to name, and what those names
mean. `coda-theme.scss` is a **value set** for that vocabulary. An app chooses:

```scss
@use 'libs/design-system/styles/tokens';        // vocabulary + the platform's original palette
@use 'libs/design-system/styles/coda-theme';    // …re-valued to CODA. Delete this line to revert.
```

Nothing downstream knows the difference. The five shipped widgets, the renderer, the four EDM
business templates and every AI-generated page changed appearance without a single component edit —
which is the argument the design system was making all along: *a definition names semantics, never
colours*, so the palette is the platform's to change.

| | platform original | CODA |
|---|---|---|
| brand | `#1d4ed8` blue | `#a11478` magenta |
| body text | `#171c26` | `#0e1111` |
| canvas / surface | `#f4f6f9` / `#ffffff` | `#f9f9f9` / `#ffffff` |
| border | `#dbe1ea` | `#dddddd` |
| base size | `0.9375rem` (15px) | `13px` |
| font | Inter first | Segoe UI first |
| radius (sm/md/lg) | 4 / 8 / 12 | 4 / 6 / 8 |
| chart series 1–3 | blue, teal, orange | magenta, blue, teal |

### One addition to the vocabulary: `--opus-accent`

Chrome across three apps was reaching for `--opus-emphasis-info` to mean *brand* — active nav item,
active tab, primary button, canvas selection outline. That conflation was invisible while both were
blue. CODA forces the distinction: its brand is magenta and its informational colour is still blue,
so the two cannot share a token.

- `--opus-accent` — "this is the product's colour". **Chrome only.** A definition may not name it.
- `--opus-emphasis-info` — "this row is informational". A definition *may* name it, and it must stay
  legible beside positive, warning and negative.

Twenty-six chrome usages moved to `--opus-accent` across `libs/studio-ui`, `libs/components`,
`libs/renderer`, `apps/viewer` and `apps/studio`. Five stayed on `emphasis-info` because they
genuinely mean information: the badge's `info` variant, a table cell link (CODA links are blue), and
the dev panel's cache-hit markers.

---

## 3. The page builder, in the CODA workbench

`apps/studio` — `npm run studio`, port 4300.

```
┌──────────────────────────────────────────────────────────────────────────┐
│ Opus Experience Studio │ Securities Operations        [Unsaved] ☾  PR    │  topbar, 56px
├────┬─────────────────────────────────────────────────────────────────────┤
│ ▤  │ Pages          6 │ 🗎 Exception Management  v1 ⌚  DRAFT   3 sources │  rail 68px
│    │ ─────────────────│ The data quality remediation queue…             │  + workbench
│ ⊞  │ 🔍 Filter pages… │ ↶ ↷ │ 💾 Save draft  ⟲ Discard │ 👁 ▭▯▫ │ − 100% ＋ │  toolbar
│ ▤  │ ▸ Exception Mgmt │─────────────────────────────────────────────────│
│    │   File Processing│  ┌──────────┐ ┌──────────┐   │ Properties  JSON │  canvas + dock
│    │   Security Master│  │ 93 Open  │ │ 34 High  │   │                  │
└────┴─────────────────────────────────────────────────────────────────────┘
```

### What changed as behaviour, not appearance

**The page picker is a list, not a `<select>`.** A dropdown hides its contents until clicked, has
nowhere to put a per-item state, and cannot be filtered. The list panel gives the author: the sibling
pages visible while editing one, a filter box (`1 of 6` when filtered, so the filter is never
invisible), the unsaved-draft marker as a hint column rather than a bullet glued to option text, two
distinct empty states ("No matches for X" versus "This experience declares no pages yet"), and
collapse to a 44px stub when the canvas needs the width.

**Navigation costs 68px instead of 250px.** The rail expands to 240px on hover *and on focus*, so a
keyboard user gets the labels too. Its sections are a `NavSection[]` — data an entitlement filter or
a generated shell can compute, not a template to edit. Because the builder has no router, rail items
without a `route` emit a selection instead; that is why the rail can switch the left panel between
Pages, Add a widget and Page structure without a router being introduced to gain a nav.

**Version and lifecycle are pills in the title row.** `v1` and `DRAFT`, read off
`definition.version`. The version pill opens the History tab, because that is the question a version
number provokes.

**The canvas zooms.** Stops at 50/67/80/100/125/150, `⌘−`, `⌘+`, `⌘0`, and a click on the percentage
resets. Zoom is a `transform` on a wrapper and **nothing else** — see the defect log below.

**The toolbar is icon buttons.** Undo/redo, save/discard, preview toggle, six preview widths as
device icons, zoom, and validation as an ambient status whose tooltip names the levels that ran and
the levels that did not. The Studio is the one place a definition is invalid on purpose — mid-edit,
between two property changes — so validation can never be a gate here.

---

## 4. Defects this work surfaced

Two, both found by opening the builder and reading computed styles. Neither would have been caught by
review, and one had been shipping since the visual builder landed.

### D1 — the entire canvas editing overlay was inert

**Symptom.** Selecting a widget drew no outline. Hovering drew no dashed outline. Dragging from the
palette showed no drop indicator. All three rules were present in `canvas.component.ts`, looked
correct, and matched nothing.

**Cause.** Angular's default emulated encapsulation rewrites a component's selectors to require that
component's `_ngcontent` attribute. The elements carrying `data-node` are rendered by
`PageRendererComponent` — a different component, a different view, a different scope attribute:

```
.surface        _ngcontent-ng-c3052081947   ← the canvas's scope
[data-node]     _ngcontent-ng-c989356756    ← the renderer's scope
```

So `.surface [data-node][data-editor-selected='true']` could never match. Measured:
`outline-style: none`, `outline-width: 0px`.

**Fix.** The rules moved to `libs/studio-ui/styles/editing-overlay.scss`, imported globally by the
app and scoped under `opus-canvas`. They are a *contract between two libraries* — the renderer
publishes `data-node`, `EditorService` writes `data-editor-*` onto the same elements — and a
cross-view contract cannot live inside a scoped stylesheet. `::ng-deep` does the same thing while
deprecated; `ViewEncapsulation.None` would leak every canvas rule to every app.

**After:** selection `solid 2px rgb(161, 20, 120)`; hover `dashed 1px`; drop indicator a 3px magenta
bar with `content: ""` on the correct pseudo-element.

### D2 — canvas zoom silently changed which layout the author was looking at

**Symptom.** Zooming from 100% to 67% moved the renderer from its `md` layout to its `lg` one.

**Cause.** The first version backfilled the empty space a scaled-down layer leaves by setting the
layer's width to `100/scale` per cent. The renderer resolves its breakpoint from a `ResizeObserver`
on its *own* element (frontend-architecture §5.3), so anything that changes the layer's layout width
changes the layout under test. A transform does not; a width does.

**Fix.** The width compensation is gone; a scaled-down canvas leaves whitespace, which is what
zooming out means. Zoom and responsive preview are two controls and the width belongs to the other
one. Verified: breakpoint `md` at 100/80/67/50%, and `xs`/`md`/`xl` when the *preview width* control
is used — which is allowed to change it, and does.

---

## 5. Verification

Driven in Chromium at 1680px, 900px and 430px, in both themes.

| Check | Result |
|---|---|
| Chrome metrics | topbar 56px, rail 68px → 240px on hover, back to 68px |
| Palette resolves | `--opus-accent` = `#a11478` light, `#d94ca7` dark; body 13px Segoe UI |
| Icons | 28 inline SVG glyphs, zero font requests |
| List panel | 6 pages, filter "proc" → `1 of 6`, "zzz" → *No matches for "zzz"*, no `<select>` in the DOM |
| Rail switches panels | Pages / palette 10 entries / outline 15 rows |
| Canvas renders live data | 15 widgets, 4 KPIs, 1 chart, 2 tables, 54 rows, all `ready` |
| Zoom | 100→80→67→50→67→100, breakpoint `md` throughout |
| Preview width | `xs`→390px/xs, `md`→900px/md, `xl`→1680px/xl |
| Selection overlay | `solid 2px rgb(161,20,120)` on `w-kpi-open` |
| Drop indicator | `after` w-kpi-open, 3px, `rgb(161,20,120)` |
| Edit cycle | Alt+↓ → Unsaved + history badge 1 → undo → clean → save → banner + `draft` hint → discard → 0 drafts |
| Validation | *Valid*; ran structural, component, semantic, binding, layout; not run entitlement, cost, accessibility |
| Responsive | 0px horizontal overflow at 900px and 430px; rail hidden, workbench single-column |
| Console | no errors |
| Gate | metadata validation passed, 255 unit tests passed, all three apps build |

---

## 6. Where things live

```
libs/design-system/
  styles/tokens.scss             the vocabulary + the platform's original palette
  styles/coda-theme.scss         CODA values for the same tokens, light + dark
  styles/chrome.scss             topbar, rail, workbench, buttons, inputs, tabs, pills, popovers
  src/icon.component.ts          opus-icon — the CODA icon set as a named registry
  src/nav-rail.component.ts      opus-nav-rail — NavSection[] in, rail out
  src/list-panel.component.ts    opus-list-panel — searchable, collapsible, two empty states
  src/theme.service.ts           system | light | dark, one attribute on <html>

libs/studio-ui/
  styles/editing-overlay.scss    the canvas overlay — global, because it crosses a view boundary

apps/studio/src/app/app.ts       the page builder shell, assembled from the above
apps/studio/src/styles.scss      tokens → coda-theme → chrome → editing-overlay
apps/viewer/src/styles.scss      tokens → coda-theme
apps/experience-studio/…         tokens → coda-theme, and Material seeded from mat.$magenta-palette
```

## 7. What a follow-on should pick up

1. ~~**The AI panel is styled but unwired.**~~ **Done** — see [`AI-ASSIST.md`](./AI-ASSIST.md). The
   ★ in the title row asks what the page is missing; `.opus-ai-panel`, `.opus-ai-suggestion` and
   `.opus-ai-badge` now carry a real feature, and accepting a suggestion is a single patch tagged
   `origin: 'ai'` that one undo reverses — which needed a new command (`addBoundWidget`) so that a
   widget and its data source arrive together rather than as two history entries.
2. **The console's wordmark and avatar are placeholders.** The avatar renders `AUTHOR.displayName`
   initials over a fixed gradient; a real identity service replaces both.
3. **Contrast audit under CODA.** Validation level 8 (accessibility) still does not run. The CODA
   status colours were transcribed from the console rather than re-derived, and `#b25e00` warning
   text on `#fef9c3` should be measured, not assumed, before this palette is called accessible.
4. **One theme service, three apps, one storage key** (`opus.theme`). The Builder prototype's old key
   is read once for migration; that fallback can go after a release.
