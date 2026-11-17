from __future__ import annotations

import json
import time
from datetime import datetime
from typing import Any, Callable
from urllib.parse import urljoin

import requests


class ApiError(RuntimeError):
    def __init__(self, message: str, status_code: int | None = None, payload: Any | None = None):
        super().__init__(message)
        self.status_code = status_code
        self.payload = payload


class HttpClient:
    """带有请求记录能力的轻量 HTTP 客户端。"""

    def __init__(
        self,
        base_url: str,
        access_token: str | None = None,
        refresh_token: str | None = None,
        tenant_id: str | None = None,
        request_logger: Callable[[dict[str, Any]], None] | None = None,
    ):
        self.base_url = base_url.rstrip("/") + "/"
        self.access_token = access_token or ""
        self.refresh_token = refresh_token or ""
        self.tenant_id = tenant_id or ""
        self.request_logger = request_logger
        self.session = requests.Session()

    def configure(
        self,
        *,
        base_url: str | None = None,
        access_token: str | None = None,
        refresh_token: str | None = None,
        tenant_id: str | None = None,
    ) -> None:
        if base_url is not None:
            self.base_url = base_url.rstrip("/") + "/"
        if access_token is not None:
            self.access_token = access_token
        if refresh_token is not None:
            self.refresh_token = refresh_token
        if tenant_id is not None:
            self.tenant_id = tenant_id

    def get(self, endpoint: str, params: dict[str, Any] | None = None, *, auth: bool = True) -> Any:
        return self.request("GET", endpoint, params=params, auth=auth)

    def post(self, endpoint: str, data: dict[str, Any] | None = None, *, auth: bool = True) -> Any:
        return self.request("POST", endpoint, json_body=data, auth=auth)

    def patch(self, endpoint: str, data: dict[str, Any] | None = None, *, auth: bool = True) -> Any:
        return self.request("PATCH", endpoint, json_body=data, auth=auth)

    def delete(self, endpoint: str, *, auth: bool = True) -> Any:
        return self.request("DELETE", endpoint, auth=auth)

    def request(
        self,
        method: str,
        endpoint: str,
        *,
        params: dict[str, Any] | None = None,
        json_body: dict[str, Any] | None = None,
        auth: bool = True,
        timeout: float = 18.0,
    ) -> Any:
        url = urljoin(self.base_url, endpoint.lstrip("/"))
        headers = {
            "Accept": "application/json",
            "Content-Type": "application/json",
        }
        if auth and self.access_token:
            headers["Authorization"] = f"Bearer {self.access_token}"
        if self.tenant_id:
            headers["X-Tenant-Id"] = self.tenant_id

        started = time.perf_counter()
        response: requests.Response | None = None
        error_text = ""
        parsed_body: Any = None
        try:
            response = self.session.request(
                method=method.upper(),
                url=url,
                params={k: v for k, v in (params or {}).items() if v not in (None, "")},
                json=json_body,
                headers=headers,
                timeout=timeout,
            )
            duration_ms = int((time.perf_counter() - started) * 1000)
            try:
                parsed_body = response.json()
            except Exception:
                parsed_body = response.text

            if not response.ok:
                message = self._extract_error_message(parsed_body) or f"HTTP {response.status_code}"
                raise ApiError(message, response.status_code, parsed_body)

            self._log_request(
                timestamp=datetime.now().strftime("%H:%M:%S"),
                method=method.upper(),
                url=url,
                endpoint=endpoint,
                params=params,
                request_headers=headers,
                request_body=json_body,
                status_code=response.status_code,
                duration_ms=duration_ms,
                response_body=parsed_body,
                ok=True,
            )
            return self._unwrap_payload(parsed_body)
        except requests.RequestException as exc:
            duration_ms = int((time.perf_counter() - started) * 1000)
            error_text = str(exc)
            self._log_request(
                timestamp=datetime.now().strftime("%H:%M:%S"),
                method=method.upper(),
                url=url,
                endpoint=endpoint,
                params=params,
                request_headers=headers,
                request_body=json_body,
                status_code=getattr(response, "status_code", 0),
                duration_ms=duration_ms,
                response_body=parsed_body if parsed_body is not None else error_text,
                ok=False,
            )
            raise ApiError(error_text, getattr(response, "status_code", None), parsed_body) from exc
        except ApiError:
            duration_ms = int((time.perf_counter() - started) * 1000)
            self._log_request(
                timestamp=datetime.now().strftime("%H:%M:%S"),
                method=method.upper(),
                url=url,
                endpoint=endpoint,
                params=params,
                request_headers=headers,
                request_body=json_body,
                status_code=getattr(response, "status_code", 0),
                duration_ms=duration_ms,
                response_body=parsed_body,
                ok=False,
            )
            raise

    def _unwrap_payload(self, payload: Any) -> Any:
        if isinstance(payload, dict) and "data" in payload and ("code" in payload or "message" in payload):
            return payload.get("data")
        return payload

    def _extract_error_message(self, payload: Any) -> str:
        if isinstance(payload, dict):
            for key in ("message", "error"):
                value = payload.get(key)
                if isinstance(value, str) and value.strip():
                    return value.strip()
        if isinstance(payload, str) and payload.strip():
            return payload.strip()
        return "请求失败"

    def _log_request(self, **entry: Any) -> None:
        if not self.request_logger:
            return
        body = entry.get("response_body")
        pretty_response = body
        try:
            if not isinstance(body, str):
                pretty_response = json.dumps(body, ensure_ascii=False, indent=2)
        except Exception:
            pretty_response = str(body)

        req_body = entry.get("request_body")
        pretty_request = req_body
        try:
            if not isinstance(req_body, str):
                pretty_request = json.dumps(req_body or {}, ensure_ascii=False, indent=2)
        except Exception:
            pretty_request = str(req_body)

        safe_headers = dict(entry.get("request_headers") or {})
        if "Authorization" in safe_headers:
            safe_headers["Authorization"] = "Bearer ***"
        safe_request_body = entry.get("request_body")
        if isinstance(safe_request_body, dict) and "password" in safe_request_body:
            safe_request_body = dict(safe_request_body)
            safe_request_body["password"] = "***"
            try:
                pretty_request = json.dumps(safe_request_body, ensure_ascii=False, indent=2)
            except Exception:
                pretty_request = str(safe_request_body)

        self.request_logger(
            {
                **entry,
                "request_headers": safe_headers,
                "request_body_pretty": pretty_request or "{}",
                "response_body_pretty": pretty_response or "",
            }
        )
