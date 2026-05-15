#!/usr/bin/env python3
from __future__ import annotations

import argparse
import json
import os
import re
import socket
import sys
import urllib.error
import urllib.request
from dataclasses import dataclass
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, TYPE_CHECKING

if TYPE_CHECKING:
    from docling.document_converter import DocumentConverter
    from opf import OPF


OPF_LABEL_TO_FIELD = {
    "account_number": "account_number",
    "private_address": "address",
    "private_email": "email",
    "private_person": "person",
    "private_phone": "phone",
    "private_url": "url",
    "private_date": "date",
    "secret": "secret",
    "redacted": "redacted",
    "personal_demographic": "demographic",
    "personal_measurement": "measurement",
    "health_condition": "health_condition",
    "health_treatment": "health_treatment",
    "health_lab_result": "health_lab_result",
    "lifestyle_info": "lifestyle",
    "personal_profile": "profile",
}

LLM_ALLOWED_PII_TYPES = set(OPF_LABEL_TO_FIELD)

DEFAULT_FIELD_DESCRIPTIONS = {
    "account_number": "Personal account, document, fiscal, medical record, or financial identifier.",
    "private_address": "Postal address or location identifying the person.",
    "private_email": "Email address identifying or contacting the person.",
    "private_person": "Person name referring to the patient, client, relative, or professional.",
    "private_phone": "Phone or contact number for the person.",
    "private_url": "Personal URL, profile link, portal link, or sharing link.",
    "private_date": "Date associated with the person or their private record.",
    "personal_demographic": "Demographic attribute describing the person.",
    "personal_measurement": "Anthropometric, biometric, or body measurement describing the person.",
    "health_condition": "Health condition, diagnosis, symptom, allergy, intolerance, or clinical history for the person.",
    "health_treatment": "Medication, supplement, therapy, prescription, or treatment for the person.",
    "health_lab_result": "Lab result, biomarker, vital sign, clinical score, or exam result for the person.",
    "lifestyle_info": "Lifestyle habit or behavior associated with the person.",
    "personal_profile": "Profile attribute, preference, relationship, occupation, education, or personal background for the person.",
    "secret": "Credential, access secret, confidential code, private signature, or confidential secret.",
    "redacted": "Redacted sensitive value.",
}

LOCAL_LLM_SYSTEM_PROMPT = """
You are a strict privacy and health-data detection engine.

Return only valid JSON.
Do not include markdown, explanations, reasoning, or comments.

Task:
Extract sensitive personal data from the input text.

Return exactly:
{"pii_fields":[{"pii_type":"...","field_description":"...","value":"..."}]}

Rules:
- The top-level object must contain only "pii_fields".
- "pii_fields" must always be an array.
- Each item must contain only: "pii_type", "field_description", "value".
- "value" must be copied exactly from the input text.
- Do not calculate character offsets.
- Extract repeated occurrences if they appear multiple times.
- Extract only data that identifies or describes a specific person/patient/client.
- Do not extract generic diet plans, recipes, food lists, portions, meal calories, substitutions, or generic nutrition advice.

Allowed pii_type:
account_number, private_address, private_email, private_person, private_phone, private_url, private_date, personal_demographic, personal_measurement, health_condition, health_treatment, health_lab_result, lifestyle_info, personal_profile, secret.

Category guidance:
- private_person: patient/client names.
- private_date: visit dates, appointment dates, exam dates, prescription dates.
- personal_demographic: age, sex/gender, nationality, marital/family status.
- personal_measurement: height, weight, BMI, BMR, TDEE, body measurements, anthropometric values.
- health_lab_result: laboratory results, biomarkers, diagnostic values, vital signs.
- health_condition: diagnoses, symptoms, allergies, intolerances, disabilities, clinical history.
- health_treatment: medications, supplements, therapies, prescriptions, clinical diet therapy.
- lifestyle_info: personal habits, physical activity, smoking, alcohol, sleep, routines.
- secret: only passwords, tokens, API keys, access codes, credentials.

If no sensitive personal data is present, return:
{"pii_fields":[]}
"""

