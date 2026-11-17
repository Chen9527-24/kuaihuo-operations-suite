from __future__ import annotations

import json
import os
import sys
import tempfile
import time
import types
import unittest
from unittest.mock import patch
from pathlib import Path

if "playwright.sync_api" not in sys.modules:
    playwright_module = types.ModuleType("playwright")
    sync_api_module = types.ModuleType("playwright.sync_api")
    sync_api_module.BrowserContext = object
    sync_api_module.Page = object
    sync_api_module.Response = object
    sync_api_module.Locator = object
    sync_api_module.Request = object
    sync_api_module.Browser = object
    sync_api_module.Playwright = object
    sync_api_module.sync_playwright = object
    sync_api_module.__getattr__ = lambda _name: object
    sys.modules["playwright"] = playwright_module
    sys.modules["playwright.sync_api"] = sync_api_module

if "requests" not in sys.modules:
    requests_module = types.ModuleType("requests")

    class _Session:
        trust_env = False

        def request(self, *args, **kwargs):
            raise RuntimeError("requests stub does not support HTTP")

    requests_module.Session = _Session
    requests_module.RequestException = Exception
    sys.modules["requests"] = requests_module

from src.account_sync_service import AccountSyncService
from src.cli import _intercept_sync_dry_run_enabled, _mark_schedule_completed_if_terminal, _sync_intercept_result, build_parser
from src.intercept_recovery import InterceptRunManifest, InterceptStopController
from src.models import ContentRecord, RunResult
from src.robot_config import normalize_intercept_config
from src.robot_runner import InterceptRobotRunner
from src.speech_analysis import _media_candidate_key
from src.storage import cleanup_output_retention


def make_config():
    return normalize_intercept_config(
        {
            "targetMode": "homepage",
            "homepageTargets": [{"url": "https://www.douyin.com/user/a", "enabled": True}],
            "collect": {"headless": "false", "saveDebugFiles": "false"},
            "speech": {"enabled": "false"},
            "workDecision": {"enabled": "true", "workflowId": "workflow-industrial-ac", "failStrategy": "RUN"},
            "schedule": {"timezone": "Asia/Singapore"},
        },
        robot_id="r-resilience",
        name="resilience-test",
        platform="douyin",
        account_alias="account",
    )


def make_content(content_id: str = "v1") -> ContentRecord:
    return ContentRecord(
        platform="douyin",
        source_account_url="https://www.douyin.com/user/a",
        source_content_url=f"https://www.douyin.com/video/{content_id}",
        platform_content_id=content_id,
        caption="caption",
        publish_time_raw=None,
        publish_time_iso=None,
        duration_raw=None,
        duration_sec=None,
        comments=[],
    )


class _DecisionClient:
    def __init__(self, response=None, error=None):
        self.response = response or {"ok": True, "shouldRun": True, "reason": "ok"}
        self.error = error
        self.workflow_ids: list[str | None] = []

    def run_intercept_work_decision(self, robot_id, video, bp=None, acct=None, workflow_id=None):
        self.workflow_ids.append(workflow_id)
        if self.error:
            raise self.error
        return self.response


class _PartialHomepageService:
    """Fake account service that checkpoints one work and leaves the next pending."""

    def __init__(self, *args, **kwargs):
        pass

    def sync_account_api(self, **kwargs):
        done = make_content("v-done")
        pending = make_content("v-pending")
        callback = kwargs["progress_callback"]
        callback("posts_discovered", {"items": [done, pending]})
        callback("post_started", {"item": done})
        callback("post_completed", {"item": done, "status": "COMPLETED"})
        output_dir = Path(kwargs["run_id"] and tempfile.mkdtemp() or tempfile.mkdtemp())
        summary_path = output_dir / "summary.json"
        summary_path.write_text("{}", encoding="utf-8")
        return (
            RunResult(
                run_id=kwargs["run_id"],
                platform="douyin",
                homepage_url=kwargs["homepage_url"],
                account_alias=kwargs["account_alias"],
                generated_at="2026-06-30T00:00:00+00:00",
                items=[done, pending],
            ),
            summary_path,
        )


