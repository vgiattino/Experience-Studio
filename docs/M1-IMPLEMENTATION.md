# Milestone 1 — Implementation Record

Status: **Delivered as a proof of concept**
Scope: the experience runtime — application shell, page rendering engine, component framework, JSON page loader, five components, and a sample dashboard that loads entirely from JSON.
Related: [`../architecture/implementation-roadmap.md`](../architecture/implementation-roadmap.md) · [`../architecture/runtime-architecture.md`](../architecture/runtime-architecture.md) · [`../schemas/README.md`](../schemas/README.md)

---

## 1. What Was Built

```
apps/viewer/                     Angular application shell
  src/app/app.ts                 experience shell: navigation, session, drill-down host
  src/app/session.ts             simulated identity, personas, ?simulate= switches
  src/app/fixture-loader.ts      fixture tables + date rebasing
  src/app/dev-panel.component.ts live runtime observability
  public/definitions/            THE ARTIFACTS THE RUNTIME INTERPRETS
  public/data/                   mock EDM fixtures

libs/contracts/                  TypeScript projection of /schemas
libs/platform/                   expression engine, formatting, breakpoints, telemetry
libs/design-system/              tokens, six-state shell, badge
libs/components/                 kpi-card, table, chart, text, navigation (+ manifests)
libs/component-registry/         type → lazy import map
libs/renderer/                   compiler, page context, orchestrator, dispatcher, hosts
libs/data-client/                gateway client + mock gateway
libs/validator/                  shared validator (levels 1, 2, 4, 7)
tools/validate-metadata.mjs      CI gate over schemas, artifacts and manifests
```

**The page is JSON, not a template.** `apps/viewer` contains no dashboard markup. Deleting
`public/definitions/security-master-operations.page.json` removes the dashboard; editing it
changes the dashboard without touching a line of Angular. The two page definitions total
~1,100 lines of JSON and are validated against `/schemas` by `npm run validate`.

### Running it

```bash
npm install
npm start        # http://localhost:4200
npm run verify   # validate metadata, run tests, production build
```

URL switches, used to make the architecture's claims checkable in the running app:

| Parameter | Effect |
|---|---|
| `?page=processing-detail` | Open a specific page of the experience |
| `?persona=analyst\|steward\|restricted` | Change simulated identity and data entitlements |
| `?simulate=denied\|error\|empty\|slow` | Force gateway outcomes, to exercise the six states |
| `?validate=0` | Skip client-side validation at load |
| `?theme=dark\|light` | Override the theme |

The **Runtime** panel in the sidebar shows compile time and cache hit, first-batch latency,
per-widget states, the query log with cache hits, and the validation report including the
levels that did **not** run.

---

## 2. Architectural Claims, and Whether They Hold

Each was verified in the browser, not only asserted. The verification transcript is in §5.

| Claim | Where specified | Verified |
|---|---|---|
| A page renders from JSON with no page-specific code | roadmap M1 | ✅ 8 widgets, 2 pages, 0 templates |
| Compilation is memoized per definition version | runtime §5 | ✅ dev panel reports compile vs cache hit |
| One batch per render, not one request per widget | backend §3.3 | ✅ 8 eager sources → 1 batch |
| A filter change re-queries only dependent sources | runtime §5, §9 | ✅ chart click re-ran 4 of 8 sources |
| Deferred regions do not query until activated | runtime §6 | ✅ `processing-queue` ran only on tab open |
| Per-widget independent status | runtime §8 | ✅ 3 KPIs ready beside 3 denied widgets |
| Column entitlement → `partial`, row → `denied` | security §6 | ✅ steward loses one column; operator loses three widgets |
| Entitlement scope is part of every cache key | security §6.4 | ✅ `gateway.service.ts`; persona switch does not reuse rows |
| Unknown component type degrades, never blanks | runtime §10 | ✅ placeholder + telemetry |
| One failing widget cannot fail a page | runtime §7 | ✅ per-widget error boundary |
| Reserved action kinds are not executable | schemas action | ✅ rejected by validator *and* dispatcher |
| Responsive behaviour is stored in the artifact | frontend §5.3 | ✅ no horizontal page scroll at 430px |
| Definitions never name a physical object | schemas R6 | ✅ gateway resolves entity → fixture table |

---

## 3. Deviations From the Architecture Documents

Stated plainly, because a PoC that silently diverges is worse than one that reports where it did.

