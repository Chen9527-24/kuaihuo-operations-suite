from __future__ import annotations

from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
reply = (ROOT / "app/platforms/douyin/comment/reply/reply_editor.py").read_text(encoding="utf-8")
scripts = (ROOT / "app/platforms/douyin/comment/scripts/comment_scripts.py").read_text(encoding="utf-8")
method_block = reply[reply.index("def _comment_reply_open_methods"):reply.index("def _comment_perform_qt_view_reply_click")]

checks = {
    "inspect_dom_registry": "window.__ucpCommentReplyRegistry" in scripts,
    "reply_dom_key": "replyDomKey" in scripts and "replyDomKey" in reply,
    "registered_exact_click": "precise_dom_registered_click" in method_block,
    "fresh_exact_click": "precise_dom_reacquire_click" in method_block,
    "direct_dom_trigger": "HTMLElement.prototype.click.call(node)" in scripts,
    "no_approximate_top_ladder": "element_from_point_sequence" not in method_block and "hover_then_native_click" not in method_block,
    "exact_card_operations": "findOwnOperations" in scripts and "el.closest('.container-sXKyMs') === card" in scripts,
    "observation_window": "_comment_reply_open_method_observe_ms" in reply and "method_elapsed_ms >= observe_ms" in reply,
    "safe_qt_last_resort": "safeReplyAction" in reply and "point_destructive" in reply,
    "delete_guard": "delete_dialog_cancelled" in scripts,
}
failed = [name for name, ok in checks.items() if not ok]
if failed:
    raise SystemExit("Comment precise DOM D7 verification failed: " + ", ".join(failed))
print(f"Comment precise DOM D7 verification passed: {len(checks)} checks.")
