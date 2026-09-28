from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

from domain.detection import DetectionContractError
from domain.models import PageAnalysisResult
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

    try:
        result = detect_pii_for_page(
            page_to_analyze,
            session.profile_name,
            force=force,
        )
    except DetectionContractError as exc:
        raise _detection_http_error(exc) from exc

    session.pii_results[page_number] = result.pii_fields
    save_session(session)
    return result


@router.post("/analyze/{doc_id}", response_model=BatchAnalysisResponse)
def analyze_document_batch(doc_id: str):
    """Analyze all pages sequentially and fail explicitly on detection errors."""
    session = get_session(doc_id)
    if not session:
        raise HTTPException(
            status_code=404,
            detail="Document session not found or expired.",
        )

    results = []
    try:
        for page in session.pages:
            result = detect_pii_for_page(page, session.profile_name)
            session.pii_results[page.page_number] = result.pii_fields
            results.append(result)
    except DetectionContractError as exc:
        # Do not save a failed page as if it contained no PII.
        save_session(session)
        raise _detection_http_error(exc) from exc

    save_session(session)
    return BatchAnalysisResponse(pages=results)
