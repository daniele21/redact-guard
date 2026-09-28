from __future__ import annotations

import json

from pydantic import ValidationError

from domain.detection import (
    DetectionContractError,
    DetectionFailureCode,
    ModelPIIResponse,
)


def parse_model_response(
    raw_text: str,
    *,
    allowed_types: set[str],
) -> ModelPIIResponse:
    """Strictly parse and validate the final RedactGuard model answer.

    Invalid model output is a typed failure. It must never be converted into a
    legitimate empty PII result.
    """
    try:
        payload = json.loads(raw_text)
    except json.JSONDecodeError as exc:
        raise DetectionContractError(
            DetectionFailureCode.INVALID_JSON,
            "Model returned invalid JSON.",
            details={"line": exc.lineno, "column": exc.colno},
        ) from exc

    try:
        parsed = ModelPIIResponse.model_validate(payload)
    except ValidationError as exc:
        raise DetectionContractError(
            DetectionFailureCode.INVALID_SCHEMA,
            "Model JSON does not satisfy the RedactGuard detection schema.",
            details={"errors": exc.errors(include_url=False)},
        ) from exc

    invalid_types = sorted(
        {
            field.pii_type
            for field in parsed.pii_fields
            if field.pii_type not in allowed_types
        }
    )
    if invalid_types:
        raise DetectionContractError(
            DetectionFailureCode.INVALID_SCHEMA,
            "Model returned PII types outside the active profile.",
            details={"invalid_types": invalid_types},
        )

    return parsed