LOCAL_LLM_SYSTEM_PROMPT_DEBUG_THINKING = """
You are a strict privacy and health-data detection engine.

Think privately inside <think>...</think>.
After </think>, return only one valid JSON object.

Task:
Extract sensitive personal data from the input text.

Final output after the thinking block must be exactly:
{"pii_fields":[{"pii_type":"...","field_description":"...","value":"..."}]}

Rules:
- The final JSON must contain only "pii_fields".
- "pii_fields" must always be an array.
- Each item must contain only: "pii_type", "field_description", "value".
- "value" must be copied exactly from the input text.
- Do not extract generic diet plans, recipes, food lists, portions, meal calories, substitutions, or generic nutrition advice.
"""

# LOCAL_LLM_SYSTEM_PROMPT = """You are a strict privacy and health-data detection engine.
# Return only valid JSON. Do not include markdown fences, prose, comments, or explanations.
# Analyze the input text and extract every sensitive personal data span.

# Output schema:
# Return exactly one JSON object with this schema:
# {"pii_fields":[{"pii_type":"private_person","field_description":"Patient/client full name","value":"<Nome> <Cognome>"}]}

# Schema requirements:
# - The top-level object must contain only the key "pii_fields".
# - "pii_fields" must always be present and must be an array.
# - Each item must contain only these keys: "pii_type", "field_description", "value".
# - "pii_type" must be one of: account_number, private_address, private_email, private_person, private_phone, private_url, private_date, personal_demographic, personal_measurement, health_condition, health_treatment, health_lab_result, lifestyle_info, personal_profile, secret.
# - "field_description" must be a short English description of what the field is and who/what it refers to, for example "Patient age", "Patient body weight", "Patient diagnosis", "Patient email address".
# - "value" must be the exact substring from the input text.
# - If no sensitive personal data is present, return exactly: {"pii_fields":[]}

# Example outputs:
# - For input "Paziente Mario Rossi, 45 anni, peso 72 kg, email mario.rossi@example.com":
#   {"pii_fields":[{"pii_type":"private_person","field_description":"Patient/client full name","value":"Mario Rossi"},{"pii_type":"personal_demographic","field_description":"Patient/client age","value":"45 anni"},{"pii_type":"personal_measurement","field_description":"Patient/client body weight","value":"peso 72 kg"},{"pii_type":"private_email","field_description":"Patient/client email address","value":"mario.rossi@example.com"}]}
# - For input "Indirizzo: Via Roma 10, Milano. Diagnosi: diabete tipo 2. Tel. +39 333 1234567":
#   {"pii_fields":[{"pii_type":"private_address","field_description":"Patient/client postal address","value":"Via Roma 10, Milano"},{"pii_type":"health_condition","field_description":"Patient/client diagnosis","value":"diabete tipo 2"},{"pii_type":"private_phone","field_description":"Patient/client phone number","value":"+39 333 1234567"}]}
# - For input "Altezza 168 cm; BMI 24.8; terapia con metformina dal 03/01/2025":
#   {"pii_fields":[{"pii_type":"personal_measurement","field_description":"Patient/client height","value":"Altezza 168 cm"},{"pii_type":"personal_measurement","field_description":"Patient/client BMI","value":"BMI 24.8"},{"pii_type":"health_treatment","field_description":"Patient/client medication therapy","value":"terapia con metformina"},{"pii_type":"private_date","field_description":"Date associated with patient/client treatment","value":"03/01/2025"}]}
# - For input "Pranzo: pasta 80 g, pollo 120 g, verdure, 650 kcal":
#   {"pii_fields":[]}

