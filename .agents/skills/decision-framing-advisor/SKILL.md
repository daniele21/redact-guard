---
name: decision-framing-advisor
description: Use at the start of a new product, macro-feature, sensitive integration, or major change request to identify unresolved high-impact decisions, compare viable options, and recommend a path before implementation begins.
---

# Decision Framing Advisor

Use this skill during early discovery or before high-impact changes.

## Inputs

- project objective
- requirements
- constraints
- relevant repository context
- project brief, if available
- brainstorming doc, if available

## Workflow

1. Identify unresolved decisions that materially affect product scope, architecture, compliance, security, UX, cost, or operations.
2. Filter out low-value questions already answered by repository context.
3. For each real decision, present viable options with pros, cons, risks, and tradeoffs.
4. Recommend one path and separate it from decisions that still require user confirmation.
5. Stop before implementation when the remaining decisions are foundational or hard to reverse.

## Output

- key unresolved decisions
- why each decision matters
- viable options
- pros and cons
- recommended path
- decisions still requiring confirmation
- assumptions that can safely be defaulted

## Review Questions

- What must be decided before implementation is safe?
- Which decisions are already resolved by the repository context?
- Which assumptions are low-risk and reversible versus foundational?
