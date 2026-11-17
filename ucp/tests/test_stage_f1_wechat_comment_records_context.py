from __future__ import annotations

import time
import unittest
from pathlib import Path
from types import SimpleNamespace

from app.platforms.wechat_video.comment.recording_runtime import WeChatVideoCommentRecordingRuntime


class FakeRecordService:
    state = "RUNNING"
    client_id = "ucp-test-client"

    def __init__(self) -> None:
        self.events: list[dict] = []
        self.context_rows: list[dict] = []

    def store_id_for(self, _account):
        return "acct_wechat_comment_test"

    def submit(self, *, store_id, event_type, payload, event_id):
        self.events.append({"store_id": store_id, "event_type": event_type, "payload": dict(payload), "event_id": event_id})
        return True

    def recent_comment_messages(self, _store_id, _root_comment_id, *, limit=10):
        return list(self.context_rows)[-limit:]


class FakeCore:
    def __init__(self) -> None:
        self.payloads: list[dict] = []

    def sync_comment_records(self, payload):
        self.payloads.append(payload)
        return {"syncedCount": len(payload.get("comments") or [])}


class FakeOwner:
    def __init__(self) -> None:
        self.record_service = FakeRecordService()
        self.core_service = FakeCore()
        self.account = SimpleNamespace(id="robot_wx_comment", auth_name="视频号账号", robot_name="视频号账号", name="视频号账号")
        self.logs: list[tuple[str, str]] = []

    def _log(self, level, message):
        self.logs.append((level, message))


def root_thread():
    return {
        "commentId": "root_001",
        "username": "fv_user_1",
        "nickname": "用户甲",
        "commentContent": "这个地方在哪里呀",
        "commentCreatetime": 1770000000,
        "levelTwoComment": [
            {"commentId": "reply_001", "username": "finder_self", "nickname": "账号", "commentContent": "是在海边这块拍的", "commentCreatetime": 1770000010},
            {"commentId": "reply_002", "username": "fv_user_1", "nickname": "用户甲", "commentContent": "那带孩子去方便吗", "commentCreatetime": 1770000020},
            {"commentId": "reply_003", "username": "finder_self", "nickname": "账号", "commentContent": "白天过去会方便些", "commentCreatetime": 1770000030},
            {"commentId": "reply_004", "username": "fv_user_1", "nickname": "用户甲", "commentContent": "停车的位置远不远", "commentCreatetime": 1770000040},
        ],
    }


