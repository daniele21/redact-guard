import re
from domain.models import PageMarkdown

def _split_markdown_table_row(line: str) -> list[str]:
    stripped = line.strip()
    if stripped.startswith("|"):
        stripped = stripped[1:]
    if stripped.endswith("|"):
        stripped = stripped[:-1]
    return [cell.strip() for cell in stripped.split("|")]

def _is_markdown_table_separator(line: str) -> bool:
    cells = _split_markdown_table_row(line)
    if not cells:
        return False
    return all(re.fullmatch(r":?-{3,}:?", cell.strip()) for cell in cells if cell.strip())

def _is_markdown_table_row(line: str) -> bool:
    return "|" in line and len(_split_markdown_table_row(line)) >= 2

def _normalize_markdown_table_block(block: list[str]) -> list[str]:
    separator_index = next(
        (index for index, line in enumerate(block) if _is_markdown_table_separator(line)),
        None,
    )
    if separator_index is None or separator_index == 0:
        return block

    headers = _split_markdown_table_row(block[separator_index - 1])
    rows = block[separator_index + 1 :]
    normalized_rows = []

    for row in rows:
        values = _split_markdown_table_row(row)
        pairs = []
        for index, value in enumerate(values):
            if not value:
                continue
            header = headers[index] if index < len(headers) and headers[index] else f"column_{index + 1}"
            pairs.append(f"{header}: {value}")
        if pairs:
            normalized_rows.append("; ".join(pairs))

    return normalized_rows or block

def normalize_markdown_tables(text: str) -> str:
    lines = text.splitlines()
    normalized: list[str] = []
    index = 0

    while index < len(lines):
        line = lines[index]
        if not _is_markdown_table_row(line):
            normalized.append(line)
            index += 1
            continue

        block = []
        while index < len(lines) and _is_markdown_table_row(lines[index]):
            block.append(lines[index])
            index += 1

        normalized.extend(_normalize_markdown_table_block(block))

    return "\n".join(normalized).strip()

def preprocess_pages_for_pii(pages: list[PageMarkdown]) -> list[PageMarkdown]:
    return [
        PageMarkdown(
            page_number=page.page_number,
            text=normalize_markdown_tables(page.text),
        )
        for page in pages
    ]
