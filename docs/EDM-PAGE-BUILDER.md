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
| Landed at | `apps/studio/src/app/edm/page-builder/` — `model.ts` and five components: the builder shell, `palette`, `structure`, `inspector`, `flow-map`, plus `widget-view` |
| Modes | Edit · **Flow** · Preview |
| Left dock | **Widgets** (palette) · **Structure** (the page as a tree) |
| AI | a prompt bar, a design review, and undo — see [EDM-PAGE-BUILDER-AI.md](EDM-PAGE-BUILDER-AI.md) |
| Data | widgets bind to the governed catalog and read through the Data Gateway — see [EDM-PAGE-BUILDER-CATALOG.md](EDM-PAGE-BUILDER-CATALOG.md) |
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

## 3. The Flow map

The other half of "multi-page workflow". The canvas shows one page; the map shows how an end user gets
from one page to the next — which is the thing an author cannot check by looking at pages one at a time.

Pages are draggable nodes, navigation is SVG edges, and dragging the dot on a node's right edge onto
another page links them. Picking an edge names the button behind it and offers **Edit that button** or
**Cut link**. **Auto-arrange** hands every node back to the layout.

**Drawing a link adds a button.** Links are derived, so there is no edge to store: creating one means
putting a nav button on the source page, below its existing content and named after its destination.
Cutting one clears that button's *target* rather than deleting the button — this builder has no undo,
and a button that was placed and styled on the canvas should not be lost to one click on a map. The
inspector then shows it linking to "(nowhere)", which is a state the author can see and finish.

### Why the layout is a longest-path layering, not a BFS

The original layers by shortest distance from an entry page. That is wrong in a way that only shows on
screen. Take A → B, A → C and B → C: shortest distance puts B and C in the *same* column, so B → C has
to be drawn sideways — out of B's right edge, turning back on itself, into C's left edge — which is
indistinguishable from a "Back to…" return. Layering by the longest path instead puts C behind B, and
every real navigation then moves at least one column right. A test asserts exactly that property over
four shapes.

Cycles cannot be layered at all, so a DFS finds the edges that close them first: an edge pointing at a
page still on the stack is a *back edge*, and what remains is a DAG. Those back edges are the "Back
to…" links, and the map draws them as returns underneath — which is what they are.

Three things the layout has to get right, each with a test:

| Shape | What happens |
|---|---|
| A cycle with **no entry at all** — every page has a "Back to…" button, which is true of the seed | The traversal starts from the first page in the strip, and the bar *says so* rather than leaving the first column looking arbitrary |
| An **island** with no path from any entry | Becomes its own flow starting at the left, not a stack of nodes on the origin |
| A **self-link** | Never counts towards indegree, or a page that links to itself could not be an entry; drawn as a loop out to the right |

### Three routes, because one does not survive a real workflow

Every edge is a cubic bezier leaving a node's right edge and arriving at a node's left edge, so
direction is legible without reading the arrowhead. Where it goes in between depends on what it is:

| Route | Why |
|---|---|
| **Forward**, next column — horizontal control points | A row of them reads as one flow. Straight diagonals cross into a mess as soon as there are three. |
| **Forward**, skipping a column — arcs *over* the row it skips | Drawn straight, the line passes through the page in between and its label lands on that page's title. Arcing over also says something true: this edge passes a page rather than reaching the next one. |
| **Backward** — a return bus below every node, one lane each | Drawn like a forward edge, a back-link retraces the forward link almost exactly: two edges on the same pixels, two labels on the same point, and an author sees one edge where there are two. |

A lane per edge in each band, because two sharing a y is the same collision one level down. And every
route names the height it wants and *solves* for its control point: a cubic with both control points on
one line only travels three quarters of the way to it, so a lane 30px below the last node draws a curve
that clears it by 22 and a label that does not clear it at all. That arithmetic was wrong twice by eye
before it was inverted, which is why the verification below measures overlaps instead of looking at
them.

## 4. Page structure

The same feature as the platform builder's structure panel, in the left dock beside **Widgets**. Not a
second view of the canvas — three jobs the canvas cannot do:

- **Reach a widget you cannot click.** One row high, behind a section, scrolled out of sight, or a
  Divider that is two pixels of hairline. On the canvas those are unselectable in practice.
- **See what is inside what.** A widget dropped on a section looks contained and, in this model, is not
  recorded as contained by anything.
