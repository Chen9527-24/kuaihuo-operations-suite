from __future__ import annotations

import json
import re
from typing import Any

from PySide6.QtCore import QTimer

from app.services.dm_reply.utils import build_aggregate_signature, build_draft_cache_key
from app.platforms.douyin.common.js_scripts import (
    build_dm_inspect_script,
    build_dm_open_session_script,
    build_dm_reply_precheck_script,
    build_dm_scroll_list_script,
    build_dm_send_reply_script,
    build_dm_stage_reply_script,
)


class SessionControllerDMSendMixin:
    def _maybe_send_dm_reply(self, *, prepared_state: str, draft_preview: str, after_disabled: Any, current_header: str = "") -> None:
                if not self.page or self.busy or self.current_module != "dm":
                    return
                payload = self.dm_pending_stage_payload or {}
                signature = str(payload.get("signature", "") or "")
                draft_text = str(payload.get("draftText", "") or "").strip()
                if not signature or not draft_text:
                    return
                if signature == self.dm_last_send_signature:
                    return
                normalized_preview = re.sub(r"\s+", " ", str(draft_preview or "")).strip()
                normalized_draft = re.sub(r"\s+", " ", draft_text).strip()
                if prepared_state == "skipped_existing_draft" and normalized_preview and normalized_preview != normalized_draft:
                    mismatch = {
                        "selected": payload.get("selected", ""),
                        "existingDraftPreview": normalized_preview[:80],
                        "expectedDraftPreview": normalized_draft[:80],
                    }
                    self._log("WARN", f"私信受控发送跳过：现有草稿与预期模板不一致。{json.dumps(mismatch, ensure_ascii=False)}")
                    self._release_dm_session_lock(str(payload.get("selected", "") or ""), str(payload.get("replyToken", "") or ""))
                    return
                expected_header = re.sub(r"\s+", " ", str(payload.get("headerName", "") or "")).strip()
                current_header_n = re.sub(r"\s+", " ", str(current_header or "")).strip()
                if expected_header and current_header_n and expected_header != current_header_n:
                    mismatch = {
                        "selected": payload.get("selected", ""),
                        "expectedHeader": expected_header,
                        "currentHeader": current_header_n,
                        "decision": "cancel_send",
                    }
                    self._log("ERROR", f"私信发送前目标校验失败，已取消发送: {json.dumps(mismatch, ensure_ascii=False)}")
                    if hasattr(self, "_dm_record_reply_attempt"):
                        self._dm_record_reply_attempt(payload, status="send_failed", error_code="target_mismatch", error_message="发送前目标会话校验失败")
                    self._release_dm_session_lock(str(payload.get("selected", "") or ""), str(payload.get("replyToken", "") or ""))
                    self.dm_pending_stage_payload = None
                    return
                if after_disabled is True:
                    self._release_dm_session_lock(str(payload.get("selected", "") or ""), str(payload.get("replyToken", "") or ""))
                    return
                reply_token = str(payload.get("replyToken", "") or "")
                self.dm_pending_send_payload = {
                    "signature": signature,
                    "selected": payload.get("selected", ""),
                    "headerName": payload.get("headerName", ""),
                    "draftText": draft_text,
                    "replyToken": reply_token,
                    "baseReplyToken": payload.get("baseReplyToken", reply_token),
                    "messageSignature": payload.get("messageSignature", ""),
                    "latestIncomingText": payload.get("latestIncomingText", ""),
                    "source": payload.get("source", ""),
                    "model": payload.get("model", ""),
                    "reason": payload.get("reason", ""),
                    "conversationId": payload.get("conversationId", ""),
                    "conversationType": payload.get("conversationType", "") or "private",
                    "activeTabText": payload.get("activeTabText", ""),
                    "replyAttemptId": payload.get("replyAttemptId", ""),
                    "replyTraceId": payload.get("replyTraceId", ""),
                    "generationSource": payload.get("generationSource", ""),
                    "deliverySegments": payload.get("deliverySegments") or [{"index": 0, "content": draft_text, "delayBeforeMs": 0}],
                    "deliverySegmentIndex": int(payload.get("deliverySegmentIndex", 0) or 0),
                    "sentSegments": list(payload.get("sentSegments") or []),
                    "cancelRemainingOnCustomerMessage": payload.get("cancelRemainingOnCustomerMessage") is not False,
                    "startedAt": self._now_ms(),
                }
                if reply_token:
                    self.dm_inflight_reply_tokens.add(reply_token)
                if hasattr(self, "_dm_record_reply_attempt"):
                    self._dm_record_reply_attempt(self.dm_pending_send_payload, status="send_pending")
                self.busy = True
                self._emit_phase_observation("send", "started", {"selected": payload.get('selected', ''), "headerName": payload.get('headerName', ''), "draftPreview": draft_text[:40]}, force=True)
                self._log(
                    "INFO",
                    f"私信受控发送启动: {json.dumps({'selected': payload.get('selected', ''), 'headerName': payload.get('headerName', ''), 'draftPreview': draft_text[:80]}, ensure_ascii=False)}",
                )
                self.page.runJavaScript(build_dm_send_reply_script(draft_text), self._handle_dm_send_reply_result)

    def _handle_dm_send_reply_result(self, result: Any) -> None:
                self.busy = False
                result = self._coerce_js_result(result)
                if not isinstance(result, dict):
                    payload = self.dm_pending_send_payload or {}
                    reply_token = str(payload.get("replyToken", "") or "")
                    if reply_token:
                        self.dm_inflight_reply_tokens.discard(reply_token)
                    self._release_dm_session_lock(str(payload.get("selected", "") or ""), reply_token)
                    self._log("WARN", f"私信受控发送结果异常，类型={type(result).__name__}，内容片段={str(result)[:240]}")
                    if hasattr(self, "_dm_record_reply_attempt"):
                        self._dm_record_reply_attempt(payload, status="send_failed", error_code="invalid_send_result", error_message=f"unexpected_type:{type(result).__name__}")
                    self.dm_pending_send_payload = None
                    return
                summary = {
                    "ok": result.get("ok", False),
                    "state": result.get("state", "unknown"),
                    "headerName": result.get("headerName", ""),
                    "beforeDisabled": result.get("beforeDisabled"),
                    "afterDisabled": result.get("afterDisabled"),
                    "beforeInputPreview": result.get("beforeInputPreview", ""),
                    "afterInputPreview": result.get("afterInputPreview", ""),
                }
                level = "INFO" if result.get("ok") else "WARN"
                self._log(level, f"私信受控发送结果: {json.dumps(summary, ensure_ascii=False)}")
                if result.get("ok") and result.get("state") == "send_clicked":
                    self._schedule_fast_dm_inspect(1200)
                else:
                    payload = self.dm_pending_send_payload or {}
                    reply_token = str(payload.get("replyToken", "") or "")
                    if reply_token:
                        self.dm_inflight_reply_tokens.discard(reply_token)
                    self._release_dm_session_lock(str(payload.get("selected", "") or ""), reply_token)
                    if hasattr(self, "_dm_record_reply_attempt"):
                        self._dm_record_reply_attempt(
                            payload,
                            status="send_failed",
                            error_code=str(result.get("state", "send_not_clicked") or "send_not_clicked"),
                            error_message=str(result.get("error", "") or result.get("state", "send_not_clicked")),
                        )
                    self.dm_pending_send_payload = None

    def _schedule_next_dm_delivery_segment(self, payload: dict[str, Any]) -> bool:
                segments = payload.get("deliverySegments") if isinstance(payload.get("deliverySegments"), list) else []
                current_index = int(payload.get("deliverySegmentIndex", 0) or 0)
                next_index = current_index + 1
                if next_index >= len(segments):
                    return False
                next_source = segments[next_index] if isinstance(segments[next_index], dict) else {}
                next_text = re.sub(r"\s+", " ", str(next_source.get("content", "") or "")).strip()
                if not next_text:
                    return False
                delay_ms = max(350, min(5000, int(next_source.get("delayBeforeMs", 900) or 900)))
                base_token = str(payload.get("baseReplyToken") or payload.get("replyToken") or "")
                next_payload = {
                    **payload,
                    "signature": f"{payload.get('signature', '')}|segment:{next_index}",
                    "draftText": next_text,
                    "deliverySegmentIndex": next_index,
                    "replyToken": f"{base_token}|segment:{next_index}",
                    "startedAt": 0,
                    "guardAttempts": 0,
                }
                self.dm_pending_delivery_sequence = next_payload
                self._log("INFO", f"私信下一段已进入等待: {json.dumps({'segment': next_index + 1, 'total': len(segments), 'delayMs': delay_ms, 'preview': next_text[:80]}, ensure_ascii=False)}")
                QTimer.singleShot(delay_ms, self._start_next_dm_delivery_segment_guard)
                return True

    def _start_next_dm_delivery_segment_guard(self) -> None:
                payload = getattr(self, "dm_pending_delivery_sequence", None)
                if not isinstance(payload, dict):
                    return
                if not self.running or not self.page or self.current_module != "dm":
                    self.dm_pending_delivery_sequence = None
                    return
                if self.busy or self.dm_pending_stage_payload or self.dm_pending_send_payload:
                    attempts = int(payload.get("guardAttempts", 0) or 0) + 1
                    if attempts > 16:
                        self._log("WARN", "私信后续分段因页面持续忙碌已取消，避免与新会话动作冲突。")
                        self.dm_pending_delivery_sequence = None
                        return
                    payload["guardAttempts"] = attempts
                    QTimer.singleShot(300, self._start_next_dm_delivery_segment_guard)
                    return
                self.page.runJavaScript(build_dm_inspect_script(), self._handle_dm_delivery_segment_guard_result)

    def _handle_dm_delivery_segment_guard_result(self, result: Any) -> None:
                payload = getattr(self, "dm_pending_delivery_sequence", None)
                if not isinstance(payload, dict):
                    return
                result = self._coerce_js_result(result)
                if not isinstance(result, dict):
                    self._log("WARN", "私信后续分段发送前页面检查失败，已取消剩余分段。")
                    self.dm_pending_delivery_sequence = None
                    return
                reply = result.get("replyReadiness", {}) or {}
                context = result.get("conversationContext", {}) or {}
                selected = result.get("selectedSession") or {}
                normalize = lambda value: re.sub(r"\s+", " ", str(value or "")).strip()
                expected_header = normalize(payload.get("headerName"))
                current_header = normalize(reply.get("headerName") or selected.get("nickname"))
                original_incoming = normalize(payload.get("latestIncomingText"))
                latest_incoming = normalize(reply.get("latestIncomingText") or context.get("latestIncomingText"))
                if expected_header and current_header and expected_header != current_header:
                    self._log("INFO", "私信后续分段已取消：当前会话已经切换。")
                    self.dm_pending_delivery_sequence = None
                    return
                if payload.get("cancelRemainingOnCustomerMessage") is not False and original_incoming and latest_incoming and latest_incoming != original_incoming:
                    self._log("INFO", "私信后续分段已取消：客户在等待期间发来了新消息。")
                    self.dm_pending_delivery_sequence = None
                    return
                selected_key = str(payload.get("selected", "") or "")
                reply_token = str(payload.get("replyToken", "") or "")
                if not self._acquire_dm_session_lock(selected_key, reply_token, "sequential_delivery"):
                    attempts = int(payload.get("guardAttempts", 0) or 0) + 1
                    if attempts > 16:
                        self._log("WARN", "私信后续分段因会话锁持续占用已取消，避免重复或错发。")
                        self.dm_pending_delivery_sequence = None
                        return
                    payload["guardAttempts"] = attempts
                    QTimer.singleShot(300, self._start_next_dm_delivery_segment_guard)
                    return
                self.dm_pending_delivery_sequence = None
                self.dm_pending_stage_payload = payload
                self.dm_pending_precheck_signature = str(payload.get("signature", "") or "")
                self.dm_last_precheck_signature = ""
                self.busy = True
                self.page.runJavaScript(build_dm_reply_precheck_script(), self._handle_dm_reply_precheck_result)

    def _confirm_dm_reply_send(self, result: dict[str, Any]) -> None:
                def _normalize_text(value: Any) -> str:
                    return re.sub(r"\s+", " ", str(value or "")).strip()

                def _same_text(left: str, right: str) -> bool:
                    left_n = _normalize_text(left)
                    right_n = _normalize_text(right)
                    if not left_n or not right_n:
                        return False
                    return left_n == right_n

                payload = self.dm_pending_send_payload or {}
                if not payload:
                    return
                reply = result.get("replyReadiness", {}) or {}
                context = result.get("conversationContext", {}) or {}
                selected = result.get("selectedSession") or {}
                selected_key = self._session_key(selected) or (self._dm_selected_key_from_reply(reply, selected, self._active_dm_tab_text(result) if hasattr(self, "_active_dm_tab_text") else "") if hasattr(self, "_dm_selected_key_from_reply") else "")
                expected_selected = str(payload.get("selected", "") or "")
                expected_header = _normalize_text(payload.get("headerName", ""))
                expected_draft = _normalize_text(payload.get("draftText", ""))
                reply_token = str(payload.get("replyToken", "") or "")
                latest_outgoing = _normalize_text(reply.get("latestOutgoingText", ""))
                selected_summary = _normalize_text(reply.get("selectedSummary", "") or context.get("selectedSummary", ""))
                current_input = _normalize_text(context.get("currentInputText", ""))
                send_enabled = bool(reply.get("sendButtonEnabledNow", False))
                current_header = _normalize_text(reply.get("headerName", "") or selected.get("nickname", ""))
                visible_samples = context.get("visibleBubbleSamples", []) or []
                visible_right_texts = [
                    _normalize_text(item.get("text", ""))
                    for item in visible_samples
                    if str(item.get("side", "") or "") == "right" and _normalize_text(item.get("text", ""))
                ]
                same_session = True
                if expected_header:
                    same_session = current_header == expected_header
                elif expected_selected and selected_key:
                    same_session = selected_key == expected_selected
                if not same_session:
                    return
                confirm_mode = ""
                if expected_draft:
                    if _same_text(latest_outgoing, expected_draft):
                        confirm_mode = "latest_outgoing"
                    elif _same_text(selected_summary, expected_draft):
                        confirm_mode = "selected_summary"
                    elif any(_same_text(text, expected_draft) for text in visible_right_texts):
                        confirm_mode = "visible_right_bubble"
                input_cleared = not current_input
                input_changed = bool(expected_draft) and current_input != expected_draft
                if confirm_mode and (input_cleared or input_changed or not send_enabled):
                    self.dm_last_send_signature = str(payload.get("signature", "") or "")
                    confirmed_signature = self._reply_cooldown_signature(reply, selected)
                    if confirmed_signature:
                        self.dm_last_confirmed_reply_signature = confirmed_signature
                        self.dm_last_confirmed_reply_ms = self._now_ms()
                    if reply_token:
                        self.dm_inflight_reply_tokens.discard(reply_token)
                        self.dm_completed_reply_tokens.add(reply_token)
                    payload_selected = str(payload.get("selected", "") or "")
                    active_tab = self._active_dm_tab_text(result) if hasattr(self, "_active_dm_tab_text") else ""
                    message_signature = str(payload.get("messageSignature", "") or "") or (self._dm_incoming_message_signature(reply, selected, active_tab) if hasattr(self, "_dm_incoming_message_signature") else "")
                    primary_key = payload_selected or selected_key
                    if primary_key:
                        if hasattr(self, "_mark_dm_processed"):
                            self._mark_dm_processed(primary_key, active_tab, message_signature=message_signature)
                        else:
                            self.dm_processed_keys.add(primary_key)
                    # payload_selected 与 selected_key 可能因发送后列表摘要变化而不同；只按一次发送确认计数，
                    # 但两类 pending/锁都需要清掉，避免 current-open 或 stale pending 重复锁定。
                    for alias_key in {payload_selected, selected_key}:
                        if not alias_key:
                            continue
                        self.dm_opened_unreplied_keys.discard(alias_key)
                        if hasattr(self, "_clear_dm_pending_reply"):
                            self._clear_dm_pending_reply(alias_key)
                        if reply_token:
                            self._release_dm_session_lock(alias_key, reply_token)
                    if message_signature and hasattr(self, "_suppress_dm_current_open_signature"):
                        self._suppress_dm_current_open_signature(message_signature, ttl_ms=15000, reason="send_confirmed")
                    cooldown_key = primary_key
                    if cooldown_key:
                        self.dm_session_cooldowns[cooldown_key] = self._now_ms() + 8000
                        self._release_dm_session_lock(cooldown_key, reply_token)
                    anchor_key = primary_key or selected_key or expected_selected
                    if hasattr(self, "_remember_dm_current_conversation_anchor"):
                        self._remember_dm_current_conversation_anchor(
                            active_tab=active_tab,
                            selected_key=anchor_key,
                            header_name=current_header,
                            message_signature=message_signature,
                            last_outgoing_text=expected_draft,
                            source="send_confirmed",
                        )
                    if hasattr(self, "_remember_dm_post_send_hold"):
                        self._remember_dm_post_send_hold(
                            active_tab=active_tab,
                            selected_key=anchor_key,
                            header_name=current_header,
                            message_signature=message_signature,
                        )
                    self._clear_dm_reply_aggregate_window()
                    self._emit_phase_observation("send", "confirmed", {"selected": expected_selected or selected_key, "headerName": current_header, "confirmMode": confirm_mode}, force=True)
                    confirm_payload = {'selected': expected_selected or selected_key, 'headerName': current_header, 'sentText': expected_draft[:80], 'confirmMode': confirm_mode, 'inputCleared': input_cleared, 'inputChanged': input_changed, 'sendButtonEnabledNow': send_enabled, 'activeTab': active_tab or None}
                    self._log(
                        "INFO",
                        f"私信受控发送确认成功: {json.dumps(confirm_payload, ensure_ascii=False)}",
                    )
                    try:
                        if hasattr(self, "runtime_policy"):
                            self.runtime_policy.record_dm_reply_sent()
                    except Exception as exc:
                        self._log("WARN", f"私信发送后节奏冷却记录异常: {type(exc).__name__}: {exc}")
                    if hasattr(self, "_dm_sync_turn_to_backend"):
                        self._dm_sync_turn_to_backend(selected_key=primary_key or selected_key or expected_selected, user_nickname=current_header or expected_header or selected_key, message_content=str(payload.get("latestIncomingText", "") or reply.get("latestIncomingText", "") or ""), should_reply=True, skip_reply=False, reply_status="sent", replies=[expected_draft] if expected_draft else [], intent_level="medium", message_type="auto_reply", judge_reason=str(payload.get("reason", "") or "send_confirmed"), conversation_id=str(payload.get("conversationId", "") or ""))
                    if active_tab == "群消息" or reply.get("conversationType") == "group":
                        self._log(
                            "INFO",
                            f"群消息回复完成: {json.dumps({'groupName': reply.get('groupName') or current_header, 'senderName': reply.get('groupSenderName'), 'messageText': reply.get('groupMessageText') or reply.get('latestIncomingText'), 'sentText': expected_draft[:80], 'confirmMode': confirm_mode}, ensure_ascii=False)}",
                        )
                    sent_segments = [str(item).strip() for item in (payload.get("sentSegments") or []) if str(item).strip()]
                    sent_segments.append(expected_draft)
                    payload["sentSegments"] = sent_segments
                    has_next_segment = int(payload.get("deliverySegmentIndex", 0) or 0) + 1 < len(payload.get("deliverySegments") or [])
                    if hasattr(self, "_dm_record_reply_attempt"):
                        self._dm_record_reply_attempt(payload, status="sent" if not has_next_segment else "segment_sent", actual_text="\n".join(sent_segments), confirmed=not has_next_segment)
                    if hasattr(self, "_dm_record_schedule_post_send_remote_sync"):
                        self._dm_record_schedule_post_send_remote_sync(
                            {
                                **payload,
                                "selected": primary_key or selected_key or expected_selected,
                                "headerName": current_header or expected_header,
                                "conversationType": payload.get("conversationType", "") or reply.get("conversationType", "") or "private",
                                "activeTabText": active_tab,
                            },
                            actual_text=expected_draft,
                        )
                    self.dm_pending_send_payload = None
                    if has_next_segment:
                        self._schedule_next_dm_delivery_segment(payload)
                    return
                started_at = int(payload.get("startedAt", 0) or 0)
                if started_at and self._now_ms() - started_at >= 8000:
                    if reply_token:
                        self.dm_inflight_reply_tokens.discard(reply_token)
                    self._release_dm_session_lock(str(payload.get("selected", "") or selected_key or ""), reply_token)
                    self._log(
                        "WARN",
                        f"私信受控发送超时未确认: {json.dumps({'selected': expected_selected or selected_key, 'headerName': current_header, 'expectedDraft': expected_draft[:80], 'latestOutgoingText': latest_outgoing[:80], 'selectedSummary': selected_summary[:80], 'visibleRightTexts': visible_right_texts[-3:], 'currentInputText': current_input[:80], 'inputCleared': input_cleared, 'inputChanged': input_changed, 'sendButtonEnabledNow': send_enabled}, ensure_ascii=False)}",
                    )
                    if hasattr(self, "_dm_record_reply_attempt"):
                        self._dm_record_reply_attempt(payload, status="send_unconfirmed", error_code="confirm_timeout", error_message="发送点击后页面未在限定时间内确认")
                    self.dm_pending_send_payload = None

    def _maybe_run_dm_reply_precheck(self, result: dict[str, Any]) -> None:
                if not self.page or self.busy or self.current_module != "dm":
                    return
                self._cleanup_dm_runtime_state()
                if self.dm_pending_open_key:
                    return
                if not self.dm_startup_gate_released:
                    return
                reply = result.get("replyReadiness", {}) or {}
                selected = result.get("selectedSession") or {}
                active_tab_for_selected = self._active_dm_tab_text(result) if hasattr(self, "_active_dm_tab_text") else ""
                selected_key = self._session_key(selected) or (self._dm_selected_key_from_reply(reply, selected, active_tab_for_selected) if hasattr(self, "_dm_selected_key_from_reply") else "")
                # current_open_anchor_fallback 场景下，页面右侧已经有可回复消息，但
                # 左侧 selectedSession 可能为空；必须从 pending meta 补齐 selected_key/selected，
                # 否则聚合等待启动后可能无法释放到生成/发送链路。
                if (not selected_key or not selected) and getattr(self, "dm_opened_unreplied_keys", None):
                    for pending_key in list(getattr(self, "dm_opened_unreplied_keys", set())):
                        meta = self._pending_dm_reply_meta(pending_key) if hasattr(self, "_pending_dm_reply_meta") else {}
                        if active_tab_for_selected and str((meta or {}).get("activeTab", "") or "") not in {"", active_tab_for_selected}:
                            continue
                        selected_key = selected_key or str((meta or {}).get("selectedKey", "") or pending_key or "")
                        meta_selected = (meta or {}).get("selected") if isinstance((meta or {}).get("selected"), dict) else {}
                        if not selected and meta_selected:
                            selected = dict(meta_selected)
                        elif not selected:
                            selected = {
                                "sessionKey": selected_key,
                                "nickname": str((meta or {}).get("nickname", "") or reply.get("headerName", "") or ""),
                                "summary": str((meta or {}).get("summary", "") or reply.get("latestIncomingText", "") or ""),
                                "selected": True,
                                "anchorFallback": True,
                            }
                        break
                selected_is_opened_unreplied = bool(selected_key and selected_key in self.dm_opened_unreplied_keys)
                if not self.dm_scan_complete and not selected_is_opened_unreplied:
                    return
                if result.get("unreadCandidates") and not selected_is_opened_unreplied:
                    return
                if not reply.get("canReply"):
                    return
                reply_token = self._reply_token({**reply, "selectedTimeText": selected.get("timeText", "")})
                if not selected_key or not reply_token:
                    return
                message_signature = self._dm_incoming_message_signature(reply, selected, active_tab_for_selected) if hasattr(self, "_dm_incoming_message_signature") else ""
                if message_signature and hasattr(self, "_is_dm_message_signature_handled") and self._is_dm_message_signature_handled(message_signature):
                    return
                cooldown_until = int(self.dm_session_cooldowns.get(selected_key, 0) or 0)
                if cooldown_until > self._now_ms():
                    return
                if reply_token in self.dm_completed_reply_tokens:
                    return
                if reply_token in self.dm_inflight_reply_tokens:
                    return
                if self._has_dm_session_lock(selected_key, reply_token):
                    return
                recent_signature = self._reply_cooldown_signature(reply, selected)
                if (
                    recent_signature
                    and recent_signature == self.dm_last_confirmed_reply_signature
                    and self.dm_last_confirmed_reply_ms
                    and self._now_ms() - self.dm_last_confirmed_reply_ms < 15000
                ):
                    return
                context = dict(result.get("conversationContext", {}) or {})
                reply = dict(reply)
                aggregated_incoming = self._dm_build_reply_message_content(
                    reply,
                    context,
                    selected_key=selected_key,
                ) if hasattr(self, "_dm_build_reply_message_content") else str(reply.get("latestIncomingText", "") or "")
                if aggregated_incoming:
                    reply["aggregatedIncomingText"] = aggregated_incoming
                    context["aggregatedIncomingText"] = aggregated_incoming
                normalized_current_input = re.sub(r"\s+", " ", str(context.get("currentInputText", "") or "")).strip()
                retry_key = self._dm_technical_retry_key(
                    selected_key=selected_key,
                    message_signature=message_signature,
                    message_content=aggregated_incoming,
                ) if hasattr(self, "_dm_technical_retry_key") else ""
                if retry_key and hasattr(self, "_dm_technical_retry_blocked"):
                    blocked, retry_delay_ms = self._dm_technical_retry_blocked(retry_key)
                    if blocked:
                        if hasattr(self, "_schedule_fast_dm_inspect"):
                            self._schedule_fast_dm_inspect(max(300, min(5000, retry_delay_ms + 80)))
                        return
                if self._should_delay_dm_reply_for_aggregate(reply, context, selected, selected_key=selected_key, reply_token=reply_token):
                    # 聚合等待属于已开始的回复流程，必须主动保活，不能依赖扫描/切 Tab
                    # 状态机顺带触发。否则 fallback 候选会出现“已候选但无动作”。
                    try:
                        window = getattr(self, "dm_reply_aggregate_window", {}) or {}
                        now_ms = self._now_ms()
                        release_at = int(window.get("releaseAt", now_ms + 1200) or (now_ms + 1200))
                        deadline_at = int(window.get("deadlineAt", release_at) or release_at)
                        target_at = min(release_at, deadline_at)
                        delay_ms = max(300, min(1200, max(0, target_at - now_ms) + 80))
                    except Exception:
                        delay_ms = 900
                    if hasattr(self, "_schedule_fast_dm_inspect"):
                        self._schedule_fast_dm_inspect(delay_ms)
                    return
                cache_key = self._dm_draft_cache_key(reply, context=context, selected=selected)
                signature_payload = {
                    "replyToken": reply_token,
                    "selected": selected_key,
                    "latestIncomingText": aggregated_incoming or reply.get("latestIncomingText", ""),
                    "aggregatedIncomingText": aggregated_incoming,
                    "messageSignature": message_signature,
                    "technicalRetryKey": retry_key,
                    "state": reply.get("state", ""),
                }
                signature = json.dumps(signature_payload, ensure_ascii=False, sort_keys=True)
                cached = self.dm_draft_cache.get(cache_key) if cache_key else None
                if cached:
                    cached_token = str(cached.get("replyToken", "") or "")
                    cached_header = re.sub(r"\s+", " ", str(cached.get("headerName", "") or "")).strip()
                    cached_incoming = re.sub(r"\s+", " ", str(cached.get("latestIncomingText", "") or "")).strip()
                    current_header = re.sub(r"\s+", " ", str(reply.get("headerName", "") or selected.get("nickname", "") or "")).strip()
                    current_incoming = re.sub(r"\s+", " ", str(aggregated_incoming or reply.get("latestIncomingText", "") or "")).strip()
                    if (cached_token and cached_token != reply_token) or (cached_header and current_header and cached_header != current_header) or (cached_incoming and current_incoming and cached_incoming != current_incoming):
                        self.dm_draft_cache.pop(cache_key, None)
                        cached = None
                if cache_key and not cached:
                    if not self._acquire_dm_session_lock(selected_key, reply_token, "draft_generating"):
                        return
                    if self.dm_pending_draft_future is None:
                        self._start_dm_reply_draft_async(cache_key, signature, reply, context, selected, selected_key=selected_key, reply_token=reply_token)
                    return
                draft_text = self._build_dm_reply_draft_text(reply, context=context, selected=selected)
                normalized_draft = re.sub(r"\s+", " ", draft_text).strip()
                if normalized_current_input and normalized_current_input == normalized_draft:
                    return
                if signature == self.dm_last_precheck_signature:
                    return
                if not self._acquire_dm_session_lock(selected_key, reply_token, "precheck"):
                    return
                cached_meta = cached if isinstance(cached, dict) else {}
                self.dm_pending_stage_payload = {
                    "signature": signature,
                    "selected": selected_key,
                    "headerName": reply.get("headerName", ""),
                    "draftText": draft_text,
                    "deliverySegments": cached_meta.get("deliverySegments") or [{"index": 0, "content": draft_text, "delayBeforeMs": 0}],
                    "deliverySegmentIndex": 0,
                    "sentSegments": [],
                    "baseReplyToken": reply_token,
                    "replyToken": reply_token,
                    "messageSignature": message_signature,
                    "latestIncomingText": aggregated_incoming or reply.get("latestIncomingText", ""),
                    "aggregatedIncomingText": aggregated_incoming,
                    "technicalRetryKey": retry_key,
                    "source": cached_meta.get("source", ""),
                    "model": cached_meta.get("model", ""),
                    "reason": cached_meta.get("reason", ""),
                    "conversationId": cached_meta.get("conversationId", ""),
                    "replyAttemptId": cached_meta.get("replyAttemptId", ""),
                    "replyTraceId": cached_meta.get("replyTraceId", ""),
                    "generationSource": cached_meta.get("generationSource", ""),
                    "cancelRemainingOnCustomerMessage": cached_meta.get("cancelRemainingOnCustomerMessage") is not False,
                    "conversationType": reply.get("conversationType", "") or context.get("conversationType", "") or "private",
                    "activeTabText": reply.get("activeTabText", "") or context.get("activeTabText", "") or active_tab_for_selected,
                }
                self.dm_last_precheck_signature = signature
                self.dm_pending_precheck_signature = signature
                self.busy = True
                self._log(
                    "INFO",
                    f"私信发送前预检查启动: {json.dumps({'selected': selected_key, 'headerName': reply.get('headerName', ''), 'messageContent': (aggregated_incoming or reply.get('latestIncomingText', ''))[:160]}, ensure_ascii=False)}",
                )
                self.page.runJavaScript(build_dm_reply_precheck_script(), self._handle_dm_reply_precheck_result)

    def _handle_dm_reply_precheck_result(self, result: Any) -> None:
                self.busy = False
                result = self._coerce_js_result(result)
                if not isinstance(result, dict):
                    payload = self.dm_pending_stage_payload or {}
                    self._release_dm_session_lock(str(payload.get("selected", "") or ""), str(payload.get("replyToken", "") or ""))
                    self._log("WARN", f"私信发送前预检查结果异常，类型={type(result).__name__}，内容片段={str(result)[:240]}")
                    self.dm_pending_precheck_signature = ""
                    return
                summary = {
                    "ok": result.get("ok", False),
                    "state": result.get("state", "unknown"),
                    "headerName": result.get("headerName", ""),
                    "beforeDisabled": result.get("beforeDisabled"),
                    "afterDisabled": result.get("afterDisabled"),
                    "activatedDuringProbe": result.get("activatedDuringProbe"),
                    "restoredEmpty": result.get("restoredEmpty"),
                    "existingDraftPreview": result.get("existingDraftPreview", ""),
                }
                level = "INFO" if result.get("ok") else "WARN"
                self._log(level, f"私信发送前预检查结果: {json.dumps(summary, ensure_ascii=False)}")
                if self.dm_pending_precheck_signature:
                    self.dm_last_precheck_signature = self.dm_pending_precheck_signature
                self.dm_pending_precheck_signature = ""
                if not result.get("ok"):
                    payload = self.dm_pending_stage_payload or {}
                    self._release_dm_session_lock(str(payload.get("selected", "") or ""), str(payload.get("replyToken", "") or ""))
                    return
                if result.get("state") == "skipped_existing_draft":
                    self._maybe_send_dm_reply(
                        prepared_state=str(result.get("state", "")),
                        draft_preview=str(result.get("existingDraftPreview", "") or ""),
                        after_disabled=result.get("afterDisabled"),
                        current_header=str(result.get("headerName", "") or ""),
                    )
                    return
                self._maybe_stage_dm_reply_draft(result)

    def _handle_dm_open_session_result(self, result: Any) -> None:
                self.busy = False
                result = self._coerce_js_result(result)
                if not isinstance(result, dict):
                    self._log("WARN", f"私信会话打开结果异常，类型={type(result).__name__}，内容片段={str(result)[:320]}")
                    return
                if result.get("clicked"):
                    info = {
                        "domIndex": result.get("domIndex"),
                        "itemText": result.get("itemText", ""),
                        "expected": result.get("expected") or {},
                        "actual": result.get("actual") or {},
                        "matchedByFingerprint": bool(result.get("matchedByFingerprint")),
                        "attempts": (result.get("attempts", []) or [])[:6],
                    }
                    self.last_dm_open_attempt_ms = self._now_ms()
                    self._log("INFO", f"私信会话打开尝试已执行: {json.dumps(info, ensure_ascii=False)}")
                    self._schedule_fast_dm_inspect(1200)
                else:
                    self._log("WARN", f"私信会话打开失败: {json.dumps(result, ensure_ascii=False)}")
                    # The robust opener refused to click because the current DOM
                    # no longer matched the pending fingerprint. Clear stale
                    # pending state so the next inspection can re-scan and re-locate
                    # the unread row safely.
                    if hasattr(self, "_dm_clear_pending_open"):
                        self._dm_clear_pending_open(reason=str(result.get("reason", "open_failed") or "open_failed"))
                    self._schedule_fast_dm_inspect(900)

    def _handle_dm_scroll_result(self, result: Any) -> None:
                self.busy = False
                result = self._coerce_js_result(result)
                if not isinstance(result, dict):
                    self._log("WARN", f"私信列表滚动结果异常，类型={type(result).__name__}，内容片段={str(result)[:240]}")
                    return
                if not result.get("ok"):
                    self._log("WARN", f"私信列表滚动失败: {json.dumps(result, ensure_ascii=False)}")
                    return
                if result.get("changed"):
                    self.dm_scroll_no_change_count = 0
                else:
                    self.dm_scroll_no_change_count += 1
                    if self.dm_scroll_no_change_count >= 2 or result.get("atBottom"):
                        self.dm_scan_complete = True
                self._log("INFO", f"私信列表滚动结果: {json.dumps(result, ensure_ascii=False)}")
                self._schedule_fast_dm_inspect(900)
