# Korgis runtime contract

RedactGuard delegates **all local model runtime responsibilities** to Korgis. It must not embed `local_llm_server`, `llama-cpp-python`, a GGUF downloader, or a private model lifecycle implementation.

## Tested baseline

Released/legacy baseline:

- repository: `daniele21/korgis`
- ref: `dev`
- commit: `26a161dc0ef89a133c7a076d3a31544a274c1469`
- runtime identity protocol: `local-llm-identity-v1`

Integration candidate:

- repository: `daniele21/korgis`
- commit: `809511e2ba33bfb61ab195bf32ca4152b759c293`
- request evidence protocol: `korgis-request-evidence-v1`
- RedactGuard CI builds a wheel from this exact commit and verifies the packaged contract before managed-runtime integration is considered deterministic-ready.

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

The bundled managed runtime deliberately **does not enable** Korgis' optional administrative routes: they have no integrated authentication. RedactGuard uses only public model discovery, public identity and explicit inference. Korgis itself still owns acquisition and lifecycle. Future controlled activation requires an authenticated/isolated management boundary.

External/developer mode remains usable without administrative access.

## Runtime modes and defaults

The standalone backend/development configuration remains conservative:

```text
KORGIS_MODE=external
KORGIS_BASE_URL=http://127.0.0.1:1235/v1
KORGIS_MODEL=nemotron-nano-4b
```

In external mode, start Korgis separately:

```bash
uv run --frozen local-llm download nemotron-nano-4b
uv run --frozen local-llm serve --model nemotron-nano-4b --no-download
```

The packaged desktop release defaults to `managed` when no explicit `KORGIS_MODE` override is supplied. Development builds default to `external` so the normal dev loop does not unexpectedly start/download a model. Either mode can still be selected explicitly.

### Persisted model and restart contract

The Model Center stores a versioned, local `model-selection.json` file. The active model shown to the user is Korgis' public `GET /v1/models` **model ID**. RedactGuard resolves the distinct **registry startup key** using the matching model entry of `GET /v1/runtime/identity` and stores both identities. It rejects selection if the mapping is absent or ambiguous.

When starting a managed Tauri release, the Rust owner reads the exact same local preference path as the Python backend (`~/Library/Application Support/RedactGuard/model-selection.json`, overridable via `REDACTGUARD_MODEL_PREFERENCE_FILE`). The launcher passes the stored `startup_key` to Korgis' `serve --model`, while the document analyzer continues to use the saved public `model` ID for chat inference and cache keys. The already-open document retains its frozen model. If no preference has ever been saved, the launcher uses the configured default.

Corrupted/unknown preference versions and malformed model identifiers fail closed; they do not silently reset the saved selection. Legacy v1 records containing only `model` continue to be read and may fail Korgis CLI startup when their model ID is not a registry key; reselecting the desired resident model migrates the file to the explicit two-identity record.

A preference does not imply the model is still downloadable, compatible or resident. Korgis startup failures and any missing residency must remain visible rather than silently substituting a model. Mac device confirmation remains pending.

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
| per-request CPU/RAM measurement + provenance | | ✅ |
| aggregation / product interpretation of resource evidence | ✅ | |

## Failure behavior

- If Korgis is unreachable, RedactGuard reports `llm_status=offline`.
- If Korgis is reachable but the configured key is not resident, RedactGuard reports `llm_status=model_not_resident`.
- Managed mode reports `llm_status=runtime_incompatible` when runtime identity or `korgis-request-evidence-v1` capability does not satisfy the pinned contract.
- RedactGuard does not silently substitute another model or silently downgrade a managed runtime.
- External mode provides restoration guidance; packaged managed mode owns startup of the separate local Korgis process.

## Benchmark alignment

The companion experiment is `daniele21/experiments/experiments/redactguard-local-anonymization`. It uses the same Korgis HTTP boundary and freezes the RedactGuard prompt/taxonomy/post-processing contract for reproducible model comparisons.


## Request resource evidence

RedactGuard consumes the additive Korgis request evidence protocol `korgis-request-evidence-v1` when present. The contract is optional for backwards compatibility: inference content remains authoritative even when request resource evidence is unavailable.

RedactGuard preserves these distinctions:

- application-boundary latency measured by RedactGuard is not relabelled as backend-only latency;
- Korgis measured process-tree CPU/RAM is not confused with configured resource budgets;
- `execution_source=cache` contributes no new inference CPU/RAM cost;
- RAM peaks are aggregated with `max`, never by summation;
- average CPU is duration-weighted using `cpu_observation_ms` when present and is combined only across compatible sampling/attribution semantics;
- memory and CPU provenance are retained separately through page/document summaries;
- attribution quality such as `process_global` remains visible and is not promoted to request-exclusive ownership.

Korgis measures and qualifies resource evidence. RedactGuard consumes, stores, aggregates and presents it; RedactGuard does not implement a second CPU/RAM sampler.


## Managed desktop packaging

Managed mode preserves the Korgis process boundary instead of importing Korgis into the RedactGuard backend.

The canonical pin is `.engineering/korgis-runtime.json`. Validation and release workflows both read that file rather than maintaining independent Korgis SHAs.

Build-time packaging uses an explicitly supplied Korgis wheel plus SHA-256:

```text
KORGIS_WHEEL=/path/to/local_llm_server-<version>-py3-none-any.whl
KORGIS_WHEEL_SHA256=<expected digest>
```

`scripts/build-sidecar.sh` installs that artifact into a separate `resources/korgis/venv`. The RedactGuard API remains in its own environment. The Tauri process starts Korgis on a dynamically allocated loopback port, waits for Korgis health, then starts the RedactGuard API with the resolved `KORGIS_BASE_URL`.

In development, managed mode requires an explicit `KORGIS_PYTHON` pointing to a Python environment containing the desired Korgis build. Development defaults to external mode; packaged desktop releases default to managed mode. The release workflow builds the wheel from the exact pinned Korgis source commit, verifies the request-evidence protocol, calculates SHA-256, and passes wheel + checksum + source commit into `build-sidecar.sh`.

The bundle manifest records package version, wheel SHA-256 and Korgis source commit. The model itself is not bundled by this mechanism. Model acquisition, verification, cache location and lifecycle remain Korgis responsibilities.

Managed mode fails closed when Korgis does not advertise both the expected runtime identity semantics and `korgis-request-evidence-v1`; external mode remains backwards-compatible with a legacy Korgis instance and simply reports request resource evidence as unavailable.

### Representative packaged managed-runtime E2E

The repository-owned macOS runner exercises the actual packaged sidecar and packaged Korgis environment without retaining document content or findings:

\`\`\`bash
E2E_DIR="$HOME/.redactguard/evidence/$(date +%F)-managed-package"

python scripts/run-managed-package-e2e.py \
  --app "/path/to/RedactGuard.app" \
  --model "<supported-model-key>" \
  --redactguard-source-commit "$(git rev-parse HEAD)" \
  --expected-korgis-commit "$(python -c 'import json; print(json.load(open(".engineering/korgis-runtime.json"))["commit"])')" \
  --output-dir "$E2E_DIR"
\`\`\`

The runner starts the packaged Korgis launcher and packaged RedactGuard API on temporary loopback ports, verifies the package manifest/source pin, uploads a generated one-page synthetic PDF, executes one real PII analysis, verifies document-level CPU/RAM evidence and shuts both packaged processes down. Raw logs remain local; the bounded summary retains no document content, findings, private paths or PIDs.

This is REAL_ENVIRONMENT evidence: CI proves the deterministic packaging/orchestration contract, while this runner proves the packaged managed runtime actually executes on representative macOS hardware with a real supported model.
