from __future__ import annotations

import unittest
from pathlib import Path


class WeChatCommentF2Tests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.source = (Path(__file__).parents[1] / "app/platforms/wechat_video/session_controller.py").read_text(encoding="utf-8")

    def test_pending_should_reply_false_is_not_implicitly_processed(self):
        block = self.source[
            self.source.index("def _comment_record_is_processed"):
            self.source.index("def _log_comment_decision")
        ]
        self.assertIn("return status in self._comment_processed_reply_statuses()", block)
        self.assertNotIn("should_reply is False", block)

    def test_explicit_terminal_statuses_remain_processed(self):
        self.assertIn('"not_required"', self.source)
        self.assertIn('"sent_unconfirmed"', self.source)
        self.assertIn('"manual_sent"', self.source)

    def test_candidate_content_is_logged(self):
        self.assertIn("视频号评论识别到待判断评论", self.source)
        self.assertIn("'content': normalize_text(candidate_target.get('commentContent'), 220)", self.source)
        self.assertIn("'candidateReason':", self.source)

    def test_every_early_exit_has_visible_reason(self):
        self.assertIn("视频号评论候选字段不完整，无法处理", self.source)
        self.assertIn("视频号评论已在本次运行中完成处理，跳过重复工作流", self.source)
        self.assertIn("视频号评论等待技术重试", self.source)
        self.assertIn("视频号评论已存在明确完成记录，跳过工作流", self.source)

    def test_workflow_and_send_are_visible(self):
        self.assertIn("视频号评论工作流调用开始", self.source)
        self.assertIn("视频号评论工作流判断完成", self.source)
        self.assertIn("视频号评论后端判定无需回复", self.source)
        self.assertIn("视频号评论准备调用平台回复接口", self.source)
        self.assertIn("视频号评论回复完成", self.source)

    def test_cycle_summary_is_visible(self):
        self.assertIn("视频号评论本轮处理汇总", self.source)
        self.assertIn("structuralTargets", self.source)
        self.assertIn("handled", self.source)


if __name__ == "__main__":
    unittest.main()
