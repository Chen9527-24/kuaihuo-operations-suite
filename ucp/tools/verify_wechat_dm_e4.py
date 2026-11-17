from __future__ import annotations

import ast
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
recording = (ROOT / "app/platforms/wechat_video/dm/recording_runtime.py").read_text(encoding="utf-8")
ast.parse(recording)

checks = [
    ("outgoing_transaction_kept_for_repeated_echoes", "10 * 60 * 1000" in recording),
    ("echo_alias_keys", "def _self_echo_keys" in recording and "time-text:" in recording),
    ("repeated_echo_reuses_client_message_id", 'msg["_localMessageSeed"]' in recording),
    ("repeated_echo_reuses_reply_attempt", 'msg["_replyAttemptId"]' in recording),
    ("echo_count_diagnostic", "echoCount=" in recording),
    ("legitimate_identical_sends_preserved", '"clientMessageId": client_message_id' in recording),
]
failed = []
for name, ok in checks:
    print(f"[{'PASS' if ok else 'FAIL'}] {name}")
    if not ok:
        failed.append(name)
if failed:
    raise SystemExit("WeChat DM E4 verification failed: " + ", ".join(failed))
print(f"WeChat DM E4 verification passed: {len(checks)} checks.")
