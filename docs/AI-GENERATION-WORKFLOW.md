# AI Page Generation — Implementation Record

> **Design-time AI has a second half.** This document covers generating a page from a sentence.
> Critiquing a page that already exists — the builder's ★ — is
> [`AI-ASSIST.md`](./AI-ASSIST.md). The two share the model port, the grounding pack and the
> entitlement scoping; they differ in what the model is asked and what the platform does with the
> answer.


Status: **Delivered as a working pipeline against mocked metadata and a simulated provider**
Scope: natural-language request → intent → grounded retrieval → component selection → template
selection → page JSON → rendered page, with validation, bounded repair, deterministic fallback
and provenance.
Related: [`../architecture/ai-architecture.md`](../architecture/ai-architecture.md) ·
[`M1-IMPLEMENTATION.md`](M1-IMPLEMENTATION.md) ·
[`../schemas/README.md`](../schemas/README.md)

---

## 1. The Request This Was Built Against

> *"Create a Security Master dashboard showing today's processing status, failed files, late
> files, new securities, and exceptions."*

Typed into the **Create with AI** panel (`?mode=studio`), that produces a seven-widget draft
page in ~420 ms: a summary sentence, four headline figures (late files, failed files, new
securities, open exceptions), a stacked trend of file loads by business date and status, and a
securities table. The page is JSON. It renders through the same `PageRendererComponent` that
serves the hand-authored M1 dashboard, loaded through the same
`migrate → validate → compile` path.

**Nothing about the output is canned.** Change the catalog and the output changes; ask for
something else and you get something else; remove an entitlement and the concepts it covers
disappear from the page entirely.

---

## 2. Pipeline

Implemented in `libs/generation/`, orchestrated by `GenerationService.generate()`. Each stage
emits a `StageRecord` the UI lists live, so the pipeline is observable rather than asserted.

| # | Stage | File | What it decides |
|---|---|---|---|
| 1 | **Intake** | `intake.ts` | create / refine / explain / out-of-scope; page intent; concepts, timeframe; decline or clarify |
| 2 | **Retrieval** | `@opus/catalog/retrieval.ts` | which entities, measures and attributes are candidates — over the caller's projection |
| 3 | **Grounding** | `@opus/catalog/grounding.ts` | the compact catalog projection the model reasons over |
| 4 | **Template** | `templates.ts` | the layout shape, scored with a stated rationale |
| 5 | **Context** | `context.ts` | seven priority-ordered layers within an explicit token budget |
| 6 | **Plan** | `plan.ts` + provider | which widgets, over which entity, bound to which measure |
| 7 | **Fill** | `plan.ts` + provider | per widget, in parallel: component type, aggregation, filters, sort |
| 8 | **Assemble** | `assemble.ts` | the `PageDefinition` — deterministically, from the decisions |
| 9 | **Validate** | `@opus/validator` | levels 1, 2, **3**, 4, 7 — the same validator the loader runs |
| 10 | **Repair** | `generation.service.ts` | bounded to 2 attempts, targeted at the implicated widgets only |
| 11 | **Fallback** | `generation.service.ts` | the closest curated template, itself validated |
| 12 | **Provenance** | `generation.service.ts` | prompt, model, catalog version, retrieved concepts, attempts, tokens |

### The stage list, for the request above

```
ok  INTAKE      1ms    Intent create / dashboard; 11 concepts extracted
ok  RETRIEVAL   2ms    3 entities, 6 measures (~834 tokens)
ok  CONTEXT     1ms    Template "platform.ops-dashboard-kpi-trend-queue"; ~2071/12000 tokens
ok  PLAN      322ms    7 widgets: text, kpi, kpi, kpi, kpi, chart, table
ok  FILL       92ms    7/7 widgets configured
ok  ASSEMBLE    0ms    7 components, 6 data sources
ok  VALIDATE    3ms    Valid (structural, component, semantic, binding, layout); 0 warning(s).
                       Not run: entitlement, cost, accessibility
ok  PROVENANCE  0ms    Stamped: simulated-rules@1.0.0, catalog v7, registry 1.0.0
```

