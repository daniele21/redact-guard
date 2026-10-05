from __future__ import annotations

from collections import Counter, defaultdict

from domain.detection import DETECTION_CONTRACT_VERSION
from domain.models import (
    CategoryAnalysisSummary,
    DocumentAnalysisSummary,
    DocumentResourceSummary,
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




def _document_resource_summary(session: DocumentSession) -> DocumentResourceSummary:
    diagnostics = [
        item
        for item in session.page_diagnostics.values()
        if item is not None
    ]
    inference_requests = sum(item.inference_requests for item in diagnostics)
    cache_hits = sum(item.cache_hits for item in diagnostics)
    evidence_requests = sum(
        item.resource_evidence_requests for item in diagnostics
    )

    peak_memory_values = [
        item.peak_memory_bytes
        for item in diagnostics
        if item.peak_memory_bytes is not None
    ]
    peak_delta_values = [
        item.peak_memory_delta_bytes
        for item in diagnostics
        if item.peak_memory_delta_bytes is not None
    ]
    peak_cpu_values = [
        item.peak_cpu_percent
        for item in diagnostics
        if item.peak_cpu_percent is not None
    ]

    evidence_diagnostics = [
        item for item in diagnostics if item.resource_evidence_requests > 0
    ]
    cpu_entries = [
        item
        for item in evidence_diagnostics
        if (
            item.average_cpu_percent is not None
            and item.resource_cpu_sample_count is not None
            and item.resource_cpu_sample_count > 0
            and item.resource_sampling_interval_ms is not None
        )
    ]

    average_cpu = None
    cpu_sample_count = None
    sampling_interval = None
    cpu_observation_ms = None
    if len(cpu_entries) == len(evidence_diagnostics) and cpu_entries:
        compatibility = {
            (
                item.resource_sampling_interval_ms,
                tuple(item.resource_attribution_scopes),
                tuple(item.resource_attribution_qualities),
            )
            for item in cpu_entries
        }
        if len(compatibility) == 1:
            cpu_sample_count = sum(
                item.resource_cpu_sample_count or 0
                for item in cpu_entries
            )
            weights_ms = [
                (
                    item.resource_cpu_observation_ms
                    if (
                        item.resource_cpu_observation_ms is not None
                        and item.resource_cpu_observation_ms > 0
                    )
                    else float(
                        (item.resource_cpu_sample_count or 0)
                        * (item.resource_sampling_interval_ms or 0)
                    )
                )
                for item in cpu_entries
            ]
            total_weight_ms = sum(weights_ms)
            if cpu_sample_count > 0 and total_weight_ms > 0:
                average_cpu = sum(
                    (item.average_cpu_percent or 0.0) * weight_ms
                    for item, weight_ms in zip(cpu_entries, weights_ms)
                ) / total_weight_ms
                sampling_interval = next(iter(compatibility))[0]
                if all(
                    item.resource_cpu_observation_ms is not None
                    and item.resource_cpu_observation_ms > 0
                    for item in cpu_entries
                ):
                    cpu_observation_ms = sum(
                        item.resource_cpu_observation_ms or 0.0
                        for item in cpu_entries
                    )

    scopes = sorted({
        scope
        for item in evidence_diagnostics
        for scope in item.resource_attribution_scopes
    })
    qualities = sorted({
        quality
        for item in evidence_diagnostics
        for quality in item.resource_attribution_qualities
    })

    return DocumentResourceSummary(
        inference_requests=inference_requests,
        cache_hits=cache_hits,
        evidence_requests=evidence_requests,
        peak_memory_bytes=max(peak_memory_values) if peak_memory_values else None,
        peak_memory_delta_bytes=max(peak_delta_values) if peak_delta_values else None,
        average_cpu_percent=average_cpu,
        peak_cpu_percent=max(peak_cpu_values) if peak_cpu_values else None,
        cpu_sample_count=cpu_sample_count,
        sampling_interval_ms=sampling_interval,
        cpu_observation_ms=cpu_observation_ms,
        attribution_scopes=scopes,
        attribution_qualities=qualities,
    )


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
        resources=_document_resource_summary(session),
        local_processing=True,
    )
