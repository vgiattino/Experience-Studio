# PRD Traceability — FR-1…FR-57 against the code as it stands

Source of record: [`PRD.md`](./PRD.md) (extracted from `Opus_Experience_Studio_PRD_2.docx`, dated
2026-08-12, 57 functional requirements, 13 user journeys).

This document exists because the PRD is now specific enough to be checked against, and a spec nobody
has reconciled with the code is a spec that quietly becomes fiction. Every row below was verified by
reading the code, not by reading the older docs in this folder.

## How to read a status

| Status | Means |
|---|---|
| **Built** | Exists, is exercised, and has been verified running — the FR's testable consequences hold |
| **Partial** | A real mechanism exists and works, but not every consequence the FR states is met |
| **Scaffolded** | A type, schema field or enum exists; nothing enforces or consumes it yet |
| **Absent** | No code. Not "roughly there" — searched for and not found |

"Absent" is the useful column. It is also the honest one: five of the PRD's thirteen feature areas
have no implementation at all, and three of those five are areas the PRD itself flags as *not present
in the source draft* — they are new requirements, not regressions.

## Headline

| | FRs | Notes |
|---|---|---|
| **Built** | 14 | FR-1, 3, 4, 5, 7, 13, 14, 17, 20, 21, 23, 28, 32, 33 |
| **Partial** | 17 | The creation paths, the object model and the product layer are real but incomplete |
| **Scaffolded** | 1 | FR-12 only. FR-33 is now enforced and FR-35 has moved to Partial |
| **Absent** | 25 | Navigation Model, Studio Access Tiers, Experience Analytics, System Page *semantics*, legacy migration |

The shape of that distribution has changed once, and it is worth naming what changed. The
"describe it and get a page" axis was already built and demonstrable. The "many people, many
products, over time" axis was empty; it now has three of its four structural pieces —
**ownership**, **a lifecycle gate**, and **a product concept** — leaving navigation and the
access tiers as the two whole feature areas with no implementation at all.

What is still true: everything demonstrated is one tenant, and everything registered is one
product with data. The second product is registered and honestly ungrounded, which tests the
architecture without pretending to be a deployment.

---

## §4.1 AI-First Experience Creation — FR-1…FR-8

| FR | Status | Evidence | Gap |
|---|---|---|---|
| FR-1 NL generation end-to-end | **Built** | `libs/generation/` — 8 stages: intake · retrieval · context · plan · fill · assemble · validate · provenance. `POST /api/ai/generate`. Verified: 7 widgets over 2 entities in 883 ms | The plain-language *explanation* is not prose. The UI shows stages, structure and a Grounding tab (entities kept vs. withheld); it does not emit "I chose a KPI card for Late Files because…" for the generated page. `rationale` exists on assist proposals (`libs/generation/src/assist.ts:54`) but not on generation output |
| FR-2 Conversational refinement | **Partial** | `AssistService` + the ★ panel answer *"what is this page missing?"* as strict `AssistProposal`s, each accepted as one undoable patch | Not the FR. The four named refinement classes — reposition, add filter, add comparison, re-style for an audience — are not implemented. Assist proposes *additions* from the catalog; it cannot act on "move the exceptions chart to the top" |
| FR-3 Product identification from intent | **Built** | `libs/product-registry/src/identify.ts` + `GET /api/products/identify`. Scores a prompt against vocabulary each product *registered*; a word claimed by two products scores for neither, so a genuine tie produces the question FR-3 asks for rather than a load-order answer. Verified through the API: the PRD's own UJ-1 prompt → `opus-edm` (17–0); "aged reconciliation breaks by custodian" → `opus-control` (5–0); "a dashboard with some charts" → asks; "a nostro proof and the exception queue" → 5–5, **asks**. See `PRODUCT-REGISTRY.md` §4 | Identification is not yet *used* by generation — the pipeline still grounds on the whole entitlement-scoped catalog rather than on the identified product's slice, and does not read that product's AI Context. FR-3's second consequence ("determines which product's metadata, components and AI Context are used") is therefore only half met. Cross-product intent is reported, never resolved (§10 of that doc) |
| FR-4 Metadata-grounded entities | **Built** | Grounding pack from the entitlement-scoped catalog projection; `keepGroundedProposals` guards assist the same way. The Grounding tab renders what was offered and what was withheld | — |
| FR-5 Component recommendation from data shape | **Built** | The `plan` stage selects by cardinality, type and semantic role; `libs/catalog-ingest/src/type-map.ts` carries the semantic classification (identifier / code / amount / percentage) | Explainability is per FR-1's gap |
| FR-6 Binding accept/reject/modify | **Partial** | Bindings are generated and are individually visible and editable in the Definition tab and the builder's Data panel | No accept/reject/modify gesture *at generation time*, and no record distinguishing an AI-accepted binding from a human-modified one — which FR-6 requires and FR-33 depends on for audit |
| FR-7 Preview before persistence | **Built** | The Rendered tab renders the real definition before any save; `POST /api/experiences` is a separate act | — |
| FR-8 AI assistance throughout the builder | **Partial** | The assist panel is available on any page regardless of creation path | Connecting a new data source mid-build does not trigger the per-field recommendation sweep the FR names (Search/Header, Filter, KPI, Grid, Relationship Viewer, …) |

