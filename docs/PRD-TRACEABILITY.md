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
| **Built** | 9 | FR-1, 4, 5, 7, 13, 14, 17, 21, 28 |
| **Partial** | 15 | The creation paths and the object model are real but incomplete |
| **Scaffolded** | 4 | FR-18 (security half), FR-33, FR-35, FR-12 |
| **Absent** | 29 | Navigation Model, Studio Access Tiers, Experience Analytics, System Pages/Journeys, the Product Integration Contract as a contract, legacy migration |

The shape of that distribution is the point. **Everything on the "describe it and get a page" axis is
built and demonstrable. Almost nothing on the "many people, many products, over time" axis exists.**
The prototype is a strong vertical slice of one persona doing one thing once.

---

## §4.1 AI-First Experience Creation — FR-1…FR-8

| FR | Status | Evidence | Gap |
|---|---|---|---|
| FR-1 NL generation end-to-end | **Built** | `libs/generation/` — 8 stages: intake · retrieval · context · plan · fill · assemble · validate · provenance. `POST /api/ai/generate`. Verified: 7 widgets over 2 entities in 883 ms | The plain-language *explanation* is not prose. The UI shows stages, structure and a Grounding tab (entities kept vs. withheld); it does not emit "I chose a KPI card for Late Files because…" for the generated page. `rationale` exists on assist proposals (`libs/generation/src/assist.ts:54`) but not on generation output |
| FR-2 Conversational refinement | **Partial** | `AssistService` + the ★ panel answer *"what is this page missing?"* as strict `AssistProposal`s, each accepted as one undoable patch | Not the FR. The four named refinement classes — reposition, add filter, add comparison, re-style for an audience — are not implemented. Assist proposes *additions* from the catalog; it cannot act on "move the exceptions chart to the top" |
| FR-3 Product identification from intent | **Absent** | — | There is no product concept anywhere in the model. `grep productId schemas libs/contracts` returns nothing. `workspaceId` on `experience.schema.json` is the nearest thing and is not a product |
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
| FR-12 Catalog discovery + metadata | **Scaffolded** | `CATALOG-BROWSER.md`; entries carry name, version, origin, prompt, and now **owner** (`ExperienceSummary.owner`) | Still missing: product, status, tags, dependencies, permissions. Dependencies are the field FR-34's impact analysis is supposed to read |

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
| FR-18 Embedded Security **and Workflows** | **Scaffolded** | `security` is a real element and is *enforced* — the persona switch turns widgets `denied` while the page stays usable, verified | **`workflows` does not exist on the Experience schema.** Properties are: schemaVersion, id, name, description, icon, kind, workspaceId, pages, navigation, parameters, dataSources, actions, security, presentation, localization, environments, version, tags. An Approval Workspace cannot carry its approval workflow |
| FR-19 Per-Experience AI Context, Documentation, Tests | **Absent** | — | None of the three exist on the schema. This is load-bearing: FR-36's generated tests have nowhere to live, and FR-34's impact analysis has no per-Experience test set to select from |

## §4.5 Product Experience Registry & Integration Contract — FR-20…FR-24

| FR | Status | Evidence | Gap |
|---|---|---|---|
| FR-20 Product-agnostic core | **Partial** | True by construction today — there is no product-specific branching because there is no product concept. The component registry, renderer and generator are all metadata-driven | Untested claim. "No platform-core conditionals keyed on product identity" is trivially satisfied when identity does not exist. The first second product is what tests it |
| FR-21 Metadata registration | **Built** | `@opus/catalog-ingest` — register → scan → infer → promote → drift, against a real MS SQL Server (16.0.4265.3), 12 objects into 10 entities, verified end to end. `CATALOG-INGESTION.md` | Registration is per *database*, not per *product*. A product registering "its entities, attributes, relationships, APIs, business glossary and data sources" as one contract does not exist |
| FR-22 Component / template / action registration | **Partial** | `libs/component-registry` + six manifests (`chart`, `filter-bar`, `kpi-card`, `table`, `text`, `navigation`) | No registration *by a product*. No template or action registration at all |
| FR-23 Security and AI Context registration | **Partial** | Capabilities are real and enforced (`experience.view`, `experience.author`, `catalog.edit`, `export.data`, `dataQuality.view`); catalog-ingest *derives* row entitlement domains per schema at promotion | The capability list is a literal in `server/personas.ts`, not a product registration. AI Context registration does not exist |
| FR-24 Registry extends to Pulse / future products | **Absent** | — | Follows FR-20/21 |

