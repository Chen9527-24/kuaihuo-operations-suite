from __future__ import annotations

from dataclasses import dataclass
from enum import Enum
import os
from pathlib import Path
import shutil
import re
import sqlite3
import threading
import uuid
from typing import Any, Callable

from .events import create_event
from .identity import AccountRegistration, AccountRegistry
from .normalizers import DEFAULT_BUSINESS_TIMEZONE, iso_utc, normalize_source_time, stable_fingerprint
from .recovery import RecoveryStore
from .stats import LocalStats
from .writer import DialogueWriter


class RecordServiceState(str, Enum):
    OPEN = "OPEN"
    DRAINING = "DRAINING"
    CLOSED = "CLOSED"


@dataclass(frozen=True, slots=True)
class ServiceCloseResult:
    closed: bool
    recovered_events: int
    remaining_events: int


class LocalRecordService:
    """Non-blocking local dialogue persistence service.

    Platform adapters submit only cleaned whitelist events. SQLite failures are
    isolated from robot flows and fall back to per-process recovery files.
    """

    def __init__(
        self,
        project_root: Path,
        *,
        business_timezone: str = DEFAULT_BUSINESS_TIMEZONE,
        log: Callable[[str, str], None] | None = None,
        queue_size: int = 10000,
    ) -> None:
        self.project_root = Path(project_root)
        self.records_root = self.project_root / "records"
        self.records_root.mkdir(parents=True, exist_ok=True)
        self.business_timezone = business_timezone
        self.log = log
        self.client_id = f"ucp-{os.getpid()}-{uuid.uuid4().hex[:8]}"
        self._state = RecordServiceState.OPEN
        self._state_lock = threading.RLock()
        self._registrations_by_robot: dict[tuple[str, str, str], AccountRegistration] = {}
        self._identity_signature_by_robot: dict[tuple[str, str, str], tuple[str, ...]] = {}
        self.registry = AccountRegistry(self.records_root)
        self.recovery = RecoveryStore(self.records_root)
        self.writer = DialogueWriter(
            self.registry.accounts_root,
            self.recovery,
            log=self._emit,
            queue_size=queue_size,
        )
        self.stats = LocalStats(self.registry.accounts_root, business_timezone=business_timezone)
        self.writer.start()
        self._emit("INFO", f"本地对话记录底座已启动：{self.records_root}")

    @property
    def state(self) -> RecordServiceState:
        with self._state_lock:
            return self._state

    def register_account(self, account: Any) -> AccountRegistration | None:
        if self.state == RecordServiceState.CLOSED:
            return None
        try:
            tenant_id = str(getattr(account, "tenant_id", "") if not isinstance(account, dict) else account.get("tenant_id") or account.get("tenantId") or "").strip() or "unknown-tenant"
            platform = str(getattr(account, "platform", "") if not isinstance(account, dict) else account.get("platform") or "").strip().upper() or "UNKNOWN"
            robot_id = str(getattr(account, "id", "") if not isinstance(account, dict) else account.get("id") or account.get("robot_id") or account.get("robotId") or "").strip()
            auth_id = str(getattr(account, "auth_id", "") if not isinstance(account, dict) else account.get("auth_id") or account.get("authId") or "").strip()
            auth_uid = str(getattr(account, "auth_uid", "") if not isinstance(account, dict) else account.get("auth_uid") or account.get("authUid") or "").strip()
            auth_name = str(getattr(account, "auth_name", "") if not isinstance(account, dict) else account.get("auth_name") or account.get("authName") or "").strip()
            name = str(getattr(account, "name", "") if not isinstance(account, dict) else account.get("name") or "").strip()
            key = (tenant_id, platform, robot_id)
            signature = (tenant_id, platform, robot_id, auth_id, auth_uid, auth_name, name)
            cached = self._registrations_by_robot.get(key) if robot_id else None
            if cached and self._identity_signature_by_robot.get(key) == signature:
                self.writer.ensure_store(cached.store_id)
                return cached

            registration = self.registry.register_account(account)
            if registration.robot_id:
                key = (registration.tenant_id, registration.platform, registration.robot_id)
                self._registrations_by_robot[key] = registration
                self._identity_signature_by_robot[key] = signature
            self.writer.ensure_store(registration.store_id)
            if registration.conflict:
                self._emit("WARN", f"本地账号身份存在待合并冲突：storeId={registration.store_id}")
            return registration
        except Exception as exc:
            self._emit("WARN", f"本地账号注册失败，已降级且不影响机器人：{type(exc).__name__}: {str(exc)[:240]}")
            return None

    def registration_for_robot(
        self,
        robot_id: str,
        *,
        tenant_id: str = "",
        platform: str = "",
    ) -> AccountRegistration | None:
        robot_id = str(robot_id or "").strip()
        if not robot_id:
            return None
        if tenant_id and platform:
            return self._registrations_by_robot.get((str(tenant_id).strip(), str(platform).strip().upper(), robot_id))
        matches = [registration for key, registration in self._registrations_by_robot.items() if key[2] == robot_id]
        return matches[0] if len(matches) == 1 else None

    def store_id_for(self, account_or_robot: Any) -> str:
        if isinstance(account_or_robot, str):
            registration = self.registration_for_robot(account_or_robot)
        else:
            registration = self.register_account(account_or_robot)
        return registration.store_id if registration else ""

    def submit(
        self,
        *,
        store_id: str,
        event_type: str,
        payload: dict[str, Any],
        event_id: str = "",
    ) -> bool:
        if self.state == RecordServiceState.CLOSED:
            return False
        try:
            event = create_event(
                store_id=store_id,
                event_type=event_type,
                payload=payload,
                event_id=event_id,
            )
            return self.writer.submit(event)
        except Exception as exc:
            self._emit("WARN", f"本地记录事件被拒绝，已忽略且不影响机器人：{type(exc).__name__}: {str(exc)[:240]}")
            return False

    def submit_for_account(
        self,
        account: Any,
        *,
        event_type: str,
        payload: dict[str, Any],
        event_id: str = "",
    ) -> bool:
        registration = self.register_account(account)
        if not registration:
            return False
        clean_payload = dict(payload or {})
        clean_payload.setdefault("platform", registration.platform)
        clean_payload.setdefault("source_robot_id", registration.robot_id)
        clean_payload.setdefault("source_client_id", self.client_id)
        return self.submit(
            store_id=registration.store_id,
            event_type=event_type,
            payload=clean_payload,
            event_id=event_id,
        )

    def normalized_time(self, **kwargs: Any) -> dict[str, str]:
        kwargs.setdefault("business_timezone", self.business_timezone)
        return normalize_source_time(**kwargs).as_dict()

    @staticmethod
    def message_fingerprint(*parts: Any) -> str:
        return stable_fingerprint(*parts)

    def flush(self, timeout: float = 3.0) -> bool:
        try:
            return bool(self.writer.flush(timeout=timeout))
        except Exception:
            return False

    def load_cursor(self, store_id: str, cursor_key: str) -> dict[str, Any]:
        if not str(store_id).startswith("acct_") or not str(cursor_key).strip():
            return {}
        db_path = self.registry.account_dir(store_id) / "dialogue.sqlite"
        if not db_path.exists():
            return {}
        connection = sqlite3.connect(str(db_path), timeout=2.0)
        try:
            row = connection.execute(
                "SELECT cursor_json FROM conversation_cursors WHERE cursor_key=?",
                (str(cursor_key).strip()[:256],),
            ).fetchone()
            if not row:
                return {}
            import json
            value = json.loads(str(row[0] or "{}"))
            return value if isinstance(value, dict) else {}
        except (sqlite3.DatabaseError, ValueError, TypeError):
            return {}
        finally:
            connection.close()

    def summary(self, store_id: str, *, days: int = 7) -> dict[str, Any]:
        try:
            return self.stats.summary(store_id, days=days)
        except Exception as exc:
            self._emit("WARN", f"本地统计查询失败：{type(exc).__name__}: {str(exc)[:240]}")
            return {}

    def reply_attempt_status(self, store_id: str, attempt_id: str) -> str:
        """Return the persisted status for one deterministic reply attempt.

        Platform adapters use this read-only check to avoid re-sending the same
        incoming message after UCP restarts. Database errors degrade to an empty
        status and never block the robot.
        """
        if not str(store_id).startswith("acct_") or not str(attempt_id).strip():
            return ""
        self.flush(timeout=1.0)
        db_path = self.registry.account_dir(store_id) / "dialogue.sqlite"
        if not db_path.exists():
            return ""
        connection = sqlite3.connect(str(db_path), timeout=2.0)
        try:
            row = connection.execute(
                "SELECT status FROM reply_attempts WHERE attempt_id=?",
                (str(attempt_id).strip()[:256],),
            ).fetchone()
            return str(row[0] or "") if row else ""
        except sqlite3.DatabaseError:
            return ""
        finally:
            connection.close()

    def recent_messages(self, store_id: str, conversation_id: str, *, limit: int = 40) -> list[dict[str, Any]]:
        """Read a bounded whitelist projection for remote idempotent sync/context.

        No Cookie, Token, HTML, DOM, attachment URL, or raw platform payload is
        returned. The writer is flushed first so the just-observed window is
        available to the reply worker.
        """
        if not str(store_id).startswith("acct_") or not str(conversation_id).strip():
            return []
        self.flush(timeout=1.5)
        db_path = self.registry.account_dir(store_id) / "dialogue.sqlite"
        if not db_path.exists():
            return []
        connection = sqlite3.connect(str(db_path), timeout=3.0)
        connection.row_factory = sqlite3.Row
        try:
            rows = connection.execute(
                """
                SELECT
                    messages.message_id, messages.conversation_id, messages.sender_role, messages.actor_source,
                    messages.attribution_confidence, messages.message_type, messages.text_content,
                    messages.type_placeholder, messages.sequence_index, messages.history_kind,
                    messages.time_accuracy, messages.observed_at_utc, messages.payload_fingerprint,
                    messages.reply_attempt_id,
                    COALESCE(NULLIF(messages.reply_trace_id, ''), reply_attempts.reply_trace_id, '') AS reply_trace_id,
                    COALESCE(NULLIF(messages.generation_source, ''), reply_attempts.generation_source, '') AS generation_source,
                    messages.source_client_id
                FROM messages
                LEFT JOIN reply_attempts ON reply_attempts.attempt_id=messages.reply_attempt_id
                WHERE messages.conversation_id=?
                ORDER BY messages.sequence_index DESC, messages.rowid DESC
                LIMIT ?
                """,
                (str(conversation_id).strip()[:256], max(1, min(100, int(limit or 40)))),
            ).fetchall()
            return [dict(row) for row in reversed(rows)]
        except sqlite3.DatabaseError:
            return []
        finally:
            connection.close()

    def recent_comment_messages(self, store_id: str, root_comment_id: str, *, limit: int = 10) -> list[dict[str, Any]]:
        """Return a bounded whitelist projection for one comment thread.

        The lookup is intentionally local and fast. It never exposes cookies,
        tokens, DOM/HTML, attachment URLs, or raw platform payloads. The current
        writer queue is flushed briefly so the just-observed comment window can
        participate in reply context without blocking the robot for long.
        """
        if not str(store_id).startswith("acct_") or not str(root_comment_id).strip():
            return []
        self.flush(timeout=0.8)
        db_path = self.registry.account_dir(store_id) / "dialogue.sqlite"
        if not db_path.exists():
            return []
        connection = sqlite3.connect(str(db_path), timeout=2.0)
        connection.row_factory = sqlite3.Row
        try:
            rows = connection.execute(
                """
                SELECT
                    comment_id, root_comment_id, parent_comment_id, comment_level,
                    author_display, sender_role, actor_source, attribution_confidence,
                    message_type, text_content, type_placeholder, source_time_raw,
                    source_time_utc, observed_at_utc, reply_status,
                    reply_attempt_id, reply_trace_id, generation_source
                FROM comments
                WHERE root_comment_id=? OR comment_id=?
                ORDER BY rowid DESC
                LIMIT ?
                """,
                (
                    str(root_comment_id).strip()[:256],
                    str(root_comment_id).strip()[:256],
                    max(1, min(30, int(limit or 10))),
                ),
            ).fetchall()
            return [dict(row) for row in reversed(rows)]
        except sqlite3.DatabaseError:
            return []
        finally:
            connection.close()

    def conversation_candidates(
        self,
        store_id: str,
        *,
        platform: str,
        channel_type: str,
        participant_display: str,
        limit: int = 20,
        message_limit: int = 20,
    ) -> list[dict[str, Any]]:
        """Return bounded same-name candidates for UID-free local identity recovery."""
        if not str(store_id).startswith("acct_"):
            return []
        display = " ".join(str(participant_display or "").strip().lower().split())[:256]
        if not display:
            return []
        self.flush(timeout=1.5)
        db_path = self.registry.account_dir(store_id) / "dialogue.sqlite"
        if not db_path.exists():
            return []
        connection = sqlite3.connect(str(db_path), timeout=3.0)
        connection.row_factory = sqlite3.Row
        try:
            rows = connection.execute(
                """
                SELECT conversation_id, platform, channel_type, title,
                       participant_display, is_group, last_observed_at_utc
                FROM conversations
                WHERE platform=? AND channel_type=?
                ORDER BY last_observed_at_utc DESC, updated_at_utc DESC
                LIMIT ?
                """,
                (
                    str(platform or "").strip().upper()[:32],
                    str(channel_type or "").strip().lower()[:32],
                    max(1, min(100, int(limit or 20) * 4)),
                ),
            ).fetchall()
            candidates: list[dict[str, Any]] = []
            for row in rows:
                row_display = " ".join(str(row["participant_display"] or row["title"] or "").strip().lower().split())[:256]
                if row_display != display:
                    continue
                messages = connection.execute(
                    """
                    SELECT sender_role, actor_source, attribution_confidence,
                           message_type, text_content, type_placeholder,
                           sequence_index, observed_at_utc
                    FROM messages
                    WHERE conversation_id=?
                    ORDER BY sequence_index DESC, rowid DESC
                    LIMIT ?
                    """,
                    (str(row["conversation_id"]), max(2, min(50, int(message_limit or 20)))),
                ).fetchall()
                signatures: list[str] = []
                for message in reversed(messages):
                    sender = "account" if str(message["sender_role"] or "").lower() == "account" else "user"
                    message_type_value = str(message["message_type"] or "unknown").strip().lower()[:32]
                    content = str(message["text_content"] or message["type_placeholder"] or f"[{message_type_value}]").lower()
                    content = re.sub(r"[\s\W_]+", "", content, flags=re.UNICODE)[:1000]
                    signatures.append(f"{sender}|{message_type_value}|{content}")
                candidates.append({
                    "conversation_id": str(row["conversation_id"]),
                    "conversation_type": "group" if int(row["is_group"] or 0) else "private",
                    "display_name": str(row["participant_display"] or row["title"] or ""),
                    "last_observed_at_utc": str(row["last_observed_at_utc"] or ""),
                    "signatures": signatures,
                })
                if len(candidates) >= max(1, min(100, int(limit or 20))):
                    break
            return candidates
        except sqlite3.DatabaseError:
            return []
        finally:
            connection.close()

    def backup_account(self, store_id: str, destination: Path | None = None) -> Path:
        if not str(store_id).startswith("acct_"):
            raise ValueError("invalid store_id")
        account_dir = self.registry.account_dir(store_id)
        source_path = account_dir / "dialogue.sqlite"
        if not source_path.exists():
            raise FileNotFoundError(source_path)
        backup_dir = account_dir / "backups"
        backup_dir.mkdir(exist_ok=True)
        target = Path(destination) if destination else backup_dir / f"dialogue_{iso_utc().replace(':', '').replace('-', '')}.sqlite"
        target.parent.mkdir(parents=True, exist_ok=True)
        temp_target = target.with_suffix(target.suffix + ".tmp")
        self.writer.checkpoint()
        source = sqlite3.connect(str(source_path), timeout=5.0)
        destination_conn = sqlite3.connect(str(temp_target), timeout=5.0)
        try:
            source.backup(destination_conn)
            destination_conn.commit()
        finally:
            destination_conn.close()
            source.close()
        shutil.move(str(temp_target), str(target))
        return target

    def begin_draining(self) -> None:
        with self._state_lock:
            if self._state == RecordServiceState.OPEN:
                self._state = RecordServiceState.DRAINING
                self._emit("INFO", "本地记录服务进入 DRAINING，等待机器人停止并清空队列。")

    def close(self, timeout: float = 3.0) -> ServiceCloseResult:
        with self._state_lock:
            if self._state == RecordServiceState.CLOSED:
                return ServiceCloseResult(True, 0, 0)
            if self._state == RecordServiceState.OPEN:
                self._state = RecordServiceState.DRAINING
        writer_result = self.writer.close(timeout=timeout)
        try:
            self.registry.close()
        finally:
            with self._state_lock:
                self._state = RecordServiceState.CLOSED
        result = ServiceCloseResult(
            closed=bool(writer_result.get("closed", False)),
            recovered_events=int(writer_result.get("recovered", 0) or 0),
            remaining_events=int(writer_result.get("remaining", 0) or 0),
        )
        self._emit(
            "INFO",
            "本地记录服务已关闭："
            f"closed={result.closed} recovered={result.recovered_events} remaining={result.remaining_events}",
        )
        return result

    def _emit(self, level: str, message: str) -> None:
        if not self.log:
            return
        try:
            self.log(level, message)
        except Exception:
            pass


