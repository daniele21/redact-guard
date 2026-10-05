# Managed Korgis Runtime and Request Evidence

Status: implementation complete; packaged REAL_ENVIRONMENT validation pending
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
| RG-3 | Add managed/external runtime mode and sidecar lifecycle | config/sidecar/Tauri startup | RG-2 | yes | DONE |
| RG-4 | Add Korgis compatibility/capability gate | health/runtime contract | RG-2 | yes | DONE |
| RG-5 | Preserve inference/cache evidence semantics through PII detection | detector/cache diagnostics | RG-1 | yes | DONE |
| RG-6 | Aggregate request -> chunk/page -> document/run evidence | domain/service aggregator + tests | RG-1, RG-5 | yes | DONE |
| RG-7 | Product UX: Local AI readiness + progressive run details | frontend types/components/routes | RG-2, RG-6 | yes | DONE |
| RG-8 | Benchmark UX: model/config/dataset resource comparison | companion Performance Lab / experiment | RG-6 | yes | DEFERRED TO OWNER |
| RG-9 | End-to-end validation and docs sync | tests/docs/packaging | RG-1..RG-7 | no | REAL_ENVIRONMENT PENDING |

## Current executable slice

`RG-9`; product implementation and repository-owned packaged E2E runner are complete for the RedactGuard-owned surface

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
- CPU average is duration-weighted by the actual Korgis CPU observation window when available, with a conservative legacy fallback only when sampling semantics are compatible;
- cache hits increment cache counters but contribute no new inference resource cost;
- mixed attribution quality is surfaced, not silently collapsed to exclusive attribution.

## Validation

- backend unit/contract tests;
- frontend typecheck/build when UI slices start;
- Rust formatting/check when sidecar lifecycle changes;
- CI is the deterministic fallback because the current agent environment cannot resolve GitHub/package network dependencies locally;
- packaged runtime behavior is validated separately from deterministic parsing/aggregation contracts;
- PR validation builds an ad-hoc signed Apple Silicon `.app` on `macos-latest`, verifies its managed-runtime layout, archives it as `tar.gz` to preserve executable permissions, and retains that archive as a bounded artifact;
- `scripts/run-managed-package-e2e.py` is the canonical representative macOS runner and retains only bounded privacy-safe evidence.

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
- PR #8 passed the complete Validate PR matrix on the merged Korgis pin (run 65): backend, frontend, Rust/Tauri lifecycle, sidecar staging, packaging-script syntax and the managed Korgis wheel contract were all PASS. Any later tracked-file edit still requires exact-head revalidation before merge.
- canonical Korgis pin: `.engineering/korgis-runtime.json` -> `809511e2ba33bfb61ab195bf32ca4152b759c293`; Korgis candidate is merged onto current `main`; exact-head FULL CI run 691 and Repository Health 383 both PASS on `809511e2ba33bfb61ab195bf32ca4152b759c293`.
- managed packaging strategy: release workflow builds the pinned Korgis wheel, verifies `korgis-request-evidence-v1`, computes SHA-256 and packages it into a separate Korgis venv. No Korgis package is imported by the RedactGuard backend, and models remain Korgis-owned durable data.
- packaged desktop defaults to managed mode; development/backend standalone defaults to external unless explicitly overridden.
- RG-8 is intentionally deferred to the existing companion Performance Lab/experiment because current RedactGuard has no canonical benchmark-UI owner. Do not create a parallel benchmark surface here.
- next discriminating action: keep exact-head automated validation green, then run `scripts/run-managed-package-e2e.py` against the built macOS `.app` with a real supported model and retain the bounded summary.

## Completion

RedactGuard-owned implementation is complete when fresh exact-head automated validation is green. Integration/release completion still requires the declared packaged REAL_ENVIRONMENT managed-runtime E2E; benchmark comparison remains owned by the companion Performance Lab rather than this app.
