# The Opus EDM console, side by side with the page builder

**What this is.** MDE's interactive prototype, vendored into `apps/studio` and reachable from the
navigation rail under **Reference → Opus EDM console**, so both products can be used in one running
application without switching between them.

`npm run studio` → port 4300 → hover the rail → **Opus EDM console**.

---

## 1. First: MDE has no page builder

This was asked for three times as "the Page Builder from MDE", so it is worth recording what is
actually there. Searched: all 23 Angular features, all 30 React prototype screens, the backend, the
docs, and a grep for screen/designer/layout/builder/widget across the repository.

There is no page builder. The nearest thing is revealing rather than close: MDE's Components Explorer
*does* list `UI Workflow → Page` with "Party Page" and "Pricing Page" under it — so the product
**models** pages as artifacts — and that tree node routes to a **stub**. No editor exists for them.

By closeness of purpose, MDE's three nearest editors are:

| Screen | What it actually edits |
|---|---|
| Data Generator | a data-entry function — attributes, fields, validation rules, filters, an inbox preview |
| Metadata Studio | entity attributes, mapping matrix, domains, lineage |
| Data Illustrator | a glossary mapping *illustrated names* to source columns — not layout at all |

So "bring the page builder over" cannot be done literally. What can be done — and what this is — is
put the whole console next to the page builder so the two can be compared directly.

## 2. What was vendored

| | |
|---|---|
| Source | `vgiattino/MDE` — `frontend/public/prototype/` |
| Commit | `fea361621ac6f3b72f2f0a3d25b72bba8625d9aa` |
| Landed at | `apps/studio/public/edm-console/` |
| Size | 5.7 MB — 4.2 MB of it vendored React 18.3.1 and Babel standalone 7.29.0 |
| Stack | React with **in-browser JSX compilation**, which is why the `.jsx` files ship as source |

**Two changes, both recorded in [`PROVENANCE.md`](../apps/studio/public/edm-console/PROVENANCE.md)
beside the code:** `index-local.html` became `index.html` (it loads React and Babel from the files
beside it, so the prototype needs no network), and the Google Fonts link was removed — a vendored
reference that only renders when the network is up is not much of a reference. **No `.jsx` file was
touched.**

## 3. Three decisions worth defending

**An iframe, which is normally the wrong answer.** The prototype ships a 122 KB stylesheet that sets
`--magenta`, `--ink` and `--bg` on `:root` and resets `body`. Rendered into the host document it would
fight the platform's tokens in *both* directions — its variables leaking into the builder's chrome, the
builder's reset breaking its layout. A same-origin iframe gives it its own document, its own CSS scope
and its own React root for the cost of one frame. It is also honest about what this is: another
application, shown next to ours.

Verified: with the host in dark theme, the frame's `body` stays `rgb(255,255,255)` and its `--magenta`
stays `#a11478`. Neither leaks.

**The session is seeded, using the prototype's own escape hatch.** Its root component reads
`opus.session.user` from localStorage and skips its email → login → first-run-setup wizard when it
finds one — the code comment says *"Skip directly to app if already authed via Angular"*, so that hatch
exists for exactly this embedding. There is no authentication here and nothing behind it: every screen
is seeded mock data, and writing those keys grants access to nothing.

**No bridge, in either direction.** No `postMessage`, no shared state, no navigation sync. A comparison
harness that started exchanging messages with the thing it compares becomes a dependency on another
product's internals — and at that point deleting it stops being free. Deleting it should stay free.

## 4. What it costs, stated plainly

- **5.7 MB copied into `dist/`.** `angular.json` has an `apps/studio/public` asset entry that copies it
  verbatim into every studio build. That one line is the whole removal.
- **A snapshot, not a dependency.** If the console moves on, this copy does not. It is pinned to a
  commit and says so on screen.
- **Nested chrome.** Experience Studio's topbar and rail wrap the console's own topbar and sidebar. That
  is inherent to showing two applications in one viewport, and the note bar above the frame explains
  what the viewer is looking at rather than pretending the nesting away.

If this ever heads for a real deployment, the question to settle first is whether a competitor-style
comparison harness belongs in a production bundle at all. It is a reviewing tool.

## 5. Verification

Driven in Chromium at 1680px and 430px, both themes:

| Check | Result |
|---|---|
| Rail | sections `Authoring` / `Reference`; items Pages · Add a widget · Page structure · **Opus EDM console** |
| Frame boots | `React` present, root mounted, stage `app` — not the login wizard |
| Its nav | Home · Components · Database · Console Grouping & Security · Models · Metadata Studio · Opus Marketplace · Workspace Activity · Releases · Test Center · Environments |
| Its screens work | Metadata Studio → *"Security Master — Logical model v2.3"*; Releases → 3 seeded releases with approvals and environment dots |
| Isolation | host dark, frame `body` still white, frame `--magenta` still `#a11478` |
| Switching back | workbench returns, **Exception Management still open, 15 widgets on canvas**, ★ panel intact, frame gone |
| 430px | 0px horizontal overflow |
| Console / network | no errors, no failed requests |

Gate: metadata validation passed, 289 unit tests passed, all three apps build.

## 6. How to remove it

Three deletions, no code changes elsewhere:

1. `apps/studio/public/edm-console/`
2. the `apps/studio/public` entry in `angular.json`
3. `apps/studio/src/app/edm-console.component.ts`, its import, and the `Reference` rail section in
   `apps/studio/src/app/app.ts`

Nothing in Experience Studio reads it, links into it, or depends on it — which was the point.
