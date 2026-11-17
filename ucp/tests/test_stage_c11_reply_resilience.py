from __future__ import annotations

from pathlib import Path
import importlib.util
import sys
import types
import unittest


# The production mixin imports QTimer, but these tests only exercise pure helper
# methods. Provide a tiny stub so the module can be loaded in minimal CI.
if "PySide6" not in sys.modules:
    pyside = types.ModuleType("PySide6")
    qtcore = types.ModuleType("PySide6.QtCore")

    class _Timer:
        @staticmethod
        def singleShot(*_args, **_kwargs):
            return None

    qtcore.QTimer = _Timer
    pyside.QtCore = qtcore
    sys.modules["PySide6"] = pyside
    sys.modules["PySide6.QtCore"] = qtcore

ROOT = Path(__file__).resolve().parents[1]

# Avoid executing app.platforms.douyin.__init__, which imports the full WebEngine
# controller. The aggregate mixin only needs submodules under this package.
douyin_package = types.ModuleType("app.platforms.douyin")
douyin_package.__path__ = [str(ROOT / "app/platforms/douyin")]
sys.modules.setdefault("app.platforms.douyin", douyin_package)

AGGREGATE_PATH = ROOT / "app/platforms/douyin/dm/aggregate/aggregate_runtime.py"
SPEC = importlib.util.spec_from_file_location("stage_c11_aggregate_runtime", AGGREGATE_PATH)
assert SPEC and SPEC.loader
MODULE = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(MODULE)
SessionControllerDMAggregateMixin = MODULE.SessionControllerDMAggregateMixin


class FakeController(SessionControllerDMAggregateMixin):
    def __init__(self) -> None:
        self.now_ms = 10_000
        self.dm_pending_reply_meta = {}
        self.dm_technical_retry_states = {}
        self.dm_opened_unreplied_keys = set()
        self.dm_skip_next_aggregate_signature = ""
        self.logs = []
        self.scheduled = []
        self.released = []
        self.cleared_pending = []
        self.dm_reply_aggregate_window = None

    def _now_ms(self):
        return self.now_ms

    def _pending_dm_reply_meta(self, key):
        return self.dm_pending_reply_meta.get(key, {})

    def _session_key(self, selected):
        return str((selected or {}).get("sessionKey", "") or "")

    def _schedule_fast_dm_inspect(self, delay):
        self.scheduled.append(delay)

    def _release_dm_session_lock(self, selected_key, reply_token):
        self.released.append((selected_key, reply_token))

    def _clear_dm_pending_reply(self, key):
        self.cleared_pending.append(key)
        self.dm_pending_reply_meta.pop(key, None)

    def _log(self, level, message):
        self.logs.append((level, message))


