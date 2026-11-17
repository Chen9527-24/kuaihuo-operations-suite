from __future__ import annotations

from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
scripts = (ROOT / "app/platforms/douyin/comment/scripts/comment_scripts.py").read_text(encoding="utf-8")
reply = (ROOT / "app/platforms/douyin/comment/reply/reply_editor.py").read_text(encoding="utf-8")
filter_runtime = (ROOT / "app/platforms/douyin/comment/filter/filter_runtime.py").read_text(encoding="utf-8")
open_start = scripts.index("def build_comment_open_reply_editor_script")
selection_start = scripts.index("let selectedBy = ''", open_start)
selection_end = scripts.index("if (!candidate || !candidate.replyBtn)", selection_start)
selection_block = scripts[selection_start:selection_end]

checks = {
    "action_first_registered": "clickNode = registryEntry.replyAction || registryEntry.replyLabel" in scripts,
    "action_first_reacquire": "clickNode = candidate.replyAction || candidate.replyLabel || candidate.replyBtn" in scripts,
    "modern_precise_selection": "reply_dom_key" in selection_block and "target_message_key" in selection_block,
    "no_broad_modern_fallback": "selectedBy = 'threadKey'" not in selection_block and "selectedBy = 'author_content'" not in selection_block,
    "legacy_only_without_keys": "!payload.replyDomKey && !payload.targetMessageKey" in selection_block,
    "per_target_attempt": "def _comment_next_reply_open_attempt_no" in reply and reply.count("attempt_no = self._comment_next_reply_open_attempt_no(target)") == 2,
    "precise_dom_diag": "评论精准回复DOM触发完成" in reply and '"domRole"' in reply,
    "refresh_wait_idempotent": "same_wait = bool" in filter_runtime and "comment_same_work_refresh_wait_due_ms" in filter_runtime,
    "refresh_wait_throttled": "now_ms - last_log_ms >= 30000" in filter_runtime,
    "delete_guard_preserved": "delete_dialog_cancelled" in scripts,
    "context_and_records_untouched": "replyDomKey" in scripts and "contextCount" in reply,
}
failed = [name for name, ok in checks.items() if not ok]
if failed:
    raise SystemExit("Comment DOM action D8 verification failed: " + ", ".join(failed))
print(f"Comment DOM action D8 verification passed: {len(checks)} checks.")
