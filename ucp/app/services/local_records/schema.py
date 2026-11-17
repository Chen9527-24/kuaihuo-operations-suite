from __future__ import annotations

import json
import sqlite3
from typing import Any

from .normalizers import iso_utc, normalize_identifier, normalize_message_content, normalize_platform, normalize_text

DIALOGUE_SCHEMA_VERSION = 4

COMMENT_COLLECTION_RANK = {
    "observed": 10,
    "partial_thread": 20,
    "complete_visible_thread": 30,
    "history_backfill": 15,
}
COMMENT_CANDIDATE_RANK = {
    "unknown": 0,
    "eligible": 10,
    "eligible_queued": 20,
    "deferred_policy": 15,
    "deferred_technical": 15,
    "excluded_by_policy": 30,
    "author_already_replied": 30,
    "existing_processed": 30,
}
ANALYSIS_STATUS_RANK = {
    "not_started": 0,
    "pending": 10,
    "timeout": 20,
    "failed": 20,
    "invalid": 20,
    "empty_reply": 20,
    "not_required": 30,
    "completed": 40,
}
REPLY_STATUS_RANK = {
    "not_attempted": 0,
    "draft_generated": 10,
    "dry_run_generated": 15,
    "send_pending": 20,
    "send_unconfirmed": 30,
    "send_failed": 30,
    "manual_or_external_reply": 35,
    "sent": 40,
    "sent_late_confirmed": 45,
}
ATTRIBUTION_RANK = {"unknown": 0, "inferred": 10, "probable": 20, "verified": 30}
TIME_ACCURACY_RANK = {
    "invalid": 0,
    "unknown": 1,
    "unknown_history": 2,
    "live_observed": 3,
    "inferred_year": 4,
    "relative_parsed": 5,
    "absolute_parsed": 6,
    "exact_platform": 7,
}


