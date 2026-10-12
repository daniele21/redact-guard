"""
Profile service: loads YAML profiles, manages custom PII types, and provides
the merged type list used by the prompt builder.
"""

import json
import logging
import os
import re
import tempfile
import threading
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

import yaml

from domain.models import PIITypeDefinition, ProfileSummary, ProfileDetail

logger = logging.getLogger("redactguard.profiles")

# Resolve paths relative to the anonimizer package root
_PACKAGE_DIR = Path(__file__).resolve().parent.parent
_PROFILES_DIR = _PACKAGE_DIR / "pii_profiles"
_DATA_DIR = _PACKAGE_DIR / "data"
_CUSTOM_TYPES_FILE = _DATA_DIR / "custom_pii_types.json"
_SCOPED_VARIANTS_FILE = Path(os.environ.get(
    "REDACTGUARD_POLICY_VARIANTS_FILE",
    str(Path.home() / "Library" / "Application Support" / "RedactGuard" / "pii-variants.json")
    if os.name == "posix" and os.uname().sysname == "Darwin"
    else str(Path.home() / ".config" / "redactguard" / "pii-variants.json"),
)).expanduser()
_VARIANTS_LOCK = threading.RLock()
_TYPE_KEY = re.compile(r"^[a-z][a-z0-9_]{0,63}$")


# ---------------------------------------------------------------------------
# YAML profile loading
# ---------------------------------------------------------------------------

def list_profiles() -> list[ProfileSummary]:
    """Return a summary list of all available YAML profiles."""
    profiles: list[ProfileSummary] = []
    for path in sorted(_PROFILES_DIR.glob("*.yaml")):
        try:
            data = _load_yaml(path)
            profiles.append(ProfileSummary(
                name=path.stem,
                display_name=data.get("name", path.stem),
                description=data.get("description", ""),
                pii_type_count=len(data.get("pii_types", {})),
            ))
        except Exception as exc:
            logger.warning(f"Skipping invalid profile {path.name}: {exc}")
    return profiles


def load_profile(name: str) -> ProfileDetail:
    """Load a single profile by name and return its full detail."""
    path = _PROFILES_DIR / f"{name}.yaml"
    if not path.exists():
        raise FileNotFoundError(f"Profile '{name}' not found at {path}")

    data = _load_yaml(path)
    pii_types = _parse_pii_types(data.get("pii_types", {}))

    return ProfileDetail(
        name=name,
        display_name=data.get("name", name),
        description=data.get("description", ""),
        pii_types=pii_types,
    )


# ---------------------------------------------------------------------------
# Custom PII types (user-defined, persisted as JSON)
# ---------------------------------------------------------------------------

def load_custom_types() -> list[PIITypeDefinition]:
    """Load user-defined custom PII types from disk."""
    if not _CUSTOM_TYPES_FILE.exists():
        return []
    try:
        raw = json.loads(_CUSTOM_TYPES_FILE.read_text(encoding="utf-8"))
        return [PIITypeDefinition(**item) for item in raw]
    except Exception as exc:
        logger.error("Failed to load legacy custom PII definitions.")
        raise ValueError("Cannot read legacy custom PII definitions safely.") from exc


def save_custom_types(types: list[PIITypeDefinition]) -> None:
    """Persist custom PII types to disk."""
    _DATA_DIR.mkdir(parents=True, exist_ok=True)
    payload = [t.model_dump() for t in types]
    _CUSTOM_TYPES_FILE.write_text(
        json.dumps(payload, indent=2, ensure_ascii=False),
        encoding="utf-8",
    )


def add_custom_type(name: str, description: str) -> PIITypeDefinition:
    """Add a new custom PII type. Raises ValueError if name already exists."""
    existing = load_custom_types()
    if any(t.name == name for t in existing):
        raise ValueError(f"Custom type '{name}' already exists")

    new_type = PIITypeDefinition(
        name=name,
        description=description,
        label=name.replace("_", " ").title(),
        color="pii-custom",
        icon="Tag",
        examples=[],
        is_custom=True,
    )
    existing.append(new_type)
    save_custom_types(existing)
    return new_type


