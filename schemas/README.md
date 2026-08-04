# Core Metadata Model

Status: **Draft for approval**
Schema version: **1.0** · JSON Schema draft **2020-12**
Related: [`../architecture/system-overview.md`](../architecture/system-overview.md) · [`expression-grammar.md`](./expression-grammar.md)

This directory is the platform's contract. Opus Experience Studio is metadata-driven, which means these schemas are not documentation of a system built elsewhere — they *are* the system's interface. The renderer, the visual builder, the validator, the generation service, the storage layer and the migration tooling all bind to them.

That has a consequence worth stating before the detail: **these schemas should be stabilized before subsystem code is written.** A generator and a renderer built against a placeholder contract both get rewritten.

---

## 1. File Map

| File | Model | Purpose |
|---|---|---|
| `common.schema.json` | — | Shared primitives: identifiers, references, i18n strings, computable values, formats, grid placement, sensitivity |
| `experience.schema.json` | — | An application: pages, navigation, shared parameters, lifecycle |
| `page-definition.schema.json` | **1. Page** | One page: state, data, layout, components, actions |
| `layout.schema.json` | **1. Page** | Structural tree, containers, tabs (static and data-driven), repeaters |
| `component-manifest.schema.json` | **2. Component** | The contract of a registered component |
| `component-instance.schema.json` | **2. Component** | One configured use of a component in a page |
| `data-source.schema.json` | **3. Data source** | Declarative logical queries over the catalog |
| `binding.schema.json` | **3. Data source** | Component role → data field, and chart encodings |
| `entity.schema.json` | **4. Entity** | Business concepts in the semantic catalog |
| `attribute.schema.json` | **5. Attribute** | Attributes and measures |
| `relationship.schema.json` | **6. Relationship** | Traversable links between entities |
| `catalog.schema.json` | 4–6 | Immutable published catalog snapshot |
| `action.schema.json` | **7. Action** | Declarative behaviour, incl. reserved write-back and workflow seams |
| `navigation.schema.json` | **8. Navigation** | Experience shell, page-local navigation, drill-down graph |
| `security.schema.json` | **9. Security** | Authoring intent, roles, capabilities — **not enforcement** |
| `versioning.schema.json` | **10. Versioning** | Version envelope, lifecycle, provenance, patch log, compatibility policy |
| `expression-grammar.md` | — | The expression language specification |
| `examples/` | — | Worked artifacts for the v1 journeys |

### Dependency order

```
common
  ├── attribute ── entity ─┐
  ├── relationship ────────┼── catalog
  ├── security             │
  ├── binding              │
  ├── layout ──────────────┤
  ├── action               │
  ├── navigation           │
  └── versioning           │
        component-manifest │
        component-instance ┤
        data-source ───────┤
                 page-definition ── experience
```

No cycles. `layout` is separate from `page-definition` so that composite component slots can contain layout without a circular file reference.

---

## 2. Design Rules

These apply to every schema here. Each exists for a reason that is easy to lose later.

### R1 — Closed objects everywhere

Every object sets `additionalProperties: false` (or `unevaluatedProperties: false` where composition is used).

The reason is specific to an AI-authored platform. An open object silently accepts an invented property, so a model that hallucinates `"colour": "red"` produces a definition that validates, stores, publishes, and then does nothing the author expected. Closed objects turn that into a validation error the repair loop can act on. Strictness is a correctness mechanism here, not fastidiousness.

### R2 — Keyed maps, not arrays, for anything referenceable

Components, data sources, actions, parameters, filters and catalog members are objects keyed by id.

```
/components/exception-grid/config/density        ← stable
/components/3/config/density                     ← breaks when a sibling is inserted
```

Every change in this platform is a JSON Patch — from the canvas, from the AI, from a migration. Positional paths invalidate as soon as anything is reordered, which would make AI-generated patches unsafe and undo unreliable. Keyed maps also make impact analysis (`which definitions use this component?`) an indexable query.

### R3 — Discriminated unions on a `kind` or `type` field

