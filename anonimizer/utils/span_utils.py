import re

def normalize_whitespace(text: str) -> str:
    """Normalize whitespace for consistent cache key generation."""
    return re.sub(r'\s+', ' ', text).strip()

def _find_whitespace_normalized_span(
    text: str,
    value: str,
    start: int | None = None,
    end: int | None = None,
) -> tuple[int, int] | None:
    if not value:
        return None

    window_offset = 0
    window = text
    if start is not None and end is not None:
        window_offset = max(0, start - 80)
        window = text[window_offset : min(len(text), end + 80)]

    pattern = r"\s+".join(re.escape(part) for part in value.split())
    if not pattern:
        return None

    match = re.search(pattern, window)
    if not match and window is not text:
        match = re.search(pattern, text)
        window_offset = 0

    if not match:
        return None
    return window_offset + match.start(), window_offset + match.end()