## §4.2 Template-Based Creation & Catalog — FR-9…FR-12

| FR | Status | Evidence | Gap |
|---|---|---|---|
| FR-9 Multi-scope template catalog | **Partial** | Four real business templates as JSON page definitions (`security-master-dashboard`, `security-overview`, `party-overview`, `exception-management`) — see `EDM-TEMPLATES.md` | They are files, not a catalog. No Enterprise / Product / Organization scope, no Shared, no Recommended. Scope is the substance of this FR and none of it exists |
| FR-10 Template customization → standard Definition | **Partial** | Opening a template definition in the builder produces an ordinary Experience — the convergence claim holds structurally | No lineage link back to the origin template, which the FR requires |
| FR-11 Save-as-template / promotion | **Absent** | — | No promotion path, no permission model for Product/Enterprise scope |
| FR-12 Catalog discovery + metadata | **Scaffolded** | `CATALOG-BROWSER.md`; entries carry name, version, origin, prompt, **owner** and now **product** (`ExperienceSummary.product`) — derived from what the experience reads, and back-filled for seeded baselines so the column is populated on a fresh install. All three shipped experiences resolve to `opus-edm` | Still missing: status, tags, dependencies, permissions. Dependencies are the field FR-34's impact analysis is supposed to read. And there is no *filter* UI over product yet — the field is on the wire, not on the screen |

## §4.3 Visual Page Builder — FR-13…FR-16

| FR | Status | Evidence | Gap |
|---|---|---|---|
| FR-13 Full manual authoring surface | **Built** | `apps/studio` — canvas, palette, inspector, aspect tabs (Data / Actions / Page), outline, history, JSON view. Nothing is gated behind AI | — |
| FR-14 Drill-down and cross-page navigation | **Built** | `drilldownTargets` on the Experience; verified click-through Security Operations → Security Overview with parameters carried | Drill-down to *another Experience* is untested; only same-Experience pages and System-Page-shaped targets exercised |
| FR-15 Filter and interaction configuration | **Partial** | `filter-bar` component + channel wiring; the EDM builder shows "Every figure, the trend, the rule tabs and both queues read these channels" | Cross-component selection→update (row select drives another widget) is not configurable in the builder |
| FR-16 Responsive configuration in the builder | **Partial** | Real schema support: `stackContainer.direction` varies by breakpoint, `gridPlacement` is per-breakpoint (`schemas/layout.schema.json:86,93,135`); `breakpointForWidth` xs/sm/md/lg tested | The builder offers six *preview widths* but no per-breakpoint override editing. The capability is in the model and not in the UI |

## §4.4 The Experience Object Model — FR-17…FR-19

| FR | Status | Evidence | Gap |
|---|---|---|---|
| FR-17 Unified Experience object | **Built** | One `experience.schema.json` for a single dashboard and a multi-page application alike; all three creation paths converge on it; the renderer has no per-kind branch | — |
| FR-18 Embedded Security **and Workflows** | **Partial** | `security` is real and *enforced* — the persona switch turns widgets `denied` while the page stays usable. `workflows` now exists on the schema and the contract, with a worked Approval Workspace in `schemas/examples/`. Its design claim is that a workflow's reach is a **subset of what the experience already declares** — a step invokes one of the experience's own actions, and `checkExperienceElements` refuses one that invents an action | Declarative only: nothing executes a workflow. Branching, parallelism, timers, escalation and in-flight state are deliberately unmodelled — the requirement claims order and nothing more |
| FR-19 Per-Experience AI Context, Documentation, Tests | **Partial** | All three are on the schema and the contract. `aiContext.extends` makes FR-19's "specialize or extend without replacing" an explicit choice rather than an assumption, and standing alone earns a warning. `tests` carry `covers` and an `origin` distinguishing generated from authored; `testsCovering()` is FR-34's selection as a function, and both shipped examples are gated against the checker | No runner, so `lastRun` is never written and `expect` is prose. AI Context is not yet read by the generation pipeline — the element exists, the grounding does not consume it |

