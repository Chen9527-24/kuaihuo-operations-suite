from __future__ import annotations

from pathlib import Path
import unittest

ROOT = Path(__file__).resolve().parents[1]
REPLY_EDITOR = ROOT / "app/platforms/douyin/comment/reply/reply_editor.py"
COMMENT_SCRIPTS = ROOT / "app/platforms/douyin/comment/scripts/comment_scripts.py"
FILTER_RUNTIME = ROOT / "app/platforms/douyin/comment/filter/filter_runtime.py"


class CommentMultiCandidateReplyD6Tests(unittest.TestCase):
    @classmethod
    def setUpClass(cls) -> None:
        cls.reply_source = REPLY_EDITOR.read_text(encoding="utf-8")
        cls.script_source = COMMENT_SCRIPTS.read_text(encoding="utf-8")
        cls.filter_source = FILTER_RUNTIME.read_text(encoding="utf-8")

    def test_actionable_candidate_is_processed_before_unrelated_expansion(self) -> None:
        self.assertIn('actionable = result.get("replyCandidates", []) or []', self.filter_source)
        self.assertIn('评论页已有可处理候选，暂不展开其他历史线程', self.filter_source)
        marker = self.filter_source.index('actionable = result.get("replyCandidates", []) or []')
        expansion = self.filter_source.index('candidates: list[dict[str, Any]] = []', marker)
        self.assertLess(marker, expansion)

    def test_target_level_candidate_path_checks_open_cooldown(self) -> None:
        start = self.reply_source.index('def _comment_skip_reason_for_target')
        end = self.reply_source.index('def _comment_skip_reason(', start)
        block = self.reply_source[start:end]
        self.assertIn('comment_reply_open_cooldowns', block)
        self.assertIn('return "reply_open_cooling"', block)
        self.assertIn('_comment_reply_open_cooldown_key', block)

    def test_js_clicks_individual_safe_action_not_shared_wrapper(self) -> None:
        self.assertIn('safeReplyText', self.script_source)
        self.assertIn('/^回复(?:\\s*[（(]?\\d+[）)]?)?$/', self.script_source)
        self.assertIn('const clickTarget = node;', self.script_source)
        self.assertIn('unsafe_operations_delegate_click_disabled', self.script_source)
        self.assertNotIn("const clickTarget = node.closest('button,[role=\"button\"],.item-M3fSkJ,[class*=\"item-\"]') || node;", self.script_source)

    def test_top_level_click_ladder_includes_exact_dom_action(self) -> None:
        start = self.reply_source.index('def _comment_reply_open_methods')
        end = self.reply_source.index('def _comment_perform_qt_view_reply_click', start)
        block = self.reply_source[start:end]
        self.assertIn('"precise_dom_registered_click"', block)
        self.assertIn('"precise_dom_reacquire_click"', block)
        self.assertIn('"qt_view_mouse_click"', block)
        self.assertNotIn('"element_from_point_sequence"', block)
        self.assertNotIn('"operations_delegate_click"', block)

    def test_qt_guard_allows_inner_label_but_rejects_destructive_point(self) -> None:
        self.assertIn('safe_target_text = bool(re.fullmatch', self.reply_source)
        self.assertIn('point_destructive = bool(re.search', self.reply_source)
        self.assertIn('not inside_target or point_destructive', self.reply_source)
        self.assertNotIn('point_text != "回复"', self.reply_source)


if __name__ == "__main__":
    unittest.main()
