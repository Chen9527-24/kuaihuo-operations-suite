from __future__ import annotations

import json
import re
from dataclasses import dataclass, field
from datetime import date, datetime, time as dt_time, timedelta
from zoneinfo import ZoneInfo
from pathlib import Path
from typing import Any, Dict, Iterable, List, Optional

from .pacing import DEFAULT_PACING_PROFILE, normalize_pacing_profile

SUPPORTED_TARGET_MODES = {"homepage", "content"}


@dataclass
class TargetConfig:
    url: str
    label: Optional[str] = None
    enabled: bool = True


@dataclass
class RunWindow:
    start: str = "19:00"
    end: str = "00:00"
    enabled: bool = True
    name: Optional[str] = None


@dataclass
class InterceptRobotConfig:
    robot_id: Optional[str]
    name: str
    platform: str
    account_alias: str
    target_mode: str = "homepage"
    homepage_targets: List[TargetConfig] = field(default_factory=list)
    content_targets: List[TargetConfig] = field(default_factory=list)
    homepage_lookback_days: int = 10
    run_windows: List[RunWindow] = field(default_factory=lambda: [RunWindow(start="19:00", end="00:00")])
    timezone: str = "Asia/Shanghai"
    run_every_days: int = 3
    anchor_date: Optional[str] = None
    max_posts: int = 0
    max_comments_per_post: int = 0
    capture_seconds: int = 8
    trigger_scroll_rounds: int = 0
    trigger_pause_sec: float = 1.2
    browser_name: str = "chromium"
    pacing_profile: str = DEFAULT_PACING_PROFILE
    save_debug_files: bool = False
    headless: bool = False
    max_target_minutes: int = 30
    randomize_targets: bool = True
    comment_fetch_max_seconds: int = 0
    post_cooldown_min_sec: float = 6.0
    post_cooldown_max_sec: float = 20.0
    account_cooldown_min_sec: float = 12.0
    account_cooldown_max_sec: float = 35.0
    comment_page_pause_min_sec: float = 1.0
    comment_page_pause_max_sec: float = 2.2
    max_post_duration_seconds: int = 0
    speech_enabled: bool = True
    speech_fail_strategy: str = 'SKIP'
    speech_empty_transcript_strategy: str = 'SKIP'
    work_decision_enabled: bool = True
    work_decision_workflow_id: str = ''
    work_decision_fail_strategy: str = 'SKIP'
    raw_config: Dict[str, Any] = field(default_factory=dict)

    def __post_init__(self) -> None:
        self.post_cooldown_min_sec = max(float(self.post_cooldown_min_sec or 0), 0.0)
        self.post_cooldown_max_sec = max(float(self.post_cooldown_max_sec or 0), self.post_cooldown_min_sec)
        self.account_cooldown_min_sec = max(float(self.account_cooldown_min_sec or 0), 0.0)
        self.account_cooldown_max_sec = max(float(self.account_cooldown_max_sec or 0), self.account_cooldown_min_sec)
        self.comment_page_pause_min_sec = max(float(self.comment_page_pause_min_sec or 0), 0.0)
        self.comment_page_pause_max_sec = max(float(self.comment_page_pause_max_sec or 0), self.comment_page_pause_min_sec)
        self.max_post_duration_seconds = max(int(self.max_post_duration_seconds or 0), 0)
        self.speech_fail_strategy = 'RUN' if str(self.speech_fail_strategy or '').upper() == 'RUN' else 'SKIP'
        self.speech_empty_transcript_strategy = 'RUN' if str(self.speech_empty_transcript_strategy or '').upper() == 'RUN' else 'SKIP'
        self.work_decision_fail_strategy = 'RUN' if str(self.work_decision_fail_strategy or '').upper() == 'RUN' else 'SKIP'

    @property
    def enabled_homepage_targets(self) -> List[TargetConfig]:
        return [item for item in self.homepage_targets if item.enabled and item.url]

    @property
    def enabled_content_targets(self) -> List[TargetConfig]:
        return [item for item in self.content_targets if item.enabled and item.url]

    def validate_for_run(self) -> None:
        if self.target_mode not in SUPPORTED_TARGET_MODES:
            raise ValueError(f"targetMode 不合法: {self.target_mode}")
        if self.target_mode == "homepage" and not self.enabled_homepage_targets:
            raise ValueError("主页模式至少需要 1 个 enabled 的 homepageTargets.url")
        if self.target_mode == "content" and not self.enabled_content_targets:
            raise ValueError("作品模式至少需要 1 个 enabled 的 contentTargets.url")


