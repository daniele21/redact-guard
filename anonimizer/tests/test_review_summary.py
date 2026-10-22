import sys
import unittest
from datetime import datetime, timezone
from pathlib import Path

BACKEND_DIR = Path(__file__).resolve().parents[1]
if str(BACKEND_DIR) not in sys.path:
    sys.path.insert(0, str(BACKEND_DIR))

from domain.detection import DetectionDiagnostics
from domain.models import (
    DocumentSession,
    PageMarkdown,
    PIIField,
    RedactRequest,
    RedactRequestItem,
)
from services.analysis_summary import build_document_summary
from services.client_report import render_client_report
from services.finding_identity import build_entity_id, build_finding_id
from services.redaction_engine import apply_redaction_to_document


def _field(page: int, start: int, value: str, pii_type: str = "private_person"):
    return PIIField(
        finding_id=build_finding_id(
            page_number=page,
            pii_type=pii_type,
            start=start,
            end=start + len(value),
            value=value,
        ),
        entity_id=build_entity_id(pii_type, value),
        field_name="Private person",
        field_description="A person name.",
        pii_type=pii_type,
        value=value,
        redacted_value="[REDACTED_PRIVATE_PERSON]",
        start=start,
        end=start + len(value),
    )


def _session():
    now = datetime.now(timezone.utc)
    page1 = PageMarkdown(page_number=1, text="Mario Rossi signed.")
    page2 = PageMarkdown(page_number=2, text="Contact Mario Rossi.")
    field1 = _field(1, 0, "Mario Rossi")
    field2 = _field(2, 8, "Mario Rossi")
    return DocumentSession(
        doc_id="doc",
        original_filename="contract.pdf",
        file_hash="hash",
        profile_name="legal",
        pages=[page1, page2],
        preprocessed_pages=[page1, page2],
        pii_results={1: [field1], 2: [field2]},
        redaction_overrides={},
        review_decisions={},
        page_analysis_status={1: "complete", 2: "complete"},
        page_analysis_errors={},
        page_diagnostics={},
        created_at=now,
        last_accessed_at=now,
    ), field1, field2


class FindingIdentityTests(unittest.TestCase):
    def test_ids_are_stable_and_do_not_embed_raw_pii(self):
        entity_a = build_entity_id("private_person", "Mario Rossi")
        entity_b = build_entity_id("private_person", "  mario   rossi ")
        finding = build_finding_id(
            page_number=1,
            pii_type="private_person",
            start=10,
            end=21,
            value="Mario Rossi",
        )

        self.assertEqual(entity_a, entity_b)
        self.assertTrue(entity_a.startswith("ent_"))
        self.assertTrue(finding.startswith("occ_"))
        self.assertNotIn("Mario", entity_a)
        self.assertNotIn("Rossi", finding)


