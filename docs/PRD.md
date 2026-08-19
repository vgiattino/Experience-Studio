# EDM Experience Framework & AI-Powered Page Builder — the requirements of record

> **Spec of record**, from `source/EDM_Experience_Framework_AI_Page_Builder_PRD.docx` (Version 1.0,
> August 2026). Extracted verbatim below — headings, numbering and wording are the document's, not a
> paraphrase, so a requirement can be quoted from here in a ticket and be the same sentence the
> product owner wrote.
>
> This PRD **supersedes** the 57-FR Opus Experience Studio PRD, which now lives at
> [`superseded/PRD-2-opus-experience-studio.md`](./superseded/PRD-2-opus-experience-studio.md) with its
> reconciliation beside it. What carries forward from that work, what is parked, and why, is recorded
> in [`PARKED.md`](./PARKED.md).
>
> Reconciliation against the code: [`PRD-TRACEABILITY.md`](./PRD-TRACEABILITY.md).
>
> Two things are worth reading before the body, because they reverse assumptions the prototype was
> built on:
>
> 1. **§2 makes Levels 1 and 2 the priority** — Use and Configure. Ground-up creation from a blank
>    prompt is Level 3, deferred to Phase 4 and listed as **P2** in §30. The prototype's entry point is
>    a blank prompt, which is Level 3.
> 2. **§26 says this is not a page builder.** "An enterprise data management experience platform that
>    provides production-ready experiences out of the box and uses AI to allow business users to
>    create, configure and evolve experiences using natural language." The standard experiences are the
>    product; AI is how a client bends them.
>
> And one requirement carries more architectural weight than its length suggests: **§16**. Every
> standard page is product-owned; a client modification must produce a *derived* experience that
> retains lineage to the standard and its version; product releases must never overwrite what a client
> changed. Sections 16.1 through 16.6 are the whole lifecycle, and nothing else in the document works
> without them.

---

# Product Requirements Document Enterprise Data Management Experience Framework & AI-Powered Page Builder

Version 1.0 | August 2026

# 1. Purpose

The Enterprise Data Management Experience Framework provides a modern, enterprise-grade user experience for configuring, monitoring, managing, and consuming data within the EDM platform.

The product will provide a set of standard, out-of-the-box screens and experiences for common data management activities and master-data use cases such as Security, Party, Price, and ESG.

In parallel, the product will introduce an AI-powered conversational experience that allows business users to create and modify pages using natural language.

The objective is to move beyond a traditional technical page-builder model and provide users with a simple experience: “Tell the application what you want to see and how you want the user to interact with it.”

# 2. Product Vision

The EDM platform should provide a library of ready-to-use enterprise data management experiences, while allowing customers to extend those experiences through an AI-first journey.

The experience should support three levels of interaction:

Level 1 — Use: Users consume standard screens delivered with the product.

Level 2 — Configure: Users modify an existing screen through configuration or natural-language prompts.

Level 3 — Create: Users describe a new experience from scratch using AI.

The initial priority is Levels 1 and 2. Full ground-up page creation and lower-level element construction will follow in later phases.

# 3. Goals

- Deliver a consistent enterprise-grade UI framework for EDM.

- Provide standard screens out of the box for common EDM activities.

- Provide standard experiences for major EDM master-data domains.

- Reduce custom screen development required for customers.

- Allow business users to personalize standard experiences.

- Introduce an AI-driven conversational experience for page creation and modification.

- Allow users to iteratively refine an experience through natural language.

- Maintain enterprise security, auditability, performance, governance, and role-based access.

- Reuse existing EDM APIs, metadata, data services, components, and business capabilities.

- Establish a foundation for future AI-generated applications and workflows.

# 4. Non-Goals — Initial Release

The initial release will not attempt to provide a completely unrestricted low-code application builder.

Deferred capabilities include:

- Creating arbitrary UI components from scratch

- Designing custom components

- Full visual drag-and-drop page design

- Creating arbitrary backend services through AI

- Creating new data models through AI

- Creating new EDM processing logic through AI

- Full workflow authoring through AI

- Complex application development requiring custom code

The initial focus is composing enterprise data management experiences using existing platform capabilities.

# 5. Out-of-the-Box Experience Library

The application should ship with a core library of standard experiences. These experiences are product capabilities, not customer-specific examples.

## 5.1 Master Data Experiences

Security:

- Security Master Overview

- Security Search

- Security Detail

