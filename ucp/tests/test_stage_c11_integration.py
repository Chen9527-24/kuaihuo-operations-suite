from __future__ import annotations

from pathlib import Path
import unittest

ROOT = Path(__file__).resolve().parents[1]


class StageC11IntegrationTests(unittest.TestCase):
    def test_reply_backend_uses_aggregated_message_content(self) -> None:
        draft = (ROOT / "app/platforms/douyin/dm/draft/draft_runtime.py").read_text(encoding="utf-8")
        send = (ROOT / "app/platforms/douyin/dm/send/send_runtime.py").read_text(encoding="utf-8")
        self.assertIn('reply.get("aggregatedIncomingText"', draft)
        self.assertIn("build_dm_test_payload(getattr(self, \"account\", None), message_content", draft)
        self.assertIn("_dm_build_reply_message_content", send)
        self.assertIn('context["aggregatedIncomingText"]', send)

    def test_failed_backend_reply_is_handled_before_business_skip(self) -> None:
        draft = (ROOT / "app/platforms/douyin/dm/draft/draft_runtime.py").read_text(encoding="utf-8")
        aggregate = (ROOT / "app/platforms/douyin/dm/aggregate/aggregate_runtime.py").read_text(encoding="utf-8")
        self.assertLess(draft.index('if reply_status == "failed"'), draft.index('if response.get("shouldReply") is False'))
        self.assertIn("technicalFailure", draft)
        self.assertIn("_dm_defer_technical_failure", aggregate)
        self.assertIn("未标记业务跳过", aggregate)

    def test_unread_badge_is_carried_to_pending_reply_metadata(self) -> None:
        queue = (ROOT / "app/platforms/douyin/dm/queue/unread_queue.py").read_text(encoding="utf-8")
        self.assertIn('"unreadCountHint": self._dm_unread_count_hint', queue)
        self.assertIn('"unreadCountHint": max(', queue)
        self.assertIn('unread_count_hint=int(pending_snapshot.get("unreadCountHint"', queue)

    def test_emoji_classifier_is_conservative_and_precedes_image(self) -> None:
        js = (ROOT / "app/platforms/douyin/common/js_scripts.py").read_text(encoding="utf-8")
        self.assertIn("const emojiHint", js)
        self.assertIn("dom_emoji_hint", js)
        self.assertLess(js.index("} else if (emojiHint)"), js.index("} else if (has('img, picture"))
        self.assertIn("messageType = 'emoji'; placeholder = '[表情]'", js)

    def test_duplicate_text_is_not_removed_from_aggregate_signature(self) -> None:
        utils = (ROOT / "app/services/dm_reply/utils.py").read_text(encoding="utf-8")
        self.assertNotIn("text not in recent_left", utils)
        self.assertIn("aggregatedIncomingText", utils)


if __name__ == "__main__":
    unittest.main()
