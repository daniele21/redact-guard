"""Local model preference for RedactGuard. Korgis remains runtime and artifact owner.

Selection is restricted to currently resident models exposed by Korgis' public
OpenAI-compatible endpoint. We deliberately do not enable its unauthenticated
optional administrative control plane.
"""
from __future__ import annotations

import json
import os
import re
import tempfile
import threading
import urllib.error
import urllib.request
from pathlib import Path

from config import config

_PREFERENCE_PATH = Path(
    os.environ.get(
        "REDACTGUARD_MODEL_PREFERENCE_FILE",
        str(
            Path.home() / "Library" / "Application Support" / "RedactGuard"
            / "model-selection.json"
        ) if os.name == "posix" and os.uname().sysname == "Darwin"
        else str(Path.home() / ".config" / "redactguard" / "model-selection.json"),
    )
).expanduser()
_MODEL_RE = re.compile(r"^[A-Za-z0-9][A-Za-z0-9_.:/-]{0,159}$")
_LOCK = threading.RLock()


class ModelPreferenceError(Exception):
    """Stored preference is invalid or could not be safely persisted."""


class ModelCatalogUnavailable(Exception):
    """Korgis resident-model discovery is unavailable."""


def _validate(model: object) -> str:
    if not isinstance(model, str) or not _MODEL_RE.fullmatch(model):
        raise ModelPreferenceError("Invalid model identifier.")
    return model


def get_selected_model() -> str:
    """Return the persisted model; fall back only when no preference exists."""
    with _LOCK:
        if not _PREFERENCE_PATH.exists():
            return _validate(config.korgis_model)
        try:
            data = json.loads(_PREFERENCE_PATH.read_text(encoding="utf-8"))
            if not isinstance(data, dict) or data.get("version") != 1:
                raise ModelPreferenceError("Unsupported local model preference version.")
            return _validate(data.get("model"))
        except (OSError, UnicodeError, json.JSONDecodeError) as exc:
            raise ModelPreferenceError("Cannot read the local model preference.") from exc


def list_resident_models() -> list[str]:
    url = f"{config.korgis_base_url}/models"
    try:
        with urllib.request.urlopen(
            urllib.request.Request(url, method="GET"), timeout=3
        ) as response:
            payload = json.load(response)
    except (OSError, ValueError, urllib.error.URLError) as exc:
        raise ModelCatalogUnavailable("Korgis resident model discovery is unavailable.") from exc

    data = payload.get("data") if isinstance(payload, dict) else None
    if not isinstance(data, list):
        raise ModelCatalogUnavailable("Korgis model listing has an invalid shape.")

    seen: set[str] = set()
    for item in data:
        if isinstance(item, dict):
            # OpenAI-compatible id is the canonical request selector.
            model = item.get("id")
            if isinstance(model, str) and _MODEL_RE.fullmatch(model):
                seen.add(model)
    return sorted(seen)


def select_resident_model(model: str) -> str:
    """Persist an explicitly selected resident model; no silent load/fallback."""
    model = _validate(model)
    with _LOCK:
        if model not in list_resident_models():
            raise ModelPreferenceError("The requested model is not resident in Korgis.")
        try:
            _PREFERENCE_PATH.parent.mkdir(parents=True, exist_ok=True, mode=0o700)
            fd, path = tempfile.mkstemp(prefix=".model-selection-", dir=_PREFERENCE_PATH.parent)
            try:
                with os.fdopen(fd, "w", encoding="utf-8") as stream:
                    json.dump({"version": 1, "model": model}, stream)
                    stream.flush()
                    os.fsync(stream.fileno())
                os.replace(path, _PREFERENCE_PATH)
            finally:
                if os.path.exists(path):
                    os.unlink(path)
        except OSError as exc:
            raise ModelPreferenceError("Cannot save the local model preference.") from exc
    return model
