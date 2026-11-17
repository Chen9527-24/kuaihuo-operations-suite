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


class SessionControllerStateProbeResultMixin:
    def _douyin_login_lost_detected(self, status: str, result: dict[str, Any], url: str) -> bool:
                if status != "login_wait":
                    return False
                if not (bool(getattr(self, "ready", False)) or bool(getattr(self, "auth_confirmed_ms", None))):
                    return False
                login_ui_visible = bool(result.get("loginUiVisible", False))
                login_hits = result.get("loginHits", []) or []
                login_text_nodes = result.get("loginTextNodes", []) or []
                qr_candidates = result.get("qrCandidates", []) or []
                lower_url = str(url or "").lower()
                return bool(login_ui_visible or login_hits or login_text_nodes or qr_candidates or "login" in lower_url or "passport" in lower_url)

    def _enter_douyin_login_wait_guard(self, status: str, result: dict[str, Any], url: str) -> bool:
                if not self._douyin_login_lost_detected(status, result, url):
                    return False
                now_ms = self._now_ms()
                was_ready = bool(getattr(self, "ready", False))
                self.ready = False
                self.busy = False
                self.login_guard_probe_only = False
                self.login_wait_started_ms = now_ms
                self.auth_started_ms = None
                self.module_mount_started_ms = None
                self.auth_confirmed_ms = None
                self.last_auth_cookie_ms = None
                self.auth_cookie_names = []
                self.last_probe_status = "login_wait"
                self.last_wait_log_bucket = -1
                self.state_probe_mount_only_streak = 0
                self._pending_state_meta_result = None
                self._pending_state_meta_gap = None
                self._pending_state_legacy_base_result = None
                try:
                    timer = getattr(self, "dm_next_inspect_timer", None)
                    if timer is not None and timer.isActive():
                        timer.stop()
                except Exception:
                    pass
                # 清理会在未登录阶段导致续跑的业务中间态；不清理已处理去重集合，避免重新登录后重复回复。
                if getattr(self, "current_module", "") == "dm":
                    self.dm_pending_open_key = ""
                    self.dm_pending_open_dom_index = None
                    self.dm_pending_open_attempts = 0
                    self.dm_pending_precheck_signature = ""
                    self.dm_pending_stage_payload = None
                    self.dm_pending_send_payload = None
                    self.dm_pending_delivery_sequence = None
                    self.dm_pending_draft_future = None
                    self.dm_pending_draft_cache_key = ""
                    self.dm_pending_draft_request_signature = ""
                    self.dm_pending_draft_context = None
                    self.dm_reply_aggregate_window = None
                    self.dm_scan_mode = "active"
                elif getattr(self, "current_module", "") == "comment":
                    self.comment_pending_reply_future = None
                    self.comment_pending_reply_signature = ""
                    self.comment_pending_reply_context = None
                    self.comment_preopen_reply_future = None
                    self.comment_preopen_reply_target = None
                    self.comment_preopen_reply_context = None
                    self.comment_pending_stage_payload = None
                    self.comment_pending_send_payload = None
                    self.comment_pending_switch_target = None
                    self.comment_pending_reply_target = None
                    self.comment_active_reply_target = None
                    self.comment_pending_draft_probe_target = None
                self._set_state("待扫码")
                last_log = int(getattr(self, "last_logout_guard_log_ms", 0) or 0)
                if was_ready or now_ms - last_log >= 5000:
                    self.last_logout_guard_log_ms = now_ms
                    self._log("WARN", f"检测到抖音页面已回到登录/扫码状态，暂停业务巡检并等待重新登录：status={status} url={url}")
                return True

    def _comment_force_ready_from_recent_business_dom(self, result: dict[str, Any], status: str, url: str, now_ms: int) -> bool:
                try:
                    if getattr(self, "current_module", "") != "comment":
                        return False
                    if status not in {"module_mounting", "module_target_loading", "module_unknown_inside_creator"}:
                        return False
                    if not self._is_target_url(url):
                        return False
                    if bool(result.get("loginUiVisible", False)) or result.get("loginHits") or result.get("loginTextNodes") or result.get("qrCandidates"):
                        return False
                    checker = getattr(self, "_comment_has_recent_business_dom_ready", None)
                    if not callable(checker) or not checker(now_ms, max_age_ms=180000):
                        return False
                    summary = getattr(self, "comment_last_business_dom_ready_summary", {})
                    if not isinstance(summary, dict):
                        summary = {}
                    result["status"] = "module_ready"
                    ready_hits = list(result.get("readyHits", []) or [])
                    ready_hits.append("recent_comment_business_dom_ready")
                    result["readyHits"] = list(dict.fromkeys(ready_hits))
                    result["commentBusinessReadySummary"] = summary
                    self.module_mount_started_ms = None
                    self.login_wait_started_ms = None
                    self.last_wait_log_bucket = -1
                    last_log = int(getattr(self, "comment_business_ready_force_log_ms", 0) or 0)
                    if now_ms - last_log >= 30000:
                        self.comment_business_ready_force_log_ms = now_ms
                        self._log("INFO", f"评论业务 DOM 仍可读，覆盖状态探测的模块加载判定，继续巡检而不自动停止: {json.dumps({'url': url, 'summary': summary}, ensure_ascii=False)}")
                    return True
                except Exception:
                    return False

    def _process_state_result(self, result: dict[str, Any]) -> None:
                now_ms = self._now_ms()
                status = str(result.get("status", "unknown"))
                url = str(result.get("url", self.page.url().toString() if self.page else ""))
                status = self._normalize_status_with_auth(status, result, url)
                result["status"] = status
                ready_hits = result.get("readyHits", []) or []
                login_hits = result.get("loginHits", []) or []
                probe_only = bool(getattr(self, "login_guard_probe_only", False))
                self.login_guard_probe_only = False
                if self._enter_douyin_login_wait_guard(status, result, url):
                    return
                if self._comment_force_ready_from_recent_business_dom(result, status, url, now_ms):
                    status = "module_ready"
                    ready_hits = result.get("readyHits", []) or []

                if status in {"module_mounting", "module_target_loading", "module_unknown_inside_creator"} and not ready_hits:
                    self.state_probe_mount_only_streak += 1
                else:
                    self.state_probe_mount_only_streak = 0

                probe_gap = result.get("probeGap") if isinstance(result.get("probeGap"), dict) else None
                if probe_gap is None and status != "unknown":
                    self.state_probe_last_good_result = dict(result)
                    self.state_probe_last_good_ms = now_ms
                    self.state_probe_last_gap_kind = ""
                    self.state_probe_recent_gap_count = 0
                elif probe_gap is not None:
                    result["probeGap"] = probe_gap

                if status != self.last_probe_status:
                    self.last_probe_status = status
                    self._log("INFO", f"页面状态更新: {json.dumps(self._state_signal_summary(result), ensure_ascii=False)}")

                mount_elapsed_before_reset = now_ms - (self.module_mount_started_ms or self.auth_started_ms or self.login_wait_started_ms or now_ms)

                if status == "module_ready":
                    if not self.ready:
                        self.ready = True
                        self.state_probe_mount_only_streak = 0
                        self.login_wait_started_ms = None
                        self.auth_started_ms = None
                        self.module_mount_started_ms = None
                        self.last_wait_log_bucket = -1
                        self.home_retry_count = 0
                        if self.current_module == "dm":
                            self.dm_startup_ready_since_ms = now_ms
                            self.dm_startup_gate_released = False
                            self.dm_startup_list_stable_streak = 0
                            self.dm_startup_last_list_signature = ""
                            self.dm_startup_last_gate_log_ms = 0
                            self.dm_startup_last_gate_log_signature = ""
                            self.dm_startup_last_fast_probe_request_ms = 0
                            self.dm_startup_last_top_keys = []
                        self._set_state("运行中")
                        self._emit_phase_observation("ready", "entered", {"module": self.current_module, "readyHits": ready_hits[:4], "url": url}, force=True)
                        self._log("INFO", f"目标模块已就绪，命中锚点: {ready_hits}，当前 URL={url}")
                    if probe_only:
                        return
                    if self.current_module == "comment" and hasattr(self, "_comment_startup_first_cycle_pending") and self._comment_startup_first_cycle_pending():
                        try:
                            hard_ms = self._runtime_policy_hard_sleep_remaining_ms() if hasattr(self, "_runtime_policy_hard_sleep_remaining_ms") else 0
                        except Exception:
                            hard_ms = 0
                        if hard_ms <= 0:
                            # 首轮评论巡检不能被 last_inspect_started_ms 或普通运行窗口等待吞掉。
                            # 直接放行一次真正的业务巡检；执行完成后再恢复原运行节奏。
                            self.last_inspect_started_ms = 0
                            self._inspect_current_module()
                            return
                    if now_ms - self.last_inspect_started_ms >= self.inspect_interval_ms:
                        self.last_inspect_started_ms = now_ms
                        self._inspect_current_module()
                    return

                if self.login_wait_started_ms is None:
                    self.login_wait_started_ms = now_ms
                    self._log("INFO", f"检测到当前尚未进入目标模块，开始等待。当前 URL={url}")

                phase_state = self._derive_wait_state(status)
                if phase_state:
                    self._set_state(phase_state)

                if status == "auth_in_progress" and self.auth_started_ms is None:
                    self.auth_started_ms = now_ms
                    self._log("INFO", f"检测到扫码后的鉴权/跳转信号，开始进入过渡态。信号={json.dumps(self._state_signal_summary(result), ensure_ascii=False)}")
                elif status in {"module_mounting", "module_target_loading", "module_redirect_home", "module_unknown_inside_creator"} and self.module_mount_started_ms is None:
                    self.module_mount_started_ms = now_ms
                    self._log("INFO", f"检测到目标模块开始挂载/跳转。信号={json.dumps(self._state_signal_summary(result), ensure_ascii=False)}")

                elapsed = now_ms - self.login_wait_started_ms
                wait_bucket = elapsed // 10_000
                if wait_bucket != self.last_wait_log_bucket:
                    self.last_wait_log_bucket = wait_bucket
                    summary = self._state_signal_summary(result)
                    if status == "login_wait":
                        self._log("INFO", f"等待扫码/登录中，已等待 {elapsed // 1000}s，信号={json.dumps(summary, ensure_ascii=False)}，当前 URL={url}")
                    elif status == "auth_in_progress":
                        auth_elapsed = now_ms - (self.auth_started_ms or self.login_wait_started_ms)
                        self._log("INFO", f"已扫码，正在鉴权/跳转中，阶段已等待 {auth_elapsed // 1000}s，信号={json.dumps(summary, ensure_ascii=False)}，当前 URL={url}")
                    elif status in {"module_mounting", "module_target_loading", "module_redirect_home", "module_unknown_inside_creator"}:
                        mount_elapsed = now_ms - (self.module_mount_started_ms or self.auth_started_ms or self.login_wait_started_ms)
                        self._log("INFO", f"目标模块挂载中，阶段已等待 {mount_elapsed // 1000}s，信号={json.dumps(summary, ensure_ascii=False)}，当前 URL={url}")
                    else:
                        self._log("INFO", f"等待目标模块就绪中，已等待 {elapsed // 1000}s，状态={status}，信号={json.dumps(summary, ensure_ascii=False)}，当前 URL={url}")

                if self._is_home_url(url):
                    if now_ms - self.last_nav_request_ms >= 4_500 and self.home_retry_count < self.max_home_retries:
                        self.home_retry_count += 1
                        self._log("WARN", f"检测到扫码后落在首页，执行第 {self.home_retry_count} 次目标模块修正跳转。")
                        self._load_target("首页修正")
                elif self._is_target_url(url):
                    mount_elapsed = now_ms - (self.module_mount_started_ms or self.auth_started_ms or self.login_wait_started_ms or now_ms)
                    ready_root_selectors = {
                        str(item.get("selector", ""))
                        for item in (result.get("targetRoots", []) or [])
                        if isinstance(item, dict) and item.get("found")
                    }
                    dm_ready_roots = {
                        ".list-zrsZ82",
                        ".box-container-yGo0TJ",
                        ".chat-editor-X6QnIU",
                        ".container-_r15W6.chat-container-heHrxU",
                    } if self.current_module == "dm" else set()
                    comment_ready_roots = {
                        ".container-AFENbv",
                        ".container-sXKyMs",
                        ".operations-WFV7Am .item-M3fSkJ",
                        ".footer-oZJTJd button",
                        ".input-d24X73[contenteditable='true']",
                    } if self.current_module == "comment" else set()
                    root_ready = bool((ready_root_selectors & dm_ready_roots) or (ready_root_selectors & comment_ready_roots))
                    if not self.ready and status == "module_mounting" and root_ready and mount_elapsed >= 8_000:
                        forced = dict(result)
                        forced["status"] = "module_ready"
                        ready_hits = list((forced.get("readyHits", []) or []))
                        ready_hits.append("mount_timeout_root_ready")
                        forced["readyHits"] = list(dict.fromkeys(ready_hits))
                        self._log("WARN", f"目标模块长时间停留在挂载中，但关键根节点已可见，按降级 ready 放行。阶段={mount_elapsed // 1000}s，当前 URL={url}")
                        self._process_state_result(forced)
                        return
                elif "creator.douyin.com" in url and now_ms - self.last_nav_request_ms >= 10_000 and self.home_retry_count < 1:
                    self.home_retry_count += 1
                    self._log("WARN", f"当前仍在创作者中心但未进入目标模块，尝试一次软修正跳转。当前 URL={url}")
                    self._load_target("软修正")

                if self._has_confirmed_auth() and not self.ready:
                    if self._is_home_url(url):
                        self._reenter_target_after_login("登录后首页回跳")
                    elif status in {"module_target_loading", "module_unknown_inside_creator", "auth_in_progress"}:
                        auth_elapsed = now_ms - (self.auth_confirmed_ms or self.auth_started_ms or self.login_wait_started_ms or now_ms)
                        if auth_elapsed >= 2500:
                            self._reenter_target_after_login(f"登录后目标模块未就绪，status={status}")

                timeout_ms, timeout_phase, phase_elapsed = self._current_wait_timeout(status, result, now_ms)
                if phase_elapsed >= timeout_ms:
                    self._log(
                        "ERROR",
                        f"等待{timeout_phase}超时（阶段 {phase_elapsed // 1000}s / 阈值 {timeout_ms // 1000}s），自动停止该账号会话。最后信号={json.dumps(self._state_signal_summary(result), ensure_ascii=False)}，当前 URL={url}",
                    )
                    self.stop()

    def _fallback_state_result(self, kind: str = "url_fallback", detail: dict[str, Any] | None = None) -> dict[str, Any]:
                url = self.page.url().toString() if self.page else ""
                title = self.page.title() if self.page else ""
                status = "unknown"
                if self._is_home_url(url):
                    status = "module_redirect_home"
                elif self._is_target_url(url):
                    status = "module_target_loading"
                elif "creator.douyin.com" in url:
                    status = "module_unknown_inside_creator"
                gap = self._current_probe_gap_snapshot(kind, detail)
                self._log("WARN", f"页面状态探测返回为空，已使用 URL 回退判定。当前 URL={url}，title={title}，status={status}，gapKind={gap.get('kind', '')}")
                return {
                    "ok": False,
                    "status": status,
                    "url": url,
                    "title": title,
                    "readyHits": [],
                    "loginHits": [],
                    "probeGap": {**gap, "usedUrlFallback": True},
                }
