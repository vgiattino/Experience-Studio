# Frontend Architecture

Status: **Draft for approval**
Related: [`architecture-review.md`](./architecture-review.md) · [`runtime-architecture.md`](./runtime-architecture.md) · [`backend-architecture.md`](./backend-architecture.md)

---

## 1. Shape of the Frontend

Experience Studio's frontend is unusual in one respect that drives every decision below: **the application does not know its own screens at build time.** Screens arrive at runtime as JSON. That single fact means the frontend is not an application with features — it is an *interpreter* plus a *component vocabulary* plus an *authoring tool for the interpreter's input*.

Three consequences follow, and they are the spine of this document:

1. Angular's static analysis cannot see what will be rendered, so the component vocabulary must be reachable through an explicit, generated registry (§5.2).
2. Component contracts are load-bearing data, not documentation — the same manifest must drive the renderer, the validator, the builder palette, and the AI's generation vocabulary (§3.2).
3. State cannot be modelled as "the app's state." It splits into four tiers with different lifetimes and different owners, and conflating them is the most likely way this codebase becomes unmaintainable (§4).

---

## 2. Application and Library Structure

### 2.1 Two applications, one renderer

**Recommendation: ship two deployable applications that share the renderer.**

| App | Audience | Contains | Optimized for |
|---|---|---|---|
| **Viewer** | All business users | Renderer, component library, data client | Cold-start time, render latency |
| **Studio** | Authors, stewards, admins | Everything in Viewer, plus canvas builder, inspector, prompt panel, catalog browser, version history, governance UI | Authoring capability |

The alternative — one app with a lazy-loaded `/studio` route — is simpler to deploy. It is rejected because it makes every business user pay for authoring code in shared chunks, gives the authoring surface the same origin and CSP as the runtime, and couples release cadence of a high-churn tool to a latency-critical runtime.

