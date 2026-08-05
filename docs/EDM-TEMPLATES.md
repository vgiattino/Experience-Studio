# EDM Business Templates — Implementation Record

Four business templates over governed Opus EDM metadata: a **Security Master Dashboard**, a
**Security Overview**, a **Party Overview** and an **Exception Management** workspace. Each is a
JSON page definition under `apps/viewer/public/definitions/`. No Angular was written for any of
them — the work that *was* written closed the runtime gaps they exposed.

That is the point of the exercise. The runtime, the generator and the builder were all built
against one hand-authored dashboard, which meant the parts of the schema those templates did not
need had never been executed. Four real business pages needed them immediately.

---

## 1. The Four Templates

| Template | Kind | Journey | Sources | Widgets |
|---|---|---|---|---|
| `security-master-dashboard` | `dashboard` | Where a data steward starts the day: scope, review backlog, vendor disagreement, open breaks — then into any instrument | 8 | 9 |
| `security-overview` | `detail` | One instrument: its golden record, every vendor's contribution to it, and what disagrees | 9 | 10 |
| `party-overview` | `detail` | One legal entity: LEI standing, group position, the instruments it issued, and their breaks | 9 | 10 |
| `exception-management` | `workspace` | The break queue: by severity, by rule, by age — and out to the record that caused it | 8 | 9 |

They form one journey, not four pages. The dashboard drills to a security; a security drills to its
issuer; the issuer's instruments drill back to securities; every page reaches the exception queue
filtered to what it was looking at. Registered in
`securities-operations.experience.json` as `drilldownTargets`, so the target is metadata rather
than a link each page hard-codes:

```json
"drilldownTargets": {
  "securities.security": { "page": "security-overview",    "openIn": "self" },
  "parties.party":       { "page": "party-overview",       "openIn": "self" },
  "dq.exception":        { "page": "exception-management",  "openIn": "self" }
}
```

---

## 2. The EDM Concepts Being Modelled

The demo catalog was extended (`catalogVersion: 9`) rather than the pages bent to fit it. What was
added is what makes the templates recognisable to anyone who has run a security master:

**Multi-vendor contribution and the golden copy.** A new entity, `securities.source-value`, holds
one row per *(security, field, source system)*: the vendor's value, the golden value taken for that
field, a `match-status`, an `is-golden` flag and a `confidence`. This is the fact table mastering
actually produces, and it is what makes a comparison view possible at all — a single flattened
security row cannot express "Bloomberg says EUR, ICE says USD, we took EUR".

It is also the one entity marked `cost.requiresFilter: true`: 1,367 rows here, but hundreds of
millions in a real master. The validator therefore refuses any query against it that does not
always constrain — every page that reads it does so filtered to one security.

**A party master with standing, not just a name.** `parties.party` gained `lei-status`,
`party-status`, `sector`, `onboarded-at` and `parent-party-id`. LEI *status* rather than presence is
the distinction that matters operationally: a LAPSED LEI is a compliance exposure, an absent one is
a data gap, and the two go to different teams. `parent-party-id` makes the group hierarchy
navigable — a party drills to its own parent through the same mechanism it drills to anything else.

**Issuer denormalised onto the security.** `securities.security` gained `issuer-id`, `issuer-name`,
`sector`, `country-of-risk` and `review-status`; `dq.exception` gained `issuer-id`/`issuer-name`.
This is deliberate and it is how EDM read models are actually shaped: the alternative is a join, and
a page that needs a join to render its own header is a page whose latency is the join's latency.

**Review status as a first-class attribute.** `review-status` (`PENDING`, `APPROVED`, `REJECTED`)
plus a `pending-review-count` measure. A "pending review" KPI is the steward's queue depth, which
is why it is on every one of the four pages.

Five relationships were corrected or added, so the model states how the entities connect:
`securities.security.related-parties` (many-to-one to the issuer), `parties.party.securities`,
`securities.security.source-values`, `securities.source-value.security`, `parties.party.exceptions`.

---

## 3. The Seven Capabilities, and Where To Look

### Metadata binding

No page names a physical column. Every binding names a catalog attribute or measure, and the
logical→physical mapping lives only in the gateway; the client projection strips `physical`
entirely. A KPI is an aggregation choice against a declared measure:

```json
"vendor-disagreements": {
  "entity": "securities.source-value",
  "kind": "aggregate",
  "select": { "measures": [{ "measure": "mismatch-count", "aggregation": "sum", "alias": "mismatches" }] }
}
```

Formatting comes from the catalog too. `confidence` carries `{"style": "percent", "decimals": 1}`,
so every surface that shows it — table cell, KPI, tooltip — agrees without any page restating it.

Level-3 (semantic) validation makes this enforceable rather than aspirational: it checks each
attribute and measure exists, that the aggregation is in `allowedAggregations`, that a dimension is
`groupable`, that a filter target is `filterable`, and that `requiresFilter` entities are
constrained. It found two defects in the *already shipped* M1 pages the moment it was pointed at
them (§6).

