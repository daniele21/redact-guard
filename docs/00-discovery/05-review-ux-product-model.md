# Review UX product model

Status: implemented baseline on `main`

## Purpose

RedactGuard's review experience is no longer organized around raw LLM output.
The product presents a document-protection workflow with three layers:

```text
Overview -> Findings -> Document
```

- **Overview**: document-level protection status and executive-readable metrics.
- **Findings**: entity-first review queue for privacy/compliance users.
- **Document**: source-text verification, occurrence navigation and page-level controls.

This internal review workspace remains distinct from the future client-facing report/view.

## Domain concepts

### Sensitive item

A unique sensitive value/type pair across the document.

Example:

`Mario Rossi` appearing on pages 1, 3 and 5 is one sensitive item.

### Occurrence

One source span where a sensitive item appears.

The same item may therefore have many occurrences.

### Category

The active RedactGuard PII type associated with an item.

### Finding identity

Every occurrence receives an opaque deterministic `occ_...` ID.
Every unique value/type receives an opaque deterministic `ent_...` ID.

Raw PII is never embedded in these identifiers.

## Review decisions

Every occurrence has one explicit decision:

```text
redact
keep
not_pii
```

`redact` is the privacy-safe default.

`not_pii` is not equivalent to `keep`: it records that the reviewer rejects the
classification itself.

The protected document applies only `redact` findings. Decision counts are derived
from actual occurrences rather than UI toggle counts.

## Document analysis status

The backend tracks page-level analysis state:

```text
not_started
analyzing
complete
warning
failed
```

The document summary derives:

```text
not_started
analyzing
partial
complete
needs_attention
failed
```

A failed page can never be represented as a page with zero PII.

## Overview metrics

The review Overview exposes product-level facts:

- unique sensitive items;
- total occurrences;
- affected pages;
- sensitive categories;
- pages analyzed / total pages;
- failed pages;
- unresolved model-proposed findings;
- redact / keep / not-PII decisions;
- local-processing indicator;
- RedactGuard detection-contract version.

It deliberately does **not** show model recall, benchmark leakage or a per-finding
confidence percentage. Those metrics require labeled evaluation data and are not
runtime facts about a client document.

## Findings UX

Findings are grouped entity-first, not page-first.

Values are masked by default in the entity list. The reviewer can jump to each source
occurrence in the Document view for contextual verification.

Entity-level decisions apply to all currently detected occurrences of that entity.

## Document UX

The Document view remains the detailed verification workspace and now surfaces:

- page analysis failures;
- page warnings / unresolved findings;
- inline redaction state;
- page/grid navigation;
- batch and targeted re-analysis.

## Export UX

The final export screen shows the protection outcome:

- redacted occurrence count;
- explicitly retained count;
- dismissed-as-not-PII count;
- analysis coverage;
- unresolved count.

The current protected-document export remains Markdown. Client-facing output formats
and a separate executive protection report are intentionally a subsequent product layer.

## Boundary with future client-facing view

The internal Review workspace is optimized for an operator/reviewer.

A future client-facing view should be read-only by default, more heavily masked, and
focused on:

- protection outcome;
- coverage/completeness;
- category footprint;
- policy used;
- local-processing assurance;
- exceptions requiring attention;
- audit/report export.

It should not expose developer controls, runtime diagnostics, model internals, raw PII
lists, page-selection controls or benchmark metrics by default.
