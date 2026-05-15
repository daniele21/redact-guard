import os
import json
from pathlib import Path
from dataclasses import dataclass, field
from typing import Any

ROOT_DIR = Path(__file__).parent.parent
CONFIG_FILE = ROOT_DIR / "config.json"

def load_json_config() -> dict[str, Any]:
    """Load configuration from the root config.json file."""
    if CONFIG_FILE.exists():
        try:
            with open(CONFIG_FILE, "r") as f:
                return json.load(f)
        except Exception as e:
            print(f"Warning: Failed to load config.json: {e}")
    return {}

_json_config = load_json_config()
_server_conf = _json_config.get("server", {})
_app_conf = _json_config.get("app", {})
_cache_conf = _app_conf.get("cache", {})
_pdf_cache_conf = _cache_conf.get("pdf_cache", {})
_llm_cache_conf = _cache_conf.get("llm_cache", {})

@dataclass
class CacheConfig:
    """Centralized cache configuration."""
    enabled: bool = os.getenv("CACHE_ENABLED", str(_cache_conf.get("enabled", "true"))).lower() in {"1", "true", "yes", "on"}
    cache_dir: str = os.getenv("CACHE_DIR", _cache_conf.get("cache_dir", ".cache/redactguard"))
    
    pdf_cache_enabled: bool = os.getenv("PDF_CACHE_ENABLED", str(_pdf_cache_conf.get("enabled", "true"))).lower() in {"1", "true", "yes", "on"}
    pdf_cache_max_size_mb: int = int(os.getenv("PDF_CACHE_MAX_SIZE_MB", str(_pdf_cache_conf.get("max_size_mb", "500"))))
    pdf_cache_ttl_days: int = int(os.getenv("PDF_CACHE_TTL_DAYS", str(_pdf_cache_conf.get("ttl_days", "7"))))
    
    llm_cache_enabled: bool = os.getenv("LLM_CACHE_ENABLED", str(_llm_cache_conf.get("enabled", "true"))).lower() in {"1", "true", "yes", "on"}
    llm_cache_max_size_mb: int = int(os.getenv("LLM_CACHE_MAX_SIZE_MB", str(_llm_cache_conf.get("max_size_mb", "200"))))
    llm_cache_ttl_days: int = int(os.getenv("LLM_CACHE_TTL_DAYS", str(_llm_cache_conf.get("ttl_days", "30"))))

@dataclass
class AppConfig:
    """Centralized backend configuration."""
    host: str = os.getenv("HOST", _server_conf.get("host", "127.0.0.1"))
    port: int = int(os.getenv("PORT", str(_server_conf.get("port", "8000"))))
    cors_origins: list[str] = field(default_factory=lambda: os.getenv("CORS_ORIGINS", ",".join(_server_conf.get("cors_origins", ["http://localhost:3000", "http://127.0.0.1:3000"]))).split(","))

    llm_endpoint: str = os.getenv("LLM_ENDPOINT", _server_conf.get("llm_endpoint", "http://localhost:1235/api/v1/chat"))
    llm_model: str = os.getenv("LLM_MODEL", _server_conf.get("llm_model", "nvidia/nemotron-3-nano-4b"))
    llm_timeout: int = int(os.getenv("LLM_TIMEOUT", str(_server_conf.get("llm_timeout", "600"))))

    session_ttl_minutes: int = int(os.getenv("SESSION_TTL_MINUTES", str(_app_conf.get("session_ttl_minutes", "30"))))
    max_file_size_mb: int = int(os.getenv("MAX_FILE_SIZE_MB", str(_app_conf.get("max_file_size_mb", "50"))))
    
    cache: CacheConfig = field(default_factory=CacheConfig)

config = AppConfig()