def normalize_robot_detail(robot: Dict[str, Any]) -> InterceptRobotConfig:
    config = robot.get("config") if isinstance(robot.get("config"), dict) else {}
    platform = str(robot.get("platform") or config.get("platform") or "douyin").lower()
    account_alias = _first_text(
        config.get("accountAlias"),
        config.get("account_alias"),
        _nested(robot, ["auth", "accountUid"]),
        _nested(robot, ["auth", "accountName"]),
        robot.get("name"),
        "core_robot",
    )
    return normalize_intercept_config(config, robot_id=str(robot.get("id") or "") or None, name=str(robot.get("name") or "未命名机器人"), platform=platform, account_alias=account_alias)


def normalize_intercept_config(
    config: Dict[str, Any],
    robot_id: Optional[str] = None,
    name: str = "本地截流任务",
    platform: str = "douyin",
    account_alias: str = "my_douyin",
) -> InterceptRobotConfig:
    source = config if isinstance(config, dict) else {}
    intercept = source.get("intercept") if isinstance(source.get("intercept"), dict) else source
    runtime_policy = source.get("runtimePolicy") if isinstance(source.get("runtimePolicy"), dict) else {}
    schedule = intercept.get("schedule") if isinstance(intercept.get("schedule"), dict) else {}
    collect = intercept.get("collect") if isinstance(intercept.get("collect"), dict) else {}
    speech = intercept.get("speech") if isinstance(intercept.get("speech"), dict) else {}
    work_decision = intercept.get("workDecision") if isinstance(intercept.get("workDecision"), dict) else {}

    target_mode = str(intercept.get("targetMode") or intercept.get("target_mode") or _infer_target_mode(intercept)).strip().lower()
    if target_mode == "home":
        target_mode = "homepage"
    if target_mode == "post":
        target_mode = "content"

    homepage_targets = _normalize_targets(
        intercept.get("homepageTargets")
        or intercept.get("homepage_targets")
        or intercept.get("homepages")
        or source.get("homepageTargets")
        or source.get("homepages")
    )
    content_targets = _normalize_targets(
        intercept.get("contentTargets")
        or intercept.get("content_targets")
        or intercept.get("works")
        or intercept.get("contentUrls")
        or source.get("contentTargets")
        or source.get("contentUrls")
    )

    legacy_homepage = _first_text(intercept.get("homepageUrl"), intercept.get("homepage_url"), source.get("homepageUrl"))
    if legacy_homepage and all(t.url != legacy_homepage for t in homepage_targets):
        homepage_targets.append(TargetConfig(url=legacy_homepage, label="legacy_homepage"))
    legacy_content = _first_text(intercept.get("contentUrl"), intercept.get("content_url"), source.get("contentUrl"))
    if legacy_content and all(t.url != legacy_content for t in content_targets):
        content_targets.append(TargetConfig(url=legacy_content, label="legacy_content"))

    run_windows = _normalize_windows(
        schedule.get("runWindows")
        or schedule.get("run_windows")
        or intercept.get("runWindows")
        or intercept.get("run_windows")
        or _nested(runtime_policy, ["commentPolicy", "workWindows"])
        or _nested(runtime_policy, ["workSchedule", "workWindows"])
    )
    timezone = str(schedule.get("timezone") or runtime_policy.get("timezone") or _nested(runtime_policy, ["workSchedule", "timezone"]) or "Asia/Shanghai")

    return InterceptRobotConfig(
        robot_id=robot_id,
        name=name,
        platform=str(intercept.get("platform") or source.get("platform") or platform or "douyin").lower(),
        account_alias=str(intercept.get("accountAlias") or intercept.get("account_alias") or source.get("accountAlias") or account_alias or "my_douyin"),
        target_mode=target_mode if target_mode in SUPPORTED_TARGET_MODES else "homepage",
        homepage_targets=homepage_targets,
        content_targets=content_targets,
        homepage_lookback_days=_int(intercept.get("homepageLookbackDays") or intercept.get("homepage_lookback_days") or collect.get("homepageLookbackDays"), 10, 1),
        run_windows=run_windows or [RunWindow(start="19:00", end="00:00")],
        timezone=timezone,
        run_every_days=_int(schedule.get("runEveryDays") or intercept.get("runEveryDays") or intercept.get("run_every_days"), 3, 1),
        anchor_date=_first_text(schedule.get("anchorDate"), intercept.get("anchorDate"), intercept.get("anchor_date")),
        max_posts=_int(collect.get("maxPosts") or intercept.get("maxPosts") or source.get("maxPosts"), 0, 0),
        max_comments_per_post=_int(collect.get("maxCommentsPerPost") or intercept.get("maxCommentsPerPost") or source.get("maxCommentsPerPost"), 0, 0),
        capture_seconds=_int(collect.get("captureSeconds") or intercept.get("captureSeconds") or source.get("captureSeconds"), 8, 3),
        trigger_scroll_rounds=_int(collect.get("triggerScrollRounds") or intercept.get("triggerScrollRounds") or source.get("triggerScrollRounds"), 0, 0),
        trigger_pause_sec=_float(collect.get("triggerPauseSec") or intercept.get("triggerPauseSec") or source.get("triggerPauseSec"), 1.2, 0.5),
        browser_name=str(collect.get("browserName") or intercept.get("browserName") or source.get("browserName") or "chromium"),
        pacing_profile=normalize_pacing_profile(str(collect.get("pacingProfile") or intercept.get("pacingProfile") or source.get("pacingProfile") or DEFAULT_PACING_PROFILE)),
        save_debug_files=_bool_default_false(_first_value(collect.get("saveDebugFiles"), intercept.get("saveDebugFiles"), source.get("saveDebugFiles"))),
        headless=_bool_default_false(_first_value(collect.get("headless"), intercept.get("headless"), source.get("headless"))),
        max_target_minutes=_int(collect.get("maxTargetMinutes") or intercept.get("maxTargetMinutes") or source.get("maxTargetMinutes"), 30, 1),
        randomize_targets=_bool_default_true(collect.get("randomizeTargets", intercept.get("randomizeTargets", source.get("randomizeTargets", True)))),
        comment_fetch_max_seconds=_int(_first_value(collect.get("commentFetchMaxSeconds"), intercept.get("commentFetchMaxSeconds"), source.get("commentFetchMaxSeconds")), 0, 0),
        post_cooldown_min_sec=_float(_first_value(collect.get("postCooldownMinSec"), intercept.get("postCooldownMinSec"), source.get("postCooldownMinSec")), 6.0, 0.0),
        post_cooldown_max_sec=_float(_first_value(collect.get("postCooldownMaxSec"), intercept.get("postCooldownMaxSec"), source.get("postCooldownMaxSec")), 20.0, 0.0),
        account_cooldown_min_sec=_float(_first_value(collect.get("accountCooldownMinSec"), intercept.get("accountCooldownMinSec"), source.get("accountCooldownMinSec")), 12.0, 0.0),
        account_cooldown_max_sec=_float(_first_value(collect.get("accountCooldownMaxSec"), intercept.get("accountCooldownMaxSec"), source.get("accountCooldownMaxSec")), 35.0, 0.0),
        comment_page_pause_min_sec=_float(_first_value(collect.get("commentPagePauseMinSec"), collect.get("commentPageIntervalMinSec"), intercept.get("commentPagePauseMinSec"), source.get("commentPagePauseMinSec")), 1.0, 0.0),
        comment_page_pause_max_sec=_float(_first_value(collect.get("commentPagePauseMaxSec"), collect.get("commentPageIntervalMaxSec"), intercept.get("commentPagePauseMaxSec"), source.get("commentPagePauseMaxSec")), 2.2, 0.0),
        max_post_duration_seconds=_int(_first_value(collect.get("maxPostDurationSeconds"), collect.get("maxPostDurationSec"), intercept.get("maxPostDurationSeconds"), source.get("maxPostDurationSeconds")), 0, 0),
        speech_enabled=_bool_default_true(speech.get("enabled")),
        speech_fail_strategy='RUN' if str(speech.get("failStrategy") or '').upper() == 'RUN' else 'SKIP',
        speech_empty_transcript_strategy='RUN' if str(speech.get("emptyTranscriptStrategy") or '').upper() == 'RUN' else 'SKIP',
        work_decision_enabled=_bool_default_true(work_decision.get("enabled")),
        work_decision_workflow_id=str(work_decision.get("workflowId") or work_decision.get("workflow_id") or '').strip(),
        work_decision_fail_strategy='RUN' if str(work_decision.get("failStrategy") or '').upper() == 'RUN' else 'SKIP',
        raw_config=source,
    )


