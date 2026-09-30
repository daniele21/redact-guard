from __future__ import annotations

from collections import Counter, defaultdict

from domain.detection import DETECTION_CONTRACT_VERSION
from domain.models import (
    CategoryAnalysisSummary,
    DocumentAnalysisSummary,
    DocumentSession,
    SensitiveEntityOccurrence,
    SensitiveEntitySummary,
)


def _decision(session: DocumentSession, finding_id: str) -> str:
    return session.review_decisions.get(finding_id, "redact")


def mask_sensitive_value(value: str, pii_type: str) -> str:
    """Return a review-safe preview that avoids copying raw PII into summaries."""
    value = value.strip()
    if not value:
        return "••••"

    if "email" in pii_type and "@" in value:
        local, domain = value.split("@", 1)
        visible = local[:1] if local else ""
        return f"{visible}••••@{domain}"

    if "phone" in pii_type:
        digits = "".join(char for char in value if char.isdigit())
        suffix = digits[-4:] if len(digits) >= 4 else digits[-2:]
        return f"•••• {suffix}".strip()

    if len(value) <= 4:
        return value[:1] + "•" * max(1, len(value) - 1)

    prefix = value[: min(4, max(1, len(value) // 3))]
    suffix = value[-2:]
    return f"{prefix}{'•' * min(8, max(3, len(value) - len(prefix) - 2))}{suffix}"


def build_document_summary(session: DocumentSession) -> DocumentAnalysisSummary:
    total_pages = len(session.pages)
    statuses = {
        page.page_number: session.page_analysis_status.get(
            page.page_number,
            "not_started",
        )
        for page in session.pages
    }
    analyzed_pages = sum(
        status in {"complete", "warning"}
        for status in statuses.values()
    )
    failed_pages = sum(status == "failed" for status in statuses.values())
    warning_pages = sum(status == "warning" for status in statuses.values())
    in_progress_pages = sum(status == "analyzing" for status in statuses.values())

    all_fields = [
        (page_number, field)
        for page_number, fields in session.pii_results.items()
        for field in fields
    ]
    affected_pages = len(
        {
            page_number
            for page_number, fields in session.pii_results.items()
            if fields
        }
    )

    category_counts: Counter[str] = Counter()
    category_labels: dict[str, str] = {}
    grouped: dict[str, list[tuple[int, object]]] = defaultdict(list)
    decision_counts: Counter[str] = Counter()

    for page_number, field in all_fields:
        category_counts[field.pii_type] += 1
        category_labels[field.pii_type] = field.field_name
        grouped[field.entity_id].append((page_number, field))
        decision_counts[_decision(session, field.finding_id)] += 1

    entities: list[SensitiveEntitySummary] = []
    for entity_id, occurrences in grouped.items():
        first = occurrences[0][1]
        entity_decisions: Counter[str] = Counter()
        entity_occurrences: list[SensitiveEntityOccurrence] = []
        pages: set[int] = set()
        for page_number, field in occurrences:
            pages.add(page_number)
            entity_decisions[_decision(session, field.finding_id)] += 1
            entity_occurrences.append(
                SensitiveEntityOccurrence(
                    finding_id=field.finding_id,
                    page_number=page_number,
                    start=field.start,
                    end=field.end,
                )
            )
        entities.append(
            SensitiveEntitySummary(
                entity_id=entity_id,
                pii_type=first.pii_type,
                label=first.field_name,
                masked_value=mask_sensitive_value(first.value, first.pii_type),
                occurrence_count=len(entity_occurrences),
                pages=sorted(pages),
                decision_counts=dict(entity_decisions),
                occurrences=entity_occurrences,
            )
        )

    categories = [
        CategoryAnalysisSummary(
            pii_type=pii_type,
            label=category_labels.get(pii_type, pii_type),
            occurrence_count=count,
        )
        for pii_type, count in category_counts.most_common()
    ]

    unresolved_findings = sum(
        result.unresolved_items
        for result in session.page_diagnostics.values()
        if result is not None
    )

    if in_progress_pages:
        analysis_status = "analyzing"
    elif failed_pages:
        analysis_status = "failed"
    elif analyzed_pages == total_pages and (warning_pages or unresolved_findings):
        analysis_status = "needs_attention"
    elif analyzed_pages == total_pages and total_pages > 0:
        analysis_status = "complete"
    elif analyzed_pages:
        analysis_status = "partial"
    else:
        analysis_status = "not_started"

    return DocumentAnalysisSummary(
        document_id=session.doc_id,
        filename=session.original_filename,
        profile=session.profile_name,
        contract_version=DETECTION_CONTRACT_VERSION,
        analysis_status=analysis_status,
        pages_total=total_pages,
        pages_analyzed=analyzed_pages,
        pages_failed=failed_pages,
        pages_with_warnings=warning_pages,
        affected_pages=affected_pages,
        unique_sensitive_items=len(grouped),
        occurrences=len(all_fields),
        categories=categories,
        decision_counts={
            "redact": decision_counts.get("redact", 0),
            "keep": decision_counts.get("keep", 0),
            "not_pii": decision_counts.get("not_pii", 0),
        },
        unresolved_findings=unresolved_findings,
        page_status=statuses,
        page_errors=dict(session.page_analysis_errors),
        entities=sorted(
            entities,
            key=lambda item: (-item.occurrence_count, item.label, item.masked_value),
        ),
        local_processing=True,
    )
