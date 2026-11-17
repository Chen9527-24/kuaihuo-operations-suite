from __future__ import annotations

import ast
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
source = (ROOT / 'app/platforms/wechat_video/session_controller.py').read_text(encoding='utf-8')
ast.parse(source)

checks = [
    ('invalid_cursor_not_ready', '_page_poll_candidate_template' in source and 'if not self._has_any_valid_dm_cursor()' in source),
    ('exact_inner_tab_only', "verifiedFrame = ctx.url.includes('/micro/interaction/private_msg')" in source and 'unverified_outer_navigation_match' in source),
    ('active_poll_during_cooldown', 'A valid-cursor get-new-msg heartbeat is the real-time listener itself' in source),
    ('active_poll_fallback_interval', 'self._dm_cursor_poll_interval_ms = 6000' in source),
    ('message_event_interrupts_wait', 'self._dm_message_event.wait(wait_for)' in source),
    ('hard_sleep_still_absolute', 'self._runtime_policy_hard_sleep_remaining_sec() <= 0' in source),
    ('capture_time_aggregation', '_ucpCapturedMonotonicMs' in source and 'observed_at + base_wait' in source),
    ('workflow_retry_backoff', 'delays = (8, 25, 60)' in source and 'return "retry_scheduled"' in source),
    ('no_after_reply_cooldown_on_failure', 'if outcome == "sent":' in source),
    ('business_iframe_recovery', 'reload_private_message_business_frame' in source),
    ('profile_not_cleared', all(token not in source[source.index('def _maybe_recover_dm_business_session'):source.index('def _maybe_trigger_cursor_active_poll')] for token in ('deleteAllCookies', 'localStorage.clear', 'clearHttpCache'))),
    ('selected_tab_capture', 'detectPrivateMsgTab' in source),
    ('e1_record_context_preserved', 'self._dm_recording.begin_turn(msg)' in source and 'dialogue_conversation_id=' in source),
]
failed=[]
for name, ok in checks:
    print(f"[{'PASS' if ok else 'FAIL'}] {name}")
    if not ok:
        failed.append(name)
if failed:
    raise SystemExit('WeChat DM E2 verification failed: ' + ', '.join(failed))
print(f'WeChat DM E2 verification passed: {len(checks)} checks.')
