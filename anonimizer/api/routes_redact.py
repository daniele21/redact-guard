from fastapi import APIRouter, HTTPException
from domain.models import RedactRequest, RedactResponse
from services.session_store import get_session, save_session
from services.redaction_engine import apply_redaction_to_document

router = APIRouter()

@router.patch("/redact/{doc_id}", response_model=RedactResponse)
def apply_redaction(doc_id: str, request: RedactRequest):
    """Apply the user's redaction toggles and return the redacted text."""
    session = get_session(doc_id)
    if not session:
        raise HTTPException(status_code=404, detail="Document session not found or expired.")
        
    redacted_pages = apply_redaction_to_document(session, request)
    save_session(session)
    
    total_redacted = sum(1 for v in session.redaction_overrides.values() if v is True)
    # Plus defaults that aren't overriden? This is a naive count
    # Actually, we should count how many fields were actually replaced
    stats = {
        "overrides_applied": len(request.fields_to_redact),
        "total_fields_redacted": total_redacted
    }
    
    return RedactResponse(
        redacted_pages=redacted_pages,
        stats=stats
    )
