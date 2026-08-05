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
| EDM business templates | Four templates over governed EDM metadata — master dashboard, security overview, party overview, exception workspace — with drill-down between them and tabs generated from data — [`docs/EDM-TEMPLATES.md`](./docs/EDM-TEMPLATES.md) |
| Metadata model | Sixteen JSON Schemas, expression grammar, worked examples — [`schemas/README.md`](./schemas/README.md) |

Deliberately **not** built yet: a real LLM behind the provider port, the evaluation harness, a
Definition *Service* rather than browser-local drafts, a catalog *service* rather than a static
artifact, publishing and promotion, and the real Data Gateway. The
roadmap built the deterministic renderer first so generation aims at a target already proven to
render — see [`architecture/architecture-review.md`](./architecture/architecture-review.md) §R2.

## Run it

```bash
npm install
npm start        # Viewer  → http://localhost:4200
npm run studio   # Builder → http://localhost:4300
npm run verify   # validate metadata, run tests, build both apps
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
| [`schemas/`](./schemas/) | The core metadata model — ten models as JSON Schemas, the expression grammar, worked examples |
| [`docs/`](./docs/) | Product vision documents, personas, journeys, requirements, and the implementation records |
| `apps/viewer/` | Runtime shell, the AI generation panel, and the page definitions, fixtures and catalog both apps serve |
| `apps/studio/` | The visual builder — a second app sharing one renderer |
| `libs/` | Layered libraries: contracts, platform, design system, components, registry, renderer, data client, validator, catalog, generation, studio-core, studio-ui |
| `tools/` | Metadata validation gate |

Start with [`architecture/system-overview.md`](./architecture/system-overview.md).

For what was built, what deviated from the design, and what was deliberately left out, read
[`docs/M1-IMPLEMENTATION.md`](./docs/M1-IMPLEMENTATION.md),
[`docs/AI-GENERATION-WORKFLOW.md`](./docs/AI-GENERATION-WORKFLOW.md),
[`docs/VISUAL-BUILDER.md`](./docs/VISUAL-BUILDER.md) and
[`docs/EDM-TEMPLATES.md`](./docs/EDM-TEMPLATES.md). Each records the defects its milestone
surfaced that document review had not — which is the argument for building the milestones rather
than only specifying them.
