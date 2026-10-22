"""Bounded local analysis jobs. State and findings live only in the API process.

The worker is owned by the backend, not by the React navigation tree.
No disk spool, detached workers, silent retry, or cross-restart claim.
"""
from __future__ import annotations

from concurrent.futures import ThreadPoolExecutor
from dataclasses import dataclass, field
from threading import Event, RLock
from uuid import uuid4

from fastapi import HTTPException

from api.routes_analyze import analyze_page
from domain.models import PageAnalysisResult
from services.session_store import get_session

_TERMINAL = {"complete", "failed", "cancelled"}
_MAX_PENDING = 25
_MAX_HISTORY = 100


@dataclass
class AnalysisJob:
    id: str
    document_id: str
    pages: tuple[int, ...]
    force: bool = False
    status: str = "queued"
    completed_pages: list[int] = field(default_factory=list)
    page_errors: dict[int, str] = field(default_factory=dict)
    results: dict[int, PageAnalysisResult] = field(default_factory=dict, repr=False)
    current_page: int | None = None
    cancel_requested: Event = field(default_factory=Event, repr=False)

    def public(self) -> dict:
        # Status polls never contain original text, paths, or PII findings.
        return {
            "job_id": self.id,
            "document_id": self.document_id,
            "status": self.status,
            "pages_total": len(self.pages),
            "pages_completed": len(self.completed_pages),
            "completed_pages": list(self.completed_pages),
            "current_page": self.current_page,
            "page_errors": dict(self.page_errors),
            "cancellable": self.status in {"queued", "running", "cancelling"},
        }


class AnalysisJobs:
    def __init__(self) -> None:
        self._lock = RLock()
        self._jobs: dict[str, AnalysisJob] = {}
        # One model-backed inference at a time; Korgis retains its own admission.
        self._worker = ThreadPoolExecutor(max_workers=1, thread_name_prefix="redactguard-job")
        self._closed = False

    def submit(self, doc_id: str, pages: list[int], force: bool = False) -> dict:
        session = get_session(doc_id)
        if session is None:
            raise HTTPException(404, "Document session not found or expired.")
        available = {page.page_number for page in session.pages}
        if not pages or len(set(pages)) != len(pages) or set(pages) - available:
            raise HTTPException(422, "Specify distinct existing document pages.")
        with self._lock:
            if self._closed:
                raise HTTPException(503, "Job worker is stopping.")
            if any(j.document_id == doc_id and j.status not in _TERMINAL for j in self._jobs.values()):
                raise HTTPException(409, "An analysis job already exists for this document.")
            if sum(j.status not in _TERMINAL for j in self._jobs.values()) >= _MAX_PENDING:
                raise HTTPException(429, "Local analysis queue is full.")
            # Bound retained in-memory results; never remove in-flight jobs.
            old = [key for key, j in self._jobs.items() if j.status in _TERMINAL]
            for key in old[:max(0, len(self._jobs) - _MAX_HISTORY + 1)]:
                del self._jobs[key]
            job = AnalysisJob(id=str(uuid4()), document_id=doc_id, pages=tuple(pages), force=force)
            self._jobs[job.id] = job
            self._worker.submit(self._execute, job)
            return job.public()

    def _execute(self, job: AnalysisJob) -> None:
        with self._lock:
            if job.cancel_requested.is_set():
                job.status = "cancelled"
                return
            job.status = "running"
        for page in job.pages:
            with self._lock:
                if job.cancel_requested.is_set():
                    job.status = "cancelled"
                    job.current_page = None
                    return
                job.current_page = page
            try:
                # Existing route is the canonical owner of PII policy snapshots,
                # page locks, review-attestation invalidation and diagnostics.
                result = analyze_page(job.document_id, page, force=job.force)
                with self._lock:
                    job.results[page] = result
                    job.completed_pages.append(page)
            except HTTPException as exc:
                with self._lock:
                    # Do not surface error.details, raw prompts, or private paths.
                    job.page_errors[page] = f"Analisi non riuscita (HTTP {exc.status_code})."
            except Exception:
                with self._lock:
                    job.page_errors[page] = "Analisi non riuscita."
            finally:
                with self._lock:
                    job.current_page = None
        with self._lock:
            job.status = "cancelled" if job.cancel_requested.is_set() else (
                "failed" if job.page_errors else "complete"
            )

    def get(self, job_id: str) -> dict:
        with self._lock:
            job = self._jobs.get(job_id)
            if job is None:
                raise HTTPException(404, "Analysis job not found.")
            return job.public()

    def list(self) -> list[dict]:
        with self._lock:
            return [job.public() for job in self._jobs.values()]

    def active_document_ids(self) -> set[str]:
        """Keep queued and running sessions alive until terminal status."""
        with self._lock:
            return {job.document_id for job in self._jobs.values() if job.status not in _TERMINAL}

    def results(self, job_id: str) -> list[PageAnalysisResult]:
        with self._lock:
            job = self._jobs.get(job_id)
            if job is None:
                raise HTTPException(404, "Analysis job not found.")
            # Preserve page order, including partial completion on cancellation.
            return [job.results[p] for p in job.pages if p in job.results]

    def cancel(self, job_id: str) -> dict:
        with self._lock:
            job = self._jobs.get(job_id)
            if job is None:
                raise HTTPException(404, "Analysis job not found.")
            if job.status not in _TERMINAL:
                job.cancel_requested.set()
                job.status = "cancelling"
            return job.public()

    def shutdown(self) -> None:
        with self._lock:
            self._closed = True
            for job in self._jobs.values():
                if job.status not in _TERMINAL:
                    job.cancel_requested.set()
        # Active inference is not forcibly interrupted; the native sidecar is
        # responsible for the bounded process shutdown lifecycle.
        self._worker.shutdown(wait=False, cancel_futures=False)


analysis_jobs = AnalysisJobs()
