from __future__ import annotations

from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
SCRIPTS = (ROOT / "app/platforms/douyin/comment/scripts/comment_scripts.py").read_text(encoding="utf-8")
DRAFT = (ROOT / "app/platforms/douyin/comment/reply/draft_probe.py").read_text(encoding="utf-8")
EDITOR = (ROOT / "app/platforms/douyin/comment/reply/reply_editor.py").read_text(encoding="utf-8")

checks = {
    "registry_root_card": "rootCard: meta.rootCard instanceof Element" in SCRIPTS,
    "transaction_created": "window.__ucpCommentReplyTransaction" in SCRIPTS and "state: 'reply_click_dispatched'" in SCRIPTS,
    "reply_input_classifier": SCRIPTS.count("const inTopComposerOnly = !!inputNode.closest('.content-wWJcbN')") >= 3,
    "focus_transaction_editor": "selectedBy = 'active_transaction_editor'" in SCRIPTS,
    "exact_target_editor_preferred": "findLocalReplyEditor(exactTargetCard)" in SCRIPTS and "active_transaction_target_editor" in SCRIPTS,
    "draft_transaction_editor": "txn.state = 'draft_editor_bound'" in SCRIPTS,
    "send_transaction_editor": "txn.state = 'send_editor_bound'" in SCRIPTS,
    "modern_no_broad_editor": "if (!target && !modernPayload)" in SCRIPTS and "&& (!modernPayload || txnMatches)" in SCRIPTS,
    "missing_editor_blocks_send": "不执行输入激活或发送点击" in DRAFT and "reply_editor_recovering" in DRAFT,
    "strict_count_snapshot": "snapshot_valid = bool(before_messages >= 1)" in DRAFT and "current_messages > before_messages" in DRAFT,
    "strict_draft_match": "SequenceMatcher" in DRAFT and "_comment_reply_text_matches_draft" in DRAFT,
    "strict_confirm_mode": "new_author_reply_after_target_with_draft_match" in DRAFT,
    "stale_sent_recovery": "stale_gui_sent_conflict" in EDITOR and "backend_record_stale_sent_recovery" in EDITOR,
    "snapshot_carried": '"beforeMessageCount": 1 + len(match.get("nestedReplies", []) or [])' in EDITOR,
}

failed = [name for name, ok in checks.items() if not ok]
for name, ok in checks.items():
    print(f"[{'PASS' if ok else 'FAIL'}] {name}")
if failed:
    raise SystemExit("Comment editor transaction D9 verification failed: " + ", ".join(failed))
print(f"Comment editor transaction D9 verification passed: {len(checks)} checks.")