class WeChatCommentF1Tests(unittest.TestCase):
    def setUp(self):
        self.owner = FakeOwner()
        self.runtime = WeChatVideoCommentRecordingRuntime(self.owner)
        self.post = {"exportId": "export_001", "description": "海边散步的视频"}

    def tearDown(self):
        self.runtime.close()

    def wait_remote(self):
        future = self.runtime._state.get("future")
        if future is not None:
            future.result(timeout=3)
        time.sleep(0.05)
        self.runtime._collect_remote()

    def test_observe_writes_complete_thread_locally(self):
        root = root_thread()
        self.runtime.observe_post_comments(self.post, [root], "finder_self")
        comment_events = [item for item in self.owner.record_service.events if item["event_type"] == "comment_upsert"]
        self.assertEqual(len(comment_events), 5)
        self.assertEqual(comment_events[0]["payload"]["root_comment_id"], "wxvcmt_root_001")
        self.assertEqual(comment_events[-1]["payload"]["comment_level"], 2)

    def test_observe_syncs_platform_and_thread_ids(self):
        self.runtime.observe_post_comments(self.post, [root_thread()], "finder_self")
        self.wait_remote()
        self.assertTrue(self.owner.core_service.payloads)
        payload = self.owner.core_service.payloads[0]
        self.assertEqual(payload["platform"], "WECHAT_VIDEO")
        self.assertEqual(payload["comments"][0]["rootRecordId"], "wxvcmt_root_001")
        self.assertEqual(payload["comments"][1]["senderRole"], "account")

    def test_same_text_with_different_platform_ids_is_preserved(self):
        root = root_thread()
        root["levelTwoComment"] = [
            {"commentId": "a", "username": "fv_user_1", "commentContent": "在吗", "commentCreatetime": 1},
            {"commentId": "b", "username": "fv_user_1", "commentContent": "在吗", "commentCreatetime": 2},
        ]
        self.runtime.observe_post_comments(self.post, [root], "finder_self")
        ids = [item["payload"]["comment_id"] for item in self.owner.record_service.events if item["event_type"] == "comment_upsert"]
        self.assertIn("wxvcmt_a", ids)
        self.assertIn("wxvcmt_b", ids)

    def test_local_context_excludes_current_target(self):
        self.owner.record_service.context_rows = [
            {"comment_id": "wxvcmt_root_001", "root_comment_id": "wxvcmt_root_001", "comment_level": 1, "author_display": "用户甲", "sender_role": "user", "text_content": "这个地方在哪里呀"},
            {"comment_id": "wxvcmt_reply_001", "root_comment_id": "wxvcmt_root_001", "comment_level": 2, "author_display": "账号", "sender_role": "account", "text_content": "是在海边这块拍的"},
            {"comment_id": "wxvcmt_reply_002", "root_comment_id": "wxvcmt_root_001", "comment_level": 2, "author_display": "用户甲", "sender_role": "user", "text_content": "那带孩子去方便吗"},
        ]
        root = root_thread()
        target = root["levelTwoComment"][1]
        thread_id, context, source = self.runtime.build_thread_context(root, target, "finder_self")
        self.assertEqual(thread_id, "wxvcmt_root_001")
        self.assertEqual(source, "local_sqlite")
        self.assertEqual([item["messageId"] for item in context], ["wxvcmt_root_001", "wxvcmt_reply_001"])

    def test_api_context_fallback_preserves_multi_round_order(self):
        root = root_thread()
        target = root["levelTwoComment"][-1]
        thread_id, context, source = self.runtime.build_thread_context(root, target, "finder_self")
        self.assertEqual(thread_id, "wxvcmt_root_001")
        self.assertEqual(source, "wechat_api_thread")
        self.assertEqual([item["role"] for item in context], ["user", "account", "user", "account"])
        self.assertNotIn("停车的位置远不远", [item["content"] for item in context])


    def test_logical_depth_uses_reply_chain_when_platform_provides_parent_ids(self):
        root = root_thread()
        root["levelTwoComment"][0]["replyCommentId"] = "root_001"
        root["levelTwoComment"][1]["replyCommentId"] = "reply_001"
        root["levelTwoComment"][2]["replyCommentId"] = "reply_002"
        root["levelTwoComment"][3]["replyCommentId"] = "reply_003"
        self.runtime.observe_post_comments(self.post, [root], "finder_self")
        rows = [item["payload"] for item in self.owner.record_service.events if item["event_type"] == "comment_upsert"]
        levels = {row["comment_id"]: row["comment_level"] for row in rows}
        self.assertEqual(levels["wxvcmt_reply_001"], 2)
        self.assertEqual(levels["wxvcmt_reply_004"], 5)

    def test_outcome_updates_target_without_creating_text_dedupe(self):
        root = root_thread()
        target = root["levelTwoComment"][-1]
        self.runtime.update_target_outcome(self.post, root, target, "finder_self", outcome={
            "shouldReply": True,
            "skipReply": False,
            "replyStatus": "sent",
            "replyContent": "停车场离入口不算远",
            "replyTime": "2026-07-17 23:30:00",
        })
        payload = [item["payload"] for item in self.owner.record_service.events if item["event_type"] == "comment_upsert"][-1]
        self.assertEqual(payload["comment_id"], "wxvcmt_reply_004")
        self.assertEqual(payload["reply_status"], "sent")

    def test_unconfirmed_status_has_safe_local_rank_name(self):
        root = root_thread()
        target = root["levelTwoComment"][-1]
        self.runtime.update_target_outcome(self.post, root, target, "finder_self", outcome={
            "shouldReply": True, "replyStatus": "sent_unconfirmed", "replyContent": "测试回复"
        })
        payload = [item["payload"] for item in self.owner.record_service.events if item["event_type"] == "comment_upsert"][-1]
        self.assertEqual(payload["reply_status"], "send_unconfirmed")
        self.assertEqual(payload["resolution_status"], "pending_confirmation")

    def test_reply_attempt_is_locally_persisted(self):
        self.runtime.record_reply_attempt(
            attempt_id="attempt_1", target_record_id="wxvcmt_reply_004", draft_text="回复", actual_text="回复", status="sent", confirmed=True
        )
        event = self.owner.record_service.events[-1]
        self.assertEqual(event["event_type"], "reply_attempt_upsert")
        self.assertEqual(event["payload"]["confirmed_at_utc"][-1], "Z")

    def test_controller_integrates_context_and_strict_confirmation(self):
        source = (Path(__file__).parents[1] / "app/platforms/wechat_video/session_controller.py").read_text(encoding="utf-8")
        self.assertIn("comment_thread_id=thread_id", source)
        self.assertIn("thread_context=thread_context", source)
        self.assertIn("context_source=context_source", source)
        self.assertIn("platform_readback_after_target_with_draft_match", source)
        self.assertIn('reply_status = "sent" if confirmed else "sent_unconfirmed"', source)

    def test_failed_generation_remains_retryable(self):
        source = (Path(__file__).parents[1] / "app/platforms/wechat_video/session_controller.py").read_text(encoding="utf-8")
        failure_block = source[source.index('if response_status == "failed"'):source.index('if not should_reply or not reply:')]
        self.assertIn("_comment_retry_after[key]", failure_block)
        self.assertNotIn("_processed_comment_ids.add(key)", failure_block)


if __name__ == "__main__":
    unittest.main()
