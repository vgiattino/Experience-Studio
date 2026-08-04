# Architecture Review — Pre-Implementation

Status: **Draft for approval**
Scope: review of the full repository as of the current `main` (README, CLAUDE.md, PRODUCT_VISION.md, `/architecture`, `/docs`, `/schemas`).
Purpose: establish shared understanding, surface gaps, and agree the changes needed *before* production code is written.

---

## 1. Understanding of the Product Vision

### 1.1 What we are building

Opus Experience Studio is the **experience layer for Opus EDM**: a platform on which non-engineers assemble governed enterprise applications — dashboards, search and detail experiences, operational workspaces, and eventually workflows — over Enterprise Data Management content.

The distinguishing claim is not "another low-code builder." It is that **the artifact being authored is metadata, and the primary authoring interface is natural language**. A business analyst describes an outcome; the platform produces a declarative definition; the user refines it visually; governance controls how it reaches production.

### 1.2 The value proposition, restated precisely

Today, creating a Business Screen requires a specialist who understands queries, mappings, variables, and application internals. That specialist is a bottleneck, so experience creation is measured in weeks and self-service is effectively zero.

The target state removes the specialist from the common path. The claimed compression — weeks to minutes — comes from three things in combination, and all three are required:

1. **Natural-language authoring** removes the need to know the configuration surface.
2. **A governed semantic model** removes the need to know the physical data model.
3. **A curated component library** removes the need to make design decisions.

Remove any one and the promise fails. Without (2) the AI invents field names. Without (3) the AI invents layouts and quality is non-deterministic. Without (1) we have shipped a conventional builder.

### 1.3 What the vision explicitly rejects

The direction in `CLAUDE.md` is unambiguous and correct: this is **not** a web reimplementation of legacy Business Screens. Screen-for-screen parity would import the legacy conceptual model — hand-configured screens, technical bindings, specialist authors — which is precisely the constraint the product exists to remove. Legacy screens are input to *understanding the domain*, not a specification.

### 1.4 The architectural shape implied

Read together, the documents imply a specific architecture, even though it is not yet stated as such:

- A **declarative definition** (JSON) is the unit of authorship, storage, versioning, review, and execution.
- An **AI generation service** writes and edits those definitions.
- A **rendering engine** interprets them at runtime in Angular.
- A **component framework** supplies the vocabulary the definitions may reference.
- A **metadata/semantic service** supplies the data vocabulary the definitions may reference.
- **Governance services** control the lifecycle of definitions between authoring and production.

The definition format is therefore the centre of the system — the contract on which every other subsystem depends. That has a direct consequence for build order, addressed in §3.

### 1.5 Domain grounding

The journeys point at real EDM operational work: processing health for the day, late and failed files, new securities, data quality exceptions and their remediation, security overview with asset-class-specific detail, related parties, pricing, overrides, audit history, lineage. This is a good v1 domain: high-frequency, read-dominant, and painful today. It also sets a hard constraint the documents do not yet acknowledge — these users are looking at **entitled, auditable, regulated data**, which shapes every decision about where authorization is enforced and what may be sent to a model.

---

## 2. Gaps and Inconsistencies

Ordered by architectural risk, not by document order. Each item names the risk if left unresolved.

### G1 — There is no semantic layer specification (highest risk)

`ai-generation-architecture.md` reduces the hardest subsystem in the platform to a single arrow: "Metadata Context Retrieval." Nothing defines what that metadata *is*.

Natural-language generation over enterprise data is only as good as the model of the data it is given. To emit a correct binding, the generator must know: business entities and their business-friendly names and synonyms; attributes with types, units, currencies and formats; relationships and cardinality; which attributes are legitimately aggregable and by what function; valid filter dimensions and enumerations; date/effective-dating semantics; sensitivity classification; and cost characteristics.

None of this exists in the repository. Without it the generator has no grounding, and "AI first" degrades into plausible JSON referencing fields that do not exist.

**Risk:** the flagship capability cannot be built correctly, and the failure will present as "the AI is unreliable" rather than as the missing catalog it actually is.

### G2 — The page definition schema is a placeholder, not a contract

`schemas/page-definition.schema.json` types `layout` as `object` and `components` as `array`, with no item schemas, no `$defs`, no `additionalProperties: false`. Every subsystem — renderer, generator, builder, validator, migration tooling — will bind to this file. As written it validates almost nothing, so it cannot catch generation errors, cannot drive editor tooling, and cannot support safe evolution.

