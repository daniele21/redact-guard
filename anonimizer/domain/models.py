from dataclasses import dataclass
from datetime import datetime
from enum import Enum

from pydantic import BaseModel, Field

from domain.detection import DetectionDiagnostics


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
# PII Detection + Review models
# ---------------------------------------------------------------------------

class ReviewDecision(str, Enum):
    REDACT = "redact"
    KEEP = "keep"
    NOT_PII = "not_pii"


class PIIField(BaseModel):
    finding_id: str
    entity_id: str
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
    diagnostics: DetectionDiagnostics | None = None


@dataclass
class DocumentSession:
    doc_id: str
    original_filename: str
    file_hash: str
    profile_name: str
    pages: list[PageMarkdown]
    preprocessed_pages: list[PageMarkdown]
    pii_results: dict[int, list[PIIField]]
    redaction_overrides: dict[str, bool]
    review_decisions: dict[str, str]
    page_analysis_status: dict[int, str]
    page_analysis_errors: dict[int, str]
    page_diagnostics: dict[int, DetectionDiagnostics | None]
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


class SensitiveEntityOccurrence(BaseModel):
    finding_id: str
    page_number: int
    start: int | None
    end: int | None


class SensitiveEntitySummary(BaseModel):
    entity_id: str
    pii_type: str
    label: str
    masked_value: str
    occurrence_count: int
    pages: list[int]
    decision_counts: dict[str, int]
    occurrences: list[SensitiveEntityOccurrence]


class CategoryAnalysisSummary(BaseModel):
    pii_type: str
    label: str
    occurrence_count: int


class DocumentResourceSummary(BaseModel):
    inference_requests: int = 0
    cache_hits: int = 0
    evidence_requests: int = 0
    peak_memory_bytes: int | None = None
    peak_memory_delta_bytes: int | None = None
    average_cpu_percent: float | None = None
    peak_cpu_percent: float | None = None
    cpu_sample_count: int | None = None
    sampling_interval_ms: int | None = None
    cpu_observation_ms: float | None = None
    memory_sources: list[str] = Field(default_factory=list)
    cpu_sources: list[str] = Field(default_factory=list)
    attribution_scopes: list[str] = Field(default_factory=list)
    attribution_qualities: list[str] = Field(default_factory=list)


class DocumentAnalysisSummary(BaseModel):
    document_id: str
    filename: str
    profile: str
    contract_version: str
    analysis_status: str
    pages_total: int
    pages_analyzed: int
    pages_failed: int
    pages_with_warnings: int
    affected_pages: int
    unique_sensitive_items: int
    occurrences: int
    categories: list[CategoryAnalysisSummary]
    decision_counts: dict[str, int]
    unresolved_findings: int
    page_status: dict[int, str]
    page_errors: dict[int, str]
    entities: list[SensitiveEntitySummary]
    resources: DocumentResourceSummary = Field(default_factory=DocumentResourceSummary)
    local_processing: bool = True


class RedactRequestItem(BaseModel):
    field_id: str
    decision: ReviewDecision | None = None
    # Backwards-compatible bridge for older clients.
    redact: bool | None = None


class RedactRequest(BaseModel):
    fields_to_redact: list[RedactRequestItem]


class RedactedPage(BaseModel):
    page_number: int
    text: str


class RedactResponse(BaseModel):
    redacted_pages: list[RedactedPage]
    stats: dict[str, int]