Containers, actions, navigation items and tab sources are `oneOf` branches discriminated by a constant field. This gives precise validation errors ("`navigate` action is missing `target`" rather than "does not match any of 13 schemas"), and gives the model a clear structural choice to make.

### R4 — Layout references components; it does not contain them

The layout tree holds placement and structure; `components` holds configuration. This keeps patch paths stable (R2), and maps exactly onto two-stage AI generation: stage one emits the layout plan, stage two fills each component independently.

### R5 — Computable values are wrapped and analysable

A value that resolves at runtime uses an explicit wrapper: `{"$param": …}`, `{"$filter": …}`, `{"$selection": …}`, `{"$context": …}`, or `{"$expr": …}`.

The first four are distinct wrappers rather than one general expression form on purpose: the renderer can derive the entire data invalidation graph by walking the JSON, with no expression parsing. That is what lets a filter change re-query three widgets instead of twelve.

### R6 — Nothing authored names a physical data object

Page definitions reference catalog entities, attributes and measures. Catalog entities reference *logical* data source ids. Only server-side `physical` blocks — never sent to clients or to the model — map to EDM objects.

This single rule delivers three properties: environment promotion is a rebinding rather than a content edit, so a version approved in UAT is byte-identically the version running in production; a stolen or copied definition reveals no physical schema; and a steward can re-point an attribute without touching any page.

### R7 — Two naming domains, two primitives

| Primitive | Case | Used for |
|---|---|---|
| `identifier` | kebab-case | Authored and catalog ids: `exception-queue`, `asset-class` |
| `memberName` | camelCase | Component contract members: event names, binding roles, slots, config properties |

Contract members map onto component inputs and outputs in code, where camelCase is correct; metadata ids are business-facing. One pattern for both would either force unnatural casing on one side or silently permit inconsistency on both.

### R8 — Enums are closed only where every consumer must know every member

| Closed (adding a member is breaking) | Open string, registry-validated |
|---|---|
| `dataType`, `sensitivity`, `platformRole`, `action.kind`, `dataSource.kind`, `container.type`, `lifecycleState`, `operator` | `componentTypeRef`, `capability`, `entity.domain`, environment names |

A renderer must know every container type to lay out a page, so that set is closed. The component registry grows continuously, so a closed component enum would make every new component a breaking schema change. Semantic validation checks open values against the relevant registry.

### R9 — Presentation names semantics, not appearance

Conditional formats and thresholds name an `emphasis` (`positive`, `warning`, `negative`, …); pages reference a `themeRef`. No colour value appears anywhere in the model.

Theming, dark mode and contrast stay under the design system's control, which means a generated page cannot produce an inaccessible palette — accessibility holds for content no human designed.

### R10 — Every model carries its AI grounding

Catalog entities, attributes, measures and relationships carry `synonyms` and `aiHints`; component manifests carry a `generation` projection. Grounding quality is a curated property of the metadata, not something the generation service is expected to infer.

---

## 3. The Ten Models

### 1. Page model — `page-definition.schema.json`, `layout.schema.json`

A page declares its **state** (`parameters`, `filters`, `selections`), its **data** (`dataSources`), its **vocabulary in use** (`components`), its **structure** (`layout`, `overlays`), its **behaviour** (`actions`), and its **governance** (`security`, `version`).

State is declared rather than implicit because that is what makes interaction generatable: a filter channel in JSON can be written by the AI, whereas coordination living in component code cannot. Parameters are URL-synced and scoped `page` / `experience` / `session`, so an as-of date chosen on a dashboard survives a drill into detail instead of silently resetting — and every filtered view is a shareable link.

`kind` (`dashboard`, `search`, `detail`, `workspace`, `process`, `blank`) drives layout heuristics, default page actions, and which generation exemplars are retrieved.

### 2. Component model — `component-manifest.schema.json`, `component-instance.schema.json`

Split deliberately into **contract** and **usage**.

The manifest has four consumers and is authoritative for all of them: the renderer instantiates against it, the validator checks `config` against its `properties` schema, the Studio generates its inspector from it, and the generation service uses its reduced `generation` projection as the vocabulary the AI may emit. Because component input types are generated from the manifest, contract drift is a build failure.

