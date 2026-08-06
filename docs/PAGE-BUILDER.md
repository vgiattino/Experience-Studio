# The page builder — the MDE editor experience, applied to a page

**What this is.** The Opus EDM console's editor pattern brought whole into the Experience Studio page
builder. Not the paint — that landed with [`CODA-DESIGN-SYSTEM.md`](./CODA-DESIGN-SYSTEM.md) — but the
**structure**: an artifact split into named aspects, each a full-width tab.

`npm run studio` → port 4300.

---

## 1. What MDE actually has

MDE has no feature called "page builder". Every route, every nav label, and a grep for
screen/designer/layout/widget across the codebase says so. What it has is **one editor pattern repeated
across every feature** — and that pattern *is* the experience:

| Idiom | Features using it |
|---|---|
| `workbench` — a searchable list beside a body | 8 |
| `wb-list` with head + filter + items | 8 |
| `ver-pill` / version in the title row | 8 |
| `field-label` form layout | 8 |
| **`tabs` across the body** | **8** |
| `wb-body-toolbar` of icon buttons | 6 |
| `props-grid` | 5 |
| `ai-panel` | 4 |
| `kv-table` | 3 |

The first six landed with the CODA port. The one that had not, and the one that defines an MDE editor,
is the fifth: **the thing you are editing is split into aspects, and each aspect is a tab.** The Data
Generator has *Function Attributes · Function Fields · Validation Rules · Filters & Search · Inbox
Preview*. Metadata Studio has *Attributes · Mapping Matrix · Domains · Lineage · Source Mappings*.

## 2. Why the builder needed it — the arithmetic

A shipped page definition, counted:

| Page | data sources | actions | parameters + filters + selections |
|---|---|---|---|
| exception-management | 8 | 14 | 8 |
| party-overview | 9 | 12 | 6 |
| security-overview | 9 | 10 | 6 |
| security-master-dashboard | 8 | 11 | 6 |
| operations-dashboard | 8 | 10 | 4 |

The canvas can show **none of that**. Before this, a page's eight data sources were reachable only by
selecting each widget in turn and reading a dropdown; its fourteen actions — every drill-down, every
filter chip, every export, the entire interactive behaviour of the page — existed nowhere in the UI at
all. They were authored by reading a 40,000-character artifact by hand in the JSON tab.

## 3. The six aspects

```
┌────────────────────────────────────────────────────────────────────────────────┐
│ 🗎 Exception Management   ⌚v1  DRAFT              8 data source(s)  ★         │
│ ↶ ↷ │ 💾 Save draft ⟲ Discard │ 👁 ▭▯▫ │ − 100% ＋ │              ✓ Valid    │
├────────────────────────────────────────────────────────────────────────────────┤
│ ⊞ Design │ ▤ Data ⑧ │ ▶ Actions ⑭ │ ⚙ Page ⑧ │ 🗎 JSON │ ⌚ History          │
├────────────────────────────────────────────────────────────────────────────────┤
```

| Tab | What it answers | Before |
|---|---|---|
| **Design** | the canvas, with the Properties dock beside it | ✓ |
| **Data** | every source: entity, kind, selected fields **with their aliases**, filter as one line, sort, paging, load policy, cost class, and **which widgets read it** | invisible |
| **Actions** | every action, what it *does* in a sentence, and **what dispatches it** — filterable by kind | invisible |
| **Page** | name and description (editable), then parameters, filter channels, selections, security, presentation, performance | invisible |
| **JSON** | the artifact, full height | in a 21rem dock |
| **History** | the change log, with `origin` | in a 21rem dock |

**Preview is deliberately not a tab.** It is a *mode* of the design canvas, toggled in the toolbar,
because it shows the same aspect with the editing affordances off. A seventh tab would imply the author
was looking at something else.

**The Properties dock stays beside the canvas** rather than becoming an aspect, because it describes
the *selected node* and the selection is made on the canvas. A tab would mean clicking a widget and then
leaving the widget to read about it.

### The two things only these tabs can show

Neither is in the artifact, so neither can be read off the JSON — only computed:

