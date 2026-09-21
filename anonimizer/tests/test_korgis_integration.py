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
            {"choices": [{"message": {"content": '{"pii_fields":[]}'}}]}
        )
        with patch(
            "services.pii_detector.urllib.request.urlopen",
            return_value=response,
        ) as mocked:
            content = call_local_llm("system prompt", "document text")

        self.assertEqual(content, '{"pii_fields":[]}')
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
        def fake_get(url, timeout=2.0):
            if url.endswith("/models"):
                return {"data": [{"id": config.korgis_model}]}
            if url.endswith("/runtime/identity"):
                return {
                    "protocol_version": "local-llm-identity-v1",
                    "models": {config.korgis_model: {"model_id": "test"}},
                }
            raise AssertionError(url)

        with patch("api.routes_health._get_json", side_effect=fake_get):
            health = routes_health.health_check()

        self.assertEqual(health.llm_status, "online")
        self.assertEqual(health.model, config.korgis_model)
        self.assertEqual(
            health.korgis_protocol_version,
            "local-llm-identity-v1",
        )

    def test_health_distinguishes_unreachable_korgis(self):
        with patch("api.routes_health._get_json", side_effect=OSError("offline")):
            health = routes_health.health_check()
        self.assertEqual(health.llm_status, "offline")


if __name__ == "__main__":
    unittest.main()
