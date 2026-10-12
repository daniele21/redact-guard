from collections import Counter

from fastapi import APIRouter, HTTPException

from domain.models import RedactRequest, RedactResponse
from services.redaction_engine import (
    apply_redaction_to_document,
    decision_for_field,
)
from services.session_store import get_session, save_session
from services.export_readiness import ReviewNotReady, ensure_complete_analysis

router = APIRouter()


@router.patch("/redact/{doc_id}", response_model=RedactResponse)
def apply_redaction(doc_id: str, request: RedactRequest):
    """Persist review decisions and build the protected document."""
    session = get_session(doc_id)
    if not session:
        raise HTTPException(
            status_code=404,
            detail="Document session not found or expired.",
        )

    try:
        ensure_complete_analysis(session)
    except ReviewNotReady as exc:
        raise HTTPException(status_code=409, detail=str(exc)) from exc
    if not request.review_attested:
        raise HTTPException(status_code=409, detail="Explicit human review confirmation is required.")

    valid_ids = {
        field.finding_id
        for fields in session.pii_results.values()
        for field in fields
    }
    if any(item.field_id not in valid_ids for item in request.fields_to_redact):
        raise HTTPException(status_code=409, detail="The submitted findings are stale or unknown. Review again.")

    # Reset invalidated old decisions before applying the confirmed review.
    redacted_pages = apply_redaction_to_document(session, request)
    session.review_attested = True
    save_session(session)

    decisions: Counter[str] = Counter()
    for page_number, fields in session.pii_results.items():
        for field in fields:
            decisions[decision_for_field(session, page_number, field)] += 1

    total_findings = sum(decisions.values())
    stats = {
        "total_findings": total_findings,
        "total_fields_redacted": decisions.get("redact", 0),
        "total_fields_kept": decisions.get("keep", 0),
        "total_fields_not_pii": decisions.get("not_pii", 0),
        "reviewed_findings": sum(
            1
            for key in session.review_decisions
            if key.startswith("occ_")
        ),
    }

    return RedactResponse(
        redacted_pages=redacted_pages,
        stats=stats,
    )
