# Prototype Implementation Status

**Milestone:** AI-powered Experience Builder prototype
**Status:** working end to end · mock AI · local JSON storage · not production-ready, by design

The goal of this milestone was one demonstrable claim: **a user describes a business experience in
natural language, the system generates an Experience definition, and the runtime renders it.** That
works. This document records what was built, how to run it, the decisions that shaped it, and what a
next milestone should close.

---

## 1. The Flow, End to End

```
prompt  →  intake · retrieval · context · plan · fill  →  assemble  →  validate  →  render  →  save
           (browser)            (model call → server)     (browser)   (8 levels)   (renderer)  (REST)
```

Verified in a browser against the running application:

| Step | Observed |
|---|---|
| Prompt | *"Create a Security Master Operations Dashboard showing today's files processed, late files, exceptions, new securities, and processing KPIs."* |
| Generated | 7 widgets over 2 entities in **883 ms** — 4 KPIs, a trend chart, a table, a summary line |
| Pipeline | 8 stages reported: intake · retrieval · context · plan · fill · assemble · validate · provenance |
| Model call | `mock@1.0.0 via /api/ai/generate` — 22,763 tokens in / 834 out (counted, not estimated) |
| Validation | `valid` at levels **structural, component, semantic, binding, layout** |
| Rendered | Live data through the gateway: Files Processed 15, Late Files 6, Security Count 25, Failed Files 5 |
| Saved | `securities-today` v1 in the store, then routable at `/x/securities-today` |
| Sample experience | `/x/security-operations` renders 4 KPIs, 2 charts, a 25-row queue, a search bar — all `ready` |
| Drill-down | Clicking a security id → `/x/security-operations/security-overview?as-of=…&security-id=SEC00023` → "Nestle SA Series 2", 28 contributions, 84.0% average confidence |
| Entitlements | Switching to the Restricted persona: 4 widgets `denied`, 4 `ready`, the page still usable |
| Responsive | 430 px: **zero** horizontal overflow |
| Console | no errors |

---

## 2. What Was Built

### 2.1 The application — `apps/experience-studio/`

Angular 21, standalone components, signals, zoneless change detection, Angular Material.

| Surface | What it does |
|---|---|
| **Shell** | Header, collapsible navigation, main workspace, three-state theme (system / light / dark), persona switch, live API and catalog status |
| **Create with AI** | Prompt box with worked examples, a stage-by-stage pipeline view, and four result tabs: **Rendered**, **Definition** (the JSON, copyable and downloadable), **Structure** (sections, widgets, sources, entities), **Grounding** (what the catalog offered the model and what it withheld) |
| **Experiences** | The library: one card per saved experience, showing origin, version, and — for generated ones — the prompt that produced it |
| **Runtime** | `/x/:experienceId/:pageId`. One route for every experience; page switching and drill-down come from the definition |

Three of those deserve a note on *why*:

- **The Definition tab is not a developer toggle.** The JSON is the artifact that gets reviewed,
  versioned, promoted and rendered. Showing it is what makes the platform's central claim checkable
  rather than asserted.
- **The Grounding tab exists because retrieval is where generation quality is decided.** A user who
  can see "4 entities kept, 2 withheld" can tell whether the system understood them.
- **The persona switch is the most honest feature in the app.** Data authorization is a separate axis
  from platform authorization, and the only way to show it is to change identity and watch widgets
  become `denied` while the page stays usable.

### 2.2 The backend — `server/`

Node 22 + Express 5, run with `tsx`. Four services behind one process, split the way
`architecture/backend-architecture.md` §2.2 splits them rather than the way the UI is shaped:

| Endpoint | Service | Notes |
|---|---|---|
| `GET /api/health` | — | Catalog version, served entities, experience count, provider roster |
| `GET /api/personas` | Identity | Identity is resolved **server-side**; the client holds a persona id and nothing else |
| `GET /api/catalog` | Catalog | The entitlement-scoped **projection**: `physical` stripped, unentitled members removed |
| `GET/POST/PUT/DELETE /api/experiences` | Definition store | Local JSON, append-only version history, published versions refused |
| `POST /api/ai/generate` | Generation | **The one place a model is reached** |
| `POST /api/data/batch` | Data Gateway | One batch per render, per-query status, row/column entitlements, fan-out cap |

### 2.3 The libraries

Requested structure, built as the brief asked — with each library given a real job rather than a
wrapper:

| Library | What it owns |
|---|---|
| `libs/experience-model/` | The Experience model: `Experience → Pages → Sections → Components → Data Sources → Actions`, plus outline/traversal helpers and the store's wire types |
| `libs/page-renderer/` | The Experience host — resolve a page, seed parameters, render, act on navigation. **The only rendering path in the app** |
| `libs/component-library/` | The registry plus the palette metadata the Create screen shows: what components exist and what a prompt might say to get each |
| `libs/ai-service/` | The client half of the model seam: the pipeline runs here, `HttpModelProvider` crosses the network, offline degradation is stated |
| `libs/metadata-service/` | Clients for the four services, with a typed error category the UI branches on |