- **Change stacking.** The widget array is paint order, so which of two overlapping widgets is on top is
  a property of list position and of nothing visible.

Selection and hover run both ways: a row highlights what the canvas has selected, hovering a row
outlines the widget on the canvas, and selecting on the canvas scrolls the row into view. Arrows move
the selection, `Alt`+arrows restack, `Delete` removes — all of it without a pointer, which matters
precisely because the widgets this panel exists for are the ones a pointer cannot hit.

**Nesting is derived from the rectangles.** The platform's panel walks a nested `PageDefinition.layout`
where parentage is recorded. This model has none: a page is a flat array on a 12-column grid, and a
Section is a titled box that other widgets are dropped *on top of*. So the containment an author can
plainly see is written down nowhere — and deriving it is the same choice this file already makes for
page links. Drag a KPI onto a section and it is inside it, in the panel and on the screen, with nothing
to keep in sync.

The rule is **full enclosure**, not overlap: a widget hanging over a section's edge stays at the top
level. That is honest about an ambiguous case rather than guessing, and it makes the relation a strict
ordering — a section only parents something smaller, or something identical that was added earlier — so
the tree cannot contain a cycle. Nine tests cover the rule, including the identical-bounds case.

### Two orders from one tree

| Order | Used for | Sibling order |
|---|---|---|
| `structureOf` | the panel | **reading order** — row then column, which is what an author scans for |
| `paintOrder` | the canvas | **array order** — because among siblings the array *is* the z-order, and reordering it is what restacking does |

Both walk parents before children, and that fixed a defect the panel exposed on its first run: a Section
added *after* the widgets it ends up around is later in the array, so it painted over them. A KPI dragged
into a section vanished behind an opaque box — unclickable, and findable only in the tree. Painting the
derived tree fixes it by construction: an ancestor is always emitted first, so a section can never cover
its own contents however the page was built.

## 5. What is not ported, and is said so in the UI

Each of these is named in the page-settings panel, because an absence that looks like a bug is worse
than an absence that is labelled.

| Missing | Why |
|---|---|
| **Kendo grid** paging, sorting, filtering, grouping, Excel export | The platform has no Kendo dependency. The grid renders its rows and says it is display-only. |
| **spline · funnel · radar · waterfall · scatter** chart kinds | Column, bar, line, area, pie and donut are drawn in ~60 lines of inline SVG. The rest need a charting library. |
| **Filters on a binding** | The query shape carries them and grounding validates them; there is no UI yet, so an entity the gateway refuses unfiltered cannot be bound — and says so. |
| The full property inspector (column configs, segment editors, legend and axis options) | Present for the common props per type; the rest is listed rather than half-built. |

## 6. The thing worth saying out loud

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

## 7. Verification

Driven in Chromium at 1680px, 700px and 430px, both themes. Every claim below was read back out of the
DOM, not looked at.

**The builder**

| Check | Result |
|---|---|
| Header | title, the original's subtitle, `Saved`, Edit / Flow / Preview |
| Page strip | 5 tabs with derived link counts — `By Asset Type 2`, `Public vs Private 2`, `Private Markets 1`, … |
| Palette | 6 groups (Content · Data · Inputs · Reporting · Charts · Flow), 25 entries, hidden below 760px |
| Canvas | 8 widgets on page 1; KPIs `128,540` / `94%` / `312`; a 6-bar column chart; a donut with a legend; two nav buttons |
| Grid overlay | visible in Edit, gone in Preview |
| Select | inspector shows *Metric / KPI* with Label · Value · Delta · Direction · Accent and 7 swatches |
| Add | palette click → 9 widgets, gauge drawn as SVG, inspector switched to it |
| **Drag** | moved x=292 → x=540, snapped to the 12-column grid |
| Resize | inspector `3 / 12` → `4 / 12` |
| Pages | switching shows 6 / 7 / 5 widgets; add page → empty state; delete returns to 5 |
| Mode round-trip | Flow → Edit re-measures the canvas; widgets return at the right widths |
| **Persistence** | 5 pages stored; after a full reload the tabs and the edited KPI label are still there |
| Console | no errors |

**The Flow map**

