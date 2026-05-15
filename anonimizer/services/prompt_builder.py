"""
Dynamic system prompt builder.

Merges PII type definitions from the active profile and user-defined custom
types into a complete system prompt for the LLM.
"""

from domain.models import PIITypeDefinition
from services.profile_service import get_all_pii_types


def build_system_prompt(profile_name: str) -> str:
    """
    Build the full system prompt from the active profile + custom types.

    The generated prompt lists every PII type with its description and
    examples, giving the LLM precise instructions on what to detect.
    """
    all_types = get_all_pii_types(profile_name)
    type_block = _format_type_instructions(all_types)
    allowed_types = ", ".join(f'"{t.name}"' for t in all_types)

    return f"""\
You are a PII (Personally Identifiable Information) detection assistant.

Analyze the provided text and identify ALL instances of personally identifiable
or sensitive information. For each instance found, extract the exact text span.

## PII types to detect

{type_block}

## Output format

Return a JSON object with a single key "pii_fields" containing an array.
Each element must have:
- "field_name": a short descriptive label for this specific instance
- "field_description": why this is sensitive
- "pii_type": one of [{allowed_types}]
- "value": the exact text span as it appears in the document
- "redacted_value": a replacement placeholder like "[REDACTED_NAME]", "[REDACTED_DATE]", etc.

## Rules

1. Extract the EXACT text span — do not paraphrase or summarize.
2. Do NOT include information that is clearly public or non-personal.
3. If no PII is found, return {{"pii_fields": []}}.
4. Return ONLY valid JSON — no explanations, no markdown code blocks.
"""


def _format_type_instructions(types: list[PIITypeDefinition]) -> str:
    """Format PII type definitions into the prompt instruction block."""
    lines: list[str] = []
    for t in types:
        line = f"- **{t.name}**: {t.description}"
        if t.examples:
            examples_str = ", ".join(f'"{e}"' for e in t.examples[:3])
            line += f"  (examples: {examples_str})"
        lines.append(line)
    return "\n".join(lines)