# Allowed pii_type values and what they mean:
# - account_number: IBAN, bank account, credit/debit card, customer/account IDs, policy IDs, fiscal/tax identifiers, document numbers, medical record numbers, protocol IDs tied to a person.
# - private_address: home/work address, street, city plus street, postal address, residence, domicile, location that can identify a person.
# - private_email: email addresses.
# - private_person: names, surnames, initials when clearly identifying a person, patient/client names, relatives, doctors, professionals tied to the subject.
# - private_phone: phone, mobile, fax, WhatsApp, contact numbers.
# - private_url: personal websites, social profiles, profile links, patient portals, cloud sharing links, URLs containing personal identifiers.
# - private_date: dates tied to a person or event, including birth date, appointment date, exam date, admission/discharge date, prescription date, measurement date.
# - personal_demographic: age, sex/gender, date-independent age groups, nationality, language, marital/family status, pregnancy status when stated as a demographic attribute.
# - personal_measurement: height, weight, BMI, waist/hip/body measurements, body composition, basal metabolism, anthropometric or biometric measurements that describe the person.
# - health_condition: pathologies, diagnoses, symptoms, allergies, intolerances, disabilities, clinical history, family clinical history, medical risk factors.
# - health_treatment: medications, supplements, therapies, prescriptions, diet therapy when explicitly described as treatment for the person, medical procedures, care plans, treatment instructions.
# - health_lab_result: lab values, exam results, biomarkers, vital signs, clinical scores, diagnostic measurements.
# - lifestyle_info: personal habits or behaviors tied to the person, such as eating habits, food allergies/intolerances, alcohol/smoking, physical activity, sleep, stress, daily routines.
# - personal_profile: occupation, education, relationship details, ethnicity, religion, political opinions, income, personal preferences or profile attributes tied to a person.
# - secret: credentials and confidential secrets only, such as passwords, API keys, tokens, access codes, QR/booking codes, private signatures, confidential notes, or sensitive financial secrets not better classified as account_number.

# Important category guidance:
# - Do not use secret as a generic fallback for health or personal attributes. Use the most specific personal_* / health_* / lifestyle_info / personal_profile label.
# - Use secret only when the text is truly a credential, access secret, confidential code, signature, or unclassifiable confidential secret.
# - If a sensitive value could fit multiple categories, prefer the most concrete category: health_lab_result over personal_measurement, health_treatment over health_condition, account_number over secret.
# - A diet document can contain both personal data and non-personal diet content. Extract only data that describes or identifies a person.
# - Do not extract the diet plan itself as PII: meals, menus, recipes, food lists, portions, grams of food, macros, calories, meal timing, nutritional targets, substitutions, cooking instructions, shopping lists, or generic nutrition advice are not PII unless they reveal a personal health condition, allergy/intolerance, prescription, diagnosis, or uniquely identifying personal attribute.
# - Do not classify ordinary diet calories or meal calories as personal_measurement or health_lab_result. Extract calories only when they clearly describe the person's measured metabolism or biometric assessment, for example "metabolismo basale 1.295 kcal".

# Extraction rules:
# - value must be copied exactly from the input text, preserving spaces, punctuation, casing, and accents.
# - Extract the shortest complete span that contains the sensitive value. Do not include surrounding labels unless the label is needed to understand the value, for example "BMI 24.8" or "peso 72 kg".
# - Prefer the most specific pii_type. Avoid secret unless the value is genuinely a credential, access secret, confidential code, signature, or unclassifiable confidential secret.
# - Include repeated occurrences if they appear in different positions.
# - Do not infer values that are not explicitly present in the text.
# - Do not extract generic public medical terms unless they are tied to an identifiable person, patient, client, or private record.
# - Do not extract generic diet-plan content unless it is directly a personal attribute or health fact about the person.
# - If no sensitive personal data is present, return {"pii_fields":[]}.
# """


@dataclass
class PageMarkdown:
    page_number: int
    text: str


def slugify_path_name(path: Path) -> str:
    stem = path.stem.strip() or "document"
    return re.sub(r"[^A-Za-z0-9._-]+", "_", stem).strip("_") or "document"


def build_docling_converter() -> "DocumentConverter":
    try:
        from docling.datamodel.base_models import InputFormat
        from docling.document_converter import DocumentConverter
    except ModuleNotFoundError as exc:
        raise RuntimeError(
            "Missing dependency: docling. Install it with "
            "`pip install -r analysis/pii_pdf_analyzer/requirements.txt`."
        ) from exc

    artifacts_path = os.getenv("DOCLING_ARTIFACTS_PATH")
    if artifacts_path:
        return DocumentConverter(
            allowed_formats=[InputFormat.PDF],
            artifacts_path=artifacts_path,
        )

    return DocumentConverter(allowed_formats=[InputFormat.PDF])


