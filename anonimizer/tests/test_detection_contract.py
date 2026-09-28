import sys
import unittest
from pathlib import Path
from unittest.mock import patch

BACKEND_DIR = Path(__file__).resolve().parents[1]
if str(BACKEND_DIR) not in sys.path:
    sys.path.insert(0, str(BACKEND_DIR))

from domain.detection import (
    DETECTION_CONTRACT_VERSION,
    DetectionContractError,
    DetectionFailureCode,
    LLMInferenceResult,
)
from domain.models import PageMarkdown
from services.output_contract import parse_model_response
from services.pii_detector import detect_pii_for_page
from services.text_segments import segment_text


class OutputContractTests(unittest.TestCase):
    def test_valid_empty_result_is_success(self):
        parsed = parse_model_response(
            '{"pii_fields":[]}',
            allowed_types={"private_person"},
        )
        self.assertEqual(parsed.pii_fields, [])

    def test_invalid_json_is_not_zero_pii(self):
        with self.assertRaises(DetectionContractError) as ctx:
            parse_model_response(
                '{"pii_fields":',
                allowed_types={"private_person"},
            )
        self.assertEqual(ctx.exception.code, DetectionFailureCode.INVALID_JSON)

    def test_unknown_type_is_schema_failure(self):
        with self.assertRaises(DetectionContractError) as ctx:
            parse_model_response(
                '{"pii_fields":[{"pii_type":"invented","value":"Mario"}]}',
                allowed_types={"private_person"},
            )
        self.assertEqual(ctx.exception.code, DetectionFailureCode.INVALID_SCHEMA)


class SegmentationTests(unittest.TestCase):
    def test_long_text_segments_preserve_source_offsets(self):
        text = "alpha beta gamma delta epsilon zeta eta theta"
        segments = segment_text(text, max_chars=16, overlap_chars=4)

        self.assertGreater(len(segments), 1)
        for segment in segments:
            self.assertEqual(segment.text, text[segment.start : segment.end])
        for left, right in zip(segments, segments[1:]):
            self.assertLess(right.start, left.end)
            self.assertGreater(right.end, left.end)


class DetectionPipelineTests(unittest.TestCase):
    def test_model_metadata_is_derived_deterministically(self):
        response = LLMInferenceResult(
            model="test-model",
            content=(
                '{"pii_fields":['
                '{"pii_type":"private_person","value":"Mario Rossi"}'
                ']}'
            ),
            latency_ms=12.5,
            finish_reason="stop",
            input_tokens=10,
            output_tokens=8,
        )
        page = PageMarkdown(page_number=1, text="Cliente: Mario Rossi.")

        with (
            patch("services.pii_detector.call_local_llm", return_value=response),
            patch("services.pii_detector.cache_manager.get_llm", return_value=None),
            patch("services.pii_detector.cache_manager.set_llm") as cache_set,
        ):
            result = detect_pii_for_page(page, "financial", force=True)

        self.assertTrue(result.has_pii)
        self.assertEqual(len(result.pii_fields), 1)
        finding = result.pii_fields[0]
        self.assertEqual(finding.pii_type, "private_person")
        self.assertEqual(finding.value, "Mario Rossi")
        self.assertTrue(finding.field_name)
        self.assertTrue(finding.field_description)
        self.assertEqual(finding.redacted_value, "[REDACTED_PRIVATE_PERSON]")
        self.assertEqual(
            result.diagnostics.contract_version,
            DETECTION_CONTRACT_VERSION,
        )
        cache_set.assert_called_once()

    def test_invalid_model_output_is_never_cached_as_success(self):
        response = LLMInferenceResult(
            model="test-model",
            content='{"pii_fields":',
            latency_ms=3.0,
            finish_reason="stop",
        )
        page = PageMarkdown(page_number=1, text="Cliente: Mario Rossi.")

        with (
            patch("services.pii_detector.call_local_llm", return_value=response),
            patch("services.pii_detector.cache_manager.get_llm", return_value=None),
            patch("services.pii_detector.cache_manager.set_llm") as cache_set,
        ):
            with self.assertRaises(DetectionContractError) as ctx:
                detect_pii_for_page(page, "financial", force=True)

        self.assertEqual(ctx.exception.code, DetectionFailureCode.INVALID_JSON)
        cache_set.assert_not_called()


if __name__ == "__main__":
    unittest.main()
