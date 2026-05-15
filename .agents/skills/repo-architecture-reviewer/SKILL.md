---
name: repo-architecture-reviewer
description: Review a change for modularity, ownership, architectural boundaries, duplication, and correct placement of logic in a B2B SaaS repository.
---

# Repo Architecture Reviewer

Use this skill when a change affects repository structure, shared modules, service boundaries, placement of logic, or architectural choices that must be evaluated before implementation.

## Inputs

- touched files
- relevant structure or architecture docs
- feature or change context

## Workflow

1. Map the touched or proposed layers and current ownership.
2. Check whether logic is or would be placed in the correct layer.
3. Identify duplication, mixed responsibilities, or vague shared abstractions.
4. Recommend the smallest structural change that creates a durable boundary.

## Output

- architecture findings
- boundary violations
- refactor recommendations
- placement corrections

## Review Questions

- Can another engineer quickly find the owner of this logic?
- Is there exactly one place to change this rule next time?
- Did the change reduce or increase cognitive load?