def initialize_dialogue_schema(connection: sqlite3.Connection) -> None:
    connection.execute("PRAGMA foreign_keys=ON")
    connection.executescript(
        """
        CREATE TABLE IF NOT EXISTS schema_meta (
            key TEXT PRIMARY KEY,
            value TEXT NOT NULL
        );

        CREATE TABLE IF NOT EXISTS applied_recovery_events (
            event_id TEXT PRIMARY KEY,
            event_type TEXT NOT NULL,
            applied_at_utc TEXT NOT NULL
        );

        CREATE TABLE IF NOT EXISTS conversations (
            conversation_id TEXT PRIMARY KEY,
            platform TEXT NOT NULL,
            channel_type TEXT NOT NULL,
            external_conversation_id TEXT NOT NULL DEFAULT '',
            title TEXT NOT NULL DEFAULT '',
            participant_key TEXT NOT NULL DEFAULT '',
            participant_display TEXT NOT NULL DEFAULT '',
            is_group INTEGER NOT NULL DEFAULT 0,
            first_observed_at_utc TEXT NOT NULL DEFAULT '',
            last_observed_at_utc TEXT NOT NULL DEFAULT '',
            created_at_utc TEXT NOT NULL,
            updated_at_utc TEXT NOT NULL
        );
        CREATE INDEX IF NOT EXISTS idx_conversations_external
            ON conversations(platform, channel_type, external_conversation_id);

        CREATE TABLE IF NOT EXISTS messages (
            message_id TEXT PRIMARY KEY,
            conversation_id TEXT NOT NULL,
            platform TEXT NOT NULL,
            platform_message_id TEXT NOT NULL DEFAULT '',
            sender_role TEXT NOT NULL DEFAULT 'unknown',
            sender_key TEXT NOT NULL DEFAULT '',
            sender_display TEXT NOT NULL DEFAULT '',
            actor_source TEXT NOT NULL DEFAULT 'unknown',
            attribution_confidence TEXT NOT NULL DEFAULT 'unknown',
            attribution_rank INTEGER NOT NULL DEFAULT 0,
            message_type TEXT NOT NULL DEFAULT 'unknown',
            text_content TEXT NOT NULL DEFAULT '',
            type_placeholder TEXT NOT NULL DEFAULT '',
            has_text INTEGER NOT NULL DEFAULT 0,
            has_non_text INTEGER NOT NULL DEFAULT 0,
            is_semantically_analyzable INTEGER NOT NULL DEFAULT 0,
            source_type_code TEXT NOT NULL DEFAULT '',
            classification_source TEXT NOT NULL DEFAULT '',
            sequence_index INTEGER,
            source_time_raw TEXT NOT NULL DEFAULT '',
            source_timestamp_raw TEXT NOT NULL DEFAULT '',
            source_time_utc TEXT NOT NULL DEFAULT '',
            observed_at_utc TEXT NOT NULL DEFAULT '',
            first_observed_at_utc TEXT NOT NULL DEFAULT '',
            last_observed_at_utc TEXT NOT NULL DEFAULT '',
            time_accuracy TEXT NOT NULL DEFAULT 'unknown',
            time_accuracy_rank INTEGER NOT NULL DEFAULT 1,
            source_timezone TEXT NOT NULL DEFAULT '',
            business_timezone TEXT NOT NULL DEFAULT '',
            time_parser_version TEXT NOT NULL DEFAULT '1',
            history_kind TEXT NOT NULL DEFAULT '',
            payload_fingerprint TEXT NOT NULL DEFAULT '',
            reply_attempt_id TEXT NOT NULL DEFAULT '',
            reply_trace_id TEXT NOT NULL DEFAULT '',
            generation_source TEXT NOT NULL DEFAULT '',
            source_robot_id TEXT NOT NULL DEFAULT '',
            source_client_id TEXT NOT NULL DEFAULT '',
            created_at_utc TEXT NOT NULL,
            updated_at_utc TEXT NOT NULL,
            FOREIGN KEY(conversation_id) REFERENCES conversations(conversation_id)
        );
        CREATE INDEX IF NOT EXISTS idx_messages_conversation_time
            ON messages(conversation_id, source_time_utc, observed_at_utc);
        CREATE INDEX IF NOT EXISTS idx_messages_platform_id
            ON messages(platform, platform_message_id);
        CREATE TABLE IF NOT EXISTS message_turns (
            turn_id TEXT PRIMARY KEY,
            conversation_id TEXT NOT NULL,
            aggregated_text TEXT NOT NULL DEFAULT '',
            purpose_category TEXT NOT NULL DEFAULT '',
            intention_level TEXT NOT NULL DEFAULT '',
            started_at_utc TEXT NOT NULL DEFAULT '',
            ended_at_utc TEXT NOT NULL DEFAULT '',
            created_at_utc TEXT NOT NULL,
            updated_at_utc TEXT NOT NULL,
            FOREIGN KEY(conversation_id) REFERENCES conversations(conversation_id)
        );

        CREATE TABLE IF NOT EXISTS turn_messages (
            turn_id TEXT NOT NULL,
            message_id TEXT NOT NULL,
            position INTEGER NOT NULL DEFAULT 0,
            PRIMARY KEY(turn_id, message_id),
            FOREIGN KEY(turn_id) REFERENCES message_turns(turn_id),
            FOREIGN KEY(message_id) REFERENCES messages(message_id)
        );

        CREATE TABLE IF NOT EXISTS comments (
            comment_id TEXT PRIMARY KEY,
            platform TEXT NOT NULL,
            external_comment_id TEXT NOT NULL DEFAULT '',
            video_id TEXT NOT NULL DEFAULT '',
            video_title TEXT NOT NULL DEFAULT '',
            parent_comment_id TEXT NOT NULL DEFAULT '',
            root_comment_id TEXT NOT NULL DEFAULT '',
            comment_level INTEGER NOT NULL DEFAULT 1,
            author_key TEXT NOT NULL DEFAULT '',
            author_display TEXT NOT NULL DEFAULT '',
            sender_role TEXT NOT NULL DEFAULT 'user',
            actor_source TEXT NOT NULL DEFAULT 'platform_user',
            attribution_confidence TEXT NOT NULL DEFAULT 'unknown',
            attribution_rank INTEGER NOT NULL DEFAULT 0,
            text_content TEXT NOT NULL DEFAULT '',
            message_type TEXT NOT NULL DEFAULT 'text',
            type_placeholder TEXT NOT NULL DEFAULT '',
            source_time_raw TEXT NOT NULL DEFAULT '',
            source_timestamp_raw TEXT NOT NULL DEFAULT '',
            source_time_utc TEXT NOT NULL DEFAULT '',
            observed_at_utc TEXT NOT NULL DEFAULT '',
            first_observed_at_utc TEXT NOT NULL DEFAULT '',
            last_observed_at_utc TEXT NOT NULL DEFAULT '',
            time_accuracy TEXT NOT NULL DEFAULT 'unknown',
            time_accuracy_rank INTEGER NOT NULL DEFAULT 1,
            source_timezone TEXT NOT NULL DEFAULT '',
            business_timezone TEXT NOT NULL DEFAULT '',
            collection_status TEXT NOT NULL DEFAULT 'observed',
            collection_rank INTEGER NOT NULL DEFAULT 10,
            candidate_status TEXT NOT NULL DEFAULT 'unknown',
            candidate_rank INTEGER NOT NULL DEFAULT 0,
            analysis_status TEXT NOT NULL DEFAULT 'not_started',
            analysis_rank INTEGER NOT NULL DEFAULT 0,
            reply_status TEXT NOT NULL DEFAULT 'not_attempted',
            reply_rank INTEGER NOT NULL DEFAULT 0,
            resolution_status TEXT NOT NULL DEFAULT 'unknown',
            current_filter TEXT NOT NULL DEFAULT '',
            replies_collapsed INTEGER NOT NULL DEFAULT 0,
            thread_completeness TEXT NOT NULL DEFAULT '',
            reply_attempt_id TEXT NOT NULL DEFAULT '',
            reply_trace_id TEXT NOT NULL DEFAULT '',
            generation_source TEXT NOT NULL DEFAULT '',
            source_robot_id TEXT NOT NULL DEFAULT '',
            source_client_id TEXT NOT NULL DEFAULT '',
            created_at_utc TEXT NOT NULL,
            updated_at_utc TEXT NOT NULL
        );
        CREATE INDEX IF NOT EXISTS idx_comments_video_time ON comments(video_id, source_time_utc, observed_at_utc);
        CREATE INDEX IF NOT EXISTS idx_comments_external ON comments(platform, external_comment_id);
        CREATE INDEX IF NOT EXISTS idx_comments_root_time ON comments(root_comment_id, source_time_utc, observed_at_utc);

        CREATE TABLE IF NOT EXISTS reply_attempts (
            attempt_id TEXT PRIMARY KEY,
            target_type TEXT NOT NULL,
            target_id TEXT NOT NULL,
            conversation_id TEXT NOT NULL DEFAULT '',
            draft_text TEXT NOT NULL DEFAULT '',
            actual_text TEXT NOT NULL DEFAULT '',
            status TEXT NOT NULL DEFAULT 'not_attempted',
            status_rank INTEGER NOT NULL DEFAULT 0,
            attempted_at_utc TEXT NOT NULL DEFAULT '',
            confirmed_at_utc TEXT NOT NULL DEFAULT '',
            error_code TEXT NOT NULL DEFAULT '',
            error_message TEXT NOT NULL DEFAULT '',
            reply_trace_id TEXT NOT NULL DEFAULT '',
            generation_source TEXT NOT NULL DEFAULT '',
            source_robot_id TEXT NOT NULL DEFAULT '',
            source_client_id TEXT NOT NULL DEFAULT '',
            created_at_utc TEXT NOT NULL,
            updated_at_utc TEXT NOT NULL
        );
        CREATE INDEX IF NOT EXISTS idx_reply_attempts_target ON reply_attempts(target_type, target_id, attempted_at_utc);

        CREATE TABLE IF NOT EXISTS analysis_results (
            analysis_id TEXT PRIMARY KEY,
            target_type TEXT NOT NULL,
            target_id TEXT NOT NULL,
            analysis_type TEXT NOT NULL DEFAULT '',
            status TEXT NOT NULL DEFAULT 'not_started',
            status_rank INTEGER NOT NULL DEFAULT 0,
            result_json TEXT NOT NULL DEFAULT '{}',
            purpose_category TEXT NOT NULL DEFAULT '',
            intention_level TEXT NOT NULL DEFAULT '',
            started_at_utc TEXT NOT NULL DEFAULT '',
            completed_at_utc TEXT NOT NULL DEFAULT '',
            error_code TEXT NOT NULL DEFAULT '',
            error_message TEXT NOT NULL DEFAULT '',
            created_at_utc TEXT NOT NULL,
            updated_at_utc TEXT NOT NULL
        );
        CREATE INDEX IF NOT EXISTS idx_analysis_target ON analysis_results(target_type, target_id, analysis_type);

        CREATE TABLE IF NOT EXISTS conversation_cursors (
            cursor_key TEXT PRIMARY KEY,
            conversation_id TEXT NOT NULL DEFAULT '',
            cursor_type TEXT NOT NULL,
            cursor_json TEXT NOT NULL DEFAULT '{}',
            updated_at_utc TEXT NOT NULL
        );
        """
    )
    message_columns = {str(row[1]) for row in connection.execute("PRAGMA table_info(messages)").fetchall()}
    if "sender_key" not in message_columns:
        connection.execute("ALTER TABLE messages ADD COLUMN sender_key TEXT NOT NULL DEFAULT ''")
    if "sender_display" not in message_columns:
        connection.execute("ALTER TABLE messages ADD COLUMN sender_display TEXT NOT NULL DEFAULT ''")
    if "reply_attempt_id" not in message_columns:
        connection.execute("ALTER TABLE messages ADD COLUMN reply_attempt_id TEXT NOT NULL DEFAULT ''")
    if "reply_trace_id" not in message_columns:
        connection.execute("ALTER TABLE messages ADD COLUMN reply_trace_id TEXT NOT NULL DEFAULT ''")
    if "generation_source" not in message_columns:
        connection.execute("ALTER TABLE messages ADD COLUMN generation_source TEXT NOT NULL DEFAULT ''")
    connection.execute("CREATE INDEX IF NOT EXISTS idx_messages_reply_attempt ON messages(reply_attempt_id)")
    connection.execute("CREATE INDEX IF NOT EXISTS idx_messages_reply_trace ON messages(reply_trace_id)")
    connection.execute("CREATE INDEX IF NOT EXISTS idx_messages_sender ON messages(conversation_id, sender_key)")

    comment_columns = {str(row[1]) for row in connection.execute("PRAGMA table_info(comments)").fetchall()}
    if "sender_role" not in comment_columns:
        connection.execute("ALTER TABLE comments ADD COLUMN sender_role TEXT NOT NULL DEFAULT 'user'")
    if "actor_source" not in comment_columns:
        connection.execute("ALTER TABLE comments ADD COLUMN actor_source TEXT NOT NULL DEFAULT 'platform_user'")
    if "attribution_confidence" not in comment_columns:
        connection.execute("ALTER TABLE comments ADD COLUMN attribution_confidence TEXT NOT NULL DEFAULT 'unknown'")
    if "attribution_rank" not in comment_columns:
        connection.execute("ALTER TABLE comments ADD COLUMN attribution_rank INTEGER NOT NULL DEFAULT 0")
    if "source_client_id" not in comment_columns:
        connection.execute("ALTER TABLE comments ADD COLUMN source_client_id TEXT NOT NULL DEFAULT ''")
    if "reply_attempt_id" not in comment_columns:
        connection.execute("ALTER TABLE comments ADD COLUMN reply_attempt_id TEXT NOT NULL DEFAULT ''")
    if "reply_trace_id" not in comment_columns:
        connection.execute("ALTER TABLE comments ADD COLUMN reply_trace_id TEXT NOT NULL DEFAULT ''")
    if "generation_source" not in comment_columns:
        connection.execute("ALTER TABLE comments ADD COLUMN generation_source TEXT NOT NULL DEFAULT ''")
    connection.execute("CREATE INDEX IF NOT EXISTS idx_comments_root_time ON comments(root_comment_id, source_time_utc, observed_at_utc)")
    connection.execute("CREATE INDEX IF NOT EXISTS idx_comments_reply_attempt ON comments(reply_attempt_id)")
    connection.execute("CREATE INDEX IF NOT EXISTS idx_comments_reply_trace ON comments(reply_trace_id)")
    connection.execute("CREATE INDEX IF NOT EXISTS idx_comments_sender ON comments(video_id, sender_role, actor_source)")

    reply_attempt_columns = {str(row[1]) for row in connection.execute("PRAGMA table_info(reply_attempts)").fetchall()}
    if "reply_trace_id" not in reply_attempt_columns:
        connection.execute("ALTER TABLE reply_attempts ADD COLUMN reply_trace_id TEXT NOT NULL DEFAULT ''")
    if "generation_source" not in reply_attempt_columns:
        connection.execute("ALTER TABLE reply_attempts ADD COLUMN generation_source TEXT NOT NULL DEFAULT ''")
    connection.execute("CREATE INDEX IF NOT EXISTS idx_reply_attempts_trace ON reply_attempts(reply_trace_id)")

    connection.execute(
        "INSERT INTO schema_meta(key, value) VALUES('schema_version', ?) "
        "ON CONFLICT(key) DO UPDATE SET value=excluded.value",
        (str(DIALOGUE_SCHEMA_VERSION),),
    )
    connection.execute(f"PRAGMA user_version={DIALOGUE_SCHEMA_VERSION}")