---

## 3. The Five Decisions That Shape This

### 3.1 The model never emits a page

It emits a **plan** (~40 lines: which widgets, which entity, which measure) and one **fill**
per widget (~15 lines: component type, aggregation, filters, sort). The platform assembles the
definition. Ids, layout arithmetic, breakpoint placements, the version envelope, action wiring,
filter-channel declarations and provenance are code, and code does not hallucinate.

The payoff is repair granularity: when widget seven is wrong, only widget seven regenerates,
and the six that were right **cannot** silently change — asserted directly in
`generation.spec.ts` by diffing the untouched widgets against a clean run.

### 3.2 Assembly carries the model's decisions faithfully — it does not correct them

This was the single most consequential correction the build produced. The first implementation
of `assemble.ts` clamped an illegal aggregation to a legal one and derived the component type
from the widget kind, ignoring the model's choice. It looked like defence in depth. It was
three bugs at once:

- **provenance became a lie** — the record said the model chose `sum` while the page computed
  `count`;
- **model error became invisible** — the eval harness that is supposed to detect regressions
  would have scored a corrected page as a correct one;
- **the repair loop became unreachable** — nothing invalid ever reached the validator, so
  every injected fault produced `generated`, and a documented, tested-looking safety mechanism
  had never once run.

The division is now explicit: a model's **decisions** are assembled as given and then
validated; only what the model has no say in is decided by code.

### 3.3 Level 3 validation exists because generation needs it

Making §3.2 true required the level the M1 validator had listed as server-only: semantic
validation against the catalog. `libs/validator/src/validate-semantic.ts` checks that every
entity, attribute and measure exists, that every aggregation is one the measure allows, that
every dimension is groupable, that every filter target is filterable, and that an entity marked
`requiresFilter` receives a filter that always constrains.

It takes a minimal structural interface rather than importing `@opus/catalog`, so the same code
runs server-side against a stored catalog, client-side against a projection, and in tests
against a literal.

Level 3 caught a real defect in the very first clean run: the generated securities table
scanned `securities.security` — an entity the catalog marks `requiresFilter` — with no filter
at all.

### 3.4 Entitlement scoping happens before retrieval, not after

`CatalogService.projectionFor(user)` removes what the caller may not see, and retrieval only
ever sees that projection. Filtering afterwards has two failure modes, one of them a
disclosure: a model told about a restricted attribute may name it in a title.

Live, with the persona switch:

| Persona | Entities the generated page binds to |
|---|---|
| Business Analyst | `processing.file-load`, `securities.security`, `dq.exception` |
| Data Steward | `processing.file-load`, `securities.security`, `dq.exception` |
| Restricted Viewer | `processing.file-load`, `securities.security` |

The restricted persona's page contains no reference to `dq.exception` **and no exception
wording in any title** — not because a rule suppressed it, but because the concept was absent
from the projection the generator reasoned over.

### 3.5 A user never sees a validation trace

Repair is bounded to two attempts. Then the closest curated template is instantiated, itself
validated, with any widget that still fails dropped until the page passes — a page with two
figures instead of three is a result; an invalid page is not. The user gets:

> *"The generator could not produce a layout, so I have built a simpler summary from a proven
> template instead. It shows 3 headline figures — add to it, or rephrase and try again."*

---

## 4. Real LLM Integration

`ModelProvider` (`model-provider.ts`) is the only seam:

```ts
interface ModelProvider {
  readonly id: string;
  readonly version: string;
  /** True for a provider that sends context off-box, which turns on egress policy and audit. */
  readonly isExternal: boolean;
  complete(request: ModelRequest): Promise<ModelResponse>;
}
```

