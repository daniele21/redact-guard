---
name: test-coverage-guardian
description: Review a change for missing unit, integration, and regression coverage, and identify the minimum reliable verification plan.
---

# Test Coverage Guardian

Use this skill when a change adds logic, alters workflows, or fixes bugs that could regress.

## Inputs

- diff or proposed implementation
- affected flows
- existing test coverage if known

## Workflow

1. Identify behavior changes and risk areas.
2. Map the cheapest reliable test coverage for each risk.
3. Check for missing unit, integration, or regression tests.
4. Provide a concrete verification checklist.

## Output

- missing tests
- missing edge cases
- regression risks
- verification checklist

## Review Questions

- What behavior could break silently?
- Is the coverage proportionate to the risk?
- Is manual verification being used where automated coverage is required?
