from __future__ import annotations

import json
import re
from typing import Any

from PySide6.QtCore import QPoint, Qt, QTimer

try:
    from PySide6.QtTest import QTest
except Exception:  # pragma: no cover - QtTest may be unavailable in some builds
    QTest = None

from app.platforms.douyin.comment.filter.candidate_scope import apply_candidate_scope
from app.services.auto_reply_runtime import (
    build_comment_test_payload,
    comment_reply_dataset_id,
    comment_reply_mode,
    current_time_text,
    intent_label,
    module_auto_reply_config,
    normalize_comment_time_text,
)
from app.platforms.douyin.comment.scripts.comment_scripts import (
    build_comment_focus_reply_editor_script,
    build_comment_open_reply_editor_script,
    build_comment_prepare_reply_click_script,
)


TRACE_REPLY_EDITOR = "COMMENT_TRACE_REPLY_EDITOR_V70"
TRACE_EDITOR_DIAG = "COMMENT_TRACE_EDITOR_DIAG_V70"


class SessionControllerCommentReplyEditorMixin:
    def _comment_verbose_logs_enabled(self) -> bool:
                cfg = getattr(self, "comment_runtime_config", None)
                if isinstance(cfg, dict):
                    logging_cfg = cfg.get("logging") if isinstance(cfg.get("logging"), dict) else {}
                    return bool(cfg.get("verboseLogs") or cfg.get("debugLogs") or logging_cfg.get("verbose") or logging_cfg.get("debug"))
                return False

    def _comment_diag_summary(self, payload: dict[str, Any]) -> dict[str, Any]:
                return {
                    "stage": str(payload.get("stage", "") or ""),
                    "reason": str(payload.get("reason", "") or payload.get("decision", "") or ""),
                    "target": str(payload.get("targetThreadKey", "") or payload.get("threadKey", "") or "")[:160],
                    "author": str(payload.get("targetAuthor", "") or payload.get("author", "") or "")[:80],
                    "matched": bool(payload.get("targetMatched", False)),
                    "editorVisible": bool(payload.get("targetReplyEditorVisible", False)),
                    "editors": int(payload.get("replyEditorsFound", 0) or 0),
                    "candidates": int(payload.get("candidateCount", 0) or 0),
                }

    def _comment_candidate_config(self) -> dict[str, Any]:
                config = self.comment_runtime_config if isinstance(getattr(self, "comment_runtime_config", None), dict) else {}
                return config.get("candidate", {}) if isinstance(config.get("candidate"), dict) else {}

    def _comment_log_candidate_scope_decisions(self, decisions: list[dict[str, Any]]) -> None:
                if not isinstance(decisions, list):
                    return
                now_ms = self._now_ms()
                last_ms = int(getattr(self, "comment_candidate_scope_last_log_ms", 0) or 0)
                if now_ms - last_ms < 2500:
                    return
                compact: list[dict[str, Any]] = []
                for item in decisions[:8]:
                    if not isinstance(item, dict):
                        continue
                    compact.append({"thread": str(item.get("threadKey", "") or "")[:80], "topAuthor": str(item.get("topAuthor", "") or "")[:40], "messageAuthor": str(item.get("messageAuthor", "") or "")[:40], "replyTo": str(item.get("replyTo", "") or "")[:40], "role": str(item.get("role", "") or ""), "afterAuthorReply": bool(item.get("afterAuthorReply", False)), "directToAuthor": bool(item.get("directToAuthor", False)), "decision": str(item.get("decision", "") or ""), "reason": str(item.get("reason", "") or "")[:80]})
                signature = json.dumps(compact, ensure_ascii=False, sort_keys=True)
                if signature == str(getattr(self, "comment_candidate_scope_last_signature", "") or "") and now_ms - last_ms < 15000:
                    return
                self.comment_candidate_scope_last_log_ms = now_ms
                self.comment_candidate_scope_last_signature = signature
                if compact:
                    self._log("INFO", f"评论页候选裁决: {json.dumps(compact, ensure_ascii=False)}")

    def _comment_normalize_text(self, value: Any, limit: int = 240) -> str:
                return re.sub(r"\s+", " ", str(value or "")).strip()[:limit]


    def _comment_backend_enabled(self) -> bool:
                cfg = module_auto_reply_config(getattr(self, "account", None), "comment")
                return bool(cfg.get("promptConfigId") or cfg.get("promptSnapshot"))

    def _comment_processed_reply_statuses(self) -> set[str]:
                # 只把“无需回复/已真实发送”视为可直接跳过。
                # generated/failed 只代表后端曾生成或 GUI 曾发送失败，仍必须继续进入发送链路，不能当成已完成。
                return {"not_required", "no_reply", "skipped", "ignore", "ignored", "sent", "replied", "success", "succeeded", "done", "manual_sent"}

    def _comment_is_existing_record_processed(self, record: dict[str, Any] | None) -> bool:
                if not isinstance(record, dict) or not record:
                    return False
                status = self._comment_normalize_text(record.get("reply_status") or record.get("replyStatus"), limit=40).lower()
                if status and status != "pending":
                    return status in self._comment_processed_reply_statuses()
                skip_flag = bool(record.get("skip_reply") or record.get("skipReply"))
                should_reply = record.get("should_reply") if "should_reply" in record else record.get("shouldReply")
                # 老数据没有标准状态时，只把明确 skip/shouldReply=false 视为无需再调用 Coze。
                return bool(skip_flag or should_reply is False)

    def _comment_lookup_existing_record(self, result: dict[str, Any] | None, target: dict[str, Any], *, platform: str = "douyin") -> dict[str, Any]:
                service = getattr(self, "core_service", None)
                if service is None or not isinstance(target, dict):
                    return {}
                record_payload = self._comment_record_payload(result, target, backend_payload={"replyStatus": "pending"})
                record_id = self._comment_normalize_text(record_payload.get("recordId"), limit=240)
                user_nickname = self._comment_normalize_text(record_payload.get("userNickname"), limit=120)
                comment_content = self._comment_normalize_text(record_payload.get("commentContent"), limit=2000)
                if not record_id and not (user_nickname and comment_content):
                    return {}

                def _match_item(items: list[Any]) -> dict[str, Any]:
                    for item in items:
                        if not isinstance(item, dict):
                            continue
                        item_record_id = self._comment_normalize_text(item.get("record_id") or item.get("recordId"), limit=240)
                        item_user = self._comment_normalize_text(item.get("user_nickname") or item.get("userNickname"), limit=120)
                        item_content = self._comment_normalize_text(item.get("comment_content") or item.get("commentContent"), limit=2000)
                        matched = bool(record_id and item_record_id == record_id) or bool(user_nickname and comment_content and item_user == user_nickname and item_content == comment_content)
                        if matched:
                            return item
                    return {}

                def _lookup(payload: dict[str, Any]) -> list[Any]:
                    if not hasattr(service, "lookup_comment_records"):
                        return []
                    response = service.lookup_comment_records(payload)
                    raw_items = response.get("items") if isinstance(response, dict) else []
                    return raw_items if isinstance(raw_items, list) else []

                lookup_errors: list[str] = []
                primary_payload = {
                    "robotId": getattr(getattr(self, "account", None), "id", "") or None,
                    "platform": platform,
                    "records": [{
                        "recordId": record_id or None,
                        "userNickname": user_nickname or None,
                        "commentContent": comment_content or None,
                    }],
                }
                try:
                    found = _match_item(_lookup(primary_payload))
                    if found:
                        return found
                except Exception as exc:
                    lookup_errors.append(f"primary:{type(exc).__name__}:{str(exc)[:100]}")

                # 二次兜底：同一租户下，按“平台 + 客户昵称 + 评论内容”精确匹配。
                # 评论判断的 not_required/skip 结果可以跨机器人复用，避免同一客户同一句评论重复请求 Coze；
                # generated/failed 仍由后续逻辑决定是否复用草稿或重试发送。
                if user_nickname and comment_content:
                    relaxed_payload = {
                        "platform": platform,
                        "records": [{
                            "recordId": None,
                            "userNickname": user_nickname,
                            "commentContent": comment_content,
                        }],
                    }
                    try:
                        found = _match_item(_lookup(relaxed_payload))
                        if found:
                            return found
                    except Exception as exc:
                        lookup_errors.append(f"relaxed:{type(exc).__name__}:{str(exc)[:100]}")

                if record_id and hasattr(service, "list_comment_records"):
                    try:
                        fallback = service.list_comment_records(robot_id=getattr(getattr(self, "account", None), "id", "") or "", platform=platform, record_id=record_id, page_size=5)
                        raw_items = fallback.get("items") if isinstance(fallback, dict) else []
                        found = _match_item(raw_items if isinstance(raw_items, list) else [])
                        if found:
                            return found
                    except Exception as exc:
                        lookup_errors.append(f"list_by_record:{type(exc).__name__}:{str(exc)[:100]}")

                if user_nickname and comment_content and hasattr(service, "list_comment_records"):
                    try:
                        fallback = service.list_comment_records(robot_id="", platform=platform, record_id="", page_size=80)
                        raw_items = fallback.get("items") if isinstance(fallback, dict) else []
                        found = _match_item(raw_items if isinstance(raw_items, list) else [])
                        if found:
                            return found
                    except Exception as exc:
                        lookup_errors.append(f"list_by_customer:{type(exc).__name__}:{str(exc)[:100]}")

                if lookup_errors:
                    self._log("WARN", f"评论处理记录查询未命中或部分失败，继续走原流程：{' | '.join(lookup_errors)[:240]}")
                return {}

    def _comment_lookup_processed_record(self, result: dict[str, Any] | None, target: dict[str, Any], *, platform: str = "douyin") -> dict[str, Any]:
                item = self._comment_lookup_existing_record(result, target, platform=platform)
                return item if self._comment_is_existing_record_processed(item) else {}

    def _comment_complete_existing_processed_target(self, result: dict[str, Any], target: dict[str, Any], record: dict[str, Any] | None = None) -> None:
                if not isinstance(target, dict):
                    return
                signature = str(target.get("signature", "") or "")
                if not signature and hasattr(self, "_comment_target_signature"):
                    signature = self._comment_target_signature(target, result=result)
                # Mark the message target as completed, not the whole parent thread.
                # A later user follow-up in the same comment thread must remain eligible.
                for key in [signature, str(target.get("targetMessageKey", "") or ""), str(target.get("messageKey", "") or "")]:
                    key = str(key or "").strip()
                    if key:
                        self.comment_completed_thread_keys.add(key)
                        self._comment_release_inflight_signature(key, reason="backend_record_already_processed")
                self.comment_preopen_reply_target = None
                self.comment_preopen_reply_context = None
                self.comment_preopen_reply_future = None
                status = self._comment_normalize_text((record or {}).get("reply_status") or (record or {}).get("replyStatus"), limit=40) or "processed"
                self._log("INFO", f"评论已存在后端处理记录，跳过 Coze 调用: {json.dumps({'author': target.get('author', ''), 'content': str(target.get('content', '') or '')[:80], 'status': status}, ensure_ascii=False)}")
                if hasattr(self, "_comment_set_flow_stage"):
                    self._comment_set_flow_stage("scan_candidates_under_unreplied", result, reason="backend_record_already_processed")
                self._schedule_fast_comment_inspect(600)

    def _comment_context_remove_current_target(self, rows: list[dict[str, Any]], target: dict[str, Any]) -> list[dict[str, Any]]:
                clean_rows = [dict(item) for item in rows if isinstance(item, dict) and self._comment_normalize_text(item.get("content"), limit=1000)]
                target_content = self._comment_normalize_text(target.get("content"), limit=1000).casefold()
                target_level = 1 if self._comment_normalize_text(target.get("targetLevel") or target.get("level"), limit=24).lower() == "top" else 2
                if not target_content:
                    return clean_rows
                for index in range(len(clean_rows) - 1, -1, -1):
                    row = clean_rows[index]
                    row_role = self._comment_normalize_text(row.get("role"), limit=24).lower()
                    row_content = self._comment_normalize_text(row.get("content"), limit=1000).casefold()
                    row_level = int(row.get("level") or 1)
                    if row_role == "user" and row_level == target_level and row_content == target_content:
                        clean_rows.pop(index)
                        break
                return clean_rows

    def _comment_context_page_rows(self, context: dict[str, Any], target: dict[str, Any]) -> list[dict[str, Any]]:
                thread = context.get("thread") if isinstance(context, dict) and isinstance(context.get("thread"), dict) else {}
                rows: list[dict[str, Any]] = []
                root_content = self._comment_normalize_text(thread.get("content"), limit=1000)
                if root_content:
                    rows.append({
                        "role": "account" if bool(thread.get("isAuthor")) else "user",
                        "author": self._comment_normalize_text(thread.get("author"), limit=128),
                        "content": root_content,
                        "level": 1,
                        "messageId": self._comment_normalize_text(thread.get("messageKey") or thread.get("threadKey"), limit=256),
                    })
                nested = thread.get("nestedReplies") if isinstance(thread.get("nestedReplies"), list) else thread.get("nestedReplySamples")
                for item in list(nested or [])[:40]:
                    if not isinstance(item, dict):
                        continue
                    content = self._comment_normalize_text(item.get("content"), limit=1000)
                    if not content:
                        continue
                    rows.append({
                        "role": "account" if bool(item.get("isAuthor")) else "user",
                        "author": self._comment_normalize_text(item.get("author"), limit=128),
                        "content": content,
                        "level": 2,
                        "messageId": self._comment_normalize_text(item.get("messageKey"), limit=256),
                    })
                return self._comment_context_remove_current_target(rows, target)

    def _comment_context_local_rows(self, result: dict[str, Any], target: dict[str, Any]) -> tuple[str, list[dict[str, Any]]]:
                service = getattr(self, "record_service", None)
                if service is None or not hasattr(service, "recent_comment_messages"):
                    return "", []
                root_id = ""
                try:
                    if hasattr(self, "_comment_build_remote_record_for_target"):
                        record = self._comment_build_remote_record_for_target(result, target)
                        root_id = self._comment_normalize_text((record or {}).get("rootRecordId"), limit=256)
                except Exception:
                    root_id = ""
                if not root_id:
                    return "", []
                store_id = self._comment_record_store_id() if hasattr(self, "_comment_record_store_id") else ""
                if not store_id:
                    return root_id, []
                try:
                    raw_rows = service.recent_comment_messages(store_id, root_id, limit=16)
                except Exception:
                    return root_id, []
                rows: list[dict[str, Any]] = []
                for item in raw_rows or []:
                    if not isinstance(item, dict):
                        continue
                    content = self._comment_normalize_text(item.get("text_content") or item.get("type_placeholder"), limit=1000)
                    if not content:
                        continue
                    rows.append({
                        "role": "account" if self._comment_normalize_text(item.get("sender_role"), limit=24).lower() == "account" else "user",
                        "author": self._comment_normalize_text(item.get("author_display"), limit=128),
                        "content": content,
                        "level": max(1, min(9, int(item.get("comment_level") or 1))),
                        "messageId": self._comment_normalize_text(item.get("comment_id"), limit=256),
                    })
                return root_id, self._comment_context_remove_current_target(rows, target)

    def _comment_prepare_thread_context(self, result: dict[str, Any], target: dict[str, Any], context: dict[str, Any]) -> dict[str, Any]:
                root_id, local_rows = self._comment_context_local_rows(result, target)
                page_rows = self._comment_context_page_rows(context, target)
                rows = local_rows if local_rows else page_rows
                source = "local_sqlite" if local_rows else ("page_visible" if page_rows else "none")
                if len(rows) > 10:
                    rows = [rows[0], *rows[-9:]]
                bounded: list[dict[str, Any]] = []
                total_chars = 0
                for item in reversed(rows):
                    content = self._comment_normalize_text(item.get("content"), limit=1000)
                    if not content:
                        continue
                    next_size = total_chars + len(content)
                    if bounded and next_size > 1800:
                        continue
                    bounded.append({**item, "content": content})
                    total_chars = next_size
                    if len(bounded) >= 10:
                        break
                bounded.reverse()
                if rows and bounded and rows[0] not in bounded and len(bounded) < 10:
                    root = dict(rows[0])
                    root_content = self._comment_normalize_text(root.get("content"), limit=1000)
                    if root_content and total_chars + len(root_content) <= 1800:
                        root["content"] = root_content
                        bounded.insert(0, root)
                return {
                    "commentThreadId": root_id,
                    "threadContext": bounded,
                    "contextSource": source,
                    "contextCount": len(bounded),
                }

    def _comment_call_backend_test_reply(self, result: dict[str, Any], target: dict[str, Any], context: dict[str, Any]) -> dict[str, Any]:
                service = getattr(self, "core_service", None)
                if service is None or not self._comment_backend_enabled():
                    return {}
                context_bundle = self._comment_prepare_thread_context(result, target, context)
                payload = build_comment_test_payload(
                    getattr(self, "account", None),
                    str(target.get("content", "") or ""),
                    comment_thread_id=str(context_bundle.get("commentThreadId", "") or ""),
                    thread_context=context_bundle.get("threadContext") if isinstance(context_bundle.get("threadContext"), list) else [],
                    context_source=str(context_bundle.get("contextSource", "") or ""),
                )
                if not payload.get("userInput"):
                    return {}
                self._log("INFO", f"评论上下文加载完成: {json.dumps({'threadId': payload.get('commentThreadId', ''), 'contextCount': len(payload.get('threadContext') or []), 'contextSource': payload.get('contextSource', 'none')}, ensure_ascii=False)}")
                existing_any = self._comment_lookup_existing_record(result, target, platform="douyin")
                existing_status = self._comment_normalize_text((existing_any or {}).get("reply_status") or (existing_any or {}).get("replyStatus"), limit=40).lower()
                existing_reply = re.sub(r"\s+", " ", str((existing_any or {}).get("reply_content") or (existing_any or {}).get("replyContent") or "")).strip()
                page_marks_current_message_unreplied = bool(
                    self._comment_normalize_text(target.get("replyNeedReason"), limit=80)
                    and not bool(target.get("hasCollapsedReplies"))
                )
                # D8 and earlier could record `sent` after clicking a page-level send button even when
                # no new author message was appended. When the fully expanded page still selects the
                # same message as an unreplied candidate, page evidence must override that historical
                # GUI status. Reuse the stored draft instead of calling Coze again. Explicit
                # not_required/manual_sent records remain authoritative and are still skipped.
                gui_sent_statuses = {"sent", "replied", "success", "succeeded", "done"}
                stale_gui_sent_conflict = bool(
                    existing_any
                    and existing_status in gui_sent_statuses
                    and page_marks_current_message_unreplied
                )
                if self._comment_is_existing_record_processed(existing_any) and not stale_gui_sent_conflict:
                    return {
                        "alreadyProcessed": True,
                        "existingRecord": existing_any,
                        "shouldReply": False,
                        "skipReply": True,
                        "skipReason": "已存在无需回复/已真实发送的后端评论处理记录，跳过自动回复接口调用。",
                        "judgeReason": "已存在无需回复/已真实发送的后端评论处理记录，跳过自动回复接口调用。",
                        "replyStatus": existing_any.get("reply_status") or existing_any.get("replyStatus") or "processed",
                        "commentType": existing_any.get("comment_type") or existing_any.get("commentType") or "backend_record",
                        "intentLevel": existing_any.get("intent_level") or existing_any.get("intentLevel") or "none",
                    }
                if stale_gui_sent_conflict:
                    self._log("WARN", f"评论后端 sent 状态与页面未回复证据冲突，按未确认发送恢复处理: {json.dumps({'author': target.get('author', ''), 'content': str(target.get('content', '') or '')[:80], 'status': existing_status, 'hasStoredDraft': bool(existing_reply)}, ensure_ascii=False)}")
                if existing_any and (existing_status in {"generated", "failed"} or stale_gui_sent_conflict) and existing_reply:
                    self._log("INFO", f"评论已有可重试草稿记录，复用已生成回复，不再重复调用 Coze: {json.dumps({'author': target.get('author', ''), 'content': str(target.get('content', '') or '')[:80], 'status': existing_status}, ensure_ascii=False)}")
                    return {
                        "source": "backend_record_stale_sent_recovery" if stale_gui_sent_conflict else "backend_record_retryable",
                        "matched": False,
                        "shouldReply": True,
                        "skipReply": False,
                        "replyStatus": "generated",
                        "reply": existing_reply,
                        "replyContent": existing_reply,
                        "commentType": existing_any.get("comment_type") or existing_any.get("commentType") or "backend_record_retry",
                        "intentLevel": existing_any.get("intent_level") or existing_any.get("intentLevel") or "medium",
                        "judgeReason": ("页面未出现对应作者新回复，恢复历史误标 sent 的草稿。" if stale_gui_sent_conflict else (existing_any.get("judge_reason") or existing_any.get("judgeReason") or "复用历史已生成但未确认发送的回复草稿。")),
                        "existingRecord": existing_any,
                    }
                payload["robotId"] = getattr(getattr(self, "account", None), "id", "") or payload.get("robotId")
                target_record_id = str(target.get("targetMessageKey") or target.get("messageKey") or target.get("signature") or target.get("threadKey") or "")[:240]
                if target_record_id and hasattr(self, "_comment_record_fingerprint"):
                    payload["replyAttemptId"] = "attempt_" + self._comment_record_fingerprint("comment", target_record_id)[:40]
                    payload["customerMessageId"] = target_record_id
                dataset_id = comment_reply_dataset_id(getattr(self, "account", None))
                if dataset_id:
                    payload["datasetId"] = dataset_id
                header = result.get("header", {}) if isinstance(result, dict) else {}
                work_title = str(header.get("currentWorkTitle", "") or "")
                if work_title and not payload.get("postContext"):
                    payload["postContext"] = work_title
                self._log("INFO", f"评论后端自动回复接口调用开始: {json.dumps({'author': target.get('author', ''), 'content': str(target.get('content', '') or '')[:80], 'datasetId': payload.get('datasetId', ''), 'hasPromptConfigId': bool(payload.get('promptConfigId')), 'hasThreadContext': bool(payload.get('threadContext')), 'contextCount': len(payload.get('threadContext') or []), 'contextSource': payload.get('contextSource', 'none')}, ensure_ascii=False)}")
                response = service.runtime_comment_reply(payload)
                if isinstance(response, dict):
                    response.setdefault("replyAttemptId", payload.get("replyAttemptId", ""))
                    self._log("INFO", f"评论后端自动回复接口调用完成: {json.dumps({'source': response.get('source', ''), 'matched': response.get('matched', False), 'shouldReply': response.get('shouldReply', None), 'replyStatus': response.get('replyStatus', ''), 'hasReply': bool(response.get('reply')), 'contextCount': response.get('contextMessageCount', len(payload.get('threadContext') or [])), 'contextSource': response.get('contextSource', payload.get('contextSource', 'none'))}, ensure_ascii=False)}")
                    return response
                return {}

    def _comment_backend_payload_to_preopen(self, response: dict[str, Any], fallback: dict[str, Any]) -> dict[str, Any]:
                if not isinstance(response, dict) or not response:
                    return fallback
                trace_meta = {
                    "replyAttemptId": str(response.get("replyAttemptId") or "")[:256],
                    "replyTraceId": str(response.get("replyTraceId") or "")[:512],
                    "generationSource": str(response.get("source") or response.get("generationSource") or "")[:64],
                }
                if response.get("alreadyProcessed"):
                    reason = str(response.get("skipReason") or "已存在后端评论处理记录，跳过自动回复接口调用。")
                    return {**trace_meta, "text": "", "alreadyProcessed": True, "existingRecord": response.get("existingRecord") if isinstance(response.get("existingRecord"), dict) else {}, "source": "backend_record", "model": "", "reason": reason, "shouldReply": False, "skipReply": True, "skipReason": reason, "commentType": str(response.get("commentType") or "backend_record"), "intentLevel": str(response.get("intentLevel") or "none"), "judgeReason": reason, "replyStatus": str(response.get("replyStatus") or "processed"), "backendRaw": response}
                should_reply = response.get("shouldReply")
                skip_reply = bool(response.get("skipReply", False))
                reply_status = str(response.get("replyStatus", "") or "")
                if should_reply is False or skip_reply or reply_status == "not_required":
                    reason = str(response.get("skipReason") or response.get("judgeReason") or "当前评论无需回复")
                    return {**trace_meta, "text": "", "source": f"backend:{str(response.get('source', '') or 'auto_reply')}", "model": str(response.get("model", "") or ""), "reason": reason, "shouldReply": False, "skipReply": True, "skipReason": reason, "commentType": str(response.get("commentType", "") or "unknown"), "intentLevel": str(response.get("intentLevel", "") or "none"), "judgeReason": str(response.get("judgeReason", "") or reason), "replyStatus": "not_required", "backendRaw": response}
                reply_text = re.sub(r"\s+", " ", str(response.get("reply") or response.get("replyContent") or "")).strip()
                if not reply_text:
                    return fallback
                return {**trace_meta, "text": reply_text, "source": f"backend:{str(response.get('source', '') or 'auto_reply')}", "model": str(response.get("model", "") or ""), "reason": str(response.get("judgeReason") or response.get("reason") or "backend_auto_reply"), "shouldReply": True, "skipReply": False, "skipReason": "", "commentType": str(response.get("commentType", "") or ""), "intentLevel": str(response.get("intentLevel", "") or ""), "judgeReason": str(response.get("judgeReason", "") or ""), "replyStatus": str(response.get("replyStatus", "") or "generated"), "backendRaw": response}

    def _comment_record_payload(self, result: dict[str, Any] | None, target: dict[str, Any], *, reply_text: str = "", status: str = "generated", skip: bool = False, reason: str = "", backend_payload: dict[str, Any] | None = None, fail_reason: str = "") -> dict[str, Any]:
                if hasattr(self, "_comment_build_remote_record_for_target"):
                    return self._comment_build_remote_record_for_target(
                        result,
                        target,
                        reply_text=reply_text,
                        status=status,
                        skip=skip,
                        reason=reason,
                        backend_payload=backend_payload or {},
                        fail_reason=fail_reason,
                    )
                result = result or {}
                backend_payload = backend_payload or {}
                target_level = str(target.get("targetLevel") or target.get("level") or "top")
                depth = 0 if target_level == "top" else 1
                intent_level = str(backend_payload.get("intentLevel") or ("none" if skip else "medium"))
                comment_type = str(backend_payload.get("commentType") or ("skip" if skip else target.get("replyNeedReason", "unknown") or "unknown"))
                judge_reason = str(backend_payload.get("judgeReason") or reason or target.get("replyNeedReason", "") or "")
                record_id = str(target.get("targetMessageKey") or target.get("messageKey") or target.get("signature") or target.get("threadKey") or "")
                root_record_id = str(target.get("threadKey") or target.get("targetParentThreadKey") or record_id)
                return {"recordId": record_id[:240], "rootRecordId": root_record_id[:240], "parentRecordId": str(target.get("targetParentThreadKey") or "")[:240] if depth > 0 else None, "depth": depth, "userNickname": str(target.get("author", "") or ""), "commentContent": str(target.get("content", "") or ""), "commentTime": normalize_comment_time_text(target.get("timeText", "")), "shouldReply": not skip, "skipReply": bool(skip), "skipReason": str(backend_payload.get("skipReason") or reason or "") if skip else "", "commentType": comment_type, "intentLevel": intent_level, "intentLabel": intent_label(intent_level), "judgeReason": judge_reason, "replyStatus": "not_required" if skip else status, "replyContent": "" if skip else reply_text, "replyTime": "" if (skip or status == "failed") else current_time_text(), "failReason": fail_reason if status == "failed" else ""}

    def _comment_sync_record_to_backend(self, result: dict[str, Any] | None, target: dict[str, Any], *, reply_text: str = "", status: str = "generated", skip: bool = False, reason: str = "", backend_payload: dict[str, Any] | None = None, fail_reason: str = "") -> None:
                item: dict[str, Any] = {}
                if hasattr(self, "_comment_record_reply_state"):
                    try:
                        item = self._comment_record_reply_state(
                            result,
                            target,
                            reply_text=reply_text,
                            status=status,
                            skip=skip,
                            reason=reason,
                            backend_payload=backend_payload or {},
                            fail_reason=fail_reason,
                        )
                    except Exception as exc:
                        self._log("WARN", f"评论本地回复状态记录失败，已旁路忽略：{type(exc).__name__}: {str(exc)[:160]}")
                if not item:
                    item = self._comment_record_payload(
                        result,
                        target,
                        reply_text=reply_text,
                        status=status,
                        skip=skip,
                        reason=reason,
                        backend_payload=backend_payload or {},
                        fail_reason=fail_reason,
                    )
                if hasattr(self, "_comment_record_queue_remote_items"):
                    try:
                        self._comment_record_queue_remote_items(result, [item])
                        return
                    except Exception as exc:
                        self._log("WARN", f"评论自动回复异步同步排队失败，回退直接同步：{type(exc).__name__}: {str(exc)[:160]}")
                service = getattr(self, "core_service", None)
                if service is None:
                    return
                try:
                    account = getattr(self, "account", None)
                    header = (result or {}).get("header", {}) if isinstance(result, dict) else {}
                    payload = {"robotId": getattr(account, "id", "") or None, "module": "comment", "platform": "douyin", "botNickname": getattr(account, "auth_name", "") or getattr(account, "robot_name", "") or getattr(account, "name", "") or "", "postTitle": str(header.get("currentWorkTitle", "") or ""), "comments": [item]}
                    service.sync_comment_records(payload)
                except Exception as exc:
                    self._log("WARN", f"评论自动回复同步后端失败: {type(exc).__name__}: {str(exc)[:160]}")

    def _comment_inflight_reply_signatures(self) -> set[str]:
                store = getattr(self, "comment_inflight_reply_signatures", None)
                if not isinstance(store, set):
                    store = set()
                    self.comment_inflight_reply_signatures = store
                return store

    def _comment_signature_for_target(self, target: dict[str, Any], result: dict[str, Any] | None = None) -> str:
                if not isinstance(target, dict):
                    return ""
                if hasattr(self, "_comment_target_signature"):
                    return str(self._comment_target_signature(target, result=result) or "")
                return str(self._comment_reply_target_identity(target) or "")

    def _comment_is_signature_completed(self, signature: str) -> bool:
                signature = self._comment_normalize_text(signature, limit=360)
                return bool(signature and signature in set(getattr(self, "comment_completed_thread_keys", set()) or set()))

    def _comment_is_signature_inflight(self, signature: str) -> bool:
                signature = self._comment_normalize_text(signature, limit=360)
                return bool(signature and signature in self._comment_inflight_reply_signatures())

    def _comment_mark_inflight_signature(self, signature: str, target: dict[str, Any] | None = None, *, reason: str = "") -> None:
                signature = self._comment_normalize_text(signature, limit=360)
                if not signature:
                    return
                self._comment_inflight_reply_signatures().add(signature)
                if self._comment_verbose_logs_enabled():
                    self._log("INFO", f"{TRACE_REPLY_EDITOR} | reply_target_inflight_add={json.dumps({'signature': signature, 'author': str((target or {}).get('author', '') or ''), 'reason': reason}, ensure_ascii=False)}")

    def _comment_release_inflight_signature(self, signature: str, *, reason: str = "") -> None:
                signature = self._comment_normalize_text(signature, limit=360)
                if not signature:
                    return
                store = self._comment_inflight_reply_signatures()
                if signature in store:
                    store.discard(signature)
                    if self._comment_verbose_logs_enabled():
                        self._log("INFO", f"{TRACE_REPLY_EDITOR} | reply_target_inflight_release={json.dumps({'signature': signature, 'reason': reason}, ensure_ascii=False)}")

    def _comment_release_inflight_for_target(self, target: dict[str, Any], result: dict[str, Any] | None = None, *, reason: str = "") -> None:
                signature = self._comment_signature_for_target(target, result=result)
                self._comment_release_inflight_signature(signature, reason=reason)
                for key in [
                    str((target or {}).get("signature", "") or ""),
                    str((target or {}).get("targetMessageKey", "") or ""),
                    str((target or {}).get("messageKey", "") or ""),
                ]:
                    self._comment_release_inflight_signature(key, reason=reason)

    def _comment_complete_skipped_target(self, result: dict[str, Any], target: dict[str, Any], payload: dict[str, Any]) -> None:
                if not isinstance(target, dict):
                    return
                signature = str(target.get("signature", "") or "")
                if not signature and hasattr(self, "_comment_target_signature"):
                    signature = self._comment_target_signature(target, result=result)
                # Skip/processed decisions apply to the exact target message only.
                # Do not add parent threadKey here; otherwise a new follow-up in the
                # same expanded conversation can be suppressed as already completed.
                for key in [signature, str(target.get("targetMessageKey", "") or ""), str(target.get("messageKey", "") or "")]:
                    key = str(key or "").strip()
                    if key:
                        self.comment_completed_thread_keys.add(key)
                        self._comment_release_inflight_signature(key, reason="skip_completed")
                self.comment_preopen_reply_target = None
                self.comment_preopen_reply_context = None
                self.comment_preopen_reply_future = None
                reason = str(payload.get("skipReason") or payload.get("judgeReason") or payload.get("reason") or "当前评论无需回复")
                self._log("INFO", f"评论自动回复跳过: {json.dumps({'author': target.get('author', ''), 'content': str(target.get('content', '') or '')[:80], 'reason': reason}, ensure_ascii=False)}")
                self._comment_sync_record_to_backend(result, target, skip=True, reason=reason, backend_payload=payload)
                if hasattr(self, "_comment_set_flow_stage"):
                    self._comment_set_flow_stage("scan_candidates_under_unreplied", result, reason="backend_decision_skip_reply")
                self._schedule_fast_comment_inspect(600)


    def _comment_fail_active_target_and_release(self, result: dict[str, Any], target: dict[str, Any], *, reason: str) -> None:
                if not isinstance(target, dict):
                    return
                signature = str(target.get("signature", "") or "")
                if not signature and hasattr(self, "_comment_target_signature"):
                    signature = self._comment_target_signature(target, result=result)
                for key in [
                    signature,
                    str(target.get("targetMessageKey", "") or ""),
                    str(target.get("messageKey", "") or ""),
                ]:
                    key = str(key or "").strip()
                    if key:
                        # 失败只释放 inflight，不写入 completed；下轮仍可重新处理/重试发送。
                        self._comment_release_inflight_signature(key, reason="failed_release_retryable")
                self._log("WARN", f"{TRACE_REPLY_EDITOR} | reply_target_failed_release={json.dumps({'threadKey': target.get('threadKey', ''), 'author': target.get('author', ''), 'reason': reason}, ensure_ascii=False)}")
                self._comment_sync_record_to_backend(
                    result,
                    target,
                    reply_text="",
                    status="failed",
                    skip=False,
                    reason=reason,
                    backend_payload={
                        "commentType": "gui_editor_failed",
                        "intentLevel": "none",
                        "judgeReason": reason,
                    },
                    fail_reason=reason,
                )
                self.comment_active_reply_target = None
                self.comment_pending_reply_target = None
                self.comment_pending_draft_probe_target = None
                self.comment_preopen_reply_target = None
                self.comment_preopen_reply_context = None
                self.comment_preopen_reply_future = None
                self.comment_reply_editor_alive_streak = 0
                self.comment_reply_editor_lost_streak = 0
                self.comment_reply_editor_focus_lost_streak = 0
                self.busy = False
                if hasattr(self, "_comment_set_flow_stage"):
                    self._comment_set_flow_stage("scan_candidates_under_unreplied", result, reason="editor_missing_failed_release")
                self._schedule_fast_comment_inspect(700)

    def _comment_self_author_aliases(self) -> set[str]:
                # 保留接口兼容旧配置，但评论模块不再用账号名/机器人名作为作者判断主依据。
                # 抖音评论区的“作者”身份必须来自当前消息卡片用户名旁边的局部作者 badge。
                return set()

    def _comment_is_self_author(self, author: Any, author_tag: Any = "") -> bool:
                # P0 修正：不能因为 author 命中本地账号名/机器人名就判为作者。
                # 只信当前消息局部 DOM 抽取到的 authorTag=作者 或 JS 已明确给出的 isAuthor=True。
                tag = self._comment_normalize_text(author_tag, limit=40)
                return "作者" in tag

    def _comment_enrich_reply_message(self, message: dict[str, Any] | None) -> dict[str, Any]:
                if not isinstance(message, dict):
                    return {}
                enriched = dict(message)
                author_tag = enriched.get("authorTag", "")
                has_author_badge = self._comment_is_self_author(enriched.get("author", ""), author_tag)
                # 如果 JS 已经从局部 badge 判定过 isAuthor，就保留；否则仅由 authorTag 兜底，不做 alias 覆盖。
                enriched["isAuthor"] = bool(enriched.get("isAuthor")) or has_author_badge
                enriched["authorDetectBy"] = "local_badge" if enriched["isAuthor"] else "no_local_badge"
                return enriched

    def _comment_enrich_reply_item(self, item: dict[str, Any]) -> dict[str, Any]:
                if not isinstance(item, dict):
                    return item
                enriched = dict(item)
                top_has_author_badge = self._comment_is_self_author(enriched.get("author", ""), enriched.get("authorTag", ""))
                enriched["isAuthor"] = bool(enriched.get("isAuthor")) or top_has_author_badge
                enriched["authorDetectBy"] = "local_badge" if enriched["isAuthor"] else "no_local_badge"
                nested_raw = enriched.get("nestedReplies") if isinstance(enriched.get("nestedReplies"), list) else enriched.get("nestedReplySamples")
                nested_replies: list[dict[str, Any]] = []
                if isinstance(nested_raw, list):
                    for nested in nested_raw:
                        if isinstance(nested, dict):
                            nested_replies.append(self._comment_enrich_reply_message(nested))
                if nested_replies:
                    enriched["nestedReplies"] = nested_replies
                    enriched["nestedReplySamples"] = nested_replies[:8]
                    enriched["nestedReplyCount"] = max(int(enriched.get("nestedReplyCount", 0) or 0), len(nested_replies))
                thread_key_for_top = self._comment_normalize_text(enriched.get("threadKey", ""), limit=260)
                top_author_for_key = self._comment_normalize_text(enriched.get("author", ""), limit=120)
                top_time_for_key = self._comment_normalize_text(enriched.get("timeText", ""), limit=80)
                top_content_for_key = self._comment_normalize_text(enriched.get("content", ""), limit=200)
                top_message_key = self._comment_normalize_text(enriched.get("messageKey", ""), limit=320)
                if not top_message_key and thread_key_for_top:
                    top_message_key = " | ".join([thread_key_for_top, "top", "-1", top_author_for_key, top_time_for_key, top_content_for_key[:80]])
                top_message = {
                    "level": "top",
                    "index": -1,
                    "author": enriched.get("author", ""),
                    "authorTag": enriched.get("authorTag", ""),
                    "isAuthor": bool(enriched.get("isAuthor")),
                    "content": enriched.get("content", ""),
                    "timeText": enriched.get("timeText", ""),
                    "replyButtonFound": bool(enriched.get("replyButtonFound", False)),
                    "replyButtonClickable": bool(enriched.get("replyButtonClickable", False)),
                    "replyButtonHint": enriched.get("replyButtonHint", ""),
                    "parentThreadKey": enriched.get("threadKey", ""),
                    "messageKey": top_message_key,
                }
                visible_messages = [top_message] + nested_replies
                for timeline_index, msg in enumerate(visible_messages):
                    if isinstance(msg, dict):
                        msg.setdefault("timelineIndex", timeline_index)
                        msg.setdefault("parentThreadKey", enriched.get("threadKey", ""))
                effective_messages = [msg for msg in visible_messages if self._comment_normalize_text(msg.get("content", ""), limit=240)]
                if effective_messages:
                    last_effective = dict(effective_messages[-1])
                else:
                    last_effective = self._comment_enrich_reply_message(enriched.get("lastEffectiveMessage") if isinstance(enriched.get("lastEffectiveMessage"), dict) else {})
                last_visible_user = next((dict(msg) for msg in reversed(effective_messages) if not bool(msg.get("isAuthor"))), {})
                has_author_reply = any(bool(msg.get("isAuthor")) for msg in nested_replies)
                has_author_any = any(bool(msg.get("isAuthor")) for msg in effective_messages)
                last_author_index = max([int(msg.get("timelineIndex", -1) if str(msg.get("timelineIndex", -1)).lstrip("-").isdigit() else -1) for msg in effective_messages if bool(msg.get("isAuthor"))] or [-1])
                enriched["hasAuthorReplyInThread"] = bool(enriched.get("hasAuthorReplyInThread")) or has_author_reply
                if last_effective:
                    enriched["lastEffectiveMessage"] = last_effective
                if last_visible_user:
                    enriched["lastVisibleUserMessage"] = last_visible_user
                reply_target: dict[str, Any] = {}
                if bool(enriched.get("hasCollapsedReplies")):
                    enriched["replyNeedReason"] = ""
                elif has_author_any:
                    # 多回复线程必须按时间线判断：只有作者 badge 消息之后的最后一条用户消息才需要回复。
                    # 顶层首评一旦已有作者回复，不再作为候选，避免对已回复首评重复处理。
                    last_index = int(last_effective.get("timelineIndex", -1) if str(last_effective.get("timelineIndex", -1)).lstrip("-").isdigit() else -1) if last_effective else -1
                    if last_effective and not bool(last_effective.get("isAuthor")) and last_index > last_author_index:
                        reply_target = dict(last_effective)
                        enriched["replyNeedReason"] = "user_followup_after_author_reply"
                    else:
                        enriched["replyNeedReason"] = ""
                elif top_message and not bool(top_message.get("isAuthor")) and self._comment_normalize_text(top_message.get("content", ""), limit=240):
                    reply_target = dict(top_message)
                    enriched["replyNeedReason"] = "top_user_without_author_reply"
                else:
                    enriched["replyNeedReason"] = ""
                if reply_target:
                    enriched["replyTargetMessage"] = reply_target
                else:
                    enriched["replyTargetMessage"] = {}
                return enriched

    def _comment_enrich_reply_result(self, result: dict[str, Any]) -> dict[str, Any]:
                if not isinstance(result, dict):
                    return result
                top_comments = result.get("topComments", []) or []
                if isinstance(top_comments, list):
                    result["topComments"] = [self._comment_enrich_reply_item(item) if isinstance(item, dict) else item for item in top_comments]
                    counts = result.get("counts", {}) or {}
                    counts["followupCandidates"] = len([item for item in result["topComments"] if isinstance(item, dict) and item.get("replyNeedReason") == "user_followup_after_author_reply"])
                    result["counts"] = counts
                return result

    def _comment_reply_open_cooldown_key(self, target: dict[str, Any]) -> str:
                """Stable per-message key for click guards and editor-open retries.

                Raw Douyin message/thread keys contain changing labels such as
                ``刚刚`` and ``8分钟前``. Using them here makes one comment look
                like a new target after every refresh, which re-runs generation and
                floods editor-open attempts.
                """
                if not isinstance(target, dict):
                    return ""
                raw_thread = self._comment_normalize_text(
                    target.get("threadKey") or target.get("targetParentThreadKey"),
                    limit=600,
                )
                parts = [self._comment_normalize_text(part, limit=320) for part in raw_thread.split("|")] if raw_thread else []
                if len(parts) >= 3:
                    stable_thread = "|".join(part for part in [parts[0], "|".join(parts[2:])] if part)
                else:
                    stable_thread = raw_thread
                target_level = self._comment_normalize_text(
                    target.get("targetLevel") or target.get("level"),
                    limit=24,
                ).lower()
                author = self._comment_normalize_text(target.get("author", ""), limit=160).lower()
                content = self._comment_normalize_text(target.get("content", ""), limit=700).lower()
                key = "|".join(part for part in [stable_thread.lower(), target_level, author, content] if part)
                return key[:1200]

    def _comment_cooldown_reply_open_target(self, target: dict[str, Any], *, reason: str, cooldown_ms: int = 45000) -> None:
                if not isinstance(target, dict):
                    return
                thread_key = self._comment_normalize_text(target.get("threadKey", ""), limit=240)
                cooldown_key = self._comment_reply_open_cooldown_key(target)
                if not cooldown_key:
                    return
                store = getattr(self, "comment_reply_open_cooldowns", None)
                if not isinstance(store, dict):
                    store = {}
                    setattr(self, "comment_reply_open_cooldowns", store)
                until_ms = self._now_ms() + max(5000, int(cooldown_ms or 0))
                store[cooldown_key] = until_ms
                payload = {
                    "threadKey": thread_key,
                    "cooldownKey": cooldown_key[:120],
                    "author": self._comment_normalize_text(target.get("author", ""), limit=120),
                    "reason": reason,
                    "cooldownMs": max(5000, int(cooldown_ms or 0)),
                    "untilMs": until_ms,
                }
                self._log("WARN", f"{TRACE_REPLY_EDITOR} | reply_open_target_cooldown={json.dumps(payload, ensure_ascii=False)}")

    def _comment_effective_reply_target_message(self, item: dict[str, Any]) -> dict[str, Any]:
                if not isinstance(item, dict):
                    return {}
                target_message = self._comment_enrich_reply_message(item.get("replyTargetMessage") if isinstance(item.get("replyTargetMessage"), dict) else {})
                if target_message and self._comment_normalize_text(target_message.get("content", ""), limit=200):
                    return target_message
                last_message = self._comment_enrich_reply_message(item.get("lastEffectiveMessage") if isinstance(item.get("lastEffectiveMessage"), dict) else {})
                if last_message and self._comment_normalize_text(last_message.get("content", ""), limit=200) and str(item.get("replyNeedReason", "") or ""):
                    return last_message
                top_is_author = bool(item.get("isAuthor")) or self._comment_is_self_author(item.get("author", ""), item.get("authorTag", ""))
                return {
                    "level": "top",
                    "index": -1,
                    "author": item.get("author", ""),
                    "content": item.get("content", ""),
                    "timeText": item.get("timeText", ""),
                    "isAuthor": top_is_author,
                    "authorDetectBy": "local_badge" if top_is_author else "no_local_badge",
                    "messageKey": item.get("messageKey", ""),
                    "parentThreadKey": item.get("threadKey", ""),
                }

    def _comment_reply_to_name_from_content(self, content: Any) -> str:
                match = re.match(r"^\s*回复\s*(.{1,60}?)[：:]\s*", str(content or ""))
                return self._comment_normalize_text(match.group(1), limit=80) if match else ""

    def _comment_author_names_from_thread(self, item: dict[str, Any]) -> set[str]:
                names: set[str] = set()
                confirmed = self._comment_normalize_text(item.get("confirmedAuthorName", ""), limit=80)
                if confirmed:
                    names.add(confirmed)
                nested = item.get("nestedReplies") if isinstance(item.get("nestedReplies"), list) else []
                for msg in nested:
                    if isinstance(msg, dict) and bool(msg.get("isAuthor")):
                        name = self._comment_normalize_text(msg.get("author", ""), limit=80)
                        if name:
                            names.add(name)
                top_name = self._comment_normalize_text(item.get("author", ""), limit=80)
                if bool(item.get("isAuthor")) and top_name:
                    names.add(top_name)
                return names

    def _comment_loose_name_key(self, value: Any) -> str:
                text = self._comment_normalize_text(value, limit=120)
                text = text.replace("\ufe0f", "").replace("\u200d", "")
                # Keep CJK, letters and digits only; strip emoji / badges / spaces.
                return "".join(ch for ch in text if ("\u4e00" <= ch <= "\u9fff") or ch.isalnum()).lower()

    def _comment_reply_to_is_author(self, reply_to: str, author_names: set[str]) -> bool:
                reply_to = self._comment_normalize_text(reply_to, limit=80)
                if not reply_to:
                    return False
                reply_key = self._comment_loose_name_key(reply_to)
                for name in author_names:
                    normalized = self._comment_normalize_text(name, limit=80)
                    name_key = self._comment_loose_name_key(normalized)
                    if normalized and (reply_to == normalized or reply_to in normalized or normalized in reply_to):
                        return True
                    if reply_key and name_key and (reply_key == name_key or reply_key in name_key or name_key in reply_key):
                        return True
                return False

    def _comment_candidate_target_messages(self, item: dict[str, Any]) -> list[dict[str, Any]]:
                """Return every visible unreplied target message in a thread.

                Previous logic only selected the last effective user message after an
                author reply. In an expanded thread this missed earlier unreplied
                messages, e.g. "你直说不就好了，我都看不过去了" when a later
                user message existed in the same thread.
                """
                if not isinstance(item, dict):
                    return []
                item = self._comment_enrich_reply_item(item)
                if bool(item.get("hasCollapsedReplies")):
                    return []

                top_message = {
                    "level": "top",
                    "index": -1,
                    "author": item.get("author", ""),
                    "authorTag": item.get("authorTag", ""),
                    "isAuthor": bool(item.get("isAuthor")),
                    "content": item.get("content", ""),
                    "timeText": item.get("timeText", ""),
                    "replyButtonFound": bool(item.get("replyButtonFound", False)),
                    "replyButtonClickable": bool(item.get("replyButtonClickable", False)),
                    "replyButtonHint": item.get("replyButtonHint", ""),
                    "replyDomKey": item.get("replyDomKey", ""),
                    "parentThreadKey": item.get("threadKey", ""),
                    "messageKey": item.get("messageKey", "") or f"{item.get('threadKey', '')}|top|-1|{item.get('author', '')}|{item.get('timeText', '')}|{str(item.get('content', ''))[:80]}",
                    "timelineIndex": 0,
                }
                nested = item.get("nestedReplies") if isinstance(item.get("nestedReplies"), list) else []
                messages: list[dict[str, Any]] = [top_message]
                for idx, raw in enumerate(nested):
                    if not isinstance(raw, dict):
                        continue
                    msg = self._comment_enrich_reply_message(raw)
                    msg.setdefault("level", "nested")
                    msg.setdefault("index", idx)
                    msg.setdefault("parentThreadKey", item.get("threadKey", ""))
                    msg.setdefault("replyButtonFound", bool(item.get("replyButtonFound", False)))
                    msg.setdefault("replyButtonHint", item.get("replyButtonHint", ""))
                    if not msg.get("messageKey"):
                        msg["messageKey"] = f"{item.get('threadKey', '')}|nested|{msg.get('index', idx)}|{msg.get('author', '')}|{msg.get('timeText', '')}|{str(msg.get('content', ''))[:80]}"
                    messages.append(msg)

                for timeline_index, msg in enumerate(messages):
                    msg["timelineIndex"] = timeline_index

                effective = [msg for msg in messages if self._comment_normalize_text(msg.get("content", ""), limit=240)]
                if not effective:
                    return []

                author_indexes = [
                    int(msg.get("timelineIndex", -1) if str(msg.get("timelineIndex", -1)).lstrip("-").isdigit() else -1)
                    for msg in effective
                    if bool(msg.get("isAuthor"))
                ]
                last_author_index = max(author_indexes or [-1])
                mode = comment_reply_mode(getattr(self, "account", None)).upper()
                author_names = self._comment_author_names_from_thread(item)
                top_author = self._comment_normalize_text(item.get("author", ""), limit=80)
                targets: list[dict[str, Any]] = []

                if last_author_index < 0:
                    if not bool(top_message.get("isAuthor")):
                        target = dict(top_message)
                        target["replyNeedReason"] = "top_user_without_author_reply"
                        targets.append(target)
                    return targets

                for msg in effective:
                    if bool(msg.get("isAuthor")):
                        continue
                    idx = int(msg.get("timelineIndex", -1) if str(msg.get("timelineIndex", -1)).lstrip("-").isdigit() else -1)
                    if idx <= last_author_index:
                        continue

                    author = self._comment_normalize_text(msg.get("author", ""), limit=80)
                    content = self._comment_normalize_text(msg.get("content", ""), limit=500)
                    reply_to = self._comment_reply_to_name_from_content(content)
                    direct_to_author = self._comment_reply_to_is_author(reply_to, author_names)
                    is_original_user = bool(author and top_author and author == top_author)
                    is_third_party = bool(author and top_author and author != top_author)
                    include = False
                    reason = ""

                    if mode == "PUBLISHER_REPLY_THREAD_ONLY":
                        if direct_to_author:
                            include = True
                            reason = "direct_reply_to_author"
                        elif is_original_user:
                            include = True
                            reason = "original_user_followup_after_author"
                        else:
                            include = False
                    else:
                        include = True
                        if direct_to_author:
                            reason = "direct_reply_to_author"
                        elif is_original_user:
                            reason = "original_user_followup_after_author"
                        elif is_third_party:
                            reason = "third_party_followup_after_author"
                        else:
                            reason = "user_followup_after_author_reply"

                    if include:
                        target = dict(msg)
                        target["replyNeedReason"] = reason
                        target["replyToName"] = reply_to
                        target["replyToIsAuthor"] = direct_to_author
                        targets.append(target)

                candidate_cfg = self._comment_candidate_config()
                if bool(candidate_cfg.get("prefer_latest_relevant_message_only", False)) and targets:
                    return [targets[-1]]
                return targets

    def _comment_skip_reason_for_target(self, item: dict[str, Any], target_message: dict[str, Any], reply_need_reason: str) -> str:
                if not isinstance(item, dict):
                    return "invalid_item"
                thread_key = self._comment_normalize_text(item.get("threadKey", ""))
                target_signature = ""
                if hasattr(self, "_comment_target_signature"):
                    target_signature = self._comment_target_signature({
                        "threadKey": thread_key,
                        "targetMessageKey": target_message.get("messageKey", ""),
                        "targetParentThreadKey": target_message.get("parentThreadKey", "") or thread_key,
                        "targetLevel": target_message.get("level", ""),
                        "targetIndex": target_message.get("index", -1),
                        "author": target_message.get("author", ""),
                        "content": target_message.get("content", ""),
                        "timeText": target_message.get("timeText", ""),
                    }, result=None)
                if target_signature and target_signature in set(self.comment_completed_thread_keys or set()):
                    return "already_completed"
                if target_signature and self._comment_is_signature_inflight(target_signature):
                    return "already_inflight"

                # D6: target-level candidate construction previously bypassed the
                # reply-open cooldown used by the older thread-level path. After an
                # editor-open timeout the same message was therefore selected every
                # 1-2 seconds and the cached draft was logged indefinitely. Apply
                # the same stable cooldown key here before any collapsed/button test.
                cooldowns = getattr(self, "comment_reply_open_cooldowns", None)
                cooldown_key = self._comment_reply_open_cooldown_key({
                    "threadKey": thread_key,
                    "targetMessageKey": target_message.get("messageKey", ""),
                    "targetParentThreadKey": target_message.get("parentThreadKey", "") or thread_key,
                    "targetLevel": target_message.get("level", ""),
                    "targetIndex": target_message.get("index", -1),
                    "author": target_message.get("author", ""),
                    "content": target_message.get("content", ""),
                })
                if cooldown_key and isinstance(cooldowns, dict):
                    until_ms = int(cooldowns.get(cooldown_key, 0) or 0)
                    if until_ms and self._now_ms() < until_ms:
                        return "reply_open_cooling"
                    if until_ms:
                        cooldowns.pop(cooldown_key, None)
                if bool(item.get("hasCollapsedReplies")):
                    return "collapsed_replies_pending"
                if not bool(item.get("replyButtonFound")):
                    return "reply_button_missing"
                target_level = self._comment_normalize_text(target_message.get("level", "top"), limit=24)
                if bool(item.get("hasAuthorReplyInThread")) and target_level == "top":
                    return "top_already_replied_by_author"
                if target_level == "nested" and not bool(target_message.get("replyButtonFound", item.get("replyButtonFound", False))):
                    return "target_reply_button_missing"
                candidate_cfg = self._comment_candidate_config()
                if bool(candidate_cfg.get("skip_author_tag", True)) and bool(target_message.get("isAuthor")):
                    return "last_effective_from_author"
                author = self._comment_normalize_text(target_message.get("author", "") or item.get("author", ""), limit=120)
                if not author:
                    return "author_missing"
                content = self._comment_normalize_text(target_message.get("content", "") or item.get("content", ""), limit=200)
                if bool(candidate_cfg.get("skip_empty_content", True)) and not content:
                    return "empty_content"
                min_len = int(candidate_cfg.get("min_content_length", 1) or 1)
                if content and len(content) < max(0, min_len):
                    return "content_too_short"
                blocked_keywords = [
                    self._comment_normalize_text(v, limit=40)
                    for v in (candidate_cfg.get("skip_keywords", []) or [])
                    if self._comment_normalize_text(v, limit=40)
                ]
                lowered = content.lower()
                if blocked_keywords and any(keyword.lower() in lowered for keyword in blocked_keywords):
                    return "keyword_blocked"
                return ""

    def _comment_skip_reason(self, item: dict[str, Any]) -> str:
                if not isinstance(item, dict):
                    return "invalid_item"
                item = self._comment_enrich_reply_item(item)
                thread_key = self._comment_normalize_text(item.get("threadKey", ""))
                target_message_for_completion = self._comment_effective_reply_target_message(item)
                target_signature = ""
                if hasattr(self, "_comment_target_signature"):
                    target_signature = self._comment_target_signature({
                        "threadKey": thread_key,
                        "targetMessageKey": target_message_for_completion.get("messageKey", ""),
                        "targetParentThreadKey": target_message_for_completion.get("parentThreadKey", "") or thread_key,
                        "targetLevel": target_message_for_completion.get("level", ""),
                        "targetIndex": target_message_for_completion.get("index", -1),
                        "author": target_message_for_completion.get("author", ""),
                        "content": target_message_for_completion.get("content", ""),
                        "timeText": target_message_for_completion.get("timeText", ""),
                    }, result=None)
                if target_signature and target_signature in set(self.comment_completed_thread_keys or set()):
                    return "already_completed"
                if not target_signature and thread_key and thread_key in set(self.comment_completed_thread_keys or set()):
                    return "already_completed"
                cooldowns = getattr(self, "comment_reply_open_cooldowns", None)
                cooldown_key = self._comment_reply_open_cooldown_key({
                    "threadKey": thread_key,
                    "targetMessageKey": target_message_for_completion.get("messageKey", ""),
                    "targetParentThreadKey": target_message_for_completion.get("parentThreadKey", "") or thread_key,
                    "targetLevel": target_message_for_completion.get("level", ""),
                    "targetIndex": target_message_for_completion.get("index", -1),
                    "author": target_message_for_completion.get("author", ""),
                    "content": target_message_for_completion.get("content", ""),
                })
                if cooldown_key and isinstance(cooldowns, dict):
                    until_ms = int(cooldowns.get(cooldown_key, 0) or 0)
                    if until_ms and self._now_ms() < until_ms:
                        return "reply_open_cooling"
                    if until_ms:
                        cooldowns.pop(cooldown_key, None)
                if bool(item.get("hasCollapsedReplies")):
                    return "collapsed_replies_pending"
                if not bool(item.get("replyButtonFound")):
                    return "reply_button_missing"
                target_message = self._comment_effective_reply_target_message(item)
                target_level = self._comment_normalize_text(target_message.get("level", "top"), limit=24)
                if bool(item.get("hasAuthorReplyInThread")) and target_level == "top":
                    return "top_already_replied_by_author"
                if target_level == "nested" and not bool(target_message.get("replyButtonFound", False)):
                    return "target_reply_button_missing"
                candidate_cfg = self._comment_candidate_config()
                if bool(candidate_cfg.get("skip_author_tag", True)) and bool(target_message.get("isAuthor")):
                    return "last_effective_from_author"
                author = self._comment_normalize_text(target_message.get("author", "") or item.get("author", ""), limit=120)
                if not author:
                    return "author_missing"
                content = self._comment_normalize_text(target_message.get("content", "") or item.get("content", ""), limit=200)
                if bool(candidate_cfg.get("skip_empty_content", True)) and not content:
                    return "empty_content"
                min_len = int(candidate_cfg.get("min_content_length", 1) or 1)
                if content and len(content) < max(0, min_len):
                    return "content_too_short"
                blocked_keywords = [
                    self._comment_normalize_text(v, limit=40)
                    for v in (candidate_cfg.get("skip_keywords", []) or [])
                    if self._comment_normalize_text(v, limit=40)
                ]
                lowered = content.lower()
                if blocked_keywords and any(keyword.lower() in lowered for keyword in blocked_keywords):
                    return "keyword_blocked"
                return ""

    def _comment_candidate_sort_key(self, item: dict[str, Any]) -> tuple[int, int, str]:
                reason = self._comment_normalize_text(item.get("replyNeedReason", ""), limit=80)
                if reason == "direct_reply_to_author":
                    priority = 0
                elif reason == "original_user_followup_after_author":
                    priority = 1
                elif reason in {"third_party_followup_after_author", "user_followup_after_author_reply"}:
                    priority = 2
                elif reason == "top_user_without_author_reply":
                    priority = 10
                else:
                    priority = 50
                target_index = int(item.get("targetIndex", -1) if str(item.get("targetIndex", -1)).lstrip("-").isdigit() else -1)
                return (priority, -target_index, self._comment_normalize_text(item.get("threadKey", ""), limit=240))

    def _comment_build_reply_candidates(self, result: dict[str, Any]) -> tuple[list[dict[str, Any]], list[dict[str, Any]]]:
                candidates: list[dict[str, Any]] = []
                skipped: list[dict[str, Any]] = []
                for item in (result.get("topComments", []) or []):
                    if not isinstance(item, dict):
                        continue
                    item = self._comment_enrich_reply_item(item)
                    target_messages = self._comment_candidate_target_messages(item)
                    if not target_messages:
                        # Keep the old skip summary for collapsed/no-reply threads.
                        target_message = self._comment_effective_reply_target_message(item)
                        target_author = self._comment_normalize_text(target_message.get("author", "") or item.get("author", ""), limit=80)
                        target_content = self._comment_normalize_text(target_message.get("content", "") or item.get("content", ""), limit=160)
                        target_time = self._comment_normalize_text(target_message.get("timeText", "") or item.get("timeText", ""), limit=40)
                        reason = self._comment_skip_reason(item)
                        if reason:
                            skipped.append({
                                "threadKey": self._comment_normalize_text(item.get("threadKey", "")),
                                "targetMessageKey": self._comment_normalize_text(target_message.get("messageKey", ""), limit=260),
                                "replyDomKey": self._comment_normalize_text(target_message.get("replyDomKey", "") or item.get("replyDomKey", ""), limit=160),
                                "targetParentThreadKey": self._comment_normalize_text(target_message.get("parentThreadKey", "") or item.get("threadKey", ""), limit=220),
                                "author": target_author,
                                "content": target_content,
                                "timeText": target_time,
                                "topAuthor": self._comment_normalize_text(item.get("author", ""), limit=80),
                                "topContent": self._comment_normalize_text(item.get("content", ""), limit=120),
                                "targetLevel": self._comment_normalize_text(target_message.get("level", "top"), limit=24),
                                "targetIndex": int(target_message.get("index", -1) if str(target_message.get("index", -1)).lstrip("-").isdigit() else -1),
                                "replyNeedReason": self._comment_normalize_text(item.get("replyNeedReason", ""), limit=80),
                                "hasAuthorReplyInThread": bool(item.get("hasAuthorReplyInThread")),
                                "hasCollapsedReplies": bool(item.get("hasCollapsedReplies")),
                                "nestedReplyCount": int(item.get("nestedReplyCount", 0) or 0),
                                "skipReason": reason,
                            })
                        continue

                    for target_message in target_messages:
                        reply_need_reason = self._comment_normalize_text(target_message.get("replyNeedReason", ""), limit=80)
                        target_author = self._comment_normalize_text(target_message.get("author", "") or item.get("author", ""), limit=80)
                        target_content = self._comment_normalize_text(target_message.get("content", "") or item.get("content", ""), limit=160)
                        target_time = self._comment_normalize_text(target_message.get("timeText", "") or item.get("timeText", ""), limit=40)
                        summary = {
                            "threadKey": self._comment_normalize_text(item.get("threadKey", "")),
                            "targetMessageKey": self._comment_normalize_text(target_message.get("messageKey", ""), limit=260),
                            "replyDomKey": self._comment_normalize_text(target_message.get("replyDomKey", "") or item.get("replyDomKey", ""), limit=160),
                            "targetParentThreadKey": self._comment_normalize_text(target_message.get("parentThreadKey", "") or item.get("threadKey", ""), limit=220),
                            "author": target_author,
                            "content": target_content,
                            "timeText": target_time,
                            "topAuthor": self._comment_normalize_text(item.get("author", ""), limit=80),
                            "topContent": self._comment_normalize_text(item.get("content", ""), limit=120),
                            "targetLevel": self._comment_normalize_text(target_message.get("level", "top"), limit=24),
                            "targetIndex": int(target_message.get("index", -1) if str(target_message.get("index", -1)).lstrip("-").isdigit() else -1),
                            "targetIsAuthor": bool(target_message.get("isAuthor")),
                            "targetReplyButtonFound": bool(target_message.get("replyButtonFound", item.get("replyButtonFound", False))),
                            "targetReplyButtonHint": self._comment_normalize_text(target_message.get("replyButtonHint", "") or item.get("replyButtonHint", ""), limit=160),
                            "authorDetectBy": self._comment_normalize_text(target_message.get("authorDetectBy", ""), limit=40),
                            "confirmedAuthorName": self._comment_normalize_text(item.get("confirmedAuthorName", ""), limit=80),
                            "replyNeedReason": reply_need_reason,
                            "replyToName": self._comment_normalize_text(target_message.get("replyToName", ""), limit=80),
                            "replyToIsAuthor": bool(target_message.get("replyToIsAuthor")),
                            "hasAuthorReplyInThread": bool(item.get("hasAuthorReplyInThread")),
                            "hasCollapsedReplies": bool(item.get("hasCollapsedReplies")),
                            "loadMoreText": self._comment_normalize_text(item.get("loadMoreText", ""), limit=80),
                            "nestedReplyCount": int(item.get("nestedReplyCount", 0) or 0),
                            "replyEditorVisible": bool(item.get("replyEditorVisible", False)),
                        }
                        reason = self._comment_skip_reason_for_target(item, target_message, reply_need_reason)
                        if reason:
                            summary["skipReason"] = reason
                            skipped.append(summary)
                            continue
                        candidates.append(summary)
                candidates.sort(key=self._comment_candidate_sort_key)
                return candidates, skipped

    def _comment_attach_candidate_debug(self, result: dict[str, Any]) -> dict[str, Any]:
                if not isinstance(result, dict):
                    return result
                result = self._comment_enrich_reply_result(result)
                candidates, skipped = self._comment_build_reply_candidates(result)
                result["replyCandidates"] = candidates[:10]
                result["replySkippedSamples"] = skipped[:10]
                counts = result.get("counts", {}) or {}
                counts["replyCandidates"] = len(candidates)
                counts["replySkipped"] = len(skipped)
                result["counts"] = counts
                return result



    def _comment_reply_target_matches_thread(self, item: dict[str, Any], target: dict[str, Any]) -> bool:
                if not isinstance(item, dict) or not isinstance(target, dict):
                    return False
                item_key = self._comment_normalize_text(item.get("threadKey", ""), limit=240)
                target_key = self._comment_normalize_text(target.get("threadKey", ""), limit=240)
                if item_key and target_key and item_key == target_key:
                    return True
                item_author = self._comment_normalize_text(item.get("author", ""), limit=120)
                target_author = self._comment_normalize_text(target.get("author", ""), limit=120)
                item_content = self._comment_normalize_text(item.get("content", ""), limit=200)
                target_content = self._comment_normalize_text(target.get("content", ""), limit=200)
                if item_author and target_author and item_author == target_author and item_content and target_content and item_content == target_content:
                    return True
                item_time = self._comment_normalize_text(item.get("timeText", ""), limit=60)
                target_time = self._comment_normalize_text(target.get("timeText", ""), limit=60)
                return bool(item_author and target_author and item_author == target_author and item_time and target_time and item_time == target_time)

    def _comment_find_reply_target_thread(self, result: dict[str, Any], target: dict[str, Any]) -> dict[str, Any] | None:
                for item in (result.get("topComments", []) or []):
                    if self._comment_reply_target_matches_thread(item, target):
                        return item
                return None

    def _comment_reply_editor_alive_config(self) -> dict[str, int]:
                config = self.comment_runtime_config if isinstance(getattr(self, "comment_runtime_config", None), dict) else {}
                reply_cfg = config.get("reply", {}) if isinstance(config.get("reply"), dict) else {}
                return {
                    "required_streak": int(reply_cfg.get("editor_alive_required_streak", 2) or 2),
                    "max_lost_streak": int(reply_cfg.get("editor_alive_max_lost_streak", 3) or 3),
                    "probe_interval_ms": int(reply_cfg.get("editor_alive_probe_interval_ms", 1200) or 1200),
                }

    def _comment_active_reply_editor_stages(self) -> set[str]:
                return {"reply_candidate_selected", "reply_editor_opening", "reply_editor_confirmed", "reply_editor_focus_retry", "reply_editor_post_focus_stabilizing", "reply_editor_stable", "reply_editor_ready_for_draft", "reply_draft_inject_probe", "reply_draft_reactivate_probe", "reply_draft_verified",
                        "manual_send_hold", "reply_editor_lost_hold", "reply_editor_recovering"}

    def _comment_reply_target_identity(self, target: dict[str, Any] | None) -> str:
                if not isinstance(target, dict):
                    return ""
                stable = self._comment_reply_open_cooldown_key(target)
                if stable:
                    return "stable:" + stable
                message_key = self._comment_normalize_text(target.get("targetMessageKey", "") or target.get("messageKey", ""), limit=300)
                if message_key:
                    return "message:" + message_key
                return ""

    def _comment_next_reply_open_attempt_no(self, target: dict[str, Any] | None) -> int:
                """Return a per-target open attempt number instead of a session-global count."""
                identity = self._comment_reply_target_identity(target)
                last_identity = str(getattr(self, "comment_reply_open_attempt_identity", "") or "")
                if identity != last_identity:
                    self.comment_reply_open_attempt_identity = identity
                    self.comment_reply_open_attempts = 0
                self.comment_reply_open_attempts = int(getattr(self, "comment_reply_open_attempts", 0) or 0) + 1
                return self.comment_reply_open_attempts

    def _comment_recent_reply_click_guard_ms(self) -> int:
                config = self.comment_runtime_config if isinstance(getattr(self, "comment_runtime_config", None), dict) else {}
                reply_cfg = config.get("reply", {}) if isinstance(config.get("reply"), dict) else {}
                # 回复按钮是 toggle 型控件：只有 editor 已真实出现后，才使用这个长锁防止二次点击收起。
                return int(reply_cfg.get("reply_button_same_target_click_guard_ms", 30000) or 30000)

    def _comment_pending_reply_click_guard_ms(self) -> int:
                config = self.comment_runtime_config if isinstance(getattr(self, "comment_runtime_config", None), dict) else {}
                reply_cfg = config.get("reply", {}) if isinstance(config.get("reply"), dict) else {}
                return int(reply_cfg.get("reply_button_pending_open_confirm_guard_ms", 2400) or 2400)

    def _comment_reply_open_methods(self, target_level: str = "") -> list[str]:
                # D7: exact DOM first for both root and nested comments.
                # Qt is only a final real-mouse fallback at the current exact DOM rect.
                return [
                    "precise_dom_registered_click",
                    "precise_dom_reacquire_click",
                    "qt_view_mouse_click",
                ]

    def _comment_reply_open_method_observe_ms(self, method: str) -> int:
                method_name = self._comment_normalize_text(method, limit=64)
                if method_name == "precise_dom_registered_click":
                    return 5200
                if method_name == "precise_dom_reacquire_click":
                    return 4600
                if method_name == "qt_view_mouse_click":
                    return 3800
                return 4500

    def _comment_perform_qt_view_reply_click(self, click_info: dict[str, Any], target: dict[str, Any] | None = None) -> bool:
                try:
                    # A Qt view-level click is only allowed when JS re-resolved an
                    # exact, non-destructive "回复" action. Never click coordinates
                    # derived from an operations wrapper that may also contain 删除/举报.
                    target_text = self._comment_normalize_text((click_info or {}).get("targetText"), limit=40)
                    point_before = (click_info or {}).get("elementFromPointBefore") if isinstance((click_info or {}).get("elementFromPointBefore"), dict) else {}
                    point_text = self._comment_normalize_text(point_before.get("text"), limit=40)
                    safe_action = bool((click_info or {}).get("safeReplyAction"))
                    inside_target = bool(point_before.get("insideTarget"))
                    safe_target_text = bool(re.fullmatch(r"回复(?:\s*[（(]?\d+[）)]?)?", target_text or "")) and not bool(re.search(r"删除|举报|取消|发送", target_text or ""))
                    point_destructive = bool(re.search(r"删除|举报|确认删除|确定删除", point_text or ""))
                    # elementFromPoint commonly lands on an inner span/icon whose
                    # text is empty or differs from the action wrapper. The safe
                    # condition is containment inside a previously validated reply
                    # action, not exact equality of the inner-node text.
                    if not safe_action or not safe_target_text or not inside_target or point_destructive:
                        self._log("WARN", f"评论页拒绝不安全的 Qt 回复点击: {json.dumps({'author': str((target or {}).get('author', '') or ''), 'targetText': target_text, 'pointText': point_text, 'insideTarget': inside_target, 'safeReplyAction': safe_action, 'safeTargetText': safe_target_text, 'pointDestructive': point_destructive}, ensure_ascii=False)}")
                        return False
                    if QTest is None:
                        self._log("WARN", f"{TRACE_REPLY_EDITOR} | qt_view_click_unavailable")
                        return False
                    view = getattr(self, "view", None)
                    if view is None:
                        self._log("WARN", f"{TRACE_REPLY_EDITOR} | qt_view_click_missing_view")
                        return False
                    point_info = click_info.get("clickPoint", {}) if isinstance(click_info, dict) else {}
                    x = int(point_info.get("x", 0) or 0)
                    y = int(point_info.get("y", 0) or 0)
                    if x <= 0 or y <= 0:
                        rect = click_info.get("targetRect", {}) if isinstance(click_info, dict) else {}
                        x = int(rect.get("x", 0) or 0) + max(1, int(rect.get("w", 0) or 0) // 2)
                        y = int(rect.get("y", 0) or 0) + max(1, int(rect.get("h", 0) or 0) // 2)
                    if x <= 0 or y <= 0:
                        self._log("WARN", f"{TRACE_REPLY_EDITOR} | qt_view_click_invalid_point={json.dumps({'x': x, 'y': y}, ensure_ascii=False)}")
                        return False
                    point = QPoint(x, y)
                    try:
                        view.raise_()
                    except Exception:
                        pass
                    try:
                        view.activateWindow()
                    except Exception:
                        pass
                    try:
                        view.setFocus(Qt.FocusReason.MouseFocusReason)
                    except Exception:
                        try:
                            view.setFocus()
                        except Exception:
                            pass
                    QTest.mouseMove(view, point, 20)
                    QTest.mouseClick(view, Qt.MouseButton.LeftButton, Qt.KeyboardModifier.NoModifier, point, 80)
                    self._log("INFO", f"评论页使用 Qt 视图级点击回复按钮: {json.dumps({'level': str((target or {}).get('targetLevel', '') or ''), 'author': str((target or {}).get('author', '') or ''), 'x': x, 'y': y}, ensure_ascii=False)}")
                    return True
                except Exception as exc:
                    self._log("WARN", f"{TRACE_REPLY_EDITOR} | qt_view_click_failed={json.dumps({'error': str(exc), 'author': str((target or {}).get('author', '') if isinstance(target, dict) else '')}, ensure_ascii=False)}")
                    return False

    def _comment_note_reply_button_click(self, target: dict[str, Any], *, reason: str, result: dict[str, Any] | None = None) -> None:
                identity = self._comment_reply_target_identity(target)
                if not identity:
                    return
                now_ms = self._now_ms()
                pending_guard_ms = self._comment_pending_reply_click_guard_ms()
                self.comment_reply_button_last_click_identity = identity
                self.comment_reply_button_last_click_ms = now_ms
                self.comment_reply_button_click_pending_until_ms = now_ms + pending_guard_ms
                self.comment_reply_button_click_lock_until_ms = self.comment_reply_button_click_pending_until_ms
                method = str((target or {}).get("openMethod", "") or "dom_click_current")
                payload = {
                    "identity": identity,
                    "threadKey": str((target or {}).get("threadKey", "") or ""),
                    "author": str((target or {}).get("author", "") or ""),
                    "reason": reason,
                    "guardType": "pending_open_confirm_short_lock",
                    "guardMs": pending_guard_ms,
                    "method": method,
                    "lockUntilMs": int(getattr(self, "comment_reply_button_click_lock_until_ms", 0) or 0),
                    "stage": str(getattr(self, "comment_stage_name", "") or ""),
                }
                self._comment_note_editor_risky_action("reply_button_click", result=result, target=target, extra=payload)
                if self._comment_verbose_logs_enabled():
                    self._log("INFO", f"{TRACE_REPLY_EDITOR} | reply_button_click_lock_set={json.dumps(payload, ensure_ascii=False)}")
                if hasattr(self, "_comment_enter_critical_quiet"):
                    self._comment_enter_critical_quiet("reply_button_clicked_pending_open_confirm_v70_first_click_settle", 2200, target=target)
                if isinstance(result, dict):
                    self._comment_log_editor_diag_snapshot(result, reason="reply_button_click_pending_short_lock_set", target=target, level="INFO", extra=payload)

    def _comment_upgrade_reply_click_lock_after_visible(self, target: dict[str, Any], *, reason: str = "editor_visible_confirmed") -> None:
                identity = self._comment_reply_target_identity(target)
                if not identity:
                    return
                now_ms = self._now_ms()
                guard_ms = self._comment_recent_reply_click_guard_ms()
                self.comment_reply_button_last_click_identity = identity
                self.comment_reply_button_visible_lock_until_ms = now_ms + guard_ms
                self.comment_reply_button_click_lock_until_ms = self.comment_reply_button_visible_lock_until_ms
                payload = {
                    "identity": identity,
                    "threadKey": str((target or {}).get("threadKey", "") or ""),
                    "author": str((target or {}).get("author", "") or ""),
                    "reason": reason,
                    "guardType": "visible_editor_no_reclick_long_lock",
                    "guardMs": guard_ms,
                    "lockUntilMs": int(getattr(self, "comment_reply_button_click_lock_until_ms", 0) or 0),
                    "stage": str(getattr(self, "comment_stage_name", "") or ""),
                }
                if self._comment_verbose_logs_enabled():
                    self._log("INFO", f"{TRACE_REPLY_EDITOR} | reply_button_click_lock_upgraded={json.dumps(payload, ensure_ascii=False)}")

    def _comment_should_suppress_reply_button_click(self, target: dict[str, Any], *, result: dict[str, Any] | None = None, reason: str = "same_target_recent_click", respect_active: bool = True) -> tuple[bool, dict[str, Any]]:
                identity = self._comment_reply_target_identity(target)
                now_ms = self._now_ms()
                last_identity = str(getattr(self, "comment_reply_button_last_click_identity", "") or "")
                lock_until = int(getattr(self, "comment_reply_button_click_lock_until_ms", 0) or 0)
                pending_until = int(getattr(self, "comment_reply_button_click_pending_until_ms", 0) or 0)
                visible_lock_until = int(getattr(self, "comment_reply_button_visible_lock_until_ms", 0) or 0)
                active = self.comment_active_reply_target if isinstance(getattr(self, "comment_active_reply_target", None), dict) else None
                pending = self.comment_pending_reply_target if isinstance(getattr(self, "comment_pending_reply_target", None), dict) else None
                active_identity = self._comment_reply_target_identity(active)
                pending_identity = self._comment_reply_target_identity(pending)
                suppress = False
                suppress_reason = ""
                if identity and pending_identity and identity == pending_identity and now_ms < pending_until:
                    suppress = True
                    suppress_reason = "pending_same_target_short_confirm"
                elif respect_active and identity and active_identity and identity == active_identity:
                    suppress = True
                    suppress_reason = "active_same_target_editor_known"
                elif identity and last_identity == identity and now_ms < visible_lock_until:
                    suppress = True
                    suppress_reason = "visible_editor_recent_same_target_click"
                elif identity and last_identity == identity and now_ms < lock_until:
                    suppress = True
                    suppress_reason = reason
                payload = {
                    "suppress": suppress,
                    "reason": suppress_reason,
                    "identity": identity,
                    "lastIdentity": last_identity,
                    "activeIdentity": active_identity,
                    "pendingIdentity": pending_identity,
                    "elapsedSinceClickMs": (now_ms - int(getattr(self, "comment_reply_button_last_click_ms", 0) or 0)) if int(getattr(self, "comment_reply_button_last_click_ms", 0) or 0) else 0,
                    "lockRemainingMs": max(0, lock_until - now_ms),
                    "pendingLockRemainingMs": max(0, pending_until - now_ms),
                    "visibleLockRemainingMs": max(0, visible_lock_until - now_ms),
                    "stage": str(getattr(self, "comment_stage_name", "") or ""),
                    "threadKey": str((target or {}).get("threadKey", "") or ""),
                    "author": str((target or {}).get("author", "") or ""),
                }
                if suppress:
                    if self._comment_verbose_logs_enabled():
                        self._log("INFO", f"{TRACE_REPLY_EDITOR} | reply_click_suppressed={json.dumps(payload, ensure_ascii=False)}")
                    if isinstance(result, dict):
                        self._comment_log_reply_block_decision(result, decision="reply_click_suppressed", reason=suppress_reason, target=target, extra=payload)
                return suppress, payload

    def _comment_public_reply_diag_context(self, result: dict[str, Any], target: dict[str, Any] | None = None) -> dict[str, Any]:
                target = target if isinstance(target, dict) else None
                match = self._comment_find_reply_target_thread(result, target) if target else None
                composers = result.get("composers", {}) or {}
                reply_editors = composers.get("replyEditors", []) or []
                candidates = result.get("replyCandidates")
                if not isinstance(candidates, list):
                    candidates, _ = self._comment_build_reply_candidates(result)
                counts = result.get("counts", {}) or {}
                diagnostics = result.get("diagnostics", {}) or {}
                active_element = diagnostics.get("activeElement", {}) if isinstance(diagnostics, dict) else {}
                top_composer = composers.get("topComposer", {}) or {}
                return {
                    "stage": str(getattr(self, "comment_stage_name", "") or ""),
                    "workKey": self._comment_current_work_key(result) if hasattr(self, "_comment_current_work_key") else "",
                    "currentWorkTitle": str((result.get("header", {}) or {}).get("currentWorkTitle", "") or ""),
                    "currentFilter": self._comment_filter_text(result) if hasattr(self, "_comment_filter_text") else "",
                    "filterReady": bool(self._comment_filter_ready(result)) if hasattr(self, "_comment_filter_ready") else False,
                    "candidateCount": len(candidates) if isinstance(candidates, list) else 0,
                    "candidateSample": ([{
                        "level": str((item or {}).get("targetLevel", "") or ""),
                        "author": str((item or {}).get("author", "") or "")[:60],
                        "content": str((item or {}).get("content", "") or "")[:80],
                        "reason": str((item or {}).get("replyNeedReason", "") or ""),
                    } for item in candidates[:3] if isinstance(item, dict)] if isinstance(candidates, list) else []),
                    "targetThreadKey": str((target or {}).get("threadKey", "") or ""),
                    "targetAuthor": str((target or {}).get("author", "") or ""),
                    "targetContent": str((target or {}).get("content", "") or ""),
                    "targetMatched": bool(match),
                    "targetReplyButtonFound": bool(match and match.get("replyButtonFound")),
                    "targetReplyButtonClickable": bool(match and match.get("replyButtonClickable")),
                    "targetReplyEditorVisible": bool(match and match.get("replyEditorVisible")),
                    "targetReplyEditorPlaceholder": str((match or {}).get("replyEditorPlaceholder", "") or ""),
                    "targetReplyEditorHint": str((match or {}).get("replyEditorHint", "") or ""),
                    "targetReplySendFound": bool(match and match.get("replySendFound")),
                    "targetReplyCancelFound": bool(match and match.get("replyCancelFound")),
                    "replyEditorsFound": len(reply_editors) if isinstance(reply_editors, list) else 0,
                    "replyEditorSamples": (reply_editors[:3] if isinstance(reply_editors, list) else []),
                    "topComposerFound": bool(top_composer.get("found")),
                    "topComposerPlaceholder": str(top_composer.get("placeholder", "") or ""),
                    "activeElement": active_element if isinstance(active_element, dict) else {},
                    "visibleEditableCount": int((diagnostics.get("visibleEditableCount", 0) if isinstance(diagnostics, dict) else 0) or 0),
                    "visibleEditableSamples": (diagnostics.get("visibleEditableSamples", [])[:6] if isinstance(diagnostics, dict) and isinstance(diagnostics.get("visibleEditableSamples"), list) else []),
                    "visiblePopoverTexts": (diagnostics.get("visiblePopoverTexts", [])[:6] if isinstance(diagnostics, dict) and isinstance(diagnostics.get("visiblePopoverTexts"), list) else []),
                    "visibleLoadingTexts": (diagnostics.get("visibleLoadingTexts", [])[:6] if isinstance(diagnostics, dict) and isinstance(diagnostics.get("visibleLoadingTexts"), list) else []),
                    "counts": {
                        "topComments": int(counts.get("topComments", 0) or 0),
                        "visibleCardCount": int(counts.get("visibleCardCount", 0) or 0),
                        "replyEditors": int(counts.get("replyEditors", 0) or 0),
                        "replyCandidates": int(counts.get("replyCandidates", len(candidates) if isinstance(candidates, list) else 0) or 0),
                    },
                }

    def _comment_should_emit_diag_log(self, kind: str, payload: dict[str, Any], *, level: str = "INFO", min_interval_ms: int = 5000) -> bool:
                """Throttle repetitive editor diagnostic payloads.

                The comment module can inspect every few seconds while waiting for
                Coze/editor state. Full diag JSON is useful, but repeated identical
                snapshots make real problems hard to read. WARN timeout/final events
                are still emitted; routine INFO snapshots are emitted on change or
                after the interval.
                """
                if not isinstance(payload, dict):
                    return True
                reason = str(payload.get("reason", "") or "")
                decision = str(payload.get("decision", "") or "")
                if str(level).upper() in {"ERROR", "CRITICAL"}:
                    return True
                if reason in {"reply_editor_confirm_timeout", "editor_lost_stage_timeout"}:
                    return True
                stage = str(payload.get("stage", "") or "")
                sig_payload = {
                    "kind": kind,
                    "stage": stage,
                    "reason": reason,
                    "decision": decision,
                    "workKey": str(payload.get("workKey", "") or ""),
                    "target": str(payload.get("targetThreadKey", "") or ""),
                    "targetAuthor": str(payload.get("targetAuthor", "") or ""),
                    "candidateCount": int(payload.get("candidateCount", 0) or 0),
                    "replyEditorsFound": int(payload.get("replyEditorsFound", 0) or 0),
                    "targetEditorVisible": bool(payload.get("targetReplyEditorVisible")),
                }
                sig = json.dumps(sig_payload, sort_keys=True, ensure_ascii=False)
                store = getattr(self, "comment_diag_log_throttle", None)
                if not isinstance(store, dict):
                    store = {}
                    setattr(self, "comment_diag_log_throttle", store)
                now_ms = self._now_ms()
                item = store.get(kind, {})
                if item.get("sig") != sig or now_ms - int(item.get("lastMs", 0) or 0) >= max(1200, int(min_interval_ms or 0)):
                    store[kind] = {"sig": sig, "lastMs": now_ms}
                    return True
                return False

    def _comment_log_editor_diag_snapshot(self, result: dict[str, Any], *, reason: str, target: dict[str, Any] | None = None, level: str = "INFO", extra: dict[str, Any] | None = None) -> None:
                payload = self._comment_public_reply_diag_context(result, target or getattr(self, "comment_active_reply_target", None) or getattr(self, "comment_pending_reply_target", None))
                payload["reason"] = reason
                if isinstance(extra, dict):
                    payload.update(extra)
                if not self._comment_verbose_logs_enabled():
                    if str(level).upper() not in {"WARN", "ERROR", "CRITICAL"}:
                        return
                    if not self._comment_should_emit_diag_log("editor_diag_snapshot", payload, level=level, min_interval_ms=15000):
                        return
                    self._log(level, f"{TRACE_EDITOR_DIAG} | editor_diag_summary={json.dumps(self._comment_diag_summary(payload), ensure_ascii=False)}")
                    return
                if not self._comment_should_emit_diag_log("editor_diag_snapshot", payload, level=level, min_interval_ms=6000):
                    return
                self._log(level, f"{TRACE_EDITOR_DIAG} | editor_diag_snapshot={json.dumps(payload, ensure_ascii=False)}")

    def _comment_log_reply_block_decision(self, result: dict[str, Any], *, decision: str, reason: str, target: dict[str, Any] | None = None, level: str = "INFO", extra: dict[str, Any] | None = None) -> None:
                payload = self._comment_public_reply_diag_context(result, target or getattr(self, "comment_active_reply_target", None) or getattr(self, "comment_pending_reply_target", None))
                payload.update({"decision": decision, "reason": reason})
                if isinstance(extra, dict):
                    payload.update(extra)
                if not self._comment_verbose_logs_enabled():
                    if str(level).upper() not in {"WARN", "ERROR", "CRITICAL"}:
                        return
                    if not self._comment_should_emit_diag_log("reply_block_decision", payload, level=level, min_interval_ms=15000):
                        return
                    self._log(level, f"{TRACE_EDITOR_DIAG} | reply_block_summary={json.dumps(self._comment_diag_summary(payload), ensure_ascii=False)}")
                    return
                if not self._comment_should_emit_diag_log("reply_block_decision", payload, level=level, min_interval_ms=7000):
                    return
                self._log(level, f"{TRACE_EDITOR_DIAG} | reply_block_decision={json.dumps(payload, ensure_ascii=False)}")


    def _comment_note_editor_risky_action(self, action: str, *, result: dict[str, Any] | None = None, target: dict[str, Any] | None = None, extra: dict[str, Any] | None = None) -> None:
                """Scheme C: record every action that can refresh/toggle the reply editor.

                This method is diagnostic-only. It never changes flow decisions by itself.
                """
                try:
                    now_ms = self._now_ms()
                    payload = {
                        "action": str(action or ""),
                        "atMs": now_ms,
                        "stage": str(getattr(self, "comment_stage_name", "") or ""),
                        "workKey": self._comment_current_work_key(result) if isinstance(result, dict) and hasattr(self, "_comment_current_work_key") else str(getattr(self, "comment_stage_work_key", "") or ""),
                        "threadKey": str((target or {}).get("threadKey", "") or ""),
                        "author": str((target or {}).get("author", "") or ""),
                        "activeTarget": bool(getattr(self, "comment_active_reply_target", None)),
                        "pendingReply": bool(getattr(self, "comment_pending_reply_target", None)),
                        "pendingDraft": bool(getattr(self, "comment_pending_draft_probe_target", None)),
                    }
                    if isinstance(extra, dict):
                        payload.update(extra)
                    self.comment_last_editor_risky_action = payload
                    self.comment_last_editor_risky_action_ms = now_ms
                    if self._comment_verbose_logs_enabled():
                        self._log("INFO", f"{TRACE_EDITOR_DIAG} | schemeC_editor_risky_action={json.dumps(payload, ensure_ascii=False)}")
                except Exception as exc:
                    self._log("WARN", f"{TRACE_EDITOR_DIAG} | schemeC_editor_risky_action_log_failed={type(exc).__name__}: {exc}")

    def _comment_record_reply_editor_visible(self, result: dict[str, Any] | None, target: dict[str, Any] | None, *, reason: str) -> None:
                """Record the first/last moment when the target editor is known visible."""
                if not isinstance(target, dict) or not target:
                    return
                now_ms = self._now_ms()
                identity = self._comment_reply_target_identity(target)
                self.comment_reply_editor_ever_visible = True
                self.comment_reply_editor_visible_identity = identity
                self.comment_reply_editor_alive_last_visible = True
                self.comment_reply_editor_alive_last_visible_ms = now_ms
                if not int(getattr(self, "comment_reply_editor_first_visible_ms", 0) or 0):
                    self.comment_reply_editor_first_visible_ms = now_ms
                payload = {
                    "reason": reason,
                    "identity": identity,
                    "threadKey": str(target.get("threadKey", "") or ""),
                    "author": str(target.get("author", "") or ""),
                    "stage": str(getattr(self, "comment_stage_name", "") or ""),
                    "lastRiskyAction": getattr(self, "comment_last_editor_risky_action", {}) or {},
                }
                if isinstance(result, dict):
                    payload["currentFilter"] = self._comment_filter_text(result) if hasattr(self, "_comment_filter_text") else ""
                    payload["workKey"] = self._comment_current_work_key(result) if hasattr(self, "_comment_current_work_key") else ""
                if self._comment_verbose_logs_enabled():
                    self._log("INFO", f"{TRACE_EDITOR_DIAG} | schemeC_editor_visible_recorded={json.dumps(payload, ensure_ascii=False)}")

    def _comment_log_editor_disappearance_diag(self, result: dict[str, Any] | None, target: dict[str, Any] | None, *, reason: str, level: str = "WARN", extra: dict[str, Any] | None = None) -> None:
                """Scheme C disappearance diagnostics.

                Based on manual observation, the editor should not disappear due to blur/idle time.
                Therefore disappearance is treated as a likely refresh/toggle/action side effect.
                """
                now_ms = self._now_ms()
                last_visible_ms = int(getattr(self, "comment_reply_editor_alive_last_visible_ms", 0) or 0)
                last_click_ms = int(getattr(self, "comment_reply_button_last_click_ms", 0) or 0)
                payload = {
                    "reason": reason,
                    "stage": str(getattr(self, "comment_stage_name", "") or ""),
                    "threadKey": str((target or {}).get("threadKey", "") or ""),
                    "author": str((target or {}).get("author", "") or ""),
                    "everVisible": bool(getattr(self, "comment_reply_editor_ever_visible", False)),
                    "visibleIdentity": str(getattr(self, "comment_reply_editor_visible_identity", "") or ""),
                    "msSinceLastVisible": (now_ms - last_visible_ms) if last_visible_ms else 0,
                    "msSinceLastReplyClick": (now_ms - last_click_ms) if last_click_ms else 0,
                    "lastRiskyAction": getattr(self, "comment_last_editor_risky_action", {}) or {},
                    "lastUrl": str(getattr(self, "last_observed_url", "") or ""),
                    "currentUrl": str(getattr(self.page, "url", lambda: None)().toString() if getattr(self, "page", None) else ""),
                }
                if isinstance(result, dict):
                    payload.update({
                        "currentFilter": self._comment_filter_text(result) if hasattr(self, "_comment_filter_text") else "",
                        "filterReady": self._comment_filter_ready(result) if hasattr(self, "_comment_filter_ready") else False,
                        "workKey": self._comment_current_work_key(result) if hasattr(self, "_comment_current_work_key") else "",
                        "candidateCount": self._comment_candidate_count(result) if hasattr(self, "_comment_candidate_count") else 0,
                    })
                if isinstance(extra, dict):
                    payload.update(extra)
                self._log(level, f"{TRACE_EDITOR_DIAG} | schemeC_editor_disappeared={json.dumps(payload, ensure_ascii=False)}")

    def _comment_active_element_in_target_reply_editor(self, result: dict[str, Any]) -> bool:
                diagnostics = result.get("diagnostics", {}) or {}
                active = diagnostics.get("activeElement", {}) if isinstance(diagnostics, dict) else {}
                if not isinstance(active, dict):
                    return False
                placeholder = self._comment_normalize_text(active.get("placeholder", ""), limit=80)
                # 目标 reply input 可能复用 content-wWJcbN/topComposer 样式；只要 placeholder 明确以“回复”开头，就允许作为目标焦点。
                return bool(active.get("inReplyWrap") and (placeholder.startswith("回复") or (not active.get("inTopComposer") and str(active.get("editable", "") or "").lower() == "true")))

    def _comment_focus_active_reply_editor(self, target: dict[str, Any], *, reason: str = "focus_active_reply_editor") -> None:
                if not self.running or not self.ready or self.current_module != "comment" or not self.page:
                    return
                if not isinstance(target, dict) or not target:
                    return
                now_ms = self._now_ms()
                if now_ms - int(getattr(self, "comment_reply_editor_focus_last_attempt_ms", 0) or 0) < 650:
                    return
                self.comment_reply_editor_focus_last_attempt_ms = now_ms
                self.comment_reply_editor_focus_attempts = int(getattr(self, "comment_reply_editor_focus_attempts", 0) or 0) + 1
                payload = {
                    "reason": reason,
                    "attemptNo": int(getattr(self, "comment_reply_editor_focus_attempts", 0) or 0),
                    "threadKey": str(target.get("threadKey", "") or ""),
                    "author": str(target.get("author", "") or ""),
                    "stage": str(getattr(self, "comment_stage_name", "") or ""),
                }
                self._log("INFO", f"{TRACE_EDITOR_DIAG} | reply_editor_focus_attempt={json.dumps(payload, ensure_ascii=False)}")
                self.busy = True
                self.page.runJavaScript(
                    build_comment_focus_reply_editor_script(
                        str(target.get("threadKey", "") or ""),
                        str(target.get("author", "") or ""),
                        str(target.get("content", "") or ""),
                        target_message_key=str(target.get("targetMessageKey", "") or target.get("messageKey", "") or ""),
                        reply_dom_key=str(target.get("replyDomKey", "") or ""),
                        target_level=str(target.get("targetLevel", "") or target.get("level", "") or ""),
                        target_index=int(target.get("targetIndex", target.get("index", -999)) if target.get("targetIndex", target.get("index", -999)) is not None else -999),
                        target_parent_thread_key=str(target.get("targetParentThreadKey", "") or target.get("threadKey", "") or ""),
                    ),
                    self._handle_comment_focus_reply_editor_result,
                )

    def _handle_comment_focus_reply_editor_result(self, result: Any) -> None:
                self.busy = False
                result = self._coerce_js_result(result)
                if not isinstance(result, dict):
                    self._log("WARN", f"{TRACE_EDITOR_DIAG} | reply_editor_focus_result={json.dumps({'ok': False, 'state': 'invalid_result', 'type': type(result).__name__, 'snippet': str(result)[:220]}, ensure_ascii=False)}")
                    self._schedule_fast_comment_inspect(1600)
                    return
                level = "INFO" if result.get("ok") else "WARN"
                self._log(level, f"{TRACE_EDITOR_DIAG} | reply_editor_focus_result={json.dumps(result, ensure_ascii=False)}")
                if result.get("ok"):
                    self.comment_reply_editor_focus_confirmed = True
                    self.comment_reply_editor_focus_lost_streak = 0
                    self.comment_reply_editor_focus_confirmed_ms = self._now_ms()
                    if str(getattr(self, "comment_stage_name", "") or "") == "reply_editor_focus_retry" and hasattr(self, "_comment_set_flow_stage"):
                        self._comment_set_flow_stage("reply_editor_confirmed", {}, reason="reply_editor_focus_retry_ok")
                    target = self.comment_active_reply_target if isinstance(getattr(self, "comment_active_reply_target", None), dict) else None
                    if not target:
                        payload = result.get("payload", {}) if isinstance(result.get("payload"), dict) else {}
                        target = {
                            "threadKey": str(payload.get("threadKey", "") or ""),
                            "author": str(payload.get("author", "") or ""),
                            "content": str(payload.get("content", "") or ""),
                        }
                    self._comment_begin_post_focus_stable_probe(target, reason="focus_result_ok")
                    return
                else:
                    self.comment_reply_editor_focus_confirmed = False
                    self.comment_reply_editor_focus_lost_streak = int(getattr(self, "comment_reply_editor_focus_lost_streak", 0) or 0) + 1
                self._schedule_fast_comment_inspect(1500)

    def _comment_begin_post_focus_stable_probe(self, target: dict[str, Any] | None, *, reason: str = "post_focus_stabilize") -> None:
                if not isinstance(target, dict) or not target:
                    return
                identity = self._comment_reply_target_identity(target)
                if not identity:
                    return
                self.comment_reply_editor_post_focus_running = True
                self.comment_reply_editor_post_focus_started_ms = self._now_ms()
                self.comment_reply_editor_post_focus_success_streak = 0
                self.comment_reply_editor_post_focus_attempts = 0
                self.comment_reply_editor_post_focus_identity = identity
                if hasattr(self, "_comment_set_flow_stage"):
                    self._comment_set_flow_stage("reply_editor_post_focus_stabilizing", {}, reason=reason)
                payload = {
                    "threadKey": str(target.get("threadKey", "") or ""),
                    "author": str(target.get("author", "") or ""),
                    "identity": identity,
                    "reason": reason,
                    "stage": str(getattr(self, "comment_stage_name", "") or ""),
                    "requiredAliveStreak": self._comment_reply_editor_alive_config()["required_streak"],
                }
                self._log("INFO", f"{TRACE_REPLY_EDITOR} | reply_editor_post_focus_stabilizing={json.dumps(payload, ensure_ascii=False)}")
                self._comment_schedule_post_focus_alive_probe(dict(target), probe_no=1, delay_ms=160)

    def _comment_schedule_post_focus_alive_probe(self, target: dict[str, Any], *, probe_no: int, delay_ms: int = 220) -> None:
                def _fire() -> None:
                    try:
                        if not self.running or not self.ready or self.current_module != "comment" or not self.page:
                            return
                        current_identity = str(getattr(self, "comment_reply_editor_post_focus_identity", "") or "")
                        if current_identity and current_identity != self._comment_reply_target_identity(target):
                            return
                        if self.busy:
                            self._comment_schedule_post_focus_alive_probe(target, probe_no=probe_no, delay_ms=180)
                            return
                        self.busy = True
                        self.page.runJavaScript(
                            build_comment_focus_reply_editor_script(
                                str(target.get("threadKey", "") or ""),
                                str(target.get("author", "") or ""),
                                str(target.get("content", "") or ""),
                        target_message_key=str(target.get("targetMessageKey", "") or target.get("messageKey", "") or ""),
                        reply_dom_key=str(target.get("replyDomKey", "") or ""),
                        target_level=str(target.get("targetLevel", "") or target.get("level", "") or ""),
                        target_index=int(target.get("targetIndex", target.get("index", -999)) if target.get("targetIndex", target.get("index", -999)) is not None else -999),
                        target_parent_thread_key=str(target.get("targetParentThreadKey", "") or target.get("threadKey", "") or ""),
                            ),
                            lambda js_result, _target=dict(target), _probe_no=probe_no: self._handle_comment_post_focus_alive_probe_result(js_result, _target, _probe_no),
                        )
                    except Exception as exc:
                        self.busy = False
                        self._log("WARN", f"{TRACE_REPLY_EDITOR} | reply_editor_post_focus_alive_probe_schedule_failed={json.dumps({'error': str(exc), 'probeNo': probe_no}, ensure_ascii=False)}")
                        self._schedule_fast_comment_inspect(1500)
                QTimer.singleShot(max(0, int(delay_ms or 0)), _fire)

    def _handle_comment_post_focus_alive_probe_result(self, js_result: Any, target: dict[str, Any], probe_no: int) -> None:
                self.busy = False
                result = self._coerce_js_result(js_result)
                now_ms = self._now_ms()
                started_ms = int(getattr(self, "comment_reply_editor_post_focus_started_ms", 0) or 0)
                after_focus_ms = (now_ms - started_ms) if started_ms else 0
                ok = bool(isinstance(result, dict) and result.get("ok"))
                state = str((result or {}).get("state", "") if isinstance(result, dict) else "invalid_result")
                active_element = (result.get("activeElement", {}) if isinstance(result, dict) else {})
                target_info = (result.get("target", {}) if isinstance(result, dict) else {})
                focus_methods = (result.get("focusMethods", []) if isinstance(result, dict) else [])
                if ok:
                    self.comment_reply_editor_post_focus_success_streak = int(getattr(self, "comment_reply_editor_post_focus_success_streak", 0) or 0) + 1
                    self.comment_reply_editor_alive_streak = max(
                        int(getattr(self, "comment_reply_editor_alive_streak", 0) or 0),
                        int(getattr(self, "comment_reply_editor_post_focus_success_streak", 0) or 0),
                    )
                    self.comment_reply_editor_lost_streak = 0
                    self.comment_reply_editor_focus_lost_streak = 0
                    self.comment_reply_editor_focus_confirmed = True
                    self.comment_reply_editor_alive_last_visible = True
                    self.comment_reply_editor_alive_last_visible_ms = now_ms
                else:
                    self.comment_reply_editor_post_focus_success_streak = 0
                    self.comment_reply_editor_focus_lost_streak = int(getattr(self, "comment_reply_editor_focus_lost_streak", 0) or 0) + 1
                    self.comment_reply_editor_focus_confirmed = False
                    if state in {"reply_editor_missing", "candidate_missing"}:
                        self.comment_reply_editor_lost_streak = int(getattr(self, "comment_reply_editor_lost_streak", 0) or 0) + 1
                payload = {
                    "probeNo": int(probe_no or 0),
                    "ok": ok,
                    "state": state,
                    "afterFocusMs": after_focus_ms,
                    "threadKey": str(target.get("threadKey", "") or ""),
                    "author": str(target.get("author", "") or ""),
                    "successStreak": int(getattr(self, "comment_reply_editor_post_focus_success_streak", 0) or 0),
                    "aliveStreak": int(getattr(self, "comment_reply_editor_alive_streak", 0) or 0),
                    "focusLostStreak": int(getattr(self, "comment_reply_editor_focus_lost_streak", 0) or 0),
                    "lostStreak": int(getattr(self, "comment_reply_editor_lost_streak", 0) or 0),
                    "activeElement": active_element if isinstance(active_element, dict) else {},
                    "target": target_info if isinstance(target_info, dict) else {},
                    "focusMethods": focus_methods if isinstance(focus_methods, list) else [],
                    "stage": str(getattr(self, "comment_stage_name", "") or ""),
                }
                self._log("INFO" if ok else "WARN", f"{TRACE_REPLY_EDITOR} | reply_editor_post_focus_alive_probe={json.dumps(payload, ensure_ascii=False)}")
                cfg = self._comment_reply_editor_alive_config()
                if ok and int(getattr(self, "comment_reply_editor_post_focus_success_streak", 0) or 0) >= cfg["required_streak"]:
                    self.comment_reply_editor_post_focus_running = False
                    self.comment_reply_editor_stable_since_ms = now_ms
                    if hasattr(self, "_comment_set_flow_stage"):
                        self._comment_set_flow_stage("reply_editor_stable", {}, reason="post_focus_alive_stable")
                    stable_payload = {
                        "threadKey": str(target.get("threadKey", "") or ""),
                        "author": str(target.get("author", "") or ""),
                        "aliveStreak": int(getattr(self, "comment_reply_editor_alive_streak", 0) or 0),
                        "focusReady": True,
                        "afterFocusMs": after_focus_ms,
                        "source": "post_focus_alive_probe",
                        "stage": str(getattr(self, "comment_stage_name", "") or ""),
                    }
                    self._log("INFO", f"{TRACE_REPLY_EDITOR} | reply_editor_stable={json.dumps(stable_payload, ensure_ascii=False)}")
                    if hasattr(self, "_comment_enter_ready_for_draft_from_stable"):
                        self._comment_enter_ready_for_draft_from_stable(target, reason="post_focus_alive_stable_v44_baseline")
                    else:
                        self._schedule_fast_comment_inspect(1600)
                    return
                max_post_focus_probes = 4
                if probe_no < max_post_focus_probes and (ok or state not in {"candidate_missing"}):
                    self._comment_schedule_post_focus_alive_probe(target, probe_no=probe_no + 1, delay_ms=260 if ok else 360)
                    return
                self.comment_reply_editor_post_focus_running = False
                if hasattr(self, "_comment_set_flow_stage"):
                    self._comment_set_flow_stage("reply_editor_focus_retry", {}, reason="post_focus_alive_not_stable")
                fail_payload = dict(payload)
                fail_payload["decision"] = "post_focus_not_stable"
                self._log("WARN", f"{TRACE_REPLY_EDITOR} | reply_editor_post_focus_not_stable={json.dumps(fail_payload, ensure_ascii=False)}")
                self._schedule_fast_comment_inspect(1500)

    def _comment_recover_lost_reply_editor(self, result: dict[str, Any], active: dict[str, Any]) -> bool:
                # V60 hard guard: after the editor has ever been visible, never click “回复” again.
                # Manual observation confirms missing editor is caused by refresh/toggle actions, not idle/blur.
                payload = {
                    "threadKey": str((active or {}).get("threadKey", "") or ""),
                    "author": str((active or {}).get("author", "") or ""),
                    "decision": "recover_blocked_no_reclick",
                    "reason": "reply_button_is_toggle_and_editor_was_visible",
                    "lostStreak": int(getattr(self, "comment_reply_editor_lost_streak", 0) or 0),
                    "lastRiskyAction": getattr(self, "comment_last_editor_risky_action", {}) or {},
                }
                if hasattr(self, "_comment_set_flow_stage"):
                    self._comment_set_flow_stage("reply_editor_lost_hold", result, reason="recover_blocked_no_reclick")
                self._log("WARN", f"{TRACE_REPLY_EDITOR} | reply_editor_recovering_blocked={json.dumps(payload, ensure_ascii=False)}")
                self._comment_log_editor_disappearance_diag(result, active, reason="recover_blocked_no_reclick", extra=payload)
                self._schedule_fast_comment_inspect(1200)
                return True

    def _comment_probe_active_comment_reply_editor(self, result: dict[str, Any]) -> None:
                active = self.comment_active_reply_target if isinstance(getattr(self, "comment_active_reply_target", None), dict) else None
                if not active:
                    return
                stage = str(getattr(self, "comment_stage_name", "") or "")
                if stage not in {"reply_editor_confirmed", "reply_editor_focus_retry", "reply_editor_post_focus_stabilizing", "reply_editor_stable", "reply_editor_ready_for_draft", "reply_draft_inject_probe", "reply_draft_reactivate_probe", "reply_draft_verified",
                        "manual_send_hold", "reply_editor_lost_hold"}:
                    return
                cfg = self._comment_reply_editor_alive_config()
                match = self._comment_find_reply_target_thread(result, active)
                composers = result.get("composers", {}) or {}
                reply_editors = composers.get("replyEditors", []) or []
                reply_editors_found = len(reply_editors) if isinstance(reply_editors, list) else 0
                editor_visible = bool(match and match.get("replyEditorVisible"))
                focus_ready = bool(editor_visible and self._comment_active_element_in_target_reply_editor(result))
                previous_visible = bool(getattr(self, "comment_reply_editor_alive_last_visible", False))
                previous_focus = bool(getattr(self, "comment_reply_editor_focus_confirmed", False))
                now_ms = self._now_ms()
                last_click_ms = int(getattr(self, "comment_reply_button_last_click_ms", 0) or 0)
                stable_since_ms = int(getattr(self, "comment_reply_editor_stable_since_ms", 0) or 0)
                visible_since_ms = int(getattr(self, "comment_reply_editor_alive_last_visible_ms", 0) or 0)
                stable_duration_ms = (now_ms - stable_since_ms) if stable_since_ms else 0
                visible_duration_ms = (now_ms - visible_since_ms) if visible_since_ms else 0
                last_click_delta_ms = (now_ms - last_click_ms) if last_click_ms else 0

                if editor_visible:
                    self._comment_record_reply_editor_visible(result, active, reason="active_probe_visible")
                    self.comment_reply_editor_alive_streak = int(getattr(self, "comment_reply_editor_alive_streak", 0) or 0) + 1
                    self.comment_reply_editor_lost_streak = 0
                    self.comment_reply_editor_focus_confirmed = bool(focus_ready)
                    self.comment_reply_editor_focus_lost_streak = 0 if focus_ready else int(getattr(self, "comment_reply_editor_focus_lost_streak", 0) or 0) + 1

                    should_log = (
                        now_ms - int(getattr(self, "comment_reply_editor_alive_last_log_ms", 0) or 0) >= cfg["probe_interval_ms"]
                        or previous_visible != editor_visible
                        or previous_focus != focus_ready
                    )
                    if should_log:
                        self.comment_reply_editor_alive_last_log_ms = now_ms
                        payload = {
                            "threadKey": str(active.get("threadKey", "") or ""),
                            "author": str(active.get("author", "") or ""),
                            "matched": bool(match),
                            "editorVisible": True,
                            "focusReady": focus_ready,
                            "replyEditorsFound": reply_editors_found,
                            "aliveStreak": int(getattr(self, "comment_reply_editor_alive_streak", 0) or 0),
                            "lostStreak": 0,
                            "focusLostStreak": int(getattr(self, "comment_reply_editor_focus_lost_streak", 0) or 0),
                            "requiredAliveStreak": cfg["required_streak"],
                            "maxLostStreak": cfg["max_lost_streak"],
                            "stage": stage,
                            "visibleDurationMs": visible_duration_ms,
                            "stableDurationMs": stable_duration_ms,
                            "lastClickDeltaMs": last_click_delta_ms,
                            "decision": "visible_inject_without_focus_wait",
                        }
                        if self._comment_verbose_logs_enabled():
                            self._log("INFO", f"{TRACE_REPLY_EDITOR} | reply_editor_alive_probe={json.dumps(payload, ensure_ascii=False)}")
                        self._comment_log_editor_diag_snapshot(
                            result,
                            reason=("alive_visible_focused" if focus_ready else "alive_visible_focus_missing_inject_without_wait"),
                            target=active,
                            level="INFO",
                            extra=payload,
                        )

                    if stage not in {"reply_editor_ready_for_draft", "reply_draft_inject_probe", "reply_draft_reactivate_probe", "reply_draft_verified", "manual_send_hold"}:
                        if hasattr(self, "_comment_set_flow_stage"):
                            self.comment_reply_editor_stable_since_ms = now_ms
                            self._comment_set_flow_stage("reply_editor_stable", result, reason="reply_editor_visible_inject_without_focus_wait")
                        if hasattr(self, "_comment_enter_ready_for_draft_from_stable"):
                            self._comment_enter_ready_for_draft_from_stable(active, reason="editor_visible_probe_immediate_inject")
                        self._schedule_fast_comment_inspect(1500)
                    return

                # Manual observation confirms reply editor should not disappear because of blur/idle.
                # Therefore a visible->missing transition is diagnostic-only and must not trigger a re-click.
                self.comment_reply_editor_alive_streak = 0
                self.comment_reply_editor_lost_streak = int(getattr(self, "comment_reply_editor_lost_streak", 0) or 0) + 1
                self.comment_reply_editor_focus_confirmed = False
                self.comment_reply_editor_alive_last_visible = False

                should_log = (
                    now_ms - int(getattr(self, "comment_reply_editor_alive_last_log_ms", 0) or 0) >= cfg["probe_interval_ms"]
                    or previous_visible != editor_visible
                    or int(getattr(self, "comment_reply_editor_lost_streak", 0) or 0) >= cfg["max_lost_streak"]
                )
                if should_log:
                    self.comment_reply_editor_alive_last_log_ms = now_ms
                    payload = {
                        "threadKey": str(active.get("threadKey", "") or ""),
                        "author": str(active.get("author", "") or ""),
                        "matched": bool(match),
                        "editorVisible": False,
                        "focusReady": False,
                        "replyEditorsFound": reply_editors_found,
                        "aliveStreak": 0,
                        "lostStreak": int(getattr(self, "comment_reply_editor_lost_streak", 0) or 0),
                        "focusLostStreak": int(getattr(self, "comment_reply_editor_focus_lost_streak", 0) or 0),
                        "requiredAliveStreak": cfg["required_streak"],
                        "maxLostStreak": cfg["max_lost_streak"],
                        "stage": stage,
                        "visibleDurationMs": visible_duration_ms,
                        "stableDurationMs": stable_duration_ms,
                        "lastClickDeltaMs": last_click_delta_ms,
                        "decision": "hold_no_reclick",
                    }
                    self._log("WARN", f"{TRACE_REPLY_EDITOR} | reply_editor_alive_probe={json.dumps(payload, ensure_ascii=False)}")
                    self._comment_log_editor_diag_snapshot(
                        result,
                        reason="alive_not_visible_no_reclick",
                        target=active,
                        level="WARN",
                        extra=payload,
                    )

                if int(getattr(self, "comment_reply_editor_lost_streak", 0) or 0) >= cfg["max_lost_streak"]:
                    lost_payload = {
                        "threadKey": str(active.get("threadKey", "") or ""),
                        "author": str(active.get("author", "") or ""),
                        "lostStreak": int(getattr(self, "comment_reply_editor_lost_streak", 0) or 0),
                        "replyEditorsFound": reply_editors_found,
                        "focusReady": False,
                        "stableDurationMs": stable_duration_ms,
                        "visibleDurationMs": visible_duration_ms,
                        "lastClickDeltaMs": last_click_delta_ms,
                        "decision": "lost_hold_without_reclick",
                    }
                    self._log("WARN", f"{TRACE_REPLY_EDITOR} | reply_editor_lost={json.dumps(lost_payload, ensure_ascii=False)}")
                    self._comment_log_editor_disappearance_diag(result, active, reason="reply_editor_lost_threshold_no_reclick", extra=lost_payload)
                    self._comment_fail_active_target_and_release(result, active, reason="reply_editor_missing_after_open")
                    return
                self._schedule_fast_comment_inspect(1600)


    def _comment_preopen_generation_enabled(self) -> bool:
                config = self.comment_runtime_config if isinstance(getattr(self, "comment_runtime_config", None), dict) else {}
                reply_cfg = config.get("reply", {}) if isinstance(config.get("reply"), dict) else {}
                return bool(reply_cfg.get("coze_pre_generate_before_open", True))

    def _comment_preopen_generation_timeout_ms(self) -> int:
                config = self.comment_runtime_config if isinstance(getattr(self, "comment_runtime_config", None), dict) else {}
                reply_cfg = config.get("reply", {}) if isinstance(config.get("reply"), dict) else {}
                return int(reply_cfg.get("coze_pre_generate_timeout_ms", 25000) or 25000)

    def _comment_preopen_target_identity(self, target: dict[str, Any] | None) -> str:
                return self._comment_reply_target_identity(target if isinstance(target, dict) else None)

    def _comment_preopen_target_matches(self, a: dict[str, Any] | None, b: dict[str, Any] | None) -> bool:
                if not isinstance(a, dict) or not isinstance(b, dict):
                    return False
                return bool(self._comment_preopen_target_identity(a) and self._comment_preopen_target_identity(a) == self._comment_preopen_target_identity(b))

    def _comment_preopen_fallback_payload(self, target: dict[str, Any], *, reason: str) -> dict[str, Any]:
                draft_text = self._comment_v50_probe_text() if hasattr(self, "_comment_v50_probe_text") else "感谢支持呀"
                return {
                    "text": draft_text,
                    "source": "fallback",
                    "model": "local",
                    "reason": reason,
                }

    def _comment_start_preopen_reply_generation(self, result: dict[str, Any], target: dict[str, Any]) -> None:
                if not self._comment_preopen_generation_enabled():
                    payload = self._comment_preopen_fallback_payload(target, reason="preopen_generation_disabled")
                    self._comment_set_preopen_ready_payload(result, target, payload, from_cache=False)
                    return
                if getattr(self, "comment_preopen_reply_future", None) is not None:
                    return
                signature = self._comment_target_signature(target, result=result) if hasattr(self, "_comment_target_signature") else self._comment_reply_target_identity(target)
                if self._comment_is_signature_completed(signature):
                    self._log("INFO", f"{TRACE_REPLY_EDITOR} | preopen_start_skipped_already_completed={json.dumps({'signature': signature, 'author': str((target or {}).get('author', '') or '')}, ensure_ascii=False)}")
                    return
                if self._comment_is_signature_inflight(signature):
                    self._log("INFO", f"{TRACE_REPLY_EDITOR} | preopen_start_skipped_already_inflight={json.dumps({'signature': signature, 'author': str((target or {}).get('author', '') or '')}, ensure_ascii=False)}")
                    return
                cache_key = self._build_comment_reply_cache_key(result, target) if hasattr(self, "_build_comment_reply_cache_key") else signature
                cached = self.comment_draft_cache.get(cache_key) if cache_key else None
                if isinstance(cached, dict) and str(cached.get("text", "") or "").strip():
                    self._comment_set_preopen_ready_payload(result, target, cached, from_cache=True)
                    return

                work_key = self._comment_current_work_key(result) if hasattr(self, "_comment_current_work_key") else ""
                context = self._build_comment_reply_context(result, target) if hasattr(self, "_build_comment_reply_context") else {"target": target}
                robot_name = getattr(self.account, "name", "") or getattr(self.account, "nickname", "") or ""
                now_ms = self._now_ms()
                preopen_target = {
                    "workKey": work_key,
                    "threadKey": str(target.get("threadKey", "") or ""),
                    "author": str(target.get("author", "") or ""),
                    "content": str(target.get("content", "") or ""),
                    "timeText": str(target.get("timeText", "") or ""),
                    "targetMessageKey": str(target.get("targetMessageKey", "") or ""),
                    "replyDomKey": str(target.get("replyDomKey", "") or ""),
                    "targetParentThreadKey": str(target.get("targetParentThreadKey", "") or ""),
                    "targetLevel": str(target.get("targetLevel", "") or ""),
                    "targetIndex": target.get("targetIndex", -1),
                    "replyNeedReason": str(target.get("replyNeedReason", "") or ""),
                    "signature": signature,
                    "cacheKey": cache_key,
                    "phase": "pre_generate",
                    "startedMs": now_ms,
                    "draftText": "",
                    "source": "coze_pending_preopen",
                    "model": "",
                    "reason": "generate_before_open_editor",
                    "epoch": self.comment_runtime_epoch,
                }
                self.comment_preopen_reply_target = preopen_target
                self.comment_preopen_reply_context = {
                    "target": dict(preopen_target),
                    "context": context,
                    "robotName": robot_name,
                    "cacheKey": cache_key,
                    "signature": signature,
                    "epoch": self.comment_runtime_epoch,
                }

                def _worker() -> dict[str, Any]:
                    backend_configured = self._comment_backend_enabled()
                    if backend_configured:
                        try:
                            backend_response = self._comment_call_backend_test_reply(result, target, context)
                            if backend_response:
                                return self._comment_backend_payload_to_preopen(
                                    backend_response,
                                    {
                                        "text": "",
                                        "source": "backend_empty",
                                        "model": "",
                                        "reason": "backend_returned_empty",
                                        "shouldReply": False,
                                        "skipReply": True,
                                        "skipReason": "后端自动回复接口未返回有效回复，已跳过，避免走旧本地工作流。",
                                        "commentType": "backend_empty",
                                        "intentLevel": "none",
                                        "judgeReason": "后端自动回复接口未返回有效回复，已跳过，避免走旧本地工作流。",
                                        "replyStatus": "not_required",
                                    },
                                )
                            return {
                                "text": "",
                                "source": "backend_empty",
                                "model": "",
                                "reason": "backend_empty_skip_no_local_fallback",
                                "shouldReply": False,
                                "skipReply": True,
                                "skipReason": "后端自动回复接口返回为空，已跳过，避免走旧本地工作流。",
                                "commentType": "backend_empty",
                                "intentLevel": "none",
                                "judgeReason": "后端自动回复接口返回为空，已跳过，避免走旧本地工作流。",
                                "replyStatus": "not_required",
                            }
                        except Exception as exc:
                            reason = f"后端自动回复接口调用失败，已跳过当前评论，避免走旧本地工作流：{type(exc).__name__}: {str(exc)[:120]}"
                            self._log("WARN", reason)
                            return {
                                "text": "",
                                "source": "backend_error",
                                "model": "",
                                "reason": reason,
                                "shouldReply": False,
                                "skipReply": True,
                                "skipReason": reason,
                                "commentType": "backend_error",
                                "intentLevel": "none",
                                "judgeReason": reason,
                                "replyStatus": "not_required",
                            }

                    try:
                        decision = self.comment_reply_engine.build_reply(context, robot_name=robot_name)
                        return {
                            "text": str(decision.text or "").strip(),
                            "source": str(decision.source or ""),
                            "model": str(decision.model or ""),
                            "reason": str(decision.reason or ""),
                        }
                    except Exception as exc:
                        return self._comment_preopen_fallback_payload(target, reason=f"local_engine_failed:{type(exc).__name__}")

                self._comment_mark_inflight_signature(signature, target, reason="preopen_backend_decision_start")
                self.comment_preopen_reply_future = self.comment_reply_executor.submit(_worker)
                self._log(
                    "INFO",
                    f"评论页生成草稿开始: {json.dumps({'level': preopen_target.get('targetLevel', '') or preopen_target.get('level', ''), 'author': preopen_target.get('author', ''), 'content': str(preopen_target.get('content', '') or '')[:80]}, ensure_ascii=False)}",
                )
                if hasattr(self, "_comment_enter_critical_quiet"):
                    self._comment_enter_critical_quiet("coze_pre_generate_wait_hard_isolation", 3200, target=preopen_target)

    def _comment_set_preopen_ready_payload(self, result: dict[str, Any], target: dict[str, Any], payload: dict[str, Any], *, from_cache: bool) -> None:
                text = re.sub(r"\s+", " ", str((payload or {}).get("text", "") or "")).strip()
                if isinstance(payload, dict) and payload.get("alreadyProcessed"):
                    self._comment_complete_existing_processed_target(result, target, payload.get("existingRecord") if isinstance(payload.get("existingRecord"), dict) else {})
                    return
                if not text:
                    if isinstance(payload, dict) and (payload.get("shouldReply") is False or bool(payload.get("skipReply")) or str(payload.get("replyStatus", "") or "") == "not_required"):
                        self._comment_complete_skipped_target(result, target, payload)
                        return
                    payload = self._comment_preopen_fallback_payload(target, reason="preopen_empty_fallback")
                    text = re.sub(r"\s+", " ", str(payload.get("text", "") or "")).strip()
                signature = self._comment_target_signature(target, result=result) if hasattr(self, "_comment_target_signature") else self._comment_reply_target_identity(target)
                if self._comment_is_signature_completed(signature):
                    self._comment_release_inflight_signature(signature, reason="ready_payload_already_completed")
                    self.comment_preopen_reply_target = None
                    self.comment_preopen_reply_context = None
                    self.comment_preopen_reply_future = None
                    self._log("INFO", f"{TRACE_REPLY_EDITOR} | preopen_ready_payload_discarded_already_completed={json.dumps({'signature': signature, 'author': str((target or {}).get('author', '') or '')}, ensure_ascii=False)}")
                    return
                cache_key = self._build_comment_reply_cache_key(result, target) if hasattr(self, "_build_comment_reply_cache_key") else signature
                work_key = self._comment_current_work_key(result) if hasattr(self, "_comment_current_work_key") else ""
                ready = {
                    "workKey": work_key,
                    "threadKey": str(target.get("threadKey", "") or ""),
                    "author": str(target.get("author", "") or ""),
                    "content": str(target.get("content", "") or ""),
                    "timeText": str(target.get("timeText", "") or ""),
                    "targetMessageKey": str(target.get("targetMessageKey", "") or ""),
                    "replyDomKey": str(target.get("replyDomKey", "") or ""),
                    "targetParentThreadKey": str(target.get("targetParentThreadKey", "") or ""),
                    "targetLevel": str(target.get("targetLevel", "") or ""),
                    "targetIndex": target.get("targetIndex", -1),
                    "signature": signature,
                    "cacheKey": cache_key,
                    "phase": "pre_generate_ready",
                    "startedMs": int((getattr(self, "comment_preopen_reply_target", {}) or {}).get("startedMs", 0) or self._now_ms()) if isinstance(getattr(self, "comment_preopen_reply_target", None), dict) else self._now_ms(),
                    "readyMs": self._now_ms(),
                    "draftText": text,
                    "source": str((payload or {}).get("source", "") or ("cache" if from_cache else "coze_workflow")),
                    "model": str((payload or {}).get("model", "") or ""),
                    "reason": str((payload or {}).get("reason", "") or ("cache_hit" if from_cache else "coze_generated")),
                    "epoch": self.comment_runtime_epoch,
                }
                self.comment_preopen_reply_target = ready
                self.comment_preopen_reply_context = None
                self.comment_preopen_reply_future = None
                if cache_key:
                    self.comment_draft_cache[cache_key] = {
                        "text": text,
                        "source": ready["source"],
                        "model": ready["model"],
                        "reason": ready["reason"],
                    }
                self._log(
                    "INFO",
                    f"评论页生成草稿完成: {json.dumps({'author': ready.get('author', ''), 'draft': text[:80], 'source': ready.get('source', ''), 'fromCache': from_cache}, ensure_ascii=False)}",
                )
                if hasattr(self, "_comment_enter_critical_quiet"):
                    self._comment_enter_critical_quiet("coze_ready_before_reply_click_hard_isolation", 1600, target=ready)

    def _comment_collect_preopen_reply_generation(self, result: dict[str, Any]) -> bool:
                future = getattr(self, "comment_preopen_reply_future", None)
                target = getattr(self, "comment_preopen_reply_target", None)
                if future is None or not isinstance(target, dict):
                    return False
                if target.get("epoch") != self.comment_runtime_epoch:
                    self.comment_preopen_reply_future = None
                    self.comment_preopen_reply_target = None
                    self.comment_preopen_reply_context = None
                    self._comment_release_inflight_for_target(target, result=result, reason="epoch_changed")
                    return True
                elapsed_ms = self._now_ms() - int(target.get("startedMs", 0) or self._now_ms())
                if not future.done():
                    if elapsed_ms >= self._comment_preopen_generation_timeout_ms():
                        if self._comment_backend_enabled():
                            reason = "后端自动回复接口超时，已跳过当前评论，避免重复或回退旧本地工作流。"
                            self._log(
                                "WARN",
                                f"{TRACE_REPLY_EDITOR} | backend_pre_generate_timeout_skip={json.dumps({'threadKey': target.get('threadKey', ''), 'author': target.get('author', ''), 'elapsedMs': elapsed_ms, 'decision': 'skip_no_local_fallback'}, ensure_ascii=False)}",
                            )
                            self._comment_complete_skipped_target(result, target, {"shouldReply": False, "skipReply": True, "skipReason": reason, "judgeReason": reason, "replyStatus": "not_required", "commentType": "backend_timeout", "intentLevel": "none"})
                            return True
                        self._log(
                            "WARN",
                            f"{TRACE_REPLY_EDITOR} | coze_pre_generate_timeout={json.dumps({'threadKey': target.get('threadKey', ''), 'author': target.get('author', ''), 'elapsedMs': elapsed_ms, 'decision': 'fallback_then_click_reply'}, ensure_ascii=False)}",
                        )
                        self._comment_set_preopen_ready_payload(result, target, self._comment_preopen_fallback_payload(target, reason="preopen_generation_timeout_fallback"), from_cache=False)
                        return True
                    else:
                        if hasattr(self, "_comment_enter_critical_quiet"):
                            self._comment_enter_critical_quiet("coze_pre_generate_wait_hard_isolation", 3200, target=target)
                    return False
                try:
                    payload = future.result()
                except Exception as exc:
                    if self._comment_backend_enabled():
                        reason = f"后端自动回复接口异步结果异常，已跳过当前评论，避免回退旧本地工作流：{type(exc).__name__}: {str(exc)[:120]}"
                        self._log(
                            "WARN",
                            f"{TRACE_REPLY_EDITOR} | backend_pre_generate_failed_skip={json.dumps({'threadKey': target.get('threadKey', ''), 'author': target.get('author', ''), 'error': type(exc).__name__, 'message': str(exc)[:160], 'decision': 'skip_no_local_fallback'}, ensure_ascii=False)}",
                        )
                        payload = {"shouldReply": False, "skipReply": True, "skipReason": reason, "judgeReason": reason, "replyStatus": "not_required", "commentType": "backend_exception", "intentLevel": "none"}
                    else:
                        self._log(
                            "WARN",
                            f"{TRACE_REPLY_EDITOR} | coze_pre_generate_failed={json.dumps({'threadKey': target.get('threadKey', ''), 'author': target.get('author', ''), 'error': type(exc).__name__, 'message': str(exc)[:160], 'decision': 'fallback_then_click_reply'}, ensure_ascii=False)}",
                        )
                        payload = self._comment_preopen_fallback_payload(target, reason="preopen_generation_exception_fallback")
                if isinstance(payload, dict) and payload.get("alreadyProcessed"):
                    self._comment_complete_existing_processed_target(result, target, payload.get("existingRecord") if isinstance(payload.get("existingRecord"), dict) else {})
                    return True
                if isinstance(payload, dict) and (payload.get("shouldReply") is False or bool(payload.get("skipReply")) or str(payload.get("replyStatus", "") or "") == "not_required"):
                    self._comment_complete_skipped_target(result, target, payload)
                    return True
                self._comment_set_preopen_ready_payload(result, target, payload if isinstance(payload, dict) else {}, from_cache=False)
                return True

    def _comment_open_ready_preopen_reply_editor(self, result: dict[str, Any]) -> bool:
                ready = getattr(self, "comment_preopen_reply_target", None)
                if not isinstance(ready, dict) or ready.get("phase") != "pre_generate_ready":
                    return False
                # D10: once the same target has entered editor-opening confirmation,
                # the pre-generated ready payload must not start a fresh open attempt.
                # Re-opening here reset the method ladder every ~4.5s and repeatedly
                # clicked the same toggle-style reply action before confirmation ran.
                pending_open = getattr(self, "comment_pending_reply_target", None)
                if isinstance(pending_open, dict) and pending_open:
                    if self._comment_verbose_logs_enabled():
                        self._log(
                            "INFO",
                            f"{TRACE_REPLY_EDITOR} | preopen_ready_hold_existing_open_transaction="
                            f"{json.dumps({'threadKey': str(pending_open.get('threadKey', '') or ''), 'author': str(pending_open.get('author', '') or ''), 'attemptNo': int(pending_open.get('attemptNo', 0) or 0), 'method': str(pending_open.get('openMethod', '') or '')}, ensure_ascii=False)}",
                        )
                    return True
                if not self._comment_filter_ready(result):
                    return True
                ready_signature = self._comment_normalize_text(ready.get("signature", ""), limit=360)
                if ready_signature and ready_signature in set(getattr(self, "comment_completed_thread_keys", set()) or set()):
                    self._log("INFO", f"{TRACE_REPLY_EDITOR} | preopen_ready_skipped_already_completed={json.dumps({'threadKey': ready.get('threadKey', ''), 'author': ready.get('author', ''), 'signature': ready_signature}, ensure_ascii=False)}")
                    self.comment_preopen_reply_target = None
                    self.comment_preopen_reply_context = None
                    self.comment_preopen_reply_future = None
                    self._comment_release_inflight_signature(ready_signature, reason="ready_skip_already_completed")
                    return False
                cooldowns = getattr(self, "comment_reply_open_cooldowns", None)
                ready_thread_key = self._comment_normalize_text(ready.get("threadKey", ""), limit=260)
                ready_cooldown_key = self._comment_reply_open_cooldown_key(ready)
                if ready_cooldown_key and isinstance(cooldowns, dict):
                    until_ms = int(cooldowns.get(ready_cooldown_key, 0) or 0)
                    now_ms = self._now_ms()
                    if until_ms and now_ms < until_ms:
                        self._log("WARN", f"{TRACE_REPLY_EDITOR} | preopen_ready_skipped_open_cooling={json.dumps({'threadKey': ready_thread_key, 'author': ready.get('author', ''), 'remainingMs': max(0, until_ms - now_ms)}, ensure_ascii=False)}")
                        self.comment_preopen_reply_target = None
                        self.comment_preopen_reply_context = None
                        self.comment_preopen_reply_future = None
                        self._comment_release_inflight_signature(ready_signature, reason="ready_skip_open_cooling")
                        return False
                target = {
                    "threadKey": str(ready.get("threadKey", "") or ""),
                    "author": str(ready.get("author", "") or ""),
                    "content": str(ready.get("content", "") or ""),
                    "timeText": str(ready.get("timeText", "") or ""),
                    # V71: keep message-level identity after Coze pre-generation.
                    # Dropping these fields downgraded nested follow-up targets back to
                    # the parent thread, so dry-run completion could not skip the exact
                    # nested message and the same folded-thread target was selected again.
                    "targetMessageKey": str(ready.get("targetMessageKey", "") or ""),
                    "replyDomKey": str(ready.get("replyDomKey", "") or ""),
                    "targetParentThreadKey": str(ready.get("targetParentThreadKey", "") or ready.get("threadKey", "") or ""),
                    "targetLevel": str(ready.get("targetLevel", "") or ""),
                    "targetIndex": ready.get("targetIndex", -1),
                    "replyNeedReason": str(ready.get("replyNeedReason", "") or ""),
                    "signature": str(ready.get("signature", "") or ""),
                }
                match = self._comment_find_reply_target_thread(result, target)
                if not match:
                    now_ms = self._now_ms()
                    if now_ms - int(getattr(self, "comment_preopen_missing_target_last_log_ms", 0) or 0) >= 1200:
                        self.comment_preopen_missing_target_last_log_ms = now_ms
                        self._log("WARN", f"{TRACE_REPLY_EDITOR} | coze_pre_generate_target_missing={json.dumps({'threadKey': target.get('threadKey', ''), 'author': target.get('author', ''), 'decision': 'hold_no_click', 'candidateCount': self._comment_candidate_count(result) if hasattr(self, '_comment_candidate_count') else 0}, ensure_ascii=False)}")
                    return True
                if match.get("replyEditorVisible"):
                    self.comment_active_reply_target = target
                    self._comment_record_reply_editor_visible(result, target, reason="preopen_target_editor_already_visible")
                    if hasattr(self, "_comment_set_flow_stage"):
                        self._comment_set_flow_stage("reply_editor_confirmed", result, reason="preopen_target_editor_already_visible")
                    if hasattr(self, "_comment_enter_ready_for_draft_from_stable"):
                        self._comment_enter_ready_for_draft_from_stable(target, reason="editor_visible_immediate_inject_preopen_already_visible")
                    self._schedule_fast_comment_inspect(1500)
                    return True
                suppress, _payload = self._comment_should_suppress_reply_button_click(target, result=result, reason="preopen_ready_recent_same_target_click")
                if suppress:
                    self._schedule_fast_comment_inspect(1600)
                    return True
                now_ms = self._now_ms()
                if now_ms - self.comment_last_reply_open_attempt_ms < 4500:
                    self._log("INFO", f"{TRACE_REPLY_EDITOR} | reply_decision=cooldown_after_pre_generate | elapsedMs={now_ms - self.comment_last_reply_open_attempt_ms} | threadKey={target.get('threadKey', '')}")
                    self._schedule_fast_comment_inspect(1600)
                    return True
                self.comment_last_reply_open_attempt_ms = now_ms
                attempt_no = self._comment_next_reply_open_attempt_no(target)
                self.comment_active_reply_target = None
                self.comment_pending_reply_target = {
                    "threadKey": target["threadKey"],
                    "author": target["author"],
                    "content": target["content"],
                    "timeText": target["timeText"],
                    "targetMessageKey": str(target.get("targetMessageKey", "") or ""),
                    "replyDomKey": str(target.get("replyDomKey", "") or ""),
                    "targetParentThreadKey": str(target.get("targetParentThreadKey", "") or target.get("threadKey", "") or ""),
                    "targetLevel": str(target.get("targetLevel", "") or ""),
                    "targetIndex": target.get("targetIndex", -1),
                    "replyNeedReason": str(target.get("replyNeedReason", "") or ""),
                    "signature": self._comment_target_signature(target, result=result) if hasattr(self, "_comment_target_signature") else self._comment_reply_target_identity(target),
                    "attemptMs": now_ms,
                    "attemptNo": attempt_no,
                    "currentWorkTitle": str((result.get("header", {}) or {}).get("currentWorkTitle", "") or ""),
                    "preopenDraftText": str(ready.get("draftText", "") or ""),
                    "preopenSource": str(ready.get("source", "") or ""),
                    "preopenReason": str(ready.get("reason", "") or ""),
                    "openStartedMs": now_ms,
                    "openMethodIndex": 0,
                    "openMethod": self._comment_reply_open_methods(str(ready.get("targetLevel", "") or ""))[0],
                    "openMethodStartedMs": now_ms,
                    "openRetryNo": 0,
                }
                if hasattr(self, "_comment_set_flow_stage"):
                    self._comment_set_flow_stage("reply_candidate_selected", result, reason="coze_pre_generate_ready")
                    self._comment_set_flow_stage("reply_editor_opening", result, reason="reply_button_click_started_after_coze_ready")
                if self._comment_verbose_logs_enabled():
                    self._log(
                        "INFO",
                        f"{TRACE_REPLY_EDITOR} | reply_decision=open_editor_after_coze_ready | mode=方案A_pre_generate_then_click | currentWorkTitle={str((result.get('header', {}) or {}).get('currentWorkTitle', '') or '')} | currentFilter={self._comment_filter_text(result)} | targetFilter={self.comment_target_filter_text} | targetThreadKey={target.get('threadKey', '')} | draftPreview={str(ready.get('draftText', '') or '')[:80]}",
                    )
                self._comment_note_reply_button_click(self.comment_pending_reply_target, reason="open_after_coze_pre_generate_ready", result=result)
                self._log("INFO", f"评论页准备打开回复编辑器: {json.dumps({'level': self.comment_pending_reply_target.get('targetLevel', ''), 'author': self.comment_pending_reply_target.get('author', ''), 'content': str(self.comment_pending_reply_target.get('content', '') or '')[:80]}, ensure_ascii=False)}")
                self.busy = True
                self._comment_run_open_reply_editor_script(self.comment_pending_reply_target, method=str(self.comment_pending_reply_target.get("openMethod", "dom_click_current") or "dom_click_current"))
                return True

    def _comment_waiting_preopen_generation(self) -> bool:
                target = getattr(self, "comment_preopen_reply_target", None)
                future = getattr(self, "comment_preopen_reply_future", None)
                return bool(future is not None or (isinstance(target, dict) and target.get("phase") == "pre_generate"))

    def _maybe_open_comment_reply_editor(self, result: dict[str, Any]) -> None:
                now_ms = self._now_ms()
                if now_ms - int(getattr(self, "comment_trace_reply_decision_last_ms", 0) or 0) >= 10000:
                    self.comment_trace_reply_decision_last_ms = now_ms
                    if self._comment_verbose_logs_enabled():
                        self._log("INFO", f"{TRACE_REPLY_EDITOR} | entry=_maybe_open_comment_reply_editor | currentWorkTitle={str((result.get('header', {}) or {}).get('currentWorkTitle', '') or '')} | currentFilter={self._comment_filter_text(result)} | candidateCount={self._comment_candidate_count(result)} | pendingSwitch={self.comment_pending_switch_target is not None} | pendingFilter={self.comment_pending_filter_target is not None} | pendingReply={self.comment_pending_reply_target is not None} | pendingDraft={self.comment_pending_draft_probe_target is not None}")
                if not self.running or not self.ready or self.current_module != "comment" or not self.page:
                    return
                candidates = result.get("replyCandidates")
                if not isinstance(candidates, list):
                    candidates, _ = self._comment_build_reply_candidates(result)
                has_candidates = bool(candidates)
                if self._comment_preopen_generation_enabled():
                    before_future = getattr(self, "comment_preopen_reply_future", None)
                    consumed_preopen = self._comment_collect_preopen_reply_generation(result)
                    after_ready = getattr(self, "comment_preopen_reply_target", None)
                    if consumed_preopen and not (isinstance(after_ready, dict) and after_ready.get("phase") == "pre_generate_ready"):
                        self._schedule_fast_comment_inspect(350)
                        return
                    if self._comment_open_ready_preopen_reply_editor(result):
                        return
                    if before_future is not None and getattr(self, "comment_preopen_reply_future", None) is None and not (isinstance(getattr(self, "comment_preopen_reply_target", None), dict) and getattr(self, "comment_preopen_reply_target", {}).get("phase") == "pre_generate_ready"):
                        self._schedule_fast_comment_inspect(350)
                        return
                    if self._comment_waiting_preopen_generation():
                        pending_preopen = getattr(self, "comment_preopen_reply_target", {}) or {}
                        now_ms = self._now_ms()
                        if now_ms - int(getattr(self, "comment_preopen_wait_last_log_ms", 0) or 0) >= 6000:
                            self.comment_preopen_wait_last_log_ms = now_ms
                            if self._comment_verbose_logs_enabled() or now_ms - int(getattr(self, "comment_wait_coze_last_log_ms", 0) or 0) >= 8000:
                                self.comment_wait_coze_last_log_ms = now_ms
                                self._log("INFO", f"{TRACE_REPLY_EDITOR} | reply_decision=wait_coze_pre_generate_before_click | threadKey={str(pending_preopen.get('threadKey', '') or '')} | author={str(pending_preopen.get('author', '') or '')} | elapsedMs={now_ms - int(pending_preopen.get('startedMs', 0) or now_ms)} | candidateCount={len(candidates) if isinstance(candidates, list) else 0}")
                        return
                block_reason = ""
                if self.comment_pending_switch_target is not None:
                    block_reason = "pending_work_switch"
                elif self.comment_pending_filter_target is not None:
                    block_reason = "pending_filter_switch"
                elif self.comment_pending_reply_target is not None:
                    block_reason = "pending_reply_editor_confirm"
                elif self.comment_pending_draft_probe_target is not None:
                    block_reason = "pending_draft_stage"
                if block_reason:
                    if self._comment_verbose_logs_enabled():
                        self._log("INFO", f"{TRACE_REPLY_EDITOR} | reply_decision=blocked | reason={block_reason} | currentWorkTitle={str((result.get('header', {}) or {}).get('currentWorkTitle', '') or '')} | currentFilter={self._comment_filter_text(result)} | candidateCount={len(candidates) if isinstance(candidates, list) else 0}")
                        self._comment_log_reply_block_decision(result, decision="blocked", reason=block_reason)
                    now_ms = self._now_ms()
                    if has_candidates and now_ms - int(getattr(self, "comment_last_reply_block_log_ms", 0) or 0) >= 1500:
                        self.comment_last_reply_block_log_ms = now_ms
                        self._log(
                            "INFO",
                            f"评论页候选已出现但暂不打开回复编辑器: {json.dumps({'reason': block_reason, 'candidateCount': len(candidates), 'currentWorkTitle': str((result.get('header', {}) or {}).get('currentWorkTitle', '') or ''), 'currentFilterText': self._comment_filter_text(result)}, ensure_ascii=False)}",
                        )
                    return
                if self._comment_work_completed(result):
                    if self._comment_verbose_logs_enabled():
                        now_ms = self._now_ms()
                        if now_ms - int(getattr(self, "comment_skip_completed_work_last_log_ms", 0) or 0) >= 60000:
                            self.comment_skip_completed_work_last_log_ms = now_ms
                            self._log("INFO", f"{TRACE_REPLY_EDITOR} | reply_decision=skip_completed_work | currentWorkTitle={str((result.get('header', {}) or {}).get('currentWorkTitle', '') or '')}")
                            self._comment_log_reply_block_decision(result, decision="skip_completed_work", reason="work_completed")
                    return
                filter_ready = self._comment_filter_ready(result)
                if not filter_ready:
                    decision = "no_candidates_and_wrong_filter"
                    if has_candidates:
                        decision = "waiting_for_target_filter"
                    self._log("INFO", f"{TRACE_REPLY_EDITOR} | reply_decision={decision} | currentWorkTitle={str((result.get('header', {}) or {}).get('currentWorkTitle', '') or '')} | currentFilter={self._comment_filter_text(result)} | targetFilter={self.comment_target_filter_text} | candidateCount={len(candidates) if isinstance(candidates, list) else 0}")
                    self._comment_log_reply_block_decision(result, decision=decision, reason="filter_not_ready")
                    return
                stage = str(getattr(self, "comment_stage_name", "") or "")
                if isinstance(getattr(self, "comment_active_reply_target", None), dict) and self.comment_active_reply_target:
                    decision = "editor_already_stable" if stage == "reply_editor_stable" else "hold_after_editor_open"
                    self._log("INFO", f"{TRACE_REPLY_EDITOR} | reply_decision={decision} | currentWorkTitle={str((result.get('header', {}) or {}).get('currentWorkTitle', '') or '')} | currentFilter={self._comment_filter_text(result)} | stage={stage} | candidateCount={len(candidates) if isinstance(candidates, list) else 0} | aliveStreak={int(getattr(self, 'comment_reply_editor_alive_streak', 0) or 0)} | lostStreak={int(getattr(self, 'comment_reply_editor_lost_streak', 0) or 0)}")
                    self._comment_log_reply_block_decision(result, decision=decision, reason="active_reply_target_present")
                    return
                if hasattr(self, "_comment_is_scan_stage_ready") and not self._comment_is_scan_stage_ready(result):
                    decision = "await_filtered_list_stable" if stage in {"", "ensure_unreplied_filter", "await_filtered_list_stable"} else f"waiting_stage_{stage}"
                    self._log("INFO", f"{TRACE_REPLY_EDITOR} | reply_decision={decision} | currentWorkTitle={str((result.get('header', {}) or {}).get('currentWorkTitle', '') or '')} | currentFilter={self._comment_filter_text(result)} | stage={stage} | candidateCount={len(candidates) if isinstance(candidates, list) else 0}")
                    self._comment_log_reply_block_decision(result, decision=decision, reason="scan_stage_not_ready")
                    return
                work_drawer = result.get("workDrawer", {}) or {}
                if work_drawer.get("found"):
                    self._log("INFO", f"{TRACE_REPLY_EDITOR} | reply_decision=drawer_open | currentWorkTitle={str((result.get('header', {}) or {}).get('currentWorkTitle', '') or '')}")
                    self._comment_log_reply_block_decision(result, decision="drawer_open", reason="work_drawer_visible")
                    return
                composers = result.get("composers", {}) or {}
                if composers.get("replyEditors"):
                    visible_thread = next((item for item in (result.get("topComments", []) or []) if isinstance(item, dict) and item.get("replyEditorVisible")), None)
                    if isinstance(visible_thread, dict):
                        target_message = self._comment_effective_reply_target_message(visible_thread) if hasattr(self, "_comment_effective_reply_target_message") else {}
                        self.comment_active_reply_target = {
                            "threadKey": str(visible_thread.get("threadKey", "") or ""),
                            "author": str((target_message or {}).get("author", "") or visible_thread.get("author", "") or ""),
                            "content": str((target_message or {}).get("content", "") or visible_thread.get("content", "") or ""),
                            "timeText": str((target_message or {}).get("timeText", "") or visible_thread.get("timeText", "") or ""),
                            "targetMessageKey": str((target_message or {}).get("messageKey", "") or visible_thread.get("targetMessageKey", "") or ""),
                            "targetParentThreadKey": str((target_message or {}).get("parentThreadKey", "") or visible_thread.get("threadKey", "") or ""),
                            "targetLevel": str((target_message or {}).get("level", "") or visible_thread.get("targetLevel", "") or ""),
                            "targetIndex": (target_message or {}).get("index", visible_thread.get("targetIndex", -1)),
                            "replyNeedReason": str(visible_thread.get("replyNeedReason", "") or ""),
                        }
                        self.comment_reply_editor_alive_streak = max(1, int(getattr(self, "comment_reply_editor_alive_streak", 0) or 0))
                        self.comment_reply_editor_lost_streak = 0
                        self._comment_record_reply_editor_visible(result, self.comment_active_reply_target, reason="reply_editor_visible_recovered")
                        if hasattr(self, "_comment_set_flow_stage"):
                            self._comment_set_flow_stage("reply_editor_confirmed", result, reason="reply_editor_visible_recovered")
                        self._log("INFO", f"{TRACE_REPLY_EDITOR} | reply_decision=editor_visible_recovered | currentWorkTitle={str((result.get('header', {}) or {}).get('currentWorkTitle', '') or '')} | threadKey={self.comment_active_reply_target['threadKey']} | decision=inject_immediately_without_focus_wait")
                        if hasattr(self, "_comment_enter_ready_for_draft_from_stable"):
                            self._comment_enter_ready_for_draft_from_stable(self.comment_active_reply_target, reason="editor_visible_recovered_immediate_inject")
                        self._schedule_fast_comment_inspect(1500)
                    else:
                        self._log("INFO", f"{TRACE_REPLY_EDITOR} | reply_decision=editor_visible_unmatched | currentWorkTitle={str((result.get('header', {}) or {}).get('currentWorkTitle', '') or '')} | replyEditorsFound={len(composers.get('replyEditors') or [])}")
                    return
                if not candidates:
                    if self._comment_verbose_logs_enabled():
                        self._log("INFO", f"{TRACE_REPLY_EDITOR} | reply_decision=no_candidates | currentWorkTitle={str((result.get('header', {}) or {}).get('currentWorkTitle', '') or '')} | currentFilter={self._comment_filter_text(result)}")
                        self._comment_log_reply_block_decision(result, decision="no_candidates", reason="candidate_count_zero")
                    return
                target = candidates[0] or {}
                if not isinstance(target, dict):
                    return
                now_ms = self._now_ms()
                suppress, _suppress_payload = self._comment_should_suppress_reply_button_click(target, result=result, reason="normal_open_recent_same_target_click")
                if suppress:
                    self._schedule_fast_comment_inspect(1600)
                    return
                if now_ms - self.comment_last_reply_open_attempt_ms < 4500:
                    elapsed = now_ms - self.comment_last_reply_open_attempt_ms
                    self._log("INFO", f"{TRACE_REPLY_EDITOR} | reply_decision=cooldown | currentWorkTitle={str((result.get('header', {}) or {}).get('currentWorkTitle', '') or '')} | elapsedMs={elapsed}")
                    self._comment_log_reply_block_decision(result, decision="cooldown", reason="reply_open_cooldown", extra={"elapsedMs": elapsed})
                    return
                selected_payload = {
                    "threadKey": str(target.get("threadKey", "") or ""),
                    "author": str(target.get("author", "") or ""),
                    "content": str(target.get("content", "") or ""),
                    "timeText": str(target.get("timeText", "") or ""),
                    "targetMessageKey": str(target.get("targetMessageKey", "") or ""),
                    "targetParentThreadKey": str(target.get("targetParentThreadKey", "") or ""),
                    "targetLevel": str(target.get("targetLevel", "") or ""),
                    "targetIndex": target.get("targetIndex", -1),
                    "replyNeedReason": str(target.get("replyNeedReason", "") or ""),
                    "candidateCount": len(candidates),
                    "currentWorkTitle": str((result.get("header", {}) or {}).get("currentWorkTitle", "") or ""),
                }
                self._log("INFO", f"评论页选中回复目标: {json.dumps({'level': selected_payload.get('targetLevel', ''), 'author': selected_payload.get('author', ''), 'content': selected_payload.get('content', '')[:80], 'reason': selected_payload.get('replyNeedReason', ''), 'candidateCount': selected_payload.get('candidateCount', 0)}, ensure_ascii=False)}")
                if self._comment_preopen_generation_enabled():
                    self._log("INFO", f"{TRACE_REPLY_EDITOR} | reply_decision=pre_generate_before_open | mode=方案A_pre_generate_then_click | currentWorkTitle={selected_payload['currentWorkTitle']} | currentFilter={self._comment_filter_text(result)} | targetFilter={self.comment_target_filter_text} | candidateCount={len(candidates)} | targetThreadKey={selected_payload['threadKey']} ")
                    self._comment_start_preopen_reply_generation(result, target)
                    self._schedule_fast_comment_inspect(2400)
                    return
                if hasattr(self, "_comment_set_flow_stage"):
                    self._comment_set_flow_stage("reply_candidate_selected", result, reason="candidate_selected")
                self._log("INFO", f"{TRACE_REPLY_EDITOR} | reply_decision=open_editor | mode=normal_filter_first | currentWorkTitle={selected_payload['currentWorkTitle']} | currentFilter={self._comment_filter_text(result)} | targetFilter={self.comment_target_filter_text} | candidateCount={len(candidates)} | targetThreadKey={selected_payload['threadKey']} ")
                self.comment_last_reply_open_attempt_ms = now_ms
                attempt_no = self._comment_next_reply_open_attempt_no(target)
                self.comment_active_reply_target = None
                self.comment_pending_reply_target = {
                    "threadKey": str(target.get("threadKey", "") or ""),
                    "author": str(target.get("author", "") or ""),
                    "content": str(target.get("content", "") or ""),
                    "timeText": str(target.get("timeText", "") or ""),
                    "targetMessageKey": str(target.get("targetMessageKey", "") or ""),
                    "replyDomKey": str(target.get("replyDomKey", "") or ""),
                    "targetParentThreadKey": str(target.get("targetParentThreadKey", "") or target.get("threadKey", "") or ""),
                    "targetLevel": str(target.get("targetLevel", "") or ""),
                    "targetIndex": target.get("targetIndex", -1),
                    "replyNeedReason": str(target.get("replyNeedReason", "") or ""),
                    "signature": self._comment_target_signature(target, result=result) if hasattr(self, "_comment_target_signature") else self._comment_reply_target_identity(target),
                    "attemptMs": now_ms,
                    "attemptNo": attempt_no,
                    "currentWorkTitle": str((result.get("header", {}) or {}).get("currentWorkTitle", "") or ""),
                    "openStartedMs": now_ms,
                    "openMethodIndex": 0,
                    "openMethod": self._comment_reply_open_methods(str(target.get("targetLevel", "") or ""))[0],
                    "openMethodStartedMs": now_ms,
                    "openRetryNo": 0,
                }
                self.busy = True
                if hasattr(self, "_comment_set_flow_stage"):
                    self._comment_set_flow_stage("reply_editor_opening", result, reason="reply_button_click_started")
                self._comment_note_reply_button_click(self.comment_pending_reply_target, reason="normal_open_reply_button_click", result=result)
                self._log("INFO", f"评论页准备打开回复编辑器: {json.dumps({'level': self.comment_pending_reply_target.get('targetLevel', ''), 'author': self.comment_pending_reply_target.get('author', ''), 'content': str(self.comment_pending_reply_target.get('content', '') or '')[:80]}, ensure_ascii=False)}")
                self._comment_run_open_reply_editor_script(self.comment_pending_reply_target, method=str(self.comment_pending_reply_target.get("openMethod", "dom_click_current") or "dom_click_current"))

    def _comment_run_open_reply_editor_script(self, target: dict[str, Any], *, method: str) -> None:
                # V24：首次真实点击前先单独清理筛选下拉/焦点残留，下一拍再点击回复按钮。
                # V26：脚本生成/执行入口加保护，避免单条评论因脚本异常长期卡住 pending。
                try:
                    if isinstance(target, dict) and not bool(target.get("focusResetDone")):
                        target["focusResetDone"] = True
                        target["focusResetMethod"] = method
                        script = build_comment_prepare_reply_click_script(
                            str((target or {}).get("threadKey", "") or ""),
                            str((target or {}).get("author", "") or ""),
                            str((target or {}).get("content", "") or ""),
                        )
                        self.page.runJavaScript(script, self._handle_comment_prepare_reply_click_result)
                        return
                    script = build_comment_open_reply_editor_script(
                        str((target or {}).get("threadKey", "") or ""),
                        str((target or {}).get("author", "") or ""),
                        str((target or {}).get("content", "") or ""),
                        method,
                        target_level=str((target or {}).get("targetLevel", "") or ""),
                        target_index=int((target or {}).get("targetIndex", -999) if str((target or {}).get("targetIndex", -999)).lstrip("-").isdigit() else -999),
                        target_message_key=str((target or {}).get("targetMessageKey", "") or ""),
                        reply_dom_key=str((target or {}).get("replyDomKey", "") or ""),
                        time_text=str((target or {}).get("timeText", "") or ""),
                    )
                    self.page.runJavaScript(script, self._handle_comment_open_reply_editor_result)
                except Exception as exc:
                    self.busy = False
                    payload = {
                        "error": str(exc),
                        "method": method,
                        "threadKey": str((target or {}).get("threadKey", "") or ""),
                        "author": str((target or {}).get("author", "") or ""),
                    }
                    self._log("WARN", f"{TRACE_REPLY_EDITOR} | reply_open_script_exception={json.dumps(payload, ensure_ascii=False)}")
                    self._comment_cooldown_reply_open_target(target, reason="reply_open_script_exception", cooldown_ms=30000)
                    if isinstance(getattr(self, "comment_pending_reply_target", None), dict):
                        cur_key = str((self.comment_pending_reply_target or {}).get("threadKey", "") or "")
                        if cur_key and cur_key == str((target or {}).get("threadKey", "") or ""):
                            self.comment_pending_reply_target = None
                    self._schedule_fast_comment_inspect(1200)

    def _handle_comment_prepare_reply_click_result(self, result: Any) -> None:
                self.busy = False
                result = self._coerce_js_result(result)
                level = "INFO" if isinstance(result, dict) and result.get("ok") else "WARN"
                if self._comment_verbose_logs_enabled() or level != "INFO":
                    self._log(level, f"{TRACE_REPLY_EDITOR} | reply_click_focus_prepare_result={json.dumps(result if isinstance(result, dict) else {'ok': False, 'state': 'invalid_result', 'type': type(result).__name__, 'snippet': str(result)[:180]}, ensure_ascii=False)}")
                pending = self.comment_pending_reply_target if isinstance(getattr(self, "comment_pending_reply_target", None), dict) else None
                if not pending or not self.running or not self.ready or self.current_module != "comment" or not self.page:
                    self._schedule_fast_comment_inspect(800)
                    return
                method = str(pending.get("focusResetMethod", "") or pending.get("openMethod", "") or "precise_dom_registered_click")
                pending["openMethodStartedMs"] = self._now_ms()
                pending["openStartedMs"] = int(pending.get("openStartedMs", 0) or self._now_ms())
                def _fire() -> None:
                    try:
                        if not self.running or not self.ready or self.current_module != "comment" or not self.page:
                            return
                        if self.busy:
                            self._schedule_fast_comment_inspect(600)
                            return
                        current = self.comment_pending_reply_target if isinstance(getattr(self, "comment_pending_reply_target", None), dict) else None
                        if not current:
                            return
                        self.busy = True
                        self._comment_run_open_reply_editor_script(current, method=method)
                    except Exception as exc:
                        self.busy = False
                        self._log("WARN", f"{TRACE_REPLY_EDITOR} | reply_click_after_focus_prepare_failed={json.dumps({'error': str(exc), 'method': method}, ensure_ascii=False)}")
                        self._schedule_fast_comment_inspect(900)
                QTimer.singleShot(420, _fire)

    def _comment_retry_open_reply_editor_with_next_method(self, result: dict[str, Any], pending: dict[str, Any], *, elapsed_ms: int) -> bool:
                methods = self._comment_reply_open_methods(str(pending.get("targetLevel", "") or ""))
                current_index = int(pending.get("openMethodIndex", 0) or 0)
                last_method_ms = int(pending.get("openMethodStartedMs", pending.get("attemptMs", 0)) or 0)
                now_ms = self._now_ms()
                current_method = str(pending.get("openMethod", "") or "")
                observe_ms = self._comment_reply_open_method_observe_ms(current_method)
                if now_ms - last_method_ms < observe_ms:
                    return False
                if current_index + 1 >= len(methods):
                    return False
                next_index = current_index + 1
                next_method = methods[next_index]
                pending["openMethodIndex"] = next_index
                pending["openMethod"] = next_method
                pending["openMethodStartedMs"] = now_ms
                pending["openRetryNo"] = int(pending.get("openRetryNo", 0) or 0) + 1
                self.comment_reply_button_click_pending_until_ms = now_ms + self._comment_pending_reply_click_guard_ms()
                self.comment_reply_button_click_lock_until_ms = self.comment_reply_button_click_pending_until_ms
                payload = {
                    "decision": "retry_open_with_next_method",
                    "nextMethod": next_method,
                    "nextIndex": next_index,
                    "elapsedMs": elapsed_ms,
                    "observeMs": observe_ms,
                    "threadKey": str(pending.get("threadKey", "") or ""),
                    "author": str(pending.get("author", "") or ""),
                    "attemptNo": pending.get("attemptNo", 0),
                    "retryNo": pending.get("openRetryNo", 0),
                }
                self._log("INFO", f"评论页回复编辑器未打开，切换点击方式重试: {json.dumps({'author': payload.get('author', ''), 'method': payload.get('nextMethod', ''), 'retryNo': payload.get('retryNo', 0), 'elapsedMs': payload.get('elapsedMs', 0)}, ensure_ascii=False)}")
                # Retry details are summarized by reply_click_not_opened_retry; avoid large diag snapshots on every retry.
                if hasattr(self, "_comment_enter_critical_quiet"):
                    self._comment_enter_critical_quiet("reply_open_retry_precise_dom_settle_v75", 900, target=pending)
                self.busy = True
                self._comment_run_open_reply_editor_script(pending, method=next_method)
                return True

    def _handle_comment_open_reply_editor_result(self, result: Any) -> None:
                self.busy = False
                result = self._coerce_js_result(result)
                if not isinstance(result, dict):
                    self._log("WARN", f"评论页打开回复编辑器结果异常，类型={type(result).__name__}，内容片段={str(result)[:240]}")
                    self._schedule_fast_comment_inspect(700)
                    return
                compact_target = result.get("target", {}) if isinstance(result.get("target"), dict) else {}
                compact_click = compact_target.get("click", {}) if isinstance(compact_target.get("click"), dict) else {}
                compact = {
                    "ok": bool(result.get("ok")),
                    "state": str(result.get("state", "") or ""),
                    "method": str(((result.get("payload", {}) or {}).get("openMethod", "") if isinstance(result.get("payload"), dict) else "") or ""),
                    "selectedBy": str(result.get("selectedBy", "") or ""),
                    "threadKey": str(((result.get("payload", {}) or {}).get("threadKey", "") if isinstance(result.get("payload"), dict) else "") or ""),
                    "author": str(((result.get("payload", {}) or {}).get("author", "") if isinstance(result.get("payload"), dict) else "") or ""),
                    "level": str(((result.get("payload", {}) or {}).get("targetLevel", "") if isinstance(result.get("payload"), dict) else "") or ""),
                    "beforeEditors": int(compact_target.get("beforeEditorCount", 0) or 0),
                    "afterEditors": int(compact_target.get("afterEditorCount", 0) or 0),
                    "replyButton": bool(compact_target.get("replyButtonRect")),
                    "replyDomKey": str(compact_target.get("replyDomKey", "") or ""),
                    "registryValid": bool(compact_target.get("registryValid")),
                    "clickSource": str(compact_click.get("clickSource", "") or ""),
                    "domRole": str(compact_click.get("domRole", "") or ""),
                    "fired": bool(compact_click.get("fired")),
                }
                if result.get("ok"):
                    if str(compact.get("method", "") or "").startswith("precise_dom_"):
                        self._log("INFO", f"评论精准回复DOM触发完成: {json.dumps(compact, ensure_ascii=False)}")
                    # For qt_view_mouse_click the JS script only locates the reply button.
                    # Perform the real view-level click here, then let normal confirm probes decide.
                    if compact.get("method") == "qt_view_mouse_click" and compact.get("state") == "clicked":
                        click_info = {}
                        try:
                            target_info = result.get("target", {}) if isinstance(result.get("target"), dict) else {}
                            click_info = target_info.get("click", {}) if isinstance(target_info.get("click"), dict) else {}
                        except Exception:
                            click_info = {}
                        pending = self.comment_pending_reply_target if isinstance(getattr(self, "comment_pending_reply_target", None), dict) else None
                        self._comment_perform_qt_view_reply_click(click_info, pending)
                    if self._comment_verbose_logs_enabled():
                        self._log("INFO", f"{TRACE_REPLY_EDITOR} | reply_editor_opening_result={json.dumps(compact, ensure_ascii=False)}")
                else:
                    self._log("WARN", f"评论页打开回复编辑器失败: {json.dumps(compact, ensure_ascii=False)}")
                    pending = self.comment_pending_reply_target if isinstance(getattr(self, "comment_pending_reply_target", None), dict) else {}
                    if pending:
                        self._comment_release_inflight_for_target(pending, result=result, reason="reply_editor_open_js_failed_release")
                        self._comment_cooldown_reply_open_target(pending, reason="reply_editor_open_js_failed", cooldown_ms=30000)
                    self.comment_pending_reply_target = None
                    self.comment_preopen_reply_target = None
                    self.comment_preopen_reply_context = None
                    self.comment_preopen_reply_future = None
                    if hasattr(self, "_comment_set_flow_stage"):
                        self._comment_set_flow_stage("scan_candidates_under_unreplied", None, reason="reply_editor_open_js_failed_release")
                self._schedule_fast_comment_inspect(700)

    def _comment_promote_pending_reply_editor(
                self,
                result: dict[str, Any],
                pending: dict[str, Any],
                match: dict[str, Any] | None,
                *,
                method: str = "",
                selected_by: str = "",
                transaction_id: str = "",
                editor_dom_key: str = "",
            ) -> None:
                match = match if isinstance(match, dict) else {}
                self.comment_active_reply_target = {
                    "threadKey": str(pending.get("threadKey", "") or match.get("threadKey", "") or ""),
                    "author": str(pending.get("author", "") or match.get("author", "") or ""),
                    "content": str(pending.get("content", "") or match.get("content", "") or ""),
                    "timeText": str(pending.get("timeText", "") or match.get("timeText", "") or ""),
                    "targetMessageKey": str(pending.get("targetMessageKey", "") or ""),
                    "replyDomKey": str(pending.get("replyDomKey", "") or ""),
                    "targetParentThreadKey": str(pending.get("targetParentThreadKey", "") or pending.get("threadKey", "") or match.get("threadKey", "") or ""),
                    "targetLevel": str(pending.get("targetLevel", "") or ""),
                    "targetIndex": pending.get("targetIndex", -1),
                    "replyNeedReason": str(pending.get("replyNeedReason", "") or ""),
                    "signature": str(pending.get("signature", "") or ""),
                    "beforeNestedReplyCount": len(match.get("nestedReplies", []) or []),
                    "beforeMessageCount": 1 + len(match.get("nestedReplies", []) or []) if match else 0,
                    "beforeAuthorReplyCount": sum(1 for item in (match.get("nestedReplies", []) or []) if isinstance(item, dict) and item.get("isAuthor")),
                    "beforeLastMessageKey": str(((match.get("lastEffectiveMessage", {}) or {}).get("messageKey", "") if isinstance(match.get("lastEffectiveMessage", {}), dict) else "") or ""),
                    "rootAuthor": str(match.get("author", "") or ""),
                    "rootContent": str(match.get("content", "") or ""),
                    "transactionId": str(transaction_id or ""),
                    "editorDomKey": str(editor_dom_key or ""),
                    "editorResolvedBy": str(selected_by or ""),
                }
                if hasattr(self, "_comment_set_flow_stage"):
                    self._comment_set_flow_stage("reply_editor_confirmed", result, reason="target_reply_editor_visible")
                success_payload = {
                    "author": self.comment_active_reply_target["author"],
                    "attemptNo": int(pending.get("attemptNo", 0) or 0),
                    "method": str(method or pending.get("openMethod", "") or ""),
                    "retryNo": int(pending.get("openRetryNo", 0) or 0),
                    "resolvedBy": str(selected_by or "inspect_target_editor"),
                    "transactionId": str(transaction_id or ""),
                    "editorDomKey": str(editor_dom_key or ""),
                }
                self._log("INFO", f"评论页回复编辑器确认成功: {json.dumps(success_payload, ensure_ascii=False)}")
                if self._comment_verbose_logs_enabled():
                    self._log(
                        "INFO",
                        f"{TRACE_REPLY_EDITOR} | reply_editor_confirmed="
                        f"{json.dumps({'threadKey': self.comment_active_reply_target['threadKey'], 'author': self.comment_active_reply_target['author'], 'attemptNo': pending.get('attemptNo', 0), 'belongsToCandidate': True, 'stage': str(getattr(self, 'comment_stage_name', '') or ''), 'resolvedBy': selected_by or 'inspect_target_editor'}, ensure_ascii=False)}",
                    )
                self.comment_reply_editor_alive_streak = 1
                self.comment_reply_editor_lost_streak = 0
                self.comment_reply_editor_focus_confirmed = False
                self.comment_reply_editor_focus_lost_streak = 0
                self.comment_reply_editor_stable_since_ms = self._now_ms()
                self._comment_upgrade_reply_click_lock_after_visible(self.comment_active_reply_target, reason="reply_editor_confirmed_visible")
                self._comment_record_reply_editor_visible(result, self.comment_active_reply_target, reason="reply_editor_confirmed")
                self.comment_pending_reply_target = None
                if hasattr(self, "_comment_enter_ready_for_draft_from_stable"):
                    self._comment_enter_ready_for_draft_from_stable(self.comment_active_reply_target, reason="editor_visible_immediate_inject_after_confirm")
                self._schedule_fast_comment_inspect(900)

    def _comment_probe_pending_reply_editor_binding(self, result: dict[str, Any], pending: dict[str, Any]) -> bool:
                composers = result.get("composers", {}) or {}
                reply_editors = composers.get("replyEditors", []) or []
                if not isinstance(reply_editors, list) or not reply_editors:
                    return False
                if bool(pending.get("bindProbeInFlight")) or self.busy:
                    return True
                now_ms = self._now_ms()
                if now_ms - int(pending.get("bindProbeLastMs", 0) or 0) < 1200:
                    return True
                pending["bindProbeInFlight"] = True
                pending["bindProbeLastMs"] = now_ms
                self.busy = True
                snapshot = result
                self.page.runJavaScript(
                    build_comment_focus_reply_editor_script(
                        str(pending.get("threadKey", "") or ""),
                        str(pending.get("author", "") or ""),
                        str(pending.get("content", "") or ""),
                        target_message_key=str(pending.get("targetMessageKey", "") or ""),
                        reply_dom_key=str(pending.get("replyDomKey", "") or ""),
                        target_level=str(pending.get("targetLevel", "") or ""),
                        target_index=int(pending.get("targetIndex", -999) if pending.get("targetIndex", -999) is not None else -999),
                        target_parent_thread_key=str(pending.get("targetParentThreadKey", "") or pending.get("threadKey", "") or ""),
                    ),
                    lambda js_result, _snapshot=snapshot: self._handle_comment_pending_editor_bind_probe_result(js_result, _snapshot),
                )
                return True

    def _handle_comment_pending_editor_bind_probe_result(self, js_result: Any, snapshot: dict[str, Any]) -> None:
                self.busy = False
                result = self._coerce_js_result(js_result)
                pending = self.comment_pending_reply_target if isinstance(getattr(self, "comment_pending_reply_target", None), dict) else None
                if not pending:
                    self._schedule_fast_comment_inspect(600)
                    return
                pending["bindProbeInFlight"] = False
                if isinstance(result, dict) and result.get("ok"):
                    match = self._comment_find_reply_target_thread(snapshot, pending)
                    if isinstance(match, dict) and match:
                        self._comment_promote_pending_reply_editor(
                            snapshot,
                            pending,
                            match,
                            method=str(pending.get("openMethod", "") or ""),
                            selected_by=str(result.get("selectedBy", "") or "active_transaction_editor_rebind"),
                            transaction_id=str(result.get("transactionId", "") or ""),
                            editor_dom_key=str(result.get("editorDomKey", "") or ""),
                        )
                        return
                    # The editor was found, but the current inspect snapshot no longer
                    # contains the exact root thread. Keep the pending transaction and
                    # wait for the next full inspect so strict pre-send counts remain valid.
                    pending["bindProbeLastMs"] = self._now_ms()
                if self._comment_verbose_logs_enabled():
                    self._log(
                        "INFO",
                        f"{TRACE_REPLY_EDITOR} | pending_editor_bind_probe_wait="
                        f"{json.dumps({'author': str(pending.get('author', '') or ''), 'state': str((result or {}).get('state', 'invalid_result') if isinstance(result, dict) else 'invalid_result'), 'replyEditorsFound': len(((snapshot.get('composers', {}) or {}).get('replyEditors', []) or []))}, ensure_ascii=False)}",
                    )
                self._schedule_fast_comment_inspect(700)

    def _maybe_confirm_comment_reply_editor(self, result: dict[str, Any]) -> None:
                pending = self.comment_pending_reply_target
                if not pending:
                    return
                top_comments = result.get("topComments", []) or []
                match = next(
                    (
                        item for item in top_comments
                        if isinstance(item, dict)
                        and (
                            str(item.get("threadKey", "") or "") == str(pending.get("threadKey", "") or "")
                            or (
                                str(item.get("author", "") or "") == str(pending.get("author", "") or "")
                                and str(item.get("content", "") or "") == str(pending.get("content", "") or "")
                            )
                            or (
                                str(item.get("author", "") or "") == str(pending.get("author", "") or "")
                                and str(item.get("timeText", "") or "") == str(pending.get("timeText", "") or "")
                            )
                        )
                    ),
                    None,
                )
                now_ms = self._now_ms()
                if now_ms - int(getattr(self, "comment_reply_editor_probe_last_log_ms", 0) or 0) >= 5000:
                    self.comment_reply_editor_probe_last_log_ms = now_ms
                    composers = result.get("composers", {}) or {}
                    reply_editors = composers.get("replyEditors", []) or []
                    probe_payload = {
                        "threadKey": str(pending.get("threadKey", "") or ""),
                        "author": str(pending.get("author", "") or ""),
                        "matched": bool(match),
                        "matchReplyEditorVisible": bool(match and match.get("replyEditorVisible")),
                        "replyEditorsFound": len(reply_editors) if isinstance(reply_editors, list) else 0,
                        "topComposerFound": bool((composers.get("topComposer", {}) or {}).get("found")),
                        "stage": str(getattr(self, "comment_stage_name", "") or ""),
                        "elapsedMs": self._now_ms() - int(pending.get("openStartedMs", pending.get("attemptMs", 0)) or self._now_ms()),
                        "method": str(pending.get("openMethod", "") or ""),
                        "methodIndex": int(pending.get("openMethodIndex", 0) or 0),
                        "retryNo": int(pending.get("openRetryNo", 0) or 0),
                    }
                    if self._comment_verbose_logs_enabled():
                        self._log("INFO", f"{TRACE_REPLY_EDITOR} | reply_editor_confirm_probe={json.dumps(probe_payload, ensure_ascii=False)}")
                    self._comment_log_editor_diag_snapshot(result, reason="confirm_probe", target=pending, level="INFO", extra=probe_payload)
                if match and match.get("replyEditorVisible"):
                    self._comment_promote_pending_reply_editor(
                        result,
                        pending,
                        match,
                        method=str(pending.get("openMethod", "") or ""),
                        selected_by="inspect_target_editor",
                    )
                    return
                # D10: if the page already exposes a reply editor but the normal
                # card-band scan cannot associate it with the nested target, bind it
                # through the active D9 transaction before trying another click.
                # This prevents a visible toggle editor from being clicked closed.
                if self._comment_probe_pending_reply_editor_binding(result, pending):
                    return
                attempt_ms = int(pending.get("openStartedMs", pending.get("attemptMs", 0)) or 0)
                elapsed_ms = self._now_ms() - attempt_ms if attempt_ms else 0
                method_started_ms = int(pending.get("openMethodStartedMs", attempt_ms) or attempt_ms)
                method_elapsed_ms = self._now_ms() - method_started_ms if method_started_ms else elapsed_ms
                current_method = str(pending.get("openMethod", "") or "")
                observe_ms = self._comment_reply_open_method_observe_ms(current_method)
                if method_started_ms and method_elapsed_ms >= observe_ms:
                    if self._comment_retry_open_reply_editor_with_next_method(result, pending, elapsed_ms=elapsed_ms):
                        self._schedule_fast_comment_inspect(900)
                        return
                methods = self._comment_reply_open_methods(str(pending.get("targetLevel", "") or ""))
                final_method = int(pending.get("openMethodIndex", 0) or 0) >= max(0, len(methods) - 1)
                timeout_ms = 18000
                if attempt_ms and ((final_method and method_elapsed_ms >= observe_ms) or elapsed_ms >= timeout_ms):
                    timeout_payload = {'threadKey': pending.get('threadKey', ''), 'author': pending.get('author', ''), 'content': pending.get('content', ''), 'attemptNo': pending.get('attemptNo', 0), 'method': pending.get('openMethod', ''), 'retryNo': pending.get('openRetryNo', 0), 'targetLevel': pending.get('targetLevel', ''), 'timeoutMs': timeout_ms, 'methodElapsedMs': method_elapsed_ms, 'observeMs': observe_ms}
                    self._comment_log_editor_diag_snapshot(result, reason="reply_editor_confirm_timeout", target=pending, level="WARN", extra=timeout_payload)
                    self._log(
                        "WARN",
                        f"评论页回复编辑器确认超时: {json.dumps(timeout_payload, ensure_ascii=False)}",
                    )
                    retry_cooldown_ms = 8000
                    self._comment_cooldown_reply_open_target(pending, reason="reply_editor_confirm_timeout", cooldown_ms=retry_cooldown_ms)
                    # 打开编辑器失败是可重试失败，不能继续占用 inflight；否则候选会长期被 already_inflight 跳过，
                    # 当前作品还会被误判为超过处理预算而打开作品侧栏/刷新，打断评论主链。
                    self._comment_release_inflight_for_target(pending, result=result, reason="reply_editor_confirm_timeout_release")
                    # Clear stale pre-generated target immediately so the next candidate can be processed instead of re-opening the same failed nested row.
                    self.comment_preopen_reply_target = None
                    self.comment_preopen_reply_context = None
                    self.comment_preopen_reply_future = None
                    self.comment_pending_reply_target = None
                    if hasattr(self, "_comment_enter_critical_quiet"):
                        self._comment_enter_critical_quiet("reply_open_failed_cooldown_v73", 1200, target=pending)
                    self._log("INFO", f"{TRACE_REPLY_EDITOR} | reply_decision=skip_failed_target_continue_next | threadKey={str(pending.get('threadKey', '') or '')} | author={str(pending.get('author', '') or '')} | level={str(pending.get('targetLevel', '') or '')}")
                    self._schedule_fast_comment_inspect(1200)
