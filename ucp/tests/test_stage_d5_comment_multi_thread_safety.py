from __future__ import annotations

from pathlib import Path
import unittest

ROOT = Path(__file__).resolve().parents[1]
REPLY_EDITOR = ROOT / "app/platforms/douyin/comment/reply/reply_editor.py"
COMMENT_SCRIPTS = ROOT / "app/platforms/douyin/comment/scripts/comment_scripts.py"
FILTER_RUNTIME = ROOT / "app/platforms/douyin/comment/filter/filter_runtime.py"


class CommentMultiThreadSafetyD5Tests(unittest.TestCase):
    @classmethod
    def setUpClass(cls) -> None:
        cls.reply_source = REPLY_EDITOR.read_text(encoding="utf-8")
        cls.script_source = COMMENT_SCRIPTS.read_text(encoding="utf-8")
        cls.filter_source = FILTER_RUNTIME.read_text(encoding="utf-8")

    def test_top_level_methods_never_delegate_to_operations_container(self) -> None:
        method_start = self.reply_source.index("def _comment_reply_open_methods")
        method_end = self.reply_source.index("def _comment_perform_qt_view_reply_click", method_start)
        block = self.reply_source[method_start:method_end]
        self.assertNotIn('"operations_delegate_click"', block)
        self.assertIn('"precise_dom_registered_click"', block)
        self.assertIn('"precise_dom_reacquire_click"', block)
        self.assertNotIn('"element_from_point_sequence"', block)

    def test_open_script_rejects_destructive_actions_and_resolves_one_action(self) -> None:
        self.assertIn("safeReplyText", self.script_source)
        self.assertIn("unsafe_reply_button_rejected", self.script_source)
        self.assertIn("unsafe_operations_delegate_click_disabled", self.script_source)
        self.assertIn("delete_dialog_cancelled", self.script_source)
        self.assertIn("safeReplyAction", self.script_source)
        self.assertIn("const clickTarget = node;", self.script_source)
        self.assertNotIn("click the operation container itself", self.script_source)

    def test_layout_settle_gate_exists_after_expanding_any_thread(self) -> None:
        self.assertIn("comment_reply_expand_settle_until_ms", self.filter_source)
        self.assertIn("评论折叠回复展开后等待布局稳定", self.filter_source)
        self.assertIn("+ 2200", self.filter_source)

    def test_qt_click_requires_safe_reply_target_and_rejects_destructive_point(self) -> None:
        self.assertIn('safe_target_text = bool(re.fullmatch', self.reply_source)
        self.assertIn('point_destructive = bool(re.search', self.reply_source)
        self.assertIn("safeReplyAction", self.reply_source)
        self.assertIn("拒绝不安全的 Qt 回复点击", self.reply_source)


if __name__ == "__main__":
    unittest.main()