- Security Data Quality

- Security Exceptions

- Security Source Comparison

- Security History

- Security Audit

Party:

- Party Master Overview

- Party Search

- Party Detail

- Party Relationships

- Party Source Comparison

- Party Exceptions

- Party History

- Party Audit

Price:

- Price Overview

- Price Search

- Price Detail

- Price Source Comparison

- Price Exceptions

- Price History

- Price Quality

ESG:

- ESG Data Overview

- ESG Entity Search

- ESG Data Detail

- ESG Metrics

- ESG Source Comparison

- ESG Exceptions

- ESG History

The architecture should allow additional domains to be introduced using the same experience framework.

# 6. Operational Data Management Experiences

The product should provide standard operational screens supporting day-to-day data management.

Exception Management:

- View, filter, search, group, prioritize, investigate, assign, resolve, and track exceptions and SLAs

File Monitoring:

- File arrival, processing status, failures, duration, record counts, file size, source/destination, SLA status, late files, and historical processing

SLA Management:

- Expected and actual arrival, processing start/completion, SLA status, breaches, history, and trends

Audit History:

- Who changed a record, what changed, previous/new values, date/time, source, operation, and related business object

Process History:

- Process executions, start/end, status, duration, records, errors, warnings, related files, data products, and workflows

Reference Data Lookup:

- Code/value lookup, search, effective dating, active/inactive status, relationships, source, and history

Housekeeping:

- Retention, purging, temporary data, storage, process cleanup, historical data, and operational status

IT / Operations Dashboard:

- Platform health, processing status, failed processes, file feeds, SLA status, system activity, integration status, queue status, recent errors, and capacity indicators

# 7. Common Experience Architecture

All standard screens should use a common experience framework providing reusable capabilities for page layout, navigation, headers, search, filters, grids, forms, charts, tabs, cards, KPIs, status indicators, exception indicators, drill-down, related records, source comparison, history, audit, actions, and notifications.

Security, Party, Price, ESG, and other domains should use the same underlying experience patterns while allowing domain-specific configuration.

# 8. AI-Powered Experience

The application should provide an AI entry point allowing users to create or modify experiences using natural language.

The AI should understand EDM metadata, data domains, attributes, APIs, existing pages, available UI components, navigation, security, business terminology, and existing experience patterns.

The AI translates business intent into page configuration using existing data, APIs, widgets, layouts, navigation, security, and business rules.

# 9. AI Page Creation Example

A business user can enter: “Create a Security Master Overview screen.”

The AI should generate an appropriate initial experience containing security search, filters, a security grid, key attributes, status, exception indicators, and navigation to Security Detail.

Users can then iteratively prompt changes such as:

- “Add an AI search box at the top.”

- “Add ISIN, CUSIP, ticker, security type, issuer, currency and status.”

- “Highlight rows that have business exceptions.”

- “When the user double-clicks a security, take them to a security detail page.”

# 10. AI-Generated Detail Experience

AI should support multi-page experiences. A Security Detail experience may contain a header, key attributes, current record, contributing sources, exceptions, history, audit, and related data.

Users can continue refining it with prompts such as:

- “Move security status next to the identifier.”

- “Add a tab showing contributing sources.”

- “Show current record side-by-side with source values.”

# 11. AI-Driven Visualization Changes

Users should be able to modify visualizations conversationally.

Examples:

- “Change the pie chart to a bar chart.”

- “Change the bar chart to an area chart.”

- “Group the chart by security type.”

- “Show the last 12 months.”

- “Sort the results by exception count.”

- “Move this chart above the grid.”

# 12. AI-Driven Grid Configuration

Users should be able to configure grids through prompts, including columns, sorting, filtering, grouping, and conditional formatting.

Examples:

- “Add issuer and currency.”

- “Remove the security type column.”

- “Group the grid by issuer.”

- “Sort by exception count.”

- “Put the most recently updated securities first.”

- “Highlight securities with unresolved exceptions.”

- “Show only active securities.”

# 13. AI Search

AI search should allow users to query data using business language while complementing traditional filtering.

Example: “Show me all active US corporate bonds with unresolved exceptions.”

The system should translate the request into appropriate filters/search criteria without bypassing existing security and data-access controls.

# 14. Iterative Conversational Design

The AI journey should be conversational and stateful. Users should be able to start with a standard page and progressively describe changes without having to specify the entire experience in one prompt.

The system must maintain context of the current experience and apply incremental changes.

