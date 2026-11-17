from __future__ import annotations

from dataclasses import dataclass
import json
import random
import re
import time
from typing import Any
from urllib.parse import quote

from app.models import Account


def normalize_text(value: Any, limit: int = 4000) -> str:
    return re.sub(r"\s+", " ", str(value or "")).strip()[:limit]


def safe_json(value: Any) -> Any:
    if isinstance(value, str):
        try:
            return json.loads(value)
        except Exception:
            return value
    return value


def deep_get(data: Any, *paths: str) -> Any:
    for path in paths:
        cur = data
        ok = True
        for part in path.split("."):
            if isinstance(cur, dict) and part in cur:
                cur = cur[part]
            else:
                ok = False
                break
        if ok and cur not in (None, ""):
            return cur
    return None


def deep_find_key(data: Any, *keys: str) -> Any:
    wanted = {str(key).lower() for key in keys}
    seen: set[int] = set()

    def walk(value: Any) -> Any:
        value = safe_json(value)
        if id(value) in seen:
            return None
        if isinstance(value, (dict, list)):
            seen.add(id(value))
        if isinstance(value, dict):
            for key, item in value.items():
                if str(key).lower() in wanted and item not in (None, ""):
                    return item
            for item in value.values():
                found = walk(item)
                if found not in (None, ""):
                    return found
        elif isinstance(value, list):
            for item in value:
                found = walk(item)
                if found not in (None, ""):
                    return found
        return None

    return walk(data)


def flatten_dict_keys(data: Any, limit: int = 80) -> list[str]:
    keys: list[str] = []
    seen: set[int] = set()

    def walk(value: Any, prefix: str = "") -> None:
        value = safe_json(value)
        if id(value) in seen:
            return
        if isinstance(value, (dict, list)):
            seen.add(id(value))
        if isinstance(value, dict):
            for key, item in value.items():
                name = f"{prefix}.{key}" if prefix else str(key)
                keys.append(name)
                if len(keys) >= limit:
                    return
                walk(item, name)
        elif isinstance(value, list):
            for idx, item in enumerate(value[:8]):
                walk(item, f"{prefix}[{idx}]")

    walk(data)
    return keys[:limit]


def account_config(account: Account) -> dict[str, Any]:
    cfg = safe_json(getattr(account, "config", {}) or {})
    return cfg if isinstance(cfg, dict) else {}


def parse_cookie_header(value: Any) -> str:
    value = safe_json(value)
    if isinstance(value, str):
        return value.strip()
    if isinstance(value, list):
        parts: list[str] = []
        for item in value:
            if isinstance(item, dict):
                name = normalize_text(item.get("name"), 120)
                val = normalize_text(item.get("value"), 1000)
                if name and val:
                    parts.append(f"{name}={val}")
        return "; ".join(parts)
    if isinstance(value, dict):
        return "; ".join(f"{k}={v}" for k, v in value.items() if k and v)
    return ""


