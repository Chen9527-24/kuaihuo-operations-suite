from __future__ import annotations

import base64
import json
import os
from dataclasses import dataclass
from pathlib import Path
from typing import Any


@dataclass(slots=True)
class LoginCache:
    username: str = ""
    password: str = ""
    remember: bool = False


@dataclass(slots=True)
class GuiSessionCache:
    access_token: str = ""
    refresh_token: str = ""
    username: str = ""
    display_name: str = ""
    user_id: str = ""
    tenant_id: str = ""
    tenant_name: str = ""


class AppConfig:
    def __init__(self, project_root: Path) -> None:
        self.project_root = project_root
        self.env_path = project_root / ".env"
        self.config_dir = project_root / "config"
        self.config_dir.mkdir(parents=True, exist_ok=True)
        self.login_cache_path = self.config_dir / "login_cache.json"
        self.gui_session_cache_path = self.config_dir / "gui_session_cache.json"
        self.values = self._load_env()

    def api_base_url(self) -> str:
        return (
            os.getenv("CORE_NEXUS_API_BASE_URL")
            or self.values.get("CORE_NEXUS_API_BASE_URL")
            or self.values.get("API_BASE_URL")
            or "http://localhost:3000"
        ).rstrip("/")

    def load_login_cache(self) -> LoginCache:
        if not self.login_cache_path.exists():
            return LoginCache()
        try:
            data = json.loads(self.login_cache_path.read_text(encoding="utf-8"))
            password_raw = str(data.get("password") or "")
            password = ""
            if password_raw:
                try:
                    password = base64.b64decode(password_raw.encode("utf-8")).decode("utf-8")
                except Exception:
                    password = password_raw
            return LoginCache(
                username=str(data.get("username") or ""),
                password=password,
                remember=bool(data.get("remember", False)),
            )
        except Exception:
            return LoginCache()

    def save_login_cache(self, username: str, password: str, remember: bool) -> None:
        if not remember:
            if self.login_cache_path.exists():
                self.login_cache_path.unlink()
            return
        encoded_password = base64.b64encode(password.encode("utf-8")).decode("utf-8")
        payload = {
            "username": username,
            "password": encoded_password,
            "remember": True,
        }
        self.login_cache_path.write_text(json.dumps(payload, ensure_ascii=False, indent=2), encoding="utf-8")


    def load_gui_session_cache(self) -> GuiSessionCache:
        if not self.gui_session_cache_path.exists():
            return GuiSessionCache()
        try:
            data = json.loads(self.gui_session_cache_path.read_text(encoding="utf-8"))

            def decode_token(key: str) -> str:
                raw = str(data.get(key) or "")
                if not raw:
                    return ""
                try:
                    return base64.b64decode(raw.encode("utf-8")).decode("utf-8")
                except Exception:
                    return raw

            return GuiSessionCache(
                access_token=decode_token("accessToken"),
                refresh_token=decode_token("refreshToken"),
                username=str(data.get("username") or ""),
                display_name=str(data.get("displayName") or ""),
                user_id=str(data.get("userId") or ""),
                tenant_id=str(data.get("tenantId") or ""),
                tenant_name=str(data.get("tenantName") or ""),
            )
        except Exception:
            return GuiSessionCache()

    def save_gui_session_cache(
        self,
        *,
        access_token: str,
        refresh_token: str,
        username: str = "",
        display_name: str = "",
        user_id: str = "",
        tenant_id: str = "",
        tenant_name: str = "",
    ) -> None:
        if not refresh_token:
            return

        def encode(value: str) -> str:
            return base64.b64encode(str(value or "").encode("utf-8")).decode("utf-8") if value else ""

        payload = {
            "accessToken": encode(access_token),
            "refreshToken": encode(refresh_token),
            "username": username or "",
            "displayName": display_name or "",
            "userId": user_id or "",
            "tenantId": tenant_id or "",
            "tenantName": tenant_name or "",
        }
        self.gui_session_cache_path.write_text(json.dumps(payload, ensure_ascii=False, indent=2), encoding="utf-8")

    def clear_gui_session_cache(self) -> None:
        try:
            if self.gui_session_cache_path.exists():
                self.gui_session_cache_path.unlink()
        except Exception:
            pass

    def save_gui_session_selected_tenant(self, tenant_id: str, tenant_name: str = "") -> None:
        """Persist only the last explicitly selected tenant when a valid GUI session cache exists."""
        cache = self.load_gui_session_cache()
        if not cache.refresh_token:
            return
        self.save_gui_session_cache(
            access_token=cache.access_token,
            refresh_token=cache.refresh_token,
            username=cache.username,
            display_name=cache.display_name,
            user_id=cache.user_id,
            tenant_id=tenant_id,
            tenant_name=tenant_name or cache.tenant_name,
        )

    def _load_env(self) -> dict[str, str]:
        values: dict[str, str] = {}
        if not self.env_path.exists():
            self.env_path.write_text(
                "# Core Nexus 服务地址\n"
                "# 本地环境：http://localhost:3000\n"
                "# 测试/正式环境发布时只需要改这里，不需要改登录页面。\n"
                "CORE_NEXUS_API_BASE_URL=http://localhost:3000\n"
                "\n"
                "# 私信机器人巡检频率（毫秒）\n"
                "# ACTIVE：存在未读、待打开、待回复、生成/发送中时使用，保证回复及时性。\n"
                "# TAB：子 Tab 切换/深扫时使用。\n"
                "# IDLE：三个子 Tab 扫描完成且无 pending 后使用；每轮在 40s~90s 之间随机，避免多账号同频唤醒。\n"
                "DM_ACTIVE_SCAN_INTERVAL_MS=1200\n"
                "DM_TAB_SCAN_INTERVAL_MS=3000\n"
                "DM_IDLE_SCAN_MIN_MS=40000\n"
                "DM_IDLE_SCAN_MAX_MS=90000\n"
                "DM_IDLE_LOG_EVERY_N=1\n"
                "DM_IDLE_HEARTBEAT_INTERVAL_MS=90000\n"
                "\n"
                "# 详细调试日志开关：0=常规运行降噪，1=排查问题时输出完整 DOM 摘要。\n"
                "DM_DEBUG_VERBOSE=0\n",
                encoding="utf-8",
            )
        for line in self.env_path.read_text(encoding="utf-8").splitlines():
            line = line.strip()
            if not line or line.startswith("#") or "=" not in line:
                continue
            key, value = line.split("=", 1)
            values[key.strip()] = value.strip().strip('"').strip("'")
        return values
