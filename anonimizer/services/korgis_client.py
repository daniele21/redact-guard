from __future__ import annotations

import json
import time
import urllib.error
import urllib.request
from dataclasses import dataclass
from typing import Any

from config import config
from domain.detection import (
    KORGIS_REQUEST_EVIDENCE_VERSION,
    DetectionContractError,
    DetectionFailureCode,
    KorgisCPUUsage,
    KorgisMemoryUsage,
    KorgisRequestEvidence,
    KorgisResourceUsage,
    KorgisSamplingInfo,
    LLMInferenceResult,
)


KORGIS_IDENTITY_PROTOCOL = "local-llm-identity-v1"


@dataclass(frozen=True)
class KorgisCompatibility:
    identity_protocol: str | None
    identity_compatible: bool
    request_evidence_supported: bool
    model_resident: bool

    @property
    def status(self) -> str:
        if not self.identity_compatible:
            return "identity_incompatible"
        if not self.request_evidence_supported:
            return "legacy_compatible"
        return "compatible"


class KorgisRuntimeAdapter:
    """Typed RedactGuard boundary for Korgis runtime and inference contracts."""

    def __init__(
        self,
        *,
        base_url: str | None = None,
        model: str | None = None,
        timeout: float | None = None,
    ) -> None:
        self.base_url = (base_url or config.korgis_base_url).rstrip("/")
        self.model = model or config.korgis_model
        self.timeout = timeout if timeout is not None else config.llm_timeout
        self.root_url = (
            self.base_url[:-3]
            if self.base_url.endswith("/v1")
            else self.base_url
        ).rstrip("/")

    @property
    def completions_url(self) -> str:
        return f"{self.base_url}/chat/completions"

    def health(self) -> dict[str, Any]:
        return self._get_json(f"{self.root_url}/health")

    def models(self) -> dict[str, Any]:
        return self._get_json(f"{self.base_url}/models")

    def identity(self) -> dict[str, Any]:
        return self._get_json(f"{self.base_url}/runtime/identity")

    def status(self) -> dict[str, Any]:
        return self._get_json(f"{self.root_url}/status")

    def resources(self) -> dict[str, Any]:
        return self._get_json(f"{self.root_url}/api/v1/resources")

    def compatibility(self) -> KorgisCompatibility:
        health = self.health()
        models_payload = self.models()
        identity_payload = self.identity()

        resident: set[str] = set()
        for item in models_payload.get("data", []):
            if not isinstance(item, dict):
                continue
            for key in ("key", "id"):
                value = item.get(key)
                if value:
                    resident.add(str(value))

        identity_models = identity_payload.get("models")
        identity_models = identity_models if isinstance(identity_models, dict) else {}
        protocol = _optional_str(identity_payload.get("protocol_version"))

        advertised_versions = health.get("request_evidence_versions")
        advertised_versions = (
            advertised_versions
            if isinstance(advertised_versions, list)
            else []
        )

        return KorgisCompatibility(
            identity_protocol=protocol,
            identity_compatible=protocol == KORGIS_IDENTITY_PROTOCOL,
            request_evidence_supported=(
                KORGIS_REQUEST_EVIDENCE_VERSION in advertised_versions
            ),
            model_resident=(
                self.model in resident or self.model in identity_models
            ),
        )

    def infer(self, prompt: str, user_text: str) -> LLMInferenceResult:
        payload = {
            "model": self.model,
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
            self.completions_url,
            data=json.dumps(payload).encode("utf-8"),
            headers={"Content-Type": "application/json"},
            method="POST",
        )
        started = time.perf_counter()

        try:
            with urllib.request.urlopen(request, timeout=self.timeout) as response:
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
        response_payload = _decode_json_response(body)

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
            model=self.model,
            content=content,
            latency_ms=latency_ms,
            finish_reason=finish_reason,
            input_tokens=_optional_int(usage.get("prompt_tokens")),
            output_tokens=_optional_int(usage.get("completion_tokens")),
            korgis_evidence=_parse_korgis_request_evidence(response_payload),
        )

    def _get_json(self, url: str) -> dict[str, Any]:
        request = urllib.request.Request(
            url,
            headers={"Content-Type": "application/json"},
            method="GET",
        )
        with urllib.request.urlopen(request, timeout=self.timeout) as response:
            payload = json.loads(response.read().decode("utf-8"))
        if not isinstance(payload, dict):
            raise ValueError("Korgis returned a non-object JSON response")
        return payload