### 2.4 The sample experience — a file, not code

`apps/viewer/public/definitions/security-operations.experience.json` + `operations-dashboard.page.json`

| Requested | Delivered |
|---|---|
| KPIs: Files Processed, Failed Files, Late Files, New Securities | Four KPI cards, thresholds from the catalog's own `defaultThresholds` |
| Charts: Processing Trend, Exceptions by Type | Two `analytics.chart` widgets — a stacked date trend and a rule breakdown |
| Table: Recent Exceptions | `data.table`, 25-row page, sortable, row selection, conditional severity emphasis |
| Navigation: click Security → Security Overview | A `drilldown` action resolving through the experience's `drilldownTargets` |

Nothing about it is hardcoded. Deleting the file removes the dashboard; editing it changes the
dashboard; no TypeScript mentions any of its widgets.

---

## 3. How To Run It

```bash
npm install

# both together (recommended)
npm run dev            # API on :4000, app on :4200 with /api proxied

# or separately
npm run api            # Node backend  → http://localhost:4000/api/health
npm run app            # Angular app   → http://localhost:4200

# gates
npm run validate       # structural validation of every schema and artifact
npm run test           # 255 unit tests, including the shipped-artifact gate
npm run verify         # validate + test + build all three apps
```

First boot seeds the store from the repository's shipped definitions, so the app has experiences to
open before anything has been generated. The store lives in `server/data/` and is safe to delete —
it re-seeds.

To point generation at a real model:

```bash
AI_PROVIDER=claude ANTHROPIC_API_KEY=… npm run api
```

That is the whole switch. `server/ai/providers/claude.ts` states exactly what implementing it
requires, including the controls that must land at the same time.

---

## 4. Architecture Decisions

### D1 — The Experience model is the existing model, not a new one

`libs/experience-model` re-exports `@opus/contracts`, which is the TypeScript projection of the JSON
Schemas in `/schemas`. Those schemas are what the renderer, the validator, the visual builder, the
generator and the store all bind to.

A second set of interfaces named `Experience` and `Page` would have been a second answer to what an
Experience *is*, and the two would have drifted within a milestone. What the library adds is the
vocabulary this prototype talks in — **Section** — mapped onto the model rather than parallel to it:
a section is a layout container node, and `sectionsOf()` walks the tree the schemas define.

### D2 — The pipeline runs in the browser; the model call crosses the network

`POST /api/ai/generate` takes one model request and returns one model response. Intake, retrieval,
context assembly, planning, filling, assembly, validation, repair and fallback all run client-side in
`@opus/generation`.

The split follows what actually needs to be server-side: **credentials**. Moving the whole pipeline
behind the network would relocate a great deal of code that has nothing to do with the model, and
would make the Studio's continuous validation a round trip. The seam is the `ModelProvider` port that
already existed — `HttpModelProvider` implements the same interface the in-browser stand-in does, so
the pipeline cannot tell which it is holding.

### D3 — The gateway moved to the server, and that is the biggest change of substance

Earlier milestones ran `MockGateway` in the browser because there was no server. It demonstrated the
*shape* of enforcement without being enforcement: the logical→physical map, the row predicates and
the column rules were all in the tab that was asking the questions.

`GatewayService` now takes a **transport**. The Viewer and the Studio keep the in-process mock; this
app uses `HttpGatewayTransport`, and the same query engine runs in the server process. The client
keeps only the jobs a client should have — batching, and caching by
`(source, params, entitlementScopeHash)` — and never invents a TTL.

### D4 — Storage keeps three properties of the real model and admits the rest

A save creates a new version and keeps the previous body under `versions/`; published versions are
refused; every mutation is audited with actor, origin and correlation id. Transactions, ETag
concurrency, tenancy and row-level security are absent and listed in §6.

### D5 — Material for the shell, platform tokens for the rendered page

Angular Material themes the chrome. The `--opus-*` design tokens theme the rendered experience,
because a definition names semantics (`emphasis: negative`) and never colours — which is what stops a
generated page from producing an inaccessible palette. Both follow one `data-theme` attribute, so the
theme toggle moves them together.

The icon font is **self-hosted** (`material-icons`), not fetched from a CDN: an app that renders
"menu" as literal text when a font request fails is not an enterprise application.

### D6 — One rendering path

`ExperienceHostComponent` renders the Create screen's preview and the saved runtime. They differ in
where the definition came from, never in code path. A separate preview renderer is the standard origin
of "it worked in preview" defects.

---

## 5. Defects This Milestone Found

Building the prototype exposed five real defects — three in the platform, two in the sample. All are
fixed; each is recorded because the finding is the value.

