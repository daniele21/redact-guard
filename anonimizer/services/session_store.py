"""In-memory document session store.

The store lock protects the mapping and TTL bookkeeping; each session has a
separate operation_lock protecting analysis/review/export. Cleanup skips busy
documents, so slow model inference cannot evict an active session.
"""
from datetime import datetime, timezone, timedelta
from threading import RLock

from domain.models import DocumentSession
from config import config

_sessions: dict[str, DocumentSession] = {}
_store_lock = RLock()


def get_session(doc_id: str) -> DocumentSession | None:
    with _store_lock:
        session = _sessions.get(doc_id)
        if session is not None:
            session.last_accessed_at = datetime.now(timezone.utc)
        return session


def save_session(session: DocumentSession):
    with _store_lock:
        session.last_accessed_at = datetime.now(timezone.utc)
        _sessions[session.doc_id] = session


def delete_session(doc_id: str):
    with _store_lock:
        # The caller must not terminate an active document operation.
        session = _sessions.get(doc_id)
        if session is None:
            return
        if not session.operation_lock.acquire(blocking=False):
            return
        try:
            _sessions.pop(doc_id, None)
        finally:
            session.operation_lock.release()


def cleanup_idle_sessions(protected_doc_ids: set[str] | None = None):
    """Evict only idle, unleased sessions, never queued or in-flight jobs."""
    with _store_lock:
        now = datetime.now(timezone.utc)
        ttl = timedelta(minutes=config.session_ttl_minutes)
        for doc_id, session in tuple(_sessions.items()):
            if doc_id in (protected_doc_ids or ()):
                continue
            if not session.operation_lock.acquire(blocking=False):
                continue
            try:
                if now - session.last_accessed_at > ttl:
                    _sessions.pop(doc_id, None)
            finally:
                session.operation_lock.release()
