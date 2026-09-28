from __future__ import annotations

from dataclasses import dataclass, field
from enum import Enum
from typing import Any

from pydantic import BaseModel, ConfigDict, Field


DETECTION_CONTRACT_VERSION = "redactguard-detection-v2"


class DetectionFailureCode(str, Enum):
    TRANSPORT_ERROR = "transport_error"
    BACKEND_ERROR = "backend_error"
    INVALID_RESPONSE = "invalid_response"
    INVALID_JSON = "invalid_json"
    INVALID_SCHEMA = "invalid_schema"
    TRUNCATED_OUTPUT = "truncated_output"


class DetectionContractError(RuntimeError):
    """Typed failure at the RedactGuard model-inference boundary."""

    def __init__(
        self,
        code: DetectionFailureCode,
        message: str,
        *,
        details: dict[str, Any] | None = None,
    ) -> None:
        self.code = code
        self.details = details or {}
        super().__init__(message)


class ModelPIIField(BaseModel):
    """Minimal information that must actually be inferred by the model."""

    model_config = ConfigDict(extra="ignore")

    pii_type: str = Field(min_length=1)
    value: str = Field(min_length=1)


class ModelPIIResponse(BaseModel):
    """Versioned RedactGuard model-output contract."""

    model_config = ConfigDict(extra="ignore")

    pii_fields: list[ModelPIIField] = Field(default_factory=list)


@dataclass(frozen=True)
class LLMInferenceResult:
    model: str
    content: str
    latency_ms: float
    finish_reason: str | None = None
    input_tokens: int | None = None
    output_tokens: int | None = None


class DetectionDiagnostics(BaseModel):
    contract_version: str = DETECTION_CONTRACT_VERSION
    status: str = "success"
    model: str
    chunks: int = 1
    cache_hits: int = 0
    latency_ms: float = 0.0
    input_tokens: int | None = None
    output_tokens: int | None = None
    finish_reasons: list[str] = Field(default_factory=list)
    parsed_items: int = 0
    resolved_items: int = 0
    unresolved_items: int = 0
