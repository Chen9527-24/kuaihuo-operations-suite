from __future__ import annotations

import ast
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
        self.payloads: list[dict] = []

    def resolve_sync_dm_dialogue(self, payload: dict) -> dict:
        self.payloads.append(payload)
        return {
            "canonicalConversationId": "canon-e3",
            "workflowConversationId": "",
            "identityStatus": "CONFIRMED",
            "syncedCount": len(payload.get("messages") or []),
            "contextMessages": [],
        }


class FakeOwner:
    def __init__(self, service: LocalRecordService, core: FakeCore) -> None:
        self.account = SimpleNamespace(
            tenant_id="tenant-1", platform="WECHAT_VIDEO", id="robot-1",
            auth_id="auth-1", auth_uid="finder-1", auth_name="视频号账号", name="视频号测试",
        )
        self.record_service = service
        self.core_service = core
        self._active_runtime = SimpleNamespace(finder_username="finder-1")
        self.logs = []

    def _log(self, level: str, message: str) -> None:
        self.logs.append((level, message))


class WeChatDmConsistencyTests(unittest.TestCase):
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
    def raw(msg_id: str, text: str, *, tab: str = "私信", ts: int = 1710000000000) -> dict:
        value = message_from_wx_private({
            "sessionId": "session-stable",
            "svrMsgId": msg_id,
            "fromUsername": "fv_user_1",
            "toUsername": "finder-1",
            "msgType": 1,
            "textMsg": {"content": text},
            "ts": ts,
            "_sourceTab": tab,
            "_sessionInfo": {"nickname": "测试用户"},
        })
        value["_sourceTab"] = tab
        return value

    def db_rows(self, sql: str) -> list[tuple]:
        self.service.flush(timeout=2.0)
        db_path = self.service.registry.account_dir(self.runtime.store_id()) / "dialogue.sqlite"
        connection = sqlite3.connect(str(db_path))
        try:
            return connection.execute(sql).fetchall()
        finally:
            connection.close()

    def test_ui_tab_does_not_split_same_platform_session(self) -> None:
        first = self.raw("m1", "你好", tab="私信")
        second = self.raw("m2", "还在吗", tab="打招呼消息", ts=1710000001000)
        self.runtime.observe_messages([first, second], source="page_response", tab="页面响应")
        ctx = self.runtime.begin_turn(second)
        payload = self.core.payloads[-1]
        self.assertEqual(ctx["chat_type"], "private_all")
        self.assertEqual(payload["chatType"], "private_all")
        self.assertEqual(payload["identitySource"], "platform_session_id")
        self.assertTrue(payload["identityKey"].startswith("participant_"))

    def test_millisecond_sequence_is_reduced_to_int32(self) -> None:
        msg = self.raw("m1", "你好", ts=1710000000000)
        self.runtime.observe_messages([msg], source="page_response", tab="私信")
        rows = self.db_rows("SELECT sequence_index FROM messages")
        self.assertEqual(rows, [(1710000000,)])
        self.runtime.begin_turn(msg)
        sequence = self.core.payloads[-1]["messages"][-1]["sequenceIndex"]
        self.assertLessEqual(abs(sequence), 2_147_483_647)

    def test_confirmed_outgoing_is_context_eligible_ucp_robot(self) -> None:
        msg = self.raw("m1", "你好")
        self.runtime.observe_messages([msg], source="page_response", tab="私信")
        ctx = self.runtime.begin_turn(msg)
        self.runtime.persist_outgoing(ctx, msg, content="你好呀", client_message_id="cli-1")
        self.runtime.post_send_sync(ctx)
        outgoing = [row for row in self.core.payloads[-1]["messages"] if row["senderRole"] == "account"][-1]
        self.assertEqual(outgoing["actorSource"], "ucp_robot")
        self.assertEqual(outgoing["attributionConfidence"], "verified")
        self.assertLessEqual(abs(outgoing["sequenceIndex"]), 2_147_483_647)


class WeChatDmControllerStructureTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls) -> None:
        cls.path = Path("app/platforms/wechat_video/session_controller.py")
        cls.source = cls.path.read_text(encoding="utf-8")
        cls.tree = ast.parse(cls.source)
        cls.functions = {}
        for node in ast.walk(cls.tree):
            if isinstance(node, ast.FunctionDef):
                cls.functions[node.name] = ast.get_source_segment(cls.source, node) or ""

    def test_session_info_is_background_side_channel(self) -> None:
        loop = self.functions["_run_dm_loop"]
        self.assertIn("_schedule_dm_session_info_refresh", loop)
        self.assertNotIn("info_map = client.get_session_info(session_ids)", loop)
        refresh = self.functions["_schedule_dm_session_info_refresh"]
        self.assertIn("threading.Thread", refresh)
        self.assertIn("sync_session_metadata", refresh)

    def test_pre_send_poll_can_supersede_stale_draft(self) -> None:
        handler = self.functions["_handle_dm_message"]
        self.assertIn("_collect_pre_send_dm_messages", handler)
        self.assertIn("superseded_by_new_message", handler)
        self.assertIn('return "deferred_new_messages"', handler)
        collector = self.functions["_collect_pre_send_dm_messages"]
        self.assertIn("pre_send_cursor_poll_requested.emit", collector)


if __name__ == "__main__":
    unittest.main()