def extract_pdf_pages(pdf_path: Path) -> list[PageMarkdown]:
    converter = build_docling_converter()
    result = converter.convert(pdf_path)
    doc = result.document
    page_count = getattr(result.input, "page_count", 0) or len(getattr(result, "pages", []) or [])

    if page_count <= 0:
        markdown = doc.export_to_markdown().strip()
        return [PageMarkdown(page_number=1, text=markdown)]

    return [
        PageMarkdown(
            page_number=page_number,
            text=doc.export_to_markdown(page_no=page_number).strip(),
        )
        for page_number in range(1, page_count + 1)
    ]


def pages_to_markdown(pdf_path: Path, pages: list[PageMarkdown]) -> str:
    lines = [
        f"# {pdf_path.name}",
        "",
        f"_Source PDF: `{pdf_path}`_",
        "",
    ]

    for page in pages:
        lines.extend(
            [
                f"## Page {page.page_number}",
                "",
                page.text if page.text else "_No extractable text found on this page._",
                "",
            ]
        )

    return "\n".join(lines).rstrip() + "\n"


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


def analyze_page(redactor: "OPF", page: PageMarkdown) -> dict[str, Any]:
    if not page.text:
        return {
            "page_number": page.page_number,
            "has_pii": False,
            "pii_fields": [],
            "opf_summary": {},
            "redacted_text": "",
            "warning": "No extractable text found on this page.",
        }

    result = redactor.redact(page.text)
    payload = result.to_dict()
    fields = []

    for index, span in enumerate(payload.get("detected_spans", []), start=1):
        label = str(span.get("label", "unknown"))
        fields.append(
            {
                "field_name": f"{OPF_LABEL_TO_FIELD.get(label, label)}_{index}",
                "pii_type": label,
                "value": span.get("text", ""),
                "redacted_value": span.get("placeholder", ""),
                "start": span.get("start"),
                "end": span.get("end"),
            }
        )

    return {
        "page_number": page.page_number,
        "has_pii": bool(fields),
        "pii_fields": fields,
        "opf_summary": payload.get("summary", {}),
        "redacted_text": payload.get("redacted_text", ""),
        "warning": payload.get("warning"),
    }


def _extract_json_object(text: str) -> dict[str, Any]:
    try:
        return json.loads(text)
    except json.JSONDecodeError:
        start = text.find("{")
        end = text.rfind("}")
        if start == -1 or end == -1 or end <= start:
            raise
        return json.loads(text[start : end + 1])


def _extract_local_llm_text(response: dict[str, Any]) -> str:
    if isinstance(response.get("output"), str):
        return response["output"]
    if isinstance(response.get("response"), str):
        return response["response"]
    if isinstance(response.get("content"), str):
        return response["content"]
    if isinstance(response.get("message"), dict):
        content = response["message"].get("content")
        if isinstance(content, str):
            return content
        if isinstance(content, list):
            parts = []
            for item in content:
                if isinstance(item, str):
                    parts.append(item)
                elif isinstance(item, dict):
                    if isinstance(item.get("text"), str):
                        parts.append(item["text"])
                    elif isinstance(item.get("content"), str):
                        parts.append(item["content"])
            if parts:
                return "\n".join(parts)
    choices = response.get("choices")
    if isinstance(choices, list) and choices:
        first = choices[0]
        if isinstance(first, dict):
            if isinstance(first.get("text"), str):
                return first["text"]
            message = first.get("message")
            if isinstance(message, dict) and isinstance(message.get("content"), str):
                return message["content"]
            if isinstance(message, dict) and isinstance(message.get("content"), list):
                parts = []
                for item in message["content"]:
                    if isinstance(item, str):
                        parts.append(item)
                    elif isinstance(item, dict):
                        if isinstance(item.get("text"), str):
                            parts.append(item["text"])
                        elif isinstance(item.get("content"), str):
                            parts.append(item["content"])
                if parts:
                    return "\n".join(parts)
    return json.dumps(response)


def _find_pii_payload(value: Any) -> dict[str, Any] | None:
    if isinstance(value, dict):
        pii_fields = value.get("pii_fields")
        if isinstance(pii_fields, list):
            return value
        for child in value.values():
            found = _find_pii_payload(child)
            if found:
                return found
    elif isinstance(value, list):
        for child in value:
            found = _find_pii_payload(child)
            if found:
                return found
    elif isinstance(value, str) and "pii_fields" in value:
        try:
            return _find_pii_payload(_extract_json_object(value))
        except json.JSONDecodeError:
            return None
    return None


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


