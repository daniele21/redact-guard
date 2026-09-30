import logging

from domain.models import (
    DocumentSession,
    RedactRequest,
    RedactedPage,
    ReviewDecision,
)

logger = logging.getLogger("redactguard.redaction")


def _legacy_field_id(page_number: int, field) -> str:
    return f"{page_number}_{field.pii_type}_{field.value}"


def _normalize_decision(item) -> str:
    if item.decision is not None:
        return item.decision.value
    if item.redact is None:
        return ReviewDecision.REDACT.value
    return (
        ReviewDecision.REDACT.value
        if item.redact
        else ReviewDecision.KEEP.value
    )


def apply_review_decisions(
    session: DocumentSession,
    request: RedactRequest,
) -> None:
    """Persist explicit reviewer decisions without encoding PII into IDs."""
    for item in request.fields_to_redact:
        decision = _normalize_decision(item)
        session.review_decisions[item.field_id] = decision
        # Retain the legacy bool map for backwards compatibility with old sessions.
        session.redaction_overrides[item.field_id] = (
            decision == ReviewDecision.REDACT.value
        )


def decision_for_field(session: DocumentSession, page_number: int, field) -> str:
    finding_id = field.finding_id
    if finding_id in session.review_decisions:
        return session.review_decisions[finding_id]

    legacy_id = _legacy_field_id(page_number, field)
    if legacy_id in session.review_decisions:
        return session.review_decisions[legacy_id]
    if legacy_id in session.redaction_overrides:
        return (
            ReviewDecision.REDACT.value
            if session.redaction_overrides[legacy_id]
            else ReviewDecision.KEEP.value
        )
    return ReviewDecision.REDACT.value


def apply_redaction_to_document(
    session: DocumentSession,
    request: RedactRequest,
) -> list[RedactedPage]:
    """Apply reviewer decisions and return the fully protected document text."""
    apply_review_decisions(session, request)

    redacted_pages = []
    for page in session.pages:
        page_num = page.page_number
        text = page.text
        fields = session.pii_results.get(page_num, [])

        fields_to_apply = [
            field
            for field in fields
            if decision_for_field(session, page_num, field)
            == ReviewDecision.REDACT.value
        ]

        fields_to_apply.sort(
            key=lambda field: field.start if field.start is not None else 0,
            reverse=True,
        )

        for field in fields_to_apply:
            if field.start is not None and field.end is not None:
                text = (
                    text[: field.start]
                    + field.redacted_value
                    + text[field.end :]
                )
            else:
                text = text.replace(field.value, field.redacted_value)

        redacted_pages.append(
            RedactedPage(page_number=page_num, text=text)
        )

    return redacted_pages
