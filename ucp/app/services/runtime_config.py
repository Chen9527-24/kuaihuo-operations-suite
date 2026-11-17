from __future__ import annotations

import json
import os
import sys
from functools import lru_cache
from pathlib import Path
from typing import Any

def _resolve_project_root() -> Path:
    # 开发态使用源码根目录；PyInstaller 打包后使用 exe 所在目录。
    # runtime_config 不能再按 __file__ 找 _internal，否则 exe 旁边的 .env/data 不会生效。
    if getattr(sys, "frozen", False):
        return Path(sys.executable).resolve().parent
    return Path(__file__).resolve().parents[2]


PROJECT_ROOT = _resolve_project_root()
DATA_DIR = PROJECT_ROOT / "data"
DOUYIN_CONFIG_DIR = DATA_DIR / "platforms" / "douyin"

DOUYIN_COMMON_DEFAULTS = {
    "urls": {
        "dm": "https://creator.douyin.com/creator-micro/data/following/chat",
        "comment": "https://creator.douyin.com/creator-micro/interactive/comment",
    },
    "auth": {
        "strong_cookie_keys": [
            "sessionid",
            "sessionid_ss",
            "sid_tt",
            "sid_guard",
            "uid_tt",
            "uid_tt_ss",
            "passport_assist_user",
            "has_biz_token",
        ],
        "login_hints": [
            "扫码登录",
            "扫码",
            "登录",
            "验证码",
            "手机号登录",
            "请登录",
            "登录后继续",
            "用抖音扫码登录",
        ],
    },
    "ui": {
        "common_blockers": ["知道了", "我知道了", "稍后再说", "以后再说", "关闭", "取消"],
        "background_viewport": [1366, 900],
    },
    "navigation": {
        "max_home_retries": 3,
        "max_post_login_redirects": 6,
    },
}

DOUYIN_DM_DEFAULTS = {
    "state_probe": {
        "ready_hints": ["全部私信", "朋友私信", "陌生人私信", "群消息"],
        "ready_root_selectors": [
            ".chat-content.semi-tabs-pane-active[aria-hidden='false']",
            ".chat-content.semi-tabs-pane-active",
            ".container-_r15W6.chat-container-heHrxU",
            ".list-zrsZ82",
            ".box-container-yGo0TJ",
            ".chat-editor-X6QnIU",
        ],
    },
    "runtime": {
        "reply_aggregate_base_wait_ms": 6000,
        "reply_aggregate_max_wait_ms": 8000,
        "startup_min_warmup_ms": 6500,
        "startup_soft_cap_ms": 13000,
        "startup_hard_cap_ms": 16500,
        "startup_fast_probe_interval_ms": 1400,
        "active_scan_interval_ms": 1200,
        "tab_scan_interval_ms": 3000,
        "idle_scan_interval_ms": 40000,
        "idle_scan_min_interval_ms": 40000,
        "idle_scan_max_interval_ms": 90000,
        "idle_log_every_n": 1,
        "idle_heartbeat_interval_ms": 90000,
        "debug_verbose": False,
    },
    "reply": {
        "fallback_text": "😁",
    },
}

DOUYIN_COMMENT_DEFAULTS = {
    "state_probe": {
        "ready_hints": ["评论管理", "选择作品", "最新发布", "有爱评论", "回复"],
        "ready_root_selectors": [
            ".container-AFENbv",
            ".container-sXKyMs",
            ".operations-WFV7Am .item-M3fSkJ",
            ".footer-oZJTJd button",
            ".input-d24X73[contenteditable='true']",
        ],
    },
    "filter": {
        # 默认不强制切换筛选，优先扫描页面当前可见列表；
        # 如需固定筛选，设置 enabled=true 并填写 target_text。
        "enabled": False,
        "target_text": "",
    },
    "candidate": {
        "skip_empty_content": True,
        "skip_author_tag": True,
        "min_content_length": 1,
        "skip_keywords": [],
    },
    "send": {
        "reactivate_max_attempts": 2,
        "stage_timeout_ms": 22000,
    },
    "cooldown": {
        # 评论不是私信，真实发送后不需要马上继续点下一个候选。
        "after_send_ms": 25000,
        # 单个作品已处理完后，稍等再切换下一条作品。
        "after_work_done_ms": 75000,
        # 本轮可见作品都检查完且没有新候选时，进入长休息，降低浏览器/平台压力。
        "full_cycle_idle_min_ms": 600000,
        "full_cycle_idle_max_ms": 1200000,
        # 发送失败仍是可重试任务，只做短冷却，不标记最终跳过。
        "failed_retry_ms": 60000,
        # 发送成功后继续守当前作品一段时间：用户在评论串里继续追问时，
        # 不能马上把作品判定完成并切到作品侧栏/长冷却。
        "post_send_followup_watch_ms": 600000,
        "post_send_followup_poll_ms": 30000,
        "log_interval_ms": 30000,
    },
    "same_work_refresh": {
        # 单作品账号/全部作品已完成后，下一轮扫描前需要刷新当前作品评论数据，
        # 避免 Douyin 页面长期停留在首次加载的 DOM 快照。
        "enabled": True,
        "min_interval_ms": 90000,
    },
}



def _read_dotenv_values() -> dict[str, str]:
    env_path = PROJECT_ROOT / ".env"
    values: dict[str, str] = {}
    if not env_path.exists():
        return values
    try:
        lines = env_path.read_text(encoding="utf-8").splitlines()
    except Exception:
        return values
    for raw_line in lines:
        line = raw_line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        key, value = line.split("=", 1)
        values[key.strip()] = value.strip().strip('"').strip("'")
    return values


