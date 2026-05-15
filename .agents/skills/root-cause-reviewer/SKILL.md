---
name: root-cause-reviewer
description: Review a bug fix, workaround, or refactor to determine whether it solves the root cause or only the visible symptom, and recommend the right remediation depth.
---

# Root Cause Reviewer

Use this skill when a change fixes a bug, mitigates an incident, or introduces a workaround.

## Inputs

- issue or bug description
- proposed diff or implementation plan
- affected files or layers
- logs, traces, or tests if available

## Workflow

1. Restate the symptom and affected behavior.
2. Identify the earliest plausible failure point.
3. Classify the problem as local or systemic.
4. Check whether the proposed fix changes the causal layer or only blocks the symptom.
5. Recommend regression prevention: tests, observability, docs, or ADR updates.

## Output

- suspected root cause
- local vs systemic classification
- adequacy of the proposed fix
- recommended remediation depth
- recurrence prevention actions

## Review Questions

- What actually allowed this issue to happen?
- Does the fix address the cause or hide the effect?
- Is this an acceptable temporary workaround or does it require structural follow-up?