class StageC11ReplyResilienceTests(unittest.TestCase):
    def setUp(self) -> None:
        self.controller = FakeController()

    def test_unread_batch_aggregates_text_and_excludes_pure_emoji(self) -> None:
        selected_key = "客户甲|刚刚"
        self.controller.dm_pending_reply_meta[selected_key] = {"unreadCountHint": 3}
        context = {
            "visibleBubbleSamples": [
                {"side": "right", "recordText": "上一轮回复", "recordMessageType": "text"},
                {"side": "left", "recordText": "你好呀", "recordMessageType": "text"},
                {"side": "left", "recordText": "今天上班累死了", "recordMessageType": "text"},
                {"side": "left", "recordText": "", "recordMessageType": "emoji", "recordPlaceholder": "[表情]"},
            ]
        }
        result = self.controller._dm_build_reply_message_content(
            {"latestIncomingText": "今天上班累死了", "conversationType": "private"},
            context,
            selected_key=selected_key,
        )
        self.assertEqual(result, "你好呀\n今天上班累死了")
        self.assertNotIn("[表情]", result)

    def test_repeated_text_messages_are_preserved_in_order(self) -> None:
        selected_key = "客户甲|刚刚"
        self.controller.dm_pending_reply_meta[selected_key] = {"unreadCountHint": 3}
        context = {
            "visibleBubbleSamples": [
                {"side": "left", "recordText": "在吗", "recordMessageType": "text"},
                {"side": "left", "recordText": "在吗", "recordMessageType": "text"},
                {"side": "left", "recordText": "在吗", "recordMessageType": "text"},
            ]
        }
        result = self.controller._dm_build_reply_message_content(
            {"latestIncomingText": "在吗", "conversationType": "private"},
            context,
            selected_key=selected_key,
        )
        self.assertEqual(result, "在吗\n在吗\n在吗")

    def test_last_outgoing_is_used_as_fallback_batch_boundary(self) -> None:
        context = {
            "visibleBubbleSamples": [
                {"side": "left", "recordText": "很久以前", "recordMessageType": "text"},
                {"side": "right", "recordText": "之前回复", "recordMessageType": "text"},
                {"side": "left", "recordText": "新消息一", "recordMessageType": "text"},
                {"side": "left", "recordText": "新消息二", "recordMessageType": "text"},
            ]
        }
        result = self.controller._dm_build_reply_message_content(
            {"latestIncomingText": "新消息二", "conversationType": "private"},
            context,
            selected_key="客户甲",
        )
        self.assertEqual(result, "新消息一\n新消息二")


    def test_text_plus_app_only_card_keeps_text_for_reply(self) -> None:
        selected_key = "客户甲|刚刚|请打开抖音app查看"
        self.controller.dm_pending_reply_meta[selected_key] = {"unreadCountHint": 2, "activeTab": "朋友私信"}
        context = {
            "visibleBubbleSamples": [
                {"side": "right", "recordText": "上一轮回复", "recordMessageType": "text"},
                {"side": "left", "recordText": "终于下班了", "recordMessageType": "text"},
                {
                    "side": "left",
                    "recordText": "",
                    "recordMessageType": "unknown",
                    "recordPlaceholder": "[其他类型消息]",
                    "recordSourceTypeCode": "dom_app_only_unknown",
                    "recordAppOnlyPlaceholder": True,
                    "text": "你收到一条新类型消息，请打开抖音app查看",
                },
            ],
            "activeTabText": "朋友私信",
            "conversationType": "private",
        }
        reply = {
            "state": "blocked_app_only",
            "canReply": False,
            "skipReason": "请打开抖音app查看",
            "blockPhrase": "请打开抖音app查看",
            "latestIncomingText": "终于下班了",
            "activeTabText": "朋友私信",
            "conversationType": "private",
        }
        content = self.controller._dm_build_reply_message_content(
            reply, context, selected_key=selected_key, require_reliable_boundary=True
        )
        self.assertEqual("终于下班了", content)

        result = {
            "selectedSession": {"sessionKey": selected_key, "selected": True},
            "replyReadiness": reply,
            "conversationContext": context,
        }
        changed = self.controller._dm_normalize_non_text_reply_readiness(result)
        self.assertTrue(changed)
        self.assertTrue(result["replyReadiness"]["canReply"])
        self.assertEqual("reply_ready", result["replyReadiness"]["state"])
        self.assertEqual("终于下班了", result["replyReadiness"]["aggregatedIncomingText"])
        self.assertIsNone(result["replyReadiness"]["skipReason"])

    def test_text_plus_invisible_app_only_card_uses_unread_boundary(self) -> None:
        selected_key = "客户甲|刚刚|请打开抖音app查看"
        self.controller.dm_pending_reply_meta[selected_key] = {"unreadCountHint": 2, "activeTab": "朋友私信"}
        # Some Douyin app-only cards do not render as a desktop message bubble.
        # The unread badge still says 2, while the panel exposes only the text.
        context = {
            "visibleBubbleSamples": [
                {"side": "right", "recordText": "上一轮回复", "recordMessageType": "text"},
                {"side": "left", "recordText": "终于下班了", "recordMessageType": "text"},
            ],
            "activeTabText": "朋友私信",
            "conversationType": "private",
        }
        reply = {
            "state": "blocked_app_only",
            "canReply": False,
            "skipReason": "请打开抖音app查看",
            "blockPhrase": "请打开抖音app查看",
            "latestIncomingText": "终于下班了",
            "activeTabText": "朋友私信",
            "conversationType": "private",
        }
        result = {
            "selectedSession": {"sessionKey": selected_key, "selected": True},
            "replyReadiness": reply,
            "conversationContext": context,
        }
        self.assertTrue(self.controller._dm_normalize_non_text_reply_readiness(result))
        self.assertEqual("终于下班了", result["replyReadiness"]["aggregatedIncomingText"])

    def test_invisible_pure_app_only_card_after_reply_stays_blocked(self) -> None:
        selected_key = "客户甲|刚刚|请打开抖音app查看"
        self.controller.dm_pending_reply_meta[selected_key] = {"unreadCountHint": 1, "activeTab": "朋友私信"}
        context = {
            "visibleBubbleSamples": [
                {"side": "left", "recordText": "之前已经回复过的文字", "recordMessageType": "text"},
                {"side": "right", "recordText": "上一轮回复", "recordMessageType": "text"},
            ],
            "activeTabText": "朋友私信",
            "conversationType": "private",
        }
        reply = {
            "state": "blocked_app_only",
            "canReply": False,
            "skipReason": "请打开抖音app查看",
            "blockPhrase": "请打开抖音app查看",
            "latestIncomingText": "之前已经回复过的文字",
            "activeTabText": "朋友私信",
            "conversationType": "private",
        }
        result = {
            "selectedSession": {"sessionKey": selected_key, "selected": True},
            "replyReadiness": reply,
            "conversationContext": context,
        }
        self.assertFalse(self.controller._dm_normalize_non_text_reply_readiness(result))
        self.assertFalse(result["replyReadiness"]["canReply"])
        self.assertEqual("blocked_app_only", result["replyReadiness"]["state"])

    def test_pure_app_only_unknown_message_stays_blocked(self) -> None:
        selected_key = "客户甲|刚刚|请打开抖音app查看"
        self.controller.dm_pending_reply_meta[selected_key] = {"unreadCountHint": 1, "activeTab": "朋友私信"}
        context = {
            "visibleBubbleSamples": [
                {"side": "right", "recordText": "上一轮回复", "recordMessageType": "text"},
                {
                    "side": "left",
                    "recordText": "",
                    "recordMessageType": "unknown",
                    "recordPlaceholder": "[其他类型消息]",
                    "recordSourceTypeCode": "dom_app_only_unknown",
                    "recordAppOnlyPlaceholder": True,
                    "text": "你收到一条新类型消息，请打开抖音app查看",
                },
            ],
            "activeTabText": "朋友私信",
            "conversationType": "private",
        }
        reply = {
            "state": "blocked_app_only",
            "canReply": False,
            "skipReason": "请打开抖音app查看",
            "blockPhrase": "请打开抖音app查看",
            "latestIncomingText": "你收到一条新类型消息，请打开抖音app查看",
            "activeTabText": "朋友私信",
            "conversationType": "private",
        }
        result = {
            "selectedSession": {"sessionKey": selected_key, "selected": True},
            "replyReadiness": reply,
            "conversationContext": context,
        }
        changed = self.controller._dm_normalize_non_text_reply_readiness(result)
        self.assertFalse(changed)
        self.assertFalse(result["replyReadiness"]["canReply"])
        self.assertEqual("blocked_app_only", result["replyReadiness"]["state"])
        self.assertEqual(
            "",
            self.controller._dm_build_reply_message_content(
                reply, context, selected_key=selected_key, require_reliable_boundary=True
            ),
        )

    def test_text_attached_to_non_text_is_kept_but_placeholder_is_not(self) -> None:
        selected_key = "客户乙|刚刚"
        self.controller.dm_pending_reply_meta[selected_key] = {"unreadCountHint": 2}
        context = {
            "visibleBubbleSamples": [
                {
                    "side": "left",
                    "recordText": "这个活动我能参加吗",
                    "recordHasExplicitText": True,
                    "recordMessageType": "card",
                    "recordPlaceholder": "[卡片]",
                },
                {
                    "side": "left",
                    "recordText": "",
                    "recordHasExplicitText": False,
                    "recordMessageType": "unknown",
                    "recordPlaceholder": "[其他类型消息]",
                },
            ]
        }
        content = self.controller._dm_build_reply_message_content(
            {"conversationType": "private"}, context, selected_key=selected_key
        )
        self.assertEqual("这个活动我能参加吗", content)
        self.assertNotIn("[卡片]", content)
        self.assertNotIn("[其他类型消息]", content)

    def test_first_retry_keeps_pending_and_does_not_mark_skip(self) -> None:
        key = "sig-1"
        selected = "客户甲|刚刚"
        self.controller.dm_opened_unreplied_keys.add(selected)
        self.controller.dm_pending_reply_meta[selected] = {"messageSignature": key}
        scheduled = self.controller._dm_defer_technical_failure(
            retry_key=key,
            selected_key=selected,
            reply_token="reply-token",
            message_signature=key,
            reason="fetch failed",
            retryable=True,
            aggregate_signature="aggregate-1",
        )
        self.assertTrue(scheduled)
        self.assertIn(selected, self.controller.dm_opened_unreplied_keys)
        self.assertNotIn(selected, self.controller.cleared_pending)
        self.assertEqual(self.controller.dm_skip_next_aggregate_signature, "aggregate-1")
        self.assertEqual(self.controller.dm_technical_retry_states[key]["attempts"], 1)
        self.assertTrue(self.controller.scheduled)

    def test_second_failure_defers_without_business_skip(self) -> None:
        key = "sig-2"
        selected = "客户甲|刚刚"
        self.controller.dm_opened_unreplied_keys.add(selected)
        self.controller.dm_pending_reply_meta[selected] = {"messageSignature": key}
        self.controller.dm_technical_retry_states[key] = {"attempts": 1}
        scheduled = self.controller._dm_defer_technical_failure(
            retry_key=key,
            selected_key=selected,
            reply_token="reply-token",
            message_signature=key,
            reason="fetch failed again",
            retryable=True,
        )
        self.assertFalse(scheduled)
        self.assertNotIn(selected, self.controller.dm_opened_unreplied_keys)
        self.assertIn(selected, self.controller.cleared_pending)
        self.assertGreater(self.controller.dm_technical_retry_states[key]["exhaustedUntil"], self.controller.now_ms)
        rendered = "\n".join(message for _, message in self.controller.logs)
        self.assertIn("未标记业务跳过", rendered)

    def test_exhausted_cooldown_expiry_resets_retry_budget(self) -> None:
        self.controller.dm_technical_retry_states["old"] = {
            "attempts": 1,
            "exhaustedUntil": self.controller.now_ms - 1,
        }
        blocked, delay = self.controller._dm_technical_retry_blocked("old")
        self.assertFalse(blocked)
        self.assertEqual(delay, 0)
        self.assertNotIn("old", self.controller.dm_technical_retry_states)

    def test_non_retryable_failure_is_deferred_without_automatic_retry(self) -> None:
        scheduled = self.controller._dm_defer_technical_failure(
            retry_key="quota",
            selected_key="客户甲",
            reply_token="reply-token",
            message_signature="quota",
            reason="free quota used up",
            retryable=False,
        )
        self.assertFalse(scheduled)
        self.assertEqual(self.controller.dm_technical_retry_states["quota"]["attempts"], 0)
        self.assertGreater(self.controller.dm_technical_retry_states["quota"]["exhaustedUntil"], self.controller.now_ms)


if __name__ == "__main__":
    unittest.main()
