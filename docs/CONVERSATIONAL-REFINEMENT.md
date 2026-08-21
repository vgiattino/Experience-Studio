# Conversational refinement

Status: **Built, wired into the builder, and verified in a browser against the shipped standard pages.**
Requirements: [`PRD.md`](./PRD.md) §10 · §11 · §12 · §14 · §15 · §19 · §28, FR-08 · FR-09 · FR-10 · FR-11 · FR-12
Code: `libs/generation/src/refine.ts` (resolve) · `libs/studio-ui/src/refine.service.ts` (apply) ·
`libs/studio-ui/src/refine-panel.component.ts` (the transcript)

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

## 7. From a sentence to a patch — the three layers

```
@opus/generation      a sentence  → a resolved refinement + its §19 sentence   knows nothing about editing
@opus/studio-core     a refinement → a Command (JSON Patch ops)                knows nothing about AI
libs/studio-ui        the only thing that knows both, and the smallest
```

The layering is what makes the panel's central claim true: **an accepted refinement is an ordinary
edit.** One turn arrives as **one patch tagged `origin: 'ai'`**, undo reverses a whole sentence in one
press, the history panel shows it beside hand edits, the validator runs on the result, and the
definition never enters a state only an AI edit could produce.

One patch per **turn**, not per refinement. A turn is what the author asked for, so it is what undo has
to reverse — two patches would make one sentence take two presses and the author would have no way to
know which sentences were which.

Each verb maps to machinery that already existed, and where it lands is itself a decision:

| Verb | Where it lands | Why there |
|---|---|---|
| `sort-rows` | the **data source's** `sort` | The gateway applies it server-side, so the sort survives paging. A client-side sort of the first page is a different and much worse feature |
| `add`/`remove-column` | the column **binding** | Where the renderer reads columns from |
| `highlight-rows` | `conditionalFormats` on the column binding | A format belongs to the column it colours, which is also why highlighting resolves against *shown* columns |
| `group-rows` | `config.groupBy` | A declared component property, validated against the manifest's enum |
| `move-widget` | `moveNode` on the layout **node** | Not the component — see §9 |

### Two verbs that resolve and cannot land, said out loud

A refinement that resolves and then quietly does nothing is the worst of the three outcomes, because the
author has been told it worked. Both are listed rather than silently absent:

- **`set-drilldown`** — drill-down targets live on the *experience* and this builder edits one page, so
  the applier names that reason. The resolver's own refusal ("this experience has only one page") is the
  wrong reason for the right answer, which is why the applier carries its own.
- **`highlight-rows` on an attribute** — a *measure* is a count, so "highlight rows with exceptions"
  means `> 0` and that is not a guess. An attribute is a value, so the same sentence means "equal to
  *what*", and inventing one produces a rule that fires on nothing or on everything. It asks:
  *"`currency` holds a value rather than a count … say for example 'highlight rows where currency is
  Open'."*

## 8. The conversation is the state — and the page is not

§14 asks for a conversation that is *stateful*: "start with a standard page and progressively describe
changes without having to specify the entire experience in one prompt."

The tempting reading is that the AI needs memory of the **page**. It does not — the page is right there,
and `pageViewFor` reads it fresh on every turn, so a refinement is always grounded in what the page is
*now*. That is strictly better than remembering: an author who drags a widget between two prompts
desynchronises nothing, and asking twice to remove the same column gets a refusal the second time.

What genuinely needs to persist is the **conversation**: which turns were asked, which were applied,
which are still waiting on an answer. That is what `RefineService` holds, and it is what turns §28's
nine prompts into one session rather than nine unrelated requests.

### The panel is a transcript, and four outcomes look like four different things

|  |  |
|---|---|
| `resolved` | the §19 sentence, and **Apply / Discard** |
| `ambiguous` | the question, candidates as buttons |
| `refused` | the reason, which always names what IS available |
| `notUnderstood` | with examples of verbs that work |

The last two are the ones usually collapsed into "sorry, try again". They are kept apart because they
call for different next moves: a refusal means *that* cannot be done and something else can; a
misunderstanding means the sentence needs rephrasing.

### Answering a question fills one reference, and does not re-read the sentence

The first version appended the chosen name to the prompt and re-asked. It is the obvious design and it
is wrong: *"Sort by name"* answered with `security-name` became *"Sort by name — security-name"*, whose
field capture was then `name — security-name`, matching nothing.

So the ambiguous outcome carries `on`, naming **the field of the intent** that was ambiguous — `target`,
`field` or `relativeTo` — and answering is `{ ...intent, [on]: chosen }`. A sentence carries up to three
references: *"move the chart above the grid"* has a target and an anchor, and a caller that had to guess
which one the question was about would guess wrong. The displayed prompt still reads as a conversation;
the *state* was never the sentence.

## 9. Nothing in the resolver mutates anything

