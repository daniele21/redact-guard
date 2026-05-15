# Changelog

All notable changes to this project will be documented in this file.

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
