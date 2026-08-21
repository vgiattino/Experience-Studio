# Product Standard ↔ Client Experience

Status: **Lineage, deployment, update detection and the three-way comparison are built and reachable
from the library. Four of §16.3's five actions work. Synchronisation not yet.**
Requirements: [`PRD.md`](./PRD.md) §16 · §16.1 · §16.2 · §16.3 · §16.4 · §16.6 · §2 · §26, FR-01 · FR-19 · FR-20 · FR-21 · FR-22 · FR-24
Contract: `schemas/experience.schema.json` — `standard`, `derivedFrom`
Code: `libs/experience-model/src/lineage.ts`, `libs/experience-model/src/compare.ts`,
`server/store/experience-store.ts`, `server/routes.ts`,
`apps/experience-studio/src/app/library/library.component.ts`

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

### Keep My Version — §16.3, and the one field that must not move

Declining an update writes `derivedFrom.declinedVersion`, and `updateAvailableFor` then stays quiet
until the product ships something **newer than what was declined**. Compared with `>=` rather than
`===`, so a v1.5 arriving late out of a rollback is not news either. A decline is a decision about a
version, not a permanent opt-out — a client who never hears about a standard again is a client §29's
lifecycle has stopped applying to.

What it deliberately does **not** touch is `standardVersion`. Writing the declined version into the
baseline is the one-line implementation of "stop telling me", and it is a lie: the variant is still
derived from what it was derived from, and §16.4's comparison needs that baseline to say what changed.
So the decline is recorded *beside* the baseline, and the artifact answers both questions — "what am I
based on" and "what have I already said no to".

**Review Later** has no route, no field and no function. It records nothing, so the notification comes
back next time. That is exactly what a reader of §16.3's list would expect the difference between the
two buttons to be, and it is why both are offered.

### A write that records a decision must not move the version line

`saveLineage` exists because of a defect a live API found and no test had.

`customised` is `artifactVersion > 1` — the fork is version 1, so anything above it is a save somebody
made. Recording **Keep My Version** through `save()` bumped that counter. So declining an update on an
untouched variant took it to version 2, and the **next** notification then told its owner their
experience contained customizations they had never made. Reading one notification made the following
one untrue.

`saveTransition` already existed for the same reason on the lifecycle side, with the same first
justification: *"Approving something must not produce a new version of it."* `saveLineage` is its
sibling for the §16 relationship, and the general rule both express is worth stating once:

> A write that records a decision **about** an experience must not move the version line **of** that
> experience.

---

## 8. Compare — §16.4, FR-22

`GET /api/experiences/:id/compare-standard`

### It is a three-way comparison, and that is the whole design

§16.4's goal sentence is the specification:

> *"The goal is to clearly show **what the product changed** and **what the client changed**."*

A two-way diff of the variant against the new standard cannot answer that. Shown a column that is on the
standard and not on the variant, it has no way to tell *the product added it* from *the client removed
it* — and those call for opposite decisions. So the comparison takes three artifacts:

```
BASELINE   the standard version the variant was derived from   (derivedFrom.standardVersion)
   │  └────── product change ──→  STANDARD   what the product ships now
   └───────── client change  ──→  CLIENT     the variant as it stands
```

A subject **both** sides touched is a conflict, and it is the only kind of difference a synchronisation
cannot decide on its own.

### The baseline had been getting destroyed

`deployStandards` overwrote the standard in place. So a v2.0 release deleted the only artifact that makes
this function correct, and the platform could have diffed a variant against v2.0 forever without ever
being able to say which side of a difference each half came from.

It now archives the replaced standard as `versions/<id>.standard-v<version>.json`, keyed on the
**standard** version because that is the line that moved. `standardAtVersion` reads it back, and returns
`null` — never the currently-installed one — when the baseline genuinely is not there. A comparison with
a substituted baseline would look complete and attribute the product's changes to the client, in a screen
somebody acts on.

That is `baselineUnavailable`, and it is the refusal that will actually happen in a store created before
archival existed. It says what the reader can still do:

```
This experience is based on v1.0 of securities-operations, and that version is no longer in the
store — so which side of a difference each change came from cannot be established. Keeping your
version needs no comparison, and a comparison will be available for the next release.
```

### Per change, not one blob — because §16.5 says so

§16.5 defers *selective* synchronisation and gives the example: adopt the new AI Search, keep the custom
columns, adopt the new exception visualisation, keep the custom navigation. That is only ever buildable on
a comparison whose output is a list of **individually addressable** changes. So every difference carries a
stable `id`, keyed on its subject rather than its position — the same change has the same id whether it is
the third row or the eleventh — and nothing returns a diff of whole documents.

