# EDM Administration — removed from the rail

> **Status: removed.** The screen was taken out of the navigation rail and its component deleted; the
> rail's Reference section now holds only the EDM Page Builder. Nothing referenced it, so leaving an
> unreachable 600-line component in the bundle would have been dead weight — it is in the history at
> `d32d4e7` if it is ever wanted back.
>
> The rest of this document is kept deliberately. Two things in it are still true and still useful: what
> the MDE repository actually contains (§1), and the design-system idioms the recreation added to
> `chrome.scss`, which the Page Builder and the Catalog browser both still use.

**What it was.** The Opus EDM console's Administration screen rebuilt as an Angular component in
Experience Studio's own design system — no iframe, no vendored React.

---

## 1. First, what MDE actually contains

This was asked for repeatedly as "the Page Builder from MDE", so it is worth recording: **there isn't
one.** Searched — all 23 Angular features, all 30 React prototype screens, the backend, the docs, and a
grep for screen/designer/layout/builder/widget across the repository.

The nearest thing is revealing rather than close. MDE's Components Explorer *does* list
`UI Workflow → Page` with "Party Page" and "Pricing Page" under it, so the product **models** pages as
artifacts — and that tree node routes to a **stub**. No editor was ever built for them.

So what came across is the console's own landing screen, which is what you see first and what makes the
two products comparable side by side.

## 2. Ported from

| | |
|---|---|
| Source | `vgiattino/MDE@fea3616` — `frontend/src/app/features/dashboard/` |
| Landed at | `apps/studio/src/app/edm/administration.component.ts` |
| Content | 8 task cards, 4 Open items with sort and progress, 7 Recent visited across 2 groups |

Ported from MDE's **Angular** version rather than its React prototype: same framework, so the port is a
translation of idiom rather than a rewrite, and the fidelity is checkable line by line.

## 3. Three things a recreation does that the frame could not

The previous attempt embedded MDE's prototype in an iframe. It worked, and it was replaced because
these three are only true natively:

**It themes.** The original hardcodes its icon tiles — `iconBg: '#eaf2fc'` with `iconFg: '#1968d3'`,
four pastel pairs repeated per card. That is fine in a product with one theme and a white smear on a
dark surface. Here the tiles are emphasis variants, so they keep the same four-way visual grouping and
survive the switch:

| Tone | Light | Dark |
|---|---|---|
| info | `rgb(230,240,247)` on `rgb(0,103,189)` | `rgba(0,103,189,.22)` on `rgb(108,182,236)` |
| accent | `rgb(252,234,236)` on `rgb(161,20,120)` | `rgba(161,20,120,.26)` on `rgb(217,76,167)` |
| positive | `rgb(220,252,231)` on `rgb(0,133,102)` | `rgba(0,133,102,.22)` on `rgb(74,222,128)` |
| neutral | `rgb(246,246,246)` on `rgb(102,102,102)` | `rgb(45,48,51)` on `rgb(154,160,166)` |

**It costs nothing.** The frame carried 5.7 MB of vendored React and Babel, copied verbatim into every
build. The studio bundle went from **7.7 MB to 2.0 MB** when it came out. This is one component plus
shared stylesheet rules.

**Its icons are names.** The original repeats an `ICON_PATHS` map and a `DomSanitizer` per feature —
the file this came from has three near-identical `getIcon` methods. Here an icon is a name in the
platform registry (`opus-icon`), which is what makes the card list *data* rather than markup, and lets
the same eight cards be filtered by entitlement or generated later.

## 4. Four deliberate departures from the original

Each is a case where copying faithfully would have produced something worse.

| Original | Here | Why |
|---|---|---|
| `kendo-dropdownlist` for the sort | a native `<select>` | The platform has no Kendo dependency and should not gain one for a sort control. A select is keyboard accessible and themes from the token set. |
| "oldest" = `[...items].reverse()` | sort on a real timestamp | Reversing is only equivalent while the seed data happens to be in date order, and `"10 Sep 2023 01:31 PM"` sorts lexicographically as if the 9th came after the 10th. |
| a `⋮` drag handle per row | omitted | Reordering a mock list persists nothing. A handle that looks draggable and does nothing is a worse recreation than one honestly absent. |
| cards navigate | cards *report* their destination | The destinations are console routes this application does not host. Saying "that opens `/metadata` in the EDM console" is the difference between a recreation and a fake. |

The progress bar also gained the `progressbar` role and its value, which the original renders as a
decorative div — and the ARIA is on the bar rather than the percentage pill, so a screen reader reads
"40%" once rather than twice.

## 5. What it is not

- **Not connected.** Nothing here reads or writes EDM. The seed data is the console's own, verbatim,
  and it is mock — Saul Goodman's SFTP configuration is not a real work item. The screen says so.
- **Not a feature of this product.** It is in its own `Reference` rail section rather than under
  Authoring, because it edits nothing in Experience Studio.
- **Not the whole console.** One screen of about thirty. The pattern is set up so a second is a
  component and a rail entry; §7 lists the obvious candidates.

## 6. Verification

Driven in Chromium at 1680px and 430px, both themes:

| Check | Result |
|---|---|
| No frame | `iframe` count on the page: **0** |
| Cards | all 8, tones `info · accent · positive · info · accent · positive · neutral · neutral` |
| Open items | 4 rows; progress bars report `aria-valuenow` 40 and 80 |
| Recent visited | 2 groups, 7 rows |
| Theme | tile contrast holds in both (table above); card surface `rgb(36,39,41)` on dark |
| Sort | `oldest` puts 09 Sep first — a real date sort, not a reversed array |
| Card click | *"That opens `/metadata` in the EDM console…"* |
| Builder untouched | Exception Management still open, 15 widgets, ★ intact |
| 430px | 0px horizontal overflow, cards collapse to one column |
| Console / network | no errors, no failed requests |
| Bundle | studio `dist` 7.7 MB → **2.0 MB** |

Gate: metadata validation passed, 289 unit tests passed, all three apps build.

## 7. What a follow-on should pick up

1. **Releases** is the next screen worth having — the other one already seen, and it exercises the
   status pill and environment-dot idioms the platform does not have yet.
2. **Metadata Studio** is the most interesting, because its aspect tabs (Attributes · Mapping Matrix ·
   Domains · Lineage) are the pattern the page builder briefly had and reverted, and seeing it on a
   screen that is *not* the page builder is a cheaper way to judge whether it belongs there.
3. **Decide whether any of this ships.** A recreation of another product's admin screen, with mock
   data, is a comparison surface. Removal is two deletions: `apps/studio/src/app/edm/` and the
   `Reference` rail section.