def call_korgis(prompt: str, user_text: str) -> LLMInferenceResult:
    """Compatibility function used by the PII detector."""
    return KorgisRuntimeAdapter().infer(prompt, user_text)


def _decode_json_response(body: str) -> dict[str, Any]:
    try:
        payload = json.loads(body)
    except json.JSONDecodeError as exc:
        raise DetectionContractError(
            DetectionFailureCode.INVALID_RESPONSE,
            "Korgis returned a non-JSON HTTP response.",
            details={"line": exc.lineno, "column": exc.colno},
        ) from exc
    if not isinstance(payload, dict):
        raise DetectionContractError(
            DetectionFailureCode.INVALID_RESPONSE,
            "Korgis returned a non-object JSON response.",
        )
    return payload


def _parse_korgis_request_evidence(
    response_payload: dict[str, Any],
) -> KorgisRequestEvidence | None:
    raw = response_payload.get("korgis")
    if not isinstance(raw, dict):
        return None
    version = raw.get("evidence_version")
    if version != KORGIS_REQUEST_EVIDENCE_VERSION:
        return None

    resources_raw = raw.get("resources")
    resources = (
        _parse_resource_usage(resources_raw)
        if isinstance(resources_raw, dict)
        else None
    )

    return KorgisRequestEvidence(
        evidence_version=version,
        request_id=_optional_str(raw.get("request_id")),
        execution_source=_optional_str(raw.get("execution_source")),
        resources=resources,
    )


def _parse_resource_usage(payload: dict[str, Any]) -> KorgisResourceUsage:
    memory = payload.get("memory")
    memory = memory if isinstance(memory, dict) else {}
    cpu = payload.get("cpu")
    cpu = cpu if isinstance(cpu, dict) else {}
    sampling = payload.get("sampling")
    sampling = sampling if isinstance(sampling, dict) else {}
    attribution = payload.get("attribution")
    attribution = attribution if isinstance(attribution, dict) else {}
    sources = payload.get("sources")
    sources = sources if isinstance(sources, dict) else {}

    return KorgisResourceUsage(
        snapshot_id=_optional_str(payload.get("snapshot_id")),
        memory=KorgisMemoryUsage(
            baseline_bytes=_optional_int(memory.get("baseline_bytes")),
            peak_bytes=_optional_int(memory.get("peak_bytes")),
            end_bytes=_optional_int(memory.get("end_bytes")),
            peak_delta_bytes=_optional_int(memory.get("peak_delta_bytes")),
        ),
        cpu=KorgisCPUUsage(
            average_percent=_optional_float(cpu.get("average_percent")),
            peak_percent=_optional_float(cpu.get("peak_percent")),
        ),
        sampling=KorgisSamplingInfo(
            interval_ms=_optional_int(sampling.get("interval_ms")),
            sample_count=_optional_int(sampling.get("sample_count")),
            errors=_optional_int(sampling.get("errors")),
            cpu_observation_ms=_optional_float(
                sampling.get("cpu_observation_ms")
            ),
        ),
        attribution_scope=_optional_str(attribution.get("scope")),
        attribution_quality=_optional_str(attribution.get("quality")),
        memory_source=_optional_str(sources.get("memory")),
        cpu_source=_optional_str(sources.get("cpu")),
    )


def _optional_int(value: Any) -> int | None:
    try:
        return int(value) if value is not None and not isinstance(value, bool) else None
    except (TypeError, ValueError):
        return None


def _optional_float(value: Any) -> float | None:
    try:
        return float(value) if value is not None and not isinstance(value, bool) else None
    except (TypeError, ValueError):
        return None


def _optional_str(value: Any) -> str | None:
    return str(value) if isinstance(value, str) and value else None
