# RedactGuard detection contract v2 — implementation plan

Status: planned  
Owner: RedactGuard product detection boundary  
Related benchmark plan: `daniele21/experiments/experiments/redactguard-local-anonymization/REMEDIATION_PLAN.md`

## Why this change belongs in RedactGuard

The benchmark review exposed two behaviors that are product concerns, not evaluation
concerns:

1. malformed LLM output can currently be converted to `{"pii_fields": []}`, which can
   look like a legitimate "no PII found" result;
2. the model is asked to generate presentation metadata that RedactGuard already knows,
   increasing output size and truncation risk.

RedactGuard must own the canonical PII policy, prompt/output contract, parsing,
segmentation and span-resolution semantics. External evaluations must consume that
contract rather than reimplementing it.

## Target contract

Introduce a versioned contract, initially:

```text
redactguard-detection-v2
```

The contract covers:

- active PII type definitions;
- prompt instructions;
- model-facing output schema;
- analysis-unit segmentation;
- deterministic value-to-span resolution;
- output/failure taxonomy;
- derived presentation/redaction fields.

## Model-facing output

Prefer the smallest useful model response:

```json
{
  "pii_fields": [
    {
      "pii_type": "private_person",
      "value": "Mario Rossi"
    }
  ]
}
```

The model should not generate values that the application can derive deterministically.

Derive in RedactGuard:

- `field_name` from the PII definition label;
- `field_description` from the PII definition;
- `redacted_value` from the placeholder policy.

## Failure semantics

A valid empty result and an inference failure are different states.

Required internal states:

```text
success
transport_error
backend_error
invalid_json
invalid_schema
truncated_output
span_resolution_warning
```

Malformed output must never be transformed into a normal `has_pii=false` response.

Failed inference must not be cached as a successful detection.

## Typed inference evidence

Add a typed internal result carrying:

- model;
- status;
- raw final content where locally safe;
- HTTP/backend error category;
- finish/termination reason;
- input/output tokens when available;
- latency;
- parsed item count;
- resolved/unresolved item count;
- cache hit.

The user-facing API may expose only safe diagnostics while retaining richer local
evidence for debugging.

## Schema validation

Define the model response with a typed/Pydantic schema and validate after every
inference.

Validate at minimum:

- top-level JSON object;
- `pii_fields` is an array;
- each item has an allowed `pii_type`;
- each `value` is a non-empty string.

Use Korgis structured-output constraints when supported, but application-side
validation remains mandatory.

## Segmentation

Page-level analysis remains the normal RedactGuard semantic unit.

For unusually large pages, add deterministic sub-chunking:

```text
page
  -> bounded chunks
  -> LLM detection
  -> chunk-local span resolution
  -> map to page offsets
  -> de-duplicate overlap
  -> merged PageAnalysisResult
```

Chunk size and overlap must be configuration-driven and included in the detection
contract identity.

## Policy review

Before freezing v2, explicitly decide how the product treats:

- business VAT numbers;
- invoice numbers;
- customer/record identifiers;
- transaction/event dates;
- standalone locations;
- public company/contact information.

Each category should be documented as one of:

```text
always sensitive
contextually sensitive
not RedactGuard PII
```

Benchmark gold must follow this policy; product policy must not be changed merely to
increase benchmark scores.

## Required code areas

Expected implementation areas:

- `anonimizer/services/prompt_builder.py`
  - compact output instructions;
  - contract version.
- `anonimizer/services/pii_detector.py`
  - typed inference response;
  - termination/error handling;
  - segmentation orchestration;
  - deterministic derived fields.
- `anonimizer/utils/json_utils.py`
  - remove silent empty fallback;
  - strict/typed parse errors.
- `anonimizer/utils/span_utils.py`
  - explicit resolution diagnostics;
  - chunk-offset mapping helpers where needed.
- `anonimizer/domain/models.py`
  - response schema;
  - inference/detection status models.
- `anonimizer/config.py`
  - output/chunk budgets and contract-visible configuration.
- PII profile YAML files
  - only after policy decisions are made.

Keep these responsibilities modular; do not turn `pii_detector.py` into a monolithic
module. Split inference transport, output parsing/validation and span resolution if the
implementation grows materially.

## Test gates

Before merging v2:

1. invalid JSON is a typed failure;
2. wrong schema is a typed failure;
3. `{"pii_fields":[]}` remains a valid successful response;
4. failed inference is not cached as success;
5. repeated values resolve deterministically;
6. unresolved values remain observable;
7. long-page chunking maps offsets correctly;
8. overlapping chunks do not duplicate final findings;
9. derived field metadata is deterministic;
10. existing normal page-level analysis behavior remains backward-compatible at the API
    level where possible.

## Rollout order

### Phase A — safety first

Implement typed parsing/failure semantics and stop silent zero-PII fallback.

### Phase B — compact contract

Move to the minimal model-facing schema and deterministic derived fields.

### Phase C — observability

Capture termination, usage, latency and resolution diagnostics.

### Phase D — long-input robustness

Add bounded page sub-chunking.

### Phase E — policy freeze

Resolve ambiguous PII categories, version the final profile semantics and publish the
contract snapshot consumed by the benchmark.

## Boundary with experiments

RedactGuard does **not** own:

- benchmark gold;
- recall/precision/leakage scoring;
- model ranking/comparison;
- benchmark preflight orchestration;
- experiment dashboard/history.

Those remain in `daniele21/experiments`.

RedactGuard should expose/export enough deterministic contract material for the
experiment to pin a reproducible snapshot.

## Boundary with Korgis

RedactGuard must handle Korgis failures correctly but should not own backend-specific
compatibility logic.

If experiments reproduce a Qwen/`llama_server` structured-output incompatibility,
that runtime issue is fixed in Korgis and covered there with an attributable compatibility
test.
