from __future__ import annotations

import hashlib
import json
import os
import re
import time
from dataclasses import asdict
from datetime import datetime
from pathlib import Path
from typing import Any, Iterable

from .models import CommentRecord, ContentRecord


MANIFEST_VERSION = 2
RECOVERABLE_STATUSES = {"RUNNING", "STOPPED", "ERROR", "RECOVERABLE"}
TERMINAL_TARGET_STATUSES = {"COMPLETED", "SKIPPED"}


class InterceptStopRequested(RuntimeError):
    """Raised when the GUI requested a cooperative, checkpoint-safe intercept stop."""


def _utc_now() -> str:
    return datetime.now().astimezone().isoformat()


def _safe_key(value: object, fallback: str = "robot") -> str:
    raw = str(value or "").strip() or fallback
    safe = re.sub(r"[^A-Za-z0-9_-]+", "_", raw).strip("_")[:56] or fallback
    digest = hashlib.sha1(raw.encode("utf-8", errors="ignore")).hexdigest()[:10]
    return f"{safe}_{digest}" if digest and digest not in safe else safe


def _target_key(target_type: str, url: str, index: int) -> str:
    raw = f"{target_type}|{index}|{str(url or '').strip()}"
    return hashlib.sha1(raw.encode("utf-8", errors="ignore")).hexdigest()[:20]


def content_key(record: Any) -> str:
    if isinstance(record, dict):
        platform = str(record.get("platform") or "")
        content_id = str(record.get("platform_content_id") or record.get("platformContentId") or "")
        url = str(record.get("source_content_url") or record.get("sourceContentUrl") or "")
    else:
        platform = str(getattr(record, "platform", "") or "")
        content_id = str(getattr(record, "platform_content_id", "") or "")
        url = str(getattr(record, "source_content_url", "") or "")
    normalized_url = url.split("#", 1)[0].split("?", 1)[0]
    raw = f"{platform}|{content_id}|{normalized_url}"
    return hashlib.sha1(raw.encode("utf-8", errors="ignore")).hexdigest()[:24]


def _comment_to_payload(comment: CommentRecord) -> dict[str, Any]:
    return asdict(comment)


def _comment_from_payload(payload: dict[str, Any]) -> CommentRecord:
    replies = [_comment_from_payload(item) for item in (payload.get("replies") or []) if isinstance(item, dict)]
    return CommentRecord(
        comment_id=payload.get("comment_id"),
        parent_comment_id=payload.get("parent_comment_id"),
        user_id=payload.get("user_id"),
        nickname=payload.get("nickname"),
        comment_text=payload.get("comment_text"),
        comment_time_raw=payload.get("comment_time_raw"),
        comment_time_iso=payload.get("comment_time_iso"),
        visible_region=payload.get("visible_region"),
        source_account_url=str(payload.get("source_account_url") or ""),
        source_content_url=str(payload.get("source_content_url") or ""),
        platform=str(payload.get("platform") or ""),
        comment_type=str(payload.get("comment_type") or "text"),
        has_media=bool(payload.get("has_media", False)),
        media_urls=[str(value) for value in (payload.get("media_urls") or []) if str(value)],
        replies=replies,
    )


def content_to_payload(record: ContentRecord) -> dict[str, Any]:
    payload = asdict(record)
    payload["comments"] = [_comment_to_payload(item) for item in (record.comments or [])]
    return payload


def content_from_payload(payload: dict[str, Any]) -> ContentRecord:
    comments = [_comment_from_payload(item) for item in (payload.get("comments") or []) if isinstance(item, dict)]
    return ContentRecord(
        platform=str(payload.get("platform") or ""),
        source_account_url=str(payload.get("source_account_url") or ""),
        source_content_url=str(payload.get("source_content_url") or ""),
        platform_content_id=str(payload.get("platform_content_id") or ""),
        caption=payload.get("caption"),
        publish_time_raw=payload.get("publish_time_raw"),
        publish_time_iso=payload.get("publish_time_iso"),
        duration_raw=payload.get("duration_raw"),
        duration_sec=payload.get("duration_sec"),
        author_nickname=payload.get("author_nickname"),
        author_user_id=payload.get("author_user_id"),
        video_title=payload.get("video_title"),
        comments=comments,
        field_source=dict(payload.get("field_source") or {}),
        speech_transcript=payload.get("speech_transcript"),
        speech_status=payload.get("speech_status"),
        speech_error=payload.get("speech_error"),
        video_description=payload.get("video_description"),
        video_tags=[str(value) for value in (payload.get("video_tags") or []) if str(value)],
        work_decision_status=payload.get("work_decision_status"),
        work_decision_should_run=payload.get("work_decision_should_run"),
        work_decision_reason=payload.get("work_decision_reason"),
        work_decision_workflow_id=payload.get("work_decision_workflow_id"),
    )


