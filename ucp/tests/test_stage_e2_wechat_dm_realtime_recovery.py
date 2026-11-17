from __future__ import annotations

import ast
import unittest
from pathlib import Path


class WeChatDmRealtimeRecoveryTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls) -> None:
        cls.path = Path('app/platforms/wechat_video/session_controller.py')
        cls.source = cls.path.read_text(encoding='utf-8')
        cls.tree = ast.parse(cls.source)
        cls.functions: dict[str, str] = {}
        for node in ast.walk(cls.tree):
            if isinstance(node, (ast.FunctionDef, ast.AsyncFunctionDef)):
                cls.functions[node.name] = ast.get_source_segment(cls.source, node) or ''

    def test_empty_default_cursor_does_not_finish_bootstrap(self) -> None:
        updater = self.functions['_update_page_poll_template']
        bootstrap = self.functions['_dm_cursor_bootstrap_in_progress']
        self.assertIn('self._page_poll_candidate_template = template', updater)
        self.assertIn('if usable_cursor:', updater)
        self.assertIn('if not self._has_any_valid_dm_cursor():', bootstrap)
        self.assertNotIn('isinstance(self._page_poll_template, dict)', bootstrap)

    def test_empty_scan_cannot_enter_window_sleep_without_real_cursor(self) -> None:
        source = self.functions['_dm_can_record_window_scan']
        self.assertIn('if self._has_any_valid_dm_cursor():', source)
        self.assertNotIn('source in {"page_response", "shared_runtime_http_poll"}', source)

    def test_exact_inner_frame_tab_click_only(self) -> None:
        source = self.functions['_trigger_page_dm_tab_refresh']
        self.assertIn("verifiedFrame = ctx.url.includes('/micro/interaction/private_msg')", source)
        self.assertIn('if (!verifiedFrame) continue;', source)
        self.assertIn('unread-count badge', source)
        self.assertNotIn("t.includes('私信') && t.includes('打招呼消息')", source)

    def test_outer_navigation_match_is_rejected(self) -> None:
        source = self.functions['_handle_tab_refresh_result']
        self.assertIn('data.get("ok") and data.get("verifiedFrame")', source)
        self.assertIn('unverified_outer_navigation_match', source)

    def test_active_cursor_poll_ignores_ordinary_cooldown(self) -> None:
        source = self.functions['_maybe_trigger_cursor_active_poll']
        self.assertIn('only hard_sleep may do so', source)
        self.assertNotIn('_runtime_policy_allows_immediate_action()', source)

    def test_captured_message_wakes_policy_sleep(self) -> None:
        remaining = self.functions['_runtime_policy_remaining_sec']
        sleeper = self.functions['_sleep_runtime_policy_if_needed']
        self.assertIn('self._has_queued_dm_messages()', remaining)
        self.assertIn('self._dm_message_event.wait(wait_for)', sleeper)
        self.assertIn('self._runtime_policy_hard_sleep_remaining_sec() <= 0', sleeper)

    def test_aggregation_clock_starts_at_page_capture(self) -> None:
        queue = self.functions['_queue_dm_message_for_aggregate']
        self.assertIn('_ucpCapturedMonotonicMs', self.source)
        self.assertIn('observed_at + base_wait', queue)
        self.assertIn('"startedAt": observed_at', queue)

    def test_backend_failure_is_retried_not_marked_processed(self) -> None:
        handler = self.functions['_handle_dm_message']
        retry = self.functions['_schedule_dm_generation_retry']
        self.assertIn('return "retry_scheduled"', handler)
        self.assertIn('delays = (8, 25, 60)', retry)
        failed_branch = handler.split('if failed:', 1)[1].split('self._processed_dm_ids.update', 1)[0]
        self.assertNotIn('_processed_dm_ids.update', failed_branch)


    def test_active_poll_fallback_is_seconds_not_minutes(self) -> None:
        self.assertIn('self._dm_cursor_poll_interval_ms = 6000', self.source)
        self.assertIn('self._dm_idle_poll_wait_sec = 6.0', self.source)

    def test_after_reply_cooldown_only_records_real_send(self) -> None:
        loop = self.functions['_run_dm_loop']
        self.assertIn('if outcome == "sent":', loop)
        self.assertIn('self.runtime_policy.record_dm_reply_sent()', loop)

    def test_business_iframe_recovery_preserves_profile(self) -> None:
        source = self.functions['_maybe_recover_dm_business_session']
        self.assertIn('biz.location.reload()', source)
        for forbidden in ('deleteAllCookies', 'localStorage.clear', 'clearHttpCache'):
            self.assertNotIn(forbidden, source)

    def test_greeting_tab_capture_is_detected_from_selected_inner_tab(self) -> None:
        hook = self.functions['_network_capture_hook_js']
        self.assertIn('detectPrivateMsgTab', hook)
        self.assertIn("for (const label of ['私信', '打招呼消息'])", hook)
        self.assertIn('aria-selected', hook)

    def test_retry_state_is_runtime_only_and_restart_recoverable(self) -> None:
        start = self.functions['start']
        self.assertIn('self._dm_retry_attempts.clear()', start)
        self.assertIn('self._dm_retry_exhausted_ids.clear()', start)
        self.assertIn('重启后仍可恢复', self.functions['_handle_dm_message'])


if __name__ == '__main__':
    unittest.main()
