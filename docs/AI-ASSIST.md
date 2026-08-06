# AI assist in the page builder

**What it is.** A panel in the visual builder that answers *what is this page missing?* — grounded in
the catalog the author is entitled to, and where accepting a suggestion is an ordinary, undoable edit.

`npm run studio` → open a page → the ★ in the title row.

Generation ([`AI-GENERATION-WORKFLOW.md`](./AI-GENERATION-WORKFLOW.md)) builds a page from a sentence.
Assist is the other half of design-time AI: the author already has a page, and cannot see from the
canvas that the catalog also exposes an ageing measure and a groupable severity they never bound.

---

## 1. The decision that makes it safe

A suggestion is **not** a page, a patch, or prose. It is a **proposal** — a small, strictly
schematised statement of which catalog concept to show how, exactly like `PlanWidget` in the
generation pipeline. The platform turns a proposal into a `Command`, and the command into a patch.

```
grounding pack ─┐
                ├─▶  analysePage  or  ModelProvider(purpose: 'assist')  ──▶  AssistProposal[]
page projection ┘                    held to ASSIST_RESPONSE_SCHEMA              │
                                                                                 ▼
                                                            keepGroundedProposals — the guard
                                                                                 │
                                        author clicks Add ───────────────────────┤
                                                                                 ▼
                                            AssistService.commandFor  ──▶  Command  ──▶  one patch
                                                                              origin: 'ai'
```

Four consequences, each of which is the reason for the shape:

| | |
|---|---|
| **It cannot name what the author cannot see.** | A proposal names refs from the grounding pack, and the pack is built from an entitlement-scoped projection *before* ranking. |
| **It cannot invent a component, an expression or markup.** | The proposal vocabulary has no way to say those things. Five kinds, closed enum. |
| **Accepting it is one undoable edit.** | One patch, tagged `origin: 'ai'`. The store cannot tell it from a drag. |
| **It never writes a patch by hand.** | Every branch of the translation ends in a command from `@opus/studio-core`, so the command layer's tests cover the mutation. |

### The five proposal kinds

| Kind | What it does | Command it becomes |
|---|---|---|
| `add-figure` | A KPI over a measure nothing on the page reads | `addBoundWidget` (kpi-card + aggregate source) |
| `add-breakdown` | The same measure split by a groupable dimension — a trend when temporal | `addBoundWidget` (chart + dimensioned aggregate) |
| `add-list` | A table of an entity's identifying attributes | `addBoundWidget` (table + list source) |
| `set-page-description` | Page prose, when there is none | `setPageProperty` |
| `retitle-widget` | A widget still carrying its component's generic name | `setValue` |

---

## 2. Why `addBoundWidget` had to exist

The palette drops an **unbound** widget, because a person drags a shape first and says what it shows
second. Assist decides both at once, and needs it atomically. Composing `addWidget` then
`createDataSource` at the call site gives two history entries for one action:

- the author presses undo, the source disappears and an **orphan widget** stays behind showing "no
  data", and they press it again to be rid of that;
- worse, the state *between* the two patches is a widget bound to nothing, which the validator
  correctly rejects — so a continuously-validating editor reports the page as broken halfway through
  an operation that was always going to end valid.

So `addBoundWidget` is one command emitting one patch: layout node, component instance, data source
and seeded bindings together. It composes the two existing commands rather than reimplementing them —
`addWidget` runs first, its ops are folded into a projected definition, and `createDataSource` runs
against *that*, so the id-uniqueness check sees the component that is about to exist.

This is independently useful: a future "chart this measure" affordance, or an import, needs the same
atomicity.

---

## 3. Grounding: depth, not reach

Generation retrieves from a **prompt**. Assist retrieves from the **page**:

```ts
retrieve(catalog, {
  terms: [page.name, ...page.entities],
  entityHints: page.entities,
  maxEntities: page.entities.length + 1,
  graphHops: 1,
})
```

The author is asking "what else is available on what this page already reads", so a pack seeded from
the whole catalog would bury that under entities the page has nothing to do with. One hop is kept so
the *model* sees a related entity, but the deterministic rules stay on the page's own entities — a
figure over an unrelated entity is a leap the rules should not take on their own.

Two projections feed the reasoning, and one of them is where a subtle bug lived:

- **`viewOfPage`** reads what each data source **selects**, not what the components **bind**. A
  binding names an *alias* (`exception-count-value`) and an alias is not a catalog ref, so reading
  bindings would have reported that no measure was bound at all.
- **Per-widget**, not just per-page. `readsEntity` / `readsMeasures` are recorded for each widget from
  its own source — see the retitle defect in §6.

---

## 4. What the panel shows that this kind of feature usually hides

- **Which provider answered**, or that the deterministic analyser did. An author who cannot tell
  whether a model was involved cannot calibrate how much to trust the list.
- **Proposals that were rejected** before they were shown, with the reason. A silently filtered
  response looks like a model that made no mistakes. This is the entitlement boundary, so it runs on
  every response — including the deterministic one, which must never fail its own guard.
- **That the list is stale** once the page moves, rather than re-running and appearing to have
  opinions about a page state it never saw.
- **A reason on every row.** "Add a Late Files figure" with an Add button asks for trust it has not
  earned. *"File Load exposes Late Files — files that arrived after their SLA — and no widget on this
  page reads it"* states a checkable fact.
- **The empty case as a result.** On a complete page "nothing to add" is the correct answer and reads
  like one. Exception Management, whose eight sources bind everything in scope, says exactly that.

---

## 5. Running without a model, and with one

