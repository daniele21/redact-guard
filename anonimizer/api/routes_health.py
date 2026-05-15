import time
import urllib.request
import urllib.error
from fastapi import APIRouter
from pydantic import BaseModel
from config import config
from cache.cache_manager import cache_manager

router = APIRouter()

class HealthResponse(BaseModel):
    status: str
    llm_status: str
    model: str
    cache_stats: dict

@router.get("/health", response_model=HealthResponse)
def health_check():
    # Check LLM Server reachability
    llm_status = "offline"
    try:
        req = urllib.request.Request(
            config.llm_endpoint.replace("/chat", "/models"),
            headers={"Content-Type": "application/json"}
        )
        with urllib.request.urlopen(req, timeout=2) as response:
            if response.status == 200:
                llm_status = "online"
    except Exception:
        pass

    return HealthResponse(
        status="ok",
        llm_status=llm_status,
        model=config.llm_model,
        cache_stats=cache_manager.get_stats()
    )

