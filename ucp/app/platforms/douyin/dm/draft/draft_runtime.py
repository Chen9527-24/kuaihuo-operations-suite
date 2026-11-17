from __future__ import annotations

import json
import re
from typing import Any

from PySide6.QtCore import QTimer

from app.services.dm_reply.utils import build_aggregate_signature, build_draft_cache_key
from app.services.auto_reply_runtime import auto_reply_backend_enabled, build_dm_test_payload, dm_first_reply_contents, dm_use_conversation_context
from app.platforms.douyin.common.js_scripts import (
    build_dm_open_session_script,
    build_dm_reply_precheck_script,
    build_dm_scroll_list_script,
    build_dm_send_reply_script,
    build_dm_stage_reply_script,
)


class SessionControllerDMDraftMixin:
    def _start_dm_reply_draft_async(
                self,
                cache_key: str,
                request_signature: str,
                reply: dict[str, Any],
                context: dict[str, Any],
                selected: dict[str, Any],
                *,
                selected_key: str,
                reply_token: str,
            ) -> None:
                if self.dm_pending_draft_future is not None:
                    return
                self.dm_pending_draft_cache_key = cache_key
                self.dm_pending_draft_request_signature = request_signature
                message_content = str(
                    reply.get("aggregatedIncomingText", "")
                    or (context or {}).get("aggregatedIncomingText", "")
                    or reply.get("latestIncomingText", "")
                    or ""
                ).strip()
                signature_payload: dict[str, Any] = {}
                if request_signature:
                    try:
                        loaded_signature = json.loads(request_signature)
                        if isinstance(loaded_signature, dict):
                            signature_payload = loaded_signature
                    except Exception:
                        signature_payload = {}
                message_signature = str(signature_payload.get("messageSignature", "") or "")
                technical_retry_key = str(signature_payload.get("technicalRetryKey", "") or "")
                self.dm_pending_draft_context = {
                    "selected": selected_key,
                    "replyToken": reply_token,
                    "headerName": str(reply.get("headerName", "") or selected.get("nickname", "") or ""),
                    "latestIncomingText": message_content,
                    "aggregatedIncomingText": message_content,
                    "messageSignature": message_signature,
                    "technicalRetryKey": technical_retry_key,
                    "conversationType": str(reply.get("conversationType", "") or context.get("conversationType", "") or "private"),
                    "activeTabText": str(reply.get("activeTabText", "") or context.get("activeTabText", "") or ""),
                    "aggregateSignature": build_aggregate_signature(reply, context=context, selected=selected),
                }
                if hasattr(self, "_dm_record_analysis_started"):
                    self._dm_record_analysis_started(self.dm_pending_draft_context)

                def _worker() -> dict[str, Any]:
                    def _base(text: str, source: str, model: str = "", reason: str = "", extra: dict[str, Any] | None = None) -> dict[str, Any]:
                        payload = {"text": re.sub(r"\s+", " ", str(text or "")).strip(), "source": source, "model": model, "reason": reason, "selected": selected_key, "replyToken": reply_token, "headerName": str(reply.get("headerName", "") or selected.get("nickname", "") or ""), "latestIncomingText": message_content, "aggregatedIncomingText": message_content, "messageSignature": message_signature, "technicalRetryKey": technical_retry_key, "conversationType": str(reply.get("conversationType", "") or context.get("conversationType", "") or "private"), "activeTabText": str(reply.get("activeTabText", "") or context.get("activeTabText", "") or "")}
                        if isinstance(extra, dict):
                            payload.update(extra)
                        return payload
                    def _delivery_segments(response: dict[str, Any], replies: list[Any]) -> list[dict[str, Any]]:
                        raw = response.get("raw") if isinstance(response.get("raw"), dict) else {}
                        raw_segments = raw.get("segments") if isinstance(raw.get("segments"), list) else []
                        normalized: list[dict[str, Any]] = []
                        for index, item in enumerate(raw_segments):
                            source = item if isinstance(item, dict) else {}
                            content = str(source.get("content") or "").strip()
                            if not content:
                                continue
                            delay = int(source.get("delayBeforeMs") or (900 if index else 0))
                            normalized.append({"index": len(normalized), "content": content, "delayBeforeMs": max(0, min(5000, delay))})
                        if not normalized:
                            normalized = [
                                {"index": index, "content": str(item).strip(), "delayBeforeMs": 900 if index else 0}
                                for index, item in enumerate(replies)
                                if str(item).strip()
                            ]
                        conversation_type = str(reply.get("conversationType", "") or context.get("conversationType", "") or "private").strip().lower()
                        if conversation_type == "group" and len(normalized) > 1:
                            merged = "\n".join(str(item.get("content", "") or "").strip() for item in normalized if str(item.get("content", "") or "").strip())
                            return [{"index": 0, "content": merged, "delayBeforeMs": 0}] if merged else []
                        return normalized

                    def _failure_retryable(response: dict[str, Any]) -> bool:
                        raw = response.get("raw") if isinstance(response.get("raw"), dict) else {}
                        coze = raw.get("coze") if isinstance(raw.get("coze"), dict) else {}
                        code = str(coze.get("code") or raw.get("code") or "").strip().lower()
                        event = str(coze.get("failureEvent") or raw.get("event") or "").strip().lower()
                        reason_text = " ".join(
                            str(value or "")
                            for value in (
                                response.get("failReason"),
                                response.get("skipReason"),
                                coze.get("message"),
                                raw.get("error"),
                            )
                        ).lower()
                        non_retryable_tokens = (
                            "free quota", "quota has been used up", "upgrade to a paid",
                            "unauthorized", "forbidden", "permission", "invalid token",
                            "workflow not found", "invalid workflow", "parameter",
                        )
                        if code in {"401", "403", "4028"} or any(token in reason_text for token in non_retryable_tokens):
                            return False
                        if event in {"transport.error", "timeout", "network.error"}:
                            return True
                        if "fetch failed" in reason_text or "timeout" in reason_text or "temporar" in reason_text:
                            return True
                        http_status = int(coze.get("httpStatus", 0) or 0)
                        return http_status >= 500 or not http_status

                    first_done = getattr(self, "backend_dm_first_reply_done", None)
                    if not isinstance(first_done, set):
                        first_done = set()
                        self.backend_dm_first_reply_done = first_done
                    backend_configured = auto_reply_backend_enabled(getattr(self, "account", None), "dm")
                    service = getattr(self, "core_service", None)
                    conversation_ids = getattr(self, "backend_dm_conversation_ids", None)
                    if not isinstance(conversation_ids, dict):
                        conversation_ids = {}
                        self.backend_dm_conversation_ids = conversation_ids
                    conv_id = str(conversation_ids.get(selected_key, "") or "")
                    dialogue_resolution: dict[str, Any] = {}
                    dialogue_conversation_id = ""
                    current_client_message_ids: list[str] = []
                    if backend_configured and hasattr(self, "_dm_record_resolve_remote_context"):
                        dialogue_resolution = self._dm_record_resolve_remote_context({
                            **self.dm_pending_draft_context,
                            "selected": selected_key,
                            "replyToken": reply_token,
                            "headerName": str(reply.get("headerName", "") or selected.get("nickname", "") or ""),
                            "latestIncomingText": message_content,
                            "aggregatedIncomingText": message_content,
                        }) or {}
                        dialogue_conversation_id = str(dialogue_resolution.get("canonicalConversationId") or "")
                        current_client_message_ids = [
                            str(item or "") for item in (dialogue_resolution.get("currentClientMessageIds") or []) if str(item or "")
                        ]
                        workflow_conversation_id = str(dialogue_resolution.get("workflowConversationId") or "")
                        if workflow_conversation_id:
                            conv_id = workflow_conversation_id
                            conversation_ids[selected_key] = conv_id

                    if not conv_id and not dialogue_conversation_id and service is not None and backend_configured and hasattr(service, "list_dm_conversations"):
                        header_name = str(reply.get("headerName", "") or selected.get("nickname", "") or selected_key or "").strip()
                        lookup_candidates = []
                        for candidate in (header_name, selected_key):
                            candidate = str(candidate or "").strip()
                            if candidate and candidate not in lookup_candidates:
                                lookup_candidates.append(candidate)
                        for candidate in lookup_candidates:
                            try:
                                data = service.list_dm_conversations(
                                    robot_id=str(getattr(getattr(self, "account", None), "id", "") or ""),
                                    platform="douyin",
                                    user_nickname=candidate,
                                    page_size=5,
                                )
                            except Exception as lookup_exc:
                                self._log("WARN", f"私信查询历史 conversation_id 失败：{type(lookup_exc).__name__}: {str(lookup_exc)[:120]}")
                                break
                            conversations = data.get("conversations") if isinstance(data, dict) else []
                            if not isinstance(conversations, list):
                                continue
                            for item in conversations:
                                if not isinstance(item, dict):
                                    continue
                                user_name = str(item.get("user_nickname") or item.get("userNickname") or "").strip()
                                found_id = str(item.get("conversation_id") or item.get("conversationId") or "").strip()
                                if found_id and (user_name == candidate or candidate == selected_key):
                                    conv_id = found_id
                                    conversation_ids[selected_key] = conv_id
                                    first_done.add(selected_key)
                                    self._log("INFO", f"私信复用历史 conversation_id：selected={selected_key} user={user_name or candidate} conversationId={conv_id[:18]}...")
                                    break
                            if conv_id:
                                break

                    first_replies = dm_first_reply_contents(getattr(self, "account", None))
                    if first_replies and selected_key not in first_done:
                        first_done.add(selected_key)
                        first_segments = [
                            {"index": index, "content": str(item).strip(), "delayBeforeMs": 900 if index else 0}
                            for index, item in enumerate(first_replies)
                            if str(item).strip()
                        ]
                        conversation_type = str(reply.get("conversationType", "") or context.get("conversationType", "") or "private").strip().lower()
                        if conversation_type == "group" and len(first_segments) > 1:
                            merged = "\n".join(str(item.get("content", "") or "").strip() for item in first_segments if str(item.get("content", "") or "").strip())
                            first_segments = [{"index": 0, "content": merged, "delayBeforeMs": 0}] if merged else []
                        return _base(first_segments[0]["content"] if first_segments else "", "robot_first_reply", reason="first_reply_config", extra={"deliverySegments": first_segments, "cancelRemainingOnCustomerMessage": True})
                    try:
                        if service is not None and backend_configured:
                            payload = build_dm_test_payload(getattr(self, "account", None), message_content, conversation_id=conv_id if dm_use_conversation_context(getattr(self, "account", None)) else "")
                            if dialogue_conversation_id:
                                payload["dialogueConversationId"] = dialogue_conversation_id
                            if current_client_message_ids:
                                payload["currentClientMessageIds"] = list(current_client_message_ids)[:20]
                                payload["customerMessageId"] = str(current_client_message_ids[-1] or "")[:512]
                            reply_attempt_id = str(self.dm_pending_draft_context.get("replyAttemptId") or "")[:512]
                            if reply_attempt_id:
                                payload["replyAttemptId"] = reply_attempt_id
                            if payload.get("messageContent"):
                                self._log("INFO", f"私信后端自动回复接口调用开始: {json.dumps({'selected': selected_key, 'headerName': reply.get('headerName', ''), 'content': str(payload.get('messageContent', ''))[:80], 'useConversationContext': bool(payload.get('useConversationContext')), 'hasConversationId': bool(payload.get('conversationId')), 'hasDialogueConversationId': bool(payload.get('dialogueConversationId')), 'currentMessageCount': len(payload.get('currentClientMessageIds') or []), 'hasPromptConfigId': bool(payload.get('promptConfigId'))}, ensure_ascii=False)}")
                                response = service.runtime_dm_reply(payload)
                                if isinstance(response, dict):
                                    new_conv_id = str(response.get("conversationId") or response.get("conversation_id") or "")
                                    reply_trace_id = str(response.get("replyTraceId") or "")[:512]
                                    generation_source = str(response.get("source") or response.get("generationSource") or "")[:64]
                                    if new_conv_id:
                                        conversation_ids[selected_key] = new_conv_id
                                        if dialogue_conversation_id and hasattr(service, "update_dialogue_workflow_conversation"):
                                            try:
                                                service.update_dialogue_workflow_conversation(dialogue_conversation_id, new_conv_id)
                                            except Exception as mapping_exc:
                                                self._log("WARN", f"私信服务端工作流会话映射更新失败，不影响本次回复：{type(mapping_exc).__name__}: {str(mapping_exc)[:120]}")
                                    replies = response.get("replies") if isinstance(response.get("replies"), list) else []
                                    self._log("INFO", f"私信后端自动回复接口调用完成: {json.dumps({'source': response.get('source', ''), 'conversationId': new_conv_id, 'replyCount': len(replies), 'shouldReply': response.get('shouldReply', None), 'replyStatus': response.get('replyStatus', ''), 'hasReply': bool(replies)}, ensure_ascii=False)}")
                                    reply_status = str(response.get("replyStatus", "") or "").strip().lower()
                                    if reply_status == "failed":
                                        reason = str(response.get("failReason") or response.get("skipReason") or response.get("judgeReason") or "后端私信回复技术失败")
                                        return _base(
                                            "",
                                            f"backend:{str(response.get('source', '') or 'dm')}",
                                            reason=reason,
                                            extra={
                                                "technicalFailure": True,
                                                "retryable": _failure_retryable(response),
                                                "skipReply": False,
                                                "skipReason": "",
                                                "replyStatus": "failed",
                                                "backendRaw": response,
                                                "conversationId": new_conv_id,
                                                "replyTraceId": reply_trace_id,
                                                "generationSource": generation_source,
                                            },
                                        )
                                    if response.get("shouldReply") is False or bool(response.get("skipReply")) or reply_status == "not_required":
                                        reason = str(response.get("skipReason") or response.get("judgeReason") or "当前私信无需回复")
                                        return _base("", f"backend:{str(response.get('source', '') or 'dm')}", reason=reason, extra={"skipReply": True, "skipReason": reason, "replyStatus": "not_required", "backendRaw": response, "conversationId": new_conv_id, "replyTraceId": reply_trace_id, "generationSource": generation_source})
                                    delivery_segments = _delivery_segments(response, replies)
                                    response_raw = response.get("raw") if isinstance(response.get("raw"), dict) else {}
                                    cancel_remaining = response_raw.get("cancelRemainingOnCustomerMessage") is not False
                                    if delivery_segments:
                                        return _base(
                                            delivery_segments[0]["content"],
                                            f"backend:{str(response.get('source', '') or 'dm')}",
                                            model=str(response.get("model", "") or ""),
                                            reason=str(response.get("reason", "") or "backend_dm"),
                                            extra={
                                                "backendRaw": response,
                                                "conversationId": new_conv_id,
                                                "replyTraceId": reply_trace_id,
                                                "generationSource": generation_source,
                                                "deliverySegments": delivery_segments,
                                                "cancelRemainingOnCustomerMessage": cancel_remaining,
                                            },
                                        )
                                if backend_configured:
                                    reason = "私信后端自动回复接口返回为空。"
                                    return _base("", "backend:empty", reason=reason, extra={"technicalFailure": True, "retryable": True, "skipReply": False, "skipReason": "", "replyStatus": "failed", "backendRaw": {"replyStatus": "failed", "failReason": reason, "messageType": "backend_empty"}})
                    except Exception as exc:
                        if backend_configured:
                            reason = f"私信后端自动回复接口调用失败：{type(exc).__name__}: {str(exc)[:120]}"
                            self._log("WARN", reason)
                            return _base("", "backend:error", reason=reason, extra={"technicalFailure": True, "retryable": True, "skipReply": False, "skipReason": "", "replyStatus": "failed", "backendRaw": {"replyStatus": "failed", "failReason": reason, "messageType": "backend_error"}})
                        self._log("WARN", f"私信后端自动回复接口调用失败，改走本地兜底: {type(exc).__name__}: {str(exc)[:160]}")
                    decision = self.dm_reply_engine.build_reply(reply, context=context, selected=selected, robot_name=getattr(self.account, "robot_name", getattr(self.account, "name", "")))
                    local_text = str(decision.text or "").strip()
                    return _base(local_text, decision.source, decision.model, decision.reason, extra={"deliverySegments": [{"index": 0, "content": local_text, "delayBeforeMs": 0}] if local_text else [], "cancelRemainingOnCustomerMessage": True})

                self.dm_pending_draft_future = self.dm_reply_executor.submit(_worker)
                preview = {
                    "headerName": reply.get("headerName", ""),
                    "messageContent": message_content[:160],
                }
                self._emit_phase_observation("generate", "started", {"headerName": reply.get('headerName', ''), "selected": selected.get('nickname', ''), "latestIncomingText": str(reply.get('latestIncomingText', '') or '')[:40]}, force=True)
                self._log("INFO", f"私信回复草稿异步生成启动: {json.dumps(preview, ensure_ascii=False)}")

    def _build_dm_reply_draft_text(
                self,
                reply: dict[str, Any],
                context: dict[str, Any] | None = None,
                selected: dict[str, Any] | None = None,
            ) -> str:
                context = context or {}
                selected = selected or {}
                latest_incoming = re.sub(r"\s+", " ", str(reply.get("aggregatedIncomingText", "") or (context or {}).get("aggregatedIncomingText", "") or reply.get("latestIncomingText", "") or "")).strip()
                cache_key = self._dm_draft_cache_key(reply, context=context, selected=selected)
                if cache_key and cache_key in self.dm_draft_cache:
                    cached = self.dm_draft_cache[cache_key]
                    draft_text = re.sub(r"\s+", " ", str(cached.get("text", "") or "")).strip()
                    if draft_text:
                        self._log(
                            "INFO",
                            f"私信回复草稿已生成: {json.dumps({'headerName': str(reply.get('headerName', '') or selected.get('nickname', '') or ''), 'latestIncomingText': latest_incoming[:80], 'source': cached.get('source', ''), 'model': cached.get('model', ''), 'reason': cached.get('reason', ''), 'draftPreview': draft_text[:80]}, ensure_ascii=False)}",
                        )
                        return draft_text
                if any(token in latest_incoming for token in ["在吗", "还在吗", "在不在"]):
                    return "在呢在呢，刚看到～"
                if any(token in latest_incoming for token in ["不回复", "又不见了", "人呢"]):
                    return "别急别急，我这不来了嘛～"
                if latest_incoming.endswith(("?", "？")):
                    return "在呢，刚忙完一下，咋啦？"
                if latest_incoming:
                    return "我在呢，你继续说～"
                return "哈哈我在，怎么啦？"

    def _maybe_stage_dm_reply_draft(self, precheck_result: dict[str, Any]) -> None:
                if not self.page or self.busy or self.current_module != "dm":
                    return
                if not precheck_result.get("ok"):
                    return
                if precheck_result.get("state") != "probe_complete":
                    payload = self.dm_pending_stage_payload or {}
                    self._release_dm_session_lock(str(payload.get("selected", "") or ""), str(payload.get("replyToken", "") or ""))
                    return
                if not precheck_result.get("activatedDuringProbe") and precheck_result.get("afterDisabled"):
                    payload = self.dm_pending_stage_payload or {}
                    self._release_dm_session_lock(str(payload.get("selected", "") or ""), str(payload.get("replyToken", "") or ""))
                    return
                payload = self.dm_pending_stage_payload or {}
                signature = str(payload.get("signature", "") or "")
                draft_text = str(payload.get("draftText", "") or "")
                if not signature or not draft_text.strip():
                    return
                if signature == self.dm_last_draft_stage_signature:
                    return
                self.dm_last_draft_stage_signature = signature
                self.busy = True
                self._log(
                    "INFO",
                    f"私信回复草稿注入启动: {json.dumps({'selected': payload.get('selected', ''), 'draftPreview': draft_text[:80], 'headerName': payload.get('headerName', '')}, ensure_ascii=False)}",
                )
                self.page.runJavaScript(build_dm_stage_reply_script(draft_text), self._handle_dm_stage_reply_result)

    def _handle_dm_stage_reply_result(self, result: Any) -> None:
                self.busy = False
                result = self._coerce_js_result(result)
                if not isinstance(result, dict):
                    payload = self.dm_pending_stage_payload or {}
                    self._release_dm_session_lock(str(payload.get("selected", "") or ""), str(payload.get("replyToken", "") or ""))
                    self._log("WARN", f"私信回复草稿注入结果异常，类型={type(result).__name__}，内容片段={str(result)[:240]}")
                    return
                summary = {
                    "ok": result.get("ok", False),
                    "state": result.get("state", "unknown"),
                    "headerName": result.get("headerName", ""),
                    "afterDisabled": result.get("afterDisabled"),
                    "draftPreview": result.get("draftPreview", ""),
                    "inputLength": result.get("inputLength"),
                }
                level = "INFO" if result.get("ok") else "WARN"
                self._log(level, f"私信回复草稿注入结果: {json.dumps(summary, ensure_ascii=False)}")
                if result.get("ok") and result.get("state") in {"draft_staged", "skipped_existing_draft"}:
                    self._maybe_send_dm_reply(
                        prepared_state=str(result.get("state", "")),
                        draft_preview=str(result.get("draftPreview", "") or ""),
                        after_disabled=result.get("afterDisabled"),
                        current_header=str(result.get("headerName", "") or ""),
                    )
                    return
                payload = self.dm_pending_stage_payload or {}
                self._release_dm_session_lock(str(payload.get("selected", "") or ""), str(payload.get("replyToken", "") or ""))