## §4.5 Product Experience Registry & Integration Contract — FR-20…FR-24

| FR | Status | Evidence | Gap |
|---|---|---|---|
| FR-20 Product-agnostic core | **Built** | Now a *tested* claim rather than a vacuous one. `products/opus-control.product.json` was added with no change to any file under `libs/` or `server/`, and `registry.spec.ts` goes further: it registers **Acme Sprocket Control** — fictional product, fictional domain, vocabulary nothing in the repository mentions, declared entirely in the test file — and asserts that composition, catalog grounding, component ownership, capability checking and prompt identification all work for it. If that test ever needs a production edit to pass, FR-20 has been broken | The rule "no file under `libs/` or `server/` may branch on a product id" is enforced by convention and by that test, not by a lint rule. Worth adding one if a third product arrives |
| FR-20a *(the honest caveat)* | — | The claim is tested against a product with **no data**. What is still unproven is a second product with an ingested catalog: two grounded products sharing a tenant is where the one-domain-one-product rule earns its keep, and nothing exercises it outside unit tests | — |
| FR-21 Metadata registration | **Built** | Two halves, both real. Physical: `@opus/catalog-ingest` — register → scan → infer → promote → drift against a live MS SQL Server (16.0.4265.3). Semantic: `metadata` on `product.schema.json` — domains, entities, sources, glossary, APIs — with `groundingFor()` joining the claim to the catalog. Opus EDM's six domains resolve to 13 real entities against the promoted catalog | Metadata is a **claim**, not a copy, which is deliberate (`PRODUCT-REGISTRY.md` §2) but means `apis` is declarative and nothing invokes one. `dataSources` is left empty on the shipped registration because a source id is per-tenant, so FR-21's "drift can name the affected product" link is designed and unexercised |
| FR-22 Component / template / action registration | **Partial** | The mechanism exists for all three: `components`, `templates` and `actions` on the contract, checked against the manifests on disk and against the product's own capability list. Opus EDM registers two templates and five actions (assign / clear an exception, propose an override, reprocess a load, view lineage), each with its capability and a `mutates` flag | **No product registers a component**, and that is a statement rather than a gap: every component in the library is platform-native, and claiming one for EDM would misrepresent who maintains it. So component registration is exercised only by the Acme test. Actions are declarations — nothing executes one, the same posture as `workflows`. Templates carry no scope enforcement (FR-9/FR-11) |
| FR-23 Security and AI Context registration | **Built** | Both now registered per product. EDM declares eleven capabilities across two axes — `platform` (what you may do) and `data` (which rows the product permits) — and four roles built from them, with the checker refusing a role or action that names an undeclared capability. AI Context is the same shape as an Experience's own, so FR-19's "specialize or extend without replacing" layers on a real thing: ten terminology entries with `notToBeConfusedWith`, four standing instructions, twenty-one intent signals | **Registered, not yet enforced or consumed.** `server/personas.ts` still holds the enforced capability literals, so an Experience's Security element is not yet validated against the product's registration; and the generation pipeline does not read `aiContext`. Both are wiring, not design — the declarations they need now exist |
| FR-24 Registry extends to Pulse / future products | **Partial** | Demonstrated by construction: a second product registered on the same contract with no core change, plus a third (fictional) one in tests. The registry treats every product as a peer — nothing is architecturally special | Pulse specifically is not registered, and the PRD's own open question bites here: the registry **cannot express** "nested under Control". If Pulse genuinely shares Control's domains, the one-domain-one-product rule refuses the pair — loudly, which is the right failure, but it is a decision somebody has to make before Pulse registers. Recorded in `PRODUCT-REGISTRY.md` §10 |

## §4.6 System Pages & System Journeys — FR-25…FR-27

| FR | Status | Evidence | Gap |
|---|---|---|---|
| FR-25 System Page authoring | **Absent** | — | No System Page concept. The four EDM templates are the *content* a System Page would hold, with none of the product-ownership, override or extension semantics |
| FR-26 System Journey authoring | **Absent** | — | `EDM-TEMPLATES.md` describes the four templates as "one journey, not four pages" — a real journey exists as an emergent property of drill-down wiring, but not as an object anyone can author |
| FR-27 System content extensible not fixed | **Absent** | — | Needs FR-25/26 first |

