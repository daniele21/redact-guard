# Project Context

Use this file to orient Codex before implementation work.

## Default Project Shape

- Multi-tenant B2B SaaS
- Modular monorepo-ready layout
- AGENTS-first governance model
- Strong emphasis on security, privacy, maintainability, testing, observability, and cost-awareness

## Repo Layers For Codex

Treat the repo as three distinct guidance layers:

1. `AGENTS.md`
   - the durable operating contract for the repository
   - architecture, discovery, privacy, release, testing, and documentation expectations

2. `.agents/skills/`
   - repo-local reusable methods
   - discovery, planning, review, and documentation workflows
   - specialist lenses such as architecture, root cause, privacy, tests, UX, observability, and release readiness

3. `.codex/agents/`
   - stable operational subagent roles
   - delegation, parallel work, sandbox separation, and focused task ownership

Use skills as methods.
Use subagents as roles.

## Canonical Subagents

Use a small set of stable subagents instead of creating one subagent per specialist skill.

- `repo_scout`
  - read-only exploration
  - maps impacted files, layers, entrypoints, and execution paths

- `implementer`
  - write-capable implementation
  - applies the smallest correct low-drift change once direction is clear

- `reviewer`
  - read-only technical review
  - applies the relevant skills for correctness, architecture, privacy/security, tests, observability, UX, and release risk

- `docs_syncer`
  - documentation synchronization
  - updates or proposes updates to specs, ADRs, runbooks, changelog, and discovery artifacts

- `docs_researcher`
  - optional external-doc verification
  - verifies framework, API, or provider behavior when current source material matters

- `browser_debugger`
  - optional UI reproduction
  - reproduces browser issues, gathers evidence, and narrows the failure surface before implementation

## Standard Codex Workflow

1. Read `AGENTS.md`
2. Read `/.codex/instructions.md`
3. Read the relevant product docs
4. Read the relevant pillar docs and ADRs
   - if personal data is involved, read the relevant files in `docs/04-privacy-gdpr/`
   - if GDPR or AI Act topics are in scope, start from the internal baseline and source hierarchy:
     - `docs/legal/legal-source-register.md`
     - `docs/legal/legal-update-policy.md`
     - `docs/04-privacy-gdpr/`
     - `docs/10-ai-governance/`
   - if AI is involved, also consider filling:
     - `docs/10-ai-governance/ai-act-project-applicability-template.md`
     - `docs/legal/legal-compliance-summary.md`
   - if personal data is involved, also consider filling:
     - `docs/04-privacy-gdpr/gdpr-project-applicability-template.md`
     - `docs/legal/legal-compliance-summary.md`
   - if the change affects tenant boundaries, config, billing, or isolation, read `docs/01-architecture/multi-tenancy.md`
5. If this is a new product, major initiative, or macro-feature, do not skip discovery
   - ensure `product/project-brief.md`, `docs/00-discovery/00-project-brainstorm.md`, `docs/00-discovery/01-solution-strategy.md`, and `docs/00-discovery/02-delivery-plan.md` exist and are aligned before implementation
6. Spawn `repo_scout` when the task needs repo mapping, impact analysis, or execution-path tracing
7. If foundational decisions are still open, stop and use the relevant discovery skills before implementation
8. Have `implementer` make the smallest correct change once direction is clear
9. Have `reviewer` apply the relevant specialist skills
10. Have `docs_syncer` update or propose updates to the affected docs
11. Use `docs_researcher` or `browser_debugger` only when the task materially benefits from them
12. Apply remediations and keep documentation aligned with implemented reality

Use [.codex/golden-paths.md](./golden-paths.md) when the task fits a standard path such as feature work, bug fixing, privacy-sensitive change, integration change, or release readiness.

## Typical Prompt Patterns

### Standard Implementation Prompt

1. Read:
   - `AGENTS.md`
   - `/.codex/instructions.md`
   - relevant files in `product/`
   - relevant files in `docs/`
2. Spawn `repo_scout` to map impacted layers, touched files, and existing patterns
3. If major decisions are still open, stop and frame them before implementation
4. Have `implementer` apply the smallest correct change
5. Have `reviewer` run the relevant review lenses
6. Have `docs_syncer` update or propose doc changes
7. Summarize:
   - approach
   - risks and tradeoffs
   - impacted layers
   - tests run or needed
   - docs updated or still required

### Bug-Fix Prompt

1. Read the relevant issue, spec, and implementation context
2. Spawn `repo_scout` to trace the real execution path and likely owning files
3. Have `reviewer` apply root-cause and regression-risk review before implementation
4. Have `implementer` apply the smallest systemic fix
5. Rerun `reviewer`
6. Have `docs_syncer` sync any affected docs

### PR Review Prompt

1. Compare the branch against the target base
2. Spawn `repo_scout` to map affected code paths and impacted layers
3. Have `reviewer` check correctness, architecture, privacy/security, tests, observability, and release risk
4. Use `docs_researcher` if external API or framework behavior must be verified
5. Summarize findings by severity and note any doc gaps

## When To Escalate Review Depth

Use specialist review when the change affects:

- auth/authz or sensitive data
- lawful basis, retention, deletion, export, subprocessor, or transfer handling
- operational runbooks or deployments
- costly external providers or AI workloads
- architecture boundaries or shared contracts
- tenant boundaries, shared resources, or per-tenant behavior
- important UX paths
- current external framework or provider behavior that should be source-verified