Validation of an instance is therefore **two-level and cannot be otherwise**: this schema checks structure; the platform validator then resolves the manifest by `(type, typeVersion)` at the page's pinned `registryVersion` and validates `config` dynamically.

The instance also carries `eventActions` — the indirection that keeps components context-free. A grid emits `rowActivated`; the page decides that means drill through. Without this, interaction would live in component code and be permanently outside the AI's reach.

### 3. Data source model — `data-source.schema.json`, `binding.schema.json`

A data source is a **declarative logical query**: an entity, a kind (`aggregate` / `list` / `single` / `search` / `graph`), a `select`, a recursive `filter` tree, `traversals` through catalog relationships, sorting, paging, and effective dating. No SQL, no physical objects.

Three details that carry real weight:

- **`skipWhenEmpty` defaults to `true`** on filter clauses. An unset filter channel must mean "no constraint", not "match nothing" — this default removes the single most common cause of mysteriously empty dashboards.
- **`asOf` / `knownAs`** support EDM's effective-dated and bitemporal data properly. Omitting bitemporality from the model would have made a large class of EDM questions unanswerable.
- **Aliases, not catalog refs, are what bindings reference.** A steward can re-point an attribute without touching component configuration.

Bindings map a component's declared role to a data field, with formatting, conditional formats, thresholds and per-column presentation. Charts use `encodings` (mark plus channel mappings) rather than a family of near-duplicate component types, giving the AI a compositional choice instead of a menu of twenty similar components.

### 4. Entity model — `entity.schema.json`

A business concept: business name, plural, synonyms, domain, primary key, label attribute, attributes, measures, effective-dating mode, logical data source, row entitlement domain, sensitivity, cost characteristics, and AI hints.

Two fields do disproportionate work. **`defaultDetailExperience`** makes drill-down generic — any component bound to an entity can drill in without the author or the AI knowing the page graph, and every page drills to the same place. **`cost.requiresFilter`** lets design-time validation reject an unfiltered query against a multi-million-row universe before a user ever sees a slow page.

### 5. Attribute model — `attribute.schema.json`

Attributes and measures are modelled separately because the decisions they demand are different.

Attributes carry type, semantic type (`isin`, `sedol`, `lei`, `currencyCode`, …), formatting, enum values, filterability, groupability, sensitivity, column entitlement and masking policy. `currencyFromAttribute` handles per-row currency — its absence is a classic source of silently wrong financial figures.

Measures carry `allowedAggregations` and `defaultAggregation`, which **binding validation enforces**: this is what prevents a category of confidently-wrong generated output such as summing a rate or averaging a distinct count. `higherIsBetter` and `defaultThresholds` let a KPI choose its own emphasis, so neither the author nor the model has to reason about whether a rising number is good news.

### 6. Relationship model — `relationship.schema.json`

From, to, cardinality, inverse, logical key mapping, join semantics, temporal semantics, traversal cost and expected fan-out.

Relationships enable the platform's two hardest capabilities: **graph expansion during AI retrieval** (the user says "security"; the retriever also offers pricing and related parties) and **declarative traversal** without an author writing a join. `joinSemantics` is a catalog decision made once by a steward rather than a per-page choice, because getting it wrong makes a dashboard silently under-report. `expectedFanout` informs whether the AI should generate a tab, an inline list, or a count.

### 7. Action model — `action.schema.json`

Twelve stable kinds — `navigate`, `drilldown`, `setFilter`, `clearFilters`, `setParameter`, `setSelection`, `refresh`, `export`, `openUrl`, `openOverlay`, `composite` — plus two **reserved** kinds.

`drilldown` is the generic form: name an entity, and the target resolves from the entity or the experience's `drilldownTargets`, with key parameters derived from the entity's primary key.

`export` is treated as a governed data egress event, with audit, reason capture and watermarking, because every other control in the platform applies to data on a screen while an export leaves the perimeter entirely.

