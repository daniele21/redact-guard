# Review Checklists

## Universal Change Checklist

- Does the change solve the root cause rather than only the symptom?
- Is the logic placed in the right architectural layer?
- Are tests adequate for the changed behavior?
- Are relevant docs updated?
- Are security/privacy implications understood?
- Are GDPR artifacts current for personal-data changes?
- Has third-party code or telemetry been checked for unintended data leakage?
- Are observability and cost impacts understood?

## Bug Fix Checklist

- Symptom is clearly described
- Root-cause hypothesis is explicit
- Local vs systemic scope is identified
- Regression protection exists or is documented as missing
- Any workaround is clearly marked as temporary
- Retention, deletion, export, or logging implications are checked if personal data is involved
- Processor notification or breach-handling implications are checked if personal data is involved

## Feature Checklist

- Product goal and users are clear
- Functional and non-functional requirements are captured
- Affected data is identified
- Lawful basis and privacy obligations are identified when relevant
- Processor/controller role is explicit when personal data is involved
- UX states are covered
- Docs, tests, and rollout impacts are listed

## Release Checklist

- Deployment steps are current
- Rollback path is known
- Monitors and alerts exist or are listed as gaps
- Migration compatibility is understood
- Changelog is updated
- Breach and controller-notification paths are current when personal data is involved
