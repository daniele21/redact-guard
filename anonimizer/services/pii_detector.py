import json
import logging
import urllib.request
import urllib.error
import urllib.parse
from datetime import datetime, timezone
from typing import Any

from config import config
from domain.models import PageMarkdown, PIIField, PageAnalysisResult
from cache.cache_manager import cache_manager
from cache.keys import build_llm_cache_key
from services.prompt_builder import build_system_prompt
from utils.json_utils import parse_llm_response
from utils.span_utils import _find_whitespace_normalized_span

logger = logging.getLogger("redactguard.pii_detector")

def call_local_llm(prompt: str, user_text: str) -> str:
    """Make HTTP POST to the local llama-cpp-python server."""
    endpoint = config.llm_endpoint
    payload = {
        "model": config.llm_model,
        "messages": [
            {"role": "system", "content": prompt},
            {"role": "user", "content": user_text}
        ],
        "temperature": 0.0,
        "max_tokens": config.llm_max_output_tokens
    }

    data = json.dumps(payload).encode("utf-8")
    req = urllib.request.Request(
        endpoint,
        data=data,
        headers={"Content-Type": "application/json"}
    )

    try:
        with urllib.request.urlopen(req, timeout=config.llm_timeout) as response:
            result = json.loads(response.read().decode("utf-8"))
            return result["choices"][0]["message"]["content"]
    except Exception as e:
        logger.error(f"LLM request failed: {e}")
        raise

def detect_pii_for_page(page: PageMarkdown, profile_name: str) -> PageAnalysisResult:
    """
    Analyze a single page for PII. Uses the LLM cache layer.
    """
    system_prompt = build_system_prompt(profile_name)
    cache_key = build_llm_cache_key(system_prompt, page.text, config.llm_model)

    cached_raw = cache_manager.get_llm(cache_key)
    cache_hit = False

    if cached_raw is not None:
        raw_response = cached_raw
        cache_hit = True
        logger.info(f"LLM Cache HIT for page {page.page_number}")
    else:
        logger.info(f"LLM Cache MISS for page {page.page_number}. Calling model...")
        raw_response = call_local_llm(system_prompt, page.text)
        cache_manager.set_llm(cache_key, raw_response)

    parsed_data = parse_llm_response(raw_response)
    raw_fields = parsed_data.get("pii_fields", [])

    pii_fields: list[PIIField] = []
    
    # Coerce offsets and reconstruct redacted_text
    for field in raw_fields:
        value = field.get("value", "")
        if not value:
            continue
            
        start = field.get("start")
        end = field.get("end")
        
        # Verify and fix offsets
        real_span = _find_whitespace_normalized_span(page.text, value, start, end)
        if real_span:
            real_start, real_end = real_span
            
            # Reconstruct redaction value if not present
            redacted_val = field.get("redacted_value")
            if not redacted_val:
                pii_type = field.get("pii_type", "UNKNOWN")
                redacted_val = f"[REDACTED_{pii_type.upper()}]"

            pii_fields.append(PIIField(
                field_name=field.get("field_name", "Unknown"),
                field_description=field.get("field_description", ""),
                pii_type=field.get("pii_type", "unknown"),
                value=value,
                redacted_value=redacted_val,
                start=real_start,
                end=real_end
            ))

    # Reconstruct redacted text by applying all redactions
    # (Just a preview - true redaction engine does it later)
    redacted_text = page.text
    # Sort fields in reverse order to not mess up offsets
    sorted_fields = sorted(pii_fields, key=lambda f: f.start if f.start is not None else 0, reverse=True)
    for field in sorted_fields:
        if field.start is not None and field.end is not None:
            redacted_text = redacted_text[:field.start] + field.redacted_value + redacted_text[field.end:]
        else:
            redacted_text = redacted_text.replace(field.value, field.redacted_value)

    return PageAnalysisResult(
        page_number=page.page_number,
        has_pii=len(pii_fields) > 0,
        pii_fields=pii_fields,
        redacted_text=redacted_text,
        cache_hit=cache_hit
    )