def _env_int(name: str, default: int, dotenv_values: dict[str, str] | None = None) -> int:
    raw = os.getenv(name)
    if raw is None and dotenv_values is not None:
        raw = dotenv_values.get(name)
    if raw is None or str(raw).strip() == "":
        return default
    try:
        return int(str(raw).strip())
    except Exception:
        return default


def _env_bool(name: str, default: bool, dotenv_values: dict[str, str] | None = None) -> bool:
    raw = os.getenv(name)
    if raw is None and dotenv_values is not None:
        raw = dotenv_values.get(name)
    if raw is None or str(raw).strip() == "":
        return default
    value = str(raw).strip().lower()
    if value in {"1", "true", "yes", "on", "y"}:
        return True
    if value in {"0", "false", "no", "off", "n"}:
        return False
    return default


def _apply_dm_env_overrides(config: dict[str, Any]) -> dict[str, Any]:
    merged = dict(config)
    runtime = dict(merged.get("runtime") or {})
    dotenv_values = _read_dotenv_values()
    mapping = {
        "DM_ACTIVE_SCAN_INTERVAL_MS": "active_scan_interval_ms",
        "DM_TAB_SCAN_INTERVAL_MS": "tab_scan_interval_ms",
        "DM_IDLE_SCAN_INTERVAL_MS": "idle_scan_interval_ms",
        "DM_IDLE_SCAN_MIN_MS": "idle_scan_min_interval_ms",
        "DM_IDLE_SCAN_MAX_MS": "idle_scan_max_interval_ms",
        "DM_IDLE_LOG_EVERY_N": "idle_log_every_n",
        "DM_IDLE_HEARTBEAT_INTERVAL_MS": "idle_heartbeat_interval_ms",
    }
    for env_name, runtime_key in mapping.items():
        runtime[runtime_key] = _env_int(env_name, int(runtime.get(runtime_key, 0) or 0), dotenv_values)
    runtime["debug_verbose"] = _env_bool("DM_DEBUG_VERBOSE", bool(runtime.get("debug_verbose", False)), dotenv_values)
    min_idle = max(40000, int(runtime.get("idle_scan_min_interval_ms", runtime.get("idle_scan_interval_ms", 40000)) or 40000))
    max_idle = max(min_idle, int(runtime.get("idle_scan_max_interval_ms", max(min_idle, 90000)) or max(min_idle, 90000)))
    runtime["idle_scan_min_interval_ms"] = min_idle
    runtime["idle_scan_max_interval_ms"] = max_idle
    runtime["idle_scan_interval_ms"] = min_idle
    merged["runtime"] = runtime
    return merged

def _read_json(path: Path) -> dict[str, Any]:
    if not path.exists():
        return {}
    try:
        payload = json.loads(path.read_text(encoding="utf-8"))
    except Exception:
        return {}
    return payload if isinstance(payload, dict) else {}


def _deep_merge(base: dict[str, Any], override: dict[str, Any]) -> dict[str, Any]:
    merged = dict(base)
    for key, value in override.items():
        if isinstance(value, dict) and isinstance(base.get(key), dict):
            merged[key] = _deep_merge(base[key], value)
        else:
            merged[key] = value
    return merged


@lru_cache(maxsize=1)
def get_douyin_common_config() -> dict[str, Any]:
    return _deep_merge(DOUYIN_COMMON_DEFAULTS, _read_json(DOUYIN_CONFIG_DIR / "common.json"))


@lru_cache(maxsize=1)
def get_douyin_dm_config() -> dict[str, Any]:
    return _apply_dm_env_overrides(_deep_merge(DOUYIN_DM_DEFAULTS, _read_json(DOUYIN_CONFIG_DIR / "dm.json")))


@lru_cache(maxsize=1)
def get_douyin_comment_config() -> dict[str, Any]:
    return _deep_merge(DOUYIN_COMMENT_DEFAULTS, _read_json(DOUYIN_CONFIG_DIR / "comment.json"))


DOUYIN_URLS = get_douyin_common_config()["urls"]
STRONG_AUTH_COOKIE_KEYS = set(get_douyin_common_config()["auth"]["strong_cookie_keys"])
LOGIN_HINTS = list(get_douyin_common_config()["auth"]["login_hints"])
COMMON_BLOCKERS = list(get_douyin_common_config()["ui"]["common_blockers"])
BACKGROUND_VIEWPORT = tuple(get_douyin_common_config()["ui"]["background_viewport"])
MAX_HOME_RETRIES = int(get_douyin_common_config()["navigation"]["max_home_retries"])
MAX_POST_LOGIN_REDIRECTS = int(get_douyin_common_config()["navigation"]["max_post_login_redirects"])
DM_READY_HINTS = list(get_douyin_dm_config()["state_probe"]["ready_hints"])
COMMENT_READY_HINTS = list(get_douyin_comment_config()["state_probe"]["ready_hints"])
DOUYIN_DM_READY_ROOT_SELECTORS = tuple(get_douyin_dm_config()["state_probe"]["ready_root_selectors"])
DOUYIN_COMMENT_READY_ROOT_SELECTORS = tuple(get_douyin_comment_config()["state_probe"]["ready_root_selectors"])
DM_RUNTIME_CONFIG = dict(get_douyin_dm_config()["runtime"])
COMMENT_RUNTIME_CONFIG = dict(get_douyin_comment_config())
DM_FALLBACK_TEXT = str(get_douyin_dm_config()["reply"].get("fallback_text", "😁") or "😁")
