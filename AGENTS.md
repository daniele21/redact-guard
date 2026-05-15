# AGENTS.md

## Mission

This repository is a template for robust, client-ready B2B SaaS products. Every change must prefer correctness, clarity, security, privacy, maintainability, observability, and cost-awareness over speed-by-default shortcuts.

The repository is expected to function as an operating system for delivery:

- product intent is explicit
- architectural boundaries are documented
- documentation is operational, not ornamental
- fixes target root causes, not just symptoms
- testing and observability are part of delivery, not afterthoughts

## Repo Navigation

Read in this order before making any substantial change:

1. [AGENTS.md](./AGENTS.md)
2. [.codex/instructions.md](./.codex/instructions.md)
3. Relevant files in [product/](./product)
4. Relevant files in [docs/](./docs)
5. Relevant ADRs in [adr/](./adr)

Use the repo sections like this:

- `apps/`: app entrypoints, route composition, page-level orchestration
- `packages/`: domain logic, shared libraries, typed contracts, UI primitives
- `services/`: workflows, integration orchestration, async or background processes
- `infra/`: deployment and platform concerns
- `product/`: source of truth for problem framing and requirements
- `docs/`: operational guidance and standards
- `tests/`: cross-cutting test support and broader test suites

## Working Rules

- Read the relevant context before proposing or making changes.
- Prefer the smallest change that fixes the actual problem at the right layer.
- Keep responsibilities explicit. Do not mix domain logic, UI rendering, persistence, and orchestration in one place.
- Treat privacy, security, testability, observability, and documentation as part of the implementation.
- Call out assumptions and unresolved risks instead of hiding them.

## Architecture Boundaries

Use this default split unless a project-specific architecture document supersedes it:

- `domain`: business rules, invariants, validation, pure transforms
- `data`: persistence access, external APIs, storage mappers
- `services`: orchestration, multi-step workflows, retries, idempotent operations
- `ui`: reusable components, interaction patterns, view-level primitives
- `app/pages`: route-level composition and request lifecycle handling
- `infra`: deploy/runtime/platform definitions

Rules:

- Do not duplicate business logic across apps, services, or UI layers.
- Do not place persistence logic directly inside page components.
- Do not create shared packages without a real reuse case.
- Keep contracts typed and naming explicit.

When the product is multi-tenant, also respect tenant boundaries defined in `docs/01-architecture/multi-tenancy.md` and any tenant-partitioning rules in `docs/05-data/`.

## Root Cause Before Remedy

Every bug, anomaly, or improvement request must be evaluated at the causal layer first.

- Do not default to local patches when the problem may originate in architecture, data shape, UX flow, requirements, or missing observability.
- Workarounds are allowed only when explicitly marked as temporary and paired with a structural remediation plan.
- For any non-trivial fix, ask:
  - what is the root cause
  - is the issue local or systemic
  - what protections prevent recurrence
  - what docs, tests, monitors, or ADRs must change

## Decision Discovery Policy

Before implementing any new feature, architecture change, integration, workflow, or product setup, first determine whether there are unresolved high-impact decisions that should be made explicit.

Do not silently assume foundational choices when those choices materially affect:

- product scope
- user roles and permissions
- architecture
- data model
- integrations
- security
- privacy/GDPR
- UX/UI flows
- environments and deployment
- observability
- cost structure

When important decisions are still open, pause implementation and first provide a decision analysis.

For each unresolved decision:

1. state what must be decided
2. explain why it matters
3. present the main viable options
4. show pros, cons, risks, and tradeoffs
5. recommend one option with rationale
6. ask for confirmation before proceeding when the decision is foundational or hard to reverse

Do not ask unnecessary questions. Only surface decisions that are:

- high-impact
- hard to reverse later
- ambiguous from the available repository context
- likely to affect maintainability, privacy, security, cost, or user experience

If the repository documentation already resolves a decision, use that decision and state that it is already defined.

If a decision is low-impact and easily reversible, you may proceed with a reasonable default, but you must:

- make the assumption explicit
- explain why it is safe to default
- note how it can be changed later if needed

Do not ask for decisions that are already resolved in the repository documentation.
Do not ask low-value questions.
Only surface decisions that materially affect the solution.

### Standard Decision Categories

Review whether any of these categories are still unresolved before implementation:

- Product: target users, problem being solved, scope, non-scope, business rules, success criteria
- Architecture: modular monolith vs service split, sync vs async flows, persistence approach, layer boundaries
- Data: core entities, source of truth, personal data involved, retention and deletion implications, import/export requirements
- Security: authentication model, authorization model, role boundaries, exposed interfaces, secret handling
- Privacy / GDPR: lawful basis assumptions, data minimization, purpose limitation, retention impact, data subject rights, processors or subprocessors involved
- UX / UI: primary user journey, desktop/mobile priority, workflow shape, validation and feedback patterns, loading, empty, error, and success states
- Operations: target environments, deployment model, rollback expectations, observability requirements, runbook implications
- FinOps: cost drivers, external providers, caching opportunities, usage-sensitive architecture choices

### Required Output Format For Open Decisions

When foundational decisions are still open, respond with:

1. Decisions that need confirmation
2. For each decision:
   - what must be decided
   - why it matters
   - available options
   - pros
   - cons
   - recommendation
3. Safe assumptions that can be defaulted
4. What can be implemented immediately vs what should wait

## Mandatory Discovery Artifacts For New Projects

Before implementation of a new product, major initiative, or macro-feature with unclear foundations, create or update:

- `product/project-brief.md`
- `docs/00-discovery/00-project-brainstorm.md`
- `docs/00-discovery/01-solution-strategy.md`
- `docs/00-discovery/02-delivery-plan.md`