### Drill-down navigation

Seven `drilldown` actions across the four templates, plus `navigate` for lateral moves and one
`openUrl` (the LEI record at GLEIF). A drilldown names an entity and lets the experience resolve the
page, so adding a new detail page re-targets every existing drilldown without editing any page:

```json
"drill-to-issuer": {
  "kind": "drilldown",
  "entity": "parties.party",
  "paramMapping": { "party-id": { "$expr": "$row['issuer-id']" } }
}
```

Row click → `eventActions` → the declared action. The table component never knows a page exists.

### Dynamic tabs

All four templates use **data-driven tabs**, which had not previously been implemented (§5). Every
one of them earns it — the tab set is a property of the data, not of the author's imagination:

| Template | One tab per | Generated from | Content |
|---|---|---|---|
| Dashboard | asset class present in scope | `class-tabs` | Instruments of that class |
| Security Overview | contributing vendor | `contributing-sources` | That vendor's values vs. the golden copy, field by field |
| Party Overview | instrument the party issued | `instrument-tabs` | That instrument's open breaks |
| Exception Management | failing rule | `rule-tabs` | That rule's queue |

The tab identity travels through `selectedTabChannel` into the template's own data source, so **one
compiled template serves every tab** and only the active tab is queried. Ten rule tabs cost one
template and one query, not ten.

One deliberate narrowing, stated because the schema is broader: `layout.schema.json` describes the
template as receiving the generating row as a `$tab` scope, so any of that row's fields would be
readable by expressions and data source parameters. The implementation carries the tab's **id**
through the declared filter channel instead. That is enough for all four templates and it buys two
properties the `$tab` scope would not: the dependency graph stays derivable from the definition, and
the active tab is page state — deep-linkable, and readable by every other widget on the page. The
`$tab` scope remains unimplemented, and a template needing a second field from its row would need
it.

### KPIs

Sixteen KPI cards. Each is one aggregate source with a threshold band from the catalog's
`defaultThresholds`, so "34 high severity" is amber or red because the *metadata* says so, not
because the page picked a colour. `higherIsBetter` decides the direction of good.

### Tables

Golden record, vendor comparison, issued instruments, break queues — with `showRowCount`, catalog
formatting per column, row selection into a `selections` channel, and row click mapped to a
drilldown. Client-side sort only; server-side sort and paging remain a stated gap.

### Search

A new component, `input.filter-bar` (§5), on every template: a debounced search box plus declared
facets. The facets are *metadata* — channels, labels and options in `config`, options sourced from
the catalog's `enumValues` — so a page gains a facet by editing JSON.

It writes nothing itself. It emits `searchChanged` / `facetChanged` / `cleared`, and the page maps
those to `setFilter` / `clearFilters`. That indirection is what keeps the dependency graph
derivable: the compiler learns which sources a filter change invalidates by reading the definition.

### Actions

Ten to fourteen per template, covering every dispatchable kind the runtime supports: `setFilter`,
`clearFilters`, `setSelection`, `setParameter`, `refresh`, `navigate`, `drilldown`, `openUrl`,
`export`. The reserved kinds `invoke` and `workflow` are still rejected by both validator and
dispatcher — a page cannot pretend to call a service that does not exist.

Chart segment click and facet chip write **the same channel**, so the chart and the bar can never
disagree about what the page is filtered by.

---

## 4. Verified Behaviour

Measured in the browser against the running app, not asserted:

| | |
|---|---|
| Dashboard | 54 instruments in scope, 19 pending review, 125 vendor disagreements, 93 open exceptions |
| Dynamic tabs | `FUND 9 · DERIVATIVE 9 · EQUITY 18 · BOND 18`; selecting DERIVATIVE yields exactly its 9 instruments |
| Search | "Toyota" → 3 instruments, KPIs and tabs recomputed together |
| Facet | Bond → 18, cleared → 54 |
| Security Overview | 21 contributions, 3 disagreements, 82.1% average confidence; vendor tabs `Bloomberg 2 · ICE 1`; switching vendor changes the compared fields |
| Party Overview | LEI `017710A43744597A7800 (ISSUED)`, 3 issued instruments as tabs, 5 open breaks |
| Exception Management | 10 rule tabs with counts; clicking a severity segment takes the queue 93 → 19 |
| Entitlements | `?persona=restricted` on the party page: 3 widgets `denied`, 4 render normally, page still usable |
| Responsive | 430 px: zero horizontal overflow on all four |
| Console | no errors |

`npm run verify`: structural validation passes, 245 tests pass, both apps build.

---

## 5. Runtime Gaps These Templates Closed

Four capabilities the schema had always described and the runtime had never executed.

### `input.filter-bar` — the missing component category

M1 shipped four registered component types — KPI card, table, chart, text — and not one of them took
input. Search was therefore *unexpressible*, which is why one of the three v1 journeys could not be
built. The registry is now at `1.1.0` with five types, and `input` is a populated category rather
than a reserved word.