To substitute a real model: implement it against an endpoint and call
`GenerationService.useProvider(yours)`. **Nothing else changes.** The prompts, the two response
schemas, the validation cascade, the repair loop, the fallback and the provenance record are
provider-agnostic by construction.

Already in place for that switch:

- **`ModelRequest.responseSchema`** — the JSON Schema for structured-output mode, small enough
  that a provider can genuinely enforce it (`PLAN_RESPONSE_SCHEMA`, `FILL_RESPONSE_SCHEMA`).
- **`ModelRequest.purpose`** — `classify | plan | fill | repair`, so a deployment can route
  cheap stages to a cheap model.
- **`PolicyEnforcingProvider`** — wraps every provider. It **refuses** an over-budget context
  rather than truncating it, because a silently shortened grounding pack produces a plausible
  page bound to concepts that were dropped.
- **Stable serialization** — `serializeGroundingPack` emits a fixed order so identical requests
  produce identical context and prompt caching can hit.
- **Split system/user context** — the cacheable prefix (contract + component vocabulary)
  carries nothing request-specific.

### What the simulated provider is, precisely

`SimulatedModelProvider` reasons over the *actual* grounding pack and the *actual* component
manifests that context assembly produced. It is a rule engine, not a language model — it cannot
handle paraphrase the retriever missed, and its titles come from the catalog rather than from
writing. Those are exactly the capabilities a real model adds.

Its `faults` option produces the specific mistakes a real model makes, so the cascade is
exercised rather than asserted. Selectable from the UI:

| Fault | Caught at | Outcome |
|---|---|---|
| `invalidAggregation` | level 3 | `repaired` |
| `unknownComponent` | level 2 | `repaired` |
| `unknownField` | assembly guard (sort must reference the projection) | `generated` |
| `chartWithoutDimension` | assembly guard (rule 4: no dimension, no chart) | `generated`, chart omitted |
| `providerFailure` | plan stage throws | `fallback` |

The last two are honest to report as *unrepresentable* rather than *repaired*: a sort field
must name the data source's own projection, and a chart with no x axis is not a chart. Those
are mechanical, so they belong to assembly, not to the model.

---

## 5. Verified

Browser-verified with Playwright at 1440px and 430px, against the exact prompt above.

| Claim | Evidence |
|---|---|
| The page comes from JSON | 7 components, 6 data sources; rendered by `PageRendererComponent` via `PageLoaderService.loadDefinition()` |
| Same load path as a file | migrate → validate → compile, same validator, same telemetry |
| Valid, with levels named | `valid`; ran structural, component, semantic, binding, layout; reported entitlement, cost, accessibility as **not run** |
| Draft, not published | `lifecycleState: "draft"`, `immutable: false` |
| Figures are correct | Late Files 6, Failed Files 5 — identical to the hand-authored M1 dashboard's numbers for the same day |
| Real data, real widgets | 4 KPIs ready, 3-day stacked trend, 25-row securities table, all `state="ready"` |
| No physical leakage | `security_id` and `load_id` appear nowhere in the context, the plan or the definition |
| Repair is targeted | chart and table byte-identical to a clean run when a KPI-only fault is injected |
| Fallback is valid | `fallbackUsed: true`, 3 figures, all widgets ready |
| Decline is a real branch | "Delete every security…" → declined at intake, **0 tokens spent**, no retrieval |
| Clarification is bounded | "Make me something nice." → one question, no page |
| Entitlement holds | restricted persona: no `dq.exception` anywhere in the artifact |
| Determinism | two runs produce byte-identical definitions modulo timestamps |
| Responsive | 0 px horizontal overflow at 430 px |
| Console | no errors |

`npm run verify`: metadata validation, **173 unit tests**, production build.

---

## 6. What the Build Changed About the Design

Five corrections the documents did not catch, in the order they were found.