def update_custom_type(current_name: str, name: str, description: str) -> PIITypeDefinition:
    """Update or rename an existing custom PII type."""
    existing = load_custom_types()
    current_index = next(
        (index for index, pii_type in enumerate(existing) if pii_type.name == current_name),
        None,
    )
    if current_index is None:
        raise FileNotFoundError(f"Custom type '{current_name}' not found")

    if name != current_name and any(t.name == name for t in existing):
        raise ValueError(f"Custom type '{name}' already exists")

    updated = PIITypeDefinition(
        name=name,
        description=description,
        label=name.replace("_", " ").title(),
        color="pii-custom",
        icon="Tag",
        examples=existing[current_index].examples,
        is_custom=True,
    )
    existing[current_index] = updated
    save_custom_types(existing)
    return updated


def remove_custom_type(name: str) -> bool:
    """Remove a custom PII type by name. Returns True if found and removed."""
    existing = load_custom_types()
    filtered = [t for t in existing if t.name != name]
    if len(filtered) == len(existing):
        return False
    save_custom_types(filtered)
    return True


# ---------------------------------------------------------------------------
# Merged type list (profile + custom)
# ---------------------------------------------------------------------------

def _variant_store() -> dict[str, Any]:
    if not _SCOPED_VARIANTS_FILE.exists():
        return {"schema": 1, "profiles": {}}
    try:
        doc = json.loads(_SCOPED_VARIANTS_FILE.read_text(encoding="utf-8"))
        if not isinstance(doc, dict) or doc.get("schema") != 1 or not isinstance(doc.get("profiles"), dict):
            raise ValueError("Unrecognized PII variant store schema.")
        return doc
    except (OSError, UnicodeError, json.JSONDecodeError) as exc:
        raise ValueError("Cannot read scoped PII variants: changes were not applied.") from exc


def _write_variant_store(doc: dict[str, Any]) -> None:
    _SCOPED_VARIANTS_FILE.parent.mkdir(parents=True, exist_ok=True, mode=0o700)
    fd, temporary = tempfile.mkstemp(prefix=".pii-variants-", dir=_SCOPED_VARIANTS_FILE.parent)
    try:
        with os.fdopen(fd, "w", encoding="utf-8") as stream:
            json.dump(doc, stream, ensure_ascii=False, indent=2)
            stream.flush()
            os.fsync(stream.fileno())
        os.replace(temporary, _SCOPED_VARIANTS_FILE)
    finally:
        if os.path.exists(temporary):
            os.unlink(temporary)


def _history(doc: dict[str, Any], profile: str, key: str) -> list[dict[str, Any]]:
    revisions = doc["profiles"].get(profile, {}).get(key, [])
    if not isinstance(revisions, list) or not all(isinstance(item, dict) for item in revisions):
        raise ValueError("Invalid PII variant history.")
    return revisions


def _base_types(profile_name: str) -> dict[str, PIITypeDefinition]:
    # Existing global custom types are retained unchanged for backwards compatibility.
    base = {item.name: item for item in load_profile(profile_name).pii_types}
    base.update({item.name: item for item in load_custom_types()})
    return base


def get_all_pii_types(profile_name: str) -> list[PIITypeDefinition]:
    """Resolve base profile + legacy global custom + scoped latest revision.

    Variants are never written back to the built-in YAML or legacy custom file.
    Tombstone restores the previous base/global definition without erasing history.
    """
    with _VARIANTS_LOCK:
        resolved = _base_types(profile_name)
        scoped = _variant_store()["profiles"].get(profile_name, {})
        if not isinstance(scoped, dict):
            raise ValueError("Invalid scoped policy.")
        for key, revisions in scoped.items():
            if not isinstance(revisions, list) or not revisions:
                raise ValueError("Invalid PII variant revision list.")
            revision = revisions[-1]
            if revision.get("restore"):
                continue
            if revision.get("enabled") is False:
                resolved.pop(key, None)
                continue
            if not isinstance(revision.get("description"), str):
                raise ValueError("Invalid scoped PII definition.")
            previous = resolved.get(key)
            resolved[key] = PIITypeDefinition(
                name=key,
                label=revision.get("label") or (previous.label if previous else key.replace("_", " ").title()),
                description=revision["description"],
                examples=previous.examples if previous else [],
                color=previous.color if previous else "pii-custom",
                icon=previous.icon if previous else "Tag",
                is_custom=True,
            )
        return list(resolved.values())


