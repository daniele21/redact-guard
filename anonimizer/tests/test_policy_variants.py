"""Profile-scoped policy variant and immutable-analysis regression checks."""
import sys
import tempfile
import unittest
from datetime import datetime, timezone
from pathlib import Path
from unittest.mock import patch

BACKEND_DIR = Path(__file__).resolve().parents[1]
if str(BACKEND_DIR) not in sys.path:
    sys.path.insert(0, str(BACKEND_DIR))

from domain.models import DocumentSession, PageMarkdown, PageAnalysisResult
from services import profile_service
from services.prompt_builder import build_system_prompt
from api import routes_analyze


class ScopedPolicyVariantsTests(unittest.TestCase):
    def setUp(self):
        temp = tempfile.TemporaryDirectory()
        self.addCleanup(temp.cleanup)
        directory = Path(temp.name)
        self.variant_file = directory / "pii-variants.json"
        self.custom_file = directory / "custom_pii_types.json"
        for name, path in [
            ("_SCOPED_VARIANTS_FILE", self.variant_file),
            ("_CUSTOM_TYPES_FILE", self.custom_file),
        ]:
            patcher = patch.object(profile_service, name, path)
            patcher.start()
            self.addCleanup(patcher.stop)

    def test_builtin_retained_and_general_override_does_not_change_legal(self):
        original_general = {t.name: t for t in profile_service.get_all_pii_types("general")}
        original_legal = {t.name: t for t in profile_service.get_all_pii_types("legal")}
        self.assertIn("private_person", original_general)
        profile_service.save_profile_variant(
            "general", "private_person",
            "Detect individual employee names in the synthetic example.",
        )
        changed = {t.name: t for t in profile_service.get_all_pii_types("general")}
        self.assertIn("employee names", changed["private_person"].description)
        unchanged = {t.name: t for t in profile_service.get_all_pii_types("legal")}
        self.assertEqual(unchanged, original_legal)
        self.assertEqual(profile_service.load_profile("general").pii_types[0].description,
                         original_general["private_person"].description)

    def test_revisions_append_and_restore_non_destructively(self):
        profile_service.save_profile_variant("general", "private_email", "A local email.", label="E-mail")
        profile_service.save_profile_variant("general", "private_email", "A revised local email.", label="E-mail")
        detail = profile_service.get_policy_detail("general")
        self.assertEqual(len(detail["history"]["private_email"]), 2)
        self.assertEqual(detail["history"]["private_email"][-1]["revision"], 2)

        profile_service.revert_profile_variant("general", "private_email", 1)
        reverted = {t.name: t for t in profile_service.get_all_pii_types("general")}
        self.assertEqual(reverted["private_email"].description, "A local email.")
        self.assertEqual(len(profile_service.get_policy_detail("general")["history"]["private_email"]), 3)

        profile_service.restore_profile_variant("general", "private_email")
        restored = {t.name: t for t in profile_service.get_all_pii_types("general")}
        self.assertEqual(restored["private_email"].description,
                         next(t.description for t in profile_service.load_profile("general").pii_types if t.name == "private_email"))
        self.assertEqual(len(profile_service.get_policy_detail("general")["history"]["private_email"]), 4)

    def test_custom_scoped_type_only_appears_in_its_profile(self):
        profile_service.save_profile_variant(
            "general", "employee_id", "Internal employee identifiers, e.g. EMP-10482.",
        )
        self.assertIn("employee_id", {t.name for t in profile_service.get_all_pii_types("general")})
        self.assertNotIn("employee_id", {t.name for t in profile_service.get_all_pii_types("legal")})
        profile_service.restore_profile_variant("general", "employee_id")
        self.assertNotIn("employee_id", {t.name for t in profile_service.get_all_pii_types("general")})

    def test_legacy_globals_remain_available_after_scoped_edit(self):
        profile_service.add_custom_type("legacy_code", "Old global custom definition.")
        self.assertIn("legacy_code", {t.name for t in profile_service.get_all_pii_types("legal")})
        profile_service.save_profile_variant("general", "legacy_code", "Scoped variation.")
        general = {t.name: t for t in profile_service.get_all_pii_types("general")}
        legal = {t.name: t for t in profile_service.get_all_pii_types("legal")}
        self.assertEqual(general["legacy_code"].description, "Scoped variation.")
        self.assertEqual(legal["legacy_code"].description, "Old global custom definition.")
        profile_service.restore_profile_variant("general", "legacy_code")
        self.assertEqual(
            {t.name: t for t in profile_service.get_all_pii_types("general")}["legacy_code"].description,
            "Old global custom definition.",
        )

    def test_corrupt_variant_store_does_not_fall_back_to_unprotected_catalog(self):
        self.variant_file.write_text("{ broken", encoding="utf-8")
        with self.assertRaises(ValueError):
            profile_service.get_all_pii_types("general")

    def test_corrupt_legacy_global_definitions_cannot_downgrade_protection(self):
        self.custom_file.write_text("{ malformed", encoding="utf-8")
        with self.assertRaises(ValueError):
            profile_service.get_all_pii_types("general")

    def test_document_analysis_uses_original_policy_snapshot_after_edit(self):
        types = profile_service.get_all_pii_types("general")
        prompt = build_system_prompt("general", types=types)
        page = PageMarkdown(page_number=1, text="Synthetic document")
        now = datetime.now(timezone.utc)
        session = DocumentSession(
            doc_id="doc", original_filename="synthetic.pdf", file_hash="hash",
            profile_name="general", pages=[page], preprocessed_pages=[page],
            pii_results={}, redaction_overrides={}, review_decisions={},
            page_analysis_status={1: "not_started"}, page_analysis_errors={},
            page_diagnostics={}, created_at=now, last_accessed_at=now,
            policy_types=types, policy_prompt=prompt, policy_digest="synthetic-hash",
        )
        profile_service.save_profile_variant(
            "general", "private_person", "A completely different definition."
        )
        self.assertNotEqual(prompt, build_system_prompt("general"))
        result = PageAnalysisResult(page_number=1, has_pii=False,
                                    pii_fields=[], redacted_text=page.text)
        with (
            patch.object(routes_analyze, "get_session", return_value=session),
            patch.object(routes_analyze, "save_session"),
            patch.object(routes_analyze, "detect_pii_for_page", return_value=result) as detection,
        ):
            routes_analyze.analyze_page("doc", 1)
        self.assertIs(detection.call_args.kwargs["policy_types"], types)
        self.assertEqual(detection.call_args.kwargs["policy_prompt"], prompt)


if __name__ == "__main__":
    unittest.main()