class InterceptResilienceTests(unittest.TestCase):
    def test_config_preserves_workflow_id_and_strict_false_values(self):
        config = make_config()
        self.assertEqual(config.work_decision_workflow_id, "workflow-industrial-ac")
        self.assertFalse(config.headless)
        self.assertFalse(config.save_debug_files)
        self.assertFalse(config.speech_enabled)
        self.assertTrue(config.work_decision_enabled)
        self.assertEqual(config.timezone, "Asia/Singapore")

    def test_work_decision_passes_configured_workflow_and_honors_run_on_error(self):
        item = make_content()
        client = _DecisionClient(error=RuntimeError("backend unavailable"))
        service = AccountSyncService("douyin", context=None, output_dir=Path(tempfile.mkdtemp()), core_client=client, robot_id="r1")
        payload = service._run_work_decision(item, fail_strategy="RUN", workflow_id="workflow-a")
        self.assertEqual(client.workflow_ids, ["workflow-a"])
        self.assertTrue(payload["should_collect_comments"])
        self.assertEqual(item.work_decision_status, "FAILED_CONTINUE")
        self.assertEqual(item.work_decision_workflow_id, "workflow-a")

    def test_work_decision_uses_configured_id_when_response_does_not_echo_it(self):
        item = make_content()
        client = _DecisionClient(response={"ok": True, "shouldRun": False, "reason": "irrelevant"})
        service = AccountSyncService("douyin", context=None, output_dir=Path(tempfile.mkdtemp()), core_client=client, robot_id="r1")
        service._run_work_decision(item, fail_strategy="SKIP", workflow_id="workflow-a")
        self.assertEqual(client.workflow_ids, ["workflow-a"])
        self.assertEqual(item.work_decision_workflow_id, "workflow-a")
        self.assertEqual(item.work_decision_status, "SKIPPED")

    def test_semantic_media_key_dedupes_signed_douyin_cdn_variants(self):
        left = _media_candidate_key("https://v26-web.douyinvod.com/abc/video/tos/cn/file.mp4?a=1&x=foo")
        right = _media_candidate_key("https://v11-weba.douyinvod.com/abc/video/tos/cn/file.mp4?a=2&signature=bar")
        self.assertEqual(left, right)

    def test_manifest_resumes_only_pending_posts_and_preserves_completed_results(self):
        config = make_config()
        with tempfile.TemporaryDirectory() as tmp:
            base = Path(tmp)
            manifest = InterceptRunManifest.create(
                base,
                config,
                "20260630_160614",
                [{"type": "homepage", "url": "https://www.douyin.com/user/a", "label": "A"}],
            )
            target_key = manifest.target_key_for("homepage", "https://www.douyin.com/user/a", 1)
            completed = make_content("v-completed")
            pending = make_content("v-pending")
            manifest.mark_target_started(target_key)
            manifest.register_posts(target_key, [completed, pending])
            manifest.mark_post_started(target_key, completed)
            manifest.mark_post_completed(target_key, completed, status="COMPLETED")
            manifest.mark_post_started(target_key, pending)
            manifest.set_status("STOPPED", "manual")

            reopened = InterceptRunManifest.find_latest(base, config)
            self.assertIsNotNone(reopened)
            assert reopened is not None
            self.assertEqual([item.platform_content_id for item in reopened.pending_posts(target_key)], ["v-pending"])
            self.assertEqual([item.platform_content_id for item in reopened.completed_items()], ["v-completed"])
            self.assertEqual(reopened.unfinished_targets(), 1)

    def test_stop_controller_is_isolated_by_robot_id(self):
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            first = InterceptStopController(root, "robot-a")
            second = InterceptStopController(root, "robot-b")
            first.request_stop("test")
            self.assertTrue(first.is_requested())
            self.assertFalse(second.is_requested())
            first.clear()
            self.assertFalse(first.is_requested())

    def test_retention_protects_recoverable_manifest_output(self):
        config = make_config()
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            output = root / "output"
            old_run = output / "douyin" / "account" / "20200101_000000"
            old_run.mkdir(parents=True)
            (old_run / "marker.txt").write_text("keep", encoding="utf-8")
            old_mtime = time.time() - 60 * 86400
            os.utime(old_run, (old_mtime, old_mtime))
            manifest = InterceptRunManifest.create(
                root,
                config,
                "20200101_000000",
                [{"type": "homepage", "url": "https://www.douyin.com/user/a", "label": "A"}],
            )
            manifest.set_status("STOPPED", "test")
            previous_days = os.environ.get("ACS_OUTPUT_RETENTION_DAYS")
            previous_latest = os.environ.get("ACS_OUTPUT_RETENTION_LATEST")
            try:
                os.environ["ACS_OUTPUT_RETENTION_DAYS"] = "1"
                os.environ["ACS_OUTPUT_RETENTION_LATEST"] = "0"
                summary = cleanup_output_retention(output)
            finally:
                if previous_days is None:
                    os.environ.pop("ACS_OUTPUT_RETENTION_DAYS", None)
                else:
                    os.environ["ACS_OUTPUT_RETENTION_DAYS"] = previous_days
                if previous_latest is None:
                    os.environ.pop("ACS_OUTPUT_RETENTION_LATEST", None)
                else:
                    os.environ["ACS_OUTPUT_RETENTION_LATEST"] = previous_latest
            self.assertTrue(old_run.exists())
            self.assertIn("20200101_000000", summary["protected_run_ids"])

    def test_intercept_sync_defaults_to_real_upload_and_keeps_explicit_simulation_switch(self):
        previous = os.environ.pop("ACS_INTERCEPT_SYNC_DRY_RUN", None)
        try:
            self.assertFalse(_intercept_sync_dry_run_enabled())
            os.environ["ACS_INTERCEPT_SYNC_DRY_RUN"] = "1"
            self.assertTrue(_intercept_sync_dry_run_enabled())
            os.environ["ACS_INTERCEPT_SYNC_DRY_RUN"] = "false"
            self.assertFalse(_intercept_sync_dry_run_enabled())
        finally:
            if previous is None:
                os.environ.pop("ACS_INTERCEPT_SYNC_DRY_RUN", None)
            else:
                os.environ["ACS_INTERCEPT_SYNC_DRY_RUN"] = previous

    def test_default_sync_path_calls_real_upload_and_keeps_resumable_state(self):
        class _UploadClient:
            last_capture_dedupe_stats = {}

            def build_intercept_capture_payload(self, result):
                return {
                    "runId": "sync-default-real",
                    "items": [{"commentId": "c-1", "commentText": "hello"}],
                }

            def preview_intercept_upload_chunks(self, payload):
                return [{"bytes": 88}]

        previous = os.environ.pop("ACS_INTERCEPT_SYNC_DRY_RUN", None)
        try:
            with tempfile.TemporaryDirectory() as tmp, patch(
                "src.cli.upload_payload_with_state",
                return_value={"created": 1, "received": 1, "chunks": 1},
            ) as uploader:
                config = types.SimpleNamespace(platform="douyin", account_alias="test-account")
                response = _sync_intercept_result(
                    Path(tmp),
                    _UploadClient(),
                    "robot-real-default",
                    config,
                    object(),
                    source="test",
                )
                uploader.assert_called_once()
                self.assertEqual(response["upload"]["created"], 1)
                self.assertTrue(Path(response["syncFiles"]["statePath"]).exists())
        finally:
            if previous is not None:
                os.environ["ACS_INTERCEPT_SYNC_DRY_RUN"] = previous

    def test_cli_exposes_recovery_command_without_touching_private_message_command(self):
        parser = build_parser()
        recovery = parser.parse_args(["recover-intercept-run", "--robot-id", "r1"])
        private = parser.parse_args(["run-private-message-robot", "--robot-id", "pm1"])
        self.assertEqual(recovery.command, "recover-intercept-run")
        self.assertEqual(private.command, "run-private-message-robot")

    def test_running_manifest_detects_live_process(self):
        config = make_config()
        with tempfile.TemporaryDirectory() as tmp:
            manifest = InterceptRunManifest.create(
                Path(tmp),
                config,
                "20260630_170000",
                [{"type": "homepage", "url": "https://www.douyin.com/user/a", "label": "A"}],
            )
            self.assertTrue(manifest.has_live_process())

    def test_incomplete_manifest_does_not_advance_schedule(self):
        config = make_config()
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            summary_path = root / "summary.json"
            summary_path.write_text(
                json.dumps({"ok": True, "recovery": {"manifestStatus": "RECOVERABLE"}}, ensure_ascii=False),
                encoding="utf-8",
            )
            _mark_schedule_completed_if_terminal(config, root / "state", summary_path, enabled=True)
            self.assertFalse((root / "state" / "intercept_schedule_state.json").exists())

    def test_runner_keeps_deadline_leftovers_recoverable(self):
        config = make_config()
        config.max_target_minutes = 1
        config.account_cooldown_min_sec = 0
        config.account_cooldown_max_sec = 0
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            output_dir = root / "output"
            with patch("src.robot_runner.AccountSyncService", _PartialHomepageService), patch("src.robot_runner.get_platform_adapter", return_value=object()):
                runner = InterceptRobotRunner(context=None, output_dir=output_dir, core_client=None)
                runner.run_once(config, ignore_schedule=True)
            manifest = InterceptRunManifest.find_latest(root, config)
            self.assertIsNotNone(manifest)
            assert manifest is not None
            target_key = manifest.target_key_for("homepage", "https://www.douyin.com/user/a", 1)
            self.assertEqual(manifest.target_status(target_key), "RECOVERABLE")
            self.assertEqual([item.platform_content_id for item in manifest.pending_posts(target_key)], ["v-pending"])


if __name__ == "__main__":
    unittest.main()

    def test_direct_content_without_browser_remains_recoverable(self):
        config = normalize_intercept_config(
            {
                "targetMode": "content",
                "contentTargets": [{"url": "https://www.douyin.com/video/v-direct", "enabled": True}],
                "collect": {"headless": False},
                "speech": {"enabled": False},
                "workDecision": {"enabled": False},
                "schedule": {"timezone": "Asia/Singapore"},
            },
            robot_id="r-direct-recovery",
            name="direct-recovery-test",
            platform="douyin",
            account_alias="account",
        )
        config.account_cooldown_min_sec = 0
        config.account_cooldown_max_sec = 0
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            runner = InterceptRobotRunner(context=None, output_dir=root / "output", core_client=None)
            runner.run_once(config, ignore_schedule=True)
            manifest = InterceptRunManifest.find_latest(root, config)
            self.assertIsNotNone(manifest)
            assert manifest is not None
            target_key = manifest.target_key_for("content", "https://www.douyin.com/video/v-direct", 1)
            self.assertEqual(manifest.target_status(target_key), "ERROR")
            self.assertEqual(manifest.payload.get("status"), "RECOVERABLE")
