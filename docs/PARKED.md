# What is parked, and why

The EDM Experience Framework PRD ([`PRD.md`](./PRD.md)) supersedes the 57-FR Opus Experience Studio
PRD. That changes what is in scope, and this file is the record of what was set aside rather than
deleted — so that nothing is quietly lost and nothing is quietly kept.

**Parked means: still in the repository, still compiling, still tested, not on a user-facing surface,
and not a thing the next piece of work builds on.** Nothing here was deleted. Every item names what
would be needed to bring it back.

The rule this file exists to enforce: *a superseded requirement does not make working code wrong.* It
makes it unasked-for. Deleting working code because a document changed is how a prototype loses the
one thing it had — evidence that something works.

---

## 1. The portfolio product layer

**Parked:** the multi-product half of `libs/product-registry`, `products/opus-control.product.json`,
`GET /api/products/identify`, and the traceability that went with them.

**Why:** the new PRD is single-product. It is titled *Enterprise Data Management* Experience Framework,
its experience library is EDM's own domains, and it never mentions Prime, Control, Pulse or a portfolio.
The old PRD's FR-3 ("the AI can identify which Opus product a described Experience concerns") has no
counterpart in the new one, because there is only one product to identify.

**What carries forward, and this matters:** the new PRD's §16 requires *"every out-of-the-box page has a
Product Standard Version owned and maintained by the EDM product team"*. That is exactly what a product
registration's `systemPages` already expressed. So the concept survives — a product-owned page with its
own version — and moves into the standard-experience model, where §16 can build lineage on top of it.
What is parked is the *portfolio* machinery around it: a second product, identification from intent,
cross-product composition, the one-domain-one-product rule.

| Kept, repurposed | Parked |
|---|---|
| A product-owned standard page carrying its own version | `opus-control.product.json` — a second product |
| `products/opus-edm.product.json` as EDM's own declaration: domains, glossary, AI Context, actions, roles | `identifyProduct` / `buildSignalIndex` — FR-3's scoring |
| `experience.productId`, derived from what a page reads | `productsSpanning`, the cross-product `spans` outcome |
| `checkRegistration`'s consistency rules | `composeRegistry`'s cross-product collision rules |

`GET /api/products` stays — with one product in it, it is the standard-experience library's own
manifest, which §5 asks for. `GET /api/products/identify` is parked: with one product the answer is
always the same product, and a route that cannot be wrong cannot be useful.

**To bring back:** re-register a second product and un-park the identify route. Nothing was removed;
`libs/product-registry` still exports all of it and `registry.spec.ts` still exercises the fictional
third product, which remains the cheapest available proof that the platform core carries no
product-specific branching.

---

## 2. The Navigation Model

**Parked:** nothing was built, so nothing is parked in code. Recorded here because the old PRD gave it
six requirements (FR-38…FR-43) and the new one gives it none.

**Why:** the new PRD's navigation requirement is FR-12, and it is a different thing — *"describe
navigation and drill-down behavior using AI"*, which is navigation **within** an experience. The
old PRD's Navigation Model was the per-organisation menu assembled **across** experiences. The new
document does not ask for it.

The name collision noted in the old traceability is now moot in a useful way: `schemas/navigation.schema.json`
describes per-experience navigation, and per-experience navigation is the only kind this PRD has. The
schema's name is correct again.

---

## 3. Studio Access Tiers and Experience Analytics

**Parked:** nothing built for either; both were `Absent` in the old reconciliation.

**Why:** the new PRD has four personas (§21) and no tier model, and its success metrics (§24) are
programme metrics for a product team rather than owner-facing in-product analytics. Its governance
requirement is FR-16, which is *enforce the existing EDM security controls* — and that is built and
demonstrable.

---

## 4. The EDM Page Builder's parallel page model

**Parked:** `apps/studio/src/app/edm/page-builder/` — the recreation of the Opus EDM console's own
low-code studio. Removed from the nav rail; the files remain and the tests still run.

**Why, in the words its own file header used:**

> *"Experience Studio's own visual builder edits a `PageDefinition` — a validated artifact the runtime
> interprets, bound to a governed catalog, edited through JSON Patch with undo. This builder is a
> recreation of a different product's low-code studio: its widgets carry ad-hoc `props`, its data is
> literal arrays, and its state persists to localStorage. […] What it costs is a second page model in
> one repository — which is the honest argument for eventually backing this UI with `PageDefinition`
> instead, and is recorded as the first follow-on."*

The new PRD forces that follow-on. Every §16 requirement — lineage, versioning, comparison,
synchronisation — operates on an artifact the product ships and versions. A page model that lives in
`localStorage` and holds literal data arrays cannot carry a standard version, cannot be diffed against
one, and cannot be security-filtered. Meanwhile FR-16 requires enforced security and FR-13 requires
real search, both of which need the catalog binding this model does not have.

And CLAUDE.md's standing instruction is now literally satisfied rather than argued around: *"Do not
recreate legacy Business Screens as a web clone. Design toward the future state."*

**Mined before parking, not after.** Its `ai/` folder is the best conversational-refinement
architecture in the repository and its ideas are the foundation of the new refinement engine:

| Idea | Where it came from | Where it goes |
|---|---|---|
| A proposal is not an action — describe, count, accept, or discard | `ai/ai.service.ts` | The refinement engine's contract. §19's explainability is this idea with a better name |
| The model emits decisions, code assembles the page | `ai/decisions.ts`, `ai/assemble.ts` | Unchanged, retargeted at `PageDefinition` |
| The model names things; it never invents numbers | `ai/decisions.ts` | Kept, and now stronger: with real binding, figures come from the catalog |
| Grounding drops what the design cannot support, and keeps the reason | `ai/apply.ts` | Kept — it is how a refusal stays explainable |
| Review findings after assembly | `ai/review.ts` | Kept |

**To bring back:** re-add its entry to the nav rail in `apps/studio/src/app/app.ts`. It is otherwise
untouched, and it remains the only side-by-side reference for how the customer's actual console
behaves — which is worth keeping for exactly as long as somebody is still comparing the two.

---

## 5. What the supersession does *not* park

Worth stating, because "PRD_2 is superseded" reads broader than it is. The old PRD was mostly a
description of the layers beneath the builder, and the new PRD depends on every one of them:

| Still load-bearing | The new PRD requirement it serves |
|---|---|
| `libs/catalog-ingest` — register → scan → infer → promote → drift | §8's "the AI should understand EDM metadata"; FR-05 |
| The Data Gateway and its entitlement projection | FR-16 governance; FR-13 AI search "without bypassing existing controls" |
| `server/personas.ts` and the two-axis capability model | FR-16, §18's guardrails |
| `libs/validator` — 8 levels | FR-07/08 — an AI change that fails validation must not be offered |
| `libs/generation` — the 8-stage pipeline | FR-07 page creation, and the intake stage's out-of-scope refusal |
| The lifecycle gate (`libs/experience-model/src/lifecycle.ts`) | FR-17 auditability, FR-19 versioning |
| Ownership, and the server-side actor | FR-17, and §17's future sharing |
| `experience.schema.json` and the component manifests | §7's common experience architecture, wholesale |
| The Exception Queue component | §6 Exception Management, §20's Exception Management pattern |

The old reconciliation is kept at
[`superseded/PRD-2-TRACEABILITY.md`](./superseded/PRD-2-TRACEABILITY.md) because it is an accurate
account of what the code does — only its *requirement numbers* are stale. Read it for evidence, not
for scope.
