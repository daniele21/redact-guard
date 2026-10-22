from __future__ import annotations

import importlib.util
import inspect
import unittest
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
        "expected_public_model_id": "test-public-model",
        "korgis_startup_key_matches_identity": True,
        "health": {
            "model": "test-public-model",
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


class ManagedPackageEvidenceTests(unittest.TestCase):
    def test_synthetic_pdf_is_bounded_and_synthetic(self):
        payload = module._synthetic_pdf_bytes()
        self.assertTrue(payload.startswith(b"%PDF-1.4"))
        self.assertIn(b"mario.rossi@example.test", payload)
        self.assertLess(len(payload), 4096)

    def test_managed_package_summary_accepts_complete_evidence(self):
        self.assertEqual(module.validate_summary(_valid_summary()), [])

    def test_managed_package_summary_rejects_wrong_korgis_commit(self):
        summary = _valid_summary()
        summary["package_manifest"]["source_commit"] = "d" * 40
        self.assertIn("packaged_korgis_commit_mismatch", module.validate_summary(summary))

    def test_managed_package_summary_requires_resource_evidence(self):
        summary = _valid_summary()
        summary["document"]["resources"]["evidence_requests"] = 0
        self.assertIn("no_resource_evidence_requests", module.validate_summary(summary))

    def test_public_inference_id_must_match_started_korgis_registry_identity(self):
        summary = _valid_summary()
        summary["health"]["model"] = "unrelated-fallback"
        self.assertIn("selected_model_identity_mismatch", module.validate_summary(summary))

    def test_e2e_never_requires_disabled_unauthenticated_admin_api(self):
        runner = inspect.getsource(module.run)
        self.assertNotIn('"/api/v1/resources"', runner)
        self.assertNotIn("resource_state =", runner)
        self.assertIn('"source": "document_inference_response"', runner)


if __name__ == "__main__":
    unittest.main()
