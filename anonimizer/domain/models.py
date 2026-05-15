from dataclasses import dataclass
from datetime import datetime
from pydantic import BaseModel, Field

@dataclass
class PageMarkdown:
    page_number: int
    text: str


# ---------------------------------------------------------------------------
# PII Profile models
# ---------------------------------------------------------------------------

class PIITypeDefinition(BaseModel):
    """A single PII type definition, from YAML profile or user-created."""
    name: str
    label: str
    description: str
    examples: list[str] = Field(default_factory=list)
    color: str = "pii-secret"
    icon: str = "Tag"
    is_custom: bool = False

class ProfileSummary(BaseModel):
    """Lightweight profile info for listing."""
    name: str
    display_name: str
    description: str
    pii_type_count: int

class ProfileDetail(BaseModel):
    """Full profile with all PII type definitions."""
    name: str
    display_name: str
    description: str
    pii_types: list[PIITypeDefinition]

class CustomTypeRequest(BaseModel):
    """Request body for adding a custom PII type."""
    name: str
    description: str


# ---------------------------------------------------------------------------
# PII Detection models
# ---------------------------------------------------------------------------

class PIIField(BaseModel):
    field_name: str
    field_description: str
    pii_type: str
    value: str
    redacted_value: str
    start: int | None
    end: int | None

class PageAnalysisResult(BaseModel):
    page_number: int
    has_pii: bool
    pii_fields: list[PIIField]
    redacted_text: str
    warning: str | None = None
    cache_hit: bool = False

@dataclass
class DocumentSession:
    doc_id: str
    original_filename: str
    file_hash: str
    profile_name: str  # active PII profile used for analysis
    pages: list[PageMarkdown]
    preprocessed_pages: list[PageMarkdown]
    pii_results: dict[int, list[PIIField]]  # page_number -> fields
    redaction_overrides: dict[str, bool]  # field_id -> should_redact
    created_at: datetime
    last_accessed_at: datetime

class UploadResponsePage(BaseModel):
    page_number: int
    char_count: int
    text: str

class UploadResponse(BaseModel):
    doc_id: str
    page_count: int
    profile: str
    pages: list[UploadResponsePage]

class RedactRequestItem(BaseModel):
    field_id: str
    redact: bool

class RedactRequest(BaseModel):
    fields_to_redact: list[RedactRequestItem]

class RedactedPage(BaseModel):
    page_number: int
    text: str

class RedactResponse(BaseModel):
    redacted_pages: list[RedactedPage]
    stats: dict[str, int]
