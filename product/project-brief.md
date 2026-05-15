# RedactGuard — Project Brief

## Product Name

**RedactGuard** — Local-first document anonymization.

## Problem Statement

Professionals handling sensitive documents (healthcare, legal, financial) need to anonymize PII before sharing, archiving, or forwarding. Existing solutions are cloud-based, introducing privacy risks — documents leave the user's machine and pass through third-party servers.

There is no lightweight, local-first tool that:
- Runs entirely on the user's machine
- Uses a local LLM for intelligent PII detection
- Provides a visual review flow before export
- Exports clean, anonymized documents

## Target Users

- Privacy-conscious professionals (nutritionists, doctors, lawyers, consultants)
- Compliance officers preparing documents for sharing
- Developers testing PII detection on local data
- Anyone needing to redact sensitive information before sharing documents

## Core Value Proposition

**100% local, AI-powered document anonymization** — upload a PDF, review detected PII with visual highlights, toggle what to redact, and export a clean anonymized Markdown file. Nothing ever leaves your machine.

## Scope

### In scope (v1)

- PDF upload and conversion to Markdown (via Docling)
- AI-powered PII detection using a local LLM (Nemotron default, configurable)
- Visual review interface with per-field redaction toggles
- Color-coded PII categories (names, health data, dates, contacts, etc.)
- Export anonymized document as `.md` file download
- Multi-layer caching (PDF conversion + LLM inference)
- Configurable design system (Tailwind v4 centralized tokens)
- Configurable backend (model, ports, cache, timeouts)

### Out of scope (v1)

- Cloud deployment
- User accounts / authentication
- PDF export (future enhancement)
- Batch processing of multiple documents simultaneously
- Document history / audit logs (future enhancement)
- Custom PII type definitions by the user

## Success Criteria

1. User can upload a PDF and see PII-highlighted results within the LLM inference time
2. Re-uploading the same PDF returns results in <1 second (cache hit)
3. User can toggle individual PII fields and see live preview of redacted text
4. User can export a clean `.md` file with all selected fields redacted
5. All processing happens locally — zero network requests to external services
6. UI is minimal, modern, and requires no configuration to use

## Technical Constraints

- Must run on macOS (primary), Linux, and Windows
- Local LLM inference via `llama-cpp-python` (GGUF models)
- Python backend (FastAPI)
- React frontend (Vite + Tailwind v4)
- No external API calls, no cloud services, no databases
