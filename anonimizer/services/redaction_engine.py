import logging
from domain.models import DocumentSession, RedactRequest, RedactedPage

logger = logging.getLogger("redactguard.redaction")

def apply_redaction_to_document(session: DocumentSession, request: RedactRequest) -> list[RedactedPage]:
    """
    Applies the user's redaction choices to the document pages.
    Returns the fully redacted pages.
    """
    
    # First, update the session with new choices
    for item in request.fields_to_redact:
        session.redaction_overrides[item.field_id] = item.redact

    redacted_pages = []
    
    for page in session.pages:
        page_num = page.page_number
        text = page.text
        fields = session.pii_results.get(page_num, [])
        
        # Determine which fields to redact
        fields_to_apply = []
        for field in fields:
            # We use a composite field_id matching what the frontend uses
            field_id = f"{page_num}_{field.pii_type}_{field.value}"
            # Default is to redact (True) unless explicitly overriden
            should_redact = session.redaction_overrides.get(field_id, True)
            if should_redact:
                fields_to_apply.append(field)
                
        # Sort fields in reverse order to not mess up offsets when replacing
        fields_to_apply.sort(key=lambda f: f.start if f.start is not None else 0, reverse=True)
        
        for field in fields_to_apply:
            if field.start is not None and field.end is not None:
                text = text[:field.start] + field.redacted_value + text[field.end:]
            else:
                text = text.replace(field.value, field.redacted_value)
                
        redacted_pages.append(RedactedPage(page_number=page_num, text=text))
        
    return redacted_pages
