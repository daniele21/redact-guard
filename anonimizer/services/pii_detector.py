from __future__ import annotations

import logging

from cache.cache_manager import cache_manager
from cache.keys import build_llm_cache_key
from config import config
from domain.detection import (
    DETECTION_CONTRACT_VERSION,
    DetectionDiagnostics,
    LLMInferenceResult,
)
from domain.models import PageAnalysisResult, PageMarkdown, PIIField
from services.finding_identity import build_entity_id, build_finding_id
from services.korgis_client import call_korgis
from services.output_contract import parse_model_response
from services.profile_service import get_all_pii_types
from services.resource_evidence import ResourceEvidenceAccumulator
from services.prompt_builder import build_system_prompt
from services.text_segments import segment_text
from utils.span_utils import _find_whitespace_normalized_span

logger = logging.getLogger("redactguard.pii_detector")


def call_local_llm(prompt: str, user_text: str) -> LLMInferenceResult:
    """Compatibility wrapper around the versioned Korgis inference boundary."""
    return call_korgis(prompt, user_text)


def detect_pii_for_page(
    page: PageMarkdown,
    profile_name: str,
    force: bool = False,
) -> PageAnalysisResult:
    """Analyze one page with the versioned RedactGuard detection contract."""
    system_prompt = build_system_prompt(profile_name)
    type_definitions = {
        pii_type.name: pii_type
        for pii_type in get_all_pii_types(profile_name)
    }
    allowed_types = set(type_definitions)
    segments = segment_text(
        page.text,
        max_chars=config.llm_chunk_max_chars,
        overlap_chars=config.llm_chunk_overlap_chars,
    )

    pii_fields: list[PIIField] = []
    seen_spans: set[tuple[int, int]] = set()
    cache_hits = 0
    total_latency_ms = 0.0
    input_tokens: int | None = None
    output_tokens: int | None = None
    finish_reasons: list[str] = []
    parsed_items = 0
    resolved_items = 0
    unresolved_items = 0
    resource_evidence = ResourceEvidenceAccumulator()

    cache_variant = (
        f"{DETECTION_CONTRACT_VERSION};"
        f"max_tokens={config.llm_max_output_tokens};"
        f"chunk_max_chars={config.llm_chunk_max_chars};"
        f"chunk_overlap_chars={config.llm_chunk_overlap_chars}"
    )

    for segment in segments:
        cache_key = build_llm_cache_key(
            system_prompt,
            segment.text,
            config.korgis_model,
            variant=cache_variant,
        )
        cached_raw = cache_manager.get_llm(cache_key) if not force else None

        if cached_raw is not None:
            raw_response = str(cached_raw)
            cache_hits += 1
        else:
            inference = call_local_llm(system_prompt, segment.text)
            raw_response = inference.content
            total_latency_ms += inference.latency_ms
            input_tokens = _add_optional(input_tokens, inference.input_tokens)
            output_tokens = _add_optional(output_tokens, inference.output_tokens)
            if inference.finish_reason:
                finish_reasons.append(inference.finish_reason)
            resource_evidence.record_inference(inference.korgis_evidence)

        parsed = parse_model_response(
            raw_response,
            allowed_types=allowed_types,
        )

        # Cache only after the complete application-level contract has passed.
        if cached_raw is None:
            cache_manager.set_llm(cache_key, raw_response)

        parsed_items += len(parsed.pii_fields)
        for field in parsed.pii_fields:
            definition = type_definitions[field.pii_type]
            search_pos = 0
            item_resolved = False

            while search_pos < len(segment.text):
                local_span = _find_whitespace_normalized_span(
                    segment.text[search_pos:],
                    field.value,
                )
                if not local_span:
                    break

                local_start, local_end = local_span
                local_start += search_pos
                local_end += search_pos
                real_start = segment.start + local_start
                real_end = segment.start + local_end
                span = (real_start, real_end)

                if span not in seen_spans:
                    seen_spans.add(span)
                    source_value = page.text[real_start:real_end]
                    pii_fields.append(
                        PIIField(
                            finding_id=build_finding_id(
                                page_number=page.page_number,
                                pii_type=field.pii_type,
                                start=real_start,
                                end=real_end,
                                value=source_value,
                            ),
                            entity_id=build_entity_id(field.pii_type, source_value),
                            field_name=definition.label,
                            field_description=definition.description,
                            pii_type=field.pii_type,
                            value=source_value,
                            redacted_value=f"[REDACTED_{field.pii_type.upper()}]",
                            start=real_start,
                            end=real_end,
                        )
                    )
                item_resolved = True
                search_pos = local_end

            if item_resolved:
                resolved_items += 1
            else:
                unresolved_items += 1

    pii_fields.sort(key=lambda field: (field.start or 0, field.end or 0, field.pii_type))

    redacted_text = page.text
    for field in sorted(
        pii_fields,
        key=lambda item: item.start if item.start is not None else 0,
        reverse=True,
    ):
        if field.start is not None and field.end is not None:
            redacted_text = (
                redacted_text[: field.start]
                + field.redacted_value
                + redacted_text[field.end :]
            )

    warning = None
    if unresolved_items:
        warning = (
            f"{unresolved_items} model-proposed PII value(s) could not be "
            "resolved to the source text and were not redacted."
        )

    resource_summary = resource_evidence.summary()

    diagnostics = DetectionDiagnostics(
        model=config.korgis_model,
        chunks=len(segments),
        cache_hits=cache_hits,
        latency_ms=total_latency_ms,
        input_tokens=input_tokens,
        output_tokens=output_tokens,
        finish_reasons=finish_reasons,
        parsed_items=parsed_items,
        resolved_items=resolved_items,
        unresolved_items=unresolved_items,
        inference_requests=resource_summary.inference_requests,
        resource_evidence_requests=resource_summary.evidence_requests,
        peak_memory_bytes=resource_summary.peak_memory_bytes,
        peak_memory_delta_bytes=resource_summary.peak_memory_delta_bytes,
        average_cpu_percent=resource_summary.average_cpu_percent,
        peak_cpu_percent=resource_summary.peak_cpu_percent,
        resource_cpu_sample_count=resource_summary.cpu_sample_count,
        resource_cpu_observation_ms=resource_summary.cpu_observation_ms,
        resource_sampling_interval_ms=resource_summary.sampling_interval_ms,
        resource_memory_sources=list(resource_summary.memory_sources),
        resource_cpu_sources=list(resource_summary.cpu_sources),
        resource_attribution_scopes=list(resource_summary.attribution_scopes),
        resource_attribution_qualities=list(resource_summary.attribution_qualities),
    )

    return PageAnalysisResult(
        page_number=page.page_number,
        has_pii=bool(pii_fields),
        pii_fields=pii_fields,
        redacted_text=redacted_text,
        warning=warning,
        cache_hit=cache_hits == len(segments),
        diagnostics=diagnostics,
    )


def _add_optional(current: int | None, value: int | None) -> int | None:
    if value is None:
        return current
    return (current or 0) + value
