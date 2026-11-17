from __future__ import annotations

from pathlib import Path
import unittest


ROOT = Path(__file__).resolve().parents[1]


class StageC131PostSendSyncTests(unittest.TestCase):
    def test_confirmed_reply_schedules_remote_sync_before_payload_clear(self) -> None:
        source = (ROOT / "app/platforms/douyin/dm/send/send_runtime.py").read_text(encoding="utf-8")
        attempt_pos = source.index('_dm_record_reply_attempt(payload, status="sent"')
        sync_pos = source.index('_dm_record_schedule_post_send_remote_sync', attempt_pos)
        clear_pos = source.index('self.dm_pending_send_payload = None', sync_pos)
        self.assertLess(attempt_pos, sync_pos)
        self.assertLess(sync_pos, clear_pos)

    def test_post_send_sync_runs_after_dom_snapshot_stack_and_flushes_local_rows(self) -> None:
        source = (ROOT / "app/platforms/douyin/dm/recording/record_runtime.py").read_text(encoding="utf-8")
        self.assertIn('def _dm_record_schedule_post_send_remote_sync', source)
        self.assertIn('QTimer.singleShot(0, _submit)', source)
        self.assertIn('self._dm_record_resolve_remote_context(snapshot)', source)
        service_source = (ROOT / "app/services/local_records/service.py").read_text(encoding="utf-8")
        self.assertIn('self.flush(timeout=1.5)', service_source)

    def test_post_send_sync_failure_never_changes_send_result(self) -> None:
        source = (ROOT / "app/platforms/douyin/dm/recording/record_runtime.py").read_text(encoding="utf-8")
        self.assertIn('已忽略且不影响发送', source)
        self.assertNotIn('raise exc', source[source.index('def _dm_record_schedule_post_send_remote_sync'):])


if __name__ == "__main__":
    unittest.main(verbosity=2)
