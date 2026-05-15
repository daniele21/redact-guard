---
name: gdpr-privacy-reviewer
description: Review a change for GDPR-specific privacy impacts, required artifacts, and user-rights implications, including lawful basis, processor accountability, retention, subprocessors, transfers, end-of-contract handling, and DPIA triggers.
---

# GDPR Privacy Reviewer

Use this skill when a change introduces or alters personal data processing, user-rights workflows, retention behavior, subprocessors, cross-border transfers, default privacy posture, or third-party data exposure risk.

## Inputs

- feature spec, issue, or diff
- affected data flows and systems
- relevant files in `docs/04-privacy-gdpr/`
- vendors or processors involved

## Workflow

1. Identify the personal-data processing activity affected.
2. Check whether the processor or controller role is explicit and whether the processing should appear in the processor RoPA.
3. Check whether the data inventory and lawful basis are explicit.
4. Check retention, deletion, export, end-of-contract handling, and data-subject-rights impacts.
5. Check processor, subprocessor, transfer, and cleartext-access implications.
6. Check whether third-party code, tracking, or telemetry could leak personal data.
7. Check whether the change may trigger a DPIA.
8. Report missing artifacts, unresolved privacy risks, and required updates.

## Output

- GDPR artifact gaps
- processor-accountability and RoPA findings
- lawful basis and rights-handling findings
- retention, end-of-contract, subprocessor, and transfer findings
- third-party data leakage findings
- DPIA trigger assessment
- required documentation updates

## Review Questions

- Is this processing activity already recorded in the data inventory?
- Is the processor/controller role explicit enough for the client and for internal records?
- Is the lawful basis explicit enough for engineering and review?
- What happens if a user requests access, deletion, or export?
- What happens to customer data at contract termination?
- Are vendor and transfer implications documented, including any cleartext access requirement?
