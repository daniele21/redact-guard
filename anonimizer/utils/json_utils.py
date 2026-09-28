import json
from typing import Any


def extract_json_block(text: str) -> str:
    """Legacy helper retained for non-detection callers."""
    if text.startswith("```json"):
        text = text[7:]
    if text.endswith("```"):
        text = text[:-3]
    return text.strip()


def extract_dict_from_payload(payload: Any) -> dict[str, Any]:
    """Extract the historical PII payload shape without inventing an empty result."""
    if isinstance(payload, dict):
        if "pii_fields" in payload:
            return payload
        for key in ["result", "data", "response"]:
            if key in payload and isinstance(payload[key], dict):
                return payload[key]

    if isinstance(payload, list) and payload:
        if isinstance(payload[0], dict) and "field_name" in payload[0]:
            return {"pii_fields": payload}

    raise ValueError("LLM response does not contain a PII payload")


def parse_llm_response(raw_text: str) -> dict[str, Any]:
    """Legacy parser that now fails explicitly instead of returning zero PII."""
    text = extract_json_block(raw_text)
    parsed = json.loads(text)
    return extract_dict_from_payload(parsed)
