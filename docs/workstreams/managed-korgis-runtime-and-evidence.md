# Managed Korgis Runtime and Request Evidence

Status: active
Owner: RedactGuard runtime integration
Read when: changing Korgis lifecycle integration, inference diagnostics, resource evidence, benchmark aggregation or Local AI status UX

## Goal

Make Korgis the single managed local-AI execution authority for RedactGuard and consume Korgis request evidence so RedactGuard can show and aggregate model quality, latency and resource use without implementing model lifecycle or CPU/RAM sampling itself.

## Classification

- Product: PRODUCT_FEATURE
- Delivery: ITERATION -> INTEGRATION
- Validation: STRONG
- Execution: REMOTE_AUTOMATED for deterministic validation when local dependencies are unavailable; REAL_ENVIRONMENT only for packaged/local runtime behavior that cannot be proven in CI

## Ownership

Korgis owns model registry/artifacts, runtime lifecycle, backend execution, scheduling/resource policy, runtime identity and resource telemetry.

RedactGuard owns PII policy/prompts, document processing, deterministic span resolution, review/redaction/export, cache semantics, aggregation and user-facing interpretation of Korgis evidence.

## Invariants

- No embedded llama.cpp/MLX/GGUF lifecycle returns to RedactGuard.
- No RedactGuard CPU/RAM sampler.
- No silent model fallback.
- Cache hit does not masquerade as new inference work.
- Missing Korgis evidence remains unavailable.
- Estimated/configured/measured values remain distinguishable.
- Run aggregation never sums RAM peaks across requests.
- PII content never enters resource telemetry or operational logs.

## Work graph

| ID | Work | Owns/writes | Depends on | Parallel | State |
| --- | --- | --- | --- | --- | --- |
| RG-1 | Add typed Korgis request-evidence contract and parse additive response fields | `domain/detection.py`, `services/korgis_client.py`, tests | — | yes | DONE |
| RG-2 | Evolve Korgis client into runtime adapter for health/identity/models/status/resources | runtime integration service + tests | — | yes | DONE |
| RG-3 | Add managed/external runtime mode and sidecar lifecycle | config/sidecar/Tauri startup | RG-2 | yes | ACTIVE |
| RG-4 | Add Korgis compatibility/capability gate | health/runtime contract | RG-2 | yes | DONE |
| RG-5 | Preserve inference/cache evidence semantics through PII detection | detector/cache diagnostics | RG-1 | yes | DONE |
| RG-6 | Aggregate request -> chunk/page -> document/run evidence | domain/service aggregator + tests | RG-1, RG-5 | yes | ACTIVE |
| RG-7 | Product UX: Local AI readiness + progressive run details | frontend types/components/routes | RG-2, RG-6 | yes | ACTIVE |
| RG-8 | Benchmark UX: model/config/dataset resource comparison | benchmark UI/data projections | RG-6 | yes | READY |
| RG-9 | End-to-end validation and docs sync | tests/docs/packaging | RG-1..RG-8 | no | BLOCKED |

## Current executable slice

`RG-3 + RG-6 + RG-7`; RG-1/RG-2/RG-4/RG-5 are implemented

Acceptance:

- RedactGuard accepts Korgis `korgis-request-evidence-v1` without making it mandatory for older compatible runtimes;
- typed diagnostics preserve request id, execution source, RAM, CPU, sampling and attribution;
- malformed optional evidence cannot corrupt the PII result;
- inference latency measured by RedactGuard remains application-boundary latency and is not confused with Korgis backend timings;
- cache semantics have an explicit execution source before aggregation is added.

## Managed runtime target

```text
RedactGuard
   |
   +-- managed (default desktop)
   |     start/discover Korgis -> compatibility -> ensure/load approved model -> ready
   |
   +-- external (advanced/dev)
         KORGIS_BASE_URL -> compatibility/readiness only
```

Managed mode still uses a separate Korgis process. RedactGuard must not import/copy Korgis inference internals.

## Evidence aggregation rules

- latency/tokens may sum only when semantics make that meaningful;
- RAM peak is max over applicable request evidence, never sum;
- CPU average is duration-weighted only when samples are comparable;
- cache hits increment cache counters but contribute no new inference resource cost;
- mixed attribution quality is surfaced, not silently collapsed to exclusive attribution.

## Validation

- backend unit/contract tests;
- frontend typecheck/build when UI slices start;
- Rust formatting/check when sidecar lifecycle changes;
- CI is the deterministic fallback because the current agent environment cannot resolve GitHub/package network dependencies locally;
- packaged runtime behavior is validated separately from deterministic parsing/aggregation contracts.

## Documentation destinations

- `docs/KORGIS_RUNTIME.md`: stable integration/ownership contract
- `docs/00-discovery/02-delivery-plan.md`: macro delivery sequencing
- product/runtime UX docs when UI changes land
- tests: executable evidence parsing and aggregation truth

## Resume checkpoint

- base: `main@30cb639cd869498d93a7540c2f01d0983c98e842`
- branch: `feature/managed-korgis-evidence`
- old `feature/korgis-runtime-integration` intentionally not reused because it is materially diverged from main.
- confirmed: main already delegates inference to Korgis and has a typed `LLMInferenceResult`, but only consumes content/token usage and application latency.
- deterministic evidence through compatibility/aggregation foundation passed on PR #8 before the managed-sidecar slice; latest managed-sidecar HEAD still requires fresh CI.
- cross-repo wheel gate pins Korgis candidate `eae6d63380cacd03e87c04ddd09f1825088c0149`, builds its wheel in CI, installs it without dependencies in an isolated venv and verifies `korgis-request-evidence-v1`.
- managed packaging strategy: a separate Korgis venv built from an explicitly supplied wheel + SHA-256; no Korgis package is imported by the RedactGuard backend, and models remain Korgis-owned external durable data.
- external remains the configuration default until a released Korgis artifact contains the request-evidence contract and packaged E2E is green.
- next discriminating action: validate the managed-sidecar/build slice, then add run/benchmark projections and packaged-runtime E2E.

## Completion

Complete only when runtime lifecycle, compatibility, evidence parsing/aggregation, cache semantics, UX, tests, docs and packaging agree. A running app or an existing branch alone is not completion.
