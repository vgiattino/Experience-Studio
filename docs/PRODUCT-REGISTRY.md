# The Product Experience Registry

> **Partly parked.** The EDM Experience Framework PRD ([`PRD.md`](./PRD.md)) supersedes the portfolio
> PRD this document was written against, and it is single-product. What survives is EDM's own
> declaration — domains, glossary, AI Context, actions, roles, and the **standard pages** its §16
> lifecycle builds on. What is parked is the portfolio machinery: the second registration, product
> identification from intent (§4 below), and the cross-product composition rules (§3). The code is
> untouched and still tested; [`PARKED.md`](./PARKED.md) §1 records the split and what un-parking takes.
>
> FR numbers below refer to the **superseded** PRD. The mapping to the current one:
> its FR-20…FR-24 are now the standard-page half of FR-01 and the lineage of FR-20…FR-24 in
> [`PRD-TRACEABILITY.md`](./PRD-TRACEABILITY.md).

Status: **Implemented; portfolio half parked**
Requirements (superseded numbering): FR-3, FR-20 · FR-21 · FR-22 · FR-23 · FR-24, and the product half of FR-12/FR-28/FR-31
Contract: [`../schemas/product.schema.json`](../schemas/product.schema.json)
Code: `libs/product-registry/`, `server/services/product-registry.ts`, `products/`

---

## 1. The problem this closes

The PRD's central architectural claim is that Experience Studio is one platform across the Opus
portfolio:

> Adding a new product to the portfolio is a registration exercise through the Product Integration
> Contract, not a platform code change. Product-specific behavior is expressed entirely through what a
> product registers — never through platform-core conditionals keyed on product identity. — FR-20

Before this work, that was true and worthless.

There was no product-specific branching in the core because **there was no product concept at all**.
Nothing named a product, nothing owned a slice of the catalog, nothing said which vocabulary the AI
should speak. `grep productId schemas libs` returned nothing. FR-20 was satisfied the way an empty
function satisfies every postcondition, and the traceability document said what would be needed to
test it: *the first second product.*

There are now two, and the second one is the point.

---

## 2. What a product registers

One JSON document per product, in `products/`, validated by `npm run validate`.

| Field | FR | What it is |
|---|---|---|
| `metadata.domains` | FR-21 | Catalog domains this product owns. **The load-bearing field.** |
| `metadata.entities` | FR-21 | Individual entities owned outside those domains |
| `metadata.dataSources` | FR-21 | Ingestion sources its metadata came from, so drift can name the product |
| `metadata.glossary` | FR-21 | The business glossary, for humans reading the catalog |
| `metadata.apis` | FR-21 | Product APIs an action may reach. Declarative — nothing invokes them |
| `components` | FR-22, FR-31 | Component types this product contributes, with their family |
| `templates` | FR-9, FR-22 | Product-scoped starting points |
| `systemPages` | FR-25 | Pages the product ships as a baseline, with their `override` policy |
| `systemJourneys` | FR-26 | Ordered paths through those pages |
| `actions` | FR-22 | Product operations, each with the capability it needs and whether it mutates |
| `security.capabilities` / `.roles` | FR-23 | The permission model an Experience's Security element resolves against |
| `aiContext` | FR-23, FR-4 | The vocabulary the AI is grounded in, plus identification signals |

### Metadata is a claim, not a copy

A registration says which catalog entities are the product's. It does not carry them. Entities live in
the catalog, where ingestion put them against a real database, and a second copy inside a registration
would be a second answer to *what is a Security*. `groundingFor()` is the join, evaluated against
whichever snapshot the caller holds.

That has a consequence worth wanting: a product's grounding is correctly **empty** in a tenant that has
not ingested its data, rather than notionally present.

### What is deliberately absent

