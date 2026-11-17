from __future__ import annotations

from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
reply = (ROOT / "app/platforms/douyin/comment/reply/reply_editor.py").read_text(encoding="utf-8")
scripts = (ROOT / "app/platforms/douyin/comment/scripts/comment_scripts.py").read_text(encoding="utf-8")
filters = (ROOT / "app/platforms/douyin/comment/filter/filter_runtime.py").read_text(encoding="utf-8")

method_start = reply.index("def _comment_reply_open_methods")
method_end = reply.index("def _comment_perform_qt_view_reply_click", method_start)
method_block = reply[method_start:method_end]
checks = [
    ("operations container fallback removed", '"operations_delegate_click"' not in method_block),
    ("exact reply action required", "textOf(el) === '回复'" in scripts),
    ("unsafe reply action rejected", "unsafe_reply_button_rejected" in scripts),
    ("delete dialog cancel guard present", "delete_dialog_cancelled" in scripts),
    ("unsafe delegate method disabled", "unsafe_operations_delegate_click_disabled" in scripts),
    ("safe Qt marker present", "safeReplyAction" in scripts),
    ("layout settle gate present", "comment_reply_expand_settle_until_ms" in filters),
    ("Qt click exact-text guard present", 'target_text != "回复"' in reply and 'point_text != "回复"' in reply),
]
failed = [name for name, ok in checks if not ok]
if failed:
    raise SystemExit("D5 safety verification failed: " + ", ".join(failed))
print(f"Comment multi-thread safety verification passed: {len(checks)} checks.")
