from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime, timezone
import json
from pathlib import Path
import sqlite3
import tempfile
import time
import unittest

from app.services.local_records import LocalRecordService, NullLocalRecordService, create_event, normalize_message_content, normalize_source_time, sanitize_mapping
from app.services.local_records.recovery import RecoveryStore


@dataclass
class FakeAccount:
    id: str
    tenant_id: str
    platform: str
    name: str
    auth_id: str = ""
    auth_uid: str = ""
    auth_name: str = ""


def wait_for(predicate, timeout: float = 5.0) -> None:
    deadline = time.monotonic() + timeout
    while time.monotonic() < deadline:
        if predicate():
            return
        time.sleep(0.03)
    raise AssertionError("condition was not met before timeout")


class NullServiceTests(unittest.TestCase):
    def test_stage_c_cursor_helpers_are_safe_in_fallback_service(self) -> None:
        service = NullLocalRecordService()
        self.assertTrue(service.flush(0.01))
        self.assertEqual(service.load_cursor("acct_missing", "cursor"), {})


class NormalizerTests(unittest.TestCase):
    def test_sensitive_keys_are_removed_recursively(self) -> None:
        cleaned = sanitize_mapping(
            {
                "text_content": "正常文本",
                "token": "secret",
                "nested": {"cookieHeader": "secret", "safe": "ok"},
                "sessionData": "secret",
            }
        )
        self.assertEqual(cleaned["text_content"], "正常文本")
        self.assertNotIn("token", cleaned)
        self.assertNotIn("sessionData", cleaned)
        self.assertEqual(cleaned["nested"], {"safe": "ok"})

    def test_non_text_placeholder_does_not_become_reply_text(self) -> None:
        value = normalize_message_content("image", "", "")
        self.assertEqual(value["type_placeholder"], "[图片]")
        self.assertEqual(value["text_content"], "")
        self.assertEqual(value["is_semantically_analyzable"], 0)

    def test_relative_time_uses_first_observation_anchor(self) -> None:
        observed = datetime(2026, 7, 15, 8, 0, tzinfo=timezone.utc)
        value = normalize_source_time(source_time_raw="10分钟前", observed_at=observed)
        self.assertEqual(value.time_accuracy, "relative_parsed")
        self.assertTrue(value.source_time_utc.startswith("2026-07-15T07:50:00"))


