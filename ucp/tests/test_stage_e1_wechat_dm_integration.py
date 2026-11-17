from __future__ import annotations

import ast
import unittest
from pathlib import Path


class WeChatDmIntegrationTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls) -> None:
        cls.source_path = Path('app/platforms/wechat_video/session_controller.py')
        cls.source = cls.source_path.read_text(encoding='utf-8')
        cls.tree = ast.parse(cls.source)
        cls.handle_source = ''
        for node in ast.walk(cls.tree):
            if isinstance(node, ast.FunctionDef) and node.name == '_handle_dm_message':
                cls.handle_source = ast.get_source_segment(cls.source, node) or ''
                break

    def test_handler_passes_canonical_context_to_existing_reply_endpoint(self) -> None:
        self.assertIn('self._dm_recording.begin_turn(msg)', self.handle_source)
        self.assertIn('dialogue_conversation_id=normalize_text(record_ctx.get("canonical_conversation_id")', self.handle_source)
        self.assertIn('current_client_message_ids=list(record_ctx.get("current_client_message_ids")', self.handle_source)
        self.assertIn('conversation_id=self._conversation_ids.get(session_id, "")', self.handle_source)
        self.assertIn('self._dm_recording.update_workflow_mapping(record_ctx, conversation_id)', self.handle_source)

    def test_handler_guards_restart_duplicates_and_post_syncs_confirmed_reply(self) -> None:
        self.assertIn('self._dm_recording.is_terminally_processed(msg)', self.handle_source)
        self.assertIn('self._dm_recording.persist_outgoing(', self.handle_source)
        self.assertIn('status="sent"', self.handle_source)
        self.assertIn('confirmed=True', self.handle_source)
        self.assertIn('self._dm_recording.post_send_sync(record_ctx)', self.handle_source)
        self.assertIn('confirm_mode = "platform_api_ack"', self.handle_source)


if __name__ == '__main__':
    unittest.main()
