from __future__ import annotations

import hashlib
import re


def _digest(prefix: str, payload: str) -> str:
    value = hashlib.sha256(payload.encode("utf-8")).hexdigest()[:16]
    return f"{prefix}_{value}"


def normalize_entity_value(value: str) -> str:
    return re.sub(r"\s+", " ", value).strip().casefold()


def build_entity_id(pii_type: str, value: str) -> str:
    """Stable, opaque ID for the same sensitive value across document pages."""
    return _digest("ent", f"{pii_type}\x1f{normalize_entity_value(value)}")


def build_finding_id(
    *,
    page_number: int,
    pii_type: str,
    start: int,
    end: int,
    value: str,
) -> str:
    """Stable, opaque ID for one source occurrence without embedding raw PII."""
    return _digest(
        "occ",
        f"{page_number}\x1f{pii_type}\x1f{start}\x1f{end}\x1f"
        f"{normalize_entity_value(value)}",
    )
