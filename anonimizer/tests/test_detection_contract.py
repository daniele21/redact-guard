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
    KorgisCPUUsage,
    KorgisMemoryUsage,
    KorgisRequestEvidence,
    KorgisResourceUsage,
    KorgisSamplingInfo,
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


    def test_page_diagnostics_aggregate_request_resources_without_summing_ram_peaks(self):
        responses = [
            LLMInferenceResult(
                model="test-model",
                content='{"pii_fields":[]}',
                latency_ms=2.0,
                finish_reason="stop",
                korgis_evidence=KorgisRequestEvidence(
                    evidence_version="korgis-request-evidence-v1",
                    request_id="req-1",
                    execution_source="inference",
                    resources=KorgisResourceUsage(
                        snapshot_id="resource-1",
                        memory=KorgisMemoryUsage(
                            baseline_bytes=100,
                            peak_bytes=500,
                            end_bytes=150,
                            peak_delta_bytes=400,
                        ),
                        cpu=KorgisCPUUsage(
                            average_percent=100.0,
                            peak_percent=180.0,
                        ),
                        sampling=KorgisSamplingInfo(
                            interval_ms=100,
                            sample_count=2,
                            errors=0,
                            cpu_observation_ms=100.0,
                        ),
                        attribution_scope="korgis_process_tree",
                        attribution_quality="process_global",
                    ),
                ),
            ),
            LLMInferenceResult(
                model="test-model",
                content='{"pii_fields":[]}',
                latency_ms=3.0,
                finish_reason="stop",
                korgis_evidence=KorgisRequestEvidence(
                    evidence_version="korgis-request-evidence-v1",
                    request_id="req-2",
                    execution_source="inference",
                    resources=KorgisResourceUsage(
                        snapshot_id="resource-2",
                        memory=KorgisMemoryUsage(
                            baseline_bytes=120,
                            peak_bytes=700,
                            end_bytes=160,
                            peak_delta_bytes=580,
                        ),
                        cpu=KorgisCPUUsage(
                            average_percent=200.0,
                            peak_percent=260.0,
                        ),
                        sampling=KorgisSamplingInfo(
                            interval_ms=100,
                            sample_count=6,
                            errors=0,
                            cpu_observation_ms=900.0,
                        ),
                        attribution_scope="korgis_process_tree",
                        attribution_quality="process_global",
                    ),
                ),
            ),
        ]
        page = PageMarkdown(
            page_number=1,
            text=("A" * 35) + " " + ("B" * 35),
        )

        with (
            patch("services.pii_detector.call_local_llm", side_effect=responses),
            patch("services.pii_detector.cache_manager.get_llm", return_value=None),
            patch("services.pii_detector.cache_manager.set_llm"),
            patch.object(config, "llm_chunk_max_chars", 40),
            patch.object(config, "llm_chunk_overlap_chars", 0),
        ):
            result = detect_pii_for_page(page, "financial", force=True)

        self.assertEqual(result.diagnostics.inference_requests, 2)
        self.assertEqual(result.diagnostics.resource_evidence_requests, 2)
        self.assertEqual(result.diagnostics.peak_memory_bytes, 700)
        self.assertEqual(result.diagnostics.peak_memory_delta_bytes, 580)
        self.assertEqual(result.diagnostics.peak_cpu_percent, 260.0)
        self.assertEqual(result.diagnostics.average_cpu_percent, 190.0)
        self.assertEqual(result.diagnostics.resource_cpu_observation_ms, 1000.0)
        self.assertEqual(
            result.diagnostics.resource_attribution_qualities,
            ["process_global"],
        )

    def test_redactguard_cache_hit_does_not_create_inference_resource_cost(self):
        page = PageMarkdown(page_number=1, text="No sensitive data.")

        with (
            patch(
                "services.pii_detector.cache_manager.get_llm",
                return_value='{"pii_fields":[]}',
            ),
            patch("services.pii_detector.call_local_llm") as inference,
        ):
            result = detect_pii_for_page(page, "financial")

        inference.assert_not_called()
        self.assertEqual(result.diagnostics.cache_hits, 1)
        self.assertEqual(result.diagnostics.inference_requests, 0)
        self.assertEqual(result.diagnostics.resource_evidence_requests, 0)
        self.assertIsNone(result.diagnostics.peak_memory_bytes)
        self.assertIsNone(result.diagnostics.peak_cpu_percent)

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
