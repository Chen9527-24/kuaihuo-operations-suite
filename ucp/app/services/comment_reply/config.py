from __future__ import annotations

import json
import os
from pathlib import Path
from typing import Any

from app.services.dm_reply.config import load_dm_reply_config

DOUYIN_COMMENT_CONFIG_RELATIVE_PATH = Path("platforms") / "douyin" / "comment.json"

DEFAULT_COMMENT_REPLY_CONFIG: dict[str, Any] = {
    "enabled": True,
    "auto_send": True,
    "inherit_dm_reply_coze": True,
    "fallback_text": "感谢支持呀",
    "identity": "你现在就是抖音账号本人，在评论区直接回复用户评论。回复要像真人，不要像客服或机器人。",
    "style_prompt": "口吻自然、简短、口语化，像评论区本人顺手回一句。优先一句话，必要时两句，不要端着。",
    "safety_prompt": "只能根据当前评论和可见上下文回复；不要编造价格、库存、功效、承诺或私聊导流信息。",
    "coze": {
        "enabled": False,
        "api_url": "https://api.coze.cn/v1/workflow/run",
        "workflow_id": "",
        "token": "",
        "request_timeout_sec": 30.0,
        "input_key": "input",
        "include_bot_id": False,
        "bot_id": "",
        "app_id": "",
        "extra_parameters": {},
        "ext": {},
    },
}


def _read_json_file(path: Path) -> dict[str, Any]:
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



def _load_comment_platform_config(data_dir: Path) -> tuple[dict[str, Any], str]:
    explicit = os.getenv("DOUYIN_COMMENT_CONFIG_PATH", "").strip()
    candidates: list[Path] = []
    if explicit:
        candidates.append(Path(explicit).expanduser())
    normalized_data_dir = data_dir.resolve()
    cwd = Path.cwd().resolve()
    package_root = Path(__file__).resolve().parents[3]
    for base in [normalized_data_dir, cwd, package_root]:
        candidates.append(base / DOUYIN_COMMENT_CONFIG_RELATIVE_PATH)
        candidates.append(base / "data" / DOUYIN_COMMENT_CONFIG_RELATIVE_PATH)
    seen: set[str] = set()
    for path in candidates:
        key = str(path.resolve(strict=False))
        if key in seen:
            continue
        seen.add(key)
        loaded = _read_json_file(path)
        if loaded or path.exists():
            return loaded, str(path.resolve(strict=False))
    return {}, ""



def build_coze_runtime_config(config: dict[str, Any]) -> dict[str, Any]:
    coze = config.get("coze", {}) if isinstance(config.get("coze"), dict) else {}
    return {
        "api_url": coze.get("api_url", ""),
        "workflow_id": coze.get("workflow_id", ""),
        "token": coze.get("token", ""),
        "request_timeout_sec": coze.get("request_timeout_sec", 30.0),
        "input_key": coze.get("input_key", "input"),
        "include_bot_id": coze.get("include_bot_id", False),
        "bot_id": coze.get("bot_id", ""),
        "app_id": coze.get("app_id", ""),
        "extra_parameters": coze.get("extra_parameters", {}),
        "ext": coze.get("ext", {}),
    }



def load_comment_reply_config(data_dir: Path) -> dict[str, Any]:
    platform_config, source_path = _load_comment_platform_config(data_dir)
    reply_override = platform_config.get("reply", {}) if isinstance(platform_config.get("reply"), dict) else {}
    merged = _deep_merge(DEFAULT_COMMENT_REPLY_CONFIG, reply_override)

    dm_config = load_dm_reply_config(data_dir)
    inherit_dm = bool(merged.get("inherit_dm_reply_coze", True))
    comment_coze = dict(merged.get("coze", {}))
    dm_coze = dm_config.get("coze", {}) if isinstance(dm_config.get("coze"), dict) else {}
    if inherit_dm:
        for key in [
            "api_url",
            "workflow_id",
            "token",
            "request_timeout_sec",
            "input_key",
            "include_bot_id",
            "bot_id",
            "app_id",
            "extra_parameters",
            "ext",
        ]:
            if comment_coze.get(key) in (None, "", {}):
                value = dm_coze.get(key)
                if value not in (None, "", {}):
                    comment_coze[key] = value
    # Legacy cloud generation requires the same explicit local opt-in as DM.
    comment_coze["enabled"] = bool(dm_coze.get("enabled")) and bool(comment_coze.get("token")) and bool(comment_coze.get("workflow_id"))
    merged["coze"] = comment_coze
    meta = dict(merged.get("_meta", {}))
    meta["config_source"] = source_path
    meta["inherited_dm_reply_coze"] = inherit_dm
    meta["dm_reply_config_source"] = ((dm_config.get("_meta", {}) or {}).get("config_source", ""))
    merged["_meta"] = meta
    return merged
