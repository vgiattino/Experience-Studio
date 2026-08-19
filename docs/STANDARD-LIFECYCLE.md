# Product Standard ↔ Client Experience

Status: **Lineage, deployment and update detection built. Compare and sync not yet.**
Requirements: [`PRD.md`](./PRD.md) §16 · §16.1 · §16.2 · §16.3 · §16.6, FR-19 · FR-20 · FR-21 · FR-24
Contract: `schemas/experience.schema.json` — `standard`, `derivedFrom`
Code: `libs/experience-model/src/lineage.ts`, `server/store/experience-store.ts`, `server/routes.ts`

---

## 1. Why this came first

Every P0 in this PRD modifies a page. FR-08 conversational modification, FR-10 grid configuration,
FR-11 visualisation changes, FR-12 navigation, FR-14 tabs — all of them.

Principle 2 says: *"Client customization must never modify the product standard."*

Before this work, modifying a shipped page overwrote the shipped page. So building the conversational
verbs first would have shipped, at speed, the ability to destroy the product's own baseline. The
refinement engine is the visible part of this PRD and this is the part that has to exist under it.

---

## 2. Three states, not two

An experience is one of three things, and the third is not a missing value:

| State | Marked by | Writable? |
|---|---|---|
| **Product standard** | `standard: { standardId, version, … }` | No. Deployed, never saved |
| **Client variant** | `derivedFrom: { standardId, standardVersion, … }` | Yes — this is the writable thing |
| **Neither** | both absent | Yes. Built from scratch, outside the standard lifecycle |

`isStandard()`, `isClientVariant()` and the absence of both are all meaningful, and code that treats
"not a standard" as "is a client variant" will be wrong about every experience a user created himself.

---

## 3. Two version lines

§16.6's example is the specification:

```
Security Master Overview
  Standard v1.0            ← the product's line
  Client v1.0              ← the client's line
  Standard v2.0 available
  Client v1.1
```

Two independent lines against one page, and the codebase had one counter. So:

| | Type | Moved by | Field |
|---|---|---|---|
| The product line | `MAJOR.MINOR` string | A product release | `standard.version`, `derivedFrom.standardVersion` |
| The client line | integer | A save | `version.artifactVersion` |

Deliberately different types, so that no arithmetic can mix them. `lineage.spec.ts` has a test for
exactly the mistake this prevents: a client that has saved forty times is still on standard v1.0, and a
comparison that reached for `artifactVersion` would find 40 > 2 and report the client as current
forever.

---

## 4. `derivedFrom` is not `copiedFrom`

`version.lineage.copiedFrom` already existed. It is not this, and both are kept because they answer
different questions.

> A **copy** is a snapshot: nothing is expected of the thing it came from, ever again.
> A **derivation** is a standing relationship: when the standard moves, the client must be told
> (§16.3), must be able to compare (§16.4), and must be able to synchronise or refuse (§16.5).

None of those three questions has an answer without a live link. A derived experience carries both —
`copiedFrom` says where the bytes came from, `derivedFrom` says what the relationship is — so a reader
of either does not have to know about the other.

The baseline **moves**: a synchronisation advances `standardVersion` and records the step in
`syncedFromVersion`, so *"has this client ever adopted a product update"* is answerable from the
artifact rather than only from the audit log.

---

## 5. A standard is deployed, never saved

§16.2: *"New standard versions are deployed as part of product releases."* A deployment, not an
authoring action. So there are two doors and they are different doors:

```
  a release              →  deployStandards()   writes standards, upgrades in place
  a person authoring     →  save()              refuses anything carrying `standard`
```

**The refusal lives in the store, not in a route,** because a route is a door and there is more than
one door. `save()` and `saveTransition()` both call `refuseStandardWrite()`.

It checks **both sides**, and the second is the case that actually happens:

- the *incoming* definition carrying `standard` — somebody saving a standard;
- the *stored* one carrying it — a client PUTs a body it stripped the field from, which would silently
  demote a product asset to an ordinary artifact, after which nothing would stop the next save either.

There is deliberately **no capability that permits it**. Gating the product's most important invariant
on a permission list would make it depend on the least stable list in the codebase. `refuseStandardWrite`
takes one argument and it is not a user.

The refusal names the way forward — `deriveTo` carries the client variant's id — because a refusal that
does not name the alternative forces the caller to reimplement `derivedIdFor` to recover from it.

### FR-24 is satisfied by construction, not by a check

*"Never automatically overwrite client customizations with product-standard updates."*

`deployStandards()` only ever writes an artifact that carries `standard`, and the store refuses every
client write to such an artifact. So **the set of things a release can overwrite and the set of things a
client can have edited are provably disjoint.** A client's work lives in the derived variant, which a
release never looks at.

`experience-store.spec.ts` asserts it end to end rather than trusting the argument: ship v1.0, derive,
customise, ship v2.0, redeploy — and the variant's name, baseline and artifact version are all
unchanged.

Older or equal versions are skipped, so a rollback is a deliberate act (delete and re-seed) rather than
something a redeploy does by surprise.

---

## 6. Deriving

`POST /api/experiences/:id/derive`

What is carried, dropped and reset, and why each:

| | |
|---|---|
| **carried** | pages, layout, data sources, navigation, actions, security, workflows, docs, tests — everything that makes it the same experience. A fork that differed from its standard on day one could never be compared against it meaningfully |
| **dropped** | `standard`. The variant is not a standard, and leaving it would make the store refuse to save the very artifact this creates |
| **dropped** | `owner`. The store assigns the forker. Copying the product team's ownership onto a client's page would answer *"who is responsible for this"* with the name of a team that has never seen it |
| **reset** | the version envelope — draft, artifactVersion 1, no approvals, not immutable. A variant must not arrive pre-approved by people who have not seen it |
| **added** | `derivedFrom`, the whole point |

**One variant per standard.** The id is `<standardId>.client`, deterministic rather than generated,
because §16 speaks of *"your current experience"*, singular. A random id would let the same standard be
forked twice, and then *"is an update available for my Security Master Overview"* has two answers.

The route is **idempotent**: a second derive returns the existing variant with `200` and
`derived: false`, rather than a conflict that would push every caller into a check-then-create race for
no benefit.

**Deriving from a derivation is refused.** A chain is not something §16 describes how to synchronise, so
it is refused with `alreadyDerived` rather than allowed and left for whoever hits the second sync.

---

## 7. Update detection — FR-21, §16.3

`GET /api/experiences/:id/standard-update`

Returns `{ update: null }` when there is nothing available. Not a 404: *"nothing is available"* is a
successful answer to this question, and a 404 would make a client branch on an error to render a quiet
state.

`customised` is the field §16.3's warning turns on:

> *"Your current experience contains customizations. Review the changes and choose whether to update
> your experience."*

A variant nobody has touched can adopt an update with no risk at all, and sending that user to a
comparison is ceremony. `artifactVersion > 1` is the test — the fork itself is version 1, so anything
above it is a save somebody made.

The notification names the **standard**, not the client's variant. A client that renamed its page to
"Securities Operations — Acme" has no new version of that; the product released a new version of the
standard it derives from, and saying otherwise invites the reader to look for an Acme release that does
not exist.

An **unreadable** version sorts as older than everything, which is the safe direction: a client on a
malformed baseline is told an update is available and gets to look, rather than being told it is current
on the strength of a string nobody could parse.

Two silences are deliberate. A client **ahead** of the shipped standard gets no update — it happens when
a standard is rolled back, and the page still works. A standard that is **no longer shipped** gets no
update either, which leaves the client page working and unadvised rather than erroring against an
artifact that is fine.

---

## 8. Verified

Against the running API, on a clean store:

```
1. Principle 2
   PUT over the standard          409  standardNotEditable
   strip `standard` and PUT       409  standardNotEditable   ← the case that actually happens
   POST /submit                   refused
   afterwards                     name unchanged, standard v1.0, artifactVersion 1

2. Derive
   POST /derive                   201  securities-operations.client
   name                           "Securities Operations — Client Version"
   derivedFrom                    { standardId, standardVersion: "1.0", productRelease: "2026.08" }
   owner                          the forker, not the product team
   standard field                 dropped
   pages carried                  all six
   derive again                   200  derived=false      (idempotent)
   derive the fork                409  alreadyDerived

3. The variant is writable        200  artifactVersion=2

4. Ship v2.0 and restart
   boot log                       standard upgraded: securities.operations v1.0 → v2.0
   update available               v2.0, customised=true
   notification                   "A new version of Securities Operations is available (v2.0, up from
                                   v1.0). Your current experience contains customizations. Review the
                                   changes and choose whether to update your experience."
   FR-24 — the client's edit       "Securities Operations — Acme" — survived, on baseline v1.0
```

The shipped standard is back at **v1.0** in the repository: step 4 bumped it locally, and committing a
v2.0 whose release notes described content the file does not contain would be a fabrication somebody
would demo. To reproduce it, edit `standard.version` in
`apps/viewer/public/definitions/securities-operations.experience.json` and restart the API.

---

## 9. What is not built

| | |
|---|---|
| **§16.4 Compare** — P1 | The diff classified into the nine categories the PRD names. `detectDrift` in `catalog-ingest` is the precedent for the shape of the answer: it diffs a re-scan against a promoted baseline and reports what changed and what it breaks |
| **§16.5 Sync / revert** — P1 | Sync all, keep client, revert to standard, preview before sync. Needs the comparison first |
| **Selective synchronisation** — future | §16.5 defers it explicitly: adopt the new AI Search, keep custom columns. The design constraint it implies is that a comparison must be *per change*, not a single blob, which is why §16.4 is worth building carefully |
| **§16.6 Version history as a surface** | The data is all there — two version lines, the append-only version files, `syncedFromVersion` — and nothing renders it |
| **A standard per screen** | The unit of the standard here is the **experience**, because that is the unit of publication in this model and a variant that forked one page out of a journey would break the drill-downs into it. §5.1 names thirty *screens*, so aligning the two means splitting the shipped library into single-page experiences with cross-experience drill-down. Recorded in `PRD-TRACEABILITY.md` as part of the library work |

---

## 10. Environment

| | |
|---|---|
| `OPUS_SEED_DIR` | Where shipped experiences are read from. A release *is* a change to this directory, so pointing the process elsewhere is how a deployment stages one |
| `OPUS_DATA_DIR` | Where the store writes |

Both resolved per call, so a running process honours them.
