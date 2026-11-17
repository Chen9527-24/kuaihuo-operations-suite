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


class SessionControllerStateProbeGapHelpersMixin:
    def _build_synthetic_meta_probe_result(self, detail: dict[str, Any] | None = None) -> dict[str, Any] | None:
                if self.page is None:
                    return None
                cached = self.state_probe_last_good_result if isinstance(self.state_probe_last_good_result, dict) else {}
                url = self.page.url().toString() if self.page else ""
                title = self.page.title() if self.page else ""
                storage_keys = cached.get("storageKeys", []) if isinstance(cached.get("storageKeys", []), list) else []
                mutation_count = cached.get("mutationCount", 0) if isinstance(cached.get("mutationCount", 0), int) else 0
                recent_mutation_ms = cached.get("recentMutationMs")
                return {
                    "ok": True,
                    "phase": "meta_synthetic",
                    "url": url,
                    "title": title,
                    "storageKeys": storage_keys[:20],
                    "mutationCount": mutation_count,
                    "recentMutationMs": recent_mutation_ms,
                    "domBusy": False,
                    "synthetic": True,
                    "syntheticReason": str((detail or {}).get("rawType", "meta_non_dict") or "meta_non_dict"),
                }

    def _note_state_probe_gap(self, kind: str, detail: dict[str, Any] | None = None) -> dict[str, Any]:
                gap = self._current_probe_gap_snapshot(kind, detail)
                self.state_probe_recent_gap_count += 1
                prev_gap_kind = self.state_probe_last_gap_kind
                self.state_probe_last_gap_kind = str(gap.get("kind", kind))
                now_ms = self._now_ms()
                should_log = now_ms - self.state_probe_last_gap_logged_ms >= 1200 or prev_gap_kind != str(gap.get("kind", kind))
                if should_log:
                    self.state_probe_last_gap_logged_ms = now_ms
                    preview = {
                        "kind": gap.get("kind"),
                        "reason": gap.get("reason"),
                        "detail": (detail or {}),
                        "cacheTtlMs": self.state_probe_gap_cache_ttl_ms,
                    }
                    self._log("WARN", f"页面状态探测空返回分类: {json.dumps(preview, ensure_ascii=False)}")
                return gap

    def _classify_state_probe_gap(self, kind: str, detail: dict[str, Any] | None = None) -> tuple[str, str]:
                detail = detail or {}
                if kind == "meta_non_dict":
                    return "js_return_null", "meta 分段返回非字典"
                if kind == "dom_non_dict":
                    return "js_return_null", "dom 分段返回非字典"
                if kind == "merge_empty":
                    meta_ok = bool(detail.get("metaOk", False))
                    dom_ok = bool(detail.get("domOk", False))
                    if meta_ok and dom_ok:
                        return "probe_merge_empty", "meta/dom 均返回但合并后为空"
                    if not meta_ok and dom_ok:
                        return "meta_phase_error", "meta 分段失败后导致合并为空"
                    if meta_ok and not dom_ok:
                        return "dom_phase_error", "dom 分段失败后导致合并为空"
                    return "probe_both_phase_error", "meta/dom 分段均失败后导致合并为空"
                if kind == "page_missing_after_meta":
                    return "page_unavailable", "meta 返回后页面对象已不可用"
                if kind == "plain_text_fallback":
                    return "plain_text_fallback", "结构化探测未成功，已降级为纯文本判定"
                if kind == "url_fallback":
                    return "url_only_fallback", "结构化与纯文本探测均未成功，已降级为 URL 判定"
                return kind, str(detail.get("reason") or kind)

    def _current_probe_gap_snapshot(self, kind: str, detail: dict[str, Any] | None = None) -> dict[str, Any]:
                gap_code, gap_reason = self._classify_state_probe_gap(kind, detail)
                return {
                    "kind": gap_code,
                    "reason": gap_reason,
                    "detail": detail or {},
                    "recentCount": self.state_probe_recent_gap_count + 1,
                }

    def _maybe_reuse_recent_state_snapshot(self, gap: dict[str, Any]) -> dict[str, Any] | None:
                now_ms = self._now_ms()
                cached = self.state_probe_last_good_result
                if not isinstance(cached, dict):
                    return None
                age_ms = now_ms - self.state_probe_last_good_ms
                if age_ms < 0 or age_ms > self.state_probe_gap_cache_ttl_ms:
                    return None
                if self.page is None:
                    return None
                url = self.page.url().toString()
                if not url or url.startswith("about:"):
                    return None
                cached_url = str(cached.get("url", ""))
                if cached_url and url and cached_url != url and self._is_target_url(url) != self._is_target_url(cached_url):
                    return None
                reused = dict(cached)
                reused["ok"] = False
                reused["url"] = url or cached_url
                reused["title"] = self.page.title() or str(cached.get("title", ""))
                reused["probeGap"] = {**gap, "usedRecentSnapshot": True, "snapshotAgeMs": age_ms}
                return reused

    def _handle_state_probe_gap(self, kind: str, detail: dict[str, Any] | None = None, *, fallback_mode: str = "plain_text") -> None:
                if self.page is None:
                    self.busy = False
                    self._process_state_result(self._fallback_state_result(kind=kind, detail=detail))
                    return
                gap = self._note_state_probe_gap(kind, detail)
                reused = self._maybe_reuse_recent_state_snapshot(gap)
                if reused is not None:
                    self.busy = False
                    self._process_state_result(reused)
                    return
                if fallback_mode == "plain_text":
                    self.page.toPlainText(lambda text, _gap=gap: self._handle_plain_text_probe(text, _gap))
                    return
                self.busy = False
                self._process_state_result(self._fallback_state_result(kind=kind, detail=detail))

    def _handle_plain_text_probe(self, text: str, gap: dict[str, Any] | None = None) -> None:
                self.busy = False
                normalized = re.sub(r"\s+", " ", text or "").strip()
                ready_hints = DM_READY_HINTS if self.current_module == "dm" else COMMENT_READY_HINTS
                ready_hits = [k for k in ready_hints if k in normalized]
                login_hits = [k for k in LOGIN_HINTS if k in normalized or k in (self.page.title() if self.page else "")]
                url = self.page.url().toString() if self.page else ""
                title = self.page.title() if self.page else ""

                status = "unknown"
                if ready_hits:
                    status = "module_ready"
                elif self._has_confirmed_auth() and self._is_home_url(url):
                    status = "module_redirect_home"
                elif self._has_confirmed_auth() and self._is_target_url(url):
                    status = "module_target_loading"
                elif self._has_confirmed_auth() and "creator.douyin.com" in url:
                    status = "module_unknown_inside_creator"
                elif login_hits:
                    status = "login_wait"
                elif self._is_home_url(url):
                    status = "module_redirect_home"
                elif self._is_target_url(url):
                    status = "module_target_loading"
                elif "creator.douyin.com" in url:
                    status = "module_unknown_inside_creator"

                gap = gap or self._current_probe_gap_snapshot("plain_text_fallback", {"status": status})
                self._log(
                    "WARN",
                    f"页面状态探测返回为空，已使用纯文本回退判定。当前 URL={url}，title={title}，status={status}，gapKind={gap.get('kind', '')}",
                )
                self._process_state_result(
                    {
                        "ok": False,
                        "status": status,
                        "url": url,
                        "title": title,
                        "readyHits": ready_hits,
                        "loginHits": login_hits,
                        "sample": normalized[:300],
                        "probeGap": {**gap, "usedPlainTextFallback": True},
                    }
                )