def get_policy_detail(profile_name: str) -> dict[str, Any]:
    with _VARIANTS_LOCK:
        built_in = load_profile(profile_name)
        legacy_global = load_custom_types()
        source_by_key = {item.name: "predefined" for item in built_in.pii_types}
        source_by_key.update({item.name: "legacy_global" for item in legacy_global})
        doc = _variant_store()
        scoped = doc["profiles"].get(profile_name, {})
        if not isinstance(scoped, dict):
            raise ValueError("Invalid scoped policy.")
        for key, history in scoped.items():
            if history and not history[-1].get("restore"):
                source_by_key[key] = "scoped"
        return {
            "profile": profile_name,
            "base_types": [item.model_dump() for item in built_in.pii_types],
            "inherited_types": [item.model_dump() for item in _base_types(profile_name).values()],
            "effective_types": [item.model_dump() for item in get_all_pii_types(profile_name)],
            "origins": source_by_key,
            "history": scoped,
        }


def save_profile_variant(
    profile_name: str,
    key: str,
    description: str,
    *,
    label: str | None = None,
    enabled: bool = True,
) -> dict[str, Any]:
    if not _TYPE_KEY.fullmatch(key):
        raise ValueError("PII key must start with a letter and contain only lowercase letters, digits or underscores.")
    if not isinstance(description, str) or not 1 <= len(description.strip()) <= 2048:
        raise ValueError("PII definition must contain 1 to 2048 characters.")
    if label is not None and (not isinstance(label, str) or not 1 <= len(label.strip()) <= 80):
        raise ValueError("PII label must contain 1 to 80 characters.")
    with _VARIANTS_LOCK:
        load_profile(profile_name)
        doc = _variant_store()
        history = doc["profiles"].setdefault(profile_name, {}).setdefault(key, [])
        record = {
            "revision": len(history) + 1,
            "description": description.strip(),
            "label": label.strip() if label else None,
            "enabled": enabled,
            "created_at": datetime.now(timezone.utc).isoformat(),
        }
        history.append(record)
        _write_variant_store(doc)
        return record


def restore_profile_variant(profile_name: str, key: str) -> dict[str, Any]:
    with _VARIANTS_LOCK:
        load_profile(profile_name)
        doc = _variant_store()
        history = _history(doc, profile_name, key)
        if not history or history[-1].get("restore"):
            raise FileNotFoundError("No active scoped variant exists.")
        record = {
            "revision": len(history) + 1,
            "restore": True,
            "created_at": datetime.now(timezone.utc).isoformat(),
        }
        history.append(record)
        _write_variant_store(doc)
        return record


def revert_profile_variant(profile_name: str, key: str, revision: int) -> dict[str, Any]:
    """Restore a prior revision by appending a new revision (never rewrite history)."""
    with _VARIANTS_LOCK:
        load_profile(profile_name)
        doc = _variant_store()
        history = _history(doc, profile_name, key)
        previous = next((item for item in history if item.get("revision") == revision), None)
        if not previous:
            raise FileNotFoundError("Revision does not exist.")
        record = {k: v for k, v in previous.items() if k not in ("revision", "created_at")}
        record["revision"] = len(history) + 1
        record["created_at"] = datetime.now(timezone.utc).isoformat()
        history.append(record)
        _write_variant_store(doc)
        return record


# ---------------------------------------------------------------------------
# Internal helpers
# ---------------------------------------------------------------------------

def _load_yaml(path: Path) -> dict[str, Any]:
    """Read and parse a YAML file."""
    with open(path, "r", encoding="utf-8") as f:
        return yaml.safe_load(f) or {}


def _parse_pii_types(raw: dict[str, Any]) -> list[PIITypeDefinition]:
    """Convert the pii_types dict from YAML into a list of PIITypeDefinition."""
    types: list[PIITypeDefinition] = []
    for key, value in raw.items():
        types.append(PIITypeDefinition(
            name=key,
            label=value.get("label", key),
            description=value.get("description", ""),
            examples=value.get("examples", []),
            color=value.get("color", "pii-secret"),
            icon=value.get("icon", "Tag"),
            is_custom=False,
        ))
    return types
