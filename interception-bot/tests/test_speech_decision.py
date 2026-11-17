from __future__ import annotations

import os
import tempfile
import sys
import types
import unittest
from pathlib import Path

if "playwright.sync_api" not in sys.modules:
    playwright_module = types.ModuleType("playwright")
    sync_api_module = types.ModuleType("playwright.sync_api")
    sync_api_module.BrowserContext = object
    sync_api_module.Page = object
    sync_api_module.Response = object
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
from src.core_nexus_client import CoreNexusAPIError, CoreNexusClient
from src.models import CommentRecord, ContentRecord, RunResult
from src.speech_analysis import SpeechAnalysisResult


class FakeSpeechAnalyzer:
    def __init__(self, result: SpeechAnalysisResult):
        self.result = result
        self.calls = []

    def analyze(self, video_url: str, debug_dir: Path) -> SpeechAnalysisResult:
        self.calls.append((video_url, debug_dir))
        return self.result


class FakeCoreClient:
    def __init__(self, response=None, error: Exception | None = None):
        self.response = response if response is not None else {"ok": True, "shouldRun": True, "reason": "ok"}
        self.error = error
        self.calls = []

    def run_intercept_work_decision(self, robot_id: str, video: dict, bp=None, acct=None, workflow_id=None):
        self.calls.append({"robot_id": robot_id, "video": video})
        if self.error:
            raise self.error
        return self.response


class FakePostsCollector:
    def __init__(self, item: ContentRecord):
        self.item = item

    def sync(self, **kwargs):
        run_id = kwargs.get("run_id") or "run"
        return (
            RunResult(
                run_id=run_id,
                platform="douyin",
                homepage_url=kwargs.get("homepage_url") or "",
                account_alias=kwargs.get("account_alias") or "account",
                generated_at="2026-06-03T00:00:00+08:00",
                items=[self.item],
            ),
            Path(tempfile.mkdtemp()) / "posts_summary.json",
        )


class FakeCommentsCollector:
    def __init__(self):
        self.calls = []

    def sync(self, **kwargs):
        self.calls.append(kwargs)
        comment = CommentRecord(
            comment_id="c1",
            parent_comment_id=None,
            user_id="u1",
            nickname="nick",
            comment_text="want details",
            comment_time_raw=None,
            comment_time_iso="2026-06-03T00:00:00+08:00",
            visible_region="",
            source_account_url=kwargs.get("source_account_url") or "",
            source_content_url=kwargs.get("content_url") or "",
            platform="douyin",
        )
        item = ContentRecord(
            platform="douyin",
            source_account_url=kwargs.get("source_account_url") or "",
            source_content_url=kwargs.get("content_url") or "",
            platform_content_id="v1",
            caption="title",
            publish_time_raw=None,
            publish_time_iso=None,
            duration_raw=None,
            duration_sec=None,
            comments=[comment],
        )
        summary = Path(tempfile.mkdtemp()) / "comment_summary.json"
        summary.write_text('{"pages_fetched": 1}', encoding="utf-8")
        return RunResult("run", "douyin", "", "account", "now", [item]), summary


class FakeAdapter:
    def __init__(self, post_item: ContentRecord, comments_collector: FakeCommentsCollector):
        self.post_item = post_item
        self.comments_collector = comments_collector

    def create_posts_collector(self, *args, **kwargs):
        return FakePostsCollector(self.post_item)

    def create_comments_collector(self, *args, **kwargs):
        return self.comments_collector


def make_content() -> ContentRecord:
    return ContentRecord(
        platform="douyin",
        source_account_url="https://www.douyin.com/user/a",
        source_content_url="https://www.douyin.com/video/v1",
        platform_content_id="v1",
        caption="title",
        publish_time_raw=None,
        publish_time_iso=None,
        duration_raw=None,
        duration_sec=None,
        comments=[],
    )


