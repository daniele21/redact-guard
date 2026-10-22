# Local document jobs and Qwen model selection (candidate)

Status: **implementation candidate**, not integrated/released. Owner: RedactGuard
document lifecycle and GUI; Korgis remains the runtime/registry owner.

## Product and acceptance boundary

The user must be able to leave a document review while analysis is running,
inspect another PDF or edit PII policy, then return to the correct document to
inspect results. A queue is a backend operation, not a React component promise.
Existing redaction attestations, per-document policy/model snapshots, and
fail-closed export rules remain authoritative.

- **Job ownership:** the backend holds an in-process FIFO single-worker queue,
  up to 25 pending jobs, with a unique ID, per-page progress, bounded history,
  safe cancel-between-pages semantics, completed-page results and error states.
  The current page may finish after the user requests cancellation.
- **Privacy:** job *status* contains no source text, findings, prompts, paths
  or model output; results remain available only through the existing local
  API for the current process. The backend does not write a queue to disk.
- **Navigation:** UI observes jobs from a top-level hook rather than a
  ReviewStep instance. A global activity indicator survives workspace
  navigation; completed results and summaries go to the original document ID.
  Reanalysis does not convert incomplete review into permission to export.
- **Lifecycle limitation:** the queue is deliberately **not persisted**.
  Application quit, crash, backend restart, or frontend reload is not a
  resumable-job guarantee. Close requests best-effort cancellation. Persisted
  encrypted document queues require a separate product/privacy decision,
  cleanup/TTL recovery evidence and native process-lifecycle acceptance.
- **Concurrency:** one inference work item at a time; no independent model
  resource-limit claim. Korgis retains runtime resource admission and metrics.
- **Existing sync API:** previous synchronous page and batch analysis routes
  remain for compatibility and for packaged deterministic tests. The desktop
  review uses the new job endpoints.

## Korgis Qwen catalog

Qwen3.5-4B-Q4_K_M and Qwen3.5-9B-Q4_K_M are already in the **pinned**
Korgis registry. Registry presence is not model download or residency.

The new public `/v1/runtime/catalog` endpoint is implemented in Korgis
candidate [PR #251](https://github.com/daniele21/korgis/pull/251). It exposes
path-free installed/resident text-model states. RedactGuard's Model Center can
show both downloaded and missing registered choices without enabling the
unauthenticated Korgis administrative API. Selection is permitted only for a
Korgis-confirmed downloaded model. The preferred public model ID and exact
startup registry key are persisted atomically. Duplicate public model IDs mapped
to multiple registry startup keys are excluded rather than arbitrarily selected. A nonresident selection does
**not** hot-swap or unload a live model: user must restart RedactGuard; jobs
already started keep their immutable per-document model and PII policy.

No implicit model download, replacement of the selected model, or unsupported
PII-accuracy/hardware ranking is claimed.

## Regression and validation

- Backend worker tests: queued/resident separation, duplicate document
  admission, cancel-between-pages, invalid pages, error masking, no PII in
  progress status.
- Model catalog tests: downloaded Qwen selection, disabled missing artifacts,
  path-free registry projection, default-key/public-ID mapping.
- CI must validate exact RedactGuard HEAD and exact pinned Korgis candidate:
  Python backend, frontend typecheck/build, Rust/Tauri, hosted Apple Silicon
  packaging and browser smoke.
- Representative Mac must recheck packaged model inference, CPU/RAM evidence,
  Qwen 4B/9B **only if locally installed**, background analysis while moving
  between Document/Policy/Models, cancel after current page, restart model
  selection, and graceful process shutdown. Do not call CI a real-device pass.

## Risk/remaining scope

Current backend sessions and job results are in memory; access to the local
HTTP API remains governed by the existing local app transport boundary.
Korgis loopback-origin hardening is separately tracked in
[Korgis #229](https://github.com/daniele21/korgis/issues/229).
The Qwen catalog changes are a public Korgis contract (STRONG);
Mac packaging and desktop acceptance remain REAL_ENVIRONMENT / release gates.

## Korgis lifecycle and catalog diagnostics (2026-10-22)

Tauri development starts RedactGuard's FastAPI backend but **defaults to
external** Korgis; the packaged desktop defaults to **managed** Korgis with a
pinned, separately bundled runtime. No implicit Korgis installation or model
download takes place in development.

The model API now distinguishes `discovery_available` (resident `/v1/models`)
from `catalog_available` (registered-model `/v1/runtime/catalog`). A legacy
runtime can expose identity and resident discovery but no registered catalog;
its missing endpoint must never be represented as an empty collection of
installed models. With the pinned Korgis catalog, RedactGuard shows Qwen and
other compatible text choices including not-yet-downloaded ones; it does not
activate/download them silently or use unauthenticated admin endpoints.

A saved nonresident choice is loaded on restart **only in managed mode**;
external runtime activation belongs to the operator of that Korgis process.
Mac installed-app acceptance must verify the pinned model catalog, actual
residency/inference and owned process cleanup. Synthetic browser coverage does
not prove that the user's currently connected external Korgis has the pin.
