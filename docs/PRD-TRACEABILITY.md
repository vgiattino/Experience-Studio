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
| **P0** | FR-01…FR-19 less FR-06 | 4 | 8 | 6 |
| **P1** | FR-20…FR-24 | 0 | 1 | 4 |
| **P2** | FR-25, FR-26 | 0 | 0 | 2 |

The distribution says something specific and it is not "much is missing". It is that **the platform
beneath the requirement is largely built and the requirement itself largely is not.**

Every P0 marked Partial is partial in the same direction: the *model* supports it, the *renderer*
honours it, and **no conversational path reaches it**. A grid's conditional formatting is in
`binding.schema.json`; a sort is on the data source; a chart's mark is a manifest property. A person
can set all three by hand in the builder's inspector. Nobody can say "highlight securities with
unresolved exceptions" and have it happen — and saying it is the requirement.

The other shape worth naming: **§16's lifecycle is the largest genuinely-absent thing, and it is
upstream of everything else.** Principle 2 is *"client customization must never modify the product
standard"*. Today an AI modification to a shipped page writes back over the shipped page. Until lineage
exists, every FR-08 refinement is a violation of Principle 2, which is why the lineage model comes
before the refinement engine in the order of work below and not after it.

---

## §5–§7 The standard experience library — FR-01…FR-05

| FR | Status | Evidence | Gap |
|---|---|---|---|
| FR-01 Standard experience library | **Partial** | Nine page definitions ship in `apps/viewer/public/definitions/`, and `products/opus-edm.product.json` registers five of them as product-owned System Pages with an `override` policy. `GET /api/products` returns that library as a manifest | They are files that happen to ship, not a *library*: no browsing surface presents them as product capabilities, and the Experiences list mixes them with client-saved work under an `origin: 'seed'` flag |
| FR-02 Master data experiences — Security, Party, Price, ESG | **Partial** | Security and Party are real and rendering over live data: `security-master-dashboard`, `security-master-operations`, `security-overview`, `party-overview`. `securities.source-value` is in the catalog and bound on two pages | **§5.1 names 30 screens; 4 exist.** Price and ESG have no pages *and no catalog entities* — the promoted catalog has no `price` or `esg` domain, so these are an ingestion gap before they are a UI gap. Security is missing Search, Data Quality, Exceptions, Source Comparison, History, Audit as distinct screens |
| FR-03 Operational experiences | **Partial** | Exception Management ships and is the strongest screen in the set — `business.exception-queue` over 164 real rows with severity, ageing and ownership. File Processing ships as `processing-detail`. An operations dashboard ships | **§6 names 8; 2 exist.** Absent: SLA Management, Audit History, Process History, Reference Data Lookup, Housekeeping, IT/Operations Dashboard. Of those, Audit History has data behind it (the append-only audit log) and Housekeeping has none |
| FR-04 Experience templates | **Partial** | `libs/generation/src/templates.ts` selects a template by intent and instantiates it; four business templates are registered on the product | Templates are *generation exemplars*, not the §20 patterns. §20 names seven patterns as ordered compositions ("Master Overview: Search → Filters → Grid → KPIs → Charts → Exceptions") and none of them exists as a named, domain-configurable artifact |
| FR-05 Search and filtering | **Partial** | `input.filter-bar` with real channel wiring; filter and selection channels in the page schema; sort on the data source; the Data Gateway applies both server-side under the caller's entitlements | No configurable *search* component — the filter bar filters a loaded set. §5.1's "Security Search" screen has nothing to build on, and it is named in eight of the thirty master-data screens |

**§7 Common experience architecture — Built.** This is the requirement the prototype most clearly
meets. One `experience.schema.json`, seven component manifests with declared data requirements and
breakpoint behaviour, one renderer with no per-page code, per-breakpoint layout, verified at 320/430/600/900/1350 px
with zero horizontal overflow. §7's list — layout, navigation, headers, filters, grids, charts, tabs,
cards, KPIs, status and exception indicators, drill-down, related records, actions — maps onto existing
schema and components with two exceptions: **source comparison** (FR-15) and **notifications** (§16.3)
have no component.

