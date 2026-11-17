from __future__ import annotations

from datetime import datetime, timezone
import json
import os
from pathlib import Path
import threading
from typing import Callable

from .events import RecordEvent
from .normalizers import iso_utc, normalize_text


class RecoveryStore:
    def __init__(self, records_root: Path) -> None:
        self.root = Path(records_root) / "_recovery"
        self.pending_dir = self.root / "pending"
        self.replayed_dir = self.root / "replayed"
        self.quarantine_dir = self.root / "quarantine"
        for path in (self.pending_dir, self.replayed_dir, self.quarantine_dir):
            path.mkdir(parents=True, exist_ok=True)
        self._lock = threading.RLock()
        self.current_file = self.pending_dir / f"recovery_{os.getpid()}.jsonl"

    def append(self, event: RecordEvent, reason: str) -> None:
        envelope = {
            "event": json.loads(event.to_json()),
            "reason": normalize_text(reason, max_length=1000),
            "savedAtUtc": iso_utc(),
        }
        line = json.dumps(envelope, ensure_ascii=False, sort_keys=True, separators=(",", ":")) + "\n"
        with self._lock:
            with self.current_file.open("a", encoding="utf-8", newline="\n") as handle:
                handle.write(line)
                handle.flush()
                try:
                    os.fsync(handle.fileno())
                except OSError:
                    pass

    def replay(self, apply_callback: Callable[[RecordEvent], bool]) -> dict[str, int]:
        summary = {"files": 0, "applied": 0, "duplicates": 0, "failed": 0, "quarantined": 0}
        with self._lock:
            files = sorted(path for path in self.pending_dir.glob("recovery_*.jsonl") if path.is_file())
        for path in files:
            summary["files"] += 1
            failed_lines: list[str] = []
            quarantine_lines: list[str] = []
            try:
                lines = path.read_text(encoding="utf-8").splitlines()
            except OSError:
                summary["failed"] += 1
                continue
            for raw_line in lines:
                if not raw_line.strip():
                    continue
                try:
                    envelope = json.loads(raw_line)
                    event_data = envelope.get("event") if isinstance(envelope, dict) else None
                    if not isinstance(event_data, dict):
                        raise ValueError("missing event mapping")
                    event = RecordEvent.from_mapping(event_data)
                except Exception:
                    quarantine_lines.append(raw_line)
                    summary["quarantined"] += 1
                    continue
                try:
                    applied = apply_callback(event)
                    if applied:
                        summary["applied"] += 1
                    else:
                        summary["duplicates"] += 1
                except Exception:
                    failed_lines.append(raw_line)
                    summary["failed"] += 1

            if quarantine_lines:
                stamp = datetime.now(timezone.utc).strftime("%Y%m%d_%H%M%S_%f")
                quarantine_path = self.quarantine_dir / f"{path.stem}_bad_{stamp}.jsonl"
                quarantine_path.write_text("\n".join(quarantine_lines) + "\n", encoding="utf-8")

            try:
                if failed_lines:
                    temp = path.with_suffix(".rewrite.tmp")
                    temp.write_text("\n".join(failed_lines) + "\n", encoding="utf-8")
                    os.replace(temp, path)
                else:
                    stamp = datetime.now(timezone.utc).strftime("%Y%m%d_%H%M%S_%f")
                    destination = self.replayed_dir / f"{path.stem}_{stamp}.jsonl"
                    os.replace(path, destination)
            except OSError:
                summary["failed"] += 1
        return summary
