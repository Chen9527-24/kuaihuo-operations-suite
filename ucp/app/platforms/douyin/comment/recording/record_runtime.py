from __future__ import annotations

from concurrent.futures import Future, ThreadPoolExecutor
from datetime import datetime, timezone
import json
import re
from typing import Any

from app.services.local_records.normalizers import iso_utc


class SessionControllerCommentRecordMixin:
    """Side-channel persistence for Douyin comment threads.

    The recorder is deliberately isolated from comment eligibility, editor,
    send, and work-switch state. Local SQLite submission is non-blocking and
    remote Core Nexus synchronization runs on a dedicated single worker.
    Recording failures are logged and swallowed so existing auto-reply behavior
    remains unchanged.
    """

    _COMMENT_RECORD_BATCH_LIMIT = 80

    @staticmethod
    def _comment_record_text(value: Any, limit: int = 4000) -> str:
        text = str(value or "").replace("\x00", "").strip()
        return re.sub(r"\s+", " ", text)[:limit]

    def _comment_record_service(self) -> Any | None:
        service = getattr(self, "record_service", None)
        if service is None:
            return None
        if str(getattr(service, "state", "") or "").endswith("CLOSED"):
            return None
        return service

    def _comment_record_store_id(self) -> str:
        cached = self._comment_record_text(getattr(self, "_comment_local_record_store_id", ""), 80)
        if cached:
            return cached
        service = self._comment_record_service()
        if service is None:
            return ""
        try:
            store_id = self._comment_record_text(service.store_id_for(getattr(self, "account", None)), 80)
        except Exception:
            return ""
        if store_id:
            self._comment_local_record_store_id = store_id
        return store_id

    def _comment_record_state(self) -> dict[str, Any]:
        state = getattr(self, "_comment_recording_state", None)
        if not isinstance(state, dict):
            state = {}
            self._comment_recording_state = state
        state.setdefault("local_hashes", {})
        state.setdefault("remote_hashes", {})
        state.setdefault("remote_pending", {})
        state.setdefault("remote_queued_hashes", {})
        state.setdefault("last_summary_signature", "")
        state.setdefault("last_summary_log_ms", 0)
        return state

    def _comment_record_fingerprint(self, *parts: Any) -> str:
        service = self._comment_record_service()
        if service is not None and hasattr(service, "message_fingerprint"):
            try:
                return str(service.message_fingerprint(*parts) or "")
            except Exception:
                pass
        import hashlib
        payload = json.dumps([str(part or "") for part in parts], ensure_ascii=False, separators=(",", ":"))
        return hashlib.sha256(payload.encode("utf-8")).hexdigest()

    def _comment_record_payload_hash(self, payload: dict[str, Any]) -> str:
        """Hash only stable record semantics, excluding scan-time observation clocks."""
        volatile_keys = {
            "observed_at_utc", "first_observed_at_utc", "last_observed_at_utc",
            "source_time_utc", "commentTime", "observedAt", "updatedAt",
        }
        stable = {key: value for key, value in dict(payload or {}).items() if key not in volatile_keys}
        return self._comment_record_fingerprint(stable)

    def _comment_record_work_context(self, result: dict[str, Any] | None) -> dict[str, str]:
        header = (result or {}).get("header", {}) if isinstance(result, dict) else {}
        title = self._comment_record_text(header.get("currentWorkTitle"), 1000)
        meta = self._comment_record_text(header.get("currentWorkMeta"), 1000)
        work_key = " | ".join(part for part in (title, meta) if part) or "unknown_work"
        account = getattr(self, "account", None)
        robot_id = self._comment_record_text(getattr(account, "id", ""), 128)
        video_id = "video_" + self._comment_record_fingerprint("DOUYIN", robot_id, work_key)[:40]
        return {
            "video_id": video_id,
            "video_title": title or meta or "未识别作品",
            "video_meta": meta,
            "work_key": work_key,
        }

    def _comment_record_current_filter(self, result: dict[str, Any] | None) -> str:
        filter_data = (result or {}).get("commentFilter", {}) if isinstance(result, dict) else {}
        return self._comment_record_text((filter_data or {}).get("selectedText"), 80)

    @staticmethod
    def _comment_record_message_type(content: str) -> tuple[str, str]:
        clean = str(content or "").strip()
        placeholders = {
            "[图片]": ("image", "[图片]"),
            "[语音]": ("voice", "[语音]"),
            "[视频]": ("video", "[视频]"),
            "[文件]": ("file", "[文件]"),
            "[表情]": ("emoji", "[表情]"),
            "[链接]": ("link", "[链接]"),
            "[卡片]": ("card", "[卡片]"),
            "[其他类型消息]": ("unknown", "[其他类型消息]"),
        }
        if clean in placeholders:
            return placeholders[clean]
        if not clean:
            return "unknown", "[其他类型消息]"
        return "text", ""

    def _comment_record_normalized_time(self, raw_time: Any) -> dict[str, str]:
        service = self._comment_record_service()
        if service is not None and hasattr(service, "normalized_time"):
            try:
                return dict(service.normalized_time(
                    source_time_raw=self._comment_record_text(raw_time, 256),
                    source_timezone="Asia/Shanghai",
                    is_live_observation=False,
                ) or {})
            except Exception:
                pass
        now = iso_utc()
        return {
            "source_time_raw": self._comment_record_text(raw_time, 256),
            "source_timestamp_raw": "",
            "source_time_utc": "",
            "observed_at_utc": now,
            "first_observed_at_utc": now,
            "last_observed_at_utc": now,
            "time_accuracy": "unknown_history",
            "source_timezone": "Asia/Shanghai",
            "business_timezone": "Asia/Shanghai",
            "time_parser_version": "1",
        }


    def _comment_record_stable_time_token(self, raw_time: Any) -> str:
        """Return only absolute source-time evidence.

        Douyin relative labels such as ``刚刚`` and ``2分钟前`` change on every
        scan and must never participate in a persistent comment identity.
        """
        text = self._comment_record_text(raw_time, 128)
        if not text:
            return ""
        lowered = text.lower()
        relative_markers = ("刚刚", "分钟前", "小时前", "秒前", "昨天", "前天", "today", "yesterday", "ago")
        if any(marker in lowered for marker in relative_markers):
            return ""
        if re.search(r"(?:20\d{2})[年\-/\.]\d{1,2}", text):
            return re.sub(r"\s+", " ", text)[:64]
        if re.search(r"\d{1,2}[月\-/\.]\d{1,2}", text):
            return re.sub(r"\s+", " ", text)[:64]
        return ""

    def _comment_record_stable_thread_key(self, thread: dict[str, Any]) -> str:
        for key in ("platformCommentId", "commentId", "comment_id", "externalCommentId", "dataId", "data_id"):
            value = self._comment_record_text(thread.get(key), 256)
            if value:
                return f"platform:{value}"
        author = self._comment_record_text(thread.get("author"), 256).lower()
        content = self._comment_record_text(thread.get("content"), 1200).lower()
        stable_time = self._comment_record_stable_time_token(thread.get("timeText"))
        if author or content:
            return "|".join(("root", author, content, stable_time))
        raw = self._comment_record_text(thread.get("threadKey"), 1000)
        parts = [self._comment_record_text(part, 400) for part in raw.split("|")]
        if len(parts) >= 3:
            return "|".join(("root", parts[0].lower(), "|".join(parts[2:]).lower(), ""))
        return raw or "unknown_thread"

    def _comment_record_stable_message_key(
        self,
        *,
        thread: dict[str, Any],
        message: dict[str, Any],
        level: int,
        nested_index: int,
        sender_role: str,
        author: str,
        content: str,
    ) -> str:
        for key in ("platformCommentId", "commentId", "comment_id", "externalCommentId", "dataId", "data_id"):
            value = self._comment_record_text(message.get(key), 256)
            if value:
                return f"platform:{value}"
        root_key = self._comment_record_stable_thread_key(thread)
        return "|".join((
            root_key,
            "top" if int(level or 1) <= 1 else "nested",
            str(max(-1, int(nested_index))),
            self._comment_record_text(sender_role, 32).lower(),
            self._comment_record_text(author, 256).lower(),
            self._comment_record_text(content, 1200).lower(),
        ))

    def _comment_record_ids(
        self,
        result: dict[str, Any] | None,
        *,
        thread_key: Any,
        message_key: Any,
        level: int,
    ) -> dict[str, str]:
        work = self._comment_record_work_context(result)
        clean_thread = self._comment_record_text(thread_key, 1000) or "unknown_thread"
        clean_message = self._comment_record_text(message_key, 1800) or f"{clean_thread}|level={level}"
        root_id = "cmtroot_" + self._comment_record_fingerprint("DOUYIN", work["video_id"], clean_thread)[:40]
        comment_id = root_id if int(level or 1) <= 1 else "cmt_" + self._comment_record_fingerprint("DOUYIN", work["video_id"], clean_message)[:48]
        return {
            "comment_id": comment_id,
            "root_comment_id": root_id,
            "external_comment_id": clean_message[:512],
            **work,
        }

    def _comment_record_author_key(self, author: str, sender_role: str, video_id: str) -> str:
        if not author:
            return ""
        return "author_" + self._comment_record_fingerprint("DOUYIN", video_id, sender_role, author.lower())[:32]

    def _comment_record_build_message(
        self,
        result: dict[str, Any],
        thread: dict[str, Any],
        message: dict[str, Any],
        *,
        level: int,
        nested_index: int,
    ) -> tuple[dict[str, Any], dict[str, Any]]:
        thread_key = self._comment_record_stable_thread_key(thread)
        author = self._comment_record_text(message.get("author"), 256) or "未知用户"
        content = self._comment_record_text(message.get("content"), 4000)
        time_text = self._comment_record_text(message.get("timeText"), 256)
        is_author = bool(message.get("isAuthor"))
        sender_role = "account" if is_author else "user"
        actor_source = "account_side_unconfirmed" if is_author else "platform_user"
        attribution = "probable" if is_author else "verified"
        source_message_key = self._comment_record_text(message.get("messageKey"), 1800)
        raw_message_key = self._comment_record_stable_message_key(
            thread=thread,
            message=message,
            level=level,
            nested_index=nested_index,
            sender_role=sender_role,
            author=author,
            content=content,
        )
        ids = self._comment_record_ids(
            result,
            thread_key=thread_key,
            message_key=raw_message_key,
            level=level,
        )
        message_type, placeholder = self._comment_record_message_type(content)
        text_content = content if message_type == "text" else ""
        display_content = text_content or placeholder
        time_data = self._comment_record_normalized_time(time_text)
        has_collapsed = bool(thread.get("hasCollapsedReplies"))
        collection_status = "partial_thread" if has_collapsed else "complete_visible_thread"
        thread_completeness = "partial_collapsed_replies" if has_collapsed else "visible_complete"
        target_message = thread.get("replyTargetMessage") if isinstance(thread.get("replyTargetMessage"), dict) else {}
        target_source_key = self._comment_record_text(target_message.get("messageKey"), 1800)
        target_level_text = self._comment_record_text(target_message.get("level") or "top", 24).lower()
        target_level = 1 if target_level_text == "top" else 2
        try:
            target_index = int(target_message.get("index", 0) or 0)
        except Exception:
            target_index = 0
        target_key = self._comment_record_stable_message_key(
            thread=thread,
            message=target_message,
            level=target_level,
            nested_index=target_index,
            sender_role="account" if bool(target_message.get("isAuthor")) else "user",
            author=self._comment_record_text(target_message.get("author"), 256),
            content=self._comment_record_text(target_message.get("content"), 4000),
        ) if target_message else ""
        reply_need_reason = self._comment_record_text(thread.get("replyNeedReason"), 128)
        if sender_role == "account":
            candidate_status = "author_already_replied"
            reply_status = "manual_or_external_reply"
        elif reply_need_reason and (
            (target_source_key and source_message_key and target_source_key == source_message_key)
            or (target_key and target_key == raw_message_key)
        ):
            candidate_status = "eligible"
            reply_status = "not_attempted"
        elif bool(thread.get("hasAuthorReplyInThread")):
            candidate_status = "existing_processed"
            reply_status = "not_attempted"
        else:
            candidate_status = "unknown"
            reply_status = "not_attempted"
        parent_id = ids["root_comment_id"] if level > 1 else ""
        local_payload = {
            "comment_id": ids["comment_id"],
            "platform": "DOUYIN",
            "external_comment_id": ids["external_comment_id"],
            "video_id": ids["video_id"],
            "video_title": ids["video_title"],
            "parent_comment_id": parent_id,
            "root_comment_id": ids["root_comment_id"],
            "comment_level": max(1, int(level or 1)),
            "author_key": self._comment_record_author_key(author, sender_role, ids["video_id"]),
            "author_display": author,
            "sender_role": sender_role,
            "actor_source": actor_source,
            "attribution_confidence": attribution,
            "text_content": text_content,
            "message_type": message_type,
            "type_placeholder": placeholder,
            **time_data,
            "collection_status": collection_status,
            "candidate_status": candidate_status,
            "analysis_status": "not_started",
            "reply_status": reply_status,
            "resolution_status": "observed",
            "current_filter": self._comment_record_current_filter(result),
            "replies_collapsed": has_collapsed,
            "thread_completeness": thread_completeness,
            "source_robot_id": self._comment_record_text(getattr(getattr(self, "account", None), "id", ""), 128),
            "source_client_id": self._comment_record_text(getattr(self._comment_record_service(), "client_id", ""), 128),
        }
        remote_item = {
            "recordId": ids["comment_id"],
            "externalCommentId": ids["external_comment_id"],
            "videoId": ids["video_id"],
            "videoTitle": ids["video_title"],
            "rootRecordId": ids["root_comment_id"],
            "parentRecordId": parent_id or None,
            "depth": max(0, int(level or 1) - 1),
            "senderRole": sender_role,
            "actorSource": actor_source,
            "attributionConfidence": attribution,
            "userNickname": author,
            "commentContent": display_content or "[其他类型消息]",
            "messageType": message_type,
            "typePlaceholder": placeholder,
            "commentTime": time_data.get("source_time_utc") or "",
            "sourceTimeRaw": time_data.get("source_time_raw") or "",
            "observedAt": time_data.get("observed_at_utc") or iso_utc(),
            "timeAccuracy": time_data.get("time_accuracy") or "unknown",
            "collectionStatus": collection_status,
            "currentFilter": self._comment_record_current_filter(result),
            "repliesCollapsed": has_collapsed,
            "threadCompleteness": thread_completeness,
            "shouldReply": bool(candidate_status == "eligible" and sender_role == "user"),
            "skipReply": False,
            "skipReason": "",
            "commentType": reply_need_reason or "observed",
            "intentLevel": "none",
            "intentLabel": "完全无意向",
            "judgeReason": reply_need_reason,
            "replyStatus": "manual" if sender_role == "account" else "pending",
            "replyContent": "",
            "replyTime": "",
            "failReason": "",
            "sourceClientId": self._comment_record_text(getattr(self._comment_record_service(), "client_id", ""), 128),
        }
        return local_payload, remote_item

    def _comment_record_submit_local(self, payload: dict[str, Any]) -> None:
        service = self._comment_record_service()
        store_id = self._comment_record_store_id()
        if service is None or not store_id:
            return
        state = self._comment_record_state()
        payload_hash = self._comment_record_payload_hash(payload)
        comment_id = self._comment_record_text(payload.get("comment_id"), 256)
        if comment_id and state["local_hashes"].get(comment_id) == payload_hash:
            return
        event_id = f"comment:{comment_id}:{payload_hash[:24]}"
        try:
            accepted = bool(service.submit(
                store_id=store_id,
                event_type="comment_upsert",
                payload=payload,
                event_id=event_id,
            ))
            if accepted and comment_id:
                state["local_hashes"][comment_id] = payload_hash
        except Exception as exc:
            self._log("WARN", f"评论本地记录失败，已旁路忽略：{type(exc).__name__}: {str(exc)[:160]}")

    def _comment_record_collect_remote_result(self) -> None:
        state = self._comment_record_state()
        future = state.get("remote_future")
        if not isinstance(future, Future) or not future.done():
            return
        meta = state.get("remote_future_meta") if isinstance(state.get("remote_future_meta"), dict) else {}
        state["remote_future"] = None
        state["remote_future_meta"] = {}
        try:
            response = future.result()
            for record_id, payload_hash in (meta.get("hashes") or {}).items():
                state["remote_hashes"][record_id] = payload_hash
                if state["remote_queued_hashes"].get(record_id) == payload_hash:
                    state["remote_queued_hashes"].pop(record_id, None)
            count = int((response or {}).get("syncedCount", len(meta.get("hashes") or {})) or 0) if isinstance(response, dict) else len(meta.get("hashes") or {})
            if count:
                now_ms = int(datetime.now(timezone.utc).timestamp() * 1000)
                state["sync_success_pending_count"] = int(state.get("sync_success_pending_count", 0) or 0) + count
                last_log_ms = int(state.get("sync_success_last_log_ms", 0) or 0)
                if bool(getattr(self, "_comment_verbose_logs_enabled", lambda: False)()) or now_ms - last_log_ms >= 30000:
                    total = int(state.get("sync_success_pending_count", 0) or 0)
                    state["sync_success_pending_count"] = 0
                    state["sync_success_last_log_ms"] = now_ms
                    self._log("INFO", f"评论记录增量同步完成: syncedCount={total}")
        except Exception as exc:
            for record_id, payload_hash in (meta.get("hashes") or {}).items():
                if state["remote_queued_hashes"].get(record_id) == payload_hash:
                    state["remote_queued_hashes"].pop(record_id, None)
                item = (meta.get("items") or {}).get(record_id)
                if isinstance(item, dict):
                    state["remote_pending"][record_id] = item
            self._log("WARN", f"评论原始记录服务端同步失败，保留待重试：{type(exc).__name__}: {str(exc)[:180]}")

    def _comment_record_queue_remote_items(self, result: dict[str, Any] | None, items: list[dict[str, Any]]) -> None:
        service = getattr(self, "core_service", None)
        if service is None or not hasattr(service, "sync_comment_records"):
            return
        state = self._comment_record_state()
        self._comment_record_collect_remote_result()
        for item in items:
            if not isinstance(item, dict):
                continue
            record_id = self._comment_record_text(item.get("recordId"), 256)
            if not record_id:
                continue
            payload_hash = self._comment_record_payload_hash(item)
            if state["remote_hashes"].get(record_id) == payload_hash:
                continue
            if state["remote_queued_hashes"].get(record_id) == payload_hash:
                continue
            state["remote_pending"][record_id] = dict(item)
            state["remote_queued_hashes"][record_id] = payload_hash

        active = state.get("remote_future")
        if isinstance(active, Future) and not active.done():
            return
        if not state["remote_pending"]:
            return
        batch_ids = list(state["remote_pending"].keys())[: self._COMMENT_RECORD_BATCH_LIMIT]
        batch_items = {record_id: state["remote_pending"].pop(record_id) for record_id in batch_ids}
        hashes = {record_id: self._comment_record_payload_hash(item) for record_id, item in batch_items.items()}
        work = self._comment_record_work_context(result)
        account = getattr(self, "account", None)
        payload = {
            "robotId": getattr(account, "id", "") or None,
            "module": "comment",
            "platform": "DOUYIN",
            "botNickname": getattr(account, "auth_name", "") or getattr(account, "robot_name", "") or getattr(account, "name", "") or "",
            "postTitle": work["video_title"],
            "comments": list(batch_items.values()),
        }
        executor = state.get("remote_executor")
        if not isinstance(executor, ThreadPoolExecutor):
            executor = ThreadPoolExecutor(max_workers=1, thread_name_prefix="comment-record-sync")
            state["remote_executor"] = executor
        state["remote_future_meta"] = {"hashes": hashes, "items": batch_items}
        state["remote_future"] = executor.submit(service.sync_comment_records, payload)

    def _comment_record_visible_threads(self, result: dict[str, Any]) -> None:
        if not isinstance(result, dict):
            return
        work = self._comment_record_work_context(result)
        if work.get("work_key") == "unknown_work":
            return
        self._comment_record_collect_remote_result()
        top_comments = result.get("topComments") if isinstance(result.get("topComments"), list) else []
        remote_items: list[dict[str, Any]] = []
        local_count = 0
        thread_count = 0
        for raw_thread in top_comments:
            if not isinstance(raw_thread, dict):
                continue
            thread_count += 1
            top_message = {
                "level": "top",
                "index": -1,
                "author": raw_thread.get("author"),
                "isAuthor": raw_thread.get("isAuthor"),
                "content": raw_thread.get("content"),
                "timeText": raw_thread.get("timeText"),
                "messageKey": " | ".join((
                    self._comment_record_text(raw_thread.get("threadKey"), 1000),
                    "top",
                    "-1",
                    self._comment_record_text(raw_thread.get("author"), 256),
                    self._comment_record_text(raw_thread.get("timeText"), 256),
                    self._comment_record_text(raw_thread.get("content"), 120),
                )),
            }
            local_payload, remote_item = self._comment_record_build_message(
                result, raw_thread, top_message, level=1, nested_index=-1
            )
            self._comment_record_submit_local(local_payload)
            remote_items.append(remote_item)
            local_count += 1
            nested = raw_thread.get("nestedReplies") if isinstance(raw_thread.get("nestedReplies"), list) else []
            for index, raw_message in enumerate(nested[:120]):
                if not isinstance(raw_message, dict):
                    continue
                local_payload, remote_item = self._comment_record_build_message(
                    result, raw_thread, raw_message, level=2, nested_index=index
                )
                self._comment_record_submit_local(local_payload)
                remote_items.append(remote_item)
                local_count += 1
        if remote_items:
            self._comment_record_queue_remote_items(result, remote_items)
        state = self._comment_record_state()
        summary = {
            "video": self._comment_record_work_context(result)["video_title"],
            "threads": thread_count,
            "visibleMessages": local_count,
            "filter": self._comment_record_current_filter(result),
            "partialThreads": sum(1 for item in top_comments if isinstance(item, dict) and item.get("hasCollapsedReplies")),
        }
        signature = json.dumps(summary, ensure_ascii=False, sort_keys=True)
        now_ms = int(datetime.now(timezone.utc).timestamp() * 1000)
        last_summary_ms = int(state.get("last_summary_log_ms", 0) or 0)
        summary_changed = signature != state.get("last_summary_signature")
        should_log_summary = bool(local_count) and (
            bool(getattr(self, "_comment_verbose_logs_enabled", lambda: False)())
            or (summary_changed and now_ms - last_summary_ms >= 15000)
            or now_ms - last_summary_ms >= 60000
        )
        if should_log_summary:
            state["last_summary_signature"] = signature
            state["last_summary_log_ms"] = now_ms
            self._log("INFO", f"评论记录采集摘要: {json.dumps(summary, ensure_ascii=False)}")

    def _comment_build_remote_record_for_target(
        self,
        result: dict[str, Any] | None,
        target: dict[str, Any],
        *,
        reply_text: str = "",
        status: str = "generated",
        skip: bool = False,
        reason: str = "",
        backend_payload: dict[str, Any] | None = None,
        fail_reason: str = "",
    ) -> dict[str, Any]:
        result = result if isinstance(result, dict) else {}
        backend_payload = backend_payload or {}
        target_level = self._comment_record_text(target.get("targetLevel") or target.get("level") or "top", 24).lower()
        level = 1 if target_level == "top" else 2
        thread = self._comment_find_reply_target_thread(result, target) if hasattr(self, "_comment_find_reply_target_thread") else None
        if not isinstance(thread, dict):
            thread = {
                "threadKey": target.get("threadKey") or target.get("targetParentThreadKey"),
                "hasCollapsedReplies": False,
                "hasAuthorReplyInThread": False,
                "replyNeedReason": target.get("replyNeedReason"),
                "replyTargetMessage": target,
            }
        target_message = dict(target)
        target_message.setdefault("messageKey", target.get("targetMessageKey") or target.get("messageKey") or target.get("signature"))
        target_message.setdefault("author", target.get("author"))
        target_message.setdefault("content", target.get("content"))
        target_message.setdefault("timeText", target.get("timeText"))
        target_message["isAuthor"] = False
        _, item = self._comment_record_build_message(result, thread, target_message, level=level, nested_index=int(target.get("targetIndex", 0) or 0))
        intent_level = self._comment_record_text(backend_payload.get("intentLevel") or ("none" if skip else target.get("intentLevel") or "medium"), 32)
        item.update({
            "shouldReply": not skip,
            "skipReply": bool(skip),
            "skipReason": self._comment_record_text(backend_payload.get("skipReason") or reason, 1000) if skip else "",
            "commentType": self._comment_record_text(backend_payload.get("commentType") or ("skip" if skip else target.get("replyNeedReason") or "unknown"), 64),
            "intentLevel": intent_level or "none",
            "intentLabel": self._comment_record_text(backend_payload.get("intentLabel"), 32) or ({"high": "高意向", "medium": "中意向", "low": "低意向"}.get(intent_level, "完全无意向")),
            "judgeReason": self._comment_record_text(backend_payload.get("judgeReason") or reason or target.get("replyNeedReason"), 2000),
            "replyStatus": "not_required" if skip else self._comment_record_text(status, 32) or "generated",
            "replyContent": "" if skip else self._comment_record_text(reply_text, 4000),
            "replyTime": "" if (skip or status == "failed") else iso_utc(),
            "failReason": self._comment_record_text(fail_reason, 1000) if status == "failed" else "",
            "replyAttemptId": self._comment_record_text(backend_payload.get("replyAttemptId") or target.get("replyAttemptId"), 256),
            "replyTraceId": self._comment_record_text(backend_payload.get("replyTraceId") or target.get("replyTraceId"), 512),
            "generationSource": self._comment_record_text(backend_payload.get("source") or backend_payload.get("generationSource") or target.get("generationSource"), 64),
        })
        return item

    def _comment_record_reply_state(
        self,
        result: dict[str, Any] | None,
        target: dict[str, Any],
        *,
        reply_text: str = "",
        status: str = "generated",
        skip: bool = False,
        reason: str = "",
        backend_payload: dict[str, Any] | None = None,
        fail_reason: str = "",
    ) -> dict[str, Any]:
        item = self._comment_build_remote_record_for_target(
            result,
            target,
            reply_text=reply_text,
            status=status,
            skip=skip,
            reason=reason,
            backend_payload=backend_payload,
            fail_reason=fail_reason,
        )
        local_reply_status = {
            "generated": "draft_generated",
            "sent": "sent",
            "failed": "send_failed",
        }.get(status, "not_attempted")
        if skip:
            local_reply_status = "not_attempted"
        source_time = self._comment_record_normalized_time(target.get("timeText"))
        local_payload = {
            "comment_id": item.get("recordId"),
            "platform": "DOUYIN",
            "external_comment_id": item.get("externalCommentId"),
            "video_id": item.get("videoId"),
            "video_title": item.get("videoTitle"),
            "parent_comment_id": item.get("parentRecordId") or "",
            "root_comment_id": item.get("rootRecordId") or item.get("recordId"),
            "comment_level": int(item.get("depth", 0) or 0) + 1,
            "author_key": self._comment_record_author_key(str(item.get("userNickname") or ""), "user", str(item.get("videoId") or "")),
            "author_display": item.get("userNickname"),
            "sender_role": "user",
            "actor_source": "platform_user",
            "attribution_confidence": "verified",
            "text_content": item.get("commentContent") if item.get("messageType") == "text" else "",
            "message_type": item.get("messageType") or "text",
            "type_placeholder": item.get("typePlaceholder") or "",
            **source_time,
            "collection_status": item.get("collectionStatus") or "observed",
            "candidate_status": "excluded_by_policy" if skip else ("deferred_technical" if status == "failed" else "eligible_queued"),
            "analysis_status": "not_required" if skip else ("failed" if status == "failed" else "completed"),
            "reply_status": local_reply_status,
            "resolution_status": "resolved_no_reply" if skip else ("resolved" if status == "sent" else "pending"),
            "current_filter": item.get("currentFilter") or "",
            "replies_collapsed": bool(item.get("repliesCollapsed")),
            "thread_completeness": item.get("threadCompleteness") or "",
            "reply_attempt_id": item.get("replyAttemptId") or "",
            "reply_trace_id": item.get("replyTraceId") or "",
            "generation_source": item.get("generationSource") or "",
            "source_robot_id": self._comment_record_text(getattr(getattr(self, "account", None), "id", ""), 128),
            "source_client_id": self._comment_record_text(getattr(self._comment_record_service(), "client_id", ""), 128),
        }
        self._comment_record_submit_local(local_payload)
        service = self._comment_record_service()
        if service is not None and item.get("recordId") and not skip:
            attempt_id = self._comment_record_text(item.get("replyAttemptId"), 256) or ("attempt_" + self._comment_record_fingerprint("comment", item.get("recordId"))[:40])
            attempt_status = {
                "generated": "draft_generated",
                "sent": "sent",
                "failed": "send_failed",
            }.get(status, status or "not_attempted")
            now = iso_utc()
            service.submit_for_account(
                getattr(self, "account", None),
                event_type="reply_attempt_upsert",
                payload={
                    "attempt_id": attempt_id,
                    "target_type": "comment",
                    "target_id": item.get("recordId"),
                    "draft_text": reply_text,
                    "actual_text": reply_text if status == "sent" else "",
                    "status": attempt_status,
                    "attempted_at_utc": now if status in {"generated", "sent", "failed"} else "",
                    "confirmed_at_utc": now if status == "sent" else "",
                    "error_code": "send_unconfirmed" if status == "failed" else "",
                    "error_message": fail_reason if status == "failed" else "",
                    "reply_trace_id": item.get("replyTraceId") or "",
                    "generation_source": item.get("generationSource") or "",
                },
                event_id=f"comment-attempt:{attempt_id}:{attempt_status}:{self._comment_record_fingerprint(reply_text, fail_reason)[:16]}",
            )
        return item
