# Opus Experience Studio

AI-native experience platform for Opus EDM.

Opus Experience Studio enables business users to create enterprise applications, dashboards,
workflows and data experiences using natural language, visual design, and reusable components.

## Vision

Transform enterprise application creation from weeks of technical configuration into minutes
using AI-assisted design. See [`PRODUCT_VISION.md`](./PRODUCT_VISION.md).

## Current state

**A page is JSON, and the runtime is an interpreter.** There is no dashboard markup anywhere in
the application — the Security Master Operations dashboard is a validated page definition under
`apps/viewer/public/definitions/`, and editing that file changes the dashboard without touching a
line of Angular.

**And that JSON can be edited by hand, visually.** `npm run studio` opens a builder whose model
*is* the page definition: every drag and every property change is a JSON Patch against the artifact
the runtime loads, undo is the inverse patch, and the canvas is the production renderer. A page
built there, saved, and handed to the Viewer renders identically — because there is only one model.
The builder wears the **Opus EDM console's chrome** — a hover-expanding icon rail, a searchable page
list, version and lifecycle pills, a zoomable canvas — because the analyst authoring an experience
administers the EDM it reads from, and one product should look like one product.

**And the builder can tell you what the page is missing.** The ★ in the title row asks, and answers
from the catalog the author is entitled to: a measure nothing on the page reads, a groupable date that
would turn a figure into a trend, a widget still called "KPI Card". Each row carries the fact it rests
on, and accepting one is a single patch tagged `origin: 'ai'` that one undo reverses —
[`docs/AI-ASSIST.md`](./docs/AI-ASSIST.md).

**And the JSON describes real EDM work.** Four business templates ship as definitions: a Security
Master Dashboard, a Security Overview comparing every vendor's contribution against the golden copy,
a Party Overview with LEI standing and group hierarchy, and an Exception Management workspace. They
drill into one another through the catalog's entities rather than hard-coded links, and their tabs
are generated from data — one tab per contributing vendor, per issued instrument, per failing rule.

**And that JSON can be written from a sentence.** In **Create with AI**, typing

> *"Create a Security Master dashboard showing today's processing status, failed files, late
> files, new securities, and exceptions."*

produces a validated seven-widget draft in about 420 ms — grounded in a governed catalog, scoped
to the author's entitlements, and rendered by the same engine that serves the hand-authored page.
The panel shows every stage: what the request was understood to mean, what the catalog offered
and what it withheld, the exact context a model would receive, the decisions returned, the
validation verdict, and the assembled JSON.

Delivered:

| | |
|---|---|
| Experience runtime | Shell, page compiler, component framework, JSON loader, five components — [`docs/M1-IMPLEMENTATION.md`](./docs/M1-IMPLEMENTATION.md) |
| AI page generation | Intent → grounded retrieval → template → plan → validated page JSON → render — [`docs/AI-GENERATION-WORKFLOW.md`](./docs/AI-GENERATION-WORKFLOW.md) |
| Visual page builder | Drag, drop, inspect, re-layout, preview responsively, save — editing the *same* JSON the runtime interprets — [`docs/VISUAL-BUILDER.md`](./docs/VISUAL-BUILDER.md) |
| Experience Builder prototype | Prompt → Experience JSON → rendered page, with a Node/REST backend, local JSON storage and a swappable model provider — [`docs/implementation-status.md`](./docs/implementation-status.md) |
| EDM business templates | Four templates over governed EDM metadata — master dashboard, security overview, party overview, exception workspace — with drill-down between them and tabs generated from data — [`docs/EDM-TEMPLATES.md`](./docs/EDM-TEMPLATES.md) |
| EDM Page Builder | The console's low-code studio recreated natively — palette, 12-column drag-and-resize canvas, multi-page with derived links — [`docs/EDM-PAGE-BUILDER.md`](./docs/EDM-PAGE-BUILDER.md) |
| EDM Administration | The Opus EDM console's home screen recreated natively in the builder's rail — so it themes, where a framed copy could not — [`docs/EDM-ADMINISTRATION.md`](./docs/EDM-ADMINISTRATION.md) |
| AI assist in the builder | Ask what a page is missing; suggestions grounded in the entitled catalog, each accepted one as a single undoable patch — [`docs/AI-ASSIST.md`](./docs/AI-ASSIST.md) |
| CODA design language | The Opus EDM console's look and feel as a token layer plus shared chrome — one palette swap re-themes every app, every widget and every generated page — [`docs/CODA-DESIGN-SYSTEM.md`](./docs/CODA-DESIGN-SYSTEM.md) |
| Metadata model | Twenty JSON Schemas, expression grammar, worked examples — [`schemas/README.md`](./schemas/README.md) |

