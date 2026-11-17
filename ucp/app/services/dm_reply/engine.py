from __future__ import annotations

from dataclasses import dataclass
from pathlib import Path
from typing import Any, Callable

from app.services.coze_workflow_client import CozeWorkflowClient

from .config import DEFAULT_DM_REPLY_CONFIG, build_coze_runtime_config, load_dm_reply_config
from .prompting import build_coze_prompt, collect_context, normalize_text, sanitize_model_reply


@dataclass(slots=True)
class DMReplyDecision:
    text: str
    source: str
    model: str = ""
    reason: str = ""
    score: float = 0.0


class DMReplyEngine:
    def __init__(self, data_dir: Path, logger: Callable[[str, str], None] | None = None) -> None:
        self.data_dir = data_dir
        self.logger = logger
        self.config = load_dm_reply_config(data_dir)
        config_source = str(((self.config.get('_meta') or {}).get('config_source', '') or '')).strip()
        if config_source:
            self._emit('INFO', f'私信回复配置加载成功: {config_source}')
        else:
            self._emit('WARN', '私信回复配置未命中显式文件，当前使用默认值/环境变量。')
        self.coze_client = CozeWorkflowClient(build_coze_runtime_config(self.config), logger=self._emit)

    def fallback_text(self) -> str:
        value = normalize_text(self.config.get("fallback_text", DEFAULT_DM_REPLY_CONFIG["fallback_text"]))
        return value or DEFAULT_DM_REPLY_CONFIG["fallback_text"]

    def _build_fallback_decision(self, reason: str) -> DMReplyDecision:
        return DMReplyDecision(text=self.fallback_text(), source="fallback_emoji", reason=reason)

    def _emit(self, level: str, message: str) -> None:
        if self.logger:
            try:
                self.logger(level, message)
            except Exception:
                pass

    def build_reply(
        self,
        reply: dict[str, Any],
        *,
        context: dict[str, Any] | None = None,
        selected: dict[str, Any] | None = None,
        robot_name: str = "",
    ) -> DMReplyDecision:
        context = context or {}
        selected = selected or {}
        context_info = collect_context(reply, context=context, selected=selected)
        if not self.config.get("enabled"):
            return self._build_fallback_decision("engine_disabled")
        if not context_info.get("seed_text"):
            return self._build_fallback_decision("empty_context")
        if not bool((self.config.get("coze") or {}).get("enabled", True)):
            return self._build_fallback_decision("coze_disabled")
        return self._build_coze_reply(reply, context=context, selected=selected, robot_name=robot_name)

    def _build_coze_reply(
        self,
        reply: dict[str, Any],
        *,
        context: dict[str, Any],
        selected: dict[str, Any],
        robot_name: str,
    ) -> DMReplyDecision:
        prompt = build_coze_prompt(self.config, reply, context, selected, robot_name)
        result = self.coze_client.run_text_workflow(prompt)
        if not result.ok:
            if result.error:
                if result.debug_url:
                    self._emit("WARN", f"私信 Coze workflow 调用失败，改走 emoji 兜底: {result.error}，debug_url={result.debug_url}")
                else:
                    self._emit("WARN", f"私信 Coze workflow 调用失败，改走 emoji 兜底: {result.error}")
            return self._build_fallback_decision("coze_failed")
        content = sanitize_model_reply(result.text)
        if not content:
            details = result.debug_url or result.execute_id or "无附加定位信息"
            self._emit("WARN", f"私信 Coze workflow 返回为空或清洗后为空，改走 emoji 兜底: {details}")
            return self._build_fallback_decision("coze_empty")
        reason = "workflow_run"
        if result.execute_id:
            reason = f"workflow_run:{result.execute_id}"
        if result.debug_url:
            self._emit("INFO", f"私信 Coze workflow 调用成功，debug_url={result.debug_url}")
        workflow_id = normalize_text(((self.config.get("coze") or {}).get("workflow_id", "")))
        return DMReplyDecision(
            text=content,
            source="coze_workflow",
            model=workflow_id,
            reason=reason,
        )
