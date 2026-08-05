# Implementation Roadmap

Status: **Draft for approval**
Companion to [`architecture-review.md`](./architecture-review.md).

Milestones are sequenced by **architectural dependency and risk retirement**, not by feature visibility. Each has a stated purpose, deliverables, and exit criteria. Exit criteria are demonstrable, not subjective — a milestone is complete when they can be shown, not when the work feels done.

Durations are omitted deliberately; sequence and exit criteria are the architectural commitments. Estimation follows scope approval and team sizing.

---

## Milestone 0 — Decisions and Foundations

**Purpose:** stop implicit decisions from being made by whoever writes the first file.

**Deliverables**
- ADRs for the load-bearing decisions: definition-as-contract; design-time-only AI in v1; server-side entitlement enforcement via a single data access gateway; Angular dynamic rendering via static component registry; logical data sources for environment promotion; monorepo and service boundaries; definition store selection.
- Glossary distinguishing experience / application / page / definition / template / binding / component, plus EDM domain terms.
- Non-functional requirements: render and generation budgets, query fan-out and caching policy, grid scale targets, concurrency, availability and degradation, browser support, WCAG 2.2 AA, i18n.
- Product success metrics and how they will be instrumented.
- v1 scope commitment and explicit deferrals recorded in README and PRODUCT_VISION.
- `/docs` numbering repaired; repository documentation practice stated.

**Exit criteria**
- Every ADR reviewed and accepted; no open architectural question blocks M1.
- NFR targets are numeric and testable.
- A reader outside the team can state what v1 does and does not include.

---

## Milestone 1 — The Three Contracts

**Purpose:** freeze the platform's internal API surface before any subsystem binds to it. This is the highest-leverage milestone in the plan.

**Deliverables**
- **Experience/Page Definition schema v0.1** — discriminated component union, `additionalProperties: false`, `$defs` reuse, named data sources distinct from bindings, page parameters and shared state, actions and events, responsive breakpoint overrides, theme reference, localization separation, provenance, `schemaVersion` and a written migration policy.
- **Expression grammar** — a defined, sandboxed, non-Turing-complete language for visibility, formatting, thresholds and computed labels, with a specification and reference evaluator.
- **Component Manifest schema** — property schema, accepted data shapes, emitted events, breakpoint support, entitlement requirements, accessibility notes, version.
- **Semantic Catalog schema** — entities, attributes, measures, relationships and cardinality, filterable dimensions and enumerations, effective-dating semantics, sensitivity classification, logical data source identity, cost characteristics.
- **Worked reference definitions**, hand-authored, for all three v1 journeys — the operational dashboard, security search, security detail with tabs and drill-down.
- **Validator library** — schema plus semantic validation, consumed by every subsystem.

**Exit criteria**
- The three reference definitions validate cleanly and express their journeys with no gaps requiring schema change.
- A reviewer can read a reference definition and predict the resulting page.
- Schemas are versioned, published as a package, and consumed by at least two subsystems.
- Every NFR-relevant field (responsive, localization, provenance) exists in the model, not on a wishlist.

**Status: DELIVERED**, and extended beyond the original scope with a runtime proof of concept
that renders the reference definitions — see [`../docs/M1-IMPLEMENTATION.md`](../docs/M1-IMPLEMENTATION.md).
Sixteen schemas, an expression grammar, five worked examples and two runtime page definitions
all validate; the schemas are consumed by the contracts library, the validator, the renderer and
the CI gate. Two amendments were needed and are recorded in `schemas/README.md` §7: a `content`
component category, and the breakpoint cascade direction, which the schema had left unstated.

---

## Milestone 2 — Design System and Component Core

**Purpose:** build the vocabulary. Quality here becomes the ceiling on generated output quality.

**Deliverables**
- Design tokens and theming: spacing, typography, colour semantics, light/dark, chart palette.
- Layout primitives: container, row, column, tabs, panel, drawer — responsive by construction against the defined breakpoints.
- Core data and analytics components for v1: grid (server-side paging and virtualization), KPI card, big number, chart family with a proper mark/encoding model, trend, filter.
- Each component ships with its manifest, states (empty, loading, partial, error, no-permission), accessibility conformance, and tests.
- Static component registry with lazy-loaded feature bundles.
- Component versioning and deprecation policy, enforced in the registry.

**Exit criteria**
- Every component is accessible (automated plus manual keyboard and screen-reader checks) and passes at documented breakpoints.
- Manifests are machine-consumed by the validator — no hand-maintained duplicate list exists.
- Grid meets its NFR target against a representative security universe.
- A component contract change is demonstrably caught by the validator against stored definitions.

---

## Milestone 3 — Rendering Engine and Data Gateway (Walking Skeleton)

**Purpose:** prove the architecture end to end with zero AI. At this milestone's close the platform is real: hand-authored JSON becomes a governed, entitled, responsive page over live EDM data.