def _rank(mapping: dict[str, int], value: Any, default: int = 0) -> int:
    return int(mapping.get(str(value or "").strip(), default))


def _ensure_conversation(connection: sqlite3.Connection, payload: dict[str, Any], now: str) -> str:
    conversation_id = normalize_identifier(payload.get("conversation_id"), max_length=256)
    if not conversation_id:
        raise ValueError("conversation_id is required")
    platform = normalize_platform(payload.get("platform"))
    channel_type = normalize_identifier(payload.get("channel_type") or "dm", max_length=32)
    connection.execute(
        """
        INSERT INTO conversations(
            conversation_id, platform, channel_type, external_conversation_id, title,
            participant_key, participant_display, is_group,
            first_observed_at_utc, last_observed_at_utc, created_at_utc, updated_at_utc
        ) VALUES(?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(conversation_id) DO UPDATE SET
            channel_type=CASE
                WHEN conversations.channel_type='' THEN excluded.channel_type
                WHEN conversations.channel_type='dm' AND excluded.channel_type LIKE 'dm_%' THEN excluded.channel_type
                ELSE conversations.channel_type
            END,
            external_conversation_id=CASE WHEN excluded.external_conversation_id<>'' THEN excluded.external_conversation_id ELSE conversations.external_conversation_id END,
            title=CASE WHEN excluded.title<>'' THEN excluded.title ELSE conversations.title END,
            participant_key=CASE WHEN excluded.participant_key<>'' THEN excluded.participant_key ELSE conversations.participant_key END,
            participant_display=CASE WHEN excluded.participant_display<>'' THEN excluded.participant_display ELSE conversations.participant_display END,
            is_group=MAX(conversations.is_group, excluded.is_group),
            first_observed_at_utc=CASE
                WHEN conversations.first_observed_at_utc='' THEN excluded.first_observed_at_utc
                WHEN excluded.first_observed_at_utc='' THEN conversations.first_observed_at_utc
                ELSE MIN(conversations.first_observed_at_utc, excluded.first_observed_at_utc)
            END,
            last_observed_at_utc=MAX(conversations.last_observed_at_utc, excluded.last_observed_at_utc),
            updated_at_utc=excluded.updated_at_utc
        """,
        (
            conversation_id,
            platform,
            channel_type,
            normalize_identifier(payload.get("external_conversation_id")),
            normalize_text(payload.get("title"), max_length=512),
            normalize_identifier(payload.get("participant_key")),
            normalize_text(payload.get("participant_display"), max_length=256),
            int(bool(payload.get("is_group", False))),
            normalize_identifier(payload.get("first_observed_at_utc"), max_length=64),
            normalize_identifier(payload.get("last_observed_at_utc"), max_length=64),
            now,
            now,
        ),
    )
    return conversation_id


