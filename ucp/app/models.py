from __future__ import annotations

from dataclasses import dataclass, field
from datetime import datetime
from pathlib import Path
from typing import Any


PLATFORM_NAMES = {
    "DOUYIN": "抖音",
    "KUAISHOU": "快手",
    "XIAOHONGSHU": "小红书",
    "WECHAT_VIDEO": "视频号",
    "VIDEO_ACCOUNT": "视频号",
}

ROBOT_TYPE_NAMES = {
    "PRIVATE_MESSAGE": "私信",
    "COMMENT_REPLY": "评论",
    "INTERCEPT": "拦截",
    "DM": "私信",
    "COMMENT": "评论",
}

BACKEND_STATUS_NAMES = {
    "DRAFT": "草稿",
    "READY": "待命",
    "RUNNING": "运行中",
    "STOPPING": "停止中",
    "STOPPED": "已停止",
    "DISABLED": "已禁用",
    "ERROR": "异常",
    "EXPIRED": "已过期",
}

AUTH_STATUS_NAMES = {
    "UNBOUND": "未绑定",
    "WAIT_QR": "待扫码",
    "SCANNING": "扫码中",
    "AUTHORIZED": "已授权",
    "AUTH_EXPIRED": "授权过期",
    "REVOKED": "已撤销",
    "AUTH_FAILED": "授权失败",
}

DEVICE_STATUS_NAMES = {
    "OFFLINE": "离线",
    "ONLINE": "在线",
    "BUSY": "忙碌",
    "DISABLED": "禁用",
}


@dataclass(slots=True)
class TenantOption:
    tenant_id: str
    tenant_name: str
    tenant_code: str = ""
    is_default: bool = False

    @classmethod
    def from_api(cls, data: dict[str, Any]) -> "TenantOption":
        return cls(
            tenant_id=str(data.get("tenantId") or data.get("id") or ""),
            tenant_name=str(data.get("tenantName") or data.get("name") or "未命名租户"),
            tenant_code=str(data.get("tenantCode") or data.get("code") or ""),
            is_default=bool(data.get("isDefault", False)),
        )


@dataclass(slots=True)
class UserSession:
    access_token: str
    refresh_token: str
    username: str
    display_name: str
    user_id: str
    tenant_id: str = ""
    tenant_name: str = ""
    tenants: list[TenantOption] = field(default_factory=list)

    @classmethod
    def from_api(cls, data: dict[str, Any]) -> "UserSession":
        user = data.get("user") or {}
        tenants = [TenantOption.from_api(item) for item in (user.get("tenants") or [])]
        return cls(
            access_token=str(data.get("accessToken") or ""),
            refresh_token=str(data.get("refreshToken") or ""),
            username=str(user.get("username") or ""),
            display_name=str(user.get("displayName") or user.get("username") or ""),
            user_id=str(user.get("id") or ""),
            tenant_id=str(user.get("tenantId") or ""),
            tenant_name=str(user.get("tenantName") or ""),
            tenants=tenants,
        )


