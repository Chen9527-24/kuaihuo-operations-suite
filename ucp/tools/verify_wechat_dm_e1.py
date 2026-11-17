from __future__ import annotations

import ast
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
CHECKS: list[tuple[str, bool]] = []


def check(name: str, condition: bool) -> None:
    CHECKS.append((name, bool(condition)))


controller = (ROOT / 'app/platforms/wechat_video/session_controller.py').read_text(encoding='utf-8')
policy = (ROOT / 'app/platforms/wechat_video/policy.py').read_text(encoding='utf-8')
recording = (ROOT / 'app/platforms/wechat_video/dm/recording_runtime.py').read_text(encoding='utf-8')
service = (ROOT / 'app/services/local_records/service.py').read_text(encoding='utf-8')
pc_hint = 'WECHAT_VIDEO'

ast.parse(controller)
ast.parse(policy)
ast.parse(recording)
ast.parse(service)

check('recording_runtime_installed', 'WeChatVideoDMRecordingRuntime' in controller)
check('all_observed_messages_recorded', 'observe_messages(normalized_messages' in controller)
check('passive_non_text_remote_sync', 'sync_passive_observations(normalized_messages)' in controller)
check('canonical_resolve_sync', 'resolve_sync_dm_dialogue' in recording)
check('stable_platform_session_identity', '"WECHAT_VIDEO", "dm", session_id' in recording)
check('context_passed_to_reply_endpoint', 'dialogue_conversation_id=normalize_text(record_ctx.get("canonical_conversation_id")' in controller)
check('current_turn_excluded_from_context', 'current_client_message_ids=list(record_ctx.get("current_client_message_ids")' in controller)
check('restart_terminal_guard', 'is_terminally_processed(msg)' in controller and 'reply_attempt_status' in service)
check('outgoing_post_send_sync', 'persist_outgoing(' in controller and 'post_send_sync(record_ctx)' in controller)
check('platform_api_ack_confirmation', 'confirm_mode = "platform_api_ack"' in controller)
check('self_echo_deduplication', '_bind_self_echo' in recording and '_localMessageSeed' in recording)
check('non_text_placeholder_whitelist', all(value in policy for value in ('[图片]', '[语音]', '[视频]', '[表情]', '[卡片]')))
check('stable_private_scope', 'return "private_all"' in recording and 'platform_session_id' in recording)
check('workflow_conversation_mapping', 'update_workflow_mapping(record_ctx, conversation_id)' in controller)
check('no_sensitive_payload_projection', all(token not in recording.split('def _remote_message', 1)[1].split('def resolve_remote_context', 1)[0] for token in ('cookie', 'token', 'html', 'dom', 'raw')))

failed = [name for name, ok in CHECKS if not ok]
for name, ok in CHECKS:
    print(f"[{'PASS' if ok else 'FAIL'}] {name}")
if failed:
    raise SystemExit(f"WeChat DM E1 verification failed: {', '.join(failed)}")
print(f"WeChat DM E1 verification passed: {len(CHECKS)} checks.")
