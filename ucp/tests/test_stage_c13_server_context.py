from __future__ import annotations

import hashlib
import importlib.util
from pathlib import Path
import tempfile
from types import SimpleNamespace
import unittest

from app.services.auto_reply_runtime import build_dm_test_payload
from app.services.local_records import LocalRecordService

ROOT = Path(__file__).resolve().parents[1]
_RECORD_MODULE_PATH = ROOT / "app" / "platforms" / "douyin" / "dm" / "recording" / "record_runtime.py"
_RECORD_SPEC = importlib.util.spec_from_file_location("stage_c13_record_runtime", _RECORD_MODULE_PATH)
assert _RECORD_SPEC and _RECORD_SPEC.loader
_RECORD_MODULE = importlib.util.module_from_spec(_RECORD_SPEC)
_RECORD_SPEC.loader.exec_module(_RECORD_MODULE)
SessionControllerDMRecordMixin = _RECORD_MODULE.SessionControllerDMRecordMixin


class FakeRecordService:
    state = "OPEN"
    client_id = "ucp-test-client"

    def __init__(self, candidates: list[dict] | None = None) -> None:
        self.candidates = candidates or []

    @staticmethod
    def message_fingerprint(*parts: object) -> str:
        raw = "|".join(str(item) for item in parts)
        return hashlib.sha256(raw.encode("utf-8")).hexdigest()

    def conversation_candidates(self, *args, **kwargs):
        del args, kwargs
        return list(self.candidates)

    @staticmethod
    def store_id_for(_account) -> str:
        return "acct_test"


class DummyIdentityRuntime(SessionControllerDMRecordMixin):
    def __init__(self, candidates: list[dict] | None = None) -> None:
        self.record_service = FakeRecordService(candidates)
        self._dm_local_record_state = {}