def _bool_default_false(value: Any) -> bool:
    if isinstance(value, bool):
        return value
    if value is None:
        return False
    text = str(value).strip().lower()
    return text in {"1", "true", "yes", "on", "enabled", "开启", "是"}


def _bool_default_true(value: Any) -> bool:
    if isinstance(value, bool):
        return value
    if value is None:
        return True
    text = str(value).strip().lower()
    if text in {"0", "false", "no", "off", "disabled", "关闭", "否"}:
        return False
    return True


def load_intercept_config_file(path: Path) -> InterceptRobotConfig:
    data = json.loads(path.read_text(encoding="utf-8"))
    if isinstance(data, dict) and isinstance(data.get("robot"), dict):
        return normalize_robot_detail(data["robot"])
    if not isinstance(data, dict):
        raise ValueError("配置文件根节点必须是 JSON object")
    return normalize_intercept_config(data)


def _now_for_timezone(timezone: str, now: Optional[datetime] = None) -> datetime:
    current = now or datetime.now().astimezone()
    try:
        zone = ZoneInfo(str(timezone or "Asia/Shanghai"))
        return current.astimezone(zone) if current.tzinfo else current.replace(tzinfo=zone)
    except Exception:
        return current.astimezone() if current.tzinfo else current


def is_now_in_run_windows(windows: Iterable[RunWindow], now: Optional[datetime] = None, timezone: str = "Asia/Shanghai") -> bool:
    current = _now_for_timezone(timezone, now).time()
    active = [w for w in windows if w.enabled]
    if not active:
        return True
    return any(_time_in_window(current, _parse_hhmm(w.start), _parse_hhmm(w.end)) for w in active)


