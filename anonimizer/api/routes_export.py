from fastapi import APIRouter, HTTPException
from fastapi.responses import PlainTextResponse
from services.session_store import get_session
from services.redaction_engine import apply_redaction_to_document
from domain.models import RedactRequest, RedactRequestItem

router = APIRouter()

@router.get("/export/{doc_id}")
def export_document(doc_id: str, format: str = "md"):
    """Download the final anonymized document."""
    session = get_session(doc_id)
    if not session:
        raise HTTPException(status_code=404, detail="Document session not found or expired.")
        
    if format.lower() != "md":
        raise HTTPException(status_code=400, detail="Only markdown (md) format is currently supported.")

    # We apply redactions based on current overrides
    # Build a dummy request with no new fields, just to run the engine
    request = RedactRequest(fields_to_redact=[])
    redacted_pages = apply_redaction_to_document(session, request)
    
    # Reconstruct document
    output_lines = []
    for p in redacted_pages:
        output_lines.append(p.text)
        output_lines.append("\n\n---\n\n") # Page separator
        
    markdown_content = "".join(output_lines)
    
    # Clean filename
    safe_name = session.original_filename.rsplit(".", 1)[0]
    export_filename = f"{safe_name}_anonymized.md"
    
    return PlainTextResponse(
        content=markdown_content,
        headers={"Content-Disposition": f'attachment; filename="{export_filename}"'}
    )
