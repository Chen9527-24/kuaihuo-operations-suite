from __future__ import annotations

import json
import random
import re
from typing import Any

from PySide6.QtCore import QTimer

from app.services.dm_reply.utils import build_aggregate_signature, build_draft_cache_key
from app.platforms.douyin.common.js_scripts import (
    build_dm_open_session_script,
    build_dm_reply_precheck_script,
    build_dm_unread_light_probe_script,
    build_dm_scroll_list_script,
    build_dm_send_reply_script,
    build_dm_stage_reply_script,
)


class SessionControllerDMRuntimeGateMixin:
    def _cleanup_dm_runtime_state(self) -> None:
                now_ms = self._now_ms()
                for key, expires_at in list(self.dm_session_cooldowns.items()):
                    if int(expires_at or 0) <= now_ms:
                        self.dm_session_cooldowns.pop(key, None)
                for key, payload in list(self.dm_session_locks.items()):
                    started_at = int((payload or {}).get("startedAt", 0) or 0)
                    if started_at and now_ms - started_at >= 45_000:
                        self.dm_session_locks.pop(key, None)

    def _acquire_dm_session_lock(self, selected_key: str, reply_token: str, stage: str) -> bool:
                if not selected_key:
                    return True
                self._cleanup_dm_runtime_state()
                existing = self.dm_session_locks.get(selected_key) or {}
                existing_token = str(existing.get("replyToken", "") or "")
                if existing_token and reply_token and existing_token != reply_token:
                    return False
                self.dm_session_locks[selected_key] = {
                    "replyToken": reply_token,
                    "stage": stage,
                    "startedAt": self._now_ms(),
                }
                return True

    def _release_dm_session_lock(self, selected_key: str, reply_token: str = "") -> None:
                if not selected_key:
                    return
                existing = self.dm_session_locks.get(selected_key) or {}
                existing_token = str(existing.get("replyToken", "") or "")
                if reply_token and existing_token and existing_token != reply_token:
                    return
                self.dm_session_locks.pop(selected_key, None)

    def _has_dm_session_lock(self, selected_key: str, reply_token: str = "") -> bool:
                if not selected_key:
                    return False
                self._cleanup_dm_runtime_state()
                existing = self.dm_session_locks.get(selected_key) or {}
                existing_token = str(existing.get("replyToken", "") or "")
                if reply_token and existing_token and existing_token != reply_token:
                    return False
                return bool(existing)

    def _should_emit_dm_inspect_snapshot(self, signature: str, now_ms: int, *, min_interval_ms: int = 2200) -> bool:
                last_signature = str(getattr(self, "dm_last_inspect_log_signature", "") or "")
                last_logged_ms = int(getattr(self, "dm_last_inspect_log_ms", 0) or 0)
                if signature == last_signature and now_ms - last_logged_ms < min_interval_ms:
                    return False
                self.dm_last_inspect_log_signature = signature
                self.dm_last_inspect_log_ms = now_ms
                return True

    def _should_emit_dm_inspect_details(self, signature: str, now_ms: int, *, min_interval_ms: int = 5000) -> bool:
                last_signature = str(getattr(self, "dm_last_inspect_detail_signature", "") or "")
                last_logged_ms = int(getattr(self, "dm_last_inspect_detail_ms", 0) or 0)
                if signature == last_signature and now_ms - last_logged_ms < min_interval_ms:
                    return False
                self.dm_last_inspect_detail_signature = signature
                self.dm_last_inspect_detail_ms = now_ms
                return True

    def _dm_has_active_work(self) -> bool:
        """是否存在需要高频巡检保护的 DM 工作。"""
        try:
            draft_running = bool(self.dm_pending_draft_future and not self.dm_pending_draft_future.done())
        except Exception:
            draft_running = bool(getattr(self, "dm_pending_draft_future", None))
        opened_unreplied = set(getattr(self, "dm_opened_unreplied_keys", set()) or set())
        if opened_unreplied:
            finalized_keys = set(getattr(self, "dm_skipped_keys", set()) or set()) | set(getattr(self, "dm_processed_keys", set()) or set())
            stale_keys = opened_unreplied & finalized_keys
            if stale_keys:
                try:
                    self.dm_opened_unreplied_keys.difference_update(stale_keys)
                except Exception:
                    pass
                opened_unreplied.difference_update(stale_keys)
        return bool(
            getattr(self, "dm_pending_open_key", "")
            or opened_unreplied
            or getattr(self, "dm_pending_reply_meta", {})
            or getattr(self, "dm_pending_stage_payload", None)
            or getattr(self, "dm_pending_send_payload", None)
            or getattr(self, "dm_pending_delivery_sequence", None)
            or getattr(self, "dm_reply_aggregate_window", None)
            or getattr(self, "dm_inflight_reply_tokens", set())
            or draft_running
        )

    def _dm_result_has_unread(self, result: dict[str, Any]) -> bool:
        counts = result.get("counts", {}) or {}
        return bool(counts.get("unreadCandidates", len(result.get("unreadCandidates", []) or [])) > 0)

    def _dm_completed_all_sub_tabs(self) -> bool:
        completed = getattr(self, "dm_completed_sub_tabs", set()) or set()
        return all(tab in completed for tab in ("朋友私信", "陌生人私信", "群消息"))

    def _next_dm_idle_scan_interval_ms(self) -> int:
        """返回本轮空闲扫描间隔；默认 40s~90s 随机，避免多账号同频唤醒。"""
        min_ms = int(getattr(self, "dm_idle_scan_min_interval_ms", 40000) or 40000)
        max_ms = int(getattr(self, "dm_idle_scan_max_interval_ms", 90000) or 90000)
        min_ms = max(40000, min_ms)
        max_ms = max(min_ms, max_ms)
        try:
            value = random.randint(min_ms, max_ms)
        except Exception:
            value = min_ms
        self.dm_idle_scan_interval_ms = value
        return value

    def _dm_debug_verbose_enabled(self) -> bool:
        return bool(getattr(self, "dm_debug_verbose", False))

    def _set_dm_scan_mode(self, mode: str, *, reason: str = "") -> None:
        if mode not in {"active", "tab", "idle"}:
            mode = "active"
        previous = str(getattr(self, "dm_scan_mode", "active") or "active")
        if mode == "active":
            interval = int(getattr(self, "dm_active_scan_interval_ms", 1200) or 1200)
        elif mode == "tab":
            interval = int(getattr(self, "dm_tab_scan_interval_ms", 3000) or 3000)
        else:
            interval = self._next_dm_idle_scan_interval_ms()
        self.dm_scan_mode = mode
        self.inspect_interval_ms = interval
        if previous != mode:
            payload = {"from": previous, "to": mode, "intervalMs": interval, "reason": reason or None}
            self._log("INFO", f"私信巡检模式切换: {json.dumps(payload, ensure_ascii=False)}")

    def _update_dm_scan_mode_from_result(self, result: dict[str, Any], *, reason: str = "inspect") -> str:
        if not self.dm_startup_gate_released:
            self._set_dm_scan_mode("active", reason=f"{reason}:startup")
            return "active"
        if self._dm_has_active_work() or self._dm_result_has_unread(result):
            self._set_dm_scan_mode("active", reason=f"{reason}:active_work_or_unread")
            return "active"
        active_tab = ""
        try:
            active_tab = self._active_dm_tab_text(result) if hasattr(self, "_active_dm_tab_text") else ""
        except Exception:
            active_tab = ""
        if active_tab in {"朋友私信", "陌生人私信", "群消息"} and self._dm_completed_all_sub_tabs():
            self._set_dm_scan_mode("idle", reason=f"{reason}:all_tabs_completed")
            return "idle"
        if active_tab in {"朋友私信", "陌生人私信", "群消息"}:
            self._set_dm_scan_mode("tab", reason=f"{reason}:sub_tab_scan")
            return "tab"
        self._set_dm_scan_mode("active", reason=f"{reason}:aggregate_or_unknown")
        return "active"

    def _maybe_log_dm_idle_heartbeat(self, queue_summary: dict[str, Any], summary: dict[str, Any]) -> None:
        now_ms = self._now_ms()
        self.dm_idle_heartbeat_count = int(getattr(self, "dm_idle_heartbeat_count", 0) or 0) + 1
        every_n = max(1, int(getattr(self, "dm_idle_log_every_n", 10) or 10))
        interval_ms = int(getattr(self, "dm_idle_heartbeat_interval_ms", 60000) or 60000)
        last_ms = int(getattr(self, "dm_last_idle_heartbeat_ms", 0) or 0)
        if self.dm_idle_heartbeat_count % every_n != 0 and now_ms - last_ms < interval_ms:
            return
        self.dm_last_idle_heartbeat_ms = now_ms
        payload = {
            "activeTab": queue_summary.get("activeTab"),
            "processed": queue_summary.get("processed"),
            "skipped": queue_summary.get("skipped"),
            "pendingOpen": queue_summary.get("pendingOpen"),
            "pendingReply": queue_summary.get("pendingReply"),
            "sessionCandidates": summary.get("sessionCandidates"),
            "unreadCandidates": summary.get("unreadCandidates"),
            "nextScanMs": int(getattr(self, "dm_idle_scan_interval_ms", 40000) or 40000),
        }
        self._log("INFO", f"私信空闲心跳: {json.dumps(payload, ensure_ascii=False)}")

    def _log_dm_inspect(self, result: dict[str, Any]) -> None:
        counts = result.get("counts", {}) or {}
        summary = {
            "tabs": result.get("tabs", {}),
            "leftPanelFound": (result.get("leftPanel", {}) or {}).get("found", False),
            "messagePanelFound": (result.get("messagePanel", {}) or {}).get("found", False),
            "sessionCandidates": counts.get("sessionCandidates", len(result.get("sessionCandidates", []) or [])),
            "unreadCandidates": counts.get("unreadCandidates", len(result.get("unreadCandidates", []) or [])),
            "possibleUnreadCandidates": counts.get("possibleUnreadCandidates", len(result.get("possibleUnreadCandidates", []) or [])),
            "inputCandidates": counts.get("inputCandidates", len(result.get("inputCandidates", []) or [])),
            "sendButtons": counts.get("sendButtons", len(result.get("sendButtons", []) or [])),
            "bubbleCandidates": counts.get("bubbleCandidates", len(result.get("bubbleCandidates", []) or [])),
        }
        unread_summary = {
            "selectedSession": result.get("selectedSession", None),
            "unreadCandidates": (result.get("unreadCandidates", []) or [])[:3],
        }
        active_tab_for_count = ""
        try:
            active_tab_for_count = self._active_dm_tab_text(result) if hasattr(self, "_active_dm_tab_text") else ""
        except Exception:
            active_tab_for_count = ""
        active_processed = 0
        try:
            if hasattr(self, "_dm_processed_bucket"):
                active_processed = len(self._dm_processed_bucket(active_tab_for_count))
        except Exception:
            active_processed = 0
        queue_summary = {
            "processed": int(getattr(self, "dm_processed_confirm_count", len(getattr(self, "dm_processed_message_signatures", set())))),
            "skipped": len(getattr(self, "dm_skipped_keys", set())),
            "activeTab": active_tab_for_count or None,
            "activeTabProcessed": active_processed,
            "seen": len(self.dm_seen_keys),
            "openedUnreplied": len(self.dm_opened_unreplied_keys),
            "pendingReply": list(getattr(self, "dm_pending_reply_meta", {}).keys())[:3],
            "pendingOpen": self.dm_pending_open_key or None,
            "pendingAttempts": self.dm_pending_open_attempts,
            "scanComplete": self.dm_scan_complete,
        }
        mode = self._update_dm_scan_mode_from_result(result)
        now_ms = self._now_ms()
        is_idle = mode == "idle" and not self._dm_result_has_unread(result) and not self._dm_has_active_work()
        if is_idle:
            self._maybe_log_dm_idle_heartbeat(queue_summary, summary)
        else:
            snapshot_signature = json.dumps({
                "summary": summary,
                "selected": self._session_key(result.get("selectedSession") or {}),
                "unreadKeys": [self._session_key(item) for item in (result.get("unreadCandidates", []) or [])[:2]],
                "queue": queue_summary,
            }, ensure_ascii=False, sort_keys=True)
            if self._should_emit_dm_inspect_snapshot(snapshot_signature, now_ms):
                self._log("INFO", f"私信页巡检摘要: {json.dumps(summary, ensure_ascii=False)}")
                self._log("INFO", f"私信页未读/选中摘要: {json.dumps(unread_summary, ensure_ascii=False)}")
                self._log("INFO", f"私信页队列/深扫摘要: {json.dumps(queue_summary, ensure_ascii=False)}")

            left_panel = result.get("leftPanel", {}) or {}
            message_panel = result.get("messagePanel", {}) or {}
            input_summary = {
                "inputs": (result.get("inputCandidates", []) or [])[:2],
                "sendButtons": (result.get("sendButtons", []) or [])[:2],
                "bubbleSamples": (result.get("bubbleCandidates", []) or [])[:4],
            }
            session_samples = (result.get("sessionCandidates", []) or [])[:3]
            detail_signature = json.dumps({
                "leftPanel": {"found": left_panel.get("found", False), "rect": left_panel.get("rect", {}), "scroll": (left_panel.get("scroll", {}) or {})},
                "messagePanel": {"found": message_panel.get("found", False)},
                "inputSummary": input_summary,
                "sessionKeys": [self._session_key(item) for item in session_samples],
            }, ensure_ascii=False, sort_keys=True)
            emit_detail = self._dm_debug_verbose_enabled() or self._dm_result_has_unread(result) or self._dm_has_active_work()
            if emit_detail and self._should_emit_dm_inspect_details(detail_signature, now_ms):
                self._log("INFO", f"私信页容器: {json.dumps({'leftPanel': left_panel, 'messagePanel': message_panel}, ensure_ascii=False)}")
                if session_samples:
                    self._log("INFO", f"私信页会话样本: {json.dumps(session_samples, ensure_ascii=False)}")
                else:
                    debug = result.get("debug", {}) or {}
                    self._log("WARN", f"私信页未提取到会话项，候选容器: {json.dumps(debug.get('leftPanelCandidates', []), ensure_ascii=False)}")
                self._log("INFO", f"私信页输入/消息摘要: {json.dumps(input_summary, ensure_ascii=False)}")

        self._update_dm_startup_gate(result)
        if hasattr(self, "_dm_normalize_non_text_reply_readiness"):
            try:
                normalized = bool(self._dm_normalize_non_text_reply_readiness(result))
                if normalized:
                    reply = result.get("replyReadiness", {}) or {}
                    self._log(
                        "INFO",
                        "私信混合消息已忽略无法识别的非文字项，继续回复有效文字: "
                        + json.dumps({
                            "headerName": reply.get("headerName", ""),
                            "activeTab": reply.get("activeTabText", ""),
                            "aggregatedIncomingText": str(reply.get("aggregatedIncomingText", "") or "")[:160],
                        }, ensure_ascii=False),
                    )
            except Exception as exc:
                self._log("WARN", f"私信非文字混合消息归一化失败，保持原有门禁: {type(exc).__name__}: {str(exc)[:160]}")
        self._log_dm_reply_readiness(result)
        self._confirm_dm_reply_send(result)
        if hasattr(self, "_dm_record_snapshot"):
            self._dm_record_snapshot(result)
        self._drive_dm_queue(result)
        self._maybe_run_dm_reply_precheck(result)

        # 窗口化运行节奏只能限制“下一轮新扫描”，不能插入到已经开始的
        # 私信处理链路中间。此前这里在 _drive_dm_queue 之前记录窗口冷却，
        # 会导致刚打开未读会话后立刻进入 15~30 分钟冷却，聚合等待/生成/发送
        # 无法继续推进，最终触发 pending 超时释放。
        try:
            # 启动预热未释放前不能记录窗口冷却。否则刚登录进入私信页时会先进入
            # dm_window_interval 冷却，首轮未读处理被延后数分钟，表现为页面已有未读但机器人不识别。
            if (
                hasattr(self, "runtime_policy")
                and not self._dm_has_active_work()
                and bool(getattr(self, "dm_startup_gate_released", False))
            ):
                self.runtime_policy.record_dm_scan(had_activity=self._dm_result_has_unread(result))
        except Exception as exc:
            self._log("WARN", f"私信运行节奏记录异常，继续处理队列: {type(exc).__name__}: {exc}")

    def _log_dm_reply_readiness(self, result: dict[str, Any]) -> None:
                reply = result.get("replyReadiness", {}) or {}
                context = result.get("conversationContext", {}) or {}
                if not reply and not context:
                    return
                signature_payload = {
                    "selected": self._session_key(result.get("selectedSession") or {}),
                    "state": reply.get("state", ""),
                    "skipReason": reply.get("skipReason", ""),
                    "latestIncomingText": reply.get("latestIncomingText", ""),
                    "headerName": reply.get("headerName", ""),
                }
                signature = json.dumps(signature_payload, ensure_ascii=False, sort_keys=True)
                if signature == self.dm_last_reply_signature:
                    return
                self.dm_last_reply_signature = signature

                reply_summary = {
                    "canReply": reply.get("canReply", False),
                    "state": reply.get("state", "unknown"),
                    "skipReason": reply.get("skipReason"),
                    "blockPhrase": reply.get("blockPhrase"),
                    "headerName": reply.get("headerName", ""),
                    "selectedNickname": reply.get("selectedNickname", ""),
                    "hasMessagePanel": reply.get("hasMessagePanel", False),
                    "hasInput": reply.get("hasInput", False),
                    "inputEditable": reply.get("inputEditable", False),
                    "hasSendButton": reply.get("hasSendButton", False),
                    "sendButtonEnabledNow": reply.get("sendButtonEnabledNow", False),
                }
                context_summary = {
                    "latestIncomingText": reply.get("latestIncomingText", ""),
                    "latestIncomingStructuredText": reply.get("latestIncomingStructuredText", ""),
                    "conversationType": reply.get("conversationType", "") or context.get("conversationType", ""),
                    "activeTabText": reply.get("activeTabText", "") or context.get("activeTabText", ""),
                    "groupName": reply.get("groupName", "") or context.get("groupName", ""),
                    "groupSenderName": reply.get("groupSenderName", "") or context.get("groupSenderName", ""),
                    "groupMessageText": reply.get("groupMessageText", "") or context.get("groupMessageText", ""),
                    "latestOutgoingText": reply.get("latestOutgoingText", ""),
                    "visibleBubbleSamples": (context.get("visibleBubbleSamples", []) or [])[-4:],
                    "selectedSummary": context.get("selectedSummary", ""),
                }
                self._log("INFO", f"私信页可回复性判定: {json.dumps(reply_summary, ensure_ascii=False)}")
                self._log("INFO", f"私信页上下文摘要: {json.dumps(context_summary, ensure_ascii=False)}")

    def _session_key(self, item: dict[str, Any] | None) -> str:
                if not item:
                    return ""
                base_key = re.sub(r"\s+", " ", str(item.get("sessionKey", "") or "")).strip()
                if base_key:
                    return base_key[:240]
                parts = [
                    str(item.get("nickname", "")).strip(),
                    str(item.get("timeText", "")).strip(),
                    str(item.get("summary", "")).strip(),
                ]
                if not any(parts):
                    parts.append(str(item.get("text", "")).strip())
                normalized: list[str] = []
                seen: set[str] = set()
                for raw_part in parts:
                    part = re.sub(r"\s+", " ", raw_part).strip()
                    if not part:
                        continue
                    part_key = part.lower()
                    if part_key in seen:
                        continue
                    seen.add(part_key)
                    normalized.append(part)
                return " | ".join(normalized[:4]).strip()[:240]

    def _build_dm_startup_gate_log_payload(
                self,
                *,
                elapsed_ms: int,
                session_count: int,
                unread_count: int,
                stable_streak: int,
                left_ready: bool,
                top_keys: list[str],
            ) -> dict[str, Any]:
                return {
                    "elapsedMs": elapsed_ms,
                    "sessionCandidates": session_count,
                    "unreadCandidates": unread_count,
                    "stableStreak": stable_streak,
                    "minWarmupMs": self.dm_startup_min_warmup_ms,
                    "softCapMs": self.dm_startup_soft_cap_ms,
                    "leftPanelReady": left_ready,
                    "topSessions": top_keys[:2],
                }

    def _should_emit_dm_startup_gate_log(self, now_ms: int, payload: dict[str, Any]) -> bool:
                signature_source = {
                    "sessionCandidates": payload.get("sessionCandidates", 0),
                    "unreadCandidates": payload.get("unreadCandidates", 0),
                    "stableStreak": payload.get("stableStreak", 0),
                    "leftPanelReady": bool(payload.get("leftPanelReady", False)),
                    "topSessions": payload.get("topSessions", []) or [],
                }
                signature = json.dumps(signature_source, ensure_ascii=False, sort_keys=True)
                last_signature = str(getattr(self, "dm_startup_last_gate_log_signature", "") or "")
                last_logged_ms = int(getattr(self, "dm_startup_last_gate_log_ms", 0) or 0)
                changed = signature != last_signature
                timed_out = now_ms - last_logged_ms >= 5000
                if not last_signature or changed or timed_out:
                    self.dm_startup_last_gate_log_signature = signature
                    self.dm_startup_last_gate_log_ms = now_ms
                    return True
                return False

    def _update_dm_startup_gate(self, result: dict[str, Any]) -> None:
                if self.current_module != "dm":
                    return
                now_ms = self._now_ms()
                if not self.dm_startup_ready_since_ms:
                    self.dm_startup_ready_since_ms = now_ms
                if self.dm_startup_gate_released:
                    return
                counts = result.get("counts", {}) or {}
                left_panel = result.get("leftPanel", {}) or {}
                left_rect = left_panel.get("rect", {}) or {}
                session_candidates = result.get("sessionCandidates", []) or []
                session_count = counts.get("sessionCandidates", len(session_candidates))
                unread_count = counts.get("unreadCandidates", len(result.get("unreadCandidates", []) or []))
                top_keys: list[str] = []
                for item in session_candidates[:3]:
                    key = self._session_key(item)
                    if key:
                        top_keys.append(key)
                list_signature = f"{session_count}|{unread_count}|{' || '.join(top_keys)}"
                left_ready = bool(
                    left_panel.get("found")
                    and left_rect.get("w", 0) >= 220
                    and left_rect.get("h", 0) >= 280
                    and (left_panel.get("scroll", {}) or {}).get("clientHeight", 0) > 0
                )
                sessions_ready = session_count > 0 and len(top_keys) > 0
                stable_sample = left_ready and sessions_ready
                previous_top_keys = self.dm_startup_last_top_keys[:]
                overlap_count = len(set(top_keys[:2]) & set(previous_top_keys[:2])) if top_keys and previous_top_keys else 0
                if stable_sample:
                    if list_signature and list_signature == self.dm_startup_last_list_signature:
                        self.dm_startup_list_stable_streak += 1
                    elif overlap_count >= 1 and self.dm_startup_list_stable_streak > 0:
                        self.dm_startup_last_list_signature = list_signature
                        self.dm_startup_list_stable_streak = max(1, self.dm_startup_list_stable_streak)
                    else:
                        self.dm_startup_last_list_signature = list_signature
                        self.dm_startup_list_stable_streak = 1
                else:
                    self.dm_startup_last_list_signature = list_signature
                    if self.dm_startup_list_stable_streak > 0:
                        self.dm_startup_list_stable_streak = max(0, self.dm_startup_list_stable_streak - 1)
                    else:
                        self.dm_startup_list_stable_streak = 0
                self.dm_startup_last_top_keys = top_keys[:3]

                elapsed_ms = now_ms - self.dm_startup_ready_since_ms
                release_reason = ""
                if stable_sample and elapsed_ms >= self.dm_startup_min_warmup_ms and self.dm_startup_list_stable_streak >= 3:
                    release_reason = "stable_session_list"
                elif stable_sample and elapsed_ms >= self.dm_startup_soft_cap_ms:
                    release_reason = "soft_cap_with_sessions"
                elif elapsed_ms >= self.dm_startup_hard_cap_ms and (left_ready or sessions_ready):
                    release_reason = "hard_cap_release"

                if release_reason:
                    self.dm_startup_gate_released = True
                    self._emit_phase_observation("warmup", "released", {"reason": release_reason, "elapsedMs": elapsed_ms, "stableStreak": self.dm_startup_list_stable_streak, "unreadCandidates": unread_count}, force=True)
                    self._log(
                        "INFO",
                        f"私信启动预热完成，放行首轮未读处理。{json.dumps({'reason': release_reason, 'elapsedMs': elapsed_ms, 'sessionCandidates': session_count, 'unreadCandidates': unread_count, 'stableStreak': self.dm_startup_list_stable_streak, 'minWarmupMs': self.dm_startup_min_warmup_ms, 'softCapMs': self.dm_startup_soft_cap_ms, 'topSessions': top_keys[:2]}, ensure_ascii=False)}",
                    )
                    return

                if stable_sample and now_ms - self.dm_startup_last_fast_probe_request_ms >= self.dm_startup_fast_probe_interval_ms:
                    self.dm_startup_last_fast_probe_request_ms = now_ms
                    self._schedule_fast_dm_inspect(900)

                payload = self._build_dm_startup_gate_log_payload(
                    elapsed_ms=elapsed_ms,
                    session_count=session_count,
                    unread_count=unread_count,
                    stable_streak=self.dm_startup_list_stable_streak,
                    left_ready=left_ready,
                    top_keys=top_keys,
                )
                if self._should_emit_dm_startup_gate_log(now_ms, payload):
                    self._emit_phase_observation("warmup", "waiting", {"elapsedMs": elapsed_ms, "stableStreak": self.dm_startup_list_stable_streak, "unreadCandidates": unread_count}, min_interval_ms=2500)
                    self._log("INFO", f"私信启动预热中，暂缓首轮未读处理。{json.dumps(payload, ensure_ascii=False)}")

    def _dm_light_probe_current_open_is_trusted(self, result: dict[str, Any], current_conversation: dict[str, Any], current_signature: str) -> tuple[bool, str]:
        if not current_signature:
            return False, "signature_empty"
        if not hasattr(self, "_is_dm_message_signature_finalized"):
            return False, "signature_api_missing"
        if self._is_dm_message_signature_finalized(current_signature):
            return False, "signature_finalized"
        if current_signature in getattr(self, "dm_pending_message_signatures", set()):
            return False, "signature_pending"
        active_tab = str(result.get("activeTabText", "") or current_conversation.get("activeTabText", "") or "").strip()
        if active_tab not in {"朋友私信", "陌生人私信", "群消息"}:
            return False, "not_sub_tab"
        now_ms = self._now_ms()
        last_switch_ms = int(getattr(self, "dm_last_sub_tab_switch_ms", 0) or 0)
        cooldown_ms = int(getattr(self, "DM_CURRENT_OPEN_TAB_SWITCH_COOLDOWN_MS", 2800) or 2800)
        if last_switch_ms and now_ms - last_switch_ms < cooldown_ms:
            return False, "tab_switch_cooling"
        selected_key = str(current_conversation.get("selectedSessionKey", "") or "").strip()
        selected_name = str(current_conversation.get("selectedNickname", "") or "").strip()
        header_name = str(current_conversation.get("groupName") or current_conversation.get("headerName") or "").strip()
        selected_active = bool(current_conversation.get("selectedSessionSelected"))
        if not selected_key or not selected_active:
            return False, "selected_missing_or_inactive"
        if not header_name or not selected_name or header_name != selected_name:
            return False, "selected_header_mismatch"
        message_text = str(current_conversation.get("groupMessageText") or current_conversation.get("latestIncomingText") or "").strip()
        if not message_text:
            return False, "incoming_empty"
        return True, "ok"

    def _get_dm_next_inspect_timer(self) -> QTimer:
        timer = getattr(self, "dm_next_inspect_timer", None)
        if timer is None:
            timer = QTimer(self)
            timer.setSingleShot(True)
            timer.timeout.connect(self._fire_scheduled_dm_inspect)
            self.dm_next_inspect_timer = timer
        return timer

    def _fire_scheduled_dm_inspect(self) -> None:
        if not self.running or not self.ready or self.current_module != "dm":
            return
        try:
            if hasattr(self, "_runtime_policy_hard_sleep_remaining_ms"):
                remaining_ms = int(self._runtime_policy_hard_sleep_remaining_ms() or 0)
                if remaining_ms > 0:
                    if hasattr(self, "_prepare_dm_for_hard_sleep"):
                        self._prepare_dm_for_hard_sleep(remaining_ms=remaining_ms)
                    return
        except Exception:
            pass
        if self.busy:
            return
        now_ms = self._now_ms()
        if str(getattr(self, "dm_scan_mode", "active") or "active") == "idle" and not self._dm_has_active_work():
            last_actual = int(getattr(self, "dm_last_actual_inspect_ms", 0) or 0)
            idle_interval = int(getattr(self, "dm_idle_scan_interval_ms", 40000) or 40000)
            if last_actual and now_ms - last_actual < idle_interval:
                remaining = max(250, idle_interval - (now_ms - last_actual))
                self._schedule_fast_dm_inspect(remaining)
                return
        self.last_inspect_started_ms = 0
        self._inspect_current_module()

    def _start_dm_idle_light_probe(self, *, reason: str = "idle_wakeup") -> bool:
        """空闲态先做轻量 unread 检测；无未读则不进入完整巡检。"""
        if not self.running or not self.ready or self.current_module != "dm" or not self.page:
            return False
        try:
            if hasattr(self, "_runtime_policy_hard_sleep_remaining_ms"):
                remaining_ms = int(self._runtime_policy_hard_sleep_remaining_ms() or 0)
                if remaining_ms > 0:
                    if hasattr(self, "_prepare_dm_for_hard_sleep"):
                        self._prepare_dm_for_hard_sleep(remaining_ms=remaining_ms)
                    return True
        except Exception:
            pass
        if str(getattr(self, "dm_scan_mode", "active") or "active") != "idle":
            return False
        if self._dm_has_active_work():
            return False
        self.busy = True
        now_ms = self._now_ms()
        self.last_inspect_started_ms = now_ms
        self.dm_last_actual_inspect_ms = now_ms
        try:
            self.page.runJavaScript(build_dm_unread_light_probe_script(), self._handle_dm_idle_light_probe_result)
            return True
        except Exception as exc:
            self.busy = False
            self._log("WARN", f"私信空闲轻量检测启动失败，回退完整巡检: {type(exc).__name__}: {exc}")
            return False

    def _handle_dm_idle_light_probe_result(self, result: Any) -> None:
        self.busy = False
        result = self._coerce_js_result(result)
        now_ms = self._now_ms()
        if not isinstance(result, dict) or result.get("ok") is False:
            self._log("WARN", f"私信空闲轻量检测失败: {str((result or {}).get('error') if isinstance(result, dict) else result)[:300]}")
            self._set_dm_scan_mode("idle", reason="idle_light_probe_failed")
            return
        unread_count = int(result.get("unreadCount", 0) or 0)
        current_conversation = result.get("currentConversation", {}) or {}
        current_signature = ""
        try:
            if current_conversation.get("latestIncomingText") and hasattr(self, "_dm_incoming_message_signature"):
                current_signature = self._dm_incoming_message_signature(current_conversation, {"sessionKey": current_conversation.get("selectedSessionKey", ""), "nickname": current_conversation.get("selectedNickname", "")}, str(result.get("activeTabText", "") or ""))
        except Exception:
            current_signature = ""
        trusted_current_open = False
        current_reject_reason = ""
        try:
            trusted_current_open, current_reject_reason = self._dm_light_probe_current_open_is_trusted(result, current_conversation, current_signature)
        except Exception as exc:
            trusted_current_open, current_reject_reason = False, f"gate_error:{type(exc).__name__}"
        current_new_incoming = bool(current_signature and trusted_current_open)
        if unread_count > 0 or current_new_incoming:
            payload = {
                "activeTab": result.get("activeTabText"),
                "unreadCount": unread_count,
                "unreadSamples": result.get("unreadCandidates", [])[:3],
                "currentIncoming": {
                    "detected": current_new_incoming,
                    "headerName": current_conversation.get("headerName", ""),
                    "conversationType": current_conversation.get("conversationType", ""),
                    "groupName": current_conversation.get("groupName", ""),
                    "senderName": current_conversation.get("groupSenderName", ""),
                    "latestIncomingText": str(current_conversation.get("groupMessageText") or current_conversation.get("latestIncomingText") or "")[:80],
                    "rejectReason": current_reject_reason if not current_new_incoming else "",
                },
            }
            reason = "idle_light_current_incoming_found" if current_new_incoming and unread_count <= 0 else "idle_light_unread_found"
            self._log("INFO", f"私信空闲轻量检测发现待处理消息，切回完整巡检: {json.dumps(payload, ensure_ascii=False)}")
            self._set_dm_scan_mode("active", reason=reason)
            self.last_inspect_started_ms = 0
            self._schedule_fast_dm_inspect(0)
            return
        # 无未读、当前打开会话也无新增入站：保持 idle，不做完整 DOM 巡检。下一次间隔重新随机。
        self._set_dm_scan_mode("idle", reason="idle_light_no_unread")
        heartbeat_interval = int(getattr(self, "dm_idle_heartbeat_interval_ms", 90000) or 90000)
        last_ms = int(getattr(self, "dm_last_idle_heartbeat_ms", 0) or 0)
        if now_ms - last_ms >= heartbeat_interval:
            self.dm_last_idle_heartbeat_ms = now_ms
            payload = {
                "activeTab": result.get("activeTabText"),
                "processed": int(getattr(self, "dm_processed_confirm_count", len(getattr(self, "dm_processed_message_signatures", set())))),
                "skipped": len(getattr(self, "dm_skipped_keys", set())),
                "pending": 0,
                "sessionCandidates": result.get("sessionCandidates"),
                "unreadCandidates": 0,
                "nextScanMs": int(getattr(self, "dm_idle_scan_interval_ms", 40000) or 40000),
            }
            self._log("INFO", f"私信空闲心跳: {json.dumps(payload, ensure_ascii=False)}")

    def _schedule_fast_dm_inspect(self, delay_ms: int = 1200) -> None:
        if not self.running or not self.ready or self.current_module != "dm":
            return
        requested_delay = max(0, int(delay_ms or 0))
        mode = str(getattr(self, "dm_scan_mode", "active") or "active")
        if mode == "idle" and not self._dm_has_active_work():
            requested_delay = max(requested_delay, int(getattr(self, "dm_idle_scan_interval_ms", 40000) or 40000))
        elif mode == "tab" and not self._dm_has_active_work():
            requested_delay = max(requested_delay, int(getattr(self, "dm_tab_scan_interval_ms", 3000) or 3000))
        timer = self._get_dm_next_inspect_timer()
        if timer.isActive():
            timer.stop()
        timer.start(requested_delay)

    def _update_dm_seen_keys(self, result: dict[str, Any]) -> None:
                for item in (result.get("sessionCandidates", []) or []):
                    key = self._session_key(item)
                    if key:
                        self.dm_seen_keys.add(key)
