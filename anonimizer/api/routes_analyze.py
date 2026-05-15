from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from domain.models import PageAnalysisResult
from services.session_store import get_session, save_session
from services.pii_detector import detect_pii_for_page

router = APIRouter()

class BatchAnalysisResponse(BaseModel):
    pages: list[PageAnalysisResult]

@router.post("/analyze/{doc_id}/page/{page_number}", response_model=PageAnalysisResult)
def analyze_page(doc_id: str, page_number: int, force: bool = False):
    """Analyze a single page of a document for PII."""
    session = get_session(doc_id)
    if not session:
        raise HTTPException(status_code=404, detail="Document session not found or expired.")
        
    # Find the requested page
    page_to_analyze = next((p for p in session.pages if p.page_number == page_number), None)
    if not page_to_analyze:
        raise HTTPException(status_code=404, detail=f"Page {page_number} not found in document.")

    # Call the detector
    result = detect_pii_for_page(page_to_analyze, session.profile_name, force=force)
    
    # Store result in session
    session.pii_results[page_number] = result.pii_fields
    save_session(session)
    
    return result

@router.post("/analyze/{doc_id}", response_model=BatchAnalysisResponse)
def analyze_document_batch(doc_id: str):
    """Analyze all pages sequentially."""
    session = get_session(doc_id)
    if not session:
        raise HTTPException(status_code=404, detail="Document session not found or expired.")
        
    results = []
    for page in session.pages:
        result = detect_pii_for_page(page, session.profile_name)
        session.pii_results[page.page_number] = result.pii_fields
        results.append(result)
        
    save_session(session)
    return BatchAnalysisResponse(pages=results)