# 15. Existing Experience Modification

Users should be able to select an existing out-of-the-box experience and customize it using AI.

Examples:

- “Add a chart showing exceptions by security type.”

- “Move the exceptions panel to the top.”

- “Add a filter for issuer.”

- “Remove the currency column.”

This creates the progression: Product Default → Customer Configuration → AI Personalization.

# 16. Product Standard vs. Client-Specific Experience Lifecycle

Every out-of-the-box page has a Product Standard Version owned and maintained by the EDM product team.

When a client uses AI or configuration to modify a standard page, the standard page must not be changed. Instead, the system creates a client-specific experience derived from the standard page.

Example:

Product Standard: Security Master Overview v1.0

Client customization: Security Master Overview — Client Version

The client-specific experience must maintain a relationship to the originating standard page and version.

## 16.1 Standard Page Lineage

Client-specific pages must retain a reference to the standard page from which they originated.

The page should expose:

- Standard page name

- Standard version

- Client-specific version

- Originating product release

- Client modifications

- Available product updates

This lineage is required to support future synchronization and upgrades.

## 16.2 Standard Page Lifecycle

Standard pages are product-managed assets and will evolve through the normal product lifecycle.

The product team may introduce new requirements, improve layouts, add capabilities, improve AI interactions, add attributes, improve visualizations, or otherwise enhance standard experiences.

New standard versions are deployed as part of product releases without automatically overwriting client-specific experiences.

## 16.3 Client Notification of Standard Updates

When a new standard version becomes available, clients should receive a notification indicating that an updated experience is available.

Example:

“A new version of Security Master Overview is available. Your current experience contains customizations. Review the changes and choose whether to update your experience.”

Available actions should include:

- Compare Changes

- Preview New Version

- Sync with Standard

- Keep My Version

- Review Later

## 16.4 Compare Experience

The platform should provide a comparison experience showing differences between the current client version and the new product standard.

Comparison should identify:

- Added capabilities

- Removed capabilities

- Changed layouts

- New/removed columns

- Changed filters

- Changed charts

- Changed navigation

- Changed business rules

- Client-specific customizations

The goal is to clearly show what the product changed and what the client changed.

## 16.5 Synchronization and Reversion

Clients should be able to synchronize a customized page with the current standard page.

At minimum, the platform should support:

- Sync all changes

- Keep client version

- Revert to standard

- Preview before sync

Future phases should support selective synchronization, allowing users to adopt individual product changes while preserving selected client customizations.

Example:

Adopt new AI Search

Keep custom columns

Adopt new exception visualization

Keep custom navigation

## 16.6 Version History

Every experience should maintain version and lineage information.

Example:

Security Master Overview

- Standard v1.0

- Client v1.0

- Standard v2.0 available

- Client v1.1

- Standard v3.0 available

The platform must understand the relationship between each client version and the standard baseline from which it originated.

# 17. Future Experience Sharing

Future phases should allow client-created experiences to be shared with other users or teams.

A user could say:

“Share my Security Operations Dashboard with the Data Steward team.”

Recipients should be able to:

- Use the shared experience

- Customize it

- Make a copy

- Save their own variant

Customization by another user must not alter the original owner's experience.

This introduces the future lifecycle:

Product Standard → Client Experience → Shared Experience → User/Team Variant.

# 18. Governance and Guardrails

AI-generated experiences must operate within enterprise controls.

The AI must respect:

- User permissions

- Role-based security

- Field-level security

- Tenant boundaries

- Existing APIs

- Supported components

- Approved data sources

- Audit requirements

AI must not bypass existing security or data-access controls. AI-generated configuration changes must be auditable.

# 19. Explainability

When appropriate, AI should explain the configuration changes it made.

Example:

“I've added an Exception Status column to the Security grid and configured rows with unresolved exceptions to display as highlighted.”

For complex changes, users should be able to inspect the resulting configuration.

# 20. Reusable Experience Patterns

Core patterns should include:

Master Overview: Search → Filters → Grid → KPIs → Charts → Exceptions

Master Detail: Header → Summary → Tabs → Current Record → Sources → History → Exceptions

Operational Monitoring: KPIs → Status → Filters → Monitoring Grid → Drill-down

Exception Management: Exception KPIs → Filters → Exception Grid → Detail → Resolution

File Monitoring: Feed Status → SLA → File Grid → Processing Detail → History

