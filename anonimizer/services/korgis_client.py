from __future__ import annotations

import json
import time
import urllib.error
import urllib.request
from typing import Any

from config import config
from domain.detection import (
    DetectionContractError,
    DetectionFailureCode,
    LLMInferenceResult,
)


def call_korgis(prompt: str, user_text: str) -> LLMInferenceResult:
    """Call Korgis and preserve execution diagnostics needed by RedactGuard."""
    payload = {
        "model": config.korgis_model,
        "messages": [
            {"role": "system", "content": prompt},
            {"role": "user", "content": user_text},
        ],
        "temperature": 0.0,
        "max_tokens": config.llm_max_output_tokens,
        "response_format": {"type": "json_object"},
        "enable_thinking": False,
        "show_thinking": False,
    }

    request = urllib.request.Request(
        config.llm_endpoint,
        data=json.dumps(payload).encode("utf-8"),
        headers={"Content-Type": "application/json"},
        method="POST",
    )
    started = time.perf_counter()

    try:
        with urllib.request.urlopen(request, timeout=config.llm_timeout) as response:
            body = response.read().decode("utf-8")
    except urllib.error.HTTPError as exc:
        detail = exc.read().decode("utf-8", errors="replace")[:1000]
        raise DetectionContractError(
            DetectionFailureCode.BACKEND_ERROR,
            f"Korgis returned HTTP {exc.code}.",
            details={"http_status": exc.code, "detail": detail},
        ) from exc
    except (urllib.error.URLError, TimeoutError, ConnectionError, OSError) as exc:
        reason = getattr(exc, "reason", exc)
        raise DetectionContractError(
            DetectionFailureCode.TRANSPORT_ERROR,
            "Korgis inference request failed.",
            details={"error": f"{type(reason).__name__}: {reason}"},
        ) from exc

    latency_ms = (time.perf_counter() - started) * 1000

    try:
        response_payload = json.loads(body)
    except json.JSONDecodeError as exc:
        raise DetectionContractError(
            DetectionFailureCode.INVALID_RESPONSE,
            "Korgis returned a non-JSON HTTP response.",
            details={"line": exc.lineno, "column": exc.colno},
        ) from exc

    choices = response_payload.get("choices")
    if not isinstance(choices, list) or not choices or not isinstance(choices[0], dict):
        raise DetectionContractError(
            DetectionFailureCode.INVALID_RESPONSE,
            "Korgis response has no chat completion choice.",
        )

    choice = choices[0]
    message = choice.get("message")
    content = message.get("content") if isinstance(message, dict) else None
    if not isinstance(content, str):
        raise DetectionContractError(
            DetectionFailureCode.INVALID_RESPONSE,
            "Korgis response has no textual assistant content.",
        )

    finish_reason = choice.get("finish_reason")
    finish_reason = str(finish_reason) if finish_reason is not None else None
    if finish_reason in {"length", "max_tokens"}:
        raise DetectionContractError(
            DetectionFailureCode.TRUNCATED_OUTPUT,
            "Model output reached the configured token limit.",
            details={"finish_reason": finish_reason},
        )

    usage = response_payload.get("usage")
    usage = usage if isinstance(usage, dict) else {}

    return LLMInferenceResult(
        model=config.korgis_model,
        content=content,
        latency_ms=latency_ms,
        finish_reason=finish_reason,
        input_tokens=_optional_int(usage.get("prompt_tokens")),
        output_tokens=_optional_int(usage.get("completion_tokens")),
    )


def _optional_int(value: Any) -> int | None:
    try:
        return int(value) if value is not None else None
    except (TypeError, ValueError):
        return None