def apply_event(connection: sqlite3.Connection, event_id: str, event_type: str, payload: dict[str, Any]) -> bool:
    if connection.execute("SELECT 1 FROM applied_recovery_events WHERE event_id=?", (event_id,)).fetchone():
        return False
    now = iso_utc()
    handlers = {
        "conversation_upsert": _apply_conversation,
        "message_upsert": _apply_message,
        "turn_upsert": _apply_turn,
        "turn_message_link": _apply_turn_message_link,
        "comment_upsert": _apply_comment,
        "reply_attempt_upsert": _apply_reply_attempt,
        "analysis_upsert": _apply_analysis,
        "cursor_upsert": _apply_cursor,
    }
    handler = handlers.get(event_type)
    if not handler:
        raise ValueError(f"unsupported event_type: {event_type}")
    handler(connection, payload, now)
    connection.execute(
        "INSERT INTO applied_recovery_events(event_id, event_type, applied_at_utc) VALUES(?, ?, ?)",
        (event_id, event_type, now),
    )
    return True


def _apply_conversation(connection: sqlite3.Connection, payload: dict[str, Any], now: str) -> None:
    _ensure_conversation(connection, payload, now)


def _apply_message(connection: sqlite3.Connection, payload: dict[str, Any], now: str) -> None:
    conversation_id = _ensure_conversation(connection, payload, now)
    message_id = normalize_identifier(payload.get("message_id"), max_length=256)
    if not message_id:
        raise ValueError("message_id is required")
    content = normalize_message_content(payload.get("message_type"), payload.get("text_content"), payload.get("type_placeholder"))
    confidence = normalize_identifier(payload.get("attribution_confidence") or "unknown", max_length=32)
    time_accuracy = normalize_identifier(payload.get("time_accuracy") or "unknown", max_length=32)
    connection.execute(
        """
        INSERT INTO messages(
            message_id, conversation_id, platform, platform_message_id, sender_role, sender_key, sender_display, actor_source,
            attribution_confidence, attribution_rank, message_type, text_content, type_placeholder,
            has_text, has_non_text, is_semantically_analyzable, source_type_code, classification_source,
            sequence_index, source_time_raw, source_timestamp_raw, source_time_utc, observed_at_utc,
            first_observed_at_utc, last_observed_at_utc, time_accuracy, time_accuracy_rank,
            source_timezone, business_timezone, time_parser_version, history_kind, payload_fingerprint,
            reply_attempt_id, reply_trace_id, generation_source, source_robot_id, source_client_id, created_at_utc, updated_at_utc
        ) VALUES(?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(message_id) DO UPDATE SET
            platform_message_id=CASE WHEN excluded.platform_message_id<>'' THEN excluded.platform_message_id ELSE messages.platform_message_id END,
            sender_role=CASE WHEN excluded.sender_role<>'unknown' THEN excluded.sender_role ELSE messages.sender_role END,
            sender_key=CASE WHEN excluded.sender_key<>'' THEN excluded.sender_key ELSE messages.sender_key END,
            sender_display=CASE WHEN excluded.sender_display<>'' THEN excluded.sender_display ELSE messages.sender_display END,
            actor_source=CASE WHEN excluded.attribution_rank>=messages.attribution_rank THEN excluded.actor_source ELSE messages.actor_source END,
            attribution_confidence=CASE WHEN excluded.attribution_rank>=messages.attribution_rank THEN excluded.attribution_confidence ELSE messages.attribution_confidence END,
            attribution_rank=MAX(messages.attribution_rank, excluded.attribution_rank),
            message_type=CASE WHEN messages.message_type='unknown' AND excluded.message_type<>'unknown' THEN excluded.message_type ELSE messages.message_type END,
            text_content=CASE WHEN excluded.text_content<>'' THEN excluded.text_content ELSE messages.text_content END,
            type_placeholder=CASE WHEN excluded.type_placeholder<>'' THEN excluded.type_placeholder ELSE messages.type_placeholder END,
            has_text=MAX(messages.has_text, excluded.has_text),
            has_non_text=MAX(messages.has_non_text, excluded.has_non_text),
            is_semantically_analyzable=MAX(messages.is_semantically_analyzable, excluded.is_semantically_analyzable),
            source_type_code=CASE WHEN excluded.source_type_code<>'' THEN excluded.source_type_code ELSE messages.source_type_code END,
            classification_source=CASE WHEN excluded.classification_source<>'' THEN excluded.classification_source ELSE messages.classification_source END,
            sequence_index=COALESCE(messages.sequence_index, excluded.sequence_index),
            source_time_raw=CASE WHEN excluded.time_accuracy_rank>=messages.time_accuracy_rank AND excluded.source_time_raw<>'' THEN excluded.source_time_raw ELSE messages.source_time_raw END,
            source_timestamp_raw=CASE WHEN excluded.time_accuracy_rank>=messages.time_accuracy_rank AND excluded.source_timestamp_raw<>'' THEN excluded.source_timestamp_raw ELSE messages.source_timestamp_raw END,
            source_time_utc=CASE WHEN excluded.time_accuracy_rank>=messages.time_accuracy_rank AND excluded.source_time_utc<>'' THEN excluded.source_time_utc ELSE messages.source_time_utc END,
            observed_at_utc=CASE WHEN messages.observed_at_utc='' THEN excluded.observed_at_utc ELSE MIN(messages.observed_at_utc, excluded.observed_at_utc) END,
            first_observed_at_utc=CASE WHEN messages.first_observed_at_utc='' THEN excluded.first_observed_at_utc ELSE MIN(messages.first_observed_at_utc, excluded.first_observed_at_utc) END,
            last_observed_at_utc=MAX(messages.last_observed_at_utc, excluded.last_observed_at_utc),
            time_accuracy=CASE WHEN excluded.time_accuracy_rank>=messages.time_accuracy_rank THEN excluded.time_accuracy ELSE messages.time_accuracy END,
            time_accuracy_rank=MAX(messages.time_accuracy_rank, excluded.time_accuracy_rank),
            source_timezone=CASE WHEN excluded.source_timezone<>'' THEN excluded.source_timezone ELSE messages.source_timezone END,
            business_timezone=CASE WHEN excluded.business_timezone<>'' THEN excluded.business_timezone ELSE messages.business_timezone END,
            time_parser_version=CASE WHEN excluded.time_parser_version<>'' THEN excluded.time_parser_version ELSE messages.time_parser_version END,
            history_kind=CASE WHEN excluded.history_kind<>'' THEN excluded.history_kind ELSE messages.history_kind END,
            payload_fingerprint=CASE WHEN excluded.payload_fingerprint<>'' THEN excluded.payload_fingerprint ELSE messages.payload_fingerprint END,
            reply_attempt_id=CASE WHEN excluded.reply_attempt_id<>'' THEN excluded.reply_attempt_id ELSE messages.reply_attempt_id END,
            reply_trace_id=CASE WHEN excluded.reply_trace_id<>'' THEN excluded.reply_trace_id ELSE messages.reply_trace_id END,
            generation_source=CASE WHEN excluded.generation_source<>'' THEN excluded.generation_source ELSE messages.generation_source END,
            source_robot_id=CASE WHEN excluded.source_robot_id<>'' THEN excluded.source_robot_id ELSE messages.source_robot_id END,
            source_client_id=CASE WHEN excluded.source_client_id<>'' THEN excluded.source_client_id ELSE messages.source_client_id END,
            updated_at_utc=excluded.updated_at_utc
        """,
        (
            message_id,
            conversation_id,
            normalize_platform(payload.get("platform")),
            normalize_identifier(payload.get("platform_message_id")),
            normalize_identifier(payload.get("sender_role") or "unknown", max_length=32),
            normalize_identifier(payload.get("sender_key"), max_length=256),
            normalize_text(payload.get("sender_display"), max_length=256),
            normalize_identifier(payload.get("actor_source") or "unknown", max_length=64),
            confidence,
            _rank(ATTRIBUTION_RANK, confidence),
            content["message_type"],
            content["text_content"],
            content["type_placeholder"],
            content["has_text"],
            content["has_non_text"],
            content["is_semantically_analyzable"],
            normalize_identifier(payload.get("source_type_code"), max_length=64),
            normalize_identifier(payload.get("classification_source"), max_length=64),
            payload.get("sequence_index") if isinstance(payload.get("sequence_index"), int) else None,
            normalize_text(payload.get("source_time_raw"), max_length=256),
            normalize_text(payload.get("source_timestamp_raw"), max_length=128),
            normalize_identifier(payload.get("source_time_utc"), max_length=64),
            normalize_identifier(payload.get("observed_at_utc"), max_length=64),
            normalize_identifier(payload.get("first_observed_at_utc"), max_length=64),
            normalize_identifier(payload.get("last_observed_at_utc"), max_length=64),
            time_accuracy,
            _rank(TIME_ACCURACY_RANK, time_accuracy, 1),
            normalize_identifier(payload.get("source_timezone"), max_length=64),
            normalize_identifier(payload.get("business_timezone"), max_length=64),
            normalize_identifier(payload.get("time_parser_version") or "1", max_length=16),
            normalize_identifier(payload.get("history_kind"), max_length=32),
            normalize_identifier(payload.get("payload_fingerprint"), max_length=128),
            normalize_identifier(payload.get("reply_attempt_id"), max_length=256),
            normalize_identifier(payload.get("reply_trace_id"), max_length=512),
            normalize_identifier(payload.get("generation_source"), max_length=64),
            normalize_identifier(payload.get("source_robot_id")),
            normalize_identifier(payload.get("source_client_id")),
            now,
            now,
        ),
    )