## §4.7 The Experience Catalog — FR-28…FR-29

| FR | Status | Evidence | Gap |
|---|---|---|---|
| FR-28 Unified discovery | **Built** | The Experiences library lists every saved Experience regardless of origin, showing origin, version, the generating prompt, owner and now product | Only one *type* exists to discover. Unified across six types (AI-generated, system, product template, org template, shared, personal) is untested because five of the six do not exist — though `systemPages` and `templates` on the product contract are now the place two of them would come from |
| FR-29 Dependency and version visibility | **Absent** | — | No dependency recording, so no "a newer version exists" or "a dependency changed since last validated" flag |

## §4.8 Component Framework & Responsive Design — FR-30…FR-32

| FR | Status | Evidence | Gap |
|---|---|---|---|
| FR-30 Five-family component library | **Partial** | Layout is complete in the model — grid, stack, panel, split, drawer, tabs, repeater. Seven component manifests, and the **Enterprise family is no longer empty**: `business.exception-queue` is registered, palette-listed, manifest-validated and rendering the shipped `exception-management` page over 164 real exception rows, where it replaced the `data.table` that was serving as the full queue | Five of the six Enterprise components remain: Approval, Workflow, Notifications, Audit, Data Quality. Three of them are blocked on a contract decision rather than on effort — see the note below. Also still absent: Tree, Relationship Viewer, Timeline, Heat Map, Gauge, and the Forms family except via the EDM builder's separate palette |
| FR-31 Product extension without forking | **Partial** | Extension-family registration now exists: `components[].family` accepts the five platform families plus `extension`, and an `extension` entry without a named `extensionFamily` is refused — FR-30 permits the escape hatch only when it is declared. `componentOwner` maps every product-contributed type to exactly one product, and two products claiming one type is blocking | The palette does not filter on `componentOwner`, so a product-contributed component would be correctly owned and still visible in every product's builder. And no product contributes one yet, so the path is tested and not exercised |
| FR-32 Responsive across devices | **Built** | Per-breakpoint direction and placement in the schema; `breakpointForWidth` tested at 320/600/900/1350; verified **zero horizontal overflow at 430 px** | Known limitation carried from earlier work: below 900 px the studio shell hides the nav rail (`chrome.scss`), making Catalog and the EDM Page Builder unreachable on a phone. That is the *authoring* surface, not a published Experience |

## §4.9 Lifecycle, Governance & Testing — FR-33…FR-37

| FR | Status | Evidence | Gap |
|---|---|---|---|
| FR-33 Full lifecycle enforcement | **Built** | `libs/experience-model/src/lifecycle.ts` is the gate, and the four routes `POST /api/experiences/:id/{submit,approve,reject,publish}` are the only way state moves — a save that changes `version.lifecycleState` is refused 409 `lifecycleNotSavable`, which is the hole that previously made the whole chain optional. Submit requires `validated === true` and clears prior approvals so a signature given to one version cannot stand for a later one; approve enforces the capability, separation of duties and no duplicate signature, and holds at `inReview` until `minApprovers` is met; publish is gated separately and stamps the version immutable. `POST /:id/validate` exposes the precondition so a steward sees what is wrong before being refused | Deprecate and archive have no transitions — nothing moves out of `published`, and a change to a published experience is a new draft version. `lifecycleTransitionPolicy` is honoured but per-request rather than per-tenant, so `separationOfDuties: false` is expressible and not yet an administered setting. No Collaborate stage (FR-37) |
| FR-34 Change impact analysis | **Partial** | `detectDrift` is genuine impact analysis for the *metadata* half: it diffs a re-scan against the promoted baseline and reports what changed and what it breaks, with widened-nullability and proportional-row-count reasoning | Scoped to catalog ingestion only. A changed *shared component* triggers nothing. No "which pages need testing", no regression-test selection, no human review queue |
| FR-35 Versioning / publish / promote / rollback | **Partial** | Append-only version history under `versions/`, `artifactVersion` increments, published-immutable enforced, provenance envelope with origin and correlation id, **publish as a governed transition** (FR-33), and **ownership** on the definition with transfer recorded in the audit log | Still no rollback *operation* — the superseded bodies are on disk and nothing restores one — and no promotion transition between scopes, which needs FR-9's scope model first |
| FR-36 AI-generated regression tests | **Absent** | — | No longer blocked: `tests` exists to populate, with `origin: 'generated'` to mark what the AI wrote. What is missing is the generation itself and a runner |
| FR-37 Collaboration before publish | **Absent** | — | See §4.12 |

