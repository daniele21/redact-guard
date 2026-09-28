"""
Dynamic system prompt builder for the versioned RedactGuard detection contract.

The model is asked only for information it must infer. Presentation metadata and
redaction placeholders are derived deterministically by the application.
"""

from domain.detection import DETECTION_CONTRACT_VERSION
from domain.models import PIITypeDefinition
from services.profile_service import get_all_pii_types


def build_system_prompt(profile_name: str) -> str:
    """Build the compact model-facing PII detection prompt."""
    all_types = get_all_pii_types(profile_name)
    type_block = _format_type_instructions(all_types)
    allowed_types = ", ".join(f'"{t.name}"' for t in all_types)

    return f"""You are a PII (Personally Identifiable Information) detection assistant.

Detection contract: {DETECTION_CONTRACT_VERSION}

Analyze the provided text and identify ALL instances of personally identifiable
or sensitive information that match the active type definitions below.

## PII types to detect

{type_block}

## Output format

Return a JSON object with a single key "pii_fields" containing an array.
Each element must contain exactly the information the model must infer:
- "pii_type": one of [{allowed_types}]
- "value": the exact text span as it appears in the document

Example:
{{"pii_fields":[{{"pii_type":"private_person","value":"Mario Rossi"}}]}}

## Rules

1. Extract the EXACT text span — do not paraphrase, normalize, or summarize it.
2. Follow the active type definitions. Do not invent new PII types.
3. Do NOT include information that is clearly public or non-personal unless the
   active type definition explicitly classifies it as sensitive in context.
4. If no PII is found, return {{"pii_fields":[]}}.
5. Return ONLY valid JSON — no explanations and no markdown code blocks.
"""


def _format_type_instructions(types: list[PIITypeDefinition]) -> str:
    lines: list[str] = []
    for pii_type in types:
        line = f"- **{pii_type.name}**: {pii_type.description}"
        if pii_type.examples:
            examples_str = ", ".join(f'"{e}"' for e in pii_type.examples[:3])
            line += f"  (examples: {examples_str})"
        lines.append(line)
    return "\n".join(lines)
