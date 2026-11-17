from __future__ import annotations

import json
from dataclasses import dataclass
from typing import Any, Callable

import requests


@dataclass(slots=True)
class CozeWorkflowResult:
    ok: bool
    text: str = ""
    workflow_id: str = ""
    execute_id: str = ""
    debug_url: str = ""
    error: str = ""
    raw_data: Any = None


class CozeWorkflowClient:
    def __init__(self, config: dict[str, Any], logger: Callable[[str, str], None] | None = None) -> None:
        self.config = config
        self.logger = logger

    def _emit(self, level: str, message: str) -> None:
        if self.logger:
            try:
                self.logger(level, message)
            except Exception:
                pass

    def _normalize(self, value: Any) -> str:
        return " ".join(str(value or "").split()).strip()

    def _parse_json_text(self, value: Any) -> Any:
        if isinstance(value, (dict, list)):
            return value
        if not isinstance(value, str):
            return value
        text = value.strip()
        if not text:
            return value
        try:
            return json.loads(text)
        except Exception:
            return value

    def _get_by_path(self, data: Any, path: tuple[str, ...]) -> Any:
        current = data
        for key in path:
            if not isinstance(current, dict):
                return None
            current = current.get(key)
        return current

    def _extract_first_text(self, data: Any) -> str:
        if isinstance(data, str):
            return self._normalize(data)
        if isinstance(data, list):
            for item in data:
                text = self._extract_first_text(item)
                if text:
                    return text
            return ""
        if not isinstance(data, dict):
            return ""
        preferred_paths = [
            ("output",),
            ("data", "output"),
            ("final_output",),
            ("answer",),
            ("text",),
            ("result",),
            ("content",),
            ("message",),
        ]
        for path in preferred_paths:
            value = self._get_by_path(data, path)
            value = self._parse_json_text(value)
            if isinstance(value, dict) and "reasoning_content" in value and len(value) == 1:
                continue
            text = self._extract_first_text(value)
            if text:
                return text
        for key, value in data.items():
            if str(key) == "reasoning_content":
                continue
            parsed = self._parse_json_text(value)
            text = self._extract_first_text(parsed)
            if text:
                return text
        return ""

    def run_text_workflow(self, prompt_text: str) -> CozeWorkflowResult:
        api_url = self._normalize(self.config.get("api_url", ""))
        workflow_id = self._normalize(self.config.get("workflow_id", ""))
        token = str(self.config.get("token", "") or "").strip()
        if token and not token.lower().startswith('bearer '):
            token = f'Bearer {token}'
        input_key = self._normalize(self.config.get("input_key", "input")) or "input"
        timeout = float(self.config.get("request_timeout_sec", 30.0) or 30.0)
        if not api_url or not workflow_id or not token:
            return CozeWorkflowResult(
                ok=False,
                workflow_id=workflow_id,
                error="Coze 配置不完整，缺少 api_url / workflow_id / token",
            )

        parameters: dict[str, Any] = {}
        extra_parameters = self.config.get("extra_parameters", {})
        if isinstance(extra_parameters, dict):
            parameters.update(extra_parameters)
        parameters[input_key] = prompt_text

        payload: dict[str, Any] = {
            "workflow_id": workflow_id,
            "parameters": parameters,
        }
        app_id = self._normalize(self.config.get("app_id", ""))
        if app_id:
            payload["app_id"] = app_id
        include_bot_id = bool(self.config.get("include_bot_id", False))
        bot_id = self._normalize(self.config.get("bot_id", ""))
        if include_bot_id and bot_id:
            payload["bot_id"] = bot_id
        ext = self.config.get("ext")
        if isinstance(ext, dict) and ext:
            payload["ext"] = ext

        headers = {
            "Authorization": token,
            "Content-Type": "application/json",
        }

        try:
            response = requests.post(api_url, headers=headers, json=payload, timeout=timeout)
            response.raise_for_status()
            response_payload = response.json() if response.content else {}
        except Exception as exc:
            return CozeWorkflowResult(
                ok=False,
                workflow_id=workflow_id,
                error=f"Coze workflow 请求失败: {exc}",
            )

        response_payload = response_payload if isinstance(response_payload, dict) else {}
        code = response_payload.get("code")
        msg = self._normalize(response_payload.get("msg", "") or response_payload.get("message", ""))
        if code not in (None, 0, "0"):
            error = f"Coze workflow 返回失败 code={code}"
            if msg:
                error += f", msg={msg}"
            return CozeWorkflowResult(
                ok=False,
                workflow_id=workflow_id,
                debug_url=self._normalize(response_payload.get("debug_url", "")),
                error=error,
                raw_data=response_payload,
            )

        raw_data = self._parse_json_text(response_payload.get("data"))
        text = self._extract_first_text(raw_data)
        response_data = response_payload.get("data")
        execute_id = self._normalize(response_payload.get("execute_id", ""))
        if not execute_id and isinstance(response_data, dict):
            execute_id = self._normalize(response_data.get("execute_id", ""))
        debug_url = self._normalize(response_payload.get("debug_url", ""))
        if isinstance(raw_data, dict):
            debug_url = debug_url or self._normalize(raw_data.get("debug_url", ""))
            execute_id = execute_id or self._normalize(raw_data.get("execute_id", ""))

        if not text:
            return CozeWorkflowResult(
                ok=False,
                workflow_id=workflow_id,
                execute_id=execute_id,
                debug_url=debug_url,
                error="Coze workflow 返回成功，但未提取到 output 文本",
                raw_data=raw_data,
            )

        return CozeWorkflowResult(
            ok=True,
            text=text,
            workflow_id=workflow_id,
            execute_id=execute_id,
            debug_url=debug_url,
            raw_data=raw_data,
        )
