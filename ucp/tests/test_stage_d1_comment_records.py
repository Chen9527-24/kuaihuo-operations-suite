from __future__ import annotations

from concurrent.futures import Future
from pathlib import Path
import importlib.util
import sqlite3
import tempfile
import time
import unittest
from types import SimpleNamespace

from app.services.local_records.service import LocalRecordService

ROOT = Path(__file__).resolve().parents[1]
_RECORD_PATH = ROOT / "app" / "platforms" / "douyin" / "comment" / "recording" / "record_runtime.py"
_RECORD_SPEC = importlib.util.spec_from_file_location("stage_d1_comment_record_runtime", _RECORD_PATH)
assert _RECORD_SPEC and _RECORD_SPEC.loader
_RECORD_MODULE = importlib.util.module_from_spec(_RECORD_SPEC)
_RECORD_SPEC.loader.exec_module(_RECORD_MODULE)
SessionControllerCommentRecordMixin = _RECORD_MODULE.SessionControllerCommentRecordMixin


class _CoreService:
    def __init__(self) -> None:
        self.payloads: list[dict] = []

    def sync_comment_records(self, payload: dict) -> dict:
        self.payloads.append(payload)
        return {"syncedCount": len(payload.get("comments") or [])}


class _Harness(SessionControllerCommentRecordMixin):
    def __init__(self, project_root: Path) -> None:
        self.logs: list[tuple[str, str]] = []
        self.account = SimpleNamespace(
            id="robot-comment-1",
            tenant_id="tenant-d1",
            platform="DOUYIN",
            auth_id="auth-comment-1",
            auth_uid="uid-comment-1",
            auth_name="抖音评论测试号",
            name="抖音评论测试号",
        )
        self.record_service = LocalRecordService(project_root, log=self._log)
        self.core_service = _CoreService()

    def _log(self, level: str, message: str) -> None:
        self.logs.append((level, message))

    def close(self) -> None:
        state = getattr(self, "_comment_recording_state", {})
        future = state.get("remote_future") if isinstance(state, dict) else None
        if isinstance(future, Future):
            future.result(timeout=3)
            self._comment_record_collect_remote_result()
        executor = state.get("remote_executor") if isinstance(state, dict) else None
        if executor is not None:
            executor.shutdown(wait=True, cancel_futures=True)
        self.record_service.flush(timeout=3)
        self.record_service.close(timeout=3)


