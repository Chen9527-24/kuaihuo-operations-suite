from __future__ import annotations

from dataclasses import dataclass
from pathlib import Path
import importlib.util
import json
import tempfile
import time
import unittest

from app.services.local_records import LocalRecordService


_RECORD_MODULE_PATH = Path(__file__).resolve().parents[1] / "app" / "platforms" / "douyin" / "dm" / "recording" / "record_runtime.py"
_RECORD_SPEC = importlib.util.spec_from_file_location("stage_c1_record_runtime", _RECORD_MODULE_PATH)
assert _RECORD_SPEC and _RECORD_SPEC.loader
_RECORD_MODULE = importlib.util.module_from_spec(_RECORD_SPEC)
_RECORD_SPEC.loader.exec_module(_RECORD_MODULE)
SessionControllerDMRecordMixin = _RECORD_MODULE.SessionControllerDMRecordMixin


@dataclass
class FakeAccount:
    id: str = "robot-dm"
    tenant_id: str = "tenant-a"
    platform: str = "DOUYIN"
    name: str = "私信机器人"
    auth_id: str = "auth-a"
    auth_uid: str = "uid-a"
    auth_name: str = "测试账号"


class FakeController(SessionControllerDMRecordMixin):
    def __init__(self, service: LocalRecordService) -> None:
        self.record_service = service
        self.account = FakeAccount()
        self.logs: list[tuple[str, str]] = []
        self.dm_current_conversation_anchor = {}

    def _active_dm_tab_text(self, result):
        return str((result.get("replyReadiness", {}) or {}).get("activeTabText") or "")

    def _session_key(self, selected):
        return str(selected.get("sessionKey") or "")

    def _now_ms(self):
        return int(time.time() * 1000)

    def _log(self, level, message):
        self.logs.append((str(level), str(message)))


def make_snapshot(*, header="客户甲", active_tab="朋友私信", selected=True, text="秘密咨询内容", candidate_hash="abc123"):
    bubble = {
        "text": text,
        "messageText": text,
        "recordText": text,
        "recordMessageType": "text",
        "recordPlaceholder": "",
        "recordSourceTypeCode": "test_text",
        "recordClassificationSource": "test_dom",
        "senderName": "",
        "side": "left",
    }
    selected_session = {
        "sessionKey": f"{header}|刚刚|{text}",
        "nickname": header,
        "identityCandidates": [
            {"source": "node0:attr:0", "key": "data-user-id", "hash": candidate_hash, "length": 18},
        ],
    } if selected else {}
    return {
        "selectedSession": selected_session,
        "replyReadiness": {
            "headerName": header,
            "conversationType": "private",
            "activeTabText": active_tab,
        },
        "conversationContext": {
            "headerName": header,
            "conversationType": "private",
            "activeTabText": active_tab,
            "visibleBubbleSamples": [bubble],
        },
        "visibleBubbleCandidates": [bubble],
        "identityDiagnostic": {
            "version": 1,
            "selectedPresent": selected,
            "selectedIdentityCandidates": selected_session.get("identityCandidates", []),
            "panelIdentityCandidates": [
                {"source": "node0:href:0", "key": "href", "hash": candidate_hash, "length": 28},
            ],
        },
        "messagePanel": {
            "bubbleLikeCount": 1,
            "scroll": {"top": 100, "scrollHeight": 1000, "atBottom": True},
        },
    }


class StageC1IdentityDiagnosticTests(unittest.TestCase):
    def setUp(self) -> None:
        self.temp = tempfile.TemporaryDirectory()
        self.service = LocalRecordService(Path(self.temp.name))
        self.service.register_account(FakeAccount())
        self.controller = FakeController(self.service)

    def tearDown(self) -> None:
        self.service.close()
        self.temp.cleanup()

    def diagnostic_payloads(self):
        payloads = []
        for level, message in self.controller.logs:
            if not message.startswith("C1私信身份诊断: "):
                continue
            payloads.append((level, json.loads(message.split(": ", 1)[1])))
        return payloads

    def test_diagnostic_is_hash_only_and_does_not_log_message_or_nickname(self) -> None:
        snapshot = make_snapshot(header="客户甲隐私昵称", text="这里是一段不应进入诊断日志的秘密消息")
        self.controller._dm_record_snapshot(snapshot)
        payloads = self.diagnostic_payloads()
        self.assertTrue(payloads)
        rendered = json.dumps(payloads, ensure_ascii=False)
        self.assertNotIn("客户甲隐私昵称", rendered)
        self.assertNotIn("不应进入诊断日志", rendered)
        payload = payloads[-1][1]
        self.assertEqual(payload["event"], "identity_observed")
        self.assertTrue(payload["headerHash"])
        self.assertEqual(payload["windowCount"], 1)

    def test_active_tab_identity_drift_is_reported_with_high_window_overlap(self) -> None:
        self.controller._dm_record_snapshot(make_snapshot(active_tab="朋友私信", candidate_hash="stable-id-hash"))
        # Ensure the diagnostic rate limiter does not suppress the meaningful identity change.
        self.controller._dm_record_state()["identity_diagnostic"]["last_log_ms"] = 0
        self.controller._dm_record_snapshot(make_snapshot(active_tab="陌生人私信", candidate_hash="stable-id-hash"))
        level, payload = self.diagnostic_payloads()[-1]
        self.assertEqual(level, "WARN")
        self.assertEqual(payload["event"], "conversation_changed_high_overlap")
        self.assertIn("active_tab_changed", payload["reasons"])
        self.assertIn("header_stable", payload["reasons"])
        self.assertIn("stable_dom_candidate_shared", payload["reasons"])
        self.assertIn("high_window_overlap", payload["reasons"])
        self.assertNotEqual(payload["conversationId"], payload["previousConversationId"])
        self.assertEqual(payload["overlapRatio"], 1.0)

    def test_missing_selected_and_header_reports_unresolved_identity_with_anchor_presence(self) -> None:
        self.controller.dm_current_conversation_anchor = {
            "activeTab": "朋友私信",
            "selectedKey": "old-key",
            "headerName": "客户甲",
            "source": "queue-test",
        }
        snapshot = make_snapshot(header="", selected=False)
        self.controller._dm_record_snapshot(snapshot)
        level, payload = self.diagnostic_payloads()[-1]
        self.assertEqual(level, "WARN")
        self.assertEqual(payload["event"], "identity_unresolved")
        self.assertIn("selected_session_missing", payload["reasons"])
        self.assertIn("header_missing", payload["reasons"])
        self.assertIn("current_anchor_available", payload["reasons"])
        self.assertTrue(payload["anchorPresent"])
        self.assertEqual(payload["conversationId"], "")

    def test_diagnostic_does_not_change_reply_or_recording_behavior(self) -> None:
        snapshot = make_snapshot()
        self.controller._dm_record_snapshot(snapshot)
        self.assertTrue(self.service.flush(3.0))
        registration = self.service.register_account(FakeAccount())
        db = Path(self.temp.name) / "records" / "accounts" / registration.store_id / "dialogue.sqlite"
        import sqlite3
        connection = sqlite3.connect(db)
        try:
            self.assertEqual(connection.execute("SELECT COUNT(*) FROM messages").fetchone()[0], 1)
            self.assertEqual(connection.execute("SELECT COUNT(*) FROM conversation_cursors").fetchone()[0], 1)
        finally:
            connection.close()


if __name__ == "__main__":
    unittest.main()