---

## §8–§15 The AI experience — FR-06…FR-15

| FR | Status | Evidence | Gap |
|---|---|---|---|
| FR-06 AI search | **Absent** | — | Nothing translates business language into filter criteria. The pieces exist and are unusually well-placed: `intake()` already extracts concepts and refuses out-of-scope requests, the catalog carries semantic types and synonyms, and the gateway enforces entitlements on every query — so §13's "without bypassing existing security" is free rather than hard. What is missing is the translation itself |
| FR-07 AI page creation | **Built** | `libs/generation` — 8 stages, `POST /api/ai/generate`, verified 7 widgets over 2 entities in 883 ms with a Grounding tab showing what was offered and what was withheld | Note the priority inversion: this is the one AI requirement that is *finished*, and §30 prices ground-up creation **P2**. The prototype's front door leads here |
| FR-08 AI page modification | **Partial** | `AssistService` and the ★ panel answer *"what is this page missing?"* as strict `AssistProposal`s, each applied as one undoable patch | **The central gap of this PRD.** Assist proposes *additions from the catalog*. It cannot move a widget, change a chart type, add or remove a column, group, sort, apply conditional formatting, or add a filter — and those are the examples §11, §12 and §15 give. Every worked prompt in §28 is currently impossible |
| FR-09 Conversational context | **Absent** | — | Each prompt is independent. Nothing holds the conversation, so §14's "start with a standard page and progressively describe changes" has no state to progress. §28's nine-turn walkthrough is nine unrelated requests |
| FR-10 Grid configuration through AI | **Partial** | The *model* supports all of it: `conditionalFormats` on a field binding (`binding.schema.json:46`), `sort` on the data source, per-column formatting, and the builder's Data panel edits columns by hand | No AI path to any of it, and **grouping has no model support at all** — `data.table` has no `groupBy` property. `business.exception-queue` does, which is the shape to copy |
| FR-11 Visualization configuration through AI | **Partial** | `analytics.chart` carries `mark` (the chart type), `stacking`, `legend`, `gridlines`; encoding bindings carry the channels; layout placement is per-breakpoint in the schema | No AI path. "Change the pie chart to a bar chart" is a one-property patch the platform can already validate and render — it is the cheapest win in this document and it is not wired |
| FR-12 Navigation and drill-down through AI | **Partial** | `drilldownTargets` on the experience, verified click-through Security Operations → Security Overview carrying parameters | No AI path. §9's "when the user double-clicks a security, take them to a security detail page" is expressible in the model and unreachable by prompt |
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
| FR-19 Versioning and rollback | **Partial** | Append-only version history under `versions/`, `artifactVersion` per save, published versions immutable and a save against one refused, four governed lifecycle transitions | **No rollback operation.** Superseded bodies are on disk and nothing restores one. §16.5's "revert to standard" is a different thing again and also absent |
| FR-20 Product lineage | **Absent** | — | The requirement of record for this whole section. Nothing links a client page to the standard it came from. `origin: 'seed'` marks *provenance of the file*, not derivation: modify a seeded page today and the save overwrites it in place, so **Principle 2 is violated by the only path a user has** |
| FR-21 Standard updates | **Absent** | — | Needs FR-20 first. `products/opus-edm.product.json` registers System Pages with no version of their own, so there is nothing to compare a client's baseline against |
| FR-22 Comparison | **Absent** | — | §16.4 asks for a diff classified into nine named categories. `detectDrift` in `catalog-ingest` is a genuine precedent for the *shape* of that answer — it diffs a re-scan against a promoted baseline and reports what changed and what it breaks — but it is about metadata, not layouts |
| FR-23 Synchronization | **Absent** | — | Needs FR-20 and FR-22 |
| FR-24 Upgrade safety | **Absent** | — | Vacuously true today, in the worst way: a product update cannot overwrite a client customisation because neither concept exists. This is the same trap the old PRD's FR-20 fell into, and it is worth naming twice |