**And it runs as an application.** `npm run dev` starts an Express backend (`:4000`) and an Angular
Material front end (`:4400`): type a prompt, watch eight pipeline stages report themselves, read the generated JSON,
see it rendered by the production renderer, save it, and open it at `/x/<experience>`. The model call
goes through `POST /api/ai/generate` — the one seam a real LLM plugs into — and the Data Gateway now
runs **server-side**, so entitlements are enforced somewhere other than the tab asking the question.
See [`docs/implementation-status.md`](./docs/implementation-status.md).

**And the runtime it all rests on is specified, not implied.**
[`architecture/runtime/`](./architecture/runtime/) is the core runtime specification: what an
Experience, a Page, a Component and a Data Source *are*, how a page renders, how a generated page is
represented, and how pages evolve without breaking. It answers those questions in a way that makes
dashboards, search experiences, workflow applications and future AI agents **the same runtime** —
adding two artifact types (an operation registry, an agent grant) and one request field (who is
acting), and no new execution path. It is a draft pending approval; nothing in it is implemented.

Deliberately **not** built yet: a real LLM behind the provider port, the evaluation harness, a
Definition *Service* rather than browser-local drafts, a catalog *service* rather than a static
artifact, publishing and promotion, write-back, agents, and the real Data Gateway. The
roadmap built the deterministic renderer first so generation aims at a target already proven to
render — see [`architecture/architecture-review.md`](./architecture/architecture-review.md) §R2.

## Run it

> Node `^20.19.0 || ^22.12.0 || >=24.0.0` — declared in `engines`, so npm warns rather than letting
> Angular's tooling fail later with a message about something else. A plain `git clone` of `main` is runnable — architecture, schemas,
> docs and code are all there. On PowerShell, set environment variables as
> `$env:PORT="4100"; npm run api`.
>
> **Use `npm ci`, not `npm install`.** `npm ci` deletes `node_modules` and installs exactly the committed
> lockfile; `npm install` can leave a tree half-updated, and the symptom is a version error that reads as
> a repository problem: *"@angular/build supports Angular versions ^20.0.0, but detected 21.2.19"*.
>
> If you see that — or anything else that looks like the setup rather than the code — run
> **`npm run doctor`**. It checks the handful of things that actually go wrong and answers each with the
> fix rather than the symptom.
>
> **On Windows**, run each command on its own line: PowerShell 5.1 does not accept `&&`. Stop any running
> dev server before `npm ci`, because a file held open by `ng serve` makes the reinstall fail partway —
> which is how a half-updated tree happens in the first place.
>
> **Do not delete `package-lock.json`.** It is committed because it pins the exact tree, and deleting it
> is what turns a recoverable stale `node_modules` into a genuinely different set of versions: the next
> `npm install` re-resolves everything from scratch. `npm ci` also cannot run without it. If it has
> already gone: `git restore package-lock.json`, then `npm ci`.

```bash
npm ci           # not `npm install` — see below

npm run doctor   # check Node, dependency agreement, ports, API and sandbox
npm run dev      # Experience Builder: API on :4000 + app on :4400   ← start here
npm run api      # backend only   → http://localhost:4000/api/health
npm run app      # front end only → http://localhost:4400

npm start        # Viewer (M1 runtime)  → http://localhost:4200
npm run studio   # Visual builder       → http://localhost:4300
npm run verify   # typecheck, validate metadata, run tests, build all three apps
```

### Scanning a real database

The Studio can register a SQL Server, scan it, and publish its schema as a governed catalog. Two
commands stand the whole thing up, the first of which needs Docker:

```bash
npm run edm:up   # SQL Server 2022 + the Opus EDM schema + 3.7M rows   (~2 min first time)
npm run demo     # API on :4000 + Studio on :4300, with the secret in the environment
```

Then **Catalog → Sources → Register a source**, using the values `npm run demo` prints, and
**Test the connection → Scan → Publish**. `npm run edm:down` removes the container.

`npm run studio` on its own has no API behind it, so Sources says so and — in a development build only —
reads a built-in schema instead. A production build never substitutes one: it reports why the catalog
service is unreachable and offers no scan.

Deploying the built Studio needs `/api` reverse-proxied to the API, or a runtime base URL:

```html
<script>window.OPUS_CONFIG = { apiBaseUrl: 'https://edm-studio-api.internal/api' };</script>
```

See [docs/CATALOG-INGESTION.md](docs/CATALOG-INGESTION.md).

Useful URL switches, which make the architecture's claims checkable in the running app:

| Parameter | Effect |
|---|---|
| `?mode=studio` | Open the AI generation panel |
| `?persona=analyst\|steward\|restricted` | Change simulated identity and data entitlements |
| `?simulate=denied\|error\|empty\|slow` | Force gateway outcomes, exercising the six widget states |
| `?page=security-master-dashboard\|security-overview\|party-overview\|exception-management` | Open one of the EDM business templates (the detail pages take `&security-id=` / `&party-id=`) |
| `?page=processing-detail` | Open a specific page of the experience |
| `?theme=dark\|light` | Override the theme |

