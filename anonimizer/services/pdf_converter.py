import os
import tempfile
from pathlib import Path
from domain.models import PageMarkdown
from cache.cache_manager import cache_manager
from cache.keys import build_pdf_cache_key

def build_docling_converter():
    from docling.datamodel.base_models import InputFormat
    from docling.document_converter import DocumentConverter

    artifacts_path = os.getenv("DOCLING_ARTIFACTS_PATH")
    if artifacts_path:
        return DocumentConverter(
            allowed_formats=[InputFormat.PDF],
            artifacts_path=artifacts_path,
        )
    return DocumentConverter(allowed_formats=[InputFormat.PDF])

def extract_pdf_pages_from_bytes(file_bytes: bytes, filename: str) -> list[PageMarkdown]:
    cache_key = build_pdf_cache_key(file_bytes)
    cached = cache_manager.get_pdf(cache_key)
    if cached is not None:
        return cached

    # Docling needs a file path, so we write the bytes to a temp file
    with tempfile.NamedTemporaryFile(delete=False, suffix=".pdf") as tmp:
        tmp.write(file_bytes)
        tmp_path = Path(tmp.name)

    try:
        converter = build_docling_converter()
        result = converter.convert(tmp_path)
        doc = result.document
        page_count = getattr(result.input, "page_count", 0) or len(getattr(result, "pages", []) or [])

        if page_count <= 0:
            markdown = doc.export_to_markdown().strip()
            pages = [PageMarkdown(page_number=1, text=markdown)]
        else:
            pages = [
                PageMarkdown(
                    page_number=page_number,
                    text=doc.export_to_markdown(page_no=page_number).strip(),
                )
                for page_number in range(1, page_count + 1)
            ]
        
        cache_manager.set_pdf(cache_key, pages)
        return pages
    finally:
        if tmp_path.exists():
            tmp_path.unlink()