def get_schedule_skip_reason(
    config: InterceptRobotConfig,
    state_dir: Path,
    now: Optional[datetime] = None,
    ignore_run_cycle: bool = False,
) -> Optional[str]:
    current = _now_for_timezone(config.timezone, now)
    if not is_now_in_run_windows(config.run_windows, current, timezone=config.timezone):
        return "当前时间不在机器人运行时间段内"

    if ignore_run_cycle:
        return None

    logical_date = _logical_run_date(config.run_windows, current)
    state = _load_schedule_state(state_dir)
    entry = state.get(_schedule_state_key(config), {}) if isinstance(state, dict) else {}
    last_completed = _parse_date(_first_text(entry.get("lastCompletedDate"), entry.get("last_completed_date"))) if isinstance(entry, dict) else None
    anchor = _parse_date(config.anchor_date) or logical_date
    interval_days = max(1, int(config.run_every_days or 1))

    if last_completed:
        next_date = last_completed + timedelta(days=interval_days)
        if logical_date < next_date:
            if logical_date == last_completed:
                return f"当前逻辑日期 {logical_date.isoformat()} 已完成本轮运行；下次运行日期：{next_date.isoformat()}"
            return f"未到运行周期，下次运行日期：{next_date.isoformat()}"
        return None

    first_date = anchor + timedelta(days=max(interval_days - 1, 0))
    if logical_date < first_date:
        return f"未到首次运行日期，下次运行日期：{first_date.isoformat()}"
    return None


def mark_schedule_completed(config: InterceptRobotConfig, state_dir: Path, now: Optional[datetime] = None) -> None:
    current = _now_for_timezone(config.timezone, now)
    state_dir.mkdir(parents=True, exist_ok=True)
    state = _load_schedule_state(state_dir)
    key = _schedule_state_key(config)
    state[key] = {
        "robotId": config.robot_id,
        "name": config.name,
        "runEveryDays": config.run_every_days,
        "anchorDate": config.anchor_date,
        "lastCompletedDate": _logical_run_date(config.run_windows, current).isoformat(),
        "lastCompletedAt": current.isoformat(),
    }
    (state_dir / "intercept_schedule_state.json").write_text(json.dumps(state, ensure_ascii=False, indent=2), encoding="utf-8")


