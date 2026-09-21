import json
import logging
import urllib.error
import urllib.request

from config import config
from domain.models import PageMarkdown, PIIField, PageAnalysisResult
from cache.cache_manager import cache_manager
from cache.keys import build_llm_cache_key
from services.prompt_builder import build_system_prompt
from utils.json_utils import parse_llm_response
from utils.span_utils import _find_whitespace_normalized_span

logger = logging.getLogger("redactguard.pii_detector")


def call_local_llm(prompt: str, user_text: str) -> str:
    """Call Korgis through its OpenAI-compatible local HTTP boundary."""
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

    req = urllib.request.Request(
        config.llm_endpoint,
        data=json.dumps(payload).encode("utf-8"),
        headers={"Content-Type": "application/json"},
        method="POST",
    )

    try:
        with urllib.request.urlopen(req, timeout=config.llm_timeout) as response:
            result = json.loads(response.read().decode("utf-8"))
            return result["choices"][0]["message"]["content"]
    except urllib.error.HTTPError as exc:
        body = exc.read().decode("utf-8", errors="replace")
        logger.error("Korgis inference request failed with HTTP %s: %s", exc.code, body)
        raise
    except Exception as exc:
        logger.error("Korgis inference request failed: %s", exc)
        raise


def detect_pii_for_page(
    page: PageMarkdown,
    profile_name: str,
    force: bool = False,
) -> PageAnalysisResult:
    """Analyze one page for PII using Korgis and RedactGuard deterministic post-processing."""
    system_prompt = build_system_prompt(profile_name)
    cache_key = build_llm_cache_key(system_prompt, page.text, config.korgis_model)

    cached_raw = cache_manager.get_llm(cache_key) if not force else None
    cache_hit = False

    if cached_raw is not None:
        raw_response = cached_raw
        cache_hit = True
        logger.info("LLM Cache HIT for page %s", page.page_number)
    else:
        if force:
            logger.info(
                "LLM Force Re-scan for page %s. Bypassing cache...",
                page.page_number,
            )
        else:
            logger.info(
                "LLM Cache MISS for page %s. Calling Korgis model %s...",
                page.page_number,
                config.korgis_model,
            )
        raw_response = call_local_llm(system_prompt, page.text)
        cache_manager.set_llm(cache_key, raw_response)

    parsed_data = parse_llm_response(raw_response)
    raw_fields = parsed_data.get("pii_fields", [])

    pii_fields: list[PIIField] = []
    seen_spans: set[tuple[int, int]] = set()

    for field in raw_fields:
        value = field.get("value", "")
        if not value:
            continue

        search_pos = 0
        while search_pos < len(page.text):
            real_span = _find_whitespace_normalized_span(page.text[search_pos:], value)
            if not real_span:
                break

            start_in_window, end_in_window = real_span
            real_start = search_pos + start_in_window
            real_end = search_pos + end_in_window

            span = (real_start, real_end)
            if span not in seen_spans:
                seen_spans.add(span)

                redacted_val = field.get("redacted_value")
                if not redacted_val:
                    pii_type = field.get("pii_type", "UNKNOWN")
                    redacted_val = f"[REDACTED_{pii_type.upper()}]"

                pii_fields.append(
                    PIIField(
                        field_name=field.get("field_name", "Unknown"),
                        field_description=field.get("field_description", ""),
                        pii_type=field.get("pii_type", "unknown"),
                        value=page.text[real_start:real_end],
                        redacted_value=redacted_val,
                        start=real_start,
                        end=real_end,
                    )
                )

            search_pos = real_end

    redacted_text = page.text
    sorted_fields = sorted(
        pii_fields,
        key=lambda field: field.start if field.start is not None else 0,
        reverse=True,
    )
    for field in sorted_fields:
        if field.start is not None and field.end is not None:
            redacted_text = (
                redacted_text[: field.start]
                + field.redacted_value
                + redacted_text[field.end :]
            )
        else:
            redacted_text = redacted_text.replace(field.value, field.redacted_value)

    return PageAnalysisResult(
        page_number=page.page_number,
        has_pii=len(pii_fields) > 0,
        pii_fields=pii_fields,
        redacted_text=redacted_text,
        cache_hit=cache_hit,
    )