def _apply_turn(connection: sqlite3.Connection, payload: dict[str, Any], now: str) -> None:
    conversation_id = _ensure_conversation(connection, payload, now)
    turn_id = normalize_identifier(payload.get("turn_id"), max_length=256)
    if not turn_id:
        raise ValueError("turn_id is required")
    connection.execute(
        """
        INSERT INTO message_turns(turn_id, conversation_id, aggregated_text, purpose_category, intention_level, started_at_utc, ended_at_utc, created_at_utc, updated_at_utc)
        VALUES(?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(turn_id) DO UPDATE SET
            aggregated_text=CASE WHEN excluded.aggregated_text<>'' THEN excluded.aggregated_text ELSE message_turns.aggregated_text END,
            purpose_category=CASE WHEN excluded.purpose_category<>'' THEN excluded.purpose_category ELSE message_turns.purpose_category END,
            intention_level=CASE WHEN excluded.intention_level<>'' THEN excluded.intention_level ELSE message_turns.intention_level END,
            started_at_utc=CASE WHEN message_turns.started_at_utc='' THEN excluded.started_at_utc ELSE MIN(message_turns.started_at_utc, excluded.started_at_utc) END,
            ended_at_utc=MAX(message_turns.ended_at_utc, excluded.ended_at_utc),
            updated_at_utc=excluded.updated_at_utc
        """,
        (
            turn_id,
            conversation_id,
            normalize_text(payload.get("aggregated_text")),
            normalize_identifier(payload.get("purpose_category"), max_length=128),
            normalize_identifier(payload.get("intention_level"), max_length=64),
            normalize_identifier(payload.get("started_at_utc"), max_length=64),
            normalize_identifier(payload.get("ended_at_utc"), max_length=64),
            now,
            now,
        ),
    )


