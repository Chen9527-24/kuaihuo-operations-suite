from __future__ import annotations

import sqlite3
import tempfile
import time
import unittest
from pathlib import Path
from types import SimpleNamespace

from app.platforms.wechat_video.dm.recording_runtime import WeChatVideoDMRecordingRuntime
from app.platforms.wechat_video.policy import message_from_wx_private
from app.services.local_records.service import LocalRecordService


class FakeCore:
    def resolve_sync_dm_dialogue(self, payload: dict) -> dict:
        return {
            "canonicalConversationId": "canon-e4",
            "workflowConversationId": "",
            "identityStatus": "CONFIRMED",
            "syncedCount": len(payload.get("messages") or []),
            "contextMessages": [],
        }


class FakeOwner:
    def __init__(self, service: LocalRecordService) -> None:
        self.account = SimpleNamespace(
            tenant_id="tenant-1",
            platform="WECHAT_VIDEO",
            id="robot-1",
            auth_id="auth-1",
            auth_uid="finder-1",
            auth_name="视频号账号",
            name="视频号测试",
        )
        self.record_service = service
        self.core_service = FakeCore()
        self._active_runtime = SimpleNamespace(finder_username="finder-1")
        self.logs: list[tuple[str, str]] = []

    def _log(self, level: str, message: str) -> None:
        self.logs.append((level, message))


class WeChatDmEchoDedupTests(unittest.TestCase):
    def setUp(self) -> None:
        self.tempdir = tempfile.TemporaryDirectory()
        self.service = LocalRecordService(Path(self.tempdir.name))
        self.owner = FakeOwner(self.service)
        self.runtime = WeChatVideoDMRecordingRuntime(self.owner)

    def tearDown(self) -> None:
        self.service.close(timeout=3.0)
        self.tempdir.cleanup()

    @staticmethod
    def incoming(msg_id: str, text: str) -> dict:
        return message_from_wx_private({
            "sessionId": "session-stable",
            "svrMsgId": msg_id,
            "fromUsername": "fv_user_1",
            "toUsername": "finder-1",
            "msgType": 1,
            "textMsg": {"content": text},
            "ts": int(time.time() * 1000),
            "_sessionInfo": {"nickname": "测试用户"},
        })

    @staticmethod
    def self_echo(msg_id: str, text: str, ts: int) -> dict:
        return message_from_wx_private({
            "sessionId": "session-stable",
            "svrMsgId": msg_id,
            "fromUsername": "finder-1",
            "toUsername": "fv_user_1",
            "msgType": 1,
            "textMsg": {"content": text},
            "ts": ts,
            "_sessionInfo": {"nickname": "测试用户"},
        })

    def rows(self, sql: str) -> list[tuple]:
        self.service.flush(timeout=2.0)
        db_path = self.service.registry.account_dir(self.runtime.store_id()) / "dialogue.sqlite"
        connection = sqlite3.connect(str(db_path))
        try:
            return connection.execute(sql).fetchall()
        finally:
            connection.close()

    def test_repeated_platform_echoes_reuse_one_outgoing_message(self) -> None:
        incoming = self.incoming("user-1", "睡了睡了，晚安")
        self.runtime.observe_messages([incoming], source="page_response", tab="私信")
        ctx = self.runtime.begin_turn(incoming)
        self.runtime.persist_outgoing(
            ctx,
            incoming,
            content="晚安晚安，好梦😴",
            client_message_id="cli-outgoing-1",
        )

        echo_ts = int(time.time() * 1000)
        first = self.self_echo("svr-echo-a", "晚安晚安，好梦😴", echo_ts)
        second = self.self_echo("svr-echo-b", "晚安晚安，好梦😴", echo_ts)
        third = self.self_echo("svr-echo-c", "晚安晚安，好梦😴", echo_ts)
        self.runtime.observe_messages([first], source="xhr", tab="打招呼消息")
        self.runtime.observe_messages([second], source="page_cursor_poll", tab="私信")
        self.runtime.observe_messages([third], source="page_cursor_poll", tab="打招呼消息")

        account_rows = self.rows(
            "SELECT message_id, text_content, actor_source, reply_attempt_id "
            "FROM messages WHERE sender_role='account' ORDER BY created_at_utc"
        )
        self.assertEqual(len(account_rows), 1)
        self.assertEqual(account_rows[0][1], "晚安晚安，好梦😴")
        self.assertEqual(account_rows[0][2], "ucp_robot")
        self.assertTrue(account_rows[0][3])
        merged_logs = [message for _level, message in self.owner.logs if "发送回显已合并" in message]
        self.assertEqual(len(merged_logs), 3)
        self.assertIn("echoCount=3", merged_logs[-1])

    def test_two_real_identical_robot_sends_remain_two_messages(self) -> None:
        incoming = self.incoming("user-2", "在吗")
        self.runtime.observe_messages([incoming], source="page_response", tab="私信")
        ctx = self.runtime.begin_turn(incoming)
        self.runtime.persist_outgoing(ctx, incoming, content="在的", client_message_id="cli-outgoing-a")
        self.runtime.persist_outgoing(ctx, incoming, content="在的", client_message_id="cli-outgoing-b")
        rows = self.rows("SELECT message_id FROM messages WHERE sender_role='account'")
        self.assertEqual(len(rows), 2)


if __name__ == "__main__":
    unittest.main()
