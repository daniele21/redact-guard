"""Canonical document readiness check for review attestation and protected export.

An attestation is an explicit user decision after a complete analysis; it never
claims that the detector achieved perfect recall or a compliance guarantee.
"""
from domain.models import DocumentSession
from services.analysis_summary import build_document_summary


class ReviewNotReady(ValueError):
    pass


def ensure_complete_analysis(session: DocumentSession) -> None:
    summary = build_document_summary(session)
    total = len(session.pages)
    if (
        total == 0
        or summary.analysis_status != "complete"
        or summary.pages_total != total
        or summary.pages_analyzed != total
        or summary.pages_failed != 0
        or summary.pages_with_warnings != 0
        or summary.unresolved_findings != 0
        or any(session.page_analysis_status.get(page.page_number) != "complete" for page in session.pages)
    ):
        raise ReviewNotReady(
            "Document analysis is incomplete or needs attention. Complete every page before review."
        )


def ensure_export_attested(session: DocumentSession) -> None:
    ensure_complete_analysis(session)
    if not session.review_attested:
        raise ReviewNotReady("Explicit document review confirmation is required before export.")