## §4.10 Business User Navigation — FR-38…FR-43

**Absent in full.** `grep -ril "navigationModel"` across `libs server apps schemas` returns zero files.

`schemas/navigation.schema.json` is titled "Navigation Model", which will mislead a reader: its own
description says *"Navigation at two levels. Experience navigation is the shell: the tree of pages a
user moves between. Page navigation is local."* That is FR-17's per-Experience navigation element —
exactly the thing FR-38 defines itself as **distinct from**. The name collision is worth resolving
before anyone builds FR-38.

| FR | Status |
|---|---|
| FR-38 Navigation Model as a first-class object | **Absent** |
| FR-39 Assemble Pages/Journeys into menu groups | **Absent** |
| FR-40 AI-assisted navigation organization | **Absent** |
| FR-41 Role-scoped navigation visibility | **Absent** |
| FR-42 Per-role landing page | **Absent** |
| FR-43 Navigation preview by role | **Absent** |

The pieces FR-41 needs *do* exist: role-scoped filtering is already how the catalog projection and the
Data Gateway behave, and the persona switch demonstrates it. FR-41 is an application of a proven
mechanism to a new object, not new machinery.

## §4.11 Legacy Business Screen Migration — FR-44

**Absent.** No reader for legacy Business Screen configuration exists, so none of Classic / AI
Conversion / Hybrid can be attempted. The PRD leaves the default strategy open (§15) and this
document does not narrow it.

## §4.12 Studio Access Tiers, Permissions & Collaboration — FR-45…FR-51

**Absent in full.** Zero files match `accessTier`, `studioTier` or `collaborator`.

| FR | Status | Nearest existing thing |
|---|---|---|
| FR-45 Three-tier access model | **Absent** | Three personas with capability lists — `analyst`, `steward`, `restricted` — resolved **server-side**, which is the enforcement posture FR-45 and FR-48 demand ("not only hidden in the UI"). But capabilities gate *actions*, not access to Studio itself |
| FR-46 System Page Builder scoping | **Absent** | — |
| FR-47 Studio Builder + default ownership | **Partial** | The *ownership* half is done: `owner` is on the Experience schema and the contract, the store assigns the saver on first save, keeps it across an ordinary edit by somebody else, records a transfer with who performed it, and refuses to leave it unassigned. What is absent is the *tier* — nothing distinguishes a Studio Builder from anyone else |
| FR-48 Consumer-only | **Absent** | The `restricted` persona holds only `experience.view`, which is close in spirit and is enforced server-side |
| FR-49 Share with Collaborator roles | **Absent** | — |
| FR-50 Invitation and activity attribution | **Partial** | Attribution is now evidence rather than a claim: the route resolves the actor from the caller's identity, **refuses** a body-supplied `actorId` with a 400 rather than ignoring it, and the client stopped sending one. `SaveRequest.actorId` is required, so `'anonymous'` is unreachable. Verified across four personas with the transfer visible in the audit log | No invitation, and no Collaborator to attribute *to* — both need §4.12's tier model |
| FR-51 Shared Experiences stay single-entry | **Absent** | — |

## §4.13 Experience Analytics & Owner Insights — FR-52…FR-57

**Absent in full**, and worth stating precisely because a keyword search is misleading: `analytics`
appears in 31 files, and **every occurrence is a component type namespace** — `analytics.kpi`,
`analytics.chart`, `analytics.gauge`. There is no usage or performance telemetry anywhere.

| FR | Status |
|---|---|
| FR-52 Per-Experience usage analytics | **Absent** |
| FR-53 Per-Experience performance analytics | **Absent** |
| FR-54 Owner-scoped analytics access | **Absent** — but no longer blocked; `owner` now exists to scope on |
| FR-55 Threshold-based notification | **Absent** |
| FR-56 Proactive Critical alerting | **Absent** |
| FR-57 Analytics-informed AI refinement | **Absent** |

NFR-11 sets a 2–3 second runtime rendering target. Nothing measures render time today, so that target
is currently unfalsifiable — which also makes SM-12 and SM-14 unmeasurable.

