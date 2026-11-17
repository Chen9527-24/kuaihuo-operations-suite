from __future__ import annotations

from concurrent.futures import Future, ThreadPoolExecutor
from datetime import datetime, timezone
import hashlib
import json
import re
import time
import threading
from typing import Any

from app.services.local_records.normalizers import iso_utc


class WeChatVideoCommentRecordingRuntime:
    """Side-channel persistence and context builder for 视频号 comments.

    The API polling/reply flow stays authoritative. Recording is intentionally
    isolated: local SQLite failures and Core Nexus sync failures are logged and
    swallowed so the existing 视频号 comment loop keeps running.
    """

    _BATCH_LIMIT = 80

    def __init__(self, owner: Any) -> None:
        self.owner = owner
        self._state: dict[str, Any] = {
            "local_hashes": {},
            "remote_hashes": {},
            "remote_pending": {},
            "remote_queued_hashes": {},
            "future": None,
            "future_meta": {},
            "executor": ThreadPoolExecutor(max_workers=1, thread_name_prefix="wx-comment-record-sync"),
            "last_summary_signature": "",
            "last_summary_ms": 0,
            "lock": threading.RLock(),
        }
        self._store_id = ""

    @staticmethod
    def _text(value: Any, limit: int = 4000) -> str:
        return re.sub(r"\s+", " ", str(value or "").replace("\x00", " ")).strip()[:limit]

    @staticmethod
    def _fingerprint(*parts: Any) -> str:
        payload = json.dumps([str(part or "") for part in parts], ensure_ascii=False, separators=(",", ":"), sort_keys=True)
        return hashlib.sha256(payload.encode("utf-8")).hexdigest()

    def _service(self) -> Any | None:
        service = getattr(self.owner, "record_service", None)
        if service is None:
            return None
        if str(getattr(service, "state", "") or "").endswith("CLOSED"):
            return None
        return service

    def _record_store_id(self) -> str:
        if self._store_id:
            return self._store_id
        service = self._service()
        if service is None:
            return ""
        try:
            self._store_id = self._text(service.store_id_for(getattr(self.owner, "account", None)), 80)
        except Exception:
            self._store_id = ""
        return self._store_id

    def _platform_record_id(self, raw_comment_id: Any) -> str:
        raw = self._text(raw_comment_id, 220)
        return f"wxvcmt_{raw}" if raw else ""

    def root_record_id(self, root: dict[str, Any]) -> str:
        return self._platform_record_id(root.get("commentId"))

    def record_id(self, node: dict[str, Any]) -> str:
        return self._platform_record_id(node.get("commentId"))

    @staticmethod
    def _timestamp_value(node: dict[str, Any]) -> int:
        for key in ("commentCreatetime", "createTime", "ts", "timestamp"):
            try:
                value = int(float(node.get(key) or 0))
            except Exception:
                value = 0
            if value:
                return value
        return 0

    def _time_data(self, node: dict[str, Any]) -> dict[str, str]:
        raw_value = self._timestamp_value(node)
        now = iso_utc()
        if raw_value:
            seconds = raw_value / 1000.0 if raw_value > 10_000_000_000 else float(raw_value)
            try:
                source_utc = datetime.fromtimestamp(seconds, tz=timezone.utc).isoformat().replace("+00:00", "Z")
                return {
                    "source_time_raw": str(raw_value),
                    "source_timestamp_raw": str(raw_value),
                    "source_time_utc": source_utc,
                    "observed_at_utc": now,
                    "first_observed_at_utc": now,
                    "last_observed_at_utc": now,
                    "time_accuracy": "platform_timestamp",
                    "source_timezone": "Asia/Shanghai",
                    "business_timezone": "Asia/Shanghai",
                    "time_parser_version": "1",
                }
            except Exception:
                pass
        return {
            "source_time_raw": "",
            "source_timestamp_raw": "",
            "source_time_utc": "",
            "observed_at_utc": now,
            "first_observed_at_utc": now,
            "last_observed_at_utc": now,
            "time_accuracy": "live_observation",
            "source_timezone": "Asia/Shanghai",
            "business_timezone": "Asia/Shanghai",
            "time_parser_version": "1",
        }

    def _post_context(self, post: dict[str, Any]) -> dict[str, str]:
        export_id = self._text(post.get("exportId"), 220)
        title = self._text(post.get("description") or post.get("title") or export_id or "未识别作品", 1000)
        return {"video_id": export_id or f"wxvpost_{self._fingerprint(title)[:32]}", "video_title": title}

    def _thread_partial(self, root: dict[str, Any]) -> bool:
        replies = root.get("levelTwoComment") if isinstance(root.get("levelTwoComment"), list) else []
        declared = 0
        for key in ("levelTwoCommentCount", "replyCommentCount", "replyCount", "commentCount"):
            try:
                declared = max(declared, int(root.get(key) or 0))
            except Exception:
                continue
        return bool(root.get("levelTwoContinueFlag") or root.get("downContinueFlag") or (declared and declared > len(replies)))

    def _logical_depth_map(self, root: dict[str, Any]) -> dict[str, int]:
        root_raw_id = self._text(root.get("commentId"), 220)
        depths: dict[str, int] = {root_raw_id: 0} if root_raw_id else {}
        replies = [node for node in (root.get("levelTwoComment") or []) if isinstance(node, dict)]
        replies.sort(key=self._timestamp_value)
        for node in replies:
            raw_id = self._text(node.get("commentId"), 220)
            if not raw_id:
                continue
            parent_raw = self._text(node.get("replyCommentId") or node.get("parentCommentId") or node.get("toCommentId"), 220)
            parent_depth = depths.get(parent_raw, 0) if parent_raw else 0
            depths[raw_id] = max(1, min(8, parent_depth + 1))
        return depths

    def logical_depth(self, root: dict[str, Any], node: dict[str, Any]) -> int:
        raw_id = self._text(node.get("commentId"), 220)
        if raw_id and raw_id == self._text(root.get("commentId"), 220):
            return 0
        return self._logical_depth_map(root).get(raw_id, 1)

    def _message_payloads(
        self,
        post: dict[str, Any],
        root: dict[str, Any],
        node: dict[str, Any],
        *,
        depth: int,
        finder_username: str,
        outcome: dict[str, Any] | None = None,
    ) -> tuple[dict[str, Any], dict[str, Any]]:
        outcome = dict(outcome or {})
        ids = self._post_context(post)
        record_id = self.record_id(node)
        root_record_id = self.root_record_id(root) or record_id
        raw_comment_id = self._text(node.get("commentId"), 220)
        raw_root_id = self._text(root.get("commentId"), 220)
        username = self._text(node.get("username"), 220)
        nickname = self._text(node.get("nickname") or node.get("nickName") or username or "未知用户", 220)
        content = self._text(node.get("commentContent") or node.get("content"), 4000)
        sender_role = "account" if username and username == self._text(finder_username, 220) else "user"
        actor_source = "platform_account" if sender_role == "account" else "platform_user"
        attribution = "verified"
        time_data = self._time_data(node)
        partial = self._thread_partial(root)
        collection_status = "partial_thread" if partial else "complete_visible_thread"
        thread_completeness = "partial_api_thread" if partial else "api_visible_complete"
        parent_raw = self._text(node.get("replyCommentId") or node.get("parentCommentId"), 220)
        parent_id = self._platform_record_id(parent_raw) if parent_raw and parent_raw != raw_comment_id else ""
        if depth > 0 and not parent_id:
            parent_id = root_record_id
        reply_status = self._text(outcome.get("replyStatus"), 64) or ("manual" if sender_role == "account" else "pending")
        should_reply = bool(outcome.get("shouldReply", False))
        skip_reply = bool(outcome.get("skipReply", False))
        local_reply_status = {
            "pending": "not_attempted",
            "generated": "draft_generated",
            "failed": "send_failed",
            "sent_unconfirmed": "send_unconfirmed",
            "manual": "manual_or_external_reply",
            "not_required": "not_attempted",
            "sent": "sent",
        }.get(reply_status, reply_status)
        if reply_status == "not_required":
            candidate_status = "excluded_by_policy"
            analysis_status = "not_required"
            resolution_status = "resolved_no_reply"
        elif reply_status == "failed":
            candidate_status = "deferred_technical"
            analysis_status = "failed"
            resolution_status = "pending_retry"
        elif reply_status == "sent_unconfirmed":
            candidate_status = "eligible_queued"
            analysis_status = "completed"
            resolution_status = "pending_confirmation"
        elif reply_status == "sent":
            candidate_status = "existing_processed"
            analysis_status = "completed"
            resolution_status = "resolved"
        elif sender_role == "account":
            candidate_status = "author_already_replied"
            analysis_status = "not_started"
            resolution_status = "observed"
        else:
            candidate_status = "eligible" if should_reply else "observed"
            analysis_status = "completed" if outcome else "not_started"
            resolution_status = "observed"
        reply_content = self._text(outcome.get("replyContent"), 4000)
        reply_time = self._text(outcome.get("replyTime"), 80)
        fail_reason = self._text(outcome.get("failReason"), 800)
        local_payload = {
            "comment_id": record_id,
            "platform": "WECHAT_VIDEO",
            "external_comment_id": raw_comment_id,
            "video_id": ids["video_id"],
            "video_title": ids["video_title"],
            "parent_comment_id": parent_id,
            "root_comment_id": root_record_id,
            "comment_level": max(1, depth + 1),
            "author_key": f"wxvauthor_{self._fingerprint(ids['video_id'], username or nickname)[:32]}",
            "author_display": nickname,
            "sender_role": sender_role,
            "actor_source": actor_source,
            "attribution_confidence": attribution,
            "text_content": content,
            "message_type": "text",
            "type_placeholder": "",
            **time_data,
            "collection_status": collection_status,
            "candidate_status": candidate_status,
            "analysis_status": analysis_status,
            "reply_status": local_reply_status,
            "resolution_status": resolution_status,
            "current_filter": "视频号接口全量评论",
            "replies_collapsed": partial,
            "thread_completeness": thread_completeness,
            "reply_attempt_id": self._text(outcome.get("replyAttemptId"), 256),
            "reply_trace_id": self._text(outcome.get("replyTraceId"), 512),
            "generation_source": self._text(outcome.get("generationSource"), 64),
            "source_robot_id": self._text(getattr(getattr(self.owner, "account", None), "id", ""), 128),
            "source_client_id": self._text(getattr(self._service(), "client_id", ""), 128),
        }
        remote_item = {
            "recordId": record_id,
            "externalCommentId": raw_comment_id,
            "videoId": ids["video_id"],
            "videoTitle": ids["video_title"],
            "rootRecordId": root_record_id,
            "parentRecordId": parent_id or None,
            "depth": max(0, depth),
            "senderRole": sender_role,
            "actorSource": actor_source,
            "attributionConfidence": attribution,
            "userNickname": nickname,
            "commentContent": content or "[其他类型消息]",
            "messageType": "text" if content else "unknown",
            "typePlaceholder": "" if content else "[其他类型消息]",
            "commentTime": time_data.get("source_time_utc") or "",
            "sourceTimeRaw": time_data.get("source_time_raw") or "",
            "observedAt": time_data.get("observed_at_utc") or iso_utc(),
            "timeAccuracy": time_data.get("time_accuracy") or "unknown",
            "collectionStatus": collection_status,
            "currentFilter": "视频号接口全量评论",
            "repliesCollapsed": partial,
            "threadCompleteness": thread_completeness,
            "shouldReply": should_reply,
            "skipReply": skip_reply,
            "skipReason": self._text(outcome.get("skipReason"), 800),
            "commentType": self._text(outcome.get("commentType"), 80) or "wechat_video_comment",
            "intentLevel": self._text(outcome.get("intentLevel"), 32) or "none",
            "intentLabel": self._text(outcome.get("intentLabel"), 80) or "完全无意向",
            "judgeReason": self._text(outcome.get("judgeReason"), 800),
            "replyStatus": reply_status,
            "replyContent": reply_content,
            "replyTime": reply_time,
            "failReason": fail_reason,
            "replyAttemptId": self._text(outcome.get("replyAttemptId"), 256),
            "replyTraceId": self._text(outcome.get("replyTraceId"), 512),
            "generationSource": self._text(outcome.get("generationSource"), 64),
            "sourceClientId": self._text(getattr(self._service(), "client_id", ""), 128),
            "rawRootCommentId": raw_root_id,
        }
        return local_payload, remote_item

    def _payload_hash(self, payload: dict[str, Any]) -> str:
        volatile = {"observed_at_utc", "first_observed_at_utc", "last_observed_at_utc", "observedAt"}
        stable = {key: value for key, value in payload.items() if key not in volatile}
        return self._fingerprint(stable)

    def _submit_local(self, payload: dict[str, Any]) -> None:
        service = self._service()
        store_id = self._record_store_id()
        if service is None or not store_id:
            return
        record_id = self._text(payload.get("comment_id"), 256)
        payload_hash = self._payload_hash(payload)
        if record_id and self._state["local_hashes"].get(record_id) == payload_hash:
            return
        try:
            accepted = bool(service.submit(
                store_id=store_id,
                event_type="comment_upsert",
                payload=payload,
                event_id=f"wx-comment:{record_id}:{payload_hash[:24]}",
            ))
            if accepted and record_id:
                self._state["local_hashes"][record_id] = payload_hash
        except Exception as exc:
            self.owner._log("WARN", f"视频号评论本地记录失败，已旁路忽略：{type(exc).__name__}: {str(exc)[:160]}")

    def _collect_remote(self) -> None:
        future = self._state.get("future")
        if not isinstance(future, Future) or not future.done():
            return
        meta = self._state.get("future_meta") if isinstance(self._state.get("future_meta"), dict) else {}
        self._state["future"] = None
        self._state["future_meta"] = {}
        try:
            response = future.result()
            for record_id, payload_hash in (meta.get("hashes") or {}).items():
                self._state["remote_hashes"][record_id] = payload_hash
                if self._state["remote_queued_hashes"].get(record_id) == payload_hash:
                    self._state["remote_queued_hashes"].pop(record_id, None)
            count = int((response or {}).get("syncedCount", 0) or 0) if isinstance(response, dict) else 0
            if count:
                self.owner._log("INFO", f"视频号评论记录增量同步完成: syncedCount={count}")
        except Exception as exc:
            for record_id, item in (meta.get("items") or {}).items():
                if isinstance(item, dict):
                    self._state["remote_pending"][record_id] = item
                self._state["remote_queued_hashes"].pop(record_id, None)
            self.owner._log("WARN", f"视频号评论服务端同步失败，保留待重试：{type(exc).__name__}: {str(exc)[:180]}")

    def _queue_remote(self, post: dict[str, Any], items: list[dict[str, Any]]) -> None:
        service = getattr(self.owner, "core_service", None)
        if service is None or not hasattr(service, "sync_comment_records"):
            return
        self._collect_remote()
        for item in items:
            record_id = self._text(item.get("recordId"), 256)
            if not record_id:
                continue
            payload_hash = self._payload_hash(item)
            if self._state["remote_hashes"].get(record_id) == payload_hash:
                continue
            if self._state["remote_queued_hashes"].get(record_id) == payload_hash:
                continue
            self._state["remote_pending"][record_id] = dict(item)
            self._state["remote_queued_hashes"][record_id] = payload_hash
        active = self._state.get("future")
        if isinstance(active, Future) and not active.done():
            return
        if not self._state["remote_pending"]:
            return
        ids = list(self._state["remote_pending"].keys())[: self._BATCH_LIMIT]
        batch = {record_id: self._state["remote_pending"].pop(record_id) for record_id in ids}
        hashes = {record_id: self._payload_hash(item) for record_id, item in batch.items()}
        account = getattr(self.owner, "account", None)
        post_ctx = self._post_context(post)
        payload = {
            "robotId": getattr(account, "id", "") or None,
            "module": "comment",
            "platform": "WECHAT_VIDEO",
            "botNickname": getattr(account, "auth_name", "") or getattr(account, "robot_name", "") or getattr(account, "name", "") or "",
            "postTitle": post_ctx["video_title"],
            "comments": list(batch.values()),
        }
        self._state["future_meta"] = {"hashes": hashes, "items": batch}
        future = self._state["executor"].submit(service.sync_comment_records, payload)
        self._state["future"] = future
        future.add_done_callback(lambda _future, post_snapshot=dict(post): self._drain_remote_after_future(post_snapshot))

    def _drain_remote_after_future(self, post: dict[str, Any]) -> None:
        lock = self._state.get("lock")
        try:
            if lock is not None:
                with lock:
                    self._collect_remote()
                    if self._state.get("remote_pending"):
                        self._queue_remote(post, [])
            else:
                self._collect_remote()
                if self._state.get("remote_pending"):
                    self._queue_remote(post, [])
        except Exception as exc:
            self.owner._log("WARN", f"视频号评论待同步队列续传失败，保留下一轮重试：{type(exc).__name__}: {str(exc)[:160]}")

    def observe_post_comments(self, post: dict[str, Any], roots: list[dict[str, Any]], finder_username: str) -> None:
        remote_items: list[dict[str, Any]] = []
        message_count = 0
        for root in roots or []:
            if not isinstance(root, dict) or not self.record_id(root):
                continue
            local, remote = self._message_payloads(post, root, root, depth=0, finder_username=finder_username)
            self._submit_local(local)
            remote_items.append(remote)
            message_count += 1
            replies = root.get("levelTwoComment") if isinstance(root.get("levelTwoComment"), list) else []
            depth_map = self._logical_depth_map(root)
            for node in replies:
                if not isinstance(node, dict) or not self.record_id(node):
                    continue
                depth = depth_map.get(self._text(node.get("commentId"), 220), 1)
                local, remote = self._message_payloads(post, root, node, depth=depth, finder_username=finder_username)
                self._submit_local(local)
                remote_items.append(remote)
                message_count += 1
        if remote_items:
            self._queue_remote(post, remote_items)
        summary = {
            "video": self._post_context(post)["video_title"],
            "threads": len([root for root in roots or [] if isinstance(root, dict)]),
            "visibleMessages": message_count,
            "partialThreads": sum(1 for root in roots or [] if isinstance(root, dict) and self._thread_partial(root)),
        }
        signature = json.dumps(summary, ensure_ascii=False, sort_keys=True)
        now_ms = int(time.time() * 1000)
        if message_count and (signature != self._state.get("last_summary_signature") or now_ms - int(self._state.get("last_summary_ms", 0) or 0) >= 60000):
            self._state["last_summary_signature"] = signature
            self._state["last_summary_ms"] = now_ms
            self.owner._log("INFO", f"视频号评论记录采集摘要: {json.dumps(summary, ensure_ascii=False)}")

    def build_thread_context(self, root: dict[str, Any], target: dict[str, Any], finder_username: str) -> tuple[str, list[dict[str, Any]], str]:
        root_id = self.root_record_id(root)
        target_id = self.record_id(target)
        service = self._service()
        store_id = self._record_store_id()
        rows: list[dict[str, Any]] = []
        if service is not None and store_id and root_id and hasattr(service, "recent_comment_messages"):
            try:
                rows = service.recent_comment_messages(store_id, root_id, limit=20) or []
            except Exception:
                rows = []
        context: list[dict[str, Any]] = []
        for row in rows:
            if not isinstance(row, dict):
                continue
            message_id = self._text(row.get("comment_id"), 256)
            if not message_id or message_id == target_id:
                continue
            content = self._text(row.get("text_content") or row.get("type_placeholder"), 1000)
            if not content:
                continue
            context.append({
                "role": "account" if self._text(row.get("sender_role"), 24).lower() == "account" else "user",
                "author": self._text(row.get("author_display"), 128),
                "content": content,
                "level": max(1, min(9, int(row.get("comment_level") or 1))),
                "messageId": message_id,
            })
        if not context:
            nodes = [root, *[node for node in (root.get("levelTwoComment") or []) if isinstance(node, dict)]]
            nodes.sort(key=self._timestamp_value)
            for node in nodes:
                node_id = self.record_id(node)
                if not node_id:
                    continue
                if node_id == target_id:
                    break
                content = self._text(node.get("commentContent") or node.get("content"), 1000)
                if not content:
                    continue
                username = self._text(node.get("username"), 220)
                context.append({
                    "role": "account" if username and username == self._text(finder_username, 220) else "user",
                    "author": self._text(node.get("nickname") or node.get("nickName") or username, 128),
                    "content": content,
                    "level": self.logical_depth(root, node) + 1,
                    "messageId": node_id,
                })
        if len(context) > 10:
            context = [context[0], *context[-9:]]
        return root_id, context, "local_sqlite" if rows else "wechat_api_thread" if context else "none"

    def update_target_outcome(
        self,
        post: dict[str, Any],
        root: dict[str, Any],
        target: dict[str, Any],
        finder_username: str,
        *,
        outcome: dict[str, Any],
    ) -> None:
        depth = self.logical_depth(root, target)
        local, remote = self._message_payloads(post, root, target, depth=depth, finder_username=finder_username, outcome=outcome)
        self._submit_local(local)
        self._queue_remote(post, [remote])

    def record_reply_attempt(
        self,
        *,
        attempt_id: str,
        target_record_id: str,
        draft_text: str,
        actual_text: str,
        status: str,
        error_code: str = "",
        error_message: str = "",
        confirmed: bool = False,
        reply_trace_id: str = "",
        generation_source: str = "",
    ) -> None:
        service = self._service()
        store_id = self._record_store_id()
        if service is None or not store_id or not attempt_id or not target_record_id:
            return
        now = iso_utc()
        payload = {
            "attempt_id": self._text(attempt_id, 128),
            "target_type": "comment",
            "target_id": self._text(target_record_id, 256),
            "conversation_id": "",
            "draft_text": self._text(draft_text, 4000),
            "actual_text": self._text(actual_text, 4000),
            "status": self._text(status, 64),
            "attempted_at_utc": now,
            "confirmed_at_utc": now if confirmed else "",
            "error_code": self._text(error_code, 128),
            "error_message": self._text(error_message, 800),
            "reply_trace_id": self._text(reply_trace_id, 512),
            "generation_source": self._text(generation_source, 64),
            "source_robot_id": self._text(getattr(getattr(self.owner, "account", None), "id", ""), 128),
            "source_client_id": self._text(getattr(service, "client_id", ""), 128),
        }
        try:
            service.submit(
                store_id=store_id,
                event_type="reply_attempt_upsert",
                payload=payload,
                event_id=f"wx-comment-attempt:{attempt_id}:{status}",
            )
        except Exception as exc:
            self.owner._log("WARN", f"视频号评论回复事务记录失败，已旁路忽略：{type(exc).__name__}: {str(exc)[:160]}")

    def close(self) -> None:
        try:
            self._collect_remote()
        except Exception:
            pass
        executor = self._state.get("executor")
        if isinstance(executor, ThreadPoolExecutor):
            executor.shutdown(wait=False, cancel_futures=False)
