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


def _resident_startup_key(model: str) -> str:
    """Resolve the registry key from Korgis public identity, not from filename or model ID."""
    try:
        with urllib.request.urlopen(
            urllib.request.Request(
                f"{config.korgis_base_url}/runtime/identity", method="GET"
            ), timeout=3,
        ) as response:
            payload = json.load(response)
    except (OSError, ValueError, urllib.error.URLError) as exc:
        raise ModelCatalogUnavailable(
            "Korgis runtime identity is unavailable; model choice not saved."
        ) from exc
    if not isinstance(payload, dict) or payload.get("protocol_version") != "local-llm-identity-v1":
        raise ModelCatalogUnavailable("Korgis does not provide a compatible model identity.")
    models = payload.get("models")
    if not isinstance(models, dict):
        raise ModelCatalogUnavailable("Korgis model identity catalog is invalid.")
    matched = [
        key for key, entry in models.items()
        if isinstance(key, str) and _MODEL_RE.fullmatch(key)
        and isinstance(entry, dict)
        and isinstance(entry.get("model"), dict)
        and entry["model"].get("id") == model
    ]
    if len(matched) != 1:
        raise ModelCatalogUnavailable("The selected model cannot be mapped unambiguously to a Korgis startup key.")
    return matched[0]



def list_catalog_models() -> list[dict[str, object]]:
    """Use Korgis' path-free, read-only installed-model contract.

    Downloaded does not mean resident. No admin endpoint or implicit downloads.
    Older Korgis versions simply have no non-resident catalogue.
    """
    try:
        with urllib.request.urlopen(
            urllib.request.Request(
                f"{config.korgis_base_url}/runtime/catalog", method="GET"
            ), timeout=3,
        ) as response:
            payload = json.load(response)
    except (OSError, ValueError, urllib.error.URLError) as exc:
        raise ModelCatalogUnavailable("Korgis local catalog is unavailable.") from exc
    if not isinstance(payload, dict) or payload.get("protocol_version") != "local-llm-catalog-v1":
        raise ModelCatalogUnavailable("Korgis model catalog protocol mismatch.")
    items = payload.get("models")
    if not isinstance(items, list):
        raise ModelCatalogUnavailable("Korgis model catalog shape mismatch.")
    result = []
    model_counts: dict[str, int] = {}
    for item in items:
        if not isinstance(item, dict):
            continue
        key, model = item.get("startup_key"), item.get("model_id")
        if not isinstance(key, str) or not _MODEL_RE.fullmatch(key):
            continue
        if not isinstance(model, str) or not _MODEL_RE.fullmatch(model):
            continue
        if type(item.get("downloaded")) is not bool or type(item.get("resident")) is not bool:
            continue
        model_counts[model] = model_counts.get(model, 0) + 1
        result.append({
            "model_id": model, "startup_key": key,
            "downloaded": item["downloaded"], "resident": item["resident"],
        })
    # Public model IDs do not uniquely name a registry artifact. Never select
    # an arbitrary quantization when more than one startup key shares an ID.
    # A verified resident model can still be selected through identity mapping.
    return [choice for choice in result if model_counts[str(choice["model_id"])] == 1]


def select_available_model(model: str) -> str:
    """Persist an explicitly downloaded (or resident) Korgis text model.

    Nonresident selection becomes active only after restarting managed Korgis;
    no live unload, silent replacement or unprotected administrative API.
    """
    model = _validate(model)
    with _LOCK:
        startup_key = None
        try:
            for entry in list_catalog_models():
                if entry["model_id"] == model and entry["downloaded"]:
                    startup_key = entry["startup_key"]
                    break
        except ModelCatalogUnavailable:
            pass
        if startup_key is None:
            if model not in list_resident_models():
                raise ModelPreferenceError("Model not installed/resident in Korgis.")
            startup_key = _resident_startup_key(model)
        try:
            _PREFERENCE_PATH.parent.mkdir(parents=True, exist_ok=True, mode=0o700)
            fd, path = tempfile.mkstemp(prefix=".model-selection-", dir=_PREFERENCE_PATH.parent)
            try:
                with os.fdopen(fd, "w", encoding="utf-8") as stream:
                    json.dump({"version": 1, "model": model, "startup_key": startup_key}, stream)
                    stream.flush()
                    os.fsync(stream.fileno())
                os.replace(path, _PREFERENCE_PATH)
            finally:
                if os.path.exists(path):
                    os.unlink(path)
        except OSError as exc:
            raise ModelPreferenceError("Cannot save the local model preference.") from exc
    return model

def select_resident_model(model: str) -> str:
    """Persist an explicitly selected resident model; no silent load/fallback."""
    model = _validate(model)
    with _LOCK:
        if model not in list_resident_models():
            raise ModelPreferenceError("The requested model is not resident in Korgis.")
        startup_key = _resident_startup_key(model)
        try:
            _PREFERENCE_PATH.parent.mkdir(parents=True, exist_ok=True, mode=0o700)
            fd, path = tempfile.mkstemp(prefix=".model-selection-", dir=_PREFERENCE_PATH.parent)
            try:
                with os.fdopen(fd, "w", encoding="utf-8") as stream:
                    json.dump({"version": 1, "model": model, "startup_key": startup_key}, stream)
                    stream.flush()
                    os.fsync(stream.fileno())
                os.replace(path, _PREFERENCE_PATH)
            finally:
                if os.path.exists(path):
                    os.unlink(path)
        except OSError as exc:
            raise ModelPreferenceError("Cannot save the local model preference.") from exc
    return model


def get_public_hardware(model_key: str) -> dict[str, object] | None:
    """Allowlisted host identity from Korgis; not a model requirement/benchmark."""
    url = f"{config.korgis_base_url}/runtime/identity"
    try:
        with urllib.request.urlopen(
            urllib.request.Request(url, method="GET"), timeout=3
        ) as response:
            payload = json.load(response)
    except (OSError, ValueError, urllib.error.URLError):
        return None
    if not isinstance(payload, dict) or payload.get("protocol_version") != "local-llm-identity-v1":
        return None
    models = payload.get("models")
    if not isinstance(models, dict):
        return None
    # Runtime keys and effective model IDs can differ. Never assume a first
    # entry represents the user's selected model.
    entry = models.get(model_key)
    if not isinstance(entry, dict):
        entry = next(
            (candidate for candidate in models.values()
             if isinstance(candidate, dict)
             and isinstance(candidate.get("model"), dict)
             and candidate["model"].get("id") == model_key),
            None,
        )
    if not isinstance(entry, dict) or not isinstance(entry.get("hardware"), dict):
        return None
    hardware = entry["hardware"]
    public: dict[str, object] = {}
    for key in ("system", "machine", "processor", "accelerator"):
        value = hardware.get(key)
        if isinstance(value, str) and 0 < len(value) <= 100:
            public[key] = value
    for key in ("logical_cpus", "total_memory_bytes"):
        value = hardware.get(key)
        if type(value) is int and 0 < value < 2**58:
            public[key] = value
    return public or None