`analysePage` is a set of rules over the grounding pack, so **assist works with no provider
configured at all** — which matters, because an authoring aid that disappears when the model endpoint
is down is an authoring aid nobody relies on. That is what ships today, and the panel says so.

Installing a real model is one line, the same seam generation uses:

```ts
assist.useProvider(new YourProvider());   // held to ASSIST_RESPONSE_SCHEMA, purpose: 'assist'
```

Everything above it is unchanged: the prompt, the schema, the guard, the translation, the provenance.
`ModelRequest['purpose']` gained `'assist'` rather than a second port, because the guardrails are
identical — one prompt, one schema, one budget, one audit record — and a second port would have been a
second place to forget the egress policy.

What a real model adds over the rules: ranking nine candidates down to the two that matter for *this*
page, a rationale worth reading, and the ability to answer "nothing — this page is complete" as a
judgement rather than an absence of matches.

---

## 6. Defects this work surfaced

All four were found by driving the panel across the six shipped pages and reading what it said.

**D1 — two suggestions the author could not tell apart.** On the party page the panel offered
*"Title it “Security Count”"* twice. `titleFromBinding` guessed from "the first measure the page
binds", so two generically-titled widgets got the same suggested name. Fixed by carrying
`readsEntity`/`readsMeasures` **per widget** in the projection, so a widget is named after what it
actually reads — and by naming the widget in the row (`Title kpi-b “Rows Processed”`), since two
widgets can both be called "KPI Card".

**D2 — offers to title things that are untitled on purpose.** The same rule proposed titles for text
blocks: `party-heading`, `record-heading`. An untitled text block is *idiomatic* — the component
renders its body as the heading — and a filter bar has nothing to be named after. The rule is now a
positive list: kpi-card, chart, table.

**D3 — "Chart Late Files by business Date".** `lowerFirst` applied to a title-cased business name. A
business name is capitalised on purpose by whoever authored the catalog; lowering it reads like a typo
in the product. Names are used verbatim now, and lowering survives only for a *description* spliced
mid-sentence.

**D4 — "…whatever their outcome., and no widget reads it."** A catalog description ends in its own
full stop, and splicing it before a comma produced `.,`. Both adjustments now live in one
`spliceable()` helper, asserted by a test that no rationale contains sentence punctuation before a
comma.

---

## 7. Verification

`libs/generation/src/assist.spec.ts` (21 tests) and `libs/studio-ui/src/assist.spec.ts` (13 tests).
The guard tests matter more than the rule tests: a badly ranked suggestion wastes a click, but a guard
failure binds a measure the author is not entitled to. So the guard is asserted against a response
that is deliberately wrong in each way a model can be wrong — unknown measure, out-of-scope entity,
disallowed aggregation, ungroupable dimension, a widget that is not there.

Driven in Chromium on `File Processing`:

| Check | Result |
|---|---|
| Suggestions | 3, each with a rationale; badge `3` beside the ★ |
| Provenance | *"Answered by the deterministic analyser — no model was called."* |
| Accept | 10 widgets → 11, 2 KPIs → 3, **1** history entry |
| History | `origin: ai`, label `AI: Add a “Files Processed” figure`, rendered in `rgb(161,20,120)` |
| Validation after the AI edit | still *Valid* |
| **One undo** | back to 10 widgets / 2 KPIs exactly; all widget states `ready` — no orphan; page clean |
| Dismiss | 2 open → 1; badge follows |
| Suggest again | dismissed proposal stays hidden (its id derives from the gap, not a counter) |
| Page switch | suggestions reset; Exception Management reports *nothing to add* |
| Dark / 430px | 3 rows, 0px horizontal overflow, accent `#d94ca7` / `#a11478` |
| Console | no errors |

Across all six shipped pages: 3, 4, 5, 5, 5 suggestions and one honest *nothing to add*.

Gate: metadata validation passed, **289** unit tests passed, all three apps build.

---

## 8. Where things live

```
libs/generation/src/assist.ts          proposals, the schema, analysePage, the prompt, the guard
libs/generation/src/simulated-provider.ts   the stand-in's 'assist' branch — same rules, via the port
libs/studio-core/src/commands.ts       addBoundWidget — one command, one patch
libs/studio-ui/src/assist.service.ts   the only thing that knows both vocabularies
libs/studio-ui/src/assist-panel.component.ts   the panel, over the .opus-ai-panel chrome
apps/studio/src/app/app.ts             the ★ in the title row, and the dock above the canvas
```

## 9. What a follow-on should pick up

1. **A real provider.** The seam is one line; what must land *with* it is the checklist in
   `AI-GENERATION-WORKFLOW.md` §8 — credentials server-side only, per-tenant rate and cost caps, and
   the egress policy. Assist calls are cheaper and more frequent than generation calls, so the cap
   matters more here, not less.
2. **Layout-aware proposals.** Every added widget lands at the end of the root container. A proposal
   that said *where* — beside the other figures, in the empty half of the charts row — would remove
   the one manual step accepting a suggestion still leaves.
3. **Critique, not just gaps.** The rules only ever say "you are missing X". The valuable half a model
   unlocks is "these two figures read the same measure" and "this table has no filter over an entity
   with 48 million rows". Both are expressible as proposals; neither is expressible as a rule that
   would not also fire on pages where the author meant it.
4. **Accept-all, with a review diff.** Accepting five suggestions is five clicks and five patches.
   One patch built from several proposals, previewed as a diff before it applies, is the shape that
   scales — and `DefinitionStore.pendingPatches()` already flattens what a save contains.
