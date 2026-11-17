from __future__ import annotations

import copy
import random
import time
from datetime import datetime, timedelta
from typing import Any, Callable
try:
    from zoneinfo import ZoneInfo
except Exception:  # pragma: no cover
    ZoneInfo = None  # type: ignore


DEFAULT_RUNTIME_POLICY: dict[str, Any] = {
    "enabled": True,
    "scheduleMode": "windowed",
    "timezone": "Asia/Shanghai",
    "hardSleep": {
        "enabled": True,
        "sleepStart": "01:00",
        "wakeStart": "08:30",
        "wakeEnd": "09:00",
    },
    # Legacy key kept for backward compatibility with older UCP packages and backend config.
    "workSchedule": {
        "enabled": True,
        "sleepStart": "01:00",
        "wakeStart": "08:30",
        "wakeEnd": "09:00",
        "timezone": "Asia/Shanghai",
    },
    "diagnostics": {
        "guiLogEnabled": True,
        "interfaceTraceEnabled": True,
        "interfaceTraceMaxRows": 50,
    },
    "dmPolicy": {
        "mode": "windowed",
        "denseWindows": [
            {"name": "noon", "start": "12:00", "end": "14:00", "intervalMinSec": 300, "intervalMaxSec": 420},
            {"name": "evening", "start": "19:00", "end": "23:30", "intervalMinSec": 300, "intervalMaxSec": 420},
        ],
        "normalWindows": [
            {"name": "morning", "start": "09:00", "end": "12:00", "intervalMinSec": 300, "intervalMaxSec": 600},
            {"name": "afternoon", "start": "14:00", "end": "19:00", "intervalMinSec": 300, "intervalMaxSec": 600},
            {"name": "late_evening", "start": "23:30", "end": "01:00", "intervalMinSec": 480, "intervalMaxSec": 720},
        ],
        "outsideWindowAction": "sleep",
        "emptyRoundThreshold": 3,
        "pollIntervalMinSec": 900,
        "pollIntervalMaxSec": 1800,
        "shortIdleMinSec": 900,
        "shortIdleMaxSec": 1800,
        "longIdleMinSec": 1200,
        "longIdleMaxSec": 2400,
        "messageAggregateWaitSec": 12,
        "afterReplyCooldownMinSec": 300,
        "afterReplyCooldownMaxSec": 600,
        "errorCooldownMinSec": 600,
        "errorCooldownMaxSec": 1200,
    },
    "commentPolicy": {
        "mode": "windowed",
        "workWindows": [
            {"name": "morning", "start": "09:30", "end": "11:30", "intervalMinSec": 1800, "intervalMaxSec": 3000},
            {"name": "noon", "start": "12:30", "end": "14:00", "intervalMinSec": 1800, "intervalMaxSec": 3000},
            {"name": "evening", "start": "18:30", "end": "21:30", "intervalMinSec": 1800, "intervalMaxSec": 3000},
        ],
        "outsideWindowAction": "sleep",
        "workCooldownMinSec": 1800,
        "workCooldownMaxSec": 3000,
        "afterReplyCooldownMinSec": 1800,
        "afterReplyCooldownMaxSec": 3000,
        "noCandidateCooldownMinSec": 1800,
        "noCandidateCooldownMaxSec": 3000,
        "roundCompletedCooldownMinSec": 1800,
        "roundCompletedCooldownMaxSec": 3000,
        "multiEmptyRoundThreshold": 3,
        "multiEmptyRoundCooldownMinSec": 1800,
        "multiEmptyRoundCooldownMaxSec": 3000,
        "errorCooldownMinSec": 600,
        "errorCooldownMaxSec": 1200,
    },
}


def _deep_merge(base: dict[str, Any], override: dict[str, Any] | None) -> dict[str, Any]:
    merged = copy.deepcopy(base)
    if not isinstance(override, dict):
        return merged
    for key, value in override.items():
        if isinstance(value, dict) and isinstance(merged.get(key), dict):
            merged[key] = _deep_merge(merged[key], value)
        else:
            merged[key] = value
    return merged


def _int_range(value: Any, default: int, minimum: int = 0, maximum: int = 24 * 60 * 60) -> int:
    try:
        number = int(value)
    except Exception:
        number = default
    return max(minimum, min(maximum, number))


def _clean_hhmm(value: Any, default: str) -> str:
    text = str(value or "").strip()
    try:
        hh, mm = text.split(":", 1)
        hour = max(0, min(23, int(hh)))
        minute = max(0, min(59, int(mm)))
        return f"{hour:02d}:{minute:02d}"
    except Exception:
        return default