class NullLocalRecordService:
    """Failure-isolation fallback used when the local data module cannot start."""

    state = RecordServiceState.CLOSED
    client_id = ""

    def register_account(self, account: Any) -> None:
        del account
        return None

    def registration_for_robot(self, robot_id: str, *, tenant_id: str = "", platform: str = "") -> None:
        del robot_id, tenant_id, platform
        return None

    def store_id_for(self, account_or_robot: Any) -> str:
        del account_or_robot
        return ""

    def submit(self, **kwargs: Any) -> bool:
        del kwargs
        return False

    def submit_for_account(self, account: Any, **kwargs: Any) -> bool:
        del account, kwargs
        return False

    def normalized_time(self, **kwargs: Any) -> dict[str, str]:
        return normalize_source_time(**kwargs).as_dict()

    @staticmethod
    def message_fingerprint(*parts: Any) -> str:
        return stable_fingerprint(*parts)

    def flush(self, timeout: float = 3.0) -> bool:
        del timeout
        return True

    def load_cursor(self, store_id: str, cursor_key: str) -> dict[str, Any]:
        del store_id, cursor_key
        return {}

    def summary(self, store_id: str, *, days: int = 7) -> dict[str, Any]:
        del store_id, days
        return {}

    def reply_attempt_status(self, store_id: str, attempt_id: str) -> str:
        del store_id, attempt_id
        return ""

    def conversation_candidates(self, store_id: str, **kwargs: Any) -> list[dict[str, Any]]:
        del store_id, kwargs
        return []

    def recent_messages(self, store_id: str, conversation_id: str, *, limit: int = 40) -> list[dict[str, Any]]:
        del store_id, conversation_id, limit
        return []

    def recent_comment_messages(self, store_id: str, root_comment_id: str, *, limit: int = 10) -> list[dict[str, Any]]:
        del store_id, root_comment_id, limit
        return []

    def begin_draining(self) -> None:
        return None

    def close(self, timeout: float = 0.0) -> ServiceCloseResult:
        del timeout
        return ServiceCloseResult(True, 0, 0)