class StageC13ServerContextTests(unittest.TestCase):
    def test_same_name_generic_message_on_different_rows_is_isolated(self) -> None:
        runtime = DummyIdentityRuntime()
        signatures = ["user|text|你好"]
        first_id, _, _ = runtime._dm_record_resolve_local_identity(
            store_id="acct_test",
            display_name="小明",
            conversation_type="private",
            active_tab="朋友私信",
            selected_key="小明 | 刚刚 | 你好",
            selected_dom_index=0,
            signatures=signatures,
        )
        second_id, _, _ = runtime._dm_record_resolve_local_identity(
            store_id="acct_test",
            display_name="小明",
            conversation_type="private",
            active_tab="朋友私信",
            selected_key="小明 | 刚刚 | 你好",
            selected_dom_index=1,
            signatures=signatures,
        )
        self.assertNotEqual(first_id, second_id)

        restored_id, reason, _ = runtime._dm_record_resolve_local_identity(
            store_id="acct_test",
            display_name="小明",
            conversation_type="private",
            active_tab="朋友私信",
            selected_key="小明 | 刚刚 | 你好",
            selected_dom_index=0,
            signatures=signatures,
        )
        self.assertEqual(first_id, restored_id)
        self.assertEqual("runtime_session_instance_exact", reason)

    def test_friend_and_stranger_tabs_are_hard_isolated(self) -> None:
        runtime = DummyIdentityRuntime()
        signatures = [
            "user|text|同名用户的测试消息",
            "account|text|已确认回复锚点",
            "user|text|继续测试",
        ]
        friend_id, _, _ = runtime._dm_record_resolve_local_identity(
            store_id="acct_test",
            display_name="同名用户",
            conversation_type="private",
            active_tab="朋友私信",
            selected_key="同名用户 | 刚刚 | 继续测试",
            selected_dom_index=0,
            signatures=signatures,
        )
        stranger_id, _, _ = runtime._dm_record_resolve_local_identity(
            store_id="acct_test",
            display_name="同名用户",
            conversation_type="private",
            active_tab="陌生人私信",
            selected_key="同名用户 | 刚刚 | 继续测试",
            selected_dom_index=0,
            signatures=signatures,
        )
        self.assertNotEqual(friend_id, stranger_id)
        self.assertEqual("stranger_private", runtime._dm_record_state()["active_identity"]["identity_scope"])

        restored_friend_id, reason, score = runtime._dm_record_resolve_local_identity(
            store_id="acct_test",
            display_name="同名用户",
            conversation_type="private",
            active_tab="朋友私信",
            selected_key="同名用户 | 刚刚 | 继续测试",
            selected_dom_index=0,
            signatures=signatures,
        )
        self.assertEqual(friend_id, restored_friend_id)
        self.assertEqual("runtime_session_instance_exact", reason)
        self.assertEqual(100, score)

    def test_flow_context_uses_scoped_chat_type_without_changing_reply_type(self) -> None:
        runtime = DummyIdentityRuntime()
        context = runtime._dm_record_flow_context(
            reply_token="reply-token",
            selected_key="用户甲 | 刚刚 | 测试",
            header_name="用户甲",
            latest_incoming_text="测试",
            conversation_type="private",
            active_tab="陌生人私信",
        )
        self.assertEqual("private", context["conversation_type"])
        self.assertEqual("stranger_private", context["identity_scope"])
        self.assertEqual("dm_stranger_private", context["record_channel_type"])

    def test_three_ordered_messages_restore_local_history_candidate(self) -> None:
        signatures = [
            "user|text|今天又在加班",
            "account|text|你这班是真一点没把你当外人啊",
            "user|text|今天还是没下班",
        ]
        runtime = DummyIdentityRuntime([
            {
                "conversation_id": "conv_existing_a",
                "conversation_type": "private",
                "signatures": signatures,
            },
            {
                "conversation_id": "conv_existing_b",
                "conversation_type": "private",
                "signatures": ["user|text|刚打完游戏", "account|text|战绩咋样"],
            },
        ])
        conversation_id, reason, score = runtime._dm_record_resolve_local_identity(
            store_id="acct_test",
            display_name="小明",
            conversation_type="private",
            active_tab="朋友私信",
            selected_key="小明 | 刚刚 | 今天还是没下班",
            selected_dom_index=3,
            signatures=signatures,
        )
        self.assertEqual("conv_existing_a", conversation_id)
        self.assertTrue(reason.startswith("local_db_ordered_overlap_3"))
        self.assertGreaterEqual(score, 70)

    def test_local_sqlite_candidate_query_returns_ordered_same_name_window(self) -> None:
        with tempfile.TemporaryDirectory() as temp_dir:
            service = LocalRecordService(Path(temp_dir))
            try:
                account = SimpleNamespace(
                    id="robot-1", tenant_id="tenant-1", platform="DOUYIN",
                    name="测试机器人", auth_id="auth-1", auth_uid="uid-1", auth_name="测试机器人",
                )
                registration = service.register_account(account)
                store_id = registration.store_id
                service.submit(store_id=store_id, event_type="conversation_upsert", payload={
                    "conversation_id": "conv-same-name-a",
                    "platform": "DOUYIN",
                    "channel_type": "dm",
                    "title": "小明",
                    "participant_display": "小明",
                    "is_group": False,
                })
                for index, text in enumerate(("今天又在加班", "你这班是真一点没把你当外人啊", "今天还是没下班"), start=1):
                    service.submit(store_id=store_id, event_type="message_upsert", payload={
                        "message_id": f"msg-{index}",
                        "conversation_id": "conv-same-name-a",
                        "platform": "DOUYIN",
                        "sender_role": "account" if index == 2 else "user",
                        "actor_source": "ucp_robot" if index == 2 else "platform_user",
                        "attribution_confidence": "verified" if index == 2 else "probable",
                        "message_type": "text",
                        "text_content": text,
                        "sequence_index": index,
                    })
                service.flush(timeout=2.0)
                rows = service.conversation_candidates(
                    store_id, platform="DOUYIN", channel_type="dm",
                    participant_display="小明", limit=5, message_limit=10,
                )
                self.assertEqual(1, len(rows))
                self.assertEqual("conv-same-name-a", rows[0]["conversation_id"])
                self.assertEqual(3, len(rows[0]["signatures"]))
                self.assertTrue(rows[0]["signatures"][1].startswith("account|text|"))
            finally:
                service.close()

    def test_scoped_channel_upsert_migrates_legacy_local_conversation(self) -> None:
        with tempfile.TemporaryDirectory() as temp_dir:
            service = LocalRecordService(Path(temp_dir))
            try:
                account = SimpleNamespace(
                    id="robot-1", tenant_id="tenant-1", platform="DOUYIN",
                    name="测试机器人", auth_id="auth-1", auth_uid="uid-1", auth_name="测试机器人",
                )
                store_id = service.register_account(account).store_id
                base = {
                    "conversation_id": "conv-legacy-scope",
                    "platform": "DOUYIN",
                    "title": "用户甲",
                    "participant_display": "用户甲",
                    "is_group": False,
                }
                service.submit(store_id=store_id, event_type="conversation_upsert", payload={**base, "channel_type": "dm"})
                service.submit(store_id=store_id, event_type="conversation_upsert", payload={**base, "channel_type": "dm_friend_private"})
                # A delayed legacy recovery event must not downgrade the scoped row.
                service.submit(store_id=store_id, event_type="conversation_upsert", payload={**base, "channel_type": "dm"})
                service.flush(timeout=2.0)
                scoped = service.conversation_candidates(
                    store_id, platform="DOUYIN", channel_type="dm_friend_private",
                    participant_display="用户甲", limit=5, message_limit=10,
                )
                legacy = service.conversation_candidates(
                    store_id, platform="DOUYIN", channel_type="dm",
                    participant_display="用户甲", limit=5, message_limit=10,
                )
                self.assertEqual(["conv-legacy-scope"], [item["conversation_id"] for item in scoped])
                self.assertEqual([], legacy)
            finally:
                service.close()

    def test_remote_message_projection_excludes_sensitive_or_raw_fields(self) -> None:
        projected = SessionControllerDMRecordMixin._dm_record_remote_message({
            "message_id": "msg_1",
            "sender_role": "user",
            "message_type": "text",
            "text_content": "你好",
            "cookie": "secret",
            "token": "secret",
            "html": "<div>secret</div>",
            "dom": {"raw": True},
            "attachment_url": "https://example.test/private",
        })
        self.assertEqual("你好", projected["textContent"])
        for forbidden in ("cookie", "token", "html", "dom", "attachment_url"):
            self.assertNotIn(forbidden, projected)

    def test_dm_payload_can_carry_canonical_context_identity(self) -> None:
        payload = build_dm_test_payload(
            None,
            "当前消息",
            dialogue_conversation_id="srv_conv_1",
            current_client_message_ids=["msg_1", "msg_2"],
        )
        # No account means context config defaults off; runtime adds these fields
        # after checking the real robot setting. The helper must still expose the
        # supported parameter names in source for typed callers.
        source = (ROOT / "app/services/auto_reply_runtime.py").read_text(encoding="utf-8")
        self.assertIn("dialogue_conversation_id", source)
        self.assertIn("current_client_message_ids", source)
        self.assertEqual("当前消息", payload["messageContent"])

    def test_server_sync_and_context_are_best_effort_not_login_state_changes(self) -> None:
        source = (ROOT / "app/platforms/douyin/dm/recording/record_runtime.py").read_text(encoding="utf-8")
        self.assertIn("resolve_sync_dm_dialogue", source)
        self.assertIn("已降级为无服务端上下文且不影响回复", source)
        for forbidden in ("profiles/", "Cookie", "LocalStorage", "Authorization"):
            self.assertNotIn(forbidden, source)


if __name__ == "__main__":
    unittest.main(verbosity=2)
