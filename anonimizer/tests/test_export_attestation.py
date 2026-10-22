"""Fail-closed protection-output tests with synthetic PII only."""
import sys
import unittest
from datetime import datetime, timezone
from pathlib import Path
from unittest.mock import patch

from fastapi import HTTPException

BACKEND_DIR = Path(__file__).resolve().parents[1]
if str(BACKEND_DIR) not in sys.path:
    sys.path.insert(0, str(BACKEND_DIR))

from domain.models import (
    DocumentSession, PageMarkdown, PIIField, PageAnalysisResult,
    RedactRequest, RedactRequestItem,
)
from services.finding_identity import build_finding_id, build_entity_id
from services.export_readiness import ReviewNotReady, ensure_export_attested
from api import routes_redact, routes_export, routes_analyze


def make_session():
    value = "Mario Rossi"  # synthetic
    page = PageMarkdown(page_number=1, text=f"Cliente: {value}.")
    start = page.text.index(value)
    field = PIIField(
        finding_id=build_finding_id(
            page_number=1, pii_type="private_person",
            start=start, end=start + len(value), value=value,
        ),
        entity_id=build_entity_id("private_person", value),
        field_name="Person", field_description="Synthetic person name.",
        pii_type="private_person", value=value,
        redacted_value="[REDACTED_PRIVATE_PERSON]",
        start=start, end=start + len(value),
    )
    now = datetime.now(timezone.utc)
    session = DocumentSession(
        doc_id="synthetic", original_filename="example.pdf", file_hash="test",
        profile_name="general", pages=[page], preprocessed_pages=[page],
        pii_results={1: [field]}, redaction_overrides={}, review_decisions={},
        page_analysis_status={1: "complete"}, page_analysis_errors={},
        page_diagnostics={}, created_at=now, last_accessed_at=now,
    )
    return session, field


class ProtectedExportTests(unittest.TestCase):
    def test_get_export_without_review_attestation_fails_closed(self):
        session, _ = make_session()
        with patch.object(routes_export, "get_session", return_value=session):
            with self.assertRaises(HTTPException) as err:
                routes_export.export_document("synthetic")
        self.assertEqual(err.exception.status_code, 409)

    def test_incomplete_and_warning_pages_block_attestation(self):
        session, field = make_session()
        session.page_analysis_status[1] = "failed"
        request = RedactRequest(
            review_attested=True,
            fields_to_redact=[RedactRequestItem(field_id=field.finding_id, decision="redact")],
        )
        with patch.object(routes_redact, "get_session", return_value=session):
            with self.assertRaises(HTTPException) as err:
                routes_redact.apply_redaction("synthetic", request)
        self.assertEqual(err.exception.status_code, 409)
        self.assertFalse(session.review_attested)
        session.page_analysis_status[1] = "warning"
        with self.assertRaises(ReviewNotReady):
            ensure_export_attested(session)

    def test_explicit_review_confirmation_required_and_unknown_ids_rejected(self):
        session, field = make_session()
        with patch.object(routes_redact, "get_session", return_value=session), patch.object(routes_redact, "save_session"):
            for request in (
                RedactRequest(fields_to_redact=[RedactRequestItem(field_id=field.finding_id, decision="redact")]),
                RedactRequest(review_attested=True, fields_to_redact=[RedactRequestItem(field_id="occ_unknown", decision="keep")]),
            ):
                with self.assertRaises(HTTPException) as err:
                    routes_redact.apply_redaction("synthetic", request)
                self.assertEqual(err.exception.status_code, 409)
                self.assertFalse(session.review_attested)

    def test_confirmed_review_export_redacts_selected_values(self):
        session, field = make_session()
        request = RedactRequest(review_attested=True, fields_to_redact=[
            RedactRequestItem(field_id=field.finding_id, decision="redact")
        ])
        with patch.object(routes_redact, "get_session", return_value=session), patch.object(routes_redact, "save_session"):
            result = routes_redact.apply_redaction("synthetic", request)
        self.assertTrue(session.review_attested)
        self.assertEqual(result.stats["total_fields_redacted"], 1)
        with patch.object(routes_export, "get_session", return_value=session):
            exported = routes_export.export_document("synthetic")
        self.assertIn(b"[REDACTED_PRIVATE_PERSON]", exported.body)
        self.assertNotIn(b"Mario Rossi", exported.body)

    def test_new_analysis_invalidates_old_keep_decision_and_attestation(self):
        session, field = make_session()
        session.review_attested = True
        session.review_decisions[field.finding_id] = "keep"
        session.redaction_overrides[field.finding_id] = False
        new_result = PageAnalysisResult(
            page_number=1, has_pii=True, pii_fields=[field],
            redacted_text="Cliente: [REDACTED_PRIVATE_PERSON].",
        )
        with patch.object(routes_analyze, "get_session", return_value=session), \
                patch.object(routes_analyze, "save_session"), \
                patch.object(routes_analyze, "detect_pii_for_page", return_value=new_result):
            routes_analyze.analyze_page("synthetic", 1, force=True)
        self.assertFalse(session.review_attested)
        self.assertNotIn(field.finding_id, session.review_decisions)
        self.assertNotIn(field.finding_id, session.redaction_overrides)
        with patch.object(routes_export, "get_session", return_value=session):
            with self.assertRaises(HTTPException) as err:
                routes_export.export_document("synthetic")
        self.assertEqual(err.exception.status_code, 409)

    def test_no_inferred_complete_status_with_unresolved_diagnostics(self):
        session, _ = make_session()
        from domain.detection import DetectionDiagnostics
        # Summary uses unresolved diagnostics when present.
        with patch("services.export_readiness.build_document_summary") as summarize:
            summarize.return_value.analysis_status = "complete"
            summarize.return_value.pages_total = 1
            summarize.return_value.pages_analyzed = 1
            summarize.return_value.pages_failed = 0
            summarize.return_value.pages_with_warnings = 0
            summarize.return_value.unresolved_findings = 1
            from services.export_readiness import ensure_complete_analysis
            with self.assertRaises(ReviewNotReady):
                ensure_complete_analysis(session)