@dataclass(slots=True)
class Account:
    id: str
    platform: str
    name: str
    robot_type: str = "PRIVATE_MESSAGE"
    tenant_id: str = ""
    backend_status: str = "DRAFT"
    runtime_status: str = "未启动"
    auth_id: str = ""
    auth_status: str = ""
    auth_name: str = ""
    auth_uid: str = ""
    auth_avatar_url: str = ""
    device_id: str = ""
    device_name: str = ""
    device_code: str = ""
    device_status: str = ""
    remark: str = ""
    expire_at: str = ""
    config: dict[str, Any] = field(default_factory=dict)
    session_data: str = ""
    last_error: str = ""
    last_heartbeat_at: str = ""

    @classmethod
    def from_api(cls, data: dict[str, Any]) -> "Account":
        auth = data.get("auth") or {}
        device = data.get("device") or {}
        status = str(data.get("status") or "DRAFT")
        runtime_status = "未启动"
        if status == "RUNNING":
            runtime_status = "运行中"
        elif status == "STOPPING":
            runtime_status = "停止中"
        elif status == "STOPPED":
            runtime_status = "已停止"
        elif status == "DISABLED":
            runtime_status = "已禁用"
        elif status == "EXPIRED":
            runtime_status = "已停止"
        elif status == "ERROR":
            runtime_status = "错误"
        raw_config = data.get("config") if isinstance(data.get("config"), dict) else {}
        merged_config = dict(raw_config)
        merged_config.setdefault("__rawRobot", data)
        if isinstance(auth, dict):
            merged_config.setdefault("__rawAuth", auth)
            # Preserve common authorization/session fields that may be returned
            # by the backend but are not part of the Account dataclass itself.
            for key in (
                "aid", "finderUsername", "finder_username", "deviceId", "device_id",
                "wxuin", "wxUin", "cookies", "cookie", "cookieHeader", "sessionData",
                "session_data", "localStorage", "storage", "headers", "extra",
                "authPayload", "runtime", "wechatVideo", "wxChannels", "wechat",
            ):
                if key in auth and auth.get(key) not in (None, "") and key not in merged_config:
                    merged_config[key] = auth.get(key)
        if isinstance(device, dict):
            merged_config.setdefault("__rawDevice", device)

        return cls(
            id=str(data.get("id") or ""),
            platform=normalize_platform(str(data.get("platform") or "DOUYIN")),
            name=str(data.get("name") or "未命名机器人"),
            robot_type=normalize_robot_type(str(data.get("type") or "PRIVATE_MESSAGE")),
            tenant_id=str(data.get("tenantId") or ""),
            backend_status=status,
            runtime_status=runtime_status,
            auth_id=str(data.get("authId") or auth.get("id") or ""),
            auth_status=str(auth.get("status") or ""),
            auth_name=str(auth.get("accountName") or ""),
            auth_uid=str(auth.get("accountUid") or ""),
            auth_avatar_url=str(auth.get("accountAvatarUrl") or ""),
            device_id=str(data.get("deviceId") or device.get("id") or ""),
            device_name=str(device.get("name") or ""),
            device_code=str(device.get("deviceCode") or ""),
            device_status=str(device.get("status") or ""),
            remark=str(data.get("remark") or ""),
            expire_at=str(data.get("expireAt") or ""),
            config=merged_config,
            session_data=str(auth.get("sessionData") or auth.get("session_data") or data.get("sessionData") or data.get("session_data") or ""),
            last_error=str(data.get("lastError") or data.get("last_error") or ""),
            last_heartbeat_at=str(data.get("lastHeartbeatAt") or data.get("last_heartbeat_at") or ""),
        )

    @property
    def status(self) -> str:
        return self.runtime_status

    @status.setter
    def status(self, value: str) -> None:
        self.runtime_status = value

    @property
    def platform_label(self) -> str:
        return PLATFORM_NAMES.get(self.platform, self.platform)

    @property
    def robot_type_label(self) -> str:
        return ROBOT_TYPE_NAMES.get(self.robot_type, self.robot_type)

    @property
    def backend_status_label(self) -> str:
        return BACKEND_STATUS_NAMES.get(self.backend_status, self.backend_status or "未知")

    @property
    def auth_status_label(self) -> str:
        return AUTH_STATUS_NAMES.get(self.auth_status, self.auth_status or "未设置")

    @property
    def device_status_label(self) -> str:
        return DEVICE_STATUS_NAMES.get(self.device_status, self.device_status or "未设置")

    @property
    def is_backend_disabled(self) -> bool:
        return self.backend_status in {"DISABLED", "EXPIRED"} or self.device_status == "DISABLED"

    @property
    def is_runtime_active(self) -> bool:
        return self.runtime_status in {"启动中", "待扫码", "已扫码", "模块加载中", "运行中"} or self.backend_status in {"RUNNING", "STOPPING"}

    @property
    def can_start(self) -> bool:
        if self.is_backend_disabled or self.is_expired():
            return False
        return not self.is_runtime_active

    @property
    def can_stop(self) -> bool:
        if self.is_backend_disabled:
            return False
        return self.is_runtime_active

    @property
    def bound_account_display(self) -> str:
        return self.auth_name or self.auth_uid or "未授权"

    @property
    def robot_name(self) -> str:
        """兼容旧版自动回复引擎需要的账号/机器人名称字段。

        旧版本地账号模型里有 robot_name 字段，整合后后端机器人模型没有这个字段。
        自动回复 prompt 仍会读取 self.account.robot_name，所以这里提供只读兼容属性，
        避免影响原有草稿生成和发送链路。
        """
        return self.auth_name or self.name or self.auth_uid or "账号本人"

    @property
    def expire_at_display(self) -> str:
        if not self.expire_at:
            return "未设置"
        try:
            text = self.expire_at.replace("Z", "+00:00")
            expire_dt = datetime.fromisoformat(text)
            if expire_dt.tzinfo:
                expire_dt = expire_dt.astimezone()
            return expire_dt.strftime("%Y-%m-%d %H:%M:%S")
        except Exception:
            return self.expire_at

    def is_expired(self) -> bool:
        if not self.expire_at:
            return False
        try:
            text = self.expire_at.replace("Z", "+00:00")
            expire_dt = datetime.fromisoformat(text)
            now = datetime.now(expire_dt.tzinfo) if expire_dt.tzinfo else datetime.now()
            return expire_dt <= now
        except Exception:
            return False

    @staticmethod
    def _safe_profile_key(value: str) -> str:
        safe_key = "".join(ch if ch.isalnum() or ch in {"-", "_"} else "_" for ch in str(value or "")).strip("_")
        return safe_key or "default"

    @property
    def short_id(self) -> str:
        return (self.id or "").replace("-", "")[:8] or "unknown"

    @property
    def log_scope(self) -> str:
        """Unique GUI log scope.

        Same-name DM/comment robots may intentionally share login state, but their
        runtime actions, pages, status and logs must remain isolated.  Including the
        robot id prevents per-robot log filtering from collapsing same-name robots.
        """
        return f"{self.platform}:{self.name} | {self.robot_type_label} | {self.id}"

    def shared_login_profile_dir(self, root: Path) -> Path:
        """Canonical login-state profile for same platform + same managed name.

        This directory represents the user's request that same-name DM/comment robots
        should be able to reuse a login state.  It must not be used as a runtime key for
        controller/page/log identity.
        """
        raw_key = self.name or self.auth_uid or self.auth_id or self.auth_name or self.device_id or self.id
        return root / self.platform.lower() / f"name_{self._safe_profile_key(str(raw_key or self.id))}"

    def profile_dir(self, root: Path) -> Path:
        """Return this robot's runtime browser profile directory.

        Runtime identity is always robot-id based.  Login reuse for same-name robots is
        handled by platform controllers through shared profile acquisition/migration,
        not by collapsing multiple robots into the same controller/profile key.
        """
        raw_key = self.id or self.auth_id or self.device_id or self.name or "default"
        return root / self.platform.lower() / f"robot_{self._safe_profile_key(str(raw_key))}"


def normalize_platform(value: str) -> str:
    val = value.strip().upper()
    alias = {
        "DOUYIN": "DOUYIN",
        "KUAISHOU": "KUAISHOU",
        "XIAOHONGSHU": "XIAOHONGSHU",
        "WECHAT_VIDEO": "WECHAT_VIDEO",
        "VIDEO_ACCOUNT": "WECHAT_VIDEO",
        "SHIPINHAO": "WECHAT_VIDEO",
    }
    return alias.get(val, val or "DOUYIN")


def normalize_robot_type(value: str) -> str:
    val = value.strip().upper()
    alias = {
        "DM": "PRIVATE_MESSAGE",
        "PRIVATE_MESSAGE": "PRIVATE_MESSAGE",
        "PRIVATE_MSG": "PRIVATE_MESSAGE",
        "COMMENT": "COMMENT_REPLY",
        "COMMENT_REPLY": "COMMENT_REPLY",
        "INTERCEPT": "INTERCEPT",
    }
    return alias.get(val, val or "PRIVATE_MESSAGE")