def _load_schedule_state(state_dir: Path) -> Dict[str, Any]:
    path = state_dir / "intercept_schedule_state.json"
    if not path.exists():
        return {}
    try:
        data = json.loads(path.read_text(encoding="utf-8"))
        return data if isinstance(data, dict) else {}
    except Exception:
        return {}


def _schedule_state_key(config: InterceptRobotConfig) -> str:
    return config.robot_id or f"{config.platform}:{config.account_alias}:{config.name}"


def _logical_run_date(windows: Iterable[RunWindow], now: datetime) -> date:
    current = now.time()
    for window in [w for w in windows if w.enabled]:
        start = _parse_hhmm(window.start)
        end = _parse_hhmm(window.end)
        if start > end and current <= end and _time_in_window(current, start, end):
            return (now - timedelta(days=1)).date()
    return now.date()


def _parse_date(value: Optional[str]) -> Optional[date]:
    if not value:
        return None
    try:
        return datetime.fromisoformat(str(value).replace("Z", "+00:00")).date()
    except Exception:
        try:
            return date.fromisoformat(str(value)[:10])
        except Exception:
            return None


def _time_in_window(current: dt_time, start: dt_time, end: dt_time) -> bool:
    if start <= end:
        return start <= current <= end
    return current >= start or current <= end


def _parse_hhmm(value: str) -> dt_time:
    text = str(value or "").strip()
    match = re.search(r"(\d{1,2})\s*[:：]\s*(\d{1,2})", text)
    if match:
        return dt_time(hour=max(0, min(23, int(match.group(1)))), minute=max(0, min(59, int(match.group(2)))))
    try:
        hour = int(text)
        return dt_time(hour=max(0, min(23, hour)), minute=0)
    except Exception:
        return dt_time(hour=0, minute=0)


def _normalize_targets(value: Any) -> List[TargetConfig]:
    if value is None or value == "":
        return []
    raw_items = value if isinstance(value, list) else [value]
    items: List[TargetConfig] = []
    for raw in raw_items:
        if isinstance(raw, str):
            url = raw.strip()
            if url:
                items.append(TargetConfig(url=url))
        elif isinstance(raw, dict):
            url = _first_text(raw.get("url"), raw.get("homepageUrl"), raw.get("contentUrl"), raw.get("link"))
            if url:
                items.append(TargetConfig(url=url, label=_first_text(raw.get("accountName"), raw.get("label"), raw.get("name")), enabled=_bool_default_true(raw.get("enabled"))))
    return items


def _normalize_windows(value: Any) -> List[RunWindow]:
    if value is None or value == "":
        return []
    raw_items = value if isinstance(value, list) else [value]
    items: List[RunWindow] = []
    for raw in raw_items:
        if isinstance(raw, str):
            parts = raw.replace("-", "~").split("~", 1)
            if len(parts) == 2:
                items.append(RunWindow(start=parts[0].strip(), end=parts[1].strip()))
        elif isinstance(raw, dict):
            items.append(
                RunWindow(
                    start=str(raw.get("start") or raw.get("startTime") or raw.get("sleepStart") or "19:00"),
                    end=str(raw.get("end") or raw.get("endTime") or raw.get("wakeEnd") or "00:00"),
                    enabled=_bool_default_true(raw.get("enabled")),
                    name=_first_text(raw.get("name"), raw.get("label")),
                )
            )
    return items


def _infer_target_mode(config: Dict[str, Any]) -> str:
    has_home = bool(config.get("homepageTargets") or config.get("homepages") or config.get("homepageUrl"))
    has_content = bool(config.get("contentTargets") or config.get("contentUrls") or config.get("contentUrl"))
    if has_content:
        return "content"
    if has_home:
        return "homepage"
    return "homepage"


def _nested(data: Any, keys: List[str]) -> Any:
    cur = data
    for key in keys:
        if not isinstance(cur, dict):
            return None
        cur = cur.get(key)
    return cur


def _first_value(*values: Any) -> Any:
    for value in values:
        if value is not None:
            return value
    return None


def _first_text(*values: Any) -> Optional[str]:
    for value in values:
        if value is None:
            continue
        text = str(value).strip()
        if text:
            return text
    return None


def _int(value: Any, fallback: int, minimum: int) -> int:
    try:
        return max(minimum, int(value))
    except Exception:
        return fallback


def _float(value: Any, fallback: float, minimum: float) -> float:
    try:
        return max(minimum, float(value))
    except Exception:
        return fallback
