# How Are Pages Rendered?

Status: **Draft for approval**
Part of the [Core Runtime Specification](./00-index.md) · Answers question 5.
Companion: [`../runtime-architecture.md`](../runtime-architecture.md) specifies the eight pipeline stages and the failure matrix. This document specifies the **two steady-state loops** and gives the sequences.

---

## 1. The Shape of a Render

Rendering is one cold path and two loops. Getting the loops right is what separates a platform from a demo, because the cold path runs once and the loops run for the rest of the session.

```mermaid
graph TB
  START([Route or state envelope]) --> COLD

  subgraph COLD["Cold path — once per page view"]
    R1["Resolve version"] --> R2["Migrate in memory"]
    R2 --> R3["Compile → CompiledPage<br/>(memoized per published version)"]
    R3 --> R4["Plan: eager · deferred · onDemand"]
    R4 --> R5["Instantiate tree"]
    R5 --> R6["One batch → hydrate"]
  end

  COLD --> STEADY

  subgraph STEADY["Steady state"]
    direction LR
    subgraph READ["Read loop"]
      L1["State change<br/>(declared action)"] --> L2["Dependency graph<br/>→ affected sources"]
      L2 --> L3["Re-query those only"]
      L3 --> L4["Per-widget state<br/>transitions"]
      L4 --> L1
    end
    subgraph WRITE["Write loop"]
      W1["invoke dispatched"] --> W2["Capability · enabled · confirm"]
      W2 --> W3["Dry run if required"]
      W3 --> W4["Operation executes"]
      W4 --> W5["Union of declared +<br/>returned invalidation"]
      W5 --> L2
    end
  end
```

The two loops meet at one point — the dependency graph — and that junction is the design. A write is not a special interaction with its own refresh logic; it is a state change whose invalidation set comes from the server instead of from the compiler.

---

## 2. Cold Render

```mermaid
sequenceDiagram
  autonumber
  actor U as User
  participant SH as Shell
  participant DR as DefinitionResolver
  participant PC as PageCompiler
  participant PS as PageStateStore
  participant QO as QueryOrchestrator
  participant REG as ComponentRegistry
  participant WH as WidgetHost xN
  participant GW as Data Gateway
  participant EDM as Opus EDM

  U->>SH: open /x/securities-operations/exception-management?as-of=2026-08-05
  SH->>DR: resolve(experience, page, environment)
  DR->>DR: fetch published immutable version (CDN-cacheable)
  alt schemaVersion older than runtime
    DR->>DR: migrate v1→v2→… in memory only
  else schemaVersion newer than runtime
    DR-->>SH: hard fail with version telemetry
    Note over SH: Rendering a partially-understood definition<br/>is worse than failing visibly
  end
  DR-->>SH: PageDefinition

  SH->>PC: compile(definition, runtimeCapabilities)
  PC->>PC: layout tree + breakpoint variants
  PC->>REG: resolve component types → lazy loaders
  REG-->>PC: loaders (unknown types → stated placeholder + CompileProblem)
  PC->>PC: compile expressions to pure functions
  PC->>PC: build dependency graph (params · filters · selections · operations)
  PC->>PC: partition eager / deferred / onDemand
  PC-->>SH: CompiledPage (memoized by published version)

  SH->>PS: seed state from URL, defaults, session
  SH->>QO: attach(CompiledPage)
  SH->>WH: instantiate tree (skeletons from manifests)

  QO->>QO: resolve params for the eager set
  QO->>GW: POST /v1/data/batch — one request, actor context attached
  GW->>GW: resolve tenant, identity, entitlements ONCE for the batch
  GW->>GW: logical → physical per environment binding
  GW->>GW: inject row predicates · reject unpermitted columns · cost guards
  GW->>EDM: execute in parallel under a fan-out cap
  EDM-->>GW: rows
  GW-->>QO: per-query results, each independently statused,<br/>each with TTL + entitlementScopeHash

  loop per widget
    QO->>WH: DataView(state, rows, deniedFields, problem)
    WH->>WH: ready | empty | partial | denied | error
  end
  WH-->>U: page

  Note over QO,GW: One round trip, one entitlement resolution,<br/>one correlation id for the whole render.
```

Three properties of this sequence are decisions rather than mechanics:

**Compilation is memoized by published version, and only by that.** An immutable published artifact cannot change under its key. A *draft* can — so a definition handed over in memory has no version identity at all and must bypass the cache unconditionally. This was learned the expensive way: a canvas frozen at the version first loaded, and a newly added data source that was never queried.

