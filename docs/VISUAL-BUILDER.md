# Visual Page Builder — Implementation Record

Status: **Delivered**
Scope: select a page, view its components, drag and drop them, edit properties, change layouts,
preview responsive behaviour, save the definition.
Related: [`../architecture/frontend-architecture.md`](../architecture/frontend-architecture.md) §4.3 ·
[`M1-IMPLEMENTATION.md`](M1-IMPLEMENTATION.md) ·
[`AI-GENERATION-WORKFLOW.md`](AI-GENERATION-WORKFLOW.md)

---

## 1. The One Constraint

> **The editor modifies the same JSON page model the runtime uses. There is no second model.**

That is not a stylistic preference, and it is not achieved by convention. It is enforced by the
shape of the code:

- **There is no editor-side scene graph.** Every position the editor can talk about is a JSON
  Pointer into the page definition (`layout-tree.ts`). Selection is an id the definition gave the
  node. The outline is a projection of `definition.layout`, computed on demand.
- **Every mutation is a JSON Patch** produced by a pure function of the current definition
  (`commands.ts`) and applied through one store (`definition-store.service.ts`).
- **The canvas is the production renderer**, `PageRendererComponent`, used exactly as the Viewer
  uses it, loaded through the same `migrate → validate → compile` path.
- **The JSON tab shows the artifact itself** — the same bytes a save writes and the runtime loads.
  If the builder had a model of its own, that panel would be a lossy export and the difference
  would be visible immediately.
- **Saving is `JSON.stringify`.** No editor envelope, no sidecar of canvas positions. That the
  serializer is that trivial is the design assertion, not a shortcut.

**Verified end to end:** a KPI added in the builder, bound to the business measure *Late Files*
chosen from the catalog, saved as a draft, and then rendered by the **Viewer** from those exact
bytes — showing `Awaiting Files 90` alongside the four original figures, every widget `ready`,
zero console errors.

---

## 2. Capabilities

| Asked for | Where | Notes |
|---|---|---|
| **Select page** | Top-bar picker | Pages come from the experience definition, so adding a page to the experience makes it appear with no editor change. Drafts are marked `•`; switching away from unsaved work asks first |
| **View components** | Outline + canvas | The outline is the layout tree with type and child counts; the canvas is the live page |
| **Drag / drop** | Palette → outline or canvas; outline → outline | Three drop positions — before, after, inside — with distinct indicators. Full keyboard equivalent: `↑↓` to move the selection, `Alt+↑↓` to reorder, `⌫` to delete |
| **Edit properties** | Inspector | **Generated from the manifest's JSON Schema.** Title/subtitle/description, every declared `config` property, and data bindings from the manifest's roles crossed with the source's aliases |
| **Change layouts** | Inspector | Container type (grid / stack / panel / split) preserving children, gap, direction, wrap, panel title and variant, split orientation; plus placement per breakpoint |
| **Preview responsive** | Top-bar widths | Five device widths plus Fit. The renderer reports the breakpoint it resolved, and a mismatch is flagged |
| **Save page definition** | Save draft (`⌘S`) | Written as `lifecycleState: draft`, `immutable: false`. Publication is a separate reviewed act the editor has no authority to perform |

Beyond the list, because the mechanism made them nearly free: undo/redo over every change
(`⌘Z` / `⇧⌘Z`), a patch log tagged by origin, continuous validation with the level names, a
clickable findings list, duplicate, wrap-in-container, and a JSON escape hatch.

### The inspector is generated, not hand-built

The manifest's `properties` is already a JSON Schema validated at level 2, so it is the only
description of a component's configuration that exists — and therefore the only one an editor
should read. `enum` → select, `boolean` → checkbox, `string` → text or textarea by `maxLength`,
`integer` → number with min/max, anything else → a raw JSON field. `description` becomes help
text, `default` seeds a new instance, and `generation.keyProperties` — which exists to tell the
*model* which options matter — orders the fields for the *human* too.

Hand-built inspectors are why low-code platforms stop adding components: every new component
needs a form, the forms drift from the schemas they claim to edit, and validation says one thing
while the UI allows another.

### Responsive preview needed no new machinery

`PageRendererComponent` resolves its breakpoint from a `ResizeObserver` on **its own element**,
not the viewport (`frontend-architecture.md` §5.3). Constraining the canvas width therefore
genuinely changes what the renderer reports — no iframe, no media-query emulation, no second code
path. Had that decision gone the other way, an honest responsive preview would have required an
iframe and a second bootstrap.

