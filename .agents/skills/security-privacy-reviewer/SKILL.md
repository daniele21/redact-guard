---
name: security-privacy-reviewer
description: Review a change for baseline security and privacy risks, including auth, data handling, logging, retention, and GDPR-aware engineering concerns.
---

# Security Privacy Reviewer

Use this skill when a change touches auth, user data, logs, storage, integrations, or sensitive workflows.

## Inputs

- changed surfaces
- data handled
- auth or access-control context
- logging, storage, and external dependency impact

## Workflow

1. Identify the data classes and entrypoints affected.
2. Review auth/authz and least-privilege implications.
3. Check logging, retention, export, deletion, and vendor implications.
4. Flag gaps that need product, legal, or security escalation.

## Output

- security findings
- privacy or GDPR-aware risks
- required remediations
- open escalation questions

## Review Questions

- Is any sensitive data being over-collected, over-retained, or over-exposed?
- Are new access paths sufficiently constrained?
- Could logs, traces, or alerts leak sensitive values?
