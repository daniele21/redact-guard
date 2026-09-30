from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

from domain.detection import DetectionContractError
from domain.models import DocumentAnalysisSummary, PageAnalysisResult
from services.analysis_summary import build_document_summary
from services.pii_detector import detect_pii_for_page
from services.session_store import get_session, save_session

router = APIRouter()


class BatchAnalysisResponse(BaseModel):
    pages: list[PageAnalysisResult]


def _detection_http_error(exc: DetectionContractError) -> HTTPException:
    return HTTPException(
        status_code=502,
        detail={
            "code": exc.code.value,
            "message": str(exc),
            "details": exc.details,
        },
    )


@router.get(
    "/analyze/{doc_id}/summary",
    response_model=DocumentAnalysisSummary,
)
def analysis_summary(doc_id: str):
    session = get_session(doc_id)
    if not session:
        raise HTTPException(
            status_code=404,
            detail="Document session not found or expired.",
        )
    return build_document_summary(session)


@router.post("/analyze/{doc_id}/page/{page_number}", response_model=PageAnalysisResult)
def analyze_page(doc_id: str, page_number: int, force: bool = False):
    """Analyze a single page of a document for PII."""
    session = get_session(doc_id)
    if not session:
        raise HTTPException(
            status_code=404,
            detail="Document session not found or expired.",
        )

    page_to_analyze = next(
        (page for page in session.pages if page.page_number == page_number),
        None,
    )
    if not page_to_analyze:
        raise HTTPException(
            status_code=404,
            detail=f"Page {page_number} not found in document.",
        )

    session.page_analysis_status[page_number] = "analyzing"
    session.page_analysis_errors.pop(page_number, None)
    save_session(session)

    try:
        result = detect_pii_for_page(
            page_to_analyze,
            session.profile_name,
            force=force,
        )
    except DetectionContractError as exc:
        session.page_analysis_status[page_number] = "failed"
        session.page_analysis_errors[page_number] = f"{exc.code.value}: {exc}"
        session.page_diagnostics.pop(page_number, None)
        save_session(session)
        raise _detection_http_error(exc) from exc

    session.pii_results[page_number] = result.pii_fields
    session.page_diagnostics[page_number] = result.diagnostics
    session.page_analysis_status[page_number] = (
        "warning" if result.warning else "complete"
    )
    session.page_analysis_errors.pop(page_number, None)
    save_session(session)
    return result


@router.post("/analyze/{doc_id}", response_model=BatchAnalysisResponse)
def analyze_document_batch(doc_id: str):
    """Analyze all pages sequentially and preserve page-level status."""
    session = get_session(doc_id)
    if not session:
        raise HTTPException(
            status_code=404,
            detail="Document session not found or expired.",
        )

    results = []
    for page in session.pages:
        session.page_analysis_status[page.page_number] = "analyzing"
        session.page_analysis_errors.pop(page.page_number, None)
        save_session(session)

        try:
            result = detect_pii_for_page(page, session.profile_name)
        except DetectionContractError as exc:
            session.page_analysis_status[page.page_number] = "failed"
            session.page_analysis_errors[page.page_number] = (
                f"{exc.code.value}: {exc}"
            )
            session.page_diagnostics.pop(page.page_number, None)
            save_session(session)
            raise _detection_http_error(exc) from exc

        session.pii_results[page.page_number] = result.pii_fields
        session.page_diagnostics[page.page_number] = result.diagnostics
        session.page_analysis_status[page.page_number] = (
            "warning" if result.warning else "complete"
        )
        results.append(result)

    save_session(session)
    return BatchAnalysisResponse(pages=results)