class ConcurrentDocumentTests(unittest.TestCase):
    """Concurrency regressions for exported content and session lifecycle."""

    def test_export_waits_for_reanalysis_and_then_refuses_stale_attestation(self):
        from threading import Event, Thread

        session, field = make_session()
        session.review_attested = True
        detection_started = Event()
        release_detection = Event()
        export_started = Event()
        export_finished = Event()
        results = {}
        replacement = PageAnalysisResult(
            page_number=1, has_pii=True,
            pii_fields=[field], redacted_text="Cliente: [REDACTED_PRIVATE_PERSON].",
        )

        def slow_detection(*_args, **_kwargs):
            detection_started.set()
            if not release_detection.wait(timeout=5):
                raise RuntimeError("Test synchronization timed out")
            return replacement

        def reanalyze():
            try:
                routes_analyze.analyze_page("synthetic", 1, force=True)
                results["analysis"] = "complete"
            except Exception as error:
                results["analysis_error"] = error

        def export():
            export_started.set()
            try:
                routes_export.export_document("synthetic")
                results["export"] = "unsafe_success"
            except HTTPException as error:
                results["export_status"] = error.status_code
            finally:
                export_finished.set()

        with (
            patch.object(routes_analyze, "get_session", return_value=session),
            patch.object(routes_analyze, "save_session"),
            patch.object(routes_analyze, "detect_pii_for_page", side_effect=slow_detection),
            patch.object(routes_export, "get_session", return_value=session),
        ):
            worker = Thread(target=reanalyze, daemon=True)
            worker.start()
            self.assertTrue(detection_started.wait(timeout=3))

            downloader = Thread(target=export, daemon=True)
            downloader.start()
            self.assertTrue(export_started.wait(timeout=3))
            self.assertFalse(
                export_finished.wait(timeout=0.1),
                "Export must not read a document during in-flight reanalysis",
            )
            release_detection.set()
            worker.join(timeout=3)
            downloader.join(timeout=3)
        self.assertFalse(worker.is_alive())
        self.assertFalse(downloader.is_alive())
        self.assertEqual(results.get("analysis"), "complete", results)
        self.assertEqual(results.get("export_status"), 409, results)
        self.assertNotIn("export", results)
        self.assertFalse(session.review_attested)

    def test_cleanup_does_not_evict_busy_expired_session(self):
        from datetime import timedelta
        from threading import Thread
        from services import session_store

        session, _ = make_session()
        session.last_accessed_at = (
            datetime.now(timezone.utc) - timedelta(days=2)
        )
        with patch.object(session_store, "_sessions", {session.doc_id: session}):
            with session.operation_lock:
                cleaner = Thread(
                    target=session_store.cleanup_idle_sessions, daemon=True
                )
                cleaner.start()
                cleaner.join(timeout=3)
                self.assertFalse(cleaner.is_alive())
                self.assertIn(session.doc_id, session_store._sessions)
            session_store.cleanup_idle_sessions()
            self.assertNotIn(session.doc_id, session_store._sessions)


if __name__ == "__main__":
    unittest.main()
