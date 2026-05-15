import json
import logging
from typing import Any

logger = logging.getLogger("redactguard.utils")

def extract_json_block(text: str) -> str:
    """Extract JSON from markdown code block if present."""
    if text.startswith("```json"):
        text = text[7:]
    if text.endswith("```"):
        text = text[:-3]
    return text.strip()

def extract_dict_from_payload(payload: Any) -> dict[str, Any]:
    """Extract a dictionary from a potentially nested JSON payload structure."""
    if isinstance(payload, dict):
        if "pii_fields" in payload:
            return payload
        # Sometimes nested inside another key
        for key in ["result", "data", "response"]:
            if key in payload and isinstance(payload[key], dict):
                return payload[key]
                
    if isinstance(payload, list) and payload:
        if isinstance(payload[0], dict) and "field_name" in payload[0]:
            return {"pii_fields": payload}
            
    return {"pii_fields": []}

def parse_llm_response(raw_text: str) -> dict[str, Any]:
    """Parse raw LLM string output into a PII fields dictionary."""
    text = extract_json_block(raw_text)
    try:
        parsed = json.loads(text)
        return extract_dict_from_payload(parsed)
    except json.JSONDecodeError as e:
        logger.error(f"Failed to decode LLM response: {e}")
        return {"pii_fields": []}
