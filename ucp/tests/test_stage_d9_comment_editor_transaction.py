from __future__ import annotations

from pathlib import Path
import unittest

ROOT = Path(__file__).resolve().parents[1]
SCRIPTS = (ROOT / "app/platforms/douyin/comment/scripts/comment_scripts.py").read_text(encoding="utf-8")
DRAFT = (ROOT / "app/platforms/douyin/comment/reply/draft_probe.py").read_text(encoding="utf-8")
EDITOR = (ROOT / "app/platforms/douyin/comment/reply/reply_editor.py").read_text(encoding="utf-8")


class CommentEditorTransactionD9Tests(unittest.TestCase):
    def test_registry_keeps_root_card_for_nested_target(self) -> None:
        self.assertIn("rootCard: meta.rootCard instanceof Element", SCRIPTS)
        self.assertIn("registerReplyDom(item.replyDomKey", SCRIPTS)
        self.assertIn("rootCard: card", SCRIPTS)

    def test_open_creates_exact_target_transaction(self) -> None:
        self.assertIn("window.__ucpCommentReplyTransaction", SCRIPTS)
        self.assertIn("transactionId", SCRIPTS)
        self.assertIn("replyDomKey: candidate.replyDomKey", SCRIPTS)
        self.assertIn("targetMessageKey: candidate.targetMessageKey", SCRIPTS)
        self.assertIn("state: 'reply_click_dispatched'", SCRIPTS)

    def test_editor_classifier_does_not_misclassify_reply_input_as_top_composer(self) -> None:
        self.assertGreaterEqual(SCRIPTS.count("const inTopComposerOnly = !!inputNode.closest('.content-wWJcbN')"), 3)
        self.assertIn("!!cancelNode || !!sendNode || !!replyWrapper", SCRIPTS)
        self.assertIn("isReplyScoped && !inTopComposerOnly", SCRIPTS)

    def test_focus_draft_and_send_reuse_same_transaction_editor(self) -> None:
        self.assertIn("selectedBy = 'active_transaction_editor'", SCRIPTS)
        self.assertIn("active_transaction_target_editor", SCRIPTS)
        self.assertIn("reply_registry_target_editor", SCRIPTS)
        self.assertIn("findLocalReplyEditor(exactTargetCard)", SCRIPTS)
        self.assertIn("resolvedBy = 'active_transaction_editor'", SCRIPTS)
        self.assertIn("txn.state = 'draft_editor_bound'", SCRIPTS)
        self.assertIn("txn.state = 'send_editor_bound'", SCRIPTS)
        self.assertIn("data-ucp-editor-transaction", SCRIPTS)

    def test_modern_payload_cannot_use_arbitrary_editor(self) -> None:
        self.assertGreaterEqual(SCRIPTS.count("const modernPayload = !!(payload.replyDomKey || payload.targetMessageKey)"), 2)
        self.assertIn("if (!target && !modernPayload)", SCRIPTS)
        self.assertIn("&& (!modernPayload || txnMatches)", SCRIPTS)
        self.assertIn("state: 'target_editor_missing'", SCRIPTS)

    def test_missing_editor_hard_stops_before_nudge_or_send(self) -> None:
        start = DRAFT.index("def _handle_comment_native_send_focus_result")
        end = DRAFT.index("def _comment_perform_qt_native_text_nudge", start)
        block = DRAFT[start:end]
        self.assertIn("不执行输入激活或发送点击", block)
        self.assertIn("return", block)
        self.assertIn("reply_editor_recovering", block)
        self.assertIn("editorRecoveryCount", block)

    def test_send_confirmation_requires_new_matching_author_message(self) -> None:
        self.assertIn("SequenceMatcher", DRAFT)
        self.assertIn("snapshot_valid = bool(before_messages >= 1)", DRAFT)
        self.assertIn("current_messages > before_messages", DRAFT)
        self.assertIn("item_index <= target_index", DRAFT)
        self.assertIn("_comment_reply_text_matches_draft", DRAFT)
        self.assertIn("new_author_reply_after_target_with_draft_match", DRAFT)
        confirm_start = DRAFT.index("def _maybe_confirm_comment_reply_send")
        confirm_end = DRAFT.index("def _maybe_confirm_comment_draft_probe", confirm_start)
        confirm_block = DRAFT[confirm_start:confirm_end]
        self.assertNotIn('confirm_mode = "author_reply_visible"', confirm_block)

    def test_unconfirmed_send_is_retryable_not_completed(self) -> None:
        self.assertIn("send_timeout_unconfirmed", DRAFT)
        self.assertIn("send_timeout_retryable", DRAFT)
        self.assertIn("self.comment_last_send_signature = \"\"", DRAFT)
        self.assertIn("status=\"failed\"", DRAFT)

    def test_old_false_sent_record_can_recover_when_page_still_unreplied(self) -> None:
        self.assertIn("page_marks_current_message_unreplied", EDITOR)
        self.assertIn("stale_gui_sent_conflict", EDITOR)
        self.assertIn("backend_record_stale_sent_recovery", EDITOR)
        self.assertIn("页面未出现对应作者新回复", EDITOR)

    def test_pre_send_snapshot_is_carried_into_pending_payload(self) -> None:
        self.assertIn('"beforeNestedReplyCount": len(match.get("nestedReplies", []) or [])', EDITOR)
        self.assertIn('"beforeMessageCount": 1 + len(match.get("nestedReplies", []) or [])', EDITOR)
        self.assertIn('"beforeMessageCount": int(target.get("beforeMessageCount", 0) or 0)', DRAFT)


if __name__ == "__main__":
    unittest.main()
