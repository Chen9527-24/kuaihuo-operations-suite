from __future__ import annotations

from dataclasses import dataclass
from pathlib import Path
import sqlite3
import tempfile
import time
import unittest

import importlib.util

from app.services.local_records import LocalRecordService
from app.services.local_records.schema import initialize_dialogue_schema

_RECORD_MODULE_PATH = Path(__file__).resolve().parents[1] / "app" / "platforms" / "douyin" / "dm" / "recording" / "record_runtime.py"
_RECORD_SPEC = importlib.util.spec_from_file_location("stage_c_record_runtime", _RECORD_MODULE_PATH)
assert _RECORD_SPEC and _RECORD_SPEC.loader
_RECORD_MODULE = importlib.util.module_from_spec(_RECORD_SPEC)
_RECORD_SPEC.loader.exec_module(_RECORD_MODULE)
SessionControllerDMRecordMixin = _RECORD_MODULE.SessionControllerDMRecordMixin


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
    def __init__(self, service: LocalRecordService, account: FakeAccount | None = None) -> None:
        self.record_service = service
        self.account = account or FakeAccount()
        self.logs: list[tuple[str, str]] = []

    def _active_dm_tab_text(self, result):
        return str((result.get("replyReadiness", {}) or {}).get("activeTabText") or "朋友私信")

    def _session_key(self, selected):
        return str(selected.get("sessionKey") or "")

    def _now_ms(self):
        return int(time.time() * 1000)

    def _log(self, level, message):
        self.logs.append((str(level), str(message)))


def make_snapshot(items, *, count=None, top=100, at_bottom=True, header="客户甲", active_tab="朋友私信"):
    bubbles = []
    for item in items:
        if isinstance(item, str):
            item = {"text": item}
        text = str(item.get("text", ""))
        message_type = str(item.get("type", "text" if text else "unknown"))
        placeholder = str(item.get("placeholder", ""))
        side = str(item.get("side", "left"))
        bubbles.append(
            {
                "text": text,
                "messageText": text,
                "recordText": text,
                "recordMessageType": message_type,
                "recordPlaceholder": placeholder,
                "recordSourceTypeCode": f"test_{message_type}",
                "recordClassificationSource": "test_dom",
                "senderName": str(item.get("sender", "")),
                "side": side,
            }
        )
    total = len(bubbles) if count is None else count
    return {
        "selectedSession": {"sessionKey": f"{header}|session", "nickname": header},
        "replyReadiness": {
            "headerName": header,
            "conversationType": "group" if active_tab == "群消息" else "private",
            "activeTabText": active_tab,
        },
        "conversationContext": {
            "headerName": header,
            "conversationType": "group" if active_tab == "群消息" else "private",
            "activeTabText": active_tab,
            "visibleBubbleSamples": bubbles,
        },
        "visibleBubbleCandidates": bubbles,
        "messagePanel": {
            "bubbleLikeCount": total,
            "scroll": {"top": top, "scrollHeight": 1000 + total * 10, "atBottom": at_bottom},
        },
    }


