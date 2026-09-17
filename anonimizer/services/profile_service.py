"""
Profile service: loads YAML profiles, manages custom PII types, and provides
the merged type list used by the prompt builder.
"""

import json
import logging
import os
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
        logger.error(f"Failed to load custom types: {exc}")
        return []


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

def get_all_pii_types(profile_name: str) -> list[PIITypeDefinition]:
    """Return merged list: profile types + custom types."""
    profile = load_profile(profile_name)
    custom = load_custom_types()

    # Deduplicate: custom types with same name override profile types
    seen = {t.name for t in custom}
    merged = list(custom)
    for t in profile.pii_types:
        if t.name not in seen:
            merged.append(t)

    return merged


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
