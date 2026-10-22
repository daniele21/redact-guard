"""Regression tests for local model preference and immutable per-document selection.

All identifiers are synthetic. No network calls and no model downloads.
"""
import json
import sys
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

BACKEND_DIR = Path(__file__).resolve().parents[1]
if str(BACKEND_DIR) not in sys.path:
    sys.path.insert(0, str(BACKEND_DIR))

from config import config
from services import model_selection
from services.pii_detector import detect_pii_for_page
from domain.models import PageMarkdown
from domain.detection import LLMInferenceResult


class _Response:
    def __init__(self, payload):
        self.payload = payload

    def __enter__(self):
        return self

    def __exit__(self, *_args):
        return False

    def read(self, *_args):
        return json.dumps(self.payload).encode("utf-8")


class LocalModelPreferenceTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.path = Path(self.temp.name) / "models.json"
        patcher = patch.object(model_selection, "_PREFERENCE_PATH", self.path)
        patcher.start()
        self.addCleanup(patcher.stop)

    def test_default_only_when_missing_and_selection_persists(self):
        self.assertEqual(model_selection.get_selected_model(), config.korgis_model)
        with (patch.object(model_selection, "list_resident_models", return_value=["test-a", "test-b"]),
              patch.object(model_selection, "_resident_startup_key", side_effect=lambda key: key)):
            selected = model_selection.select_resident_model("test-b")
        self.assertEqual(selected, "test-b")
        self.assertEqual(model_selection.get_selected_model(), "test-b")
        self.assertEqual(self.path.stat().st_mode & 0o777, 0o600)
        self.assertEqual(json.loads(self.path.read_text())["model"], "test-b")

    def test_nonresident_or_invalid_cannot_replace_saved_selection(self):
        with (patch.object(model_selection, "list_resident_models", return_value=["test-a"]),
              patch.object(model_selection, "_resident_startup_key", side_effect=lambda key: key)):
            model_selection.select_resident_model("test-a")
            with self.assertRaises(model_selection.ModelPreferenceError):
                model_selection.select_resident_model("test-b")
            with self.assertRaises(model_selection.ModelPreferenceError):
                model_selection.select_resident_model("../private")
        self.assertEqual(model_selection.get_selected_model(), "test-a")

    def test_invalid_persisted_file_never_silently_reverts_to_default(self):
        self.path.write_text("{broken")
        with self.assertRaises(model_selection.ModelPreferenceError):
            model_selection.get_selected_model()

    def test_selection_api_rejects_unavailable_model_and_preserves_preference(self):
        from fastapi import HTTPException
        from api import routes_models
        with (patch.object(model_selection, "list_resident_models", return_value=["test-a"]),
              patch.object(model_selection, "_resident_startup_key", side_effect=lambda key: key)):
            with patch("api.routes_models.list_resident_models", return_value=["test-a"]):
                with self.assertRaises(HTTPException) as err:
                    routes_models.choose_local_model(
                        routes_models.ModelSelectionRequest(model="test-b")
                    )
        self.assertEqual(err.exception.status_code, 409)
        self.assertEqual(model_selection.get_selected_model(), config.korgis_model)

    def test_offline_catalog_does_not_clear_saved_selection(self):
        from api import routes_models
        with (patch.object(model_selection, "list_resident_models", return_value=["test-a"]),
              patch.object(model_selection, "_resident_startup_key", side_effect=lambda key: key)):
            model_selection.select_resident_model("test-a")
        with patch("api.routes_models.list_resident_models",
                   side_effect=model_selection.ModelCatalogUnavailable("offline")):
            catalog = routes_models.get_local_models()
        self.assertEqual(catalog.selected_model, "test-a")
        self.assertFalse(catalog.discovery_available)
        self.assertEqual(catalog.models, [])
        self.assertFalse(catalog.selected_resident)

    def test_unavailable_registry_is_not_misreported_as_empty(self):
        from api import routes_models
        with (patch("api.routes_models.list_resident_models", return_value=[]),
              patch("api.routes_models.list_catalog_models",
                    side_effect=model_selection.ModelCatalogUnavailable("legacy"))):
            response = routes_models.get_local_models()
        self.assertTrue(response.discovery_available)
        self.assertFalse(response.catalog_available)
        self.assertEqual(response.choices, [])

    def test_registered_qwen_display_does_not_require_model_residency(self):
        from api import routes_models
        choices = [
            {"model_id": "Qwen/Qwen3.5-4B", "startup_key": "qwen3.5-4b-q4km",
             "downloaded": True, "resident": False},
            {"model_id": "Qwen/Qwen3.5-9B", "startup_key": "qwen3.5-9b-q4km",
             "downloaded": False, "resident": False},
        ]
        with (patch("api.routes_models.list_resident_models", return_value=[]),
              patch("api.routes_models.list_catalog_models", return_value=choices)):
            response = routes_models.get_local_models()
        self.assertTrue(response.discovery_available)
        self.assertTrue(response.catalog_available)
        self.assertEqual([item.model_id for item in response.choices],
                         ["Qwen/Qwen3.5-4B", "Qwen/Qwen3.5-9B"])

    def test_health_uses_saved_model_and_does_not_substitute(self):
        from api import routes_health
        with (patch.object(model_selection, "list_resident_models", return_value=["test-a", "test-b"]),
              patch.object(model_selection, "_resident_startup_key", side_effect=lambda key: key)):
            model_selection.select_resident_model("test-b")
        from services.korgis_client import KorgisCompatibility
        compatibility = KorgisCompatibility(
            identity_protocol="local-llm-identity-v1",
            identity_compatible=True,
            request_evidence_supported=True,
            model_resident=False,
        )
        with patch("api.routes_health.KorgisRuntimeAdapter.compatibility",
                   return_value=compatibility) as checked:
            health = routes_health.health_check()
        self.assertEqual(checked.call_count, 1)
        self.assertEqual(health.model, "test-b")
        self.assertEqual(health.llm_status, "model_not_resident")

    def test_downloaded_qwen_can_be_selected_for_next_start_without_residency(self):
        choices = [
            {"model_id": "Qwen/Qwen3.5-4B", "startup_key": "qwen3.5-4b-q4km",
             "downloaded": True, "resident": False},
            {"model_id": "Qwen/Qwen3.5-9B", "startup_key": "qwen3.5-9b-q4km",
             "downloaded": False, "resident": False},
        ]
        with (patch.object(model_selection, "list_catalog_models", return_value=choices),
              patch.object(model_selection, "list_resident_models", return_value=["nvidia/model"])):
            self.assertEqual(
                model_selection.select_available_model("Qwen/Qwen3.5-4B"),
                "Qwen/Qwen3.5-4B",
            )
            self.assertEqual(json.loads(self.path.read_text())["startup_key"], "qwen3.5-4b-q4km")
            with self.assertRaises(model_selection.ModelPreferenceError):
                model_selection.select_available_model("Qwen/Qwen3.5-9B")
        self.assertEqual(model_selection.get_selected_model(), "Qwen/Qwen3.5-4B")

    def test_path_free_catalog_validation_rejects_malformed_entries(self):
        payload = {"protocol_version": "local-llm-catalog-v1", "models": [
            {"startup_key": "qwen3.5-4b-q4km", "model_id": "Qwen/Qwen3.5-4B",
             "downloaded": True, "resident": False, "path": "/private/model"},
            {"startup_key": "../bad", "model_id": "bad", "downloaded": True,
             "resident": True},
        ]}
        with patch("services.model_selection.urllib.request.urlopen", return_value=_Response(payload)):
            catalog = model_selection.list_catalog_models()
        self.assertEqual(catalog, [{
            "startup_key": "qwen3.5-4b-q4km", "model_id": "Qwen/Qwen3.5-4B",
            "downloaded": True, "resident": False,
        }])

    def test_duplicate_public_model_ids_never_choose_an_arbitrary_artifact(self):
        # Multiple installed quantizations may share one public inference ID.
        payload = {"protocol_version": "local-llm-catalog-v1", "models": [
            {"startup_key": "qwen4b-q4", "model_id": "Qwen/Qwen3.5-4B",
             "downloaded": True, "resident": False},
            {"startup_key": "qwen4b-q8", "model_id": "Qwen/Qwen3.5-4B",
             "downloaded": True, "resident": False},
            {"startup_key": "nemotron-key", "model_id": "nvidia/nemotron",
             "downloaded": True, "resident": False},
        ]}
        with (patch("services.model_selection.urllib.request.urlopen",
                    return_value=_Response(payload)),
              patch.object(model_selection, "list_resident_models", return_value=[])):
            catalog = model_selection.list_catalog_models()
            self.assertEqual(catalog, [{
                "startup_key": "nemotron-key", "model_id": "nvidia/nemotron",
                "downloaded": True, "resident": False,
            }])
            with self.assertRaises(model_selection.ModelPreferenceError):
                model_selection.select_available_model("Qwen/Qwen3.5-4B")
        self.assertFalse(self.path.exists())


    def test_public_model_id_maps_to_distinct_korgis_registry_key(self):
        payload = {
            "protocol_version": "local-llm-identity-v1",
            "models": {
                "local-key": {"model": {"id": "vendor/model-name"}},
                "other-key": {"model": {"id": "other-model"}},
            },
        }
        with patch.object(model_selection, "list_resident_models",
                          return_value=["vendor/model-name"]):
            with patch("services.model_selection.urllib.request.urlopen",
                       return_value=_Response(payload)):
                model_selection.select_resident_model("vendor/model-name")
        stored = json.loads(self.path.read_text())
        self.assertEqual(stored["model"], "vendor/model-name")
        self.assertEqual(stored["startup_key"], "local-key")
        self.assertEqual(model_selection.get_selected_model(), "vendor/model-name")

    def test_missing_or_ambiguous_identity_is_not_persisted(self):
        payload = {
            "protocol_version": "local-llm-identity-v1",
            "models": {
                "key-a": {"model": {"id": "same"}},
                "key-b": {"model": {"id": "same"}},
            },
        }
        with patch.object(model_selection, "list_resident_models", return_value=["same"]):
            with patch("services.model_selection.urllib.request.urlopen",
                       return_value=_Response(payload)):
                with self.assertRaises(model_selection.ModelCatalogUnavailable):
                    model_selection.select_resident_model("same")
        self.assertFalse(self.path.exists())

    def test_network_discovery_uses_only_resident_openai_ids(self):
        fake = _Response({"data": [{"id": "test-b"}, {"id": "test-a"}, {"id": "test-b"}, {"bad": "x"}]})
        with patch("services.model_selection.urllib.request.urlopen", return_value=fake):
            self.assertEqual(model_selection.list_resident_models(), ["test-a", "test-b"])

    def test_offline_discovery_is_not_an_empty_compatible_catalog(self):
        with patch("services.model_selection.urllib.request.urlopen", side_effect=OSError("offline")):
            with self.assertRaises(model_selection.ModelCatalogUnavailable):
                model_selection.list_resident_models()

    def test_hardware_identity_uses_only_public_allowlisted_evidence(self):
        payload = {
            "protocol_version": "local-llm-identity-v1",
            "models": {"key-a": {
                "model": {"id": "test-a"},
                "hardware": {
                    "system": "darwin", "machine": "arm64",
                    "logical_cpus": 10, "total_memory_bytes": None,
                    "processor": None, "private_host": "secret",
                },
            }},
        }
        with patch("services.model_selection.urllib.request.urlopen",
                   return_value=_Response(payload)):
            hardware = model_selection.get_public_hardware("test-a")
        self.assertEqual(hardware, {
            "system": "darwin", "machine": "arm64", "logical_cpus": 10,
        })
        self.assertNotIn("private_host", hardware)

    def test_identity_missing_model_never_claims_hardware_for_another_model(self):
        payload = {
            "protocol_version": "local-llm-identity-v1",
            "models": {"a": {"model": {"id": "test-a"}, "hardware": {"logical_cpus": 10}}},
        }
        with patch("services.model_selection.urllib.request.urlopen",
                   return_value=_Response(payload)):
            self.assertIsNone(model_selection.get_public_hardware("test-b"))

    def test_model_choice_changes_cache_key_and_inference_model(self):
        response = LLMInferenceResult(
            model="test-b", content='{"pii_fields":[]}', latency_ms=1, finish_reason="stop"
        )
        page = PageMarkdown(page_number=1, text="This contains no sensitive values.")
        with (
            patch("services.pii_detector.call_local_llm", return_value=response) as inference,
            patch("services.pii_detector.cache_manager.get_llm", return_value=None) as read_cache,
            patch("services.pii_detector.cache_manager.set_llm"),
        ):
            first = detect_pii_for_page(page, "general", force=False, model_key="test-a")
            second = detect_pii_for_page(page, "general", force=False, model_key="test-b")
        self.assertEqual(first.diagnostics.model, "test-a")
        self.assertEqual(second.diagnostics.model, "test-b")
        self.assertEqual(inference.call_args_list[0].kwargs["model_key"], "test-a")
        self.assertEqual(inference.call_args_list[1].kwargs["model_key"], "test-b")
        self.assertNotEqual(read_cache.call_args_list[0].args[0], read_cache.call_args_list[1].args[0])


    def test_existing_document_keeps_its_model_after_preference_changes(self):
        from datetime import datetime, timezone
        from domain.models import DocumentSession, PageAnalysisResult
        from api import routes_analyze
        now = datetime.now(timezone.utc)
        session = DocumentSession(
            doc_id="test-doc", original_filename="synthetic.pdf", file_hash="hash",
            profile_name="general", pages=[PageMarkdown(page_number=1, text="Synthetic")],
            preprocessed_pages=[], pii_results={}, redaction_overrides={},
            review_decisions={}, page_analysis_status={1: "not_started"},
            page_analysis_errors={}, page_diagnostics={},
            created_at=now, last_accessed_at=now, model_key="test-a",
        )
        with (patch.object(model_selection, "list_resident_models", return_value=["test-a", "test-b"]),
              patch.object(model_selection, "_resident_startup_key", side_effect=lambda key: key)):
            model_selection.select_resident_model("test-b")
        result = PageAnalysisResult(page_number=1, has_pii=False,
            pii_fields=[], redacted_text="Synthetic")
        with (
            patch("api.routes_analyze.get_session", return_value=session),
            patch("api.routes_analyze.save_session"),
            patch("api.routes_analyze.detect_pii_for_page", return_value=result) as detect,
        ):
            routes_analyze.analyze_page("test-doc", 1)
        self.assertEqual(model_selection.get_selected_model(), "test-b")
        self.assertEqual(detect.call_args.kwargs["model_key"], "test-a")


if __name__ == "__main__":
    unittest.main()
