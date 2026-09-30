from fastapi import APIRouter, HTTPException
from fastapi.responses import HTMLResponse, PlainTextResponse

from domain.models import RedactRequest
from services.analysis_summary import build_document_summary
from services.client_report import render_client_report
from services.redaction_engine import apply_redaction_to_document
from services.session_store import get_session

router = APIRouter()


@router.get("/export/{doc_id}")
def export_document(doc_id: str, format: str = "md"):
    """Download the final protected document."""
    session = get_session(doc_id)
    if not session:
        raise HTTPException(
            status_code=404,
            detail="Document session not found or expired.",
        )

    if format.lower() != "md":
        raise HTTPException(
            status_code=400,
            detail="Only markdown (md) format is currently supported.",
        )

    request = RedactRequest(fields_to_redact=[])
    redacted_pages = apply_redaction_to_document(session, request)

    output_lines = []
    for page in redacted_pages:
        output_lines.append(page.text)
        output_lines.append("\n\n---\n\n")

    markdown_content = "".join(output_lines)
    safe_name = session.original_filename.rsplit(".", 1)[0]
    export_filename = f"{safe_name}_protected.md"

    return PlainTextResponse(
        content=markdown_content,
        headers={
            "Content-Disposition": f'attachment; filename="{export_filename}"'
        },
    )


@router.get("/export/{doc_id}/report", response_class=HTMLResponse)
def export_client_report(doc_id: str, download: bool = False):
    """Render a client-facing protection report with aggregated/masked evidence."""
    session = get_session(doc_id)
    if not session:
        raise HTTPException(
            status_code=404,
            detail="Document session not found or expired.",
        )

    summary = build_document_summary(session)
    report = render_client_report(summary)
    safe_name = session.original_filename.rsplit(".", 1)[0]
    headers = {}
    if download:
        headers["Content-Disposition"] = (
            f'attachment; filename="{safe_name}_protection_report.html"'
        )

    return HTMLResponse(content=report, headers=headers)
