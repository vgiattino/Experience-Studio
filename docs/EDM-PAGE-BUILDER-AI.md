# AI in the EDM Page Builder — building a web UI without being technical

**What this is.** The AI half of the EDM Page Builder: ask for a page in plain language, ask for changes
in plain language, be told what is wrong before you ask, and undo any of it in one press.

`npm run studio` → port 4300 → **Reference → EDM Page Builder**. The prompt is the first thing under the
page strip. It works with no model configured.

---

## 1. What a non-technical author can now do

| | |
|---|---|
| **Describe a page** | "A dashboard of late file loads by source, with a trend and a table" → a heading, three metrics, a column chart, a line chart and a table, laid out on the grid |
| **Describe a change** | With a widget selected: "call it Coverage", "make it a bar chart", "make it full width", "make it green", "remove it" |
| **Ask for something** | "add a table called Outstanding items", "add a button to link to Detail" |
| **Tidy up** | "tidy up the layout" — closes gaps, separates overlaps, squares up the grid |
| **Be told what is wrong** | A standing review: dead buttons, unreachable pages, overlapping widgets, missing headings, placeholder titles, pages with no way out |
| **Fix it in one click** | Every finding that can be resolved without guessing carries a fix |
| **Understand what you built** | "explain what this page does" → an exact reading of the page in business language |
| **Undo anything** | Including a whole generated page, in one press |

Four example sentences sit under the prompt. They are the instruction *and* the lesson: the hardest part
of using a page builder is knowing what to ask for.

## 2. The four rules that make this usable by someone who cannot read the store

**1. A proposal is not an action.** Every answer is a sentence, a list of what would change, and Accept /
Discard. Nothing touches a page until the author says so. Apply-then-undo demos faster and is worse in
use: an author who cannot predict what a button will do stops pressing it.

**2. One accept is one undo.** A six-widget page and a one-word rename are both a single press to
reverse, labelled with what it was — *"Undo AI: page 'Late File Loads by Source'"*. Undo did not exist in
this builder before; it is the precondition for the rest, not a nicety beside it.

**3. Nothing is offered that cannot be done.** Grounding runs *before* the author sees anything, so a
proposal listing four changes never applies three. What is dropped is shown, in the author's language:
*"Skipped setting 'sql' on Coverage — a kpi has no such property, so it would have done nothing."*

**4. The model names things; it never invents numbers.** A plan may say a chart shows "Equity, Bond, FX"
— those are labels, structure the request implies. Figures come from code. And a generated KPI reads
**"—"**, not the palette's `0`: a chart's sample bars are visibly generic, but "Total late file loads: 0"
is a *sentence*, it is false, and it is the kind of thing that ends up in a screenshot.

## 3. It is built on the platform's AI seam, not beside it

The repository already has a generation pipeline — intake, catalog grounding, context budgets, two-stage
plan/fill, structured output, repair, fallback, provenance — behind one `ModelProvider` port. This reuses
that architecture rather than starting a second one.

| Reused verbatim | Why it did not need rewriting |
|---|---|
| `intake()` | "Delete last month's pricing data" is out of scope for a page builder whatever page model is underneath. Classification, concept extraction, declines and the single clarifying question are already made and tested. |
| `ModelProvider` | One seam. `useProvider()` installs a real model and nothing above it moves. |
| `PolicyEnforcingProvider` | The context budget and the per-session call cap apply here exactly as they do to platform generation. A second AI surface with its own quiet rules is a second place to forget them. |
| The **decisions, not documents** split | `libs/generation/src/plan.ts` has the model emit choices and code assemble the artifact. Same here — see §4. |
| Structured output | A prompt and a JSON Schema. Prose is never parsed. |

One addition to the platform: `ModelRequest.purpose` gains `'refine'`. A refine call is a different
*question* from a plan — small, frequent, scoped to one selection — and cost attribution that cannot tell
them apart cannot tell you which is worth optimising.

**What is new here** is the vocabulary. The platform assembles a `PageDefinition` bound to a governed
catalog; this builder has 20 widget kinds, a 12-column grid and no data binding, so it needs its own
decision schemas and its own assembler. Both live under `page-builder/ai/`.

## 4. The model decides four things. Code does the rest.

A plan is a list of `{ id, kind, title, purpose, categories?, columns?, target?, band? }`. That is all.

| Decided by the model | Decided by code |
|---|---|
| Which widgets a request needs | ids, x/y/w/h, minimum heights, prop defaults |
| What each is called | which prop the title lives in, per type |
| Why each is there (shown to the author verbatim) | resolving a nav target to a page that exists, or to nothing |
| Which **band** it belongs in — metrics, charts, detail, actions | where that band puts it on the grid |

**Bands rather than coordinates**, because asking a model for x/y/w/h produces overlapping widgets and
off-grid columns — and then an author's first experience of AI in this product is dragging things apart.
A band is a judgement about reading order; the arithmetic is not. Generated pages are asserted to have
zero overlapping pairs and to fit the grid, and the layout convention is the one every seeded page
already follows, so a generated page and a hand-built one are indistinguishable.

