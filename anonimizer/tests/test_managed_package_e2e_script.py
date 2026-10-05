from __future__ import annotations

import importlib.util
from pathlib import Path


ROOT = Path(__file__).resolve().parents[2]
SCRIPT = ROOT / "scripts" / "run-managed-package-e2e.py"
SPEC = importlib.util.spec_from_file_location(
    "run_managed_package_e2e",
    SCRIPT,
)
assert SPEC is not None and SPEC.loader is not None
module = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(module)


def _valid_summary():
    return {
        "redactguard_source_commit": "a" * 40,
        "expected_korgis_commit": "b" * 40,
        "package_manifest": {
            "source_commit": "b" * 40,
            "wheel_sha256": "c" * 64,
        },
        "hardware": {
            "system": "Darwin",
        },
        "health": {
            "llm_status": "online",
            "korgis_mode": "managed",
            "korgis_request_evidence_supported": True,
        },
        "document": {
            "analysis_status": "complete",
            "local_processing": True,
            "resources": {
                "inference_requests": 1,
                "evidence_requests": 1,
                "average_cpu_percent": 50.0,
                "memory_sources": [
                    "ps_process_tree_rss_excluding_sampler"
                ],
                "cpu_sources": [
                    "ps_process_tree_cpu_time_delta_excluding_sampler"
                ],
                "attribution_qualities": [
                    "process_global"
                ],
            },
        },
        "cleanup": {
            "api": {
                "hard_kill_required": False,
            },
            "korgis": {
                "hard_kill_required": False,
            },
        },
    }


def test_synthetic_pdf_is_bounded_and_synthetic():
    payload = module._synthetic_pdf_bytes()

    assert payload.startswith(b"%PDF-1.4")
    assert b"mario.rossi@example.test" in payload
    assert len(payload) < 4096


def test_managed_package_summary_accepts_complete_evidence():
    assert module.validate_summary(
        _valid_summary()
    ) == []


def test_managed_package_summary_rejects_wrong_korgis_commit():
    summary = _valid_summary()
    summary["package_manifest"][
        "source_commit"
    ] = "d" * 40

    assert (
        "packaged_korgis_commit_mismatch"
        in module.validate_summary(summary)
    )


def test_managed_package_summary_requires_resource_evidence():
    summary = _valid_summary()
    summary["document"]["resources"][
        "evidence_requests"
    ] = 0

    assert (
        "no_resource_evidence_requests"
        in module.validate_summary(summary)
    )