**Entitlements resolve once for the batch.** Twelve widgets issuing twelve requests would produce twelve entitlement resolutions, twelve audit events and head-of-line blocking on browser connection limits. Batching is not a latency optimization; it is what makes one audit record describe one render.

**Unknown types produce a placeholder and a `CompileProblem`, not a failure.** The problem travels with the compiled page so the Studio can show it as a finding and telemetry can attribute it to a definition version.

---

## 3. Read Loop — a Filter Change

```mermaid
sequenceDiagram
  autonumber
  actor U as User
  participant FB as Filter bar (component)
  participant WH as WidgetHost
  participant AD as ActionDispatcher
  participant PS as PageStateStore
  participant QO as QueryOrchestrator
  participant GW as Data Gateway

  U->>FB: types "Enel"
  FB->>FB: debounce 300ms · hold a local echo so typing stays responsive
  FB->>WH: action event { event: 'searchChanged', payload: { channel, value } }
  WH->>AD: dispatch via eventActions mapping
  AD->>AD: resolve action 'set-query' (kind: setFilter, static channel)
  AD->>AD: evaluate enabled + required capabilities
  AD->>PS: setFilter('query', 'Enel')
  PS->>PS: coerce to the channel's declared dataType
  PS-->>QO: lastChange = { filters: ['query'] }

  Note over QO: The orchestrator reacts to the STATE's change signal,<br/>not to the dispatcher calling it. Whoever writes state,<br/>the re-query follows.

  QO->>QO: sourcesAffectedBy({filters:['query']}) → 4 of 9 sources
  QO->>QO: skip deferred sources still idle (a hidden tab must not wake)
  QO->>GW: batch(4 queries)
  GW-->>QO: 4 results
  QO->>WH: DataView per affected widget
  Note over WH: The other five widgets are never touched —<br/>no re-render, no query, no flicker.
  FB->>FB: release the local echo · the channel is authoritative again
```

The note in the middle is the design correction this specification makes explicit. `applyChange` had only ever been called by the dispatcher, which quietly made "re-query on change" a property of the *dispatcher* rather than of the *state*. That held while the dispatcher was the only writer — and then the renderer wrote a tab channel for chrome it owns, and the tab strip moved while its content did not. **An invariant enforced by one caller's discipline is not an invariant.**

---

## 4. Deferred Activation — Data-Driven Tabs

The sequence that makes detail pages affordable, and the one with the most failure modes per line.

```mermaid
sequenceDiagram
  autonumber
  participant QO as QueryOrchestrator
  participant LN as Tabs container
  participant PS as PageStateStore
  participant WH as WidgetHost (template)
  participant GW as Data Gateway

  Note over QO: Cold render already loaded 'rule-tabs' (eager):<br/>the tab set cannot be generated before its source returns.
  QO->>LN: rows for 'rule-tabs' (10 rows)
  LN->>LN: map rows → tabs via idField/labelField/badgeField/orderField
  LN->>LN: dedupe ids · cap at maxTabs
  LN->>LN: resolve active tab: channel value → local → FIRST TAB

  rect rgb(240,240,240)
    Note over LN,PS: The resolved tab — including the fallback — is published.<br/>Without this the strip highlights one thing and the<br/>content shows another (or nothing, where the tab<br/>filter cannot be skipped).
    LN->>PS: setFilter('active-rule', 'DQ-PRICE-STALE')
  end

  PS-->>QO: lastChange = { filters: ['active-rule'] }
  QO->>QO: 'rule-queue' is deferred and still idle → do not wake it here
  LN->>QO: activateSources(sources of the tab template)
  QO->>GW: batch(['rule-queue']) — filter already carries the tab id
  GW-->>QO: 11 rows for this rule
  QO->>WH: DataView(ready)

  actor U as User
  U->>LN: clicks another tab
  LN->>PS: setFilter('active-rule', 'DQ-MISSING-SEDOL')
  PS-->>QO: lastChange
  QO->>QO: 'rule-queue' is now active → re-query
  QO->>GW: batch(['rule-queue'])
  GW-->>QO: 13 rows
  Note over LN,WH: One compiled template served both tabs.<br/>Ten tabs cost one template and one query, not ten.
```

Two ordering constraints are visible and both are real:

- **Publish the tab id before activating the template's sources.** Reversed, the first query runs with an empty channel and either returns everything or nothing, depending on `skipWhenEmpty`.
- **A deferred, idle source must not be woken by a state change.** Otherwise a filter change anywhere on the page starts queries for every hidden tab, and the deferral budget is spent by the first interaction.

---

## 5. Write Loop — an Operation

