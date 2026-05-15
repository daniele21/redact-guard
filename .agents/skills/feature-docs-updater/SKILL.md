---
name: feature-docs-updater
description: Identify and update the product, architecture, operational, and change-log documentation affected by a feature or behavioral change.
---

# Feature Docs Updater

Use this skill after discovery, strategy work, feature work, meaningful bug fixes, and architectural changes.

## Inputs

- diff or touched files
- feature scope
- relevant existing docs or specs

## Workflow

1. Map the behavior, architecture, operational, and planning surfaces affected.
2. Identify which docs should change, including discovery docs when project direction changes.
3. Update or recommend updates to project briefs, discovery docs, specs, pillar docs, changelog, and ADRs.
4. Ensure documentation reflects actual implemented behavior.

## Output

- documentation update list
- changed or recommended doc files
- changelog suggestion
- ADR recommendation
- project discovery doc recommendation when strategy or plan changed

## Review Questions

- What will be stale if documentation is not updated now?
- Does the change affect user-facing flows, operations, or architectural understanding?
