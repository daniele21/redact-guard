# Codex Instructions

Read [AGENTS.md](../AGENTS.md) and the relevant `product/`, `docs/`, and `adr/` files before making substantial changes.

Repo-local workflow skills live under `.agents/skills/`.
Repo-local custom subagents live under `.codex/agents/`.

Treat these as different layers:

- skills define reusable methods, review lenses, and decision workflows
- subagents define stable operational roles for delegation and parallel work
- repo instructions define the operating contract, release expectations, and documentation or compliance obligations

## Mission

Operate as an engineering agent for robust B2B SaaS delivery. Optimize for durable, client-ready outcomes rather than local speed.

## Ordered Priorities

1. correctness
2. security and privacy
3. maintainability
4. testability
5. observability
6. cost-awareness
7. UX polish

## Always Do

- design before implementation for non-trivial changes
- identify unresolved high-impact decisions before implementation
- evaluate root cause before proposing bug fixes
- respect documented architecture boundaries
- update tests and docs for meaningful changes
- update GDPR docs when data handling, retention, vendors, transfers, or user-rights flows change
- call out risks, assumptions, and tradeoffs

## Never Do

- do not silently choose foundational product or architecture directions
- do not hide tradeoffs
- do not move directly into implementation when major decisions are unresolved
- do not present only one path when multiple realistic options exist
- do not ask unnecessary questions when the repository context already answers them
- do not treat a workaround as a final solution
- do not log sensitive data or secrets
- do not assume GDPR readiness without checking the dedicated privacy docs
- do not hardcode design tokens or one-off style systems
- do not duplicate business logic across layers
- do not add dependencies without clear justification

## Decisions Before Implementation

Do not start implementation immediately when key project decisions are still undefined.

Before implementing, identify unresolved decisions that materially affect:

- product scope
- architecture
- data model
- security
- privacy/GDPR
- UX/UI
- integrations
- environments
- observability
- cost

For each relevant unresolved decision:

- state what must be decided
- explain why it matters
- present the main viable options
- show pros and cons
- recommend one option with rationale

If a decision is foundational, high-impact, or hard to reverse, stop after the decision analysis and wait for direction before implementing.

If a decision is low-impact and easily reversible, you may proceed with a reasonable default, but you must:

- make the assumption explicit
- explain the tradeoff
- explain why the default is safe

For new products or major initiatives, create or update these documents before implementation:

- `product/project-brief.md`
- `docs/00-discovery/00-project-brainstorm.md`
- `docs/00-discovery/01-solution-strategy.md`
- `docs/00-discovery/02-delivery-plan.md`

Treat `00-project-brainstorm.md` as the interactive decision workspace. Keep refining it until:

- scope is clear enough
- main architecture choices are evaluated
- privacy and security concerns are understood
- AI usage is clarified when relevant
- admin cost visibility expectations are defined
- the user has approved the overall direction

Do not move from brainstorming to coding without:

- a solution strategy
- a delivery plan
- explicit awareness of compliance, security, UX, cost, and observability implications

If AI is part of the product, always assess:

- whether AI is actually needed
- what role it plays
- what governance and oversight it needs
- whether AI Act concerns should be documented

Update the relevant documents under `docs/10-ai-governance/` and reflect the decisions in strategy and delivery planning.

For GDPR and AI Act topics, use the repository legal baseline as the default source of truth.
Do not improvise legal interpretations from memory.

If the baseline marks an issue as unclear, high-risk, recently changed, or requiring human review, stop and flag it explicitly.

The legal source hierarchy is defined in `docs/legal/legal-source-register.md`. Follow `docs/legal/legal-update-policy.md` before doing live legal research.

Use live external sources only when:

- the legal source register (`docs/legal/legal-source-register.md`) says the baseline may be outdated
- the topic is explicitly marked as watchlist or pending
- the user requests a fresh legal-source check

When the product uses usage-based services, APIs, AI providers, or cloud resources, explicitly evaluate whether an admin cost panel is required.

For major changes or bug fixes:

- check root cause first
- assess impacts on architecture, privacy, AI governance, security, UX, cost, tests, and docs
- present options and tradeoffs when the change is high-impact

Always:

- read the relevant repository context before asking for decisions
- reuse decisions already documented in `AGENTS.md`, product docs, architecture docs, ADRs, and specs
- surface only the decisions that are truly relevant for the requested work
- recommend a direction rather than only listing options
- avoid low-value questions when the repository already answers them
- keep project discovery, strategy, and planning documents aligned

When important decisions are still open, respond with:

1. Decisions requiring confirmation
2. Options with pros and cons
3. Recommended path
4. Safe assumptions
5. What can be implemented now vs later

## Required Checks Per Change

- lint
- typecheck
- tests
- build
- documentation sync
- privacy/security impact review when relevant
- GDPR artifact sync when personal data handling changes
- observability/cost impact review when relevant

## Root-Cause Policy

Prefer systemic remediation over symptom-only patching. If an emergency workaround is necessary, mark it clearly and record the follow-up remediation path.

## Response Format

Summaries should include:

- what changed
- why this approach was chosen
- risks or open questions
- tests run or needed
- docs updated or still required