---

## The four gaps that block the most

Ordered by how much else they unblock, not by size.

1. ~~**An Experience has no owner, and the actor it does record is self-asserted.**~~ **Done.**

   `owner` is now on `experience.schema.json` and `ExperienceDefinition`, deliberately distinct from the
   three fields it sits beside — `version.audit.createdBy` is who first made it,
   `version.provenance.actorId` is who produced one version, `workspaceId` is where it lives, and an
   experience can outlive all three while still needing somebody accountable.

   The invariant is kept where the bytes are written, not in a route: `ownerFor` assigns the saver when
   there is no owner (covering both a new experience and the backfill of every artifact written before
   this existed), keeps the existing owner across an ordinary edit so a collaborator pressing save does
   not silently acquire it, stamps a transfer with who performed it, and treats a blank incoming owner
   as "keep the one it had" rather than as removal.

   The actor is now resolved from the caller's identity, and a body-supplied `actorId` is **refused**
   with a 400 rather than ignored — ignoring it would mean a caller who believes they are recording an
   actor gets a 200 and a different name in the log. The client was sending the same identity twice,
   once as a persona the server verifies and once as an `actorId` the server trusted; it now sends only
   the first. `SaveRequest.actorId` is required, so `'anonymous'` is unreachable.

   Ten tests in `server/store/experience-store.spec.ts`, and verified through the API across four
   personas — including the transfer appearing in the audit log while ordinary edits do not.

2. ~~**`workflows`, `aiContext`, `documentation` and `tests` are missing from the Experience schema.**~~
   **Done.**

   All four are on `experience.schema.json` and `ExperienceDefinition`, each modelling only what the
   requirement's stated consequences need — with what was deliberately left out written into the schema
   beside it, so the next person can tell an omission from an oversight.

   `workflows` carries the design claim borrowed from the agent model: **a workflow's reach is a subset
   of what the experience already declares.** A step that acts invokes one of the experience's own
   actions, so a workflow introduces no parallel action system and no second execution path. Branching,
   parallelism, loops, timers, escalation and in-flight state are absent on purpose — FR-18 claims order
   and nothing more, and a speculative process language is worse than none.

   `aiContext.extends` turns FR-19's "specialize or extend without replacing" into an explicit choice.
   `none` is expressible and warns, because an experience that discards its product's vocabulary
   produces answers that are fluent, well-grounded and wrong.

   `tests` earn their place through `covers` rather than through `expect`: `testsCovering()` is FR-34's
   selection as a function, and `origin` distinguishes what the AI wrote from what a person did — the
   question SM-11 exists to ask.

   And because "a type nothing enforces" is this document's own definition of scaffolding,
   `checkExperienceElements` in `@opus/experience-model` closes the gap JSON Schema cannot: a step
   invoking an undeclared action, two steps sharing an id, a test covering a page that is not there, a
   term defined twice. Both shipped examples are gated against it. 564 → 581 tests.

3. ~~**The lifecycle is six state labels with no gate.**~~ **Done.**

   `libs/experience-model/src/lifecycle.ts` holds the transition table and every rule around it, as a
   pure function — the gate is arithmetic, tested as arithmetic, and the routes add only the three
   things it cannot know: who is asking, whether the artifact validates, and how to persist the result.

   The hole that made the chain optional was not a missing check, it was the *save*: a client PUT the
   whole definition, `version.lifecycleState` included, so anything could write `published` and skip
   every stage. A save that moves state is now refused with 409 `lifecycleNotSavable` — refused rather
   than silently reset, because a caller who believes they just published something must not get a 200
   for a save that did not.

   The refusals are the substance. Submit requires validation to have passed and treats an unknown
   validation state as *not* validated. A resubmission clears prior approvals, because carrying them
   forward would let a signature given to one version stand for a later one — exactly what an approval
   exists to prevent. Approve enforces the capability, refuses a self-approval by default (the schema's
   own note says some clients are contractually forbidden from turning that off), refuses the same
   person signing twice, and *holds at `inReview`* while recording the signature when `minApprovers` is
   not yet met — returning an error there would have lost the signature. Reject is the way back from
   both `inReview` and `approved`, so an approved-but-unpublished experience somebody has had second
   thoughts about is withdrawable. Publish is gated on its own capability and stamps the version
   immutable.

   Validation runs the same 8-level validator the loader uses, over every page, against the **full**
   catalog rather than the caller's projection — a submission must not pass because the submitter
   cannot see the entity that breaks it.

