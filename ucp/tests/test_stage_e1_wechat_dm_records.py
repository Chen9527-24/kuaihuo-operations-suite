from __future__ import annotations

import sqlite3
import tempfile
import unittest
from pathlib import Path
from types import SimpleNamespace

from app.platforms.wechat_video.dm.recording_runtime import WeChatVideoDMRecordingRuntime
from app.platforms.wechat_video.policy import message_from_wx_private
from app.services.local_records.service import LocalRecordService


class FakeCore:
    def __init__(self) -> None:
        self.resolve_payloads: list[dict] = []
        self.workflow_updates: list[tuple[str, str]] = []

    def resolve_sync_dm_dialogue(self, payload: dict) -> dict:
        self.resolve_payloads.append(payload)
        return {
            "canonicalConversationId": "canon_wechat_1",
            "workflowConversationId": "workflow_1",
            "identityStatus": "CONFIRMED",
            "syncedCount": len(payload.get("messages") or []),
            "contextMessages": [{"senderRole": "account", "textContent": "上一轮回复"}],
        }

    def update_dialogue_workflow_conversation(self, canonical: str, workflow: str) -> dict:
        self.workflow_updates.append((canonical, workflow))
        return {"ok": True}


class FakeOwner:
    def __init__(self, service: LocalRecordService, core: FakeCore) -> None:
        self.account = SimpleNamespace(
            tenant_id="tenant-1",
            platform="WECHAT_VIDEO",
            id="robot-wx-1",
            auth_id="auth-wx-1",
            auth_uid="finder-1",
            auth_name="视频号账号",
            name="视频号测试",
        )
        self.record_service = service
        self.core_service = core
        self._active_runtime = SimpleNamespace(finder_username="finder-1")
        self.logs: list[tuple[str, str]] = []

    def _log(self, level: str, message: str) -> None:
        self.logs.append((level, message))


