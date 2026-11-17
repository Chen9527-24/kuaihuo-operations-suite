from __future__ import annotations

from pathlib import Path
import unittest


ROOT = Path(__file__).resolve().parents[1]


class StageC1IntegrationTests(unittest.TestCase):
    def test_dom_probe_collects_hash_only_identity_candidates(self) -> None:
        text = (ROOT / "app/platforms/douyin/common/js_scripts.py").read_text(encoding="utf-8")
        self.assertIn("const diagnosticHash", text)
        self.assertIn("collectIdentityCandidates", text)
        self.assertIn("selectedIdentityCandidates", text)
        self.assertIn("panelIdentityCandidates", text)
        self.assertIn("Raw attribute values, links and React props never leave", text)

    def test_recording_runtime_emits_c1_identity_diagnostic_without_changing_identity(self) -> None:
        text = (ROOT / "app/platforms/douyin/dm/recording/record_runtime.py").read_text(encoding="utf-8")
        self.assertIn("def _dm_record_identity_diagnostic", text)
        self.assertIn("conversation_changed_high_overlap", text)
        self.assertIn("C1私信身份诊断:", text)
        self.assertIn('def _dm_record_resolve_local_identity', text)
        self.assertIn('new_isolated_identity_insufficient_or_ambiguous_evidence', text)
        self.assertIn('self._dm_record_identity_diagnostic(result, info, bubbles)', text)


if __name__ == "__main__":
    unittest.main()