class StageD1CommentRecordTests(unittest.TestCase):
    def setUp(self) -> None:
        self.temp = tempfile.TemporaryDirectory()
        self.root = Path(self.temp.name)
        self.harness = _Harness(self.root)

    def tearDown(self) -> None:
        self.harness.close()
        self.temp.cleanup()

    @staticmethod
    def _probe(*, collapsed: bool = False) -> dict:
        return {
            "header": {
                "currentWorkTitle": "评论记录测试作品",
                "currentWorkMeta": "2026-07-16 发布",
            },
            "commentFilter": {"selectedText": "全部评论"},
            "topComments": [
                {
                    "threadKey": "thread-root-001",
                    "author": "用户甲",
                    "content": "这个多少钱？",
                    "timeText": "刚刚",
                    "isAuthor": False,
                    "hasCollapsedReplies": collapsed,
                    "hasAuthorReplyInThread": True,
                    "replyNeedReason": "follow_up_after_author_reply",
                    "replyTargetMessage": {
                        "messageKey": "nested-user-followup",
                    },
                    "nestedReplies": [
                        {
                            "messageKey": "nested-account-reply",
                            "parentThreadKey": "thread-root-001",
                            "author": "抖音评论测试号",
                            "content": "活动价请看置顶说明",
                            "timeText": "1分钟前",
                            "isAuthor": True,
                        },
                        {
                            "messageKey": "nested-user-followup",
                            "parentThreadKey": "thread-root-001",
                            "author": "用户甲",
                            "content": "包邮吗？",
                            "timeText": "刚刚",
                            "isAuthor": False,
                        },
                    ],
                }
            ],
        }

    def _db_rows(self) -> list[sqlite3.Row]:
        self.harness.record_service.flush(timeout=3)
        store_id = self.harness.record_service.store_id_for(self.harness.account)
        db_path = self.root / "records" / "accounts" / store_id / "dialogue.sqlite"
        connection = sqlite3.connect(str(db_path))
        connection.row_factory = sqlite3.Row
        try:
            return list(connection.execute(
                "SELECT * FROM comments ORDER BY comment_level, author_display, text_content"
            ).fetchall())
        finally:
            connection.close()

    def _collect_remote(self) -> None:
        deadline = time.time() + 3
        while time.time() < deadline:
            self.harness._comment_record_collect_remote_result()
            state = self.harness._comment_record_state()
            future = state.get("remote_future")
            if not isinstance(future, Future):
                return
            if future.done():
                self.harness._comment_record_collect_remote_result()
                return
            time.sleep(0.02)
        self.fail("remote comment sync did not finish")

    def test_visible_comment_thread_is_saved_locally_and_synced_remotely(self) -> None:
        probe = self._probe()
        self.harness._comment_record_visible_threads(probe)
        self._collect_remote()

        rows = self._db_rows()
        self.assertEqual(len(rows), 3)
        self.assertEqual({row["sender_role"] for row in rows}, {"user", "account"})
        self.assertEqual(sum(1 for row in rows if row["comment_level"] == 1), 1)
        self.assertEqual(sum(1 for row in rows if row["comment_level"] == 2), 2)
        self.assertTrue(all(row["root_comment_id"].startswith("cmtroot_") for row in rows))
        top = next(row for row in rows if row["comment_level"] == 1)
        self.assertEqual(top["comment_id"], top["root_comment_id"])
        self.assertTrue(all(row["parent_comment_id"] == top["comment_id"] for row in rows if row["comment_level"] > 1))
        self.assertEqual(next(row for row in rows if row["text_content"] == "包邮吗？")["candidate_status"], "eligible")

        self.assertEqual(len(self.harness.core_service.payloads), 1)
        payload = self.harness.core_service.payloads[0]
        self.assertEqual(payload["platform"], "DOUYIN")
        self.assertEqual(len(payload["comments"]), 3)
        self.assertEqual({item["senderRole"] for item in payload["comments"]}, {"user", "account"})
        forbidden = str(payload).lower()
        for token in ("cookie", "token", "session", "html", "dom"):
            self.assertNotIn(token, forbidden)

    def test_repeated_scan_is_idempotent_and_collapsed_thread_is_partial(self) -> None:
        probe = self._probe(collapsed=True)
        self.harness._comment_record_visible_threads(probe)
        self._collect_remote()
        self.harness._comment_record_visible_threads(probe)
        self._collect_remote()

        rows = self._db_rows()
        self.assertEqual(len(rows), 3)
        self.assertTrue(all(row["collection_status"] == "partial_thread" for row in rows))
        self.assertTrue(all(row["replies_collapsed"] == 1 for row in rows))
        self.assertEqual(len(self.harness.core_service.payloads), 1)



    def test_relative_time_changes_do_not_split_comment_thread(self) -> None:
        first = self._probe()
        first["topComments"][0]["timeText"] = "刚刚"
        first["topComments"][0]["nestedReplies"] = first["topComments"][0]["nestedReplies"][:1]
        first["topComments"][0]["replyTargetMessage"] = {}
        first["topComments"][0]["replyNeedReason"] = ""
        self.harness._comment_record_visible_threads(first)
        self._collect_remote()

        second = self._probe()
        second["topComments"][0]["timeText"] = "2分钟前"
        self.harness._comment_record_visible_threads(second)
        self._collect_remote()

        rows = self._db_rows()
        self.assertEqual(len(rows), 3)
        self.assertEqual(len({row["root_comment_id"] for row in rows}), 1)
        self.assertEqual(sum(1 for row in rows if row["text_content"] == "这个多少钱？"), 1)
        self.assertEqual(sum(1 for row in rows if row["text_content"] == "活动价请看置顶说明"), 1)
        self.assertEqual(sum(1 for row in rows if row["text_content"] == "包邮吗？"), 1)

    def test_existing_comment_table_migrates_before_sender_index_creation(self) -> None:
        db_path = self.root / "legacy-comment.sqlite"
        connection = sqlite3.connect(str(db_path))
        try:
            connection.executescript(
                """
                CREATE TABLE comments (
                    comment_id TEXT PRIMARY KEY, platform TEXT NOT NULL, external_comment_id TEXT NOT NULL DEFAULT '',
                    video_id TEXT NOT NULL DEFAULT '', video_title TEXT NOT NULL DEFAULT '', parent_comment_id TEXT NOT NULL DEFAULT '',
                    root_comment_id TEXT NOT NULL DEFAULT '', comment_level INTEGER NOT NULL DEFAULT 1,
                    author_key TEXT NOT NULL DEFAULT '', author_display TEXT NOT NULL DEFAULT '', text_content TEXT NOT NULL DEFAULT '',
                    message_type TEXT NOT NULL DEFAULT 'text', type_placeholder TEXT NOT NULL DEFAULT '', source_time_raw TEXT NOT NULL DEFAULT '',
                    source_timestamp_raw TEXT NOT NULL DEFAULT '', source_time_utc TEXT NOT NULL DEFAULT '', observed_at_utc TEXT NOT NULL DEFAULT '',
                    first_observed_at_utc TEXT NOT NULL DEFAULT '', last_observed_at_utc TEXT NOT NULL DEFAULT '',
                    time_accuracy TEXT NOT NULL DEFAULT 'unknown', time_accuracy_rank INTEGER NOT NULL DEFAULT 1,
                    source_timezone TEXT NOT NULL DEFAULT '', business_timezone TEXT NOT NULL DEFAULT '',
                    collection_status TEXT NOT NULL DEFAULT 'observed', collection_rank INTEGER NOT NULL DEFAULT 10,
                    candidate_status TEXT NOT NULL DEFAULT 'unknown', candidate_rank INTEGER NOT NULL DEFAULT 0,
                    analysis_status TEXT NOT NULL DEFAULT 'not_started', analysis_rank INTEGER NOT NULL DEFAULT 0,
                    reply_status TEXT NOT NULL DEFAULT 'not_attempted', reply_rank INTEGER NOT NULL DEFAULT 0,
                    resolution_status TEXT NOT NULL DEFAULT 'unknown', current_filter TEXT NOT NULL DEFAULT '',
                    replies_collapsed INTEGER NOT NULL DEFAULT 0, thread_completeness TEXT NOT NULL DEFAULT '',
                    source_robot_id TEXT NOT NULL DEFAULT '', created_at_utc TEXT NOT NULL, updated_at_utc TEXT NOT NULL
                );
                """
            )
            from app.services.local_records.schema import initialize_dialogue_schema
            initialize_dialogue_schema(connection)
            columns = {row[1] for row in connection.execute("PRAGMA table_info(comments)")}
            self.assertTrue({"sender_role", "actor_source", "attribution_confidence", "attribution_rank", "source_client_id"}.issubset(columns))
            indexes = {row[1] for row in connection.execute("PRAGMA index_list(comments)")}
            self.assertIn("idx_comments_sender", indexes)
        finally:
            connection.close()

    def test_reply_lifecycle_updates_target_and_reply_attempt(self) -> None:
        probe = self._probe()
        self.harness._comment_record_visible_threads(probe)
        self._collect_remote()
        target = probe["topComments"][0]["replyTargetMessage"] | {
            "author": "用户甲",
            "content": "包邮吗？",
            "timeText": "刚刚",
            "parentThreadKey": "thread-root-001",
        }
        self.harness._comment_record_reply_state(
            probe,
            target,
            status="sent",
            reply_text="包邮的，今天下单会尽快安排",
            reason="send_confirmed",
        )
        self._collect_remote()
        self.harness.record_service.flush(timeout=3)

        rows = self._db_rows()
        followup = next(row for row in rows if row["text_content"] == "包邮吗？")
        self.assertEqual(followup["reply_status"], "sent")

        store_id = self.harness.record_service.store_id_for(self.harness.account)
        db_path = self.root / "records" / "accounts" / store_id / "dialogue.sqlite"
        connection = sqlite3.connect(str(db_path))
        try:
            attempt = connection.execute(
                "SELECT status, actual_text, target_type FROM reply_attempts WHERE target_id=? ORDER BY updated_at_utc DESC LIMIT 1",
                (followup["comment_id"],),
            ).fetchone()
        finally:
            connection.close()
        self.assertIsNotNone(attempt)
        self.assertEqual(attempt[0], "sent")
        self.assertEqual(attempt[1], "包邮的，今天下单会尽快安排")
        self.assertEqual(attempt[2], "comment")


if __name__ == "__main__":
    unittest.main()
