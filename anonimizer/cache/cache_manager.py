import os
from diskcache import Cache
from config import config
from cache.stats import global_stats

class CacheManager:
    def __init__(self):
        self.base_dir = config.cache.cache_dir
        
        pdf_dir = os.path.join(self.base_dir, "pdf")
        llm_dir = os.path.join(self.base_dir, "llm")
        
        self.pdf_cache = Cache(
            pdf_dir,
            size_limit=config.cache.pdf_cache_max_size_mb * 1024 * 1024
        )
        self.llm_cache = Cache(
            llm_dir,
            size_limit=config.cache.llm_cache_max_size_mb * 1024 * 1024
        )

    def get_pdf(self, key: str):
        if not config.cache.pdf_cache_enabled:
            return None
        res = self.pdf_cache.get(key)
        global_stats.record_pdf(hit=res is not None)
        return res

    def set_pdf(self, key: str, value):
        if config.cache.pdf_cache_enabled:
            ttl = config.cache.pdf_cache_ttl_days * 86400
            self.pdf_cache.set(key, value, expire=ttl)

    def get_llm(self, key: str):
        if not config.cache.llm_cache_enabled:
            return None
        res = self.llm_cache.get(key)
        global_stats.record_llm(hit=res is not None)
        return res

    def set_llm(self, key: str, value):
        if config.cache.llm_cache_enabled:
            ttl = config.cache.llm_cache_ttl_days * 86400
            self.llm_cache.set(key, value, expire=ttl)

    def clear_all(self):
        self.pdf_cache.clear()
        self.llm_cache.clear()

    def clear_pdf(self):
        return self.pdf_cache.clear()

    def clear_llm(self):
        return self.llm_cache.clear()

    def get_stats(self):
        return global_stats.get_stats(self.pdf_cache, self.llm_cache)

cache_manager = CacheManager()
