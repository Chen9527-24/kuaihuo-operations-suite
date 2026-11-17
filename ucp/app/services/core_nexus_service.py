from __future__ import annotations

from datetime import datetime
from typing import Any, Callable

from app.models import Account, UserSession, normalize_platform, normalize_robot_type
from app.services.http_client import HttpClient


class CoreNexusService:
    def __init__(
        self,
        api_base_url: str = "http://localhost:3000",
        request_logger: Callable[[dict[str, Any]], None] | None = None,
    ):
        self.client = HttpClient(api_base_url, request_logger=request_logger)
        self.session: UserSession | None = None

    @property
    def current_tenant_id(self) -> str:
        return self.client.tenant_id

    @property
    def current_base_url(self) -> str:
        return self.client.base_url.rstrip("/")

    def set_base_url(self, base_url: str) -> None:
        self.client.configure(base_url=base_url)

    def login(self, username: str, password: str) -> UserSession:
        payload = self.client.post(
            "/api/v1/auth/login",
            {"username": username.strip(), "password": password},
            auth=False,
        )
        session = UserSession.from_api(payload or {})
        self.session = session
        self.client.configure(access_token=session.access_token, refresh_token=session.refresh_token, tenant_id=session.tenant_id)
        return session

    def refresh_session(self, refresh_token: str) -> UserSession:
        payload = self.client.post("/api/v1/auth/refresh", {"refreshToken": refresh_token}, auth=False)
        session = UserSession.from_api(payload or {})
        self.session = session
        self.client.configure(access_token=session.access_token, refresh_token=session.refresh_token, tenant_id=session.tenant_id)
        return session

    def logout(self, refresh_token: str | None = None) -> None:
        token = refresh_token or self.client.refresh_token
        if token:
            try:
                self.client.post("/api/v1/auth/logout", {"refreshToken": token}, auth=False)
            except Exception:
                pass
        self.session = None
        self.client.configure(access_token="", refresh_token="", tenant_id="")

    def restore_session(self, *, access_token: str, refresh_token: str, tenant_id: str = "") -> None:
        self.client.configure(access_token=access_token, refresh_token=refresh_token, tenant_id=tenant_id)

    def switch_tenant(self, tenant_id: str) -> UserSession:
        payload = self.client.post("/api/v1/auth/switch-tenant", {"tenantId": tenant_id}, auth=True)
        session = UserSession.from_api(payload or {})
        self.session = session
        self.client.configure(access_token=session.access_token, refresh_token=session.refresh_token, tenant_id=tenant_id)
        return session

    def me(self) -> dict[str, Any]:
        return self.client.get("/api/v1/auth/me", auth=True)

    def list_robots(
        self,
        *,
        platform: str,
        robot_type: str,
        keyword: str | None = None,
        page: int = 1,
        page_size: int = 100,
    ) -> list[Account]:
        payload = self.client.get(
            "/api/v1/robots",
            {
                "page": page,
                "pageSize": page_size,
                "limit": page_size,
                "platform": normalize_platform(platform),
                "type": normalize_robot_type(robot_type),
                "keyword": keyword or None,
            },
            auth=True,
        )
        items = []
        if isinstance(payload, dict):
            items = payload.get("items") or []
        elif isinstance(payload, list):
            items = payload
        return [Account.from_api(item) for item in items if isinstance(item, dict)]

    def get_robot(self, robot_id: str) -> Account:
        payload = self.client.get(f"/api/v1/robots/{robot_id}", auth=True)
        return Account.from_api(payload or {})

    def get_robot_auto_reply_setting(self, robot_id: str, module: str) -> dict[str, Any]:
        if not robot_id:
            return {}
        payload = self.client.get(f"/api/v1/auto-replies/robots/{robot_id}/settings/{module}", auth=True)
        return payload if isinstance(payload, dict) else {}

    def start_robot(self, robot_id: str) -> Account:
        payload = self.client.post(f"/api/v1/robots/{robot_id}/start", {}, auth=True)
        return Account.from_api(payload or {})

    def stop_robot(self, robot_id: str) -> Account:
        payload = self.client.post(f"/api/v1/robots/{robot_id}/stop", {"stopReason": "MANUAL"}, auth=True)
        return Account.from_api(payload or {})


    def update_robot_runtime_status(
        self,
        robot_id: str,
        status: str,
        *,
        stop_reason: str | None = None,
        last_error: str | None = None,
    ) -> Account | None:
        if not robot_id:
            return None
        payload: dict[str, Any] = {"status": status}
        if stop_reason:
            payload["stopReason"] = stop_reason
        if last_error:
            payload["lastError"] = last_error
        data = self.client.patch(f"/api/v1/robots/{robot_id}/runtime-status", payload, auth=True)
        return Account.from_api(data or {}) if isinstance(data, dict) else None

    def touch_device_online(self, device_id: str) -> dict[str, Any] | None:
        if not device_id:
            return None
        try:
            return self.client.patch(
                f"/api/v1/robots/devices/{device_id}/status",
                {"status": "ONLINE"},
                auth=True,
            )
        except Exception:
            return None


    def sync_robot_auth_status(
        self,
        robot_id: str,
        status: str,
        *,
        device_id: str | None = None,
        account_name: str | None = None,
        account_uid: str | None = None,
        account_avatar_url: str | None = None,
        session_data: str | None = None,
        session_expires_at: str | None = None,
        authorized_at: str | None = None,
        source: str | None = None,
        reason: str | None = None,
        clear_session: bool | None = None,
        remark: str | None = None,
    ) -> Account | None:
        """按机器人 ID 同步扫码授权状态。

        后端会在机器人尚未绑定 authId 时自动创建授权记录并绑定，避免 GUI 已扫码成功但后台仍显示未授权。
        """
        if not robot_id:
            return None
        payload: dict[str, Any] = {"status": status}
        if device_id:
            payload["deviceId"] = device_id
        if account_name:
            payload["accountName"] = account_name
        if account_uid:
            payload["accountUid"] = account_uid
        if account_avatar_url:
            payload["accountAvatarUrl"] = account_avatar_url
        if session_data:
            payload["sessionData"] = session_data
        if session_expires_at:
            payload["sessionExpiresAt"] = session_expires_at
        if authorized_at:
            payload["authorizedAt"] = authorized_at
        if source:
            payload["source"] = source
        if reason:
            payload["reason"] = reason
        if clear_session is not None:
            payload["clearSession"] = bool(clear_session)
        if remark:
            payload["remark"] = remark
        data = self.client.patch(f"/api/v1/robots/{robot_id}/auth-sync", payload, auth=True)
        return Account.from_api(data or {}) if isinstance(data, dict) else None

    def sync_auth_waiting(self, auth_id: str, device_id: str | None = None) -> dict[str, Any] | None:
        if not auth_id:
            return None
        payload: dict[str, Any] = {"status": "WAIT_QR"}
        if device_id:
            payload["deviceId"] = device_id
        return self.client.patch(f"/api/v1/robots/auths/{auth_id}", payload, auth=True)

    def sync_auth_authorized(
        self,
        auth_id: str,
        *,
        device_id: str | None = None,
        account_name: str | None = None,
        account_uid: str | None = None,
        session_data: str | None = None,
        remark: str | None = None,
    ) -> dict[str, Any] | None:
        if not auth_id:
            return None
        payload: dict[str, Any] = {
            "status": "AUTHORIZED",
            "authorizedAt": datetime.utcnow().isoformat() + "Z",
        }
        if device_id:
            payload["deviceId"] = device_id
        if account_name:
            payload["accountName"] = account_name
        if account_uid:
            payload["accountUid"] = account_uid
        if session_data:
            payload["sessionData"] = session_data
        if remark:
            payload["remark"] = remark
        return self.client.patch(f"/api/v1/robots/auths/{auth_id}", payload, auth=True)

    def runtime_comment_reply(self, payload: dict[str, Any]) -> dict[str, Any]:
        data = self.client.request("POST", "/api/v1/auto-replies/comment/runtime-reply", json_body=payload, auth=True, timeout=45.0)
        return data if isinstance(data, dict) else {}

    def runtime_dm_reply(self, payload: dict[str, Any]) -> dict[str, Any]:
        data = self.client.request("POST", "/api/v1/auto-replies/dm/runtime-reply", json_body=payload, auth=True, timeout=60.0)
        return data if isinstance(data, dict) else {}

    # Backward-compatible aliases. Callers should migrate to runtime_* names.
    def test_comment_reply(self, payload: dict[str, Any]) -> dict[str, Any]:
        return self.runtime_comment_reply(payload)

    def test_dm_reply(self, payload: dict[str, Any]) -> dict[str, Any]:
        return self.runtime_dm_reply(payload)


    def lookup_comment_records(self, payload: dict[str, Any]) -> dict[str, Any]:
        """查询后端已同步的评论处理记录，用于在调用 Coze 前做去重。"""
        data = self.client.request(
            "POST",
            "/api/v1/auto-replies/comment/records/lookup",
            json_body=payload,
            auth=True,
            timeout=12.0,
        )
        return data if isinstance(data, dict) else {}

    def list_comment_records(self, *, robot_id: str = "", platform: str = "", record_id: str = "", page_size: int = 20) -> dict[str, Any]:
        params: dict[str, Any] = {"page": 1, "pageSize": page_size, "limit": page_size}
        if robot_id:
            params["robotId"] = robot_id
        if platform:
            params["platform"] = platform
        if record_id:
            params["recordId"] = record_id
        data = self.client.get("/api/v1/auto-replies/comment/records", params, auth=True)
        return data if isinstance(data, dict) else {}

    def sync_comment_records(self, payload: dict[str, Any]) -> dict[str, Any]:
        data = self.client.request("POST", "/api/v1/auto-replies/comment/records/sync", json_body=payload, auth=True, timeout=30.0)
        return data if isinstance(data, dict) else {}

    def list_dm_conversations(
        self,
        *,
        robot_id: str = "",
        platform: str = "",
        user_nickname: str = "",
        page_size: int = 5,
    ) -> dict[str, Any]:
        """查询后端已同步的私信会话，用于复用 Coze conversation_id。"""
        params: dict[str, Any] = {"page": 1, "pageSize": page_size, "limit": page_size}
        if robot_id:
            params["robotId"] = robot_id
        if platform:
            params["platform"] = platform
        if user_nickname:
            params["userNickname"] = user_nickname
        data = self.client.get("/api/v1/auto-replies/dm/conversations", params, auth=True)
        return data if isinstance(data, dict) else {}

    def sync_dm_conversations(self, payload: dict[str, Any]) -> dict[str, Any]:
        data = self.client.request("POST", "/api/v1/auto-replies/dm/conversations/sync", json_body=payload, auth=True, timeout=30.0)
        return data if isinstance(data, dict) else {}

    def resolve_sync_dm_dialogue(self, payload: dict[str, Any]) -> dict[str, Any]:
        data = self.client.request(
            "POST",
            "/api/v1/dialogue-records/dm/resolve-sync",
            json_body=payload,
            auth=True,
            timeout=30.0,
        )
        return data if isinstance(data, dict) else {}

    def update_dialogue_workflow_conversation(self, conversation_id: str, workflow_conversation_id: str) -> dict[str, Any]:
        if not conversation_id or not workflow_conversation_id:
            return {}
        data = self.client.request(
            "PATCH",
            f"/api/v1/dialogue-records/conversations/{conversation_id}/workflow-conversation",
            json_body={"workflowConversationId": workflow_conversation_id},
            auth=True,
            timeout=12.0,
        )
        return data if isinstance(data, dict) else {}