class IdentityTests(unittest.TestCase):
    def setUp(self) -> None:
        self.temp = tempfile.TemporaryDirectory()
        self.root = Path(self.temp.name)
        self.service = LocalRecordService(self.root)

    def tearDown(self) -> None:
        self.service.close()
        self.temp.cleanup()

    def test_registration_initializes_account_database_asynchronously(self) -> None:
        registration = self.service.register_account(FakeAccount("robot-init", "tenant-a", "DOUYIN", "机器人", "auth-init", "uid-init"))
        db_path = self.root / "records" / "accounts" / registration.store_id / "dialogue.sqlite"
        wait_for(db_path.exists)
        connection = sqlite3.connect(db_path)
        try:
            self.assertEqual(connection.execute("PRAGMA user_version").fetchone()[0], 4)
        finally:
            connection.close()

    def test_same_account_two_robots_share_store_and_tenants_are_isolated(self) -> None:
        dm = FakeAccount("robot-dm", "tenant-a", "DOUYIN", "私信机器人", "auth-a", "uid-a")
        comment = FakeAccount("robot-comment", "tenant-a", "DOUYIN", "评论机器人", "auth-b", "uid-a")
        other_tenant = FakeAccount("robot-other", "tenant-b", "DOUYIN", "私信机器人", "auth-c", "uid-a")
        first = self.service.register_account(dm)
        second = self.service.register_account(comment)
        third = self.service.register_account(other_tenant)
        self.assertIsNotNone(first)
        self.assertEqual(first.store_id, second.store_id)
        self.assertNotEqual(first.store_id, third.store_id)

    def test_temporary_identity_upgrades_without_splitting(self) -> None:
        temporary = FakeAccount("robot-1", "tenant-a", "WECHAT_VIDEO", "机器人")
        upgraded = FakeAccount("robot-1", "tenant-a", "WECHAT_VIDEO", "机器人", "auth-1", "uid-1")
        first = self.service.register_account(temporary)
        second = self.service.register_account(upgraded)
        self.assertEqual(first.store_id, second.store_id)


    def test_two_registry_connections_do_not_split_same_account(self) -> None:
        other = LocalRecordService(self.root)
        try:
            account = FakeAccount("robot-shared", "tenant-a", "DOUYIN", "机器人", "auth-shared", "uid-shared")
            results = []
            import threading
            barrier = threading.Barrier(2)

            def register(service):
                barrier.wait()
                results.append(service.register_account(account))

            threads = [threading.Thread(target=register, args=(self.service,)), threading.Thread(target=register, args=(other,))]
            for thread in threads:
                thread.start()
            for thread in threads:
                thread.join(timeout=5)
            self.assertEqual(len(results), 2)
            self.assertEqual(results[0].store_id, results[1].store_id)
        finally:
            other.close()

    def test_account_json_can_rebuild_basic_registry_index(self) -> None:
        first = self.service.register_account(FakeAccount("robot-a", "tenant-a", "DOUYIN", "私信", "auth-a", "uid-a"))
        second = self.service.register_account(FakeAccount("robot-b", "tenant-a", "DOUYIN", "评论", "auth-b", "uid-a"))
        self.assertEqual(first.store_id, second.store_id)
        account_json = self.root / "records" / "accounts" / first.store_id / "account.json"
        data = json.loads(account_json.read_text(encoding="utf-8"))
        self.assertEqual(set(data["robotIds"]), {"robot-a", "robot-b"})
        self.assertEqual(set(data["authIds"]), {"auth-a", "auth-b"})
        self.service.close()
        registry_path = self.root / "records" / "registry.sqlite"
        registry_path.unlink()
        for suffix in ("-wal", "-shm"):
            sidecar = Path(str(registry_path) + suffix)
            if sidecar.exists():
                sidecar.unlink()
        from app.services.local_records.identity import AccountRegistry
        rebuilt = AccountRegistry(self.root / "records")
        try:
            summary = rebuilt.rebuild_from_account_json()
            self.assertEqual(summary["stores"], 1)
            resolved = rebuilt.register_account(FakeAccount("robot-b", "tenant-a", "DOUYIN", "评论", "auth-b", "uid-a"))
            self.assertEqual(resolved.store_id, first.store_id)
        finally:
            rebuilt.close()
    def test_robot_rebind_creates_new_store(self) -> None:
        first = self.service.register_account(FakeAccount("robot-1", "tenant-a", "DOUYIN", "机器人", "auth-1", "uid-1"))
        second = self.service.register_account(FakeAccount("robot-1", "tenant-a", "DOUYIN", "机器人", "auth-2", "uid-2"))
        self.assertNotEqual(first.store_id, second.store_id)
        connection = sqlite3.connect(self.root / "records" / "registry.sqlite")
        try:
            current = connection.execute(
                "SELECT store_id FROM robot_bindings WHERE tenant_id='tenant-a' AND platform='DOUYIN' AND robot_id='robot-1' AND is_current=1"
            ).fetchone()[0]
            self.assertEqual(current, second.store_id)
            self.assertEqual(connection.execute("SELECT COUNT(*) FROM robot_bindings WHERE robot_id='robot-1' AND is_current=0").fetchone()[0], 1)
        finally:
            connection.close()