New with this specification. The mirror of §3, with four extra obligations: authorization, confirmation, concurrency and honest invalidation.

```mermaid
sequenceDiagram
  autonumber
  actor U as User
  participant TB as Table (component)
  participant AD as ActionDispatcher
  participant TS as TransientStore
  participant OC as OperationClient
  participant GW as Data Gateway
  participant QO as QueryOrchestrator

  U->>TB: selects 25 breaks, presses "Assign"
  TB->>AD: action event { event: 'bulkAction', payload: { actionId: 'assign' } }
  AD->>AD: resolve invoke action → operation 'assign-exception' at the pinned registry version
  AD->>AD: enabled? required capabilities held? selection non-empty?
  alt capability missing
    AD-->>U: affordance disabled with a reason. No request is made.
  end
  AD->>AD: operation.security.confirmation → collect reason if required
  AD->>TS: mark 25 targets in-flight (transient tier — never saved, never linked)

  opt grant or policy requires it
    AD->>OC: dryRun(request)
    OC->>GW: execute(dryRun: true)
    GW->>GW: resolve targets, inject row predicates, count
    GW-->>OC: { affectedCount: 25 }
    OC-->>U: "This will assign 25 breaks." Confirm?
  end

  AD->>OC: invoke(request + idempotencyKey + concurrencyToken + actorContext)
  OC->>GW: POST /v1/data/operation
  GW->>GW: 2 resolve operation id — unknown → refuse
  GW->>GW: 3 capabilities · 5 entitlements · 6 targets + ceiling
  GW->>GW: 7 idempotency replay check
  GW->>GW: 8 concurrency token check

  alt token mismatch
    GW-->>OC: status: conflict
    OC->>TS: clear in-flight
    OC-->>U: "Someone changed 2 of these. Reload and retry."
    Note over U: 'conflict' is not an error: the correct<br/>response is reload, not report a fault.
  else partial success
    GW-->>OC: status: partial, results[], invalidate{}
    OC-->>U: "23 assigned, 2 refused." Per-target reasons available.
  else success
    GW-->>OC: status: ok, affectedCount: 25, invalidate{}, eventualConsistencySeconds: 0
  end

  OC->>TS: clear in-flight
  OC->>QO: applyInvalidation(union of declared effects and returned set)
  QO->>QO: map entities + logical sources → this page's sources
  QO->>GW: batch(affected reads)
  GW-->>QO: fresh rows
  QO->>TB: DataView(ready)

  Note over OC,QO: The declared effects are a hint. The response is<br/>the authority — a write can touch data no page enumerated.
```

The steps that are easy to omit and expensive to add later:

| Step | Omitted consequence |
|---|---|
| Capability check *before* the request | The user presses a button and receives a server denial for something the UI should never have offered |
| Idempotency key | A retried assignment lands twice; the audit shows two decisions where one was made |
| Concurrency token | A silent overwrite of a colleague's change, discovered during a reconciliation |
| `expectedCount` on a filter-targeted write | The queue changed between read and write, and the user closes more than they were shown |
| Transient tier for in-flight state | Optimistic values leak into a saved definition or a shareable link |
| Union invalidation | Stale widgets after writes with unenumerated side effects — near-undiagnosable from a bug report |

---

## 6. Agent Turn

An agent turn is §3 and §5 again, with a grant check in front and an audit row behind. There is no third loop.

```mermaid
sequenceDiagram
  autonumber
  actor U as User
  participant AR as AgentRuntime
  participant PS as PageStateStore
  participant QO as QueryOrchestrator
  participant AD as ActionDispatcher
  participant GEN as Generation Service
  participant GW as Data Gateway

  U->>AR: "Which rules are driving the backlog, and assign the price breaks to Priya"
  AR->>AR: resolve grant: tools ∩ page declarations ∩ principal capabilities
  alt nothing granted for this request
    AR-->>U: refuse, naming what it may do instead
  end
  AR->>PS: capture() → page-state envelope (no rows, no entitlement decisions)
  AR->>QO: read granted sources within stateAccess ceiling
  QO-->>AR: aggregates only (this grant's ceiling), max 500 rows
  AR->>GEN: reason(prompt + envelope + grounded metadata + tool list)
  Note over GEN,GW: Provider credentials live only here.<br/>Row values do not leave unless the grant permits it.
  GEN-->>AR: plan: 1 dispatch set-severity-facet, 2 dryRun assign-exception, 3 answer

  AR->>AD: dispatch('set-severity-facet', actor: agent onBehalfOf user)
  AD->>PS: setFilter — the same path a click takes
  PS-->>QO: re-query affected sources

  AR->>AD: invoke('assign-exception', dryRun: true)
  AD->>GW: execute(dryRun)
  GW-->>AD: affectedCount: 14
  alt grant autoConfirm and operation permits it
    AR->>AD: invoke for real, rationale recorded
  else confirmation required
    AR-->>U: "Assign 14 price breaks to Priya?" (dryRun result shown)
    U->>AR: accept
    AR->>AD: invoke for real, confirmedBy recorded
  end
  AD->>GW: execute
  GW-->>AD: ok + invalidate{}
  AR-->>U: answer + what it did + what it changed
  Note over GW: Audit: agent id, turn id, principal,<br/>rationale, targets, resolved scope, correlation id.
```