**`invoke` (v2 write-back) and `workflow` (v3) are defined but reserved**, and rejected by the v1 validator. They are present so the seam exists: adding write-back and workflow later becomes a new action kind plus a server-side operation registry, rather than a breaking change to a schema thousands of stored definitions conform to. `invoke` already carries idempotency and optimistic-concurrency fields, because those are the parts that are expensive to retrofit.

### 8. Navigation model — `navigation.schema.json`

Experience navigation is the shell (tree, groups, badges, global search); page navigation is local (breadcrumbs, related links, back behaviour, header actions).

**Tabs are not here** — a tab is a layout container, because it partitions one page rather than moving between pages. Conflating the two makes deep-linking and deferred loading much harder, and it is a common modelling error.

`drilldownTargets` resolves the drill-down graph in one place per experience, so a target can be re-pointed once instead of edited in every page that drills there. `carryContext` on navigate and drilldown preserves experience-scoped parameters across the hop.

### 9. Security model — `security.schema.json`

**Read the schema's own description before using it.** Nothing in this model grants, widens or enforces access.

A page definition is a statement of intent, never a security boundary — definitions are authored by business users and written by a model, and a stored definition may have been hand-edited or copied between tenants. Enforcement is server-side in the Data Gateway, resolved from the caller's identity, independently of anything declared here.

What the model *is* for: declaring intended audience so the platform hides what is irrelevant rather than showing a wall of denied widgets; declaring `deniedBehaviour` per element; and carrying a **computed** `sensitivityDeclaration` so a reviewer approves with knowledge of what a page exposes. An author cannot understate it — the platform computes it from the catalog at validation time.

Eight closed `platformRole` values and open, registry-validated `capability` strings cover **platform** authorization only. Data authorization — which rows and columns — is owned by EDM and appears nowhere in this model. `workspaceScope` drives governance tiering: personal artifacts publish instantly, production requires review and separation of duties.

`allowCrossTenantExemplar` deserves specific attention. A client's dashboard describes that client's data model, naming conventions and operational concerns, so allowing it to serve as an AI few-shot exemplar in another tenant leaks commercially sensitive structure without touching a single data row. It defaults to `false` and is settable only by a Template Curator on scrubbed, platform-curated content.

### 10. Versioning model — `versioning.schema.json`

Four things version independently, and conflating any two causes bugs that are hard to diagnose later:

1. **`schemaVersion`** — the contract an artifact conforms to.
2. **`artifactVersion`** — a saved state of one experience; immutable once published.
3. **`pins`** — the catalog and registry versions the artifact was authored against.
4. **Component `version`** — per component type, in its manifest.

Pinning (3) is what makes a published page reproducible: same definition, same catalog, same component contracts. Migration is **lazy and in-memory** — the runtime migrates an older `schemaVersion` forward at load, and never mutates the stored artifact, because doing so would break publication immutability and change an audit record with no actor.

`provenance` records origin, and for AI-authored versions the prompt, prompt-template version, model version, retrieved concepts, exemplars used, validation attempts and cost. `editSummary.patchOperationCount` over generated versions is the platform's truest quality signal: it measures how much a human had to correct the first attempt.

`patchRecord` is the append-only log entry. Every change — a canvas drag, an AI refinement, a migration — is a JSON Patch through one store, which is what keeps conversational refinement coherent with direct manipulation and makes undo the inverse patch regardless of origin.

`compatibilityPolicy` documents what is additive versus breaking, and which enums are closed and why.

---

## 4. Required Capability Support

How each stated requirement is met, and where.

