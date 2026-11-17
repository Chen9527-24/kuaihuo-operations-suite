from __future__ import annotations

from pathlib import Path
import unittest

ROOT = Path(__file__).resolve().parents[1]
REPLY_EDITOR = ROOT / "app/platforms/douyin/comment/reply/reply_editor.py"
COMMENT_SCRIPTS = ROOT / "app/platforms/douyin/comment/scripts/comment_scripts.py"


class CommentPreciseDomReplyD7Tests(unittest.TestCase):
    @classmethod
    def setUpClass(cls) -> None:
        cls.reply_source = REPLY_EDITOR.read_text(encoding="utf-8")
        cls.script_source = COMMENT_SCRIPTS.read_text(encoding="utf-8")

    def test_inspection_registers_exact_reply_dom_nodes(self) -> None:
        self.assertIn("window.__ucpCommentReplyRegistry", self.script_source)
        self.assertIn("data-ucp-reply-label-key", self.script_source)
        self.assertIn("data-ucp-reply-action-key", self.script_source)
        self.assertIn("registerReplyDom(topMessage.replyDomKey", self.script_source)
        self.assertIn("item.replyDomKey = makeReplyDomKey", self.script_source)

    def test_candidate_identity_carries_dom_key_through_python(self) -> None:
        self.assertIn("replyDomKey: target.replyDomKey ||", self.script_source)
        self.assertIn('"replyDomKey": self._comment_normalize_text', self.reply_source)
        self.assertIn('reply_dom_key=str((target or {}).get("replyDomKey"', self.reply_source)

    def test_opening_uses_registered_or_fresh_exact_dom_only(self) -> None:
        self.assertIn("registryEntryValid", self.script_source)
        self.assertIn("inspect_registry_exact_label", self.script_source)
        self.assertIn("reacquired_exact_label", self.script_source)
        self.assertIn("pointer_mouse_single_click", self.script_source)
        self.assertIn("pointerdown", self.script_source)
        self.assertIn("mouseup", self.script_source)
        self.assertIn("precise_reply_dom_missing", self.script_source)

    def test_top_and_nested_share_precise_dom_ladder(self) -> None:
        start = self.reply_source.index("def _comment_reply_open_methods")
        end = self.reply_source.index("def _comment_perform_qt_view_reply_click", start)
        block = self.reply_source[start:end]
        self.assertIn('"precise_dom_registered_click"', block)
        self.assertIn('"precise_dom_reacquire_click"', block)
        self.assertIn('"qt_view_mouse_click"', block)
        self.assertNotIn('"element_from_point_sequence"', block)
        self.assertNotIn('"hover_then_native_click"', block)
        self.assertNotIn('"operations_delegate_click"', block)

    def test_each_click_gets_observation_window_before_retry(self) -> None:
        self.assertIn("def _comment_reply_open_method_observe_ms", self.reply_source)
        self.assertIn("return 5200", self.reply_source)
        self.assertIn("return 4600", self.reply_source)
        self.assertIn("return 3800", self.reply_source)
        self.assertIn("method_elapsed_ms >= observe_ms", self.reply_source)
        self.assertNotIn("elapsed_ms >= 1400", self.reply_source)

    def test_operations_are_scoped_to_current_comment_card(self) -> None:
        self.assertIn("const findOwnOperations = (card)", self.script_source)
        self.assertIn("el.closest('.container-sXKyMs') === card", self.script_source)
        self.assertIn("safeReplyText", self.script_source)
        self.assertIn("delete_dialog_cancelled", self.script_source)


if __name__ == "__main__":
    unittest.main()
