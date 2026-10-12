# Adaptive Workspace — desktop UX implementation

Status: ITERATION — implementation in progress on feature branch (not integrated or released)
Date: 2026-10-12
Owner: RedactGuard Desktop product and UI. Korgis remains the AI runtime owner.

## Product intent

Users: professionals handling sensitive PDF documents before sharing or downstream AI use.
Core jobs:
1. Import a PDF with one obvious action.
2. Inspect reusable domain PII definitions and customize what detection looks for.
3. Understand the active local AI model without selecting it for each import.
4. Review detected occurrences in context and export after checking the result.

Values: local-document privacy, maintainable configurable PII taxonomy and evidence-based hardware-aware model choice. The third value still requires backend/runtime contracts.

## UI slice A — implemented in this branch

- Adaptive dark desktop shell with compact navigation, not marketing landing or permanent stepper.
- Home: single PDF import, current profile and model, explicit PDF-only and Markdown-output limitation.
- PII library: API-backed built-in definitions, global custom definitions, plain-language editor, original vs override, reset.
- Data truth: built-in is not independently validated; no invented hardware metrics; Korgis offline does not block the taxonomy UI.
- Model Center for actual configured Korgis identity/readiness; no cosmetic selection pretending to switch inference.
- Privacy: local lifecycle explanation and real backend cache-clear action.
- Review: document by default, masked inspector values, keyboard-usable source highlights, export blocked on incomplete/warning/failed/unresolved analysis and pages not visited; final explicit confirmation.
- Existing Python analyzer, findings/decisions and Markdown export remain owners.

## Boundaries and invariants

- RedactGuard owns PII policy, document workflow and reviewer decisions; Korgis owns model acquisition, activation, residency and runtime resource evidence.
- Current profile_service.py merges custom PII globally by machine key. Same-key custom definition overrides a YAML built-in across profiles containing it, but original YAML is preserved. This is a GLOBAL override, not a versioned policy-scoped variant; UI states that.
- Profile selection persists only as a UI preference for future uploads. The current document stores its original profile.
- The configured model remains determined by backend config/Korgis. UI must not offer a nonfunctional model selector. No silent model substitution.
- Clearing app cache via DELETE /api/cache does not delete saved PII, exported files or Korgis model artifacts.
- Source review needs the raw document to be visible in context; sidebar displays masked values.
- PDF is the only supported input and Markdown is the only supported protected-document output today.

## Next product feature slices

**B — Policy/version contract (STRONG):** immutable base catalog, versioned policy-scoped overrides, activation semantics, backward-compatible migration of global definitions, immutable resolved policy snapshot/hash on each job, tests and evidence-qualified validation states.

**C — Model preference contract (STRONG):** Korgis-owned listing/activation/readiness and lifecycle, persist the choice in a canonical app owner and snapshot it on each job; hardware compatibility only where measured; PII quality evidence from the RedactGuard anonymization benchmark with version/model/dataset and test host provenance.

**D — Multiple PDF sessions (STRONG):** backend job registry for independent files, explicit per-file failures, snapshots, reviewer attestation with backend enforcement, explicit partial-export policy; no frontend-only fake batch queue.

**E — Device/release (FULL + REAL_ENVIRONMENT where required):** PR #8 representative Korgis macOS runtime gate, accessibility/keyboard and viewport checks, moderated user tests, signed/notarized macOS distribution. Faithful redacted-PDF export remains a separate product capability.

## Acceptance for this slice

- No repeated model selection on import.
- Runtime unavailable: policy library remains usable with clear status and no silent inference fallback.
- Built-in definitions can be overridden and restored via actual APIs; UI labels global scope and avoids unearned validated claims.
- Unsupported/multiple imports are rejected explicitly.
- Review blocks export on incomplete/failed/unresolved analysis and requests human confirmation.
- No raw sensitive values in inspector list by default; source remains reviewable contextually.
- Dark by default, light preference accessible in Privacy, responsive compact navigation, semantic tokens and accessible form controls.

## Independent axes

Product: FEATURE/STRATEGIC overall, LOCAL/FEATURE for this UI-only slice.
Delivery: ITERATION.
Validation: SCOPED frontend now, STRONG for upcoming persistence/lifecycle/export contracts, FULL at release.
Execution: REMOTE_AUTOMATED GitHub CI as necessary; real macOS evidence remains REAL_ENVIRONMENT.

This branch must not be described as integration complete, full UX implementation, benchmark qualified or release ready merely because UI code and PR CI exist.

## Resident-model preference increment (stacked, 2026-10-12)

