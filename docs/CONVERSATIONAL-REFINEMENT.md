# Conversational refinement

Status: **Engine built and verified against the shipped standard pages. Not yet wired into the builder.**
Requirements: [`PRD.md`](./PRD.md) §10 · §11 · §12 · §15 · §19 · §28, FR-08 · FR-10 · FR-11 · FR-12
Code: `libs/generation/src/refine.ts`

---

## 1. What was missing

`assist.ts` answers *"what is this page missing?"* and proposes **additions from the catalog**. Every
worked prompt in this PRD is a **change to what is already there**:

| Prompt | § |
|---|---|
| "Change the pie chart to a bar chart." | §11 |
| "Move this chart above the grid." | §11 |
| "Remove the security type column." | §12 |
| "Group the grid by issuer." | §12 |
| "Highlight securities with unresolved exceptions." | §12 |
| "Move the exceptions panel to the top." | §15 |

Assist could not express one of them. That is why FR-08 was the largest gap in the reconciliation
despite the *model* supporting every one of these edits already.

## 2. Why the engine is small

`libs/studio-core/src/commands.ts` already has every mutation these verbs need — `moveNode`,
`setComponentConfig`, `setBindingField`, `setValue`, `setPageProperty`. A person can already do all of
it by hand in the builder's inspector.

So refinement is **not new mutation machinery**. It is two things the codebase did not have:

1. a closed vocabulary of what may be asked for, and
2. **reference resolution** — turning "the pie chart" into a component id.

The second is the hard half.

## 3. The vocabulary

Nine verbs, closed. A verb that is not here cannot be requested, which is what stops a refinement from
producing markup, an expression, or a component type outside the registry.

| Verb | § | Commands it maps to |
|---|---|---|
| `add-column`, `remove-column` | §12 | `setBindingField` / binding edit |
| `sort-rows` | §12 | `setValue` on the data source's `sort` |
| `group-rows` | §12 | `setComponentConfig(groupBy)` |
| `highlight-rows` | §12 | `setValue` on the binding's `conditionalFormats` |
| `change-chart-type` | §11 | `setComponentConfig(mark)` |
| `move-widget` | §11, §15 | `moveNode` |
| `set-drilldown` | FR-12, §9 | `setPageProperty` / event action |
| `retitle-widget` | — | `setValue` |

## 4. A reference that does not discriminate produces a question

The rule product identification uses, for the same reason. "Change the chart to a bar chart" on a page
with three charts has not said which. Picking the first is a wrong answer produced quietly, and the
author may not notice until the page is in front of somebody else.

**Scoring**, in descending strength: a word from the widget's own **title** (3), a **config value** the
user named — "pie", "bar", "severity" (2), a **kind synonym** — "grid", "figure", "panel" (2). The
runner-up may reach 80% of the leader before the answer becomes a question.

### A named kind narrows before anything is scored

This was a defect before it was a design, and it only showed up on a real page.

*"Move the securities table to the top"* on the shipped Security Master Dashboard resolved to a **text
widget** titled "Security master coverage" and a **filter bar** titled "Find a security" — because a
title word scores 3 and the kind word "table" only 2, so two irrelevant widgets outranked both actual
tables.

Naming a kind is a **constraint, not a hint**: "the securities table" means *among the tables*, the
securities one. So a named kind filters the candidate set first, and only then are titles scored.
"a security" names no kind and leaves the field open.

### Two passes, and the order is the design

1. Resolve against the **eligible** widgets — the ones that can take this verb at all.
2. Only if nothing eligible matched, resolve against **every** widget, to produce the message.

Both orderings refuse the same requests; only this one explains them. Asked to *"group the grid by
issuer"*, resolving against eligible widgets alone answered *"nothing on this page matches the grid"* —
while the grid was plainly on the screen. The reference was fine; the grid cannot group.

### Field narrowing when no widget is named

*"Sort by exception count"* names no widget, and two widgets have sortable rows. The **field** does the
disambiguating: `exception-count` belongs to the securities source and not to the exceptions one, so
exactly one widget can serve it. Grounding narrowing a reference, rather than guessing at one.

Where the field narrows to more than one, it still asks.

## 5. Every refusal names what is available

A refinement that fails with "cannot do that" teaches the author to stop asking. One that lists the
chart types teaches them the vocabulary.

```
“pie” is not one of the chart types this component offers.
It supports “bar”, “line”, “area”, “point”.

“Securities” does not offer grouping — grouping is a property a component declares,
and data.table does not. On this page “Open Exceptions” does.

“sector” is not a field shown on “Recently added instruments”.
Available: name, isin, sedol, asset-class, issuer-name, country-of-risk, review-status, …
```

