# Global Skill Strategy

Use this note when deciding whether a skill from this template belongs in `~/.codex/skills` or should stay repo-local under `.agents/skills/`.

## Decision Rule

Install a skill globally only if it describes a reusable capability that still makes sense outside this repository.

Keep a skill repo-local when it depends on:

- this repo's folder structure such as `product/`, `docs/`, `adr/`, or `.codex/`
- this template's delivery contract in `AGENTS.md`
- local compliance expectations such as GDPR artifact sync or tenant-isolation reviews
- local review sequencing, naming, or release policy
- file paths, examples, or references that assume a specific codebase

## What Is Generalizable

These are good candidates for `~/.codex/skills` after cleanup:

- architecture and refactoring workflows
- UX/UI review and design-system enforcement patterns
- root-cause analysis workflows
- test-gap review workflows
- deployment-readiness review checklists
- observability and cost review heuristics
- documentation-sync workflows phrased generically
- privacy/security review heuristics phrased without template-specific policy assumptions

## What Must Be Removed First

Before promoting any skill to `~/.codex/skills`, remove or rewrite:

- absolute paths
- repo-specific file names used as mandatory sources
- assumptions about monorepo layout
- assumptions that every project is multi-tenant
- assumptions that every project needs GDPR artifacts
- assumptions about local release gates or changelog policy
- examples that refer to this template's components, docs, or workflows

## Current Repo Mapping

Treat the files under `.agents/skills/` as repo-local methods. Treat the files under `.codex/agents/` as the operational delegation layer. Do not mirror the same concern in both layers with the same name.

- `.agents/skills/repo-architecture-reviewer/`: mostly generalizable method, but the repo-specific reading order should remain local
- `.agents/skills/root-cause-reviewer/`: mostly generalizable method, but local documentation and review expectations should remain local
- `.agents/skills/test-coverage-guardian/`: generally portable if stripped of template-specific test and docs requirements
- `.agents/skills/ux-design-system-enforcer/`: portable only after removing local design-system and component-library assumptions
- `.agents/skills/security-privacy-reviewer/`: partially portable; keep legal and policy references repo-local
- `.agents/skills/gdpr-privacy-reviewer/`: usually repo-local unless you explicitly want a GDPR-specialist global skill
- `.agents/skills/feature-docs-updater/`: partially portable; docs locations and required artifacts are template-specific
- `.agents/skills/deploy-readiness-checker/`: portable as a generic release-readiness skill if local operational gates are removed
- `.agents/skills/finops-observability-reviewer/`: mostly portable if cost and telemetry checks are rewritten generically

## Promotion Matrix

Use this matrix when deciding whether to install one of this template's local skills as a personal skill.

| Skill | Recommendation | Why | What to rewrite first |
| --- | --- | --- | --- |
| `repo-architecture-reviewer` | Promote to personal skill | The method is generic and useful across stacks and repo shapes | Remove any repo-specific reading order or local architecture assumptions if added later |
| `root-cause-reviewer` | Promote to personal skill | Root-cause analysis is universally reusable | Keep repo-specific follow-up artifacts, docs, and ADR expectations out of the global version |
| `test-coverage-guardian` | Promote to personal skill | The verification logic is broadly portable and one of the best default reviewers to keep globally | Do not hardcode local test folders, CI gates, or docs policies |
| `ux-design-system-enforcer` | Promote to personal skill | Shared-component reuse, state completeness, and accessibility checks generalize well | Remove assumptions about local design-system docs or component-library paths |
| `security-privacy-reviewer` | Promote to personal skill | Strong default reviewer for most modern products, even outside this template | Keep it on technical/privacy baseline concerns; do not force template-specific compliance artifacts |
| `feature-docs-updater` | Promote, but rewrite first | The workflow is reusable, but documentation targets vary a lot between repos | Replace fixed artifact expectations with repo discovery of specs, ADRs, runbooks, and changelog conventions |
| `deploy-readiness-checker` | Promote to personal skill | Release-readiness review is widely applicable and naturally generic | Avoid assuming a specific deployment model, migration stack, or rollback mechanism |
| `finops-observability-reviewer` | Promote to personal skill | Cost and telemetry reviews are broadly useful for SaaS, AI, and infra-heavy systems | Remove assumptions about tenant attribution if the target repo is not multi-tenant |
| `gdpr-privacy-reviewer` | Promote only as a specialist personal skill | Useful if you want a dedicated GDPR lens available globally, but it is not a universal default | Keep it optional and avoid assuming every repo maintains GDPR artifacts or processor-role documentation |

## Practical Recommendation

If you want a lean personal skill set, start with these as defaults in `~/.codex/skills`:

- `repo-architecture-reviewer`
- `root-cause-reviewer`
- `test-coverage-guardian`
- `ux-design-system-enforcer`
- `security-privacy-reviewer`
- `deploy-readiness-checker`
- `finops-observability-reviewer`

Add these only if you want a more opinionated specialist setup:

- `feature-docs-updater`
- `gdpr-privacy-reviewer`

Avoid keeping overlapping aliases for the same concern. In particular, if you adopt the reviewer-style names above, do not also keep broader aliases such as `repo-architecture-software-eng` or `ux-ui-master`, because they create redundant triggers and make the canonical skill set unclear.

## Recommended Split

Use two layers instead of one:

1. Global skills in `~/.codex/skills`
   - hold reusable methods and generic review heuristics
2. Repo-local skills in `.agents/skills/`
   - hold reusable workflows that depend on this repository contract
3. Repo instructions and subagents in `AGENTS.md` and `.codex/`
   - hold file paths, required docs, compliance scope, release gates, and architecture rules

This keeps global skills broadly useful while preserving this template's stricter operating model.

## Extraction Checklist

When turning a local skill into a global one:

1. Move the reusable method into the global skill.
2. Replace mandatory repo paths with "read the relevant repo guidance first".
3. Convert hard requirements into configurable checks unless they are truly universal.
4. Keep examples generic and cross-stack where possible.
5. Leave project governance, compliance scope, and documentation obligations in the repo.

## Anti-Pattern

Do not install this template's `AGENTS.md` worldview as a global skill verbatim.

`AGENTS.md` is a project operating contract. It is intentionally opinionated about architecture, privacy, documentation, and delivery quality. Those rules are valuable here, but too specific to impose blindly on unrelated repositories.