Audit: Filters → Audit Grid → Change Detail

Process History: Process KPIs → Process Grid → Execution Detail

Patterns should be configurable for different EDM domains.

# 21. User Personas

Business User: Consume data, search, filter, investigate exceptions, review master records, understand source information, and customize experiences without technical skills.

Data Steward: Investigate data quality, resolve exceptions, compare sources, review history, monitor SLAs, and manage reference data.

Data Developer: Configure advanced experiences, understand APIs and metadata, build reusable components, and support AI-generated configurations.

IT / Operations: Monitor feeds, processes, failures, SLAs, system health, and housekeeping.

# 22. Functional Requirements

FR-01 — Standard Experience Library: Provide a library of out-of-the-box EDM experiences.

FR-02 — Master Data Experiences: Provide standard experiences for Security, Party, Price, ESG, and additional supported domains.

FR-03 — Operational Experiences: Provide standard experiences for Exception Management, File Monitoring, SLA Management, Audit, Process History, Reference Data, Housekeeping, and IT Operations.

FR-04 — Experience Templates: Support reusable experience templates.

FR-05 — Search: Support configurable traditional search and filtering.

FR-06 — AI Search: Support AI-assisted natural-language search where appropriate.

FR-07 — AI Page Creation: Allow users to describe a desired experience using natural language.

FR-08 — AI Page Modification: Allow users to modify an existing page using natural-language prompts.

FR-09 — Conversational Context: Maintain context of the current experience throughout the conversation.

FR-10 — Grid Configuration: Modify columns, sorting, filtering, grouping, and conditional formatting through AI.

FR-11 — Visualization Configuration: Modify visualization types, grouping, filtering, and placement through AI.

FR-12 — Navigation: Describe navigation and drill-down behavior using AI.

FR-13 — Detail Experiences: Create/configure detail experiences associated with master records.

FR-14 — Tabs: Configure tabs and related-data experiences through AI.

FR-15 — Source Comparison: Support side-by-side comparison of current records and contributing source data.

FR-16 — Security: Enforce existing EDM security controls across standard and generated experiences.

FR-17 — Auditability: Audit AI-generated configuration changes.

FR-18 — Reusability: Save and reuse generated experiences.

FR-19 — Versioning: Support experience versioning and rollback.

FR-20 — Product Lineage: Maintain the relationship between client-specific pages and their originating standard pages.

FR-21 — Standard Updates: Detect when a new product-standard version becomes available.

FR-22 — Comparison: Allow clients to compare their customized experience with a new standard.

FR-23 — Synchronization: Allow clients to sync/revert a customized experience to the product standard.

FR-24 — Upgrade Safety: Never automatically overwrite client customizations with product-standard updates.

FR-25 — Future Sharing: Support future sharing and user/team variants.

FR-26 — Future Extensibility: Support future AI-driven creation of lower-level elements and completely new experiences.

# 23. Non-Functional Requirements

The solution must meet enterprise requirements for performance, scalability, availability, security, accessibility, auditability, multi-tenancy, observability, governance, internationalization, and maintainability.

AI-generated pages must perform within acceptable enterprise application performance thresholds and must not introduce uncontrolled queries or excessive API calls.

# 24. Success Metrics

Adoption:

- Percentage of users using standard experiences

- Number of customers using out-of-the-box experiences

- Number of AI-generated/customized experiences

Productivity:

- Reduction in time to create an experience

- Reduction in technical effort required for page configuration

- Time from request to usable experience

AI:

- Percentage of prompts successfully resulting in valid changes

- Prompt-to-page completion rate

- Percentage of AI-generated changes accepted without manual correction

- Number of iterative modifications per experience

Platform:

- Reuse of standard experience patterns

- Number of domains supported

- Number of reusable components

- Reduction in custom page development

Lifecycle:

- Percentage of clients adopting standard updates

- Time from standard release to client adoption

- Number of clients successfully syncing customized experiences

- Number of upgrade conflicts requiring manual intervention

# 25. Phased Delivery

Phase 1 — Enterprise Experience Foundation

Priority: Out-of-the-box experiences.

Deliver common experience framework, standard layouts, grids, forms, charts, search/filtering, navigation, security, audit, and standard master/operational experiences.

Phase 2 — AI-Assisted Configuration

Priority: Modify existing experiences using AI.

Deliver AI entry point, conversational page modification, grid configuration, filters, sorting, grouping, conditional formatting, charts, navigation, tabs, and detail-page configuration.

