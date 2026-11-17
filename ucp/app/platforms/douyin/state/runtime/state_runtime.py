from __future__ import annotations

import json
import re
from typing import Any

from PySide6.QtCore import QTimer, QUrl
from PySide6.QtWebEngineCore import QWebEnginePage

from app.platforms.douyin.comment.scripts.comment_scripts import build_comment_inspect_script
from app.platforms.douyin.common.js_scripts import (
    COMMENT_READY_HINTS,
    DM_READY_HINTS,
    LOGIN_HINTS,
    build_dm_inspect_script,
    build_legacy_ready_audit_probe,
    build_state_dom_probe,
    build_state_meta_probe,
    build_state_probe,
)
from app.platforms.douyin.common.constants import STRONG_AUTH_COOKIE_KEYS


class SessionControllerStateRuntimeMixin:
    def _derive_wait_state(self, status: str) -> str:
                if status == "login_wait":
                    return "待扫码"
                if status == "auth_in_progress":
                    return "已扫码"
                if status in {"module_mounting", "module_target_loading", "module_redirect_home", "module_unknown_inside_creator"}:
                    return "模块加载中"
                return "启动中"

    def _current_wait_timeout(self, status: str, result: dict[str, Any], now_ms: int) -> tuple[int, str, int]:
                if status == "login_wait":
                    phase_start = self.login_wait_started_ms or now_ms
                    return self.login_timeout_ms, "扫码/登录", now_ms - phase_start

                if status == "auth_in_progress":
                    phase_start = self.auth_started_ms or self.login_wait_started_ms or now_ms
                    timeout_ms = max(self.login_timeout_ms, 90_000)
                    recent_mutation_ms = result.get("recentMutationMs")
                    if isinstance(recent_mutation_ms, (int, float)) and recent_mutation_ms <= 4000:
                        timeout_ms = max(timeout_ms, 120_000)
                    if self.last_auth_cookie_ms and now_ms - self.last_auth_cookie_ms <= 20_000:
                        timeout_ms = max(timeout_ms, 120_000)
                    return timeout_ms, "鉴权/跳转", now_ms - phase_start

                phase_start = self.module_mount_started_ms or self.auth_started_ms or self.login_wait_started_ms or now_ms
                timeout_ms = max(self.login_timeout_ms, 120_000)
                recent_mutation_ms = result.get("recentMutationMs")
                if isinstance(recent_mutation_ms, (int, float)) and recent_mutation_ms <= 4000:
                    timeout_ms = max(timeout_ms, 150_000)
                if self.last_auth_cookie_ms and now_ms - self.last_auth_cookie_ms <= 20_000:
                    timeout_ms = max(timeout_ms, 150_000)
                try:
                    if getattr(self, "current_module", "") == "comment" and callable(getattr(self, "_comment_has_recent_business_dom_ready", None)) and self._comment_has_recent_business_dom_ready(now_ms, max_age_ms=180000):
                        timeout_ms = max(timeout_ms, 240_000)
                        phase_start = now_ms
                except Exception:
                    pass
                return timeout_ms, "模块挂载", now_ms - phase_start

    def _state_signal_summary(self, result: dict[str, Any]) -> dict[str, Any]:
                target_roots = [
                    item.get("selector")
                    for item in (result.get("targetRoots", []) or [])
                    if isinstance(item, dict) and item.get("found")
                ]
                login_text_nodes = [
                    item.get("text", "")
                    for item in (result.get("loginTextNodes", []) or [])[:4]
                    if isinstance(item, dict) and item.get("text")
                ]
                probe_gap = result.get("probeGap") if isinstance(result.get("probeGap"), dict) else None
                summary = {
                    "status": result.get("status", "unknown"),
                    "readyHits": (result.get("readyHits", []) or [])[:4],
                    "loginHits": (result.get("loginHits", []) or [])[:4],
                    "loginUiVisible": bool(result.get("loginUiVisible", False)),
                    "loginTextNodes": login_text_nodes,
                    "qrCount": len(result.get("qrCandidates", []) or []),
                    "targetRoots": target_roots[:6],
                    "storageKeys": (result.get("storageKeys", []) or [])[:6],
                    "recentMutationMs": result.get("recentMutationMs"),
                    "authCookies": self.auth_cookie_names[-6:],
                    "authConfirmed": self._has_confirmed_auth(),
                    "postLoginRedirects": self.post_login_redirect_count,
                }
                if probe_gap:
                    summary["probeGapKind"] = probe_gap.get("kind", "")
                    summary["probeGapReason"] = probe_gap.get("reason", "")
                    summary["probeGapUsedRecentSnapshot"] = bool(probe_gap.get("usedRecentSnapshot", False))
                return summary

    def _cookie_to_text(self, value: Any) -> str:
                try:
                    return bytes(value).decode("utf-8", "ignore")
                except Exception:
                    try:
                        data = value.data() if hasattr(value, "data") else value
                        return bytes(data).decode("utf-8", "ignore")
                    except Exception:
                        return str(value)

    def _on_cookie_added(self, cookie: Any) -> None:
                if not self.running:
                    return
                name = self._cookie_to_text(cookie.name()) if hasattr(cookie, "name") else ""
                domain = self._cookie_to_text(cookie.domain()) if hasattr(cookie, "domain") else ""
                lower_name = name.lower()
                lower_domain = domain.lower()
                if not any(key in lower_domain for key in ("douyin", "bytedance", "toutiao", "ixigua")):
                    return
                if not any(key in lower_name for key in ("passport", "session", "token", "uid", "sid", "csrf", "ttwid", "odin")):
                    return
                now_ms = self._now_ms()
                self.last_auth_cookie_ms = now_ms
                if name and name not in self.auth_cookie_names:
                    self.auth_cookie_names.append(name)
                    self.auth_cookie_names = self.auth_cookie_names[-12:]
                cookie_log_key = f"{name}@{domain}"
                cookie_log_store = getattr(self, "auth_cookie_log_last_ms", None)
                if not isinstance(cookie_log_store, dict):
                    cookie_log_store = {}
                    self.auth_cookie_log_last_ms = cookie_log_store
                last_cookie_log_ms = int(cookie_log_store.get(cookie_log_key, 0) or 0)
                # Cookie writes can fire repeatedly during page boot; log first sighting and then at most once per minute.
                if now_ms - last_cookie_log_ms >= 60000:
                    cookie_log_store[cookie_log_key] = now_ms
                    self._log("INFO", f"检测到登录态相关 Cookie 写入: {json.dumps({'name': name, 'domain': domain, 'recentCookies': self.auth_cookie_names[-6:]}, ensure_ascii=False)}")
                if lower_name in STRONG_AUTH_COOKIE_KEYS:
                    self._mark_auth_confirmed(f"Cookie={name}")
                    self._schedule_post_login_target_reentry(f"强登录 Cookie 写入: {name}", delay_ms=900)

    def _handle_geometry_probe_result(self, result: Any) -> None:
                result = self._coerce_js_result(result)
                if not isinstance(result, dict):
                    self.busy = False
                    self._log("WARN", f"几何探测结果异常，类型={type(result).__name__}，内容片段={str(result)[:240]}")
                    if self.current_module == "comment" and hasattr(self, "_schedule_fast_comment_inspect"):
                        self._schedule_fast_comment_inspect(1500)
                    else:
                        self._schedule_fast_dm_inspect(1500)
                    return
                if not result.get("ok"):
                    self.busy = False
                    self._log("WARN", f"几何探测失败: {result.get('error', '')}")
                    if self.current_module == "comment" and hasattr(self, "_comment_startup_first_cycle_pending") and self._comment_startup_first_cycle_pending() and hasattr(self, "_schedule_fast_comment_inspect"):
                        self._schedule_fast_comment_inspect(1500)
                    return
                if not result.get("geometryReady"):
                    self.busy = False
                    metrics = result.get("metrics", {}) or {}
                    now_ms = self._now_ms()
                    if now_ms - self.last_geometry_not_ready_ms >= 5000:
                        self.last_geometry_not_ready_ms = now_ms
                        compact = {
                            "viewport": metrics.get("viewport", {}),
                            "activePaneRect": metrics.get("activePaneRect", {}),
                            "leftPanelRect": metrics.get("leftPanelRect", {}),
                            "leftPanelClientHeight": metrics.get("leftPanelClientHeight", 0),
                            "leftPanelScrollHeight": metrics.get("leftPanelScrollHeight", 0),
                            "listScrollerClientHeight": metrics.get("listScrollerClientHeight", 0),
                            "listScrollerScrollHeight": metrics.get("listScrollerScrollHeight", 0),
                            "messagePanelRect": metrics.get("messagePanelRect", {}),
                        }
                        self._log("WARN", f"巡检延后：后台工作页几何未就绪，等待稳定后再巡检。{json.dumps(compact, ensure_ascii=False)}")
                    if self.current_module == "comment" and hasattr(self, "_schedule_fast_comment_inspect"):
                        self._schedule_fast_comment_inspect(1500)
                    else:
                        self._schedule_fast_dm_inspect(1500)
                    return
                script = build_dm_inspect_script() if self.current_module == "dm" else build_comment_inspect_script()
                assert self.page is not None
                self.page.runJavaScript(script, self._handle_inspect_result)

    def _handle_inspect_result(self, result: Any) -> None:
                self.busy = False
                result = self._coerce_js_result(result)
                if not isinstance(result, dict):
                    self._log("WARN", f"巡检结果异常，类型={type(result).__name__}，内容片段={str(result)[:400]}")
                    return
                if result.get("ok") is False:
                    self._log("WARN", f"巡检脚本失败: {result.get('error', '')}")
                    if self.current_module == "comment" and hasattr(self, "_comment_startup_first_cycle_pending") and self._comment_startup_first_cycle_pending() and hasattr(self, "_schedule_fast_comment_inspect"):
                        self._schedule_fast_comment_inspect(1500)
                    return
                startup_comment_pending = bool(
                    self.current_module == "comment"
                    and hasattr(self, "_comment_startup_first_cycle_pending")
                    and self._comment_startup_first_cycle_pending()
                )
                try:
                    if self.current_module == "dm":
                        self._collect_dm_pending_draft_result()
                        self._log_dm_inspect(result)
                    else:
                        if startup_comment_pending and hasattr(self, "_comment_startup_data_readiness"):
                            ready, reason, summary = self._comment_startup_data_readiness(result)
                            if not ready:
                                if hasattr(self, "_comment_schedule_startup_data_retry"):
                                    self._comment_schedule_startup_data_retry(reason, summary, delay_ms=1200)
                                return
                        self._log_comment_inspect(result)
                        if startup_comment_pending and hasattr(self, "_comment_startup_first_cycle_can_finish_after_inspect"):
                            if self._comment_startup_first_cycle_can_finish_after_inspect(result):
                                if hasattr(self, "_comment_mark_startup_first_cycle_finished"):
                                    self._comment_mark_startup_first_cycle_finished(result)
                            elif hasattr(self, "_comment_schedule_startup_data_retry"):
                                summary = self._comment_startup_result_summary(result) if hasattr(self, "_comment_startup_result_summary") else {}
                                self._comment_schedule_startup_data_retry("business_scan_not_finished", summary, delay_ms=1200)
                except Exception as exc:
                    self._log("WARN", f"巡检处理异常: {type(exc).__name__}: {exc}")
                    if startup_comment_pending and hasattr(self, "_schedule_fast_comment_inspect"):
                        self._schedule_fast_comment_inspect(1500)
