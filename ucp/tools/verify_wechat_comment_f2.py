from __future__ import annotations

from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
controller = ROOT / "app/platforms/wechat_video/session_controller.py"
test_file = ROOT / "tests/test_stage_f2_wechat_comment_candidate_flow.py"

for name, path in (("session_controller", controller), ("f2_test", test_file)):
    if not path.exists():
        raise SystemExit(f"[FAIL] {name}: missing {path}")
    print(f"[PASS] {name}")

source = controller.read_text(encoding="utf-8")
checks = {
    "pending_not_processed": "should_reply is False" not in source[source.index("def _comment_record_is_processed"):source.index("def _log_comment_decision")],
    "candidate_details": "视频号评论识别到待判断评论" in source,
    "early_exit_reason": "视频号评论已在本次运行中完成处理，跳过重复工作流" in source,
    "workflow_result": "视频号评论工作流判断完成" in source,
    "not_required_reason": "视频号评论后端判定无需回复" in source,
    "send_result": "视频号评论回复完成" in source,
    "cycle_summary": "视频号评论本轮处理汇总" in source,
}
for name, ok in checks.items():
    if not ok:
        raise SystemExit(f"[FAIL] {name}")
    print(f"[PASS] {name}")
print(f"WeChat Video comment F2 verification passed: {len(checks)} checks.")
