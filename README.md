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

**And the builder shows the whole page, not only the canvas.** A shipped page carries eight data
sources and fourteen actions; the canvas can show neither. The body is now split into aspects the way
every Opus EDM console editor is — **Design · Data · Actions · Page · JSON · History** — so a source's
filter, its aliases and *which widgets read it* are one click away, and so is what dispatches each
action. Two badges are warnings rather than counts: a source nothing reads costs a query and shows
nothing, and an action nothing can reach ships and never runs. That pair found three real defects in
pages that had already shipped — [`docs/PAGE-BUILDER.md`](./docs/PAGE-BUILDER.md).

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
| Page builder aspects | The MDE editor structure: a page's data sources, actions and declarations as tabs beside the canvas, with the reverse indexes only the builder can compute — [`docs/PAGE-BUILDER.md`](./docs/PAGE-BUILDER.md) |
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

> Node 20.19+ or 22+ (Angular 21). A plain `git clone` of `main` is runnable — architecture, schemas,
> docs and code are all there. On PowerShell, set environment variables as
> `$env:PORT="4100"; npm run api`.

```bash
npm install

npm run dev      # Experience Builder: API on :4000 + app on :4400   ← start here
npm run api      # backend only   → http://localhost:4000/api/health
npm run app      # front end only → http://localhost:4400

npm start        # Viewer (M1 runtime)  → http://localhost:4200
npm run studio   # Visual builder       → http://localhost:4300
npm run verify   # validate metadata, run tests, build all three apps
```

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

## Repository map

| Path | Contents |
|---|---|
| [`architecture/`](./architecture/) | Target architecture: frontend, backend, AI, runtime, security, plus the pre-implementation review and roadmap |
| [`architecture/runtime/`](./architecture/runtime/) | The core runtime specification: object model, the seven answers, sequence diagrams, degradation contract |
| [`schemas/`](./schemas/) | The core metadata model — ten models as JSON Schemas, three proposed runtime-core models, the expression grammar, worked examples |
| [`docs/`](./docs/) | Product vision documents, personas, journeys, requirements, and the implementation records |
| `apps/experience-studio/` | The Experience Builder prototype — prompt, generate, preview, save, run |
| `apps/viewer/` | Runtime shell, the AI generation panel, and the page definitions, fixtures and catalog all apps serve |
| `apps/studio/` | The visual builder — a second app sharing one renderer |
| `server/` | Node + Express backend: catalog, definition store, model seam, data gateway |
| `libs/` | Layered libraries: contracts, platform, design system, components, registry, renderer, data client, validator, catalog, generation, studio-core, studio-ui, plus the prototype's experience-model, page-renderer, component-library, ai-service and metadata-service |
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
