from fastapi import APIRouter
from pydantic import BaseModel

from cache.cache_manager import cache_manager
from config import config
from services.korgis_client import KorgisRuntimeAdapter

router = APIRouter()


class HealthResponse(BaseModel):
    status: str
    llm_status: str
    model: str
    korgis_mode: str
    korgis_protocol_version: str | None = None
    korgis_compatibility: str | None = None
    korgis_request_evidence_supported: bool = False
    cache_stats: dict


@router.get("/health", response_model=HealthResponse)
def health_check():
    """Report backend health and Korgis compatibility/readiness."""
    llm_status = "offline"
    protocol_version = None
    compatibility_status = None
    request_evidence_supported = False

    try:
        compatibility = KorgisRuntimeAdapter(timeout=2.0).compatibility()
        protocol_version = compatibility.identity_protocol
        compatibility_status = compatibility.status
        request_evidence_supported = compatibility.request_evidence_supported
        if (
            config.korgis_mode == "managed"
            and compatibility.status != "compatible"
        ):
            llm_status = "runtime_incompatible"
        else:
            llm_status = (
                "online"
                if compatibility.model_resident
                else "model_not_resident"
            )
    except Exception:
        llm_status = "offline"

    return HealthResponse(
        status="ok",
        llm_status=llm_status,
        model=config.korgis_model,
        korgis_mode=config.korgis_mode,
        korgis_protocol_version=protocol_version,
        korgis_compatibility=compatibility_status,
        korgis_request_evidence_supported=request_evidence_supported,
        cache_stats=cache_manager.get_stats(),
    )
