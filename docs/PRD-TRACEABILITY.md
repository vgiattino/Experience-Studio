# PRD Traceability — FR-01…FR-26 against the code as it stands

Source of record: [`PRD.md`](./PRD.md) — EDM Experience Framework & AI-Powered Page Builder, v1.0,
August 2026. Twenty-six functional requirements, four phases, eleven capabilities priced P0/P1/P2 in
§30.

Every row was verified by reading the code. What the previous PRD's reconciliation established about
the layers underneath is not re-derived here; it is cited, and the account itself is kept at
[`superseded/PRD-2-TRACEABILITY.md`](./superseded/PRD-2-TRACEABILITY.md).

## How to read a status

| Status | Means |
|---|---|
| **Built** | Exists, is exercised, and has been verified running — the FR's testable consequences hold |
| **Partial** | A real mechanism exists and works, but not every consequence the FR states is met |
| **Scaffolded** | A type, schema field or enum exists; nothing enforces or consumes it yet |
| **Absent** | No code. Not "roughly there" — searched for and not found |

## Headline, against the priorities §30 sets

| Priority | FRs | Built | Partial | Absent |
|---|---|---|---|---|
| **P0** | FR-01…FR-19 less FR-06 | 8 | 5 | 5 |
| **P1** | FR-20…FR-24 | 5 | 0 | 0 |
| **P2** | FR-25, FR-26 | 0 | 0 | 2 |

FR-20, FR-21 and FR-24 moved from Absent to Built in the first change made under this PRD, because
FR-20 is upstream of every P0 that modifies a page — see the section below on what had to come first.
FR-08, FR-10 and FR-11 followed it out of Partial, and FR-09 out of Absent, in the two changes after.

What the P0 Partials had in common when this reconciliation was written is worth recording, because it
was the whole shape of the gap: the *model* supported each one, the *renderer* honoured it, and **no
conversational path reached it**. A grid's conditional formatting was in `binding.schema.json`; a sort
was on the data source; a chart's mark was a manifest property. A person could set all three by hand in
the builder's inspector. Nobody could say "highlight securities with unresolved exceptions" and have it
happen — and saying it *is* the requirement. That path now exists, which is why four rows moved at once
without a single new mutation being written: see
[`CONVERSATIONAL-REFINEMENT.md`](./CONVERSATIONAL-REFINEMENT.md) §2.