- **Which widgets read a source.** A source does not know its readers.
- **What dispatches an action.** Wiring lives on the *component* (`eventActions`), on a *container*
  (`headerActions`), and on a *binding* (a table column's `action`) — so an action does not know what
  fires it.

Both are recomputed on every read, never stored. A stale index is worse than no index: it tells an
author a source is unused, and they delete something a widget was reading.

### Badges that are warnings

Two of the six badges quietly change meaning. `Data 8` is a count; `Data 1 unread` is a warning — an
unread source costs a gateway round trip on every page load and shows nothing. `Actions 14` is a count;
`Actions 1 unreachable` means an action ships and can never run. Nothing else in the product would ever
mention either.

---

## 4. Three real defects in shipped pages

The Actions and Data tabs found these on their first run over the six shipped definitions. All three
predate this work.

**D1 — a drill-down that could never run, twice.** `drill-to-issuer` on both Exception Management and
Security Master Dashboard: declared, labelled "Open issuer", keyed on `issuer-id` — and nothing
dispatched it. The intent was unambiguous, because in both pages the `issuer-name` column is already
`renderAs: "link"` and `issuer-id` is selected as a hidden field for no other purpose than to key that
drill-down. The wiring was simply never added. Both are now wired
(`"action": "drill-to-issuer"` on the column), so an analyst can go from an exception to the party that
issued the instrument.

**D2 — a data source left behind by a layout fix.** `oldest-exception-age` on Security Master
Operations, feeding a fifth KPI card that was removed when five cards at `colSpan: 3` overflowed the
12-column grid. The card went; the source stayed, querying on every load. Except — see D3 — it turned
out *not* to be dead.

**D3 — my own reverse index was wrong three times, and that is the interesting one.** See below.

---

## 5. Why "unread" is a catch-all scan, not a list of consumers

Three consecutive attempts to enumerate the ways a data source can be consumed each produced a **false**
claim that one was unread. The panel offers to delete what it calls unread, so each was a bug that would
have destroyed a working page:

| Missed consumer | Which source | How it was caught |
|---|---|---|
| a data-driven tab set naming it as the source of its tabs | `rule-tabs` | a test over the shipped artifacts |
| a panel's `headerActions` reaching an export action | `export-rule-queue` | the same test |
| **an expression** reading `$data.<source>.<alias>` in a text widget's config | `oldest-exception-age` | **the validator**, after I deleted it |

The third made the pattern clear. A source id can legitimately appear anywhere in the artifact,
including inside an expression string, and any enumeration of consumers is a list of the places one
happened to think of. So the rule is inverted:

- `readers` still names the components that **display** it, because the panel offers "select the
  widget";
- **"unread" now means the id appears nowhere else in the artifact at all**, reported with the JSON
  Pointers where it does appear.

The cost is a false *negative*: a genuinely dead source whose id appears in some incidental string would
not be flagged. That is the right way round — failing to mention a wasted query is a missed
optimisation; wrongly offering to delete a live one loses an author's work.

`removeDataSourceIfUnused` applies the same rule, re-checked against the definition the patch will apply
to rather than the panel's summary: between a render and a click the author may have bound a widget.

---

## 6. Everything the panels do is an ordinary edit

Renaming a page from the Page tab, deleting an unread source from the Data tab — each is a `Command`
from `@opus/studio-core`, one patch, one undo, recorded in History. There is no path in any panel that
writes a patch by hand, because a hand-written patch is a mutation the command layer's tests do not
cover.

`addBoundWidget` and `removeDataSourceIfUnused` were both added as commands rather than as panel logic
for exactly that reason.

A selection made *off* the canvas — "select the widget that reads this source", "select what fires this
action" — brings the canvas back. That effect lives in the shell, not the panels: the shell owns which
aspect is showing, and a panel that switched tabs itself would need to know about the strip, as would
every future panel.

---

## 7. Verification

`libs/studio-core/src/describe.spec.ts` — 24 tests. The rendering tests check that a filter tree and an
action read correctly; the **reverse-index tests** check the two claims an author acts on
destructively, against every shape that would produce a false positive. The last two run every shipped
page through the summariser, because the honest test of a describer is real artifacts rather than
fixtures written to satisfy it.

Driven in Chromium at 1680px and 430px, both themes:

| Check | Result |
|---|---|
| Aspect strip | `Design │ Data 8 │ Actions 14 │ Page 8 │ JSON │ History` |
| Data | 8 cards, ref *and* alias per field, filters rendered as one line, readers as links |
| Actions | 14 cards, 8 kind filters derived from the page, one-sentence summaries |
| Page | 5 sections; parameters showing `in URL` / `optional`; governance showing `renderBudgetMs 2500 · maxEagerDataSources 8` |
| JSON | 39,994 characters, 696px tall (was 384px — it was sized for a dock) |
| Jump to canvas | Actions → `w-search-bar` selected on Design; Data → `w-kpi-open` |
| Edit from an aspect | rename → Unsaved + 1 history entry → one undo → clean |
| All six pages × all six tabs | every tab renders; no false warnings remain |
| 430px | 0px horizontal overflow, cards intact |
| Console | no errors |

Gate: metadata validation passed, **313** unit tests passed, all three apps build.

---

## 8. Where things live

```
libs/studio-core/src/describe.ts            pure summaries + the reverse indexes (no DOM, no Angular)
libs/studio-core/src/commands.ts            removeDataSourceIfUnused, addBoundWidget
libs/studio-ui/src/sources-panel.component.ts    the Data aspect
libs/studio-ui/src/actions-panel.component.ts    the Actions aspect
libs/studio-ui/src/page-panel.component.ts       the Page aspect
libs/design-system/styles/chrome.scss       kv-table, props-grid, section-label, item-card, tag
apps/studio/src/app/app.ts                  the aspect strip, the badges, the dock
```

## 9. What a follow-on should pick up

1. **Editing an action.** The Actions tab reads and navigates; it does not edit. Doing it properly means
   a form built against `action.schema.json` — a discriminated union of thirteen kinds, with conditions
   and computable values — not a text box, because a text box produces artifacts the validator rejects
   and gives the author no way to see why. That is a milestone.
2. **The same for parameters, filters and security.** The Page tab shows them and says plainly that it
   does not edit them. Each needs a schema-driven form for the same reason.
3. **Add a data source from the Data tab.** `createDataSource` exists and the catalog projection is
   already in the editor; what is missing is a picker over entities and measures. That would make the
   Data tab the place a page's data is *authored*, not only reviewed.
4. **A cost estimate per source.** The tab shows the declared `expectedCostClass` and whether a source
   is unfiltered. The catalog also carries `typicalRowCount`, so an actual estimate — "this scans ~48M
   rows" — is derivable and is the number that would change an author's mind.
