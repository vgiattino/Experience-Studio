# EDM Page Builder — the console's studio, recreated natively

**What this is.** The Opus EDM console's Page Builder rebuilt as Angular components in Experience
Studio, reachable from the navigation rail under **Reference → EDM Page Builder**. Native, not framed.

`npm run studio` → port 4300 → hover the rail → **EDM Page Builder**.

---

## 1. Where it was, and why I said it did not exist

I reported four times that MDE had no page builder. That was true of the commit I had cloned and wrong
about the repository. The Page Builder lives on the **`opus-angular-port`** branch —
`frontend/src/app/screens/page-builder/page-builder.ts`, 1,576 lines — and `origin/main` is still at
`fea3616`, which predates it. `git ls-remote` shows both refs; I only ever fetched one.

The lesson, recorded because it cost several rounds: **check every ref, not just the default branch.**
A shallow clone of `main` is not evidence about a repository.

## 2. What it is

A low-code studio, and the subtitle is the original's because it is accurate: *"Assemble dashboards and
multi-page workflows from a palette of widgets — drag to arrange, link pages together, then preview the
flow."*

| | |
|---|---|
| Ported from | `vgiattino/MDE@8d678a9` (branch `opus-angular-port`) |
| Landed at | `apps/studio/src/app/edm/page-builder/` — `model.ts`, `page-builder.component.ts`, `widget-view.component.ts` |
| Grid | 12 columns × 40px rows, drag to move, corner-drag to resize |
| Palette | 6 groups, 25 entries, 20 widget types |
| Pages | 5 seeded, with icons, reorder, duplicate, delete, add |
| Persistence | localStorage, `opus.edm.pagebuilder.v1` |

**Page links are derived, never stored.** A link *is* a nav button pointing at a page, so the strip's
outgoing counts are computed from the widgets. That is the original's design and it is the right one: a
stored edge could disagree with the button that created it.

**Minimum heights are repaired on load.** A design saved before a widget's content grew would render
clipped rather than merely small, so every widget is grown to its content's floor when the store is
read — the original does this too, and it is the rule that stops a drag producing an unreadable card.

## 3. What is not ported, and is said so in the UI

Each of these is named in the page-settings panel, because an absence that looks like a bug is worse
than an absence that is labelled.

| Missing | Why |
|---|---|
| **The Flow map** — pages as draggable nodes, SVG edges, port-drag to link, BFS auto-arrange | The largest single piece of the original. Next to port. |
| **Kendo grid** paging, sorting, filtering, grouping, Excel export | The platform has no Kendo dependency. The grid renders its rows and says it is display-only. |
| **spline · funnel · radar · waterfall · scatter** chart kinds | Column, bar, line, area, pie and donut are drawn in ~60 lines of inline SVG. The rest need a charting library. |
| **AI generate from a prompt** | The original has a keyword heuristic and an optional local model. Experience Studio already has a generation pipeline — wiring *that* in is better than porting the heuristic. |
| **Data-source binding** | The original binds widgets to mock sources. This port keeps literal arrays. |
| The full property inspector (column configs, segment editors, legend and axis options) | Present for the common props per type; the rest is listed rather than half-built. |

## 4. The thing worth saying out loud

**This is a second page model in a repository whose architecture rests on one.**

Experience Studio's own builder — the rail's *Pages* section — edits a `PageDefinition`: a validated
artifact the runtime interprets, bound to a governed catalog, mutated by JSON Patch with undo, and
checked by eight validation levels. This builder edits ad-hoc widget `props` in localStorage with no
validation and no catalog.

Both are in the rail, under different sections, deliberately. Keeping them separate is what makes the
recreation faithful enough to compare. The obvious follow-on is to back *this* UI with
`PageDefinition` — same palette, same canvas, same page strip, but every edit a patch against an
artifact the runtime can render. That would make it a feature of this product rather than a recreation
of another one's.

## 5. Verification

Driven in Chromium at 1680px and 430px, both themes:

| Check | Result |
|---|---|
| Header | title, the original's subtitle, `Saved`, Edit / Preview |
| Page strip | 5 tabs with derived link counts — `By Asset Type 2`, `Public vs Private 2`, `Private Markets 1`, … |
| Palette | 6 groups (Content · Data · Inputs · Reporting · Charts · Flow), 25 entries |
| Canvas | 8 widgets on page 1; KPIs `128,540` / `94%` / `312`; a 6-bar column chart; a donut with a legend; two nav buttons |
| Grid overlay | visible in Edit, gone in Preview |
| Select | inspector shows *Metric / KPI* with Label · Value · Delta · Direction · Accent and 7 swatches |
| Edit a prop | KPI label changed on the canvas immediately |
| Add | palette click → 9 widgets, gauge drawn as SVG, inspector switched to it |
| Resize | inspector `3 / 12` → `4 / 12` |
| **Drag** | moved x=292 → x=540, snapped to the 12-column grid |
| Pages | switching shows 6 / 7 / 5 widgets; add page → empty state; delete returns to 5 |
| Preview | palette, inspector and resize handles all gone |
| **Persistence** | 5 pages stored; after a full reload the tabs and the edited KPI label are still there |
| 430px | 0px horizontal overflow |
| Console | no errors |

Gate: metadata validation passed, 289 unit tests passed, all three apps build.

## 6. Next

1. **The Flow map.** The original's `autoLayout` is a BFS layering by distance from an entry page, with
   SVG edges and a drag-to-link port. It is the half of "multi-page workflow" this port does not show.
2. **Back it with `PageDefinition`.** See §4. This is the decision that determines whether the section
   is a comparison or a product.
3. **Wire the platform's generation pipeline** into the empty-page prompt, rather than porting the
   original's keyword heuristic — the pipeline is already grounded in the catalog and validated.
