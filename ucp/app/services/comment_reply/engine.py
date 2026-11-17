from __future__ import annotations

from dataclasses import dataclass
from pathlib import Path
from typing import Any, Callable

from app.services.coze_workflow_client import CozeWorkflowClient

from .config import build_coze_runtime_config, load_comment_reply_config
from .prompting import build_coze_prompt, collect_comment_context, sanitize_comment_reply


@dataclass(slots=True)
class CommentReplyDecision:
    text: str
    source: str
    model: str
    reason: str


class CommentReplyEngine:
    def __init__(self, data_dir: Path, logger: Callable[[str, str], None] | None = None) -> None:
        self.data_dir = data_dir
        self.logger = logger
        self.config = load_comment_reply_config(data_dir)
        self.coze_client = CozeWorkflowClient(build_coze_runtime_config(self.config), logger=logger)

    def _emit(self, level: str, message: str) -> None:
        if self.logger:
            try:
                self.logger(level, message)
            except Exception:
                pass

    def _fallback(self, reason: str) -> CommentReplyDecision:
        fallback_text = str(self.config.get("fallback_text", "感谢支持呀") or "感谢支持呀").strip()
        return CommentReplyDecision(
            text=fallback_text,
            source="fallback",
            model="static",
            reason=reason,
        )

    def build_reply(self, context: dict[str, Any], *, robot_name: str = "") -> CommentReplyDecision:
        info = collect_comment_context(context)
        if not bool(self.config.get("enabled", True)):
            return self._fallback("engine_disabled")
        if not info.get("comment"):
            return self._fallback("empty_comment")
        if not bool((self.config.get("coze") or {}).get("enabled", True)):
            return self._fallback("coze_disabled")
        prompt = build_coze_prompt(self.config, context, robot_name)
        result = self.coze_client.run_text_workflow(prompt)
        if not result.ok:
            if result.error:
                self._emit("WARN", f"评论 Coze workflow 调用失败，改走兜底回复: {result.error}")
            return self._fallback("coze_failed")
        content = sanitize_comment_reply(result.text)
        if not content:
            return self._fallback("coze_empty")
        if result.debug_url:
            self._emit("INFO", f"评论 Coze workflow 调用成功，debug_url={result.debug_url}")
        workflow_id = str(((self.config.get("coze") or {}).get("workflow_id", "")) or "").strip()
        reason = f"workflow_run:{result.execute_id}" if result.execute_id else "workflow_run"
        return CommentReplyDecision(
            text=content,
            source="coze_workflow",
            model=workflow_id,
            reason=reason,
        )