## §4.6 System Pages & System Journeys — FR-25…FR-27

| FR | Status | Evidence | Gap |
|---|---|---|---|
| FR-25 System Page authoring | **Absent** | — | No System Page concept. The four EDM templates are the *content* a System Page would hold, with none of the product-ownership, override or extension semantics |
| FR-26 System Journey authoring | **Absent** | — | `EDM-TEMPLATES.md` describes the four templates as "one journey, not four pages" — a real journey exists as an emergent property of drill-down wiring, but not as an object anyone can author |
| FR-27 System content extensible not fixed | **Absent** | — | Needs FR-25/26 first |

## §4.7 The Experience Catalog — FR-28…FR-29

| FR | Status | Evidence | Gap |
|---|---|---|---|
| FR-28 Unified discovery | **Built** | The Experiences library lists every saved Experience regardless of origin, showing origin, version and the generating prompt | Only one *type* exists to discover. Unified across six types (AI-generated, system, product template, org template, shared, personal) is untested because five of the six do not exist |
| FR-29 Dependency and version visibility | **Absent** | — | No dependency recording, so no "a newer version exists" or "a dependency changed since last validated" flag |

## §4.8 Component Framework & Responsive Design — FR-30…FR-32

| FR | Status | Evidence | Gap |
|---|---|---|---|
| FR-30 Five-family component library | **Partial** | Layout is complete in the model — grid, stack, panel, split, drawer, tabs, repeater (`schemas/layout.schema.json`). Six component manifests exist against roughly 35 named in the PRD | **The entire Enterprise family is missing** — Exception Queue, Approval, Workflow, Notifications, Audit, Data Quality. The PRD calls these "the ones that carry governance-relevant behavior", and they are the ones with none. Also absent: Tree, Relationship Viewer, Timeline, Heat Map, Gauge, and every Forms component except via the EDM builder's own separate palette |
| FR-31 Product extension without forking | **Partial** | The registry accepts manifests without core changes | No product scoping, no extension-family registration |
| FR-32 Responsive across devices | **Built** | Per-breakpoint direction and placement in the schema; `breakpointForWidth` tested at 320/600/900/1350; verified **zero horizontal overflow at 430 px** | Known limitation carried from earlier work: below 900 px the studio shell hides the nav rail (`chrome.scss`), making Catalog and the EDM Page Builder unreachable on a phone. That is the *authoring* surface, not a published Experience |

## §4.9 Lifecycle, Governance & Testing — FR-33…FR-37

| FR | Status | Evidence | Gap |
|---|---|---|---|
| FR-33 Full lifecycle enforcement | **Scaffolded** | `lifecycleState: 'draft' \| 'inReview' \| 'approved' \| 'published' \| 'deprecated' \| 'archived'` (`libs/contracts/src/page.ts:102`) — the right six states. Published versions are immutable and a save against one is refused (`server/store/experience-store.ts:201`) | **Nothing enforces a transition.** No Validate gate blocking Collaborate, no Approve requiring a named approver, no Collaborate stage. The enum is a label, not a gate. Validation itself is real (8 levels, structural/component/semantic/binding/layout) but is not wired as a lifecycle precondition |
| FR-34 Change impact analysis | **Partial** | `detectDrift` is genuine impact analysis for the *metadata* half: it diffs a re-scan against the promoted baseline and reports what changed and what it breaks, with widened-nullability and proportional-row-count reasoning | Scoped to catalog ingestion only. A changed *shared component* triggers nothing. No "which pages need testing", no regression-test selection, no human review queue |
| FR-35 Versioning / publish / promote / rollback | **Scaffolded** | Append-only version history under `versions/`, `artifactVersion` increments, published-immutable enforced, provenance envelope with origin and correlation id | No rollback operation, no promotion transition, no ownership field. Ownership is named in the FR and absent from the model |
| FR-36 AI-generated regression tests | **Absent** | — | Blocked on FR-19: an Experience has no `tests` element to populate |
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