class WeChatDmRecordsTests(unittest.TestCase):
    def setUp(self) -> None:
        self.tempdir = tempfile.TemporaryDirectory()
        self.service = LocalRecordService(Path(self.tempdir.name))
        self.core = FakeCore()
        self.owner = FakeOwner(self.service, self.core)
        self.runtime = WeChatVideoDMRecordingRuntime(self.owner)

    def tearDown(self) -> None:
        self.service.close(timeout=3.0)
        self.tempdir.cleanup()

    @staticmethod
    def raw_message(msg_id: str, text: str, *, sender: str = "other", ts: int = 1710000000000) -> dict:
        if sender == "other":
            from_username, to_username = "fv_user_1", "finder-1"
        else:
            from_username, to_username = "finder-1", "fv_user_1"
        return {
            "sessionId": "session-1",
            "svrMsgId": msg_id,
            "fromUsername": from_username,
            "toUsername": to_username,
            "msgType": 1,
            "textMsg": {"content": text},
            "ts": ts,
            "_sessionInfo": {"nickname": "测试用户"},
        }

    def db_rows(self, sql: str, params: tuple = ()) -> list[tuple]:
        self.service.flush(timeout=2.0)
        store_id = self.runtime.store_id()
        db_path = self.service.registry.account_dir(store_id) / "dialogue.sqlite"
        connection = sqlite3.connect(str(db_path))
        try:
            return connection.execute(sql, params).fetchall()
        finally:
            connection.close()

    def test_non_text_messages_are_preserved_as_placeholders(self) -> None:
        parsed = message_from_wx_private({
            "sessionId": "s1",
            "svrMsgId": "m1",
            "fromUsername": "fv_u",
            "toUsername": "finder",
            "msgType": 3,
            "ts": 1710000000000,
        })
        self.assertEqual(parsed["messageType"], "image")
        self.assertEqual(parsed["typePlaceholder"], "[图片]")
        self.assertEqual(parsed["text"], "")

    def test_non_text_observation_syncs_to_server_without_ai_turn(self) -> None:
        parsed = message_from_wx_private({
            "sessionId": "session-1",
            "svrMsgId": "img-1",
            "fromUsername": "fv_user_1",
            "toUsername": "finder-1",
            "msgType": 3,
            "ts": 1710000000000,
            "_sessionInfo": {"nickname": "测试用户"},
        })
        self.runtime.observe_messages([parsed], source="page_response", tab="私信")
        synced = self.runtime.sync_passive_observations([parsed])
        self.assertEqual(synced, 1)
        payload = self.core.resolve_payloads[-1]
        self.assertEqual(payload["messages"][-1]["messageType"], "image")
        self.assertEqual(payload["messages"][-1]["typePlaceholder"], "[图片]")
        self.assertEqual(payload["messages"][-1]["textContent"], "")

    def test_identical_text_with_distinct_platform_ids_is_not_collapsed(self) -> None:
        messages = [
            message_from_wx_private(self.raw_message("m1", "你好")),
            message_from_wx_private(self.raw_message("m2", "你好", ts=1710000001000)),
        ]
        self.runtime.observe_messages(messages, source="page_response", tab="私信")
        rows = self.db_rows("SELECT platform_message_id, text_content FROM messages ORDER BY rowid")
        self.assertEqual(rows, [("m1", "你好"), ("m2", "你好")])

    def test_begin_turn_resolves_canonical_context_and_current_ids(self) -> None:
        first = message_from_wx_private(self.raw_message("m1", "你好"))
        second = message_from_wx_private(self.raw_message("m2", "今天有点累", ts=1710000001000))
        for item in (first, second):
            item["_sourceTab"] = "私信"
        aggregate = dict(second)
        aggregate["text"] = "你好\n今天有点累"
        aggregate["_aggregateMessages"] = [first, second]
        aggregate["_aggregateMessageKeys"] = ["session-1:m1", "session-1:m2"]
        aggregate["_aggregateCount"] = 2
        self.runtime.observe_messages([first, second], source="page_response", tab="私信")
        ctx = self.runtime.begin_turn(aggregate)
        self.assertEqual(ctx["canonical_conversation_id"], "canon_wechat_1")
        self.assertEqual(ctx["workflow_conversation_id"], "workflow_1")
        self.assertEqual(len(ctx["current_client_message_ids"]), 2)
        payload = self.core.resolve_payloads[-1]
        self.assertEqual(payload["platform"], "WECHAT_VIDEO")
        self.assertEqual(payload["chatType"], "private_all")
        self.assertEqual(payload["sourceClientId"], "wxv-" + self.runtime.store_id())
        self.assertEqual(len(payload["messages"]), 2)

    def test_sent_attempt_survives_restart_check(self) -> None:
        msg = message_from_wx_private(self.raw_message("m1", "测试重启去重"))
        msg["_sourceTab"] = "私信"
        self.runtime.observe_messages([msg], source="page_response", tab="私信")
        ctx = self.runtime.begin_turn(msg)
        self.runtime.mark_attempt(ctx, status="sent", draft_text="收到", actual_text="收到", confirmed=True)
        terminal, status = self.runtime.is_terminally_processed(msg)
        self.assertTrue(terminal)
        self.assertEqual(status, "sent")

    def test_outgoing_api_ack_is_persisted_and_post_synced(self) -> None:
        msg = message_from_wx_private(self.raw_message("m1", "你好"))
        msg["_sourceTab"] = "私信"
        self.runtime.observe_messages([msg], source="page_response", tab="私信")
        ctx = self.runtime.begin_turn(msg)
        self.runtime.persist_outgoing(ctx, msg, content="你好呀", client_message_id="cli-1")
        self.runtime.mark_attempt(ctx, status="sent", draft_text="你好呀", actual_text="你好呀", confirmed=True)
        self.runtime.post_send_sync(ctx)
        rows = self.db_rows(
            "SELECT sender_role, text_content, reply_attempt_id FROM messages ORDER BY rowid"
        )
        self.assertEqual(rows[-1][0:2], ("account", "你好呀"))
        self.assertEqual(rows[-1][2], ctx["attempt_id"])
        self.assertGreaterEqual(len(self.core.resolve_payloads), 2)
        self.assertTrue(any(item.get("senderRole") == "account" for item in self.core.resolve_payloads[-1]["messages"]))

    def test_platform_self_echo_merges_with_synthetic_outgoing(self) -> None:
        msg = message_from_wx_private(self.raw_message("m1", "你好"))
        msg["_sourceTab"] = "私信"
        self.runtime.observe_messages([msg], source="page_response", tab="私信")
        ctx = self.runtime.begin_turn(msg)
        self.runtime.persist_outgoing(ctx, msg, content="你好呀", client_message_id="cli-1")
        echo = message_from_wx_private(self.raw_message("server-echo-1", "你好呀", sender="self", ts=1710000002000))
        self.runtime.observe_messages([echo], source="page_response", tab="私信")
        rows = self.db_rows("SELECT sender_role, text_content FROM messages WHERE sender_role='account'")
        self.assertEqual(rows, [("account", "你好呀")])

    def test_two_ui_tabs_share_one_stable_private_identity_scope(self) -> None:
        msg = message_from_wx_private(self.raw_message("m1", "你好"))
        msg["_sourceTab"] = "打招呼消息"
        self.runtime.observe_messages([msg], source="page_response", tab="页面响应")
        ctx = self.runtime.begin_turn(msg)
        self.assertEqual(ctx["chat_type"], "private_all")
        self.assertEqual(self.core.resolve_payloads[-1]["chatType"], "private_all")
        self.assertEqual(self.core.resolve_payloads[-1]["identitySource"], "platform_session_id")
        self.assertEqual(self.core.resolve_payloads[-1]["identityConfidence"], 100)

    def test_workflow_mapping_uses_canonical_conversation(self) -> None:
        ctx = {"canonical_conversation_id": "canon-1"}
        self.runtime.update_workflow_mapping(ctx, "coze-conv-1")
        self.assertEqual(self.core.workflow_updates, [("canon-1", "coze-conv-1")])


if __name__ == "__main__":
    unittest.main()