Measured, mobile-first cascade intact:

| Preview | Frame | Renderer reports | KPI width |
|---|---|---|---|
| Phone | 390 px | `xs` | 364 px (full) |
| Large phone | 600 px | `sm` | 279 px (half) |
| Tablet | 900 px | `md` | 417 px (half) |
| Laptop | 1280 px | `lg` | 296 px (quarter) |
| Desktop | 1680 px | `xl` | 396 px (quarter) |

---

## 3. Architecture

```
apps/studio/                 second application, sharing one renderer (decision F1)
libs/studio-core/            the editing model — depends on contracts + platform only
  json-patch.ts              RFC 6902 apply and exact inversion
  layout-tree.ts             pointers into the definition; no parallel structure
  commands.ts                the editing vocabulary, as pure definition → patch functions
  definition-store.service.ts  one document, one patch log, undo as the inverse patch
  selection.service.ts       selection and preview width — deliberately NOT in the store
  draft-store.service.ts     stands in for the Definition Service
libs/studio-ui/              panels; each is a view and a producer of patches
  palette / outline / inspector / canvas / history-panel / json-view
  editor.service.ts          the only place drop resolution lives
  property-schema.ts         manifest JSON Schema → inspector fields
```

`studio-core` knows nothing about Angular components, the DOM, or drag events, which is why the
whole editing vocabulary is testable as pure functions — **62 of the 238 tests** are of this
library and the drop resolver.

### One command is one patch

Deleting a widget removes its layout node, its component instance, **and** its data source if
nothing else reads it — as a single patch, so one undo restores all three. Three patches would
make the user press undo three times to reverse one action they think of as one, and would leave
the definition briefly invalid in between.

### Selection is not an edit

`SelectionService` is separate from the store on purpose. Selection in the patch log would make
undo step backwards through clicks, and a saved definition would carry whichever widget happened
to be selected.

### Dirty is measured, not flagged

`dirty` compares the current history sequence against the last saved one. A boolean flag gets one
case wrong, and it is the case users notice: edit, then undo back to the saved state — the
document matches what is on disk and a flag still says unsaved.

---

## 4. What Building It Found

Seven defects, and the important thing is that **four of them share one root cause**.

### `(id, artifactVersion)` is not content identity

That pair identifies a *published, immutable* artifact and nothing else. It had been used as
content identity in four places, and each produced a different symptom:

| Where | Symptom |
|---|---|
| `compilePage` cache | Fixed during the AI work for definitions marked `immutable: false` — **but the check was necessary, not sufficient** |
| `PageLoaderService.loadDefinition` | The builder opens a **published** definition and edits the working copy, so the earlier fix did not apply: the canvas rendered the version first loaded, forever, while the JSON view and the Viewer both showed the edit. Now bypasses the cache for any in-memory definition, because a caller holding an object can mutate it while keeping both fields |
| `PageRendererComponent` attach guard | Keyed on `page.cacheKey`, so the renderer attached once per page id and never re-attached. A data source added mid-session was never queried and its widget sat at `—` forever. Now keyed on the compiled page's **object identity**, which is precisely the distinction the guard wants: a cache hit returns the same object, a recompile a new one |
| The Studio's working copy | Opening a published artifact for editing does not edit the published artifact, so carrying `published` / `immutable: true` on the document being mutated was a false claim — and one the cache was entitled to believe. The working copy is stamped `draft` at open |

The lesson is not "fix the cache". It is that an identity valid under one invariant gets reused
where the invariant does not hold, and each reuse fails differently and quietly.

### Three more

| Finding | Fix |
|---|---|
| `inside` drops resolved to `Number.MAX_SAFE_INTEGER` as an append sentinel, which the commands passed through as an array index — so the patch was rejected and **dropping into a container did nothing**, while dropping beside one worked | Append is an *absent* index. And the refusal now reaches the UI: the silence is what hid it |
| Async renders raced. One inspector action can produce two patches in a tick — create a data source, attach it — and the earlier render could resolve last, putting the older page back on screen | A monotonic render token; a stale result is discarded |
| A data source created over a `requiresFilter` entity would fail level 3, and the builder has no filter UI — so the author would be handed an invalid page with no way to fix it | `createDataSource` accepts a mandatory filter, which the inspector derives from the catalog |

### And two defects in artifacts that had shipped

The builder validates continuously **with a catalog**, so it ran level 3 against the M1 pages the
moment it opened them — and reported both as invalid:

- `processing-detail` aggregated `row-count`, which is an **attribute**; the measure over that
  column is `rows-processed`.