**Deliverables**
- Renderer: definition → live page, resolving components through the registry, evaluating expressions, wiring parameters, shared filter state, cross-component interaction and drill-down.
- **Data access gateway** — the single path to EDM. Resolves logical data sources per environment; enforces row- and column-level entitlements against the caller's identity; owns query planning, fan-out limits, caching and TTL, cost guards, and audit logging.
- Deep-linkable page parameters.
- Degradation behaviour when EDM is slow or unavailable.
- Observability: render timings, query counts and latency, cache hit rates, error taxonomy.

**Exit criteria**
- All three reference definitions render against live EDM within NFR budgets, on desktop, tablet and mobile.
- **Entitlement tests pass:** a definition requesting data the caller is not entitled to returns filtered or denied results, never leaked data — verified by adversarial test, including hand-tampered definitions.
- Dashboard query fan-out is within the agreed limit with caching demonstrably effective.
- No component reaches EDM other than through the gateway (enforced by architectural test).

---

## Milestone 4 — Visual Builder and Definition Store

**Purpose:** make definitions authorable and manageable by humans. Also the substrate the AI will later edit.

**Deliverables**
- Canvas builder: add, remove, configure, resize, rearrange, bind, preview.
- Binding UX driven by the semantic catalog, so users choose business concepts rather than physical fields.
- Definition store with draft/save/version history, diffing, and an undo/redo stack over definition diffs.
- Definition-level import/export and a schema-validated advanced editing path (extensibility groundwork).
- Template library v1: save as template, browse, instantiate.

**Exit criteria**
- A user with no engineering skills builds and previews a working dashboard entirely in the builder.
- Every builder mutation is expressed as a diff against the definition — the definition remains the single source of truth.
- Version history supports diff and restore.
- Templates round-trip: instantiate → modify → re-save without loss.

---

## Milestone 5 — Semantic Catalog Service and Stewardship

**Purpose:** populate and govern the data vocabulary. Deliberately placed before AI generation, because generation quality is bounded by it.

**Deliverables**
- Catalog service: authoring, versioning, publication, synonyms, sensitivity classification, entitlement metadata.
- Catalog coverage for the v1 EDM domain: securities, pricing, parties, file processing, data quality exceptions.
- Steward tooling for the catalog administrator persona.
- Retrieval API serving grounding context to the generator, entitlement-aware.
- Drift detection between catalog and underlying EDM schema.

**Exit criteria**
- Catalog covers every entity, measure and dimension needed by the v1 journeys.
- Catalog is versioned; a definition records which catalog version it was authored against.
- Retrieval returns only what the requesting user is entitled to see.
- A steward adds a business concept without engineering involvement.

**Status: PARTIALLY DELIVERED.** A mocked catalog service and the entitlement-aware retrieval
API exist in `libs/catalog/`, with catalog coverage for securities, parties, file processing and
data quality exceptions, plus the drift block populated on the runtime catalog. Retrieval scoping
is verified: a persona lacking `edm.dq.read` generates a page containing no reference to data
quality exceptions, in any field.

Two things this milestone surfaced that had been architecture without an implementation:

- **The logical→physical boundary is now load-bearing rather than declared.** The gateway is the
  only component holding both vocabularies, driven by the catalog's server-only `physical`
  blocks. It is genuinely exercised: `securities.security.security-id` is stored as
  `security_id`, and the `rows-processed` measure aggregates a `row-count` column. A page naming
  either physical form would be wrong.
- **Level-3 semantic validation moved from "server-only" to implemented**, because generation
  cannot be honest without it (`ai-architecture.md` §5.4).

Still outstanding: the catalog is a static JSON artifact rather than a service, so authoring,
publication and steward tooling do not exist, and `similarity()` is token overlap rather than a
vector index.

---

## Milestone 6 — AI Generation and Evaluation

**Purpose:** deliver the flagship capability onto proven foundations.

**Deliverables**
- Server-side orchestration service: prompt to validated definition, with tenancy, rate limiting, cost attribution and audit. No model credentials in the browser.
- Constrained/structured generation against the definition schema.
- Retrieval-grounded prompting from the catalog and the curated template corpus.
- Validation pipeline: schema → semantic → entitlement → cost, with bounded repair loop and deterministic template fallback.
- **Conversational refinement** — prompts expressed as diffs against the current definition, coherent with direct manipulation, preserving user edits.
- Clarification behaviour for ambiguous requests rather than confident guessing.
- **Evaluation harness:** golden prompt corpus, scored rubric, automated regression run in CI, and a published quality baseline.
- Provenance recorded on every generated definition: prompt, model version, catalog version, template sources.

**Exit criteria**
- Evaluation harness runs in CI; a quality baseline is published and regressions fail the build.
- Target acceptance rate met on the golden corpus for the v1 journeys.
- Invalid generations never reach the user as errors — repaired or fallen back.
- Refinement preserves prior manual edits, verified by test.
- A user reaches a publishable dashboard from a natural-language prompt within the agreed latency and cost budget.