def _normalize_window(raw: Any, default: dict[str, Any]) -> dict[str, Any]:
    source = raw if isinstance(raw, dict) else {}
    window = dict(default)
    window.update(source)
    window["name"] = str(window.get("name") or default.get("name") or "window")
    window["start"] = _clean_hhmm(window.get("start"), str(default.get("start") or "09:00"))
    window["end"] = _clean_hhmm(window.get("end"), str(default.get("end") or "18:00"))
    low = _int_range(window.get("intervalMinSec"), int(default.get("intervalMinSec") or 600), 60)
    high = _int_range(window.get("intervalMaxSec"), int(default.get("intervalMaxSec") or low), 60)
    if high < low:
        high = low
    window["intervalMinSec"] = low
    window["intervalMaxSec"] = high
    return window


def _normalize_windows(raw: Any, defaults: list[dict[str, Any]]) -> list[dict[str, Any]]:
    values = raw if isinstance(raw, list) else []
    result: list[dict[str, Any]] = []
    for idx, default in enumerate(defaults):
        result.append(_normalize_window(values[idx] if idx < len(values) else {}, default))
    for item in values[len(defaults):]:
        if isinstance(item, dict):
            result.append(_normalize_window(item, defaults[-1] if defaults else {"start": "09:00", "end": "18:00", "intervalMinSec": 600, "intervalMaxSec": 1200}))
    return result


def normalize_runtime_policy(raw: dict[str, Any] | None) -> dict[str, Any]:
    policy = _deep_merge(DEFAULT_RUNTIME_POLICY, raw if isinstance(raw, dict) else {})
    policy["enabled"] = bool(policy.get("enabled", True))
    policy["scheduleMode"] = str(policy.get("scheduleMode") or "windowed")
    policy["timezone"] = str(policy.get("timezone") or "Asia/Shanghai")

    hard = policy.get("hardSleep") if isinstance(policy.get("hardSleep"), dict) else {}
    legacy_schedule = policy.get("workSchedule") if isinstance(policy.get("workSchedule"), dict) else {}
    hard["enabled"] = bool(hard.get("enabled", legacy_schedule.get("enabled", True)))
    hard["sleepStart"] = _clean_hhmm(hard.get("sleepStart") or legacy_schedule.get("sleepStart"), "01:00")
    hard["wakeStart"] = _clean_hhmm(hard.get("wakeStart") or legacy_schedule.get("wakeStart"), "08:30")
    hard["wakeEnd"] = _clean_hhmm(hard.get("wakeEnd") or legacy_schedule.get("wakeEnd"), "09:00")
    policy["hardSleep"] = hard
    policy["workSchedule"] = {
        "enabled": hard["enabled"],
        "sleepStart": hard["sleepStart"],
        "wakeStart": hard["wakeStart"],
        "wakeEnd": hard["wakeEnd"],
        "timezone": policy["timezone"],
    }

    diagnostics = policy.get("diagnostics") if isinstance(policy.get("diagnostics"), dict) else {}
    policy["diagnostics"] = {
        "guiLogEnabled": bool(diagnostics.get("guiLogEnabled", True)),
        "interfaceTraceEnabled": bool(diagnostics.get("interfaceTraceEnabled", True)),
        "interfaceTraceMaxRows": _int_range(diagnostics.get("interfaceTraceMaxRows"), 50, 1, 50),
    }

    dm = policy.get("dmPolicy") if isinstance(policy.get("dmPolicy"), dict) else {}
    dm_defaults = DEFAULT_RUNTIME_POLICY["dmPolicy"]
    dm["mode"] = str(dm.get("mode") or "windowed")
    dm["denseWindows"] = _normalize_windows(dm.get("denseWindows"), dm_defaults["denseWindows"])
    dm["normalWindows"] = _normalize_windows(dm.get("normalWindows"), dm_defaults["normalWindows"])
    for key, default in dm_defaults.items():
        if key in {"mode", "denseWindows", "normalWindows", "outsideWindowAction"}:
            continue
        dm[key] = _int_range(dm.get(key), int(default), 1 if key == "emptyRoundThreshold" else 0)
    for a, b in [("pollIntervalMinSec", "pollIntervalMaxSec"), ("shortIdleMinSec", "shortIdleMaxSec"), ("longIdleMinSec", "longIdleMaxSec"), ("afterReplyCooldownMinSec", "afterReplyCooldownMaxSec"), ("errorCooldownMinSec", "errorCooldownMaxSec")]:
        if int(dm[b]) < int(dm[a]):
            dm[b] = dm[a]
    dm["outsideWindowAction"] = str(dm.get("outsideWindowAction") or "sleep")
    policy["dmPolicy"] = dm

    comment = policy.get("commentPolicy") if isinstance(policy.get("commentPolicy"), dict) else {}
    comment_defaults = DEFAULT_RUNTIME_POLICY["commentPolicy"]
    comment["mode"] = str(comment.get("mode") or "windowed")
    comment["workWindows"] = _normalize_windows(comment.get("workWindows"), comment_defaults["workWindows"])
    comment["outsideWindowAction"] = str(comment.get("outsideWindowAction") or "sleep")
    for key, default in comment_defaults.items():
        if key in {"mode", "workWindows", "outsideWindowAction"}:
            continue
        comment[key] = _int_range(comment.get(key), int(default), 1 if key == "multiEmptyRoundThreshold" else 0)
    for a, b in [("workCooldownMinSec", "workCooldownMaxSec"), ("afterReplyCooldownMinSec", "afterReplyCooldownMaxSec"), ("noCandidateCooldownMinSec", "noCandidateCooldownMaxSec"), ("roundCompletedCooldownMinSec", "roundCompletedCooldownMaxSec"), ("multiEmptyRoundCooldownMinSec", "multiEmptyRoundCooldownMaxSec"), ("errorCooldownMinSec", "errorCooldownMaxSec")]:
        if int(comment[b]) < int(comment[a]):
            comment[b] = comment[a]
    policy["commentPolicy"] = comment
    return policy


