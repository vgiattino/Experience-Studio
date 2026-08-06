# Catalog — the governed vocabulary, in the rail

**What this is.** The semantic catalog as a browsable surface, under **Data → Catalog**. What the
business has defined, what may be measured and how, what a page is allowed to do with each field — and
whose projection you are looking at.

`npm run studio` → port 4300 → hover the rail → **Catalog**.

Also in this change: the **EDM administration** rail item is gone.

---

## 1. Why the catalog earns a rail item

Every claim this product makes rests on the semantic catalog. Pages bind to it, generation is grounded
in it, the design review checks against it, and the Data Gateway enforces entitlements over it. It was
the one subsystem with no surface: an author could bind a widget to `late-file-count` from a dropdown
and had nowhere to go to ask *what that means*, what it may be aggregated by, or what else exists.

That question is not a developer's. **"What can I build a page about"** is the first thing a business
analyst asks, and the answer is this list.

It is a workspace, not a fourth panel of the workbench, because it is not something you *do* to the open
page — and its own rail section, **Data**, because it is neither authoring nor a recreation of another
product's screen. Switching to it leaves the builder untouched: the same page open, the same selection,
the same undo history.

## 2. What it shows

| | |
|---|---|
| **Entities** | a filterable list, each with the count that decides whether it can be charted at all |
| **Identity** | primary key, label attribute, effective dating, typical row count |
| **Cost** | its class, and a **needs a filter** chip where the gateway refuses an unfiltered query |
| **Measures** | every allowed aggregation with the **default marked**, `higher is better` / `lower is better`, threshold band count, and the catalog's own description |
| **Attributes** | data type, semantic type, unit, enum values, and **what a page may do**: group · filter · sort · search |
| **Sensitivity** | flagged only above the internal default, plus a `masked` chip where a masking policy applies |
| **Related** | the relationships out of this entity, with cardinality |

Two design decisions worth naming.

**"A page may group · filter · sort · search"** rather than four boolean columns. `groupable: false` is a
fact about metadata; "may be grouped" is the thing an author is looking for — and it is exactly what the
page builder's inspector offers, so the two screens agree in wording as well as in behaviour.

**The aggregations are shown as the chips the inspector uses**, with the default highlighted. An author
who reads `count · countDistinct` here and then opens the inspector's Aggregation picker sees the same
two options, because both come from the measure's own `allowedAggregations`.

## 3. What it is honest about

**This is your projection, not the catalog.** The Catalog Service *removes* entities and columns the
caller's capabilities do not cover — removes rather than blanks, because an attribute name is itself
sometimes a disclosure. So the header's counts are what you may see, and the panel says so before it
counts anything:

> This is **your** projection. Priya Raman holds 5 data capabilities — `edm.processing.read`,
> `edm.security.read`, `edm.dq.read`, `edm.dq.assignee.read`, `edm.party.read` — and entities or columns
> outside them are removed from the catalog you receive rather than shown greyed out.

A count without that caveat is a false statement about the business rather than a true one about the
caller.

**It shows no data.** Every figure a reader sees comes from the gateway at render time; the catalog holds
meaning. Sample values in a metadata browser would be the one place they could leak past the entitlement
checks that guard the query path.

## 4. EDM administration, removed

The rail's Reference section now holds only the EDM Page Builder. The component went with the menu item:
nothing referenced it, so an unreachable 600-line component in the bundle would have been dead weight.
It is in the history at `d32d4e7`.

`docs/EDM-ADMINISTRATION.md` is kept and marked removed, because two things in it are still true and
still useful — what the MDE repository actually contains, and the design-system idioms the recreation
contributed to `chrome.scss`, which the Page Builder and this browser both still use.

## 5. A shared-component defect this exposed

The entity list read **"F.. 4 measures"** instead of **"File Loads"**. `ListPanelComponent`'s row gave
the label `flex: 1` with a basis of `0`, making it the only shrinkable item — so a long hint crushed the
label to a single character. The label is what the row *is*; the hint is a detail about it, and a detail
that wins over the name is a detail in the wrong place.

Fixed in the shared chrome, so the workbench's own Pages panel benefits: the label keeps a 5rem floor and
truncates with an ellipsis, the hint gives way, and a truncated label now carries a `title` so hovering
recovers it.

## 6. Verification

Driven in Chromium at 1680px and 430px, both themes.

| Check | Result |
|---|---|
| Rail | `Pages · Add a widget · Page structure · Catalog · EDM Page Builder` — **EDM administration absent** |
| Header | `v10 · 5 entities · 12 measures · 58 attributes` |
| Scope note | names the 5 data capabilities and what happens outside them |
| Entity list | `Data Quality Exceptions 2 measures · File Loads 4 measures · Parties 1 measure · Securities 2 measures · Source Values 3 measures` — singular where it should be |
| Labels | no label crushed; every one carries a `title` |
| Securities | `needs a filter`, `medium cost`, 2.4M typical rows, bitemporal |
| Measures | `count` marked default beside `countDistinct`; `lower is better`; `3 bands`; the catalog's descriptions |
| Attributes | `enum · assetClass` with values `Equity · Bond · Fund · Derivative`; verbs per attribute |
| Related | `Issuer → parties.party many-to-one`, and two more, each spaced not run together |
| Filter | `sec` → 2 of 5 |
| Other workspaces | back to **Pages** finds `Exception Management` still open; **EDM Page Builder** still opens |
| 430px | 0px page overflow; the list stacks above the detail |
| Console | no errors |

Gate: metadata validation passed, 405 unit tests passed, all three apps build with no budget warnings.

## 7. Next

1. **Make it a starting point, not only a reference.** "Build a page about this" on an entity would hand
   the AI panel a pre-matched entity, which is the one thing it currently has to guess.
2. **Show where each concept is used.** The pages in this workspace that bind to a measure are knowable;
   an author about to ask their catalog owner to change one should be able to see what would break.
3. **Search across concepts, not just entity names.** The filter matches labels and hints; measures and
   attributes are the more common way in ("where is coverage defined?").