| # | Finding | Change |
|---|---|---|
| **1** | The compile cache is keyed on `(id, artifactVersion)`, sound only for an *immutable* artifact. A draft mutates while keeping both, so an edited generation would render its predecessor forever. | `compilePage` no longer caches a definition with `immutable: false`. Compilation is sub-millisecond; being wrong here is not cheap. |
| **2** | Assembly silently corrected illegal model decisions, making provenance dishonest and the repair loop structurally unreachable. | Assembly carries decisions faithfully (§3.2); level 3 validation added so they are caught properly. |
| **3** | `aggregation` sat on `PlanWidget`, but repair regenerates *fills*. An illegal aggregation was therefore permanently unrepairable — reported correctly, then unfixable. | Moved to `WidgetFill`. Aggregation is a binding decision, which is what stage 2 is for. |
| **4** | A validation finding paths at `/dataSources/<id>`, but `failingWidgets` only matched `/components/<id>`. Every level-3 error implicated nothing, so repair regenerated nothing and a fixable page fell back. | Added the data-source → widget reverse index. |
| **5** | `retrievedVia` is the *set* of contributing strategies, so an entity both named directly and reached by expansion carries `graph`. Testing for its presence demoted entities the user asked for by name — the symptom was a page with no exceptions on it for a prompt that said "exceptions", showing an unrequested "Rows Processed" figure instead. | Demote only when `graph` is the *sole* origin. |

Three smaller ones, all user-visible:

- `providerLabel` was a `computed()` over a plain field, so the UI read "not configured"
  indefinitely. The provider is now a signal.
- "Late Files" and "Failed Files" showed the same number: distinct measures over the same rows,
  neither carrying a predicate the mock gateway can execute. The provider now narrows a
  measure's status from its own name against the catalog's enum values — recovered from the
  catalog, not hardcoded.
- "Today's processing status" as a *trend* was read literally and produced a one-bar chart. A
  chart over time now gets a window regardless of the prompt's timeframe, and its title names
  the entity rather than a status it is no longer filtered to.

---

## 7. Not Yet Built

| Absent | Consequence | Milestone |
|---|---|---|
| A real LLM | Output quality is bounded by rules; paraphrase the retriever misses is not recovered | M6 |
| Embedding index | `similarity()` is token overlap. Real paraphrase matching needs pgvector | M5 |
| Refinement patches | `intake` classifies `refine` and `context` projects the current page, but `generate` re-plans rather than emitting a JSON Patch (ai-architecture.md §5.3) | M6 |
| Eval harness + golden corpus | No regression gate on generation quality — the mechanism §3.2 exists to protect | M6 |
| Levels 5, 6, 8 | Entitlement, cost and accessibility validation still need the gateway and an axe pass | M5/M8 |
| Server-side generation | Runs in the browser, so the catalog projection and the model call are client-side. In production both are server concerns, and `isExternal` gates egress | M6 |
| Data-driven tabs in generated output | A plan with two tables stacks them; the template declares `tabbedTables` but assembly does not honour it | M3 |
| Cost validation before execution | A generated page can declare a query the cost model would reject | M5 |

---

## 8. Assessment

The milestone's question was whether the pipeline in `ai-architecture.md` survives being built.
It did, with five corrections — and four of the five are the *same* class of error: a safety
mechanism that appeared to work because nothing ever reached it. Assembly's silent correction
hid model error; the plan/fill split put an error on the unrepairable side of the boundary; the
finding-to-widget index never matched a data-source path; the fallback was never validated.
Each was invisible to review and immediate under fault injection.

That is the argument for the simulated provider being a rule engine over the real grounding
pack rather than a canned response. A fixture that returns a known-good page would have
demonstrated the happy path and left all four defects in place.

The load-bearing claim holds: **a business user describes a page in their own words, and the
platform produces a governed, validated, entitlement-scoped JSON artifact that the ordinary
runtime renders.** No generated code, no page-specific Angular, and a seam where a real model
plugs in without the surrounding pipeline changing.