class InterceptStopController:
    def __init__(self, base_dir: Path, robot_id: str | None, account_alias: str = "") -> None:
        identifier = robot_id or account_alias or "local_intercept"
        self.path = Path(base_dir) / "state" / "intercept_control" / f"{_safe_key(identifier)}.stop.json"

    def clear(self) -> None:
        try:
            self.path.unlink(missing_ok=True)
        except Exception:
            pass

    def request_stop(self, reason: str = "manual") -> Path:
        self.path.parent.mkdir(parents=True, exist_ok=True)
        _write_json_atomic(
            self.path,
            {
                "requestedAt": _utc_now(),
                "reason": str(reason or "manual"),
                "pid": os.getpid(),
            },
        )
        return self.path

    def is_requested(self) -> bool:
        return self.path.exists()

    def ensure_not_requested(self, stage: str = "") -> None:
        if self.is_requested():
            suffix = f" stage={stage}" if stage else ""
            raise InterceptStopRequested(f"截流任务收到安全停止请求，已在安全检查点退出。{suffix}")


def request_intercept_stop(base_dir: Path, robot_id: str, reason: str = "manual") -> Path:
    return InterceptStopController(base_dir, robot_id).request_stop(reason=reason)


def _write_json_atomic(path: Path, payload: dict[str, Any]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    tmp = path.with_suffix(path.suffix + ".tmp")
    tmp.write_text(json.dumps(payload, ensure_ascii=False, indent=2), encoding="utf-8")
    os.replace(tmp, path)


def _load_json(path: Path) -> dict[str, Any] | None:
    try:
        value = json.loads(path.read_text(encoding="utf-8"))
    except Exception:
        return None
    return value if isinstance(value, dict) else None


def _is_pid_alive(pid: object) -> bool:
    """Best-effort liveness check used only to prevent duplicate recovery runs."""
    try:
        value = int(pid)
    except (TypeError, ValueError):
        return False
    if value <= 0 or value == os.getpid():
        return value == os.getpid()
    try:
        # os.kill(pid, 0) works on Windows and POSIX. PermissionError still means
        # a process with this PID exists, so treat it as alive conservatively.
        os.kill(value, 0)
    except ProcessLookupError:
        return False
    except PermissionError:
        return True
    except OSError:
        return False
    return True


class InterceptRunManifest:
    """Durable run-level state for intercept-only resume/recovery.

    The manifest is intentionally separate from private-message state. It records
    target and content completion after every work so a hard close can resume from
    pending works without re-running completed capture/decision/comment steps.
    """

    def __init__(self, base_dir: Path, config: Any, run_id: str, payload: dict[str, Any]) -> None:
        self.base_dir = Path(base_dir)
        self.config = config
        self.run_id = str(run_id)
        self.payload = payload
        self.robot_key = _safe_key(getattr(config, "robot_id", None) or getattr(config, "account_alias", None) or getattr(config, "name", None))
        self.run_dir = self.base_dir / "state" / "intercept_runs" / self.robot_key / self.run_id
        self.path = self.run_dir / "run_manifest.json"

    @classmethod
    def create(cls, base_dir: Path, config: Any, run_id: str, targets: Iterable[dict[str, Any]]) -> "InterceptRunManifest":
        entries: list[dict[str, Any]] = []
        for index, target in enumerate(targets, start=1):
            target_type = str(target.get("type") or "homepage")
            url = str(target.get("url") or "")
            entries.append(
                {
                    "targetKey": _target_key(target_type, url, index),
                    "type": target_type,
                    "index": index,
                    "url": url,
                    "label": str(target.get("label") or ""),
                    "status": "PENDING",
                    "startedAt": "",
                    "completedAt": "",
                    "lastError": "",
                    "posts": [],
                }
            )
        config_snapshot = {
            "robotId": getattr(config, "robot_id", None),
            "name": getattr(config, "name", ""),
            "platform": getattr(config, "platform", ""),
            "accountAlias": getattr(config, "account_alias", ""),
            "targetMode": getattr(config, "target_mode", ""),
            "workDecisionWorkflowId": getattr(config, "work_decision_workflow_id", ""),
        }
        snapshot_text = json.dumps(config_snapshot, ensure_ascii=False, sort_keys=True, separators=(",", ":"))
        payload = {
            "version": MANIFEST_VERSION,
            "runId": run_id,
            "robotId": getattr(config, "robot_id", None) or "",
            "platform": getattr(config, "platform", ""),
            "accountAlias": getattr(config, "account_alias", ""),
            "targetMode": getattr(config, "target_mode", ""),
            "configSnapshot": config_snapshot,
            "configFingerprint": hashlib.sha256(snapshot_text.encode("utf-8")).hexdigest(),
            "status": "RUNNING",
            "createdAt": _utc_now(),
            "updatedAt": _utc_now(),
            "heartbeatAt": _utc_now(),
            "lastStage": "run_started",
            "lastDetail": "",
            "pid": os.getpid(),
            "targets": entries,
        }
        manifest = cls(base_dir, config, run_id, payload)
        manifest.save()
        return manifest

    @classmethod
    def open(cls, base_dir: Path, config: Any, path: Path) -> "InterceptRunManifest":
        payload = _load_json(path)
        if not payload:
            raise RuntimeError(f"截流恢复清单损坏或无法读取：{path}")
        run_id = str(payload.get("runId") or path.parent.name)
        manifest = cls(base_dir, config, run_id, payload)
        manifest.run_dir = path.parent
        manifest.path = path
        return manifest

    @classmethod
    def find_latest(cls, base_dir: Path, config: Any, run_id: str | None = None) -> "InterceptRunManifest | None":
        robot_key = _safe_key(getattr(config, "robot_id", None) or getattr(config, "account_alias", None) or getattr(config, "name", None))
        root = Path(base_dir) / "state" / "intercept_runs" / robot_key
        if not root.exists():
            return None
        candidates: list[tuple[float, Path, dict[str, Any]]] = []
        for path in root.glob("*/run_manifest.json"):
            payload = _load_json(path)
            if not payload:
                continue
            if run_id and str(payload.get("runId") or "") != str(run_id):
                continue
            status = str(payload.get("status") or "").upper()
            if status not in RECOVERABLE_STATUSES:
                continue
            if str(payload.get("platform") or "") != str(getattr(config, "platform", "") or ""):
                continue
            if str(payload.get("targetMode") or "") != str(getattr(config, "target_mode", "") or ""):
                continue
            updated = str(payload.get("updatedAt") or "")
            try:
                mtime = path.stat().st_mtime
            except Exception:
                mtime = 0.0
            candidates.append((mtime, path, payload))
        if not candidates:
            return None
        candidates.sort(key=lambda item: item[0], reverse=True)
        return cls.open(base_dir, config, candidates[0][1])

    def save(self) -> None:
        self.payload["updatedAt"] = _utc_now()
        self.payload["pid"] = os.getpid()
        _write_json_atomic(self.path, self.payload)

    def heartbeat(self, stage: str, detail: str = "") -> None:
        self.payload["heartbeatAt"] = _utc_now()
        self.payload["lastStage"] = str(stage or "")
        self.payload["lastDetail"] = str(detail or "")[:1000]
        self.save()
        print(
            f"[HEARTBEAT] 截流任务心跳：runId={self.run_id} stage={self.payload['lastStage']} detail={self.payload['lastDetail']}",
            flush=True,
        )

    def set_status(self, status: str, detail: str = "") -> None:
        self.payload["status"] = str(status or "").upper()
        self.payload["lastDetail"] = str(detail or "")[:1000]
        self.save()

    def _target(self, target_key: str) -> dict[str, Any]:
        for target in self.payload.get("targets") or []:
            if str(target.get("targetKey") or "") == str(target_key):
                return target
        raise KeyError(f"unknown intercept target key: {target_key}")

    def target_key_for(self, target_type: str, url: str, index: int) -> str:
        return _target_key(target_type, url, index)

    def target_status(self, target_key: str) -> str:
        return str(self._target(target_key).get("status") or "PENDING").upper()

    def is_target_complete(self, target_key: str) -> bool:
        return self.target_status(target_key) in TERMINAL_TARGET_STATUSES

    def mark_target_started(self, target_key: str) -> None:
        target = self._target(target_key)
        target["status"] = "RUNNING"
        target["startedAt"] = _utc_now()
        target["lastError"] = ""
        self.heartbeat("target_started", target.get("url") or "")

    def mark_target_completed(self, target_key: str, status: str = "COMPLETED", error: str = "") -> None:
        target = self._target(target_key)
        target["status"] = str(status or "COMPLETED").upper()
        target["completedAt"] = _utc_now()
        target["lastError"] = str(error or "")[:1500]
        self.heartbeat("target_completed", target.get("url") or "")

    def register_posts(self, target_key: str, items: Iterable[ContentRecord]) -> None:
        target = self._target(target_key)
        existing = {str(post.get("key") or ""): post for post in (target.get("posts") or []) if isinstance(post, dict)}
        posts: list[dict[str, Any]] = []
        for index, item in enumerate(items, start=1):
            key = content_key(item)
            prior = existing.get(key) or {}
            posts.append(
                {
                    "key": key,
                    "index": index,
                    "status": str(prior.get("status") or "PENDING").upper(),
                    "startedAt": str(prior.get("startedAt") or ""),
                    "completedAt": str(prior.get("completedAt") or ""),
                    "lastError": str(prior.get("lastError") or ""),
                    "seed": content_to_payload(item),
                    "result": prior.get("result") if isinstance(prior.get("result"), dict) else None,
                }
            )
        target["posts"] = posts
        self.heartbeat("posts_registered", f"target={target.get('index')} count={len(posts)}")

    def pending_posts(self, target_key: str) -> list[ContentRecord]:
        target = self._target(target_key)
        result: list[ContentRecord] = []
        for post in target.get("posts") or []:
            if not isinstance(post, dict):
                continue
            if str(post.get("status") or "").upper() in TERMINAL_TARGET_STATUSES:
                continue
            seed = post.get("seed")
            if isinstance(seed, dict):
                result.append(content_from_payload(seed))
        return result

    def has_post_plan(self, target_key: str) -> bool:
        target = self._target(target_key)
        return bool(target.get("posts"))

    def mark_post_started(self, target_key: str, item: ContentRecord) -> None:
        target = self._target(target_key)
        key = content_key(item)
        for post in target.get("posts") or []:
            if str(post.get("key") or "") == key:
                post["status"] = "RUNNING"
                post["startedAt"] = _utc_now()
                post["lastError"] = ""
                break
        self.heartbeat("post_started", f"target={target.get('index')} content={getattr(item, 'platform_content_id', '') or key}")

    def mark_post_completed(self, target_key: str, item: ContentRecord, status: str = "COMPLETED", error: str = "") -> None:
        target = self._target(target_key)
        key = content_key(item)
        found = False
        for post in target.get("posts") or []:
            if str(post.get("key") or "") == key:
                post["status"] = str(status or "COMPLETED").upper()
                post["completedAt"] = _utc_now()
                post["lastError"] = str(error or "")[:1500]
                post["result"] = content_to_payload(item)
                found = True
                break
        if not found:
            target.setdefault("posts", []).append(
                {
                    "key": key,
                    "index": len(target.get("posts") or []) + 1,
                    "status": str(status or "COMPLETED").upper(),
                    "startedAt": "",
                    "completedAt": _utc_now(),
                    "lastError": str(error or "")[:1500],
                    "seed": content_to_payload(item),
                    "result": content_to_payload(item),
                }
            )
        self.heartbeat("post_completed", f"target={target.get('index')} content={getattr(item, 'platform_content_id', '') or key} status={status}")

    def mark_post_failed(self, target_key: str, item: ContentRecord, error: str) -> None:
        target = self._target(target_key)
        key = content_key(item)
        for post in target.get("posts") or []:
            if str(post.get("key") or "") == key:
                post["status"] = "PENDING"
                post["lastError"] = str(error or "")[:1500]
                break
        self.heartbeat("post_failed", f"target={target.get('index')} content={getattr(item, 'platform_content_id', '') or key}")

    def completed_items(self) -> list[ContentRecord]:
        records: list[ContentRecord] = []
        for target in sorted(self.payload.get("targets") or [], key=lambda value: int(value.get("index") or 0)):
            for post in sorted(target.get("posts") or [], key=lambda value: int(value.get("index") or 0)):
                if str(post.get("status") or "").upper() not in TERMINAL_TARGET_STATUSES:
                    continue
                result = post.get("result")
                if isinstance(result, dict):
                    records.append(content_from_payload(result))
        return records

    def protected_output_run_ids(self) -> set[str]:
        return {self.run_id} if str(self.payload.get("status") or "").upper() in RECOVERABLE_STATUSES else set()

    def unfinished_targets(self) -> int:
        return sum(1 for item in self.payload.get("targets") or [] if str(item.get("status") or "").upper() not in TERMINAL_TARGET_STATUSES)

    def has_live_process(self) -> bool:
        """Whether a RUNNING manifest still belongs to a live local process."""
        return str(self.payload.get("status") or "").upper() == "RUNNING" and _is_pid_alive(self.payload.get("pid"))

    def describe(self) -> dict[str, Any]:
        return {
            "runId": self.run_id,
            "status": self.payload.get("status"),
            "runDir": str(self.run_dir),
            "unfinishedTargets": self.unfinished_targets(),
            "lastStage": self.payload.get("lastStage"),
            "heartbeatAt": self.payload.get("heartbeatAt"),
        }