The first of those is worth dwelling on: **§11's own first example asks for a pie chart, and
`analytics.chart` does not offer one.** Refusing by name is the honest answer, and more useful than
silently choosing `bar` — which would leave the author believing pie charts work.

## 6. Explainability — §19

Each refinement carries its own sentence, generated where the change is decided rather than in a
template, because the wording is a requirement:

> "I've added an Exception Status column to the Security grid and configured rows with unresolved
> exceptions to display as highlighted." — §19

```
Removed the currency column from “Instruments in this asset class”.
Changed “Coverage by asset class and review state” from a bar chart to a line chart.
Grouped “Full queue” by assignee.
Sorted “Breaks for this rule” by severity, highest first.
Activating a row in “Recently added instruments” now opens the security-overview page.
Configured rows in “Securities” with a exception-count value to display as highlighted.
```

## 7. Nothing here mutates anything

Mined from the parked builder's `ai/ai.service.ts`, whose rule this keeps verbatim: **a proposal is not
an action.** This module returns resolved refinements and a sentence; the caller turns them into
commands and the author accepts or discards. A refinement carries a component id and a value — never a
JSON pointer and never a patch, because a vocabulary that could express those could express edits the
command layer refuses.

## 8. Rules, working without a provider

`interpret()` is deterministic, for the reason `assist.ts` gives about its analyser: an authoring aid
that stops working when the model endpoint is down is an authoring aid nobody relies on. The patterns
are the PRD's own sentences.

A provider, when installed, is held to `REFINE_RESPONSE_SCHEMA` and emits **the same
`RefinementIntent`** the rules do — so resolution, grounding and explanation are shared, and the model's
only job is the part rules are bad at: reading a sentence. The schema cannot express a component id, a
pointer or a patch.

## 9. Four defects the real pages found that the fixtures did not

Recorded because each is a lesson about the fixture, not only about the code.

| Defect | How it showed |
|---|---|
| **`component` vs `componentId`** | My fixture put `componentId` on widget nodes. The contract's field is `component`, and the node id differs from the component id — `{ id: 'w-recent-table', component: 'recent-table' }`. Every move on every real page refused with "not inside a container that can be reordered" while every test passed. `moveNode` operates on the **node**, so `RefineWidget` now carries both |
| **Grouping is a config enum, not a field** | `business.exception-queue` declares `groupBy: severity \| rule \| assignee \| none`. Resolving *"group the queue by assignee"* against the data source refused it, because the field is spelled `assigned-to` — and told the author `assignee` was unavailable when `assignee` was exactly right |
| **The y→ies plural** | `"securities".startsWith("security")` is **false** — they diverge at the boundary — so *"when the user double-clicks a security"* matched nothing on a page full of widgets titled "Securities". Stemming both sides fixes what prefix matching cannot |
| **Trailing full stops** | Every prompt in the PRD is a sentence and ends with one. Patterns anchored on `$` matched none of them |

## 10. Known limits

| | |
|---|---|
| **`move-widget` reorders within a container** | "Top" means the top of the widget's own section, not of the page. On a page where each widget sits in its own panel that makes the answer "already at the top" for nearly everything — literally true, and not what the author meant. Moving between containers is a larger change; the refusal says so and suggests "above …" instead |
| **No pie chart** | §11 asks for one and `analytics.chart` offers bar, line, area, point. A component gap, refused by name |
| **`data.table` cannot group** | Manifest-driven, so adding a `groupBy` property to the table needs no change to this engine |
| **One verb per turn** | "Add issuer and currency" is two refinements and `interpret` returns one. Splitting a conjunction is straightforward and not done |
| **Not wired into the builder** | The engine is complete and tested; the panel that calls it, the conversation state (§14, FR-09) and the accept/discard gesture are the next step |
| **`highlight-rows` needs a condition** | It resolves the field and explains itself; what value counts as "unresolved" is not modelled, so the caller must supply the comparison when turning it into a `conditionalFormats` entry |

## 11. Verified

Against the real shipped `securities-operations` standard, on two of its pages:

```
══ Security Master Dashboard
  refused    "Move the recently added instruments to the top"
             already at the top of the section it is in …
  resolved   "Move the chart above the recently added instruments"
             Moved “Coverage by asset class and review state” before “Recently added instruments”.
  resolved   "Change the coverage chart to a line chart"
  refused    "Remove the sector column from the recently added instruments"
             not a field shown on … Available: name, isin, sedol, asset-class, …
  resolved   "When the user clicks a row in the recently added instruments, take them to the
              security overview"

══ Exception Management
  resolved   "Group the queue by assignee"
  resolved   "Group the full queue by rule"
  resolved   "Change the chart to an area chart"
  resolved   "Sort the rule breaks by severity descending"
```

772 tests, of which 60 are this module's, and every prompt in `refine.spec.ts` is the PRD's own.
