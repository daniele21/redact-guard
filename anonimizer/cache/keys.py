import hashlib

from utils.span_utils import normalize_whitespace


def build_pdf_cache_key(file_bytes: bytes) -> str:
    """Build a cache key for PDF conversion based on file contents."""
    h = hashlib.sha256(file_bytes).hexdigest()
    return f"pdf:{h}"


def build_llm_cache_key(
    system_prompt: str,
    text: str,
    model: str,
    *,
    variant: str = "",
) -> str:
    """Build a deterministic LLM cache key.

    `variant` captures inference-contract settings such as output-token budget.
    This prevents a successful response from an older execution contract from
    being reused after the contract or generation budget changes.
    """
    normalized_text = normalize_whitespace(text)
    combined = (
        f"{system_prompt}\n---\n{normalized_text}\n---\n{model}\n---\n{variant}"
    )
    h = hashlib.sha256(combined.encode("utf-8")).hexdigest()
    return f"llm:{h}"
