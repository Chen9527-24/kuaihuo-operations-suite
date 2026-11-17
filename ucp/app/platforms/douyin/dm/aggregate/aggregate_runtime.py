from __future__ import annotations

import json
import re
from typing import Any

from PySide6.QtCore import QTimer

from app.services.dm_reply.utils import build_aggregate_signature, build_draft_cache_key
from app.services.auto_reply_runtime import current_time_text, intent_label
from app.platforms.douyin.common.js_scripts import (
    build_dm_open_session_script,
    build_dm_reply_precheck_script,
    build_dm_scroll_list_script,
    build_dm_send_reply_script,
    build_dm_stage_reply_script,
)


class SessionControllerDMAggregateMixin:
    def _reply_token(self, reply: dict[str, Any]) -> str:
                conversation_type = re.sub(r"\s+", " ", str(reply.get("conversationType", "") or "")).strip()
                header_name = re.sub(r"\s+", " ", str(reply.get("headerName", "") or reply.get("selectedNickname", "") or "")).strip()
                latest_incoming = re.sub(r"\s+", " ", str(reply.get("aggregatedIncomingText", "") or reply.get("latestIncomingText", "") or "")).strip()
                if conversation_type == "group":
                    group_name = re.sub(r"\s+", " ", str(reply.get("groupName", "") or header_name or "")).strip()
                    group_sender = re.sub(r"\s+", " ", str(reply.get("groupSenderName", "") or "")).strip()
                    group_message = re.sub(r"\s+", " ", str(reply.get("groupMessageText", "") or latest_incoming or "")).strip()
                    token_parts = [part for part in [group_name, group_sender, group_message] if part]
                    return " | ".join(token_parts)[:240] if token_parts else ""
                summary_hint = re.sub(
                    r"\s+",
                    " ",
                    str(
                        reply.get("selectedSummary", "")
                        or reply.get("conversationSummary", "")
                        or reply.get("summary", "")
                        or ""
                    ),
                ).strip()
                message_anchor = latest_incoming or summary_hint
                if not header_name and not message_anchor:
                    return ""
                token_parts = [part for part in [header_name, message_anchor] if part]
                return " | ".join(token_parts)[:240]

    def _reply_cooldown_signature(self, reply: dict[str, Any], selected: dict[str, Any] | None = None) -> str:
                selected = selected or {}
                conversation_type = re.sub(r"\s+", " ", str(reply.get("conversationType", "") or "")).strip()
                header_name = re.sub(
                    r"\s+",
                    " ",
                    str(
                        reply.get("headerName", "")
                        or reply.get("selectedNickname", "")
                        or selected.get("nickname", "")
                        or ""
                    ),
                ).strip()
                latest_incoming = re.sub(r"\s+", " ", str(reply.get("aggregatedIncomingText", "") or reply.get("latestIncomingText", "") or "")).strip()
                if conversation_type == "group":
                    group_name = re.sub(r"\s+", " ", str(reply.get("groupName", "") or header_name or "")).strip()
                    group_sender = re.sub(r"\s+", " ", str(reply.get("groupSenderName", "") or "")).strip()
                    group_message = re.sub(r"\s+", " ", str(reply.get("groupMessageText", "") or latest_incoming or "")).strip()
                    if not group_name or not group_message:
                        return ""
                    return " | ".join(part for part in [group_name, group_sender, group_message] if part)[:240]
                if not header_name or not latest_incoming:
                    return ""
                return f"{header_name} | {latest_incoming}"[:240]

    def _clear_dm_reply_aggregate_window(self) -> None:
                self.dm_reply_aggregate_window = None

    @staticmethod
    def _dm_is_app_only_placeholder_text(value: Any) -> bool:
                normalized = re.sub(r"\s+", " ", str(value or "")).strip().lower()
                if not normalized:
                    return False
                phrases = (
                    "请打开抖音app查看",
                    "打开抖音app查看",
                    "请在抖音app查看",
                    "打开app查看",
                    "新类型消息",
                )
                return any(phrase in normalized for phrase in phrases)

    def _dm_reply_batch_candidates(
                self,
                context: dict[str, Any] | None,
                *,
                selected_key: str = "",
                require_reliable_boundary: bool = False,
            ) -> tuple[list[dict[str, Any]], bool, int]:
                context = context or {}
                samples = context.get("visibleBubbleSamples")
                if not isinstance(samples, list):
                    samples = []
                incoming: list[dict[str, Any]] = [
                    item for item in samples
                    if isinstance(item, dict) and str(item.get("side", "") or "") == "left"
                ]
                unread_hint = 0
                if selected_key and hasattr(self, "_pending_dm_reply_meta"):
                    try:
                        meta = self._pending_dm_reply_meta(selected_key) or {}
                        unread_hint = max(0, min(99, int(meta.get("unreadCountHint", 0) or 0)))
                    except Exception:
                        unread_hint = 0

                candidates: list[dict[str, Any]] = []
                reliable_boundary = False
                last_outgoing_index = -1
                for index, item in enumerate(samples):
                    if isinstance(item, dict) and str(item.get("side", "") or "") == "right":
                        last_outgoing_index = index
                incoming_after_last_outgoing = [
                    item for item in samples[last_outgoing_index + 1:]
                    if isinstance(item, dict) and str(item.get("side", "") or "") == "left"
                ] if last_outgoing_index >= 0 else []

                if unread_hint > 0:
                    # Prefer messages after the most recent account-side reply. This
                    # prevents an app-only unread card from making us reply again to
                    # an older user sentence that was already answered.
                    source = incoming_after_last_outgoing if last_outgoing_index >= 0 else incoming
                    candidates = source[-unread_hint:]
                    reliable_boundary = True
                elif last_outgoing_index >= 0:
                    candidates = incoming_after_last_outgoing
                    reliable_boundary = True
                if not candidates and incoming and not require_reliable_boundary:
                    candidates = incoming[-1:]
                return candidates[-12:], reliable_boundary, unread_hint

    def _dm_build_reply_message_content(
                self,
                reply: dict[str, Any],
                context: dict[str, Any] | None = None,
                *,
                selected_key: str = "",
                require_reliable_boundary: bool = False,
            ) -> str:
                """Build ordered user text while excluding pure non-text messages.

                Repeated text is preserved. Images, emoji, cards, app-only
                placeholders and other unsupported non-text messages remain in the
                local record stream, but they are not sent to the reply workflow.
                A non-text bubble is included only when the DOM exposes separate,
                explicit user-entered text alongside it.
                """
                context = context or {}
                candidates, reliable_boundary, _unread_hint = self._dm_reply_batch_candidates(
                    context,
                    selected_key=selected_key,
                    require_reliable_boundary=require_reliable_boundary,
                )
                if require_reliable_boundary and not reliable_boundary:
                    return ""

                conversation_type = re.sub(
                    r"\s+",
                    " ",
                    str(reply.get("conversationType", "") or context.get("conversationType", "") or "private"),
                ).strip().lower()
                texts: list[str] = []
                for item in candidates:
                    message_type = re.sub(
                        r"\s+", " ", str(item.get("recordMessageType", "") or "text")
                    ).strip().lower()
                    record_text = str(item.get("recordText", "") or "").strip()
                    message_text = str(item.get("messageText", "") or item.get("text", "") or "").strip()
                    has_explicit_text = bool(item.get("recordHasExplicitText"))
                    if message_type == "text":
                        text = record_text or message_text
                    elif has_explicit_text:
                        text = record_text
                    else:
                        text = ""
                    text = re.sub(r"\s+", " ", text).strip()
                    if not text or self._dm_is_app_only_placeholder_text(text):
                        continue
                    if conversation_type == "group":
                        sender = re.sub(r"\s+", " ", str(item.get("senderName", "") or "")).strip()
                        if sender and not text.startswith(sender):
                            text = f"{sender}: {text}"
                    texts.append(text[:1200])

                aggregated = "\n".join(texts).strip()[:4000]
                if aggregated:
                    return aggregated
                if require_reliable_boundary:
                    return ""
                fallback = str(
                    reply.get("groupMessageText", "")
                    or reply.get("latestIncomingText", "")
                    or ""
                )
                fallback = re.sub(r"\s+", " ", fallback).strip()[:4000]
                if self._dm_is_app_only_placeholder_text(fallback):
                    return ""
                return fallback

    def _dm_normalize_non_text_reply_readiness(self, result: dict[str, Any]) -> bool:
                """Allow text+unsupported-message batches without replying to pure cards.

                The creator page may set the list summary to "open the app to view"
                even when the same unread batch also contains normal user text. The
                DOM readiness probe marks that as blocked_app_only. This method only
                lifts the block when a reliable unread/after-last-reply boundary
                contains actual user text. Pure unsupported messages remain blocked.
                """
                if not isinstance(result, dict):
                    return False
                reply = result.get("replyReadiness")
                context = result.get("conversationContext")
                if not isinstance(reply, dict) or not isinstance(context, dict):
                    return False
                state = str(reply.get("state", "") or "")
                reason = str(reply.get("skipReason", "") or reply.get("blockPhrase", "") or "")
                if state != "blocked_app_only" and not self._dm_is_app_only_placeholder_text(reason):
                    return False

                selected = result.get("selectedSession") or {}
                selected_key = ""
                try:
                    selected_key = self._session_key(selected) if selected else ""
                except Exception:
                    selected_key = str((selected or {}).get("sessionKey", "") or "")
                if not selected_key:
                    selected_key = str(reply.get("selectedSessionKey", "") or "")
                if not selected_key and hasattr(self, "dm_opened_unreplied_keys"):
                    for pending_key in list(getattr(self, "dm_opened_unreplied_keys", set()) or set()):
                        meta = self._pending_dm_reply_meta(pending_key) if hasattr(self, "_pending_dm_reply_meta") else {}
                        active_tab = str(reply.get("activeTabText", "") or context.get("activeTabText", "") or "")
                        if active_tab and str((meta or {}).get("activeTab", "") or "") not in {"", active_tab}:
                            continue
                        selected_key = str(pending_key or "")
                        break

                message_content = self._dm_build_reply_message_content(
                    reply,
                    context,
                    selected_key=selected_key,
                    require_reliable_boundary=True,
                )
                if not message_content:
                    reply["appOnlyMixedMessage"] = False
                    reply["replyableTextFound"] = False
                    return False

                reply["canReply"] = True
                reply["state"] = "reply_ready"
                reply["skipReason"] = None
                reply["blockPhrase"] = None
                reply["aggregatedIncomingText"] = message_content
                reply["replyableTextFound"] = True
                reply["appOnlyMixedMessage"] = True
                context["aggregatedIncomingText"] = message_content
                result["replyReadiness"] = reply
                result["conversationContext"] = context
                return True

    def _dm_technical_retry_key(
                self,
                *,
                selected_key: str,
                message_signature: str = "",
                message_content: str = "",
            ) -> str:
                stable = str(message_signature or "").strip()
                if stable:
                    return stable[:800]
                content = re.sub(r"\s+", " ", str(message_content or "")).strip()
                return f"{selected_key}|{content}"[:800] if selected_key or content else ""

    def _dm_technical_retry_state(self) -> dict[str, dict[str, Any]]:
                state = getattr(self, "dm_technical_retry_states", None)
                if not isinstance(state, dict):
                    state = {}
                    self.dm_technical_retry_states = state
                return state

    def _dm_technical_retry_blocked(self, retry_key: str) -> tuple[bool, int]:
                if not retry_key:
                    return False, 0
                state = self._dm_technical_retry_state()
                item = state.get(retry_key) or {}
                now_ms = self._now_ms()
                next_at = int(item.get("nextRetryAt", 0) or 0)
                exhausted_until = int(item.get("exhaustedUntil", 0) or 0)
                if next_at > now_ms:
                    return True, next_at - now_ms
                if exhausted_until > now_ms:
                    return True, exhausted_until - now_ms
                if exhausted_until and exhausted_until <= now_ms:
                    state.pop(retry_key, None)
                    return False, 0
                if next_at and next_at <= now_ms:
                    item["nextRetryAt"] = 0
                    state[retry_key] = item
                return False, 0

    def _dm_clear_technical_retry(self, retry_key: str) -> None:
                if retry_key:
                    self._dm_technical_retry_state().pop(retry_key, None)

    def _dm_defer_technical_failure(
                self,
                *,
                retry_key: str,
                selected_key: str,
                reply_token: str,
                message_signature: str,
                reason: str,
                retryable: bool,
                aggregate_signature: str = "",
            ) -> bool:
                """Defer a technical failure without finalizing it as business skip.

                Returns True when one automatic retry was scheduled.
                """
                now_ms = self._now_ms()
                state = self._dm_technical_retry_state()
                item = state.get(retry_key) or {"attempts": 0}
                attempts = int(item.get("attempts", 0) or 0)
                max_retries = 1
                if retryable and attempts < max_retries:
                    attempts += 1
                    delay_ms = 4000
                    item.update({
                        "attempts": attempts,
                        "nextRetryAt": now_ms + delay_ms,
                        "exhaustedUntil": 0,
                        "lastReason": str(reason or "")[:240],
                    })
                    state[retry_key] = item
                    if aggregate_signature:
                        self.dm_skip_next_aggregate_signature = aggregate_signature
                    self._release_dm_session_lock(selected_key, reply_token)
                    self._log(
                        "WARN",
                        f"私信技术失败，未标记业务跳过，将延迟重试: {json.dumps({'selected': selected_key, 'retry': f'{attempts}/{max_retries}', 'delayMs': delay_ms, 'reason': str(reason or '')[:120]}, ensure_ascii=False)}",
                    )
                    if hasattr(self, "_schedule_fast_dm_inspect"):
                        self._schedule_fast_dm_inspect(delay_ms)
                    return True

                cooldown_ms = 60000 if retryable else 300000
                item.update({
                    "attempts": attempts,
                    "nextRetryAt": 0,
                    "exhaustedUntil": now_ms + cooldown_ms,
                    "lastReason": str(reason or "")[:240],
                })
                state[retry_key] = item
                try:
                    self.dm_opened_unreplied_keys.discard(selected_key)
                except Exception:
                    pass
                if hasattr(self, "_clear_dm_pending_reply"):
                    self._clear_dm_pending_reply(selected_key)
                if hasattr(self, "_clear_dm_reply_aggregate_window"):
                    self._clear_dm_reply_aggregate_window()
                if message_signature and hasattr(self, "_suppress_dm_current_open_signature"):
                    try:
                        self._suppress_dm_current_open_signature(
                            message_signature,
                            ttl_ms=cooldown_ms,
                            reason="technical_deferred",
                        )
                    except Exception:
                        pass
                self._release_dm_session_lock(selected_key, reply_token)
                self._log(
                    "WARN",
                    f"私信技术失败已暂缓处理，未标记业务跳过: {json.dumps({'selected': selected_key, 'retryable': bool(retryable), 'cooldownMs': cooldown_ms, 'reason': str(reason or '')[:120]}, ensure_ascii=False)}",
                )
                if hasattr(self, "_schedule_fast_dm_inspect"):
                    self._schedule_fast_dm_inspect(900)
                return False

    def _dm_reply_aggregate_signature(
                self,
                reply: dict[str, Any],
                context: dict[str, Any] | None = None,
                selected: dict[str, Any] | None = None,
            ) -> str:
                return build_aggregate_signature(reply, context=context, selected=selected)

    def _should_delay_dm_reply_for_aggregate(
                self,
                reply: dict[str, Any],
                context: dict[str, Any],
                selected: dict[str, Any],
                *,
                selected_key: str,
                reply_token: str,
            ) -> bool:
                now_ms = self._now_ms()
                header_name = re.sub(
                    r"\s+",
                    " ",
                    str(reply.get("headerName", "") or selected.get("nickname", "") or ""),
                ).strip()
                latest_incoming = re.sub(r"\s+", " ", str(reply.get("aggregatedIncomingText", "") or reply.get("latestIncomingText", "") or "")).strip()
                aggregate_signature = self._dm_reply_aggregate_signature(reply, context=context, selected=selected)
                # 草稿异步生成完成后，如果上下文签名未变，下一轮不再重复启动第二个聚合等待窗口。
                # 如果期间有新消息进来，aggregate_signature 会变化，仍会重新聚合，避免抢答。
                if aggregate_signature and aggregate_signature == str(getattr(self, "dm_skip_next_aggregate_signature", "") or ""):
                    self.dm_skip_next_aggregate_signature = ""
                    return False
                aggregate_owner_key = re.sub(
                    r"\s+",
                    " ",
                    str(header_name or selected.get("nickname", "") or ""),
                ).strip() or selected_key
                window = self.dm_reply_aggregate_window or {}
                if (
                    not window
                    or str(window.get("aggregateOwnerKey", "") or "") != aggregate_owner_key
                ):
                    self.dm_reply_aggregate_window = {
                        "aggregateOwnerKey": aggregate_owner_key,
                        "selected": selected_key,
                        "replyToken": reply_token,
                        "headerName": header_name,
                        "latestIncomingText": latest_incoming,
                        "signature": aggregate_signature,
                        "startedAt": now_ms,
                        "lastChangeAt": now_ms,
                        "releaseAt": now_ms + self.dm_reply_aggregate_base_wait_ms,
                        "deadlineAt": now_ms + self.dm_reply_aggregate_max_wait_ms,
                        "resetCount": 0,
                    }
                    payload = {
                        "selected": selected_key,
                        "headerName": header_name,
                        "baseWaitMs": self.dm_reply_aggregate_base_wait_ms,
                        "maxWaitMs": self.dm_reply_aggregate_max_wait_ms,
                        "latestIncomingText": latest_incoming[:40],
                    }
                    self._emit_phase_observation("aggregate", "started", payload, force=True)
                    self._log("INFO", f"私信聚合等待启动: {json.dumps(payload, ensure_ascii=False)}")
                    return True
                if aggregate_signature != str(window.get("signature", "") or ""):
                    started_at = int(window.get("startedAt", now_ms) or now_ms)
                    deadline_at = int(
                        window.get("deadlineAt", started_at + self.dm_reply_aggregate_max_wait_ms)
                        or (started_at + self.dm_reply_aggregate_max_wait_ms)
                    )
                    release_at = min(now_ms + self.dm_reply_aggregate_base_wait_ms, deadline_at)
                    previous_latest = str(window.get("latestIncomingText", "") or "")
                    reset_reason = "latest_incoming_changed" if latest_incoming and latest_incoming != previous_latest else "context_changed"
                    window["selected"] = selected_key
                    window["replyToken"] = reply_token
                    window["headerName"] = header_name
                    window["signature"] = aggregate_signature
                    window["latestIncomingText"] = latest_incoming
                    window["lastChangeAt"] = now_ms
                    window["releaseAt"] = release_at
                    window["resetCount"] = int(window.get("resetCount", 0) or 0) + 1
                    payload = {
                        "selected": selected_key,
                        "headerName": header_name,
                        "reason": reset_reason,
                        "resetCount": int(window.get("resetCount", 0) or 0),
                        "remainingMs": max(0, release_at - now_ms),
                        "latestIncomingText": latest_incoming[:40],
                    }
                    self._emit_phase_observation("aggregate", "reset", payload, force=True)
                    self._log("INFO", f"私信聚合等待重置: {json.dumps(payload, ensure_ascii=False)}")
                    return True
                started_at = int(window.get("startedAt", now_ms) or now_ms)
                deadline_at = int(
                    window.get("deadlineAt", started_at + self.dm_reply_aggregate_max_wait_ms)
                    or (started_at + self.dm_reply_aggregate_max_wait_ms)
                )
                release_at = int(window.get("releaseAt", now_ms) or now_ms)
                effective_release_at = min(release_at, deadline_at)
                if now_ms >= deadline_at:
                    payload = {
                        "selected": selected_key,
                        "headerName": header_name,
                        "reason": "max_wait_cap",
                        "elapsedMs": max(0, now_ms - started_at),
                        "resetCount": int(window.get("resetCount", 0) or 0),
                        "latestIncomingText": latest_incoming[:40],
                    }
                    self._emit_phase_observation("aggregate", "released", payload, force=True)
                    self._log("INFO", f"私信聚合等待完成，放行统一回复: {json.dumps(payload, ensure_ascii=False)}")
                    self.dm_reply_aggregate_window = None
                    return False
                if now_ms < effective_release_at:
                    self._emit_phase_observation(
                        "aggregate",
                        "waiting",
                        {
                            "selected": selected_key,
                            "headerName": header_name,
                            "elapsedMs": max(0, now_ms - started_at),
                            "remainingMs": max(0, effective_release_at - now_ms),
                            "resetCount": int(window.get("resetCount", 0) or 0),
                            "latestIncomingText": latest_incoming[:40],
                        },
                        min_interval_ms=1200,
                    )
                    return True
                payload = {
                    "selected": selected_key,
                    "headerName": header_name,
                    "reason": "quiet_window_elapsed",
                    "elapsedMs": max(0, now_ms - started_at),
                    "resetCount": int(window.get("resetCount", 0) or 0),
                    "latestIncomingText": latest_incoming[:40],
                }
                self._emit_phase_observation("aggregate", "released", payload, force=True)
                self._log("INFO", f"私信聚合等待完成，放行统一回复: {json.dumps(payload, ensure_ascii=False)}")
                self.dm_reply_aggregate_window = None
                return False

    def _dm_draft_cache_key(
                self,
                reply: dict[str, Any],
                context: dict[str, Any] | None = None,
                selected: dict[str, Any] | None = None,
            ) -> str:
                return build_draft_cache_key(reply, context=context, selected=selected)

    def _dm_sync_turn_to_backend(self, *, selected_key: str, user_nickname: str, message_content: str, should_reply: bool, skip_reply: bool = False, skip_reason: str = "", reply_status: str = "generated", replies: list[str] | None = None, intent_level: str = "none", message_type: str = "auto_reply", judge_reason: str = "", conversation_id: str = "") -> None:
                service = getattr(self, "core_service", None)
                if service is None:
                    return
                try:
                    account = getattr(self, "account", None)
                    conversation_ids = getattr(self, "backend_dm_conversation_ids", None)
                    if not isinstance(conversation_ids, dict):
                        conversation_ids = {}
                        self.backend_dm_conversation_ids = conversation_ids
                    local_conversation_id = conversation_id or conversation_ids.get(selected_key, "") or f"dm_{abs(hash(selected_key)) % 100000000}"
                    if local_conversation_id:
                        conversation_ids[selected_key] = local_conversation_id
                    safe_replies = [str(item).strip() for item in (replies or []) if str(item).strip()]
                    payload = {"robotId": getattr(account, "id", "") or None, "module": "dm", "platform": "douyin", "botNickname": getattr(account, "auth_name", "") or getattr(account, "robot_name", "") or getattr(account, "name", "") or "", "conversations": [{"conversationId": local_conversation_id, "userNickname": user_nickname or selected_key or "未知用户", "manualTakeover": False, "turns": [{"turnId": f"turn_{abs(hash((selected_key, message_content, current_time_text()))) % 100000000}", "sortIndex": 1, "userMessage": {"content": message_content, "sendTime": current_time_text()}, "analysis": {"shouldReply": bool(should_reply), "skipReply": bool(skip_reply), "skipReason": skip_reason if skip_reply else "", "messageType": message_type, "intentLevel": intent_level, "intentLabel": intent_label(intent_level), "judgeReason": judge_reason or skip_reason}, "reply": {"replyStatus": reply_status if skip_reply else reply_status, "replies": [] if skip_reply else safe_replies, "replyCount": 0 if skip_reply else len(safe_replies), "replyTime": "" if skip_reply else current_time_text(), "failReason": skip_reason if reply_status == "failed" else ""}}]}]}
                    service.sync_dm_conversations(payload)
                except Exception as exc:
                    self._log("WARN", f"私信自动回复同步后端失败: {type(exc).__name__}: {str(exc)[:160]}")


    def _resume_dm_send_after_draft_ready(
                self,
                *,
                request_signature: str,
                draft_text: str,
                cache_payload: dict[str, Any],
                pending_context: dict[str, Any],
            ) -> bool:
                """草稿异步生成完成后，直接恢复预检查/注入/发送链路。

                这条链路已经完成“打开会话 -> 聚合等待 -> 后端生成”，属于正在处理的
                私信主流程，不能只依赖下一轮普通巡检再碰巧进入 _maybe_run_dm_reply_precheck。
                否则草稿生成成功后可能在 pending timeout 前没有任何注入/发送动作。
                """
                if not self.page or not self.running or self.current_module != "dm":
                    return False
                if self.busy:
                    self._log("INFO", "私信草稿就绪后发送链路暂缓：页面仍忙，等待下一次快速巡检继续。")
                    if hasattr(self, "_schedule_fast_dm_inspect"):
                        self._schedule_fast_dm_inspect(300)
                    return False
                selected_key = re.sub(
                    r"\s+",
                    " ",
                    str(cache_payload.get("selected", "") or pending_context.get("selected", "") or ""),
                ).strip()
                reply_token = re.sub(
                    r"\s+",
                    " ",
                    str(cache_payload.get("replyToken", "") or pending_context.get("replyToken", "") or ""),
                ).strip()
                header_name = re.sub(
                    r"\s+",
                    " ",
                    str(cache_payload.get("headerName", "") or pending_context.get("headerName", "") or ""),
                ).strip()
                signature_payload: dict[str, Any] = {}
                if request_signature:
                    try:
                        loaded = json.loads(request_signature)
                        if isinstance(loaded, dict):
                            signature_payload = loaded
                    except Exception:
                        signature_payload = {}
                message_signature = str(signature_payload.get("messageSignature", "") or pending_context.get("messageSignature", "") or "")
                signature = request_signature or json.dumps(
                    {
                        "replyToken": reply_token,
                        "selected": selected_key,
                        "latestIncomingText": cache_payload.get("latestIncomingText", "") or pending_context.get("latestIncomingText", ""),
                        "messageSignature": message_signature,
                        "state": "draft_ready",
                    },
                    ensure_ascii=False,
                    sort_keys=True,
                )
                if not selected_key or not reply_token or not draft_text.strip():
                    self._log(
                        "WARN",
                        f"私信草稿就绪后无法推进发送链路：关键信息缺失。{json.dumps({'selected': selected_key, 'hasReplyToken': bool(reply_token), 'hasDraft': bool(draft_text.strip())}, ensure_ascii=False)}",
                    )
                    return False
                if not self._acquire_dm_session_lock(selected_key, reply_token, "precheck_after_draft_ready"):
                    self._log(
                        "INFO",
                        f"私信草稿就绪后发送链路暂缓：会话锁占用。{json.dumps({'selected': selected_key, 'replyToken': reply_token[:80]}, ensure_ascii=False)}",
                    )
                    if hasattr(self, "_schedule_fast_dm_inspect"):
                        self._schedule_fast_dm_inspect(500)
                    return False
                self.dm_pending_stage_payload = {
                    "signature": signature,
                    "selected": selected_key,
                    "headerName": header_name,
                    "draftText": draft_text,
                    "deliverySegments": cache_payload.get("deliverySegments") or [{"index": 0, "content": draft_text, "delayBeforeMs": 0}],
                    "deliverySegmentIndex": 0,
                    "sentSegments": [],
                    "baseReplyToken": reply_token,
                    "replyToken": reply_token,
                    "messageSignature": message_signature,
                    "latestIncomingText": cache_payload.get("latestIncomingText", "") or pending_context.get("latestIncomingText", ""),
                    "source": cache_payload.get("source", ""),
                    "model": cache_payload.get("model", ""),
                    "reason": cache_payload.get("reason", ""),
                    "conversationId": cache_payload.get("conversationId", ""),
                    "replyAttemptId": cache_payload.get("replyAttemptId", ""),
                    "replyTraceId": cache_payload.get("replyTraceId", ""),
                    "generationSource": cache_payload.get("generationSource", ""),
                    "cancelRemainingOnCustomerMessage": cache_payload.get("cancelRemainingOnCustomerMessage") is not False,
                    "conversationType": cache_payload.get("conversationType", "") or pending_context.get("conversationType", "") or "private",
                    "activeTabText": cache_payload.get("activeTabText", "") or pending_context.get("activeTabText", ""),
                }
                self.dm_pending_precheck_signature = signature
                self.dm_last_precheck_signature = ""
                self.busy = True
                self._log(
                    "INFO",
                    f"私信草稿就绪后推进发送链路: {json.dumps({'selected': selected_key, 'headerName': header_name, 'draftPreview': draft_text[:80]}, ensure_ascii=False)}",
                )
                self.page.runJavaScript(build_dm_reply_precheck_script(), self._handle_dm_reply_precheck_result)
                return True

    def _collect_dm_pending_draft_result(self) -> None:
                future = self.dm_pending_draft_future
                if future is None or not future.done():
                    return
                cache_key = self.dm_pending_draft_cache_key
                request_signature = self.dm_pending_draft_request_signature
                pending_context = self.dm_pending_draft_context or {}
                self.dm_pending_draft_future = None
                self.dm_pending_draft_cache_key = ""
                self.dm_pending_draft_request_signature = ""
                self.dm_pending_draft_context = None
                if not self.running:
                    return
                try:
                    payload = future.result()
                except Exception as exc:
                    self._log("WARN", f"私信回复草稿异步生成失败: {exc}")
                    if hasattr(self, "_dm_record_analysis_result"):
                        self._dm_record_analysis_result(pending_context, status="failed", reason=str(exc), error_code="draft_future_error")
                    self._release_dm_session_lock(str(pending_context.get("selected", "") or ""), str(pending_context.get("replyToken", "") or ""))
                    if request_signature:
                        self.dm_last_precheck_signature = ""
                    self._schedule_fast_dm_inspect(800)
                    return
                if not isinstance(payload, dict):
                    self._log("WARN", f"私信回复草稿异步生成结果异常，类型={type(payload).__name__}")
                    if hasattr(self, "_dm_record_analysis_result"):
                        self._dm_record_analysis_result(pending_context, status="invalid", reason=f"unexpected_type:{type(payload).__name__}", error_code="draft_invalid_result")
                    self._release_dm_session_lock(str(pending_context.get("selected", "") or ""), str(pending_context.get("replyToken", "") or ""))
                    if request_signature:
                        self.dm_last_precheck_signature = ""
                    self._schedule_fast_dm_inspect(800)
                    return
                raw_delivery_segments = payload.get("deliverySegments") if isinstance(payload.get("deliverySegments"), list) else []
                delivery_segments: list[dict[str, Any]] = []
                for index, item in enumerate(raw_delivery_segments):
                    source_item = item if isinstance(item, dict) else {}
                    content = re.sub(r"\s+", " ", str(source_item.get("content", "") or "")).strip()
                    if not content:
                        continue
                    delay = int(source_item.get("delayBeforeMs", 900 if index else 0) or 0)
                    delivery_segments.append({"index": len(delivery_segments), "content": content, "delayBeforeMs": max(0, min(5000, delay))})
                draft_text = delivery_segments[0]["content"] if delivery_segments else re.sub(r"\s+", " ", str(payload.get("text", "") or "")).strip()
                full_draft_text = "\n".join(item["content"] for item in delivery_segments) if delivery_segments else draft_text
                source = str(payload.get("source", "") or "")
                model = str(payload.get("model", "") or "")
                reason = str(payload.get("reason", "") or "")
                selected_key = str(payload.get("selected", "") or pending_context.get("selected", "") or "")
                reply_token = str(payload.get("replyToken", "") or pending_context.get("replyToken", "") or "")
                message_signature = str(payload.get("messageSignature", "") or pending_context.get("messageSignature", "") or "")
                retry_key = str(payload.get("technicalRetryKey", "") or pending_context.get("technicalRetryKey", "") or "")
                message_content = str(payload.get("latestIncomingText", "") or pending_context.get("latestIncomingText", "") or "")
                if not retry_key and hasattr(self, "_dm_technical_retry_key"):
                    retry_key = self._dm_technical_retry_key(
                        selected_key=selected_key,
                        message_signature=message_signature,
                        message_content=message_content,
                    )
                raw = payload.get("backendRaw") if isinstance(payload.get("backendRaw"), dict) else {}
                reply_status = str(raw.get("replyStatus") or payload.get("replyStatus") or "").strip().lower()
                technical_failure = bool(payload.get("technicalFailure")) or reply_status == "failed"
                if technical_failure:
                    if hasattr(self, "_dm_record_analysis_result"):
                        self._dm_record_analysis_result(
                            payload | pending_context,
                            status="failed",
                            source=source,
                            model=model,
                            reason=reason or str(raw.get("failReason") or "technical_failure"),
                            intention_level=str(raw.get("intentLevel", "none") or "none"),
                            purpose_category=str(raw.get("intentType") or raw.get("purposeCategory") or ""),
                            error_code="backend_reply_failed",
                        )
                    self._dm_sync_turn_to_backend(
                        selected_key=selected_key,
                        user_nickname=str(payload.get("headerName", "") or pending_context.get("headerName", "") or selected_key),
                        message_content=message_content,
                        should_reply=False,
                        skip_reply=False,
                        skip_reason=reason or str(raw.get("failReason") or "technical_failure"),
                        reply_status="failed",
                        intent_level=str(raw.get("intentLevel", "none")),
                        message_type="deferred_technical",
                        judge_reason=str(raw.get("judgeReason") or raw.get("failReason") or reason or ""),
                        conversation_id=str(payload.get("conversationId", "") or ""),
                    )
                    if request_signature:
                        self.dm_last_precheck_signature = ""
                    aggregate_signature = str(pending_context.get("aggregateSignature", "") or "")
                    self._dm_defer_technical_failure(
                        retry_key=retry_key,
                        selected_key=selected_key,
                        reply_token=reply_token,
                        message_signature=message_signature,
                        reason=reason or str(raw.get("failReason") or "technical_failure"),
                        retryable=bool(payload.get("retryable", True)),
                        aggregate_signature=aggregate_signature,
                    )
                    return
                if bool(payload.get("skipReply")) or payload.get("shouldReply") is False:
                    active_tab = str(getattr(self, "dm_current_sub_tab", "") or "")
                    if hasattr(self, "_mark_dm_skipped") and selected_key:
                        self._mark_dm_skipped(selected_key, active_tab, reason=str(payload.get("skipReason") or reason or "backend_skip_reply"), message_signature=message_signature)
                    reply_status = "not_required"
                    message_type = str(raw.get("messageType") or "skip_reply")
                    if hasattr(self, "_dm_record_analysis_result"):
                        self._dm_record_analysis_result(
                            payload | pending_context,
                            status="not_required",
                            source=source,
                            model=model,
                            reason=str(payload.get("skipReason") or reason or ""),
                            intention_level=str(raw.get("intentLevel", "none") or "none"),
                            purpose_category=str(raw.get("intentType") or raw.get("purposeCategory") or ""),
                            error_code="",
                        )
                    self._dm_sync_turn_to_backend(selected_key=selected_key, user_nickname=str(payload.get("headerName", "") or pending_context.get("headerName", "") or selected_key), message_content=message_content, should_reply=False, skip_reply=True, skip_reason=str(payload.get("skipReason") or reason or "当前私信无需回复"), reply_status=reply_status, intent_level=str(raw.get("intentLevel", "none")), message_type=message_type, judge_reason=str(raw.get("judgeReason") or payload.get("skipReason") or reason or ""), conversation_id=str(payload.get("conversationId", "") or ""))
                    if request_signature:
                        self.dm_last_precheck_signature = ""
                    self._release_dm_session_lock(selected_key, reply_token)
                    if retry_key and hasattr(self, "_dm_clear_technical_retry"):
                        self._dm_clear_technical_retry(retry_key)
                    self._log("INFO", f"私信后端判断无需回复，已跳过当前会话: {json.dumps({'selected': selected_key, 'reason': str(payload.get('skipReason') or reason or '')[:120]}, ensure_ascii=False)}")
                    self._schedule_fast_dm_inspect(500)
                    return
                if not draft_text:
                    if hasattr(self, "_dm_record_analysis_result"):
                        self._dm_record_analysis_result(payload | pending_context, status="empty_reply", source=source, model=model, reason=reason or "empty_draft", error_code="empty_draft")
                    if request_signature:
                        self.dm_last_precheck_signature = ""
                    self._release_dm_session_lock(str(pending_context.get("selected", "") or ""), str(pending_context.get("replyToken", "") or ""))
                    self._log("WARN", "私信回复草稿异步生成为空，已跳过本轮预检查。")
                    self._schedule_fast_dm_inspect(800)
                    return
                cache_payload: dict[str, Any] = {
                    "text": draft_text,
                    "fullText": full_draft_text,
                    "deliverySegments": delivery_segments or ([{"index": 0, "content": draft_text, "delayBeforeMs": 0}] if draft_text else []),
                    "source": source,
                    "model": model,
                    "reason": reason,
                    "selected": str(payload.get("selected", "") or pending_context.get("selected", "")),
                    "replyToken": str(payload.get("replyToken", "") or pending_context.get("replyToken", "")),
                    "headerName": str(payload.get("headerName", "") or pending_context.get("headerName", "")),
                    "latestIncomingText": message_content,
                    "aggregatedIncomingText": message_content,
                    "messageSignature": message_signature,
                    "technicalRetryKey": retry_key,
                    "conversationId": str(payload.get("conversationId", "") or ""),
                    "replyAttemptId": str(payload.get("replyAttemptId") or pending_context.get("replyAttemptId") or "")[:512],
                    "replyTraceId": str(payload.get("replyTraceId") or "")[:512],
                    "generationSource": str(payload.get("generationSource") or source or "")[:64],
                    "cancelRemainingOnCustomerMessage": payload.get("cancelRemainingOnCustomerMessage") is not False,
                    "conversationType": str(payload.get("conversationType", "") or pending_context.get("conversationType", "") or "private"),
                    "activeTabText": str(payload.get("activeTabText", "") or pending_context.get("activeTabText", "") or ""),
                }
                if hasattr(self, "_dm_record_analysis_result"):
                    self._dm_record_analysis_result(cache_payload, status="completed", draft_text=full_draft_text, source=source, model=model, reason=reason)
                if cache_key:
                    self.dm_draft_cache[cache_key] = cache_payload
                if retry_key and hasattr(self, "_dm_clear_technical_retry"):
                    self._dm_clear_technical_retry(retry_key)
                aggregate_signature = str(pending_context.get("aggregateSignature", "") or "")
                if aggregate_signature:
                    self.dm_skip_next_aggregate_signature = aggregate_signature
                self._release_dm_session_lock(str(pending_context.get("selected", "") or ""), str(pending_context.get("replyToken", "") or ""))
                self._log(
                    "INFO",
                    f"私信回复草稿异步生成完成: {json.dumps({'source': source, 'model': model, 'reason': reason, 'draftPreview': draft_text[:80]}, ensure_ascii=False)}",
                )
                self.dm_last_precheck_signature = ""
                resumed = self._resume_dm_send_after_draft_ready(
                    request_signature=request_signature,
                    draft_text=draft_text,
                    cache_payload=cache_payload,
                    pending_context=pending_context,
                )
                if not resumed:
                    self._schedule_fast_dm_inspect(200)
