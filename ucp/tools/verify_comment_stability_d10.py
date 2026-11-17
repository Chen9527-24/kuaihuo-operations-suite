from __future__ import annotations

from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
checks = {
    "preopen_transaction_hold": "preopen_ready_hold_existing_open_transaction" in (ROOT / "app/platforms/douyin/comment/reply/reply_editor.py").read_text(encoding="utf-8"),
    "pending_editor_rebind": "_comment_probe_pending_reply_editor_binding" in (ROOT / "app/platforms/douyin/comment/reply/reply_editor.py").read_text(encoding="utf-8"),
    "unique_global_transaction_editor": all(token in (ROOT / "app/platforms/douyin/comment/scripts/comment_scripts.py").read_text(encoding="utf-8") for token in ["globalMatches.length === 1", "transactionOpenedFromEmpty", "Number(txn.beforeEditorCount || 0) === 0"]),
    "refresh_wait_marker_retained": all(token in (ROOT / "app/platforms/douyin/comment/filter/filter_runtime.py").read_text(encoding="utf-8") for token in ["Keep the due marker until the refresh actually starts", "existing_work_key == work_key"]),
    "send_enable_poll": "sendButtonPollCount" in (ROOT / "app/platforms/douyin/comment/reply/draft_probe.py").read_text(encoding="utf-8"),
    "transaction_diagnostics": '"editorDomKey": result.get("editorDomKey", "")' in (ROOT / "app/platforms/douyin/comment/reply/draft_probe.py").read_text(encoding="utf-8"),
    "account_owner_prompt": "作品发布账号本人或账号运营者" in (ROOT / "app/services/comment_reply/prompting.py").read_text(encoding="utf-8"),
}
failed = [name for name, ok in checks.items() if not ok]
if failed:
    raise SystemExit("D10 verification failed: " + ", ".join(failed))
print(f"Comment stability D10 verification passed: {len(checks)} checks.")