| # | Architecture says | M1 does | Why, and what it costs |
|---|---|---|---|
| D1 | Nx monorepo with tag-enforced boundaries (frontend §2.2) | Angular CLI workspace, `libs/*` with TS path aliases | Same layering and the same import discipline, without Nx setup. **Cost: boundaries are conventional, not enforced.** Adding Nx or an ESLint boundary rule is the fix |
| D2 | Two apps: Viewer and Studio (frontend §2.1) | Viewer only | Studio is M4. The renderer is already isolated so Studio can consume it unchanged |
| D3 | Registry generated from manifests (frontend §5.2) | Hand-maintained, agreement asserted | `tools/validate-metadata.mjs` fails if registry and manifests disagree; `registry.spec.ts` checks every entry resolves. Generation is a small follow-up |
| D4 | `contracts` generated from the schemas | Hand-written, kept deliberately close | Drift is possible today. The schemas remain authoritative and are what gets validated |
| D5 | Level-1 validation is server-side; Viewer trusts published definitions | Validates in the browser, validator lazily loaded | There is no server. It makes the loader honest and the failure modes visible; ajv + schemas land in a separate chunk |
| D6 | Data Gateway enforces entitlements from caller identity | Mock gateway; "entitlements" are fixture configuration | **This is the one deviation that is not a shortcut but a substitution.** The mock reproduces the gateway's *shape* — single enforcement point, per-query status, server-decided TTL, scope hash — but proves nothing about enforcement. Real enforcement is M3 |
| D7 | Export is a server-side audited egress event | Records an audit-shaped telemetry entry, no file | Writing a CSV client-side would misrepresent the control. The seam is visible instead |
| D8 | Grid, stack, panel, tabs, split, drawer, repeater, data-driven tabs | grid, stack, panel, static tabs rendered; the rest compile and render a stated placeholder | An unimplemented container is *visible*, never silently empty |
| D9 | Virtualized grids with server-side paging (frontend §5.6) | Client-side sort over the returned page; `virtualized: false` in the manifest | The manifest does not claim what the component does not do |

---

## 4. What Implementation Changed About the Design

Five decisions were made or corrected by building it. Each is now reflected in the
architecture or schema documents.

### 4.1 Breakpoint overrides are mobile-first — decided, not assumed

The schema declared a base placement plus a `breakpoints` map without stating the cascade
direction. Both readings are defensible, and the M1 definitions were accidentally written in
*both*: KPI cards desktop-first (`colSpan: 3` widening downward), panels mobile-first
(`colSpan: 12` narrowing upward at `xl`). The result was four quarter-width cards rendering
as halves and wrapping into a column.

Resolved to **mobile-first**, matching CSS `min-width` and the platform's own
`BREAKPOINT_MIN_WIDTH` table: the base is the narrowest case, and an entry applies at its
breakpoint and wider. Documented in `common.schema.json` and enforced by
`breakpoint.spec.ts`. *Choosing a direction mattered more than which direction; mixing them
silently mislays panels.*

### 4.2 Parameters are coerced to their declared `dataType`

`as-of` declares `dataType: date` and defaults to `today()`, which produces a `Date`.
Compared against an EDM date-only column, that matched nothing — a failure that presents as
missing data rather than as a type error. `PageContextService` now coerces resolved values to
the declared type, and `formatValue` treats an ISO date string as a calendar date rather than
re-zoning it. Without both, a dashboard is silently empty for reasons no author could
diagnose.

### 4.3 The gateway resolves its own literals

The mock gateway originally read *every* filter value from the client-supplied params, so a
literal in the definition (`load-status eq 'LATE'`) worked only because the client happened to
echo it back. Corrected: the client resolves only page-state wrappers; literals are the
server's to read, because the server holds the definition. Caught by `mock-gateway.spec.ts`.

### 4.4 The expression sandbox needed own-property access

`$row.constructor` returned `Object`, handing an expression a route to the prototype chain and
contradicting the grammar's "no prototype access". Path resolution now reads own properties
only and never surfaces callables. Caught by a sandbox test written from the grammar spec.

### 4.5 Two Angular constraints the frontend document did not anticipate

- **`<ng-content>` cannot be projected into an embedded view.** Placing it inside `@switch`
  silently renders nothing, which is how the six-state shell first failed: widgets mounted,
  reported `ready`, and displayed empty boxes. The projected content is now always
  instantiated and toggled with CSS, with the state presentations under control flow.