Phase 3 — Experience Lifecycle & AI Experience Creation

Priority: Product/client lifecycle plus creation from business intent.

Deliver standard/client lineage, versioning, comparison, notifications, synchronization, and AI-generated new experiences using existing patterns and components.

Phase 4 — AI Page Builder

Priority: Ground-up experience creation.

Future capabilities include defining new elements, custom layouts/components, complex interactions, workflows, reusable components, and AI-assisted application development.

# 26. Strategic Product Positioning

This initiative should not be positioned simply as a Page Builder.

The strategic capability is:

“An enterprise data management experience platform that provides production-ready experiences out of the box and uses AI to allow business users to create, configure and evolve experiences using natural language.”

The standard experiences provide the productized EDM experience.

The AI layer provides customer-specific flexibility.

The lifecycle model ensures product improvements can continue to flow to clients without destroying their customizations.

Together, the platform creates a progression:

Out-of-the-Box → Configure → Personalize → Create → Share

while preserving a controlled relationship to the product-standard experience.

# 27. Key Product Principles

1. Standard experiences are first-class product capabilities.

2. Client customization must never modify the product standard.

3. Every customized page must retain lineage to its originating standard page/version.

4. Product standard pages must continue to evolve independently through the product lifecycle.

5. Product updates must never automatically overwrite client customizations.

6. Clients must be able to compare, preview, keep, or synchronize with new standards.

7. AI should be conversational and iterative rather than requiring a single complete prompt.

8. AI should operate within existing enterprise security and governance controls.

9. Standard patterns should be reusable across master-data and operational use cases.

10. Future phases should allow experiences to be shared, copied, customized, and extended.

11. The long-term goal is an AI-first enterprise experience platform, not simply a visual page builder.

# 28. Example End-to-End Experience

A user enters the Security Master application.

The product provides Security Master Overview with AI Search, standard filters, Security Grid, KPIs, exception indicators, and navigation to Security Detail.

The user asks:

“Show me securities with unresolved business exceptions.”

The page filters the grid.

The user asks:

“Add issuer and currency.”

The grid updates.

The user asks:

“Group by security type.”

The grid updates.

The user asks:

“Change the exception indicator to highlight the entire row.”

The page updates.

The user double-clicks a security and opens Security Detail.

The user asks:

“Put the current record and contributing source values side by side.”

The page updates.

The user asks:

“Add a chart showing exceptions by source.”

The AI adds the visualization.

The user asks:

“Change that chart to a bar chart.”

The visualization changes.

The resulting page becomes a client-specific experience derived from the product-standard Security Master Overview. The client can continue using its customized page while retaining a link to the standard baseline.

When the product team later releases an improved Security Master Overview, the client receives a notification. The client can compare the new standard with its customized version and choose to keep its version, adopt the new standard, or synchronize selected changes.

This represents the desired end state: a business user can progressively describe the experience they want without needing to understand how the underlying application is constructed, while the product team retains the ability to continuously improve the standard EDM experience.

# 29. Target Experience Lifecycle

The target lifecycle is:

PRODUCT STANDARD

Product-owned, delivered with the application.

↓ Customize

CLIENT EXPERIENCE

Client-owned variation derived from the standard.

↓ Product release

UPDATED STANDARD

New product capabilities become available.

↓ Notify

COMPARE

Client reviews standard changes against its customized experience.

↓ Decision

KEEP / ADOPT / SYNC

Client retains, adopts, or synchronizes changes.

↓ Future phase

SHARE

Client experiences can be shared with users or teams.

↓ Future customization

USER / TEAM VARIANT

Recipients can customize shared experiences without altering the source experience.

# 30. Requirements Summary

| Capability | Initial Priority | Lifecycle / Future |
|---|---|---|
| Out-of-the-box EDM screens | P0 | Product-managed standard |
| Security / Party / Price / ESG | P0 | Expand to additional domains |
| Operational screens | P0 | Expand experience library |
| AI modification | P0 | Continuous conversational refinement |
| AI search | P0 | Expand natural-language capabilities |
| Client-specific variants | P0 | Maintain lineage to standard |
| Standard page versioning | P0 | Product lifecycle |
| Compare / preview updates | P1 | Selective merge in future |
| Sync / revert | P1 | Granular synchronization in future |
| AI ground-up creation | P2 | Future page builder |
| Experience sharing | P2 | User/team variants |