def call_local_llm(
    text: str,
    endpoint: str = "http://localhost:1235/api/v1/chat",
    model: str = "nvidia/nemotron-3-nano-4b",
    system_prompt: str = LOCAL_LLM_SYSTEM_PROMPT,
    timeout: int = 1200,
    max_output_tokens: int | None = None,
) -> dict[str, Any]:
    payload = {
        "model": model,
        "system_prompt": system_prompt,
        "input": text
    }
    if max_output_tokens is not None:
        payload["max_output_tokens"] = max_output_tokens
    request = urllib.request.Request(
        endpoint,
        data=json.dumps(payload).encode("utf-8"),
        headers={"Content-Type": "application/json"},
        method="POST",
    )
    try:
        with urllib.request.urlopen(request, timeout=timeout) as response:
            body = response.read().decode("utf-8")
    except (TimeoutError, socket.timeout) as exc:
        raise RuntimeError(f"Local LLM request timed out after {timeout} seconds.") from exc
    except urllib.error.URLError as exc:
        raise RuntimeError(f"Local LLM request failed: {exc}") from exc

    raw_response = json.loads(body)
    model_text = _extract_local_llm_text(raw_response)
    parsed = _find_pii_payload(raw_response)
    if parsed is None:
        try:
            parsed = _find_pii_payload(_extract_json_object(model_text))
        except json.JSONDecodeError:
            parsed = None
    if parsed is None:
        preview = model_text.replace("\n", " ")[:1000]
        raise RuntimeError(
            "Local LLM response did not contain a pii_fields array. "
            f"Model text preview: {preview!r}"
        )
    parsed["_raw_response"] = raw_response
    return parsed


def _coerce_llm_span(page_text: str, span: dict[str, Any]) -> tuple[dict[str, Any] | None, str | None]:
    value = str(span.get("value") or span.get("text") or "").strip()
    label = str(span.get("pii_type") or span.get("label") or "secret")
    if label not in LLM_ALLOWED_PII_TYPES:
        label = "secret"
    field_description = str(
        span.get("field_description")
        or span.get("description")
        or DEFAULT_FIELD_DESCRIPTIONS.get(label, "Sensitive personal data field.")
    ).strip()
    if not value:
        return None, "missing_value"

    start = span.get("start")
    end = span.get("end")
    if isinstance(start, int) and isinstance(end, int) and 0 <= start < end <= len(page_text):
        if page_text[start:end] == value:
            return {
                "label": label,
                "field_description": field_description,
                "text": value,
                "start": start,
                "end": end,
            }, None

        nearby_start = max(0, start - 80)
        nearby_end = min(len(page_text), end + 80)
        nearby_at = page_text.find(value, nearby_start, nearby_end)
        if nearby_at != -1:
            return {
                "label": label,
                "field_description": field_description,
                "text": value,
                "start": nearby_at,
                "end": nearby_at + len(value),
            }, "offset_corrected_nearby"

        normalized_span = _find_whitespace_normalized_span(page_text, value, start, end)
        if normalized_span:
            normalized_start, normalized_end = normalized_span
            return {
                "label": label,
                "field_description": field_description,
                "text": page_text[normalized_start:normalized_end],
                "start": normalized_start,
                "end": normalized_end,
            }, "whitespace_corrected_nearby"

    found_at = page_text.find(value)
    if found_at == -1:
        normalized_span = _find_whitespace_normalized_span(page_text, value)
        if normalized_span:
            normalized_start, normalized_end = normalized_span
            return {
                "label": label,
                "field_description": field_description,
                "text": page_text[normalized_start:normalized_end],
                "start": normalized_start,
                "end": normalized_end,
            }, "whitespace_corrected_global"
        return None, "value_not_found_in_page_text"
    return {
        "label": label,
        "field_description": field_description,
        "text": value,
        "start": found_at,
        "end": found_at + len(value),
    }, "offset_corrected_global"


def _redact_text(text: str, fields: list[dict[str, Any]]) -> str:
    redacted = text
    for field in sorted(fields, key=lambda item: item["start"], reverse=True):
        redacted = redacted[: field["start"]] + field["redacted_value"] + redacted[field["end"] :]
    return redacted


