from __future__ import annotations

from collections.abc import Callable
from dataclasses import dataclass
import queue
from pathlib import Path
import sqlite3
import threading
import time
from typing import Any

from .events import RecordEvent
from .recovery import RecoveryStore
from .schema import apply_event, initialize_dialogue_schema


@dataclass(frozen=True, slots=True)
class _StoreInit:
    store_id: str


class DialogueWriter:
    def __init__(
        self,
        accounts_root: Path,
        recovery: RecoveryStore,
        *,
        log: Callable[[str, str], None] | None = None,
        queue_size: int = 10000,
    ) -> None:
        self.accounts_root = Path(accounts_root)
        self.accounts_root.mkdir(parents=True, exist_ok=True)
        self.recovery = recovery
        self.log = log
        self.queue: queue.Queue[RecordEvent | _StoreInit | object] = queue.Queue(maxsize=max(100, queue_size))
        self._stop_marker = object()
        self._thread = threading.Thread(target=self._run, name="ucp-local-record-writer", daemon=True)
        self._force_stop = threading.Event()
        self._started = False
        self._connections: dict[str, sqlite3.Connection] = {}
        self._write_failures = 0

    def start(self) -> None:
        if self._started:
            return
        self._started = True
        self._thread.start()

    def ensure_store(self, store_id: str) -> bool:
        if not self._started or self._force_stop.is_set() or not self._thread.is_alive():
            return False
        try:
            self.queue.put_nowait(_StoreInit(store_id=store_id))
            return True
        except queue.Full:
            return False

    def submit(self, event: RecordEvent) -> bool:
        if not self._started or self._force_stop.is_set() or not self._thread.is_alive():
            self.recovery.append(event, "writer_not_available")
            return False
        try:
            self.queue.put_nowait(event)
            return True
        except queue.Full:
            self.recovery.append(event, "writer_queue_full")
            self._emit("WARN", "本地记录队列已满，事件已写入恢复文件。")
            return False

    def replay_pending(self) -> dict[str, int]:
        return self.recovery.replay(self._apply_event_with_retry)

    def _run(self) -> None:
        try:
            summary = self.replay_pending()
            if summary["files"]:
                self._emit(
                    "INFO",
                    "本地恢复文件回放完成："
                    f"files={summary['files']} applied={summary['applied']} "
                    f"duplicates={summary['duplicates']} failed={summary['failed']} "
                    f"quarantined={summary['quarantined']}",
                )
            while not self._force_stop.is_set():
                try:
                    item = self.queue.get(timeout=0.25)
                except queue.Empty:
                    continue
                if item is self._stop_marker:
                    self.queue.task_done()
                    break
                if isinstance(item, _StoreInit):
                    try:
                        self._connection_for(item.store_id)
                    except Exception as exc:
                        self._emit("WARN", f"账号本地数据库初始化失败，后续事件会继续重试：{type(exc).__name__}: {str(exc)[:200]}")
                    finally:
                        self.queue.task_done()
                    continue
                assert isinstance(item, RecordEvent)
                try:
                    self._apply_event_with_retry(item)
                except Exception as exc:
                    self._write_failures += 1
                    self.recovery.append(item, f"write_failed:{type(exc).__name__}:{exc}")
                    self._emit("WARN", f"本地记录写入失败，已转入恢复文件：{type(exc).__name__}: {str(exc)[:200]}")
                finally:
                    self.queue.task_done()
        finally:
            self._close_connections()

    def _connection_for(self, store_id: str) -> sqlite3.Connection:
        existing = self._connections.get(store_id)
        if existing:
            return existing
        if not store_id.startswith("acct_"):
            raise ValueError("invalid store_id")
        account_dir = self.accounts_root / store_id
        account_dir.mkdir(parents=True, exist_ok=True)
        db_path = account_dir / "dialogue.sqlite"
        connection = sqlite3.connect(str(db_path), timeout=5.0)
        connection.row_factory = sqlite3.Row
        connection.execute("PRAGMA busy_timeout=5000")
        connection.execute("PRAGMA foreign_keys=ON")
        try:
            row = connection.execute("PRAGMA journal_mode=WAL").fetchone()
            mode = str(row[0] if row else "").lower()
            if mode != "wal":
                self._emit("WARN", f"账号库 {store_id} 未启用 WAL，当前模式={mode or 'unknown'}。")
        except sqlite3.DatabaseError as exc:
            self._emit("WARN", f"账号库 {store_id} WAL 启用失败，降级为默认日志模式：{exc}")
        connection.execute("PRAGMA synchronous=NORMAL")
        initialize_dialogue_schema(connection)
        connection.commit()
        self._connections[store_id] = connection
        return connection

    def _apply_event_with_retry(self, event: RecordEvent) -> bool:
        delays = (0.02, 0.05, 0.1, 0.25, 0.5)
        last_error: Exception | None = None
        for attempt, delay in enumerate(delays, start=1):
            connection = self._connection_for(event.store_id)
            try:
                connection.execute("BEGIN IMMEDIATE")
                applied = apply_event(connection, event.event_id, event.event_type, event.payload)
                connection.commit()
                return applied
            except sqlite3.OperationalError as exc:
                connection.rollback()
                last_error = exc
                text = str(exc).lower()
                if "locked" not in text and "busy" not in text:
                    raise
                if attempt < len(delays):
                    time.sleep(delay)
            except Exception:
                connection.rollback()
                raise
        if last_error:
            raise last_error
        return False

    def close(self, timeout: float = 3.0) -> dict[str, int | bool]:
        if not self._started:
            return {"closed": True, "recovered": 0, "remaining": 0}
        try:
            self.queue.put(self._stop_marker, timeout=min(0.5, max(0.05, timeout)))
        except queue.Full:
            pass
        self._thread.join(timeout=max(0.1, timeout))
        recovered = 0
        if self._thread.is_alive():
            self._force_stop.set()
            while True:
                try:
                    item = self.queue.get_nowait()
                except queue.Empty:
                    break
                if isinstance(item, RecordEvent):
                    self.recovery.append(item, "shutdown_timeout")
                    recovered += 1
                self.queue.task_done()
            self._thread.join(timeout=0.5)
        return {
            "closed": not self._thread.is_alive(),
            "recovered": recovered,
            "remaining": self.queue.qsize(),
        }

    def flush(self, timeout: float = 3.0) -> bool:
        deadline = time.monotonic() + max(0.05, timeout)
        while time.monotonic() < deadline:
            if self.queue.unfinished_tasks == 0:
                return True
            time.sleep(0.02)
        return self.queue.unfinished_tasks == 0

    def checkpoint(self) -> None:
        for connection in list(self._connections.values()):
            try:
                connection.execute("PRAGMA wal_checkpoint(PASSIVE)").fetchone()
                connection.execute("PRAGMA optimize")
            except sqlite3.DatabaseError:
                continue

    def _close_connections(self) -> None:
        for connection in list(self._connections.values()):
            try:
                connection.execute("PRAGMA wal_checkpoint(PASSIVE)").fetchone()
                connection.execute("PRAGMA optimize")
                connection.commit()
            except sqlite3.DatabaseError:
                pass
            try:
                connection.close()
            except sqlite3.DatabaseError:
                pass
        self._connections.clear()

    def _emit(self, level: str, message: str) -> None:
        if not self.log:
            return
        try:
            self.log(level, message)
        except Exception:
            pass