class StageCDMRecordTests(unittest.TestCase):
    def setUp(self) -> None:
        self.temp = tempfile.TemporaryDirectory()
        self.root = Path(self.temp.name)
        self.service = LocalRecordService(self.root)
        self.account = FakeAccount()
        self.registration = self.service.register_account(self.account)
        self.controller = FakeController(self.service, self.account)

    def tearDown(self) -> None:
        self.service.close()
        self.temp.cleanup()

    @property
    def db_path(self) -> Path:
        return self.root / "records" / "accounts" / self.registration.store_id / "dialogue.sqlite"

    def rows(self, sql: str, params=()):
        self.assertTrue(self.service.flush(3.0))
        connection = sqlite3.connect(self.db_path)
        connection.row_factory = sqlite3.Row
        try:
            return connection.execute(sql, params).fetchall()
        finally:
            connection.close()

    def test_visible_window_alignment_and_restart_are_idempotent(self) -> None:
        self.controller._dm_record_snapshot(make_snapshot(["A", "B", "C"], count=3))
        self.controller._dm_record_snapshot(make_snapshot(["A", "B", "C"], count=3))
        self.controller._dm_record_snapshot(make_snapshot(["B", "C", "D"], count=4))
        self.assertEqual(len(self.rows("SELECT * FROM messages")), 4)
        self.assertEqual(
            [row["text_content"] for row in self.rows("SELECT * FROM messages ORDER BY sequence_index")],
            ["A", "B", "C", "D"],
        )

        self.assertTrue(self.service.flush(3.0))
        self.service.close()
        self.service = LocalRecordService(self.root)
        self.controller = FakeController(self.service, self.account)
        self.controller._dm_record_snapshot(make_snapshot(["B", "C", "D"], count=4))
        self.assertEqual(len(self.rows("SELECT * FROM messages")), 4)

    def test_consecutive_identical_messages_are_not_collapsed(self) -> None:
        self.controller._dm_record_snapshot(make_snapshot(["在吗", "在吗", "在吗"], count=3))
        self.assertEqual(len(self.rows("SELECT * FROM messages")), 3)
        self.controller._dm_record_snapshot(make_snapshot(["在吗", "在吗", "在吗"], count=4))
        rows = self.rows("SELECT text_content, sequence_index FROM messages ORDER BY sequence_index")
        self.assertEqual(len(rows), 4)
        self.assertEqual([row["text_content"] for row in rows], ["在吗"] * 4)

    def test_consecutive_identical_images_are_not_collapsed(self) -> None:
        image = {"text": "", "type": "image", "placeholder": "[图片]"}
        self.controller._dm_record_snapshot(make_snapshot([image, image, image], count=3))
        self.assertEqual(len(self.rows("SELECT * FROM messages")), 3)
        self.controller._dm_record_snapshot(make_snapshot([image, image, image], count=4))
        rows = self.rows(
            "SELECT message_type, type_placeholder FROM messages ORDER BY sequence_index"
        )
        self.assertEqual(len(rows), 4)
        self.assertTrue(all(row["message_type"] == "image" for row in rows))
        self.assertTrue(all(row["type_placeholder"] == "[图片]" for row in rows))

    def test_scrolling_up_records_only_history_prefix(self) -> None:
        self.controller._dm_record_snapshot(make_snapshot(["B", "C", "D"], count=3, top=100))
        self.controller._dm_record_snapshot(make_snapshot(["A", "B", "C"], count=4, top=50, at_bottom=False))
        rows = self.rows(
            "SELECT text_content, history_kind, time_accuracy FROM messages ORDER BY sequence_index"
        )
        self.assertEqual([row["text_content"] for row in rows], ["A", "B", "C", "D"])
        self.assertEqual(rows[0]["history_kind"], "history_backfill")
        self.assertEqual(rows[0]["time_accuracy"], "unknown_history")
        self.assertEqual(len(rows), 4)

    def test_non_text_is_recorded_without_becoming_reply_text(self) -> None:
        self.controller._dm_record_snapshot(
            make_snapshot([
                {"text": "", "type": "image", "placeholder": "[图片]"},
                {"text": "这个位置坏了吗", "type": "image", "placeholder": "[图片]"},
            ])
        )
        rows = self.rows(
            "SELECT message_type, text_content, type_placeholder, is_semantically_analyzable FROM messages ORDER BY sequence_index"
        )
        self.assertEqual(rows[0]["message_type"], "image")
        self.assertEqual(rows[0]["text_content"], "")
        self.assertEqual(rows[0]["type_placeholder"], "[图片]")
        self.assertEqual(rows[0]["is_semantically_analyzable"], 0)
        self.assertEqual(rows[1]["text_content"], "这个位置坏了吗")
        self.assertEqual(rows[1]["is_semantically_analyzable"], 1)

    def test_analysis_turn_links_and_reply_attempt_states(self) -> None:
        self.controller._dm_record_snapshot(make_snapshot(["第一句", "第二句"]))
        payload = {
            "replyToken": "reply-1",
            "selected": "客户甲|session",
            "headerName": "客户甲",
            "latestIncomingText": "第一句 第二句",
            "conversationType": "private",
            "activeTabText": "朋友私信",
            "draftText": "您好，已经帮您查询。",
        }
        self.controller._dm_record_analysis_started(payload)
        self.controller._dm_record_analysis_result(
            payload,
            status="completed",
            draft_text=payload["draftText"],
            source="backend:dm",
            model="test-model",
            reason="ok",
        )
        self.controller._dm_record_reply_attempt(payload, status="send_pending")
        self.controller._dm_record_reply_attempt(
            payload,
            status="sent",
            actual_text=payload["draftText"],
            confirmed=True,
        )
        self.controller._dm_record_snapshot(
            make_snapshot([
                "第一句",
                "第二句",
                {"text": payload["draftText"], "side": "right"},
            ], count=3)
        )
        linked = self.rows("SELECT * FROM turn_messages ORDER BY position")
        self.assertEqual(len(linked), 2)
        attempt = self.rows("SELECT * FROM reply_attempts")[0]
        self.assertEqual(attempt["status"], "sent")
        outgoing = self.rows("SELECT * FROM messages WHERE sender_role='account'")[0]
        self.assertEqual(outgoing["actor_source"], "ucp_robot")
        self.assertEqual(outgoing["attribution_confidence"], "verified")
        self.assertEqual(outgoing["reply_attempt_id"], attempt["attempt_id"])


    def test_group_sender_is_preserved(self) -> None:
        self.controller._dm_record_snapshot(
            make_snapshot([
                {"text": "群里咨询一下价格", "sender": "张三"},
                {"text": "我也想知道", "sender": "李四"},
            ], header="客户交流群", active_tab="群消息")
        )
        rows = self.rows("SELECT sender_display, sender_key, text_content FROM messages ORDER BY sequence_index")
        self.assertEqual([row["sender_display"] for row in rows], ["张三", "李四"])
        self.assertTrue(all(row["sender_key"] for row in rows))
        self.assertNotEqual(rows[0]["sender_key"], rows[1]["sender_key"])

    def test_controller_store_cache_changes_after_account_rebind(self) -> None:
        first_store = self.controller._dm_record_store_id()
        self.account.auth_id = "auth-new"
        self.account.auth_uid = "uid-new"
        second_store = self.controller._dm_record_store_id()
        self.assertNotEqual(first_store, second_store)

    def test_unmatched_account_side_message_is_not_called_robot(self) -> None:
        self.controller._dm_record_snapshot(
            make_snapshot([
                {"text": "人工从手机回复", "side": "right"},
            ])
        )
        row = self.rows("SELECT * FROM messages")[0]
        self.assertEqual(row["actor_source"], "account_side_unconfirmed")
        self.assertEqual(row["attribution_confidence"], "unknown")

    def test_no_overlap_requires_two_stable_observations(self) -> None:
        self.controller._dm_record_snapshot(make_snapshot(["A", "B"]))
        self.controller._dm_record_snapshot(make_snapshot(["X", "Y"], count=2))
        self.assertEqual(len(self.rows("SELECT * FROM messages")), 2)
        self.controller._dm_record_snapshot(make_snapshot(["X", "Y"], count=2))
        rows = self.rows("SELECT text_content, history_kind FROM messages ORDER BY sequence_index")
        self.assertEqual(len(rows), 4)
        self.assertEqual([row["history_kind"] for row in rows[-2:]], ["window_rebaseline", "window_rebaseline"])


    def test_existing_stage_b_database_migrates_in_place(self) -> None:
        migration_db = self.root / "stage_b_v1.sqlite"
        connection = sqlite3.connect(migration_db)
        try:
            connection.executescript(
                """
                CREATE TABLE messages (
                    message_id TEXT PRIMARY KEY, conversation_id TEXT NOT NULL, platform TEXT NOT NULL,
                    platform_message_id TEXT NOT NULL DEFAULT '', sender_role TEXT NOT NULL DEFAULT 'unknown',
                    actor_source TEXT NOT NULL DEFAULT 'unknown', attribution_confidence TEXT NOT NULL DEFAULT 'unknown',
                    attribution_rank INTEGER NOT NULL DEFAULT 0, message_type TEXT NOT NULL DEFAULT 'unknown',
                    text_content TEXT NOT NULL DEFAULT '', type_placeholder TEXT NOT NULL DEFAULT '',
                    has_text INTEGER NOT NULL DEFAULT 0, has_non_text INTEGER NOT NULL DEFAULT 0,
                    is_semantically_analyzable INTEGER NOT NULL DEFAULT 0, source_type_code TEXT NOT NULL DEFAULT '',
                    classification_source TEXT NOT NULL DEFAULT '', sequence_index INTEGER,
                    source_time_raw TEXT NOT NULL DEFAULT '', source_timestamp_raw TEXT NOT NULL DEFAULT '',
                    source_time_utc TEXT NOT NULL DEFAULT '', observed_at_utc TEXT NOT NULL DEFAULT '',
                    first_observed_at_utc TEXT NOT NULL DEFAULT '', last_observed_at_utc TEXT NOT NULL DEFAULT '',
                    time_accuracy TEXT NOT NULL DEFAULT 'unknown', time_accuracy_rank INTEGER NOT NULL DEFAULT 1,
                    source_timezone TEXT NOT NULL DEFAULT '', business_timezone TEXT NOT NULL DEFAULT '',
                    time_parser_version TEXT NOT NULL DEFAULT '1', history_kind TEXT NOT NULL DEFAULT '',
                    payload_fingerprint TEXT NOT NULL DEFAULT '', source_robot_id TEXT NOT NULL DEFAULT '',
                    source_client_id TEXT NOT NULL DEFAULT '', created_at_utc TEXT NOT NULL, updated_at_utc TEXT NOT NULL
                );
                PRAGMA user_version=1;
                """
            )
            initialize_dialogue_schema(connection)
            connection.commit()
            columns = {row[1] for row in connection.execute("PRAGMA table_info(messages)")}
            self.assertIn("reply_attempt_id", columns)
            self.assertIn("reply_trace_id", columns)
            self.assertIn("generation_source", columns)
            self.assertIn("sender_key", columns)
            self.assertIn("sender_display", columns)
            self.assertEqual(connection.execute("PRAGMA user_version").fetchone()[0], 4)
        finally:
            connection.close()

    def test_schema_version_four_contains_reply_trace_link(self) -> None:
        self.assertTrue(self.service.flush(3.0))
        connection = sqlite3.connect(self.db_path)
        try:
            self.assertEqual(connection.execute("PRAGMA user_version").fetchone()[0], 4)
            columns = {row[1] for row in connection.execute("PRAGMA table_info(messages)")}
            self.assertIn("reply_attempt_id", columns)
            self.assertIn("reply_trace_id", columns)
            self.assertIn("generation_source", columns)
        finally:
            connection.close()


if __name__ == "__main__":
    unittest.main()