The comparison being per-change is not a nicety. It is the constraint that decides whether §16.5's future
half is reachable at all.

### §16.4's nine items are not nine categories

The ninth — "Client-specific customizations" — is not a *kind* of change like the other eight. It is a
*provenance*: every difference with `side: 'client'` is a client-specific customisation, whichever of the
eight kinds it is. As a tenth category it would double-count every client change, and a reader could not
tell whether twelve differences meant twelve or six. So: **eight categories, three sides**, and the ninth
item is the `side: 'client'` slice.

| §16.4 | Category | Read from |
|---|---|---|
| Added / removed capabilities | `capability-added`, `capability-removed` | components, and whole pages — a page is the largest capability an experience has |
| Changed layouts | `layout-changed` | the flattened widget **order**, not the container tree |
| New/removed columns | `columns-changed` | the column binding |
| Changed filters | `filters-changed` | the page's filter channels, and an `input.*` component's own config |
| Changed charts | `chart-changed` | the mark, and the encodings — what it plots is a bigger change than how it draws it |
| Changed navigation | `navigation-changed` | experience nav, drill-down targets, and a component's event actions |
| Changed business rules | `business-rules-changed` | actions (by **kind** as well as name), and `visible` conditions |
| Client-specific customizations | — | the `side: 'client'` slice of all of the above |

Two of those rows are decisions worth stating:

- **Layout is compared as the widget order**, and only among widgets present on both sides. A structural
  diff would report a panel gaining a `gap` as "the layout changed", and a comparison that says that for a
  spacing tweak is one whose layout rows get skipped. Excluding added and removed widgets matters too:
  inserting one shifts everything after it, so every added widget in every release would otherwise produce
  a spurious layout row alongside its real one.
- **An action is compared by kind as well as by name.** An action that kept its name and moved from
  `navigate` to `mutate` is the most consequential change in this list, and a name-only comparison misses
  exactly it.

### A rename has no slot in the eight, and is reported anyway

Found by running the comparison against the real shipped standard, not in a test: a client had retitled a
chart, the product had changed its mark, and only the product's half was reported. §16.4's list has no
"renamed" entry — so this is reported under `layout-changed`, which is a stretch, and the stretch is
recorded rather than hidden.

Leaving it out is worse by a distance. A synchronisation that adopted the product's version would silently
discard the client's own name for the widget, which is precisely the class of loss §16 exists to prevent.
It is evidence that §16.4's list is a reader's list rather than an exhaustive one.

### Grouped by side, because that is the requirement

One merged list of differences would satisfy the word "comparison" and none of §16.4's sentence. The
library renders three groups, and **conflicts lead** — they are the only rows where a synchronisation
cannot decide on its own, so sorting them in among the rest buries the one thing that needs a person.

---

## 9. The library is where a person meets all of this

`§2` names three levels of interaction — **Use**, **Configure**, **Create** — and says the initial
priority is the first two. The library is grouped by exactly that, because the group an experience is in
*is* the answer to "what may I do with this":

| Group | §2 | What the card offers |
|---|---|---|
| **Product standards** | Level 1 | Use · Customize (→ `POST /derive`) |
| **Your versions** | Level 2 | Open · the §16.3 notification, with lineage |
| **Created here** | Level 3 | Open · delete. No standard behind it, nothing to sync |

It used to be one flat list sorted by date, with the product's own shipped pages mixed in under an
`origin: 'seed'` chip. That is a *storage* view, and it is why FR-01 read as "files that happen to ship"
rather than a library: a chip says what an artifact **is** where the reader needs to know what they can
**do**.

The membership test is `derivedFrom`, not `origin`. `origin` says how the bytes arrived — `copy`, `ai`,
`human` — while `derivedFrom` says whether there is a standing relationship to a standard. A variant
somebody then refined conversationally has `origin: 'aiRefined'` and is still a variant.

### Four of §16.3's five actions work, and the fifth is named

| Action | |
|---|---|
| **Preview New Version** | Opens the standard itself, which is what "the new version" is |
| **Keep My Version** | Records the decline. The version is sent from the client, not inferred, so what is recorded is what was on the screen when the person decided |
| **Review Later** | Hides the notice for this visit and records nothing |
| **Compare Changes** | §16.4's three-way comparison, grouped by side, expanding the card to the full row — a comparison is a list of rows, not a card-sized thing |
| **Sync with Standard** | §16.5. Named in a sentence rather than rendered disabled |

A disabled control teaches the reader the feature is broken; a sentence teaches them it is next.

### And "up to date" is not said when it is not true

