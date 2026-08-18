<!--
  Extracted from docs/source/Opus_Experience_Studio_PRD_2.docx, which is the authoritative artifact.

  This markdown exists so the PRD is diffable, greppable, and reviewable in a pull request — a
  requirement nobody can `grep FR-34` for is a requirement that gets re-litigated from memory. When the
  .docx changes, re-extract rather than editing this file, so the two cannot drift.

  Reconciled against the code in docs/PRD-TRACEABILITY.md.
-->

Opus Experience Studio — PRD

| Field | Value |
|---|---|
| title | Opus Experience Studio — PRD |
| status | working (expanded from initial concept draft — under revision) |
| created | prior to 2026-08-12 (original concept draft) |
| updated | 2026-08-12 |
| expands | Opus-Experience-Studio-PRD.md (original concept draft, source of §1–2, personas, journeys A–C, EXP-001…015, MVP) |
| fr_count | 57 — numbered sequentially in document order |
| user_journeys | UJ-1…UJ-13 |
| author | [ASSUMPTION: doc owner not specified in source draft — confirm] |
| products | Opus EDM, Prime, Control, Pulse, and future Opus products (platform is product-agnostic) |
| scope | full Experience Studio capability — AI-assisted creation, template creation, visual page building, the Experience object model, the Product Experience Registry, System Pages/Journeys, the Experience Catalog, the component framework, lifecycle/governance/testing, and legacy Business Screen migration. Phasing beyond the MVP flagship (§22 of the source draft) is deliberately excluded — a separate later exercise. |
| parent_vision | [ASSUMPTION: relationship to a broader Gresham/Opus AI vision programme, if one exists, is unconfirmed — confirm] |

# Table of Contents

# 0. Document Purpose