Mined from the parked builder's `ai/ai.service.ts`, whose rule this keeps verbatim: **a proposal is not
an action.** This module returns resolved refinements and a sentence; the caller turns them into
commands and the author accepts or discards. A refinement carries a component id and a value — never a
JSON pointer and never a patch, because a vocabulary that could express those could express edits the
command layer refuses.

## 10. Rules, working without a provider

`interpret()` is deterministic, for the reason `assist.ts` gives about its analyser: an authoring aid
that stops working when the model endpoint is down is an authoring aid nobody relies on. The patterns
are the PRD's own sentences.

A provider, when installed, is held to `REFINE_RESPONSE_SCHEMA` and emits **the same
`RefinementIntent`** the rules do — so resolution, grounding and explanation are shared, and the model's
only job is the part rules are bad at: reading a sentence. The schema cannot express a component id, a
pointer or a patch.

## 11. Six defects the real pages found that the fixtures did not

Recorded because each is a lesson about the fixture, not only about the code.

| Defect | How it showed |
|---|---|
| **`component` vs `componentId`** | My fixture put `componentId` on widget nodes. The contract's field is `component`, and the node id differs from the component id — `{ id: 'w-recent-table', component: 'recent-table' }`. Every move on every real page refused with "not inside a container that can be reordered" while every test passed. `moveNode` operates on the **node**, so `RefineWidget` now carries both |
| **Grouping is a config enum, not a field** | `business.exception-queue` declares `groupBy: severity \| rule \| assignee \| none`. Resolving *"group the queue by assignee"* against the data source refused it, because the field is spelled `assigned-to` — and told the author `assignee` was unavailable when `assignee` was exactly right |
| **The y→ies plural** | `"securities".startsWith("security")` is **false** — they diverge at the boundary — so *"when the user double-clicks a security"* matched nothing on a page full of widgets titled "Securities". Stemming both sides fixes what prefix matching cannot |
| **Trailing full stops** | Every prompt in the PRD is a sentence and ends with one. Patterns anchored on `$` matched none of them |
| **A node has a `kind`; a container has a `type`** | The applier's fixture wrote `container: { kind: 'stack' }`. `childListsOf` switches on `type` and returns nothing for an unknown one, so **every** move threw inside `moveNode` — while the resolver, which walks any array it finds, resolved all of them happily. Two layers reading the same JSON by different rules, and only one of them was strict |
| **Re-asking is not answering** | The first `answer()` appended the chosen name to the prompt and re-parsed. *"Sort by name"* answered with `security-name` became *"Sort by name — security-name"*, whose field capture was `name — security-name`. The fix is §8's `on` discriminator; the lesson is that the sentence was never the state |

## 12. Known limits

| | |
|---|---|
| **`move-widget` reorders within a container** | "Top" means the top of the widget's own section, not of the page. On a page where each widget sits in its own panel that makes the answer "already at the top" for nearly everything — literally true, and not what the author meant. Moving between containers is a larger change; the refusal says so and suggests "above …" instead |
| **No pie chart** | §11 asks for one and `analytics.chart` offers bar, line, area, point. A component gap, refused by name |
| **`data.table` cannot group** | Manifest-driven, so adding a `groupBy` property to the table needs no change to this engine |
| **One verb per turn** | "Add issuer and currency" is two refinements and `interpret` returns one. Splitting a conjunction is straightforward and not done |
| **One conversation per page** | The transcript resets when the author opens another page, which is right — a turn that referred to a widget that is no longer there is worse than no turn — and means a cross-page instruction has nowhere to live |
| **`highlight-rows` needs a condition** | It resolves the field and explains itself; what value counts as "unresolved" is not modelled, so the caller must supply the comparison when turning it into a `conditionalFormats` entry |

## 13. Verified

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

And from a user's seat, in the browser, on the shipped Exception Management page:

```
Group the queue by assignee
  → Grouped “Full queue” by assignee.                          [Apply] [Discard]
     applied — “Applied. Undo reverses it as one step.”

Change the chart to a pie chart
  → “pie” is not one of the chart types this component offers.
     It supports “bar”, “line”, “area”, “point”.

Sort by name
  → “name” could be “security-name” or “issuer-name”. Which did you mean?
     [security-name] [issuer-name]
  → pressed security-name
     Sorted “Breaks for this rule” by security-name, lowest first.   [Apply] [Discard]

Remove the sector column from the recently added instruments
  → Nothing on this page matches “recently added instruments”. It has “Remediation queue”,
     “Narrow the queue”, “Open Breaks”, “High Severity”, and 5 more.

make it lovely
  → That was not understood as a change to this page. Try naming what to change and how — …
```

All four outcomes, in both themes, with no console errors. The fourth is the one worth noting: the
refusal is correct — that widget is on a *different* page — and it says what this page does have rather
than only what it lacks.

796 tests in the viewer project and 752 in experience-studio. 81 of them are this feature's — 58 in the
resolver, 23 in the applier — and every prompt in `refine.spec.ts` is the PRD's own.
