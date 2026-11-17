from __future__ import annotations

import sqlite3
import tempfile
import unittest
from pathlib import Path

from app.services.local_records.schema import DIALOGUE_SCHEMA_VERSION, apply_event, initialize_dialogue_schema


ROOT = Path(__file__).parents[1]


class ReplyTraceLinkTests(unittest.TestCase):
    def test_schema_v4_creates_trace_columns_and_indexes(self):
        connection = sqlite3.connect(":memory:")
        initialize_dialogue_schema(connection)
        self.assertEqual(4, DIALOGUE_SCHEMA_VERSION)
        for table, columns in {
            "messages": {"reply_trace_id", "generation_source"},
            "comments": {"reply_attempt_id", "reply_trace_id", "generation_source"},
            "reply_attempts": {"reply_trace_id", "generation_source"},
        }.items():
            actual = {row[1] for row in connection.execute(f"PRAGMA table_info({table})")}
            self.assertTrue(columns.issubset(actual), (table, actual))
        indexes = {row[1] for row in connection.execute("PRAGMA index_list(messages)")}
        self.assertIn("idx_messages_reply_trace", indexes)
        connection.close()

    def test_schema_upgrade_is_idempotent_and_preserves_rows(self):
        connection = sqlite3.connect(":memory:")
        initialize_dialogue_schema(connection)
        apply_event(connection, "old-event", "message_upsert", {
            "message_id": "m-old", "conversation_id": "c-old", "platform": "DOUYIN",
            "reply_attempt_id": "a-old",
        })
        connection.commit()
        initialize_dialogue_schema(connection)
        self.assertEqual(("m-old", "a-old", "", ""), connection.execute(
            "SELECT message_id, reply_attempt_id, reply_trace_id, generation_source FROM messages WHERE message_id='m-old'"
        ).fetchone())
        connection.close()

    def test_message_comment_and_attempt_persist_trace(self):
        connection = sqlite3.connect(":memory:")
        initialize_dialogue_schema(connection)
        apply_event(connection, "e1", "message_upsert", {
            "message_id": "m1", "conversation_id": "c1", "platform": "DOUYIN",
            "reply_attempt_id": "a1", "reply_trace_id": "tr1", "generation_source": "DEEPSEEK_RUNTIME",
        })
        apply_event(connection, "e2", "comment_upsert", {
            "comment_id": "cm1", "platform": "DOUYIN", "reply_attempt_id": "a2",
            "reply_trace_id": "tr2", "generation_source": "COZE_WORKFLOW",
        })
        apply_event(connection, "e3", "reply_attempt_upsert", {
            "attempt_id": "a1", "target_type": "message", "target_id": "m1",
            "reply_trace_id": "tr1", "generation_source": "DEEPSEEK_RUNTIME",
        })
        connection.commit()
        self.assertEqual(("a1", "tr1", "DEEPSEEK_RUNTIME"), connection.execute(
            "SELECT reply_attempt_id, reply_trace_id, generation_source FROM messages WHERE message_id='m1'"
        ).fetchone())
        self.assertEqual(("a2", "tr2", "COZE_WORKFLOW"), connection.execute(
            "SELECT reply_attempt_id, reply_trace_id, generation_source FROM comments WHERE comment_id='cm1'"
        ).fetchone())
        self.assertEqual(("tr1", "DEEPSEEK_RUNTIME"), connection.execute(
            "SELECT reply_trace_id, generation_source FROM reply_attempts WHERE attempt_id='a1'"
        ).fetchone())
        connection.close()

    def test_core_runtime_binding_no_longer_depends_on_old_prompt_fields(self):
        source = (ROOT / "app/services/auto_reply_runtime.py").read_text(encoding="utf-8")
        block = source[source.index("def auto_reply_backend_enabled"):source.index("def auto_reply_config_summary")]
        self.assertIn('provider in {"COZE", "DEEPSEEK"}', block)
        self.assertIn("account_profile_id", block)

    def test_core_client_keeps_compat_aliases_but_platforms_use_runtime_names(self):
        client = (ROOT / "app/services/core_nexus_service.py").read_text(encoding="utf-8")
        self.assertIn("def runtime_dm_reply", client)
        self.assertIn("def runtime_comment_reply", client)
        self.assertIn("return self.runtime_dm_reply(payload)", client)
        self.assertIn("return self.runtime_comment_reply(payload)", client)
        platform_sources = "\n".join(path.read_text(encoding="utf-8") for path in (ROOT / "app/platforms").rglob("*.py"))
        self.assertNotIn(".test_dm_reply(", platform_sources)
        self.assertNotIn(".test_comment_reply(", platform_sources)
        self.assertIn(".runtime_dm_reply(", platform_sources)
        self.assertIn(".runtime_comment_reply(", platform_sources)

    def test_all_four_platform_flows_propagate_trace_fields(self):
        files = [
            "app/platforms/douyin/dm/draft/draft_runtime.py",
            "app/platforms/douyin/dm/recording/record_runtime.py",
            "app/platforms/douyin/comment/reply/reply_editor.py",
            "app/platforms/douyin/comment/recording/record_runtime.py",
            "app/platforms/wechat_video/session_controller.py",
            "app/platforms/wechat_video/dm/recording_runtime.py",
            "app/platforms/wechat_video/comment/recording_runtime.py",
        ]
        combined = "\n".join((ROOT / item).read_text(encoding="utf-8") for item in files)
        self.assertGreaterEqual(combined.count("replyTraceId"), 8)
        self.assertGreaterEqual(combined.count("generationSource"), 8)
        self.assertIn("replyAttemptId", combined)
        self.assertIn("reply_trace_id", combined)
        self.assertIn("generation_source", combined)

    def test_event_whitelist_accepts_trace_fields(self):
        source = (ROOT / "app/services/local_records/events.py").read_text(encoding="utf-8")
        for event_type in ("message_upsert", "comment_upsert", "reply_attempt_upsert"):
            block_start = source.index(f'"{event_type}":')
            block_end = source.find("},", block_start)
            block = source[block_start:block_end]
            self.assertIn('"reply_trace_id"', block)
            self.assertIn('"generation_source"', block)


if __name__ == "__main__":
    unittest.main()