class PersistenceTests(unittest.TestCase):
    def setUp(self) -> None:
        self.temp = tempfile.TemporaryDirectory()
        self.root = Path(self.temp.name)
        self.service = LocalRecordService(self.root)
        self.account = FakeAccount("robot-1", "tenant-a", "DOUYIN", "机器人", "auth-1", "uid-1")
        self.registration = self.service.register_account(self.account)
        assert self.registration is not None
        self.store_id = self.registration.store_id
        self.db_path = self.root / "records" / "accounts" / self.store_id / "dialogue.sqlite"

    def tearDown(self) -> None:
        self.service.close()
        self.temp.cleanup()

    def _submit_base_records(self) -> None:
        time_fields = self.service.normalized_time(
            source_timestamp_raw="1784102400000",
            observed_at=datetime(2026, 7, 15, 8, 0, tzinfo=timezone.utc),
        )
        message = {
            "message_id": "msg-1",
            "conversation_id": "conv-1",
            "platform": "DOUYIN",
            "channel_type": "dm",
            "participant_key": "user-1",
            "participant_display": "客户甲",
            "sender_role": "user",
            "actor_source": "platform_user",
            "attribution_confidence": "verified",
            "message_type": "text",
            "text_content": "物流怎么还没更新",
            **time_fields,
        }
        self.assertTrue(self.service.submit(store_id=self.store_id, event_type="message_upsert", payload=message, event_id="event-message-1"))
        self.service.submit(
            store_id=self.store_id,
            event_type="turn_upsert",
            payload={
                "turn_id": "turn-1",
                "conversation_id": "conv-1",
                "platform": "DOUYIN",
                "channel_type": "dm",
                "participant_key": "user-1",
                "aggregated_text": "物流怎么还没更新",
                "purpose_category": "物流进度",
                "started_at_utc": time_fields["source_time_utc"],
                "ended_at_utc": time_fields["source_time_utc"],
            },
            event_id="event-turn-1",
        )
        self.service.submit(
            store_id=self.store_id,
            event_type="turn_message_link",
            payload={"turn_id": "turn-1", "message_id": "msg-1", "position": 0},
            event_id="event-turn-link-1",
        )

    def test_write_idempotency_stats_and_status_non_downgrade(self) -> None:
        self._submit_base_records()
        # Duplicate event id must not duplicate the message.
        self.service.submit(
            store_id=self.store_id,
            event_type="message_upsert",
            payload={"message_id": "msg-duplicate", "conversation_id": "conv-1", "platform": "DOUYIN"},
            event_id="event-message-1",
        )
        comment_base = {
            "comment_id": "comment-1",
            "platform": "DOUYIN",
            "video_id": "video-1",
            "author_key": "user-1",
            "text_content": "多少钱",
            "source_time_utc": "2026-07-15T08:00:00Z",
            "observed_at_utc": "2026-07-15T08:00:00Z",
            "first_observed_at_utc": "2026-07-15T08:00:00Z",
            "last_observed_at_utc": "2026-07-15T08:00:00Z",
            "time_accuracy": "exact_platform",
            "collection_status": "complete_visible_thread",
            "reply_status": "sent",
        }
        self.service.submit(store_id=self.store_id, event_type="comment_upsert", payload=comment_base, event_id="comment-sent")
        lower = dict(comment_base)
        lower.update({"collection_status": "observed", "reply_status": "not_attempted", "time_accuracy": "unknown", "source_time_utc": ""})
        self.service.submit(store_id=self.store_id, event_type="comment_upsert", payload=lower, event_id="comment-lower")
        self.service.submit(
            store_id=self.store_id,
            event_type="message_upsert",
            payload={
                "message_id": "msg-1",
                "conversation_id": "conv-1",
                "platform": "DOUYIN",
                "sender_role": "unknown",
                "actor_source": "unknown",
                "attribution_confidence": "unknown",
                "message_type": "unknown",
                "time_accuracy": "unknown",
                "source_time_utc": "",
                "observed_at_utc": "2026-07-15T08:01:00Z",
                "first_observed_at_utc": "2026-07-15T08:01:00Z",
                "last_observed_at_utc": "2026-07-15T08:01:00Z",
            },
            event_id="message-lower-quality",
        )
        self.service.submit(
            store_id=self.store_id,
            event_type="reply_attempt_upsert",
            payload={"attempt_id": "attempt-1", "target_type": "message", "target_id": "msg-1", "status": "sent", "confirmed_at_utc": "2026-07-15T08:02:00Z"},
            event_id="attempt-sent",
        )
        self.service.submit(
            store_id=self.store_id,
            event_type="reply_attempt_upsert",
            payload={"attempt_id": "attempt-1", "target_type": "message", "target_id": "msg-1", "status": "send_pending"},
            event_id="attempt-lower",
        )
        self.service.submit(
            store_id=self.store_id,
            event_type="analysis_upsert",
            payload={"analysis_id": "analysis-status", "target_type": "turn", "target_id": "turn-1", "status": "completed", "purpose_category": "物流进度"},
            event_id="analysis-completed",
        )
        self.service.submit(
            store_id=self.store_id,
            event_type="analysis_upsert",
            payload={"analysis_id": "analysis-status", "target_type": "turn", "target_id": "turn-1", "status": "pending"},
            event_id="analysis-lower",
        )
        self.service.submit(
            store_id=self.store_id,
            event_type="cursor_upsert",
            payload={"cursor_key": "cursor-1", "conversation_id": "conv-1", "cursor_type": "visible_window", "cursor": {"keys": ["a", "b", "c"]}},
            event_id="cursor-event",
        )
        self.service.close(timeout=5.0)
        wait_for(lambda: self.db_path.exists())
        connection = sqlite3.connect(self.db_path)
        try:
            self.assertEqual(connection.execute("SELECT COUNT(*) FROM messages").fetchone()[0], 1)
            row = connection.execute("SELECT collection_status, reply_status, time_accuracy FROM comments WHERE comment_id='comment-1'").fetchone()
            self.assertEqual(row, ("complete_visible_thread", "sent", "exact_platform"))
            message_row = connection.execute("SELECT sender_role, actor_source, attribution_confidence, time_accuracy, text_content FROM messages WHERE message_id='msg-1'").fetchone()
            self.assertEqual(message_row, ("user", "platform_user", "verified", "exact_platform", "物流怎么还没更新"))
            self.assertEqual(connection.execute("SELECT status FROM reply_attempts WHERE attempt_id='attempt-1'").fetchone()[0], "sent")
            self.assertEqual(connection.execute("SELECT status FROM analysis_results WHERE analysis_id='analysis-status'").fetchone()[0], "completed")
            self.assertEqual(json.loads(connection.execute("SELECT cursor_json FROM conversation_cursors WHERE cursor_key='cursor-1'").fetchone()[0]), {"keys": ["a", "b", "c"]})
        finally:
            connection.close()
        summary = self.service.stats.summary(self.store_id, days=7, now=datetime(2026, 7, 15, 12, 0, tzinfo=timezone.utc))
        self.assertEqual(summary["messages"]["userRawMessages"], 1)
        self.assertEqual(summary["messages"]["turns"], 1)
        self.assertEqual(summary["comments"]["robotConfirmedReplies"], 1)

    def test_forbidden_payload_fields_are_not_persisted(self) -> None:
        self.service.submit(
            store_id=self.store_id,
            event_type="analysis_upsert",
            payload={
                "analysis_id": "analysis-1",
                "target_type": "turn",
                "target_id": "turn-1",
                "status": "completed",
                "result": {"category": "售后", "token": "must-not-save", "nested": {"cookie": "must-not-save", "safe": "ok"}},
                "sessionData": "must-not-save",
            },
            event_id="analysis-event-1",
        )
        self.service.close(timeout=5.0)
        connection = sqlite3.connect(self.db_path)
        try:
            raw = connection.execute("SELECT result_json FROM analysis_results WHERE analysis_id='analysis-1'").fetchone()[0]
            result = json.loads(raw)
            self.assertEqual(result, {"category": "售后", "nested": {"safe": "ok"}})
            self.assertNotIn("must-not-save", raw)
        finally:
            connection.close()

    def test_sqlite_backup_api_creates_readable_copy(self) -> None:
        self._submit_base_records()
        self.service.close(timeout=5.0)
        target = self.service.backup_account(self.store_id, self.root / "backup.sqlite")
        connection = sqlite3.connect(target)
        try:
            self.assertEqual(connection.execute("SELECT COUNT(*) FROM messages").fetchone()[0], 1)
        finally:
            connection.close()