- `security-master-operations` selected `age-hours` as an **attribute** of `dq.exception`, where
  the catalog declared it only as a measure.

Both had rendered correctly for the whole of M1, because the mock gateway reads whatever column
name it is handed. Against a catalog-backed gateway the first would have failed outright.

Nothing in CI compared the two artifacts that have to agree: `npm run validate` checks structure,
the unit tests check synthetic pages semantically, and neither validated the *real* pages against
the *real* catalog. `libs/validator/src/shipped-artifacts.spec.ts` now does, and it is the check
that should have existed since level 3 landed.

The catalog fix is worth noting as modelling rather than repair: `age-hours` is a stored numeric
column, legitimately both a displayable attribute and an aggregatable measure, so it is now
declared as both. That in turn exposed a gap in the schema set — `measure.valueType` and
`formatSpec.style` both admit `duration` and the platform formatter implements it, while
`attribute.semanticType` had no such member, so one column could not be described consistently on
both sides. Recorded in `schemas/README.md` §7.

---

## 5. Verified

Browser-verified with Playwright at 1600 px, on the real Security Master Operations page.

| Claim | Evidence |
|---|---|
| Pages come from metadata | Picker lists the experience's pages; drafts marked and reopened after reload |
| The outline is the definition | 13 rows matching `walkLayout`, ids identical to the JSON |
| Palette is manifest-driven | 4 components + 4 containers + spacer, filtered to what the registry resolves |
| Drag from palette | Real HTML5 drag into `kpi-row`: 8 → 9 components, node appended to that container |
| Drag to reorder | Outline drag moved the last KPI before the first; order changed in the JSON |
| Canvas selection | Click on a KPI selected `w-kpi-late`; the inspector followed |
| Generated properties | Size, Show Threshold Band, Show Trend Arrow, Comparison Label, Alignment — from `kpi-card.manifest.json` |
| Property edits patch the definition | `config.size → lg`; `title → "Late Files (edited)"` |
| Placement per breakpoint | base `colSpan 4`, then `lg: 2`, cascade preserved |
| Container type change | `panel → stack`, child kept |
| Responsive preview | Five widths, renderer reporting `xs`/`sm`/`md`/`lg`/`xl`, KPI widths following the cascade |
| Undo is exact | 8 changes undone back to the published definition; redo restored it **byte-for-byte** |
| Catalog-driven binding | Entities and measures offered by business name; created source in runtime shape with the alias bound |
| Invalid mid-edit is survivable | Adding an unbound widget → status `✗ Invalid · 1 finding`, canvas keeps the last good render with a warning |
| Save | `lifecycleState: draft`, `immutable: false`, dirty clears, draft reopens after reload |
| **Round trip** | The saved bytes rendered by the **Viewer**: 5 KPIs, all widgets `ready` |
| Console | no errors |

`npm run verify`: metadata validation, **238 unit tests**, both application builds.

Run it: `npm run studio` → <http://localhost:4300>.

---

## 6. Not Yet Built

| Absent | Consequence | Milestone |
|---|---|---|
| A Definition Service | Drafts live in `localStorage`. No version history, no diff-and-restore, no concurrent editing, no server-side validation before write | M4/M7 |
| Publishing | The builder can only write drafts. Promotion, review and separation of duties are the governance layer | M7 |
| Tabs and repeaters in the UI | Both are expressible in the definition and reachable through the JSON view, but a one-click add would produce an empty container and a validation error. They need a data source and their own inner flow | M4 follow-up |
| Filter, action and overlay editing | Only the mandatory filter a `requiresFilter` entity needs is generated. Page filters, parameters, actions and drill-down targets are JSON-view only | M4 follow-up |
| Template library | Save-as-template, browse and instantiate. The AI side already has a template corpus; the builder cannot yet contribute to it | M4 follow-up |
| Direct canvas resize | Column span is edited numerically in the inspector, not by dragging a widget's edge | M4 follow-up |
| AI refinement into the same store | `DefinitionStore.apply(ops, label, 'ai')` exists and is tested, and the history panel already renders an `ai` origin — but the generator re-plans rather than emitting a patch, so the two are not yet connected | M6 |
| Multi-select | One node at a time | M4 follow-up |

The last one on that list is the interesting one: the store was built so that AI refinement and
direct manipulation are the same operation, and the plumbing on the editor side is done and
covered by a test that interleaves a manual patch with an `ai` patch and undoes across both. What
remains is on the generation side.
