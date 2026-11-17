from __future__ import annotations
import importlib.util
import pathlib
import sys
import types
import unittest

ROOT = pathlib.Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

# Minimal Account stub for isolated payload tests.
models = types.ModuleType("app.models")
class Account:
    def __init__(self, account_id: str, config: dict):
        self.id = account_id
        self.config = config
models.Account = Account
sys.modules.setdefault("app.models", models)

from app.services.auto_reply_runtime import build_dm_test_payload, build_comment_test_payload

def account(provider: str):
    snapshot = {
        "id": "legacy-prompt",
        "customSystemPrompt": "旧系统提示词",
        "customUserPrompt": "旧用户提示词",
        "forbiddenWords": "亲亲",
        "replyStyle": "旧风格",
        "accountPositioning": "旧定位",
        "businessProfile": "旧业务",
        "goal": "旧目标",
        "policy": "旧规则",
        "maxMsgCount": 3,
    }
    return Account("robot-1", {"autoReply": {
        "dm": {"aiBinding": {"provider": provider, "accountProfileId": "profile-1"}, "promptSnapshot": snapshot},
        "comment": {"aiBinding": {"provider": provider, "accountProfileId": "profile-1"}, "promptSnapshot": snapshot},
    }})

class PromptIsolationTests(unittest.TestCase):
    def test_deepseek_dm_omits_legacy_prompt_body(self):
        payload = build_dm_test_payload(account("DEEPSEEK"), "hello")
        for key in ("promptConfigId", "customSystemPrompt", "customUserPrompt", "forbiddenWords", "replyStyle", "accountPositioning", "businessProfile", "conversionGoal", "contactPolicy"):
            self.assertNotIn(key, payload)
        self.assertEqual(payload.get("maxMsgCount"), 3)
        self.assertEqual(payload.get("robotId"), "robot-1")

    def test_deepseek_comment_omits_legacy_prompt_body(self):
        payload = build_comment_test_payload(account("DEEPSEEK"), "好看")
        for key in ("promptConfigId", "customSystemPrompt", "customUserPrompt", "forbiddenWords", "replyStyle", "accountPositioning", "businessProfile", "commentGoal", "commentPolicy"):
            self.assertNotIn(key, payload)

    def test_coze_keeps_legacy_payload(self):
        payload = build_dm_test_payload(account("COZE"), "hello")
        self.assertEqual(payload.get("promptConfigId"), "legacy-prompt")
        self.assertEqual(payload.get("customSystemPrompt"), "旧系统提示词")
        self.assertEqual(payload.get("conversionGoal"), "旧目标")

if __name__ == "__main__":
    unittest.main(verbosity=2)
