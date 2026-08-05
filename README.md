# Opus Experience Studio

AI-native experience platform for Opus EDM.

Opus Experience Studio enables business users to create enterprise applications, dashboards,
workflows and data experiences using natural language, visual design, and reusable components.

## Vision

Transform enterprise application creation from weeks of technical configuration into minutes
using AI-assisted design. See [`PRODUCT_VISION.md`](./PRODUCT_VISION.md).

## Current state

**Milestone 1 delivered: a working proof of concept of the experience runtime.**

A page is JSON, and the runtime is an interpreter. There is no dashboard markup anywhere in the
application — the sample Security Master Operations dashboard is a validated page definition
under `apps/viewer/public/definitions/`, and editing that file changes the dashboard without
touching a line of Angular.

Deliberately **not** built yet: AI generation, the visual builder, the semantic catalog service,
and the real Data Gateway. The roadmap builds the deterministic renderer first so that
generation later aims at a target already proven to render — see
[`architecture/architecture-review.md`](./architecture/architecture-review.md) §R2.

## Run it

```bash
npm install
npm start        # http://localhost:4200
npm run verify   # validate metadata, run tests, production build
```

Useful URL switches, which make the architecture's claims checkable in the running app:

| Parameter | Effect |
|---|---|
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
| [`docs/`](./docs/) | Product vision documents, personas, journeys, requirements, and the M1 implementation record |
| `apps/viewer/` | Angular application shell and the runtime page definitions |
| `libs/` | Layered libraries: contracts, platform, design system, components, registry, renderer, data client, validator |
| `tools/` | Metadata validation gate |

Start with [`architecture/system-overview.md`](./architecture/system-overview.md).
For what M1 built, deviated on, and deliberately left out, read
[`docs/M1-IMPLEMENTATION.md`](./docs/M1-IMPLEMENTATION.md).