This PRD expands an initial concept draft for Opus Experience Studio into a launch-grade build specification. It restates the original draft's vision, personas, and journeys in full traceable form, and adds the sections a build-ready PRD requires: a Glossary that anchors vocabulary used consistently throughout; Features regrouped into globally-numbered Functional Requirements (FR-1…FR-57); explicit Non-Goals; a consolidated Capability Scope; Success Metrics with counter-metrics; cross-cutting Non-Functional Requirements; Governance, Audit & Regulatory; Integration & Dependencies; Operational Requirements; Data Governance & Security; Why Now / Competitive Positioning; Risks & Mitigations; Open Questions; and an Assumptions Index.
The original draft is treated as the authoritative source of intent — its Executive Summary, Vision, Problem Statement, personas, journeys, Experience Model, Product Experience Registry, component framework, lifecycle, governance list, testing approach, migration options, requirements table (EXP-001…EXP-015), success metrics, and MVP definition are all carried forward and mapped into this structure rather than replaced. Every place where this expansion introduces a judgement call the source draft did not make explicit is tagged inline as [ASSUMPTION: …] and indexed in §16 for confirmation.
Phasing is deliberately out of scope of this document beyond the MVP flagship already defined in the source draft (§22, carried into this document's Capability Scope, §6). Which capability areas ship in which order after the MVP, and the deployment sequence across Opus EDM, Prime, Control, and Pulse, are a separate later exercise — consistent with the convention used for the Common Data Ingestion PRD, which this document's structure follows.
# 1. Vision

Opus Experience Studio is the AI-native experience platform for Opus, enabling business users to create, customize, and deploy enterprise applications over governed business data using natural language, visual design, and reusable components.
Today, building or changing the screens through which users interact with Opus data is a technical exercise. Standing up a dashboard, a search page, or an exception queue means understanding data structures, queries, relationships, component configuration, and application configuration — work that requires specialized configuration skills and can take weeks. A Business Analyst who knows exactly what outcome they want cannot independently build it; every change routes through a technical resource.
Experience Studio removes that dependency. A user describes what they want, starts from a template, or builds visually from scratch — all three paths produce the same underlying Experience Definition, so none of them is a second-class path. AI is embedded throughout: it recommends layouts, components, data bindings, and navigation as the user works, grounded in the product's own metadata, and explains its recommendations rather than emitting an opaque proposal.
The platform is shared across the Opus portfolio. Individual products (Opus EDM, Prime, Control, Pulse, and future products) contribute their own metadata, domain-specific components, system pages, journeys, templates, actions, and permissions through one common integration model — the engine is built once and product-agnostic, and each product's contribution is configuration, not a fork of the platform.
The objective is to change the unit of time for experience creation from weeks to minutes, without giving up the governance, versioning, and auditability an enterprise application needs.
Figure 1. System Architecture Overview — Studio Access Tiers, the Application Shell/Navigation Model, Experience Studio's core capabilities, the Product Experience Registry, and the products that register into it.
# 2. Target User

## 2.1 Jobs To Be Done

- When I need a dashboard, search page, or operational workspace, I want to describe it in plain language and get a working first draft — so I'm not blocked on a technical resource for something I can picture in my head.
- When I don't know exactly how to phrase what I want, I want to start from a template that already looks like what I need and adjust it — so I have a running start instead of a blank canvas.
- When I need precise control over layout, data bindings, or navigation, I want a visual builder with AI assistance available throughout — not just at the first prompt.
- When I connect a data source, I want the system to recommend how to present each piece of data based on what it actually is — so I'm not guessing which component fits which field.
- When I refine something AI generated, I want to say what I want changed in plain language and see it applied — so iteration doesn't mean re-learning a configuration UI.
- As a Product Owner, I want to define the pages, journeys, templates, and components my product ships with — so every customer starts from a sensible, on-brand baseline rather than a blank platform.
- As an Implementation Consultant, I want to extend a template or prototype a client-specific experience quickly — so client engagements aren't gated on engineering capacity.
- As a Developer, I want to be an extension point — building custom components, APIs, and advanced bindings only where the no-code/AI path genuinely can't reach — not a mandatory step for ordinary experiences.
- As anyone publishing an experience, I want versioning, approval, and rollback — so 'fast to build' doesn't mean 'ungoverned in production.'
- As a Product Owner or Studio administrator, I want to control who can publish System Pages that apply to every user, versus who can only build their own Experiences, versus who should only ever consume a deployed page — so Studio access itself is governed, not just what happens inside it.
- When I'm partway through building a page, I want to share it with a colleague and ask them to help finish it — so building isn't a solitary activity blocked on my own availability.
## 2.2 Non-Users / Boundaries

- End-user consumers of a published Experience — Not a Studio user in the sense of building anything — but now a formally modeled permission tier (Consumer, §4.12) rather than an unaddressed audience: they can open and use deployed Experiences via the Navigation Model (§4.10) but cannot open Experience Studio itself.
- Underlying data platform administration (Opus EDM/Prime/Control/Pulse core administration) — Experience Studio consumes each product's metadata and APIs; it does not administer the product's own data model, ingestion, or core configuration. [ASSUMPTION: the boundary with product-native admin consoles is not fully specified in the source draft — confirm per product.]
- Data quality / anomaly detection at ingestion — a distinct capability (e.g. Common Data Ingestion); Experience Studio can render CDI's Data Quality Scorecards as a component but does not compute them.
## 2.3 Key User Journeys

### UJ-1. Priya builds a dashboard in minutes with a prompt.

- Persona + context: Priya, a Business Analyst at an asset manager using Opus EDM, needs a Security Master Operations Dashboard.
- Entry state: Authenticated into Experience Studio; her role has Business Analyst permissions and read access to Security Master metadata.
- Path: Priya selects Build with AI and types: "Create a Security Master Operations Dashboard showing today's files processed, late files, failed files, exceptions, new securities, and data quality KPIs." The AI identifies the relevant product (Opus EDM), retrieves the applicable metadata, identifies entities and relationships, recommends a page structure, selects components (KPI tiles, an exceptions grid, a trend chart), creates the data bindings, generates the Experience, and presents a preview with a plain-language explanation of what it built and why.
- Climax: Priya has a working dashboard in minutes instead of submitting a ticket and waiting weeks.
- Resolution: Priya refines conversationally — "move the exceptions chart to the top," "add a filter for vendor" — and each change applies to the same Experience Definition without a mode switch. When satisfied, she sends it into the approval workflow.
- Edge case: If the AI cannot confidently identify an entity or relationship (e.g. an ambiguous metric name), it surfaces the ambiguity as a question rather than guessing silently. [ASSUMPTION: exact confidence threshold and escalation UX not specified in source draft.]
### UJ-2. Priya starts from a template instead of a blank prompt.

- Persona + context: Same Priya, a second time, building an Executive Dashboard for a stakeholder review.
- Entry state: Authenticated; the Experience Catalog is available with Enterprise, Product, Organization, Shared, and Recommended templates.
- Path: Priya opens the Experience Catalog, filters to Product templates for Opus EDM, and selects Executive Dashboard. The template opens pre-populated with sample layout and component choices; she swaps in her organization's actual metrics and re-themes it.
- Climax: Priya reaches a polished result faster than a from-scratch prompt because the template already encodes an executive-appropriate layout convention.
- Resolution: The customized Experience is saved as an Organization template so the next stakeholder-review request starts from her version, not the generic one.
### UJ-3. Raj builds precisely with the visual Page Builder, AI still assisting.

- Persona + context: Raj, an Implementation Consultant, needs an Experience neither a prompt nor a template quite matches — a client-specific Approval Workspace with a non-standard navigation flow.
- Entry state: Authenticated with Implementation Consultant permissions.
- Path: Raj selects Start from Scratch. The visual Page Builder opens with an empty canvas. He adds components, configures layout, connects a data source, and — as he connects it — the AI analyzes the metadata and recommends component types per field (e.g. a status field maps to a KPI/Status component, a related-party field maps to a Relationship Viewer). Raj accepts most recommendations and overrides two.
- Climax: Raj gets precise control where he needs it, and AI assistance everywhere else, without switching tools.
- Resolution: The finished Experience is saved to the client's Organization catalog and can be extended for future engagements.
### UJ-4. Dana defines a System Page and System Journey for her product.

- Persona + context: Dana, a Product Owner for Opus EDM.
- Entry state: Authenticated with Product Owner permissions in the Product Experience Registry.
- Path: Dana registers a Security Overview page as a System Page delivered with Opus EDM, and defines a System Journey: Security Search → Security Overview → Pricing → Related Parties → Overrides → Audit. She registers the underlying metadata, components, and actions Opus EDM contributes through the Product Integration Contract.
- Climax: Every Opus EDM customer now starts Experience Studio with a coherent, on-brand baseline instead of a blank platform.
- Resolution: Business Analysts at customer organizations can extend the System Journey without being able to break the underlying System Page's contract with Opus EDM.
### UJ-5. Priya's AI-generated Experience goes through governance before it reaches users.

- Persona + context: Priya again, publishing the dashboard from UJ-1.
- Entry state: Her draft Experience is complete and she requests publish.
- Path: The Experience Lifecycle routes her draft through Validate (structural and data-binding checks), Collaborate (a colleague reviews), Approve (a named approver signs off), and Publish. Version history and change audit are recorded automatically at each step.
- Climax: The dashboard is live for its intended audience, with a full record of who built it, who approved it, and when.
- Resolution: If a later metadata change breaks a binding, the platform's impact analysis flags the affected Experience before users notice.
### UJ-6. A metadata change triggers targeted retesting, not a full regression sweep.

- Persona + context: Dana, after Opus EDM ships a metadata change to the Security entity.
- Entry state: The change is deployed to Opus EDM's metadata layer.
- Path: Experience Studio determines which components, data sources, and dependent pages are impacted by the change, and which regression tests should execute. AI generates test cases for the affected Security Overview Experience on request ("Generate regression tests for this Security Overview experience").
- Climax: Only the genuinely affected Experiences are retested, not the entire catalog.
- Resolution: Passing Experiences are cleared automatically; failing ones are flagged to their owners with the specific broken binding identified.
### UJ-7. A legacy Business Screen is converted into an Experience Studio equivalent.

- Persona + context: Dana, planning the migration of an existing Business Screen.
- Entry state: A legacy Security Search Business Screen is in production and has not yet been migrated.
- Path: Dana requests an AI Conversion: the platform analyzes the legacy Business Screen's configuration and produces a candidate Experience Studio equivalent for her review, rather than a silent cutover.
- Climax: Dana reviews the generated equivalent side-by-side with the legacy screen and confirms parity before it replaces anything.
- Resolution: The legacy screen and its Experience Studio equivalent can run side-by-side (the Hybrid option, §19 of the source draft) until Dana is confident enough to retire the legacy page. [ASSUMPTION: which of the three migration strategies (Classic / AI Conversion / Hybrid) is the default path is left as a technical-validation decision by the source draft — see Open Questions.]
### UJ-8. A Developer extends the platform with a custom component.

- Persona + context: A Developer supporting Raj's client engagement, where no existing component fits a bespoke visualization the client requires.
- Entry state: Authenticated with Developer/technical-user permissions; the Component Framework's extension point is available.
- Path: The Developer builds a custom component against the platform's component API and registers it through the Product Integration Contract (or an organization-scoped equivalent) so it becomes selectable inside the Page Builder and available to the AI's recommendation engine.
- Climax: Raj can now use the custom component the same way he uses any built-in one — AI can recommend it where its declared metadata fit applies.
- Resolution: The custom component's governance (versioning, ownership, security) follows the same lifecycle as any other component (§17), so it doesn't become an ungoverned exception.
### UJ-9. Priya organizes her built pages and journeys into navigation for her team.

- Persona + context: Priya, a Business Analyst, has now built several Experiences and Pages (the Security Operations Dashboard from UJ-1, an Executive Dashboard from UJ-2, and a couple of drill-down targets) and needs her team to be able to find and move between them without her personally sending each link.
- Entry state: Authenticated with Business Analyst permissions; the Navigation Model editor is available for her Organization.
- Path: Priya opens the Navigation Model editor and sees her built Pages and Journeys listed as available items alongside the System Pages/Journeys her product (Opus EDM) already ships. She groups her dashboards under a new "Operations" menu group, adds the drill-down Journey as a nested item under the Page it starts from, sets the Security Operations Dashboard as the landing page for the Data Ops role, and reorders items so the most-used dashboard appears first. She asks the AI, "organize these into a navigation for my data-ops team," and it proposes the same grouping with a rationale, which she accepts with two manual tweaks.
- Climax: Priya's team now sees a coherent menu on login — her dashboards sit naturally alongside the product's own System Pages, not as a separate pile of links — without Priya writing any navigation configuration by hand.
- Resolution: The Navigation Model is versioned like an Experience; when Priya adds a new dashboard next month, she edits the same structure rather than starting over, and the change goes through the same Approve step before her team sees it.
- Edge case: If Priya tries to add a Page she does not have publish rights to (e.g. someone else's private draft) as a nav item, the platform blocks it until that Page is published/shared — navigation can only surface Pages a viewer is actually permitted to open.
### UJ-10. A Studio administrator sets the three access tiers for a new customer rollout.

- Persona + context: An administrator (role not named as a distinct persona in the source draft — treated here as an extension of the Product Owner / IT-admin function) provisioning Experience Studio for a new customer organization.
- Entry state: Authenticated with the highest available Studio administration permission for the organization.
- Path: The administrator assigns three tiers: a small number of named users get the System Page Builder permission (they can author and publish System Pages/Journeys that every user in the organization sees, mirroring FR-25/26 but exercised at the organization level rather than the product-owner level); a broader group of Business Analysts, Data Stewards, and Implementation Consultants get ordinary Studio Builder access (they can create, edit, and share their own Experiences, but cannot publish something that overrides the organization-wide baseline); and everyone else is left as Consumer-only, meaning they never see Experience Studio at all and only interact with whatever the Navigation Model (§4.10) surfaces to their role.
- Climax: On day one, the organization has a working three-tier structure instead of everyone defaulting to either full access or no access.
- Resolution: As trust grows, the administrator can promote a Studio Builder to System Page Builder for a specific area without re-provisioning the whole organization.
- Edge case: A Consumer-tier user who is mistakenly sent a direct link to a Studio editing surface is blocked at the permission check, not merely hidden by the UI — Consumer-only is enforced server-side, not just by omitting a menu entry.
### UJ-11. Raj shares a draft Experience and asks a colleague to help finish it.

- Persona + context: Raj, an Implementation Consultant, is partway through the client-specific Approval Workspace from UJ-3 and wants a colleague's help finishing the workflow configuration before the client deadline.
- Entry state: Raj has Studio Builder access and owns the draft Experience.
- Path: Raj shares the draft with his colleague by name, choosing a collaborator role of co-editor rather than viewer or commenter. His colleague receives a notification, opens the same draft, and continues configuring the workflow steps Raj hasn't gotten to yet. Both of their changes are visible in the Experience's change history with each person's name attached.
- Climax: The Experience gets finished in parallel instead of waiting on Raj alone, without either of them losing track of who changed what.
- Resolution: When the draft is ready, Raj — as owner — is still the one who moves it into Validate/Collaborate/Approve (§4.9); sharing a draft for co-editing does not by itself change who is accountable for publishing it.
- Edge case: If Raj shares the draft as commenter-only instead of co-editor, his colleague can leave notes on specific components but cannot change the configuration directly — the collaborator role determines what the share actually permits.
### UJ-12. Priya is proactively alerted to a critical performance issue and investigates immediately.

- Persona + context: Priya, weeks after publishing the Security Operations Dashboard from UJ-1, is going about her day — she hasn't opened Experience Analytics recently.
- Entry state: Priya owns the Experience; default Critical alerting thresholds are in effect (she never had to configure them).
- Path: The Exceptions grid's render time crosses the Critical threshold and stays there for a sustained window. Priya gets a proactive alert rather than finding out from a user complaint. The alert already tells her the Exceptions grid specifically is the cause, with the same component-level breakdown Experience Analytics computes, so she doesn't have to go digging to find it.
- Climax: Priya starts investigating within minutes of the problem becoming serious, instead of finding out days later when someone mentions the dashboard feels slow.
- Resolution: From the alert, she asks the AI to address the slow Exceptions grid directly; it proposes a pagination change, which she reviews and publishes through the normal Lifecycle. The alert condition clears once the fix is live, and she isn't re-alerted for the same resolved issue.
- Edge case: If Priya is only a co-editor rather than owner on a shared Experience, she can still view its Experience Analytics but cannot change any alerting/threshold configuration reserved for the owner (links FR-54).
### UJ-13. Priya reviews analytics on her own initiative to understand a usage plateau.

- Persona + context: Priya, separately from any alert, wants to understand why the same dashboard's adoption has plateaued rather than growing.
- Entry state: Priya owns the Experience; the Experience Analytics view is available from its Catalog entry.
- Path: Priya opens Experience Analytics and sees usage metrics (view count trending flat, most access coming through the Navigation Model rather than direct links) and which role is barely using the dashboard at all — no alert triggered this, she checked on her own initiative.
- Climax: Priya can see a specific under-served audience and a specific discoverability gap instead of guessing why adoption stalled.
- Resolution: She adjusts the Navigation Model (§4.10) to surface the dashboard more prominently for the under-served role, and continues monitoring usage metrics to see whether that changes the trend.
- Edge case: Proactive Critical alerting (FR-56) covers performance degradation; a quiet usage plateau like this one is not itself alert-worthy by default; it's found through voluntary review, not a push notification. [ASSUMPTION: whether a sustained usage decline should itself eventually trigger a proactive alert (beyond a spike/drop, per FR-55) is not decided — see Open Questions.]
# 3. Glossary

Downstream design, planning, and engineering artifacts should use these terms exactly. FRs and User Journeys use these terms verbatim.
- Experience — The core platform object. A dashboard, a Security Master application, an Exception Management application, and a workflow application are all Experiences. An Experience bundles Pages, Components, Data Sources, Data Bindings, Actions, Navigation, Theme, Security, Workflows, AI Context, Documentation, and Tests (§8).
- Experience Definition — The single underlying artifact produced regardless of creation path (Build with AI, Start from Template, Start from Scratch). All three paths converge on this one definition — there is no divergent 'AI-only' or 'template-only' format.
- Experience Studio — The AI-native, product-agnostic platform on which Experiences are created, customized, and deployed. The platform core is product-independent; products contribute domain content through the Product Integration Contract.
- Product Experience Registry — The mechanism by which Opus EDM, Prime, Control, Pulse, and future products each register their metadata, components, templates, System Pages, and System Journeys into Experience Studio (§9).
- Product Integration Contract — The defined set of things a product can register into the registry: Metadata (entities, attributes, relationships, APIs, business glossary, data sources), Components, Templates, System Pages, System Journeys, Actions, Security (roles/permissions), and AI Context (§10).
- System Page — A page a Product Owner defines and ships as part of a product (e.g. Security Overview, Party Overview, Price Overview, Security Search, Exception Management, File Processing for Opus EDM). System Pages give every customer a baseline without requiring them to build from nothing (§11).
- System Journey — A predefined business navigation flow a Product Owner defines across System Pages (e.g. Security Search → Security Overview → Pricing → Related Parties → Overrides → Audit). Provides a starting point while remaining extensible (§12).
- Experience Catalog — The central place to discover Experiences: AI-generated, system, product template, organization template, shared, and personal, each carrying name, description, owner, product, version, status, tags, dependencies, permissions, and last-updated metadata (§13).
- Template — A prebuilt Experience offered through the Catalog at Enterprise, Product, or Organization scope, intended to be customized rather than used verbatim.
- Component — A reusable building block placed on a page — grouped by the source draft into Layout, Data, Visualization, Forms, and Enterprise families (§14). Components can be platform-native or product-specific extensions.
- AI Context — Business terminology and domain-specific instructions a product registers so the AI's recommendations and natural-language understanding are grounded in that product's vocabulary, not generic terms (§10).
- Data Binding — The connection between a component and the underlying metadata/data source it renders or acts on. AI proposes bindings when a data source is connected; a human can accept, reject, or modify each one (§7).
- Build with AI — The creation path where a user describes an Experience in natural language and the AI generates a first draft end-to-end (intent → metadata retrieval → structure → components → bindings → generation → preview → explanation), refinable conversationally (§6, Journey A).
- Start from Template — The creation path where a user selects a Catalog template and customizes it (§6, Journey B).
- Start from Scratch — The creation path where a user builds visually in the Page Builder, with AI assistance available throughout rather than only at an initial prompt (§6, Journey C).
- Page Builder — The visual, drag-and-configure surface used in the Start from Scratch path, and available for editing Experiences created via any path.
- Experience Lifecycle — The stage sequence an Experience moves through: Create → Generate → Refine → Preview → Validate → Collaborate → Approve → Publish → Monitor → Improve (§16).
- Legacy Business Screen — An existing, pre-Experience-Studio page built with the current technical configuration capability. Migration into Experience Studio is addressed via three candidate strategies: Classic (remain supported as-is), AI Conversion (AI analyzes the legacy screen and produces an Experience Studio equivalent), and Hybrid (gradual, interoperable conversion) (§19).
- Time to Experience — The primary success metric: the elapsed time from intent (prompt, template selection, or blank canvas) to a usable, published Experience. Current baseline is weeks; target is minutes (§21).
- Impact Analysis — The platform's determination, when metadata or a data source changes, of which components, dependencies, and pages are affected and which regression tests should run (§18, §17).
- Recommended Experience — A template or existing Experience a Product Owner or the AI surfaces to a user as a good starting point for their apparent intent, distinct from a required System Page.
- Enterprise Component — A component family covering governed, cross-cutting business capabilities — Exception Queue, Approval, Workflow, Notifications, Audit, Data Quality — as opposed to generic layout/data/visualization/form components (§14).
- Navigation Model — The organizing structure — distinct from any single Experience's internal Navigation element (§8) — that assembles Pages and Journeys (System or custom-built) into the menu an end user sees on entry to a deployed Opus product. One Navigation Model exists per Organization/deployment and is edited, versioned, and published like an Experience (§4.11).
- Nav Item — A single entry in a Navigation Model referencing a Page, a Journey, or an external link, carrying a label, icon, and position.
- Menu Group — A labeled grouping of Nav Items within a Navigation Model (e.g. an "Operations" group containing several dashboards), used to organize a flat set of Pages/Journeys into a browsable hierarchy.
- Application Shell — The persistent chrome (top bar, side navigation, branding) that renders the active Navigation Model and stays constant as a user moves between Pages, Journeys, and Experiences within a deployment.
- Landing Page — The Page or Experience a Navigation Model designates as the default entry point for a given role, shown immediately after login before any menu selection.
- Role-Scoped Navigation — The principle that a Navigation Model's visible Nav Items are filtered per viewer according to the same Security/permissions model that governs the underlying Pages and Journeys (§10, §4.5) — navigation never exposes an item a viewer isn't otherwise permitted to open.
- Studio Access Tier — One of three levels of access to Experience Studio itself (distinct from permissions on any individual Experience): System Page Builder, Studio Builder, and Consumer (§4.12).
- System Page Builder — A Studio Access Tier permitted to author and publish System Pages/Journeys that apply organization- or product-wide to all users, not only to the author's own Experiences (§4.12, extends §4.6's Product-Owner-scoped System Page authoring to an organization-level permission).
- Studio Builder — A Studio Access Tier permitted to open Experience Studio and create, edit, and share Experiences via any creation path (§6), but without the System Page Builder permission to publish organization-wide baseline content.
- Consumer — A Studio Access Tier that never opens Experience Studio itself; a Consumer only interacts with deployed, published Experiences as surfaced by the Navigation Model (§4.10).
- Collaborator — A named user or group granted access to a specific Experience via Share (§4.12), with an assigned role — owner, co-editor, commenter, or viewer — that determines what they can do with it.
- Share — The act of granting a Collaborator role on a specific Experience to a named user or group, distinct from a Studio Access Tier (which governs platform-wide access) and from publishing an Experience to the Catalog or Navigation Model (which governs end-user consumption).
- Experience Analytics — Owner-facing usage and performance data reported per Experience/Page — distinct from NFR-8's platform-operations observability, which is aggregate and ops-facing rather than scoped to an individual owner (§4.13).
- Usage Metric — An Experience Analytics measure describing how a Page/Journey is accessed: view count, unique users, access frequency over time, and entry point (Navigation Model, direct link, drill-down) (§4.13).
- Performance Metric — An Experience Analytics measure describing how a Page/Journey performs at runtime: render time and its distribution, component-level load-time breakdown, and error/failure rate, checked against the NFR-11 target (§4.13).
- Critical Alert — The severity tier of proactive owner notification (§4.13, FR-56) triggered when a page's render time is materially beyond the NFR-11 target and sustained across a defined window — distinct from the lower Warning tier (FR-55), and delivered proactively (push/in-app/email) rather than requiring the owner to check Experience Analytics.
# 3.1 Problem Statement (carried from source draft)

Existing business experiences are generally created using technical configuration capabilities. Users may need to understand data structures, queries, data relationships, input/output variables, component configuration, page communication, navigation, technical metadata, and application configuration. This creates several compounding problems.
### Technical Dependency

Organizations require specialized technical resources to build and maintain business experiences — a Business Analyst cannot self-serve.
### Long Development Cycles

A page or application can take weeks to design, configure, test, and deploy.
### Limited Business Self-Service

Business Analysts understand the desired business outcome but often cannot independently build the experience that delivers it.
### Inconsistent User Experience

Different products and implementations provide different approaches to building and consuming business experiences, so the same organization sees inconsistent patterns across Opus products.
### Difficult Maintenance

Changes to metadata, data sources, or application configuration can require manual analysis and updates — there is no automated impact analysis.
### Limited Reusability

Experience components and patterns are not easily reused across products and implementations, so the same pattern gets rebuilt repeatedly.
# 4. Features

FRs are numbered sequentially in document order (FR-1…FR-57) for stable downstream reference. Section order follows the platform's own flow: creation paths (AI / template / builder) → the Experience object model → the product integration layer → product-owned baseline content → discovery → components/responsive design → lifecycle/governance/testing → business-user navigation → legacy migration → Studio access tiers and collaboration → owner-facing analytics.
## 4.1 AI-First Experience Creation (Build with AI)

Description: The AI-first path from the source draft's Journey A: a user describes an Experience in natural language and the AI produces a working first draft end-to-end, then continues to assist conversationally. Realizes UJ-1.
Figure 2. Build with AI, Start from Template, and Start from Scratch all converge on one Experience Definition.
### FR-1: Natural-language Experience generation end-to-end

A user can describe an Experience in natural language and receive a generated first draft without any manual configuration step.
Consequences (testable):
- The AI performs, in order: understand intent, identify the relevant product, retrieve metadata, identify entities and relationships, recommend page structure, select components, create data bindings, generate the Experience, present a preview, and explain what was created.
- The explanation is plain-language, not a raw log of the steps above — it should let a non-technical user judge whether the result matches intent.
- A generated Experience is a normal Experience Definition; it is not a distinct 'AI-only' object and is editable in the Page Builder like any other.
### FR-2: Conversational refinement

After initial generation, a user can request changes in natural language and see them applied to the same Experience Definition.
Consequences (testable):
- Supported refinement classes include, at minimum: repositioning a component ("move the exceptions chart to the top"), adding a filter ("add a filter for vendor"), adding a comparison ("compare today's results with yesterday"), and audience-appropriate re-styling ("make this suitable for an executive audience").
- Each refinement is applied incrementally; it does not require regenerating the whole Experience from the original prompt.
- A refinement the AI cannot safely interpret is surfaced as a clarifying question rather than applied as a best guess. [ASSUMPTION: no ambiguity-handling behaviour is specified in the source draft — confirm the UX for an unclear refinement request.]
### FR-3: Product identification from intent

The AI can identify which Opus product(s) a described Experience concerns from the prompt content, without the user naming the product explicitly.
Consequences (testable):
- Product identification determines which product's metadata, components, and AI Context are used to ground the generation.
- Where intent plausibly spans more than one product, the AI asks rather than silently picking one. [ASSUMPTION: cross-product Experiences (spanning e.g. EDM and Control in one view) are not addressed in the source draft — flagged for confirmation, §15.]
### FR-4: Metadata-grounded entity and relationship identification

The AI identifies the entities, attributes, and relationships relevant to the described intent from the identified product's registered metadata (§10), not from a generic or hallucinated schema.
Consequences (testable):
- Every entity/attribute the AI references in a generated Experience corresponds to a real registered metadata element.
- If the described intent references a concept with no corresponding metadata, the AI reports the gap rather than inventing a placeholder field.
### FR-5: Component and layout recommendation from data shape

The AI recommends page structure and component selection based on the shape and semantics of the identified data, not a fixed template.
Consequences (testable):
- Recommendation logic accounts for cardinality, data type, and semantic role (e.g. an identifier vs. a status vs. a numeric KPI) when proposing a component.
- Recommendations are explainable — the plain-language rationale (FR-1) covers why a given component was chosen for a given field.
### FR-6: Automatic data binding creation with human accept/reject/modify

The AI creates the data bindings for a generated Experience automatically, and every binding remains individually visible and editable.
Consequences (testable):
- A user can accept, reject, or modify each recommended binding (§7) without discarding the rest of the generated Experience.
- Rejected or modified bindings are recorded distinctly from AI-accepted ones for later audit (links FR-33).
### FR-7: Preview before any persistence to production

A generated or refined Experience is presented as a preview before it is published or otherwise exposed to its intended audience.
Consequences (testable):
- Preview reflects the actual generated Experience Definition, not a mock — what the user sees in preview is what publishes.
- No generation or refinement step writes directly to a published, user-facing state without passing through the Experience Lifecycle (§16, FR-33).
### FR-8: AI assistance embedded throughout the builder, not just at first prompt

AI recommendation (component, data binding, layout) is available continuously while a user works in the Page Builder, whichever creation path was used to start the Experience.
Consequences (testable):
- Connecting a new data source at any point — including inside a template-started or from-scratch Experience — triggers the same metadata-driven recommendation behaviour as the initial Build with AI path (§7 table, e.g. a connected Security Master surfaces Search/Header, Filter, KPI/Status, Grid, Relationship Viewer, Related Data Panel, and Exception Component recommendations by field).
- AI assistance is advisory everywhere outside the initial generation step — it never silently overrides a user's manual choice.
## 4.2 Template-Based Creation & the Experience Catalog

Description: The template path from the source draft's Journey B and the discovery mechanism from §13: users select from Enterprise, Product, Organization, Shared, or Recommended templates and customize. Realizes UJ-2.
### FR-9: Multi-scope template catalog

Experience Studio surfaces templates at Enterprise, Product, and Organization scope, alongside Shared experiences and Recommended templates, through the Experience Catalog.
Consequences (testable):
- Scope determines visibility and edit rights: Enterprise/Product templates are Product-Owner-governed; Organization templates are customer-governed; Shared experiences are explicitly shared by their owner.
- The example template set from the source draft (Operations Dashboard, Executive Dashboard, Search & Detail, Exception Management, Approval Workspace, Data Quality Dashboard, Master Data Overview) ships as an initial Enterprise/Product baseline. [ASSUMPTION: exact initial template set and which are Enterprise vs. per-product is not finalized in the source draft.]
### FR-10: Template customization produces a standard Experience Definition

Selecting and customizing a template produces the same Experience Definition object a Build with AI or Start from Scratch path would produce.
Consequences (testable):
- A customized template is fully editable in the Page Builder and remains eligible for AI-assisted refinement (FR-2, FR-8).
- Customizing a template does not mutate the source template; it creates a new Experience Definition tracked back to its origin template for lineage.
### FR-11: Save-as-template / promotion to catalog

A user can save a customized Experience as an Organization template (or, with appropriate permission, a Product/Enterprise template) so future work starts from it.
Consequences (testable):
- Promotion to Product/Enterprise scope requires Product Owner permission; promotion to Organization scope is available to any user with template-authoring rights for that organization.
- A promoted template retains ownership, version, and dependency metadata (§13) from the moment of promotion.
### FR-12: Catalog discovery and metadata

The Experience Catalog is the single place to find AI-generated, system, product template, organization template, shared, and personal Experiences, each with name, description, owner, product, version, status, tags, dependencies, permissions, and last-updated metadata.
Consequences (testable):
- Search and filtering across the catalog cover all listed metadata fields, at minimum name, description, product, tags, and status.
- Dependencies recorded per catalog entry feed the Impact Analysis capability (FR-34).
## 4.3 Visual Page Builder (Start from Scratch)

Description: The from-scratch path from the source draft's Journey C, with AI assistance available throughout (§7, FR-8). Realizes UJ-3.
### FR-13: Full manual authoring surface

The Page Builder supports adding components, configuring layouts, connecting data, creating bindings, adding actions, creating navigation, configuring filters, creating drill-downs, and configuring responsive behavior — with no step gated behind AI generation.
Consequences (testable):
- Every capability available via Build with AI or a template (components, bindings, navigation, actions) is also directly authorable by hand in the Page Builder.
- A user can complete an entire Experience from a blank canvas without invoking AI generation at all, while still receiving AI recommendations at each data-connection point (FR-8).
### FR-14: Drill-down and cross-page navigation authoring

A user can define drill-down behavior from one page/component to another (e.g. a Security Operations Dashboard drilling to a Security Overview page) within the Page Builder.
Consequences (testable):
- Drill-down targets can be System Pages, other Experiences in the same catalog, or pages within the same Experience.
- Drill-down configuration is part of the Experience Definition and is preserved through publish/version cycles (links FR-17).
### FR-15: Filter and interaction configuration

A user can configure filters and other cross-component interactions (e.g. selecting a row in one component updates another) without custom code.
Consequences (testable):
- Filter configuration is available both as a manual authoring step and as an AI-suggested addition during refinement (FR-2 example: "add a filter for vendor").
### FR-16: Responsive behavior configuration in the builder

A user can configure how a page and its components behave across breakpoints directly in the Page Builder, consistent with the platform-wide responsive requirement (§15, FR-31/32).
Consequences (testable):
- Default responsive behavior is sensible without configuration; explicit configuration overrides the default per component or per breakpoint.
## 4.4 The Experience Object Model

Description: The core platform object described in §8 of the source draft: an Experience bundles everything needed to define, secure, and evolve a business application, not just a single page's visual layout.
Figure 3. The Experience object model — everything a dashboard or a full application needs, bundled into one object type.
### FR-17: Unified Experience object across all creation paths and use cases

Every artifact the platform produces — a single dashboard, a multi-page Security Master application, an Exception Management application, a workflow application — is modeled as one Experience, bundling Pages, Components, Data Sources, Data Bindings, Actions, Navigation, Theme, Security, Workflows, AI Context, Documentation, and Tests.
Consequences (testable):
- A single-page dashboard and a multi-page application are the same object type at different scale, not different platform primitives.
- This allows the platform's lifecycle, governance, and testing capabilities (§16–18) to apply uniformly regardless of an Experience's size or complexity.
### FR-18: Per-Experience embedded security and workflow

Security and Workflows are first-class parts of the Experience Definition rather than external configuration bolted on after publish.
Consequences (testable):
- An Experience's Security element declares which roles/permissions (registered per product, §10) govern access to it and its actions.
- An Experience's Workflows element declares any embedded business-process steps (e.g. an approval workflow inside an Approval Workspace Experience) as part of the same definition that carries its pages and components.
### FR-19: Per-Experience AI Context, Documentation, and Tests

Each Experience carries its own AI Context (business terminology/instructions scoping AI behavior specifically for that Experience), Documentation, and Tests as first-class elements of the definition.
Consequences (testable):
- AI Context at the Experience level can specialize or extend the product-level AI Context registered under §10 without replacing it.
- Tests attached to an Experience are what Impact Analysis (FR-34) and AI-generated regression tests (FR-36) populate and execute against.
## 4.5 Product Experience Registry & Product Integration Contract

Description: The common integration model from §9–10 of the source draft, by which Opus EDM, Prime, Control, Pulse, and future products each contribute domain content while the platform core stays product-independent. Realizes UJ-4.
### FR-20: Product-agnostic platform core

The Experience Studio core — the object model, lifecycle, builder, catalog, and AI generation engine — is built once and contains no product-specific logic.
Consequences (testable):
- Adding a new product to the portfolio is a registration exercise through the Product Integration Contract, not a platform code change. [ASSUMPTION: mirrors the CDI PRD's 'build once, deploy as config' principle; the specific integration mechanism (API, manifest, package) is not specified in the source draft — confirm with architecture.]
- Product-specific behavior is expressed entirely through what a product registers (metadata, components, templates, System Pages/Journeys, actions, security, AI Context) — never through platform-core conditionals keyed on product identity.
### FR-21: Metadata registration

A product registers its entities, attributes, relationships, APIs, business glossary, and data sources into the registry so Experience Studio's generation, recommendation, and binding capabilities can operate against real product structure.
Consequences (testable):
- Registered metadata is what FR-4's entity/relationship identification and FR-5's component recommendation are grounded in.
- Metadata changes trigger the Impact Analysis capability against dependent Experiences (FR-34).
### FR-22: Component, template, and action registration

A product can register product-specific reusable components, prebuilt Templates, and product-specific Actions (operations) into the registry, extending the platform-native Component Framework (§14, FR-30) rather than replacing it.
Consequences (testable):
- A registered product-specific component is selectable in the Page Builder and eligible for AI recommendation the same way a platform-native component is (links FR-8, FR-30).
- Product-specific Actions are available to be wired into an Experience's navigation, drill-downs, and Workflows (FR-14, FR-18).
### FR-23: Security and AI Context registration

A product registers its own roles/permissions model and its AI Context (business terminology and domain-specific instructions) into the registry.
Consequences (testable):
- An Experience's Security element (FR-18) can only reference roles/permissions a product has actually registered — no ad hoc role invention at the Experience layer.
- AI Context registered per product grounds the AI's natural-language understanding in that product's actual vocabulary rather than generic terms (links FR-4).
### FR-24: Registry supports Pulse and future products without core change

The registry model extends to Pulse and to future Opus products on the same Product Integration Contract used by Opus EDM, Prime, and Control.
Consequences (testable):
- No product is treated as architecturally special in the registry design; Pulse's position in the source draft's diagram (as a peer under Control) is a deployment/organizational detail, not a different integration mechanism. [ASSUMPTION: Pulse's exact relationship to Control in the registry (peer vs. nested) is not fully specified in the source draft — confirm.]
## 4.6 System Pages & System Journeys

Description: Product-Owner-defined baseline content from §11–12 of the source draft, giving every customer a coherent starting point without requiring them to build from nothing. Realizes UJ-4.
### FR-25: System Page authoring by Product Owners

A Product Owner can define pages delivered as part of a product (e.g. Opus EDM's Security Overview, Party Overview, Price Overview, Security Search, Exception Management, File Processing) that become System Pages within Experience Studio.
Consequences (testable):
- A System Page is a normal Experience Definition scoped and governed at the product level; customers can extend it but cannot alter the product-owned baseline without an explicit override mechanism. [ASSUMPTION: exact override/extension permissions for a System Page are not specified in the source draft — confirm.]
### FR-26: System Journey authoring by Product Owners

A Product Owner can define predefined business navigation across System Pages (e.g. Security Search → Security Overview → Pricing → Related Parties → Overrides → Audit) as a System Journey.
Consequences (testable):
- A System Journey provides a default drill-down/navigation path (FR-14) that a customer can extend with additional pages without breaking the underlying System Page contract.
### FR-27: System content remains extensible, not fixed

System Pages and System Journeys are a starting point, not a ceiling — customers can build additional pages, journeys, and customizations around them using any creation path (§6).
Consequences (testable):
- A customer's extension of a System Journey is tracked as a distinct Experience/Organization-scope artifact, not a fork of the product-owned System Journey itself, preserving the Product Owner's ability to evolve the baseline independently.
## 4.7 The Experience Catalog (Discovery)

Description: Cross-referenced with §4.2 (template scope) — this group covers the catalog's role as the single discovery surface across every content type the platform produces, per §13 of the source draft.
### FR-28: Unified discovery across all Experience types

A user can discover AI-generated experiences, system experiences, product templates, organization templates, shared experiences, and personal experiences through one catalog surface.
Consequences (testable):
- No Experience type (regardless of creation path or scope) is invisible to catalog search/filter by default, subject to the permissions recorded on it (FR-12).
### FR-29: Dependency and version visibility drives safe reuse

Catalog entries expose version and dependency information prominently enough that a user reusing or extending an existing Experience can judge whether it is current and what it depends on.
Consequences (testable):
- A catalog entry flags when a newer version exists, and when its declared dependencies (a metadata entity, a component, another Experience) have changed since it was last validated (links FR-34).
## 4.8 Component Framework & Responsive Design

Description: The initial component library and responsive requirement from §14–15 of the source draft.
### FR-30: Platform-native component library across five families

The platform ships an initial component library covering Layout (Container, Row, Column, Section, Tabs, Drawer, Split Panel), Data (Grid, Tree, Search, Relationship Viewer, Timeline), Visualization (KPI, Big Number, Line/Bar/Pie/Area Chart, Heat Map, Gauge), Forms (Text, Dropdown, Lookup, Date, Checkbox, Toggle, Button), and Enterprise (Exception Queue, Approval, Workflow, Notifications, Audit, Data Quality) components.
Consequences (testable):
- Every component in this initial library is selectable manually in the Page Builder (FR-13) and eligible for AI recommendation (FR-5, FR-8).
- Enterprise-family components are the ones that carry governance-relevant behavior (approval, audit, data quality) and are therefore subject to the same lifecycle rigor as the Experience they sit in (§16–17).
### FR-31: Product-specific component extension without forking the framework

The Component Framework supports product-specific extensions registered through the Product Integration Contract (FR-22) without requiring changes to the platform-native library.
Consequences (testable):
- A product-specific component follows the same five-family classification (or an explicitly registered extension family) so it composes predictably with platform-native components in a single page.
### FR-32: Responsive support across devices and breakpoints

All Experiences support Desktop, Tablet, and Mobile targets, multiple screen resolutions, configurable breakpoints, and responsive component behavior; AI-generated layouts automatically optimize for the target device.
Consequences (testable):
- A generated Experience (FR-1) produces a responsive layout by default without a separate manual responsive-configuration pass.
- Manual responsive configuration (FR-16) can override the automatic default per component or breakpoint.
- [ASSUMPTION: minimum supported resolutions/breakpoints and native mobile app vs. responsive-web scope are not specified in the source draft — confirm, §15 Open Questions.]
## 4.9 Experience Lifecycle, Governance & Testing

Description: The lifecycle stages, enterprise governance list, and automated testing approach from §16–18 of the source draft. This is the load-bearing section that keeps 'minutes to build' from becoming 'ungoverned in production.' Realizes UJ-5, UJ-6.
Figure 4. The Experience Lifecycle, with Validate/Collaborate/Approve as the governance gate and Analytics feeding back into refinement.
### FR-33: Full lifecycle enforcement: Create → Generate → Refine → Preview → Validate → Collaborate → Approve → Publish → Monitor → Improve

Every Experience moves through the full lifecycle before reaching its intended audience, regardless of which creation path produced it.
Consequences (testable):
- Validate performs structural and data-binding checks (that referenced metadata/components/actions actually exist and are compatible) before an Experience can proceed to Collaborate.
- Approve requires a named human approver; the approval is recorded immutably with who/what/when (mirrors the accountability pattern in the CDI PRD's governance model).
- Publish is the only stage that exposes an Experience to its intended audience; nothing in Create/Generate/Refine/Preview is user-facing outside the builder/preview context (links FR-7).
### FR-34: Change impact analysis

When metadata, a data source, or a shared component changes, the platform determines which components changed, which data sources changed, which dependencies are impacted, which pages need testing, and which regression tests should execute.
Consequences (testable):
- Impact analysis output is scoped to genuinely affected Experiences — it does not default to flagging the entire catalog for review on every change.
- Impact analysis results feed both a human review queue and the automated regression-test selection in FR-36.
### FR-35: Versioning, publishing, promotion, and rollback

Enterprise governance capabilities include versioning, approval, publishing, promotion, rollback, audit, change history, ownership, permissions, dependency tracking, and impact analysis, as enumerated in the source draft's §17.
Consequences (testable):
- Every published Experience has a version history that can be rolled back to a prior version without manual reconstruction.
- Promotion (e.g. Organization template → shared, or draft → production) is a governed, logged transition, not a silent scope change.
- Ownership and permissions recorded per Experience (§13) are enforced at every lifecycle transition, not only at creation.
### FR-36: AI-generated regression tests

The AI can generate test cases for an Experience on request (e.g. "Generate regression tests for this Security Overview experience"), populating that Experience's Tests element (FR-19).
Consequences (testable):
- Generated tests are tied to the specific data bindings, components, and navigation actually present in the Experience, not generic smoke tests.
- Generated tests are what Impact Analysis (FR-34) selects for execution when a dependency changes.
### FR-37: Collaboration on Experiences before publish

The Collaborate lifecycle stage supports more than one person reviewing/contributing to an Experience before it is approved.
Consequences (testable):
- Named Collaborators and their roles (owner/co-editor/commenter/viewer) are defined in FR-49/50 (§4.12) — Collaborate is the lifecycle stage; Share is the mechanism that populates it with specific people.
- [ASSUMPTION: whether Collaborators can edit the same component simultaneously in real time, or must take turns, remains undecided — confirm with architecture, §15 Open Questions.]
## 4.10 Business User Navigation & Application Structure

Description: Not present in the source draft. §8's per-Experience Navigation element and §12's System Journeys cover navigation within one Experience and predefined product journeys respectively, but neither lets a business user assemble the Pages and Journeys they have built — across Experiences, and alongside System Pages/Journeys — into the overall menu structure end users see on login. This group closes that gap: a Navigation Model, separate from any single Experience, that a Business Analyst or Product Owner curates so their built content becomes a coherent end-user application rather than a set of unlinked pages. Realizes UJ-9.
### FR-38: Navigation Model as a first-class object, separate from any single Experience

A Navigation Model exists per Organization/deployment as its own governed object, distinct from the per-Experience Navigation element in FR-17's Experience object model, and can reference Pages and Journeys across multiple Experiences.
Consequences (testable):
- A Navigation Model is not owned by any one Experience — deleting or unpublishing a single Experience removes only its own Nav Items, not the Navigation Model itself.
- The Navigation Model follows the same lifecycle discipline as an Experience (Create → Validate → Collaborate → Approve → Publish, §4.9) before it takes effect for end users.
- [ASSUMPTION: whether an Organization can maintain more than one named Navigation Model (e.g. one per business line) or exactly one is not yet decided — see Open Questions.]
### FR-39: Assemble built Pages and Journeys into menu groups

A user with appropriate permission can add any Page or Journey they have publish rights to — including System Pages/Journeys their product ships (§4.6) and their own custom-built ones (§4.1–4.3) — as a Nav Item, and organize Nav Items into labeled Menu Groups with a defined order.
Consequences (testable):
- The Navigation Model editor lists eligible Pages/Journeys from the Catalog (FR-28) filtered to what the current user has rights to publish into navigation.
- A Nav Item can reference a Journey (a multi-step flow) as a single navigable entry, not only an individual Page — selecting it starts the Journey at its first step.
- Reordering, renaming (label), and re-grouping a Nav Item does not alter the underlying Page/Journey/Experience it points to.
### FR-40: AI-assisted navigation organization

A user can ask the AI to propose a Navigation Model, or a change to one, from natural language (e.g. "organize these into a navigation for my data-ops team"), grounded in the Pages/Journeys the user has actually built or has rights to.
Consequences (testable):
- The AI's proposed grouping/ordering carries a plain-language rationale, consistent with NFR-4's explainability requirement applied to navigation.
- The user can accept, reject, or modify each proposed Nav Item/Menu Group individually, mirroring the accept/reject/modify pattern already used for data bindings (FR-6).
### FR-41: Role-scoped navigation visibility

The Nav Items an end user sees in the Application Shell are filtered according to the same Security/permissions model that governs the underlying Pages, Journeys, and Experiences (§10, FR-23) — never exposing an item the viewer is not otherwise permitted to open.
Consequences (testable):
- Adding a Page to the Navigation Model does not itself grant access to it; a viewer without permission on the underlying Page does not see its Nav Item at all (not a disabled/greyed-out item).
- Different roles can see different Menu Groups, a different item order, or a different subset of the same Navigation Model without maintaining separate parallel navigation structures.
### FR-42: Per-role landing page configuration

A Navigation Model can designate a Landing Page per role — the Page or Experience a user in that role sees immediately after login, before any menu selection.
Consequences (testable):
- A role with no explicitly configured Landing Page falls back to a defined platform or product default rather than an error state.
- Landing page configuration is part of the same Navigation Model object and versioned/approved alongside Nav Item changes (FR-38).
### FR-43: Navigation preview by role before publish

A user authoring the Navigation Model can preview it as it would appear to a specific role before publishing the change, consistent with the preview-before-exposure principle used for Experiences (FR-7).
Consequences (testable):
- Preview reflects FR-41's role-scoped filtering — previewing as a given role shows exactly the Nav Items and Landing Page that role would see, not the full unfiltered structure.
- No Navigation Model change reaches end users without passing through Publish (FR-38, §4.9).
## 4.11 Legacy Business Screen Migration

Description: The migration path from §19 of the source draft. Realizes UJ-7.
### FR-44: Three supported migration strategies for legacy Business Screens

Existing Business Screens are treated as a migration path into Experience Studio via three candidate strategies: Classic (legacy pages remain supported as-is), AI Conversion (AI analyzes a legacy Business Screen and produces an Experience Studio equivalent), and Hybrid (legacy pages are gradually converted while remaining interoperable with the new platform).
Consequences (testable):
- An AI Conversion output is presented for human review (mirrors FR-7's preview-before-exposure principle) rather than silently replacing the legacy screen.
- Under Hybrid, a converted Experience and its legacy predecessor can coexist and both remain functional during the transition period.
- Which strategy is the default / recommended path is determined through technical validation, per the source draft — this PRD does not resolve it (see Open Questions, §15).
## 4.12 Studio Access Tiers, Permissions & Collaboration

Description: Not present in the source draft, which names personas (§2) but does not define platform-level access control between them, nor a sharing/co-authoring mechanism beyond naming Collaborate as a lifecycle stage (§16, FR-37). This group defines three Studio Access Tiers — System Page Builder, Studio Builder, and Consumer — and the Share mechanism that lets a Studio Builder bring named Collaborators onto a draft Experience. Realizes UJ-10, UJ-11, and resolves part of FR-37's open concurrency question by defining what a shared draft's collaborator roles actually permit.
Figure 5. Studio Access Tiers (System Page Builder / Studio Builder / Consumer) and how Sharing layers on top for individual Experiences.
### FR-45: Three-tier Studio access model

Every user of the Opus portfolio is assigned exactly one Studio Access Tier at a time for a given organization: System Page Builder, Studio Builder, or Consumer.
Consequences (testable):
- A Consumer never sees Experience Studio's authoring surfaces (Page Builder, Build with AI, Experience Catalog authoring views) at all — enforced at the permission layer, not only hidden in the UI.
- A Studio Builder can use every creation path (§4.1–4.3) and share/collaborate (FR-49/50) but cannot publish a System Page/Journey that applies organization- or product-wide.
- A System Page Builder has everything a Studio Builder has, plus the right to author and publish System Pages/Journeys (extends FR-25/26) that become the baseline for every user in scope.
- Tier assignment is auditable: who holds which tier, and any change to it, is recorded immutably (links NFR-10).
### FR-46: System Page Builder permission scoped to its granting authority

The System Page Builder tier can be granted at product scope (a Product Owner's existing authority, §4.6) or at organization scope (an organization administering its own baseline across whichever products it uses), and every System Page/Journey it publishes records which scope it was published under.
Consequences (testable):
- An organization-scoped System Page Builder cannot override a product-scoped System Page's contract (mirrors FR-25's existing product-vs-customer boundary) — it can only add to or extend the organization's own baseline.
- [ASSUMPTION: the source draft does not name a distinct 'Studio administrator' persona; this PRD treats the organization-scope grant as an extension of existing Product Owner / IT-admin functions pending confirmation — see Open Questions.]
### FR-47: Studio Builder permission and default ownership scope

A Studio Builder can create, edit, publish (subject to §4.9 lifecycle), and share Experiences they own or have been made a Collaborator on, using any creation path.
Consequences (testable):
- A newly created Experience defaults to being owned by the Studio Builder who created it; ownership can be transferred but not left unassigned.
- A Studio Builder's ability to publish is bounded by the same Experience Lifecycle governance (FR-33) as any other tier — Studio Builder access controls what they can build, not whether it bypasses Approve.
### FR-48: Consumer-only permission

A Consumer can open and use any Experience/Page the Navigation Model (§4.10) surfaces to their role, and nothing else — no access to Studio, the Experience Catalog's authoring views, or any draft regardless of how it is shared.
Consequences (testable):
- Attempting to open a Studio authoring URL directly as a Consumer is rejected at the permission layer, consistent with FR-42's role-scoped navigation and this tier's enforcement (UJ-10 edge case).
- A Consumer can still perform whatever in-Experience actions (filters, drill-downs, Enterprise-component actions like Approval) that Experience's own Security element (FR-18) grants them — Consumer restricts Studio access, not in-application permissions.
### FR-49: Share a specific Experience with named users or groups

A Studio Builder (or higher) who owns or has owner-level rights on an Experience can share it with specific named users or groups, each assigned a Collaborator role: owner, co-editor, commenter, or viewer.
Consequences (testable):
- Owner can do everything, including reassigning ownership and changing other Collaborators' roles.
- Co-editor can modify the Experience Definition (components, bindings, layout, navigation within the Experience) but cannot change Collaborator roles or publish without going through the same Lifecycle as the owner.
- Commenter can annotate specific components/pages with notes visible to other Collaborators but cannot alter the Experience Definition.
- Viewer can open the draft in preview but cannot comment or edit.
- Sharing a draft does not publish it — an Experience shared with Collaborators is still subject to the full Experience Lifecycle (§4.9) before it reaches its intended audience.
### FR-50: Collaboration invitation and activity attribution

Adding a Collaborator to an Experience notifies them, and every subsequent change to that Experience is attributed to the specific Collaborator who made it.
Consequences (testable):
- Change history/audit (NFR-10) attributes each edit to the acting Collaborator by name, not just to the Experience's owner.
- This resolves part of FR-37's open question: named Collaborators with defined roles (this FR) are the mechanism Collaborate uses; whether two Collaborators can edit the *same* component simultaneously in real time, versus taking turns, remains open. [ASSUMPTION: real-time simultaneous co-editing vs. sequential turn-based editing is not decided — see Open Questions.]
### FR-51: Shared/collaborative Experiences remain discoverable and governed like any other

An Experience with multiple Collaborators is still a single Catalog entry (FR-28) with one owner of record, one version history, and one path through the Lifecycle — sharing does not fork the Experience into per-collaborator copies.
Consequences (testable):
- The Catalog's owner field (FR-12) reflects the Experience's current owner even when multiple Collaborators have contributed; the full Collaborator list is visible from the Experience's own detail view, not only from the Catalog summary.
- Removing a Collaborator's access does not remove their prior attributed changes from the audit trail (NFR-10).
## 4.13 Experience Analytics & Owner Insights

Description: Not present in the source draft, which lists 'User adoption' and 'Number of experiences created' as portfolio-wide Success Metrics (§21) but gives an owner no way to see how their own Experience is doing. This group gives an owner (or Collaborator with sufficient role) usage and performance data scoped to the Experiences they own or work on, feeding back into refinement (§4.1) rather than sitting only in a platform-wide dashboard. Distinct from NFR-8, which is aggregate, ops-facing observability rather than owner-facing per-Experience insight. Realizes UJ-12, UJ-13.
### FR-52: Per-Experience usage analytics

Every published Experience/Page reports usage metrics to its owner and Collaborators: view count, unique users, access frequency over time, and entry point (Navigation Model, direct link, or drill-down from another Experience).
Consequences (testable):
- Usage metrics are available as a trend over time (e.g. daily/weekly), not only a cumulative total, so an owner can see growth, plateau, or decline.
- Entry-point breakdown lets an owner see whether traffic is coming through the Navigation Model (§4.10) versus direct links versus drill-downs, informing whether the page is discoverable or only reachable by those who already know about it.
- Usage metrics respect role-scoped navigation (FR-41) and Studio Access Tiers (FR-45) — a Consumer's activity contributes to the metrics an owner sees, but a Consumer never sees anyone else's usage data.
### FR-53: Per-Experience performance analytics

Every published Experience/Page reports performance metrics to its owner and Collaborators: render time and its distribution, a component-level load-time breakdown, and error/failure rate, checked against the NFR-11 runtime rendering target.
Consequences (testable):
- Component-level breakdown identifies which specific component (e.g. a Grid or Chart) is driving a page's overall render time, not only a page-level aggregate — this is what makes the metric actionable rather than just a number.
- Performance metrics are segmented by meaningful conditions where available (e.g. data volume, time of day, device type) so an owner can see whether slowness is universal or conditional.
- An Experience that is failing to meet the NFR-11 target is visibly flagged in its own analytics, not only in aggregate platform observability (NFR-8).
### FR-54: Owner-scoped analytics access

Experience Analytics for a given Experience are visible to its owner and to Collaborators per their role (FR-49); broader rollups across many Experiences (e.g. an organization-wide adoption view) require a separate, explicitly granted permission rather than being open by default.
Consequences (testable):
- A co-editor or commenter Collaborator can view Experience Analytics for the Experiences they collaborate on but cannot alter alerting/threshold configuration (FR-55) — that remains an owner-level action, mirroring the FR-49 role boundaries.
- A Product Owner can see aggregated analytics across the System Pages/Journeys they own (§4.6) without that extending to every Studio Builder's individual Experiences.
- [ASSUMPTION: whether organization-wide analytics rollups are a Studio Access Tier privilege (e.g. reserved for System Page Builders) or a separate dedicated permission is not decided — see Open Questions.]
### FR-55: Threshold-based owner notification

An owner can configure — or accept sensible defaults for — notification when an Experience's performance drifts beyond the NFR-11 target or its usage changes sharply (a spike or a drop), rather than needing to check Experience Analytics proactively to notice a problem.
Consequences (testable):
- Default thresholds exist out of the box (so notification is useful without configuration), and an owner can adjust them per Experience.
- A notification links directly to the specific Experience Analytics view and, where applicable, the specific component identified as the cause (links FR-53).
- Notification severity is not flat — a mild, brief drift and a severe, sustained one are distinguished (FR-56) rather than generating identical alerts.
### FR-56: Proactive critical-performance alerting

When a page's render time reaches a critical severity — materially beyond the NFR-11 target, sustained rather than a single blip — the owner is proactively alerted (push/in-app/email, not only a passive flag inside Experience Analytics) so they can begin investigating before end users complain or the SM-C-style trust damage compounds.
Consequences (testable):
- Alerting is severity-tiered: at minimum a Warning tier (approaching or briefly exceeding the NFR-11 target, surfaced per FR-55) and a Critical tier (materially over target and sustained across a defined window), with the Critical tier driving proactive push notification rather than waiting for the owner to open Experience Analytics.
- A Critical alert carries the same component-level breakdown Experience Analytics already computes (FR-53) inline in the alert itself, so the owner can start investigating immediately rather than re-deriving what's slow from scratch.
- Repeat occurrences of the same sustained Critical condition are throttled/de-duplicated rather than re-alerting continuously for one ongoing issue — the owner is told a condition is still active, not spammed once per breach.
- The Critical threshold is configurable per Experience with a sensible default derived from NFR-11 (e.g. a defined multiple of the 2–3 second target, sustained over a defined window); an owner is not required to hand-tune it for alerting to be useful from day one.
- [ASSUMPTION: exact Critical threshold multiple/window, notification channels (email vs. in-app vs. a chat integration), and whether unresolved Critical alerts escalate beyond the individual owner after a time-boxed period are not specified — confirm with architecture and UX, see Open Questions.]
### FR-57: Analytics-informed AI refinement

An owner can ask the AI to address a specific finding from Experience Analytics (e.g. "this page is slow, fix the Exceptions grid") and receive a grounded, explainable proposal the same way Build with AI and conversational refinement work (FR-1, FR-2).
Consequences (testable):
- The AI's proposal is scoped to the component(s) Experience Analytics identified as the actual issue, not a generic re-generation of the whole page.
- Applying an analytics-informed change goes through the same Lifecycle (§4.9) as any other edit — analytics inform the change, they don't bypass governance to apply it directly.
- A Critical alert (FR-56) can offer this AI-assisted fix as a direct next action from within the alert itself, shortening the path from "notified" to "remediated".
# 5. Non-Goals (Explicit)

- Not a general-purpose BI or dashboarding replacement. Experience Studio renders and acts on governed Opus product data through registered metadata; it is not a connector-agnostic BI tool for arbitrary external data sources. [NON-GOAL for this PRD]
- Not a general-purpose file-sharing or document-collaboration suite. Share and Collaborator roles (§4.12) apply only to Experiences within Experience Studio; the platform is not a substitute for general document/file collaboration tools.
- Not a general-purpose application development platform. The platform builds Experiences composed from the registered Component Framework (§14) and product-registered extensions — it is not an arbitrary custom-code app runtime. Bespoke logic beyond components/actions/workflows is a Developer extension point (FR-8, UJ-8), not a platform-core capability.
- Not a replacement for product-native security models. Experience Studio consumes and enforces each product's registered roles/permissions (FR-23); it does not define a new, competing identity or authorization system.
- Not the underlying data platforms themselves. Opus EDM, Prime, Control, and Pulse remain the systems of record and metadata source; Experience Studio is a consumption/experience layer over them (§9), not a replacement for their core administration.
- Not a data-quality or anomaly-detection engine. The Data Quality component (§14 Enterprise family) renders data-quality signal computed elsewhere (e.g. a capability such as Common Data Ingestion); Experience Studio does not compute data-quality scores itself.
- Not the legacy Business Screen deprecation decision. This PRD specifies three migration strategies (FR-44) but does not decide which is default or mandate a retirement timeline for legacy screens — that is a technical-validation and product-planning exercise (§15 Open Questions).
- Phasing beyond the MVP flagship is excluded. This document carries no v1/MVP/fast-follow labels beyond the MVP already defined in the source draft (§6/§22 of the source, this document's Capability Scope). Sequencing which capability areas roll out to which products, and in what order, is a separate later exercise.
# 6. Capability Scope

This section enumerates what Experience Studio is as a full capability. Phasing beyond the MVP flagship is deliberately excluded — see §0.
## 6.1 Capability Areas (all in scope)

- AI-First Experience Creation (§4.1) — natural-language generation end-to-end, conversational refinement, product/entity/relationship identification, component and binding recommendation, preview-before-exposure, and AI assistance embedded throughout the builder (FR-1…FR-8).
- Template-Based Creation & Catalog Templates (§4.2) — multi-scope template catalog, template customization into a standard Experience Definition, save-as-template promotion, and catalog discovery metadata (FR-9…FR-12).
- Visual Page Builder (§4.3) — full manual authoring surface, drill-down/navigation authoring, filter/interaction configuration, and responsive configuration in the builder (FR-13…FR-16).
- The Experience Object Model (§4.4) — one unified Experience object across every use case and scale, with embedded Security/Workflows and per-Experience AI Context/Documentation/Tests (FR-17…FR-19).
- Product Experience Registry & Integration Contract (§4.5) — product-agnostic core, metadata/component/template/action registration, security/AI Context registration, and registry extension to Pulse and future products (FR-20…FR-24).
- System Pages & System Journeys (§4.6) — Product-Owner-authored baseline pages and navigation flows that remain extensible (FR-25…FR-27).
- The Experience Catalog (§4.7) — unified discovery across every Experience type with dependency/version visibility (FR-28…FR-29).
- Component Framework & Responsive Design (§4.8) — the initial five-family component library, product-specific extension without forking, and cross-device responsive support (FR-30…FR-32).
- Experience Lifecycle, Governance & Testing (§4.9) — full lifecycle enforcement, change impact analysis, versioning/publishing/promotion/rollback, AI-generated regression tests, and collaboration before publish (FR-33…FR-37).
- Business User Navigation & Application Structure (§4.10) — a Navigation Model separate from any single Experience, assembling built Pages/Journeys into menu groups, AI-assisted organization, role-scoped visibility, per-role landing pages, and preview-by-role before publish (FR-38…FR-43).
- Legacy Business Screen Migration (§4.11) — Classic / AI Conversion / Hybrid strategies, with human review of any AI-converted equivalent (FR-44).
- Studio Access Tiers, Permissions & Collaboration (§4.12) — the System Page Builder / Studio Builder / Consumer access model, and named Sharing with Collaborator roles (owner/co-editor/commenter/viewer) on individual Experiences (FR-45…FR-51).
- Experience Analytics & Owner Insights (§4.13) — owner-scoped usage and performance analytics per Experience/Page, severity-tiered threshold notification with proactive Critical alerting, and analytics-informed AI refinement (FR-52…FR-57).
## 6.2 Coverage

- Products: Opus EDM, Prime, Control, Pulse, and future Opus products — the platform core is product-agnostic (FR-20); coverage for any given product depends on that product completing its Product Integration Contract registration (§10).
- Personas: Business Analyst (primary), Data Steward, Product Owner, Implementation Consultant, and Developer/technical user as an extension point, not a prerequisite (§2 source draft).
- Devices: Desktop, Tablet, and Mobile via responsive web (FR-32). [ASSUMPTION: native mobile applications are not confirmed as in-scope — see Open Questions.]
- MVP flagship (carried from source draft §22): Prompt → Generate → Edit → Preview → Publish, demonstrated on one flagship Experience — a Security Operations Dashboard (Files Processed, Late Files, Failed Files, Exceptions, New Securities, Processing Trends, Data Quality, Search, drill-down to Security Overview) — with the same runtime then demonstrating a second Experience, Security Overview, with dynamic tabs and drill-down navigation.
## 6.3 Explicitly Out (capability boundaries, not phasing)

General-purpose BI/arbitrary-data tooling; a competing security/identity system; the underlying data platforms' core administration; data-quality/anomaly computation; the legacy-screen deprecation timeline; and any phasing/sequencing beyond the MVP flagship. See §5.
# 7. Success Metrics

## Primary

- SM-1: Time to Experience — Elapsed time from intent (prompt / template selection / blank canvas) to a usable, published Experience. Baseline: weeks. Target: minutes. Validates FR-1, FR-9, FR-13, FR-33.
## Secondary

- SM-2: Percentage of experiences created without technical assistance — Share of published Experiences authored end-to-end by Business Analyst/Data Steward/Product Owner/Implementation Consultant personas with no Developer involvement. Target [ASSUMPTION: threshold not set in source draft; confirm]. Validates FR-1, FR-9, FR-13.
- SM-3: AI-generated experience acceptance rate — Share of AI-generated components/bindings/layout accepted without modification. Validates FR-1, FR-5, FR-6.
- SM-4: Time from prompt to usable experience — A narrower cut of SM-1 isolating the Build with AI path specifically. Validates FR-1.
- SM-5: Template reuse — Frequency with which published Experiences originate from a template versus a blank prompt or from-scratch build. Validates FR-9, FR-11.
- SM-6: Experience publishing time — Elapsed time from Approve to Publish within the lifecycle. Validates FR-33, FR-35.
- SM-7: User adoption — Count and growth of active Experience Studio users across personas and products.
- SM-8: Number of experiences created — Raw volume of Experiences created, segmented by creation path and product.
- SM-9: AI recommendation acceptance — Share of AI component/layout/binding recommendations accepted during Page Builder use outside initial generation (§7). Validates FR-8.
- SM-10: Defect rate — Post-publish defects per Experience, segmented by creation path, to check whether faster creation trades off against quality.
- SM-11: Regression coverage — Share of an Experience's dependencies covered by generated or authored tests at publish time. Validates FR-36.
- SM-12: Page render time — Measured elapsed time from navigation/request to interactive display for published pages, checked against the NFR-11 target of 2–3 seconds. Validates NFR-11. Owner-scoped visibility into this metric per Experience is FR-53's Experience Analytics.
- SM-13: Owner analytics engagement — Share of Experience owners who view Experience Analytics at least once post-publish, and share who take a subsequent action (edit, AI-assisted refinement) informed by it. Validates FR-52…FR-57 — analytics that nobody looks at, or that never leads to a change, isn't delivering the fine-tuning loop this capability exists for.
- SM-14: Time to investigation after a Critical alert — Elapsed time from a Critical alert (FR-56) firing to the owner opening the relevant Experience Analytics view or taking a remediating action. Validates FR-56 — a Critical alert that doesn't shorten this time versus passive discovery isn't earning its proactive framing.
## Counter-Metrics (do not optimize)

SM-C1 and SM-C2 are treated as hard signals, not merely monitored KPIs, mirroring the governance discipline used for Common Data Ingestion's counter-metrics.
- SM-C1: Rubber-stamp approval rate — Share of Approve-stage reviews completed implausibly fast relative to Experience complexity, suggesting approval without real review. High SM-C1 undermines FR-33's accountability promise even if SM-1/SM-3 look good. Counterbalances SM-1, SM-6.
- SM-C2: Broken-binding escape rate — Rate at which a published Experience reaches its audience with a data binding that does not resolve correctly, caught after publish rather than at Validate. Must stay near zero — this is the load-bearing quality gate mirroring FR-34's purpose. Counterbalances SM-1.
- SM-C3: Template/experience sprawl — Growth in near-duplicate templates and Experiences that could have reused an existing catalog entry instead of being rebuilt from scratch, measured via catalog similarity. High SM-C3 indicates the Catalog (FR-28/29) and template-reuse incentives (SM-5) are not working. Counterbalances SM-8.
# 8. Cross-Cutting Non-Functional Requirements

- NFR-1 (Generation latency): Time from a Build with AI prompt submission to a rendered preview must feel interactive, not batch. [ASSUMPTION: a concrete latency budget (e.g. seconds vs. tens of seconds) is not specified in the source draft — confirm with architecture and UX research.]
- NFR-2 (Scalability across products and tenants): The platform must support the full Opus portfolio (EDM, Prime, Control, Pulse, future products) and their combined customer base's Experience volume without a per-product or per-tenant re-architecture.
- NFR-3 (Portability / build-once): The Experience Studio core (object model, lifecycle, builder, catalog, AI engine) is built once and product-agnostic (FR-20); onboarding a new product is registration through the Product Integration Contract, not a platform rebuild. Mirrors the 'build once, deploy as config' principle used for Common Data Ingestion.
- NFR-4 (Explainability): Every AI-generated or -recommended element (component choice, data binding, layout) is human-inspectable with a plain-language rationale (FR-1, FR-5) — no opaque generation reaching a Preview or Publish stage.
- NFR-5 (Accessibility (WCAG)): Experience Studio and every Experience it produces must meet WCAG accessibility standards, consistent with the platform being consumed by non-technical business users across a broad audience.
- NFR-6 (Responsiveness across devices): Desktop, Tablet, and Mobile support with configurable breakpoints, as specified in FR-32; AI-generated layouts optimize automatically for the target device.
- NFR-7 (Security & tenant isolation): Each customer organization's Experiences, data bindings, and AI Context customizations are isolated from other organizations; shared catalog content (Enterprise/Product templates, platform-native components) is structural/definitional only, never customer data — mirroring the structural-vs-data distinction used for CDI's Feeds Library. [ASSUMPTION: exact tenancy model (single-tenant per deployment vs. multi-tenant SaaS) is not specified in the source draft — confirm with architecture.]
- NFR-8 (Observability): Operational metrics for generation success/failure rate, recommendation acceptance rate, publish frequency, lifecycle-stage duration, and impact-analysis accuracy are exposed for platform-operations monitoring. Distinct from Experience Analytics (§4.13, FR-52/53), which is owner-facing and scoped per Experience rather than aggregate and ops-facing.
- NFR-9 (Extensibility): The Component Framework, Product Integration Contract, and AI Context model all support registered extension (new components, new products, specialized vocabulary) without platform-core changes (FR-22, FR-24, FR-31).
- NFR-10 (Auditability): Every lifecycle transition, AI-generation event, and human accept/reject/modify decision (bindings, recommendations, approvals) is recorded immutably with actor and timestamp, sufficient to reconstruct why any published Experience looks the way it does.
- NFR-11 (Runtime rendering performance): The rendering engine must be highly performant when rendering data for published pages: end users expect a page to render within 2–3 seconds under normal load, measured from navigation/request to interactive display of its data-bound components. Distinct from NFR-1 (authoring-time AI generation latency) — this is the runtime bar for every published Experience regardless of how it was created. Applies across the component families in FR-30 (Grid, Chart, KPI, Relationship Viewer, etc.) and must hold at the data volumes and concurrency levels set by NFR-2. [ASSUMPTION: the 2–3 second target is stated as a general end-user expectation; whether it applies uniformly to every component type and data volume (e.g. a 100k-row Grid vs. a single KPI tile) or is tiered by component/data-size class is not specified — confirm with architecture and UX research.]
# 9. Governance, Audit & Regulatory

- Accountability is always locatable. Every published Experience ties to a named human at Approve (FR-33) and, where relevant, to the individual accept/reject/modify decisions made on AI recommendations and bindings (FR-6, NFR-10) — the AI proposes, a human is always the accountable publisher.
- Audit trail / decision provenance. An immutable, queryable record covers every lifecycle transition, generation/refinement event, binding decision, approval, version change, and rollback, retained per policy (mirrors NFR-10 and the CDI PRD's audit-trail convention).
- Regulatory scope. Experience Studio surfaces governed financial/business data owned by the underlying Opus products; it inherits, rather than sets, the regulatory posture of the product whose data it renders (e.g. Control/Prime/EDM's existing PRA SS1/23, FCA, and, where applicable, DORA/GDPR posture — see the CDI PRD, §9, for the pattern). [ASSUMPTION: Experience Studio introduces no new regulated data of its own; confirm this holds once the tenancy/multi-tenant model (NFR-7) is finalized.]
# 10. Integration & Dependencies

- Product Experience Registry & Product Integration Contract. Hard dependency on every consuming product (Opus EDM, Prime, Control, Pulse, future products) implementing the registration contract for metadata, components, templates, System Pages/Journeys, actions, security, and AI Context (§10, FR-20…FR-24).
- Underlying product metadata APIs. Experience Studio's generation, recommendation, and binding capabilities (FR-1…FR-8) depend on each product exposing a stable, discoverable metadata interface. [ASSUMPTION: the exact interface (REST, GraphQL, event-driven) is not specified in the source draft — confirm with architecture.]
- AI / LLM provider. Natural-language understanding, generation, and recommendation (FR-1…FR-8, FR-36) depend on an underlying AI model/service. [ASSUMPTION: model choice, hosting (managed vs. self-hosted), and data-handling posture for prompts/metadata are not specified in the source draft — confirm, this has data-governance implications (§12).]
- Identity / SSO. Named-user identity for authorship, approval, and audit (FR-33, NFR-10) depends on integration with existing Opus identity/SSO. [ASSUMPTION: reuse of existing Gresham/Opus SSO, per the pattern used in the CDI PRD.]
- Legacy Business Screen engine. AI Conversion and Hybrid migration strategies (FR-44) depend on being able to read and interpret existing Business Screen configuration.
- Data-quality / anomaly signal source. The Enterprise-family Data Quality component (FR-30) depends on an upstream capability (e.g. a data-quality/anomaly engine such as Common Data Ingestion) to supply the scores it renders; Experience Studio does not compute them (§5 Non-Goals).
# 11. Operational Requirements

- Environment promotion. Experiences are expected to move through a promotion path (e.g. draft/non-production → approved/production) consistent with the versioning and promotion governance capability (FR-35). [ASSUMPTION: whether configuration/testing happens in a non-prod environment before promotion, or directly in production with governance gates, is not specified in the source draft — see Open Questions.]
- Support / ownership. Product Owners own System Pages/Journeys and the product-level registry contribution; Business Analysts/Data Stewards/Implementation Consultants own the Experiences they author; escalation for platform-level issues (generation failures, registry issues) follows existing Opus support channels. [ASSUMPTION: no distinct support model is specified in the source draft.]
- Tenant/organization isolation in operation. Each customer organization's Experience content, AI Context customizations, and usage data remain isolated in day-to-day operation, consistent with NFR-7.
# 12. Data Governance & Security

- Classification & residency. Experience Studio does not introduce a new data store of record — it renders and binds to data already governed by the underlying Opus product (Opus EDM/Prime/Control/Pulse) and inherits that product's classification and residency posture, mirroring the PII treatment in the CDI PRD (§12).
- Tenant isolation. Each organization's Experience Definitions, data bindings, and AI Context customizations are isolated; shared catalog content (Enterprise/Product templates and platform-native/product-registered components) is structural/definitional only and carries no customer data (links NFR-7).
- AI data handling. Prompts, generated content, and any metadata sent to the AI/LLM provider (Integration & Dependencies) must not leak one organization's data into another's context or into any pooled model training set. [ASSUMPTION: the exact isolation guarantee for AI provider calls (per-tenant context, no cross-tenant training) is not specified in the source draft — flagged as a priority confirmation item given the sensitivity of the underlying financial data, see Open Questions.]
- Retention. Version history, audit records, and rejected/superseded Experience Definitions are retained per policy, balancing audit needs against storage minimization.
- Usage-analytics identifiability. Experience Analytics (§4.13, FR-52) reports usage in aggregate (view counts, trends, entry points) by design; whether an owner can see which named individual accessed their page, versus only anonymized/aggregated counts, is a distinct and more sensitive disclosure than the aggregate metrics themselves and needs an explicit decision, not a default. [ASSUMPTION: the source draft does not address this; this PRD assumes aggregate-only reporting to owners unless a narrower, explicitly-permissioned drill-down to individual access records is separately confirmed — flagged as a priority item given that Consumers (§4.12) may not expect their individual activity to be visible to a page's owner.]
# 13. Why Now / Competitive Positioning

- Low-code/AI-assisted app-building is a broad and fast-moving market trend outside capital markets software specifically; what is distinctive here is pairing that pattern with metadata that is already governed, product-native, and financial-domain-specific (Opus EDM/Prime/Control/Pulse), rather than a generic connector to arbitrary data. [ASSUMPTION: no competitive landscape research is included in the source draft; a proper competitive-positioning claim would need the kind of vendor survey the CDI PRD performed in its addendum — this section should not be treated as validated market analysis until that research is done.]
- Compounding catalog effect. As Product Owners register more System Pages, System Journeys, and templates, and as Business Analysts promote successful customizations back into the Organization/shared catalog (FR-11), each subsequent Experience gets built from a richer starting point — a similar compounding-asset dynamic to the Feeds Library pattern in the CDI PRD, but for UI/experience patterns rather than data-ingestion definitions.
- Structural edge: build-once across the whole Opus portfolio. Because the platform core is product-agnostic (FR-20, NFR-3), one investment in Experience Studio pays off across Opus EDM, Prime, Control, Pulse, and future products, rather than each product building its own experience layer — the same build-once economics the CDI PRD argues for its ingestion engine.
# 14. Risks & Mitigations

- AI hallucination in generated bindings/components. A generated Experience references a plausible-looking but incorrect entity, attribute, or relationship. Mitigation: FR-4's metadata-grounding requirement (no invented fields), FR-7's mandatory preview before any exposure, and Validate-stage structural checks (FR-33) that reject unresolvable bindings before Approve.
- Approval fatigue / rubber-stamping (SM-C1). If publishing feels fast and low-friction, approvers may sign off without real review, defeating the accountability promise of FR-33. Mitigation: surface Experience complexity/change-size at Approve, and monitor SM-C1 as a genuine gate, not just a KPI — mirrors the CDI PRD's hard-gate pattern for spot-check skip-through.
- Shadow-IT sprawl of ungoverned Experiences. Ease of creation could produce many low-quality, undocumented, or duplicate Experiences (SM-C3) that are hard to govern or retire. Mitigation: catalog dependency/version visibility (FR-29), promotion governance (FR-35), and treating SM-C3 as a tracked counter-metric.
- Product registry drift breaking the build-once promise. If products register incompatible or inconsistent metadata/component shapes, the platform core may accumulate product-specific special-casing over time, eroding NFR-3. Mitigation: a well-specified, versioned Product Integration Contract (§10) with conformance validation at registration.
- Legacy migration risk. AI Conversion of a legacy Business Screen may misinterpret nuanced legacy configuration, producing a plausible but subtly wrong equivalent. Mitigation: mandatory human review of any AI-converted Experience before it replaces a legacy screen (FR-44), and the Hybrid coexistence option to de-risk cutover.
- Performance risk from complex generated dashboards. A generated Experience with many bindings/components (e.g. the flagship Security Operations Dashboard) could underperform if generation optimizes for correctness over runtime efficiency. Mitigation: NFR-11 sets a concrete 2–3 second runtime rendering target that must be tested against realistic flagship-scale Experiences before general availability; a page that cannot meet it should surface as a build-time warning rather than ship silently slow.
- Cross-tenant AI data leakage. Because generation depends on an AI/LLM provider (Integration & Dependencies), a misconfigured integration could leak one organization's metadata/prompts into another's context. Mitigation: this is flagged as a priority open item (Data Governance & Security) requiring explicit confirmation of the provider's isolation guarantees before broader rollout.
- Over-reliance on non-technical authors for business-critical Experiences. As Business Analysts self-serve applications that become operationally load-bearing (e.g. an Exception Management workspace), the absence of a technical reviewer could let a subtly broken Experience reach production. Mitigation: FR-33's lifecycle (particularly Validate and Approve) and defect-rate/regression-coverage tracking (SM-10, SM-11) are the intended counterweight; this should be watched closely during the MVP.
# 15. Open Questions

- Default legacy-migration strategy — Which of Classic / AI Conversion / Hybrid (FR-44) is the recommended default, and what determines the choice per legacy screen? Source draft defers this to technical validation. Owner: product + architecture.
- AI/LLM provider and data-handling posture — Model choice, hosting, and per-tenant isolation guarantees for prompts and metadata sent to the AI provider (Integration & Dependencies, Data Governance). Owner: architecture + security/legal.
- Environment promotion model — Is configuration/testing done in a non-production environment and promoted to production, or configured with governance gates directly in production (Operational Requirements)? Owner: architecture.
- Collaboration concurrency model — Does the Collaborate lifecycle stage (FR-37) support simultaneous multi-editor collaboration, or sequential review/comment? Owner: architecture + UX.
- Native mobile app strategy — Is Mobile support (FR-32) responsive-web only, or does it include a native mobile application? Owner: product.
- Cross-product Experiences — Can a single Experience span metadata/components from more than one Opus product (e.g. EDM and Control together), or is an Experience always scoped to one identified product (FR-3)? Owner: product + architecture.
- Pulse's registry relationship — Is Pulse a peer product in the Product Experience Registry or a deployment mode of Control, as the source draft's diagram might suggest (§9)? Owner: product.
- System Page override/extension permissions — What exactly can a customer override on a Product-Owner-defined System Page versus only extend around it (FR-25)? Owner: product + architecture.
- Tenancy model — Single-tenant per deployment vs. multi-tenant SaaS, and how that affects the isolation guarantees in NFR-7 and Data Governance. Owner: architecture.
- Success-metric thresholds — Concrete numeric targets for SM-2 (percentage without technical assistance) and any other metric currently unquantified in the source draft. Owner: product, informed by MVP results.
- Commercial / packaging model — How Experience Studio is licensed/packaged relative to the products it serves (bundled vs. add-on) is not addressed in the source draft. Owner: product/commercial.
- Phasing beyond the MVP flagship — Deployment order across Opus EDM, Prime, Control, and Pulse, and which capability areas (§6) follow the MVP, is explicitly deferred as a separate exercise consistent with §0.
- Single vs. multiple Navigation Models per Organization — Can an Organization maintain more than one named Navigation Model (e.g. per business line or per customer-facing brand), or is there exactly one per deployment (FR-38)? Owner: product + architecture.
- Navigation ownership across Business Analysts — When more than one Business Analyst adds Pages/Journeys to the same Navigation Model, how are conflicting edits reconciled — is it single-owner-edits-with-review, or multi-editor (mirrors the FR-37 collaboration question)? Owner: product + architecture.
- Studio administrator persona — The source draft names no distinct persona who grants Studio Access Tiers (FR-45/46) — is this an extension of Product Owner, a separate IT-admin role, or both depending on scope (product vs. organization)? Owner: product.
- Real-time vs. turn-based collaborative editing — Can two Collaborators edit the same Experience/component simultaneously (FR-50), or is editing effectively single-writer-at-a-time with review in between? This has real architecture cost implications and should be settled early. Owner: architecture.
- Organization-wide analytics rollup permission — Is a cross-Experience analytics rollup (beyond a single owner's own Experiences) a Studio Access Tier privilege or a separately granted permission (FR-54)? Owner: product.
- Usage-analytics identifiability — Should an owner ever be able to see which named individual accessed their page, or should Experience Analytics remain aggregate-only by design (Data Governance & Security)? This is a privacy/consent decision, not purely a technical one. Owner: product + legal.
- Analytics data retention period — How long usage/performance history is retained before aggregation or deletion is not specified. Owner: architecture, informed by the same retention policy referenced in Data Governance & Security.
- Critical alert threshold, channels, and escalation — The exact Critical-tier threshold multiple/sustained window, supported notification channels (email/in-app/chat integration), and whether an unresolved Critical alert escalates beyond the individual owner after a time-boxed period (FR-56) are not specified. Owner: architecture + UX.
- Usage-decline alerting — Whether a sustained usage decline (as opposed to a spike/drop, FR-55) should itself eventually trigger a proactive alert, or remain something an owner finds through voluntary review (UJ-13). Owner: product.
# 16. Assumptions Index

- §Frontmatter — Document owner and any relationship to a broader Gresham/Opus AI vision programme are unconfirmed.
- §4.1 FR-1/FR-2 — No ambiguity-handling UX is specified for cases where the AI cannot confidently identify intent or interpret a refinement request.
- §4.1 FR-3 — Cross-product Experiences (spanning more than one Opus product) are not addressed; assumed out of scope pending confirmation (also Open Questions).
- §4.5 FR-20 — The exact Product Integration Contract mechanism (API, manifest, package) is not specified; assumed to follow a 'build once, deploy as config' pattern.
- §4.5 FR-24 — Pulse's exact relationship to Control in the registry (peer vs. nested) is unconfirmed.
- §4.6 FR-25 — Exact override/extension permissions for a System Page are unconfirmed.
- §4.8 FR-32 — Minimum supported resolutions/breakpoints and native-mobile-app scope are unconfirmed.
- §4.9 FR-37 — Collaboration concurrency model (simultaneous vs. sequential) is unconfirmed.
- §6 Capability Scope — Native mobile applications are assumed out of scope pending confirmation; only responsive web is assumed in scope.
- §7 Success Metrics — SM-2's numeric threshold and other unquantified metric targets are pending confirmation, expected to be informed by MVP results.
- §8 NFR-1 — No concrete generation-latency budget is specified; assumed to need interactive (sub-batch) response time, pending UX research.
- §8 NFR-7 — Tenancy model (single-tenant per deployment vs. multi-tenant SaaS) is unconfirmed and affects isolation guarantees.
- §10 — Underlying product metadata API mechanism is unconfirmed.
- §10 / §12 — AI/LLM provider choice, hosting, and per-tenant data-isolation guarantees are unconfirmed; flagged as a priority item given the sensitivity of the underlying financial data.
- §11 — Environment promotion model (non-prod-then-promote vs. governed-in-production) is unconfirmed.
- §12 — Assumed no new regulated data is introduced by Experience Studio itself; to be reconfirmed once the tenancy model is finalized.
- §13 — Why Now / Competitive Positioning is not based on vendor research and should not be treated as validated market analysis until a proper competitive survey (analogous to the CDI PRD's addendum) is performed.
- §14 Risks — Performance budgets for complex generated Experiences at flagship scale are not yet set or tested.
- §15 — Default legacy-migration strategy, Pulse's registry relationship, System Page override permissions, cross-product Experience support, and commercial/packaging model are all open, assigned per the Open Questions table.
- §4.10 FR-38 — Whether an Organization can maintain multiple named Navigation Models or exactly one per deployment is unconfirmed.
- §4.10 — Navigation Model concurrency/ownership when multiple Business Analysts contribute Pages/Journeys to the same navigation is unconfirmed, mirroring the FR-37 collaboration-model question.
- §8 NFR-11 — The 2–3 second runtime rendering target is stated as a general end-user expectation; whether it is uniform across all component types/data volumes or tiered by component/data-size class is unconfirmed.
- §4.12 FR-46 — No distinct Studio administrator persona is named in the source draft; the organization-scope System Page Builder grant is treated as an extension of existing Product Owner / IT-admin functions pending confirmation.
- §4.12 FR-50 / §4.9 FR-37 — Real-time simultaneous co-editing vs. sequential turn-based editing for shared Experiences is undecided.
- §4.13 FR-54 — Whether organization-wide analytics rollups are a Studio Access Tier privilege or a separate permission is unconfirmed.
- §4.13 / §12 — Experience Analytics is assumed to report usage in aggregate only (not per-named-individual) pending an explicit privacy/consent decision; flagged as a priority item given Consumer-tier users may not expect individual visibility.
- §4.13 — Analytics data retention period is unconfirmed.
- §4.13 FR-56 — Exact Critical-tier threshold multiple/window, notification channels, and escalation-beyond-owner behavior are unconfirmed.
- §4.13 — Whether a sustained usage decline should itself trigger a proactive alert (vs. remaining voluntary review, UJ-13) is unconfirmed.