def _empty_local_llm_page_result(
    page: PageMarkdown,
    warning: str,
    model: str,
    endpoint: str,
) -> dict[str, Any]:
    return {
        "page_number": page.page_number,
        "has_pii": False,
        "pii_fields": [],
        "opf_summary": {
            "output_mode": "typed",
            "span_count": 0,
            "by_label": {},
            "decoded_mismatch": False,
            "engine": "local_llm",
            "model": model,
            "endpoint": endpoint,
            "raw_span_count": 0,
            "rejected_span_count": 0,
            "rejected_reasons": {},
            "offset_status": "not_computed",
        },
        "redacted_text": page.text,
        "warning": warning,
    }


def analyze_page_with_local_llm(
    page: PageMarkdown,
    endpoint: str = "http://localhost:1235/api/v1/chat",
    model: str = "nvidia/nemotron-3-nano-4b",
    system_prompt: str = LOCAL_LLM_SYSTEM_PROMPT,
    timeout: int = 600,
    max_output_tokens: int | None = None,
) -> dict[str, Any]:
    if not page.text:
        return {
            "page_number": page.page_number,
            "has_pii": False,
            "pii_fields": [],
            "opf_summary": {},
            "redacted_text": "",
            "warning": "No extractable text found on this page.",
        }

    try:
        payload = call_local_llm(page.text, endpoint, model, system_prompt, timeout, max_output_tokens)
    except RuntimeError as exc:
        return _empty_local_llm_page_result(page, str(exc), model, endpoint)

    fields = []
    seen = set()
    raw_spans = payload.get("pii_fields", [])
    rejected_spans = 0
    rejected_reasons: dict[str, int] = {}
    for span in raw_spans:
        if not isinstance(span, dict):
            rejected_spans += 1
            rejected_reasons["invalid_span"] = rejected_reasons.get("invalid_span", 0) + 1
            continue
        value = str(span.get("value") or span.get("text") or "").strip()
        if not value:
            rejected_spans += 1
            rejected_reasons["missing_value"] = rejected_reasons.get("missing_value", 0) + 1
            continue
        label = str(span.get("pii_type") or span.get("label") or "secret")
        if label not in LLM_ALLOWED_PII_TYPES:
            label = "secret"
        field_description = str(
            span.get("field_description")
            or span.get("description")
            or DEFAULT_FIELD_DESCRIPTIONS.get(label, "Sensitive personal data field.")
        ).strip()
        key = (label, field_description, value)
        if key in seen:
            continue
        seen.add(key)
        placeholder = f"<{label.upper()}>"
        fields.append(
            {
                "field_name": f"{OPF_LABEL_TO_FIELD.get(label, label)}_{len(fields) + 1}",
                "field_description": field_description,
                "pii_type": label,
                "value": value,
                "redacted_value": placeholder,
                "start": None,
                "end": None,
            }
        )

    by_label: dict[str, int] = {}
    for field in fields:
        by_label[field["pii_type"]] = by_label.get(field["pii_type"], 0) + 1

    return {
        "page_number": page.page_number,
        "has_pii": bool(fields),
        "pii_fields": fields,
        "opf_summary": {
            "output_mode": "typed",
            "span_count": len(fields),
            "by_label": by_label,
            "decoded_mismatch": False,
            "engine": "local_llm",
            "model": model,
            "endpoint": endpoint,
            "raw_span_count": len(raw_spans) if isinstance(raw_spans, list) else 0,
            "rejected_span_count": rejected_spans,
            "rejected_reasons": rejected_reasons,
            "offset_status": "not_computed",
        },
        "redacted_text": page.text,
        "warning": None,
    }


def build_report(
    pdf_path: Path,
    markdown_path: Path,
    checkpoint: str | None,
    device: str,
    output_mode: str,
    pages: list[PageMarkdown],
    page_results: list[dict[str, Any]],
) -> dict[str, Any]:
    total_fields = sum(len(page.get("pii_fields", [])) for page in page_results)
    pages_with_pii = sum(1 for page in page_results if page.get("has_pii"))

    return {
        "document": {
            "source_pdf": str(pdf_path),
            "markdown_file": str(markdown_path),
            "page_count": len(pages),
            "analyzed_at": datetime.now(timezone.utc).isoformat(),
            "privacy_filter": {
                "package": "openai/privacy-filter",
                "checkpoint": checkpoint or os.getenv("OPF_CHECKPOINT") or "~/.opf/privacy_filter",
                "device": device,
                "output_mode": output_mode,
            },
        },
        "summary": {
            "pages_with_pii": pages_with_pii,
            "total_pii_fields": total_fields,
        },
        "pages": page_results,
    }