def _apply_turn_message_link(connection: sqlite3.Connection, payload: dict[str, Any], now: str) -> None:
    del now
    turn_id = normalize_identifier(payload.get("turn_id"), max_length=256)
    message_id = normalize_identifier(payload.get("message_id"), max_length=256)
    if not turn_id or not message_id:
        raise ValueError("turn_id and message_id are required")
    position = int(payload.get("position") or 0)
    connection.execute(
        "INSERT INTO turn_messages(turn_id, message_id, position) VALUES(?, ?, ?) "
        "ON CONFLICT(turn_id, message_id) DO UPDATE SET position=excluded.position",
        (turn_id, message_id, position),
    )


def _apply_comment(connection: sqlite3.Connection, payload: dict[str, Any], now: str) -> None:
    comment_id = normalize_identifier(payload.get("comment_id"), max_length=256)
    if not comment_id:
        raise ValueError("comment_id is required")
    content = normalize_message_content(payload.get("message_type") or "text", payload.get("text_content"), payload.get("type_placeholder"))
    collection_status = normalize_identifier(payload.get("collection_status") or "observed", max_length=64)
    candidate_status = normalize_identifier(payload.get("candidate_status") or "unknown", max_length=64)
    analysis_status = normalize_identifier(payload.get("analysis_status") or "not_started", max_length=64)
    reply_status = normalize_identifier(payload.get("reply_status") or "not_attempted", max_length=64)
    time_accuracy = normalize_identifier(payload.get("time_accuracy") or "unknown", max_length=32)
    confidence = normalize_identifier(payload.get("attribution_confidence") or "unknown", max_length=32)
    connection.execute(
        """
        INSERT INTO comments(
            comment_id, platform, external_comment_id, video_id, video_title, parent_comment_id, root_comment_id,
            comment_level, author_key, author_display, sender_role, actor_source, attribution_confidence, attribution_rank,
            text_content, message_type, type_placeholder, source_time_raw, source_timestamp_raw, source_time_utc,
            observed_at_utc, first_observed_at_utc, last_observed_at_utc, time_accuracy, time_accuracy_rank,
            source_timezone, business_timezone, collection_status, collection_rank, candidate_status, candidate_rank,
            analysis_status, analysis_rank, reply_status, reply_rank, resolution_status, current_filter, replies_collapsed,
            thread_completeness, reply_attempt_id, reply_trace_id, generation_source,
            source_robot_id, source_client_id, created_at_utc, updated_at_utc
        ) VALUES(?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(comment_id) DO UPDATE SET
            external_comment_id=CASE WHEN excluded.external_comment_id<>'' THEN excluded.external_comment_id ELSE comments.external_comment_id END,
            video_id=CASE WHEN excluded.video_id<>'' THEN excluded.video_id ELSE comments.video_id END,
            video_title=CASE WHEN excluded.video_title<>'' THEN excluded.video_title ELSE comments.video_title END,
            parent_comment_id=CASE WHEN excluded.parent_comment_id<>'' THEN excluded.parent_comment_id ELSE comments.parent_comment_id END,
            root_comment_id=CASE WHEN excluded.root_comment_id<>'' THEN excluded.root_comment_id ELSE comments.root_comment_id END,
            comment_level=MAX(comments.comment_level, excluded.comment_level),
            author_key=CASE WHEN excluded.author_key<>'' THEN excluded.author_key ELSE comments.author_key END,
            author_display=CASE WHEN excluded.author_display<>'' THEN excluded.author_display ELSE comments.author_display END,
            sender_role=CASE WHEN excluded.sender_role<>'unknown' THEN excluded.sender_role ELSE comments.sender_role END,
            actor_source=CASE WHEN excluded.attribution_rank>=comments.attribution_rank THEN excluded.actor_source ELSE comments.actor_source END,
            attribution_confidence=CASE WHEN excluded.attribution_rank>=comments.attribution_rank THEN excluded.attribution_confidence ELSE comments.attribution_confidence END,
            attribution_rank=MAX(comments.attribution_rank, excluded.attribution_rank),
            text_content=CASE WHEN excluded.text_content<>'' THEN excluded.text_content ELSE comments.text_content END,
            message_type=CASE WHEN comments.message_type='unknown' AND excluded.message_type<>'unknown' THEN excluded.message_type ELSE comments.message_type END,
            type_placeholder=CASE WHEN excluded.type_placeholder<>'' THEN excluded.type_placeholder ELSE comments.type_placeholder END,
            source_time_raw=CASE WHEN excluded.time_accuracy_rank>=comments.time_accuracy_rank AND excluded.source_time_raw<>'' THEN excluded.source_time_raw ELSE comments.source_time_raw END,
            source_timestamp_raw=CASE WHEN excluded.time_accuracy_rank>=comments.time_accuracy_rank AND excluded.source_timestamp_raw<>'' THEN excluded.source_timestamp_raw ELSE comments.source_timestamp_raw END,
            source_time_utc=CASE WHEN excluded.time_accuracy_rank>=comments.time_accuracy_rank AND excluded.source_time_utc<>'' THEN excluded.source_time_utc ELSE comments.source_time_utc END,
            observed_at_utc=CASE WHEN comments.observed_at_utc='' THEN excluded.observed_at_utc ELSE MIN(comments.observed_at_utc, excluded.observed_at_utc) END,
            first_observed_at_utc=CASE WHEN comments.first_observed_at_utc='' THEN excluded.first_observed_at_utc ELSE MIN(comments.first_observed_at_utc, excluded.first_observed_at_utc) END,
            last_observed_at_utc=MAX(comments.last_observed_at_utc, excluded.last_observed_at_utc),
            time_accuracy=CASE WHEN excluded.time_accuracy_rank>=comments.time_accuracy_rank THEN excluded.time_accuracy ELSE comments.time_accuracy END,
            time_accuracy_rank=MAX(comments.time_accuracy_rank, excluded.time_accuracy_rank),
            source_timezone=CASE WHEN excluded.source_timezone<>'' THEN excluded.source_timezone ELSE comments.source_timezone END,
            business_timezone=CASE WHEN excluded.business_timezone<>'' THEN excluded.business_timezone ELSE comments.business_timezone END,
            collection_status=CASE WHEN excluded.collection_rank>=comments.collection_rank THEN excluded.collection_status ELSE comments.collection_status END,
            collection_rank=MAX(comments.collection_rank, excluded.collection_rank),
            candidate_status=CASE WHEN excluded.candidate_rank>=comments.candidate_rank THEN excluded.candidate_status ELSE comments.candidate_status END,
            candidate_rank=MAX(comments.candidate_rank, excluded.candidate_rank),
            analysis_status=CASE WHEN excluded.analysis_rank>=comments.analysis_rank THEN excluded.analysis_status ELSE comments.analysis_status END,
            analysis_rank=MAX(comments.analysis_rank, excluded.analysis_rank),
            reply_status=CASE WHEN excluded.reply_rank>=comments.reply_rank THEN excluded.reply_status ELSE comments.reply_status END,
            reply_rank=MAX(comments.reply_rank, excluded.reply_rank),
            resolution_status=CASE WHEN excluded.resolution_status<>'unknown' THEN excluded.resolution_status ELSE comments.resolution_status END,
            current_filter=CASE WHEN excluded.current_filter<>'' THEN excluded.current_filter ELSE comments.current_filter END,
            replies_collapsed=CASE WHEN excluded.collection_rank>=comments.collection_rank THEN excluded.replies_collapsed ELSE comments.replies_collapsed END,
            thread_completeness=CASE WHEN excluded.collection_rank>=comments.collection_rank AND excluded.thread_completeness<>'' THEN excluded.thread_completeness ELSE comments.thread_completeness END,
            reply_attempt_id=CASE WHEN excluded.reply_attempt_id<>'' THEN excluded.reply_attempt_id ELSE comments.reply_attempt_id END,
            reply_trace_id=CASE WHEN excluded.reply_trace_id<>'' THEN excluded.reply_trace_id ELSE comments.reply_trace_id END,
            generation_source=CASE WHEN excluded.generation_source<>'' THEN excluded.generation_source ELSE comments.generation_source END,
            source_robot_id=CASE WHEN excluded.source_robot_id<>'' THEN excluded.source_robot_id ELSE comments.source_robot_id END,
            source_client_id=CASE WHEN excluded.source_client_id<>'' THEN excluded.source_client_id ELSE comments.source_client_id END,
            updated_at_utc=excluded.updated_at_utc
        """,
        (
            comment_id,
            normalize_platform(payload.get("platform")),
            normalize_identifier(payload.get("external_comment_id"), max_length=512),
            normalize_identifier(payload.get("video_id")),
            normalize_text(payload.get("video_title"), max_length=1000),
            normalize_identifier(payload.get("parent_comment_id")),
            normalize_identifier(payload.get("root_comment_id")),
            max(1, int(payload.get("comment_level") or 1)),
            normalize_identifier(payload.get("author_key")),
            normalize_text(payload.get("author_display"), max_length=256),
            normalize_identifier(payload.get("sender_role") or "user", max_length=32),
            normalize_identifier(payload.get("actor_source") or "platform_user", max_length=64),
            confidence,
            _rank(ATTRIBUTION_RANK, confidence),
            content["text_content"],
            content["message_type"],
            content["type_placeholder"],
            normalize_text(payload.get("source_time_raw"), max_length=256),
            normalize_text(payload.get("source_timestamp_raw"), max_length=128),
            normalize_identifier(payload.get("source_time_utc"), max_length=64),
            normalize_identifier(payload.get("observed_at_utc"), max_length=64),
            normalize_identifier(payload.get("first_observed_at_utc"), max_length=64),
            normalize_identifier(payload.get("last_observed_at_utc"), max_length=64),
            time_accuracy,
            _rank(TIME_ACCURACY_RANK, time_accuracy, 1),
            normalize_identifier(payload.get("source_timezone"), max_length=64),
            normalize_identifier(payload.get("business_timezone"), max_length=64),
            collection_status,
            _rank(COMMENT_COLLECTION_RANK, collection_status, 10),
            candidate_status,
            _rank(COMMENT_CANDIDATE_RANK, candidate_status),
            analysis_status,
            _rank(ANALYSIS_STATUS_RANK, analysis_status),
            reply_status,
            _rank(REPLY_STATUS_RANK, reply_status),
            normalize_identifier(payload.get("resolution_status") or "unknown", max_length=64),
            normalize_text(payload.get("current_filter"), max_length=128),
            int(bool(payload.get("replies_collapsed", False))),
            normalize_identifier(payload.get("thread_completeness"), max_length=64),
            normalize_identifier(payload.get("reply_attempt_id"), max_length=256),
            normalize_identifier(payload.get("reply_trace_id"), max_length=512),
            normalize_identifier(payload.get("generation_source"), max_length=64),
            normalize_identifier(payload.get("source_robot_id")),
            normalize_identifier(payload.get("source_client_id"), max_length=128),
            now,
            now,
        ),
    )