**Status: PARTIALLY DELIVERED, ahead of sequence.** The generation *pipeline* is built and
working end to end against mocked metadata and a simulated provider — intent, entitlement-scoped
retrieval, context assembly under budget, template selection, plan-then-fill, deterministic
assembly, the validation cascade, bounded targeted repair, validated deterministic fallback, and
provenance. See [`../docs/AI-GENERATION-WORKFLOW.md`](../docs/AI-GENERATION-WORKFLOW.md).

Pulled forward deliberately and at low cost, because the pipeline is provider-agnostic: it was
buildable without a model, and building it corrected five defects in the design of §5 of
`ai-architecture.md` that review had not found — four of them the same class, a safety mechanism
that appeared to work because nothing ever reached it.

Still outstanding for M6, and the reason this is not "delivered":

- **Server-side orchestration.** Generation runs in the browser, so the catalog projection and
  the model call are client-side. Both are server concerns in production.
- **The evaluation harness and golden corpus** — the CI gate on quality, and the mechanism the
  faithful-assembly invariant exists to protect. Nothing currently detects a generation-quality
  regression.
- **Refinement as a patch.** `intake` classifies `refine` and context assembly projects the
  current page, but generation re-plans rather than emitting a JSON Patch, so manual edits are
  not preserved.
- **A real model**, behind the existing `ModelProvider` port.

---

## Milestone 7 — Governance, Publishing and Promotion

**Purpose:** make experiences safe to run in production at a client.

**Deliverables**
- Artifact lifecycle: Draft → In Review → Approved → Published → Deprecated → Archived, with enforced transitions and permissions.
- Immutability of published versions; edits create new drafts.
- Approval workflows, tiered by blast radius — personal drafts publish instantly, shared and production artifacts require review.
- Environment promotion via logical data source rebinding, with no content edits.
- Full audit trail including AI provenance; rollback with dependency-version awareness.
- Ownership, sharing and tenancy model; template curation and approval.

**Exit criteria**
- An experience is promoted Dev → UAT → Prod with no definition content change.
- Audit trail reconstructs who authored, generated, reviewed, approved and published, with what prompt and catalog version.
- Rollback restores a prior published version and behaves correctly when dependencies have moved.
- Governance weight demonstrably scales with blast radius — the minutes-not-weeks path survives for personal work.

---

## Milestone 8 — v1 Hardening and Client Readiness

**Purpose:** convert a working platform into a shippable one.

**Deliverables**
- Application/Experience composition: multi-page experiences with shared navigation, parameters and roles.
- Performance and scale validation against NFR targets under realistic client data volumes.
- Accessibility audit and remediation to WCAG 2.2 AA; i18n verification.
- Security review: entitlement penetration testing, adversarial definition testing, model data-egress review, prompt-injection testing.
- Legacy coexistence: side-by-side operation and navigation continuity with existing Business Screens; documented parity subset for adoption.
- Documentation for business users, stewards, administrators and Professional Services.
- Operational readiness: monitoring, alerting, runbooks, support model.

**Exit criteria**
- All NFR targets met under client-representative load.
- Security review closed with no high or critical findings.
- WCAG 2.2 AA conformance evidenced.
- A pilot client authors and publishes a production experience without engineering assistance.

---

## Post-v1 Direction

Sequenced so each is additive to the definition model rather than breaking it — a constraint on how v1 schemas are designed, not a promise of dates.

- **v2 — Operational Workspaces.** Write-back: overrides, corrections, bulk actions, optimistic concurrency, action-level audit. First introduction of mutation, and a significant governance step.
- **v3 — Workflow.** State machines, task assignment, approvals, SLAs and escalation, notification, compensation. A distinct schema and product surface; scoped as its own programme, not a feature.
- **v3+ — Extensibility.** Component SDK against the manifest contract, custom data source registration, sanctioned Professional Services extension with review gates.
- **Exploratory — Runtime AI.** Natural-language query, narrative explanation of exceptions, proactive insight. Individually scoped with its own governance and latency model; explicitly out of the deterministic-rendering path established in v1.

---

## Sequencing Rationale

Three properties of this plan are deliberate and are the substance of the recommendation:

1. **Contracts precede subsystems (M1 before all).** Every subsystem binds to the definition, manifest and catalog schemas. Changing them mid-build forces simultaneous rework everywhere.

2. **Deterministic rendering precedes AI (M2–M4 before M6).** The generator's output is worthless if the target cannot render it well. Hand-authored definitions running on a real renderer is the cheapest and fastest way to discover that the definition model is wrong — and it yields a permanently useful authoring path, template source, and debugging tool.

3. **The semantic catalog precedes AI (M5 before M6).** Generation quality is bounded by data grounding. Building the generator before the catalog produces exactly the failure mode that discredits AI features: fluent output referencing fields that do not exist.

The corollary is that the flagship capability lands in the second half of the plan. That is the correct trade. M3 already delivers a working, governed, entitled experience platform; M6 makes it authorable in natural language. Reversing that order risks delivering a compelling demo and an unshippable product.