What is still Partial or Absent under P0 is a different shape, and it is honest to say so: those are
**missing screens and a missing component** (§5.1's thirty, §6's eight, FR-15's source comparison),
which is volume rather than architecture.

The other shape worth naming: **§16's lifecycle was the largest genuinely-absent thing, and it is
upstream of everything else** — which is why it was built first rather than in P1 order. Principle 2 is
*"client customization must never modify the product standard"*, and an AI modification to a shipped
page used to write back over the shipped page. Every FR-08 refinement would have been a violation of
Principle 2, so lineage came before the refinement engine. **§16 is now built end to end** — lineage,
deployment, notification, the three-way comparison, and synchronisation with reversion — which takes P1
from nothing to complete. What §16 still defers is its own future half: a UI for choosing among individual
changes, which the engine already supports.

---

## §5–§7 The standard experience library — FR-01…FR-05

| FR | Status | Evidence | Gap |
|---|---|---|---|
| FR-01 Standard experience library | **Partial** | Nine page definitions ship in `apps/viewer/public/definitions/`, and `products/opus-edm.product.json` registers five of them as product-owned System Pages with an `override` policy. `GET /api/products` returns that library as a manifest, `GET /api/standards` returns what is *installed*, and the library screen now presents them **as product capabilities** — grouped by §2's three levels, with Use and Customize rather than a date-sorted list with an `origin: 'seed'` chip on it: `apps/experience-studio/src/app/library/library.component.ts` | The browsing surface exists; the **content** does not. §5.1 names thirty screens and four ship, so what is left in this row is volume, not architecture — see FR-02 and FR-03 |
| FR-02 Master data experiences — Security, Party, Price, ESG | **Partial** | Security and Party are real and rendering over live data: `security-master-dashboard`, `security-master-operations`, `security-overview`, `party-overview`. `securities.source-value` is in the catalog and bound on two pages | **§5.1 names 30 screens; 4 exist.** Price and ESG have no pages *and no catalog entities* — the promoted catalog has no `price` or `esg` domain, so these are an ingestion gap before they are a UI gap. Security is missing Search, Data Quality, Exceptions, Source Comparison, History, Audit as distinct screens |
| FR-03 Operational experiences | **Partial** | Exception Management ships and is the strongest screen in the set — `business.exception-queue` over 164 real rows with severity, ageing and ownership. File Processing ships as `processing-detail`. An operations dashboard ships | **§6 names 8; 2 exist.** Absent: SLA Management, Audit History, Process History, Reference Data Lookup, Housekeeping, IT/Operations Dashboard. Of those, Audit History has data behind it (the append-only audit log) and Housekeeping has none |
| FR-04 Experience templates | **Partial** | `libs/generation/src/templates.ts` selects a template by intent and instantiates it; four business templates are registered on the product | Templates are *generation exemplars*, not the §20 patterns. §20 names seven patterns as ordered compositions ("Master Overview: Search → Filters → Grid → KPIs → Charts → Exceptions") and none of them exists as a named, domain-configurable artifact |
| FR-05 Search and filtering | **Partial** | `input.filter-bar` with real channel wiring; filter and selection channels in the page schema; sort on the data source; the Data Gateway applies both server-side under the caller's entitlements | No configurable *search* component — the filter bar filters a loaded set. §5.1's "Security Search" screen has nothing to build on, and it is named in eight of the thirty master-data screens |

**§7 Common experience architecture — Built.** This is the requirement the prototype most clearly
meets. One `experience.schema.json`, seven component manifests with declared data requirements and
breakpoint behaviour, one renderer with no per-page code, per-breakpoint layout, verified at 320/430/600/900/1350 px
with zero horizontal overflow. §7's list — layout, navigation, headers, filters, grids, charts, tabs,
cards, KPIs, status and exception indicators, drill-down, related records, actions — maps onto existing
schema and components with one exception: **source comparison** (FR-15) has no component. §16.3's
notification is no longer on that list — it is rendered on the variant it concerns, in the library.

---

## §8–§15 The AI experience — FR-06…FR-15

| FR | Status | Evidence | Gap |
|---|---|---|---|
| FR-06 AI search | **Absent** | — | Nothing translates business language into filter criteria. The pieces exist and are unusually well-placed: `intake()` already extracts concepts and refuses out-of-scope requests, the catalog carries semantic types and synonyms, and the gateway enforces entitlements on every query — so §13's "without bypassing existing security" is free rather than hard. What is missing is the translation itself |
| FR-07 AI page creation | **Built** | `libs/generation` — 8 stages, `POST /api/ai/generate`, verified 7 widgets over 2 entities in 883 ms with a Grounding tab showing what was offered and what was withheld | Note the priority inversion: this is the one AI requirement that is *finished*, and §30 prices ground-up creation **P2**. The prototype's front door leads here |
| FR-08 AI page modification | **Built** | Nine verbs, reference resolution, grounding and §19's sentence per change — `libs/generation/src/refine.ts` — reachable from the builder's ✎ button as a transcript that accepts or discards each proposal: `libs/studio-ui/src/refine.service.ts`, `refine-panel.component.ts`, [`CONVERSATIONAL-REFINEMENT.md`](./CONVERSATIONAL-REFINEMENT.md). An accepted refinement is **one patch tagged `origin: 'ai'`**, so undo reverses a sentence in one press and the history panel shows it beside hand edits | One verb per turn ("add issuer and currency" is two), and `move-widget` reorders within a section rather than across the page. `set-drilldown` resolves and cannot be applied from this builder — drill-down targets live on the experience, and the applier says so rather than reporting success |
| FR-09 Conversational context | **Built** | `RefineService` holds the conversation: every turn keeps its prompt, its outcome and whether it was applied, answered or discarded, so §28's nine prompts are one session. §14's "progressively describe changes" works because each turn is **re-grounded in the page as it is now** — `pageViewFor` runs per turn, so an author who drags a widget between two prompts desynchronises nothing | The conversation is per open page and resets when the page changes, which is right for reference resolution and means a cross-page instruction has nowhere to live. No model is called: `interpret()` is rules, and a provider plugs in behind `REFINE_RESPONSE_SCHEMA` without touching resolution |
| FR-10 Grid configuration through AI | **Built** | Columns, sort, grouping and conditional formatting all resolve on real pages and all land: `add-column`/`remove-column` edit the column binding, `sort-rows` sets the **data source's** sort so it survives paging, `group-rows` sets the component's declared enum — which is what makes "group the queue by assignee" work when the field behind it is spelled `assigned-to` | `data.table` still declares no `groupBy`, so grouping refuses on a table and names the component that does offer it — manifest-driven, so adding the property later needs no engine change. `highlight-rows` infers `> 0` for a **measure** and refuses an attribute by asking which value to look for, rather than inventing one |
| FR-11 Visualization configuration through AI | **Built** | `change-chart-type` and `move-widget` resolve, explain themselves and land — "Changed “Coverage by asset class and review state” from a bar chart to a line chart." | **§11's own first example is impossible**: it asks for a pie chart and `analytics.chart` offers bar, line, area, point. Refused by name with the list, which is a component gap rather than an engine one. Chart *grouping* and a time window are named in §11 and not in the vocabulary yet |
| FR-12 Navigation and drill-down through AI | **Partial** | §9's sentence resolves: "Activating a row in “Recently added instruments” now opens the security-overview page." The captured noun is treated as the row's *subject* rather than as a widget reference, which is what makes "double-clicks a security" land on the grid | **Resolves and cannot be applied.** Drill-down targets live on the experience and this builder edits one page, so the applier refuses with that reason instead of reporting a success — listed in `UNSUPPORTED` rather than silently absent. Parameter mapping for the destination is not part of the verb either |
| FR-13 Detail experiences | **Partial** | `security-overview` and `party-overview` are real detail pages with parameters, and the drill-down that reaches them works | Not *creatable or configurable* by prompt. §10's detail-page composition (header, key attributes, current record, contributing sources, exceptions, history, audit) exists as one hand-built page, not as a pattern |
| FR-14 Tabs and related data through AI | **Partial** | `tabs` containers are in the layout schema, static and data-driven, and render | No AI path. "Add a tab showing contributing sources" needs FR-15 as well as a verb |
| FR-15 Source comparison | **Absent** | — | `securities.source-value` is in the catalog and bound on two pages as ordinary rows. There is **no side-by-side comparison component**, which §5.1 asks for in four places (Security, Party, Price, ESG Source Comparison), §10 asks for as a tab, and §28 asks for by prompt. This is the clearest missing *component* in the document |

---

## §16 Product Standard vs. Client-Specific lifecycle — FR-19…FR-24

The section that carries the most architectural weight, and the one with the least behind it.

| FR | Status | Evidence | Gap |
|---|---|---|---|
| FR-17 Auditability | **Built** | Append-only `audit.log.jsonl`; the actor resolved server-side and a body-supplied `actorId` refused 400; provenance on every version with origin and correlation id; ownership transfer self-evidencing on the record | AI *configuration changes* are audited as saves, not as changes — the log records that a version was written, not which prompt produced which edit. FR-17 says "audit AI-generated configuration changes", and the correlation id is the thread that would make that true |
| FR-18 Reusability | **Partial** | Save and reopen work; the Experiences library lists everything regardless of origin | No "save as template", no promotion of a client experience to a reusable asset |
| FR-19 Versioning and rollback | **Partial** | Append-only version history under `versions/`, `artifactVersion` per save, published versions immutable and a save against one refused, four governed lifecycle transitions, and now the product version line beside the client one (§16.6's two lines) | **No rollback operation.** Superseded bodies are on disk and nothing restores one. §16.5's "revert to standard" is a different thing again and also absent |
| FR-20 Product lineage | **Built** | `standard` and `derivedFrom` on the experience; `libs/experience-model/src/lineage.ts`; `POST /api/experiences/:id/derive`. Two version lines, deliberately different types so no arithmetic can mix them. The store refuses every write to a standard — both the incoming definition carrying `standard` **and** the stored one, which is the case that actually happens when a client PUTs a body it stripped the field from. See [`STANDARD-LIFECYCLE.md`](./STANDARD-LIFECYCLE.md) | The unit of the standard is the **experience**, not the screen: §5.1 names thirty screens and the shipped library is two multi-page experiences. Aligning them means splitting the library into single-page experiences with cross-experience drill-down — part of the library work below, not of the lineage |
| FR-21 Standard updates | **Built** | `updateAvailableFor` + `GET /api/experiences/:id/standard-update`, returning §16.3's sentence with `customised` set from `artifactVersion > 1`, rendered on the variant it concerns rather than in a global tray. `deployStandards()` installs a newer standard without touching client work. **Three of §16.3's five actions work**: Preview New Version opens the standard, Keep My Version records `derivedFrom.declinedVersion` so the notification stays quiet until something newer than the declined version ships, and Review Later records nothing — which is the difference between it and Keep My Version. See [`STANDARD-LIFECYCLE.md`](./STANDARD-LIFECYCLE.md) §7 | Compare Changes and Sync with Standard are FR-22 and FR-23, named in a sentence on the card rather than rendered as disabled buttons. A decline cannot be undone from the UI — the next release re-asks, so it is time-limited rather than permanent |
| FR-22 Comparison | **Built** | A **three-way** comparison — baseline → standard is what the product did, baseline → client is what the client did, and a subject both touched is a conflict: `libs/experience-model/src/compare.ts`, `GET /api/experiences/:id/compare-standard`, rendered grouped by side with conflicts first. §16.4's eight kinds of change are all detected; its ninth item, "client-specific customizations", is the `side: 'client'` slice rather than a tenth category. Verified against a real v2.0 release of the shipped standard: 3 product changes, 1 client change, 1 conflict, each named. See [`STANDARD-LIFECYCLE.md`](./STANDARD-LIFECYCLE.md) §8 | A column is compared on its `field`, so a column that kept its field and changed its format reads as unchanged. A rename has no slot in §16.4's eight and is reported under `layout-changed` — a recorded stretch, taken because omitting it would let a sync silently discard the client's own name for a widget |
| FR-23 Synchronization | **Built** | `libs/experience-model/src/synchronise.ts` — sync all, revert to standard, and preview before sync, reachable from the library with the preview **mandatory** rather than an extra button. Sync is a rebase: it starts from the client's artifact and applies the product's changes onto it, so Principle 5 holds by construction rather than by care. Every difference carries a `target`, so the applier never re-derives a location the comparison already found. §16.5's deferred *selective* sync is the same call with a smaller `adopt` set, verified against §16.5's own example. See [`STANDARD-LIFECYCLE.md`](./STANDARD-LIFECYCLE.md) §9 | No **UI** for selective sync — §16.5 defers it, and a usable picking surface needs a preview per selection. Adopting a reorder flattens the widgets into the page's root container, which is the honest limit of merging two trees that may not share a shape |
| FR-24 Upgrade safety | **Built** | Satisfied by construction rather than by a check, which is the stronger form: `deployStandards()` only ever writes an artifact carrying `standard`, and the store refuses every client write to such an artifact — so the set a release can overwrite and the set a client can have edited are provably disjoint. Asserted end to end in `experience-store.spec.ts`: ship v1.0, derive, customise, ship v2.0, redeploy, and the variant's name, baseline and artifact version are all unchanged | Nothing, at this scope. What is still absent is the *selective* synchronisation §16.5 defers, which is a different requirement |

**FR-16 Security — Built.** Enforced, not declared. The persona switch turns widgets `denied` while the
page stays usable; the catalog projection removes unentitled members server-side; the gateway is the
only path to data and applies row entitlements per query; `physical` never reaches a client. §18's list
— user permissions, role-based security, field-level security, tenant boundaries, existing APIs,
supported components, approved data sources, audit — is satisfied except tenancy, which is single and
hard-coded (`demo-tenant`).

**§19 Explainability — Partial.** The generation path explains itself well: a stage timeline, a
grounding tab naming entities kept and withheld, and the full JSON. The modification path now produces
§19's sentence for every change it resolves — "Grouped “Full queue” by assignee.", "Sorted “Breaks for
this rule” by severity, highest first." — generated where the change is decided rather than in a
template, because the wording is a requirement. What is missing is the surface that shows it, and the
"inspect the resulting configuration" affordance §19 asks for on complex changes.

---

## §17 Future phases — FR-25, FR-26

| FR | Status | Note |
|---|---|---|
| FR-25 Future sharing | **Absent** | P2. Ownership exists and is the field sharing keys on, so the foundation is laid deliberately rather than accidentally |
| FR-26 Future extensibility | **Absent** | P2. This is the old PRD's whole subject matter — arbitrary component creation, new elements from scratch — explicitly deferred to Phase 4 here |

---

## The one thing that had to be built first — done

**FR-20, lineage.** Not because it was the largest, but because every other P0 was unsafe without it.

FR-08 modification, FR-10 grid configuration, FR-11 visualisation changes, FR-12 navigation, FR-14 tabs
— all of them modify a page. §16 and Principle 2 say a modification to a *standard* page must produce a
*derived client* experience and leave the standard untouched. The save path used to write over the file,
so building the refinement engine first would have meant shipping, at speed, the ability to destroy the
product's own baseline.

It is now enforced in the store rather than in a route, because a route is a door and there is more than
one door — and it is checked on both the incoming definition and the stored one, since the case that
actually happens is a client PUTting a body it stripped the marker from.

The order that follows from the document rather than from convenience:

1. ~~**FR-20 lineage**~~ **Done** — see [`STANDARD-LIFECYCLE.md`](./STANDARD-LIFECYCLE.md). FR-21 and
   FR-24 came with it: update detection, and a release that provably cannot touch client work.
2. ~~**FR-08/10/11/12 the refinement vocabulary**~~ **Done** — see
   [`CONVERSATIONAL-REFINEMENT.md`](./CONVERSATIONAL-REFINEMENT.md). Nine verbs, reference resolution
   that asks rather than guesses, refusals that name what is available, and §19's sentence per change.
3. ~~**FR-09, the conversation, wired into the builder**~~ **Done.** A ✎ button opens a transcript, each
   turn proposes and explains, Apply produces one patch tagged `origin: 'ai'`, and answering a question
   fills the one reference it asked about. §28's kind of session now runs from a user's seat.
4. ~~**The frame around the conversation (§2, §26)**~~ **Done.** The library is grouped by §2's three
   levels, a standard is customised rather than edited, and §16.1's lineage plus §16.3's notification —
   with the four of its five actions that can work — sit on the variant they concern. See
   [`STANDARD-LIFECYCLE.md`](./STANDARD-LIFECYCLE.md) §8. What is left of §26 is the *builder's* own
   shell, which still opens on a page list rather than on an experience.
5. ~~**FR-22 comparison**~~ **Done.** Three-way, per-change, grouped by side — see
   [`STANDARD-LIFECYCLE.md`](./STANDARD-LIFECYCLE.md) §8. It also closed the hole that made it
   impossible: `deployStandards` was overwriting the standard in place, destroying the baseline every
   correct answer here depends on.
6. ~~**FR-23 sync and revert**~~ **Done.** Sync all, revert to standard, preview before sync — see
   [`STANDARD-LIFECYCLE.md`](./STANDARD-LIFECYCLE.md) §9. Two defects came out of running a *selective*
   sync: the baseline advanced on a partial adoption, which made every un-adopted product change read as
   a client customisation; and two sides that made the same change read as a conflict no sync could clear.
7. **FR-15 source comparison** — the missing component, and it unblocks four named screens plus §28.
8. **FR-06 AI search** — well-placed, as noted.
9. **FR-01/02/03 the library** — the largest volume of work and the least architectural risk, which is
   why it is last in *sequence* and first in *product value*. §5.1's Price and ESG need catalog
   ingestion before they need pages.

## Where this PRD and the code use the same word differently

| Term | The PRD means | The code means |
|---|---|---|
| **Page** | A screen a user opens, e.g. Security Master Overview | A `PageDefinition` inside an `ExperienceDefinition`; the thing a user opens is usually the *experience* |
| **Standard page** | A product-owned, product-versioned asset (§16) | `standard` on the experience — a product-owned artifact with its own `MAJOR.MINOR` version. Resolved. `origin: 'seed'` still exists and still means only "this file was deployed, not authored here" |
| **Version** | The standard's product version, *and* separately the client's (§16.6) | Both, now, and as different types: `standard.version` is `MAJOR.MINOR` and moves with releases; `artifactVersion` is an integer and moves with saves. Resolved |
| **Template** | A reusable starting point in the library (FR-04) | A generation exemplar in `libs/generation/src/templates.ts` |
| **Pattern** | One of §20's seven ordered compositions | Nothing yet |
| **AI search** (FR-06) | Natural language → filters over data | `retrieve()` — similarity search over *catalog metadata*, for grounding a generation |
| **Experience** | Sometimes one screen, sometimes a multi-page journey | Always the multi-page artifact. §5.1's "Security Master Overview" is one page of one experience |

The second and third rows were the ones that would have caused a bug, and both are now resolved — see
[`STANDARD-LIFECYCLE.md`](./STANDARD-LIFECYCLE.md) §3. The first row, **Page**, is the one still live:
the unit of the standard is the experience and §5.1 counts screens, so "how many standard pages ship" has
two answers (two, or nine) depending on which vocabulary the asker is using.
