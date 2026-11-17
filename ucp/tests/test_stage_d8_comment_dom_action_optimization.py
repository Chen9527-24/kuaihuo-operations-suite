from __future__ import annotations

from pathlib import Path
import unittest

ROOT = Path(__file__).resolve().parents[1]
SCRIPTS = (ROOT / "app/platforms/douyin/comment/scripts/comment_scripts.py").read_text(encoding="utf-8")
REPLY = (ROOT / "app/platforms/douyin/comment/reply/reply_editor.py").read_text(encoding="utf-8")
FILTER = (ROOT / "app/platforms/douyin/comment/filter/filter_runtime.py").read_text(encoding="utf-8")


class CommentDomActionOptimizationD8Tests(unittest.TestCase):
    def test_precise_dom_click_prefers_actual_action_module(self) -> None:
        self.assertIn("clickNode = registryEntry.replyAction || registryEntry.replyLabel", SCRIPTS)
        self.assertIn("clickNode = candidate.replyAction || candidate.replyLabel || candidate.replyBtn", SCRIPTS)
        self.assertIn("inspect_registry_exact_action", SCRIPTS)
        self.assertIn("data-ucp-reply-action-key", SCRIPTS)

    def test_modern_payload_does_not_use_broad_author_or_thread_fallback(self) -> None:
        open_start = SCRIPTS.index("def build_comment_open_reply_editor_script")
        start = SCRIPTS.index("let selectedBy = ''", open_start)
        end = SCRIPTS.index("if (!candidate || !candidate.replyBtn)", start)
        block = SCRIPTS[start:end]
        self.assertIn("reply_dom_key", block)
        self.assertIn("target_message_key", block)
        self.assertIn("thread_target_exact_unique", block)
        self.assertIn("!payload.replyDomKey && !payload.targetMessageKey", block)
        self.assertNotIn("selectedBy = 'threadKey'", block)
        self.assertNotIn("selectedBy = 'author_content'", block)
        self.assertNotIn("selectedBy = 'author_only_unique'", block)

    def test_open_attempt_counter_is_per_target(self) -> None:
        self.assertIn("def _comment_next_reply_open_attempt_no", REPLY)
        self.assertIn("comment_reply_open_attempt_identity", REPLY)
        self.assertEqual(REPLY.count("attempt_no = self._comment_next_reply_open_attempt_no(target)"), 2)
        self.assertNotIn("self.comment_reply_open_attempts += 1", REPLY)

    def test_precise_dom_activation_has_compact_diagnostics(self) -> None:
        self.assertIn("评论精准回复DOM触发完成", REPLY)
        self.assertIn('"clickSource"', REPLY)
        self.assertIn('"domRole"', REPLY)
        self.assertIn('"registryValid"', REPLY)

    def test_refresh_wait_is_idempotent(self) -> None:
        self.assertIn("comment_same_work_refresh_wait_due_ms", FILTER)
        self.assertIn("same_wait = bool", FILTER)
        self.assertIn("and cooldown_remaining > 0", FILTER)
        self.assertIn("评论页当前作品刷新等待中", FILTER)
        self.assertIn("now_ms - last_log_ms >= 30000", FILTER)


if __name__ == "__main__":
    unittest.main()