@dataclass
class WeChatVideoRuntime:
    aid: str
    finder_username: str
    device_id: str
    wxuin: str
    cookie: str = ""
    page_url: str = "https://channels.weixin.qq.com/micro/interaction/private_msg"
    raw: dict[str, Any] | None = None
    x_wechat_uin: str = ""
    browser_wxuin: str = ""
    dm_message_cookie: str = ""
    raw_key_buff: Any = None
    plugin_session_id: Any = None
    user_agent: str = (
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
        "(KHTML, like Gecko) Chrome/123.0.0.0 Safari/537.36"
    )

    @classmethod
    def from_account(cls, account: Account) -> "WeChatVideoRuntime":
        cfg = account_config(account)
        raw_auth = cfg.get("__rawAuth") if isinstance(cfg.get("__rawAuth"), dict) else {}
        raw_robot = cfg.get("__rawRobot") if isinstance(cfg.get("__rawRobot"), dict) else {}

        session_candidates: list[Any] = [
            getattr(account, "session_data", ""),
            cfg.get("sessionData"),
            cfg.get("session_data"),
            cfg.get("authSessionData"),
            cfg.get("auth_session_data"),
            cfg.get("localStorage"),
            cfg.get("storage"),
            cfg.get("runtime"),
            cfg.get("authPayload"),
            cfg.get("extra"),
            cfg.get("wechatVideo"),
            cfg.get("wxChannels"),
            cfg.get("wechat"),
            raw_auth.get("sessionData") if isinstance(raw_auth, dict) else None,
            raw_auth.get("session_data") if isinstance(raw_auth, dict) else None,
            raw_auth.get("localStorage") if isinstance(raw_auth, dict) else None,
            raw_auth.get("storage") if isinstance(raw_auth, dict) else None,
            raw_auth.get("extra") if isinstance(raw_auth, dict) else None,
            raw_auth.get("authPayload") if isinstance(raw_auth, dict) else None,
            raw_auth.get("wechatVideo") if isinstance(raw_auth, dict) else None,
            raw_auth,
            raw_robot,
            cfg,
        ]

        parsed_sources: list[Any] = []
        for item in session_candidates:
            parsed = safe_json(item)
            if parsed not in (None, ""):
                parsed_sources.append(parsed)

        def pick(*keys: str) -> str:
            for source in parsed_sources:
                value = deep_get(source, *keys)
                if value not in (None, ""):
                    return normalize_text(value, 2000)
                value = deep_find_key(source, *keys)
                if value not in (None, ""):
                    return normalize_text(value, 2000)
            return ""

        cookie = parse_cookie_header(
            pick("cookie", "cookies", "cookieHeader", "Cookie")
            or deep_find_key(parsed_sources, "cookie", "cookies", "cookieHeader", "Cookie")
        )

        browser_wxuin = pick("browserWxuin", "browser_wxuin", "cookieWxuin", "wxuin", "wxUin", "wechatUin", "uin")
        if not browser_wxuin and cookie:
            m = re.search(r"(?:^|;\s*)(?:wxuin|uin)=([^;]+)", cookie)
            if m:
                browser_wxuin = m.group(1)
        x_wechat_uin = pick("xWechatUin", "x_wechat_uin", "X-WECHAT-UIN", "x-wechat-uin", "lsWxuin", "wx_uin", "uin")
        if not x_wechat_uin:
            x_wechat_uin = browser_wxuin or normalize_text(getattr(account, "auth_uid", ""), 200)
        wxuin = x_wechat_uin

        # These names come from 微信视频号 localStorage / request headers in the old 泡泡 implementation.
        aid = pick("aid", "__ml::aid", "__ml_aid", "mlAid", "_aid")
        finder_username = pick("finderUsername", "finder_username", "_log_finder_id", "finderUserName", "finderId", "finder_id")
        device_id = pick("deviceId", "device_id", "_finger_print_device_id", "fingerPrintDeviceId", "finger-print-device-id", "fingerprintDeviceId")
        page_url = pick("pageUrl", "_pageUrl", "referer") or "https://channels.weixin.qq.com/platform/private_msg"

        rt = cls(
            aid=aid,
            finder_username=finder_username,
            device_id=device_id,
            wxuin=wxuin,
            cookie=cookie,
            page_url=page_url,
            raw={"config": cfg, "sources": parsed_sources},
            x_wechat_uin=x_wechat_uin,
            browser_wxuin=browser_wxuin,
            dm_message_cookie=pick("dmMessageCookie", "dm_message_cookie", "messageCookie", "pollCookie", "cookieCursor"),
            raw_key_buff=deep_find_key(parsed_sources, "rawKeyBuff", "raw_key_buff"),
            plugin_session_id=deep_find_key(parsed_sources, "pluginSessionId", "plugin_session_id"),
        )

        required = ("aid", "device_id", "wxuin")
        missing = [name for name in required if not getattr(rt, name)]
        if missing:
            visible_keys = flatten_dict_keys({"config": cfg, "auth": raw_auth, "robot": raw_robot})
            raise RuntimeError(
                "视频号接口运行参数缺失："
                + ", ".join(missing)
                + "。UCP 已尝试从机器人 config、auth.sessionData、auth.extra、localStorage、cookie 中读取。"
                + "请在后端授权信息中保存 aid / deviceId / wxuin / cookie。"
                + f" 当前可见字段：{', '.join(visible_keys[:40]) or '无'}"
            )
        if not rt.finder_username:
            # finder_username 只用于日志和部分请求 body；旧代码要求它存在，但实际接口的强依赖
            # 通常是 aid/device_id/wxuin/cookie。这里允许为空，避免因为昵称字段缺失直接阻断。
            rt.finder_username = normalize_text(getattr(account, "auth_uid", "") or getattr(account, "auth_name", ""), 200)
        return rt

    def build_url(self, path: str, page_url: str | None = None) -> str:
        page = page_url or self.page_url or "https://channels.weixin.qq.com/platform/private_msg"
        # Match the original 泡泡自动化 createRid / encodeURIComponent behavior.
        rid = f"{int(time.time()):x}-{random.getrandbits(32):08x}"
        return (
            f"https://channels.weixin.qq.com/micro/interaction/cgi-bin/mmfinderassistant-bin/{path}"
            f"?_aid={quote(self.aid, safe='')}&_rid={quote(rid, safe='')}&_pageUrl={quote(page, safe='')}"
        )

    def headers(self, *, is_write: bool = False, page_url: str | None = None) -> dict[str, str]:
        referer = page_url or self.page_url or "https://channels.weixin.qq.com/micro/interaction/private_msg"
        out = {
            "content-type": "application/json",
            "accept": "*/*",
            "origin": "https://channels.weixin.qq.com",
            "referer": referer,
            "user-agent": self.user_agent,
            "X-WECHAT-UIN": self.x_wechat_uin or self.wxuin,
            "finger-print-device-id": self.device_id,
        }
        if is_write:
            out["X-Bot-Send"] = "1"
        if self.cookie:
            out["Cookie"] = self.cookie
        return out

    def base_body(self) -> dict[str, Any]:
        import time
        return {
            "timestamp": str(int(time.time() * 1000)),
            "_log_finder_uin": "",
            "_log_finder_id": self.finder_username,
            "rawKeyBuff": self.raw_key_buff,
            "pluginSessionId": self.plugin_session_id,
            "scene": 7,
            "reqScene": 7,
        }