class RecoveryTests(unittest.TestCase):
    def test_pending_recovery_file_is_replayed_idempotently(self) -> None:
        with tempfile.TemporaryDirectory() as temp:
            root = Path(temp)
            bootstrap = LocalRecordService(root)
            registration = bootstrap.register_account(FakeAccount("robot-1", "tenant-a", "DOUYIN", "机器人", "auth-1", "uid-1"))
            bootstrap.close()
            event = create_event(
                store_id=registration.store_id,
                event_type="conversation_upsert",
                payload={"conversation_id": "conv-recovery", "platform": "DOUYIN", "channel_type": "dm"},
                event_id="recovery-event-1",
            )
            recovery = RecoveryStore(root / "records")
            recovery.append(event, "test")
            recovery.append(event, "test-duplicate")
            service = LocalRecordService(root)
            db_path = root / "records" / "accounts" / registration.store_id / "dialogue.sqlite"
            def recovery_applied():
                if not db_path.exists():
                    return False
                connection = sqlite3.connect(db_path)
                try:
                    return connection.execute("SELECT COUNT(*) FROM conversations").fetchone()[0] == 1
                finally:
                    connection.close()

            wait_for(recovery_applied)
            service.close(timeout=5.0)
            connection = sqlite3.connect(db_path)
            try:
                self.assertEqual(connection.execute("SELECT COUNT(*) FROM conversations").fetchone()[0], 1)
                self.assertEqual(connection.execute("SELECT COUNT(*) FROM applied_recovery_events WHERE event_id='recovery-event-1'").fetchone()[0], 1)
            finally:
                connection.close()

    def test_corrupted_recovery_line_is_quarantined_without_blocking_valid_events(self) -> None:
        with tempfile.TemporaryDirectory() as temp:
            root = Path(temp)
            bootstrap = LocalRecordService(root)
            registration = bootstrap.register_account(FakeAccount("robot-1", "tenant-a", "DOUYIN", "机器人", "auth-1", "uid-1"))
            bootstrap.close()
            recovery = RecoveryStore(root / "records")
            event = create_event(
                store_id=registration.store_id,
                event_type="conversation_upsert",
                payload={"conversation_id": "conv-valid", "platform": "DOUYIN", "channel_type": "dm"},
                event_id="valid-recovery-event",
            )
            recovery.append(event, "valid")
            with recovery.current_file.open("a", encoding="utf-8") as handle:
                handle.write("{not-valid-json}\n")
            service = LocalRecordService(root)
            db_path = root / "records" / "accounts" / registration.store_id / "dialogue.sqlite"
            def applied():
                if not db_path.exists():
                    return False
                connection = sqlite3.connect(db_path)
                try:
                    return connection.execute("SELECT COUNT(*) FROM conversations WHERE conversation_id='conv-valid'").fetchone()[0] == 1
                finally:
                    connection.close()
            wait_for(applied)
            service.close(timeout=5.0)
            self.assertTrue(any((root / "records" / "_recovery" / "quarantine").glob("*.jsonl")))


if __name__ == "__main__":
    unittest.main(verbosity=2)