Concretely absent from the model:

- **Component typing** — no discriminated union per component type, so no per-component property validation.
- **Data sources vs. bindings** — a page needs named, reusable queries against the semantic layer, distinct from the binding of a component to a field or measure of one.
- **Page state and parameters** — deep-linkable parameters, shared filter state, cross-component interaction (select a row, other widgets react).
- **Expression language** — visibility rules, conditional formatting, computed labels and thresholds all imply expressions. There is no defined, sandboxed, non-Turing-complete expression grammar.
- **Actions and events** — drill-down is named in the journeys and requirements but has no representation.
- **Responsive overrides** — "responsive by default" is asserted, but the schema has no breakpoint model. Responsive behaviour must be *generated and stored*, not left to CSS accident.
- **Theme and design tokens** — no reference to a design system.
- **Localization** — no separation of authored labels from translatable strings.
- **Provenance** — no record of the prompt, model, and catalog version that produced the definition. For an AI-authored artifact under enterprise governance, provenance is part of the audit trail.
- **Schema versioning and migration** — no `schemaVersion`, no stated migration policy. Stored definitions will outlive several schema revisions.

**Risk:** the contract everything depends on changes repeatedly during implementation, forcing rework across every subsystem simultaneously.

### G3 — Security is modelled in the wrong place

The schema carries `security: { type: object }` and the requirements list governance features, but no document states where authorization is *enforced*.

The necessary principle is absent and must be made explicit: **a page definition is a statement of intent, never a security boundary.** Definitions are authored by business users and generated by a model; both are untrusted with respect to entitlements. If the renderer executes what the definition asks for, then a definition — hand-edited, copied between tenants, or hallucinated — becomes a data-exfiltration path.

Enforcement must sit server-side in a data access gateway that resolves every request against the *caller's* identity and entitlements, including row-level and column-level restrictions, independently of what the definition requested. A `security` block in the definition may express authoring intent (who may see this page, what is hidden by role), and that is useful, but it can never be the mechanism.

Related and equally unaddressed: **what enterprise data may enter a model context.** Grounding needs catalog metadata; it does not generally need customer records. The platform needs a stated data-egress policy covering metadata-vs-records, tenant isolation, retention, residency, no-training guarantees, and prompt-injection handling for any content that originates in client data.

**Risk:** an entitlement bypass in a platform sold to regulated financial institutions. This is existential, not a defect.

### G4 — "Validation" is one word standing in for the correctness strategy

Between generation and preview the flow says "Validation." That single step must actually comprise:

- **Constrained generation** — structured output against the schema rather than free-form JSON parsing.
- **Schema validation** — structural conformance.
- **Semantic validation** — do referenced entities, attributes, measures and components exist, in the versions available, and is the requesting user entitled to them?
- **Cost and safety validation** — will this dashboard's query fan-out be acceptable?
- **A repair loop** — bounded re-prompting with the specific validation errors.
- **Deterministic fallback** — a sensible template when generation cannot be made valid, rather than an error page.

Above all, there is **no evaluation harness**. Without a golden corpus of prompts with expected outputs and a scored regression run, no one can change a prompt, a catalog, or a model version with confidence. Generation quality becomes anecdote.

**Risk:** unimprovable AI quality. Every change is a coin flip and regressions are found by users.

### G5 — Design-time AI and runtime AI are not distinguished

The documents never separate two very different capabilities:

- **Design-time AI** — produces a definition that a human reviews, refines, and publishes. Runtime is then fully deterministic.
- **Runtime AI** — answers a question or assembles a view live, per user, per request.

They differ in governance (reviewable artifact vs. unreviewed output), latency budget (seconds acceptable vs. sub-second expected), cost (once per authoring session vs. once per view), caching, and auditability.

**Recommendation to ratify explicitly:** all v1 AI is design-time. The runtime renders deterministic JSON. Any runtime AI capability (natural-language query, "explain this exception") is a separate, individually-scoped feature with its own governance.

**Risk:** without this decision, the two blur during implementation and the platform inherits the worst properties of both — unreviewable output on a latency-critical path.

### G6 — Scope claims outrun the design: workflows and applications

README, PRODUCT_VISION, CLAUDE.md and the requirements all promise workflows and applications. The repository defines a *page*.

These are not the same order of difficulty. A dashboard reads data. A workflow mutates governed data across multiple actors and time: state machines, task assignment, approvals, SLAs and escalation, side effects, idempotency, compensation, notification, and an audit record that will be examined by a regulator. It is a distinct product surface with a distinct schema.