**The edit union is closed.** `retitle · set-prop · chart-kind · add · remove · resize · link ·
page-name · tidy`. Every arm is something an author could have done by hand, which is what makes each one
reviewable in a sentence and reversible in one step. `set-prop` is checked against an **allowlist per
widget type**: a model that may write any key can invent `onClick`, the inspector will never show it, and
the prop sits in the store forever doing nothing — a silent failure, which is the worst kind.

## 5. Two features with no model in them, on purpose

**The design review** is rules. Findings must be *complete and stable*: an author who fixes everything
the panel lists has to be able to trust that the list was the whole list, and a model that mentions two
of four overlaps this run and three the next destroys exactly that. It is also the highest-value feature
here — a non-technical author does not know what a good page looks like and will not know what to ask
for. Generation answers a question they thought of; the review answers the ones they did not.

It reads the *whole design*, not the open page, because the two findings that matter most — a page
nothing links to, and a page with no way out — cannot be seen from inside a single page.

A finding either carries a fix or is honest that only the author can decide. A dead button with one other
page in the design gets a fix; with five, it gets an explanation. **A suggestion with an automatic fix
that guesses is worse than a suggestion without one.**

**Tidy up** is arithmetic. It has one right answer, so a model would produce a different one each time.
It is in the AI panel because that is where the author asks for it, not because a model is involved.
Sections and their contents stay where they are: a section is a frame the author drew, and repacking one
to the top of the page would take every widget out of it.

## 6. The stand-in is a feature, not a mock

With no model configured, a rules provider answers — behind the same port, held to the same schema. It
keeps the screen usable with no endpoint, no key and no egress, and makes every test deterministic. It is
not canned: change the prompt and the plan changes, change the palette and its vocabulary changes.

**The panel names it on screen** — `canvas-stand-in@1.0.0` on every answer. Where it is weaker than a
model, plainly: it matches phrases, it will not understand "the thing we discussed on Tuesday", it cannot
infer that "settlement fails" implies a status breakdown, and its titles are the author's own words
rearranged rather than better words. An author should know which one answered.

## 7. Verification

Driven in Chromium at 1680px and 430px, both themes. Read back out of the DOM, not looked at.

| Check | Result |
|---|---|
| The bar | placeholder changes with the selection; 4 examples; review badge reads `2 to look at` on the seed |
| **Generate** | example 1 → `New page: Late File Loads by Source`, served by `canvas-stand-in@1.0.0`, 7 widgets each with a reason |
| Accept | 5 pages → 6, opens on the new page, 7 widgets: Heading · 3 KPIs · column chart · line chart · Data table |
| **Overlaps on the generated page** | measured pairwise: **0** |
| Honest figures | KPIs read `—`; the summary says so |
| **Undo** | one press removes the whole page (6 → 5); the button reads *Undo AI: page "Late File Loads by Source"*; redo restores it |
| **Instruct** | "call it Files received today" with a KPI selected → one change, applied, visible on the canvas; undo reads *Undo AI: retitle* |
| Ungroundable | "set the sql to select star" → a question, no changes, and a list of what to try |
| **Out of scope** | "delete last month of pricing data" → declined with the platform's reason, and **no Accept button exists** |
| Explain | *"By Asset Type has 8 widget(s)"* — 1 heading, 3 figures, 2 charts, 2 links, and where readers can go |
| **Tidy** | after dragging one widget onto another: applied, overlaps back to 0 |
| **Fix a finding** | "cannot be reached" → applied → badge `4 to look at` → `3 to look at` |
| Show me | jumps to the page and selects the widget the finding is about |
| 430px | AI bar visible, 0px page overflow |
| Console | no errors |

**Four defects the browser found, all fixed:** the page title read *"A of Late File Loads by Source"*
(removing the noun left two words of debris, not one); the word "trend" in a request made the *breakdown*
chart a line chart as well as the trend chart — a line chart of four sources is a wrong picture, not a
style; a heading was described as "a piece of text"; and the proposal card clipped its own Accept button,
the one element that must never be the thing cut off.

Gate: metadata validation passed, **369 unit tests** (52 new), all three apps build with no budget
warnings.

## 8. Next

1. **Install a real model.** `PageBuilderAiService.useProvider()`, server-side, with the credentials and
   egress rules `docs/AI-GENERATION-WORKFLOW.md` §8 already specifies. The stand-in stays as the offline
   path and the test double.
2. **Bind the data.** Every honesty caveat in §2 exists because this builder has no catalog binding. With
   one, a plan names a measure and a dimension instead of a title, and the figures stop being placeholders
   — which is also the point at which this UI should be backed by `PageDefinition` (see
   `EDM-PAGE-BUILDER.md` §6).
3. **Multi-page generation.** "A drill-down from asset type to issuer to security" is three pages and two
   links. The plan schema and the flow map both already support it; the stand-in plans one page at a time.
4. **A model in the review, beside the rules.** The rules cover what is checkable. "This dashboard has no
   trend and the request was about a trend" needs reading, which is what the platform's `assist` does for
   `PageDefinition` pages.
