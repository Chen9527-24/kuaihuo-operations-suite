from __future__ import annotations

from pathlib import Path
import json
import unittest

ROOT = Path(__file__).resolve().parents[1]
EDITOR = (ROOT / "app/platforms/douyin/comment/reply/reply_editor.py").read_text(encoding="utf-8")
SCRIPTS = (ROOT / "app/platforms/douyin/comment/scripts/comment_scripts.py").read_text(encoding="utf-8")
FILTER = (ROOT / "app/platforms/douyin/comment/filter/filter_runtime.py").read_text(encoding="utf-8")
DRAFT = (ROOT / "app/platforms/douyin/comment/reply/draft_probe.py").read_text(encoding="utf-8")
PROMPT = (ROOT / "app/services/comment_reply/prompting.py").read_text(encoding="utf-8")
CONFIG = json.loads((ROOT / "data/platforms/douyin/comment.json").read_text(encoding="utf-8"))


class CommentStabilityD10Tests(unittest.TestCase):
    def test_pre_generated_ready_target_does_not_reset_open_transaction(self) -> None:
        start = EDITOR.index("def _comment_open_ready_preopen_reply_editor")
        end = EDITOR.index("def _comment_waiting_preopen_generation", start)
        block = EDITOR[start:end]
        self.assertIn("comment_pending_reply_target", block)
        self.assertIn("preopen_ready_hold_existing_open_transaction", block)
        self.assertIn("return True", block)

    def test_visible_unmatched_editor_is_rebound_before_next_click(self) -> None:
        self.assertIn("def _comment_probe_pending_reply_editor_binding", EDITOR)
        confirm_start = EDITOR.index("def _maybe_confirm_comment_reply_editor")
        confirm_end = len(EDITOR)
        confirm_block = EDITOR[confirm_start:confirm_end]
        probe_pos = confirm_block.index("_comment_probe_pending_reply_editor_binding")
        retry_pos = confirm_block.index("_comment_retry_open_reply_editor_with_next_method")
        self.assertLess(probe_pos, retry_pos)
        self.assertIn("active_transaction_global_editor", SCRIPTS)
        self.assertIn("globalMatches.length === 1", SCRIPTS)
        self.assertIn("transactionOpenedFromEmpty", SCRIPTS)
        self.assertIn("Number(txn.beforeEditorCount || 0) === 0", SCRIPTS)
        self.assertIn("Date.now() - Number(txn.clickedAt || 0) <= 30000", SCRIPTS)

    def test_strict_snapshot_is_required_after_editor_rebind(self) -> None:
        self.assertIn("if isinstance(match, dict) and match", EDITOR)
        self.assertIn("strict pre-send counts remain valid", EDITOR)

    def test_refresh_wait_marker_survives_temporary_refresh_block(self) -> None:
        start = FILTER.index("def _comment_maybe_refresh_after_full_cycle_cooldown")
        end = FILTER.index("def _comment_enter_runtime_cooldown", start)
        block = FILTER[start:end]
        self.assertNotIn("comment_same_work_refresh_due_after_cooldown = False", block)
        self.assertIn("comment_same_work_refresh_wait_due_ms", block)
        self.assertIn("comment_same_work_refresh_wait_work_key", FILTER)
        self.assertIn("existing_work_key == work_key", FILTER)
        self.assertIn("_comment_trigger_same_work_refresh", block)

    def test_send_button_is_polled_before_second_native_nudge(self) -> None:
        self.assertIn("def _comment_send_enable_poll_attempts", DRAFT)
        self.assertIn("sendButtonPollCount", DRAFT)
        disabled_start = DRAFT.index('if isinstance(payload, dict) and state == "send_button_disabled"')
        disabled_end = DRAFT.index("retryable_states", disabled_start)
        block = DRAFT[disabled_start:disabled_end]
        self.assertLess(block.index("_run_comment_send_reply_script"), block.index("_comment_focus_then_native_nudge_send"))
        self.assertEqual(CONFIG["send"]["enable_poll_attempts"], 3)
        self.assertEqual(CONFIG["send"]["enable_poll_interval_ms"], 360)

    def test_send_logs_transaction_editor_resolution(self) -> None:
        self.assertIn('"resolvedBy": result.get("resolvedBy", "")', DRAFT)
        self.assertIn('"transactionId": result.get("transactionId", "")', DRAFT)
        self.assertIn('"editorDomKey": result.get("editorDomKey", "")', DRAFT)
        self.assertIn("editorDomKey: txnMatches ? (txn.editorDomKey || '') : ''", SCRIPTS)

    def test_local_comment_prompt_uses_account_owner_factual_boundary(self) -> None:
        self.assertIn("作品发布账号本人或账号运营者", PROMPT)
        self.assertIn("事实边界", PROMPT)
        self.assertIn("后续回复的确定程度不能高于已有上下文", PROMPT)


if __name__ == "__main__":
    unittest.main()
