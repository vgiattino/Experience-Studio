# AI Generation Architecture

> **Superseded by [`ai-architecture.md`](./ai-architecture.md).**
>
> This document captured the original outline of the generation flow. It is retained
> for continuity; the detailed design now lives in `ai-architecture.md`, which covers
> prompt processing, metadata retrieval, context management, the two-stage generation
> flow, the validation cascade, and the evaluation harness.

## Goal

Allow users to describe business experiences using natural language and generate application definitions.

## Flow (original outline)

User Prompt

-> AI Orchestration Layer

-> Metadata Context Retrieval

-> Page Definition Generation

-> Validation

-> Preview

-> Publish

## AI Responsibilities

- Understand intent
- Recommend layouts
- Select components
- Generate bindings
- Create navigation
- Generate tests

## Where this outline was expanded

| Original step | Now specified in |
|---|---|
| AI Orchestration Layer | `ai-architecture.md` §2.1 intake and intent classification; `backend-architecture.md` §2.2 Generation Service |
| Metadata Context Retrieval | `ai-architecture.md` §3 — hybrid lexical/vector/graph retrieval, entitlement-scoped before ranking |
| Page Definition Generation | `ai-architecture.md` §5 — constrained output, plan-then-fill, patch-based refinement |
| Validation | `ai-architecture.md` §5.4 — eight-stage cascade, bounded repair, deterministic fallback |
| Preview | `runtime-architecture.md` §1 — preview uses the production renderer, no separate path |
| Publish | `security-architecture.md` §5 — lifecycle, tiered approval, promotion |
| Generate tests | Deferred. Not a v1 commitment; see `implementation-roadmap.md` |