4. ~~**There is no product concept.**~~ **Done.**

   `schemas/product.schema.json` is the Product Integration Contract; `libs/product-registry` is the
   registry, the checker and FR-3's identification; `products/` holds two registrations. Full account
   in [`PRODUCT-REGISTRY.md`](./PRODUCT-REGISTRY.md).

   The honest risk named here previously — that FR-20's "no product-specific conditionals" was *true
   because the concept was absent* — is the thing the work was shaped around. So the claim is now
   tested rather than asserted: `opus-control` was added with no change to any file under `libs/` or
   `server/`, and `registry.spec.ts` registers a wholly fictional third product, declared inside the
   test file, to prove that identification, grounding, component ownership and capability checking all
   work for a product the codebase has never heard of.

   The load-bearing design decision is that **a catalog domain resolves to exactly one product**, and
   two claimants is a blocking refusal. Without it identification is undecidable and the platform
   resolves by load order, which is a wrong answer produced quietly forever rather than a registration
   bug caught once.

   The second load-bearing decision is that an Experience's `productId` is **derived** from the
   entities it reads, on the same reasoning that took `actorId` out of the request body: a label an
   author types can be wrong and then stays wrong. Repoint every data source and a typed badge
   survives; a derived one changes with the page.

   What is *not* done, and matters: nothing consumes a product's AI Context yet. Identification names
   the product and the generation pipeline still grounds on the whole entitlement-scoped catalog.
   That is the next step and it is wiring, not design.

   And one caveat worth keeping visible: the build-once promise is tested against a second product
   with **no data**. Two *grounded* products sharing a tenant is where the one-domain-one-product rule
   earns its keep, and only unit tests exercise that.

## What blocks the rest of the Enterprise family

Worth recording as a finding rather than as remaining effort, because three of the five outstanding
components are not waiting on work.

**Approval, Workflow and Audit are about the artifact, not about data.** An Approval component shows
*this experience's* approval state and offers approve/reject; a Workflow component renders the steps
`workflows` now declares; an Audit component renders the `governance` chain that `applyTransition` now
writes. All three exist on the artifact — and `ComponentContext` has no access to it. Its fields are
pageId, params, filters, selections, breakpoint, user, locale, density, `evaluate` and `format`. There
is no route from a component to the experience it sits in.

So there is a decision to make before those three, and it is not a small one:

1. **Extend the runtime contract** with a governance view on `ComponentContext` — read-only, scoped to
   what a governance component needs. Deliberate and bounded, but it is still a new grant to every
   component, and the PRD does not ask for it.
2. **Leave the family data-bound**, and accept that "Enterprise" means components over governed *data*
   rather than over the artifact. Exception Queue and Data Quality fit that reading; Approval and
   Workflow do not, which would make FR-18's "an Approval Workspace carries its approval" renderable
   only through a bespoke page rather than a component.

`Notifications` is blocked on something simpler: nothing produces a notification yet (FR-55/56 are
Absent), so a component would render an empty list. `Data Quality` is buildable today — the PRD is
explicit that it *renders* signal computed elsewhere — but there is no data-quality source in the
catalog to bind it to, so it needs a source before a component.

## Where the PRD and the code use the same word differently

Worth fixing in one direction or the other before these terms reach engineering tickets.

| Term | PRD means | Code means |
|---|---|---|
| **Navigation Model** | The per-Organization menu structure across Experiences (FR-38) | `schemas/navigation.schema.json` — the per-Experience page tree, which FR-38 explicitly is not |
| **Analytics** | Owner-facing usage/performance telemetry (§4.13) | The `analytics.*` component type namespace — KPI, chart, gauge |
| **Template** | A catalog artifact with a scope, promotable (FR-9…11) | A JSON page definition file in `apps/viewer/public/definitions/` |
| **Journey** | An authorable System Journey object (FR-26) | An emergent property of drill-down wiring between four templates |
| **Registry** | The Product Experience Registry (FR-20) | Now both exist and are distinct: `libs/product-registry` is the PRD's Product Experience Registry, `libs/component-registry` is the component manifest registry. The collision is resolved by naming rather than by disambiguation, and `product.components[].type` is the one place they meet |
| **Product** | One of Opus EDM, Prime, Control, Pulse (§9) | `productId` on an Experience, and a registration in `products/`. Note the asymmetry the PRD does not: `workspaceId` is *where an experience lives*, `productId` is *whose data it reads*, and neither implies the other |
| **Enterprise** (component family) | The fifth component family — Exception Queue, Approval, Workflow, Notifications, Audit, Data Quality (FR-30) | `business` — the category name already in `component-manifest.schema.json`. The first Enterprise component uses it rather than adding `enterprise` as a synonym, since two names for one family is worse than either. The palette labels it "Enterprise" so the user-facing word is the PRD's |

