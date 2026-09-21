import json
import urllib.request

from fastapi import APIRouter
from pydantic import BaseModel

from config import config
from cache.cache_manager import cache_manager

router = APIRouter()


class HealthResponse(BaseModel):
    status: str
    llm_status: str
    model: str
    korgis_protocol_version: str | None = None
    cache_stats: dict


def _get_json(url: str, timeout: float = 2.0) -> dict:
    req = urllib.request.Request(
        url,
        headers={"Content-Type": "application/json"},
        method="GET",
    )
    with urllib.request.urlopen(req, timeout=timeout) as response:
        return json.loads(response.read().decode("utf-8"))


@router.get("/health", response_model=HealthResponse)
def health_check():
    """Report backend health and the configured model's readiness in Korgis."""
    llm_status = "offline"
    protocol_version = None

    try:
        models_payload = _get_json(f"{config.korgis_base_url}/models")
        resident: set[str] = set()
        for item in models_payload.get("data", []):
            for key in ("key", "id"):
                value = item.get(key)
                if value:
                    resident.add(str(value))

        identity_payload = _get_json(f"{config.korgis_base_url}/runtime/identity")
        protocol_version = identity_payload.get("protocol_version")
        identity_models = identity_payload.get("models") or {}

        if config.korgis_model in resident or config.korgis_model in identity_models:
            llm_status = "online"
        else:
            llm_status = "model_not_resident"
    except Exception:
        llm_status = "offline"

    return HealthResponse(
        status="ok",
        llm_status=llm_status,
        model=config.korgis_model,
        korgis_protocol_version=protocol_version,
        cache_stats=cache_manager.get_stats(),
    )
