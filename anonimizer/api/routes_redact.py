from collections import Counter

from fastapi import APIRouter, HTTPException

from domain.models import RedactRequest, RedactResponse
from services.redaction_engine import (
    apply_redaction_to_document,
    decision_for_field,
)
from services.session_store import get_session, save_session

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

    redacted_pages = apply_redaction_to_document(session, request)
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