| Requirement | Mechanism |
|---|---|
| **AI-generated pages** | Closed objects so invented fields fail loudly (R1). Manifest `generation` projection as the emit vocabulary. Layout/components split matching two-stage plan-then-fill (R4). Catalog `synonyms` + `aiHints` for grounding. `allowedAggregations` and role `accepts` catching wrong bindings at design time. `provenance` for audit and quality measurement. |
| **Visual editing** | Keyed maps for stable patch paths (R2). Manifest `properties` schema driving generated inspectors. `patchRecord` log giving undo/redo and diffs. Layout placement separated from configuration, so a drag is a one-field change. |
| **Runtime rendering** | Statically analysable computable values (R5) yielding the invalidation graph without parsing. `loadPolicy` eager/deferred and `deferContent` for the first-batch fan-out budget. Manifest `skeleton` dimensions preventing layout shift. Six mandated states with per-instance overrides. `typeVersion` and `pins` making a render reproducible. |
| **Drill-down navigation** | `drilldown` action resolving via entity `defaultDetailExperience` or experience `drilldownTargets`. Key derivation from `primaryKey`. `carryContext` preserving experience parameters. `openIn` for self / tab / drawer / modal. Field-level `action` on a binding turning an id column into a link. |
| **Dynamic tabs** | Two modes, because there are two genuine requirements. `static` tabs with `visible` conditions cover asset-class-specific tabs. `dataDriven` tabs instantiate a template per row with a `$tab` scope, covering one-tab-per-related-item. Plus `badge`, `deepLinkId` for linkable tabs, `selectedTabChannel`, per-tab `security`, and `deferContent` so eight tabs do not issue eight queries. `repeater` is the non-tabbed counterpart. |
| **Data binding** | Data source aliases decoupled from catalog names. `bindingSet` keyed by manifest-declared roles, single or repeated. `encodingBinding` for charts. Formats, conditional formats, thresholds. Cross-validated against both the manifest and the data source. |
| **Future workflow** | Reserved `invoke` and `workflow` action kinds with idempotency and optimistic concurrency already modelled. `page.kind: workspace` (v2) and `process` (v3). `refresh.onActions` so a grid refreshes after a write. `experience.kind: process`. Confirmation with `requiresReason` and `auditProfile` already present, since governed mutation needs both. |

---

## 5. Validation Levels

A conformant artifact must pass all eight. Only level 1 is expressible in JSON Schema; the rest require the platform validator, which is shared by the Studio, the API and the AI repair loop so that all three agree.

| # | Level | Checks | Where |
|---|---|---|---|
| 1 | **Structural** | These schemas | Client + server |
| 2 | **Component** | Types exist at pinned `registryVersion`; `config` conforms to manifest `properties`; slots respect constraints | Server |
| 3 | **Semantic** | Entities, attributes, measures, relationships, data sources exist at pinned `catalogVersion`; local refs resolve | Server |
| 4 | **Binding** | Aggregation in `allowedAggregations`; role `accepts` and `dataTypes` satisfied; required roles present; alias exists in the source; units and currencies coherent | Server |
| 5 | **Entitlement** | Every referenced concept is visible to the caller — re-checked independently of retrieval, because retrieval scoping is a quality mechanism and not a security control | Server |
| 6 | **Cost** | Fan-out, estimated rows, `requiresFilter` honoured, page budget respected | Server (gateway estimate) |
| 7 | **Layout** | No overlaps or orphans; every referenced component exists; all breakpoints resolvable; widget count within limits | Client + server |
| 8 | **Accessibility** | Manifest `requiredLabels` populated; charts labelled; no colour-only encoding | Server |

Levels 5 and 8 are the two most easily skipped and the least recoverable later. Level 5 is a security boundary. Level 8 is what keeps generated content conformant without a human reviewing every page.

**Verification status:** all 16 schemas are valid JSON, conform to the 2020-12 metaschema, and have fully resolvable `$ref`s; all five example artifacts validate at level 1. Levels 2–8 require the platform validator, which is a milestone-1 deliverable.

---

## 6. Examples

| File | Demonstrates |
|---|---|
| `securities-catalog-excerpt.catalog.json` | Entity, attribute, measure and relationship models over securities, file processing, DQ exceptions and parties. Column entitlement and masking on a PII attribute; thresholds and `higherIsBetter`; drift findings. |
| `security-master-dashboard.page.json` | The dashboard journey: four KPIs, a stacked trend chart, an exception queue, shared filter channels, chart-to-grid filtering, drill-down, governed export, full AI provenance with a repair and an edit summary. |
| `security-detail.page.json` | The detail journey: parameterized single-record page, conditional asset-class tab, **data-driven tabs** with a per-tab-scoped data source, tab badge, per-tab security, deferred loading, auto breadcrumb from record data. |
| `securities-operations.experience.json` | Experience composition: page references, sidebar navigation with a live badge, shell-exposed shared parameters, the drill-down target graph, export policy, promotion across three environments. Two of its four `$pageRef` targets (`processing-detail`, `security-search`) are intentionally not included in this excerpt — they show the reference shape without duplicating a third and fourth page. |
| `kpi-card.manifest.json` | A full component contract: generation projection, config schema, roles with accepted field kinds, events with payloads, per-breakpoint behaviour, accessibility contract, skeleton, bundle entry. |

