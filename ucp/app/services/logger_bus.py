from __future__ import annotations

import re
import time

from PySide6.QtCore import QObject, Signal


class LoggerBus(QObject):
    log_emitted = Signal(str, str, str)  # scope, level, message

    # 正常诊断信息默认不进入 GUI。需要排查时再临时打开代码级诊断/本地日志。
    _DOUYIN_DIAGNOSTIC_PATTERNS = (
        "检测到登录态相关 Cookie 写入",
        "页面状态更新:",
        "COMMENT_TRACE_",
        "开始巡检模块:",
        "私信页巡检摘要:",
        "私信页未读/选中摘要:",
        "私信页队列/深扫摘要:",
        "私信页容器:",
        "私信页会话样本:",
        "私信页输入/消息摘要:",
        "私信页可回复性判定:",
        "私信页上下文摘要:",
        "私信启动预热中",
        "阶段观测:",
        "等待扫码/登录中",
        "目标模块挂载中",
        "检测到目标模块开始挂载/跳转",
        "评论页巡检摘要:",
        "评论页候选摘要:",
        "评论页容器:",
        "评论页评论样本:",
    )

    _NORMAL_DETAIL_PATTERNS = (
        "运行节奏等待中:",
        "视频号评论节奏冷却中",
    )

    def __init__(self, parent=None) -> None:
        super().__init__(parent)
        self._last_visible_at: dict[str, float] = {}

    def emit(self, scope: str, level: str, message: str) -> None:
        normalized_level = str(level or "INFO").upper()
        text = str(message or "")
        normalized = self._normalize(scope, normalized_level, text)
        if normalized is None:
            return
        out_level, out_message = normalized
        self.log_emitted.emit(str(scope or "system"), out_level, out_message)

    def _normalize(self, scope: str, level: str, message: str) -> tuple[str, str] | None:
        scope_text = str(scope or "")
        if level in {"DEBUG", "TRACE"}:
            return None

        if scope_text.startswith("DOUYIN:") and self._is_douyin_diagnostic(level, message):
            return None

        if level == "INFO" and any(pattern in message for pattern in self._NORMAL_DETAIL_PATTERNS):
            # 等待/冷却中这类稳定态日志只保留低频心跳，进入/退出冷却由业务日志单独打印。
            key = f"{scope_text}|{message.split(':', 1)[0]}"
            if not self._allow_rate_limited(key, 60.0):
                return None

        if level == "INFO" and self._is_duplicated_steady_info(scope_text, message):
            return None

        return level, self._truncate_for_gui(message)

    def _is_douyin_diagnostic(self, level: str, message: str) -> bool:
        if any(pattern in message for pattern in self._DOUYIN_DIAGNOSTIC_PATTERNS):
            return True
        if level == "INFO" and ("readyHits" in message or "targetRoots" in message or "storageKeys" in message or "clickTarget" in message):
            return True
        return False

    def _is_duplicated_steady_info(self, scope: str, message: str) -> bool:
        steady_prefixes = (
            "运行节奏等待结束:",
            "进入运行节奏冷却:",
            "视频号评论进入节奏冷却",
        )
        if not message.startswith(steady_prefixes):
            return False
        # 同一机器人同一类稳定态日志 30 秒内只展示一次，减少多账号同时运行时的 UI 压力。
        key = f"{scope}|{message.split(':', 1)[0]}"
        return not self._allow_rate_limited(key, 30.0)

    def _allow_rate_limited(self, key: str, interval_sec: float) -> bool:
        now = time.monotonic()
        last = self._last_visible_at.get(key, 0.0)
        if now - last < interval_sec:
            return False
        self._last_visible_at[key] = now
        if len(self._last_visible_at) > 512:
            cutoff = now - 3600.0
            self._last_visible_at = {k: v for k, v in self._last_visible_at.items() if v >= cutoff}
        return True

    def _truncate_for_gui(self, message: str, limit: int = 1800) -> str:
        text = re.sub(r"\s+", " ", str(message or "")).strip()
        if len(text) <= limit:
            return text
        return text[:limit] + f"...（已截断，原始长度 {len(text)} 字符）"