def _apply_reply_attempt(connection: sqlite3.Connection, payload: dict[str, Any], now: str) -> None:
    attempt_id = normalize_identifier(payload.get("attempt_id"), max_length=256)
    if not attempt_id:
        raise ValueError("attempt_id is required")
    status = normalize_identifier(payload.get("status") or "not_attempted", max_length=64)
    status_rank = _rank(REPLY_STATUS_RANK, status)
    connection.execute(
        """
        INSERT INTO reply_attempts(
            attempt_id, target_type, target_id, conversation_id, draft_text, actual_text, status, status_rank,
            attempted_at_utc, confirmed_at_utc, error_code, error_message, reply_trace_id, generation_source,
            source_robot_id, source_client_id, created_at_utc, updated_at_utc
        ) VALUES(?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(attempt_id) DO UPDATE SET
            draft_text=CASE WHEN excluded.draft_text<>'' THEN excluded.draft_text ELSE reply_attempts.draft_text END,
            actual_text=CASE WHEN excluded.actual_text<>'' THEN excluded.actual_text ELSE reply_attempts.actual_text END,
            status=CASE WHEN excluded.status_rank>=reply_attempts.status_rank THEN excluded.status ELSE reply_attempts.status END,
            status_rank=MAX(reply_attempts.status_rank, excluded.status_rank),
            attempted_at_utc=CASE WHEN reply_attempts.attempted_at_utc='' THEN excluded.attempted_at_utc ELSE reply_attempts.attempted_at_utc END,
            confirmed_at_utc=CASE WHEN excluded.confirmed_at_utc<>'' THEN excluded.confirmed_at_utc ELSE reply_attempts.confirmed_at_utc END,
            error_code=CASE WHEN excluded.error_code<>'' THEN excluded.error_code ELSE reply_attempts.error_code END,
            error_message=CASE WHEN excluded.error_message<>'' THEN excluded.error_message ELSE reply_attempts.error_message END,
            reply_trace_id=CASE WHEN excluded.reply_trace_id<>'' THEN excluded.reply_trace_id ELSE reply_attempts.reply_trace_id END,
            generation_source=CASE WHEN excluded.generation_source<>'' THEN excluded.generation_source ELSE reply_attempts.generation_source END,
            source_robot_id=CASE WHEN excluded.source_robot_id<>'' THEN excluded.source_robot_id ELSE reply_attempts.source_robot_id END,
            source_client_id=CASE WHEN excluded.source_client_id<>'' THEN excluded.source_client_id ELSE reply_attempts.source_client_id END,
            updated_at_utc=excluded.updated_at_utc
        """,
        (
            attempt_id,
            normalize_identifier(payload.get("target_type") or "message", max_length=32),
            normalize_identifier(payload.get("target_id"), max_length=256),
            normalize_identifier(payload.get("conversation_id"), max_length=256),
            normalize_text(payload.get("draft_text")),
            normalize_text(payload.get("actual_text")),
            status,
            status_rank,
            normalize_identifier(payload.get("attempted_at_utc"), max_length=64),
            normalize_identifier(payload.get("confirmed_at_utc"), max_length=64),
            normalize_identifier(payload.get("error_code"), max_length=128),
            normalize_text(payload.get("error_message"), max_length=2000),
            normalize_identifier(payload.get("reply_trace_id"), max_length=512),
            normalize_identifier(payload.get("generation_source"), max_length=64),
            normalize_identifier(payload.get("source_robot_id")),
            normalize_identifier(payload.get("source_client_id")),
            now,
            now,
        ),
    )