## PRD open questions the prototype has already answered de facto

Not decisions — observations. Each is a place where the code has taken a position that the PRD lists
as open, and where either the code or the PRD should move.

| PRD open question (§15) | What the code currently does |
|---|---|
| Environment promotion model | `environments` exists on the Experience schema, and published versions are immutable with new work becoming a new draft version — i.e. governed-in-place rather than promote-between-environments |
| Tenancy model (NFR-7) | Single tenant, hard-coded: `demo-tenant` appears in every persona id and the catalog's `tenantId` |
| Pulse's position in the registry (FR-24) | Peer, not nested. The contract has no way to express "nested under Control", and the one-domain-one-product rule would **refuse** a Pulse that shared Control's domains. A loud failure rather than a quiet one, but a decision somebody has to make before Pulse registers |
| Cross-product Experiences (FR-3) | Detected and reported as `spans`, never resolved. An experience reading two products' data saves and renders normally and carries no `productId` |
| How a product registers (FR-20) | A JSON file in a directory, read at runtime. An API, a signed manifest and a package are all still open; the contract is silent on delivery so that choice stays open |
| AI/LLM provider posture | The `ModelProvider` port keeps the choice open; `mock` is active, `claude` and `openai` are declared and unconfigured. The one place a model is reached is `POST /api/ai/generate`, which is the right shape for a per-tenant isolation guarantee to be added later |
| Collaboration concurrency (FR-37/FR-50) | Single-writer by construction — the store refuses a save against a published version and has no locking or merge for drafts |
| Real-time vs. turn-based co-editing | Turn-based, implicitly: history is append-only per save, with no operational transform anywhere |

---

## Suggested order of work

A recommendation, not a plan — sequencing across products is explicitly out of the PRD's scope (§0).

1. ~~**`owner` on the Experience, and resolve `actorId` server-side.**~~ **Done** — see gap 1 above.
   §4.12 and §4.13 no longer wait on a missing field.
2. ~~**`workflows`, `aiContext`, `documentation`, `tests` on the Experience schema**~~ **Done** — see
   gap 2. FR-36 now has somewhere to put a generated test; what it still lacks is the generation and a
   runner.
3. ~~**Make the lifecycle a gate** (FR-33)~~ **Done** — see gap 3. FR-35 moved from Scaffolded to
   Partial as a consequence; what it still lacks is a rollback operation, not a version history.
4. ~~**A product concept** (FR-3, FR-20…FR-24)~~ **Done** — see gap 4 and
   [`PRODUCT-REGISTRY.md`](./PRODUCT-REGISTRY.md).
5. **Ground generation in the identified product's AI Context** (FR-3's second half, FR-23's
   consumption half). This is the smallest remaining step with the largest effect, and it is the one
   thing that makes the product concept change what the AI produces rather than only what the catalog
   labels. The pipeline identifies the product and then ignores it: retrieval still spans the whole
   entitlement-scoped catalog, and the model never sees that "exception" means a unit of work here.
   Three concrete pieces — restrict retrieval to the product's grounding, layer its `terminology` and
   `instructions` into the context stage, and surface `identifyProduct`'s question as the pipeline's
   clarification rather than `intake`'s generic one.
6. **Enforce Security against the registration** (FR-23's other half). `server/personas.ts` still
   holds the enforced capability literals while the products now declare their own; an Experience's
   Security element referencing a role no product registered should be refused, which is the sentence
   FR-23 actually contains.
7. **The Enterprise component family** (FR-30). Exception Queue is done and on the page. The next
   step is not another component — it is the `ComponentContext` decision above, which determines
   whether three of the remaining five are components at all.
8. **Studio Access Tiers** (FR-45…FR-48), extending the existing server-side capability check rather
   than adding a parallel one.
9. **The Navigation Model** (FR-38…FR-43), renaming the existing schema first to free the term.

§4.13 Analytics deliberately last of these: it needs `owner` (1), and its most valuable half —
performance — needs render-time instrumentation that does not exist and that NFR-11 currently has no
way to prove either.
