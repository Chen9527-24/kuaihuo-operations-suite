from __future__ import annotations

from pathlib import Path
import unittest


ROOT = Path(__file__).resolve().parents[1]


class StageCIntegrationTests(unittest.TestCase):
    def test_recording_mixin_is_in_real_runtime_bundle(self) -> None:
        text = (ROOT / "app/platforms/douyin/dm/runtime/runtime_bundle.py").read_text(encoding="utf-8")
        self.assertIn("SessionControllerDMRecordMixin", text)
        self.assertIn("SessionControllerDMMixin", text)

    def test_snapshot_runs_after_send_confirmation_and_before_queue(self) -> None:
        text = (ROOT / "app/platforms/douyin/dm/runtime/warmup_gate.py").read_text(encoding="utf-8")
        confirm = text.index("self._confirm_dm_reply_send(result)")
        record = text.index("self._dm_record_snapshot(result)")
        drive = text.index("self._drive_dm_queue(result)")
        self.assertLess(confirm, record)
        self.assertLess(record, drive)

    def test_dom_record_fields_do_not_replace_reply_fields(self) -> None:
        text = (ROOT / "app/platforms/douyin/common/js_scripts.py").read_text(encoding="utf-8")
        self.assertIn("recordMessageType", text)
        self.assertIn("recordPlaceholder", text)
        self.assertIn("recordClassificationSource", text)
        self.assertIn("latestIncomingText: latestIncomingMessageText", text)
        self.assertIn("recordMeta = classifyRecordMessage", text)
        self.assertIn("const explicitTextNode", text)
        self.assertIn("const explicitRecordText", text)
        self.assertIn("messageType === 'text' ? text : safeExplicitMessageText", text)

    def test_analysis_and_send_hooks_are_present(self) -> None:
        draft = (ROOT / "app/platforms/douyin/dm/draft/draft_runtime.py").read_text(encoding="utf-8")
        aggregate = (ROOT / "app/platforms/douyin/dm/aggregate/aggregate_runtime.py").read_text(encoding="utf-8")
        send = (ROOT / "app/platforms/douyin/dm/send/send_runtime.py").read_text(encoding="utf-8")
        self.assertIn("_dm_record_analysis_started", draft)
        self.assertIn("_dm_record_analysis_result", aggregate)
        self.assertIn('status="send_pending"', send)
        self.assertIn('status="send_unconfirmed"', send)
        self.assertIn('status="sent"', send)

    def test_cursor_uses_safe_fingerprint_keys_not_token_keys(self) -> None:
        text = (ROOT / "app/platforms/douyin/dm/recording/record_runtime.py").read_text(encoding="utf-8")
        self.assertIn('"fingerprint": bubble["token"]', text)
        self.assertIn("pendingWindowFingerprints", text)
        self.assertNotIn('"pendingNoOverlapTokens"', text)


if __name__ == "__main__":
    unittest.main()