The **Runtime** panel in the sidebar reports compile time and cache hits, first-batch latency,
per-widget states, the query log, and which validation levels ran — and which did not.

### Angular version

On **21.2.19** — the newest 21.x, carrying npm's `v21-lts` tag. Angular **22.1.1** is current.

Staying on 21 deliberately, for now. Angular 22 raises the Node floor to
`^22.22.3 || ^24.15.0 || >=26.0.0`, so moving is not a dependency bump — it is a Node upgrade on every
developer machine and build agent first, and the CLI refuses to run before it will even attempt the
migration. That is a piece of work with its own risk, and worth doing on its own rather than folded into
a feature branch. Being one major behind is the cheap time to move; two is not, so it should not drift.

## Repository map

| Path | Contents |
|---|---|
| [`architecture/`](./architecture/) | Target architecture: frontend, backend, AI, runtime, security, plus the pre-implementation review and roadmap |
| [`architecture/runtime/`](./architecture/runtime/) | The core runtime specification: object model, the seven answers, sequence diagrams, degradation contract |
| [`schemas/`](./schemas/) | The core metadata model — ten models as JSON Schemas, three proposed runtime-core models, the expression grammar, worked examples |
| [`docs/PRD.md`](./docs/PRD.md) | **The requirements of record** — the EDM Experience Framework & AI-Powered Page Builder PRD, FR-01…FR-26, extracted verbatim from `docs/source/`. Read §2 (Levels 1–2 are the priority), §16 (the Standard ↔ Client lifecycle) and §26 (this is not a page builder) first |
| [`docs/PRD-TRACEABILITY.md`](./docs/PRD-TRACEABILITY.md) | All 26 FRs reconciled against the code, priced against §30's P0/P1/P2 — read this before starting a feature. It also names the one thing that must be built first, and why |
| [`docs/CONVERSATIONAL-REFINEMENT.md`](./docs/CONVERSATIONAL-REFINEMENT.md) | PRD §10–§12: the nine refinement verbs, how "the pie chart" becomes a component id, and why a reference that does not discriminate produces a question |
| [`docs/STANDARD-LIFECYCLE.md`](./docs/STANDARD-LIFECYCLE.md) | PRD §16: product standards, client variants, the two version lines, and why a release provably cannot overwrite a client's customisation |
| [`docs/PARKED.md`](./docs/PARKED.md) | What the supersession set aside and why: the portfolio product layer, the Navigation Model, access tiers, and the EDM Page Builder's parallel page model. Nothing deleted; every item says what bringing it back takes |
| [`docs/superseded/`](./docs/superseded/) | The 57-FR Opus Experience Studio PRD and its reconciliation. Read it for evidence of what the code does; its requirement numbers are stale |
| [`docs/PRODUCT-REGISTRY.md`](./docs/PRODUCT-REGISTRY.md) | The Product Integration Contract: how EDM declares its domains, glossary, AI Context, actions, roles and standard pages. Its portfolio half is parked — see `PARKED.md` §1 |
| [`docs/`](./docs/) | Product vision documents, personas, journeys, and the implementation records |
| `apps/experience-studio/` | The Experience Builder prototype — prompt, generate, preview, save, run |
| `apps/viewer/` | Runtime shell, the AI generation panel, and the page definitions, fixtures and catalog all apps serve |
| `apps/studio/` | The visual builder — a second app sharing one renderer |
| `server/` | Node + Express backend: catalog, definition store, model seam, data gateway |
| `libs/` | Layered libraries: contracts, platform, design system, components, registry, renderer, data client, validator, catalog, generation, product-registry, studio-core, studio-ui, plus the prototype's experience-model, page-renderer, component-library, ai-service and metadata-service |
| `products/` | Product registrations — one JSON document per Opus product, read at runtime. Adding a product is a file here, not a code change |
| `tools/` | Metadata validation gate |

Start with [`architecture/system-overview.md`](./architecture/system-overview.md).

For what was built, what deviated from the design, and what was deliberately left out, read
[`docs/M1-IMPLEMENTATION.md`](./docs/M1-IMPLEMENTATION.md),
[`docs/AI-GENERATION-WORKFLOW.md`](./docs/AI-GENERATION-WORKFLOW.md),
[`docs/VISUAL-BUILDER.md`](./docs/VISUAL-BUILDER.md),
[`docs/EDM-TEMPLATES.md`](./docs/EDM-TEMPLATES.md) and
[`docs/implementation-status.md`](./docs/implementation-status.md). Each records the defects its milestone
surfaced that document review had not — which is the argument for building the milestones rather
than only specifying them.
