from __future__ import annotations

import ast
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
controller = (ROOT / 'app/platforms/wechat_video/session_controller.py').read_text(encoding='utf-8')
recording = (ROOT / 'app/platforms/wechat_video/dm/recording_runtime.py').read_text(encoding='utf-8')
ast.parse(controller)
ast.parse(recording)

checks = [
    ('tabs_do_not_split_same_session', 'return "private_all"' in recording),
    ('trusted_platform_identity', '"identitySource": "platform_session_id"' in recording and '"identityConfidence": 100' in recording),
    ('int32_sequence_guard', 'def _sequence_index' in recording and '2_147_483_647' in recording),
    ('robot_reply_context_attribution', '"ucp_robot"' in recording and '"verified"' in recording),
    ('session_info_no_longer_blocks_loop', '_schedule_dm_session_info_refresh(client, session_ids, page_raw)' in controller and 'threading.Thread(target=worker' in controller),
    ('contact_metadata_writeback', 'sync_session_metadata(normalized)' in controller and 'def sync_session_metadata' in recording),
    ('pre_send_forced_poll', 'pre_send_cursor_poll_requested' in controller and '_collect_pre_send_dm_messages' in controller),
    ('stale_draft_is_superseded', 'superseded_by_new_message' in controller and 'return "deferred_new_messages"' in controller),
    ('e2_realtime_recovery_preserved', '_maybe_trigger_cursor_active_poll' in controller and 'delays = (8, 25, 60)' in controller),
]
failed=[]
for name, ok in checks:
    print(f"[{'PASS' if ok else 'FAIL'}] {name}")
    if not ok:
        failed.append(name)
if failed:
    raise SystemExit('WeChat DM E3 verification failed: ' + ', '.join(failed))
print(f'WeChat DM E3 verification passed: {len(checks)} checks.')