Also missing is the level *above* the page: an **Experience/Application** definition composing multiple pages with shared navigation, parameters, roles, and lifecycle. Journeys already require it — "Security Overview" is a search plus a detail page plus tabs plus drill-down, not a page.

**Risk:** v1 commits to workflow, discovers it is a platform in its own right, and delivers neither well.

### G7 — Governance is a feature list without a lifecycle model

"Versioning, approval workflows, promotion between environments, audit history, rollback" are named; none is defined. Missing:

- A defined artifact state machine (Draft → In Review → Approved → Published → Deprecated → Archived) with legal transitions and who may perform them.
- Immutability rules — a published version must be immutable; edits create a new draft.
- **Environment promotion semantics.** This one has a schema consequence: if definitions reference physical data objects, promotion Dev→UAT→Prod requires editing content, which breaks the audit chain. Definitions must reference *logical* data sources resolved per environment. Deciding this after the schema ships is expensive.
- Ownership, sharing and tenancy — personal drafts, team-shared, org-published, and the template library, with a clear model for what "publish" means at each level.
- Rollback semantics when a definition's dependencies (catalog, components) have themselves moved on.

**Risk:** governance retrofitted onto a schema that cannot express it.

### G8 — No non-functional requirements at all

The repository states no targets for anything measurable. At minimum, before implementation, we need agreed budgets for: dashboard time-to-first-meaningful-render; query fan-out and concurrency for a 12-widget dashboard, with caching and TTL policy; grid behaviour over multi-million-row security universes (virtualization and server-side paging are architectural, not optimizations); generation latency and cost per authoring session; concurrent designers and definition-store throughput; availability and degradation behaviour when EDM or the model provider is unavailable; browser support.

Two omissions deserve separate emphasis:

- **Accessibility.** "Responsive by default" appears repeatedly; *accessible* appears nowhere. WCAG 2.2 AA is a procurement gate for financial-institution buyers and public-sector-adjacent clients. It is also far cheaper designed into a component library than retrofitted — and note the specific consequence for this product: if components are accessible by construction, then every AI-generated page is accessible for free. That is a genuine architectural advantage available only if it is decided now.
- **Internationalization.** Enterprise EDM deployments are multi-region. Locale, currency, timezone, and date-format handling belong in the component contracts and the definition model.

**Risk:** late-stage, cross-cutting rework and blocked deals.

### G9 — The component library is a list, not a system

`08-component-library.md` enumerates ~22 components with no supporting structure. Missing:

- **Tiering** — layout primitives, data primitives, and *business* composites ("Exception Queue", "Security Overview") are architecturally different things. Business composites encode domain semantics and should be compositions of primitives, not peers of them.
- **Component contracts.** Each component needs a machine-readable manifest: property schema, data requirements (what shape of binding it accepts), emitted events, supported breakpoints, entitlement requirements, accessibility notes, and version. This manifest is not documentation — it is the registry the renderer resolves against, the validator checks against, and **the catalog of what the AI is permitted to emit**. One artifact, four consumers.
- **Versioning and deprecation policy.** Stored definitions reference component types by name. Changing a contract silently breaks every stored definition using it. This needs an additive-change policy and a deprecation path from day one.
- **Granularity errors.** "Chart" is not a component; it is a family requiring a mark/encoding model (mark type, x/y/series/size encodings, axes, legend, stacking). Left as one entry, either the AI cannot express real visualizations or "Chart" accretes forty properties.
- **Design system.** No tokens, no spacing scale, no typography, no colour semantics, no light/dark, no chart palette. For a product whose output quality *is* the visual result of generation, the design system is a functional requirement.

**Risk:** inconsistent output, unbounded component surface, and no safe path to evolve components once definitions exist in the field.

### G10 — Personas lack jobs and permissions; journeys lack failure paths

Personas are one line each with no mapping to capabilities, no permission model, no volume or frequency, no success measure. Notably, the list omits the **platform administrator / catalog steward** who curates the semantic layer, approves templates, and manages component versions — a role this architecture requires.

The journeys are happy-path only. Absent: the AI misunderstood the request; the user is not entitled to what they asked for; the request is ambiguous and needs clarification; the query is too expensive; the user wants to undo; and above all **the generated page is 80% right**.

