# Vendored: the Opus EDM console prototype

**This directory is not Experience Studio code.** It is a verbatim copy of another product's
interactive prototype, included so the two can be compared side by side in one running application.

| | |
|---|---|
| Source | `vgiattino/MDE` — `frontend/public/prototype/` |
| Commit | `fea361621ac6f3b72f2f0a3d25b72bba8625d9aa` *(Match design navigation: condensed icon rail + Components Explorer)* |
| Copied | 2026-08-06 |
| Size | 5.7 MB, of which 4.2 MB is vendored React 18.3.1 + Babel standalone 7.29.0 |
| Stack | React with in-browser JSX compilation — no build step, which is why the `.jsx` files ship as-is |

## The two changes made to it

1. **`index-local.html` became `index.html`**, and the CDN-based `index.html` was deleted. The local
   variant loads React, ReactDOM and Babel from the files beside it, so the prototype runs with no
   network access. The `Opus EDM Prototype.html` stray copy was dropped for the same reason.
2. **The Google Fonts link was removed.** A vendored reference that needs the network to render is not
   much of a reference; Inter falls back to the local UI stack, which is what the prototype's own
   `--font` default resolves to anyway.

Nothing else is modified. No `.jsx` file was touched.

## How it is reached

`apps/studio` shows it in an iframe under **Reference → Opus EDM console** in the navigation rail. The
iframe is deliberate rather than convenient: the prototype ships a 122 KB stylesheet that sets global
`--magenta`, `--ink`, `--bg` variables and resets `body`. Rendered into the host document it would
fight the platform's own tokens in both directions. A same-origin iframe gives it its own document,
its own CSS scope and its own React root, and costs nothing but a frame.

## What it is not

- **Not a feature.** Nothing in Experience Studio reads it, links into it, or depends on it. Deleting
  this directory and the rail entry removes it completely.
- **Not authenticated.** The host seeds the prototype's own `opus.session.user` and
  `opus.setup.complete` keys so it opens on the console rather than its login wizard — using the escape
  hatch the prototype already provides for exactly this ("Skip directly to app if already authed via
  Angular"). There is no real identity here and no data behind it; every screen is seeded mock data.
- **Not a dependency to keep in sync.** It is a snapshot at one commit. If the console moves on, this
  copy does not.

## Before shipping this to anyone outside the team

Decide whether it should be here at all. 5.7 MB of another product's prototype in a production bundle
is a comparison harness that escaped, and `angular.json` copies it verbatim into `dist/`. The
`edm-console` asset entry is the one line to remove.
