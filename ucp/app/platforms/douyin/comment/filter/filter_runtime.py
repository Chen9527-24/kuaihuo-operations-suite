from __future__ import annotations

import json
import random
from typing import Any

from PySide6.QtCore import QTimer

from app.platforms.douyin.comment.probe.comment_probe import emit_comment_probe_logs
from app.platforms.douyin.comment.scripts.comment_scripts import (
    build_comment_close_workdrawer_script,
    build_comment_expand_reply_thread_script,
    build_comment_inspect_script,
    build_comment_open_workdrawer_script,
    build_comment_scroll_scan_script,
    build_comment_set_filter_script,
    build_comment_same_work_refresh_script,
)


TRACE_FILTER_RUNTIME = "COMMENT_TRACE_FILTER_RUNTIME_V70"


class SessionControllerCommentFilterMixin:
    def _comment_verbose_logs_enabled(self) -> bool:
                cfg = getattr(self, "comment_runtime_config", None)
                if isinstance(cfg, dict):
                    logging_cfg = cfg.get("logging") if isinstance(cfg.get("logging"), dict) else {}
                    return bool(cfg.get("verboseLogs") or cfg.get("debugLogs") or logging_cfg.get("verbose") or logging_cfg.get("debug"))
                return False

    def _comment_critical_quiet_remaining_ms(self) -> int:
                try:
                    until_ms = int(getattr(self, "comment_critical_quiet_until_ms", 0) or 0)
                    return max(0, until_ms - self._now_ms())
                except Exception:
                    return 0

    def _comment_in_critical_quiet(self) -> bool:
                return self._comment_critical_quiet_remaining_ms() > 0

    def _comment_business_dom_ready_from_result(self, result: dict[str, Any] | None) -> bool:
                try:
                    if not isinstance(result, dict) or not result.get("ok"):
                        return False
                    if str(result.get("module", "") or "") != "comment":
                        return False
                    counts = result.get("counts", {}) if isinstance(result.get("counts"), dict) else {}
                    header = result.get("header", {}) if isinstance(result.get("header"), dict) else {}
                    comment_list = result.get("commentList", {}) if isinstance(result.get("commentList"), dict) else {}
                    work_selector = result.get("workSelector", {}) if isinstance(result.get("workSelector"), dict) else {}
                    comment_filter = result.get("commentFilter", {}) if isinstance(result.get("commentFilter"), dict) else {}
                    top_count = int(counts.get("topComments", 0) or 0)
                    visible_count = int(counts.get("visibleCardCount", 0) or 0)
                    nested_count = int(counts.get("nestedVisibleCards", 0) or 0)
                    if top_count > 0 or visible_count > 0 or nested_count > 0:
                        return True
                    current_filter = str(comment_filter.get("selectedText", "") or "").strip()
                    work_title = str(header.get("currentWorkTitle", "") or "").strip()
                    return bool((header.get("found") or work_selector.get("found")) and comment_list.get("found") and (current_filter or work_title))
                except Exception:
                    return False

    def _comment_note_business_dom_ready(self, result: dict[str, Any] | None) -> None:
                try:
                    if not self._comment_business_dom_ready_from_result(result):
                        return
                    now_ms = self._now_ms()
                    counts = result.get("counts", {}) if isinstance(result, dict) and isinstance(result.get("counts"), dict) else {}
                    header = result.get("header", {}) if isinstance(result, dict) and isinstance(result.get("header"), dict) else {}
                    self.comment_last_business_dom_ready_ms = now_ms
                    self.comment_last_business_dom_ready_summary = {
                        "top": int(counts.get("topComments", 0) or 0),
                        "visible": int(counts.get("visibleCardCount", 0) or 0),
                        "nested": int(counts.get("nestedVisibleCards", 0) or 0),
                        "candidates": int(counts.get("replyCandidates", 0) or 0),
                        "skipped": int(counts.get("replySkipped", 0) or 0),
                        "workTitle": str(header.get("currentWorkTitle", "") or "")[:80],
                        "stage": str(getattr(self, "comment_stage_name", "") or ""),
                    }
                except Exception:
                    return

    def _comment_has_recent_business_dom_ready(self, now_ms: int | None = None, *, max_age_ms: int = 45000) -> bool:
                try:
                    current = int(now_ms if now_ms is not None else self._now_ms())
                    last_ms = int(getattr(self, "comment_last_business_dom_ready_ms", 0) or 0)
                    return bool(last_ms > 0 and current - last_ms <= max(1000, int(max_age_ms or 45000)))
                except Exception:
                    return False

    def _comment_runtime_cooldown_config(self) -> dict[str, Any]:
                config = self.comment_runtime_config if isinstance(getattr(self, "comment_runtime_config", None), dict) else {}
                cooldown_cfg = config.get("cooldown", {}) if isinstance(config.get("cooldown"), dict) else {}
                return cooldown_cfg

    def _comment_runtime_cooldown_has_active_work(self) -> bool:
                stage = str(getattr(self, "comment_stage_name", "") or "")
                active_stages = {
                    "reply_candidate_selected",
                    "reply_editor_opening",
                    "reply_editor_confirmed",
                    "reply_editor_focus_retry",
                    "reply_editor_post_focus_stabilizing",
                    "reply_editor_stable",
                    "reply_editor_ready_for_draft",
                    "reply_draft_inject_probe",
                    "reply_draft_reactivate_probe",
                    "reply_draft_verified",
                    "manual_send_hold",
                    "reply_editor_lost_hold",
                    "reply_editor_lost",
                    "reply_editor_recovering",
                    "work_switch_confirmed",
                    "ensure_unreplied_filter",
                    "await_filtered_list_stable",
                }
                return bool(
                    stage in active_stages
                    or getattr(self, "comment_pending_switch_target", None) is not None
                    or getattr(self, "comment_pending_filter_target", None) is not None
                    or getattr(self, "comment_pending_reply_target", None) is not None
                    or getattr(self, "comment_active_reply_target", None) is not None
                    or getattr(self, "comment_pending_draft_probe_target", None) is not None
                    or getattr(self, "comment_pending_send_payload", None) is not None
                    or getattr(self, "comment_pending_reply_future", None) is not None
                    or getattr(self, "comment_preopen_reply_future", None) is not None
                )

    def _comment_same_work_refresh_config(self) -> dict[str, Any]:
                config = self.comment_runtime_config if isinstance(getattr(self, "comment_runtime_config", None), dict) else {}
                refresh_cfg = config.get("same_work_refresh", {}) if isinstance(config.get("same_work_refresh"), dict) else {}
                return refresh_cfg

    def _comment_same_work_refresh_enabled(self) -> bool:
                cfg = self._comment_same_work_refresh_config()
                return bool(cfg.get("enabled", True))

    def _comment_same_work_refresh_min_interval_ms(self) -> int:
                cfg = self._comment_same_work_refresh_config()
                try:
                    return max(30_000, int(cfg.get("min_interval_ms", 90_000) or 90_000))
                except Exception:
                    return 90_000

    def _comment_same_work_refresh_remaining_ms(self) -> int:
                try:
                    last_ms = int(getattr(self, "comment_same_work_refresh_last_ms", 0) or 0)
                    if last_ms <= 0:
                        return 0
                    elapsed = self._now_ms() - last_ms
                    return max(0, self._comment_same_work_refresh_min_interval_ms() - elapsed)
                except Exception:
                    return 0

    def _comment_same_work_refresh_can_retry_soon(self) -> bool:
                try:
                    return bool(
                        self._comment_same_work_refresh_enabled()
                        and self.running
                        and self.ready
                        and self.current_module == "comment"
                        and self.page
                        and not self._comment_same_work_refresh_has_active_flow()
                    )
                except Exception:
                    return False

    def _comment_update_known_workdrawer_state(self, work_drawer: dict[str, Any] | None) -> None:
                try:
                    if not isinstance(work_drawer, dict) or not work_drawer.get("found"):
                        return
                    items = work_drawer.get("items", []) or []
                    count = int(work_drawer.get("itemCount", len(items)) or len(items) or 0)
                    # Only trust an opened drawer with a concrete item list. This cache is
                    # used to avoid repeatedly opening the drawer for single-work accounts.
                    if count <= 0:
                        return
                    self.comment_known_work_count = count
                    self.comment_known_single_work = bool(count <= 1)
                    self.comment_known_work_count_ms = self._now_ms()
                except Exception:
                    return

    def _comment_known_single_work_recent(self, *, max_age_ms: int = 30 * 60 * 1000) -> bool:
                try:
                    if not bool(getattr(self, "comment_known_single_work", False)):
                        return False
                    ts = int(getattr(self, "comment_known_work_count_ms", 0) or 0)
                    if ts <= 0:
                        return False
                    return self._now_ms() - ts <= max(60_000, int(max_age_ms or 0))
                except Exception:
                    return False

    def _comment_same_work_refresh_wait_until_retry(self, reason: str = "same_work_refresh_min_interval_wait") -> bool:
                try:
                    if not self._comment_same_work_refresh_can_retry_soon():
                        return False
                    remaining_ms = self._comment_same_work_refresh_remaining_ms()
                    if remaining_ms <= 0:
                        return False
                    now_ms = self._now_ms()
                    reason_text = str(reason or "same_work_refresh_min_interval_wait")
                    last_refresh_ms = int(getattr(self, "comment_same_work_refresh_last_ms", 0) or 0)
                    due_ms = last_refresh_ms + self._comment_same_work_refresh_min_interval_ms()
                    existing_due_ms = int(getattr(self, "comment_same_work_refresh_wait_due_ms", 0) or 0)
                    existing_reason = str(getattr(self, "comment_same_work_refresh_wait_reason", "") or "")
                    work_key = str(getattr(self, "comment_current_work_key", "") or "")
                    existing_work_key = str(getattr(self, "comment_same_work_refresh_wait_work_key", "") or "")
                    # D8 used to require "and cooldown_remaining > 0" here. D10
                    # intentionally removes that dependency because follow-up scans may
                    # bypass cooldown while the same refresh wait is still registered.
                    # D10 idempotency: one work + one due time represents one refresh
                    # wait, even when a fast follow-up scan bypasses runtime cooldown or
                    # another caller supplies a different descriptive reason. Do not
                    # re-register timers or emit the same wait line every few seconds.
                    same_wait = bool(
                        getattr(self, "comment_same_work_refresh_due_after_cooldown", False)
                        and existing_due_ms == due_ms
                        and existing_work_key == work_key
                    )
                    if same_wait:
                        last_log_ms = int(getattr(self, "comment_same_work_refresh_wait_last_log_ms", 0) or 0)
                        # Legacy D8 heartbeat: now_ms - last_log_ms >= 30000.
                        # D10 reduces normal-mode wait noise to one line per minute.
                        if now_ms - last_log_ms >= 60000:
                            self.comment_same_work_refresh_wait_last_log_ms = now_ms
                            self._log("INFO", f"评论页当前作品刷新等待中: {json.dumps({'reason': existing_reason or reason_text, 'remainingSec': int((remaining_ms + 999) / 1000), 'workKey': str(getattr(self, 'comment_current_work_key', '') or '')}, ensure_ascii=False)}")
                        return True
                    wait_ms = min(max(remaining_ms + 1200, 1500), self._comment_same_work_refresh_min_interval_ms() + 1500)
                    if hasattr(self, "_comment_enter_runtime_cooldown"):
                        self._comment_enter_runtime_cooldown(reason_text, duration_ms=wait_ms, reset_cycle_on_exit=False)
                    self.comment_same_work_refresh_due_after_cooldown = True
                    self.comment_same_work_refresh_wait_due_ms = due_ms
                    self.comment_same_work_refresh_wait_reason = reason_text
                    self.comment_same_work_refresh_wait_work_key = work_key
                    self.comment_same_work_refresh_wait_last_log_ms = now_ms
                    self._log("INFO", f"评论页当前作品刷新未到最小间隔，短暂等待后重试: {json.dumps({'reason': reason_text, 'remainingSec': int((remaining_ms + 999) / 1000), 'waitSec': round(wait_ms / 1000, 1), 'workKey': str(getattr(self, 'comment_current_work_key', '') or '')}, ensure_ascii=False)}")
                    return True
                except Exception:
                    return False

    def _comment_same_work_refresh_has_active_flow(self) -> bool:
                stage = str(getattr(self, "comment_stage_name", "") or "")
                active_reply_stages = {
                    "reply_candidate_selected",
                    "reply_editor_opening",
                    "reply_editor_confirmed",
                    "reply_editor_focus_retry",
                    "reply_editor_post_focus_stabilizing",
                    "reply_editor_stable",
                    "reply_editor_ready_for_draft",
                    "reply_draft_inject_probe",
                    "reply_draft_reactivate_probe",
                    "reply_draft_verified",
                    "manual_send_hold",
                    "reply_editor_lost_hold",
                    "reply_editor_lost",
                    "reply_editor_recovering",
                    "work_switch_confirmed",
                }
                return bool(
                    self.busy
                    or stage in active_reply_stages
                    or getattr(self, "comment_pending_switch_target", None) is not None
                    or getattr(self, "comment_pending_filter_target", None) is not None
                    or getattr(self, "comment_pending_reply_target", None) is not None
                    or getattr(self, "comment_active_reply_target", None) is not None
                    or getattr(self, "comment_pending_draft_probe_target", None) is not None
                    or getattr(self, "comment_pending_send_payload", None) is not None
                    or getattr(self, "comment_pending_reply_future", None) is not None
                    or getattr(self, "comment_preopen_reply_future", None) is not None
                )

    def _comment_trigger_same_work_refresh(self, result: dict[str, Any] | None = None, *, reason: str = "same_work_refresh") -> bool:
                """Refresh the current Douyin comment page only when the comment flow is idle.

                This is used for the single-work / all-works-completed case: Douyin's
                comment list can stay as the first loaded snapshot if no work switch
                occurs, so a safe page reload is needed before starting the next scan
                round. It deliberately refuses to run while a reply/editor/send flow is
                active, preserving the existing main reply chain.
                """
                if not self._comment_same_work_refresh_enabled():
                    return False
                if not self.running or not self.ready or self.current_module != "comment" or not self.page:
                    return False
                if self._comment_same_work_refresh_has_active_flow():
                    return False
                if hasattr(self, "_comment_critical_quiet_remaining_ms") and int(self._comment_critical_quiet_remaining_ms() or 0) > 0:
                    return False
                if hasattr(self, "_runtime_policy_remaining_ms") and int(self._runtime_policy_remaining_ms() or 0) > 0:
                    return False
                now_ms = self._now_ms()
                last_ms = int(getattr(self, "comment_same_work_refresh_last_ms", 0) or 0)
                min_interval_ms = self._comment_same_work_refresh_min_interval_ms()
                if last_ms and now_ms - last_ms < min_interval_ms:
                    return False
                work_key = self._comment_current_work_key(result) if isinstance(result, dict) else str(getattr(self, "comment_current_work_key", "") or "")
                self.comment_same_work_refresh_last_ms = now_ms
                self.comment_same_work_refresh_pending = True
                self.comment_same_work_refresh_last_work_key = work_key
                self.comment_same_work_refresh_last_reason = str(reason or "same_work_refresh")
                self.comment_same_work_refresh_attempts = int(getattr(self, "comment_same_work_refresh_attempts", 0) or 0) + 1
                self.comment_all_known_works_completed = False
                self.comment_runtime_cooldown_until_ms = 0
                self.comment_runtime_cooldown_reason = ""
                self.comment_runtime_cooldown_reset_cycle_on_exit = False
                self.comment_same_work_refresh_due_after_cooldown = False
                self.comment_same_work_refresh_wait_due_ms = 0
                self.comment_same_work_refresh_wait_reason = ""
                self.comment_same_work_refresh_wait_work_key = ""
                if work_key:
                    try:
                        self.comment_completed_work_keys.discard(work_key)
                    except Exception:
                        pass
                if hasattr(self, "_comment_set_flow_stage"):
                    self._comment_set_flow_stage("await_filtered_list_stable", result if isinstance(result, dict) else None, reset=True, reason=str(reason or "same_work_refresh"))
                payload = {
                    "reason": str(reason or "same_work_refresh"),
                    "attemptNo": self.comment_same_work_refresh_attempts,
                    "workKey": work_key,
                    "minIntervalMs": min_interval_ms,
                }
                self._log("INFO", f"评论页刷新当前作品数据: {json.dumps(payload, ensure_ascii=False)}")
                self.busy = True
                self.page.runJavaScript(
                    build_comment_same_work_refresh_script(str(reason or "same_work_refresh")),
                    self._handle_comment_same_work_refresh_result,
                )

                def _release_refresh_guard() -> None:
                    if not self.running or self.current_module != "comment":
                        return
                    if bool(getattr(self, "comment_same_work_refresh_pending", False)):
                        self.comment_same_work_refresh_pending = False
                        self.busy = False
                        if hasattr(self, "_schedule_fast_comment_inspect"):
                            self._schedule_fast_comment_inspect(2500)
                QTimer.singleShot(6000, _release_refresh_guard)
                return True

    def _handle_comment_same_work_refresh_result(self, result: Any) -> None:
                self.busy = False
                parsed = self._coerce_js_result(result)
                if isinstance(parsed, dict) and parsed.get("ok"):
                    self._log("INFO", f"评论页当前作品刷新动作已执行: {json.dumps(parsed, ensure_ascii=False)}")
                else:
                    self.comment_same_work_refresh_pending = False
                    self._log("WARN", f"评论页当前作品刷新动作未执行: {json.dumps(parsed if isinstance(parsed, dict) else {'raw': str(parsed)[:240]}, ensure_ascii=False)}")
                    if hasattr(self, "_schedule_fast_comment_inspect"):
                        self._schedule_fast_comment_inspect(1800)

    def _comment_maybe_refresh_after_full_cycle_cooldown(self, result: dict[str, Any]) -> bool:
                if not bool(getattr(self, "comment_same_work_refresh_due_after_cooldown", False)):
                    return False
                due_ms = int(getattr(self, "comment_same_work_refresh_wait_due_ms", 0) or 0)
                if due_ms and self._now_ms() < due_ms:
                    return False
                # Keep the due marker until the refresh actually starts. The previous
                # implementation cleared it before _comment_trigger_same_work_refresh;
                # when an active reply flow temporarily blocked the refresh, the next
                # scan registered the same wait again and produced dozens of duplicate
                # cooldown/log entries.
                return self._comment_trigger_same_work_refresh(result, reason="full_cycle_cooldown_finished_refresh_current_work")

    def _comment_enter_runtime_cooldown(self, reason: str, *, duration_ms: int | None = None, min_ms: int | None = None, max_ms: int | None = None, reset_cycle_on_exit: bool = False) -> None:
                try:
                    cfg = self._comment_runtime_cooldown_config()
                    if duration_ms is None:
                        if min_ms is not None or max_ms is not None:
                            low = int(min_ms if min_ms is not None else 0)
                            high = int(max_ms if max_ms is not None else low)
                            if high < low:
                                high = low
                            duration_ms = random.randint(max(0, low), max(0, high))
                        else:
                            duration_ms = int(cfg.get("default_ms", 0) or 0)
                    duration = max(0, int(duration_ms or 0))
                    if duration <= 0:
                        return
                    now_ms = self._now_ms()
                    until_ms = now_ms + duration
                    previous_until = int(getattr(self, "comment_runtime_cooldown_until_ms", 0) or 0)
                    # Longer cooldown wins; this prevents a short post-action cooldown from shortening a full-cycle rest.
                    if until_ms < previous_until:
                        return
                    self.comment_runtime_cooldown_until_ms = until_ms
                    self.comment_runtime_cooldown_reason = str(reason or "")
                    self.comment_runtime_cooldown_reset_cycle_on_exit = bool(reset_cycle_on_exit)
                    self.comment_runtime_cooldown_last_log_ms = now_ms
                    payload = {
                        "reason": str(reason or ""),
                        "durationSec": round(duration / 1000, 1),
                        "untilMs": until_ms,
                        "currentWorkKey": str(getattr(self, "comment_current_work_key", "") or ""),
                        "resetCycleOnExit": bool(reset_cycle_on_exit),
                    }
                    self._log("INFO", f"评论模块进入节奏冷却: {json.dumps(payload, ensure_ascii=False)}")
                except Exception as exc:
                    self._log("WARN", f"评论模块节奏冷却设置失败: {type(exc).__name__}: {exc}")

    def _comment_runtime_cooldown_remaining_ms(self) -> int:
                try:
                    until_ms = int(getattr(self, "comment_runtime_cooldown_until_ms", 0) or 0)
                    if until_ms <= 0:
                        return 0
                    now_ms = self._now_ms()
                    remaining = until_ms - now_ms
                    if remaining > 0:
                        return remaining
                    reason = str(getattr(self, "comment_runtime_cooldown_reason", "") or "")
                    reset_cycle = bool(getattr(self, "comment_runtime_cooldown_reset_cycle_on_exit", False))
                    self.comment_runtime_cooldown_until_ms = 0
                    self.comment_runtime_cooldown_reason = ""
                    self.comment_runtime_cooldown_reset_cycle_on_exit = False
                    if reset_cycle:
                        try:
                            self.comment_all_known_works_completed = False
                            self.comment_completed_work_keys.clear()
                            self.comment_current_work_budget_logged = False
                            self.comment_current_work_ready_count = 0
                            self.comment_current_work_started_ms = now_ms
                            self.comment_same_work_refresh_due_after_cooldown = True
                            if hasattr(self, "_comment_set_flow_stage"):
                                self._comment_set_flow_stage("await_filtered_list_stable", None, reset=True, reason="full_cycle_idle_finished")
                        except Exception:
                            pass
                    self._log("INFO", f"评论模块节奏冷却结束: {json.dumps({'reason': reason, 'resetCycle': reset_cycle}, ensure_ascii=False)}")
                    return 0
                except Exception:
                    return 0

    def _comment_runtime_cooldown_should_skip(self) -> bool:
                # A successful reply starts a work-level cooldown, but the same thread
                # must still be polled for a user's immediate second-level follow-up.
                # Only bypass the cooldown for that bounded follow-up watch; normal
                # work switching and broad scans remain throttled.
                if hasattr(self, "_comment_followup_watch_active") and self._comment_followup_watch_active():
                    return False
                return self._comment_runtime_cooldown_remaining_ms() > 0 and not self._comment_runtime_cooldown_has_active_work()

    def _comment_runtime_cooldown_log_wait(self, remaining_ms: int | None = None) -> None:
                try:
                    remaining = int(remaining_ms if remaining_ms is not None else self._comment_runtime_cooldown_remaining_ms())
                    if remaining <= 0:
                        return
                    cfg = self._comment_runtime_cooldown_config()
                    log_interval_ms = max(10000, int(cfg.get("log_interval_ms", 30000) or 30000))
                    now_ms = self._now_ms()
                    last_log = int(getattr(self, "comment_runtime_cooldown_last_log_ms", 0) or 0)
                    if now_ms - last_log < log_interval_ms:
                        return
                    self.comment_runtime_cooldown_last_log_ms = now_ms
                    payload = {
                        "reason": str(getattr(self, "comment_runtime_cooldown_reason", "") or ""),
                        "remainingSec": int((remaining + 999) / 1000),
                        "stage": str(getattr(self, "comment_stage_name", "") or ""),
                        "currentWorkKey": str(getattr(self, "comment_current_work_key", "") or ""),
                    }
                    self._log("INFO", f"评论模块节奏冷却中: {json.dumps(payload, ensure_ascii=False)}")
                except Exception:
                    return

    def _comment_enter_critical_quiet(self, reason: str, duration_ms: int = 1800, *, target: dict[str, Any] | None = None) -> None:
                try:
                    now_ms = self._now_ms()
                    duration = max(0, int(duration_ms or 0))
                    until_ms = now_ms + duration
                    previous_until = int(getattr(self, "comment_critical_quiet_until_ms", 0) or 0)
                    if until_ms > previous_until:
                        self.comment_critical_quiet_until_ms = until_ms
                    self.comment_critical_quiet_reason = str(reason or "")
                    last_log_ms = int(getattr(self, "comment_critical_quiet_last_log_ms", 0) or 0)
                    last_reason = str(getattr(self, "comment_critical_quiet_last_reason", "") or "")
                    # Keep quiet-mutex logs sparse; repeated renewals are expected during generation/click settle.
                    if reason != last_reason or now_ms - last_log_ms >= 12000:
                        self.comment_critical_quiet_last_log_ms = now_ms
                        self.comment_critical_quiet_last_reason = str(reason or "")
                        payload = {
                            "reason": str(reason or ""),
                            "durationMs": duration,
                            "untilMs": int(getattr(self, "comment_critical_quiet_until_ms", until_ms) or until_ms),
                            "stage": str(getattr(self, "comment_stage_name", "") or ""),
                            "pendingReply": bool(getattr(self, "comment_pending_reply_target", None)),
                            "activeTarget": bool(getattr(self, "comment_active_reply_target", None)),
                            "pendingDraft": bool(getattr(self, "comment_pending_draft_probe_target", None)),
                        }
                        if isinstance(target, dict):
                            payload.update({
                                "threadKey": str(target.get("threadKey", "") or ""),
                                "author": str(target.get("author", "") or ""),
                            })
                        if self._comment_verbose_logs_enabled():
                            self._log("INFO", f"{TRACE_FILTER_RUNTIME} | quiet_inspect_mutex_enter={json.dumps(payload, ensure_ascii=False)}")
                except Exception as exc:
                    self._log("WARN", f"{TRACE_FILTER_RUNTIME} | quiet_inspect_mutex_enter_failed={type(exc).__name__}: {exc}")

    def _schedule_fast_comment_inspect(self, delay_ms: int = 1200) -> None:
                if not self.running or not self.ready or self.current_module != "comment":
                    return
                try:
                    delay_ms = int(delay_ms or 0)
                except Exception:
                    delay_ms = 1200
                startup_pending = bool(hasattr(self, "_comment_startup_first_cycle_pending") and self._comment_startup_first_cycle_pending())
                remaining_ms = self._comment_critical_quiet_remaining_ms() if hasattr(self, "_comment_critical_quiet_remaining_ms") else 0
                if remaining_ms > 0:
                    delay_ms = max(delay_ms, min(remaining_ms + 80, 5000))
                elif (not startup_pending) and hasattr(self, "_comment_runtime_cooldown_should_skip") and self._comment_runtime_cooldown_should_skip():
                    cooldown_remaining = self._comment_runtime_cooldown_remaining_ms()
                    self._comment_runtime_cooldown_log_wait(cooldown_remaining)
                    delay_ms = max(delay_ms, min(cooldown_remaining + 120, 60000))
                def _fire(retry_no: int = 0) -> None:
                    if not self.running or not self.ready or self.current_module != "comment":
                        return
                    remaining = self._comment_critical_quiet_remaining_ms() if hasattr(self, "_comment_critical_quiet_remaining_ms") else 0
                    if remaining > 0:
                        # Suppress per-tick skip logs; the enter/exit decisions are enough for normal runs.
                        QTimer.singleShot(min(max(remaining + 80, 800), 5000), lambda: _fire(retry_no))
                        return
                    startup_pending_inner = bool(hasattr(self, "_comment_startup_first_cycle_pending") and self._comment_startup_first_cycle_pending())
                    if (not startup_pending_inner) and hasattr(self, "_comment_runtime_cooldown_should_skip") and self._comment_runtime_cooldown_should_skip():
                        cooldown_remaining = self._comment_runtime_cooldown_remaining_ms()
                        self._comment_runtime_cooldown_log_wait(cooldown_remaining)
                        QTimer.singleShot(min(max(cooldown_remaining + 120, 1000), 60000), lambda: _fire(retry_no))
                        return
                    if self.busy:
                        # 以前这里直接 return，若刚好撞上状态探测/JS 回调 busy，
                        # 本次快速巡检会永久丢失；单作品评论刷新链路就会停在“选择作品”。
                        # 现在只延后重试，不抢占正在进行的回复/发送主流程。
                        if retry_no < 20:
                            QTimer.singleShot(350, lambda: _fire(retry_no + 1))
                        else:
                            now_ms = self._now_ms()
                            last_busy_log_ms = int(getattr(self, "comment_fast_inspect_busy_timeout_last_log_ms", 0) or 0)
                            if self._comment_verbose_logs_enabled() or now_ms - last_busy_log_ms >= 60000:
                                self.comment_fast_inspect_busy_timeout_last_log_ms = now_ms
                                self.comment_fast_inspect_busy_drop_last_log_ms = now_ms
                                self._log("INFO", "评论快速巡检等待 busy 释放超时，本次触发已合并，后续常规巡检继续接管。")
                        return
                    self.last_inspect_started_ms = 0
                    self._inspect_current_module()
                QTimer.singleShot(max(0, int(delay_ms or 0)), lambda: _fire(0))

    def _log_comment_inspect(self, result: dict[str, Any]) -> None:
                if not bool(getattr(self, "comment_trace_runtime_logged", False)):
                    self.comment_trace_runtime_logged = True
                    self._log("INFO", f"{TRACE_FILTER_RUNTIME} | entry=_log_comment_inspect | file=comment/filter/filter_runtime.py | currentModule={self.current_module} | targetFilter={getattr(self, 'comment_target_filter_text', '')}")
                self._collect_comment_pending_reply_result()
                if hasattr(self, "_comment_record_visible_threads"):
                    try:
                        self._comment_record_visible_threads(result)
                    except Exception as exc:
                        self._log("WARN", f"评论记录旁路采集异常，已忽略且不影响回复：{type(exc).__name__}: {str(exc)[:160]}")

                # V50 filter-first gate: before the target filter is confirmed and the filtered
                # list is stable, do not build reply candidates and do not enter any reply action.
                # This prevents opening a reply editor under 全部评论 and then losing it when 未回复 refreshes.
                self._maybe_confirm_comment_work_switch(result)
                self._maybe_confirm_comment_filter(result)
                self._comment_update_flow_stage(result)
                if hasattr(self, "_comment_note_business_dom_ready"):
                    self._comment_note_business_dom_ready(result)
                if hasattr(self, "_comment_maybe_refresh_after_full_cycle_cooldown") and self._comment_maybe_refresh_after_full_cycle_cooldown(result):
                    return

                filter_ready = self._comment_filter_ready(result)
                scan_ready = self._comment_is_scan_stage_ready(result)
                stage = str(getattr(self, "comment_stage_name", "") or "")
                pending_draft_for_hold = self.comment_pending_draft_probe_target if isinstance(getattr(self, "comment_pending_draft_probe_target", None), dict) else {}
                if stage == "manual_send_hold" or str(pending_draft_for_hold.get("phase", "") or "") == "manual_send_hold":
                    # V60: hard isolate manual hold. Do not attach candidates, do not mark completed,
                    # do not select filters, do not open/reopen reply editor, and do not run work switching.
                    if hasattr(self, "_comment_manual_send_hold_tick"):
                        self._comment_manual_send_hold_tick(result)
                    return
                active_reply_stage = (
                    stage in {
                        "reply_candidate_selected",
                        "reply_editor_opening",
                        "reply_editor_confirmed",
                        "reply_editor_focus_retry",
                        "reply_editor_stable",
                        "reply_editor_ready_for_draft",
                        "reply_draft_inject_probe",
                        "reply_draft_reactivate_probe",
                        "reply_draft_verified",
                        "manual_send_hold",
                        "reply_editor_lost_hold",
                        "reply_editor_lost",
                        "reply_editor_recovering",
                    }
                    or bool(getattr(self, "comment_pending_reply_target", None))
                    or bool(getattr(self, "comment_active_reply_target", None))
                )
                # V50: filter-first gate only blocks before the filtered list is ready.
                # Once a reply editor action has started, the editor confirm/focus/alive chain must run.
                filter_first_hold = (
                    not active_reply_stage
                    and (stage in {"ensure_unreplied_filter", "await_filtered_list_stable"} or not stage)
                    and (not filter_ready or not scan_ready)
                )

                if filter_first_hold:
                    now_ms = self._now_ms()
                    if self._comment_verbose_logs_enabled() and now_ms - int(getattr(self, "comment_filter_first_gate_last_log_ms", 0) or 0) >= 12000:
                        self.comment_filter_first_gate_last_log_ms = now_ms
                        self._log(
                            "INFO",
                            f"{TRACE_FILTER_RUNTIME} | filter_first_gate=hold_reply_chain | stage={str(getattr(self, 'comment_stage_name', '') or '')} | currentFilter={self._comment_filter_text(result)} | targetFilter={self.comment_target_filter_text} | filterReady={filter_ready} | scanReady={scan_ready} | candidateAttachSkipped=True",
                        )
                    self._maybe_select_comment_filter(result)
                    # Keep diagnostics visible, but deliberately avoid candidate construction/reply opener.
                    emit_comment_probe_logs(result, self._log)
                    self._update_comment_empty_observation(result)
                    self._maybe_close_comment_workdrawer(result)
                    return

                if hasattr(self, "_comment_attach_candidate_debug"):
                    try:
                        result = self._comment_attach_candidate_debug(result)
                    except Exception as exc:
                        self._log("WARN", f"评论候选调试信息构建失败: {type(exc).__name__}: {exc}")
                emit_comment_probe_logs(result, self._log)
                self._update_comment_empty_observation(result)
                self._maybe_confirm_comment_reply_editor(result)
                if hasattr(self, "_comment_probe_active_comment_reply_editor"):
                    self._comment_probe_active_comment_reply_editor(result)
                self._maybe_confirm_comment_draft_probe(result)
                self._maybe_confirm_comment_reply_send(result)
                if self._maybe_expand_comment_replies(result):
                    return
                if self._maybe_scroll_comment_scan(result):
                    return
                self._maybe_mark_comment_work_completed(result)
                self._maybe_close_comment_workdrawer(result)
                if str(getattr(self, "comment_stage_name", "") or "") in {"reply_editor_confirmed", "reply_editor_focus_retry", "reply_editor_post_focus_stabilizing", "reply_editor_stable", "reply_editor_ready_for_draft", "reply_draft_inject_probe", "reply_draft_reactivate_probe", "reply_draft_verified",
                        "manual_send_hold", "reply_editor_lost_hold", "reply_editor_recovering"} or bool(getattr(self, "comment_active_reply_target", None)):
                    now_ms = self._now_ms()
                    if now_ms - int(getattr(self, "comment_filter_skip_active_editor_last_log_ms", 0) or 0) >= 1500:
                        self.comment_filter_skip_active_editor_last_log_ms = now_ms
                        if self._comment_verbose_logs_enabled():
                            self._log("INFO", f"{TRACE_FILTER_RUNTIME} | filter_decision=skipped_due_to_active_reply_editor | stage={str(getattr(self, 'comment_stage_name', '') or '')} | currentFilter={self._comment_filter_text(result)} | candidateCount={self._comment_candidate_count(result)} | activeTarget={bool(getattr(self, 'comment_active_reply_target', None))}")
                else:
                    self._maybe_select_comment_filter(result)
                settle_until_ms = int(getattr(self, "comment_reply_expand_settle_until_ms", 0) or 0)
                now_ms = self._now_ms()
                if settle_until_ms and now_ms < settle_until_ms:
                    if now_ms - int(getattr(self, "comment_reply_expand_settle_log_ms", 0) or 0) >= 1200:
                        self.comment_reply_expand_settle_log_ms = now_ms
                        self._log("INFO", f"评论折叠回复展开后等待布局稳定: {json.dumps({'remainingMs': max(0, settle_until_ms - now_ms), 'top': len(result.get('topComments', []) or []), 'raw': int((result.get('summary', {}) or {}).get('visible', 0) or 0)}, ensure_ascii=False)}")
                    self._schedule_fast_comment_inspect(max(500, settle_until_ms - now_ms + 150))
                    return
                if settle_until_ms:
                    self.comment_reply_expand_settle_until_ms = 0
                self._maybe_open_comment_reply_editor(result)
                # 当前版本先走通基础回复链路；作品侧栏/作品切换链路不参与巡检调度。
                if self._comment_work_switch_enabled():
                    self._maybe_open_comment_workdrawer(result)
                    self._maybe_switch_comment_work(result)
                self._maybe_probe_comment_reply_draft(result)

    def _comment_current_work_key(self, result: dict[str, Any]) -> str:
                header = result.get("header", {}) or {}
                title = str(header.get("currentWorkTitle", "") or "").strip()
                meta = str(header.get("currentWorkMeta", "") or "").strip()
                if not title and not meta:
                    return ""
                if title and meta:
                    return f"{title} | {meta}"
                return title or meta

    def _comment_is_empty_work_key(self, work_key: str) -> bool:
                key = str(work_key or "").strip()
                return not key or key == "|"

    def _comment_resolve_stage_work_key(self, result: dict[str, Any] | None = None) -> str:
                work_key = self._comment_current_work_key(result or {}) if isinstance(result, dict) else ""
                if not self._comment_is_empty_work_key(work_key):
                    return work_key
                for attr in ("comment_current_work_key", "comment_stage_work_key"):
                    candidate = str(getattr(self, attr, "") or "").strip()
                    if not self._comment_is_empty_work_key(candidate):
                        return candidate
                return ""

    def _comment_reply_editor_active_stage(self, stage: str | None = None) -> bool:
                stage_name = str(stage if stage is not None else getattr(self, "comment_stage_name", "") or "")
                return stage_name in {
                    "reply_candidate_selected",
                    "reply_editor_opening",
                    "reply_editor_confirmed",
                    "reply_editor_focus_retry",
                    "reply_editor_post_focus_stabilizing",
                    "reply_editor_stable",
                    "reply_editor_ready_for_draft",
                    "reply_draft_inject_probe",
                    "reply_draft_reactivate_probe",
                    "reply_draft_verified",
                        "manual_send_hold",
                    "reply_editor_lost_hold",
                    "reply_editor_lost",
                    "reply_editor_recovering",
                }

    def _comment_work_completed(self, result: dict[str, Any]) -> bool:
                key = self._comment_current_work_key(result)
                if self._comment_followup_watch_active(key):
                    # A recently replied thread is still being watched for user follow-ups.
                    # Do not let stale completed_work_keys force the work-switch/sidebar path.
                    return False
                return bool(key and key in self.comment_completed_work_keys)

    def _comment_followup_watch_duration_ms(self) -> int:
                try:
                    cfg = self._comment_runtime_cooldown_config() if hasattr(self, "_comment_runtime_cooldown_config") else {}
                    return max(60_000, int(cfg.get("post_send_followup_watch_ms", 600_000) or 600_000))
                except Exception:
                    return 600_000

    def _comment_followup_watch_poll_ms(self) -> int:
                try:
                    cfg = self._comment_runtime_cooldown_config() if hasattr(self, "_comment_runtime_cooldown_config") else {}
                    base = int(cfg.get("post_send_followup_poll_ms", 8_000) or 8_000)
                    return min(max(base, 5_000), 15_000)
                except Exception:
                    return 8_000

    def _comment_followup_watch_active(self, work_key: str | None = None) -> bool:
                try:
                    until_ms = int(getattr(self, "comment_followup_watch_until_ms", 0) or 0)
                    if until_ms <= 0 or self._now_ms() >= until_ms:
                        if until_ms > 0:
                            self.comment_followup_watch_until_ms = 0
                            self.comment_followup_watch_work_key = ""
                            self.comment_followup_watch_thread_key = ""
                            self.comment_followup_watch_signature = ""
                        return False
                    key = str(work_key or getattr(self, "comment_current_work_key", "") or "")
                    watched_key = str(getattr(self, "comment_followup_watch_work_key", "") or "")
                    return bool((not key) or (not watched_key) or key == watched_key)
                except Exception:
                    return False

    def _comment_note_followup_watch_after_send(self, result: dict[str, Any] | None = None, target: dict[str, Any] | None = None) -> None:
                try:
                    work_key = self._comment_current_work_key(result or {}) or str(getattr(self, "comment_current_work_key", "") or "")
                    if not work_key:
                        return
                    duration_ms = self._comment_followup_watch_duration_ms()
                    self.comment_followup_watch_until_ms = self._now_ms() + duration_ms
                    self.comment_followup_watch_work_key = work_key
                    self.comment_followup_watch_thread_key = str((target or {}).get("threadKey", "") or "")
                    sig = ""
                    if isinstance(target, dict) and hasattr(self, "_comment_target_signature"):
                        sig = str(self._comment_target_signature(target, result=result) or "")
                    self.comment_followup_watch_signature = sig
                    self.comment_followup_watch_refresh_count = 0
                    self.comment_followup_watch_last_refresh_key = ""
                    self.comment_completed_work_keys.discard(work_key)
                    payload = {
                        "workKey": work_key,
                        "threadKey": self.comment_followup_watch_thread_key,
                        "durationSec": round(duration_ms / 1000, 1),
                    }
                    self._log("INFO", f"评论发送后进入当前线程跟进观察: {json.dumps(payload, ensure_ascii=False)}")
                except Exception:
                    return

    def _comment_defer_work_done_for_followup_watch(self, result: dict[str, Any], work_key: str, *, reason: str) -> bool:
                if not self._comment_followup_watch_active(work_key):
                    return False
                try:
                    now_ms = self._now_ms()
                    remaining_ms = max(0, int(getattr(self, "comment_followup_watch_until_ms", 0) or 0) - now_ms)
                    watch_key = "|".join([
                        str(work_key or ""),
                        str(getattr(self, "comment_followup_watch_thread_key", "") or ""),
                        str(getattr(self, "comment_followup_watch_signature", "") or ""),
                    ])
                    refresh_count = int(getattr(self, "comment_followup_watch_refresh_count", 0) or 0)
                    last_refresh_key = str(getattr(self, "comment_followup_watch_last_refresh_key", "") or "")
                    # After a successful reply, the current DOM can stay as an old snapshot.
                    # Before declaring the work done or just waiting for follow-ups, refresh the
                    # current work once after the normal post-send cooldown. This pulls any
                    # newly appended nested reply into the DOM without touching active editor/send
                    # chains. If the refresh was already done for this sent reply and no new
                    # candidate appeared, let the normal work-completed / work-switch logic run.
                    if refresh_count <= 0 or last_refresh_key != watch_key:
                        if not self._comment_same_work_refresh_has_active_flow():
                            if self._comment_trigger_same_work_refresh(result, reason="post_send_followup_refresh_current_work"):
                                self.comment_followup_watch_refresh_count = refresh_count + 1
                                self.comment_followup_watch_last_refresh_key = watch_key
                                self._log("INFO", f"评论发送后跟进复扫触发当前作品刷新: {json.dumps({'workKey': work_key, 'reason': reason, 'remainingSec': int((remaining_ms + 999) / 1000)}, ensure_ascii=False)}")
                                return True
                            if hasattr(self, "_comment_same_work_refresh_wait_until_retry") and self._comment_same_work_refresh_wait_until_retry("post_send_followup_refresh_wait_min_interval"):
                                return True
                    else:
                        # The refreshed DOM still has no reply candidate. Release the watch guard
                        # so multi-work accounts can switch works and single-work accounts can use
                        # the normal same-work refresh cycle instead of being stuck in a 10-minute
                        # stale-DOM observation loop.
                        self.comment_followup_watch_until_ms = 0
                        self.comment_followup_watch_work_key = ""
                        self.comment_followup_watch_thread_key = ""
                        self.comment_followup_watch_signature = ""
                        self.comment_followup_watch_refresh_count = 0
                        self.comment_followup_watch_last_refresh_key = ""
                        self._log("INFO", f"评论发送后跟进复扫已刷新且无新候选，恢复作品完成/切换判断: {json.dumps({'workKey': work_key, 'reason': reason}, ensure_ascii=False)}")
                        return False
                    if hasattr(self, "_comment_set_flow_stage"):
                        self._comment_set_flow_stage("post_send_followup_watch", result, reason=reason)
                    last_log = int(getattr(self, "comment_followup_watch_last_log_ms", 0) or 0)
                    if now_ms - last_log >= 30000:
                        self.comment_followup_watch_last_log_ms = now_ms
                        self._log("INFO", f"评论当前作品暂不判完成，继续观察跟进回复: {json.dumps({'workKey': work_key, 'reason': reason, 'remainingSec': int((remaining_ms + 999) / 1000)}, ensure_ascii=False)}")
                    if hasattr(self, "_comment_enter_runtime_cooldown") and self._comment_runtime_cooldown_remaining_ms() <= 0:
                        self._comment_enter_runtime_cooldown(
                            "post_send_followup_watch",
                            duration_ms=min(self._comment_followup_watch_poll_ms(), max(1000, remaining_ms)),
                            reset_cycle_on_exit=False,
                        )
                    return True
                except Exception:
                    return True

    def _comment_filter_text(self, result: dict[str, Any]) -> str:
                return str((result.get("commentFilter", {}) or {}).get("selectedText", "") or "")

    def _comment_filter_config(self) -> dict[str, Any]:
                config = self.comment_runtime_config if isinstance(getattr(self, "comment_runtime_config", None), dict) else {}
                filter_cfg = config.get("filter", {}) if isinstance(config.get("filter"), dict) else {}
                return filter_cfg

    def _comment_filter_enforced(self) -> bool:
                filter_cfg = self._comment_filter_config()
                enabled = bool(filter_cfg.get("enabled", False) or filter_cfg.get("force", False) or getattr(self, "comment_filter_force_enabled", False))
                target = str(filter_cfg.get("target_text", getattr(self, "comment_target_filter_text", "") or "") or "").strip()
                return bool(enabled and target)

    def _comment_filter_ready(self, result: dict[str, Any]) -> bool:
                if not self._comment_filter_enforced():
                    return True
                target = str(getattr(self, "comment_target_filter_text", "") or self._comment_filter_config().get("target_text", "") or "").strip()
                return bool(target and self._comment_filter_text(result) == target)

    def _comment_current_flow_stage(self) -> str:
                return str(getattr(self, "comment_stage_name", "") or "")

    def _comment_flow_stage_blocks_work_switch(self, result: dict[str, Any]) -> bool:
                stage = self._comment_current_flow_stage()
                work_key = self._comment_current_work_key(result)
                if work_key and work_key in self.comment_completed_work_keys:
                    return False
                active_stages = {
                    "reply_candidate_selected",
                    "reply_editor_opening",
                    "reply_editor_confirmed",
                    "reply_editor_focus_retry",
                    "reply_editor_post_focus_stabilizing",
                    "reply_editor_stable",
                    "reply_editor_ready_for_draft",
                    "reply_draft_inject_probe",
                    "reply_draft_reactivate_probe",
                    "reply_draft_verified",
                    "manual_send_hold",
                    "reply_editor_lost_hold",
                    "reply_editor_lost",
                    "reply_editor_recovering",
                }
                if stage in active_stages:
                    return True
                if (
                    getattr(self, "comment_pending_reply_target", None) is not None
                    or getattr(self, "comment_active_reply_target", None) is not None
                    or getattr(self, "comment_pending_draft_probe_target", None) is not None
                    or getattr(self, "comment_pending_send_payload", None) is not None
                    or getattr(self, "comment_pending_reply_future", None) is not None
                    or getattr(self, "comment_preopen_reply_future", None) is not None
                    or getattr(self, "comment_preopen_reply_target", None) is not None
                ):
                    return True
                skipped_samples = result.get("replySkippedSamples", []) or []
                skipped_reasons = {
                    str((item or {}).get("skipReason", "") or "")
                    for item in skipped_samples
                    if isinstance(item, dict)
                }
                # already_inflight / reply_open_cooling 表示评论主链仍有未闭环目标，作品切换/刷新会关闭编辑器或滚走目标。
                # 只阻断这类临时态，不把真正终态（already_completed/not_required 等）误拦住。
                if skipped_reasons.intersection({"already_inflight", "reply_open_cooling"}):
                    counts = result.get("counts", {}) or {}
                    if int(counts.get("unrepliedHeuristic", 0) or 0) > 0 or int(counts.get("replySkipped", 0) or 0) > 0:
                        return True
                if stage not in {"ensure_unreplied_filter", "await_filtered_list_stable"}:
                    return False
                return bool(work_key)

    def _comment_log_flow_stage_block(self, result: dict[str, Any], decision: str) -> None:
                now_ms = self._now_ms()
                attr = f"comment_{decision}_last_log_ms"
                if now_ms - int(getattr(self, attr, 0) or 0) < 1200:
                    return
                setattr(self, attr, now_ms)
                self._log(
                    "INFO",
                    f"{TRACE_FILTER_RUNTIME} | {decision}=blocked_by_comment_flow_stage | stage={self._comment_current_flow_stage()} | workKey={self._comment_current_work_key(result)} | currentFilter={self._comment_filter_text(result)} | candidateCount={self._comment_candidate_count(result)}",
                )

    def _comment_candidate_count(self, result: dict[str, Any]) -> int:
                candidates = result.get("replyCandidates", []) or []
                if isinstance(candidates, list):
                    return len(candidates)
                return 0

    def _comment_has_ready_candidates(self, result: dict[str, Any]) -> bool:
                return self._comment_candidate_count(result) > 0

    def _comment_scroll_scan_config(self) -> dict[str, Any]:
                config = self.comment_runtime_config if isinstance(getattr(self, "comment_runtime_config", None), dict) else {}
                scan_cfg = config.get("scroll_scan", {}) if isinstance(config.get("scroll_scan"), dict) else {}
                return scan_cfg

    def _comment_scroll_scan_enabled(self) -> bool:
                cfg = self._comment_scroll_scan_config()
                return bool(cfg.get("enabled", True))

    def _comment_scroll_scan_min_interval_ms(self) -> int:
                cfg = self._comment_scroll_scan_config()
                return max(1200, int(cfg.get("min_interval_ms", 2500) or 2500))

    def _comment_scroll_scan_max_per_work(self) -> int:
                cfg = self._comment_scroll_scan_config()
                return max(1, int(cfg.get("max_scrolls_per_work", 80) or 80))

    def _comment_scroll_scan_key(self, result: dict[str, Any]) -> str:
                work_key = self._comment_current_work_key(result) if hasattr(self, "_comment_current_work_key") else ""
                return str(work_key or "")[:360]

    def _comment_scroll_scan_reset_if_work_changed(self, result: dict[str, Any]) -> None:
                key = self._comment_scroll_scan_key(result)
                if not key:
                    return
                if str(getattr(self, "comment_scan_scroll_work_key", "") or "") != key:
                    self.comment_scan_scroll_work_key = key
                    self.comment_scan_scroll_count = 0
                    self.comment_scan_scroll_last_top = -1
                    self.comment_scan_scroll_exhausted = False

    def _comment_scroll_scan_possible(self, result: dict[str, Any]) -> tuple[bool, dict[str, Any]]:
                comment_list = result.get("commentList", {}) if isinstance(result, dict) else {}
                scroller = comment_list.get("scroller", {}) if isinstance(comment_list, dict) else {}
                if not isinstance(scroller, dict):
                    scroller = {}
                can_scroll = bool(scroller.get("canScrollDown"))
                at_bottom = bool(scroller.get("atBottom"))
                scroll_top = int(scroller.get("scrollTop", 0) or 0)
                max_scroll_top = int(scroller.get("maxScrollTop", 0) or 0)
                possible = bool(can_scroll or (max_scroll_top > 0 and not at_bottom and scroll_top < max_scroll_top - 24))
                return possible, scroller

    def _maybe_scroll_comment_scan(self, result: dict[str, Any]) -> bool:
                if not self._comment_scroll_scan_enabled():
                    return False
                if not self.running or not self.ready or self.current_module != "comment" or not self.page:
                    return False
                if self.busy:
                    return False
                if not self._comment_is_scan_stage_ready(result):
                    return False
                if self.comment_pending_switch_target is not None or self.comment_pending_filter_target is not None:
                    return False
                if self.comment_pending_reply_target is not None or self.comment_pending_draft_probe_target is not None:
                    return False
                if self.comment_pending_send_payload is not None or self.comment_pending_reply_future is not None:
                    return False
                if bool(getattr(self, "comment_active_reply_target", None)):
                    return False
                if self._comment_reply_editor_active_stage(str(getattr(self, "comment_stage_name", "") or "")):
                    return False
                work_drawer = result.get("workDrawer", {}) or {}
                if work_drawer.get("found"):
                    return False
                composers = result.get("composers", {}) or {}
                if composers.get("replyEditors"):
                    return False
                if self._comment_candidate_count(result) > 0:
                    return False
                counts = result.get("counts", {}) if isinstance(result.get("counts"), dict) else {}
                # 折叠回复优先展开；展开失败/冷却时再滚动，避免只扫首屏。
                if int(counts.get("collapsedReplyThreads", 0) or 0) > 0:
                    expand_cooldowns = getattr(self, "comment_reply_expand_cooldowns", None)
                    if not isinstance(expand_cooldowns, dict):
                        return False
                self._comment_scroll_scan_reset_if_work_changed(result)
                if bool(getattr(self, "comment_scan_scroll_exhausted", False)):
                    return False
                count = int(getattr(self, "comment_scan_scroll_count", 0) or 0)
                if count >= self._comment_scroll_scan_max_per_work():
                    self.comment_scan_scroll_exhausted = True
                    self._log("INFO", f"评论页当前作品滚动深扫达到上限，允许进入完成判定: {json.dumps({'workKey': self._comment_scroll_scan_key(result), 'scrollCount': count}, ensure_ascii=False)}")
                    return False
                possible, scroller = self._comment_scroll_scan_possible(result)
                if not possible:
                    self.comment_scan_scroll_exhausted = True
                    return False
                now_ms = self._now_ms()
                last_attempt_ms = int(getattr(self, "comment_scan_scroll_last_attempt_ms", 0) or 0)
                min_interval_ms = self._comment_scroll_scan_min_interval_ms()
                elapsed_since_scroll = now_ms - last_attempt_ms if last_attempt_ms else min_interval_ms
                if elapsed_since_scroll < min_interval_ms:
                    wait_ms = max(900, min_interval_ms - elapsed_since_scroll + 250)
                    self._schedule_fast_comment_inspect(wait_ms)
                    return True
                self.comment_scan_scroll_last_attempt_ms = now_ms
                self.comment_scan_scroll_count = count + 1
                self.busy = True
                payload = {
                    "attemptNo": self.comment_scan_scroll_count,
                    "workKey": self._comment_scroll_scan_key(result),
                    "scrollTop": int(scroller.get("scrollTop", 0) or 0),
                    "maxScrollTop": int(scroller.get("maxScrollTop", 0) or 0),
                    "topComments": int(counts.get("topComments", 0) or 0),
                    "visibleCards": int(counts.get("visibleCardCount", 0) or 0),
                    "replySkipped": int(counts.get("replySkipped", 0) or 0),
                }
                self._log("INFO", f"评论页继续向下滚动深扫当前作品: {json.dumps(payload, ensure_ascii=False)}")
                self.page.runJavaScript(
                    build_comment_scroll_scan_script("down"),
                    self._handle_comment_scan_scroll_result,
                )
                return True

    def _handle_comment_scan_scroll_result(self, result: Any) -> None:
                self.busy = False
                result = self._coerce_js_result(result)
                if not isinstance(result, dict):
                    self._log("WARN", f"评论页滚动深扫结果异常: {type(result).__name__}: {str(result)[:180]}")
                    self._schedule_fast_comment_inspect(2500)
                    return
                ok = bool(result.get("ok"))
                before = result.get("before", {}) if isinstance(result.get("before"), dict) else {}
                after = result.get("after", {}) if isinstance(result.get("after"), dict) else {}
                before_top = int(before.get("scrollTop", 0) or 0)
                after_top = int(after.get("scrollTop", 0) or 0)
                if ok and after_top > before_top:
                    self.comment_scan_scroll_last_top = after_top
                    self._comment_set_flow_stage("scan_candidates_under_unreplied", None, reason="scroll_scan_continue")
                    self._log("INFO", f"评论页滚动深扫结果: {json.dumps({'ok': True, 'state': result.get('state', ''), 'beforeTop': before_top, 'afterTop': after_top, 'atBottom': bool(after.get('atBottom'))}, ensure_ascii=False)}")
                    self._schedule_fast_comment_inspect(2600)
                    return
                if bool(after.get("atBottom")) or str(result.get("state", "") or "") in {"not_scrollable", "no_movement"}:
                    self.comment_scan_scroll_exhausted = True
                self._log("INFO" if ok else "WARN", f"评论页滚动深扫未继续: {json.dumps({'ok': ok, 'state': result.get('state', ''), 'beforeTop': before_top, 'afterTop': after_top, 'atBottom': bool(after.get('atBottom'))}, ensure_ascii=False)}")
                self._schedule_fast_comment_inspect(2200)

    def _comment_reply_expand_config(self) -> dict[str, Any]:
                config = self.comment_runtime_config if isinstance(getattr(self, "comment_runtime_config", None), dict) else {}
                expand_cfg = config.get("reply_expand", {}) if isinstance(config.get("reply_expand"), dict) else {}
                return expand_cfg

    def _comment_reply_expand_enabled(self) -> bool:
                cfg = self._comment_reply_expand_config()
                return bool(cfg.get("enabled", True))

    def _comment_reply_expand_thread_key(self, item: dict[str, Any], result: dict[str, Any] | None = None) -> str:
                work_key = self._comment_current_work_key(result or {}) if isinstance(result, dict) else ""
                thread_key = str((item or {}).get("threadKey", "") or "").strip()
                return f"{work_key} | {thread_key}"[:360] if work_key else thread_key[:360]


    def _comment_reply_expand_apply_cooldown(self, *, ok: bool, reason: str = "") -> None:
                key = str(getattr(self, "comment_reply_expand_pending_key", "") or "")
                if not key:
                    return
                cooldowns = getattr(self, "comment_reply_expand_cooldowns", None)
                if not isinstance(cooldowns, dict):
                    cooldowns = {}
                    self.comment_reply_expand_cooldowns = cooldowns
                cfg = self._comment_reply_expand_config()
                success_ms = max(5000, int(cfg.get("success_cooldown_ms", 15000) or 15000))
                failure_ms = max(10000, int(cfg.get("failure_cooldown_ms", cfg.get("cooldown_ms", 60000)) or 60000))
                cooldown_ms = success_ms if ok else failure_ms
                cooldowns[key] = self._now_ms() + cooldown_ms
                payload = {
                    "key": key,
                    "ok": bool(ok),
                    "reason": str(reason or ""),
                    "cooldownMs": cooldown_ms,
                }
                if (not ok) or self._comment_verbose_logs_enabled():
                    self._log("INFO" if ok else "WARN", f"{TRACE_FILTER_RUNTIME} | expand_replies_cooldown_applied={json.dumps(payload, ensure_ascii=False)}")

    def _comment_reply_expand_clear_pending(self) -> None:
                self.comment_reply_expand_pending_key = ""
                self.comment_reply_expand_pending_target = None

    def _maybe_expand_comment_replies(self, result: dict[str, Any]) -> bool:
                if not self._comment_reply_expand_enabled():
                    return False
                if not self.running or not self.ready or self.current_module != "comment" or not self.page:
                    return False
                if self.busy:
                    return False
                if not self._comment_is_scan_stage_ready(result):
                    return False
                if self.comment_pending_switch_target is not None or self.comment_pending_filter_target is not None:
                    return False
                if self.comment_pending_reply_target is not None or self.comment_pending_draft_probe_target is not None or self.comment_pending_send_payload is not None:
                    return False
                if bool(getattr(self, "comment_active_reply_target", None)):
                    return False
                stage = str(getattr(self, "comment_stage_name", "") or "")
                if self._comment_reply_editor_active_stage(stage):
                    return False
                work_drawer = result.get("workDrawer", {}) or {}
                if work_drawer.get("found"):
                    return False
                composers = result.get("composers", {}) or {}
                if composers.get("replyEditors"):
                    return False
                cfg = self._comment_reply_expand_config()
                min_interval_ms = max(3000, int(cfg.get("min_interval_ms", 12000) or 12000))
                cooldown_ms = max(10000, int(cfg.get("cooldown_ms", 60000) or 60000))
                now_ms = self._now_ms()
                if now_ms - int(getattr(self, "comment_reply_expand_last_attempt_ms", 0) or 0) < min_interval_ms:
                    return False
                top_comments = result.get("topComments", []) or []
                if not isinstance(top_comments, list):
                    return False

                # D6: Never expand an unrelated historical thread while there is
                # already an actionable visible reply candidate. Expanding a long
                # thread shifts every comment below it and was the direct trigger for
                # second top-level comments becoming hard to click. Candidate debug
                # is attached before this method runs, so prefer that exact result;
                # fall back to a fresh candidate build only for compatibility.
                actionable = result.get("replyCandidates", []) or []
                if not isinstance(actionable, list):
                    actionable = []
                if not actionable and hasattr(self, "_comment_build_reply_candidates"):
                    try:
                        actionable, _ = self._comment_build_reply_candidates(result)
                    except Exception:
                        actionable = []
                if actionable:
                    now_ms = self._now_ms()
                    if now_ms - int(getattr(self, "comment_reply_expand_deferred_for_candidate_log_ms", 0) or 0) >= 5000:
                        self.comment_reply_expand_deferred_for_candidate_log_ms = now_ms
                        first = actionable[0] if isinstance(actionable[0], dict) else {}
                        self._log("INFO", f"评论页已有可处理候选，暂不展开其他历史线程: {json.dumps({'candidateCount': len(actionable), 'level': first.get('targetLevel', ''), 'author': first.get('author', ''), 'content': str(first.get('content', '') or '')[:80]}, ensure_ascii=False)}")
                    return False

                cooldowns = getattr(self, "comment_reply_expand_cooldowns", None)
                if not isinstance(cooldowns, dict):
                    cooldowns = {}
                    self.comment_reply_expand_cooldowns = cooldowns
                candidates: list[dict[str, Any]] = []
                for item in top_comments:
                    if not isinstance(item, dict):
                        continue
                    if not bool(item.get("hasCollapsedReplies")):
                        continue
                    is_self_author = bool(item.get("isAuthor"))
                    if hasattr(self, "_comment_is_self_author"):
                        try:
                            is_self_author = is_self_author or bool(self._comment_is_self_author(item.get("author", ""), item.get("authorTag", "")))
                        except Exception:
                            pass
                    if is_self_author and not bool(item.get("lastVisibleUserMessage")):
                        continue
                    if not bool(item.get("replyButtonFound")):
                        continue
                    key = self._comment_reply_expand_thread_key(item, result)
                    until_ms = int(cooldowns.get(key, 0) or 0)
                    if until_ms and now_ms < until_ms:
                        continue
                    if until_ms:
                        cooldowns.pop(key, None)
                    candidates.append(item)
                if not candidates:
                    return False
                target = candidates[0]
                key = self._comment_reply_expand_thread_key(target, result)
                self.comment_reply_expand_pending_key = key
                self.comment_reply_expand_pending_target = {
                    "threadKey": str(target.get("threadKey", "") or ""),
                    "author": str(target.get("author", "") or ""),
                    "content": str(target.get("content", "") or ""),
                    "hasAuthorReplyInThread": bool(target.get("hasAuthorReplyInThread")),
                    "workKey": self._comment_current_work_key(result) if hasattr(self, "_comment_current_work_key") else str(getattr(self, "comment_current_work_key", "") or ""),
                }
                self.comment_reply_expand_last_attempt_ms = now_ms
                self.comment_reply_expand_attempts = int(getattr(self, "comment_reply_expand_attempts", 0) or 0) + 1
                payload = {
                    "attemptNo": self.comment_reply_expand_attempts,
                    "threadKey": str(target.get("threadKey", "") or ""),
                    "author": str(target.get("author", "") or ""),
                    "contentPreview": str(target.get("content", "") or "")[:80],
                    "loadMoreText": str(target.get("loadMoreText", "") or ""),
                    "collapsedReplyCount": int(target.get("collapsedReplyCount", 0) or 0),
                    "currentFilter": self._comment_filter_text(result),
                    "candidateCount": self._comment_candidate_count(result),
                    "cooldownMs": cooldown_ms,
                }
                self._log("INFO", f"评论页展开折叠回复: {json.dumps({'author': payload.get('author', ''), 'content': payload.get('contentPreview', ''), 'count': payload.get('collapsedReplyCount', 0)}, ensure_ascii=False)}")
                self.busy = True
                self.page.runJavaScript(
                    build_comment_expand_reply_thread_script(
                        str(target.get("threadKey", "") or ""),
                        str(target.get("author", "") or ""),
                        str(target.get("content", "") or ""),
                    ),
                    self._handle_comment_expand_reply_thread_result,
                )
                return True

    def _handle_comment_expand_reply_thread_result(self, result: Any) -> None:
                self.busy = False
                pending_target = dict(getattr(self, "comment_reply_expand_pending_target", {}) or {})
                result = self._coerce_js_result(result)
                if not isinstance(result, dict):
                    self._comment_reply_expand_apply_cooldown(ok=False, reason="invalid_result")
                    self._comment_reply_expand_clear_pending()
                    self._log("WARN", f"{TRACE_FILTER_RUNTIME} | expand_replies_result_invalid | type={type(result).__name__} | snippet={str(result)[:220]}")
                    self._schedule_fast_comment_inspect(1500)
                    return
                ok = bool(result.get("ok"))
                self._comment_reply_expand_apply_cooldown(ok=ok, reason=str(result.get("state", "") or ""))
                self._comment_reply_expand_clear_pending()
                level = "INFO" if ok else "WARN"
                compact = {'ok': ok, 'state': str(result.get('state', '') or ''), 'author': str(((result.get('payload', {}) or {}).get('author', '') if isinstance(result.get('payload'), dict) else '') or ''), 'content': str(((result.get('payload', {}) or {}).get('content', '') if isinstance(result.get('payload'), dict) else '') or '')[:80]}
                self._log(level, f"评论页折叠回复展开结果: {json.dumps(compact, ensure_ascii=False)}")
                if ok:
                    # Expanding any thread changes the vertical layout of all comments
                    # below it. Do not resolve/click another comment until the layout
                    # has settled; otherwise stale coordinates can land on 删除/举报.
                    self.comment_reply_expand_settle_until_ms = self._now_ms() + 2200
                    self.comment_reply_expand_settle_log_ms = 0

                # A restarted UCP has no in-memory post-send watch. When an already
                # replied thread is expanded, treat it as a bounded follow-up scan and
                # clear the broad work cooldown so a new second-level user reply is
                # handled immediately instead of waiting another 60-90 seconds.
                if ok and bool(pending_target.get("hasAuthorReplyInThread")):
                    work_key = str(pending_target.get("workKey", "") or getattr(self, "comment_current_work_key", "") or "")
                    duration_ms = self._comment_followup_watch_duration_ms() if hasattr(self, "_comment_followup_watch_duration_ms") else 600000
                    self.comment_followup_watch_until_ms = self._now_ms() + max(60000, int(duration_ms or 600000))
                    self.comment_followup_watch_work_key = work_key
                    self.comment_followup_watch_thread_key = str(pending_target.get("threadKey", "") or "")
                    self.comment_followup_watch_signature = ""
                    self.comment_followup_watch_refresh_count = 0
                    self.comment_followup_watch_last_refresh_key = ""
                    self.comment_runtime_cooldown_until_ms = 0
                    self.comment_runtime_cooldown_reason = ""
                    self.comment_runtime_cooldown_reset_cycle_on_exit = False
                    if work_key and hasattr(self, "comment_completed_work_keys"):
                        self.comment_completed_work_keys.discard(work_key)
                    if hasattr(self, "_comment_set_flow_stage"):
                        self._comment_set_flow_stage("scan_candidates_under_unreplied", None, reason="expanded_replied_thread_followup_scan")
                    self._log("INFO", f"评论已回复线程展开后进入追问快速巡检: {json.dumps({'workKey': work_key, 'threadKey': self.comment_followup_watch_thread_key}, ensure_ascii=False)}")
                    self._schedule_fast_comment_inspect(2300)
                    return

                delay_ms = 2200 if ok else 4500
                self._schedule_fast_comment_inspect(delay_ms)

    def _comment_should_defer_filter_after_switch(self, result: dict[str, Any]) -> bool:
                return False

    def _comment_work_switch_enabled(self) -> bool:
                """当前阶段先只走基础回复链路，作品切换链路默认关闭。"""
                config = self.comment_runtime_config if isinstance(getattr(self, "comment_runtime_config", None), dict) else {}
                work_cfg = config.get("work", {}) if isinstance(config.get("work"), dict) else {}
                return bool(work_cfg.get("enable_switch", False))

    def _comment_filtered_list_has_data(self, result: dict[str, Any]) -> bool:
                counts = result.get("counts", {}) or {}
                top_comments = int(counts.get("topComments", 0) or 0)
                visible_cards = int(counts.get("visibleCardCount", 0) or 0)
                candidate_count = self._comment_candidate_count(result)
                return top_comments > 0 or visible_cards > 0 or candidate_count > 0

    def _comment_filtered_list_min_observe_ms(self, result: dict[str, Any]) -> int:
                return 2500 if self._comment_filtered_list_has_data(result) else 12000

    def _comment_filtered_list_required_streak(self, result: dict[str, Any]) -> int:
                return 2 if self._comment_filtered_list_has_data(result) else 4

    def _comment_filtered_list_force_scan_ms(self, result: dict[str, Any]) -> int:
                return 18000 if self._comment_filtered_list_has_data(result) else 35000

    def _comment_work_config(self) -> dict[str, Any]:
                config = self.comment_runtime_config if isinstance(getattr(self, "comment_runtime_config", None), dict) else {}
                work_cfg = config.get("work", {}) if isinstance(config.get("work"), dict) else {}
                return work_cfg

    def _comment_max_work_process_ms(self) -> int:
                work_cfg = self._comment_work_config()
                return int(work_cfg.get("max_process_ms", 90000) or 90000)

    def _comment_max_replies_per_work(self) -> int:
                work_cfg = self._comment_work_config()
                return int(work_cfg.get("max_replies_per_work", 20) or 20)

    def _comment_ensure_work_budget_tracking(self, result: dict[str, Any]) -> None:
                work_key = self._comment_current_work_key(result)
                if not work_key:
                    return
                if str(getattr(self, "comment_current_work_key", "") or "") != work_key:
                    self.comment_current_work_key = work_key
                    self.comment_current_work_started_ms = self._now_ms()
                    self.comment_current_work_ready_count = 0
                    self.comment_current_work_budget_logged = False

    def _comment_note_reply_action_confirmed(self, payload: dict[str, Any] | None = None) -> None:
                self.comment_current_work_ready_count = int(getattr(self, "comment_current_work_ready_count", 0) or 0) + 1
                self._log(
                    "INFO",
                    f"{TRACE_FILTER_RUNTIME} | reply_action_confirmed | workKey={str(getattr(self, 'comment_current_work_key', '') or '')} | readyCount={int(getattr(self, 'comment_current_work_ready_count', 0) or 0)} | threadKey={str((payload or {}).get('threadKey', '') or '')}",
                )

    def _comment_work_budget_exceeded(self, result: dict[str, Any]) -> bool:
                if not self._comment_work_switch_enabled():
                    return False
                self._comment_ensure_work_budget_tracking(result)
                work_key = self._comment_current_work_key(result)
                if not work_key or work_key in self.comment_completed_work_keys:
                    return False
                started_ms = int(getattr(self, "comment_current_work_started_ms", 0) or 0)
                elapsed_ms = self._now_ms() - started_ms if started_ms else 0
                ready_count = int(getattr(self, "comment_current_work_ready_count", 0) or 0)
                work_cfg = self._comment_work_config() if hasattr(self, "_comment_work_config") else {}
                max_ms = self._comment_max_work_process_ms()
                max_count = self._comment_max_replies_per_work()
                counts = result.get("counts", {}) if isinstance(result.get("counts"), dict) else {}
                visible_count = int(counts.get("visibleCardCount", 0) or 0)
                top_count = int(counts.get("topComments", 0) or 0)
                raw_unreplied = int(counts.get("unrepliedHeuristic", 0) or 0)
                skipped_count = int(counts.get("replySkipped", 0) or 0)
                collapsed_count = int(counts.get("collapsedReplyThreads", 0) or 0)
                reply_editors = int(counts.get("replyEditors", 0) or 0)
                candidates = self._comment_candidate_count(result) if hasattr(self, "_comment_candidate_count") else 0

                # Time budget must not preempt a fresh scan of the current work. In the failing log,
                # the controller waited for the run window, then the old wall-clock budget opened
                # the work drawer before rescanning visible/nested comments, causing refresh loops
                # and eventually a false module-mount timeout. Keep the hard cap by reply count,
                # and only allow elapsed-time switching when explicitly enabled and the list is
                # visibly idle.
                elapsed_budget_enabled = bool(work_cfg.get("enable_elapsed_budget", False))
                scan_ready = self._comment_is_scan_stage_ready(result) if hasattr(self, "_comment_is_scan_stage_ready") else True
                current_work_unsettled = bool(
                    not scan_ready
                    or top_count <= 0
                    or visible_count <= 0
                    or candidates > 0
                    or raw_unreplied > 0
                    or skipped_count > 0
                    or collapsed_count > 0
                    or reply_editors > 0
                )
                count_exceeded = bool(max_count > 0 and ready_count >= max_count)
                elapsed_exceeded = bool(elapsed_budget_enabled and max_ms > 0 and elapsed_ms >= max_ms and not current_work_unsettled)
                exceeded = bool(count_exceeded or elapsed_exceeded)
                if exceeded and not bool(getattr(self, "comment_current_work_budget_logged", False)):
                    self.comment_current_work_budget_logged = True
                    self._comment_set_flow_stage("work_time_budget_exceeded", result, reason="work_budget_exceeded")
                    self._log(
                        "INFO",
                        f"{TRACE_FILTER_RUNTIME} | work_decision=switch_due_to_time_budget | workKey={work_key} | elapsedMs={elapsed_ms} | maxWorkProcessMs={max_ms} | readyCount={ready_count} | maxRepliesPerWork={max_count}",
                    )
                return exceeded

    def _comment_set_flow_stage(self, stage: str, result: dict[str, Any] | None = None, *, reset: bool = False, reason: str = "") -> None:
                work_key = self._comment_resolve_stage_work_key(result if isinstance(result, dict) else None)
                previous_stage = str(getattr(self, "comment_stage_name", "") or "")
                previous_work_key = str(getattr(self, "comment_stage_work_key", "") or "")
                if not reset and previous_stage == stage and previous_work_key == work_key:
                    return
                self.comment_stage_name = stage
                self.comment_stage_work_key = work_key
                self.comment_stage_since_ms = self._now_ms()
                self.comment_stage_stable_streak = 0
                self.comment_stage_last_signature = ""
                self.comment_stage_last_log_ms = 0
                payload = {
                    "from": previous_stage,
                    "to": stage,
                    "workKey": work_key,
                }
                if reason:
                    payload["reason"] = reason
                if self._comment_reply_editor_active_stage(stage):
                    payload["workKeySource"] = "resolved_for_reply_editor_stage"
                if self._comment_verbose_logs_enabled():
                    self._log("INFO", f"{TRACE_FILTER_RUNTIME} | flow_stage={json.dumps(payload, ensure_ascii=False)}")

    def _comment_is_scan_stage_ready(self, result: dict[str, Any]) -> bool:
                if not self._comment_filter_ready(result):
                    return False
                if self.comment_pending_switch_target is not None or self.comment_pending_filter_target is not None:
                    return False
                stage = str(getattr(self, "comment_stage_name", "") or "")
                work_key = self._comment_current_work_key(result)
                stage_work_key = str(getattr(self, "comment_stage_work_key", "") or "")
                if stage and stage_work_key and stage_work_key != work_key:
                    return False
                return stage == "scan_candidates_under_unreplied"

    def _comment_update_flow_stage(self, result: dict[str, Any]) -> None:
                if not self.running or not self.ready or self.current_module != "comment":
                    return
                work_key = self._comment_current_work_key(result)
                if not work_key:
                    return
                self._comment_ensure_work_budget_tracking(result)
                stage = str(getattr(self, "comment_stage_name", "") or "")
                stage_work_key = str(getattr(self, "comment_stage_work_key", "") or "")
                if stage_work_key and stage_work_key != work_key and self.comment_pending_switch_target is None:
                    if self._comment_reply_editor_active_stage(stage) or bool(getattr(self, "comment_active_reply_target", None)) or bool(getattr(self, "comment_pending_reply_target", None)) or bool(getattr(self, "comment_pending_draft_probe_target", None)):
                        previous_stage_work_key = stage_work_key
                        self.comment_stage_work_key = work_key
                        stage_work_key = work_key
                        now_ms = self._now_ms()
                        if now_ms - int(getattr(self, "comment_reply_editor_work_key_guard_last_log_ms", 0) or 0) >= 500:
                            self.comment_reply_editor_work_key_guard_last_log_ms = now_ms
                            guard_payload = {"stage": stage, "previousStageWorkKey": previous_stage_work_key, "currentWorkKey": work_key, "decision": "preserve_stage_refresh_work_key", "reason": "active_reply_or_draft_stage"}
                            self._log("INFO", f"{TRACE_FILTER_RUNTIME} | reply_editor_work_key_guard={json.dumps(guard_payload, ensure_ascii=False)}")
                    else:
                        self._comment_set_flow_stage("ensure_unreplied_filter", result, reason="work_key_changed")
                        stage = self.comment_stage_name
                if self.comment_pending_switch_target is not None:
                    return
                if not self._comment_filter_ready(result):
                    if stage != "ensure_unreplied_filter":
                        self._comment_set_flow_stage("ensure_unreplied_filter", result, reason="target_filter_required")
                    return
                if self.comment_pending_filter_target is not None:
                    if stage != "ensure_unreplied_filter":
                        self._comment_set_flow_stage("ensure_unreplied_filter", result, reason="pending_filter_switch")
                    return
                if stage in {"reply_candidate_selected", "reply_editor_opening", "reply_editor_confirmed", "reply_editor_focus_retry", "reply_editor_post_focus_stabilizing", "reply_editor_stable", "reply_editor_ready_for_draft", "reply_draft_inject_probe", "reply_draft_reactivate_probe", "reply_draft_verified",
                        "manual_send_hold", "reply_editor_lost_hold", "reply_editor_recovering"}:
                    if stage == "manual_send_hold":
                        pending_draft = self.comment_pending_draft_probe_target if isinstance(getattr(self, "comment_pending_draft_probe_target", None), dict) else {}
                        if pending_draft and not self.comment_active_reply_target:
                            self.comment_active_reply_target = {
                                "threadKey": str(pending_draft.get("threadKey", "") or ""),
                                "author": str(pending_draft.get("author", "") or ""),
                                "content": str(pending_draft.get("content", "") or ""),
                                "timeText": str(pending_draft.get("timeText", "") or ""),
                            }
                            self._log("INFO", f"{TRACE_FILTER_RUNTIME} | manual_send_hold_preserve_active_target | threadKey={pending_draft.get('threadKey', '')} | author={pending_draft.get('author', '')} | reason=restore_from_verified_draft")
                        return
                    if not self.comment_pending_reply_target and not self.comment_active_reply_target:
                        self._comment_set_flow_stage("scan_candidates_under_unreplied", result, reason="reply_editor_stage_without_active_target")
                    return
                counts = result.get("counts", {}) or {}
                top_comments = int(counts.get("topComments", 0) or 0)
                visible_cards = int(counts.get("visibleCardCount", 0) or 0)
                candidate_count = self._comment_candidate_count(result)
                signature = f"{top_comments}|{visible_cards}|{candidate_count}|{self._comment_filter_text(result)}"
                if stage not in {"await_filtered_list_stable", "scan_candidates_under_unreplied", "completed_under_unreplied"}:
                    self._comment_set_flow_stage("await_filtered_list_stable", result, reason="target_filter_confirmed")
                    stage = self.comment_stage_name
                if stage == "await_filtered_list_stable":
                    if self.comment_stage_last_signature == signature:
                        self.comment_stage_stable_streak += 1
                    else:
                        self.comment_stage_last_signature = signature
                        self.comment_stage_stable_streak = 1
                    now_ms = self._now_ms()
                    elapsed_ms = now_ms - int(getattr(self, "comment_stage_since_ms", 0) or 0)
                    has_data = self._comment_filtered_list_has_data(result)
                    min_observe_ms = self._comment_filtered_list_min_observe_ms(result)
                    required_streak = self._comment_filtered_list_required_streak(result)
                    force_scan_ms = self._comment_filtered_list_force_scan_ms(result)
                    if now_ms - int(getattr(self, "comment_stage_last_log_ms", 0) or 0) >= 1200:
                        self.comment_stage_last_log_ms = now_ms
                        if self._comment_verbose_logs_enabled():
                            self._log("INFO", f"{TRACE_FILTER_RUNTIME} | flow_stage_detail={json.dumps({'stage': 'await_filtered_list_stable', 'workKey': work_key, 'stableStreak': self.comment_stage_stable_streak, 'requiredStreak': required_streak, 'hasData': has_data, 'minObserveMs': min_observe_ms, 'forceScanMs': force_scan_ms, 'topComments': top_comments, 'visibleCardCount': visible_cards, 'candidateCount': candidate_count, 'elapsedMs': elapsed_ms}, ensure_ascii=False)}")
                    if self.comment_stage_stable_streak >= required_streak and elapsed_ms >= min_observe_ms:
                        reason = "filtered_list_stable_with_data" if has_data else "filtered_list_stable_empty"
                        self._comment_set_flow_stage("scan_candidates_under_unreplied", result, reason=reason)
                    elif elapsed_ms >= force_scan_ms:
                        self._comment_set_flow_stage("scan_candidates_under_unreplied", result, reason="filtered_list_force_advance_timeout")
                elif stage == "scan_candidates_under_unreplied":
                    return

    def _maybe_confirm_comment_filter(self, result: dict[str, Any]) -> None:
                pending = self.comment_pending_filter_target
                if not pending:
                    return
                if not self._comment_filter_enforced():
                    self._log("INFO", f"{TRACE_FILTER_RUNTIME} | filter_confirm=cleared_because_filter_disabled | currentFilter={self._comment_filter_text(result)}")
                    self.comment_pending_filter_target = None
                    return
                filter_info = result.get("commentFilter", {}) or {}
                selected_text = str(filter_info.get("selectedText", "") or "")
                if selected_text == self.comment_target_filter_text:
                    self._log(
                        "INFO",
                        f"评论页筛选切换确认成功: {json.dumps({'targetText': self.comment_target_filter_text, 'selectedText': selected_text, 'attemptNo': pending.get('attemptNo', 0)}, ensure_ascii=False)}",
                    )
                    self.comment_pending_filter_target = None
                    self._comment_set_flow_stage("await_filtered_list_stable", result, reason="filter_confirmed")
                    return
                attempt_ms = int(pending.get("attemptMs", 0) or 0)
                if attempt_ms and self._now_ms() - attempt_ms >= 8000:
                    self._log(
                        "WARN",
                        f"评论页筛选切换确认超时: {json.dumps({'targetText': self.comment_target_filter_text, 'selectedText': selected_text, 'attemptNo': pending.get('attemptNo', 0)}, ensure_ascii=False)}",
                    )
                    self.comment_pending_filter_target = None

    def _update_comment_empty_observation(self, result: dict[str, Any]) -> None:
                work_key = self._comment_current_work_key(result)
                counts = result.get("counts", {}) or {}
                top_comments = int(counts.get("topComments", 0) or 0)
                heuristic_count = self._comment_candidate_count(result)
                reply_editors = int(counts.get("replyEditors", 0) or 0)
                if top_comments > 0 or heuristic_count > 0 or reply_editors > 0:
                    self.comment_empty_observed_work_key = ""
                    self.comment_empty_observed_count = 0
                    return
                if not work_key:
                    self.comment_empty_observed_work_key = ""
                    self.comment_empty_observed_count = 0
                    return
                if self.comment_empty_observed_work_key == work_key:
                    self.comment_empty_observed_count += 1
                else:
                    self.comment_empty_observed_work_key = work_key
                    self.comment_empty_observed_count = 1

    def _maybe_mark_comment_work_completed(self, result: dict[str, Any]) -> None:
                work_key = self._comment_current_work_key(result)
                if not work_key or work_key in self.comment_completed_work_keys:
                    return
                if not self._comment_filter_ready(result):
                    return
                stage = str(getattr(self, "comment_stage_name", "") or "")
                if stage in {"reply_candidate_selected", "reply_editor_opening", "reply_editor_confirmed", "reply_editor_focus_retry", "reply_editor_post_focus_stabilizing", "reply_editor_stable", "reply_editor_ready_for_draft", "reply_draft_inject_probe", "reply_draft_reactivate_probe", "reply_draft_verified",
                        "manual_send_hold", "reply_editor_lost_hold", "reply_editor_recovering"} or self.comment_pending_reply_target is not None or self.comment_active_reply_target is not None:
                    now_ms = self._now_ms()
                    if now_ms - int(getattr(self, "comment_stage_last_log_ms", 0) or 0) >= 1200:
                        self.comment_stage_last_log_ms = now_ms
                        if self._comment_verbose_logs_enabled():
                            self._log("INFO", f"{TRACE_FILTER_RUNTIME} | complete_decision=deferred_due_to_reply_editor_stage | workKey={work_key} | stage={stage} | currentFilter={self._comment_filter_text(result)} | pendingReply={self.comment_pending_reply_target is not None} | activeTarget={self.comment_active_reply_target is not None}")
                    return
                if not self._comment_is_scan_stage_ready(result):
                    now_ms = self._now_ms()
                    if now_ms - int(getattr(self, "comment_stage_last_log_ms", 0) or 0) >= 1200:
                        self.comment_stage_last_log_ms = now_ms
                        self._log("INFO", f"{TRACE_FILTER_RUNTIME} | complete_decision=deferred_until_scan_stage_ready | workKey={work_key} | stage={stage} | currentFilter={self._comment_filter_text(result)}")
                    return
                if self.comment_pending_switch_target is not None or self.comment_pending_filter_target is not None:
                    return
                if self._comment_work_budget_exceeded(result):
                    return
                if self.comment_pending_reply_target is not None or self.comment_pending_draft_probe_target is not None:
                    return
                if self.comment_pending_send_payload is not None or self.comment_pending_reply_future is not None:
                    return
                if self.comment_active_reply_target is not None:
                    return
                work_drawer = result.get("workDrawer", {}) or {}
                if work_drawer.get("found"):
                    return
                counts = result.get("counts", {}) or {}
                top_comments = int(counts.get("topComments", 0) or 0)
                heuristic_count = self._comment_candidate_count(result)
                raw_unreplied_count = int(counts.get("unrepliedHeuristic", 0) or 0)
                skipped_count = int(counts.get("replySkipped", 0) or 0)
                reply_editors = int(counts.get("replyEditors", 0) or 0)
                if heuristic_count > 0 or reply_editors > 0:
                    return
                # 有原始未回复但被候选过滤跳过时，不判定当前作品完成，避免基础链路尚未走通就进入后续作品逻辑。
                if top_comments > 0 and (raw_unreplied_count > 0 or skipped_count > 0):
                    skipped_samples = result.get("replySkippedSamples", []) or []
                    skipped_reasons = [str((item or {}).get("skipReason", "") or "") for item in skipped_samples if isinstance(item, dict)]
                    terminal_skip_reasons = {
                        "already_completed",
                        "top_already_replied_by_author",
                        "last_effective_from_author",
                        "author_missing",
                        "empty_content",
                        "content_too_short",
                        "keyword_blocked",
                    }
                    terminal_skipped = bool(skipped_reasons) and all(reason in terminal_skip_reasons for reason in skipped_reasons) and skipped_count >= max(1, raw_unreplied_count)
                    if terminal_skipped:
                        complete_reason = "all_unreplied_terminal_skipped"
                        if all(reason == "already_completed" for reason in skipped_reasons):
                            complete_reason = "all_unreplied_dry_run_completed"
                        if self._comment_defer_work_done_for_followup_watch(result, work_key, reason=complete_reason):
                            return
                        self.comment_completed_work_keys.add(work_key)
                        self.comment_active_reply_target = None
                        self._comment_set_flow_stage("completed_under_unreplied", result, reason=complete_reason)
                        self._log(
                            "INFO",
                            f"评论页当前作品已完成: {json.dumps({'workKey': work_key, 'topComments': top_comments, 'completedReplies': skipped_count, 'reason': complete_reason, 'skipReasons': ','.join(sorted(set(skipped_reasons)))[:120]}, ensure_ascii=False)}",
                        )
                        cooldown_cfg = self._comment_runtime_cooldown_config() if hasattr(self, "_comment_runtime_cooldown_config") else {}
                        self._comment_enter_runtime_cooldown(
                            "work_done",
                            min_ms=int(cooldown_cfg.get("after_work_done_min_ms", cooldown_cfg.get("after_work_done_ms", 75000)) or 75000),
                            max_ms=int(cooldown_cfg.get("after_work_done_max_ms", cooldown_cfg.get("after_work_done_ms", 75000)) or 75000),
                        )
                        return
                    now_ms = self._now_ms()
                    if now_ms - int(getattr(self, "comment_complete_defer_last_log_ms", 0) or 0) >= 30000:
                        self.comment_complete_defer_last_log_ms = now_ms
                        self._log("INFO", f"评论页等待未完成候选: {json.dumps({'workKey': work_key, 'top': top_comments, 'raw': raw_unreplied_count, 'skipped': skipped_count, 'skipReasons': ','.join(sorted(set(skipped_reasons)))[:120]}, ensure_ascii=False)}")
                    return
                if top_comments <= 0 and self.comment_empty_observed_count < 2:
                    return
                if self._comment_defer_work_done_for_followup_watch(result, work_key, reason="work_completed_no_candidates"):
                    return
                self.comment_completed_work_keys.add(work_key)
                self.comment_active_reply_target = None
                self._comment_set_flow_stage("completed_under_unreplied", result, reason="work_completed")
                self._log(
                    "INFO",
                    f"评论页当前作品已完成: {json.dumps({'workKey': work_key, 'topComments': top_comments, 'unrepliedHeuristic': heuristic_count}, ensure_ascii=False)}",
                )
                cooldown_cfg = self._comment_runtime_cooldown_config() if hasattr(self, "_comment_runtime_cooldown_config") else {}
                self._comment_enter_runtime_cooldown(
                    "work_done",
                    min_ms=int(cooldown_cfg.get("after_work_done_min_ms", cooldown_cfg.get("after_work_done_ms", 75000)) or 75000),
                    max_ms=int(cooldown_cfg.get("after_work_done_max_ms", cooldown_cfg.get("after_work_done_ms", 75000)) or 75000),
                )

    def _should_open_comment_workdrawer(self, result: dict[str, Any]) -> bool:
                if not self._comment_work_switch_enabled():
                    return False
                if hasattr(self, "_comment_runtime_cooldown_should_skip") and self._comment_runtime_cooldown_should_skip():
                    return False
                if self.comment_all_known_works_completed:
                    return False
                work_key = self._comment_current_work_key(result) if hasattr(self, "_comment_current_work_key") else ""
                if self._comment_followup_watch_active(work_key):
                    return False
                if self._comment_work_completed(result):
                    return True
                if self._comment_flow_stage_blocks_work_switch(result):
                    self._comment_log_flow_stage_block(result, "switch_decision")
                    return False
                if not self._comment_is_scan_stage_ready(result):
                    self._comment_log_flow_stage_block(result, "complete_decision")
                    return False
                if self._comment_work_budget_exceeded(result):
                    return True
                return False

    def _maybe_close_comment_workdrawer(self, result: dict[str, Any]) -> None:
                if not self.running or not self.ready or self.current_module != "comment" or not self.page:
                    return
                work_drawer = result.get("workDrawer", {}) or {}
                if not work_drawer.get("found"):
                    return
                if self.comment_pending_switch_target is not None or self.comment_pending_draft_probe_target is not None:
                    return
                if self.comment_pending_reply_target is not None or self.comment_pending_send_payload is not None:
                    return
                counts = result.get("counts", {}) or {}
                heuristic_count = self._comment_candidate_count(result)
                reply_editors = int(counts.get("replyEditors", 0) or 0)
                if self._comment_work_completed(result):
                    return
                if heuristic_count <= 0 and reply_editors <= 0:
                    return
                now_ms = self._now_ms()
                if now_ms - self.comment_last_drawer_close_attempt_ms < 2500:
                    return
                self.comment_last_drawer_close_attempt_ms = now_ms
                self.comment_drawer_close_attempts += 1
                self.busy = True
                payload = {
                    "attemptNo": self.comment_drawer_close_attempts,
                    "currentWorkTitle": str((result.get("header", {}) or {}).get("currentWorkTitle", "") or ""),
                    "unrepliedHeuristic": heuristic_count,
                    "replyEditors": reply_editors,
                }
                self._log("INFO", f"评论页检测到作品侧栏遮挡主链，准备关闭侧栏: {json.dumps(payload, ensure_ascii=False)}")
                self.page.runJavaScript(build_comment_close_workdrawer_script(), self._handle_comment_close_workdrawer_result)

    def _comment_schedule_filter_option_retry(self, target_text: str, delay_ms: int = 360) -> None:
                def _retry() -> None:
                    if not self.running or not self.ready or self.current_module != "comment" or not self.page:
                        return
                    pending = self.comment_pending_filter_target if isinstance(getattr(self, "comment_pending_filter_target", None), dict) else {}
                    if not pending or str(pending.get("targetText", "") or "") != target_text:
                        return
                    if self.busy:
                        QTimer.singleShot(180, _retry)
                        return
                    retry_no = int(pending.get("quickRetryNo", 0) or 0) + 1
                    if retry_no > 2:
                        return
                    pending["quickRetryNo"] = retry_no
                    pending["quickRetryAtMs"] = self._now_ms()
                    self.comment_pending_filter_target = pending
                    self.busy = True
                    self._log("INFO", f"{TRACE_FILTER_RUNTIME} | filter_option_quick_retry=run | targetFilter={target_text} | retryNo={retry_no} | decision=select_visible_option_without_waiting_timeout")
                    self.page.runJavaScript(
                        build_comment_set_filter_script(target_text),
                        self._handle_comment_set_filter_result,
                    )
                QTimer.singleShot(max(0, int(delay_ms or 0)), _retry)

    def _maybe_select_comment_filter(self, result: dict[str, Any]) -> None:
                now_ms = self._now_ms()
                if now_ms - int(getattr(self, "comment_trace_filter_decision_last_ms", 0) or 0) >= 1200:
                    self.comment_trace_filter_decision_last_ms = now_ms
                    if self._comment_verbose_logs_enabled():
                        self._log("INFO", f"{TRACE_FILTER_RUNTIME} | entry=_maybe_select_comment_filter | currentWorkTitle={str((result.get('header', {}) or {}).get('currentWorkTitle', '') or '')} | currentFilter={self._comment_filter_text(result)} | candidateCount={self._comment_candidate_count(result)} | pendingSwitch={self.comment_pending_switch_target is not None} | pendingFilter={self.comment_pending_filter_target is not None} | pendingReply={self.comment_pending_reply_target is not None} | pendingDraft={self.comment_pending_draft_probe_target is not None}")
                if not self.running or not self.ready or self.current_module != "comment" or not self.page:
                    return
                if not self._comment_filter_enforced():
                    if now_ms - int(getattr(self, "comment_filter_disabled_last_log_ms", 0) or 0) >= 5000:
                        self.comment_filter_disabled_last_log_ms = now_ms
                        if self._comment_verbose_logs_enabled():
                            self._log("INFO", f"{TRACE_FILTER_RUNTIME} | filter_decision=disabled_scan_current_visible | currentFilter={self._comment_filter_text(result)} | targetFilter={getattr(self, 'comment_target_filter_text', '')} | candidateCount={self._comment_candidate_count(result)}")
                    return
                if str(getattr(self, "comment_stage_name", "") or "") in {"reply_editor_confirmed", "reply_editor_focus_retry", "reply_editor_post_focus_stabilizing", "reply_editor_stable", "reply_editor_ready_for_draft", "reply_draft_inject_probe", "reply_draft_reactivate_probe", "reply_draft_verified",
                        "manual_send_hold", "reply_editor_lost_hold", "reply_editor_recovering"} or bool(getattr(self, "comment_active_reply_target", None)):
                    now_ms = self._now_ms()
                    if now_ms - int(getattr(self, "comment_filter_skip_active_editor_last_log_ms", 0) or 0) >= 1500:
                        self.comment_filter_skip_active_editor_last_log_ms = now_ms
                        if self._comment_verbose_logs_enabled():
                            self._log("INFO", f"{TRACE_FILTER_RUNTIME} | filter_decision=skipped_due_to_active_reply_editor | stage={str(getattr(self, 'comment_stage_name', '') or '')} | currentFilter={self._comment_filter_text(result)} | candidateCount={self._comment_candidate_count(result)} | activeTarget={bool(getattr(self, 'comment_active_reply_target', None))}")
                    return
                if self.comment_pending_filter_target is not None:
                    return
                if self.comment_pending_switch_target is not None or self.comment_pending_reply_target is not None or self.comment_pending_draft_probe_target is not None:
                    return
                if (result.get("workDrawer", {}) or {}).get("found"):
                    return
                composers = result.get("composers", {}) or {}
                if composers.get("replyEditors"):
                    return
                if self._comment_should_defer_filter_after_switch(result):
                    self._log("INFO", f"{TRACE_FILTER_RUNTIME} | filter_decision=defer_after_switch | currentWorkTitle={str((result.get('header', {}) or {}).get('currentWorkTitle', '') or '')} | currentFilter={self._comment_filter_text(result)} | candidateCount={self._comment_candidate_count(result)}")
                    return
                if self._comment_has_ready_candidates(result) and self._comment_filter_ready(result):
                    self._log("INFO", f"{TRACE_FILTER_RUNTIME} | filter_decision=already_ready_with_candidates | currentWorkTitle={str((result.get('header', {}) or {}).get('currentWorkTitle', '') or '')} | currentFilter={self._comment_filter_text(result)} | targetFilter={self.comment_target_filter_text} | candidateCount={self._comment_candidate_count(result)}")
                    return
                filter_info = result.get("commentFilter", {}) or {}
                if not filter_info.get("found"):
                    return
                selected_text = str(filter_info.get("selectedText", "") or "")
                if selected_text == self.comment_target_filter_text:
                    return
                now_ms = self._now_ms()
                if now_ms - self.comment_last_filter_attempt_ms < 3000:
                    return
                self._log("INFO", f"{TRACE_FILTER_RUNTIME} | filter_decision=trigger_switch | mode=normal_filter_first | currentWorkTitle={str((result.get('header', {}) or {}).get('currentWorkTitle', '') or '')} | currentFilter={selected_text} | targetFilter={self.comment_target_filter_text} | candidateCount={self._comment_candidate_count(result)}")
                self.comment_last_filter_attempt_ms = now_ms
                self.comment_filter_attempts += 1
                self.comment_pending_filter_target = {
                    "targetText": self.comment_target_filter_text,
                    "currentText": selected_text,
                    "attemptMs": now_ms,
                    "attemptNo": self.comment_filter_attempts,
                    "currentWorkTitle": str((result.get("header", {}) or {}).get("currentWorkTitle", "") or ""),
                }
                self.busy = True
                if hasattr(self, "_comment_note_editor_risky_action"):
                    self._comment_note_editor_risky_action("set_comment_filter", result=result, extra=dict(self.comment_pending_filter_target))
                self._log("INFO", f"评论页准备切换评论筛选: {json.dumps(self.comment_pending_filter_target, ensure_ascii=False)}")
                self.page.runJavaScript(
                    build_comment_set_filter_script(self.comment_target_filter_text),
                    self._handle_comment_set_filter_result,
                )

    def _handle_comment_set_filter_result(self, result: Any) -> None:
                self.busy = False
                result = self._coerce_js_result(result)
                if not isinstance(result, dict):
                    self._log("WARN", f"评论页切换评论筛选结果异常，类型={type(result).__name__}，内容片段={str(result)[:240]}")
                    self.comment_pending_filter_target = None
                    self._schedule_fast_comment_inspect(900)
                    return
                if result.get("ok"):
                    self._log("INFO", f"评论页切换评论筛选动作已执行: {json.dumps(result, ensure_ascii=False)}")
                    state = str(result.get("state", "") or "")
                    if state in {"trigger_clicked", "popup_visible_but_option_missing"}:
                        pending = self.comment_pending_filter_target if isinstance(getattr(self, "comment_pending_filter_target", None), dict) else {}
                        quick_retry_no = int(pending.get("quickRetryNo", 0) or 0)
                        if quick_retry_no < 2:
                            self._log("INFO", f"{TRACE_FILTER_RUNTIME} | filter_option_quick_retry=scheduled | state={state} | targetFilter={str(result.get('targetText', '') or '')} | retryNo={quick_retry_no + 1} | decision=avoid_full_confirm_timeout")
                            self._comment_schedule_filter_option_retry(str(result.get("targetText", "") or self.comment_target_filter_text), delay_ms=360 if quick_retry_no == 0 else 720)
                            self._schedule_fast_comment_inspect(650)
                            return
                else:
                    self._log("WARN", f"评论页切换评论筛选失败: {json.dumps(result, ensure_ascii=False)}")
                    self.comment_pending_filter_target = None
                self._schedule_fast_comment_inspect(900)

    def _maybe_open_comment_workdrawer(self, result: dict[str, Any]) -> None:
                if not self._comment_work_switch_enabled():
                    return
                if not self.running or not self.ready or self.current_module != "comment" or not self.page:
                    return
                if hasattr(self, "_comment_runtime_cooldown_should_skip") and self._comment_runtime_cooldown_should_skip():
                    remaining_ms = self._comment_runtime_cooldown_remaining_ms() if hasattr(self, "_comment_runtime_cooldown_remaining_ms") else 0
                    if hasattr(self, "_comment_runtime_cooldown_log_wait"):
                        self._comment_runtime_cooldown_log_wait(remaining_ms)
                    return
                work_drawer = result.get("workDrawer", {}) or {}
                work_selector = result.get("workSelector", {}) or {}
                counts = result.get("counts", {}) or {}
                if work_drawer.get("found"):
                    return
                if not work_selector.get("found"):
                    return
                if self._comment_flow_stage_blocks_work_switch(result):
                    self._comment_log_flow_stage_block(result, "switch_decision")
                    return
                if self.comment_pending_filter_target is not None or self.comment_pending_reply_target is not None or self.comment_pending_draft_probe_target is not None:
                    return
                composers = result.get("composers", {}) or {}
                if composers.get("replyEditors"):
                    return
                if self._comment_work_completed(result) and self._comment_known_single_work_recent():
                    payload = {
                        "workKey": self._comment_current_work_key(result) if hasattr(self, "_comment_current_work_key") else "",
                        "knownWorkCount": int(getattr(self, "comment_known_work_count", 0) or 0),
                    }
                    self._log("INFO", f"评论页已确认单作品，跳过作品侧栏并直接刷新当前作品: {json.dumps(payload, ensure_ascii=False)}")
                    if self._comment_trigger_same_work_refresh(result, reason="single_work_completed_refresh_current_work"):
                        return
                    if hasattr(self, "_comment_same_work_refresh_wait_until_retry") and self._comment_same_work_refresh_wait_until_retry("single_work_refresh_wait_min_interval"):
                        return
                    return
                if not self._should_open_comment_workdrawer(result):
                    return
                now_ms = self._now_ms()
                if now_ms - self.comment_last_drawer_open_attempt_ms < 6000:
                    return
                self.comment_last_drawer_open_attempt_ms = now_ms
                self.comment_drawer_open_attempts += 1
                try:
                    self.comment_workdrawer_open_followup_reason = (
                        "open_after_work_completed" if self._comment_work_completed(result) else "open_after_work_budget"
                    )
                    self.comment_workdrawer_open_followup_work_key = self._comment_current_work_key(result) if hasattr(self, "_comment_current_work_key") else ""
                except Exception:
                    self.comment_workdrawer_open_followup_reason = "open_after_workdrawer"
                    self.comment_workdrawer_open_followup_work_key = ""
                self.busy = True
                self._log(
                    "INFO",
                    f"评论页准备打开作品侧栏: {json.dumps({'attemptNo': self.comment_drawer_open_attempts, 'currentWorkTitle': (result.get('header', {}) or {}).get('currentWorkTitle', ''), 'workItems': counts.get('workItems', 0)}, ensure_ascii=False)}",
                )
                self.page.runJavaScript(build_comment_open_workdrawer_script(), self._handle_comment_open_workdrawer_result)

    def _handle_comment_open_workdrawer_result(self, result: Any) -> None:
                self.busy = False
                result = self._coerce_js_result(result)
                if not isinstance(result, dict):
                    self._log("WARN", f"评论页打开作品侧栏结果异常，类型={type(result).__name__}，内容片段={str(result)[:240]}")
                    self._schedule_fast_comment_inspect(1200)
                    return
                if result.get("ok"):
                    self._log("INFO", f"评论页打开作品侧栏动作已执行: {json.dumps(result, ensure_ascii=False)}")
                    # 选择作品按钮只是打开侧栏，不会刷新评论列表。打开后必须继续
                    # 探测侧栏内容：有其他作品则切换；没有可切换作品则刷新当前作品。
                    self._schedule_comment_workdrawer_followup(850)
                else:
                    self._log("WARN", f"评论页打开作品侧栏失败: {json.dumps(result, ensure_ascii=False)}")
                    self._schedule_fast_comment_inspect(1200)

    def _schedule_comment_workdrawer_followup(self, delay_ms: int = 850) -> None:
                def _fire(retry_no: int = 0) -> None:
                    if not self.running or not self.ready or self.current_module != "comment" or not self.page:
                        return
                    if self.busy:
                        if retry_no < 20:
                            QTimer.singleShot(300, lambda: _fire(retry_no + 1))
                        return
                    self.busy = True
                    self.page.runJavaScript(build_comment_inspect_script(), self._handle_comment_workdrawer_followup_inspect_result)
                QTimer.singleShot(max(0, int(delay_ms or 0)), lambda: _fire(0))

    def _handle_comment_workdrawer_followup_inspect_result(self, result: Any) -> None:
                self.busy = False
                parsed = self._coerce_js_result(result)
                if not isinstance(parsed, dict) or not parsed.get("ok"):
                    self._log("WARN", f"评论页作品侧栏后续探测失败，准备直接刷新当前作品: {json.dumps(parsed if isinstance(parsed, dict) else {'raw': str(parsed)[:240]}, ensure_ascii=False)}")
                    if not self._comment_trigger_same_work_refresh(None, reason="workdrawer_followup_probe_failed_refresh_current_work"):
                        self._schedule_fast_comment_inspect(1500)
                    return
                try:
                    work_drawer = parsed.get("workDrawer", {}) or {}
                    self._comment_update_known_workdrawer_state(work_drawer)
                    items = work_drawer.get("items", []) or []
                    active_index = -1
                    for idx, item in enumerate(items):
                        if isinstance(item, dict) and item.get("active"):
                            active_index = idx
                            break
                    ordered: list[dict[str, Any]] = []
                    if items and active_index >= 0:
                        for offset in range(1, len(items)):
                            item = items[(active_index + offset) % len(items)]
                            if isinstance(item, dict) and (item.get("title") or item.get("timeText")):
                                ordered.append(item)
                    else:
                        ordered = [
                            item for item in items
                            if isinstance(item, dict) and not item.get("active") and (item.get("title") or item.get("timeText"))
                        ]
                    candidates = [
                        item for item in ordered
                        if f"{str(item.get('title', '') or '')} | {str(item.get('timeText', '') or '')}".strip() not in self.comment_completed_work_keys
                    ]
                    payload = {
                        "drawerFound": bool(work_drawer.get("found")),
                        "workItems": len(items),
                        "switchCandidates": len(candidates),
                        "followupReason": str(getattr(self, "comment_workdrawer_open_followup_reason", "") or ""),
                        "workKey": self._comment_current_work_key(parsed) if hasattr(self, "_comment_current_work_key") else "",
                    }
                    if candidates:
                        self._log("INFO", f"评论页作品侧栏后续探测到可切换作品: {json.dumps(payload, ensure_ascii=False)}")
                        self._maybe_switch_comment_work(parsed)
                        self._schedule_fast_comment_inspect(1200)
                        return
                    log_label = "评论页单作品无可切换作品，直接刷新当前作品评论数据" if len(items) <= 1 else "评论页作品侧栏无可切换作品，刷新当前作品评论数据"
                    self._log("INFO", f"{log_label}: {json.dumps(payload, ensure_ascii=False)}")
                    if self._comment_trigger_same_work_refresh(parsed, reason="workdrawer_no_switch_candidate_refresh_current_work"):
                        return
                    if hasattr(self, "_comment_same_work_refresh_wait_until_retry") and self._comment_same_work_refresh_wait_until_retry("workdrawer_refresh_wait_min_interval"):
                        return
                    self._schedule_fast_comment_inspect(1500)
                except Exception as exc:
                    self._log("WARN", f"评论页作品侧栏后续处理异常，准备继续快速巡检: {type(exc).__name__}: {str(exc)[:160]}")
                    self._schedule_fast_comment_inspect(1500)

    def _handle_comment_close_workdrawer_result(self, result: Any) -> None:
                self.busy = False
                result = self._coerce_js_result(result)
                if not isinstance(result, dict):
                    self._log("WARN", f"评论页关闭作品侧栏结果异常，类型={type(result).__name__}，内容片段={str(result)[:240]}")
                    self._schedule_fast_comment_inspect(900)
                    return
                if result.get("ok"):
                    self._log("INFO", f"评论页关闭作品侧栏动作已执行: {json.dumps(result, ensure_ascii=False)}")
                else:
                    self._log("WARN", f"评论页关闭作品侧栏失败: {json.dumps(result, ensure_ascii=False)}")
                self._schedule_fast_comment_inspect(900)
