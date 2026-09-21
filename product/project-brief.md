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

RedactGuard owns the document workflow and PII policy. **Korgis is the external local AI runtime authority**.

## In scope

- PDF → Markdown through Docling;
- built-in and custom PII taxonomies;
- contextual PII detection through Korgis;
- visual review and per-field redaction;
- deterministic post-processing/redaction;
- local caches and in-memory document sessions;
- anonymized Markdown export.

## Runtime Architecture

RedactGuard does **not** embed a model server or model downloader.

- RedactGuard backend: policy, prompts, Docling, span resolution, review/redaction/cache/export.
- Korgis: model registry, artifact download/verification, backend selection, model lifecycle, inference and runtime identity.
- Boundary: OpenAI-compatible `POST /v1/chat/completions`.
- Readiness/evidence: `GET /v1/models` and `GET /v1/runtime/identity`.
- Default RedactGuard model key: `nemotron-nano-4b`.

Current compatibility baseline: `daniele21/korgis@26a161dc0ef89a133c7a076d3a31544a274c1469` (`dev`).

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
- Tauri desktop shell is experimental;
- Korgis remains a separate local runtime, not a Python dependency or embedded server;
- no cloud document-processing requirement and no application database.