The critical constraint: **Studio's preview must use the Viewer's renderer, unmodified.** A second "preview renderer" is how preview-versus-production divergence bugs are born. Preview differs only in *which version* it loads (unpublished draft) and *whose* entitlements apply (the author's) — never in code path.

### 2.2 Library layering

An Nx monorepo with tag-based dependency rules enforced by lint. Dependencies flow strictly downward; a violation fails CI.

```
apps/
  viewer                        # runtime shell
  studio                        # authoring shell
libs/
  contracts/                    # (L1) generated types from JSON Schemas — zero runtime deps
  platform/                     # (L2) http, auth, telemetry, errors, flags, i18n, breakpoints
  design-system/                # (L3) tokens, theming, primitives (button, field, menu, dialog)
  components/
    layout/  data/  analytics/  business/    # (L4) renderable components + manifests
  component-registry/           # (L4) generated type -> loader map
  renderer/                     # (L5) definition interpreter, expression engine, layout engine
  data-client/                  # (L5) gateway client, batching, cache, entitlement-aware keys
  catalog/                      # (L5) semantic catalog projection, retrieval, grounding pack
  generation/                   # (L6) intake, context assembly, plan/fill, assembly, orchestration
  studio-core/                  # (L6) definition store, patch log, undo, diff
  studio-ui/                    # (L6) canvas, inspector, palette, prompt panel, catalog browser
  testing/                      # fixtures, harnesses, definition builders
```

| Layer | May depend on | Notably may **not** depend on |
|---|---|---|
| L1 `contracts` | nothing | anything |
| L2 `platform` | L1 | design-system, components |
| L3 `design-system` | L1, L2 | components, renderer |
| L4 `components` | L1–L3 | renderer, other component libs, data-client |
| L4 `component-registry` | L1, L4 (lazily) | renderer |
| L5 `renderer` | L1–L3, registry, data-client | components (directly), studio-* |
| L5 `catalog` | L1 | renderer, data-client, generation |
| L6 `generation` | L1–L5 | components (directly) |
| L6 `studio-*` | L1–L5 | — |

Two rules in that table deserve emphasis because they are easy to violate and expensive to unwind:

**The renderer must not import components directly.** It resolves them through the registry. Otherwise the renderer's bundle transitively contains every component and code-splitting is impossible.

**`catalog` depends on `contracts` alone.** It is the layer both the generator and the gateway need, from opposite directions — the generator needs the entitlement-scoped *projection*, the gateway needs the server-only *physical* map — and giving it any wider dependency would make the one library that must be usable on both sides of the network unusable on either. For the same reason the validator's level-3 check takes a minimal structural interface rather than importing `catalog`.

**Components must not import the data client.** They receive resolved data as an input signal. A component that fetches its own data cannot be composed, cannot be batched into the dashboard's single query round trip, cannot be previewed with fixture data, and becomes a second path to EDM — which §5 of [`security-architecture.md`](./security-architecture.md) forbids outright.

### 2.3 Contracts as a generated package

`libs/contracts` is generated, never hand-written: TypeScript types emitted from the JSON Schemas (definition, component manifest, semantic catalog) and the backend OpenAPI document. The generator runs in CI; a drift between schema and committed types fails the build.

This is what makes the schema a real contract rather than an aspiration. Frontend and backend consume the *same* generated artifact from the same source of truth.

---

## 3. Component Framework

### 3.1 The renderable component contract

Every component the renderer can instantiate implements one uniform shape. Uniformity is what allows the renderer to treat components as interchangeable, and allows the AI to emit any component without special cases.

| Input | Type | Purpose |
|---|---|---|
| `config` | component-specific, typed from manifest | Authored properties (title, thresholds, encodings, columns) |
| `data` | `Signal<DataResult>` | Resolved query result, or loading/empty/error/denied state |
| `context` | `PageContext` | Params, filter state, selection, breakpoint, locale, theme, entitlement summary |
| `slots` | `Record<string, LayoutNode[]>` | Child nodes, for layout and composite components |

| Output | Purpose |
|---|---|
| `action` | Declared interactions: drill-down, navigate, select, filter-change, invoke |

Components are **standalone**, `OnPush`, signal-based (`input()`, `output()`, `computed()`), and contain no NgModules. Two hard rules:

- **No service injection for data or navigation.** A component that injects the router or the data client can no longer be rendered inside a preview, a template thumbnail, or a test without the whole application around it. Interaction leaves the component as an `action` output; the renderer decides what it means.
- **No cross-component knowledge.** Coordination happens through `PageContext` channels declared in the definition (§4.2), never through direct references or shared singletons.

### 3.2 The manifest is the source of truth

Each component ships a `component.manifest.json` alongside it:

```
type            # stable identifier referenced by definitions, e.g. "analytics.kpi-card"
version         # semver of the contract
category        # layout | data | analytics | business
purpose         # one line, written for the AI's generation view
whenToUse       # short guidance, also for the AI
properties      # JSON Schema for `config`
dataRequirement # none | single-value | series | tabular | graph  (+ required roles)
events          # emitted action names and payload schemas
slots           # named child regions and their constraints
breakpoints     # supported behaviour per breakpoint
entitlements    # platform capabilities the component needs (e.g. export)
accessibility   # keyboard contract, required labels, role semantics
states          # which of the six states it implements natively
```

Four consumers read this one file:

1. **Renderer** — instantiation and slot wiring.
2. **Validator** — is this definition's `config` valid for this component version? (backend and frontend, same schema)
3. **Studio** — palette entries, inspector form generation. The inspector should be *generated* from the property schema, not hand-built per component; hand-built inspectors are the reason low-code platforms stop adding components.
4. **Generation service** — the reduced "generation view" (`type`, `purpose`, `whenToUse`, `dataRequirement`, key properties) is the AI's vocabulary. See [`ai-architecture.md`](./ai-architecture.md) §4.

**Drift prevention:** a build step generates the `config` TypeScript type from the manifest's property schema, and the component must declare its input using that generated type. Manifest and implementation cannot diverge without a compile error. This is the mechanism that keeps the contract honest as the library grows past a few dozen components.

**Versioning:** additive changes only within a major version — new optional properties, new optional slots. Removing or retyping a property is a major version, which requires either a definition migration or parallel registration of both versions. A published definition pins the registry version it was authored against, so a component change can never silently alter a live page.

### 3.3 Tiering and composition

| Tier | Examples | Rule |
|---|---|---|
| **Design-system primitives** | Button, field, menu, dialog, table shell | Know nothing about definitions or data. Reusable in Studio chrome too. |
| **Layout components** | Container, row, column, grid, tabs, panel, drawer | Own slots and responsive behaviour. Never bind data. |
| **Data components** | Grid, tree, search, filter, relationship viewer | Bind one data source. No domain semantics. |
| **Analytics components** | KPI card, big number, chart, trend, gauge, heat map | Bind one data source. No domain semantics. |
| **Business composites** | Exception Queue, Approval Panel, Security Overview, Workflow Status | Compose lower tiers. Encode EDM domain semantics. |

**Business composites must be compositions, not bespoke implementations.** An Exception Queue is a grid plus filters plus bulk-action affordances with domain defaults — not a new widget with its own table code. If composites are allowed to reach for raw DOM and raw data, the library forks into two incompatible halves and the second half is unmaintainable.

### 3.4 The chart family

"Chart" as a single component is a modelling error (see review §G9). Recommendation: one component type `analytics.chart`, configured by an **encoding model** rather than a chart-type enum:

```
mark        # line | bar | area | point | pie | combo
encodings   # x, y, series, size, color, tooltip -> catalog field or measure references
axes        # scale, format, bounds, gridlines
legend      # position, visibility
stacking    # none | stacked | normalized
```

This gives the AI a compositional vocabulary — it selects a mark and maps fields to encodings, which is a well-structured decision — rather than choosing among twenty near-duplicate component types. The underlying charting library sits behind an adapter port in `components/analytics` so it can be replaced without touching a single stored definition.

### 3.5 Six states, mandated

Every data-bound component implements: **ready, loading, empty, partial, error, denied**. A shared state-shell wrapper provides the default presentation; components override only where the default is wrong.

This is mandated rather than encouraged because of who authors pages. A human developer remembers the empty state when they see it. A generated page has no such moment — the AI emits a definition and the state coverage must already be there. Mandating the six states in the component tier is what makes every generated page complete by construction.

`denied` is separate from `error` deliberately: a user lacking column entitlement is a normal, expected outcome that must read as "not available to you," not as a fault.

**Angular constraint, found in M1:** `<ng-content>` cannot be projected into an embedded view, so placing it inside `@if` or `@switch` silently renders nothing. The state shell therefore always instantiates the projected widget and toggles it with CSS, keeping only the state presentations under control flow. Without this, widgets mount, report `ready`, and display empty boxes — a failure with no error to follow.

### 3.6 Accessibility and internationalization

Both belong in the component tier, and this is where the architecture gets a genuine advantage: **if components are accessible and localized by construction, every AI-generated page inherits both for free.** That leverage exists only if the investment is made before the library is written.

- WCAG 2.2 AA as a component-level acceptance criterion: keyboard contract per manifest, automated axe checks plus manual keyboard and screen-reader verification in the component test suite, CI gate.
- Locale, currency, timezone and number formatting resolved from `context`, never hardcoded. Chart palettes validated for contrast and non-colour-redundant encoding.
- Authored labels are translatable strings separated from the definition body, so a published experience can be localized without editing content.

### 3.7 Change detection

**Zoneless change detection with signals throughout.** Justification specific to this product: a dashboard is many independent data widgets updating on independent schedules. Zone.js patching charges every widget for every async event anywhere on the page, while signals invalidate exactly the computed graph that depends on changed data. With dynamically created component trees, that precision is the difference between a dashboard that updates smoothly and one that re-renders itself repeatedly.

---

## 4. State Management

### 4.1 Four tiers, four owners

**Recommendation: signals throughout; no global store library.** The four tiers below have different lifetimes and different owners, and the single most valuable thing this section does is refuse to merge them.

| Tier | Owner | Lifetime | Contents |
|---|---|---|---|
| **1. Session** | Root injector | Login → logout | User, tenant, platform roles, entitlement summary, feature flags, theme, locale |
| **2. Definition** (Studio only) | `DefinitionStore`, per open experience | Editing session | The authored definition, patch log, undo/redo, dirty state, validation results |
| **3. Page runtime** | `PageContext`, per rendered page instance | Page view | Params, filter state, selection, breakpoint, per-widget status |
| **4. Server data** | `QueryCache` | TTL-bounded, cross-page | Query results keyed by source + params + entitlement scope |

Tier 3 is provided at the *renderer root*, not the application root. Multiple pages must be able to coexist — Studio preview beside canvas, a drawer containing a second page, side-by-side comparison. An application-global page state makes all of that impossible.

Tier 4 must never be merged into tier 2. Server data in the definition store means data gets serialized into saved definitions, cached across entitlement scopes, and captured in undo history. All three are defects; the third is a security defect.

### 4.2 Declared interaction instead of implicit coupling

Cross-component behaviour is declared in the definition and mediated by `PageContext` channels. A filter component writes to channel `filter.assetClass`; a grid declares that its data source parameter reads that channel; the renderer derives the dependency graph at compile time and re-queries only affected sources.

Two properties make this worth the indirection. It is **expressible in JSON**, so the AI can generate interactivity — which it cannot do if coordination lives in hand-written component code. And it is **statically analysable**, so the renderer knows the invalidation graph without running anything.

### 4.3 The definition store: a document with a patch log

This is the mechanism that resolves the hardest UX problem identified in the review (§G10): keeping conversational refinement coherent with direct manipulation.

**The definition is the single source of truth, and every change to it — from any source — is a JSON Patch applied through one store.**

```
Direct manipulation ─┐
AI refinement       ─┼─►  Command  ─►  JSON Patch  ─►  DefinitionStore  ─►  Renderer
Advanced JSON edit  ─┘                     │
                                     patch log (undo / redo / audit / diff)
```

- Dragging a widget, editing a property, and "make the chart a bar chart and add a filter" are the same kind of operation, differing only in who produced the patch.
- The AI receives the *current* definition and returns a patch, so manual edits survive refinement by construction rather than by careful merge logic.
- Undo is the inverse patch. It works identically across manual and AI changes, which is what makes the AI feel safe to use.
- The patch log yields diffs for review, provenance for audit, and a natural basis for future multi-author collaboration.

**[implemented]** Built in `libs/studio-core` and `libs/studio-ui`; see [`../docs/VISUAL-BUILDER.md`](../docs/VISUAL-BUILDER.md). Three details this section did not anticipate, each of which the implementation had to settle:

1. **One command is one patch, even when it touches several places.** Deleting a widget removes its layout node, its component instance and its now-unreferenced data source together, so a single undo reverses what the user thinks of as a single action. Emitting a patch per touched location makes undo count in units the user does not recognise.
2. **Inversion must be computed op-by-op against the intermediate state**, not against the pre-patch document. Inverting a whole list against the original is correct for single-op patches and silently wrong for every structural edit — which is all of them.
3. **Selection does not belong in the store.** It is not an edit, and putting it in the patch log makes undo step backwards through clicks.

**[revised by implementation] `(id, artifactVersion)` is not content identity.** It identifies a *published, immutable* artifact and nothing else, and it had been used as content identity in four places — the compile cache, the loader, the renderer's attach guard, and the Studio's own working copy. Each reuse failed differently and quietly: a canvas frozen at the version first loaded, a data source added mid-session never queried. Any component that caches or guards on that pair must first establish that the artifact cannot change beneath it; an in-memory definition never satisfies that.

**Why not NgRx.** NgRx models many entity slices with independent reducers. This domain is one document mutated by patches, plus three tiers that are explicitly not global. A document store with a patch log is a closer fit, an order of magnitude less code, and does not tempt developers to promote page runtime state into a global store — which is the failure mode a global store library invites here.

### 4.4 Server data

The query cache is keyed by `(dataSourceId, resolvedParams, entitlementScopeHash)`. The entitlement component of the key is not optional — omitting it means one user's rows can be served to another. This is stated again in [`security-architecture.md`](./security-architecture.md) §6 because it is the single highest-consequence caching mistake available in this system.

Beyond keying: in-flight request deduplication, TTL supplied by the gateway per data source (the gateway knows data volatility; the client does not), invalidation on successful write actions, and no client-side result mutation.

---

## 5. Page Rendering Engine

The runtime lifecycle is specified end-to-end in [`runtime-architecture.md`](./runtime-architecture.md). This section covers the Angular-specific engineering decisions.

### 5.1 Compile once, render many

The renderer separates **compilation** (definition → immutable `CompiledPage` plan) from **instantiation** (plan → live component tree). Compilation resolves component types, compiles expressions into signal factories, resolves data sources into query descriptors, and builds the layout tree with breakpoint variants.

Because published definition versions are immutable, `CompiledPage` is memoizable per definition version. Re-rendering, navigating away and back, or switching breakpoints does not recompile.

### 5.2 The static component registry

This is the decision that resolves Angular's central tension with metadata-driven rendering (review §G11): components named by strings in JSON are invisible to static analysis, so the bundle either includes everything or misses what is needed.

**Recommendation: a generated registry mapping component type to a dynamic import.**

```
'analytics.kpi-card': () => import('@opus/components/analytics/kpi-card')
'data.grid'         : () => import('@opus/components/data/grid')
```

Properties that matter:

- **Generated from the manifests**, never hand-maintained. A component without a manifest is not registerable; a manifest without an implementation fails the build.
- **Explicit**, so the Angular compiler and bundler can see every dynamically-reachable component and split it into its own chunk.
- **Version-aware.** The registry is published with a version; definitions pin it. An unknown type resolves to a placeholder widget with telemetry — never a blank page (see runtime failure matrix).
- **The one extension point.** Future third-party components register here, which gives a single place to apply review gates and sandboxing.

Instantiation uses Angular's dynamic component creation with signal-based input bindings, so subsequent data arrivals update inputs rather than destroying and recreating components. Two details, both learned by building it in M1:

- **Probe before setting an input.** Angular *logs* NG0303 for an unknown input rather than throwing, so a blind `setInput` produces console noise the host cannot catch. The host checks that the component declares the input first — and components legitimately omit optional inputs they have no use for.
- **A recursive layout component needs `forwardRef` in its own `imports`.** A direct self-reference is evaluated while the class binding is still uninitialised, resolves to `undefined`, and makes *every other importer* fail with NG2012 — an error that points away from the cause.

### 5.3 Layout and responsiveness

Definitions declare a **12-column responsive grid** with per-breakpoint overrides for position, span, order and visibility; the renderer maps this to CSS Grid. The AI generates the breakpoint variants as part of the definition, which is what makes "responsive by default" a property of the artifact rather than a hope about CSS.

**Prefer container queries over viewport media queries.** A component's correct layout depends on the space *it* occupies, not the size of the window. The same KPI card appears full-width on a dashboard, in a narrow drawer, and in a split detail pane; only container queries make it behave correctly in all three without the definition having to know where it was placed.

**Breakpoint overrides resolve mobile-first** (settled in M1, documented in `common.schema.json`): the base placement is the narrowest case, and an override applies at its breakpoint and wider. Choosing a direction matters more than which direction — a definition set that mixes mobile-first and desktop-first placement silently mislays panels, because an override intended for one end of the scale leaks to the other.

**A row-direction stack is laid out on the same 12-column grid as a grid container.** `colSpan` means "columns of twelve", and flex-basis percentages cannot honour that once gaps are added: four 25% items plus three gaps overflow and wrap to one per line.

### 5.4 Expression evaluation

Visibility rules, conditional formatting, thresholds and computed labels require expressions. The grammar is specified as a milestone-1 deliverable; the frontend requirements on it:

- Compiled once at page-compile time into a pure function, then wrapped in a `computed()` over `context` and row data — so expression re-evaluation participates in the signal graph rather than running on every change detection pass.
- Sandboxed: no `eval`, no `Function` constructor, whitelisted function set, no property access outside the supplied scope, no network or DOM reach, bounded evaluation cost.
- Deterministic and side-effect free, so it is safe to evaluate during validation, in the AI's cost estimation, and in tests.

### 5.5 Error isolation per widget

Angular has no built-in error boundary. The renderer must provide one: each widget is instantiated inside a host that catches construction errors, binding-evaluation errors, and runtime errors from the component, and degrades that widget to its `error` state.

The requirement is bluntly practical — **one failing widget must never blank a twelve-widget dashboard.** For AI-generated content this is not an edge case but an expected condition, and it is also what makes partial failure legible: the user sees which widget failed, and telemetry records it against the definition version and component version.

### 5.6 Render performance

- **Deferred hydration** of below-the-fold widgets on viewport intersection, with manifest-supplied skeletons. A dashboard's first paint should not wait on widget nine.
- **Eager set** determined at plan time: above-the-fold widgets are batched into the first query round trip; deferred widgets query on activation.
- **Virtualized grids** with server-side paging — mandatory for security-universe scale, not an optimization.
- **Instrumented budgets:** per-widget time-to-ready, query latency, cache hit rate, and count of widgets exceeding budget, all tagged with definition and component version so regressions are attributable.

---

## 6. Testing Strategy

| Level | Subject | Approach |
|---|---|---|
| Contract | Manifests vs implementations | Generated types; drift fails build |
| Component | Each renderable component | All six states, breakpoint snapshots, axe + keyboard checks, fixture data only |
| Expression | Grammar and evaluator | Property-based tests; sandbox escape attempts |
| Renderer | Definition → DOM | Golden definitions from the reference corpus render to expected structure |
| Store | Patch semantics | Round-trip and undo/redo invariants; AI patch + manual patch interleaving |
| Integration | Renderer + gateway | Real batch queries against seeded EDM, including denied-column and denied-row paths |
| Architecture | Layering rules | Lint-enforced dependency boundaries; a test asserting no component imports the data client |
| E2E | Journeys | The three v1 journeys, plus the failure paths (ambiguous prompt, denied field, expensive query, undo) |

The **reference definition corpus** is shared with the AI evaluation harness ([`ai-architecture.md`](./ai-architecture.md) §7). One corpus serves as renderer regression suite, AI expected-output set, and few-shot exemplar source.

---

## 7. Decisions Requiring Ratification

| # | Decision | Consequence if reversed later |
|---|---|---|
| F1 | Two apps (Viewer, Studio) sharing one renderer | Bundle and release-cadence rework |
| F2 | Manifest-driven components with generated config types | Contract drift becomes unavoidable at scale |
| F3 | Generated static component registry with lazy imports | Renderer bundle cannot be split; extension point has no home |
| F4 | Signals + zoneless; no global store library | Broad refactor of every component and the renderer |
| F5 | Definition store as document + JSON Patch log | AI refinement and undo must be redesigned; the coherence property is lost |
| F6 | Declared interaction via PageContext channels | Interactivity ceases to be AI-generatable |
| F7 | Components never fetch data or navigate | Batching, preview, and single-gateway enforcement all break |
| F8 | Encoding-model chart family | Either weak visualizations or component-type proliferation |
| F9 | Six mandatory component states | Generated pages ship with holes |
| F10 | WCAG 2.2 AA and i18n as component acceptance criteria | Cross-cutting retrofit across the entire library |
| F11 | Mobile-first breakpoint cascade | Every stored placement resolves differently; panels move |

**Implementation status:** F1–F10 are implemented. F1 (two apps sharing one renderer) landed with the visual builder — `apps/studio` boots the same `PageRendererComponent` the Viewer does, and F5's definition store is `libs/studio-core`. F3's registry is still hand-maintained pending generation. See [`../docs/M1-IMPLEMENTATION.md`](../docs/M1-IMPLEMENTATION.md) §3 for the full list of deviations.
