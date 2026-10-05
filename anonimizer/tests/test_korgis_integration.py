import json
import sys
import unittest
from pathlib import Path
from unittest.mock import patch

BACKEND_DIR = Path(__file__).resolve().parents[1]
if str(BACKEND_DIR) not in sys.path:
    sys.path.insert(0, str(BACKEND_DIR))

from config import config
from services.pii_detector import call_local_llm
from services.korgis_client import KorgisCompatibility, KorgisRuntimeAdapter
from api import routes_health


class FakeResponse:
    def __init__(self, payload):
        self.payload = payload

    def __enter__(self):
        return self

    def __exit__(self, exc_type, exc, tb):
        return False

    def read(self):
        return json.dumps(self.payload).encode("utf-8")


class KorgisInferenceContractTests(unittest.TestCase):
    def test_inference_uses_korgis_openai_boundary_and_json_contract(self):
        response = FakeResponse(
            {
                "choices": [{"message": {"content": '{"pii_fields":[]}'}}],
                "usage": {"prompt_tokens": 10, "completion_tokens": 4},
                "korgis": {
                    "evidence_version": "korgis-request-evidence-v1",
                    "request_id": "req-test",
                    "execution_source": "inference",
                    "resources": {
                        "snapshot_id": "resource-test",
                        "memory": {
                            "baseline_bytes": 100,
                            "peak_bytes": 150,
                            "end_bytes": 120,
                            "peak_delta_bytes": 50,
                        },
                        "cpu": {
                            "average_percent": 125.0,
                            "peak_percent": 200.0,
                        },
                        "sampling": {
                            "interval_ms": 100,
                            "sample_count": 3,
                            "errors": 0,
                        },
                        "attribution": {
                            "scope": "korgis_process_tree",
                            "quality": "process_global",
                        },
                    },
                },
            }
        )
        with patch(
            "services.korgis_client.urllib.request.urlopen",
            return_value=response,
        ) as mocked:
            result = call_local_llm("system prompt", "document text")

        self.assertEqual(result.content, '{"pii_fields":[]}')
        self.assertEqual(result.input_tokens, 10)
        self.assertEqual(result.output_tokens, 4)
        self.assertIsNotNone(result.korgis_evidence)
        self.assertEqual(result.korgis_evidence.request_id, "req-test")
        self.assertEqual(result.korgis_evidence.execution_source, "inference")
        self.assertEqual(result.korgis_evidence.resources.memory.peak_bytes, 150)
        self.assertEqual(result.korgis_evidence.resources.cpu.peak_percent, 200.0)
        request = mocked.call_args.args[0]
        self.assertEqual(request.full_url, config.llm_endpoint)

        payload = json.loads(request.data.decode("utf-8"))
        self.assertEqual(payload["model"], config.korgis_model)
        self.assertEqual(payload["response_format"], {"type": "json_object"})
        self.assertFalse(payload["enable_thinking"])
        self.assertFalse(payload["show_thinking"])
        self.assertEqual(payload["temperature"], 0.0)


class KorgisHealthContractTests(unittest.TestCase):
    def test_health_reports_online_when_configured_model_is_resident(self):
        compatibility = KorgisCompatibility(
            identity_protocol="local-llm-identity-v1",
            identity_compatible=True,
            request_evidence_supported=True,
            model_resident=True,
        )
        with patch(
            "api.routes_health.KorgisRuntimeAdapter.compatibility",
            return_value=compatibility,
        ):
            health = routes_health.health_check()

        self.assertEqual(health.llm_status, "online")
        self.assertEqual(health.model, config.korgis_model)
        self.assertEqual(
            health.korgis_protocol_version,
            "local-llm-identity-v1",
        )
        self.assertEqual(health.korgis_compatibility, "compatible")
        self.assertTrue(health.korgis_request_evidence_supported)
        self.assertEqual(health.korgis_mode, config.korgis_mode)

    def test_health_distinguishes_unreachable_korgis(self):
        with patch(
            "api.routes_health.KorgisRuntimeAdapter.compatibility",
            side_effect=OSError("offline"),
        ):
            health = routes_health.health_check()
        self.assertEqual(health.llm_status, "offline")
        self.assertIsNone(health.korgis_compatibility)




if __name__ == "__main__":
    unittest.main()


class KorgisRuntimeAdapterTests(unittest.TestCase):
    def test_runtime_adapter_keeps_public_and_admin_urls_separate(self):
        adapter = KorgisRuntimeAdapter(
            base_url="http://127.0.0.1:1235/v1",
            model="demo",
            timeout=2,
        )
        payloads = [
            {"ok": True},
            {"data": []},
            {"protocol_version": "local-llm-identity-v1"},
            {"state": "ready"},
            {"enabled": True},
        ]
        with patch(
            "services.korgis_client.urllib.request.urlopen",
            side_effect=[FakeResponse(item) for item in payloads],
        ) as mocked:
            adapter.health()
            adapter.models()
            adapter.identity()
            adapter.status()
            adapter.resources()

        urls = [call.args[0].full_url for call in mocked.call_args_list]
        self.assertEqual(
            urls,
            [
                "http://127.0.0.1:1235/health",
                "http://127.0.0.1:1235/v1/models",
                "http://127.0.0.1:1235/v1/runtime/identity",
                "http://127.0.0.1:1235/status",
                "http://127.0.0.1:1235/api/v1/resources",
            ],
        )

    def test_unknown_optional_evidence_version_does_not_break_pii_result(self):
        response = FakeResponse(
            {
                "choices": [{"message": {"content": '{"pii_fields":[]}'}}],
                "korgis": {
                    "evidence_version": "future-version",
                    "resources": {"memory": {"peak_bytes": "not-a-number"}},
                },
            }
        )
        with patch(
            "services.korgis_client.urllib.request.urlopen",
            return_value=response,
        ):
            result = call_local_llm("system prompt", "document text")

        self.assertIsNone(result.korgis_evidence)