class RuntimePolicyController:
    """机器人运行节奏执行器。

    只在检测入口做“是否允许本轮动作”的判定；不会关闭页面、清理 profile 或改变原有业务链路。
    同名账号只共享登录态，不共享本控制器里的调度状态。
    """

    def __init__(self, account: Any, core_service: Any = None, *, log: Callable[[str, str], None] | None = None, module: str = "dm", refresh_interval_sec: int = 300) -> None:
        self.account = account
        self.core_service = core_service
        self.module = module or "dm"
        self.log = log or (lambda level, message: None)
        self.refresh_interval_sec = max(60, int(refresh_interval_sec or 300))
        self.policy = normalize_runtime_policy(self._policy_from_account(account))
        self._next_refresh_at = 0.0
        self._cooldown_until = 0.0
        self._cooldown_reason = ""
        self._empty_dm_rounds = 0
        self._empty_comment_rounds = 0
        self._last_wait_log_at = 0.0
        self._last_sleep_reason = ""
        self._last_window_name = ""
        self._wake_cache: dict[str, datetime] = {}

    def set_module(self, module: str) -> None:
        self.module = module or self.module or "dm"
        self._empty_dm_rounds = 0
        self._empty_comment_rounds = 0
        self._cooldown_until = 0.0
        self._cooldown_reason = ""
        self._last_sleep_reason = ""
        self._last_window_name = ""
        self.refresh(force=True)

    def refresh(self, *, force: bool = False) -> None:
        now = time.monotonic()
        if not force and now < self._next_refresh_at:
            return
        self._next_refresh_at = now + self.refresh_interval_sec
        if not self.core_service or not getattr(self.account, "id", ""):
            self.policy = normalize_runtime_policy(self._policy_from_account(self.account))
            return
        try:
            updated = self.core_service.get_robot(self.account.id)
            if updated and getattr(updated, "id", ""):
                runtime_status = getattr(self.account, "runtime_status", "")
                self.account = updated
                if runtime_status:
                    self.account.runtime_status = runtime_status
                self.policy = normalize_runtime_policy(self._policy_from_account(updated))
                self.log("INFO", "机器人运行节奏配置刷新成功")
        except Exception as exc:
            self.log("WARN", f"机器人运行节奏配置刷新失败，继续使用本地缓存: {type(exc).__name__}: {str(exc)[:120]}")

    def _policy_from_account(self, account: Any) -> dict[str, Any]:
        config = getattr(account, "config", {}) if account is not None else {}
        if isinstance(config, dict) and isinstance(config.get("runtimePolicy"), dict):
            return config.get("runtimePolicy") or {}
        return {}

    def dm_policy(self) -> dict[str, Any]:
        return self.policy.get("dmPolicy", {}) if isinstance(self.policy.get("dmPolicy"), dict) else DEFAULT_RUNTIME_POLICY["dmPolicy"]

    def comment_policy(self) -> dict[str, Any]:
        return self.policy.get("commentPolicy", {}) if isinstance(self.policy.get("commentPolicy"), dict) else DEFAULT_RUNTIME_POLICY["commentPolicy"]

    def _rand(self, min_key: str, max_key: str, source: dict[str, Any]) -> float:
        low = _int_range(source.get(min_key), 0)
        high = _int_range(source.get(max_key), low)
        if high < low:
            high = low
        return float(random.randint(low, high))

    def _current_window_interval(self, module: str | None = None) -> tuple[float, float, str]:
        module = module or self.module
        if module == "comment":
            cfg = self.comment_policy()
            windows = cfg.get("workWindows") if isinstance(cfg.get("workWindows"), list) else []
        else:
            cfg = self.dm_policy()
            windows = []
            if isinstance(cfg.get("denseWindows"), list):
                windows.extend(cfg.get("denseWindows") or [])
            if isinstance(cfg.get("normalWindows"), list):
                windows.extend(cfg.get("normalWindows") or [])
        now = self._now()
        for window in windows:
            if not isinstance(window, dict):
                continue
            start, end = self._window_span_for_now(window, now)
            if start <= now < end:
                return float(window.get("intervalMinSec") or 600), float(window.get("intervalMaxSec") or 1200), str(window.get("name") or "window")
        if module == "comment":
            cfg = self.comment_policy()
            return float(cfg.get("roundCompletedCooldownMinSec", 1800)), float(cfg.get("roundCompletedCooldownMaxSec", 3000)), "outside_window"
        cfg = self.dm_policy()
        return float(cfg.get("shortIdleMinSec", 900)), float(cfg.get("shortIdleMaxSec", 1800)), "outside_window"

    def enter_cooldown(self, reason: str, min_sec: float, max_sec: float | None = None) -> None:
        high = float(max_sec if max_sec is not None else min_sec)
        low = float(min_sec)
        if high < low:
            high = low
        duration = random.uniform(max(0.0, low), max(0.0, high))
        if duration <= 0:
            return
        until = time.monotonic() + duration
        if until < self._cooldown_until:
            return
        self._cooldown_until = until
        self._cooldown_reason = reason
        self._last_wait_log_at = 0.0
        self.log("INFO", f"进入运行节奏冷却: reason={reason} durationSec={round(duration, 1)}")

    def record_dm_scan(self, *, had_activity: bool) -> None:
        dm = self.dm_policy()
        if str(dm.get("mode") or self.policy.get("scheduleMode") or "windowed") == "windowed":
            low, high, window_name = self._current_window_interval("dm")
            self._empty_dm_rounds = 0 if had_activity else self._empty_dm_rounds + 1
            self.enter_cooldown(f"dm_window_interval:{window_name}", low, high)
            return
        if had_activity:
            self._empty_dm_rounds = 0
            self.enter_cooldown("dm_poll_interval", dm.get("pollIntervalMinSec", 900), dm.get("pollIntervalMaxSec", 1800))
            return
        self._empty_dm_rounds += 1
        if self._empty_dm_rounds >= int(dm.get("emptyRoundThreshold", 3) or 3):
            self._empty_dm_rounds = 0
            self.enter_cooldown("dm_long_idle", dm.get("longIdleMinSec", 1200), dm.get("longIdleMaxSec", 2400))
        else:
            self.enter_cooldown("dm_short_idle", dm.get("shortIdleMinSec", 900), dm.get("shortIdleMaxSec", 1800))

    def record_dm_reply_sent(self) -> None:
        dm = self.dm_policy()
        self._empty_dm_rounds = 0
        self.enter_cooldown("dm_after_reply", dm.get("afterReplyCooldownMinSec", 300), dm.get("afterReplyCooldownMaxSec", 600))

    def record_error(self, module: str | None = None) -> None:
        module = module or self.module
        if module == "comment":
            cfg = self.comment_policy()
        else:
            cfg = self.dm_policy()
        self.enter_cooldown(f"{module}_error", cfg.get("errorCooldownMinSec", 600), cfg.get("errorCooldownMaxSec", 1200))

    def record_comment_cycle(self, *, processed: int = 0, candidates: int = 0, error: bool = False) -> None:
        cfg = self.comment_policy()
        if error:
            self._empty_comment_rounds = 0
            self.enter_cooldown("comment_error", cfg.get("errorCooldownMinSec", 600), cfg.get("errorCooldownMaxSec", 1200))
            return
        if str(cfg.get("mode") or self.policy.get("scheduleMode") or "windowed") == "windowed":
            low, high, window_name = self._current_window_interval("comment")
            self._empty_comment_rounds = 0 if (processed > 0 or candidates > 0) else self._empty_comment_rounds + 1
            self.enter_cooldown(f"comment_window_interval:{window_name}", low, high)
            return
        if processed > 0:
            self._empty_comment_rounds = 0
            self.enter_cooldown("comment_round_processed", cfg.get("workCooldownMinSec", 1800), cfg.get("workCooldownMaxSec", 3000))
        elif candidates > 0:
            self.enter_cooldown("comment_no_processed", cfg.get("noCandidateCooldownMinSec", 1800), cfg.get("noCandidateCooldownMaxSec", 3000))
        else:
            self._empty_comment_rounds += 1
            if self._empty_comment_rounds >= int(cfg.get("multiEmptyRoundThreshold", 3) or 3):
                self._empty_comment_rounds = 0
                self.enter_cooldown("comment_multi_empty_round", cfg.get("multiEmptyRoundCooldownMinSec", 1800), cfg.get("multiEmptyRoundCooldownMaxSec", 3000))
            else:
                self.enter_cooldown("comment_round_completed", cfg.get("roundCompletedCooldownMinSec", 1800), cfg.get("roundCompletedCooldownMaxSec", 3000))

    def hard_sleep_seconds_until_wake(self) -> float:
        """只返回夜间强休眠剩余秒数，不受业务冷却或 active work 影响。"""
        self.refresh(force=False)
        if not bool(self.policy.get("enabled", True)):
            return 0.0
        return max(0.0, float(self._hard_sleep_seconds() or 0.0))

    def is_hard_sleep_active(self) -> bool:
        return self.hard_sleep_seconds_until_wake() > 0

    def seconds_until_allowed(self) -> float:
        self.refresh(force=False)
        if not bool(self.policy.get("enabled", True)):
            return 0.0
        schedule_seconds, schedule_reason = self._schedule_sleep_seconds_with_reason()
        cooldown_seconds = max(0.0, self._cooldown_until - time.monotonic())
        remaining = max(schedule_seconds, cooldown_seconds)
        if remaining <= 0:
            if self._last_sleep_reason:
                self.log("INFO", f"运行节奏等待结束: reason={self._last_sleep_reason}")
            self._last_sleep_reason = ""
            return 0.0
        reason = schedule_reason if schedule_seconds >= cooldown_seconds and schedule_seconds > 0 else (self._cooldown_reason or "cooldown")
        now = time.monotonic()
        if reason != self._last_sleep_reason or now - self._last_wait_log_at >= 300.0:
            self._last_sleep_reason = reason
            self._last_wait_log_at = now
            self.log("INFO", f"运行节奏等待中: reason={reason} remainingSec={int(remaining + 0.999)}")
        return remaining

    def _schedule_sleep_seconds(self) -> float:
        return self._schedule_sleep_seconds_with_reason()[0]

    def _schedule_sleep_seconds_with_reason(self) -> tuple[float, str]:
        hard_seconds = self._hard_sleep_seconds()
        if hard_seconds > 0:
            return hard_seconds, "hard_sleep"
        if str(self.policy.get("scheduleMode") or "windowed") != "windowed":
            return self._legacy_work_schedule_seconds(), "night_schedule"
        seconds = self._window_sleep_seconds()
        if seconds > 0:
            return seconds, f"waiting_{self.module}_window"
        return 0.0, ""

    def _now(self) -> datetime:
        tz_name = str(self.policy.get("timezone") or self.policy.get("workSchedule", {}).get("timezone") or "Asia/Shanghai")
        tz = None
        if ZoneInfo is not None:
            try:
                tz = ZoneInfo(tz_name)
            except Exception:
                tz = None
        return datetime.now(tz) if tz else datetime.now()

    def _hard_sleep_seconds(self) -> float:
        hard = self.policy.get("hardSleep") if isinstance(self.policy.get("hardSleep"), dict) else {}
        if not bool(hard.get("enabled", True)):
            return 0.0
        now = self._now()
        sleep_start = self._parse_hhmm(str(hard.get("sleepStart") or "01:00"), now)
        wake_start = self._parse_hhmm(str(hard.get("wakeStart") or "08:30"), now)
        wake_end = self._parse_hhmm(str(hard.get("wakeEnd") or "09:00"), now)
        if wake_end <= wake_start:
            wake_end += timedelta(days=1)
        if now < wake_end and sleep_start > wake_end:
            sleep_start -= timedelta(days=1)
        if now >= wake_end:
            sleep_start += timedelta(days=1)
            wake_start += timedelta(days=1)
            wake_end += timedelta(days=1)
        wake_at = self._wake_time_for_window(wake_start, wake_end)
        if sleep_start <= now < wake_at:
            return max(0.0, (wake_at - now).total_seconds())
        return 0.0

    def _legacy_work_schedule_seconds(self) -> float:
        schedule = self.policy.get("workSchedule") if isinstance(self.policy.get("workSchedule"), dict) else {}
        if not bool(schedule.get("enabled", True)):
            return 0.0
        now = self._now()
        sleep_start = self._parse_hhmm(str(schedule.get("sleepStart") or "01:00"), now)
        wake_start = self._parse_hhmm(str(schedule.get("wakeStart") or "08:30"), now)
        wake_end = self._parse_hhmm(str(schedule.get("wakeEnd") or "09:00"), now)
        if wake_end < wake_start:
            wake_end += timedelta(days=1)
        if now < sleep_start:
            sleep_start -= timedelta(days=1)
            wake_start -= timedelta(days=1)
            wake_end -= timedelta(days=1)
        if now >= wake_end and sleep_start < wake_end:
            sleep_start += timedelta(days=1)
            wake_start += timedelta(days=1)
            wake_end += timedelta(days=1)
        wake_at = self._wake_time_for_window(wake_start, wake_end)
        if sleep_start <= now < wake_at:
            return max(0.0, (wake_at - now).total_seconds())
        return 0.0

    def _window_sleep_seconds(self) -> float:
        now = self._now()
        windows: list[dict[str, Any]] = []
        if self.module == "comment":
            cfg = self.comment_policy()
            if str(cfg.get("outsideWindowAction") or "sleep") != "sleep":
                return 0.0
            windows = cfg.get("workWindows") if isinstance(cfg.get("workWindows"), list) else []
        else:
            cfg = self.dm_policy()
            if str(cfg.get("outsideWindowAction") or "sleep") != "sleep":
                return 0.0
            if isinstance(cfg.get("denseWindows"), list):
                windows.extend(cfg.get("denseWindows") or [])
            if isinstance(cfg.get("normalWindows"), list):
                windows.extend(cfg.get("normalWindows") or [])
        if not windows:
            return 0.0
        next_start: datetime | None = None
        for window in windows:
            if not isinstance(window, dict):
                continue
            start, end = self._window_span_for_now(window, now)
            if start <= now < end:
                name = str(window.get("name") or "window")
                if name != self._last_window_name:
                    self._last_window_name = name
                    self.log("INFO", f"进入运行时间窗口: module={self.module} window={name}")
                return 0.0
            candidate = start if start > now else start + timedelta(days=1)
            if next_start is None or candidate < next_start:
                next_start = candidate
        if next_start is None:
            return 0.0
        return max(0.0, (next_start - now).total_seconds())

    def _window_span_for_now(self, window: dict[str, Any], now: datetime) -> tuple[datetime, datetime]:
        start = self._parse_hhmm(str(window.get("start") or "00:00"), now)
        end = self._parse_hhmm(str(window.get("end") or "23:59"), now)
        if end <= start:
            end += timedelta(days=1)
            if now < start and now < end:
                start -= timedelta(days=1)
                end -= timedelta(days=1)
        return start, end

    def _parse_hhmm(self, value: str, base: datetime) -> datetime:
        try:
            hh, mm = value.strip().split(":", 1)
            hour = max(0, min(23, int(hh)))
            minute = max(0, min(59, int(mm)))
        except Exception:
            hour, minute = 0, 0
        return base.replace(hour=hour, minute=minute, second=0, microsecond=0)

    def _wake_time_for_window(self, start: datetime, end: datetime) -> datetime:
        key = f"{start.isoformat()}|{end.isoformat()}"
        cached = self._wake_cache.get(key)
        if cached:
            return cached
        span = max(0, int((end - start).total_seconds()))
        wake_at = start + timedelta(seconds=random.randint(0, span) if span else 0)
        self._wake_cache[key] = wake_at
        if len(self._wake_cache) > 8:
            for old_key in list(self._wake_cache.keys())[:-8]:
                self._wake_cache.pop(old_key, None)
        return wake_at
