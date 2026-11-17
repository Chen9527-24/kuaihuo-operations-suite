from __future__ import annotations

from datetime import datetime
import json
import time
import uuid
from typing import Any, Callable
from urllib.request import Request, urlopen
from urllib.error import HTTPError, URLError

from .runtime import WeChatVideoRuntime


class WeChatVideoApiClient:
    def __init__(
        self,
        runtime: WeChatVideoRuntime,
        log=None,
        *,
        request_logger: Callable[[dict[str, Any]], None] | None = None,
        robot_id: str = "",
        robot_name: str = "",
    ) -> None:
        self.runtime = runtime
        self.log = log
        self.request_logger = request_logger
        self.robot_id = robot_id
        self.robot_name = robot_name
        self.poll_cookie_by_tab: dict[str, str] = {}
        if runtime.dm_message_cookie:
            self.poll_cookie_by_tab["私信"] = runtime.dm_message_cookie
            self.poll_cookie_by_tab["打招呼消息"] = runtime.dm_message_cookie

    def _log(self, level: str, message: str) -> None:
        if self.log:
            self.log(level, message)

    def _is_valid_message_cursor(self, value: Any) -> bool:
        text = str(value or "").strip()
        if not text or text == "CgAKAA==":
            return False
        return len(text) > 10

    def post(self, path: str, body: dict[str, Any], *, timeout: float = 18.0, is_write: bool = False) -> dict[str, Any]:
        payload = {**body, **self.runtime.base_body()}
        url = self.runtime.build_url(path)
        raw = json.dumps(payload, ensure_ascii=False).encode("utf-8")
        headers = self.runtime.headers(is_write=is_write)
        attempts = 1 if is_write else 3
        last_error: Exception | None = None
        response_status = 0
        response_body: Any = None
        for attempt in range(attempts):
            started = time.perf_counter()
            req = Request(url, data=raw, headers=headers, method="POST")
            try:
                with urlopen(req, timeout=timeout) as resp:
                    text = resp.read().decode("utf-8", errors="ignore")
                    duration = int((time.perf_counter() - started) * 1000)
                    response_status = int(getattr(resp, "status", 0) or 0)
                    data = json.loads(text) if text else {}
                    response_body = data
                    code = data.get("errCode", data.get("errcode", 0)) if isinstance(data, dict) else 0
                    self._log_request(
                        method="POST",
                        url=url,
                        endpoint=path,
                        request_headers=headers,
                        request_body=payload,
                        status_code=response_status,
                        duration_ms=duration,
                        response_body=data,
                        ok=(response_status < 400 and int(code or 0) == 0),
                    )
                    self._log("INFO", f"视频号接口 {path} status={response_status} errCode={code} duration={duration}ms")
                    return data if isinstance(data, dict) else {"data": data}
            except (HTTPError, URLError, TimeoutError, json.JSONDecodeError) as exc:
                duration = int((time.perf_counter() - started) * 1000)
                last_error = exc
                response_status = int(getattr(exc, "code", 0) or response_status or 0)
                response_body = str(exc)
                self._log_request(
                    method="POST",
                    url=url,
                    endpoint=path,
                    request_headers=headers,
                    request_body=payload,
                    status_code=response_status,
                    duration_ms=duration,
                    response_body=response_body,
                    ok=False,
                )
                self._log("WARN", f"视频号接口 {path} 第 {attempt+1}/{attempts} 次失败：{type(exc).__name__}: {str(exc)[:160]}")
                if attempt + 1 < attempts:
                    time.sleep(0.8 * (attempt + 1))
        raise RuntimeError(f"视频号接口 {path} 调用失败：{last_error}")

    def _mask_headers(self, headers: dict[str, Any]) -> dict[str, Any]:
        safe = dict(headers or {})
        if safe.get("Cookie"):
            safe["Cookie"] = "***"
        for key in list(safe.keys()):
            if key.lower() in {"authorization", "x-wechat-uin"}:
                safe[key] = "***"
        return safe

    def _pretty(self, value: Any) -> str:
        try:
            if isinstance(value, str):
                return value
            return json.dumps(value if value is not None else {}, ensure_ascii=False, indent=2)
        except Exception:
            return str(value)

    def _log_request(
        self,
        *,
        method: str,
        url: str,
        endpoint: str,
        request_headers: dict[str, Any],
        request_body: Any,
        status_code: int,
        duration_ms: int,
        response_body: Any,
        ok: bool,
    ) -> None:
        if not self.request_logger:
            return
        entry = {
            "timestamp": datetime.now().strftime("%H:%M:%S"),
            "method": method.upper(),
            "url": url,
            "endpoint": f"wechat_video/{endpoint}",
            "params": {},
            "request_headers": self._mask_headers(request_headers),
            "request_body": request_body,
            "status_code": status_code,
            "duration_ms": duration_ms,
            "response_body": response_body,
            "ok": bool(ok),
            "robot_id": self.robot_id,
            "robot_name": self.robot_name,
            "platform": "WECHAT_VIDEO",
            "source": "wechat_video_api",
            "request_body_pretty": self._pretty(request_body),
            "response_body_pretty": self._pretty(response_body),
        }
        self.request_logger(entry)

    def ensure_success(self, res: dict[str, Any], path: str) -> None:
        code = int(res.get("errCode") or res.get("errcode") or 0)
        if code != 0:
            err_msg = str(res.get("errMsg") or res.get("errmsg") or res.get("message") or "")
            raise RuntimeError(f"视频号接口异常：{path} errCode={code} errMsg={err_msg[:180]}")

    def list_posts(self, userpage_type: int, *, page_size: int = 10) -> list[dict[str, Any]]:
        all_items: list[dict[str, Any]] = []
        last_buff = ""
        for _ in range(10):
            res = self.post("post/post_list", {
                "pageSize": page_size,
                "onlyUnread": False,
                "needAllCommentCount": True,
                "userpageType": userpage_type,
                "forMcn": False,
                "lastBuff": last_buff,
            })
            data = res.get("data") if isinstance(res.get("data"), dict) else {}
            items = data.get("list") if isinstance(data.get("list"), list) else []
            all_items.extend(item for item in items if isinstance(item, dict))
            if not data.get("continueFlag") or not data.get("lastBuff"):
                break
            last_buff = str(data.get("lastBuff") or "")
            time.sleep(1.0)
        return all_items

    def list_comments(self, export_id: str) -> list[dict[str, Any]]:
        all_items: list[dict[str, Any]] = []
        last_buff = ""
        for _ in range(20):
            res = self.post("comment/comment_list", {
                "exportId": export_id,
                "lastBuff": last_buff,
                "opType": 1,
            })
            data = res.get("data") if isinstance(res.get("data"), dict) else {}
            items = data.get("comment") if isinstance(data.get("comment"), list) else []
            all_items.extend(item for item in items if isinstance(item, dict))
            if not data.get("lastBuff") or data.get("downContinueFlag") == 0:
                break
            last_buff = str(data.get("lastBuff") or "")
            time.sleep(1.0)
        return all_items

    def reply_comment(self, *, export_id: str, root_comment_id: str, reply_comment_id: str, content: str, target_comment_raw: dict[str, Any]) -> dict[str, Any]:
        import uuid
        return self.post("comment/create_comment", {
            "replyCommentId": reply_comment_id,
            "rootCommentId": root_comment_id,
            "content": content,
            "clientId": str(uuid.uuid4()),
            "comment": target_comment_raw,
            "exportId": export_id,
        }, is_write=True)

    def poll_private_messages(self, tab: str = "私信") -> list[dict[str, Any]]:
        """Poll new private messages with the real channels get-new-msg payload.

        The request body cookie is not the browser cookie. It is the message cursor
        returned by data.cookie and must be carried across polling rounds.
        """
        path = "private-msg/get-new-msg"
        cursor = str(self.poll_cookie_by_tab.get(tab) or self.runtime.dm_message_cookie or "")
        if not self._is_valid_message_cursor(cursor):
            self._log("INFO", f"视频号私信接口轮询等待页面真实游标，跳过空/默认游标：tab={tab} cursor={cursor or '-'}")
            return []
        res = self.post(path, {"cookie": cursor}, timeout=18.0)
        self.ensure_success(res, path)
        data = res.get("data") if isinstance(res.get("data"), dict) else {}
        next_cookie = data.get("cookie") if isinstance(data.get("cookie"), str) else ""
        if self._is_valid_message_cursor(next_cookie):
            self.poll_cookie_by_tab[tab] = next_cookie
            self.runtime.dm_message_cookie = next_cookie
        items = data.get("msg") if isinstance(data.get("msg"), list) else []
        messages = [item for item in items if isinstance(item, dict)]
        session_ids = []
        for item in messages:
            sid = str(item.get("sessionId") or "").strip()
            if sid and sid not in session_ids:
                session_ids.append(sid)
        if session_ids:
            session_info = self.get_session_info(session_ids)
            for item in messages:
                sid = str(item.get("sessionId") or "").strip()
                if sid in session_info:
                    item["_sessionInfo"] = session_info[sid]
        return messages

    def get_session_info(self, session_ids: list[str]) -> dict[str, dict[str, Any]]:
        ids = [str(item).strip() for item in session_ids if str(item).strip()]
        ids = list(dict.fromkeys(ids))[:50]
        if not ids:
            return {}
        path = "private-msg/get-session-info"
        res = self.post(path, {"sessionId": ids}, timeout=18.0)
        self.ensure_success(res, path)
        data = res.get("data") if isinstance(res.get("data"), dict) else {}
        items = data.get("sessionInfo") if isinstance(data.get("sessionInfo"), list) else []
        out: dict[str, dict[str, Any]] = {}
        for item in items:
            if isinstance(item, dict) and item.get("sessionId"):
                out[str(item.get("sessionId"))] = item
        return out

    def send_private_message(self, *, session_id: str, to_username: str, content: str) -> dict[str, Any]:
        client_message_id = str(uuid.uuid4())
        body = {
            "msgPack": {
                "sessionId": session_id,
                "fromUsername": self.runtime.finder_username,
                "toUsername": to_username,
                "msgType": 1,
                "textMsg": {"content": content},
                "cliMsgId": client_message_id,
            }
        }
        result = self.post("private-msg/send-private-msg", body, timeout=18.0, is_write=True)
        if isinstance(result, dict):
            result = dict(result)
            result["_clientMessageId"] = client_message_id
        return result