def _apply_analysis(connection: sqlite3.Connection, payload: dict[str, Any], now: str) -> None:
    analysis_id = normalize_identifier(payload.get("analysis_id"), max_length=256)
    if not analysis_id:
        raise ValueError("analysis_id is required")
    status = normalize_identifier(payload.get("status") or "not_started", max_length=64)
    result = payload.get("result") if isinstance(payload.get("result"), dict) else {}
    result_json = json.dumps(result, ensure_ascii=False, sort_keys=True, separators=(",", ":"))
    connection.execute(
        """
        INSERT INTO analysis_results(
            analysis_id, target_type, target_id, analysis_type, status, status_rank, result_json,
            purpose_category, intention_level, started_at_utc, completed_at_utc,
            error_code, error_message, created_at_utc, updated_at_utc
        ) VALUES(?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(analysis_id) DO UPDATE SET
            status=CASE WHEN excluded.status_rank>=analysis_results.status_rank THEN excluded.status ELSE analysis_results.status END,
            status_rank=MAX(analysis_results.status_rank, excluded.status_rank),
            result_json=CASE WHEN excluded.result_json<>'{}' THEN excluded.result_json ELSE analysis_results.result_json END,
            purpose_category=CASE WHEN excluded.purpose_category<>'' THEN excluded.purpose_category ELSE analysis_results.purpose_category END,
            intention_level=CASE WHEN excluded.intention_level<>'' THEN excluded.intention_level ELSE analysis_results.intention_level END,
            started_at_utc=CASE WHEN analysis_results.started_at_utc='' THEN excluded.started_at_utc ELSE analysis_results.started_at_utc END,
            completed_at_utc=CASE WHEN excluded.completed_at_utc<>'' THEN excluded.completed_at_utc ELSE analysis_results.completed_at_utc END,
            error_code=CASE WHEN excluded.error_code<>'' THEN excluded.error_code ELSE analysis_results.error_code END,
            error_message=CASE WHEN excluded.error_message<>'' THEN excluded.error_message ELSE analysis_results.error_message END,
            updated_at_utc=excluded.updated_at_utc
        """,
        (
            analysis_id,
            normalize_identifier(payload.get("target_type") or "turn", max_length=32),
            normalize_identifier(payload.get("target_id"), max_length=256),
            normalize_identifier(payload.get("analysis_type"), max_length=128),
            status,
            _rank(ANALYSIS_STATUS_RANK, status),
            result_json,
            normalize_identifier(payload.get("purpose_category"), max_length=128),
            normalize_identifier(payload.get("intention_level"), max_length=64),
            normalize_identifier(payload.get("started_at_utc"), max_length=64),
            normalize_identifier(payload.get("completed_at_utc"), max_length=64),
            normalize_identifier(payload.get("error_code"), max_length=128),
            normalize_text(payload.get("error_message"), max_length=2000),
            now,
            now,
        ),
    )


def _apply_cursor(connection: sqlite3.Connection, payload: dict[str, Any], now: str) -> None:
    cursor_key = normalize_identifier(payload.get("cursor_key"), max_length=256)
    if not cursor_key:
        raise ValueError("cursor_key is required")
    cursor = payload.get("cursor") if isinstance(payload.get("cursor"), dict) else {}
    connection.execute(
        "INSERT INTO conversation_cursors(cursor_key, conversation_id, cursor_type, cursor_json, updated_at_utc) "
        "VALUES(?, ?, ?, ?, ?) "
        "ON CONFLICT(cursor_key) DO UPDATE SET conversation_id=excluded.conversation_id, cursor_type=excluded.cursor_type, "
        "cursor_json=excluded.cursor_json, updated_at_utc=excluded.updated_at_utc",
        (
            cursor_key,
            normalize_identifier(payload.get("conversation_id"), max_length=256),
            normalize_identifier(payload.get("cursor_type") or "visible_window", max_length=64),
            json.dumps(cursor, ensure_ascii=False, sort_keys=True, separators=(",", ":")),
            now,
        ),
    )