That last case is the *primary* interaction of an AI builder, not an edge case. It raises the platform's hardest UX problem, which no document addresses: **how conversational refinement and direct manipulation stay coherent.** If a user hand-edits a layout and then issues another prompt, does the model see the edited definition, and are their edits preserved? Getting this wrong makes the product feel adversarial regardless of generation quality. It needs a designed answer — the definition as single source of truth, edits and prompts both expressed as diffs against it, with an explicit undo/version stack.

Also missing across the component and journey docs: empty, loading, partial, error, and no-permission states.

**Risk:** a demo-quality product that fails in real use, where prompts are ambiguous and output is imperfect.

### G11 — Technology direction is a single sentence

"Maintainable Angular architecture" is the only stated technology decision. Unstated: monorepo strategy and module boundaries; backend platform and service decomposition; the definition store; state management; API style; and how AI orchestration is hosted.

One item is genuinely architectural rather than a matter of preference: **a metadata-driven renderer is in tension with Angular's AOT compilation and tree-shaking.** Components instantiated dynamically from JSON strings are invisible to static analysis, so the bundle either includes everything or misses what it needs. The resolution — an explicit static component registry mapping type names to component classes, with route- or feature-level lazy loading of component bundles — must be decided before the renderer is written, because it shapes the registry, the build, and the extensibility story.

Two decisions to state plainly: the browser must never hold model-provider credentials or call a provider directly — orchestration is a server concern owning tenancy, rate limiting, cost attribution and audit; and the same data access gateway must serve both the renderer and the generator, so entitlements cannot diverge between preview and production.

### G12 — Unreconciled tension: AI-first speed vs. enterprise governance

"AI first" and "reduce weeks to minutes" pull toward instant creation and publication. "Enterprise governance" pulls toward review gates. Both are stated as principles; nothing reconciles them, and an unreconciled tension gets resolved ad hoc during implementation.

**Recommended reconciliation:** tier governance by blast radius. A personal, unshared draft requires no approval and publishes instantly — this preserves the minutes-not-weeks experience where it is actually felt. Team-shared and production-published artifacts require review. Governance weight then scales with consequence rather than taxing every action, which is also the only version users will not route around.

### G13 — No coexistence or migration strategy for legacy Business Screens

"Do not clone legacy screens" is the right *design* instruction. It is not a *commercial* strategy. Clients run hundreds of existing screens, and no client replaces all of them at once. Unaddressed: whether legacy screens can be imported as a starting point for generation; how the two run side by side during transition; navigation and session continuity between them; and what parity subset is required before a client can adopt. Silence here surfaces late as an adoption blocker.

### G14 — No sanctioned extensibility, though a persona requires it

Business users will be served by the curated library. The Professional Services persona explicitly builds "client-specific templates and implementations" and will hit its limits immediately — bespoke components, bespoke queries, bespoke actions. With no sanctioned extension point, that work happens as forks and patches, and every client deployment diverges.

The extension surface (component SDK against the manifest contract, custom data source registration, definition authoring with schema validation and a review gate) should be *designed* in v1 even if it ships later, because it constrains the registry and the definition model.

### G15 — Documentation practice gaps

- **Numbering is already broken:** `01`, `02`, then `06`, `07`, `08`. Either three documents are missing or the scheme has failed. Prefixes imply an order nobody can reconstruct.
- **No glossary.** Domain terms (security master, golden copy, exception, override, lineage) and platform terms (experience, application, page, screen, dashboard, definition, template, binding, component) are used loosely and, in the platform's case, interchangeably. "Experience," "application," and "page" are three different levels of the object model; using them as synonyms in the founding documents guarantees they will be conflated in code.
- **No decision record practice.** The high-consequence choices in this review need durable, dated rationale.
- **No product success metrics.** Nothing defines how we will know the platform worked — time-to-first-published-experience, share of experiences authored without engineering help, generation acceptance rate, edit distance from generated to published.

---

## 3. Recommended Improvements Before Implementation

Seven recommendations. R1–R3 are the ones that change build order and are the substance of this review.

### R1 — Schema-first: freeze three contracts before writing subsystem code

Three schemas define the platform's internal API surface, and every subsystem binds to them:

1. **Experience/Page Definition** — hardened, discriminated by component type, closed to unknown properties, with data sources, parameters and page state, actions, responsive overrides, a defined expression grammar, provenance, and `schemaVersion` with a stated migration policy.
2. **Component Manifest** — the machine-readable contract per component, consumed by renderer, validator, builder palette, and generator.
3. **Semantic Catalog** — the governed business-facing data model over EDM: entities, attributes, measures, relationships, filterable dimensions, sensitivity classification, and logical data source identity for environment promotion.

