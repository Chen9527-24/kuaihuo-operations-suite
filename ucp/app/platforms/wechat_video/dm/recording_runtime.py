from __future__ import annotations

from datetime import datetime, timezone
import json
import re
from typing import Any

from app.services.local_records.normalizers import iso_utc


_MESSAGE_TYPE_BY_CODE: dict[int, tuple[str, str]] = {
    1: ("text", ""),
    3: ("image", "[图片]"),
    34: ("voice", "[语音]"),
    43: ("video", "[视频]"),
    47: ("emoji", "[表情]"),
    49: ("card", "[卡片]"),
}


class WeChatVideoDMRecordingRuntime:
    """Failure-isolated recording/context side channel for 视频号私信.

    The existing polling, aggregation and platform-send path remains authoritative.
    This helper only persists a cleaned whitelist, resolves the canonical server
    conversation and supplies safe history to the existing reply endpoint.
    """

    TERMINAL_ATTEMPT_STATUSES = {"sent", "sent_late_confirmed", "not_required"}

    def __init__(self, owner: Any) -> None:
        self.owner = owner
        self._store_id = ""
        self._identity_signature: tuple[str, ...] | None = None
        self._remote_by_local: dict[str, dict[str, Any]] = {}
        self._pending_outgoing_by_session: dict[str, list[dict[str, Any]]] = {}

    @staticmethod
    def _text(value: Any, limit: int = 20000) -> str:
        return re.sub(r"\s+", " ", str(value or "")).strip()[:limit]

    def _log(self, level: str, message: str) -> None:
        try:
            self.owner._log(level, message)
        except Exception:
            pass

    def _service(self) -> Any | None:
        service = getattr(self.owner, "record_service", None)
        if service is None:
            return None
        if str(getattr(service, "state", "")).endswith("CLOSED"):
            return None
        return service

    def store_id(self) -> str:
        service = self._service()
        account = getattr(self.owner, "account", None)
        signature = (
            str(getattr(account, "tenant_id", "") or ""),
            str(getattr(account, "platform", "") or ""),
            str(getattr(account, "id", "") or ""),
            str(getattr(account, "auth_id", "") or ""),
            str(getattr(account, "auth_uid", "") or ""),
        )
        if self._store_id and self._identity_signature == signature:
            return self._store_id
        if service is None:
            return ""
        try:
            value = str(service.store_id_for(account) or "")
        except Exception:
            return ""
        if value:
            self._store_id = value
            self._identity_signature = signature
        return value

    def chat_type(self, msg: dict[str, Any]) -> str:
        # 视频号当前两个页面 Tab 会返回同一条 get-new-msg 消息流，不能仅凭
        # “当前点击了哪个 Tab”把同一个 session 拆成 friend/stranger 两个身份域。
        # 真实身份以稳定 sessionId 为准，Tab 仅保留为采集来源。
        return "private_all"

    def local_conversation_id(self, session_id: str) -> str:
        service = self._service()
        store_id = self.store_id()
        session_id = self._text(session_id, 180)
        if not service or not store_id or not session_id:
            return ""
        return "conv_" + service.message_fingerprint(
            store_id, "WECHAT_VIDEO", "dm", session_id
        )[:32]

    def _participant(self, msg: dict[str, Any]) -> tuple[str, str]:
        display = self._text(
            msg.get("nickname") or msg.get("fromNickname") or msg.get("fromUsername") or msg.get("sessionId"),
            256,
        ) or "未知用户"
        service = self._service()
        store_id = self.store_id()
        session_id = self._text(msg.get("sessionId"), 180)
        key = ""
        if service and store_id:
            key = "participant_" + service.message_fingerprint(store_id, "WECHAT_VIDEO", session_id)[:28]
        return key, display

    def _message_shape(self, msg: dict[str, Any]) -> tuple[str, str, str, str]:
        raw = msg.get("raw") if isinstance(msg.get("raw"), dict) else {}
        try:
            code = int(raw.get("msgType") or msg.get("msgType") or 0)
        except Exception:
            code = 0
        explicit_type = self._text(msg.get("messageType"), 32).lower()
        explicit_placeholder = self._text(msg.get("typePlaceholder"), 64)
        text = self._text(msg.get("text"), 20000)
        if explicit_type:
            message_type = explicit_type
            placeholder = explicit_placeholder
        else:
            message_type, placeholder = _MESSAGE_TYPE_BY_CODE.get(code, ("unknown", "[其他类型消息]"))
        if message_type == "text" and not text:
            message_type, placeholder = ("unknown", explicit_placeholder or "[其他类型消息]")
        if message_type != "text":
            text = ""
        return message_type, text, placeholder, str(code or "")


    @staticmethod
    def _sequence_index(value: Any) -> int:
        """Normalize platform timestamps/sequences into Prisma Int32 safely.

        Incoming 视频号 timestamps may be seconds while UCP synthetic outgoing
        timestamps are milliseconds.  Core Nexus stores sequenceIndex as a signed
        32-bit Int, so millisecond epochs must be reduced to seconds.
        """
        try:
            number = int(float(value or 0))
        except Exception:
            return 0
        while abs(number) > 2_147_483_647:
            number //= 1000
        return max(-2_147_483_648, min(2_147_483_647, number))

    def _observed_time(self, msg: dict[str, Any]) -> dict[str, str]:
        service = self._service()
        if service is None:
            now = iso_utc()
            return {
                "source_time_raw": "",
                "source_timestamp_raw": self._text(msg.get("ts"), 128),
                "source_time_utc": "",
                "observed_at_utc": now,
                "first_observed_at_utc": now,
                "last_observed_at_utc": now,
                "time_accuracy": "live_observed",
                "source_timezone": "Asia/Shanghai",
                "business_timezone": "Asia/Shanghai",
            }
        try:
            return service.normalized_time(
                source_timestamp_raw=msg.get("ts") or "",
                observed_at=datetime.now(tz=timezone.utc),
                source_timezone="Asia/Shanghai",
                is_live_observation=True,
            )
        except Exception:
            now = iso_utc()
            return {
                "source_time_raw": "",
                "source_timestamp_raw": self._text(msg.get("ts"), 128),
                "source_time_utc": "",
                "observed_at_utc": now,
                "first_observed_at_utc": now,
                "last_observed_at_utc": now,
                "time_accuracy": "live_observed",
                "source_timezone": "Asia/Shanghai",
                "business_timezone": "Asia/Shanghai",
            }

    def local_message_id(self, msg: dict[str, Any]) -> str:
        service = self._service()
        store_id = self.store_id()
        session_id = self._text(msg.get("sessionId"), 180)
        platform_id = self._text(msg.get("_localMessageSeed") or msg.get("msgId"), 180)
        sender = self._text(msg.get("sender"), 16)
        if not service or not store_id or not session_id:
            return ""
        if not platform_id:
            message_type, text, placeholder, code = self._message_shape(msg)
            platform_id = service.message_fingerprint(
                session_id, sender, msg.get("ts"), code, message_type, text, placeholder
            )[:40]
        return "msg_" + service.message_fingerprint(
            store_id, "WECHAT_VIDEO", session_id, platform_id, sender
        )[:32]

    def observe_messages(self, messages: list[dict[str, Any]], *, source: str, tab: str) -> int:
        count = 0
        for msg in messages:
            if not isinstance(msg, dict):
                continue
            msg["_sourceTab"] = self._text(msg.get("_sourceTab") or tab, 64)
            msg["_captureSource"] = self._text(msg.get("_captureSource") or source, 64)
            if self._text(msg.get("sender"), 16) == "self":
                self._bind_self_echo(msg)
            if self.persist_message(
                msg, reply_attempt_id=self._text(msg.get("_replyAttemptId"), 256)
            ):
                count += 1
        if count:
            self._log("INFO", f"视频号私信本地记录已更新：observed={count} source={source} tab={tab}")
        return count

    @staticmethod
    def _epoch_ms(value: Any) -> int:
        try:
            number = int(float(value or 0))
        except Exception:
            return 0
        if 0 < abs(number) < 10_000_000_000:
            number *= 1000
        return number

    def _self_echo_keys(self, msg: dict[str, Any], text: str) -> set[str]:
        raw = msg.get("raw") if isinstance(msg.get("raw"), dict) else {}
        keys: set[str] = set()
        for value in (
            msg.get("msgId"),
            raw.get("svrMsgId"),
            raw.get("msgId"),
            raw.get("seq"),
            raw.get("cliMsgId"),
        ):
            cleaned = self._text(value, 180)
            if cleaned:
                keys.add(f"id:{cleaned}")
        observed_ms = self._epoch_ms(msg.get("ts") or raw.get("createTime") or raw.get("ts"))
        if observed_ms:
            keys.add(f"time-text:{observed_ms // 1000}:{text}")
        return keys

    def _bind_self_echo(self, msg: dict[str, Any]) -> None:
        session_id = self._text(msg.get("sessionId"), 180)
        text = self._text(msg.get("text"), 20000)
        if not session_id or not text:
            return
        now_ms = int(datetime.now(tz=timezone.utc).timestamp() * 1000)
        pending = self._pending_outgoing_by_session.get(session_id) or []
        pending = [
            item for item in pending
            if now_ms - int(item.get("sentAtMs") or 0) <= 10 * 60 * 1000
        ]
        if not pending:
            self._pending_outgoing_by_session.pop(session_id, None)
            return

        echo_keys = self._self_echo_keys(msg, text)
        matched: dict[str, Any] | None = None

        # A previously bound platform echo may be returned repeatedly by both tabs and
        # by xhr/page polling. Keep the outgoing transaction alive so every copy reuses
        # the same local client message ID instead of becoming a second account message.
        for item in reversed(pending):
            known_keys = set(item.get("echoKeys") or [])
            if echo_keys and known_keys.intersection(echo_keys):
                matched = item
                break

        if matched is None:
            raw = msg.get("raw") if isinstance(msg.get("raw"), dict) else {}
            echo_at_ms = self._epoch_ms(
                msg.get("ts") or raw.get("createTime") or raw.get("ts")
            ) or now_ms
            # Some page snapshots expose an old/stale timestamp while the echo itself is
            # live. In that case use capture time, preserving the previous safe text match.
            if abs(now_ms - echo_at_ms) > 24 * 60 * 60 * 1000:
                echo_at_ms = now_ms
            candidates = [
                item for item in pending
                if self._text(item.get("text"), 20000) == text
                and echo_at_ms >= int(item.get("sentAtMs") or 0) - 15_000
            ]
            if candidates:
                matched = min(
                    candidates,
                    key=lambda item: (
                        abs(echo_at_ms - int(item.get("sentAtMs") or 0)),
                        -int(item.get("sentAtMs") or 0),
                    ),
                )

        self._pending_outgoing_by_session[session_id] = pending
        if matched:
            known_keys = set(matched.get("echoKeys") or [])
            known_keys.update(echo_keys)
            matched["echoKeys"] = sorted(known_keys)
            matched["lastEchoAtMs"] = now_ms
            matched["echoCount"] = int(matched.get("echoCount") or 0) + 1
            msg["_localMessageSeed"] = self._text(matched.get("clientMessageId"), 180)
            msg["_replyAttemptId"] = self._text(matched.get("attemptId"), 256)
            self._log(
                "INFO",
                "视频号私信发送回显已合并："
                f"session={session_id} confirmMode=platform_self_echo "
                f"echoCount={matched['echoCount']}",
            )

    def sync_session_metadata(self, messages: list[dict[str, Any]]) -> int:
        """Refresh participant display metadata without invoking AI or creating a turn."""
        sessions: dict[str, dict[str, Any]] = {}
        for msg in messages:
            if not isinstance(msg, dict):
                continue
            session_id = self._text(msg.get("sessionId"), 180)
            if session_id:
                sessions[session_id] = msg
        synced = 0
        for session_id, msg in sessions.items():
            local_conversation_id = self.local_conversation_id(session_id)
            if not local_conversation_id:
                continue
            participant_key, participant_display = self._participant(msg)
            ctx = {
                "store_id": self.store_id(),
                "local_conversation_id": local_conversation_id,
                "session_id": session_id,
                "participant_key": participant_key,
                "participant_display": participant_display,
                "chat_type": self.chat_type(msg),
                "current_client_message_ids": [],
            }
            if self.resolve_remote_context(ctx):
                synced += 1
        return synced

    def sync_passive_observations(self, messages: list[dict[str, Any]]) -> int:
        """Sync non-text incoming messages and platform self echoes without invoking AI."""
        sessions: dict[str, dict[str, Any]] = {}
        for msg in messages:
            if not isinstance(msg, dict):
                continue
            message_type, _text, _placeholder, _code = self._message_shape(msg)
            sender = self._text(msg.get("sender"), 16)
            if sender != "self" and message_type == "text":
                continue
            session_id = self._text(msg.get("sessionId"), 180)
            if session_id:
                sessions[session_id] = msg
        synced = 0
        for session_id, msg in sessions.items():
            local_conversation_id = self.local_conversation_id(session_id)
            if not local_conversation_id:
                continue
            participant_key, participant_display = self._participant(msg)
            ctx = {
                "store_id": self.store_id(),
                "local_conversation_id": local_conversation_id,
                "session_id": session_id,
                "participant_key": participant_key,
                "participant_display": participant_display,
                "chat_type": self.chat_type(msg),
                "current_client_message_ids": [],
            }
            if self.resolve_remote_context(ctx):
                synced += 1
        return synced

    def persist_message(
        self,
        msg: dict[str, Any],
        *,
        reply_attempt_id: str = "",
        reply_trace_id: str = "",
        generation_source: str = "",
        force_sender_role: str = "",
        actual_text: str = "",
    ) -> bool:
        service = self._service()
        store_id = self.store_id()
        session_id = self._text(msg.get("sessionId"), 180)
        conversation_id = self.local_conversation_id(session_id)
        message_id = self.local_message_id(msg)
        if not service or not store_id or not session_id or not conversation_id or not message_id:
            return False
        participant_key, participant_display = self._participant(msg)
        sender = self._text(msg.get("sender"), 16)
        sender_role = force_sender_role or ("account" if sender == "self" else "user")
        message_type, text, placeholder, source_code = self._message_shape(msg)
        if actual_text:
            message_type, text, placeholder = "text", self._text(actual_text), ""
        timing = self._observed_time(msg)
        raw = msg.get("raw") if isinstance(msg.get("raw"), dict) else {}
        sequence = self._sequence_index(raw.get("seq") or msg.get("ts") or msg.get("msgId") or 0)
        platform_message_id = self._text(msg.get("msgId"), 180)
        bot_display = self._text(
            getattr(getattr(self.owner, "account", None), "auth_name", "")
            or getattr(getattr(self.owner, "account", None), "name", "")
            or "视频号账号",
            256,
        )
        payload = {
            "message_id": message_id,
            "conversation_id": conversation_id,
            "platform": "WECHAT_VIDEO",
            "channel_type": "dm",
            "external_conversation_id": session_id,
            "title": participant_display,
            "participant_key": participant_key,
            "participant_display": participant_display,
            "is_group": False,
            "platform_message_id": platform_message_id,
            "sender_role": sender_role,
            "sender_key": self._text(msg.get("fromUsername") if sender_role == "user" else "account", 256),
            "sender_display": participant_display if sender_role == "user" else bot_display,
            "actor_source": (
                "platform_user"
                if sender_role == "user"
                else "ucp_robot"
                if self._text(reply_attempt_id, 256)
                else "account_manual"
            ),
            "attribution_confidence": "verified" if sender_role == "account" and self._text(reply_attempt_id, 256) else "confirmed",
            "message_type": message_type,
            "text_content": text,
            "type_placeholder": placeholder,
            "source_type_code": source_code,
            "classification_source": "wechat_video_msg_type",
            "sequence_index": sequence,
            "history_kind": "live_observed",
            "payload_fingerprint": service.message_fingerprint(
                session_id, platform_message_id, sender_role, message_type, text, placeholder
            ),
            "reply_attempt_id": self._text(reply_attempt_id, 256),
            "reply_trace_id": self._text(reply_trace_id, 512),
            "generation_source": self._text(generation_source, 64),
            "source_robot_id": str(getattr(getattr(self.owner, "account", None), "id", "") or ""),
            "source_client_id": str(getattr(service, "client_id", "") or ""),
            **timing,
        }
        try:
            return bool(service.submit(store_id=store_id, event_type="message_upsert", payload=payload))
        except Exception:
            return False

    def _aggregate_messages(self, msg: dict[str, Any]) -> list[dict[str, Any]]:
        rows = msg.get("_aggregateMessages") if isinstance(msg.get("_aggregateMessages"), list) else [msg]
        return [item for item in rows if isinstance(item, dict)]

    def _flow_ids(self, msg: dict[str, Any]) -> dict[str, str]:
        service = self._service()
        store_id = self.store_id()
        local_conversation_id = self.local_conversation_id(self._text(msg.get("sessionId"), 180))
        keys = [self._text(item.get("msgId"), 180) for item in self._aggregate_messages(msg)]
        token = "|".join(item for item in keys if item) or self._text(msg.get("msgId"), 180)
        if not service or not store_id or not local_conversation_id:
            return {}
        turn_id = "turn_" + service.message_fingerprint(store_id, local_conversation_id, token)[:32]
        return {
            "turn_id": turn_id,
            "attempt_id": "attempt_" + service.message_fingerprint(store_id, turn_id, "reply")[:32],
            "analysis_id": "analysis_" + service.message_fingerprint(store_id, turn_id, "auto_reply")[:32],
            "local_conversation_id": local_conversation_id,
        }

    def is_terminally_processed(self, msg: dict[str, Any]) -> tuple[bool, str]:
        service = self._service()
        ids = self._flow_ids(msg)
        if service is None or not ids or not hasattr(service, "reply_attempt_status"):
            return False, ""
        try:
            status = self._text(service.reply_attempt_status(self.store_id(), ids["attempt_id"]), 64)
        except Exception:
            return False, ""
        return status in self.TERMINAL_ATTEMPT_STATUSES, status

    def begin_turn(self, msg: dict[str, Any]) -> dict[str, Any]:
        service = self._service()
        store_id = self.store_id()
        ids = self._flow_ids(msg)
        session_id = self._text(msg.get("sessionId"), 180)
        if service is None or not store_id or not ids or not session_id:
            return {**ids, "store_id": store_id}
        participant_key, participant_display = self._participant(msg)
        now = iso_utc()
        aggregated_text = self._text(msg.get("text"), 4000)
        ctx = {
            **ids,
            "store_id": store_id,
            "session_id": session_id,
            "participant_key": participant_key,
            "participant_display": participant_display,
            "chat_type": self.chat_type(msg),
            "current_client_message_ids": [],
            "canonical_conversation_id": "",
            "workflow_conversation_id": "",
        }
        try:
            service.submit(store_id=store_id, event_type="turn_upsert", payload={
                "turn_id": ids["turn_id"],
                "conversation_id": ids["local_conversation_id"],
                "platform": "WECHAT_VIDEO",
                "channel_type": "dm",
                "external_conversation_id": session_id,
                "title": participant_display,
                "participant_key": participant_key,
                "participant_display": participant_display,
                "is_group": False,
                "aggregated_text": aggregated_text,
                "started_at_utc": now,
                "first_observed_at_utc": now,
                "last_observed_at_utc": now,
            })
            for position, item in enumerate(self._aggregate_messages(msg), start=1):
                self.persist_message(item)
                local_message_id = self.local_message_id(item)
                if local_message_id:
                    ctx["current_client_message_ids"].append(local_message_id)
                    service.submit(store_id=store_id, event_type="turn_message_link", payload={
                        "turn_id": ids["turn_id"],
                        "message_id": local_message_id,
                        "position": position,
                    })
            service.submit(store_id=store_id, event_type="analysis_upsert", payload={
                "analysis_id": ids["analysis_id"],
                "target_type": "turn",
                "target_id": ids["turn_id"],
                "analysis_type": "dm_auto_reply",
                "status": "pending",
                "started_at_utc": now,
            })
            service.submit(store_id=store_id, event_type="reply_attempt_upsert", payload={
                "attempt_id": ids["attempt_id"],
                "target_type": "turn",
                "target_id": ids["turn_id"],
                "conversation_id": ids["local_conversation_id"],
                "status": "pending",
                "source_robot_id": str(getattr(getattr(self.owner, "account", None), "id", "") or ""),
                "source_client_id": str(getattr(service, "client_id", "") or ""),
            })
        except Exception:
            pass
        remote = self.resolve_remote_context(ctx)
        if remote:
            ctx["canonical_conversation_id"] = self._text(remote.get("canonicalConversationId"), 256)
            ctx["workflow_conversation_id"] = self._text(remote.get("workflowConversationId"), 256)
            ctx["identity_status"] = self._text(remote.get("identityStatus"), 32)
            ctx["context_count"] = len(remote.get("contextMessages") or [])
        return ctx

    @staticmethod
    def _remote_message(row: dict[str, Any]) -> dict[str, Any]:
        return {
            "clientMessageId": str(row.get("message_id") or "")[:256],
            "sourceClientId": str(row.get("source_client_id") or "")[:128],
            "senderRole": str(row.get("sender_role") or "user")[:32],
            "actorSource": str(row.get("actor_source") or "")[:64],
            "attributionConfidence": str(row.get("attribution_confidence") or "")[:32],
            "messageType": str(row.get("message_type") or "unknown")[:32],
            "textContent": str(row.get("text_content") or "")[:20000],
            "typePlaceholder": str(row.get("type_placeholder") or "")[:64],
            "sequenceIndex": int(row.get("sequence_index") or 0),
            "observedAtUtc": str(row.get("observed_at_utc") or "")[:64],
            "historyKind": str(row.get("history_kind") or "")[:32],
            "timeAccuracy": str(row.get("time_accuracy") or "")[:32],
            "payloadFingerprint": str(row.get("payload_fingerprint") or "")[:128],
            "replyAttemptId": str(row.get("reply_attempt_id") or "")[:256],
            "replyTraceId": str(row.get("reply_trace_id") or "")[:512],
            "generationSource": str(row.get("generation_source") or "")[:64],
        }

    def resolve_remote_context(self, ctx: dict[str, Any]) -> dict[str, Any]:
        service = self._service()
        core = getattr(self.owner, "core_service", None)
        if (
            service is None
            or core is None
            or not hasattr(core, "resolve_sync_dm_dialogue")
            or not ctx.get("store_id")
            or not ctx.get("local_conversation_id")
        ):
            return {}
        try:
            messages = service.recent_messages(
                ctx["store_id"], ctx["local_conversation_id"], limit=60
            )
            if not messages:
                return {}
            window = messages[-12:]
            stable_alias_source = ("wxv-" + str(ctx["store_id"]))[:128]
            request_payload = {
                "robotId": str(getattr(getattr(self.owner, "account", None), "id", "") or ""),
                "platform": "WECHAT_VIDEO",
                "channelType": "dm",
                "chatType": str(ctx.get("chat_type") or "friend_private"),
                "botNickname": str(
                    getattr(getattr(self.owner, "account", None), "auth_name", "")
                    or getattr(getattr(self.owner, "account", None), "name", "")
                    or "视频号账号"
                )[:100],
                "userNickname": str(ctx.get("participant_display") or "未知用户")[:100],
                "sourceClientId": stable_alias_source,
                "localConversationId": str(ctx["local_conversation_id"])[:128],
                "currentWindow": [
                    {
                        "senderRole": str(row.get("sender_role") or "user")[:32],
                        "messageType": str(row.get("message_type") or "unknown")[:32],
                        "textContent": str(row.get("text_content") or "")[:20000],
                        "typePlaceholder": str(row.get("type_placeholder") or "")[:64],
                        "actorSource": str(row.get("actor_source") or "")[:64],
                        "attributionConfidence": str(row.get("attribution_confidence") or "")[:32],
                    }
                    for row in window
                ],
                "messages": [self._remote_message(row) for row in messages],
                "currentClientMessageIds": list(ctx.get("current_client_message_ids") or [])[:20],
                "contextLimit": 10,
                "identityKey": str(ctx.get("participant_key") or "")[:128],
                "identitySource": "platform_session_id",
                "identityConfidence": 100,
            }
            result = core.resolve_sync_dm_dialogue(request_payload)
            if not isinstance(result, dict):
                return {}
            self._remote_by_local[str(ctx["local_conversation_id"])] = result
            self._log(
                "INFO",
                "视频号私信服务端会话解析与增量同步完成: "
                + json.dumps({
                    "localConversationId": str(ctx["local_conversation_id"])[:24],
                    "canonicalConversationId": str(result.get("canonicalConversationId") or "")[:24],
                    "identityStatus": result.get("identityStatus", ""),
                    "syncedCount": result.get("syncedCount", 0),
                    "contextCount": len(result.get("contextMessages") or []),
                }, ensure_ascii=False),
            )
            return result
        except Exception as exc:
            self._log(
                "WARN",
                f"视频号私信记录/上下文同步失败，已降级且不影响回复：{type(exc).__name__}: {str(exc)[:160]}",
            )
            return {}

    def mark_analysis(
        self,
        ctx: dict[str, Any],
        *,
        status: str,
        draft_text: str = "",
        backend: dict[str, Any] | None = None,
        reason: str = "",
    ) -> None:
        service = self._service()
        if service is None or not ctx.get("store_id") or not ctx.get("analysis_id"):
            return
        backend = backend or {}
        now = iso_utc()
        try:
            service.submit(store_id=ctx["store_id"], event_type="analysis_upsert", payload={
                "analysis_id": ctx["analysis_id"],
                "target_type": "turn",
                "target_id": ctx.get("turn_id", ""),
                "analysis_type": "dm_auto_reply",
                "status": status,
                "result": {
                    "source": self._text(backend.get("source"), 128),
                    "reason": self._text(reason or backend.get("judgeReason"), 1000),
                },
                "purpose_category": self._text(backend.get("messageType"), 128),
                "intention_level": self._text(backend.get("intentLevel"), 64),
                "completed_at_utc": now if status != "pending" else "",
                "error_message": self._text(reason, 2000) if status in {"failed", "empty_reply"} else "",
            })
            if draft_text:
                service.submit(store_id=ctx["store_id"], event_type="reply_attempt_upsert", payload={
                    "attempt_id": ctx.get("attempt_id", ""),
                    "target_type": "turn",
                    "target_id": ctx.get("turn_id", ""),
                    "conversation_id": ctx.get("local_conversation_id", ""),
                    "draft_text": self._text(draft_text),
                    "status": "draft_generated",
                    "reply_trace_id": self._text(backend.get("replyTraceId"), 512),
                    "generation_source": self._text(backend.get("source") or backend.get("generationSource"), 64),
                    "source_robot_id": str(getattr(getattr(self.owner, "account", None), "id", "") or ""),
                    "source_client_id": str(getattr(service, "client_id", "") or ""),
                })
        except Exception:
            pass

    def mark_attempt(
        self,
        ctx: dict[str, Any],
        *,
        status: str,
        draft_text: str = "",
        actual_text: str = "",
        error_code: str = "",
        error_message: str = "",
        confirmed: bool = False,
    ) -> None:
        service = self._service()
        if service is None or not ctx.get("store_id") or not ctx.get("attempt_id"):
            return
        now = iso_utc()
        try:
            service.submit(store_id=ctx["store_id"], event_type="reply_attempt_upsert", payload={
                "attempt_id": ctx["attempt_id"],
                "target_type": "turn",
                "target_id": ctx.get("turn_id", ""),
                "conversation_id": ctx.get("local_conversation_id", ""),
                "draft_text": self._text(draft_text),
                "actual_text": self._text(actual_text),
                "status": status,
                "attempted_at_utc": now if status in {"send_pending", "send_unconfirmed", "send_failed", "sent", "not_required"} else "",
                "confirmed_at_utc": now if confirmed else "",
                "error_code": self._text(error_code, 128),
                "error_message": self._text(error_message, 2000),
                "reply_trace_id": self._text(ctx.get("reply_trace_id"), 512),
                "generation_source": self._text(ctx.get("generation_source"), 64),
                "source_robot_id": str(getattr(getattr(self.owner, "account", None), "id", "") or ""),
                "source_client_id": str(getattr(service, "client_id", "") or ""),
            })
        except Exception:
            pass

    def persist_outgoing(
        self,
        ctx: dict[str, Any],
        msg: dict[str, Any],
        *,
        content: str,
        client_message_id: str,
    ) -> None:
        outgoing = {
            "sessionId": msg.get("sessionId"),
            "msgId": client_message_id,
            "fromUsername": getattr(getattr(self.owner, "_active_runtime", None), "finder_username", "") or "account",
            "toUsername": msg.get("fromUsername"),
            "text": content,
            "sender": "self",
            "nickname": msg.get("nickname"),
            "ts": int(datetime.now(tz=timezone.utc).timestamp() * 1000),
            "messageType": "text",
            "_sourceTab": msg.get("_sourceTab"),
        }
        self.persist_message(
            outgoing,
            reply_attempt_id=str(ctx.get("attempt_id") or ""),
            reply_trace_id=str(ctx.get("reply_trace_id") or ""),
            generation_source=str(ctx.get("generation_source") or ""),
            force_sender_role="account",
            actual_text=content,
        )
        session_id = self._text(msg.get("sessionId"), 180)
        if session_id and client_message_id:
            pending = self._pending_outgoing_by_session.setdefault(session_id, [])
            pending.append({
                "clientMessageId": client_message_id,
                "attemptId": str(ctx.get("attempt_id") or ""),
                "text": self._text(content),
                "sentAtMs": int(datetime.now(tz=timezone.utc).timestamp() * 1000),
                "echoKeys": [f"id:{client_message_id}"],
                "echoCount": 0,
            })
            if len(pending) > 20:
                del pending[:-20]

    def post_send_sync(self, ctx: dict[str, Any]) -> dict[str, Any]:
        if not ctx:
            return {}
        return self.resolve_remote_context(ctx)

    def update_workflow_mapping(self, ctx: dict[str, Any], workflow_conversation_id: str) -> None:
        core = getattr(self.owner, "core_service", None)
        canonical = self._text(ctx.get("canonical_conversation_id"), 256)
        workflow = self._text(workflow_conversation_id, 256)
        if not core or not canonical or not workflow or not hasattr(core, "update_dialogue_workflow_conversation"):
            return
        try:
            core.update_dialogue_workflow_conversation(canonical, workflow)
        except Exception as exc:
            self._log("WARN", f"视频号私信工作流会话映射更新失败，已忽略：{type(exc).__name__}: {str(exc)[:120]}")
