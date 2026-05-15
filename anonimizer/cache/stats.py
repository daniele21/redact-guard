from dataclasses import dataclass
from diskcache import Cache

@dataclass
class CacheStats:
    entries: int
    size_mb: float
    hits: int = 0
    misses: int = 0

class StatsTracker:
    def __init__(self):
        self.hits_pdf = 0
        self.misses_pdf = 0
        self.hits_llm = 0
        self.misses_llm = 0

    def record_pdf(self, hit: bool):
        if hit:
            self.hits_pdf += 1
        else:
            self.misses_pdf += 1

    def record_llm(self, hit: bool):
        if hit:
            self.hits_llm += 1
        else:
            self.misses_llm += 1

    def get_stats(self, pdf_cache: Cache, llm_cache: Cache) -> dict:
        def _get_size_mb(c: Cache) -> float:
            try:
                # Cache size is returned as int in bytes
                return round(c.volume() / (1024 * 1024), 2)
            except Exception:
                return 0.0

        return {
            "pdf_cache": {
                "entries": len(pdf_cache),
                "size_mb": _get_size_mb(pdf_cache),
                "hits": self.hits_pdf,
                "misses": self.misses_pdf,
            },
            "llm_cache": {
                "entries": len(llm_cache),
                "size_mb": _get_size_mb(llm_cache),
                "hits": self.hits_llm,
                "misses": self.misses_llm,
            },
            # Rough estimate: PDF conversion ~15s, LLM ~30s
            "estimated_time_saved_seconds": (self.hits_pdf * 15) + (self.hits_llm * 30)
        }

global_stats = StatsTracker()
