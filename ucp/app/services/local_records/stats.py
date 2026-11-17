from __future__ import annotations

from collections import Counter
from datetime import datetime, time, timedelta, timezone
from pathlib import Path
import re
import sqlite3
from typing import Any

from .normalizers import DEFAULT_BUSINESS_TIMEZONE, get_timezone, iso_utc


class LocalStats:
    def __init__(self, accounts_root: Path, business_timezone: str = DEFAULT_BUSINESS_TIMEZONE) -> None:
        self.accounts_root = Path(accounts_root)
        self.business_timezone = business_timezone

    def _db_path(self, store_id: str) -> Path:
        if not str(store_id).startswith("acct_"):
            raise ValueError("invalid store_id")
        return self.accounts_root / store_id / "dialogue.sqlite"

    def _window(self, days: int, now: datetime | None = None) -> tuple[str, str]:
        days = max(1, int(days))
        zone = get_timezone(self.business_timezone)
        current = now or datetime.now(timezone.utc)
        if current.tzinfo is None:
            current = current.replace(tzinfo=timezone.utc)
        local_now = current.astimezone(zone)
        start_date = local_now.date() - timedelta(days=days - 1)
        start_local = datetime.combine(start_date, time.min, tzinfo=zone)
        end_local = datetime.combine(local_now.date() + timedelta(days=1), time.min, tzinfo=zone)
        return iso_utc(start_local), iso_utc(end_local)

    def summary(self, store_id: str, *, days: int = 7, now: datetime | None = None) -> dict[str, Any]:
        db_path = self._db_path(store_id)
        start_utc, end_utc = self._window(days, now)
        result: dict[str, Any] = {
            "storeId": store_id,
            "days": max(1, int(days)),
            "businessTimezone": self.business_timezone,
            "startUtc": start_utc,
            "endUtc": end_utc,
            "messages": {},
            "comments": {},
            "coverage": {},
            "purposeByTurns": [],
            "purposeByUsers": [],
            "wordFrequency": [],
        }
        if not db_path.exists():
            return result
        connection = sqlite3.connect(str(db_path), timeout=5.0)
        connection.row_factory = sqlite3.Row
        connection.execute("PRAGMA query_only=ON")
        connection.execute("PRAGMA busy_timeout=5000")
        try:
            result["messages"] = {
                "userRawMessages": self._scalar(
                    connection,
                    "SELECT COUNT(*) FROM messages WHERE sender_role='user' AND source_time_utc>=? AND source_time_utc<?",
                    (start_utc, end_utc),
                ),
                "analyzableTextMessages": self._scalar(
                    connection,
                    "SELECT COUNT(*) FROM messages WHERE sender_role='user' AND is_semantically_analyzable=1 AND source_time_utc>=? AND source_time_utc<?",
                    (start_utc, end_utc),
                ),
                "turns": self._scalar(
                    connection,
                    "SELECT COUNT(*) FROM message_turns WHERE COALESCE(NULLIF(ended_at_utc,''), started_at_utc)>=? AND COALESCE(NULLIF(ended_at_utc,''), started_at_utc)<?",
                    (start_utc, end_utc),
                ),
                "activeConversations": self._scalar(
                    connection,
                    "SELECT COUNT(DISTINCT conversation_id) FROM messages WHERE sender_role='user' AND source_time_utc>=? AND source_time_utc<?",
                    (start_utc, end_utc),
                ),
                "identifiableUsers": self._scalar(
                    connection,
                    "SELECT COUNT(DISTINCT c.participant_key) FROM conversations c JOIN messages m ON m.conversation_id=c.conversation_id "
                    "WHERE m.sender_role='user' AND c.is_group=0 AND c.participant_key<>'' AND m.source_time_utc>=? AND m.source_time_utc<?",
                    (start_utc, end_utc),
                ),
                "pureNonTextMessages": self._scalar(
                    connection,
                    "SELECT COUNT(*) FROM messages WHERE sender_role='user' AND has_non_text=1 AND has_text=0 AND source_time_utc>=? AND source_time_utc<?",
                    (start_utc, end_utc),
                ),
                "robotConfirmedReplies": self._scalar(
                    connection,
                    "SELECT COUNT(*) FROM messages WHERE sender_role='account' AND actor_source='robot' AND attribution_confidence='verified' "
                    "AND source_time_utc>=? AND source_time_utc<?",
                    (start_utc, end_utc),
                ),
                "unconfirmedAccountReplies": self._scalar(
                    connection,
                    "SELECT COUNT(*) FROM messages WHERE sender_role='account' AND actor_source<>'robot' AND source_time_utc>=? AND source_time_utc<?",
                    (start_utc, end_utc),
                ),
            }
            result["comments"] = {
                "topLevel": self._scalar(
                    connection,
                    "SELECT COUNT(*) FROM comments WHERE comment_level=1 AND source_time_utc>=? AND source_time_utc<?",
                    (start_utc, end_utc),
                ),
                "followUps": self._scalar(
                    connection,
                    "SELECT COUNT(*) FROM comments WHERE comment_level>1 AND source_time_utc>=? AND source_time_utc<?",
                    (start_utc, end_utc),
                ),
                "threads": self._scalar(
                    connection,
                    "SELECT COUNT(DISTINCT CASE WHEN root_comment_id<>'' THEN root_comment_id ELSE comment_id END) FROM comments "
                    "WHERE source_time_utc>=? AND source_time_utc<?",
                    (start_utc, end_utc),
                ),
                "identifiableUsers": self._scalar(
                    connection,
                    "SELECT COUNT(DISTINCT author_key) FROM comments WHERE author_key<>'' AND source_time_utc>=? AND source_time_utc<?",
                    (start_utc, end_utc),
                ),
                "robotConfirmedReplies": self._scalar(
                    connection,
                    "SELECT COUNT(*) FROM comments WHERE reply_status IN ('sent','sent_late_confirmed') AND source_time_utc>=? AND source_time_utc<?",
                    (start_utc, end_utc),
                ),
                "sendUnconfirmed": self._scalar(
                    connection,
                    "SELECT COUNT(*) FROM comments WHERE reply_status='send_unconfirmed' AND source_time_utc>=? AND source_time_utc<?",
                    (start_utc, end_utc),
                ),
                "incompleteThreads": self._scalar(
                    connection,
                    "SELECT COUNT(*) FROM comments WHERE replies_collapsed=1 OR collection_status='partial_thread'",
                ),
            }
            result["coverage"] = {
                "knownMessageTimes": self._scalar(connection, "SELECT COUNT(*) FROM messages WHERE source_time_utc<>''"),
                "unknownHistoricalMessageTimes": self._scalar(connection, "SELECT COUNT(*) FROM messages WHERE source_time_utc=''"),
                "knownCommentTimes": self._scalar(connection, "SELECT COUNT(*) FROM comments WHERE source_time_utc<>''"),
                "unknownCommentTimes": self._scalar(connection, "SELECT COUNT(*) FROM comments WHERE source_time_utc=''"),
                "validClassifiedTurns": self._scalar(connection, "SELECT COUNT(*) FROM message_turns WHERE purpose_category<>''"),
                "sendUnconfirmed": self._scalar(connection, "SELECT COUNT(*) FROM reply_attempts WHERE status='send_unconfirmed'"),
            }
            result["purposeByTurns"] = [dict(row) for row in connection.execute(
                "SELECT purpose_category AS category, COUNT(*) AS count FROM message_turns "
                "WHERE purpose_category<>'' AND COALESCE(NULLIF(ended_at_utc,''), started_at_utc)>=? AND COALESCE(NULLIF(ended_at_utc,''), started_at_utc)<? "
                "GROUP BY purpose_category ORDER BY count DESC, category ASC",
                (start_utc, end_utc),
            ).fetchall()]
            result["purposeByUsers"] = [dict(row) for row in connection.execute(
                "SELECT mt.purpose_category AS category, COUNT(DISTINCT c.participant_key) AS count "
                "FROM message_turns mt JOIN conversations c ON c.conversation_id=mt.conversation_id "
                "WHERE mt.purpose_category<>'' AND c.participant_key<>'' "
                "AND COALESCE(NULLIF(mt.ended_at_utc,''), mt.started_at_utc)>=? AND COALESCE(NULLIF(mt.ended_at_utc,''), mt.started_at_utc)<? "
                "GROUP BY mt.purpose_category ORDER BY count DESC, category ASC",
                (start_utc, end_utc),
            ).fetchall()]
            result["wordFrequency"] = self._word_frequency(connection, start_utc, end_utc)
            return result
        finally:
            connection.close()

    @staticmethod
    def _scalar(connection: sqlite3.Connection, sql: str, params: tuple[Any, ...] = ()) -> int:
        row = connection.execute(sql, params).fetchone()
        return int(row[0] or 0) if row else 0

    def _word_frequency(self, connection: sqlite3.Connection, start_utc: str, end_utc: str) -> list[dict[str, Any]]:
        rows = connection.execute(
            "SELECT m.text_content, m.message_id, c.participant_key FROM messages m "
            "JOIN conversations c ON c.conversation_id=m.conversation_id "
            "WHERE m.sender_role='user' AND m.is_semantically_analyzable=1 "
            "AND m.source_time_utc>=? AND m.source_time_utc<?",
            (start_utc, end_utc),
        ).fetchall()
        occurrences: Counter[str] = Counter()
        record_ids: dict[str, set[str]] = {}
        user_ids: dict[str, set[str]] = {}
        stop_words = {"这个", "那个", "可以", "怎么", "什么", "就是", "一下", "你好", "谢谢", "请问", "我们", "你们"}
        for row in rows:
            text = str(row["text_content"] or "").lower()
            tokens = re.findall(r"[a-z0-9]{2,}|[\u4e00-\u9fff]{2,6}", text)
            for token in tokens:
                if token in stop_words or token.isdigit():
                    continue
                occurrences[token] += 1
                record_ids.setdefault(token, set()).add(str(row["message_id"]))
                participant = str(row["participant_key"] or "")
                if participant:
                    user_ids.setdefault(token, set()).add(participant)
        output = []
        for token, count in occurrences.most_common(50):
            output.append(
                {
                    "word": token,
                    "occurrences": count,
                    "records": len(record_ids.get(token, set())),
                    "users": len(user_ids.get(token, set())),
                }
            )
        return output
