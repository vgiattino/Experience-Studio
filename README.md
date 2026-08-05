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
| Metadata model | Sixteen JSON Schemas, expression grammar, worked examples — [`schemas/README.md`](./schemas/README.md) |

Deliberately **not** built yet: a real LLM behind the provider port, the evaluation harness, the
visual builder, a catalog *service* rather than a static artifact, and the real Data Gateway. The
roadmap built the deterministic renderer first so generation aims at a target already proven to
render — see [`architecture/architecture-review.md`](./architecture/architecture-review.md) §R2.

## Run it

```bash
npm install
npm start        # http://localhost:4200
npm run verify   # validate metadata, run tests, production build
```

Useful URL switches, which make the architecture's claims checkable in the running app:

| Parameter | Effect |
|---|---|
| `?mode=studio` | Open the AI generation panel |
| `?persona=analyst\|steward\|restricted` | Change simulated identity and data entitlements |
| `?simulate=denied\|error\|empty\|slow` | Force gateway outcomes, exercising the six widget states |
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
| `apps/viewer/` | Angular application shell, the AI generation panel, and the runtime page definitions and catalog |
| `libs/` | Layered libraries: contracts, platform, design system, components, registry, renderer, data client, validator, catalog, generation |
| `tools/` | Metadata validation gate |

Start with [`architecture/system-overview.md`](./architecture/system-overview.md).

For what was built, what deviated from the design, and what was deliberately left out, read
[`docs/M1-IMPLEMENTATION.md`](./docs/M1-IMPLEMENTATION.md) and
[`docs/AI-GENERATION-WORKFLOW.md`](./docs/AI-GENERATION-WORKFLOW.md). Both record the defects the
implementation surfaced that document review had not — which is the argument for building the
milestones rather than only specifying them.
