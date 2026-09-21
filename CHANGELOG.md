# Changelog

## 2026-09-21 — Korgis runtime boundary

- Migrated active PII inference from RedactGuard's embedded `llama_cpp_server.py` to external Korgis.
- Adopted `/v1/chat/completions`, `/v1/models`, and `/v1/runtime/identity`.
- Added explicit Korgis-offline and model-not-resident startup states.
- Removed RedactGuard-owned GGUF download/runtime setup from the active desktop and development paths.
- Pinned the tested compatibility baseline to `daniele21/korgis@26a161dc0ef89a133c7a076d3a31544a274c1469`.
- Added backend contract tests and linked the companion local anonymization benchmark.

All notable changes to this project will be documented in this file.

## [2026-09-17]

### Added
- **Editable Custom PII Definitions**: Users can now edit or rename locally persisted custom PII definitions from the PII Taxonomy settings UI.
- **Custom PII Update API**: Added `PATCH /api/profiles/custom-types/{name}` so custom definitions can be maintained without rewriting detection code.
- **Configurable PII Product Principle**: Added product and visual guidance that positions the PII taxonomy as a maintainable policy layer separated from the anonymization engine.

### Changed
- Repositioned the README around configurable PII taxonomy as RedactGuard's primary adoption lever, with local-first processing and human review as supporting pillars.
- Reworked the settings experience to explain base profiles, organization-specific PII definitions, and automatic propagation into subsequent analyses.
- Added README visual placeholders for the PII taxonomy overview, PII definition editor, and configuration-to-detection proof screenshots.

## [2026-05-15]

### Added
- **Selective Page Inference**: Users can now select specific pages for LLM analysis using a new "Selection Mode" in the Review step.
- **Batch Inference**: Added "Scan All Pages" functionality to automatically process the entire document page by page from the UI.
- **Cross-Page PII Visibility**: Enhanced `PIISidebar` with an "All Pages" view, allowing users to see PII findings across the entire document.
- **Inter-Page Navigation**: Quick navigation links in the sidebar to jump between pages when reviewing PII findings.

### Changed
- Refactored `useDocument` hook to support sequential batch analysis of pages.
- Updated `ReviewStep` toolbar with advanced inference controls and selection modes.
- Improved `PIISidebar` grouping and visualization of sensitive entities.