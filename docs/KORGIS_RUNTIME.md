# Korgis runtime contract

RedactGuard delegates **all local model runtime responsibilities** to Korgis. It must not embed `local_llm_server`, `llama-cpp-python`, a GGUF downloader, or a private model lifecycle implementation.

## Tested baseline

- repository: `daniele21/korgis`
- ref: `dev`
- commit: `26a161dc0ef89a133c7a076d3a31544a274c1469`
- runtime identity protocol: `local-llm-identity-v1`

This revision is the compatibility baseline because it includes the recent local Qwen3.5 Q4_K_M registry additions used by the RedactGuard benchmark.

## Runtime boundary used by RedactGuard

Public/read-only and inference paths:

```text
GET  /health
GET  /status
GET  /v1/models
GET  /v1/runtime/identity
POST /v1/chat/completions
```

Managed desktop mode may additionally enable Korgis administrative control-plane routes for model lifecycle and resource-policy inspection:

```text
GET  /api/v1/models/registry
POST /api/v1/models/load
POST /api/v1/models/activate
DELETE /api/v1/models/{model}
GET  /api/v1/resources
```

External/developer mode must remain usable without assuming administrative access.

## Default runtime configuration

```text
KORGIS_BASE_URL=http://127.0.0.1:1235/v1
KORGIS_MODEL=nemotron-nano-4b
```

Start Korgis separately:

```bash
uv run --frozen local-llm download nemotron-nano-4b
uv run --frozen local-llm serve --model nemotron-nano-4b --no-download
```

For PII extraction RedactGuard requests JSON output, temperature 0, and disables thinking traces.

## Ownership boundary

| Concern | RedactGuard | Korgis |
|---|:---:|:---:|
| PII taxonomy and custom definitions | ✅ | |
| PII prompt | ✅ | |
| PDF extraction / preprocessing | ✅ | |
| deterministic value → source-span resolution | ✅ | |
| review / redaction / export | ✅ | |
| model registry | | ✅ |
| artifact download / verification | | ✅ |
| inference backend | | ✅ |
| model residency / lifecycle | | ✅ |
| runtime identity | | ✅ |

## Failure behavior

- If Korgis is unreachable, RedactGuard reports `llm_status=offline`.
- If Korgis is reachable but the configured key is not resident, RedactGuard reports `llm_status=model_not_resident`.
- RedactGuard does not silently substitute another model.
- The UI provides the Korgis commands needed to restore the expected runtime.

## Benchmark alignment

The companion experiment is `daniele21/experiments/experiments/redactguard-local-anonymization`. It uses the same Korgis HTTP boundary and freezes the RedactGuard prompt/taxonomy/post-processing contract for reproducible model comparisons.


## Request resource evidence

RedactGuard consumes the additive Korgis request evidence protocol `korgis-request-evidence-v1` when present. The contract is optional for backwards compatibility: inference content remains authoritative even when request resource evidence is unavailable.

RedactGuard preserves these distinctions:

- application-boundary latency measured by RedactGuard is not relabelled as backend-only latency;
- Korgis measured process-tree CPU/RAM is not confused with configured resource budgets;
- `execution_source=cache` contributes no new inference CPU/RAM cost;
- RAM peaks are aggregated with `max`, never by summation;
- attribution quality such as `process_global` remains visible and is not promoted to request-exclusive ownership.

Korgis measures and qualifies resource evidence. RedactGuard consumes, stores, aggregates and presents it; RedactGuard does not implement a second CPU/RAM sampler.


## Managed desktop packaging

Managed mode preserves the Korgis process boundary instead of importing Korgis into the RedactGuard backend.

Build-time packaging uses an explicitly supplied Korgis wheel plus SHA-256:

```text
KORGIS_WHEEL=/path/to/local_llm_server-<version>-py3-none-any.whl
KORGIS_WHEEL_SHA256=<expected digest>
```

`scripts/build-sidecar.sh` installs that artifact into a separate `resources/korgis/venv`. The RedactGuard API remains in its own environment. The Tauri process starts Korgis on a dynamically allocated loopback port, waits for Korgis health, then starts the RedactGuard API with the resolved `KORGIS_BASE_URL`.

In development, managed mode requires an explicit `KORGIS_PYTHON` pointing to a Python environment containing the desired Korgis build. External mode remains the default until a released Korgis artifact includes the required request-evidence contract and packaged desktop E2E passes.

The model is not bundled by this mechanism. Model acquisition, verification, cache location and lifecycle remain Korgis responsibilities.

Managed mode fails closed when Korgis does not advertise both the expected runtime identity semantics and `korgis-request-evidence-v1`; external mode remains backwards-compatible with a legacy Korgis instance and simply reports request resource evidence as unavailable.