Stabilize these to v0.1 with worked examples for the three v1 journeys, and version them from the first commit. A generator and a renderer built against a placeholder schema will both be rewritten.

### R2 — Invert the build order: deterministic renderer before AI generator

The documents lead with AI generation. Build it third.

The AI's output is only valuable if the target artifact is provably renderable, and the fastest way to discover that the definition model is wrong is to render hand-authored definitions. Sequence: hand-author definitions for the v1 journeys → build the renderer and components until those definitions render correctly and responsively → build the visual builder that edits them → *then* point the generator at a target already known to be sound and expressive.

This also produces a hand-authoring path that is permanently useful: it is the debugging tool, the template-creation tool, the Professional Services escape hatch, and the source of the AI's few-shot examples.

### R3 — Treat generation quality as an engineered, measured subsystem

Establish, as a first-class deliverable rather than QA activity:

- A **golden corpus** of prompts spanning the v1 journeys, each with an expected definition and a scored rubric (schema validity, semantic validity, component appropriateness, layout quality, entitlement correctness).
- An **automated evaluation run** producing comparable scores per change, so prompt, catalog, and model-version changes are decisions with evidence.
- The full validation pipeline of G4, including bounded repair and deterministic fallback.
- **Structured/constrained output** against the schema, not JSON parsed from prose.

Also treat the **template library as grounding data, not only a user feature.** Curated, human-approved definitions are the highest-leverage input to generation quality via retrieval-based few-shot examples. Every good template improves the model's output — which means curating templates is an engineering investment, and it argues for building the template library earlier than a feature-priority ranking would suggest.

### R4 — Make the security architecture explicit and enforced server-side

Write and ratify: definitions are intent, never a boundary; a single data access gateway is the only path to EDM and resolves every request against the caller's entitlements including row- and column-level rules; renderer and generator share that gateway so preview and production cannot diverge; and a stated data-egress policy for model context (metadata by default, records only by explicit justified need, with tenant isolation, retention, residency and no-training terms, plus prompt-injection handling for client-originated content).

### R5 — Reduce v1 scope and state the deferrals

Commit v1 to **dashboards** and **search/detail experiences** — the two journeys with real pull, both read-dominant, and together sufficient to prove the whole architecture end to end. Defer operational workspaces with write-back to v2 and workflow to v3, with the intent to design the definition model so both are additive rather than breaking.

Say this in the README and PRODUCT_VISION. A vision may be broad; a v1 commitment must be narrow, and the current documents read as commitments.

### R6 — Fill the specification gaps that are cheap now and expensive later

- **NFR document** with the budgets in G8, including WCAG 2.2 AA as a stated requirement and i18n in component contracts.
- **Design system and tokens** before component implementation.
- **Governance lifecycle** — states, transitions, immutability, promotion via logical data sources, ownership and sharing tiers, tiered by blast radius per G12.
- **Refinement UX design** — the 80%-right case, prompt-plus-direct-manipulation coherence, undo/version stack, and the full set of empty/loading/partial/error/no-permission states.
- **Failure-path journeys** alongside the happy paths.

### R7 — Fix documentation practice now, while it is 288 lines

Adopt ADRs (dated, numbered, with context/decision/consequences) and open them with the decisions in this review: definition-as-contract, design-time-only AI in v1, server-side entitlement enforcement, Angular dynamic rendering via static registry, logical data sources for promotion. Add a glossary that separates *experience*, *application*, *page*, *definition*, *template*, and *binding*, and use those terms consistently thereafter. Renumber or de-number `/docs` so ordering is real. Add product success metrics.

---

## 4. Summary Judgement

The vision is sound, well-differentiated, and aimed at a real and expensive problem. The rejection of legacy-clone thinking is the correct strategic call and should be held.

The repository is currently a vision statement, not a design. Its gaps are characteristic and predictable: it specifies the *visible* capability (AI generation) in the most detail while leaving the *load-bearing* subsystems — semantic layer, definition contract, entitlement enforcement, generation evaluation — as single words in a flow diagram. Those four are where the platform will be won or lost, and none of them is currently designed.

The single most consequential correction is one of order: **contracts, then deterministic rendering, then AI.** Building the generator first against an unproven definition model is the most common way this class of product fails, and it fails late.

None of the findings above indicate a flawed premise. They indicate a vision that is ready to be turned into an architecture.

Proposed milestone plan: [`implementation-roadmap.md`](./implementation-roadmap.md).
