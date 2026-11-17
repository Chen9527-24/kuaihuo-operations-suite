from __future__ import annotations

import json
from typing import Any


class SessionControllerStatePhaseMergeMixin:
    def _emit_phase_observation(
                self,
                phase: str,
                state: str,
                payload: dict[str, Any] | None = None,
                *,
                level: str = "INFO",
                force: bool = False,
                min_interval_ms: int = 0,
            ) -> None:
                payload = payload or {}
                normalized = {str(k): payload[k] for k in sorted(payload.keys())}
                payload_signature = json.dumps(normalized, ensure_ascii=False, sort_keys=True)
                now_ms = self._now_ms()
                same_phase = self.observe_phase_current == phase and self.observe_phase_state == state
                same_payload = self.observe_phase_last_payload_signature == payload_signature
                elapsed_ms = now_ms - int(self.observe_phase_last_logged_ms or 0)
                if not force and same_phase and same_payload:
                    if min_interval_ms <= 0 or elapsed_ms < min_interval_ms:
                        return
                self.observe_phase_current = phase
                self.observe_phase_state = state
                self.observe_phase_last_payload_signature = payload_signature
                self.observe_phase_last_logged_ms = now_ms
                body = {"phase": phase, "state": state}
                body.update(normalized)
                self._log(level, f"阶段观测: {json.dumps(body, ensure_ascii=False)}")

    def _merge_legacy_ready_audit(self, base: dict[str, Any], legacy: dict[str, Any]) -> dict[str, Any]:
                merged = dict(base or {})
                legacy_ready_hits = list(legacy.get("readyHits", []) or [])
                legacy_status = str(legacy.get("status", ""))
                legacy_roots = legacy.get("targetRoots", []) or []
                legacy_found_roots = [item for item in legacy_roots if isinstance(item, dict) and item.get("found")]
                promoted = bool(legacy_ready_hits) or (legacy_status == "module_ready" and bool(legacy_found_roots))
                if promoted:
                    ready_hits = list(merged.get("readyHits", []) or [])
                    ready_hits.extend(hit for hit in legacy_ready_hits if hit)
                    ready_hits.append("legacy_ready_audit")
                    merged["readyHits"] = list(dict.fromkeys(ready_hits))
                    merged["status"] = "module_ready"
                    target_roots = list(merged.get("targetRoots", []) or [])
                    existing = {str(item.get("selector", "")) for item in target_roots if isinstance(item, dict)}
                    for item in legacy_roots:
                        if not isinstance(item, dict):
                            continue
                        selector = str(item.get("selector", ""))
                        if selector and selector not in existing:
                            target_roots.append(item)
                            existing.add(selector)
                    merged["targetRoots"] = target_roots
                    phases = dict(merged.get("probePhases", {}) or {})
                    phases["legacyReadyAudit"] = True
                    phases["legacyReadyHits"] = legacy_ready_hits
                    phases["legacyStatus"] = legacy_status
                    merged["probePhases"] = phases
                    self._log("DEBUG", f"页面状态探测 legacy ready audit 命中，提升为 module_ready。{json.dumps({'legacyReadyHits': legacy_ready_hits, 'legacyStatus': legacy_status}, ensure_ascii=False)}")
                    return merged
                phases = dict(merged.get("probePhases", {}) or {})
                phases["legacyReadyAudit"] = True
                phases["legacyReadyHits"] = legacy_ready_hits
                phases["legacyStatus"] = legacy_status
                merged["probePhases"] = phases
                return merged

    def _merge_state_probe_results(self, meta: dict[str, Any], dom: dict[str, Any]) -> dict[str, Any] | None:
                if not isinstance(meta, dict) or not isinstance(dom, dict):
                    return None
                url = str(meta.get("url", self.page.url().toString() if self.page else ""))
                title = str(meta.get("title", self.page.title() if self.page else ""))
                ready_hits = dom.get("readyHits", []) or []
                login_hits = dom.get("loginHits", []) or []
                login_ui_visible = bool(dom.get("loginUiVisible", False))
                login_text_nodes = dom.get("loginTextNodes", []) or []
                qr_candidates = dom.get("qrCandidates", []) or []
                target_roots = dom.get("targetRoots", []) or []
                found_target_roots = [item for item in target_roots if isinstance(item, dict) and item.get("found")]
                storage_keys = meta.get("storageKeys", []) or []
                dom_busy = bool(meta.get("domBusy", False))

                synthetic_ready_hits: list[str] = []
                if self._is_target_url(url):
                    root_selectors = {
                        str(item.get("selector", ""))
                        for item in found_target_roots
                        if isinstance(item, dict) and item.get("selector")
                    }
                    if self.current_module == "dm":
                        dm_ready_roots = {
                            ".list-zrsZ82",
                            ".box-container-yGo0TJ",
                            ".chat-editor-X6QnIU",
                            ".container-_r15W6.chat-container-heHrxU",
                        }
                        if root_selectors & dm_ready_roots:
                            synthetic_ready_hits.append("dm_root_ready")
                    elif self.current_module == "comment":
                        comment_ready_roots = {
                            ".container-AFENbv",
                            ".container-sXKyMs",
                            ".operations-WFV7Am .item-M3fSkJ",
                            ".footer-oZJTJd button",
                            ".input-d24X73[contenteditable='true']",
                        }
                        if root_selectors & comment_ready_roots:
                            synthetic_ready_hits.append("comment_root_ready")
                if self.current_module == "dm":
                    dom_phase = str(dom.get("phase", "") or "")
                    sample = str(dom.get("sample", "") or "")
                    target_root_selectors = {
                        str(item.get("selector", ""))
                        for item in found_target_roots
                        if isinstance(item, dict) and item.get("selector")
                    }
                    if not synthetic_ready_hits and target_root_selectors and any(sel in target_root_selectors for sel in {".list-zrsZ82", ".box-container-yGo0TJ", ".chat-editor-X6QnIU", ".container-_r15W6.chat-container-heHrxU"}):
                        synthetic_ready_hits.append("dm_root_ready")
                    if not synthetic_ready_hits and sample and any(hint in sample for hint in ["朋友私信", "陌生人私信", "群消息"]):
                        synthetic_ready_hits.append("dm_hint_text_ready")
                    if dom_phase == "dom_minimal" and not synthetic_ready_hits and found_target_roots and sample:
                        synthetic_ready_hits.append("dm_dom_minimal_ready")
                elif self.current_module == "comment":
                    sample = str(dom.get("sample", "") or "")
                    if not synthetic_ready_hits and sample and any(hint in sample for hint in ["评论管理", "选择作品", "最新发布", "回复"]):
                        synthetic_ready_hits.append("comment_hint_text_ready")
                if synthetic_ready_hits:
                    ready_hits = list(dict.fromkeys([*list(ready_hits), *synthetic_ready_hits]))

                status = "unknown"
                if ready_hits:
                    status = "module_ready"
                elif found_target_roots:
                    status = "module_mounting"
                elif login_ui_visible or login_hits:
                    status = "login_wait"
                elif self._is_home_url(url):
                    status = "auth_in_progress" if dom_busy else "module_redirect_home"
                elif self._is_target_url(url):
                    status = "auth_in_progress" if dom_busy else "module_target_loading"
                elif "creator.douyin.com" in url:
                    status = "auth_in_progress" if dom_busy or storage_keys else "module_unknown_inside_creator"
                return {
                    "ok": bool(meta.get("ok", False)) and bool(dom.get("ok", False)),
                    "status": status,
                    "url": url,
                    "title": title,
                    "readyHits": ready_hits,
                    "loginHits": login_hits,
                    "sample": dom.get("sample", ""),
                    "loginUiVisible": login_ui_visible,
                    "loginTextNodes": login_text_nodes,
                    "qrCandidates": qr_candidates,
                    "targetRoots": target_roots,
                    "storageKeys": storage_keys,
                    "mutationCount": meta.get("mutationCount", 0),
                    "recentMutationMs": meta.get("recentMutationMs"),
                    "probePhases": {
                        "metaOk": bool(meta.get("ok", False)),
                        "domOk": bool(dom.get("ok", False)),
                        "metaError": meta.get("error", ""),
                        "domError": dom.get("error", ""),
                    },
                }