- **A recursive standalone component needs `forwardRef` in its own `imports`.** A direct
  self-reference is evaluated while the class binding is uninitialised, so it resolves to
  `undefined` and *every other importer* fails with NG2012 — an error that points away from
  the cause.

Both are recorded in `frontend-architecture.md` §3.5 and §5.2 so the next implementer does not
rediscover them.

---

## 5. Verification

```
npm run validate     16 schemas, 5 examples, 3 runtime definitions, 4 manifests, registry
npm test             121 tests, 6 files
npm run build        production bundle
```

Test coverage is concentrated on the load-bearing logic rather than spread thinly:

| Suite | Tests | Covers |
|---|---|---|
| `expression.spec.ts` | 31 | Lexer hyphen rule, precedence, totality, aggregates, reference extraction, sandbox escapes |
| `mock-gateway.spec.ts` | 26 | Filters, `skipWhenEmpty`, aggregation, grouping, entitlement → `partial`/`denied`, per-query status |
| `validate-page.spec.ts` | 33 | All four implemented levels, reserved action kinds, malformed definitions |
| `compile-page.spec.ts` | 15 | Dependency graph, targeted invalidation, eager/deferred partition, memoization |
| `registry.spec.ts` | 10 | Registry/manifest agreement, mandated states, accessibility contracts |
| `breakpoint.spec.ts` | 6 | Mobile-first cascade, including the case that was broken |

Browser verification (Playwright, 1600×1100 and 430×950, light and dark) confirmed every row
of §2 with **zero console errors**. The end-to-end path exercised: dashboard loads from JSON →
chart segment click sets a filter → 4 of 8 sources re-query → table narrows 60→19 rows →
Processing tab activates its deferred source → row activation drills through to the second
page carrying `as-of` → focus note appears via a `visible` expression.

---

## 6. Not Built — Honest Inventory

| Gap | Consequence | Milestone |
|---|---|---|
| Real Data Gateway and EDM connection | Entitlement enforcement is simulated, and therefore unproven | M3 |
| Semantic catalog service | Bindings validate against page-local aliases, not a governed catalog. Validation levels 3, 5, 6, 8 do not run | M5 |
| Split, drawer, repeater, data-driven tabs | Detail pages with per-record tabs are not yet expressible in the runtime | M2/M3 |
| Grid virtualization, server-side sort and paging | Will not meet the security-universe scale target | M2 |
| Visual builder, definition store, patch log | Definitions are hand-authored files; no undo, no versions at rest | M4 |
| AI generation | The definitions are hand-authored. Deliberate: the roadmap builds the renderer first, so generation aims at a proven target | M6 |
| Governance lifecycle, promotion, audit | `version` envelopes are authored by hand, not enforced | M7 |
| WCAG audit | Components implement keyboard contracts and were manually checked; no automated axe gate in CI | M2 |
| i18n string tables | `i18nString` resolves to `default`; no locale switching | M2 |
| Component config type generation from manifests | Manifest and implementation can drift within a version | M2 |

---

## 7. Immediate Follow-Ups

Ordered by value, all small:

1. **Generate the component registry and `contracts` types** from the manifests and schemas
   (closes D3 and D4, and removes the two remaining drift paths).
2. **Enforce library boundaries** with an ESLint rule or Nx tags (closes D1). An architectural
   test asserting no component imports the data client is the highest-value single rule.
3. **Add axe to the component tests** and gate CI on it, so accessibility is measured rather
   than asserted.
4. **Wire `npm run verify` into CI**, so metadata validation and the sandbox tests gate merges.
5. **Implement the repeater and data-driven tabs**, the two containers that block the
   security-detail journey.

---

## 8. Assessment

M1's purpose was to prove the definition model is *executable* and the runtime design is
sound before AI generation is pointed at it. That held, and the exercise paid for itself
immediately: building the runtime surfaced one security defect (the sandbox escape), one
silent-data-loss bug (date coercion), one incorrect server/client responsibility split
(literal resolution), and one genuine ambiguity in the schema (cascade direction) — none of
which would have been found by reviewing documents.

The load-bearing claim now has evidence: **a business user's page is data, and the runtime is
an interpreter.** Two dashboards, eight widgets, four component types, cross-widget filtering,
deferred loading, drill-down with carried context, and three entitlement postures — all from
~1,100 lines of validated JSON and no page-specific code.
