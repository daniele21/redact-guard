> [!NOTE]
> This document contains historical discovery context. Any references to an embedded `llama_cpp_server.py` or direct `llama-cpp-python` runtime are superseded by the approved Korgis boundary documented in [../KORGIS_RUNTIME.md](../KORGIS_RUNTIME.md).

# RedactGuard — Project Brainstorm

> Status: **Converged** — all major decisions resolved. See `01-solution-strategy.md` for consolidated direction.

## 1. Context

We have a working CLI-based PII detection pipeline:
- `llama_cpp_server.py` — HTTP wrapper around `llama-cpp-python` for local LLM inference
- `analyze_pdf_pii.py` — monolithic 880-line script: PDF→MD (Docling), LLM-based PII detection, span coercion, text redaction

The goal is to turn this into a **web application** with a clean UI for non-technical users.

## 2. Decisions Resolved

### D1: Styling — Tailwind v4 with centralized design tokens

**Decision**: Keep Tailwind v4. All style tokens (colors, spacing, typography, PII category colors) are defined centrally in `src/index.css` via the `@theme` block and in a config file `src/config/theme.config.ts`.

**Rationale**: Tailwind v4 is already configured. The `@theme` directive gives us a single source of truth for the design system. Changing `--color-primary` in one place updates the entire app.

**How it works**:
- `src/index.css` → `@theme { ... }` defines CSS custom properties
- `src/config/theme.config.ts` → maps PII types to Tailwind color classes
- Components reference only token-based classes, never raw hex values

### D2: Analysis flow — Auto-batch with incremental streaming

**Decision**: After upload, the system automatically starts analyzing all pages sequentially. Results stream to the frontend page by page.

**What "auto-batch" means concretely**:
1. User uploads PDF → backend converts to markdown pages → returns `{doc_id, page_count}`
2. Frontend immediately starts sending sequential `POST /api/analyze/{doc_id}/page/1`, then `/page/2`, etc.
3. Each response is rendered as it arrives — user sees page 1 results while page 3 is being analyzed
4. A progress bar shows "Analyzing page 3/12..."
5. If all pages are cached, the entire document loads in <1 second

**No WebSockets needed** — simple sequential fetch calls from the frontend. This is pragmatic and keeps the architecture simple.

### D3: Export format — Markdown only (v1)

**Decision**: Export as `.md` file only. PDF export is deferred to a future version.

**Rationale**: PDF regeneration from markdown is non-trivial and adds dependencies. Markdown is clean, portable, and sufficient for the initial use case.

### D4: Unused dependencies — Remove

**Decision**: Remove `@google/genai`, `express`, `dotenv`, and related AI Studio scaffolding from `package.json`.

**Rationale**: These are leftover from the initial Google AI Studio template. The frontend only needs React, Vite, Tailwind, lucide-react, and motion. The backend is Python.

### D5: Model flexibility — Configurable, Nemotron default

**Decision**: The LLM model is configurable via backend config. Default is Nemotron 3 Nano 4B.

**Rationale**: The `llama_cpp_server.py` already accepts `--model` and `--model-path` CLI arguments. The backend config file (`config.py`) exposes model, endpoint, and timeout as configurable values. Users can swap to any GGUF model.

### D6: Caching — Three-layer disk-persistent cache

**Decision**: Implement caching at three levels using `diskcache` (Python) and in-memory Map (React).

**Layers**:
1. **PDF Conversion**: `sha256(file_bytes)` → cached page list (saves 5-30s)
2. **LLM Inference**: `sha256(prompt + text + model)` → cached PII fields (saves 10-60s per page)
3. **Frontend**: in-memory Map by `doc_id:page_number` (eliminates redundant API calls)

**Rationale**: Temperature=0.0 makes LLM output deterministic. Same input always produces same result. Cache is safe, persistent across server restarts, and configurable.

## 3. Explored but Rejected

| Option | Why rejected |
|--------|-------------|
| WebSocket streaming | Over-engineering for sequential page analysis. Simple fetch loop is sufficient. |
| Redis for caching | External dependency, overkill for a local-only tool. `diskcache` is simpler. |
| Vanilla CSS | Tailwind v4 already configured with good `@theme` token system. |
| PDF export in v1 | Complex dependency chain (weasyprint, puppeteer). Not needed for MVP. |
| Cloud-based LLM fallback | Violates the core "100% local" promise. |
| Database for sessions | Documents are ephemeral. In-memory store with auto-cleanup is sufficient. |
