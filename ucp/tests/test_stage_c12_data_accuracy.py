from __future__ import annotations

from dataclasses import dataclass
import importlib.util
from pathlib import Path
import sqlite3
import tempfile
import time
import unittest

from app.services.local_records import LocalRecordService


ROOT = Path(__file__).resolve().parents[1]
RECORD_PATH = ROOT / "app/platforms/douyin/dm/recording/record_runtime.py"
SPEC = importlib.util.spec_from_file_location("stage_c12_record_runtime", RECORD_PATH)
assert SPEC and SPEC.loader
MODULE = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(MODULE)
SessionControllerDMRecordMixin = MODULE.SessionControllerDMRecordMixin


@dataclass
class FakeAccount:
    id: str = "robot-dm"
    tenant_id: str = "tenant-a"
    platform: str = "DOUYIN"
    name: str = "私信机器人"
    auth_id: str = "auth-a"
    auth_uid: str = "uid-a"
    auth_name: str = "测试账号"


class FakeController(SessionControllerDMRecordMixin):
    def __init__(self, service: LocalRecordService) -> None:
        self.record_service = service
        self.account = FakeAccount()
        self.logs: list[tuple[str, str]] = []
        self.dm_pending_reply_meta: dict[str, dict] = {}
        self.dm_current_conversation_anchor = {}

    def _active_dm_tab_text(self, result):
        return str((result.get("replyReadiness", {}) or {}).get("activeTabText") or "")

    def _session_key(self, selected):
        return str(selected.get("sessionKey") or "")

    def _pending_dm_reply_meta(self, key):
        return self.dm_pending_reply_meta.get(key, {})

    def _now_ms(self):
        return int(time.time() * 1000)

    def _log(self, level, message):
        self.logs.append((str(level), str(message)))


class StageC12DataAccuracyTests(unittest.TestCase):
    def test_app_only_platform_notice_is_classified_as_unknown_placeholder(self) -> None:
        script = (ROOT / "app/platforms/douyin/common/js_scripts.py").read_text(encoding="utf-8")
        self.assertIn("dom_app_only_unknown", script)
        self.assertIn("recordAppOnlyPlaceholder", script)
        self.assertIn("[其他类型消息]", script)
        self.assertIn("safeExplicitMessageText", script)

    def setUp(self) -> None:
        self.temp = tempfile.TemporaryDirectory()
        self.service = LocalRecordService(Path(self.temp.name))
        self.registration = self.service.register_account(FakeAccount())
        self.controller = FakeController(self.service)

    def tearDown(self) -> None:
        self.service.close()
        self.temp.cleanup()

    def _snapshot(self):
        session_key = "QXQ | 刚刚 | [表情]"
        self.controller.dm_pending_reply_meta[session_key] = {
            "nickname": "QXQ",
            "unreadCountHint": 3,
        }
        bubbles = [
            {
                "side": "right",
                "recordMessageType": "image",
                "recordText": "",
                "recordPlaceholder": "[图片]",
                "recordSourceTypeCode": "dom_image",
                "recordClassificationSource": "douyin_dom_v1",
                "senderName": "",
            },
            {
                "side": "left",
                "recordMessageType": "text",
                "recordText": "你好啊",
                "recordPlaceholder": "",
                "recordSourceTypeCode": "text",
                "recordClassificationSource": "douyin_dom_v1",
                "senderName": "",
            },
            {
                "side": "left",
                "recordMessageType": "text",
                "recordText": "今天上班真累啊",
                "recordPlaceholder": "",
                "recordSourceTypeCode": "text",
                "recordClassificationSource": "douyin_dom_v1",
                "senderName": "",
            },
            {
                "side": "left",
                "recordMessageType": "emoji",
                "recordText": "",
                "recordPlaceholder": "[表情]",
                "recordSourceTypeCode": "dom_emoji_hint",
                "recordClassificationSource": "douyin_dom_v1",
                "senderName": "",
            },
        ]
        return {
            "selectedSession": {"sessionKey": session_key, "nickname": "QXQ"},
            "replyReadiness": {
                "headerName": "QXQ",
                "conversationType": "private",
                "activeTabText": "朋友私信",
            },
            "conversationContext": {
                "headerName": "QXQ",
                "conversationType": "private",
                "activeTabText": "朋友私信",
                "visibleBubbleSamples": bubbles,
            },
            "visibleBubbleCandidates": bubbles,
            "messagePanel": {
                "bubbleLikeCount": 4,
                "scroll": {"top": 100, "scrollHeight": 1000, "atBottom": True},
            },
        }

    def test_first_open_uses_unread_badge_to_mark_new_messages_live(self) -> None:
        self.controller._dm_record_snapshot(self._snapshot())
        self.assertTrue(self.service.flush(3.0))
        db = Path(self.temp.name) / "records" / "accounts" / self.registration.store_id / "dialogue.sqlite"
        connection = sqlite3.connect(db)
        try:
            rows = connection.execute(
                "SELECT sender_role,message_type,text_content,type_placeholder,history_kind,time_accuracy "
                "FROM messages ORDER BY sequence_index"
            ).fetchall()
        finally:
            connection.close()
        self.assertEqual(len(rows), 4)
        self.assertEqual(rows[0][4], "initial_visible_baseline")
        self.assertEqual(rows[0][5], "unknown_history")
        self.assertEqual([row[4] for row in rows[1:]], ["live_observed"] * 3)
        self.assertEqual([row[5] for row in rows[1:]], ["live_observed"] * 3)
        self.assertEqual(rows[3][1:4], ("emoji", "", "[表情]"))

    def test_non_text_recording_uses_only_explicit_message_body_text(self) -> None:
        script = (ROOT / "app/platforms/douyin/common/js_scripts.py").read_text(encoding="utf-8")
        self.assertIn("const explicitTextNode", script)
        self.assertIn("const explicitRecordText", script)
        self.assertIn("messageType === 'text' ? text : safeExplicitMessageText", script)
        self.assertIn("recordHasExplicitText", script)

    def test_initial_live_index_selection_counts_only_incoming_bubbles(self) -> None:
        bubbles = [
            {"side": "left"},
            {"side": "right"},
            {"side": "left"},
            {"side": "left"},
        ]
        self.assertEqual(
            self.controller._dm_record_initial_live_indexes(bubbles, 2),
            {2, 3},
        )


if __name__ == "__main__":
    unittest.main()
