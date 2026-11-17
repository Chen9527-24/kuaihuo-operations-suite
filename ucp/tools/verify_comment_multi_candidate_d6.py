from __future__ import annotations

from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
reply = (ROOT / "app/platforms/douyin/comment/reply/reply_editor.py").read_text(encoding="utf-8")
scripts = (ROOT / "app/platforms/douyin/comment/scripts/comment_scripts.py").read_text(encoding="utf-8")
filter_runtime = (ROOT / "app/platforms/douyin/comment/filter/filter_runtime.py").read_text(encoding="utf-8")

checks = {
    "candidate_before_expand": 'actionable = result.get("replyCandidates", []) or []' in filter_runtime,
    "defer_unrelated_expand": "评论页已有可处理候选，暂不展开其他历史线程" in filter_runtime,
    "target_cooldown": 'return "reply_open_cooling"' in reply[reply.index("def _comment_skip_reason_for_target"):reply.index("def _comment_skip_reason(")],
    "safe_reply_resolver": "safeReplyText" in scripts,
    "individual_action_click": "HTMLElement.prototype.click.call(node)" in scripts,
    "precise_dom_ladder": '"precise_dom_registered_click"' in reply[reply.index("def _comment_reply_open_methods"):reply.index("def _comment_perform_qt_view_reply_click")],
    "no_operations_delegate": '"operations_delegate_click"' not in reply[reply.index("def _comment_reply_open_methods"):reply.index("def _comment_perform_qt_view_reply_click")],
    "qt_inner_label_safe": "point_destructive" in reply and 'point_text != "回复"' not in reply,
    "delete_dialog_guard": "delete_dialog_cancelled" in scripts,
}

failed = [name for name, ok in checks.items() if not ok]
if failed:
    raise SystemExit("Comment multi-candidate D6 verification failed: " + ", ".join(failed))
print(f"Comment multi-candidate D6 verification passed: {len(checks)} checks.")
