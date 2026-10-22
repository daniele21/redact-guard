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
