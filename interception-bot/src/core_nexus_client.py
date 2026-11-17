from __future__ import annotations

import json
import os
import time
from dataclasses import dataclass, asdict
from datetime import datetime
from pathlib import Path
from typing import Any, Callable, Dict, List, Optional
from urllib import parse

import requests


class CoreNexusAPIError(RuntimeError):
    pass


@dataclass
class CoreNexusSession:
    base_url: str
    access_token: str
    refresh_token: Optional[str] = None
    tenant_id: Optional[str] = None
    user: Optional[Dict[str, Any]] = None
    tenants: Optional[List[Dict[str, Any]]] = None

    def to_dict(self) -> Dict[str, Any]:
        return asdict(self)

    @classmethod
    def from_dict(cls, data: Dict[str, Any]) -> "CoreNexusSession":
        return cls(
            base_url=str(data.get("base_url") or data.get("baseUrl") or ""),
            access_token=str(data.get("access_token") or data.get("accessToken") or ""),
            refresh_token=data.get("refresh_token") or data.get("refreshToken"),
            tenant_id=data.get("tenant_id") or data.get("tenantId"),
            user=data.get("user") if isinstance(data.get("user"), dict) else None,
            tenants=data.get("tenants") if isinstance(data.get("tenants"), list) else None,
        )


def normalize_core_base_url(base_url: str) -> str:
    value = (base_url or "").strip().rstrip("/")
    if not value:
        raise ValueError("core-nexus base URL 不能为空")
    if not value.endswith("/api"):
        value = value + "/api"
    return value