**Implementation:** `feature/adaptive-resident-model-choice` (depends on UI PR #9).
This is a bounded subset of issue #11, not yet the complete hardware-aware Model Center.

- Korgis public `GET /v1/models` remains the canonical owner of resident-model discovery. RedactGuard does not call or expose unauthenticated Korgis administrative mutation endpoints.
- Local RedactGuard `GET /api/local-models` reports selected preference and resident ids; `PUT /api/local-models/selection` accepts only identifiers returned by live residency discovery, rejecting unavailable/invalid options. Offline is explicitly distinguished from an empty catalog.
- Selected model is atomically saved with private file permissions in a local user-configuration directory (override via `REDACTGUARD_MODEL_PREFERENCE_FILE`). Missing preference uses configured legacy default; corrupted data **does not** silently reset.
- Upon PDF upload, model key is frozen in the in-memory document session and returned to the frontend. Page inference requests and cache keys use that frozen selection, so a later choice does not silently swap models on an existing document.
- The UI lists only resident models and shows unqualified benchmark/hardware values as **not available**. A nonresident preference remains saved but not ready; Korgis must be configured externally to load additional models.
- Full system/model identity, measured hardware recommendations, signed benchmark provenance and automatically guided model loading still belong to the remainder of issue #11.
- Korgis can evict/unload a selected resident model after selection. Subsequent inference must **fail explicitly** instead of substituting another model. RedactGuard model selection does not control Korgis residency lifecycle.
- A model switch applies only to newly imported documents. The existing single-PDF session retains its model identifier.

Risk note: Korgis uses an opt-in administrative API without automatic authentication; this integration intentionally uses the public discovery and inference APIs instead. Never enable the admin API solely to make the product selector richer. Tauri/macOS app packaging and physical evidence remain separately pending.

Validation: STRONG for persistence, session snapshots and cache identity; CI Python tests and TypeScript/build are necessary but cannot replace real runtime integration evidence.

## Multi-PDF incremental workspace (stacked, 2026-10-12)

The existing in-memory backend session store is already keyed by independent `doc_id` values. The frontend now reuses that owner rather than creating an additional server-side registry.

- One import action accepts 1–25 PDFs, uploaded sequentially to avoid uncontrolled simultaneous conversion/model work.
- Each returned `doc_id` has independent pages, analysis/error/status, frozen model and policy, redactions and per-document review draft.
- Document switch preserves reviewer choices and inspected pages in the current application session. Re-analysis clears prior decisions on affected pages and invalidates the previous protected output.
- Unsupported or oversized inputs are rejected with per-file messages; successfully imported files remain accessible after another file fails. No failed file is silently counted as imported or protected.
- Navigation supports a list of up to 25 PDFs in a single application session. Export remains explicit for the active document only, with the same fail-closed UI readiness gate and human confirmation.
- No batch ZIP/output claim, no persistent job ledger, and no resumable queue after restarting the app. Expired backend sessions return errors rather than being considered complete.
- This is frontend aggregation of real backend single-PDF sessions, not an independent backend batch inference API or a new execution engine.

**Still pending for issue #12:** backend-enforced review attestation / export readiness (client gate alone is insufficient), session cleanup API and lifecycle under cancellation, representative memory/large-PDF benchmarks, realistic Tauri device E2E and optional explicitly requested partial batch export behavior.

Automated proof: bounded candidate/session tests and per-document state isolation, plus existing static/frontend/backend/sidecar CI. Full session-switch UX evidence requires browser/Tauri interaction testing.

## Backend export attestation and fail-closed guard (stacked)

The desktop UI gate is no longer the sole control for the protected Markdown artifact.

- The canonical backend `services/export_readiness.py` requires a complete result for every page, no failed/warning pages, and zero unresolved proposed findings.
- `PATCH /api/redact/{doc_id}` now requires an explicit `review_attested=true` flag from the user's confirm-review interaction. Unknown/stale finding IDs are rejected. The backend records document-session attestation after redaction decisions are applied.
- `GET /api/export/{doc_id}?format=md` requires **both** complete analysis and valid attestation; bypassing the UI no longer downloads an unreviewed original as a supposedly protected artifact.
- Any reanalysis revokes attestation at its start and invalidates the earlier decisions for the reanalyzed page, including previously accepted `keep`/ `not_pii` choices. A failed reanalysis does not silently restore export permission.
- Synthetic regression tests cover incomplete/failed/warning/unresolved runs, missing confirmation, unknown IDs, successful redaction and revocation after reanalysis.
- The read-only client protection report remains accessible for partial/incomplete analysis so exceptions can be understood; its status must not be confused with successful protected-document export.

**Limitations:** This is local in-memory session attestation, not independent proof of human inspection or detector accuracy. The backend does not yet offer authenticated reviewers, durable/auditable attestations, or a transactional concurrent mutation/export snapshot. Runtime concurrency and session-store locking need representative adversarial/real-environment E2E before release. Do not claim complete sensitive-data removal or compliance certification.

API compatibility note: legacy clients calling `PATCH /api/redact/{doc_id}` without `review_attested=true` receive HTTP 409. This is intentional fail-closed security behavior. The included Adaptive Workspace client sends the field after user confirmation.
