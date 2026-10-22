# RedactGuard — Project Brief

## Product Name

**RedactGuard** — local-first document anonymization with a configurable PII policy.

## Problem Statement

Professionals handling sensitive documents need to minimize PII before sharing or downstream AI processing without sending source documents to a cloud anonymization service. They also need the privacy policy to be maintainable without changing detection code.

## Target Users

- privacy-conscious professionals in healthcare, legal, financial and consulting workflows;
- compliance/privacy operators;
- teams with organization-specific identifiers and sensitive categories;
- developers evaluating local PII detection.

## Core Value Proposition

**Maintainable privacy policy + local contextual detection + human review + deterministic minimization.**

RedactGuard owns the document workflow and PII policy. **Korgis remains the independent local AI execution authority**, shipped as a separate managed process in the desktop package or connected externally in development.

## In scope

- PDF → Markdown through Docling;
- built-in PII taxonomy and profile-scoped, versioned PII variants;
- contextual PII detection through Korgis;
- visual review and per-field redaction;
- deterministic post-processing/redaction;
- local caches, immutable model/policy snapshots and independent in-memory multi-PDF sessions;
- explicit reviewer attestation and backend-gated protected Markdown export (no PDF layout preservation).

## Runtime Architecture

RedactGuard does **not** implement its own model server or downloader. The macOS desktop candidate packages Korgis as a separately launched, isolated runtime; development may connect to an external Korgis instance.

- RedactGuard backend: policy, prompts, Docling, span resolution, review/redaction/cache/export.
- Korgis: model registry, artifact download/verification, backend selection, model lifecycle, inference and runtime identity.
- Boundary: OpenAI-compatible `POST /v1/chat/completions`.
- Readiness/evidence: `GET /v1/models` and `GET /v1/runtime/identity`.
- Default RedactGuard model key: `nemotron-nano-4b`.

Current candidate pin: `daniele21/korgis@19fa051eaf8c9d7a1e9389b4f0e8fbf6d37c9822`, maintained canonically in `.engineering/korgis-runtime.json`. This is an integration candidate, not a released baseline.

## Success Criteria

1. PII workflow remains local after required artifacts are installed.
2. RedactGuard never silently falls back to a different model/runtime.
3. Korgis offline and model-not-resident states are explicit in the UI.
4. Model/prompt/profile changes invalidate incompatible cache entries.
5. Users can review and override every suggested redaction.
6. Detection quality is measured independently through the RedactGuard local anonymization experiment.

## Technical Constraints

- macOS primary; Linux/Windows architectural targets;
- Python FastAPI backend;
- React/Vite/Tailwind frontend;
- Tauri macOS desktop candidate has automated package startup and synthetic UX evidence; representative installed-GUI and real-model inference evidence remain pending;
- Korgis remains a separate process with its own dependencies and lifecycle, never a RedactGuard backend Python import;
- no cloud document-processing requirement and no application database.