Debouncing is the component's job, not the page's: a search box that dispatched per keystroke would
issue a query per keystroke, and since every widget reading the channel re-queries, that is a
dashboard's worth of round trips per letter typed. The component keeps a local echo of the text
during the debounce window and releases it once the channel is authoritative again — so typing stays
responsive while the page stays consistent.

### Data-driven tabs — generation from rows

The compiler had always retained the template; only the generation step was missing. Rows are mapped
through `idField` / `labelField` / `iconField` / `badgeField` / `orderField`, ids are deduplicated
(two identical ids produce two indistinguishable tabs and an ambiguous active-tab lookup), and the
list is capped at `maxTabs`. Declared and pinned tabs come first, so an "Overview" tab preceding one
tab per related item — the shape the schema was designed around — works.

### Page-state changes re-query, whoever made them

`applyChange` had only ever been called by the action dispatcher, which quietly made "re-query when
state changes" a property of the *dispatcher* rather than of the *state*. That held while the
dispatcher was the only writer — but the renderer writes page state too, for the chrome it owns:
selecting a tab writes the container's `selectedTabChannel`.

So the first data-driven tab click changed the strip's highlight and left the rows below it
untouched, which is worse than not shipping the feature. The orchestrator now reacts to the change
signal itself, making the invariant structural; `applyChange` already deduped on the change object's
identity, so the dispatcher's direct calls remain correct and only one path does the work.

### The resolved active tab is now published

`activeTabId` falls back to the first tab, and nothing wrote that fallback anywhere. On load the
strip highlighted `FUND` while the channel was empty — so the tab's own source, filtered by the
channel, returned every asset class. The label said one thing and the rows another, and clicking any
other tab appeared to fix it. Worse, where the tab filter was `skipWhenEmpty: false`, the first tab
rendered *empty*.

The resolved tab is now published to its channel, and the same effect activates the tab's deferred
sources — the first tab needed activating too, and nothing had clicked it.

---

## 6. Defects Found

Building four real pages found more than reviewing four designs would have.

**Two in already-shipped M1 artifacts**, both caught by level-3 validation the first time it ran
against them: `processing-detail` aggregated `row-count`, an *attribute* (the measure is
`rows-processed`); `security-master-operations` selected `age-hours` as an attribute where the
catalog defined only a measure of that name. Both had rendered fine and both were wrong.

**Invented vocabulary, caught by validation.** `rowActionHint` (not a `data.table` property, in
seven components), `formatNumber` (not in the closed expression function library),
`presentation.maxWidth: "wide"` (enum is `contained | full`), `format.durationUnit` and
`maximumFractionDigits` (not in `formatSpec`). Every one was a plausible guess. A closed vocabulary
turned all five into errors at author time instead of silent no-ops at render time.

**A genuine schema gap.** `attribute.semanticType` had no `duration` while `measure.valueType` and
`formatSpec.style` both did — so a break's age was expressible as a measure and not as an attribute.
The enum was amended rather than worked around.

**Percentages stored as fractions.** The platform formatter documents that EDM stores percentages as
percentage points; the new fixture stored 0.70–1.00, so 82% confidence rendered as "0.82%". The
fixture was wrong, not the formatter.

**A component read page state it never re-read.** The widget host returned from its effect before
reading the component context when a widget had no data source — so the search box lost its text
after the debounce while the page stayed filtered. Both signals are now read before the guard.

**Eleven pixels of horizontal overflow at 430 px**, traced to the page header's action row: four
actions form a 429 px row inside a 406 px content box, and the 23 px it cannot fit becomes
page-level horizontal scrolling. The header already wrapped; the action row itself did not.

**A heading that could not be a heading.** `content.text` rendered a static `title` as `<h2>` but a
token-resolved `body` always as `<p>`. A detail page's heading *is* the record's name, which is only
knowable from data — so every drill-down page had no `<h2>` at all. `variant` now decides the
element, and where the words come from does not.

---

## 7. Still Missing

| Gap | Consequence |
|---|---|
| `syncToUrl` is declared but not implemented | Filter state is not deep-linkable; only parameters survive a reload |
| The `$tab` row scope | A data-driven tab template can read its tab's id, not the rest of its generating row |
| Server-side sort and paging, grid virtualization | The queue tables sort the returned page, not the universe |
| Validation levels 5, 6, 8 (entitlement, cost, accessibility) | The cost estimate that would flag an unfiltered `source-value` scan does not run in the browser |
| The four templates are not yet *instantiable* templates | The generation library holds four layout shapes, not these business templates — so "make me a party overview" cannot yet start from this page |
| Real gateway | Every entitlement result on these pages is fixture configuration, not enforcement |

The last of those is the most valuable next step: these four pages are exactly the fixtures a
template library needs, and registering them turns "generate a page" into "instantiate a proven
business template against a different entity".