Treat these documents as the living source of truth during discovery, alignment, and planning.

## Interactive Brainstorming Policy

`docs/00-discovery/00-project-brainstorm.md` is the working document for early project exploration.

Keep it updated until:

- the product direction is clear enough
- major tradeoffs are visible
- architecture options have been evaluated
- privacy, security, and AI governance concerns are understood
- admin monitoring and cost visibility expectations are explicit
- the user has clearly approved the strategic direction

Do not begin implementation while blocking decisions remain open in the brainstorming document.

## Strategy Freeze Policy

Once the main direction is agreed, consolidate it in:

- `docs/00-discovery/01-solution-strategy.md`
- relevant ADRs in `adr/`

The strategy must explicitly document:

- chosen architecture
- rejected alternatives
- accepted tradeoffs
- data and tenancy model
- security baseline
- privacy / GDPR approach
- AI governance / AI Act approach when relevant
- UX / UI direction
- observability and cost monitoring approach
- admin cost panel expectations when relevant

## Delivery Planning Policy

Before implementation, convert the approved strategy into a delivery plan in `docs/00-discovery/02-delivery-plan.md`.

The delivery plan must define:

- implementation slices
- dependencies
- testing expectations
- documentation updates
- privacy / GDPR work
- AI governance / AI Act work when relevant
- security work
- UX / UI work
- observability and admin cost monitoring work
- definition of ready
- definition of done

## Approval Gate Before Implementation

Implementation must not begin until these items are sufficiently clear and approved:

- the project brief exists
- the brainstorming phase has converged
- the solution strategy has been documented
- the delivery plan has been documented
- major architectural decisions are no longer open
- major privacy and security concerns are understood
- AI usage is clarified when relevant
- admin cost visibility expectations are clarified when relevant

## Admin Cost Visibility Requirement

Every project must explicitly consider how costs and operational usage will be monitored.

When the product uses external APIs, AI providers, cloud services, storage-heavy workflows, or usage-based billing components, evaluate whether an admin-facing monitoring view is required.

At minimum, the strategy and plan should consider:

- cost drivers
- service usage metrics
- provider attribution
- tenant attribution when relevant
- workflow or feature attribution when relevant
- anomaly or threshold visibility

## AI Governance Requirement

If the product uses AI or automated decision support, explicitly assess:

- whether AI is actually needed
- what role AI plays
- whether the workflow affects rights, sensitive decisions, or regulated contexts
- whether human oversight is required
- what provider or model governance is needed
- what logging, evaluations, and output controls are needed
- whether AI Act concerns must be tracked

Document AI-related decisions in:

- `docs/10-ai-governance/`
- `docs/00-discovery/01-solution-strategy.md`
- `docs/00-discovery/02-delivery-plan.md`

## Testing Policy

- New logic requires unit tests.
- Critical flows require integration tests.
- Bug fixes require regression coverage when feasible.
- Do not leave important behavior unverified.
- Run or describe the required checks: lint, typecheck, tests, build.

If a test cannot be added immediately, state why and record the gap.

## Documentation Policy

Update docs whenever behavior, architecture, requirements, operational procedures, or user-facing flows change.

At minimum, evaluate whether the change requires updates to:

- feature spec in `docs/specs/`
- pillar docs in `docs/`
- `CHANGELOG.md`
- ADR in `adr/`

Documentation must describe reality, not intent that was never implemented.

## Security and Privacy Policy

- Apply least privilege by default.
- Minimize collected, stored, and exposed data.
- Never log secrets or sensitive personal data.
- Identify auth/authz implications before adding new entrypoints or workflows.
- Record retention, deletion, export, and access-control impacts for sensitive flows.
- Check whether the change affects the GDPR docs in `docs/04-privacy-gdpr/`, especially data inventory, lawful basis, retention, subprocessors, transfers, and data-subject-rights handling.
- Escalate legal/compliance questions instead of implying certification.

## Legal Baseline Policy

For GDPR and AI Act topics, use the repository legal baseline as the default source of truth.

Do not improvise legal interpretations from memory.

If the baseline marks an issue as unclear, high-risk, recently changed, or requiring human review, stop and flag it explicitly.

The legal source hierarchy is defined in `docs/legal/legal-source-register.md`.

Use live external sources only when:

- the legal source register (`docs/legal/legal-source-register.md`) says the baseline may be outdated
- the topic is explicitly marked as watchlist or pending
- the user requests a fresh legal-source check

Treat repository legal documents as an operational baseline, not as legal advice or certification.

## UX/UI Policy

- Use shared tokens, shared components, and documented patterns.
- Do not hardcode colors, spacing systems, or one-off UI behavior without clear justification.
- Cover loading, empty, error, and success states.
- Maintain baseline accessibility: semantics, labels, keyboard reachability, and contrast awareness.
- Favor concise, professional interfaces over decorative complexity.

## Observability and FinOps Policy

- Add or preserve structured logging where it matters.
- Define useful metrics and traces for critical workflows.
- Consider tenant-level usage and cost attribution when relevant.
- Call out external provider costs, storage growth, and expensive workflows.
- Prefer solutions that remain operationally visible and economically understandable.

## Change Delivery Format

When reporting work, provide:

- summary of what changed
- rationale for the chosen approach
- risks and open questions
- tests run or required
- docs updated or still needing update

For privacy-sensitive changes, also provide:

- personal or tenant data touched
- lawful basis or privacy rationale if relevant
- retention, deletion, export, or transfer implications
- subprocessors or vendor changes

When reviewing work, lead with findings and concrete references.
