from __future__ import annotations

import json
import re
from typing import Any

from PySide6.QtCore import QTimer

from app.platforms.douyin.comment.probe.comment_probe import emit_comment_probe_logs
from app.platforms.douyin.comment.scripts.comment_scripts import (
    build_comment_close_workdrawer_script,
    build_comment_open_reply_editor_script,
    build_comment_open_workdrawer_script,
    build_comment_probe_reply_draft_script,
    build_comment_set_filter_script,
    build_comment_switch_work_script,
)


class SessionControllerCommentSwitchFlowMixin:
    def _maybe_switch_comment_work(self, result: dict[str, Any]) -> None:
                if hasattr(self, "_comment_work_switch_enabled") and not self._comment_work_switch_enabled():
                    return
                if not self.running or not self.ready or self.current_module != "comment" or not self.page:
                    return
                if hasattr(self, "_comment_runtime_cooldown_should_skip") and self._comment_runtime_cooldown_should_skip():
                    remaining_ms = self._comment_runtime_cooldown_remaining_ms() if hasattr(self, "_comment_runtime_cooldown_remaining_ms") else 0
                    if hasattr(self, "_comment_runtime_cooldown_log_wait"):
                        self._comment_runtime_cooldown_log_wait(remaining_ms)
                    return
                if self.comment_pending_switch_target is not None:
                    return
                if self.comment_pending_filter_target is not None or self.comment_pending_reply_target is not None or self.comment_pending_draft_probe_target is not None:
                    return
                if hasattr(self, "_comment_flow_stage_blocks_work_switch") and self._comment_flow_stage_blocks_work_switch(result):
                    self._comment_log_flow_stage_block(result, "switch_decision")
                    return
                switch_due_to_budget = bool(hasattr(self, "_comment_work_budget_exceeded") and self._comment_work_budget_exceeded(result))
                if not self._comment_work_completed(result) and not switch_due_to_budget:
                    self.comment_all_known_works_completed = False
                    return
                work_drawer = result.get("workDrawer", {}) or {}
                if not work_drawer.get("found"):
                    return
                if hasattr(self, "_comment_update_known_workdrawer_state"):
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
                if not items and not switch_due_to_budget and hasattr(self, "_comment_trigger_same_work_refresh"):
                    if self._comment_trigger_same_work_refresh(result, reason="empty_workdrawer_refresh_current_work"):
                        return
                    if hasattr(self, "_comment_same_work_refresh_wait_until_retry") and self._comment_same_work_refresh_wait_until_retry("empty_workdrawer_refresh_wait_min_interval"):
                        return
                if not candidates and switch_due_to_budget:
                    candidates = ordered[:1]
                if not candidates:
                    # When every visible work is already completed, do not immediately
                    # enter a long idle using the stale in-memory comment list. For a
                    # single-work account there is no work switch to force Douyin to
                    # reload comments, so refresh the current work first while the
                    # comment flow is idle. If the refresh was just attempted recently,
                    # fall through to the existing idle behavior.
                    if items and not switch_due_to_budget and hasattr(self, "_comment_trigger_same_work_refresh"):
                        if self._comment_trigger_same_work_refresh(result, reason="no_switch_candidate_refresh_current_work"):
                            return
                        if hasattr(self, "_comment_same_work_refresh_wait_until_retry") and self._comment_same_work_refresh_wait_until_retry("no_switch_candidate_refresh_wait_min_interval"):
                            return
                    if items and not switch_due_to_budget:
                        self.comment_all_known_works_completed = True
                        if hasattr(self, "_comment_enter_runtime_cooldown"):
                            cfg = self._comment_runtime_cooldown_config() if hasattr(self, "_comment_runtime_cooldown_config") else {}
                            threshold = max(1, int(cfg.get("multi_empty_round_threshold", 3) or 3))
                            current_rounds = int(getattr(self, "comment_visible_cycle_empty_rounds", 0) or 0) + 1
                            self.comment_visible_cycle_empty_rounds = current_rounds
                            if current_rounds >= threshold:
                                self.comment_visible_cycle_empty_rounds = 0
                                reason = "full_visible_work_cycle_multi_empty_idle"
                                min_ms = int(cfg.get("multi_empty_round_min_ms", cfg.get("full_cycle_idle_min_ms", 600000)) or 600000)
                                max_ms = int(cfg.get("multi_empty_round_max_ms", cfg.get("full_cycle_idle_max_ms", 1200000)) or 1200000)
                            else:
                                reason = "full_visible_work_cycle_idle"
                                min_ms = int(cfg.get("full_cycle_idle_min_ms", 600000) or 600000)
                                max_ms = int(cfg.get("full_cycle_idle_max_ms", 1200000) or 1200000)
                            self._comment_enter_runtime_cooldown(
                                reason,
                                min_ms=min_ms,
                                max_ms=max_ms,
                                reset_cycle_on_exit=True,
                            )
                    return
                now_ms = self._now_ms()
                if now_ms - self.comment_last_switch_attempt_ms < 10000:
                    return
                header = result.get("header", {}) or {}
                current_title = str(header.get("currentWorkTitle", "") or "")
                current_meta = str(header.get("currentWorkMeta", "") or "")
                target = candidates[0]
                if target.get("title") == current_title and target.get("timeText") == current_meta:
                    return
                self.comment_last_switch_attempt_ms = now_ms
                self.comment_switch_attempts += 1
                self.comment_pending_switch_target = {
                    "title": str(target.get("title", "") or ""),
                    "timeText": str(target.get("timeText", "") or ""),
                    "index": int(target.get("index", 0) or 0),
                    "fromTitle": current_title,
                    "fromMeta": current_meta,
                    "attemptMs": now_ms,
                    "attemptNo": self.comment_switch_attempts,
                }
                self.busy = True
                self._log(
                    "INFO",
                    f"评论页准备切换作品: {json.dumps(self.comment_pending_switch_target, ensure_ascii=False)}",
                )
                self.page.runJavaScript(
                    build_comment_switch_work_script(
                        self.comment_pending_switch_target["title"],
                        self.comment_pending_switch_target["timeText"],
                        self.comment_pending_switch_target["index"],
                    ),
                    self._handle_comment_switch_work_result,
                )

    def _handle_comment_switch_work_result(self, result: Any) -> None:
                self.busy = False
                result = self._coerce_js_result(result)
                if not isinstance(result, dict):
                    self._log("WARN", f"评论页切换作品结果异常，类型={type(result).__name__}，内容片段={str(result)[:240]}")
                    self._schedule_fast_comment_inspect(1200)
                    return
                if result.get("ok"):
                    self._log("INFO", f"评论页切换作品动作已执行: {json.dumps(result, ensure_ascii=False)}")
                else:
                    self._log("WARN", f"评论页切换作品失败: {json.dumps(result, ensure_ascii=False)}")
                    self.comment_pending_switch_target = None
                self._schedule_fast_comment_inspect(1200)

    def _maybe_confirm_comment_work_switch(self, result: dict[str, Any]) -> None:
                header = result.get("header", {}) or {}
                current_title = str(header.get("currentWorkTitle", "") or "")
                current_meta = str(header.get("currentWorkMeta", "") or "")
                if current_title:
                    self.comment_last_verified_work_title = current_title
                if current_meta:
                    self.comment_last_verified_work_meta = current_meta
                pending = self.comment_pending_switch_target
                if not pending:
                    return
                target_title = str(pending.get("title", "") or "")
                target_meta = str(pending.get("timeText", "") or "")
                if current_title == target_title and (not target_meta or current_meta == target_meta):
                    self._log(
                        "INFO",
                        f"评论页切换作品确认成功: {json.dumps({'fromTitle': pending.get('fromTitle', ''), 'fromMeta': pending.get('fromMeta', ''), 'toTitle': current_title, 'toMeta': current_meta, 'attemptNo': pending.get('attemptNo', 0)}, ensure_ascii=False)}",
                    )
                    self.comment_active_reply_target = None
                    self.comment_all_known_works_completed = False
                    self.comment_recent_work_change_ms = self._now_ms()
                    self.comment_recent_work_change_key = f"{current_title} | {current_meta}".strip()
                    if hasattr(self, "_comment_set_flow_stage"):
                        self._comment_set_flow_stage("work_switch_confirmed", result, reason="switch_confirmed")
                    self.comment_pending_switch_target = None
                    return
                attempt_ms = int(pending.get("attemptMs", 0) or 0)
                if attempt_ms and self._now_ms() - attempt_ms >= 8000:
                    self._log(
                        "WARN",
                        f"评论页切换作品确认超时: {json.dumps({'expectedTitle': target_title, 'expectedMeta': target_meta, 'currentTitle': current_title, 'currentMeta': current_meta, 'attemptNo': pending.get('attemptNo', 0)}, ensure_ascii=False)}",
                    )
                    self.comment_pending_switch_target = None
