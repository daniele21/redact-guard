# Subagents

This folder defines a small set of stable operational roles for delegation.

Use subagents for parallelizable or read-heavy work such as exploration, review, docs synchronization, external-doc verification, and UI debugging. Do not create a subagent for every skill.

Rules:

- keep subagents role-based, not concern-based
- let subagents apply skills from `.agents/skills/` when the task needs a specific method
- avoid one-to-one duplication between skill names and subagent names
- prefer a few stable roles over a large catalog of narrowly named agents
