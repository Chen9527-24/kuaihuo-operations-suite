from __future__ import annotations

from dataclasses import dataclass
import json
import uuid
from typing import Any

from .normalizers import iso_utc, sanitize_mapping

EVENT_ALLOWED_KEYS: dict[str, set[str]] = {
    "conversation_upsert": {
        "conversation_id", "platform", "channel_type", "external_conversation_id", "title",
        "participant_key", "participant_display", "is_group", "first_observed_at_utc", "last_observed_at_utc",
    },
    "message_upsert": {
        "message_id", "conversation_id", "platform", "channel_type", "external_conversation_id", "title",
        "participant_key", "participant_display", "is_group", "platform_message_id", "sender_role", "sender_key", "sender_display",
        "actor_source", "attribution_confidence", "message_type", "text_content", "type_placeholder",
        "source_type_code", "classification_source", "sequence_index", "source_time_raw",
        "source_timestamp_raw", "source_time_utc", "observed_at_utc", "first_observed_at_utc",
        "last_observed_at_utc", "time_accuracy", "source_timezone", "business_timezone",
        "time_parser_version", "history_kind", "payload_fingerprint", "reply_attempt_id", "reply_trace_id",
        "generation_source", "source_robot_id", "source_client_id",
    },
    "turn_upsert": {
        "turn_id", "conversation_id", "platform", "channel_type", "external_conversation_id", "title",
        "participant_key", "participant_display", "is_group", "aggregated_text", "purpose_category",
        "intention_level", "started_at_utc", "ended_at_utc", "first_observed_at_utc", "last_observed_at_utc",
    },
    "turn_message_link": {"turn_id", "message_id", "position"},
    "comment_upsert": {
        "comment_id", "platform", "external_comment_id", "video_id", "video_title", "parent_comment_id",
        "root_comment_id", "comment_level", "author_key", "author_display", "sender_role", "actor_source",
        "attribution_confidence", "text_content", "message_type", "type_placeholder", "source_time_raw",
        "source_timestamp_raw", "source_time_utc", "observed_at_utc", "first_observed_at_utc",
        "last_observed_at_utc", "time_accuracy", "source_timezone", "business_timezone",
        "collection_status", "candidate_status", "analysis_status", "reply_status", "resolution_status",
        "current_filter", "replies_collapsed", "thread_completeness", "reply_attempt_id", "reply_trace_id",
        "generation_source", "source_robot_id", "source_client_id",
    },
    "reply_attempt_upsert": {
        "attempt_id", "target_type", "target_id", "conversation_id", "draft_text", "actual_text", "status",
        "attempted_at_utc", "confirmed_at_utc", "error_code", "error_message", "reply_trace_id",
        "generation_source", "source_robot_id", "source_client_id",
    },
    "analysis_upsert": {
        "analysis_id", "target_type", "target_id", "analysis_type", "status", "result", "purpose_category",
        "intention_level", "started_at_utc", "completed_at_utc", "error_code", "error_message",
    },
    "cursor_upsert": {"cursor_key", "conversation_id", "cursor_type", "cursor"},
}


@dataclass(frozen=True, slots=True)
class RecordEvent:
    event_id: str
    store_id: str
    event_type: str
    payload: dict[str, Any]
    enqueued_at_utc: str

    def to_json(self) -> str:
        return json.dumps(
            {
                "eventId": self.event_id,
                "storeId": self.store_id,
                "eventType": self.event_type,
                "payload": self.payload,
                "enqueuedAtUtc": self.enqueued_at_utc,
            },
            ensure_ascii=False,
            sort_keys=True,
            separators=(",", ":"),
        )

    @classmethod
    def from_mapping(cls, data: dict[str, Any]) -> "RecordEvent":
        return create_event(
            store_id=data.get("storeId"),
            event_type=data.get("eventType"),
            payload=data.get("payload"),
            event_id=data.get("eventId"),
            enqueued_at_utc=data.get("enqueuedAtUtc"),
        )


def create_event(
    *,
    store_id: Any,
    event_type: Any,
    payload: Any,
    event_id: Any = "",
    enqueued_at_utc: Any = "",
) -> RecordEvent:
    clean_event_type = str(event_type or "").strip()
    allowed_keys = EVENT_ALLOWED_KEYS.get(clean_event_type)
    if allowed_keys is None:
        raise ValueError(f"unsupported event_type: {clean_event_type}")
    clean_store_id = str(store_id or "").strip()
    if not clean_store_id.startswith("acct_"):
        raise ValueError("invalid store_id")
    clean_payload = sanitize_mapping(payload, allowed_keys=allowed_keys, max_depth=4)
    clean_event_id = str(event_id or "").strip() or uuid.uuid4().hex
    return RecordEvent(
        event_id=clean_event_id[:128],
        store_id=clean_store_id[:80],
        event_type=clean_event_type,
        payload=clean_payload,
        enqueued_at_utc=str(enqueued_at_utc or "").strip()[:64] or iso_utc(),
    )