No host, no endpoint, no package coordinate, no version negotiation. Registration says what a product
*contributes*; how it is delivered is an operational concern the PRD itself flags as unspecified
(FR-20's assumption note). Freezing the wrong answer into the contract is worse than leaving the
question open.

---

## 3. The rules

### One domain, one product

Two products claiming the same catalog domain is a **blocking** problem, and composition refuses the
pair rather than picking.

The reason is not tidiness. Without this rule product identification is undecidable: a prompt about
exceptions could belong to either claimant, so the platform resolves by load order — a wrong answer
produced quietly forever, instead of a registration bug caught once.

### Other refusals

| Rule | Severity | Why |
|---|---|---|
| A component type no manifest defines | blocking | A registration cannot bring a component into existence |
| `family: extension` without `extensionFamily` | blocking | FR-30 permits an extension family only when it is declared |
| A System Journey step that is not a registered System Page | blocking | A journey through a page nobody ships is a dead end for every customer who follows it |
| A role or action naming an unregistered capability | blocking | An action gated on a capability nobody defined is gated on nothing |
| The same word defined twice in one product | blocking | Not a specialisation — a contradiction, and whichever the AI reads first wins |
| Two products registering the same component type | blocking | Shared ownership means neither can change it |
| Two products sharing an id | blocking | An Experience's `productId` becomes meaningless |
| The same word meaning different things in two products | **warning** | Precisely why AI Context is per product — but that word can no longer identify one |
| A registered product with no metadata in this tenant | **warning** | A normal deployment state; failing to *say so* is the fault |
| A registration contributing nothing at all | **warning** | Legal, and invisible to generation, the palette and the catalog alike |

`composeRegistry` returns every product it was given, including ones carrying blocking problems. A
caller that refuses to start still has to be able to say which two products collided.

---

## 4. Product identification from intent — FR-3

> The AI can identify which Opus product(s) a described Experience concerns from the prompt content,
> without the user naming the product explicitly. Where intent plausibly spans more than one product,
> the AI asks rather than silently picking one.

### A signal only counts if it discriminates

The signal index is built across the whole registry first. Any word claimed by more than one product is
then worth **nothing to either of them**.

"Exception" means something in every data platform ever built. If two products register it, a prompt
about exceptions has said nothing about which one, and scoring it for both produces a confident tie
that then resolves by load order. Discarding it produces a low score, which produces a question.

`sharedSignals` is returned rather than hidden, so a product owner asking why their product is never
identified can see that every word they registered is a word somebody else registered too.

### Weights

| Origin | Weight | |
|---|---|---|
| The product's name or id | 6 | The user said it |
| `aiContext.intentSignals` | 3 | Vocabulary registered specifically to be identified by |
| `aiContext.terminology` | 2 | |
| `metadata.glossary` | 2 | |
| A claimed domain name | 2 | |
| An entity business name or synonym | 1 | Numerous and weak, which is the right combination — they broaden coverage without outvoting declared vocabulary |

The runner-up may reach **70%** of the leader before the answer becomes "ask". Not tighter, because the
failure modes are asymmetric: an unnecessary question costs one click, and grounding a Control dashboard
in EDM's metadata produces a page that is fluent, plausible and about the wrong system.

### Matching

Whole words and phrases, never substrings — `recon` must not match `reconfigure`, or every
infrastructure prompt becomes a Control prompt. Final words are inflected naively (`-s`/`-es`/`-ies`,
and the reverse), because a glossary is written in the singular and business vocabulary is spoken in the
plural. A real stemmer would be a dependency and a source of surprises: `processing` → `process`.

### Verified

Against the two shipped registrations and the promoted catalog:

| Prompt | Outcome | Scores |
|---|---|---|
| The PRD's own UJ-1 prompt, verbatim | `opus-edm` — matched "security master", "late files", "failed files" | 17 – 0 |
| "show me aged reconciliation breaks by custodian" | `opus-control` — matched "reconciliation", "break" | 5 – 0 |
| "build me a dashboard with some charts on it" | asks which product | 0 – 0 |
| "a nostro proof and the exception queue" | **asks** — matches both | 5 – 5 |

The last row is the behaviour FR-3 actually specifies, and it only works because there are two products
to be ambiguous between.

---

## 5. An Experience's product is derived, not declared

`experience.productId` is resolved by the server from the entities the experience's data sources read.

The alternative — a field the author fills in — produces a label that can be wrong and, worse, stays
wrong. Repoint every data source at another product and the old badge survives forever, along with every
catalog filter built on it. This is the same reasoning that took `actorId` out of the request body: a
value the client asserts about itself is a value the client can be wrong about.

| Outcome | What the server does |
|---|---|
| **resolved** | Stamp it |
| **unclaimed** | No product owns what this reads. A badge would be an invention |
| **spans** | Two or more products. Recorded, not resolved |
| **noCatalog** | Nothing can be derived, so an existing value is left alone rather than destroyed |

A definition arriving with a `productId` its data does not support has it removed. The three
non-resolving outcomes are returned as `productResolution` alongside the saved record — beside it rather
than inside it, because that is how the product was decided, not part of the artifact.

**`spans` is deliberately unresolved.** The PRD flags cross-product Experiences as unaddressed (FR-3's
assumption note), and both ways of resolving it are worse than reporting it: picking the majority
product mislabels the artifact silently, and refusing the save blocks a page that renders perfectly
well. It has no coverage against real data for the honest reason that only one registered product has
data in this tenant; `registry.spec.ts` covers it with synthetic products.

---

## 6. The two registrations

### `opus-edm` — real

Its six domains are domains the demo tenant's catalog actually contains, scanned from a live SQL Server
through `@opus/catalog-ingest`. Every `definitionRef` is a page that ships in
`apps/viewer/public/definitions`. Five System Pages, two System Journeys, five actions, eleven
capabilities across four roles, ten terminology entries and twenty-one intent signals.

Two absences are as deliberate as the content:

- **No components.** Every component in the library today is platform-native, including
  `business.exception-queue`. Claiming one for EDM would misrepresent who maintains it. FR-22's
  component registration is therefore exercised only in tests, and that is stated rather than hidden.
- **No `metadata.dataSources`.** A source id is assigned per tenant when a steward registers the
  database. Hard-coding this tenant's would be wrong everywhere else.

### `opus-control` — registered and ungrounded

This is not a placeholder. It exists to test FR-20, and adding it required **no change to any file under
`libs/` or `server/`** — which is the entire point of it.

Its `status` is `registered` rather than `active` because the demo tenant's catalog contains no Control
data. That is the honest state and a chosen one: fabricating recon and settlement tables would make the
registry look complete while proving nothing, and would put invented data in front of anyone
demonstrating the platform.

So `groundingFor()` reports it as ungrounded, identification still recognises its vocabulary, and a
prompt about breaks gets *"Control's metadata is not in this tenant"* rather than a fluent dashboard
built out of EDM's securities. That last sentence is the whole reason the product concept exists.

### A claim ahead of its ingestion

EDM claims six domains; the **checked-in seed** catalog carries four. `vendor` and `master` appear once a
scan has been promoted against the live database. Against a fresh checkout EDM is therefore grounded
with two `unknownDomains`.

Neither the registration nor the catalog is wrong. The alternatives are: refuse the registration, or
report the product as fully grounded and let a generation fail later with no explanation. Naming the
gap is better than both, and `product-registry.spec.ts` asserts it explicitly so the state stays
visible.

---

## 7. How FR-20 is held to account

FR-20 is a claim about production code, so the only way to test it is to exercise that code with a
product it has never heard of.

`registry.spec.ts` defines **Acme Sprocket Control** — a fictional product, in a fictional domain, with
vocabulary nothing else in the repository mentions, declared entirely inside the test file. It then
asserts that composition, catalog grounding, component ownership, capability checking and prompt
identification all work for it.

If that test ever needs a production edit to pass, FR-20 has been broken, and that is where it will
show.

The rule it enforces, stated plainly: **no file under `libs/` or `server/` may branch on a product id.**
Everything a product needs the platform to know is a field in `contract.ts`; everything the platform
needs to decide is a function over those fields.

---

## 8. The API

```
GET /api/products              every registration, its grounding, and every problem
GET /api/products/identify     ?prompt=…  → FR-3's decision, with the scores that made it
```

`problems` is returned alongside the products rather than logged and forgotten. The interesting failures
are the ones an operator caused by editing a file, and a registry that hides them behaves as though the
second claimant does not exist.

Registrations are read from disk at runtime, not compiled in. That is the mechanism behind "a
registration exercise, not a platform code change" — a deployment adds a file and nothing rebuilds —
and it makes a malformed registration a startup diagnostic rather than a build failure, which is the
right failure mode for something an operator edits.

Two environment variables came out of this, both read per call so a running process honours them:

| | |
|---|---|
| `OPUS_PRODUCTS_DIR` | Where registrations are read from. Default `products/` |
| `OPUS_CATALOG_PATH` | The seed catalog, used when no promotion has produced a published one |

Both exist for the same reason `OPUS_DATA_DIR` and `OPUS_SECRET_DIR` do — a deployment keeps its
configuration where its configuration management puts it — and both surfaced the same way: a test could
not find real files, because under a bundler `import.meta.url` is the bundle's location and every
`ROOT`-derived path pointed at nothing. A test that needs an environment variable to find real files is
a test reporting that operators needed one too.

---

## 9. What this does not do

Stated plainly, because a registry that looks finished is worse than one that says where it stops.

| | |
|---|---|
| **Nothing consumes `aiContext` yet** | The generation pipeline does not read a product's terminology or instructions. Identification works; grounding the *model* in the identified product's vocabulary is the next step, and it is what makes FR-23 more than a schema |
| **No product-scoped palette** | A registered product component would be owned correctly and still appear to every product's builder. Needs the palette to filter on `componentOwner` |
| **System Pages are declarations** | `systemPages` and `override` record intent. FR-25's ownership, extension and override *semantics* do not exist — the PRD flags the permission model as unconfirmed |
| **Actions are declarations** | Nothing executes one. Same posture already taken for `workflows` |
| **No template scope enforcement** | `templates` records product scope; FR-9's Enterprise / Product / Organization scoping and FR-11's promotion path are still absent |
| **Cross-product Experiences** | Reported, never resolved. Waiting on a product decision, not on code |
| **Identification is rules, not a model** | Free, deterministic and testable, and correct for a lookup against declared vocabulary. A deployment may swap the scorer for a model call over the same index; the index and the refusal to guess are the parts that would stay |

---

## 10. Open questions this raises for the PRD

These are the PRD's own open questions, sharpened by having built against them.

1. **Pulse's position (FR-24).** The registry treats Pulse as a peer, because nothing in the contract
   can express "nested under Control" and nothing needed to. If Pulse is genuinely nested — sharing
   Control's domains, or inheriting its AI Context — the one-domain-one-product rule is the first thing
   that breaks, and it breaks loudly rather than quietly. Worth confirming before Pulse registers.
2. **Cross-product Experiences (FR-3).** Currently reported as `spans` and left unresolved. Three
   answers are possible — refuse them, allow them with a primary product, or model a composite product —
   and the choice changes the schema, not just the code.
3. **System Page override semantics (FR-25).** `override: extend | replace | none` is recorded and
   unenforced, waiting on the permission model the PRD marks unconfirmed.
4. **Where a registration comes from (FR-20).** A file in a directory is the prototype's answer. An API,
   a signed manifest and a package are all plausible for a real deployment, and the contract is
   deliberately silent so that choice stays open.
