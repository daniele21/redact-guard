<div align="center">
  <img width="1200" height="475" alt="RedactGuard" src="https://github.com/user-attachments/assets/0aa67016-6eaf-458a-adb2-6e31a0763ed6" />

# RedactGuard

**Local-first, human-reviewed document anonymization for sensitive PDFs.**

RedactGuard detects personal and sensitive information with a local LLM, lets the user review every finding, and exports a safer Markdown version without sending the document to a cloud AI provider.

[How it works](#what-redactguard-does) · [Value](#the-value-it-adds) · [Run locally](#run-locally) · [Architecture](#architecture) · [Privacy](#privacy-and-data-lifecycle)
</div>

> [!IMPORTANT]
> RedactGuard is an experimental privacy tool, not a legal compliance product. Local AI can miss, misclassify, or over-detect sensitive information. Every result must be reviewed by a person before the exported document is shared or relied upon.

## Why RedactGuard exists

Professionals regularly need to share documents containing names, contact details, account identifiers, health information, measurements, dates, or other sensitive data.

The usual alternatives create difficult trade-offs:

- manual redaction is slow and easy to perform inconsistently;
- regex and pattern matching cannot reliably understand contextual information;
- cloud AI requires the original document to leave the user's machine;
- fully automatic redaction removes human control where mistakes matter most.

RedactGuard follows a different principle:

> **Use local AI to accelerate sensitive-data detection, but keep the final decision with the user.**

The goal is not to promise automatic anonymity. The goal is to make data minimization more private, inspectable, and practical before a document is shared, archived, or used in another workflow.

## What RedactGuard does

RedactGuard provides an end-to-end local workflow:

1. **Import a PDF** and choose a detection profile.
2. **Convert the document to structured Markdown** with Docling.
3. **Analyze selected pages or the full document** with a local GGUF model.
4. **Highlight detected sensitive fields** by category and page.
5. **Review each finding** and choose what should be redacted.
6. **Apply deterministic replacements** to the selected fields.
7. **Export an anonymized Markdown file** for safer downstream use.

```mermaid
flowchart LR
    A[PDF on the user's device] --> B[Docling conversion]
    B --> C[Local LLM detection]
    C --> D[Visual human review]
    D --> E[Selective redaction]
    E --> F[Anonymized Markdown export]

    subgraph LOCAL["Local machine"]
      B
      C
      D
      E
      F
    end
```

## The value it adds

| Need | RedactGuard's contribution |
|---|---|
| Protect documents before sharing | Sensitive information can be reviewed and removed before the content enters another system. |
| Avoid cloud exposure | Conversion, inference, review, redaction, and export run on the user's machine. |
| Go beyond regex-only detection | A local LLM can identify contextual information such as health conditions, treatments, demographics, or measurements. |
| Preserve human control | Findings are suggestions, not irreversible decisions. Every field can be included or excluded. |
| Adapt to the document domain | Profiles focus the model on general, healthcare, legal, or financial information. |
| Reduce repeated processing time | PDF conversion and LLM results are cached locally with configuration-aware keys and expiration policies. |
| Make privacy operational | Local processing, minimization, review, deletion controls, and explicit export are combined in one workflow. |

## Core capabilities

### Local AI processing

- GGUF inference through `llama-cpp-python`;
- NVIDIA Nemotron 3 Nano 4B Q4_K_M as the default model;
- configurable model path and inference parameters;
- local HTTP endpoints used by the application backend;
- no cloud inference required for document processing.

### Structured document extraction

- PDF upload with size validation;
- PDF-to-Markdown conversion through Docling;
- page-level document representation;
- table normalization before PII analysis;
- SHA-256-based conversion cache.

### Domain-aware PII detection

Built-in YAML profiles are available for:

- **General** documents;
- **Healthcare** and clinical information;
- **Legal** and contractual documents;
- **Financial** and banking information.

The detection taxonomy includes:

- people, emails, phone numbers, addresses, dates, and URLs;
- account numbers and secrets;
- health conditions, treatments, and laboratory results;
- personal measurements, demographics, and lifestyle information.

The backend also exposes API operations for custom PII definitions.

### Human-in-the-loop review

- color-coded highlights in the document preview;
- per-field redaction controls;
- page-by-page analysis;
- selective page inference;
- sequential full-document scanning;
- cross-page findings in a unified sidebar;
- direct navigation from a finding to its source page.

### Controlled export

- redaction runs only after user confirmation;
- findings default to redacted unless explicitly excluded;
- replacements are applied deterministically from the reviewed result set;
- the current export format is Markdown (`.md`);
- exports use an `_anonymized.md` suffix.

### Local caching

RedactGuard maintains separate local caches for:

- PDF conversion results;
- LLM inference results.

Cache keys include the source content and relevant model or prompt configuration. Changing the model, prompt, profile, or custom type creates a new key rather than reusing an incompatible result.

## Privacy and data lifecycle

RedactGuard is local-first by architecture, but local processing does not mean data disappears automatically. The application therefore makes local persistence explicit.

| Data | Where it is handled | Default lifecycle | User control |
|---|---|---|---|
| Uploaded PDF bytes | Local backend during conversion | Not stored in a remote service | Stop/reset the workflow |
| Parsed document pages | In-memory session and optional local cache | Session expiry and cache TTL | Clear cache through the UI/API |
| PII findings | In-memory session and optional local cache | Session- and cache-bound | Review, override, or clear cache |
| Exported Markdown | User's local filesystem | Persists until deleted | Full filesystem control |
| GGUF model | Local model directory | Persists for reuse | Replace or delete the model |

Default privacy properties:

- services bind to `127.0.0.1`;
- sessions are stored in memory rather than a database;
- idle sessions are cleaned up automatically;
- cache data is stored under `~/.cache/redactguard` by default;
- PDF and LLM caches have configurable TTL and size limits;
- caches can be cleared by namespace or in full;
- no user account, cloud database, or remote document store is required.

The initial model download can contact Hugging Face. Once the model and dependencies are available, the document-processing workflow is designed to remain local.

> [!NOTE]
> Do not place the cache directory on shared or network-mounted storage when handling sensitive documents. Clear the cache after high-sensitivity sessions when local persistence is not desired.

## Architecture

RedactGuard uses three local processes with explicit responsibilities.

```mermaid
graph TB
    subgraph DEVICE["User's machine"]
        UI[React + Vite frontend\nUpload · Review · Export]
        API[FastAPI backend\nWorkflow and sessions]
        PDF[Docling\nPDF to Markdown]
        PII[PII detection service]
        RED[Redaction engine]
        CACHE[(Local disk cache)]
        LLM[llama-cpp-python\nLocal GGUF model]

        UI -->|REST /api| API
        API --> PDF
        API --> PII
        API --> RED
        PDF <--> CACHE
        PII <--> CACHE
        PII -->|Local HTTP| LLM
    end
```

| Process | Default port | Responsibility |
|---|---:|---|
| React/Vite frontend | `3000` | Upload, profile selection, review, redaction controls, and export UI |
| FastAPI backend | `8000` | Sessions, conversion, analysis, redaction, profiles, cache, and export |
| Local LLM server | `1235` | GGUF model loading and local inference |

### Technology stack

- **Frontend:** React 19, TypeScript, Vite, Tailwind CSS v4, Motion, Lucide;
- **Backend:** Python 3.13, FastAPI, Pydantic;
- **Document processing:** Docling;
- **Local inference:** `llama-cpp-python` and GGUF;
- **PII taxonomy:** OpenAI Privacy Filter dependency plus RedactGuard profiles;
- **Caching:** `diskcache`;
- **Desktop packaging:** Tauri 2, currently experimental.

## Run locally

The source workflow is currently optimized for macOS development, particularly Apple Silicon. Linux and Windows are architectural targets but may require platform-specific dependency and inference settings.

### Prerequisites

- Git;
- Node.js 20+;
- pnpm 9;
- Python 3.13;
- sufficient RAM for the selected GGUF model;
- the native build tools required by `llama-cpp-python` and Docling.

On macOS:

```bash
brew install node pnpm python@3.13
```

### 1. Clone the repository

```bash
git clone https://github.com/daniele21/redact-guard.git
cd redact-guard
```

### 2. Create the Python environment

```bash
chmod +x setup_env.sh
./setup_env.sh
```

The script creates `.venv`, installs the backend dependencies, and enables Metal support for `llama-cpp-python` on macOS.

### 3. Install frontend dependencies

```bash
pnpm install
```

### 4. Provide a GGUF model

Download the default model:

```bash
pnpm tauri:download-model
```

The default destination is:

```text
~/.redactguard/models/NVIDIA-Nemotron-3-Nano-4B-Q4_K_M.gguf
```

Point the LLM server to it:

```bash
export NEMOTRON_GGUF_PATH="$HOME/.redactguard/models/NVIDIA-Nemotron-3-Nano-4B-Q4_K_M.gguf"
```

Another compatible model can be used by changing `NEMOTRON_GGUF_PATH`. Shared runtime defaults are defined in [`config.json`](config.json).

> [!WARNING]
> The default downloader does not currently enforce SHA-256 verification unless a hash is explicitly supplied. Verify model artifacts independently before using them in sensitive or production-like workflows.

### 5. Start the stack

```bash
pnpm start
```

This starts:

- LLM server: `http://127.0.0.1:1235`;
- FastAPI backend: `http://127.0.0.1:8000`;
- Vite frontend: `http://localhost:3000`.

Open `http://localhost:3000`.

FastAPI documentation is available at `http://127.0.0.1:8000/docs`.

No Gemini API key is required for the documented local inference flow.

## Desktop development

Tauri packaging is under active development.

```bash
pnpm tauri:dev
pnpm tauri:build-sidecar
pnpm tauri:build
```

Desktop distribution should remain experimental until model verification, cross-platform testing, code signing, and release automation are complete.

## Configuration

Most settings live in [`config.json`](config.json) and can be overridden with environment variables.

| Variable | Purpose |
|---|---|
| `NEMOTRON_GGUF_PATH` | Absolute path to the local GGUF model |
| `NEMOTRON_PROXY_HOST` | LLM server bind address |
| `NEMOTRON_PROXY_PORT` | LLM server port |
| `LLAMA_CPP_CTX_SIZE` | Model context size |
| `CACHE_ENABLED` | Enable or disable all caches |
| `CACHE_DIR` | Local cache directory |
| `PDF_CACHE_TTL_DAYS` | PDF conversion cache lifetime |
| `LLM_CACHE_TTL_DAYS` | LLM result cache lifetime |
| `SESSION_TTL_MINUTES` | Idle session lifetime |
| `MAX_FILE_SIZE_MB` | Maximum accepted PDF size |
| `LLM_ENDPOINT` | Backend local-inference endpoint |
| `LLM_TIMEOUT` | LLM request timeout |

The hardware values in `config.json` reflect the original development environment. Adjust GPU layers, thread count, batch sizes, and context size for your hardware.

## API overview

| Method | Endpoint | Purpose |
|---|---|---|
| `GET` | `/api/health` | Backend, LLM, and cache health |
| `POST` | `/api/upload` | Upload and convert a PDF |
| `POST` | `/api/analyze/{doc_id}/page/{page}` | Analyze one page |
| `POST` | `/api/analyze/{doc_id}` | Analyze the full document |
| `PATCH` | `/api/redact/{doc_id}` | Store and apply redaction choices |
| `GET` | `/api/export/{doc_id}?format=md` | Download anonymized Markdown |
| `GET` | `/api/profiles` | List detection profiles |
| `GET` | `/api/profiles/{name}` | Read profile details |
| `GET/POST` | `/api/profiles/custom-types` | List or create custom definitions |
| `DELETE` | `/api/profiles/custom-types/{name}` | Remove a custom definition |
| `GET` | `/api/cache/stats` | Inspect cache usage and savings |
| `DELETE` | `/api/cache` | Clear all caches |

## Repository structure

```text
redact-guard/
├── src/                         # React application
│   ├── components/              # Upload, review, export, setup, and layout UI
│   ├── hooks/                   # Document workflow state
│   ├── services/                # Typed API client
│   └── config/                  # Frontend configuration
├── anonimizer/                  # Python local-processing backend
│   ├── api/                     # FastAPI routes
│   ├── cache/                   # Persistent local cache
│   ├── domain/                  # Models and PII types
│   ├── pii_profiles/            # General, healthcare, legal, financial profiles
│   ├── services/                # Conversion, detection, redaction, export, sessions
│   ├── llama_cpp_server.py      # Local GGUF inference server
│   └── main.py                  # FastAPI entrypoint
├── src-tauri/                   # Experimental desktop packaging
├── scripts/                     # Model, cache, and build utilities
├── product/                     # Product intent and requirements
├── docs/00-discovery/           # Strategy, architecture, and delivery analysis
├── config.json                  # Shared runtime configuration
└── package.json                 # Development and packaging scripts
```

## Current limitations

- only PDF input is supported;
- export is Markdown, not a visually redacted PDF;
- the original PDF layout and images are not preserved;
- detection quality depends on model, quantization, prompt, language, and document structure;
- OCR and chart extraction depend on Docling's conversion quality;
- false positives and false negatives are possible;
- the default model can be demanding for low-memory hardware;
- document history and a formal audit trail are not implemented;
- multi-document batch processing is not implemented;
- authentication is absent because the current model is local single-user;
- desktop packaging and model verification are not production-ready.

## Project status and direction

RedactGuard is an active experimental project and a reference implementation for privacy-first AI products.

Main next steps:

- benchmark PII detection across domains and model quantizations;
- add regression datasets for false positives and false negatives;
- export a redacted PDF while preserving layout;
- complete cryptographically verified model distribution;
- harden Tauri packaging across operating systems;
- improve cleanup, deletion, and audit visibility;
- extract reusable PII detection and redaction capabilities when genuine reuse emerges.

See [`CHANGELOG.md`](CHANGELOG.md) for implemented changes and [`docs/00-discovery`](docs/00-discovery) for the strategy and architecture rationale.

## Security and responsible use

- Do not expose local services to untrusted networks.
- Do not assume a successful model response means every sensitive field was found.
- Review all findings and the exported document manually.
- Delete caches and exports according to the sensitivity and retention needs of the use case.
- Do not treat RedactGuard as proof of GDPR compliance, anonymization certification, or legal sufficiency.
- Never open a public issue containing sensitive documents or personal data.

---

<div align="center">
  <strong>RedactGuard</strong> explores how local AI, data minimization, and human review can work together before sensitive documents leave the user's control.
</div>
