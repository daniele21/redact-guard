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


KORGIS_REQUEST_EVIDENCE_VERSION = "korgis-request-evidence-v1"


@dataclass(frozen=True)
class KorgisMemoryUsage:
    baseline_bytes: int | None = None
    peak_bytes: int | None = None
    end_bytes: int | None = None
    peak_delta_bytes: int | None = None


@dataclass(frozen=True)
class KorgisCPUUsage:
    average_percent: float | None = None
    peak_percent: float | None = None


@dataclass(frozen=True)
class KorgisSamplingInfo:
    interval_ms: int | None = None
    sample_count: int | None = None
    errors: int | None = None
    cpu_observation_ms: float | None = None
    cpu_observation_ms: float | None = None


@dataclass(frozen=True)
class KorgisResourceUsage:
    snapshot_id: str | None = None
    memory: KorgisMemoryUsage = field(default_factory=KorgisMemoryUsage)
    cpu: KorgisCPUUsage = field(default_factory=KorgisCPUUsage)
    sampling: KorgisSamplingInfo = field(default_factory=KorgisSamplingInfo)
    attribution_scope: str | None = None
    attribution_quality: str | None = None
    memory_source: str | None = None
    cpu_source: str | None = None


@dataclass(frozen=True)
class KorgisRequestEvidence:
    evidence_version: str
    request_id: str | None
    execution_source: str | None
    resources: KorgisResourceUsage | None = None


@dataclass(frozen=True)
class LLMInferenceResult:
    model: str
    content: str
    latency_ms: float
    finish_reason: str | None = None
    input_tokens: int | None = None
    output_tokens: int | None = None
    korgis_evidence: KorgisRequestEvidence | None = None


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
    inference_requests: int = 0
    resource_evidence_requests: int = 0
    peak_memory_bytes: int | None = None
    peak_memory_delta_bytes: int | None = None
    average_cpu_percent: float | None = None
    peak_cpu_percent: float | None = None
    resource_cpu_sample_count: int | None = None
    resource_cpu_observation_ms: float | None = None
    resource_sampling_interval_ms: int | None = None
    resource_cpu_sources: list[str] = Field(default_factory=list)
    resource_attribution_scopes: list[str] = Field(default_factory=list)
    resource_attribution_qualities: list[str] = Field(default_factory=list)
