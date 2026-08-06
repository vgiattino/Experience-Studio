# The catalog behind the EDM Page Builder

**What this is.** The step that turns the EDM Page Builder from a sketching tool into a builder over
governed data. A widget can now *read a measure* instead of carrying a typed-in number, the AI plans in
the catalog's vocabulary instead of inventing titles, and every figure on the canvas is what the Data
Gateway returned for this author's entitlements.

`npm run studio` → port 4300 → **Reference → EDM Page Builder** → ask for "late file loads by source".

---

## 1. What changed

| Before | Now |
|---|---|
| A KPI held `value: "94%"` — a literal somebody typed | It holds `binding: { entity: 'processing.file-load', measure: 'late-file-count', aggregation: 'count' }` and shows what the gateway returned |
| A chart held its own array of numbers | It holds a measure and a dimension; the bars are the real breakdown by source |
| A table held literal rows | It holds columns; the rows are real file names and business dates |
| The AI named things — "Late file loads" — for somebody to bind later | It names *refs*, and the widget's label comes from the catalog's `businessName` |
| A generated figure read `—`, because nothing could be bound | It reads `90`, formatted by the catalog's own `format` spec, with a **live** badge |
| Nothing knew whether a figure was real | Every bound widget wears its state: `live`, `partial`, `denied`, `no rows`, `incomplete` |

Widgets without a binding behave exactly as they did. That is deliberate, not a hedge: a sketch needs
literal values, and the fallback is what a bound widget draws when its query cannot be answered.

## 2. It reuses the platform's data path — there is no second one

The studio app already loads the catalog and configures the gateway, because its *own* builder renders
live data. The EDM builder injects those same two services.

| Reused | What it gives |
|---|---|
| `CatalogService.projectionFor(author)` | The **entitlement-scoped** catalog. An author who cannot see a column is not shown it greyed out — the projection they were handed never mentioned it, which is the difference between hiding a field and not disclosing that it exists. |
| `GatewayService` | One batch per page — the unit the gateway audits and costs. Its cache is keyed on the source, the params *and* the caller's resolved entitlement scope; this code does not memoise on top, because a second cache with a key of my own choosing is how rows cross users. |
| `DataSource` | The platform's query contract, the same shape the runtime renders and the validator checks. The builder says what it wants in business terms and is told what it is allowed to have. |
| `formatValue` | The catalog's `format` spec decides how a figure reads, so a percentage is a percentage and a date is a date without this screen deciding. |

**Every status is shown, including the unhappy ones.** A denied query says so on the widget. An entity
the gateway refuses unfiltered says so *before* the query, because a `costRejected` result reads like a
fault when it is a design mistake. The alternative — an empty chart — is indistinguishable from "there
is no data this week", and the two need completely different actions.

## 3. Grounding: what a binding is checked against

`checkBinding` runs before a proposal is shown and again before every query. Each arm is a mistake a
model or a stale stored design can make, and each would otherwise surface as an empty widget:

| Wrong | What happens |
|---|---|
| An entity not in the projection | The binding is dropped. The message is deliberately one message for two causes: *"does not exist or you are not entitled to it"*. |
| A measure or attribute not on that entity | Dropped, named. |
| An aggregation the measure forbids — `avg` on a count | **Corrected** to the measure's default, and said. The author's intent was the measure. |
| A dimension the catalog says is not groupable | Dropped, said. |
| A chart with a measure and no breakdown | Left unbound. One bar is a mistake that *renders*, which is the worst kind. |

The inspector's pickers are built from the same view, so an illegal aggregation is not an option to be
validated away later — it is simply not in the list. And a bound widget loses the fields the binding
supplies: a bound KPI has no **Value** box, because a control that silently does nothing is worse than
no control.

## 4. What the AI does differently now

The first question is no longer "which widgets" but **"which governed thing is this about"**, and the
widgets follow from what that thing actually has. An entity with no measures gets no metrics — not three
metrics with invented names.

```
"late file loads by source with a trend and a table"
  → matched to File Load by its name, "File Load"
  → Late Files            late-file-count · count          live  90
  → Files Processed       file-load-count · count          live  90
  → Failed Files          failed-file-count · count        live  90
  → Late Files by Source        + source-system            live  6 bars
  → Late Files by Business Date + business-date            live  3 points
  → File Loads detail     4 attributes                     live  rows
```

Tests assert the properties rather than the output: every ref it names exists, every measure is on the
entity it named, every dimension is groupable, every aggregation is allowed, and an author narrowed to
one capability **cannot** get a binding to an entity outside it.

When nothing matches, it says what the catalog *does* hold — *"Your catalog covers data quality
exceptions, file loads, parties and securities — none of which matches this request"* — because
"nothing matched" leaves an author with no next move and a list of what is available is the next move.

## 5. The finding that matters most: two names, one number