class CoreNexusClient:
    def __init__(
        self,
        base_url: str,
        timeout: float = 20.0,
        request_logger: Optional[Callable[[Dict[str, Any]], None]] = None,
    ):
        self.base_url = normalize_core_base_url(base_url)
        self.timeout = timeout
        self.request_logger = request_logger
        self.http = requests.Session()
        # 与 UCP 保持一致使用 requests.Session；打包版默认不读取系统代理/PAC，
        # 避免 Windows 环境每次请求前代理探测造成 GUI 停顿。
        self.http.trust_env = str(os.environ.get("ACS_HTTP_TRUST_ENV", "0")).strip().lower() in {"1", "true", "yes", "on"}
        self.session: Optional[CoreNexusSession] = None
        self.last_capture_dedupe_stats: Dict[str, int] = {"before": 0, "after": 0, "dropped": 0}

    @classmethod
    def from_session(
        cls,
        session: CoreNexusSession,
        timeout: float = 20.0,
        request_logger: Optional[Callable[[Dict[str, Any]], None]] = None,
    ) -> "CoreNexusClient":
        client = cls(session.base_url, timeout=timeout, request_logger=request_logger)
        client.session = session
        return client

    def login(self, username: str, password: str, tenant_id: Optional[str] = None) -> CoreNexusSession:
        payload = self._request(
            "POST",
            "/v1/auth/login",
            body={"username": username, "password": password},
            tenant_id=tenant_id,
            auth_required=False,
        )
        data = self._unwrap(payload)
        if not isinstance(data, dict) or not data.get("accessToken"):
            raise CoreNexusAPIError("登录响应中缺少 accessToken")
        user = data.get("user") if isinstance(data.get("user"), dict) else None
        tenants = self._extract_tenants(user)
        resolved_tenant = tenant_id or self._resolve_default_tenant_id(user)
        self.session = CoreNexusSession(
            base_url=self.base_url,
            access_token=str(data["accessToken"]),
            refresh_token=data.get("refreshToken"),
            tenant_id=resolved_tenant,
            user=user,
            tenants=tenants,
        )
        return self.session

    def refresh(self) -> CoreNexusSession:
        if not self.session or not self.session.refresh_token:
            raise CoreNexusAPIError("当前没有可刷新的 refreshToken")
        payload = self._request(
            "POST",
            "/v1/auth/refresh",
            body={"refreshToken": self.session.refresh_token},
            tenant_id=self.session.tenant_id,
            auth_required=False,
        )
        data = self._unwrap(payload)
        if not isinstance(data, dict) or not data.get("accessToken"):
            raise CoreNexusAPIError("刷新响应中缺少 accessToken")
        user = data.get("user") if isinstance(data.get("user"), dict) else self.session.user
        self.session = CoreNexusSession(
            base_url=self.base_url,
            access_token=str(data["accessToken"]),
            refresh_token=data.get("refreshToken") or self.session.refresh_token,
            tenant_id=self.session.tenant_id or self._resolve_default_tenant_id(user),
            user=user,
            tenants=self._extract_tenants(user) or self.session.tenants,
        )
        return self.session

    def switch_tenant(self, tenant_id: str) -> CoreNexusSession:
        if not tenant_id:
            raise CoreNexusAPIError("tenantId 不能为空")
        payload = self._request("POST", "/v1/auth/switch-tenant", body={"tenantId": tenant_id}, tenant_id=tenant_id)
        data = self._unwrap(payload)
        if not isinstance(data, dict) or not data.get("accessToken"):
            if self.session:
                self.session.tenant_id = tenant_id
                return self.session
            raise CoreNexusAPIError("切换租户响应中缺少 accessToken")
        user = data.get("user") if isinstance(data.get("user"), dict) else (self.session.user if self.session else None)
        self.session = CoreNexusSession(
            base_url=self.base_url,
            access_token=str(data["accessToken"]),
            refresh_token=data.get("refreshToken") or (self.session.refresh_token if self.session else None),
            tenant_id=tenant_id,
            user=user,
            tenants=self._extract_tenants(user) or (self.session.tenants if self.session else None),
        )
        return self.session

    def logout(self) -> None:
        if not self.session or not self.session.refresh_token:
            self.session = None
            return
        try:
            self._request("POST", "/v1/auth/logout", body={"refreshToken": self.session.refresh_token}, auth_required=False)
        finally:
            self.session = None

    def me(self) -> Dict[str, Any]:
        data = self._unwrap(self._request("GET", "/v1/auth/me"))
        return data if isinstance(data, dict) else {"value": data}

    def list_robots(
        self,
        platform: Optional[str] = None,
        robot_type: Optional[str] = "INTERCEPT",
        status: Optional[str] = None,
        page: int = 1,
        page_size: int = 50,
    ) -> Dict[str, Any]:
        query = {
            "page": page,
            "pageSize": page_size,
            "limit": page_size,
        }
        if platform:
            query["platform"] = to_core_platform(platform)
        if robot_type:
            query["type"] = robot_type
        if status:
            query["status"] = status
        data = self._unwrap(self._request("GET", "/v1/robots", query=query))
        return data if isinstance(data, dict) else {"items": data}



    def list_private_message_robots(
        self,
        platform: Optional[str] = None,
        status: Optional[str] = None,
        page: int = 1,
        page_size: int = 50,
    ) -> Dict[str, Any]:
        query = {"page": page, "pageSize": page_size, "limit": page_size}
        if platform:
            query["platform"] = to_core_platform(platform)
        if status:
            query["status"] = status
        data = self._unwrap(self._request("GET", "/v1/robots/lead-private-message", query=query))
        return data if isinstance(data, dict) else {"items": data}

    def get_private_message_runtime_config(self, robot_id: str) -> Dict[str, Any]:
        data = self._unwrap(self._request("GET", f"/v1/robots/lead-private-message/{parse.quote(robot_id)}/runtime-config"))
        if not isinstance(data, dict):
            raise CoreNexusAPIError("主动私信机器人运行配置响应格式不正确")
        return data

    def claim_private_message_tasks(self, robot_id: str, platform: Optional[str] = None, limit: int = 1) -> Dict[str, Any]:
        body: Dict[str, Any] = {"robotId": robot_id, "limit": max(1, int(limit or 1))}
        if platform:
            body["platform"] = to_core_platform(platform)
        data = self._unwrap(self._request("POST", "/v1/robots/lead-private-message-tasks/claim", body=body))
        return data if isinstance(data, dict) else {"items": data}

    def report_private_message_task(
        self,
        robot_id: str,
        task_id: str,
        status: str,
        error_message: str = "",
        screenshot_url: str = "",
        raw: Optional[Dict[str, Any]] = None,
    ) -> Dict[str, Any]:
        body = {
            "robotId": robot_id,
            "taskId": task_id,
            "status": status,
            "errorMessage": error_message,
            "screenshotUrl": screenshot_url,
            "raw": raw or {},
        }
        data = self._unwrap(self._request("POST", "/v1/robots/lead-private-message-tasks/report", body=body))
        return data if isinstance(data, dict) else {"value": data}

    def get_robot(self, robot_id: str) -> Dict[str, Any]:
        data = self._unwrap(self._request("GET", f"/v1/robots/{parse.quote(robot_id)}"))
        if not isinstance(data, dict):
            raise CoreNexusAPIError("机器人详情响应格式不正确")
        return data

    def update_runtime_status(
        self,
        robot_id: str,
        status: str,
        stop_reason: Optional[str] = None,
        last_error: Optional[str] = None,
    ) -> Dict[str, Any]:
        body: Dict[str, Any] = {"status": status}
        if stop_reason:
            body["stopReason"] = stop_reason
        if last_error:
            body["lastError"] = last_error
        data = self._unwrap(self._request("PATCH", f"/v1/robots/{parse.quote(robot_id)}/runtime-status", body=body))
        return data if isinstance(data, dict) else {"value": data}

    def run_intercept_work_decision(
        self,
        robot_id: str,
        video: Dict[str, Any],
        bp: Optional[Dict[str, Any]] = None,
        acct: Optional[Dict[str, Any]] = None,
        workflow_id: Optional[str] = None,
    ) -> Dict[str, Any]:
        body: Dict[str, Any] = {"video": video or {}}
        if bp:
            body["bp"] = bp
        if acct:
            body["acct"] = acct
        if workflow_id:
            body["workflowId"] = workflow_id
        data = self._unwrap(
            self._request(
                "POST",
                f"/v1/robots/{parse.quote(robot_id)}/intercept-work-decision",
                body=body,
            )
        )
        return data if isinstance(data, dict) else {"value": data}


    def build_intercept_capture_payload(self, result: Any) -> Dict[str, Any]:
        """Build the compact comment-only payload sent to core-nexus.

        Important rules:
        - only comments are uploaded; content records without comments are skipped;
        - no nested raw scraper payload is sent;
        - every item is a small table row that the PC backend can page and display.
        """
        return self._build_intercept_capture_payload(result)

    def upload_intercept_captures(self, robot_id: str, result: Any, chunk_size: int = 50) -> Dict[str, Any]:
        body = self.build_intercept_capture_payload(result)
        return self.upload_intercept_capture_payload(robot_id, body, chunk_size=chunk_size)

    def upload_intercept_capture_chunk(self, robot_id: str, chunk_body: Dict[str, Any]) -> Dict[str, Any]:
        data = self._unwrap(
            self._request(
                "POST",
                f"/v1/robots/{parse.quote(robot_id)}/intercept-captures",
                body=chunk_body,
            )
        )
        return data if isinstance(data, dict) else {"value": data}

    def upload_intercept_capture_payload(
        self,
        robot_id: str,
        body: Dict[str, Any],
        chunk_size: int = 50,
        max_payload_bytes: int = 60_000,
    ) -> Dict[str, Any]:
        """Upload compact intercept capture rows in byte-limited chunks.

        The core-nexus Nest body parser may reject bodies around/above 100 KB.
        Row-count based batching is not safe because comment text lengths vary, so
        this method splits by both row count and serialized JSON byte size.
        """
        items = body.get("items") if isinstance(body, dict) else []
        if not isinstance(items, list):
            items = []

        run_id = str(body.get("runId") or "") if isinstance(body, dict) else ""
        total_received = len(items)
        total_created = 0
        responses: List[Dict[str, Any]] = []

        if not items:
            data = self._unwrap(
                self._request(
                    "POST",
                    f"/v1/robots/{parse.quote(robot_id)}/intercept-captures",
                    body={"runId": run_id, "items": []},
                )
            )
            return data if isinstance(data, dict) else {"value": data, "received": 0, "created": 0}

        chunks = self.preview_intercept_upload_chunks(
            body,
            chunk_size=chunk_size,
            max_payload_bytes=max_payload_bytes,
        )
        for chunk_info in chunks:
            chunk_body = chunk_info.get("body") if isinstance(chunk_info, dict) else None
            if not isinstance(chunk_body, dict):
                continue
            try:
                data = self.upload_intercept_capture_chunk(robot_id, chunk_body)
            except CoreNexusAPIError as exc:
                chunk_index = chunk_info.get("index") or len(responses) + 1
                chunk_rows = chunk_info.get("rows") or len(chunk_body.get("items") or [])
                chunk_bytes = chunk_info.get("bytes") or self._json_size_bytes(chunk_body)
                raise CoreNexusAPIError(
                    f"截流捕获数据同步失败：第 {chunk_index}/{len(chunks)} 批，"
                    f"rows={chunk_rows}，bytes={chunk_bytes}，{exc}"
                ) from exc
            if isinstance(data, dict):
                responses.append(data)
                try:
                    total_created += int(data.get("created") or 0)
                except Exception:
                    pass

        return {
            "received": total_received,
            "created": total_created,
            "chunks": len(responses),
            "responses": responses,
        }

    def preview_intercept_upload_chunks(
        self,
        body: Dict[str, Any],
        chunk_size: int = 50,
        max_payload_bytes: int = 60_000,
    ) -> List[Dict[str, Any]]:
        items = body.get("items") if isinstance(body, dict) else []
        if not isinstance(items, list):
            items = []
        run_id = str(body.get("runId") or "") if isinstance(body, dict) else ""
        safe_chunk_size = max(1, int(chunk_size or 50))
        safe_max_bytes = max(8_000, int(max_payload_bytes or 60_000))

        chunks: List[Dict[str, Any]] = []
        current: List[Dict[str, Any]] = []

        def current_body(rows: List[Dict[str, Any]]) -> Dict[str, Any]:
            return {"runId": run_id, "items": rows}

        def flush() -> None:
            if not current:
                return
            body_part = current_body(list(current))
            chunks.append({
                "index": len(chunks) + 1,
                "rows": len(current),
                "bytes": self._json_size_bytes(body_part),
                "body": body_part,
            })
            current.clear()

        for raw_item in items:
            item = self._compact_upload_row(raw_item)
            if not item:
                continue
            candidate = current + [item]
            candidate_bytes = self._json_size_bytes(current_body(candidate))
            if current and (len(candidate) > safe_chunk_size or candidate_bytes > safe_max_bytes):
                flush()
                candidate = [item]
                candidate_bytes = self._json_size_bytes(current_body(candidate))
            if not current and candidate_bytes > safe_max_bytes:
                item = self._truncate_oversized_row(item)
            current.append(item)
        flush()
        return chunks

    def _json_size_bytes(self, value: Any) -> int:
        return len(json.dumps(value, ensure_ascii=False, separators=(",", ":")).encode("utf-8"))

    def _extract_error_message(self, payload: Any, max_length: int = 1200) -> str:
        """Extract a readable error message from core-nexus error responses.

        This is intentionally defensive: core-nexus may return plain strings,
        standard Nest HTTP exception payloads, wrapped business errors, or
        validation errors.  The upload path relies on this helper only when an
        HTTP response is not OK, so normal successful synchronization is not
        changed.
        """

        def clean(value: Any) -> str:
            if value is None:
                return ""
            if isinstance(value, str):
                return " ".join(value.strip().split())
            if isinstance(value, (int, float, bool)):
                return str(value)
            return ""

        def shorten(value: str) -> str:
            value = value.strip()
            if max_length > 0 and len(value) > max_length:
                return value[: max_length - 3].rstrip() + "..."
            return value

        def summarize_errors(value: Any) -> str:
            if value is None:
                return ""
            if isinstance(value, str):
                return clean(value)
            if isinstance(value, list):
                parts = [summarize_errors(item) for item in value]
                return "；".join(part for part in parts if part)
            if isinstance(value, dict):
                field = clean(value.get("field") or value.get("property") or value.get("path"))
                details = value.get("errors")
                if details is None:
                    details = value.get("constraints")
                if isinstance(details, dict):
                    detail_text = "；".join(clean(item) for item in details.values() if clean(item))
                else:
                    detail_text = summarize_errors(details)
                if not detail_text:
                    detail_text = clean(value.get("message") or value.get("error") or value.get("detail"))
                if field and detail_text:
                    return f"{field}: {detail_text}"
                if detail_text:
                    return detail_text
                nested_parts = []
                for key in ("children", "details", "data"):
                    nested_text = summarize_errors(value.get(key))
                    if nested_text:
                        nested_parts.append(nested_text)
                return "；".join(nested_parts)
            return clean(value)

        if payload is None:
            return ""
        if isinstance(payload, str):
            return shorten(clean(payload))
        if isinstance(payload, list):
            return shorten(summarize_errors(payload))
        if not isinstance(payload, dict):
            return shorten(clean(payload))

        message_parts: List[str] = []
        for key in ("message", "msg", "error", "detail", "reason"):
            value = payload.get(key)
            if isinstance(value, list):
                text = summarize_errors(value)
            elif isinstance(value, dict):
                text = summarize_errors(value)
            else:
                text = clean(value)
            if text and text not in message_parts:
                message_parts.append(text)

        errors_text = summarize_errors(payload.get("errors"))
        if errors_text and errors_text not in message_parts:
            message_parts.append(errors_text)

        data = payload.get("data")
        if isinstance(data, (dict, list)):
            data_text = self._extract_error_message(data, max_length=max_length)
            if data_text and data_text not in message_parts:
                message_parts.append(data_text)

        return shorten("；".join(message_parts))

    def _truncate_oversized_row(self, row: Dict[str, Any]) -> Dict[str, Any]:
        result = dict(row)
        max_lengths = {
            "commentText": 1000,
            "commentContent": 1000,
            "contentTitle": 300,
            "speechTranscript": 4000,
            "speechError": 1000,
            "videoDescription": 1000,
            "workDecisionReason": 1000,
            "nickname": 120,
            "commentUserName": 120,
            "accountAlias": 120,
            "sourceAccountName": 120,
        }
        for key, limit in max_lengths.items():
            value = result.get(key)
            if isinstance(value, str) and len(value) > limit:
                result[key] = value[:limit] + "..."
        return result

    def _compact_upload_row(self, raw_row: Any) -> Dict[str, Any]:
        row = self._as_plain_dict(raw_row)
        if not row:
            return {}

        text_limits = {
            "runId": 64,
            "platform": 32,
            "accountAlias": 100,
            "targetType": 32,
            "platformContentId": 128,
            "speechStatus": 32,
            "workDecisionStatus": 32,
            "workDecisionWorkflowId": 128,
            "commentId": 128,
            "parentCommentId": 128,
            "userId": 128,
            "nickname": 100,
        }
        text_keys = (
            "platform",
            "accountAlias",
            "targetType",
            "homepageUrl",
            "contentUrl",
            "platformContentId",
            "contentTitle",
            "publishTimeIso",
            "speechTranscript",
            "speechStatus",
            "speechError",
            "videoDescription",
            "workDecisionStatus",
            "workDecisionReason",
            "workDecisionWorkflowId",
            "commentId",
            "parentCommentId",
            "userId",
            "nickname",
            "commentText",
            "commentTimeIso",
            "visibleRegion",
            # source/comment account fields are retained for diagnostics and future backend support;
            # current core-nexus may whitelist them out safely.
            "sourceAccountId",
            "sourceAccountIpLocation",
            "commentUserProfileUrl",
            "capturedAt",
        )
        compact: Dict[str, Any] = {}
        for key in text_keys:
            text = self._clean_text(row.get(key))
            if not text:
                continue
            limit = text_limits.get(key)
            compact[key] = text[:limit] if limit and len(text) > limit else text

        # Make sure required old aliases are present even if a future builder only provides user-facing names.
        alias_map = {
            "commentText": "commentContent",
            "nickname": "commentUserName",
            "userId": "commentUserId",
            "visibleRegion": "commentUserIpLocation",
            "homepageUrl": "sourceAccountUrl",
            "accountAlias": "sourceAccountName",
        }
        for target_key, source_key in alias_map.items():
            if target_key in compact:
                continue
            text = self._clean_text(row.get(source_key))
            if text:
                limit = text_limits.get(target_key)
                compact[target_key] = text[:limit] if limit and len(text) > limit else text

        tags = self._normalize_upload_tags(row.get("videoTags") if row.get("videoTags") is not None else row.get("video_tags"))
        if tags:
            compact["videoTags"] = tags

        should_run = self._parse_boolish(row.get("workDecisionShouldRun") if row.get("workDecisionShouldRun") is not None else row.get("work_decision_should_run"))
        if should_run is not None:
            compact["workDecisionShouldRun"] = should_run

        if "targetType" not in compact:
            compact["targetType"] = "content"
        return {key: value for key, value in compact.items() if value not in (None, "", [], {})}

    def _build_intercept_capture_payload(self, result: Any) -> Dict[str, Any]:
        result_dict = self._as_plain_dict(result)
        run_id = self._clean_text(result_dict.get("run_id") or result_dict.get("runId"))
        platform = self._normalize_platform(result_dict.get("platform"))
        account_alias = self._clean_text(result_dict.get("account_alias") or result_dict.get("accountAlias"))
        fallback_homepage = self._clean_text(result_dict.get("homepage_url") or result_dict.get("homepageUrl"))
        captured_at = self._clean_text(result_dict.get("generated_at") or result_dict.get("generatedAt"))

        rows: List[Dict[str, Any]] = []
        upload_precheck = str(os.getenv("ACS_UPLOAD_CONTENT_PRECHECK", "0")).strip().lower() in {"1", "true", "yes", "on"}
        for raw_content in result_dict.get("items") or []:
            content = self._as_plain_dict(raw_content)
            if not content:
                continue
            if upload_precheck:
                precheck_row = self._capture_precheck_row(
                    run_id=run_id,
                    platform=platform,
                    account_alias=account_alias,
                    fallback_homepage=fallback_homepage,
                    captured_at=captured_at,
                    content=content,
                )
                if precheck_row:
                    rows.append(precheck_row)
            comments = list(self._iter_comments(content.get("comments") or []))
            for comment in comments:
                row = self._capture_comment_row(
                    run_id=run_id,
                    platform=platform,
                    account_alias=account_alias,
                    fallback_homepage=fallback_homepage,
                    captured_at=captured_at,
                    content=content,
                    comment=comment,
                )
                if row:
                    rows.append(row)
        before_count = len(rows)
        rows = self._dedupe_capture_rows(rows)
        self.last_capture_dedupe_stats = {"before": before_count, "after": len(rows), "dropped": max(0, before_count - len(rows))}
        return {"runId": run_id, "items": rows}

    def _dedupe_capture_rows(self, rows: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
        """Client-side de-duplication before upload.

        The backend also needs to guard against repeated uploads across runs, but the
        desktop client should not send duplicate comment rows in the same payload.
        The business key follows the requested rule: comment user + comment time +
        comment content.  If a duplicate row has extra fields that the first row lacks,
        fill those empty fields instead of overwriting existing data.
        """
        result: List[Dict[str, Any]] = []
        index_by_key: Dict[str, int] = {}
        for raw in rows:
            row = self._as_plain_dict(raw)
            if not row:
                continue
            key = self._capture_row_dedupe_key(row)
            if key and key in index_by_key:
                existing = result[index_by_key[key]]
                for field, value in row.items():
                    if self._is_missing(existing.get(field)) and not self._is_missing(value):
                        existing[field] = value
                continue
            if key:
                index_by_key[key] = len(result)
            result.append(row)
        return result

    def _capture_row_dedupe_key(self, row: Dict[str, Any]) -> str:
        target_type = self._clean_text(row.get("targetType") or row.get("target_type"))
        if target_type == "content_precheck":
            run_id = self._clean_text(row.get("runId") or row.get("run_id"))
            platform = self._clean_text(row.get("platform"))
            content_key = self._clean_text(row.get("platformContentId") or row.get("platform_content_id") or row.get("contentUrl") or row.get("content_url"))
            if platform and content_key:
                return "precheck:" + self._sha256("|".join([run_id, platform, content_key]))
        comment_user = self._clean_text(row.get("userId") or row.get("nickname") or row.get("commentUserId") or row.get("commentUserName"))
        comment_time = self._clean_text(row.get("commentTimeIso") or row.get("capturedAt"))
        comment_text = self._normalize_dedupe_text(row.get("commentText") or row.get("commentContent"))
        if comment_user and comment_time and comment_text:
            return "comment:" + self._sha256("|".join([comment_user, comment_time, comment_text]))
        # Fallback: still avoid obvious platform comment-id duplicates when a platform
        # does not expose comment time in a stable way.
        platform = self._clean_text(row.get("platform"))
        comment_id = self._clean_text(row.get("commentId"))
        if platform and comment_id:
            return "comment_id:" + self._sha256("|".join([platform, comment_id]))
        return ""

    def _normalize_dedupe_text(self, value: Any) -> str:
        text = self._clean_text(value)
        return " ".join(text.split())

    def _sha256(self, text: str) -> str:
        import hashlib

        return hashlib.sha256(text.encode("utf-8")).hexdigest()

    def _is_missing(self, value: Any) -> bool:
        return value is None or value == "" or value == [] or value == {}

    def _capture_precheck_row(
        self,
        run_id: str,
        platform: str,
        account_alias: str,
        fallback_homepage: str,
        captured_at: str,
        content: Dict[str, Any],
    ) -> Dict[str, Any]:
        homepage_url = self._first_text(content, "source_account_url", "sourceAccountUrl", "homepageUrl")
        content_url = self._first_text(content, "source_content_url", "sourceContentUrl", "contentUrl")
        if not homepage_url and fallback_homepage and fallback_homepage != "multi_target":
            homepage_url = fallback_homepage
        row: Dict[str, Any] = {
            "runId": run_id or None,
            "platform": platform or self._normalize_platform(content.get("platform")) or None,
            "accountAlias": account_alias or None,
            "targetType": "content_precheck",
            "homepageUrl": homepage_url or None,
            "contentUrl": content_url or None,
            "platformContentId": self._first_text(content, "platform_content_id", "platformContentId") or None,
            "contentTitle": self._first_text(content, "caption", "contentTitle", "title") or None,
            "publishTimeIso": self._first_text(content, "publish_time_iso", "publishTimeIso") or None,
            "capturedAt": captured_at or None,
        }
        row.update(self._content_speech_decision_fields(content))
        return {key: value for key, value in row.items() if value not in (None, "", [], {})}

    def _capture_comment_row(
        self,
        run_id: str,
        platform: str,
        account_alias: str,
        fallback_homepage: str,
        captured_at: str,
        content: Dict[str, Any],
        comment: Dict[str, Any],
    ) -> Dict[str, Any]:
        comment_content = self._first_text(
            comment,
            "comment_text",
            "commentText",
            "content",
            "text",
        )
        if not comment_content:
            return {}

        homepage_url = self._first_text(content, "source_account_url", "sourceAccountUrl", "homepageUrl")
        content_url = self._first_text(content, "source_content_url", "sourceContentUrl", "contentUrl")
        if not homepage_url and fallback_homepage and fallback_homepage != "multi_target":
            homepage_url = fallback_homepage

        source_account_name = self._first_text(
            content,
            "source_account_name",
            "sourceAccountName",
            "author_nickname",
            "authorNickname",
        ) or account_alias
        source_account_id = self._first_text(
            content,
            "source_account_id",
            "sourceAccountId",
            "author_sec_uid",
            "authorSecUid",
            "author_uid",
            "authorUid",
        ) or self._infer_douyin_profile_id(homepage_url)
        source_account_ip = self._first_text(
            content,
            "source_account_ip_location",
            "sourceAccountIpLocation",
            "author_ip_location",
            "authorIpLocation",
            "author_ip",
            "authorIp",
        )

        comment_user_id = self._first_text(comment, "user_id", "userId")
        comment_user_profile_url = self._first_text(
            comment,
            "user_profile_url",
            "userProfileUrl",
            "commentUserProfileUrl",
        ) or self._build_douyin_user_url(comment_user_id)

        row: Dict[str, Any] = {
            # 只上传评论展示和去重需要的小字段；不上传 raw / 接口响应 / 媒体信息。
            # 字段名优先兼容当前 core-nexus 截流捕获接口，避免后端 DTO 不识别。
            "platform": platform or self._normalize_platform(content.get("platform")) or None,
            "accountAlias": source_account_name or account_alias or None,
            "targetType": "content",
            "homepageUrl": homepage_url or None,
            "contentUrl": content_url or None,
            "platformContentId": self._first_text(content, "platform_content_id", "platformContentId") or None,
            "contentTitle": self._first_text(content, "caption", "contentTitle", "title") or None,
            "publishTimeIso": self._first_text(content, "publish_time_iso", "publishTimeIso") or None,
            "commentId": self._first_text(comment, "comment_id", "commentId") or None,
            "parentCommentId": self._first_text(comment, "parent_comment_id", "parentCommentId") or None,
            "userId": comment_user_id or None,
            "nickname": self._first_text(comment, "nickname", "user_name", "userName") or None,
            "commentText": comment_content or None,
            "commentTimeIso": self._first_text(comment, "comment_time_iso", "commentTimeIso") or None,
            "visibleRegion": self._first_text(comment, "visible_region", "visibleRegion", "ip_location", "ipLocation") or None,
            "sourceAccountId": source_account_id or None,
            "sourceAccountIpLocation": source_account_ip or None,
            "commentUserProfileUrl": comment_user_profile_url or None,
            "capturedAt": captured_at or self._first_text(comment, "comment_time_iso", "commentTimeIso") or None,
        }
        row.update(self._content_speech_decision_fields(content))
        return {key: value for key, value in row.items() if value not in (None, "")}

    def _content_speech_decision_fields(self, content: Dict[str, Any]) -> Dict[str, Any]:
        fields: Dict[str, Any] = {
            "speechTranscript": self._first_text(content, "speech_transcript", "speechTranscript") or None,
            "speechStatus": self._first_text(content, "speech_status", "speechStatus") or None,
            "speechError": self._first_text(content, "speech_error", "speechError") or None,
            "videoDescription": self._first_text(content, "video_description", "videoDescription") or None,
            "workDecisionStatus": self._first_text(content, "work_decision_status", "workDecisionStatus") or None,
            "workDecisionReason": self._first_text(content, "work_decision_reason", "workDecisionReason") or None,
            "workDecisionWorkflowId": self._first_text(content, "work_decision_workflow_id", "workDecisionWorkflowId") or None,
        }
        tags = content.get("video_tags")
        if tags is None:
            tags = content.get("videoTags")
        if isinstance(tags, list):
            fields["videoTags"] = [str(tag).strip() for tag in tags if str(tag).strip()]
        else:
            tag_text = self._clean_text(tags)
            fields["videoTags"] = [tag.strip() for tag in tag_text.split(",") if tag.strip()] if tag_text else []
        should_run = content.get("work_decision_should_run")
        if should_run is None:
            should_run = content.get("workDecisionShouldRun")
        if should_run is not None:
            parsed_should_run = self._parse_boolish(should_run)
            if parsed_should_run is not None:
                fields["workDecisionShouldRun"] = parsed_should_run
        return fields

    def _normalize_upload_tags(self, value: Any) -> List[str]:
        if isinstance(value, list):
            result = []
            for item in value:
                text = self._clean_text(item)
                if text:
                    result.append(text[:120])
            return result[:50]
        text = self._clean_text(value)
        if not text:
            return []
        if text.startswith("["):
            try:
                parsed = json.loads(text)
                if isinstance(parsed, list):
                    return self._normalize_upload_tags(parsed)
            except Exception:
                pass
        return [item[:120] for item in (part.strip() for part in text.split(",")) if item][:50]

    def _parse_boolish(self, value: Any) -> Optional[bool]:
        if isinstance(value, bool):
            return value
        if isinstance(value, (int, float)):
            return bool(value)
        text = self._clean_text(value).lower()
        if text in {"true", "1", "yes", "y", "run", "continue", "继续", "是"}:
            return True
        if text in {"false", "0", "no", "n", "skip", "stop", "跳过", "否"}:
            return False
        return None

    def _iter_comments(self, comments: Any):
        if not isinstance(comments, list):
            return
        for raw_comment in comments:
            comment = self._as_plain_dict(raw_comment)
            if not comment:
                continue
            yield comment
            replies = comment.get("replies") or []
            if isinstance(replies, list):
                yield from self._iter_comments(replies)

    def _first_text(self, data: Dict[str, Any], *keys: str) -> str:
        for key in keys:
            value = data.get(key)
            text = self._clean_text(value)
            if text:
                return text
        return ""

    def _clean_text(self, value: Any) -> str:
        if value is None:
            return ""
        if isinstance(value, bool):
            return "true" if value else "false"
        if isinstance(value, (int, float)):
            try:
                if isinstance(value, float) and (value != value):
                    return ""
            except Exception:
                pass
        text = str(value).replace("\x00", "")
        text = "".join(ch for ch in text if ch in "\t\n\r" or ord(ch) >= 32)
        text = text.strip()
        if text.lower() in {"undefined", "null", "none", "nan"}:
            return ""
        return text

    def _normalize_platform(self, value: Any) -> str:
        text = self._clean_text(value)
        return text.upper() if text else ""

    def _infer_douyin_profile_id(self, url: str) -> str:
        text = self._clean_text(url)
        if not text:
            return ""
        try:
            parsed = parse.urlparse(text)
            parts = [part for part in parsed.path.split("/") if part]
            if len(parts) >= 2 and parts[0] == "user":
                return parts[1]
        except Exception:
            return ""
        return ""

    def _build_douyin_user_url(self, value: str) -> str:
        text = self._clean_text(value)
        if not text:
            return ""
        if text.startswith("//"):
            return "https:" + text
        if text.startswith("http://") or text.startswith("https://"):
            return text
        if text.startswith("/user/"):
            return "https://www.douyin.com" + text
        if text.startswith("MS4"):
            return "https://www.douyin.com/user/" + text
        return ""

    def _as_plain_dict(self, value: Any) -> Dict[str, Any]:
        if value is None:
            return {}
        if isinstance(value, dict):
            return value
        if hasattr(value, "to_dict") and callable(getattr(value, "to_dict")):
            try:
                data = value.to_dict()
                return data if isinstance(data, dict) else {}
            except Exception:
                return {}
        if hasattr(value, "__dataclass_fields__"):
            try:
                data = asdict(value)
                return data if isinstance(data, dict) else {}
            except Exception:
                return {}
        return {}

    def _request(
        self,
        method: str,
        path: str,
        body: Optional[Dict[str, Any]] = None,
        query: Optional[Dict[str, Any]] = None,
        tenant_id: Optional[str] = None,
        auth_required: bool = True,
    ) -> Any:
        url = self.base_url + path
        endpoint = path
        clean_query = {k: v for k, v in (query or {}).items() if v is not None and v != ""}
        if clean_query:
            query_text = parse.urlencode(clean_query)
            endpoint += "?" + query_text

        headers = {"Accept": "application/json"}
        if body is not None:
            headers["Content-Type"] = "application/json"
        active_tenant_id = tenant_id or (self.session.tenant_id if self.session else None)
        if active_tenant_id:
            headers["X-Tenant-Id"] = active_tenant_id
        if auth_required:
            if not self.session or not self.session.access_token:
                raise CoreNexusAPIError("尚未登录 core-nexus")
            headers["Authorization"] = f"Bearer {self.session.access_token}"

        started = time.perf_counter()
        status_code: Optional[int] = None
        response_body: Any = None
        ok = False
        try:
            resp = self.http.request(
                method=method.upper(),
                url=url,
                params=clean_query or None,
                json=body if body is not None else None,
                headers=headers,
                timeout=self.timeout,
            )
            status_code = resp.status_code
            text = resp.text or ""
            try:
                response_body = resp.json() if text else None
            except ValueError as exc:
                response_body = text[:500]
                raise CoreNexusAPIError(f"core-nexus 返回非 JSON 响应: {text[:200]}") from exc
            if not resp.ok:
                message = self._extract_error_message(response_body) or text or f"HTTP {resp.status_code}"
                raise CoreNexusAPIError(f"core-nexus 请求失败 HTTP {resp.status_code}: {message}")
            ok = True
            return response_body
        except requests.RequestException as exc:
            response_body = str(exc)
            raise CoreNexusAPIError(f"core-nexus 连接失败: {exc}") from exc
        finally:
            self._log_request(
                timestamp=datetime.now().strftime("%H:%M:%S"),
                method=method.upper(),
                url=url,
                endpoint=endpoint,
                params=query or {},
                request_headers=headers,
                request_body=body or {},
                status_code=status_code or 0,
                duration_ms=int((time.perf_counter() - started) * 1000),
                response_body=response_body,
                ok=ok,
            )

    def _unwrap(self, payload: Any) -> Any:
        if isinstance(payload, dict) and "code" in payload and "data" in payload:
            code = payload.get("code")
            if code not in (0, "0", None):
                message = self._extract_error_message(payload) or "core-nexus 返回业务错误"
                raise CoreNexusAPIError(message)
            return payload.get("data")
        return payload

    def _resolve_default_tenant_id(self, user: Optional[Dict[str, Any]]) -> Optional[str]:
        if not user:
            return None
        direct = user.get("tenantId") or user.get("tenant_id")
        if direct:
            return str(direct)
        tenants = user.get("tenants")
        if isinstance(tenants, list):
            enabled = [t for t in tenants if isinstance(t, dict) and t.get("status") not in ("DISABLED", "DELETED")]
            default = next((t for t in enabled if t.get("isDefault") or t.get("is_default")), None)
            candidate = default or (enabled[0] if enabled else None)
            if candidate:
                return str(candidate.get("tenantId") or candidate.get("tenant_id") or candidate.get("id") or "") or None
        memberships = user.get("memberships")
        if isinstance(memberships, list):
            enabled = [m for m in memberships if isinstance(m, dict) and m.get("status") in (None, "ENABLED")]
            default = next((m for m in enabled if m.get("isDefault") or m.get("is_default")), None)
            candidate = default or (enabled[0] if enabled else None)
            if candidate:
                tenant_obj = candidate.get("tenant") if isinstance(candidate.get("tenant"), dict) else {}
                return str(candidate.get("tenantId") or candidate.get("tenant_id") or tenant_obj.get("id") or "") or None
        return None

    def _extract_tenants(self, user: Optional[Dict[str, Any]]) -> Optional[List[Dict[str, Any]]]:
        if not user:
            return None
        tenants = user.get("tenants")
        if isinstance(tenants, list):
            return [t for t in tenants if isinstance(t, dict)]
        memberships = user.get("memberships")
        if isinstance(memberships, list):
            result: List[Dict[str, Any]] = []
            for item in memberships:
                if not isinstance(item, dict):
                    continue
                tenant = item.get("tenant") if isinstance(item.get("tenant"), dict) else {}
                tenant_id = item.get("tenantId") or item.get("tenant_id") or tenant.get("id")
                if tenant_id:
                    result.append(
                        {
                            "tenantId": tenant_id,
                            "tenantName": tenant.get("name") or item.get("tenantName") or item.get("name") or str(tenant_id),
                            "isDefault": bool(item.get("isDefault") or item.get("is_default")),
                            "status": item.get("status"),
                        }
                    )
            return result or None
        return None

    def _compact_log_value(self, value: Any, *, max_items: int = 20, max_text: int = 4000, depth: int = 0) -> Any:
        """Return a GUI-log-safe copy of request/response payloads.

        只压缩接口详情日志里的大字段，不影响真实业务请求和响应数据。
        """
        if depth >= 4:
            text = str(value)
            return text if len(text) <= max_text else text[:max_text] + f"... [truncated {len(text) - max_text} chars]"
        if isinstance(value, dict):
            heavy_keys = {"config", "runtimeConfig", "runtime_config", "raw", "rawData", "raw_data", "cookies", "sessionData", "session_data"}
            compact: Dict[str, Any] = {}
            for key, item in value.items():
                if str(key) in heavy_keys:
                    try:
                        raw_text = json.dumps(item, ensure_ascii=False)
                    except Exception:
                        raw_text = str(item)
                    compact[key] = f"[omitted large field: {len(raw_text)} chars]"
                else:
                    compact[key] = self._compact_log_value(item, max_items=max_items, max_text=max_text, depth=depth + 1)
            return compact
        if isinstance(value, list):
            result = [self._compact_log_value(item, max_items=max_items, max_text=max_text, depth=depth + 1) for item in value[:max_items]]
            if len(value) > max_items:
                result.append({"_truncated": f"{len(value) - max_items} more items"})
            return result
        if isinstance(value, str):
            return value if len(value) <= max_text else value[:max_text] + f"... [truncated {len(value) - max_text} chars]"
        return value

    def _log_request(self, **entry: Any) -> None:
        if not self.request_logger:
            return
        safe_headers = dict(entry.get("request_headers") or {})
        if "Authorization" in safe_headers:
            safe_headers["Authorization"] = "Bearer ***"
        safe_body = entry.get("request_body") or {}
        if isinstance(safe_body, dict) and "password" in safe_body:
            safe_body = dict(safe_body)
            safe_body["password"] = "***"
        safe_body = self._compact_log_value(safe_body)
        safe_response = self._compact_log_value(entry.get("response_body"))

        def pretty(value: Any, max_chars: int = 30000) -> str:
            try:
                if isinstance(value, str):
                    text = value
                else:
                    text = json.dumps(value if value is not None else {}, ensure_ascii=False, indent=2)
            except Exception:
                text = str(value)
            return text if len(text) <= max_chars else text[:max_chars] + f"\n... [truncated {len(text) - max_chars} chars for GUI log]"

        self.request_logger(
            {
                **entry,
                "request_headers": safe_headers,
                "request_body": safe_body,
                "response_body": safe_response,
                "request_body_pretty": pretty(safe_body),
                "response_body_pretty": pretty(safe_response),
            }
        )


def to_core_platform(platform: str) -> str:
    return (platform or "").strip().upper()


def from_core_platform(platform: str) -> str:
    return (platform or "").strip().lower()


def save_session(path: Path, session: CoreNexusSession) -> Path:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(session.to_dict(), ensure_ascii=False, indent=2), encoding="utf-8")
    return path


def load_session(path: Path) -> CoreNexusSession:
    data = json.loads(path.read_text(encoding="utf-8"))
    session = CoreNexusSession.from_dict(data)
    if not session.base_url or not session.access_token:
        raise CoreNexusAPIError("登录缓存文件缺少 base_url 或 access_token")
    return session