| Check | Result |
|---|---|
| Layout | 3 columns — `By Asset Type` → `Public vs Private` → `Private Markets`, with `Ops — Readiness` → `Daily File Load` as a second row |
| No entry | bar reads *"No entry page: every page is linked to from somewhere, so this map is laid out from 'By Asset Type'"* — true of the seed, since every page has a "Back to…" button |
| Nodes | icon, name, `8 widget(s) · 2 out · 1 in`, an Open link and a port |
| Edges | 7, one label each: `Public vs Private`, `Private Markets` ×2, `Back to asset type`, `Back to markets`, `Daily File Load`, `Back to readiness` |
| **Overlaps** | measured pairwise, label-to-label and label-to-node: **none** |
| Pick an edge | bar reads `By Asset Type → Public vs Private via the "Public vs Private" button` |
| **Drag a node** | 127,314 → 327,492; `fx`/`fy` stored; still there after a full reload |
| **Draw a link** | port-drag Daily File Load → By Asset Type: drop target highlights, 7 edges → 8, and the page gains a real `By Asset Type` nav button below its content |
| Cut link | 8 edges → 7, the picked bar clears, the button stays |
| Auto-arrange | dragged node returns to 127,314 |
| Edit that button | opens the source page with the button selected; `Links to` reads `Public vs Private` |
| 430px | 0px page overflow; the map scrolls inside its own pane |
| Console | no errors |

**Page structure**

| Check | Result |
|---|---|
| Dock | two tabs, `Widgets` and `Structure 8` — the badge tracks the widget count |
| Tree | 8 rows in reading order: `Security Master by asset type` (Heading 12×1 @ 1,1), three KPIs, two charts, two buttons |
| Row | label and `kind · w×h @ col,row` on two lines — **no label or detail clipped**, measured `scrollWidth` against `clientWidth` on every row |
| Panel → canvas | clicking row 5 selects the column chart; exactly one widget selected on the canvas |
| Canvas → panel | clicking a KPI highlights `Instruments · Metric / KPI · 4×3 @ 1,2` |
| Hover | hovering a row outlines exactly one widget on the canvas |
| **Nesting** | add a Section, grow it, drag a KPI onto it → the KPI indents beneath `Section` in the tree |
| **The defect that found** | before `paintOrder`, `elementFromPoint` at that KPI's centre returned the *section* — it was hidden and unclickable. After: returns the KPI, and clicking it selects it |
| **Stacking** | dragging one KPI onto another gives both a chip (`2`, `3`); the chip brings it to the front (`2` → `8`); `Alt`+`↑` sends it back (`8` → `7`) |
| Keyboard | `↓` `Exceptions` → `Records by asset type`, `↑` back, `Delete` 9 → 8 rows |
| Empty page | *"Nothing on this page yet. Add a widget from Widgets and it will appear here."* |
| 430px | dock hidden, 0px page overflow |
| Console | no errors |

**The inspector, after being extracted into its own component**

| Check | Result |
|---|---|
| Page settings | header, 8 icon choices, rename → the tab strip reads `Renamed` |
| Widget properties | header `Metric / KPI`, label edit reaches the canvas immediately, 7 accent swatches |
| Size | `4 / 12` → `5 / 12` |
| Duplicate / Delete | 8 → 9 → 8 widgets |
| Selects | read stored values, not first options |
| Clear selection | returns to Page settings; `Clear page` empties the canvas |

**A defect this surfaced in the shipped inspector.** Every `<select>` was bound with `[value]` on the
element, which Angular applies before the option loop has created anything — so the assignment matched
nothing and was dropped, and the select displayed its *first* option. Not blank: wrong. Direction read
`up` on a falling KPI, Kind read `column` on a donut, and `Links to` read "(nowhere)" on a button that
did link somewhere — which is exactly the claim the Flow map would then contradict. Fixed by binding
`[selected]` per option, and verified against stored values that are *not* first: `down`, `donut`,
`p-public-private`.

Gate: metadata validation passed, 317 unit tests passed (28 new — 11 over the flow layout, 17 over the
structure and paint orders), all three apps build with no budget warnings.

## 8. Next

1. **Back it with `PageDefinition`.** See §6. This is the decision that determines whether the section
   is a comparison or a product — and with catalog bindings in place the gap is much smaller: a widget
   with a binding is most of a component plus a data source.
2. **Route edges around nodes, not through them.** The three bands keep every *label* clear, and a
   return that passes under a node is still a return crossing a node. Real orthogonal routing is the
   next honest improvement, and it is a bigger piece of work than the bands were.