`GET /standard-update` returns `{ update: null }` for two different states: nothing newer exists, and
something newer exists and was declined. A variant holding at v1.0 having declined v2.0 is **not** up to
date — it is holding, on purpose. The card distinguishes them, because the alternative is the quiet kind
of untruth the rest of this document is about:

```
Holding at v1.0 — you declined v2.0. You will hear about the next release.
```

---

## 10. Verified

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

5. Keep My Version
   POST /decline-update {2.0}     derivedFrom.declinedVersion = "2.0", declinedBy, declinedAt
   standardVersion                still "1.0"        ← the baseline §16.4 needs
   artifactVersion                still 1            ← the property `saveLineage` exists for
   update available               null               (quiet)
   ship v3.0, restart
   update available               v3.0, customised=false   ← speaks again, and does NOT invent
                                                            customizations the owner never made

6. The refusals
   decline v0.9 (not newer)       409  notAnUpdate
   decline on the standard        409  notDerived
   decline with no version        400  versionRequired
   decline with body actorId      400  validation

7. §16.4, against a real v2.0 release of the shipped standard
   the release              a new ESG KPI, +currency on the recent-instruments grid, the coverage
                            chart to a line chart, a new "Escalate" action
   the client had already   removed the "sedol" column from the SAME grid, and retitled the chart
   baseline archived        versions/securities.operations.standard-v1.0.json
   GET /compare-standard    v1.0 → v2.0 · 3 from the product, 1 of yours, 1 conflict

     [both]     columns   Both the product and this experience changed “Recently added instruments”.
                          product: added “currency”      client: removed “sedol”
     [product]  rules     A new action, “Escalate”.
     [product]  added     A new kpi card, “ESG coverage”.
     [product]  chart     “Coverage by asset class and review state” is now a line chart, was a bar.
     [client]   layout    Renamed “Coverage by asset class and review state” to “Coverage — Acme view”.

   delete the archive       409  baselineUnavailable, shown in place on the card rather than in a toast

8. The library, in a browser (both themes, no console errors)
   Product standards              "Securities Operations · Standard v2.0 · release 2026.11 · 6 pages"
                                  → Use, Open your version
   Your versions                  "Securities Operations — Acme · Your v2 · draft"
                                  Standard / Based on v1.0 / Your version v2
                                  the §16.3 sentence, and Preview · Keep mine · Review later
   press Keep my version          "Your v2" unchanged, "Declined v2.0" appears
                                  "Holding at v1.0 — you declined v2.0. You will hear about the
                                   next release."
```

The shipped standard is back at **v1.0** in the repository: step 4 bumped it locally, and committing a
v2.0 whose release notes described content the file does not contain would be a fabrication somebody
would demo. To reproduce it, edit `standard.version` in
`apps/viewer/public/definitions/securities-operations.experience.json` and restart the API.

---

## 11. What is not built

| | |
|---|---|
| **§16.5 Sync / revert** — P1 | Sync all, keep client, revert to standard, preview before sync. The comparison it needs now exists, and every difference in it is addressable |
| **Selective synchronisation** — future | §16.5 defers it explicitly: adopt the new AI Search, keep custom columns. Its one hard prerequisite — a per-change comparison rather than a blob — is met |
| **Comparing a page a client ADDED** | The comparison walks pages present on both sides plus additions and removals. A page the *client* added is reported as a client-side capability, and its contents are not walked against anything, because there is nothing to walk it against |
| **Field-level column changes** | A column is compared on its `field`. A column that kept its field and changed its format, width or conditional formatting reads as unchanged. Deliberate for now: the alternative is a row per binding property, and §16.4 asks for "new/removed columns" |
| **§16.6 Version history as a surface** | The library card shows the two current version numbers and the declined one. The *history* — the append-only version files, `syncedFromVersion` — is all there and nothing renders it |
| **Undoing a decline** | §16.3 does not ask for it, and a decision with no way back is still a trap. The next release re-asks, so the trap is time-limited rather than permanent; clearing `declinedVersion` is one route away |
| **A standard per screen** | The unit of the standard here is the **experience**, because that is the unit of publication in this model and a variant that forked one page out of a journey would break the drill-downs into it. §5.1 names thirty *screens*, so aligning the two means splitting the shipped library into single-page experiences with cross-experience drill-down. Recorded in `PRD-TRACEABILITY.md` as part of the library work |

---

## 12. Environment

| | |
|---|---|
| `OPUS_SEED_DIR` | Where shipped experiences are read from. A release *is* a change to this directory, so pointing the process elsewhere is how a deployment stages one |
| `OPUS_DATA_DIR` | Where the store writes |

Both resolved per call, so a running process honours them.
