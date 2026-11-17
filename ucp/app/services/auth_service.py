from __future__ import annotations

from dataclasses import dataclass
from typing import Any

from app.services.http_client import HttpClient


@dataclass(slots=True)
class TenantOption:
    tenant_id: str
    tenant_name: str
    tenant_code: str = ""
    is_default: bool = False

    @staticmethod
    def from_dict(item: dict[str, Any]) -> "TenantOption":
        return TenantOption(
            tenant_id=str(item.get("tenantId") or item.get("id") or ""),
            tenant_name=str(item.get("tenantName") or item.get("name") or "未命名租户"),
            tenant_code=str(item.get("tenantCode") or item.get("code") or ""),
            is_default=bool(item.get("isDefault", False)),
        )


@dataclass(slots=True)
class LoginResult:
    access_token: str
    refresh_token: str
    user: dict[str, Any]
    tenants: list[TenantOption]


class AuthService:
    def __init__(self, client: HttpClient) -> None:
        self.client = client
        self.refresh_token: str | None = None
        self.current_user: dict[str, Any] | None = None

    def login(self, username: str, password: str) -> LoginResult:
        response = self.client.post("/api/v1/auth/login", {"username": username, "password": password})
        data = self.client.unwrap(response)
        return self._apply_login_data(data)

    def switch_tenant(self, tenant_id: str) -> LoginResult:
        response = self.client.post("/api/v1/auth/switch-tenant", {"tenantId": tenant_id})
        data = self.client.unwrap(response)
        result = self._apply_login_data(data)
        self.client.set_tenant_id(tenant_id)
        return result

    def _apply_login_data(self, data: dict[str, Any]) -> LoginResult:
        access_token = str(data.get("accessToken") or "")
        refresh_token = str(data.get("refreshToken") or "")
        user = data.get("user") if isinstance(data.get("user"), dict) else {}
        tenants = [TenantOption.from_dict(item) for item in user.get("tenants", []) if isinstance(item, dict)]
        self.client.set_access_token(access_token)
        self.refresh_token = refresh_token
        self.current_user = user
        return LoginResult(access_token=access_token, refresh_token=refresh_token, user=user, tenants=tenants)