class SummaryTests(unittest.TestCase):
    def test_summary_distinguishes_unique_entities_from_occurrences(self):
        session, field1, field2 = _session()
        session.review_decisions[field2.finding_id] = "keep"

        summary = build_document_summary(session)

        self.assertEqual(summary.analysis_status, "complete")
        self.assertEqual(summary.pages_analyzed, 2)
        self.assertEqual(summary.unique_sensitive_items, 1)
        self.assertEqual(summary.occurrences, 2)
        self.assertEqual(summary.affected_pages, 2)
        self.assertEqual(summary.decision_counts["redact"], 1)
        self.assertEqual(summary.decision_counts["keep"], 1)
        self.assertEqual(summary.entities[0].occurrence_count, 2)
        self.assertNotIn("Mario Rossi", summary.entities[0].masked_value)

    def test_document_summary_aggregates_resource_peaks_and_weighted_cpu(self):
        session, _, _ = _session()
        session.page_diagnostics = {
            1: DetectionDiagnostics(
                model="demo",
                chunks=1,
                cache_hits=0,
                inference_requests=1,
                resource_evidence_requests=1,
                peak_memory_bytes=500,
                peak_memory_delta_bytes=200,
                average_cpu_percent=100.0,
                peak_cpu_percent=150.0,
                resource_cpu_sample_count=2,
                resource_cpu_observation_ms=100.0,
                resource_sampling_interval_ms=100,
                resource_memory_sources=["ps_process_tree_cpu_time_delta_excluding_sampler"],
                resource_cpu_sources=["ps_process_tree_cpu_time_delta_excluding_sampler"],
                resource_attribution_scopes=["korgis_process_tree"],
                resource_attribution_qualities=["process_global"],
            ),
            2: DetectionDiagnostics(
                model="demo",
                chunks=1,
                cache_hits=1,
                inference_requests=1,
                resource_evidence_requests=1,
                peak_memory_bytes=700,
                peak_memory_delta_bytes=300,
                average_cpu_percent=200.0,
                peak_cpu_percent=260.0,
                resource_cpu_sample_count=6,
                resource_cpu_observation_ms=900.0,
                resource_sampling_interval_ms=100,
                resource_memory_sources=["ps_process_tree_cpu_time_delta_excluding_sampler"],
                resource_cpu_sources=["ps_process_tree_cpu_time_delta_excluding_sampler"],
                resource_attribution_scopes=["korgis_process_tree"],
                resource_attribution_qualities=["process_global"],
            ),
        }

        summary = build_document_summary(session)

        self.assertEqual(summary.resources.inference_requests, 2)
        self.assertEqual(summary.resources.cache_hits, 1)
        self.assertEqual(summary.resources.evidence_requests, 2)
        self.assertEqual(summary.resources.peak_memory_bytes, 700)
        self.assertEqual(summary.resources.peak_memory_delta_bytes, 300)
        self.assertEqual(summary.resources.peak_cpu_percent, 260.0)
        self.assertEqual(summary.resources.average_cpu_percent, 190.0)
        self.assertEqual(summary.resources.cpu_sample_count, 8)
        self.assertEqual(summary.resources.cpu_observation_ms, 1000.0)
        self.assertEqual(
            summary.resources.cpu_sources,
            ["ps_process_tree_cpu_time_delta_excluding_sampler"],
        )
        self.assertEqual(
            summary.resources.attribution_qualities,
            ["process_global"],
        )

    def test_failed_page_makes_document_status_failed(self):
        session, _, _ = _session()
        session.page_analysis_status[2] = "failed"
        session.page_analysis_errors[2] = "invalid_json"

        summary = build_document_summary(session)

        self.assertEqual(summary.analysis_status, "failed")
        self.assertEqual(summary.pages_failed, 1)
        self.assertEqual(summary.page_errors[2], "invalid_json")


class ReviewDecisionTests(unittest.TestCase):
    def test_redact_keep_and_not_pii_are_applied_to_occurrences(self):
        session, field1, field2 = _session()
        request = RedactRequest(
            fields_to_redact=[
                RedactRequestItem(
                    field_id=field1.finding_id,
                    decision="redact",
                ),
                RedactRequestItem(
                    field_id=field2.finding_id,
                    decision="not_pii",
                ),
            ]
        )

        pages = apply_redaction_to_document(session, request)

        self.assertIn("[REDACTED_PRIVATE_PERSON]", pages[0].text)
        self.assertIn("Mario Rossi", pages[1].text)
        self.assertEqual(
            session.review_decisions[field2.finding_id],
            "not_pii",
        )


if __name__ == "__main__":
    unittest.main()


class ClientReportTests(unittest.TestCase):
    def test_client_report_excludes_raw_sensitive_values(self):
        session, _, _ = _session()
        summary = build_document_summary(session)

        report = render_client_report(summary)

        self.assertIn("Protection report", report)
        self.assertIn("contract.pdf", report)
        self.assertIn("Private person", report)
        self.assertNotIn("Mario Rossi", report)
        self.assertIn("Raw sensitive values are intentionally excluded", report)

    def test_client_report_surfaces_material_exceptions(self):
        session, _, field2 = _session()
        session.review_decisions[field2.finding_id] = "keep"
        session.page_analysis_status[2] = "failed"
        session.page_analysis_errors[2] = "invalid_json"
        summary = build_document_summary(session)

        report = render_client_report(summary)

        self.assertIn("Analysis incomplete", report)
        self.assertIn("page(s) failed analysis", report)
        self.assertIn("explicitly retained", report)
