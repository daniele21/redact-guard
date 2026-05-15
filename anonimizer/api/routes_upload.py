import uuid
import hashlib
from datetime import datetime, timezone
from fastapi import APIRouter, UploadFile, File, Form, HTTPException
from config import config
from domain.models import UploadResponse, UploadResponsePage, DocumentSession
from services.pdf_converter import extract_pdf_pages_from_bytes
from services.profile_service import load_profile
from utils.markdown_utils import preprocess_pages_for_pii
from services.session_store import save_session

router = APIRouter()

@router.post("/upload", response_model=UploadResponse)
async def upload_document(
    file: UploadFile = File(...),
    profile: str = Form(default="general"),
):
    # Validate profile exists
    try:
        load_profile(profile)
    except FileNotFoundError:
        raise HTTPException(status_code=400, detail=f"Profile '{profile}' not found.")

    if not file.filename.lower().endswith('.pdf'):
        raise HTTPException(status_code=400, detail="Only PDF files are supported.")
        
    file_bytes = await file.read()
    
    if len(file_bytes) > config.max_file_size_mb * 1024 * 1024:
        raise HTTPException(status_code=400, detail=f"File exceeds max size of {config.max_file_size_mb}MB.")

    # Convert via cached Docling service
    pages = extract_pdf_pages_from_bytes(file_bytes, file.filename)
    
    # Preprocess tables for better LLM PII extraction
    preprocessed_pages = preprocess_pages_for_pii(pages)
    
    # Create session with selected profile
    doc_id = str(uuid.uuid4())
    file_hash = hashlib.sha256(file_bytes).hexdigest()
    
    session = DocumentSession(
        doc_id=doc_id,
        original_filename=file.filename,
        file_hash=file_hash,
        profile_name=profile,
        pages=pages,
        preprocessed_pages=preprocessed_pages,
        pii_results={},
        redaction_overrides={},
        created_at=datetime.now(timezone.utc),
        last_accessed_at=datetime.now(timezone.utc)
    )
    save_session(session)

    # Prepare response
    response_pages = [
        UploadResponsePage(
            page_number=p.page_number,
            char_count=len(p.text),
            text=p.text
        )
        for p in pages
    ]
    
    return UploadResponse(
        doc_id=doc_id,
        page_count=len(pages),
        profile=profile,
        pages=response_pages
    )
