---
name: finops-observability-reviewer
description: Review a change for cost visibility, telemetry quality, provider usage, and expensive workflow risks in a B2B SaaS system.
---

# FinOps Observability Reviewer

Use this skill when a change affects external providers, AI workloads, storage, batch jobs, or critical production flows.

## Inputs

- changed workflows
- provider or infrastructure usage
- logging, metrics, or trace changes
- expected traffic or usage assumptions

## Workflow

1. Identify direct cost drivers and growth risks.
2. Check what telemetry exists to observe those costs and behaviors.
3. Check whether attribution by tenant, feature, or workflow is needed.
4. Recommend guardrails such as caching, batching, rate limits, or alerts.

## Output

- cost hotspots
- missing logs, metrics, or traces
- attribution gaps
- optimization opportunities

## Review Questions

- What part of this change could get expensive at scale?
- How will the team notice a cost or latency regression?
- Is there enough telemetry to attribute the impact?