What the sequence deliberately does not contain: any arrow from the agent to the compiler, the registry, or EDM. The agent's reach is the dispatcher and granted reads. That is law **L6**, and it is checkable as a dependency rule rather than by reading prompts.

---

## 7. Failure Paths

The existing failure matrix covers reads. These are the additions, and each has a defined non-blank behaviour.

| Failure | Behaviour | Why this and not something else |
|---|---|---|
| Unknown operation id at the pinned registry version | Affordance rendered **disabled** with a stated reason; telemetry names operation and definition version | A button that produces a server refusal teaches users the platform is unreliable |
| Operation refused for missing capability | Affordance hidden or disabled per `deniedBehaviour`; never a failed request | Hiding what cannot be used is usability; the gateway still decides |
| `conflict` | Reload the target, re-offer the action, preserve the user's entered values | The user's input is not the thing that went stale |
| `partial` | Report counts and per-target reasons; re-query; leave the page usable | A bulk write's normal outcome |
| Background operation, no result yet | `accepted` state on the affordance; the view reports it is catching up | Better than a spinner that never resolves, or a false success |
| Write succeeded, `eventualConsistencySeconds > 0` | Report success **and** that the view is catching up; do not present the old value as new | Otherwise the user performs the write again |
| Agent budget exhausted mid-task | `escalate`: hand back what was done and what remains | Silent truncation, on the same rule the query planner follows |
| Agent grant references something the page no longer declares | Tool unavailable for this turn; agent says so; telemetry raises a stale-grant finding | A dangling grant must not resolve to "closest match" |
| Runtime lacks a capability the definition needs | Degrade per [`08-evolution.md`](./08-evolution.md) §3; warn at promote time | Discovering it in production means users find affordances that do nothing |

---

## 8. Performance Contract

| Budget | Mechanism | Enforced where |
|---|---|---|
| One round trip for first paint | Eager batch | Planner |
| No first-paint wait on below-the-fold widgets | Deferred activation on viewport intersection; skeletons from manifests | Planner + host |
| No query for a search page until input exists | `onDemand` predicate | Planner |
| No re-query of unaffected widgets | Static dependency graph | Compiler |
| No recompilation on interaction | `CompiledPage` memoized per published version | Compiler |
| Fan-out cap per page | `maxEagerDataSources`; excess **deferred, never dropped** | Planner + gateway |
| Write blast radius | `maxTargets`; `dryRun` | Registry + gateway |
| Agent cost | Tool-call, operation, token and turn budgets | Server-side |

Every one of these is observable per render, tagged with definition version, registry version and catalog version — so a regression is attributable to a change rather than to a feeling.

---

## 9. Decisions Requiring Ratification

| # | Decision | Consequence if reversed later |
|---|---|---|
| R1 | Two steady-state loops meeting at one dependency graph | Writes acquire their own refresh logic, which every page then hand-wires |
| R2 | The orchestrator reacts to the state's change signal, not to its callers | A second state writer silently stops re-querying |
| R3 | Compilation memoized by *published* version only; in-memory definitions bypass the cache | Frozen canvases; data sources that are never queried |
| R4 | The resolved active tab — including the first-tab fallback — is published to its channel | Tab strips that disagree with their content |
| R5 | A deferred idle source is never woken by an unrelated state change | The deferral budget is spent by the first interaction |
| R6 | Capability and confirmation are checked before a write request is made | Users meet server denials for affordances the UI offered |
| R7 | Invalidation after a write is the union of declared and returned sets | Stale data after side-effecting writes |
| R8 | In-flight write state lives in the transient tier only | Optimistic values reach saved artifacts and shared links |
| R9 | An agent turn uses the dispatcher and the orchestrator, with no private path | The privileged path becomes the breach path |
| R10 | Every failure has a defined non-blank behaviour, including the write-side ones | Blank widgets, false successes, and duplicated writes |