class SpeechDecisionFlowTests(unittest.TestCase):
    def run_service(self, speech_result: SpeechAnalysisResult, core_client: FakeCoreClient):
        content = make_content()
        comments_collector = FakeCommentsCollector()
        with tempfile.TemporaryDirectory() as tmp:
            service = AccountSyncService(
                "douyin",
                context=object(),
                output_dir=Path(tmp),
                speech_analyzer=FakeSpeechAnalyzer(speech_result),
                core_client=core_client,
                robot_id="robot1",
            )
            service.adapter = FakeAdapter(content, comments_collector)
            result, _summary = service.sync_account_api(
                account_alias="account",
                homepage_url="https://www.douyin.com/user/a",
                run_id="run1",
                work_decision_workflow_id="test-workflow",
            )
        return result, comments_collector, core_client

    def test_should_run_false_skips_comments(self):
        result, comments, core = self.run_service(
            SpeechAnalysisResult(status="SUCCESS", transcript="script", description="desc", tags=["tag"]),
            FakeCoreClient({"ok": True, "shouldRun": False, "reason": "not relevant", "workflowId": "test-workflow"}),
        )
        self.assertEqual(len(comments.calls), 0)
        item = result.items[0]
        self.assertEqual(item.work_decision_status, "SKIPPED")
        self.assertFalse(item.work_decision_should_run)
        self.assertEqual(item.speech_transcript, "script")
        self.assertEqual(len(core.calls), 1)

    def test_speech_failure_skips_comments(self):
        result, comments, core = self.run_service(
            SpeechAnalysisResult(status="FAILED", error="ffmpeg missing"),
            FakeCoreClient({"ok": True, "shouldRun": False, "reason": "would skip"}),
        )
        self.assertEqual(len(comments.calls), 0)
        item = result.items[0]
        self.assertEqual(item.work_decision_status, "FAILED_SKIP")
        self.assertFalse(item.work_decision_should_run)
        self.assertEqual(len(core.calls), 0)

    def test_workflow_failure_skips_comments(self):
        result, comments, core = self.run_service(
            SpeechAnalysisResult(status="SUCCESS", transcript="script"),
            FakeCoreClient(error=RuntimeError("backend down")),
        )
        self.assertEqual(len(comments.calls), 0)
        item = result.items[0]
        self.assertEqual(item.work_decision_status, "FAILED_SKIP")
        self.assertFalse(item.work_decision_should_run)
        self.assertEqual(len(core.calls), 1)


class CapturePayloadTests(unittest.TestCase):
    def test_payload_contains_precheck_and_comment_rows(self):
        comment = CommentRecord(
            comment_id="c1",
            parent_comment_id=None,
            user_id="u1",
            nickname="nick",
            comment_text="want details",
            comment_time_raw=None,
            comment_time_iso="2026-06-03T00:00:00+08:00",
            visible_region="",
            source_account_url="https://www.douyin.com/user/a",
            source_content_url="https://www.douyin.com/video/v1",
            platform="douyin",
        )
        item = make_content()
        item.comments = [comment]
        item.speech_transcript = "script"
        item.speech_status = "SUCCESS"
        item.video_description = "desc"
        item.video_tags = ["tag"]
        item.work_decision_status = "SHOULD_RUN"
        item.work_decision_should_run = True
        item.work_decision_reason = "ok"
        result = RunResult("run1", "douyin", "https://www.douyin.com/user/a", "account", "now", [item])
        old_upload_precheck = os.environ.get("ACS_UPLOAD_CONTENT_PRECHECK")
        os.environ["ACS_UPLOAD_CONTENT_PRECHECK"] = "1"
        try:
            payload = CoreNexusClient("http://localhost:3000").build_intercept_capture_payload(result)
        finally:
            if old_upload_precheck is None:
                os.environ.pop("ACS_UPLOAD_CONTENT_PRECHECK", None)
            else:
                os.environ["ACS_UPLOAD_CONTENT_PRECHECK"] = old_upload_precheck
        rows = payload["items"]
        self.assertEqual([row["targetType"] for row in rows], ["content_precheck", "content"])
        self.assertEqual(rows[0]["speechTranscript"], "script")
        self.assertEqual(rows[0]["videoTags"], ["tag"])
        self.assertEqual(rows[1]["speechTranscript"], "script")
        self.assertEqual(rows[1]["workDecisionStatus"], "SHOULD_RUN")


if __name__ == "__main__":
    unittest.main()


class CoreNexusErrorMessageTests(unittest.TestCase):
    def test_extracts_nested_validation_errors(self):
        client = CoreNexusClient("http://localhost:3000")
        payload = {
            "code": 400,
            "message": "参数校验失败",
            "errors": [
                {"field": "items.0.commentTimeIso", "errors": ["commentTimeIso must be a valid ISO 8601 date string"]},
                {"field": "items.1.videoTags", "errors": ["each value in videoTags must be a string"]},
            ],
        }
        message = client._extract_error_message(payload)
        self.assertIn("参数校验失败", message)
        self.assertIn("items.0.commentTimeIso", message)
        self.assertIn("valid ISO 8601", message)
        self.assertIn("items.1.videoTags", message)

    def test_unwrap_uses_error_extractor_for_business_errors(self):
        client = CoreNexusClient("http://localhost:3000")
        with self.assertRaises(CoreNexusAPIError) as caught:
            client._unwrap({"code": 400, "message": "参数校验失败", "errors": [{"field": "robotId", "errors": ["not found"]}], "data": None})
        self.assertIn("robotId", str(caught.exception))
