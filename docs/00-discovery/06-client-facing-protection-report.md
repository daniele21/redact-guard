# Client-facing Protection Report

Status: implemented baseline on `main`

## Product role

The Client Protection Report is a read-only output surface for customers, executives,
DPO/legal stakeholders and other consumers who need to understand the protection
outcome without operating the review workbench.

It is intentionally separate from:

```text
Overview -> Findings -> Document
```

which remains the internal reviewer workflow.

## Design principle

The client-facing report answers five questions, in this order:

1. **Was the whole document analyzed?**
2. **What sensitive-data footprint was found?**
3. **What protection decisions were applied?**
4. **Are there material exceptions requiring attention?**
5. **What policy and processing boundary produced this outcome?**

It does not expose model internals or ask the client to make review decisions.

## Information hierarchy

### 1. Protection status

One deterministic status:

- Protection review complete
- Needs attention
- Analysis incomplete

No arbitrary score is shown.

### 2. Coverage

- pages analyzed / total pages;
- failed pages;
- warning pages;
- unresolved findings.

### 3. Sensitive-data footprint

- unique sensitive items;
- total occurrences;
- affected pages;
- number of categories;
- occurrence counts by category.

### 4. Protection outcome

- redacted;
- explicitly retained;
- dismissed as not PII;
- unresolved.

### 5. Exceptions

Only material exceptions are surfaced:

- failed analysis;
- page warnings;
- unresolved findings;
- explicit retain decisions;
- not-PII dismissals.

## Privacy boundary

The report must never reproduce raw sensitive values.

The in-app detail section uses only backend-generated masked values and is collapsed by
default. The downloadable HTML report is more conservative and contains aggregated
information only.

The report deliberately excludes:

- raw PII;
- prompt/model output;
- model names;
- token counts;
- latency;
- benchmark recall/precision/leakage;
- uncalibrated confidence percentages;
- chunking/runtime details;
- reviewer controls.

## Provenance

Technical provenance is kept at low visual priority:

- active policy/profile;
- RedactGuard detection-contract version;
- local-processing indicator.

The contract version is useful for auditability but is not part of the executive
headline.

## Delivery

Two client-facing surfaces are implemented:

1. **In-app Client Protection Report**
   - read-only;
   - executive hierarchy;
   - optional collapsed masked details.

2. **Downloadable HTML Protection Report**
   - locally generated;
   - aggregated evidence only;
   - printable to PDF by the operating system/browser;
   - safe filename sanitization.

Current route:

```text
GET /api/export/{doc_id}/report
GET /api/export/{doc_id}/report?download=true
```

## Next product layer

The next delivery increment should not add more information to this report. It should
improve the artifact format and enterprise lifecycle:

- first-class PDF generation;
- protected-document PDF preserving layout;
- durable local audit history;
- reviewer identity/timestamps;
- report branding / tenant customization;
- optional report signing/hash for evidence integrity.