The generated page shows **Late Files 90, Files Processed 90, Failed Files 90**.

That is not a bug in this builder, and it is not something this builder can fix. The fixture catalog
defines `late-file-count` and `failed-file-count` as counts "over a filter" — and does not say what the
filter is. The gateway can only count rows, so all three come back as the row count.

So the review reports it:

> **3 measures returning the same number** — "Late Files", "Files Processed", "Failed Files" all show 90.
> They are different measures on the same entity, so the catalog does not define what distinguishes them
> — nothing on this page can fix that, and a reader will take the figures at face value. Ask your catalog
> owner what makes each one different.

This is the only finding that reads the *answers* rather than the design, and it earns the exception.
The condition that makes a file "late" is business meaning; inventing it here would be worse than
reporting it. **A page builder that surfaces a catalog defect is doing its job; one that renders it
confidently is not.**

The review also gained two ordinary catalog findings: widgets still showing typed-in numbers (*"they
will never change, whatever the data does"*), and bindings that have gone stale because the catalog moved
or entitlements were withdrawn.

## 6. A build defect this uncovered

One `tsconfig.app.json` with `include: apps/*/src/**/*.ts` was shared by all three app builds, so **every
app compiled every other app**. Two consequences, and the second is the one that bit: builds did three
times the type-checking they needed, and each app's component-style budget policed components it does not
ship — the Viewer's 8kB budget was failing a Studio-only renderer that is tree-shaken out of the Viewer's
bundle entirely.

Each app now has its own tsconfig covering itself and the libraries. The root one stays, for asking
"does the whole repository still type-check together" in one command. Twice on this change I contorted a
stylesheet to satisfy a budget that should never have fired; the second time I looked at why it fired.

## 7. Verification

Driven in Chromium at 1680px and 430px, both themes, against the real catalog and gateway.

| Check | Result |
|---|---|
| Generate | *"late file loads by source"* → `File Loads by Source`, 6 of 7 widgets bound, *"matched to File Load by its name"* |
| Titles | from the catalog: `Late Files`, `Files Processed`, `Failed Files`, `Late Files by Source` |
| Purposes | the catalog's own descriptions — *"Count of loads past their expected time and not yet complete"* |
| **Figures** | `90`, badged **live**, formatted by the measure's spec |
| **Chart** | 6 bars, labelled `Bloomberg · Refinitiv · ICE · SIX Financial · Client Feed · Markit` — real source systems |
| **Trend** | 3 points by `business-date`, labelled `2026-08-06 · 2026-08-05 · 2026-08-04` |
| **Table** | columns `LOAD ID · FILE NAME · SOURCE · BUSINESS DATE`; rows `LD000001 · bloomberg_security-master_20260804.csv · Bloomberg · 06 Aug 2026` |
| Inspector | Entity `File Loads`, Measure `Late Files`, Aggregation `count` of `count \| sum` only, with the measure's description |
| Bound fields | a bound KPI offers `Label · Accent · Data`; an unbound one still offers `Value · Delta · Direction` |
| Rebind by hand | one undo step, labelled *Bind to the catalog* |
| **Same-number finding** | `3 measures returning the same number` — raised as a problem, not polish |
| Unbound findings | 5 seeded pages flagged, `3–5 widget(s) show typed-in numbers` each |
| No match | names what the catalog covers instead of failing |
| 430px | 0px page overflow |
| Console | no errors |

**Five defects the browser found, all fixed:** the page title read *"File Loads by Source With a Trend
and a"* (the "by …" capture ran past the conjunction); *"Shows where the late files is concentrated"*;
*"Failed Files — Failed Files."* as a purpose; a page request typed while a widget happened to be
selected came back as *"I did not understand that"*; and the bound-KPI **Value** field described above.

Gate: metadata validation passed, **405 unit tests** (36 new), all three apps build with no budget
warnings.

## 8. Next

1. **Filters on a binding.** The query shape already carries them and `checkBinding` already validates
   them; there is no UI. Until there is, an entity the gateway refuses unfiltered cannot be bound — and
   the widget says exactly that rather than failing.
2. **Back the whole thing with `PageDefinition`.** With bindings in place the gap between this model and
   the platform's is much smaller: a `Widget` with a binding is most of a component plus a data source.
   This is the change that would make the section a feature of the product rather than a recreation of
   another one's — see `EDM-PAGE-BUILDER.md` §6.
3. **Thresholds and `higherIsBetter`.** The catalog carries both; a bound KPI could colour itself from
   the measure's own bands instead of an accent the author picked.
4. **A real model.** Unchanged from `EDM-PAGE-BUILDER-AI.md` §8, and now more valuable: with a grounding
   pack of real entities and measures in the prompt, the difference between a rules stand-in and a model
   is the difference between matching words and understanding a request.
