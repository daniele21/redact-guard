import os
import json
from pathlib import Path
from dataclasses import dataclass, field
from typing import Any
import logging

ROOT_DIR = Path(__file__).parent.parent
CONFIG_FILE = ROOT_DIR / "config.json"
_DEFAULT_CACHE_DIR = str(Path(os.environ.get("XDG_CACHE_HOME", Path.home() / ".cache")) / "redactguard")


def load_json_config() -> dict[str, Any]:
    """Load configuration from the root config.json file."""
    if CONFIG_FILE.exists():
        try:
            with open(CONFIG_FILE, "r", encoding="utf-8") as f:
                return json.load(f)
        except Exception as exc:
            logging.warning("Failed to load config.json: %s", exc)
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

    enabled: bool = os.getenv(
        "CACHE_ENABLED", str(_cache_conf.get("enabled", "true"))
    ).lower() in {"1", "true", "yes", "on"}
    cache_dir: str = str(
        Path(
            os.path.expanduser(
                os.getenv("CACHE_DIR", _cache_conf.get("cache_dir", ""))
                or _DEFAULT_CACHE_DIR
            )
        ).resolve()
    )

    pdf_cache_enabled: bool = os.getenv(
        "PDF_CACHE_ENABLED", str(_pdf_cache_conf.get("enabled", "true"))
    ).lower() in {"1", "true", "yes", "on"}
    pdf_cache_max_size_mb: int = int(
        os.getenv("PDF_CACHE_MAX_SIZE_MB", str(_pdf_cache_conf.get("max_size_mb", "500")))
    )
    pdf_cache_ttl_days: int = int(
        os.getenv("PDF_CACHE_TTL_DAYS", str(_pdf_cache_conf.get("ttl_days", "7")))
    )

    llm_cache_enabled: bool = os.getenv(
        "LLM_CACHE_ENABLED", str(_llm_cache_conf.get("enabled", "true"))
    ).lower() in {"1", "true", "yes", "on"}
    llm_cache_max_size_mb: int = int(
        os.getenv("LLM_CACHE_MAX_SIZE_MB", str(_llm_cache_conf.get("max_size_mb", "200")))
    )
    llm_cache_ttl_days: int = int(
        os.getenv("LLM_CACHE_TTL_DAYS", str(_llm_cache_conf.get("ttl_days", "30")))
    )


@dataclass
class AppConfig:
    """RedactGuard application configuration.

    Korgis is the only local model runtime authority. RedactGuard owns the PII policy,
    prompting, post-processing, review and deterministic redaction layers, but it does
    not own model artifacts or an embedded inference server.
    """

    host: str = os.getenv("HOST", _server_conf.get("host", "127.0.0.1"))
    port: int = int(os.getenv("PORT", str(_server_conf.get("port", "8000"))))
    cors_origins: list[str] = field(
        default_factory=lambda: os.getenv(
            "CORS_ORIGINS",
            ",".join(
                _server_conf.get(
                    "cors_origins",
                    ["http://localhost:3000", "http://127.0.0.1:3000"],
                )
            ),
        ).split(",")
    )

    korgis_base_url: str = os.getenv(
        "KORGIS_BASE_URL",
        _server_conf.get("korgis_base_url", "http://127.0.0.1:1235/v1"),
    ).rstrip("/")
    korgis_model: str = os.getenv(
        "KORGIS_MODEL",
        _server_conf.get("korgis_model", "nemotron-nano-4b"),
    )
    llm_timeout: int = int(
        os.getenv("LLM_TIMEOUT", str(_server_conf.get("llm_timeout", "600")))
    )
    llm_max_output_tokens: int = int(
        os.getenv(
            "LLM_MAX_OUTPUT_TOKENS",
            str(_server_conf.get("llm_max_output_tokens", "1024")),
        )
    )

    session_ttl_minutes: int = int(
        os.getenv(
            "SESSION_TTL_MINUTES",
            str(_app_conf.get("session_ttl_minutes", "30")),
        )
    )
    max_file_size_mb: int = int(
        os.getenv("MAX_FILE_SIZE_MB", str(_app_conf.get("max_file_size_mb", "50")))
    )

    cache: CacheConfig = field(default_factory=CacheConfig)

    @property
    def llm_endpoint(self) -> str:
        return f"{self.korgis_base_url}/chat/completions"

    @property
    def llm_model(self) -> str:
        return self.korgis_model


config = AppConfig()
