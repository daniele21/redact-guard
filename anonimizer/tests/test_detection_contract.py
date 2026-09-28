import sys
import unittest
from pathlib import Path
from unittest.mock import patch
import json

BACKEND_DIR = Path(__file__).resolve().parents[1]
if str(BACKEND_DIR) not in sys.path:
    sys.path.insert(0, str(BACKEND_DIR))

from domain.detection import (
    DETECTION_CONTRACT_VERSION,
    DetectionContractError,
    DetectionFailureCode,
    LLMInferenceResult,
)
from config import config
from domain.models import PageMarkdown
from services.korgis_client import call_korgis
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




class _HTTPResponse:
    def __init__(self, payload):
        self.payload = payload

    def __enter__(self):
        return self

    def __exit__(self, *_args):
        return None

    def read(self):
        return json.dumps(self.payload).encode("utf-8")


class KorgisBoundaryTests(unittest.TestCase):
    def test_finish_reason_length_is_typed_truncation(self):
        response = _HTTPResponse(
            {
                "choices": [
                    {
                        "message": {"content": '{"pii_fields":['},
                        "finish_reason": "length",
                    }
                ],
                "usage": {"prompt_tokens": 10, "completion_tokens": 20},
            }
        )

        with patch(
            "services.korgis_client.urllib.request.urlopen",
            return_value=response,
        ):
            with self.assertRaises(DetectionContractError) as ctx:
                call_korgis("system", "text")

        self.assertEqual(
            ctx.exception.code,
            DetectionFailureCode.TRUNCATED_OUTPUT,
        )


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

    def test_high_overlap_still_advances(self):
        text = ("A" * 10) + " Mario Rossi\n" + ("B" * 40)
        segments = segment_text(text, max_chars=30, overlap_chars=20)

        self.assertGreater(len(segments), 1)
        self.assertLess(len(segments), len(text))
        for left, right in zip(segments, segments[1:]):
            self.assertGreater(right.start, left.start)


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

    def test_overlap_deduplicates_same_source_finding(self):
        page = PageMarkdown(
            page_number=1,
            text=("A" * 10) + "Mario Rossi\n" + ("B" * 40),
        )

        def inference(_prompt, user_text):
            fields = []
            if "Mario Rossi" in user_text:
                fields.append(
                    {"pii_type": "private_person", "value": "Mario Rossi"}
                )
            return LLMInferenceResult(
                model="test-model",
                content=json.dumps({"pii_fields": fields}),
                latency_ms=1.0,
                finish_reason="stop",
            )

        with (
            patch("services.pii_detector.call_local_llm", side_effect=inference),
            patch("services.pii_detector.cache_manager.get_llm", return_value=None),
            patch("services.pii_detector.cache_manager.set_llm"),
            patch.object(config, "llm_chunk_max_chars", 30),
            patch.object(config, "llm_chunk_overlap_chars", 20),
        ):
            result = detect_pii_for_page(page, "financial", force=True)

        matches = [
            field for field in result.pii_fields
            if field.value == "Mario Rossi"
        ]
        self.assertEqual(len(matches), 1)
        self.assertGreater(result.diagnostics.chunks, 1)

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
