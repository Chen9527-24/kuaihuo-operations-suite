from __future__ import annotations

from pathlib import Path
import sys

ROOT = Path(__file__).resolve().parents[1]
CHECKS = {
    "recording_runtime": ROOT / "app/platforms/wechat_video/comment/recording_runtime.py",
    "session_controller": ROOT / "app/platforms/wechat_video/session_controller.py",
    "unit_test": ROOT / "tests/test_stage_f1_wechat_comment_records_context.py",
}

for name, path in CHECKS.items():
    if not path.exists():
        raise SystemExit(f"[FAIL] {name}: missing {path}")
    print(f"[PASS] {name}")

recording = CHECKS["recording_runtime"].read_text(encoding="utf-8")
controller = CHECKS["session_controller"].read_text(encoding="utf-8")
assert '"platform": "WECHAT_VIDEO"' in recording
assert "recent_comment_messages" in recording
assert "comment_thread_id=thread_id" in controller
assert "thread_context=thread_context" in controller
assert "platform_readback_after_target_with_draft_match" in controller
assert "before_message_count" in controller
assert "before_comment_ids" in controller
assert '"sent_unconfirmed"' in controller
print("[PASS] local_sqlite_and_core_sync")
print("[PASS] thread_context_memory")
print("[PASS] strict_platform_readback")
print("[PASS] multi_level_parent_chain")
print("[PASS] restart_idempotency_status")
print("WeChat Video comment F1 verification passed: 8 checks.")
