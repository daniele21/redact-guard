from fastapi import APIRouter
from cache.cache_manager import cache_manager

router = APIRouter()

@router.get("/cache/stats")
def get_cache_stats():
    """Get hit/miss statistics for all cache layers."""
    return cache_manager.get_stats()

@router.delete("/cache")
def clear_all_caches():
    """Clear all caches (PDF and LLM)."""
    cache_manager.clear_all()
    return {"cleared": True}

@router.delete("/cache/{namespace}")
def clear_namespace_cache(namespace: str):
    """Clear a specific cache namespace."""
    if namespace == "pdf":
        entries = cache_manager.clear_pdf()
    elif namespace == "llm":
        entries = cache_manager.clear_llm()
    else:
        return {"cleared": False, "error": "Invalid namespace"}
        
    return {"cleared": True, "entries_removed": entries}
