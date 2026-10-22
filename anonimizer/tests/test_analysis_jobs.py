"""Backend-owned queue regressions; synthetic document, no real model required."""
import time
import unittest
import sys
from pathlib import Path
from datetime import datetime, timezone
from threading import Event
from unittest.mock import patch

from fastapi import HTTPException

BACKEND_DIR = Path(__file__).resolve().parents[1]
if str(BACKEND_DIR) not in sys.path:
    sys.path.insert(0, str(BACKEND_DIR))

from domain.models import DocumentSession, PageMarkdown, PageAnalysisResult
from services.analysis_jobs import AnalysisJobs
from services.session_store import save_session, delete_session


def session(doc_id):
    now = datetime.now(timezone.utc)
    pages = [PageMarkdown(page_number=n, text=f"synthetic page {n}") for n in (1, 2)]
    return DocumentSession(
        doc_id=doc_id, original_filename="synthetic.pdf", file_hash="f",
        profile_name="general", pages=pages, preprocessed_pages=pages,
        pii_results={}, redaction_overrides={}, review_decisions={},
        page_analysis_status={1: "not_started", 2: "not_started"},
        page_analysis_errors={}, page_diagnostics={},
        created_at=now, last_accessed_at=now,
    )


def wait_until(predicate, timeout=3):
    until = time.monotonic() + timeout
    while time.monotonic() < until:
        if predicate():
            return
        time.sleep(.01)
    raise AssertionError("job did not reach expected state")


class JobTests(unittest.TestCase):
    def setUp(self):
        self.doc_id = f"test-job-{time.monotonic_ns()}"
        save_session(session(self.doc_id))
        self.manager = AnalysisJobs()

    def tearDown(self):
        self.manager.shutdown()
        delete_session(self.doc_id)

    def test_status_without_sensitive_results_and_correct_page_order(self):
        def analyze(doc_id, page, force=False):
            return PageAnalysisResult(
                page_number=page, has_pii=False, pii_fields=[],
                redacted_text=f"secret page {page}", cache_hit=False,
            )

        with patch("services.analysis_jobs.analyze_page", side_effect=analyze):
            job = self.manager.submit(self.doc_id, [2, 1])
            wait_until(lambda: self.manager.get(job["job_id"])["status"] == "complete")
            data = self.manager.get(job["job_id"])
            self.assertEqual(data["completed_pages"], [2, 1])
            self.assertNotIn("secret", str(data))
            self.assertEqual([x.page_number for x in self.manager.results(job["job_id"])], [2, 1])

    def test_duplicate_active_document_fails_closed(self):
        entered, release = Event(), Event()

        def blocked(doc_id, page, force=False):
            entered.set()
            release.wait(2)
            return PageAnalysisResult(
                page_number=page, has_pii=False, pii_fields=[],
                redacted_text="", cache_hit=False,
            )

        with patch("services.analysis_jobs.analyze_page", side_effect=blocked):
            job = self.manager.submit(self.doc_id, [1, 2])
            self.assertTrue(entered.wait(2))
            with self.assertRaises(HTTPException) as caught:
                self.manager.submit(self.doc_id, [2])
            self.assertEqual(caught.exception.status_code, 409)
            self.manager.cancel(job["job_id"])
            release.set()
            wait_until(lambda: self.manager.get(job["job_id"])["status"] == "cancelled")
            self.assertEqual(self.manager.get(job["job_id"])["completed_pages"], [1])

    def test_invalid_pages_never_enter_queue(self):
        for pages in ([], [1, 1], [3]):
            with self.assertRaises(HTTPException) as caught:
                self.manager.submit(self.doc_id, pages)
            self.assertEqual(caught.exception.status_code, 422)

    def test_missing_document_not_scheduled(self):
        with self.assertRaises(HTTPException) as caught:
            self.manager.submit("missing-job-document", [1])
        self.assertEqual(caught.exception.status_code, 404)


if __name__ == "__main__":
    unittest.main()
