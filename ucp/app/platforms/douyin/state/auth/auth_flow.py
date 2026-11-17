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


class SessionControllerStateAuthFlowMixin:
    def _has_confirmed_auth(self) -> bool:
                return bool(self.auth_confirmed_ms or (set(name.lower() for name in self.auth_cookie_names) & STRONG_AUTH_COOKIE_KEYS))

    def _mark_auth_confirmed(self, reason: str) -> None:
                if self.auth_confirmed_ms is None:
                    self.auth_confirmed_ms = self._now_ms()
                    self._log("INFO", f"确认登录成功信号: {reason}；后续将强制回到目标模块 {self.target_url}")

    def _schedule_post_login_target_reentry(self, reason: str, delay_ms: int = 1200) -> None:
                def _fire() -> None:
                    if not self.running or self.ready:
                        return
                    self._reenter_target_after_login(reason)
                QTimer.singleShot(delay_ms, _fire)

    def _reenter_target_after_login(self, reason: str) -> None:
                if not self.running or not self.page or not self.view:
                    return
                now_ms = self._now_ms()
                if self.post_login_redirect_count >= self.max_post_login_redirects:
                    return
                if now_ms - self.last_post_login_redirect_ms < 3500:
                    return
                self.last_post_login_redirect_ms = now_ms
                self.post_login_redirect_count += 1
                current_url = self.page.url().toString()
                same_target = self._is_target_url(current_url)
                self.last_nav_request_ms = now_ms
                if same_target:
                    self._log("WARN", f"登录已成功但目标模块未就绪，执行第 {self.post_login_redirect_count} 次目标模块强制刷新。原因={reason}，当前 URL={current_url}")
                    self.page.triggerAction(QWebEnginePage.WebAction.ReloadAndBypassCache)
                else:
                    self._log("WARN", f"登录已成功但当前未落在目标模块，执行第 {self.post_login_redirect_count} 次目标模块回跳。原因={reason}，当前 URL={current_url}，目标 URL={self.target_url}")
                    self.view.load(QUrl(self.target_url))
                self.sync_preview(force=True)

    def _normalize_status_with_auth(self, status: str, result: dict[str, Any], url: str) -> str:
                if not self._has_confirmed_auth():
                    return status
                login_ui_visible = bool(result.get("loginUiVisible", False))
                login_text_nodes = result.get("loginTextNodes", []) or []
                qr_count = len(result.get("qrCandidates", []) or [])
                if status == "login_wait" and not login_ui_visible and not login_text_nodes and qr_count == 0:
                    if self._is_home_url(url):
                        return "module_redirect_home"
                    if self._is_target_url(url):
                        return "module_target_loading"
                    if "creator.douyin.com" in url:
                        return "module_unknown_inside_creator"
                    return "auth_in_progress"
                return status

    def _should_suppress_tail_probe_noise(self) -> bool:
                if self.running and not self.stop_in_progress:
                    return False
                return self._now_ms() <= self.stop_quiet_until_ms

    def _should_ignore_probe_callback(self, stage: str) -> bool:
                if not self.stop_in_progress and self.running and self.page is not None:
                    url = self.page.url().toString()
                    if url and not url.startswith("about:"):
                        return False
                reasons: list[str] = []
                if self.stop_in_progress:
                    reasons.append("session_stopping")
                if not self.running:
                    reasons.append("session_not_running")
                if self.page is None:
                    reasons.append("page_missing")
                else:
                    url = self.page.url().toString()
                    if not url:
                        reasons.append("url_empty")
                    elif url.startswith("about:"):
                        reasons.append("about_blank")
                self.busy = False
                if not self._should_suppress_tail_probe_noise():
                    self._log(
                        "INFO",
                        f"页面状态探测回调已忽略: {json.dumps({'stage': stage, 'reasons': reasons}, ensure_ascii=False)}",
                    )
                return True

    def _handle_state_meta_result(self, result: Any) -> None:
                if self._should_ignore_probe_callback("meta"):
                    return
                result = self._coerce_js_result(result)
                if not isinstance(result, dict):
                    detail = {"stage": "meta", "rawType": type(result).__name__, "rawPreview": str(result)[:160]}
                    gap = self._note_state_probe_gap("meta_non_dict", detail)
                    synthetic_meta = self._build_synthetic_meta_probe_result(detail)
                    if synthetic_meta is not None and self.page is not None:
                        self._pending_state_meta_result = synthetic_meta
                        self._pending_state_meta_gap = {**gap, "usedSyntheticMeta": True}
                        self._log(
                            "INFO",
                            f"页面状态探测 meta 分段异常，已使用合成 meta 继续 DOM 探测。{json.dumps({'kind': gap.get('kind', ''), 'reason': gap.get('reason', ''), 'url': synthetic_meta.get('url', ''), 'title': synthetic_meta.get('title', '')}, ensure_ascii=False)}",
                        )
                        self.page.runJavaScript(build_state_dom_probe(self.current_module), self._handle_state_dom_result)
                        return
                    self._handle_state_probe_gap(
                        kind="meta_non_dict",
                        detail=detail,
                        fallback_mode="plain_text",
                    )
                    return
                self._pending_state_meta_result = result
                self._pending_state_meta_gap = None
                if result.get("ok") is False:
                    self._log("WARN", f"页面状态探测 meta 分段失败: {result.get('error', '')}")
                if self.page is None:
                    self.busy = False
                    self._process_state_result(self._fallback_state_result(kind="page_missing_after_meta"))
                    return
                self.page.runJavaScript(build_state_dom_probe(self.current_module), self._handle_state_dom_result)

    def _handle_state_dom_result(self, result: Any) -> None:
                if self._should_ignore_probe_callback("dom"):
                    return
                result = self._coerce_js_result(result)
                meta = self._pending_state_meta_result or {}
                pending_gap = self._pending_state_meta_gap or None
                self._pending_state_meta_result = None
                self._pending_state_meta_gap = None
                if not isinstance(result, dict):
                    self._handle_state_probe_gap(
                        kind="dom_non_dict",
                        detail={"stage": "dom", "rawType": type(result).__name__, "rawPreview": str(result)[:160], "metaOk": bool(meta.get("ok", False))},
                        fallback_mode="plain_text",
                    )
                    return
                if result.get("ok") is False:
                    self._log("WARN", f"页面状态探测 dom 分段失败: {result.get('error', '')}")
                if pending_gap and result.get("ok") is not False:
                    result = dict(result)
                    result.setdefault("probePhases", {})
                    result["probePhases"]["metaGapKind"] = pending_gap.get("kind", "")
                    result["probePhases"]["metaGapReason"] = pending_gap.get("reason", "")
                merged = self._merge_state_probe_results(meta, result)
                if merged is None:
                    self._handle_state_probe_gap(
                        kind="merge_empty",
                        detail={
                            "metaOk": bool(meta.get("ok", False)),
                            "domOk": bool(result.get("ok", False)),
                            "metaError": meta.get("error", ""),
                            "domError": result.get("error", ""),
                            "metaPhase": meta.get("phase", ""),
                            "domPhase": result.get("phase", ""),
                        },
                        fallback_mode="plain_text",
                    )
                    return
                if self._should_run_legacy_ready_audit(merged):
                    self.state_probe_legacy_audit_last_ms = self._now_ms()
                    assert self.page is not None
                    self.page.runJavaScript(build_legacy_ready_audit_probe(self.current_module), self._handle_state_legacy_probe_sidecar)
                self.busy = False
                self._process_state_result(merged)

    def _handle_state_legacy_probe_sidecar(self, result: Any) -> None:
                if self._should_ignore_probe_callback("legacy_audit"):
                    self._pending_state_legacy_base_result = None
                    return
                self._pending_state_legacy_base_result = None
                result = self._coerce_js_result(result)
                if not isinstance(result, dict):
                    raw_text = str(result or "").strip()
                    if self.state_probe_legacy_audit_verbose and raw_text:
                        self._log("DEBUG", f"页面状态探测 legacy ready audit 旁路返回异常，类型={type(result).__name__}，已忽略。")
                    return
                legacy_ready_hits = list(result.get("readyHits", []) or [])
                legacy_status = str(result.get("status", ""))
                legacy_roots = result.get("targetRoots", []) or []
                found_selectors = [
                    str(item.get("selector", ""))
                    for item in legacy_roots
                    if isinstance(item, dict) and item.get("found") and item.get("selector")
                ]
                payload = {
                    "legacyReadyHits": legacy_ready_hits,
                    "legacyStatus": legacy_status,
                    "foundSelectors": found_selectors[:6],
                }
                if self.state_probe_legacy_audit_verbose and (legacy_ready_hits or legacy_status == "module_ready"):
                    self._log("DEBUG", f"页面状态探测 legacy ready audit 旁路命中（不参与主放行）。{json.dumps(payload, ensure_ascii=False)}")

    def _should_run_legacy_ready_audit(self, result: dict[str, Any]) -> bool:
                if self.page is None:
                    return False
                if self.ready:
                    return False
                status = str(result.get("status", ""))
                if status not in {"module_mounting", "module_target_loading", "module_unknown_inside_creator"}:
                    return False
                if result.get("readyHits"):
                    return False
                now_ms = self._now_ms()
                if now_ms - self.state_probe_legacy_audit_last_ms < self.state_probe_legacy_audit_interval_ms:
                    return False
                url = str(result.get("url", self.page.url().toString() if self.page else ""))
                if not self._is_target_url(url):
                    return False
                mount_start = self.module_mount_started_ms or self.login_wait_started_ms or now_ms
                mount_elapsed = now_ms - mount_start
                if mount_elapsed < self.state_probe_legacy_audit_min_mount_ms:
                    return False
                if self.state_probe_mount_only_streak < self.state_probe_legacy_audit_consecutive_mount_required:
                    return False
                roots = result.get("targetRoots", []) or []
                found_roots = [item for item in roots if isinstance(item, dict) and item.get("found")]
                if not found_roots:
                    return False
                root_selectors = {str(item.get("selector", "")) for item in found_roots if isinstance(item, dict) and item.get("selector")}
                if self.current_module == "dm" and root_selectors & {".list-zrsZ82", ".box-container-yGo0TJ", ".chat-editor-X6QnIU", ".container-_r15W6.chat-container-heHrxU"}:
                    return False
                if self.current_module == "comment" and root_selectors & {".container-AFENbv", ".container-sXKyMs", ".operations-WFV7Am .item-M3fSkJ", ".footer-oZJTJd button", ".input-d24X73[contenteditable='true']"}:
                    return False
                phases = dict(result.get("probePhases", {}) or {})
                if phases.get("legacyReadyAudit"):
                    return False
                return True