2. **`workflows`, `aiContext`, `documentation` and `tests` are missing from the Experience schema.**
   FR-18 and FR-19 are model changes, and four other FRs (FR-36 regression tests, FR-34's test
   selection, FR-23's AI Context inheritance, and an Approval Workspace being able to carry its own
   approval) are blocked behind them. Cheap to add, and everything downstream assumes them.

3. **The lifecycle is six state labels with no gate.** `lifecycleState` has the right values and
   nothing checks them. Validation exists and is good (8 levels, verified) but is not a precondition
   for anything. This is the single largest distance between what the PRD promises — "fast to build
   does not mean ungoverned in production" — and what the code enforces.

4. **There is no product concept.** FR-3, FR-20…FR-24 and every claim about the Opus portfolio rest
   on it. Note the honest risk: FR-20's "no product-specific conditionals" is *currently true because
   the concept is absent*, which is the easiest kind of architectural claim to believe and the least
   tested. The first genuinely second product is what validates the build-once promise.

## Where the PRD and the code use the same word differently

Worth fixing in one direction or the other before these terms reach engineering tickets.

| Term | PRD means | Code means |
|---|---|---|
| **Navigation Model** | The per-Organization menu structure across Experiences (FR-38) | `schemas/navigation.schema.json` — the per-Experience page tree, which FR-38 explicitly is not |
| **Analytics** | Owner-facing usage/performance telemetry (§4.13) | The `analytics.*` component type namespace — KPI, chart, gauge |
| **Template** | A catalog artifact with a scope, promotable (FR-9…11) | A JSON page definition file in `apps/viewer/public/definitions/` |
| **Journey** | An authorable System Journey object (FR-26) | An emergent property of drill-down wiring between four templates |
| **Registry** | The Product Experience Registry (FR-20) | `libs/component-registry` — the component manifest registry |

## PRD open questions the prototype has already answered de facto

Not decisions — observations. Each is a place where the code has taken a position that the PRD lists
as open, and where either the code or the PRD should move.

| PRD open question (§15) | What the code currently does |
|---|---|
| Environment promotion model | `environments` exists on the Experience schema, and published versions are immutable with new work becoming a new draft version — i.e. governed-in-place rather than promote-between-environments |
| Tenancy model (NFR-7) | Single tenant, hard-coded: `demo-tenant` appears in every persona id and the catalog's `tenantId` |
| AI/LLM provider posture | The `ModelProvider` port keeps the choice open; `mock` is active, `claude` and `openai` are declared and unconfigured. The one place a model is reached is `POST /api/ai/generate`, which is the right shape for a per-tenant isolation guarantee to be added later |
| Collaboration concurrency (FR-37/FR-50) | Single-writer by construction — the store refuses a save against a published version and has no locking or merge for drafts |
| Real-time vs. turn-based co-editing | Turn-based, implicitly: history is append-only per save, with no operational transform anywhere |

---

## Suggested order of work

A recommendation, not a plan — sequencing across products is explicitly out of the PRD's scope (§0).

1. ~~**`owner` on the Experience, and resolve `actorId` server-side.**~~ **Done** — see gap 1 above.
   §4.12 and §4.13 no longer wait on a missing field.
2. **`workflows`, `aiContext`, `documentation`, `tests` on the Experience schema** (FR-18, FR-19).
   Model-only; unblocks FR-36 and part of FR-34.
3. **Make the lifecycle a gate** (FR-33): Validate as a precondition, Approve requiring a named
   approver, both recorded immutably. The validator already exists — this is wiring plus refusal.
4. **The Enterprise component family** (FR-30): Exception Queue, Approval, Workflow, Notifications,
   Audit, Data Quality. These are the governance-carrying components and the ones the four EDM
   templates most obviously want.
5. **Studio Access Tiers** (FR-45…FR-48), extending the existing server-side capability check rather
   than adding a parallel one.
6. **The Navigation Model** (FR-38…FR-43), renaming the existing schema first to free the term.

§4.13 Analytics deliberately last of these: it needs `owner` (1), and its most valuable half —
performance — needs render-time instrumentation that does not exist and that NFR-11 currently has no
way to prove either.
