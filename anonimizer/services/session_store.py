from datetime import datetime, timezone, timedelta
from domain.models import DocumentSession
from config import config

# Global in-memory dictionary
_sessions: dict[str, DocumentSession] = {}

def get_session(doc_id: str) -> DocumentSession | None:
    session = _sessions.get(doc_id)
    if session:
        session.last_accessed_at = datetime.now(timezone.utc)
    return session

def save_session(session: DocumentSession):
    session.last_accessed_at = datetime.now(timezone.utc)
    _sessions[session.doc_id] = session

def delete_session(doc_id: str):
    if doc_id in _sessions:
        del _sessions[doc_id]

def cleanup_idle_sessions():
    """Remove sessions that have been idle past the TTL."""
    now = datetime.now(timezone.utc)
    ttl = timedelta(minutes=config.session_ttl_minutes)
    
    expired = [
        doc_id for doc_id, session in _sessions.items()
        if (now - session.last_accessed_at) > ttl
    ]
    
    for doc_id in expired:
        del _sessions[doc_id]
