from __future__ import annotations

from pathlib import Path
from tempfile import TemporaryDirectory
import unittest

from app.services.auto_reply_runtime import build_comment_test_payload
from app.services.local_records.service import LocalRecordService


class _Account:
    id = "robot_d4"
    platform = "DOUYIN"
    tenant_id = "tenant_d4"
    name = "抖音-测试"
    auto_reply_settings = {}


class CommentContextD4Tests(unittest.TestCase):
    def test_comment_payload_contains_bounded_context(self) -> None:
        payload = build_comment_test_payload(
            _Account(),
            "8岁呢？",
            comment_thread_id="cmtroot_001",
            context_source="local_sqlite",
            thread_context=[
                {"role": "user", "author": "A", "content": "适合小孩吗？", "level": 1},
                {"role": "account", "author": "账号", "content": "需要看具体年龄。", "level": 2},
            ],
        )
        self.assertEqual(payload["commentThreadId"], "cmtroot_001")
        self.assertEqual(payload["contextSource"], "local_sqlite")
        self.assertEqual(len(payload["threadContext"]), 2)
        self.assertEqual(payload["threadContext"][1]["role"], "account")
        self.assertEqual(payload["userInput"], "8岁呢？")

    def test_local_comment_thread_projection(self) -> None:
        with TemporaryDirectory() as temp_dir:
            service = LocalRecordService(Path(temp_dir))
            store_id = "acct_comment_context_test"
            root_id = "cmtroot_context_001"
            base = {
                "platform": "DOUYIN",
                "video_id": "video_001",
                "video_title": "测试作品",
                "root_comment_id": root_id,
                "message_type": "text",
                "collection_status": "complete_visible_thread",
                "candidate_status": "eligible",
                "analysis_status": "not_started",
                "reply_status": "not_attempted",
                "resolution_status": "observed",
            }
            rows = [
                {**base, "comment_id": root_id, "comment_level": 1, "author_display": "用户A", "sender_role": "user", "text_content": "这个适合小孩吗？"},
                {**base, "comment_id": "cmt_002", "comment_level": 2, "author_display": "账号", "sender_role": "account", "text_content": "要看具体年龄。"},
                {**base, "comment_id": "cmt_003", "comment_level": 2, "author_display": "用户A", "sender_role": "user", "text_content": "8岁呢？"},
            ]
            for index, row in enumerate(rows):
                self.assertTrue(service.submit(store_id=store_id, event_type="comment_upsert", payload=row, event_id=f"d4-{index}"))
            self.assertTrue(service.flush(timeout=2.0))
            result = service.recent_comment_messages(store_id, root_id, limit=10)
            service.close(timeout=2.0)

        self.assertEqual([item["comment_id"] for item in result], [root_id, "cmt_002", "cmt_003"])
        self.assertEqual(result[0]["sender_role"], "user")
        self.assertEqual(result[1]["sender_role"], "account")
        self.assertEqual(result[2]["text_content"], "8岁呢？")


if __name__ == "__main__":
    unittest.main()