The dashboard and detail pages are the reference definitions named as a milestone-1 exit criterion: they are simultaneously the renderer's regression fixtures, the AI's expected-output corpus, and the source of few-shot exemplars.

---

## 7. Evolution

Full rules in `versioning.schema.json#/$defs/compatibilityPolicy`. In summary:

**Additive** — minor bump, existing artifacts stay valid: a new optional property; a new optional slot; a new component type; a new action kind; a new member of an *open* enum; a new curated data source; a new relationship.

**Breaking** — major bump, migration required: removing or renaming a property; making an optional property required; retyping a property; removing an enum member; **adding a member to a closed enum**, since existing validators will reject it; changing the meaning of an existing field.

Migrations are pure, ordered, chained functions applied forward in memory at load. Each ships with fixtures in both the old and new shape.

---

## 8. Known Gaps

Honest inventory of what this model does not yet cover.

| Gap | Disposition |
|---|---|
| Workflow definition (state machines, tasks, SLAs, escalation, compensation) | Deliberate. A distinct product surface with its own schema; only the seam where a page touches it is modelled here. |
| Write-back operation registry | v2. The `invoke` action seam exists; the server-side operation contract does not. |
| Input components (forms, editors) and validation rules | v2, arriving with write-back. `category: input` is reserved in the manifest. |
| Design token / theme schema | Referenced as `themeRef`; the token schema itself belongs with the design system. |
| Localization string-table format | Referenced as `stringTableRef`; the format is not yet specified. |
| `graph` and `tree` data source shapes | Declared in the enums and reachable, but their `select` semantics need the relationship-viewer component's requirements to firm up. |
| Cross-page composite templates | Templates currently version a single experience; a multi-experience solution template is a later concern. |
| Real-time / streaming data sources | Only `interval` refresh is modelled. Push-based updates would add a source kind and a transport decision. |

---

## 9. Decisions Requiring Ratification

| # | Decision | Consequence if reversed later |
|---|---|---|
| M1 | Closed objects throughout | Hallucinated fields validate silently |
| M2 | Keyed maps, not arrays, for referenceable members | AI patches and undo become unsafe under reordering |
| M3 | Layout references components rather than containing them | Two-stage generation and stable patch paths are both lost |
| M4 | Analysable wrappers for runtime values | Every state change must re-query the whole page |
| M5 | No physical data reference in any authored artifact | Promotion requires content edits; the audit chain breaks |
| M6 | Logical data sources on catalog entities, bound per environment | Same as M5, at the catalog level |
| M7 | Catalog pinned by immutable version | Live pages change meaning when the catalog changes |
| M8 | Attributes and measures modelled separately, with enforced `allowedAggregations` | A whole class of confidently-wrong generated output becomes possible |
| M9 | Security model is intent only; enforcement server-side | Definition tampering becomes a data-access path |
| M10 | Two naming primitives (`identifier`, `memberName`) | Inconsistent casing across metadata and component contracts |
| M11 | Reserved `invoke` / `workflow` action kinds defined now | Adding write-back and workflow becomes a breaking schema change |
| M12 | Two tab source modes (`static` + `dataDriven`) | One of the two real dynamic-tab requirements becomes unexpressible |
| M13 | `skipWhenEmpty` defaults to `true` | Unset filters silently produce empty pages |
| M14 | Emphasis semantics rather than colours; `themeRef` only | Generated pages can produce inaccessible palettes |
| M15 | Bitemporal `asOf` / `knownAs` in the data source model | A large class of EDM questions becomes unanswerable |