def write_json(path: Path, data: dict[str, Any]) -> None:
    path.write_text(json.dumps(data, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Convert a PDF to Markdown and analyze every page with OpenAI Privacy Filter."
    )
    parser.add_argument("pdf", type=Path, help="Path to the PDF to analyze.")
    parser.add_argument(
        "--out-dir",
        type=Path,
        default=Path(__file__).resolve().parent / "outputs",
        help="Directory for generated Markdown and JSON report.",
    )
    parser.add_argument(
        "--checkpoint",
        default=None,
        help="Path to the OPF checkpoint directory. Defaults to OPF_CHECKPOINT or ~/.opf/privacy_filter.",
    )
    parser.add_argument(
        "--device",
        choices=("cpu", "cuda"),
        default="cpu",
        help="Inference device for OpenAI Privacy Filter. Default: cpu.",
    )
    parser.add_argument(
        "--output-mode",
        choices=("typed", "redacted"),
        default="typed",
        help="Keep OPF labels or collapse them to redacted. Default: typed.",
    )
    parser.add_argument(
        "--skip-filter",
        "--skip-openai",
        dest="skip_filter",
        action="store_true",
        help="Only convert the PDF to Markdown; do not run OpenAI Privacy Filter.",
    )
    return parser.parse_args()


def main() -> int:
    args = parse_args()
    pdf_path = args.pdf.expanduser().resolve()

    if not pdf_path.exists():
        print(f"PDF not found: {pdf_path}", file=sys.stderr)
        return 2
    if pdf_path.suffix.lower() != ".pdf":
        print(f"Input file must be a PDF: {pdf_path}", file=sys.stderr)
        return 2

    out_dir = args.out_dir.expanduser().resolve()
    out_dir.mkdir(parents=True, exist_ok=True)

    output_name = slugify_path_name(pdf_path)
    markdown_path = out_dir / f"{output_name}.md"
    preprocessed_markdown_path = out_dir / f"{output_name}.preprocessed.md"
    report_path = out_dir / f"{output_name}.pii.json"

    try:
        pages = extract_pdf_pages(pdf_path)
    except RuntimeError as exc:
        print(str(exc), file=sys.stderr)
        return 2

    markdown_path.write_text(pages_to_markdown(pdf_path, pages), encoding="utf-8")
    print(f"Wrote Markdown: {markdown_path}")
    pii_pages = preprocess_pages_for_pii(pages)
    preprocessed_markdown_path.write_text(
        pages_to_markdown(pdf_path, pii_pages),
        encoding="utf-8",
    )
    print(f"Wrote preprocessed Markdown: {preprocessed_markdown_path}")

    if args.skip_filter:
        print("Skipped OpenAI Privacy Filter analysis.")
        return 0

    try:
        from opf import OPF
    except ModuleNotFoundError as exc:
        print(
            "Missing dependency: opf. Install it with "
            "`pip install -r analysis/pii_pdf_analyzer/requirements.txt`.",
            file=sys.stderr,
        )
        return 2

    redactor = OPF(
        model=args.checkpoint,
        device=args.device,
        output_mode=args.output_mode,
        output_text_only=False,
    )
    page_results: list[dict[str, Any]] = []

    for page in pii_pages:
        print(f"Analyzing page {page.page_number}/{len(pii_pages)}...")
        page_results.append(analyze_page(redactor, page))

    report = build_report(
        pdf_path,
        preprocessed_markdown_path,
        args.checkpoint,
        args.device,
        args.output_mode,
        pii_pages,
        page_results,
    )
    write_json(report_path, report)
    print(f"Wrote PII report: {report_path}")
    print(
        "Summary: "
        f"{report['summary']['total_pii_fields']} PII field(s) across "
        f"{report['summary']['pages_with_pii']} page(s)."
    )

    return 0


if __name__ == "__main__":
    raise SystemExit(main())