**The catalog projected nothing.** `CatalogService.projectionFor` tests an entity's
`rowEntitlementDomain` and an attribute's `columnEntitlement` — data entitlements owned by EDM —
against the caller's capability list. Passing only platform capabilities filtered out every entity, so
retrieval matched nothing and generation honestly reported that it could not find the concepts. The
server now unions both axes, in the one process that legitimately holds both.

**An installed model provider was overridden on first use.** `GenerationService.useProvider` is the
seam the library advertises, and the orchestrator replaced whatever was installed with the built-in
stand-in on the first call — so the prototype's HTTP provider never ran. An installed provider now
wins, and the decision inputs a rules-based stand-in needs travel through a documented optional
method on the port rather than a cast at the call site.

**A field-level action did nothing at all.** A binding may declare an `action`, which is what turns an
id column into a link. The table emits `cellActivated` carrying `$actionId` — and unless the page also
mapped that event, the click was swallowed: the link rendered, stopped the row's own handler, and
produced nothing. The worst of the three possible outcomes, because it looks like a working
affordance. The dispatcher now honours the declared field action when no event mapping overrides it.

**Empty data-driven tabs rendered an empty strip.** `dataDrivenEmpty` was computed and never used, so
a detail page whose tab source returned no rows showed a tab bar with nothing in it. It now states
what is missing — *"contributing sources returned no rows for this record"* — which is an answer
rather than an apparent fault.

**Two mistakes in the sample, caught by validation before a browser saw them:** a `typeVersion` pinned
to a component version the registry does not have, and an invented `orientation` property on the chart
config. Both were exactly what closed objects and pinned registries exist to catch. The third — a
`formatDate` function that does not exist in the closed expression library — was caught the same way.

Also worth recording: **backticks inside a component's template literal terminate the string.** Third
occurrence in this repository, this time in an HTML comment. Worth a lint rule.

---

## 6. What This Prototype Is Not

Stated plainly, because a prototype that hides its gaps teaches the wrong lesson.

| Gap | Consequence | Where it should close |
|---|---|---|
| **The client sends data source definitions with each batch** | A production gateway resolves them server-side from the pinned definition version and never trusts a client-supplied query shape. Needed here because a generated draft is previewed before it is saved | Next milestone, first item |
| **Identity comes from an `x-persona` header** | A demo switch doing what the security architecture forbids: identity must come from a verified token claim | OIDC integration |
| **Save is a whole-document PUT** | No optimistic concurrency; two authors would overwrite each other. The builder already produces JSON Patches | Wire `@opus/studio-core` to `POST /draft/patch` with `If-Match` |
| **No real model** | The mock is a rules engine over the same grounding a model would receive — good enough to exercise validation, repair and fallback; not a language model | `AI_PROVIDER=claude` plus the controls in `claude.ts` |
| **Local JSON storage** | No transactions, no tenancy, no row-level security | PostgreSQL + JSONB per `backend-architecture.md` §4 |
| **Validation levels 5, 6, 8** | Entitlement, cost and accessibility validation still do not run | Gateway estimate endpoint + an axe gate |
| **`axis.labelRotation` validates but is not implemented** | A definition can ask for rotated axis labels and silently not get them | Chart component, or remove from the schema |
| **`includeOther` on a dimension is not implemented** | `limit` truncates rather than bucketing the remainder | Gateway |
| **No write-back, no agents** | `invoke` and `workflow` remain reserved and rejected | The runtime specification's operation registry |

---

## 7. Recommended Next Milestone

**Close the loop between the builder and the store, and make the gateway trustworthy.** In order:

1. **Server-side data source resolution.** The gateway should load the pinned definition and resolve
   sources itself, with a narrow exception for previewing an unsaved draft — a `POST /api/data/preview`
   that takes a definition, validates it, and applies the same entitlements. This is the one gap that
   is a security property rather than a convenience.
2. **Patch-based saves with `If-Match`.** `@opus/studio-core` already produces JSON Patches with exact
   inverses. Wiring them to the server gives optimistic concurrency, a server-side diff for the audit
   trail, and an undo history that survives a reload — three properties for one integration.
3. **Refinement.** "Add a chart of exceptions by asset class" against an existing experience. The
   generation library already supports refine mode and returns a patch; the app has no surface for it.
   This is the highest-value user-facing addition, and it depends on (2).
4. **A real model behind the port**, with the controls from `claude.ts` landing at the same time:
   credentials in a vault, per-tenant rate and cost caps, egress policy, region pinning, provenance.
5. **The evaluation harness.** Once a real model is in, generation quality becomes unfalsifiable
   without it. A golden corpus with a hard zero on entitlement leaks, gated in CI.

A reasonable stretch: **the visual builder in this app.** `apps/studio` already edits the same JSON
model; folding it in would let a user generate, then adjust, then save — which is the workflow the
product is ultimately for.