**FR-16 Security — Built.** Enforced, not declared. The persona switch turns widgets `denied` while the
page stays usable; the catalog projection removes unentitled members server-side; the gateway is the
only path to data and applies row entitlements per query; `physical` never reaches a client. §18's list
— user permissions, role-based security, field-level security, tenant boundaries, existing APIs,
supported components, approved data sources, audit — is satisfied except tenancy, which is single and
hard-coded (`demo-tenant`).

**§19 Explainability — Partial.** The generation path explains itself well: a stage timeline, a
grounding tab naming entities kept and withheld, and the full JSON. The *modification* path does not,
because it barely exists — and §19's example ("I've added an Exception Status column to the Security
grid and configured rows with unresolved exceptions to display as highlighted") is a sentence about a
refinement, in the register the refinement engine has to produce.

---

## §17 Future phases — FR-25, FR-26

| FR | Status | Note |
|---|---|---|
| FR-25 Future sharing | **Absent** | P2. Ownership exists and is the field sharing keys on, so the foundation is laid deliberately rather than accidentally |
| FR-26 Future extensibility | **Absent** | P2. This is the old PRD's whole subject matter — arbitrary component creation, new elements from scratch — explicitly deferred to Phase 4 here |

---

## The one thing that must be built first

**FR-20, lineage.** Not because it is the largest, but because every other P0 is unsafe without it.

FR-08 modification, FR-10 grid configuration, FR-11 visualisation changes, FR-12 navigation, FR-14 tabs
— all of them modify a page. §16 and Principle 2 say a modification to a *standard* page must produce a
*derived client* experience and leave the standard untouched. Today the save path writes over the file.
So building the refinement engine first would mean shipping, at speed, the ability to destroy the
product's own baseline.

The order that follows from the document rather than from convenience:

1. **FR-20 lineage** — a standard page with its own version, a client variant that records what it was
   derived from, and a save path that *forks rather than overwrites* when a standard is modified.
2. **FR-08/10/11/12/14 the refinement vocabulary** — retarget the parked builder's plan → assemble →
   ground → review architecture at `PageDefinition`. FR-11 first: changing a chart's mark is one
   validated property and proves the whole path.
3. **FR-09 conversational context** — cheap once the verbs exist, and it is what turns nine prompts into
   one conversation.
4. **FR-21/22 update detection and comparison** — P1, and `detectDrift` is the precedent to follow.
5. **FR-23 sync and revert** — P1.
6. **FR-15 source comparison** — the missing component, and it unblocks four named screens plus §28.
7. **FR-06 AI search** — well-placed, as noted.
8. **FR-01/02/03 the library** — the largest volume of work and the least architectural risk, which is
   why it is last in *sequence* and first in *product value*. §5.1's Price and ESG need catalog
   ingestion before they need pages.

## Where this PRD and the code use the same word differently

| Term | The PRD means | The code means |
|---|---|---|
| **Page** | A screen a user opens, e.g. Security Master Overview | A `PageDefinition` inside an `ExperienceDefinition`; the thing a user opens is usually the *experience* |
| **Standard page** | A product-owned, product-versioned asset (§16) | `origin: 'seed'`, which records where a file came from and carries no version and no ownership |
| **Version** | The standard's product version, *and* separately the client's (§16.6) | `artifactVersion`, a single monotonic counter per stored artifact |
| **Template** | A reusable starting point in the library (FR-04) | A generation exemplar in `libs/generation/src/templates.ts` |
| **Pattern** | One of §20's seven ordered compositions | Nothing yet |
| **AI search** (FR-06) | Natural language → filters over data | `retrieve()` — similarity search over *catalog metadata*, for grounding a generation |
| **Experience** | Sometimes one screen, sometimes a multi-page journey | Always the multi-page artifact. §5.1's "Security Master Overview" is one page of one experience |

The third row is the one that will cause a bug. §16.6's example lists *"Standard v1.0, Client v1.0,
Standard v2.0 available, Client v1.1"* — two independent version lines against one artifact, and the
store has one counter.
