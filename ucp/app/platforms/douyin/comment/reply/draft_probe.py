from __future__ import annotations

import json
import re
from difflib import SequenceMatcher
from concurrent.futures import Future
from typing import Any

from PySide6.QtCore import QPoint, Qt, QTimer

try:
    from PySide6.QtTest import QTest
except Exception:  # pragma: no cover - QtTest may be unavailable in some builds
    QTest = None

from app.platforms.douyin.comment.scripts.comment_scripts import (
    build_comment_focus_reply_editor_script,
    build_comment_open_reply_editor_script,
    build_comment_probe_reply_draft_script,
    build_comment_manual_hold_probe_script,
    build_comment_send_click_plan_script,
    build_comment_send_reply_script,
)


class SessionControllerCommentDraftProbeMixin:
    def _comment_stable_thread_identity(self, target: dict[str, Any] | None) -> str:
            """Build a thread identity that ignores drifting relative-time labels."""
            if not isinstance(target, dict):
                return ""
            raw = re.sub(
                r"\s+",
                " ",
                str(target.get("threadKey", "") or target.get("targetParentThreadKey", "") or ""),
            ).strip()
            if raw:
                parts = [re.sub(r"\s+", " ", part).strip() for part in raw.split("|")]
                if len(parts) >= 3:
                    root_author = parts[0]
                    root_content = " | ".join(part for part in parts[2:] if part)
                    stable = " | ".join(part for part in [root_author, root_content] if part)
                    if stable:
                        return stable.casefold()[:260]
                return raw.casefold()[:260]
            root_author = re.sub(r"\s+", " ", str(target.get("rootAuthor", "") or "")).strip()
            root_content = re.sub(r"\s+", " ", str(target.get("rootContent", "") or "")).strip()
            return " | ".join(part for part in [root_author, root_content] if part).casefold()[:260]

    def _comment_thread_match(self, thread: dict[str, Any], target: dict[str, Any]) -> bool:
            if not isinstance(thread, dict) or not isinstance(target, dict):
                return False
            thread_stable = self._comment_stable_thread_identity(thread)
            target_stable = self._comment_stable_thread_identity(target)
            if thread_stable and target_stable and thread_stable == target_stable:
                return True
            thread_key = str(thread.get("threadKey", "") or "")
            target_key = str(target.get("threadKey", "") or "")
            if thread_key and target_key and thread_key == target_key:
                return True
            thread_author = str(thread.get("author", "") or "")
            target_author = str(target.get("author", "") or "")
            thread_time = str(thread.get("timeText", "") or "")
            target_time = str(target.get("timeText", "") or "")
            thread_content = re.sub(r"\s+", " ", str(thread.get("content", "") or "")).strip()
            target_content = re.sub(r"\s+", " ", str(target.get("content", "") or "")).strip()
            if bool(thread_author and target_author and thread_author == target_author and thread_content and target_content and thread_content == target_content):
                return True
            return bool(thread_author and target_author and thread_author == target_author and thread_time and target_time and thread_time == target_time)

    def _comment_find_target_thread(self, result: dict[str, Any], target: dict[str, Any]) -> dict[str, Any] | None:
            for item in (result.get("topComments", []) or []):
                if self._comment_thread_match(item, target):
                    return item
            return None

    def _comment_target_signature(self, target: dict[str, Any], result: dict[str, Any] | None = None) -> str:
            target = target or {}
            # Persistent reply identity must not include relative labels such as
            # “刚刚/6分钟前”, DOM indices, or raw message keys that embed them.
            thread_identity = self._comment_stable_thread_identity(target)
            target_level = re.sub(r"\s+", " ", str(target.get("targetLevel", "") or target.get("level", "") or "")).strip().casefold()[:40]
            author = re.sub(r"\s+", " ", str(target.get("author", "") or "")).strip().casefold()[:100]
            content = re.sub(r"\s+", " ", str(target.get("content", "") or "")).strip().casefold()[:220]
            work_key = self._comment_current_work_key(result or {}) if result else ""
            work_key = re.sub(r"\s+", " ", str(work_key or "")).strip().casefold()[:180]
            if thread_identity and content:
                return "stable:" + " | ".join(
                    part for part in [work_key, thread_identity, target_level, author, content] if part
                )[:420]
            if work_key and content:
                return "stable:" + " | ".join(
                    part for part in [work_key, target_level, author, content] if part
                )[:360]
            if thread_identity:
                return "thread:" + thread_identity[:320]
            message_key = re.sub(r"\s+", " ", str(target.get("targetMessageKey", "") or target.get("messageKey", "") or "")).strip()
            if message_key:
                return ("message:" + message_key)[:320]
            return "fallback:" + " | ".join(part for part in [target_level, author, content] if part)[:280]

    def _build_comment_reply_context(self, result: dict[str, Any], target: dict[str, Any]) -> dict[str, Any]:
            header = result.get("header", {}) or {}
            thread = self._comment_find_target_thread(result, target) or target
            return {
                "workTitle": str(header.get("currentWorkTitle", "") or ""),
                "workMeta": str(header.get("currentWorkMeta", "") or ""),
                "commentFilterText": str((result.get("commentFilter", {}) or {}).get("selectedText", "") or ""),
                "audienceFilterText": str((result.get("audienceFilter", {}) or {}).get("selectedText", "") or ""),
                "sortText": str((result.get("sortControl", {}) or {}).get("selectedText", "") or ""),
                "target": {
                    "threadKey": str(target.get("threadKey", "") or ""),
                    "targetMessageKey": str(target.get("targetMessageKey", "") or ""),
                    "targetParentThreadKey": str(target.get("targetParentThreadKey", "") or ""),
                    "targetLevel": str(target.get("targetLevel", "") or ""),
                    "targetIndex": target.get("targetIndex", -1),
                    "replyNeedReason": str(target.get("replyNeedReason", "") or ""),
                    "author": str(target.get("author", "") or ""),
                    "content": str(target.get("content", "") or ""),
                },
                "thread": thread if isinstance(thread, dict) else {},
            }

    def _build_comment_reply_cache_key(self, result: dict[str, Any], target: dict[str, Any]) -> str:
            header = result.get("header", {}) or {}
            work_title = str(header.get("currentWorkTitle", "") or "")
            work_meta = str(header.get("currentWorkMeta", "") or "")
            target_signature = self._comment_target_signature(target, result=result)
            if not target_signature:
                return ""
            return f"{work_title} | {work_meta} | {target_signature}"[:320]

    def _start_comment_reply_draft_async(self, cache_key: str, signature: str, result: dict[str, Any], target: dict[str, Any]) -> None:
            if self.comment_pending_reply_future is not None:
                return
            context = self._build_comment_reply_context(result, target)
            robot_name = getattr(self.account, "name", "") or getattr(self.account, "nickname", "") or ""
            self.comment_pending_reply_signature = signature
            self.comment_pending_reply_context = {
                "cacheKey": cache_key,
                "signature": signature,
                "target": target,
                "context": context,
                "robotName": robot_name,
                "epoch": self.comment_runtime_epoch,
            }

            def _worker() -> dict[str, Any]:
                decision = self.comment_reply_engine.build_reply(context, robot_name=robot_name)
                return {
                    "text": str(decision.text or "").strip(),
                    "source": str(decision.source or ""),
                    "model": str(decision.model or ""),
                    "reason": str(decision.reason or ""),
                }

            self.comment_pending_reply_future = self.comment_reply_executor.submit(_worker)
            self._log(
                "INFO",
                f"评论回复草稿异步生成启动: {json.dumps({'threadKey': target.get('threadKey', ''), 'author': target.get('author', ''), 'content': str(target.get('content', '') or '')[:60]}, ensure_ascii=False)}",
            )

    def _collect_comment_pending_reply_result(self) -> None:
            future = self.comment_pending_reply_future
            if future is None or not future.done():
                return
            context = self.comment_pending_reply_context or {}
            self.comment_pending_reply_future = None
            self.comment_pending_reply_signature = ""
            self.comment_pending_reply_context = None
            try:
                payload = future.result()
            except Exception as exc:
                self._log("WARN", f"评论回复草稿异步生成失败: {type(exc).__name__}: {exc}")
                self.comment_pending_draft_probe_target = None
                return
            if context.get("epoch") != self.comment_runtime_epoch:
                return
            if not isinstance(payload, dict):
                self._log("WARN", f"评论回复草稿异步生成结果异常，类型={type(payload).__name__}")
                self.comment_pending_draft_probe_target = None
                return
            draft_text = re.sub(r"\s+", " ", str(payload.get("text", "") or "")).strip()
            if not draft_text:
                self._log("WARN", "评论回复草稿异步生成返回空文本，放弃本次候选")
                self.comment_pending_draft_probe_target = None
                return
            cache_key = str(context.get("cacheKey", "") or "")
            if cache_key:
                self.comment_draft_cache[cache_key] = {
                    "text": draft_text,
                    "source": str(payload.get("source", "") or ""),
                    "model": str(payload.get("model", "") or ""),
                    "reason": str(payload.get("reason", "") or ""),
                }
            pending = self.comment_pending_draft_probe_target or {}
            if pending:
                pending["draftText"] = draft_text
                pending["source"] = str(payload.get("source", "") or "")
                pending["model"] = str(payload.get("model", "") or "")
                pending["reason"] = str(payload.get("reason", "") or "")
                pending["phase"] = "stage"
                self.comment_pending_draft_probe_target = pending
            self._log(
                "INFO",
                f"评论回复草稿异步生成完成: {json.dumps({'source': payload.get('source', ''), 'model': payload.get('model', ''), 'reason': payload.get('reason', ''), 'draftPreview': draft_text[:80]}, ensure_ascii=False)}",
            )

    def _comment_send_config(self) -> dict[str, Any]:
            config = self.comment_runtime_config if isinstance(getattr(self, "comment_runtime_config", None), dict) else {}
            return config.get("send", {}) if isinstance(config.get("send"), dict) else {}

    def _comment_reply_config(self) -> dict[str, Any]:
            config = self.comment_runtime_config if isinstance(getattr(self, "comment_runtime_config", None), dict) else {}
            return config.get("reply", {}) if isinstance(config.get("reply"), dict) else {}

    def _comment_draft_probe_enabled(self) -> bool:
            reply_cfg = self._comment_reply_config()
            return bool(reply_cfg.get("draft_probe_enabled", False))

    def _comment_stage_timeout_ms(self) -> int:
            send_cfg = self._comment_send_config()
            return int(send_cfg.get("stage_timeout_ms", 22000) or 22000)

    def _comment_reactivate_max_attempts(self) -> int:
            send_cfg = self._comment_send_config()
            return int(send_cfg.get("reactivate_max_attempts", 2) or 2)

    def _comment_send_enable_poll_attempts(self) -> int:
            send_cfg = self._comment_send_config()
            return max(0, int(send_cfg.get("enable_poll_attempts", 3) or 3))

    def _comment_send_enable_poll_interval_ms(self) -> int:
            send_cfg = self._comment_send_config()
            return max(180, int(send_cfg.get("enable_poll_interval_ms", 360) or 360))

    def _comment_auto_send_enabled(self) -> bool:
            reply_cfg = self._comment_reply_config()
            # V20 dry-run boundary: real sending requires all three explicit gates.
            # This prevents accidental sends if only auto_send is toggled in config.
            auto_send = bool(reply_cfg.get("auto_send", False))
            allow_real_send = bool(reply_cfg.get("allow_real_send", False))
            dry_run_only = bool(reply_cfg.get("dry_run_only", True))
            return bool(auto_send and allow_real_send and not dry_run_only)

    def _comment_dry_run_config(self) -> dict[str, Any]:
            reply_cfg = self._comment_reply_config()
            dry_run_cfg = reply_cfg.get("dry_run", {}) if isinstance(reply_cfg.get("dry_run"), dict) else {}
            return dry_run_cfg

    def _comment_dry_run_send_click_plan_enabled(self) -> bool:
            dry_run_cfg = self._comment_dry_run_config()
            return bool(dry_run_cfg.get("send_click_plan_enabled", True))

    def _comment_dry_run_send_click_plan_delay_ms(self) -> int:
            dry_run_cfg = self._comment_dry_run_config()
            return int(dry_run_cfg.get("send_click_plan_delay_ms", 450) or 450)

    def _comment_dry_run_continue_after_mock_plan_enabled(self) -> bool:
            dry_run_cfg = self._comment_dry_run_config()
            # 当前评论模块仍不真实发送；为了让同一轮可见的多个未回复候选都能完成
            # “打开回复框 -> 生成 -> 注入 -> 回读 -> 模拟发送计划”验证，默认在
            # mock plan 记录后关闭当前回复框并进入下一候选。
            return bool(dry_run_cfg.get("continue_after_mock_plan", True))

    def _comment_dry_run_continue_finalize_delay_ms(self) -> int:
            dry_run_cfg = self._comment_dry_run_config()
            return int(dry_run_cfg.get("continue_finalize_delay_ms", 450) or 450)

    def _comment_close_editor_after_ready(self) -> bool:
            send_cfg = self._comment_send_config()
            return bool(send_cfg.get("close_editor_after_ready", True))

    def _comment_ready_finalize_delay_ms(self) -> int:
            send_cfg = self._comment_send_config()
            return int(send_cfg.get("ready_finalize_delay_ms", 180) or 180)

    def _comment_v50_immediate_inject_enabled(self) -> bool:
            reply_cfg = self._comment_reply_config()
            return bool(reply_cfg.get("v50_immediate_inject_probe_enabled", True))


    def _comment_preopen_draft_for_target(self, target: dict[str, Any]) -> dict[str, Any]:
            preopen = getattr(self, "comment_preopen_reply_target", None)
            if not isinstance(preopen, dict) or preopen.get("phase") != "pre_generate_ready":
                return {}
            target_identity = self._comment_reply_target_identity(target) if hasattr(self, "_comment_reply_target_identity") else str((target or {}).get("threadKey", "") or "")
            preopen_identity = self._comment_reply_target_identity(preopen) if hasattr(self, "_comment_reply_target_identity") else str(preopen.get("threadKey", "") or "")
            if target_identity and preopen_identity and target_identity == preopen_identity:
                return dict(preopen)
            return {}

    def _comment_v50_probe_text(self) -> str:
            reply_cfg = self._comment_reply_config()
            text = re.sub(r"\s+", " ", str(reply_cfg.get("v50_probe_text", "") or reply_cfg.get("fallback_text", "") or "感谢支持呀")).strip()
            return text or "感谢支持呀"

    def _comment_enter_ready_for_draft_from_stable(self, target: dict[str, Any], *, reason: str = "post_focus_alive_stable") -> None:
            if not self._comment_v50_immediate_inject_enabled():
                return
            if not isinstance(target, dict) or not target:
                return
            if self.comment_pending_draft_probe_target is not None:
                return
            preopen_draft = self._comment_preopen_draft_for_target(target)
            draft_text = re.sub(r"\s+", " ", str(preopen_draft.get("draftText", "") or "")).strip() if preopen_draft else ""
            if not draft_text:
                draft_text = self._comment_v50_probe_text()
            signature = str(target.get("signature", "") or (preopen_draft.get("signature", "") if isinstance(preopen_draft, dict) else "") or self._comment_target_signature(target, result=None))
            work_key = self._comment_resolve_stage_work_key(None) if hasattr(self, "_comment_resolve_stage_work_key") else str(getattr(self, "comment_stage_work_key", "") or getattr(self, "comment_current_work_key", "") or "")
            now_ms = self._now_ms()
            pending = {
                "workKey": work_key,
                "threadKey": str(target.get("threadKey", "") or ""),
                "author": str(target.get("author", "") or ""),
                "content": str(target.get("content", "") or ""),
                "timeText": str(target.get("timeText", "") or ""),
                "targetMessageKey": str(target.get("targetMessageKey", "") or target.get("messageKey", "") or ""),
                "replyDomKey": str(target.get("replyDomKey", "") or ""),
                "targetParentThreadKey": str(target.get("targetParentThreadKey", "") or target.get("threadKey", "") or ""),
                "targetLevel": str(target.get("targetLevel", "") or target.get("level", "") or ""),
                "targetIndex": target.get("targetIndex", target.get("index", -1)),
                "replyNeedReason": str(target.get("replyNeedReason", "") or ""),
                "signature": signature,
                "attemptMs": now_ms,
                "attemptNo": int(getattr(self, "comment_draft_probe_attempts", 0) or 0) + 1,
                "phase": "stage",
                "draftText": draft_text,
                "source": str(preopen_draft.get("source", "") or "v50_immediate_probe") if isinstance(preopen_draft, dict) else "v50_immediate_probe",
                "model": str(preopen_draft.get("model", "") or "local") if isinstance(preopen_draft, dict) else "local",
                "reason": str(preopen_draft.get("reason", "") or reason) if isinstance(preopen_draft, dict) else reason,
                "cacheKey": str(preopen_draft.get("cacheKey", "") or "") if isinstance(preopen_draft, dict) else "",
                "reactivateCount": 0,
                "editorRecoveryCount": 0,
                "beforeNestedReplyCount": int(target.get("beforeNestedReplyCount", 0) or 0),
                "beforeMessageCount": int(target.get("beforeMessageCount", 0) or 0),
                "beforeAuthorReplyCount": int(target.get("beforeAuthorReplyCount", 0) or 0),
                "beforeLastMessageKey": str(target.get("beforeLastMessageKey", "") or ""),
                "rootAuthor": str(target.get("rootAuthor", "") or ""),
                "rootContent": str(target.get("rootContent", "") or ""),
            }
            self.comment_pending_draft_probe_target = pending
            self.comment_draft_probe_attempts = int(getattr(self, "comment_draft_probe_attempts", 0) or 0) + 1
            if hasattr(self, "_comment_enter_critical_quiet"):
                self._comment_enter_critical_quiet("editor_visible_before_text_inject_hard_isolation", 2600, target=target)
            if hasattr(self, "_comment_set_flow_stage"):
                self._comment_set_flow_stage("reply_editor_ready_for_draft", None, reason=reason)
            ready_payload = {"threadKey": pending.get("threadKey", ""), "author": pending.get("author", ""), "workKey": work_key, "draftPreview": draft_text[:80], "source": pending.get("source", ""), "model": pending.get("model", ""), "reason": pending.get("reason", reason), "sendEnabled": False, "preGeneratedBeforeOpen": bool(preopen_draft)}
            self._log("INFO", f"评论页回复编辑器准备注入草稿: {json.dumps({'author': ready_payload.get('author', ''), 'draft': str(ready_payload.get('draftPreview', '') or '')[:80], 'source': ready_payload.get('source', '')}, ensure_ascii=False)}")
            if preopen_draft:
                self.comment_preopen_reply_target = None
                self.comment_preopen_reply_future = None
                self.comment_preopen_reply_context = None
            def _fire() -> None:
                if not self.running or not self.ready or self.current_module != "comment" or not self.page:
                    return
                if self.busy:
                    QTimer.singleShot(180, _fire)
                    return
                if hasattr(self, "_comment_set_flow_stage"):
                    self._comment_set_flow_stage("reply_draft_inject_probe", None, reason="ready_for_draft_immediate_inject")
                self._run_comment_reply_draft_probe(dict(pending))
            QTimer.singleShot(90, _fire)

    def _comment_schedule_reactivate_probe(self, pending: dict[str, Any], delay_ms: int = 220) -> None:
            if not isinstance(pending, dict):
                return
            pending["phase"] = "reactivate"
            if hasattr(self, "_comment_set_flow_stage"):
                self._comment_set_flow_stage("reply_draft_reactivate_probe", None, reason="draft_button_disabled_reactivate")
            self.comment_pending_draft_probe_target = pending
            def _fire() -> None:
                if not self.running or not self.ready or self.current_module != "comment" or not self.page:
                    return
                if self.busy:
                    QTimer.singleShot(120, _fire)
                    return
                self._run_comment_reply_draft_probe(dict(pending))
            QTimer.singleShot(delay_ms, _fire)

    def _run_comment_reply_draft_probe(self, pending: dict[str, Any]) -> None:
            if not isinstance(pending, dict) or not self.page:
                return
            draft_text = re.sub(r"\s+", " ", str(pending.get("draftText", "") or "")).strip()
            if not draft_text:
                return
            phase = str(pending.get("phase", "stage") or "stage")
            self.comment_last_draft_probe_attempt_ms = self._now_ms()
            if hasattr(self, "_comment_enter_critical_quiet"):
                self._comment_enter_critical_quiet("text_inject_running_hard_isolation", 3200, target=pending)
            self.busy = True
            self.comment_pending_stage_payload = dict(pending)
            log_payload = {
                "threadKey": pending.get("threadKey", ""),
                "author": pending.get("author", ""),
                "draftPreview": draft_text[:80],
                "source": pending.get("source", ""),
                "reason": pending.get("reason", ""),
                "phase": phase,
                "reactivateCount": pending.get("reactivateCount", 0),
            }
            self._log("INFO", f"评论回复草稿注入启动: {json.dumps(log_payload, ensure_ascii=False)}")
            self.page.runJavaScript(
                build_comment_probe_reply_draft_script(
                    str(pending.get("threadKey", "") or ""),
                    str(pending.get("author", "") or ""),
                    str(pending.get("content", "") or ""),
                    draft_text,
                    phase=phase,
                    target_message_key=str(pending.get("targetMessageKey", "") or ""),
                    reply_dom_key=str(pending.get("replyDomKey", "") or ""),
                    target_level=str(pending.get("targetLevel", "") or ""),
                    target_index=int(pending.get("targetIndex", -999) if pending.get("targetIndex", -999) is not None else -999),
                    target_parent_thread_key=str(pending.get("targetParentThreadKey", "") or ""),
                ),
                self._handle_comment_probe_reply_draft_result,
            )

    def _comment_build_send_click_snapshot(self, result: dict[str, Any], pending: dict[str, Any]) -> dict[str, Any]:
            if not isinstance(result, dict) or not isinstance(pending, dict):
                return {}
            rect = result.get("sendButtonRect", {}) if isinstance(result.get("sendButtonRect", {}), dict) else {}
            center = result.get("sendButtonCenter", {}) if isinstance(result.get("sendButtonCenter", {}), dict) else {}
            hint = str(result.get("sendButtonHint", "") or "")[:220]
            send_found = bool(result.get("sendFound", False)) or bool(rect.get("w") and rect.get("h"))
            if not send_found:
                return {}
            expected_text = re.sub(r"\s+", " ", str((pending or {}).get("draftText", "") or "")).strip()
            readback_text = re.sub(r"\s+", " ", str(result.get("draftPreview", "") or "")).strip()
            return {
                "snapshotSource": "draft_probe_verified_editor",
                "capturedAtMs": self._now_ms(),
                "threadKey": str((pending or {}).get("threadKey", "") or result.get("threadKey", "") or ""),
                "author": str((pending or {}).get("author", "") or result.get("author", "") or ""),
                "editorVisible": True,
                "readbackMatched": bool(expected_text and readback_text == expected_text),
                "sendFound": True,
                "sendEnabled": bool(result.get("sendEnabled", False)),
                "afterDisabled": result.get("afterDisabled"),
                "sendButtonRect": rect,
                "sendButtonCenter": center,
                "sendButtonHint": hint,
                "editorRect": result.get("editorRect", {}) if isinstance(result.get("editorRect", {}), dict) else {},
                "editorHint": str(result.get("editorHint", "") or "")[:220],
                "draftPreview": readback_text[:120],
                "clicked": False,
                "dispatchEvents": False,
                "focusChanged": False,
                "decision": "cached_mock_click_plan_only_no_send",
                "safety": "no_mouse_or_pointer_events_dispatched",
            }

    def _comment_log_cached_dry_run_send_click_plan(self, pending: dict[str, Any], *, reason: str = "cached_snapshot") -> bool:
            if not isinstance(pending, dict):
                return False
            snapshot = pending.get("sendClickSnapshot") if isinstance(pending.get("sendClickSnapshot"), dict) else {}
            if not snapshot:
                return False
            signature = str(pending.get("signature", "") or self._comment_target_signature(pending, result=None) or "")
            if signature and str(getattr(self, "comment_dry_run_send_click_plan_logged_signature", "") or "") == signature:
                return True
            if signature:
                self.comment_dry_run_send_click_plan_logged_signature = signature
            summary = {
                "threadKey": pending.get("threadKey", "") or snapshot.get("threadKey", ""),
                "author": pending.get("author", "") or snapshot.get("author", ""),
                "ok": True,
                "state": "send_button_located_from_cached_snapshot",
                "clicked": False,
                "dispatchEvents": False,
                "focusChanged": False,
                "editorVisible": bool(snapshot.get("editorVisible", True)),
                "readbackMatched": bool(snapshot.get("readbackMatched", False)),
                "sendFound": bool(snapshot.get("sendFound", False)),
                "sendEnabled": bool(snapshot.get("sendEnabled", False)),
                "afterDisabled": snapshot.get("afterDisabled"),
                "sendButtonRect": snapshot.get("sendButtonRect", {}) if isinstance(snapshot.get("sendButtonRect", {}), dict) else {},
                "sendButtonCenter": snapshot.get("sendButtonCenter", {}) if isinstance(snapshot.get("sendButtonCenter", {}), dict) else {},
                "sendButtonHint": str(snapshot.get("sendButtonHint", "") or "")[:180],
                "editorRect": snapshot.get("editorRect", {}) if isinstance(snapshot.get("editorRect", {}), dict) else {},
                "editorHint": str(snapshot.get("editorHint", "") or "")[:180],
                "draftPreview": str(snapshot.get("draftPreview", "") or pending.get("draftText", "") or "")[:80],
                "decision": "mock_click_plan_from_cached_snapshot_only_no_send",
                "safety": "no_mouse_or_pointer_events_dispatched",
                "reason": reason,
            }
            compact = {
                "threadKey": summary.get("threadKey", ""),
                "author": summary.get("author", ""),
                "clicked": False,
                "sendFound": summary.get("sendFound", False),
                "sendEnabled": summary.get("sendEnabled", False),
                "readbackMatched": summary.get("readbackMatched", False),
                "draftPreview": summary.get("draftPreview", ""),
                "safety": "no_send_events",
            }
            self._log("INFO", f"COMMENT_TRACE_DRY_RUN_V23 | mock_send_click_plan={json.dumps(compact, ensure_ascii=False)}")
            return True

    def _comment_enter_manual_send_hold(self, pending: dict[str, Any], *, reason: str = "draft_verified_send_button_enabled") -> None:
            if not isinstance(pending, dict):
                return
            payload = dict(pending)
            signature = str(payload.get("signature", "") or "")
            payload["verifiedButNotSent"] = True
            payload["textHeldWithoutSending"] = True
            payload["manualHoldSinceMs"] = self._now_ms()
            payload["manualHoldProbeCount"] = 0
            self.comment_active_reply_target = {
                "threadKey": str(payload.get("threadKey", "") or ""),
                "author": str(payload.get("author", "") or ""),
                "content": str(payload.get("content", "") or ""),
                "timeText": str(payload.get("timeText", "") or ""),
            }
            last_logged_sig = str(getattr(self, "comment_manual_send_hold_confirmed_signature", "") or "")
            if signature and last_logged_sig != signature:
                self.comment_manual_send_hold_confirmed_signature = signature

            # V71 dry-run batch mode：记录一次 mock send plan 后，关闭当前回复框，
            # 将该线程标记为“本轮 dry-run 已验证”，继续处理下一条可回复候选。
            # 这不会点击发送按钮，也不会 dispatch 发送按钮事件。
            if self._comment_dry_run_continue_after_mock_plan_enabled():
                payload["phase"] = "dry_run_finalize_pending"
                self.comment_pending_draft_probe_target = payload
                if hasattr(self, "_comment_set_flow_stage"):
                    self._comment_set_flow_stage("reply_draft_verified", None, reason=reason)
                hold_payload = {
                    "threadKey": payload.get("threadKey", ""),
                    "author": payload.get("author", ""),
                    "workKey": payload.get("workKey", "") or str(getattr(self, "comment_stage_work_key", "") or ""),
                    "draftPreview": str(payload.get("draftText", "") or "")[:80],
                    "sendEnabled": bool(payload.get("sendEnabled", False)),
                    "autoSend": self._comment_auto_send_enabled(),
                    "dryRunOnly": True,
                    "sendDisabled": True,
                    "mockSendClickPlanEnabled": self._comment_dry_run_send_click_plan_enabled(),
                    "continueAfterMockPlan": True,
                    "reason": reason,
                    "decision": "mock_plan_then_close_editor_continue_next_candidate",
                    "completed": False,
                    "isolatedHold": False,
                }
                self._log("INFO", f"COMMENT_TRACE_DRAFT_PROBE_V70 | manual_send_hold={json.dumps(hold_payload, ensure_ascii=False)}")
                self._log("INFO", f"评论回复发送前等待 | threadKey={payload.get('threadKey', '')} | author={payload.get('author', '')} | mode=dry_run_continue | autoSend=False | sendDisabled=True | completed=False")
                finalize_delay_ms = self._comment_dry_run_continue_finalize_delay_ms()
                if self._comment_dry_run_send_click_plan_enabled():
                    if self._comment_log_cached_dry_run_send_click_plan(payload, reason="dry_run_continue_before_close"):
                        self._log("INFO", f"COMMENT_TRACE_DRY_RUN_V23 | mock_send_click_plan_cached_no_page_js={json.dumps({'threadKey': payload.get('threadKey', ''), 'author': payload.get('author', ''), 'clicked': False, 'decision': 'used_cached_send_button_snapshot_without_extra_js_then_close_editor'}, ensure_ascii=False)}")
                    else:
                        plan_delay_ms = self._comment_dry_run_send_click_plan_delay_ms()
                        finalize_delay_ms = max(finalize_delay_ms, plan_delay_ms + 350)
                        self._log("INFO", f"COMMENT_TRACE_DRY_RUN_V20 | mock_send_click_plan_scheduled={json.dumps({'threadKey': payload.get('threadKey', ''), 'author': payload.get('author', ''), 'delayMs': plan_delay_ms, 'clicked': False, 'decision': 'locate_send_button_once_without_click_then_close_editor'}, ensure_ascii=False)}")
                        self._comment_schedule_dry_run_send_click_plan(payload, delay_ms=plan_delay_ms)
                self._log("INFO", f"COMMENT_TRACE_DRAFT_PROBE_V70 | dry_run_continue_after_mock_plan={json.dumps({'threadKey': payload.get('threadKey', ''), 'author': payload.get('author', ''), 'reason': reason, 'decision': 'schedule_finalize_cancel_no_send_then_next_candidate', 'sendClicked': False, 'sendDispatchEvents': False, 'delayMs': finalize_delay_ms}, ensure_ascii=False)}")
                self._comment_finalize_ready_probe(dict(payload), delay_ms=finalize_delay_ms)
                return

            # 兼容旧模式：manual_send_hold 表示文本已注入并回读成功，但不发送、不中断人工观察。
            payload["phase"] = "manual_send_hold"
            self.comment_pending_draft_probe_target = payload
            if hasattr(self, "_comment_enter_critical_quiet"):
                self._comment_enter_critical_quiet("manual_text_hold_no_more_js_scan_hard_isolation", 30 * 60 * 1000, target=payload)
            if hasattr(self, "_comment_set_flow_stage"):
                self._comment_set_flow_stage("manual_send_hold", None, reason=reason)
            hold_payload = {
                "threadKey": payload.get("threadKey", ""),
                "author": payload.get("author", ""),
                "workKey": payload.get("workKey", "") or str(getattr(self, "comment_stage_work_key", "") or ""),
                "draftPreview": str(payload.get("draftText", "") or "")[:80],
                "sendEnabled": bool(payload.get("sendEnabled", False)),
                "autoSend": self._comment_auto_send_enabled(),
                "dryRunOnly": True,
                "sendDisabled": True,
                "mockSendClickPlanEnabled": self._comment_dry_run_send_click_plan_enabled(),
                "reason": reason,
                "decision": "hold_without_sending_not_completed",
                "completed": False,
                "isolatedHold": True,
            }
            self._log("INFO", f"COMMENT_TRACE_DRAFT_PROBE_V70 | manual_send_hold={json.dumps(hold_payload, ensure_ascii=False)}")
            self._log("INFO", f"评论回复发送前等待 | threadKey={payload.get('threadKey', '')} | author={payload.get('author', '')} | mode=manual_send_hold | autoSend=False | sendDisabled=True | completed=False")
            if self._comment_dry_run_send_click_plan_enabled():
                if self._comment_log_cached_dry_run_send_click_plan(payload, reason="manual_send_hold_entered"):
                    self._log("INFO", f"COMMENT_TRACE_DRY_RUN_V23 | mock_send_click_plan_cached_no_page_js={json.dumps({'threadKey': payload.get('threadKey', ''), 'author': payload.get('author', ''), 'clicked': False, 'decision': 'used_cached_send_button_snapshot_without_extra_js'}, ensure_ascii=False)}")
                else:
                    self._log("INFO", f"COMMENT_TRACE_DRY_RUN_V20 | mock_send_click_plan_scheduled={json.dumps({'threadKey': payload.get('threadKey', ''), 'author': payload.get('author', ''), 'delayMs': self._comment_dry_run_send_click_plan_delay_ms(), 'clicked': False, 'decision': 'locate_send_button_once_without_click'}, ensure_ascii=False)}")
                    self._comment_schedule_dry_run_send_click_plan(payload)
            self._log("INFO", f"COMMENT_TRACE_DRAFT_PROBE_V70 | passive_manual_hold_after_single_dry_run_plan={json.dumps({'threadKey': payload.get('threadKey', ''), 'author': payload.get('author', ''), 'reason': reason, 'decision': 'single_mock_send_click_plan_then_no_more_page_js'}, ensure_ascii=False)}")
            return

    def _comment_schedule_dry_run_send_click_plan(self, pending: dict[str, Any], delay_ms: int | None = None) -> None:
            if not isinstance(pending, dict) or not pending:
                return
            if not self._comment_dry_run_send_click_plan_enabled():
                return
            signature = str(pending.get("signature", "") or self._comment_target_signature(pending, result=None) or "")
            if signature and str(getattr(self, "comment_dry_run_send_click_plan_logged_signature", "") or "") == signature:
                return
            delay = self._comment_dry_run_send_click_plan_delay_ms() if delay_ms is None else int(delay_ms or 0)

            def _fire() -> None:
                if not self.running or not self.ready or self.current_module != "comment" or not self.page:
                    return
                current = self.comment_pending_draft_probe_target if isinstance(getattr(self, "comment_pending_draft_probe_target", None), dict) else dict(pending)
                if str(current.get("phase", "") or "") not in {"manual_send_hold", "dry_run_finalize_pending"}:
                    return
                current_sig = str(current.get("signature", "") or self._comment_target_signature(current, result=None) or "")
                if current_sig and str(getattr(self, "comment_dry_run_send_click_plan_logged_signature", "") or "") == current_sig:
                    return
                if self.busy:
                    QTimer.singleShot(250, _fire)
                    return
                self._run_comment_dry_run_send_click_plan(dict(current or pending))

            QTimer.singleShot(max(0, int(delay or 0)), _fire)

    def _run_comment_dry_run_send_click_plan(self, pending: dict[str, Any]) -> None:
            if not isinstance(pending, dict) or not self.page:
                return
            draft_text = re.sub(r"\s+", " ", str(pending.get("draftText", "") or "")).strip()
            if not draft_text:
                return
            self.busy = True
            self.comment_pending_stage_payload = dict(pending)
            self.page.runJavaScript(
                build_comment_send_click_plan_script(
                    str(pending.get("threadKey", "") or ""),
                    str(pending.get("author", "") or ""),
                    str(pending.get("content", "") or ""),
                    draft_text,
                ),
                self._handle_comment_dry_run_send_click_plan_result,
            )

    def _handle_comment_dry_run_send_click_plan_result(self, result: Any) -> None:
            self.busy = False
            result = self._coerce_js_result(result)
            pending = self.comment_pending_stage_payload or self.comment_pending_draft_probe_target or {}
            self.comment_pending_stage_payload = None
            signature = str((pending or {}).get("signature", "") or self._comment_target_signature(pending or {}, result=None) or "")
            if signature:
                self.comment_dry_run_send_click_plan_logged_signature = signature
            if not isinstance(result, dict):
                payload = {
                    "threadKey": (pending or {}).get("threadKey", ""),
                    "author": (pending or {}).get("author", ""),
                    "ok": False,
                    "state": "invalid_result",
                    "clicked": False,
                    "type": type(result).__name__,
                    "snippet": str(result)[:180],
                    "decision": "mock_click_log_failed_no_send",
                }
                self._log("WARN", f"COMMENT_TRACE_DRY_RUN_V20 | mock_send_click_plan={json.dumps(payload, ensure_ascii=False)}")
                return
            summary = {
                "threadKey": (pending or {}).get("threadKey", "") or result.get("threadKey", ""),
                "author": (pending or {}).get("author", "") or result.get("author", ""),
                "ok": bool(result.get("ok")),
                "state": result.get("state", ""),
                "clicked": False,
                "dispatchEvents": False,
                "focusChanged": False,
                "editorVisible": bool(result.get("editorVisible", False)),
                "readbackMatched": bool(result.get("readbackMatched", False)),
                "sendFound": bool(result.get("sendFound", False)),
                "sendEnabled": bool(result.get("sendEnabled", False)),
                "afterDisabled": result.get("afterDisabled"),
                "sendButtonRect": result.get("sendButtonRect", {}) if isinstance(result.get("sendButtonRect", {}), dict) else {},
                "sendButtonCenter": result.get("sendButtonCenter", {}) if isinstance(result.get("sendButtonCenter", {}), dict) else {},
                "sendButtonHint": str(result.get("sendButtonHint", "") or "")[:180],
                "draftPreview": str(result.get("draftPreview", "") or "")[:80],
                "decision": result.get("decision", "mock_click_plan_only_no_send"),
                "safety": result.get("safety", "no_mouse_or_pointer_events_dispatched"),
            }
            level = "INFO" if result.get("ok") else "WARN"
            self._log(level, f"COMMENT_TRACE_DRY_RUN_V20 | mock_send_click_plan={json.dumps(summary, ensure_ascii=False)}")

    def _comment_schedule_manual_hold_probe(self, pending: dict[str, Any], delay_ms: int = 1200) -> None:
            if not isinstance(pending, dict) or not pending:
                return
            def _fire() -> None:
                if not self.running or not self.ready or self.current_module != "comment" or not self.page:
                    return
                current = self.comment_pending_draft_probe_target if isinstance(getattr(self, "comment_pending_draft_probe_target", None), dict) else {}
                if str(current.get("phase", "") or "") != "manual_send_hold":
                    return
                if self.busy:
                    QTimer.singleShot(250, _fire)
                    return
                self._run_comment_manual_hold_probe(dict(current or pending))
            QTimer.singleShot(max(0, int(delay_ms or 0)), _fire)

    def _run_comment_manual_hold_probe(self, pending: dict[str, Any]) -> None:
            if not isinstance(pending, dict) or not self.page:
                return
            draft_text = re.sub(r"\s+", " ", str(pending.get("draftText", "") or "")).strip()
            self.busy = True
            self.comment_pending_stage_payload = dict(pending)
            self.page.runJavaScript(
                build_comment_manual_hold_probe_script(
                    str(pending.get("threadKey", "") or ""),
                    str(pending.get("author", "") or ""),
                    str(pending.get("content", "") or ""),
                    draft_text,
                ),
                self._handle_comment_manual_hold_probe_result,
            )

    def _handle_comment_manual_hold_probe_result(self, result: Any) -> None:
            self.busy = False
            result = self._coerce_js_result(result)
            pending = self.comment_pending_stage_payload or self.comment_pending_draft_probe_target or {}
            self.comment_pending_stage_payload = None
            if not isinstance(pending, dict) or str(pending.get("phase", "") or "") != "manual_send_hold":
                return
            now_ms = self._now_ms()
            count = int(pending.get("manualHoldProbeCount", 0) or 0) + 1
            pending["manualHoldProbeCount"] = count
            pending["lastManualHoldProbeMs"] = now_ms
            self.comment_pending_draft_probe_target = pending
            if not isinstance(result, dict):
                self._log("WARN", f"COMMENT_TRACE_DRAFT_PROBE_V70 | manual_send_hold_probe_invalid={json.dumps({'threadKey': pending.get('threadKey', ''), 'author': pending.get('author', ''), 'type': type(result).__name__, 'snippet': str(result)[:180]}, ensure_ascii=False)}")
                self._comment_schedule_manual_hold_probe(pending, delay_ms=1600)
                return
            summary = {
                "threadKey": pending.get("threadKey", ""),
                "author": pending.get("author", ""),
                "probeNo": count,
                "ok": bool(result.get("ok")),
                "state": result.get("state", ""),
                "editorVisible": bool(result.get("editorVisible", False)),
                "draftPreview": str(result.get("draftPreview", "") or result.get("draftReadback", "") or "")[:80],
                "readbackMatched": bool(result.get("readbackMatched", False)),
                "sendEnabled": bool(result.get("sendEnabled", False)),
                "afterDisabled": result.get("afterDisabled"),
                "mutationEvents": result.get("mutationEvents", [])[-6:] if isinstance(result.get("mutationEvents", []), list) else [],
                "decision": "hold_no_action_no_scan_no_reclick",
            }
            level = "INFO" if result.get("ok") else "WARN"
            self._log(level, f"COMMENT_TRACE_DRAFT_PROBE_V70 | manual_send_hold_probe={json.dumps(summary, ensure_ascii=False)}")
            if not result.get("ok") or not result.get("editorVisible"):
                payload = {
                    "threadKey": pending.get("threadKey", ""),
                    "author": pending.get("author", ""),
                    "phase": "manual_send_hold",
                    "decision": "lost_hold_without_reclick_or_scan",
                    "reason": "manual_hold_probe_editor_missing",
                    "probeNo": count,
                    "mutationEvents": result.get("mutationEvents", [])[-12:] if isinstance(result.get("mutationEvents", []), list) else [],
                    "lastRiskyAction": getattr(self, "comment_last_editor_risky_action", {}) or {},
                }
                self._log("WARN", f"COMMENT_TRACE_DRAFT_PROBE_V70 | manual_send_hold_editor_missing={json.dumps(payload, ensure_ascii=False)}")
                if hasattr(self, "_comment_log_editor_disappearance_diag"):
                    self._comment_log_editor_disappearance_diag(None, pending, reason="manual_hold_probe_editor_missing", extra=payload)
                self._comment_schedule_manual_hold_probe(pending, delay_ms=3000)
                return
            self._comment_schedule_manual_hold_probe(pending, delay_ms=5000)

    def _comment_manual_send_hold_tick(self, result: dict[str, Any]) -> None:
            pending = self.comment_pending_draft_probe_target if isinstance(getattr(self, "comment_pending_draft_probe_target", None), dict) else {}
            if str(pending.get("phase", "") or "") != "manual_send_hold":
                return
            now_ms = self._now_ms()
            if now_ms - int(getattr(self, "comment_manual_hold_isolated_last_log_ms", 0) or 0) < 1800:
                return
            self.comment_manual_hold_isolated_last_log_ms = now_ms
            target = {
                "threadKey": str(pending.get("threadKey", "") or ""),
                "author": str(pending.get("author", "") or ""),
                "content": str(pending.get("content", "") or ""),
                "timeText": str(pending.get("timeText", "") or ""),
            }
            matched = self._comment_find_target_thread(result, target) if isinstance(result, dict) else None
            composers = result.get("composers", {}) if isinstance(result, dict) else {}
            reply_editors = composers.get("replyEditors", []) if isinstance(composers, dict) else []
            payload = {
                "stage": "manual_send_hold",
                "threadKey": target.get("threadKey", ""),
                "author": target.get("author", ""),
                "matched": bool(matched),
                "editorVisibleByInspect": bool((matched or {}).get("replyEditorVisible", False)),
                "replyEditorsFound": len(reply_editors) if isinstance(reply_editors, list) else 0,
                "candidateScanSkipped": True,
                "completed": False,
                "decision": "isolated_hold_skip_full_reply_flow",
            }
            self._log("INFO", f"COMMENT_TRACE_DRAFT_PROBE_V70 | manual_send_hold_isolated_tick={json.dumps(payload, ensure_ascii=False)}")


    def _comment_release_after_dry_run_finalize(self, pending: dict[str, Any], *, reason: str, result: dict[str, Any] | None = None, editor_closed: bool = False) -> None:
            """Release the dry-run reply state after mock send plan is already logged.

            In dry-run batch mode the safety boundary is completed at:
            open editor -> inject draft -> readback matched -> mock_send_click_plan.
            The following finalize step only tries to close the editor. If the editor has
            already disappeared before the close probe runs, that must not keep the state
            machine in reply_editor_lost_hold forever or block later candidates.
            """
            if not isinstance(pending, dict):
                pending = {}
            signature = str((pending or {}).get("signature", "") or self._comment_target_signature(pending or {}, result=None) or "")
            existing_completed = set(getattr(self, "comment_completed_thread_keys", set()) or set())
            completion_keys = []
            for key in [
                signature,
                str((pending or {}).get("targetMessageKey", "") or ""),
                str((pending or {}).get("messageKey", "") or ""),
                self._comment_target_signature(pending or {}, result=None) if hasattr(self, "_comment_target_signature") else "",
            ]:
                key = str(key or "").strip()
                if key and key not in completion_keys:
                    completion_keys.append(key)
            already_completed = any(key in existing_completed for key in completion_keys)
            for key in completion_keys:
                self.comment_completed_thread_keys.add(key)
                if hasattr(self, "_comment_release_inflight_signature"):
                    self._comment_release_inflight_signature(key, reason="dry_run_completed")
            if not already_completed and hasattr(self, "_comment_note_reply_action_confirmed"):
                self._comment_note_reply_action_confirmed(pending)
            self.comment_pending_draft_probe_target = None
            self.comment_pending_stage_payload = None
            self.comment_pending_reply_target = None
            self.comment_active_reply_target = None
            self.comment_preopen_reply_target = None
            self.comment_preopen_reply_future = None
            self.comment_preopen_reply_context = None
            self.comment_reply_editor_ever_visible = False
            self.comment_reply_editor_visible_identity = ""
            self.comment_reply_editor_alive_last_visible = False
            self.comment_reply_editor_alive_last_visible_ms = 0
            self.comment_reply_editor_first_visible_ms = 0
            self.comment_reply_editor_stable_since_ms = 0
            self.comment_reply_editor_alive_streak = 0
            self.comment_reply_editor_lost_streak = 0
            self.comment_reply_editor_focus_lost_streak = 0
            self.comment_reply_editor_focus_confirmed = False
            self.comment_reply_button_click_lock_until_ms = 0
            self.comment_reply_button_click_pending_until_ms = 0
            self.comment_reply_button_visible_lock_until_ms = 0
            if hasattr(self, "_comment_set_flow_stage"):
                self._comment_set_flow_stage("scan_candidates_under_unreplied", result if isinstance(result, dict) else None, reason=reason)
            payload = {
                "threadKey": str((pending or {}).get("threadKey", "") or ""),
                "author": str((pending or {}).get("author", "") or ""),
                "signature": signature[:240],
                "editorClosed": bool(editor_closed),
                "sendClicked": False,
                "dispatchEvents": False,
                "completed": True,
                "alreadyCompleted": already_completed,
                "reason": reason,
                "decision": "continue_next_candidate_after_dry_run_finalize_release",
            }
            if hasattr(self, "_comment_sync_record_to_backend"):
                try:
                    self._comment_sync_record_to_backend(
                        result if isinstance(result, dict) else None,
                        pending,
                        reply_text=str((pending or {}).get("draftText", "") or ""),
                        status="generated",
                        skip=False,
                        reason=str((pending or {}).get("reason", "") or reason),
                        backend_payload={"commentType": str((pending or {}).get("replyNeedReason", "") or "generated_reply"), "intentLevel": str((pending or {}).get("intentLevel", "") or "medium"), "judgeReason": str((pending or {}).get("reason", "") or reason)},
                    )
                except Exception as exc:
                    self._log("WARN", f"评论回复 dry-run 同步后端失败: {type(exc).__name__}: {str(exc)[:160]}")
            self._log("INFO", f"评论回复 dry-run 完成: {json.dumps({'author': payload.get('author', ''), 'completed': payload.get('completed', False), 'sendClicked': False, 'dispatchEvents': False, 'reason': payload.get('reason', '')}, ensure_ascii=False)}")
            self._schedule_fast_comment_inspect(900)

    def _comment_finalize_ready_probe(self, pending: dict[str, Any], delay_ms: int | None = None) -> None:
            if not isinstance(pending, dict) or not self.page:
                return
            dry_run_finalize_pending = str((pending or {}).get("phase", "") or "") == "dry_run_finalize_pending"
            if not dry_run_finalize_pending and not self._comment_close_editor_after_ready():
                self._comment_enter_manual_send_hold(dict(pending), reason="ready_without_finalize_manual_hold")
                return
            def _fire() -> None:
                if not self.running or not self.ready or self.current_module != "comment" or not self.page:
                    return
                if self.busy:
                    self._schedule_fast_comment_inspect(1600)
                    return
                draft_text = re.sub(r"\s+", " ", str(pending.get("draftText", "") or "")).strip()
                if not draft_text:
                    return
                self.busy = True
                self.comment_pending_stage_payload = dict(pending)
                self._log(
                    "INFO",
                    f"评论回复发送前阶段已就绪，准备关闭编辑器: {json.dumps({'threadKey': pending.get('threadKey', ''), 'author': pending.get('author', '')}, ensure_ascii=False)}",
                )
                self.page.runJavaScript(
                    build_comment_probe_reply_draft_script(
                        str(pending.get("threadKey", "") or ""),
                        str(pending.get("author", "") or ""),
                        str(pending.get("content", "") or ""),
                        draft_text,
                        phase="finalize",
                        target_message_key=str(pending.get("targetMessageKey", "") or ""),
                        reply_dom_key=str(pending.get("replyDomKey", "") or ""),
                        target_level=str(pending.get("targetLevel", "") or ""),
                        target_index=int(pending.get("targetIndex", -999) if pending.get("targetIndex", -999) is not None else -999),
                        target_parent_thread_key=str(pending.get("targetParentThreadKey", "") or ""),
                    ),
                    self._handle_comment_probe_reply_draft_result,
                )
            if delay_ms is None:
                delay_ms = self._comment_dry_run_continue_finalize_delay_ms() if dry_run_finalize_pending else self._comment_ready_finalize_delay_ms()
            QTimer.singleShot(max(0, int(delay_ms or 0)), _fire)

    def _reopen_comment_reply_editor_for_pending(self, pending: dict[str, Any], delay_ms: int = 300) -> None:
            # V60 hard guard: do not auto-click “回复” to recover a missing editor.
            # Reply button is toggle-like; a recovery click can close a still-visible editor or hide root cause.
            if not isinstance(pending, dict):
                return
            payload = {
                "threadKey": str(pending.get("threadKey", "") or ""),
                "author": str(pending.get("author", "") or ""),
                "phase": str(pending.get("phase", "") or ""),
                "decision": "blocked_no_reclick",
                "reason": "editor_missing_requires_diagnostics_not_toggle_click",
                "lastRiskyAction": getattr(self, "comment_last_editor_risky_action", {}) or {},
            }
            self._log("WARN", f"COMMENT_TRACE_DRAFT_PROBE_V70 | reply_editor_reopen_blocked={json.dumps(payload, ensure_ascii=False)}")
            if hasattr(self, "_comment_log_editor_disappearance_diag"):
                self._comment_log_editor_disappearance_diag(None, pending, reason="draft_reopen_blocked_no_reclick", extra=payload)
            if hasattr(self, "_comment_set_flow_stage"):
                self._comment_set_flow_stage("reply_editor_lost_hold", None, reason="draft_reopen_blocked_no_reclick")
            self._schedule_fast_comment_inspect(1200)

    def _comment_pump_ready_draft_inject(self, result: dict[str, Any]) -> bool:
            """V67: only patch the V64 ready->draft gap.

            If the reply editor is already visible and the Coze text is already
            attached to comment_pending_draft_probe_target, run the existing draft
            injection from the normal inspect loop. This does not alter filter,
            candidate selection, or reply-button open behavior.
            """
            pending = self.comment_pending_draft_probe_target if isinstance(getattr(self, "comment_pending_draft_probe_target", None), dict) else {}
            if not pending:
                return False
            if str(pending.get("phase", "") or "") != "stage":
                return False
            if self.comment_pending_reply_future is not None or self.comment_pending_send_payload is not None:
                return False
            draft_text = re.sub(r"\s+", " ", str(pending.get("draftText", "") or "")).strip()
            if not draft_text:
                return False
            composers = result.get("composers", {}) if isinstance(result, dict) else {}
            reply_editors = composers.get("replyEditors", []) if isinstance(composers, dict) else []
            if not reply_editors:
                return False
            target = {
                "threadKey": str(pending.get("threadKey", "") or ""),
                "author": str(pending.get("author", "") or ""),
                "content": str(pending.get("content", "") or ""),
                "timeText": str(pending.get("timeText", "") or ""),
            }
            matched_thread = self._comment_find_target_thread(result, target) if isinstance(result, dict) else None
            editor_visible = bool((matched_thread or {}).get("replyEditorVisible", False)) or bool(reply_editors)
            if not editor_visible:
                return False
            now_ms = self._now_ms()
            if self.busy:
                if now_ms - int(getattr(self, "comment_ready_draft_pump_busy_last_log_ms", 0) or 0) >= 1200:
                    self.comment_ready_draft_pump_busy_last_log_ms = now_ms
                    self._log("INFO", f"COMMENT_TRACE_DRAFT_PROBE_V70 | ready_draft_inject_pump_wait_busy={json.dumps({'threadKey': target.get('threadKey', ''), 'author': target.get('author', ''), 'stage': str(getattr(self, 'comment_stage_name', '') or ''), 'decision': 'wait_current_js_then_inject'}, ensure_ascii=False)}")
                QTimer.singleShot(180, lambda: self._schedule_fast_comment_inspect(300))
                return True
            if now_ms - int(getattr(self, "comment_last_draft_probe_attempt_ms", 0) or 0) < 350:
                return True
            if hasattr(self, "_comment_set_flow_stage"):
                self._comment_set_flow_stage("reply_draft_inject_probe", None, reason="ready_draft_inject_pump_visible_editor")
            self._log("INFO", f"COMMENT_TRACE_DRAFT_PROBE_V70 | ready_draft_inject_pump_start={json.dumps({'threadKey': target.get('threadKey', ''), 'author': target.get('author', ''), 'draftPreview': draft_text[:80], 'replyEditors': len(reply_editors) if isinstance(reply_editors, list) else 0, 'editorVisible': editor_visible, 'decision': 'inject_from_normal_inspect_loop'}, ensure_ascii=False)}")
            self._run_comment_reply_draft_probe(dict(pending))
            return True

    def _maybe_probe_comment_reply_draft(self, result: dict[str, Any]) -> None:
            if not self.running or not self.ready or self.current_module != "comment" or not self.page:
                return
            if not self._comment_draft_probe_enabled():
                now_ms = self._now_ms()
                composers = result.get("composers", {}) or {}
                reply_editors = composers.get("replyEditors", []) or []
                has_editor = bool(reply_editors) or bool(self.comment_active_reply_target)
                if has_editor and now_ms - int(getattr(self, "comment_trace_draft_decision_last_ms", 0) or 0) >= 2500:
                    self.comment_trace_draft_decision_last_ms = now_ms
                    self._log(
                        "INFO",
                        f"评论回复草稿链路暂缓: {json.dumps({'draft_decision': 'disabled_for_editor_open_stage', 'stage': str(getattr(self, 'comment_stage_name', '') or ''), 'replyEditors': len(reply_editors) if isinstance(reply_editors, list) else 0, 'activeTarget': bool(self.comment_active_reply_target), 'aliveStreak': int(getattr(self, 'comment_reply_editor_alive_streak', 0) or 0), 'lostStreak': int(getattr(self, 'comment_reply_editor_lost_streak', 0) or 0)}, ensure_ascii=False)}",
                    )
                return
            self._collect_comment_pending_reply_result()
            # V67: V64 opens the editor reliably; this keeps the later draft injection
            # from being skipped by scan-stage gating after reply_editor_ready_for_draft.
            if self._comment_pump_ready_draft_inject(result):
                return
            if self.comment_pending_switch_target is not None:
                return
            if self.comment_pending_reply_target is not None:
                return
            if hasattr(self, "_comment_is_scan_stage_ready") and not self._comment_is_scan_stage_ready(result):
                now_ms = self._now_ms()
                if now_ms - int(getattr(self, "comment_trace_draft_decision_last_ms", 0) or 0) >= 1200:
                    self.comment_trace_draft_decision_last_ms = now_ms
                    self._log(
                        "INFO",
                        f"评论回复草稿链路暂缓: {json.dumps({'draft_decision': 'blocked_by_comment_flow_stage', 'stage': str(getattr(self, 'comment_stage_name', '') or ''), 'currentFilter': self._comment_filter_text(result), 'candidateCount': self._comment_candidate_count(result)}, ensure_ascii=False)}",
                    )
                return
            work_key = self._comment_current_work_key(result)
            if not work_key or work_key in self.comment_completed_work_keys:
                return
            composers = result.get("composers", {}) or {}
            reply_editors = composers.get("replyEditors", []) or []
            if not reply_editors:
                pending = self.comment_pending_draft_probe_target or {}
                pending_phase = str(pending.get("phase", "") or "") if isinstance(pending, dict) else ""
                if isinstance(pending, dict) and pending_phase in {"generate", "stage", "reactivate", "ready"}:
                    last_log_ms = int(pending.get("lastMissingHoldLogMs", 0) or 0)
                    now_ms = self._now_ms()
                    if now_ms - last_log_ms >= 1200:
                        pending["lastMissingHoldLogMs"] = now_ms
                        self.comment_pending_draft_probe_target = pending
                        payload = {
                            "threadKey": pending.get("threadKey", ""),
                            "author": pending.get("author", ""),
                            "phase": pending_phase,
                            "decision": "hold_no_reclick",
                            "reason": "reply_editor_missing_after_draft_pending",
                            "lastRiskyAction": getattr(self, "comment_last_editor_risky_action", {}) or {},
                        }
                        self._log("WARN", f"COMMENT_TRACE_DRAFT_PROBE_V70 | draft_editor_missing_hold={json.dumps(payload, ensure_ascii=False)}")
                        if hasattr(self, "_comment_log_editor_disappearance_diag"):
                            self._comment_log_editor_disappearance_diag(result, pending, reason="draft_pending_editor_missing_no_reclick", extra=payload)
                        if hasattr(self, "_comment_set_flow_stage"):
                            self._comment_set_flow_stage("reply_editor_lost_hold", result, reason="draft_pending_editor_missing_no_reclick")
                    return
                if self.comment_pending_reply_future is not None:
                    return
                self.comment_active_reply_target = None
                return
            active_target = self.comment_active_reply_target or {}
            if not active_target:
                visible_thread = next(
                    (
                        item for item in (result.get("topComments", []) or [])
                        if isinstance(item, dict) and item.get("replyEditorVisible")
                    ),
                    None,
                )
                if isinstance(visible_thread, dict):
                    target_message = self._comment_effective_reply_target_message(visible_thread) if hasattr(self, "_comment_effective_reply_target_message") else {}
                    active_target = {
                        "threadKey": str(visible_thread.get("threadKey", "") or ""),
                        "author": str((target_message or {}).get("author", "") or visible_thread.get("author", "") or ""),
                        "content": str((target_message or {}).get("content", "") or visible_thread.get("content", "") or ""),
                        "timeText": str((target_message or {}).get("timeText", "") or visible_thread.get("timeText", "") or ""),
                        "targetMessageKey": str((target_message or {}).get("messageKey", "") or visible_thread.get("targetMessageKey", "") or ""),
                        "targetParentThreadKey": str((target_message or {}).get("parentThreadKey", "") or visible_thread.get("threadKey", "") or ""),
                        "targetLevel": str((target_message or {}).get("level", "") or visible_thread.get("targetLevel", "") or ""),
                        "targetIndex": (target_message or {}).get("index", visible_thread.get("targetIndex", -1)),
                        "replyNeedReason": str(visible_thread.get("replyNeedReason", "") or ""),
                    }
                    self.comment_active_reply_target = active_target
            if not active_target:
                return
            thread_signature = self._comment_target_signature(active_target, result=result)
            if not thread_signature or thread_signature in self.comment_completed_thread_keys:
                return
            pending = self.comment_pending_draft_probe_target
            if pending and str(pending.get("signature", "") or "") != thread_signature:
                return
            now_ms = self._now_ms()
            cache_key = self._build_comment_reply_cache_key(result, active_target)
            cached = self.comment_draft_cache.get(cache_key) if cache_key else None
            if pending is None:
                pending = {
                    "workKey": work_key,
                    "threadKey": str(active_target.get("threadKey", "") or ""),
                    "author": str(active_target.get("author", "") or ""),
                    "content": str(active_target.get("content", "") or ""),
                    "timeText": str(active_target.get("timeText", "") or ""),
                    "signature": thread_signature,
                    "attemptMs": now_ms,
                    "attemptNo": int(self.comment_draft_probe_attempts or 0) + 1,
                    "phase": "generate",
                    "draftText": str((cached or {}).get("text", "") or ""),
                    "source": str((cached or {}).get("source", "") or ""),
                    "model": str((cached or {}).get("model", "") or ""),
                    "reason": str((cached or {}).get("reason", "") or ""),
                    "cacheKey": cache_key,
                    "reactivateCount": 0,
                }
                self.comment_pending_draft_probe_target = pending
                self.comment_draft_probe_attempts += 1
            if pending.get("phase") == "generate":
                if cached and str(cached.get("text", "") or "").strip():
                    pending["draftText"] = str(cached.get("text", "") or "").strip()
                    pending["source"] = str(cached.get("source", "") or "")
                    pending["model"] = str(cached.get("model", "") or "")
                    pending["reason"] = str(cached.get("reason", "") or "")
                    pending["phase"] = "stage"
                elif self.comment_pending_reply_future is None:
                    self._start_comment_reply_draft_async(cache_key, thread_signature, result, active_target)
                    return
                else:
                    return
            if self.comment_pending_reply_future is not None:
                return
            draft_text = re.sub(r"\s+", " ", str(pending.get("draftText", "") or "")).strip()
            if not draft_text:
                self._log("WARN", f"评论回复草稿为空，跳过本轮候选: {json.dumps({'threadKey': pending.get('threadKey', ''), 'author': pending.get('author', '')}, ensure_ascii=False)}")
                self.comment_pending_draft_probe_target = None
                return
            phase = str(pending.get("phase", "stage") or "stage")
            if phase not in {"stage", "reactivate"}:
                return
            if now_ms - self.comment_last_draft_probe_attempt_ms < 1800:
                return
            if phase == "reactivate" and int(pending.get("reactivateCount", 0) or 0) >= self._comment_reactivate_max_attempts():
                self._log("WARN", f"评论回复重激活超过上限，放弃本轮候选: {json.dumps({'threadKey': pending.get('threadKey', ''), 'author': pending.get('author', ''), 'reactivateCount': pending.get('reactivateCount', 0)}, ensure_ascii=False)}")
                self.comment_pending_draft_probe_target = None
                return
            if phase == "stage" and thread_signature == self.comment_last_stage_signature:
                pending["phase"] = "reactivate"
            self._run_comment_reply_draft_probe(pending)

    def _handle_comment_probe_reply_draft_result(self, result: Any) -> None:
            self.busy = False
            result = self._coerce_js_result(result)
            pending = self.comment_pending_stage_payload or self.comment_pending_draft_probe_target or {}
            self.comment_pending_stage_payload = None
            if not isinstance(result, dict):
                self._log("WARN", f"评论回复草稿注入结果异常，类型={type(result).__name__}，内容片段={str(result)[:240]}")
                self.comment_pending_draft_probe_target = None
                self._schedule_fast_comment_inspect(1600)
                return
            summary = {
                "ok": result.get("ok", False),
                "state": result.get("state", "unknown"),
                "phase": result.get("phase", "stage"),
                "author": result.get("author", ""),
                "draftPreview": str(result.get("draftPreview", "") or "")[:80],
                "afterDisabled": result.get("afterDisabled"),
                "activationMethod": result.get("activationMethod", ""),
                "cancelClicked": result.get("cancelClicked", False),
                "inputLength": result.get("inputLength"),
                "draftReadback": str(result.get("draftPreview", "") or "")[:80],
                "readbackMatched": (str(result.get("draftPreview", "") or "").strip() == str((pending or {}).get("draftText", "") or "").strip()),
            }
            state = str(result.get("state", "") or "")
            phase = str((pending or {}).get("phase", "stage") or "stage")
            result_phase = str(result.get("phase", "") or "") if isinstance(result, dict) else ""
            editor_missing_states = {"editor_missing", "target_editor_missing"}
            expected_finalize_missing = (state in editor_missing_states and isinstance(pending, dict) and (phase == "dry_run_finalize_pending" or result_phase == "finalize"))
            level = "INFO" if (result.get("ok") or expected_finalize_missing) else "WARN"
            if not expected_finalize_missing:
                self._log(level, f"评论回复草稿注入结果: {json.dumps(summary, ensure_ascii=False)}")
            if not result.get("ok"):
                if state in editor_missing_states and isinstance(pending, dict) and (phase == "dry_run_finalize_pending" or result_phase == "finalize"):
                    payload = {
                        "threadKey": pending.get("threadKey", ""),
                        "author": pending.get("author", ""),
                        "phase": phase,
                        "resultPhase": result_phase,
                        "decision": "treat_as_dry_run_finalize_completed",
                        "reason": "mock_send_click_plan_already_logged_editor_missing_on_close",
                        "sendClicked": False,
                        "dispatchEvents": False,
                    }
                    self._log("INFO", f"COMMENT_TRACE_DRAFT_PROBE_V70 | dry_run_finalize_editor_missing_release={json.dumps(payload, ensure_ascii=False)}")
                    self._comment_release_after_dry_run_finalize(pending, reason="dry_run_finalize_editor_missing_release", result=None, editor_closed=True)
                    return
                if state in editor_missing_states and isinstance(pending, dict) and phase in {"stage", "reactivate"}:
                    last_visible_ms = int(getattr(self, "comment_reply_editor_alive_last_visible_ms", 0) or 0)
                    since_visible_ms = (self._now_ms() - last_visible_ms) if last_visible_ms else 999999
                    missing_retry = int(pending.get("draftMissingRetry", 0) or 0)
                    if bool(getattr(self, "comment_reply_editor_ever_visible", False)) and since_visible_ms <= 1800 and missing_retry < 2:
                        pending["draftMissingRetry"] = missing_retry + 1
                        pending["phase"] = "stage"
                        self.comment_pending_draft_probe_target = pending
                        self.comment_pending_stage_payload = None
                        self._log("WARN", f"评论回复草稿注入时编辑器短暂丢失，保留目标重试: {json.dumps({'author': pending.get('author', ''), 'retry': pending.get('draftMissingRetry', 0), 'sinceVisibleMs': since_visible_ms}, ensure_ascii=False)}")
                        self._schedule_fast_comment_inspect(650)
                        return
                    payload = {
                        "threadKey": pending.get("threadKey", ""),
                        "author": pending.get("author", ""),
                        "phase": phase,
                        "reactivateCount": pending.get("reactivateCount", 0),
                        "decision": "hold_no_reclick",
                        "reason": state or "draft_probe_editor_missing",
                    }
                    self._log("WARN", f"评论回复草稿注入失败，编辑器已消失: {json.dumps(payload, ensure_ascii=False)}")
                    if hasattr(self, "_comment_log_editor_disappearance_diag"):
                        self._comment_log_editor_disappearance_diag(None, pending, reason="draft_probe_editor_missing_release_to_next_candidate", extra=payload)
                    if hasattr(self, "_comment_cooldown_reply_open_target"):
                        self._comment_cooldown_reply_open_target(pending, reason="draft_probe_editor_missing_release", cooldown_ms=30000)
                    self.comment_pending_draft_probe_target = None
                    self.comment_pending_stage_payload = None
                    self.comment_active_reply_target = None
                    self.comment_pending_reply_target = None
                    self.comment_reply_editor_ever_visible = False
                    self.comment_reply_editor_visible_identity = ""
                    self.comment_reply_editor_lost_streak = 0
                    self.comment_reply_editor_alive_streak = 0
                    if hasattr(self, "_comment_set_flow_stage"):
                        self._comment_set_flow_stage("scan_candidates_under_unreplied", None, reason="draft_probe_editor_missing_release_to_next_candidate")
                    self._schedule_fast_comment_inspect(900)
                    return
                self.comment_pending_draft_probe_target = None
                self._schedule_fast_comment_inspect(1600)
                return
            signature = str((pending or {}).get("signature", "") or "")
            phase = str(result.get("phase", pending.get("phase", "stage") if isinstance(pending, dict) else "stage") or "stage")
            payload = dict(pending or {})
            payload["draftText"] = re.sub(r"\s+", " ", str(result.get("draftPreview", "") or payload.get("draftText", "") or "")).strip()
            send_snapshot = self._comment_build_send_click_snapshot(result, payload)
            if send_snapshot:
                payload["sendClickSnapshot"] = send_snapshot
                if self._comment_verbose_logs_enabled():
                    self._log("INFO", f"COMMENT_TRACE_DRY_RUN_V23 | send_click_snapshot_cached={json.dumps({'threadKey': payload.get('threadKey', ''), 'author': payload.get('author', ''), 'sendFound': send_snapshot.get('sendFound', False), 'sendEnabled': send_snapshot.get('sendEnabled', False), 'sendButtonCenter': send_snapshot.get('sendButtonCenter', {}), 'decision': 'cache_would_click_position_no_click'}, ensure_ascii=False)}")
            if not payload["draftText"]:
                self.comment_pending_draft_probe_target = None
                self._schedule_fast_comment_inspect(1600)
                return
            if phase == "finalize":
                self._log(
                    "INFO",
                    f"评论回复发送前阶段确认成功: {json.dumps({'threadKey': payload.get('threadKey', ''), 'author': payload.get('author', ''), 'confirmMode': 'dry_run_mock_plan_verified_cancel_closed', 'editorClosed': bool(result.get('cancelClicked', False)), 'sendClicked': False, 'dispatchEvents': False, 'decision': 'continue_next_candidate_after_dry_run'}, ensure_ascii=False)}",
                )
                self._comment_release_after_dry_run_finalize(payload, reason="dry_run_finalize_closed_continue_next_candidate", result=None, editor_closed=bool(result.get("cancelClicked", False)))
                return
            if signature and phase == "stage":
                self.comment_last_stage_signature = signature
            after_disabled = result.get("afterDisabled")
            expected_text = re.sub(r"\s+", " ", str((pending or {}).get("draftText", "") or "")).strip()
            readback_text = re.sub(r"\s+", " ", str(result.get("draftPreview", "") or payload.get("draftText", "") or "")).strip()
            readback_matched = bool(expected_text and readback_text == expected_text)
            if readback_matched:
                payload["phase"] = "ready"
                payload["sendEnabled"] = bool(after_disabled is False)
                if hasattr(self, "_comment_set_flow_stage"):
                    self._comment_set_flow_stage("reply_draft_verified", None, reason="draft_text_readback_matched_ready")
                self.comment_pending_draft_probe_target = payload
                auto_send_enabled = self._comment_auto_send_enabled()
                self._log(
                    "INFO",
                    f"COMMENT_TRACE_DRAFT_PROBE_V74 | reply_text_ready={json.dumps({'threadKey': payload.get('threadKey', ''), 'author': payload.get('author', ''), 'mode': 'text_readback_ready', 'sendEnabled': bool(after_disabled is False), 'afterDisabled': after_disabled, 'autoSend': auto_send_enabled, 'decision': 'controlled_send' if auto_send_enabled else 'hold_text_without_send'}, ensure_ascii=False)}",
                )
                if auto_send_enabled:
                    self._maybe_send_comment_reply(payload)
                else:
                    self._comment_enter_manual_send_hold(payload, reason="draft_text_readback_matched_hold_no_reactivation")
                return
            payload["phase"] = "manual_send_hold"
            payload["sendEnabled"] = bool(after_disabled is False)
            self.comment_pending_draft_probe_target = payload
            self._log("WARN", f"COMMENT_TRACE_DRAFT_PROBE_V70 | reply_text_hold_unmatched_no_reactivation={json.dumps({'threadKey': payload.get('threadKey', ''), 'author': payload.get('author', ''), 'draftPreview': readback_text[:80], 'expectedPreview': expected_text[:80], 'afterDisabled': after_disabled, 'decision': 'hold_for_diagnostics_no_reactivation'}, ensure_ascii=False)}")
            self._comment_enter_manual_send_hold(payload, reason="draft_text_unmatched_hold_no_reactivation")
            return

    def _maybe_send_comment_reply(self, payload: dict[str, Any]) -> None:
            if not self._comment_auto_send_enabled():
                now_ms = self._now_ms()
                if now_ms - int(getattr(self, "comment_real_send_blocked_last_log_ms", 0) or 0) >= 5000:
                    self.comment_real_send_blocked_last_log_ms = now_ms
                    self._log("INFO", f"COMMENT_TRACE_DRY_RUN_V20 | real_send_blocked={json.dumps({'threadKey': payload.get('threadKey', ''), 'author': payload.get('author', ''), 'autoSend': False, 'sendDisabled': True, 'decision': 'dry_run_boundary_no_send_script'}, ensure_ascii=False)}")
                return
            if not self.page or self.busy or self.current_module != "comment" or not self.running or not self.ready:
                return
            signature = str(payload.get("signature", "") or "")
            draft_text = re.sub(r"\s+", " ", str(payload.get("draftText", "") or "")).strip()
            if not signature or not draft_text:
                return
            if signature == self.comment_last_send_signature:
                return
            send_payload = dict(payload)
            send_payload["startedAt"] = self._now_ms()
            send_payload["nativeNudgeCount"] = int(send_payload.get("nativeNudgeCount", 0) or 0)
            send_payload["sendButtonPollCount"] = 0
            self.comment_pending_send_payload = send_payload
            self.busy = True
            self._log(
                "INFO",
                f"评论受控发送启动: {json.dumps({'threadKey': payload.get('threadKey', ''), 'author': payload.get('author', ''), 'draftPreview': draft_text[:80], 'mode': 'qt_native_nudge_then_controlled_click'}, ensure_ascii=False)}",
            )
            self._comment_focus_then_native_nudge_send(send_payload)

    def _comment_focus_then_native_nudge_send(self, payload: dict[str, Any]) -> None:
            if not self.page or not self.running or self.current_module != "comment":
                self.busy = False
                return
            try:
                self.page.runJavaScript(
                    build_comment_focus_reply_editor_script(
                        str(payload.get("threadKey", "") or ""),
                        str(payload.get("author", "") or ""),
                        str(payload.get("content", "") or ""),
                        target_message_key=str(payload.get("targetMessageKey", "") or ""),
                        reply_dom_key=str(payload.get("replyDomKey", "") or ""),
                        target_level=str(payload.get("targetLevel", "") or ""),
                        target_index=int(payload.get("targetIndex", -999) if payload.get("targetIndex", -999) is not None else -999),
                        target_parent_thread_key=str(payload.get("targetParentThreadKey", "") or ""),
                    ),
                    lambda result: self._handle_comment_native_send_focus_result(result, payload),
                )
            except Exception as exc:
                self._log("WARN", f"评论受控发送聚焦异常: {type(exc).__name__}: {str(exc)[:160]}")
                self._run_comment_send_reply_script(payload)

    def _handle_comment_native_send_focus_result(self, result: Any, payload: dict[str, Any]) -> None:
            focus_result = self._coerce_js_result(result)
            if not isinstance(focus_result, dict) or not focus_result.get("ok"):
                self.busy = False
                state = str((focus_result or {}).get("state", "invalid_focus_result") if isinstance(focus_result, dict) else "invalid_focus_result")
                recovery = int(payload.get("editorRecoveryCount", 0) or 0) + 1
                retry_payload = dict(payload)
                retry_payload["editorRecoveryCount"] = recovery
                retry_payload["phase"] = "reactivate"
                retry_payload["reactivateCount"] = int(retry_payload.get("reactivateCount", 0) or 0) + 1
                self.comment_pending_send_payload = None
                self.comment_pending_draft_probe_target = retry_payload
                self._log("WARN", f"评论受控发送已阻止：当前目标编辑器未绑定，不执行输入激活或发送点击: {json.dumps({'state': state, 'author': payload.get('author', ''), 'threadKey': payload.get('threadKey', ''), 'targetMessageKey': payload.get('targetMessageKey', ''), 'replyDomKey': payload.get('replyDomKey', ''), 'editorRecoveryCount': recovery}, ensure_ascii=False)}")
                if hasattr(self, "_comment_set_flow_stage"):
                    self._comment_set_flow_stage("reply_editor_recovering", None, reason="target_editor_focus_missing_block_send")
                if recovery <= 2:
                    def _retry_exact_editor() -> None:
                        if not self.running or not self.ready or self.current_module != "comment" or not self.page:
                            return
                        if self.busy:
                            QTimer.singleShot(180, _retry_exact_editor)
                            return
                        self._run_comment_reply_draft_probe(dict(retry_payload))
                    QTimer.singleShot(520, _retry_exact_editor)
                else:
                    self._log("WARN", f"评论当前目标编辑器连续恢复失败，保留草稿并释放为可重试状态: {json.dumps({'threadKey': payload.get('threadKey', ''), 'author': payload.get('author', ''), 'editorRecoveryCount': recovery}, ensure_ascii=False)}")
                    self.comment_pending_draft_probe_target = None
                    self.comment_active_reply_target = None
                    for key in [str(payload.get("signature", "") or ""), str(payload.get("targetMessageKey", "") or "")]:
                        if key and hasattr(self, "_comment_release_inflight_signature"):
                            self._comment_release_inflight_signature(key, reason="target_editor_recovery_failed")
                    if hasattr(self, "_comment_set_flow_stage"):
                        self._comment_set_flow_stage("send_failed_cooldown", None, reset=True, reason="target_editor_recovery_failed")
                    if hasattr(self, "_comment_enter_runtime_cooldown"):
                        self._comment_enter_runtime_cooldown("send_failed_retryable", min_ms=12000, max_ms=18000)
                    self._schedule_fast_comment_inspect(1200)
                return
            nudge_done = self._comment_perform_qt_native_text_nudge(focus_result, payload)
            delay = 420 if nudge_done else 160
            QTimer.singleShot(delay, lambda: self._run_comment_send_reply_script(payload))

    def _comment_perform_qt_native_text_nudge(self, focus_result: dict[str, Any], payload: dict[str, Any]) -> bool:
            if QTest is None:
                return False
            view = getattr(self, "view", None)
            if view is None:
                return False
            try:
                point_info = (((focus_result.get("target") or {}) if isinstance(focus_result, dict) else {}).get("inputRect") or {})
                x = int(point_info.get("x", 0) or 0) + max(1, int(point_info.get("w", 0) or 0) // 2)
                y = int(point_info.get("y", 0) or 0) + max(1, int(point_info.get("h", 0) or 0) // 2)
                try:
                    view.raise_()
                except Exception:
                    pass
                try:
                    view.activateWindow()
                except Exception:
                    pass
                try:
                    view.setFocus(Qt.FocusReason.MouseFocusReason)
                except Exception:
                    try:
                        view.setFocus()
                    except Exception:
                        pass
                if x > 0 and y > 0:
                    point = QPoint(x, y)
                    QTest.mouseMove(view, point, 20)
                    QTest.mouseClick(view, Qt.MouseButton.LeftButton, Qt.KeyboardModifier.NoModifier, point, 60)
                # 真实键盘事件触发 Douyin/React 的输入状态更新；先加空格再退格，保留草稿文本不变。
                QTest.keyClick(view, Qt.Key.Key_Space, Qt.KeyboardModifier.NoModifier, 30)
                QTest.keyClick(view, Qt.Key.Key_Backspace, Qt.KeyboardModifier.NoModifier, 30)
                payload["nativeNudgeCount"] = int(payload.get("nativeNudgeCount", 0) or 0) + 1
                if payload.get("nativeNudgeCount", 0) > 1 or bool(getattr(self, "_comment_verbose_logs_enabled", lambda: False)()):
                    self._log("INFO", f"评论受控发送执行输入状态激活: {json.dumps({'author': payload.get('author', ''), 'count': payload.get('nativeNudgeCount', 0)}, ensure_ascii=False)}")
                return True
            except Exception as exc:
                self._log("WARN", f"评论受控发送 Qt 原生文本激活失败: {type(exc).__name__}: {str(exc)[:160]}")
                return False

    def _run_comment_send_reply_script(self, payload: dict[str, Any]) -> None:
            if not self.page or not self.running or self.current_module != "comment":
                self.busy = False
                return
            draft_text = re.sub(r"\s+", " ", str(payload.get("draftText", "") or "")).strip()
            self.page.runJavaScript(
                build_comment_send_reply_script(
                    str(payload.get("threadKey", "") or ""),
                    str(payload.get("author", "") or ""),
                    str(payload.get("content", "") or ""),
                    draft_text,
                    target_message_key=str(payload.get("targetMessageKey", "") or ""),
                    reply_dom_key=str(payload.get("replyDomKey", "") or ""),
                    target_level=str(payload.get("targetLevel", "") or ""),
                    target_index=int(payload.get("targetIndex", -999) if payload.get("targetIndex", -999) is not None else -999),
                    target_parent_thread_key=str(payload.get("targetParentThreadKey", "") or ""),
                ),
                self._handle_comment_send_reply_result,
            )

    def _comment_perform_qt_send_button_click(self, result: dict[str, Any], payload: dict[str, Any]) -> bool:
            if QTest is None:
                return False
            view = getattr(self, "view", None)
            if view is None:
                return False
            try:
                point_info = result.get("clickPoint", {}) if isinstance(result, dict) else {}
                x = int(point_info.get("x", 0) or 0)
                y = int(point_info.get("y", 0) or 0)
                if x <= 0 or y <= 0:
                    rect = result.get("sendButtonRect", {}) if isinstance(result, dict) else {}
                    x = int(rect.get("x", 0) or 0) + max(1, int(rect.get("w", 0) or 0) // 2)
                    y = int(rect.get("y", 0) or 0) + max(1, int(rect.get("h", 0) or 0) // 2)
                if x <= 0 or y <= 0:
                    return False
                try:
                    view.raise_()
                except Exception:
                    pass
                try:
                    view.activateWindow()
                except Exception:
                    pass
                try:
                    view.setFocus(Qt.FocusReason.MouseFocusReason)
                except Exception:
                    try:
                        view.setFocus()
                    except Exception:
                        pass
                point = QPoint(x, y)
                QTest.mouseMove(view, point, 20)
                QTest.mouseClick(view, Qt.MouseButton.LeftButton, Qt.KeyboardModifier.NoModifier, point, 80)
                self._log("INFO", f"评论受控发送已执行 Qt 视图级点击发送: {json.dumps({'threadKey': payload.get('threadKey', ''), 'author': payload.get('author', ''), 'x': x, 'y': y}, ensure_ascii=False)}")
                return True
            except Exception as exc:
                self._log("WARN", f"评论受控发送 Qt 点击发送失败: {type(exc).__name__}: {str(exc)[:160]}")
                return False

    def _handle_comment_send_reply_result(self, result: Any) -> None:
            self.busy = False
            result = self._coerce_js_result(result)
            payload = self.comment_pending_send_payload or {}
            if not isinstance(result, dict):
                self._log("WARN", f"评论受控发送结果异常，类型={type(result).__name__}，内容片段={str(result)[:240]}")
                self.comment_pending_send_payload = None
                self.comment_pending_draft_probe_target = None
                self._schedule_fast_comment_inspect(1600)
                return
            summary = {
                "ok": result.get("ok", False),
                "state": result.get("state", "unknown"),
                "author": result.get("author", ""),
                "beforeDisabled": result.get("beforeDisabled"),
                "afterDisabled": result.get("afterDisabled"),
                "activationMethod": result.get("activationMethod", ""),
                "resolvedBy": result.get("resolvedBy", ""),
                "transactionId": result.get("transactionId", ""),
                "editorDomKey": result.get("editorDomKey", ""),
                "nativeNudgeCount": int((payload or {}).get("nativeNudgeCount", 0) or 0),
                "pollCount": int((payload or {}).get("sendButtonPollCount", 0) or 0),
            }
            state = str(result.get("state", "") or "")
            level = "INFO" if result.get("ok") or state == "send_button_disabled" else "WARN"
            self._log(level, f"评论受控发送结果: {json.dumps(summary, ensure_ascii=False)}")
            if result.get("ok") and result.get("state") in {"send_ready", "send_clicked"}:
                clicked = True
                if result.get("state") == "send_ready":
                    clicked = self._comment_perform_qt_send_button_click(result, payload)
                    if not clicked:
                        clicked = bool(result.get("jsClickFallback", False))
                if clicked:
                    signature = str(payload.get("signature", "") or "")
                    if signature:
                        self.comment_last_send_signature = signature
                    self._schedule_fast_comment_inspect(1800)
                    return
            self.comment_pending_send_payload = None
            if isinstance(payload, dict) and state == "send_button_disabled":
                pending = dict(payload)
                native_count = int(pending.get("nativeNudgeCount", 0) or 0)
                poll_count = int(pending.get("sendButtonPollCount", 0) or 0)
                max_polls = self._comment_send_enable_poll_attempts()
                # D10: React often enables the send button shortly after the first
                # native Space+Backspace event. Poll the same transaction-bound
                # button before issuing another native key sequence.
                if native_count > 0 and poll_count < max_polls:
                    pending["sendButtonPollCount"] = poll_count + 1
                    self.comment_pending_send_payload = pending
                    self.busy = True
                    if bool(getattr(self, "_comment_verbose_logs_enabled", lambda: False)()):
                        self._log("INFO", f"评论受控发送等待按钮启用: {json.dumps({'author': pending.get('author', ''), 'poll': pending.get('sendButtonPollCount', 0), 'maxPolls': max_polls}, ensure_ascii=False)}")
                    QTimer.singleShot(self._comment_send_enable_poll_interval_ms(), lambda: self._run_comment_send_reply_script(pending))
                    return
                max_native = max(2, self._comment_reactivate_max_attempts() + 2)
                if native_count < max_native:
                    pending["sendButtonPollCount"] = 0
                    self._log("INFO", f"评论受控发送按钮持续禁用，执行下一次输入状态激活: {json.dumps({'author': pending.get('author', ''), 'nativeNudgeCount': native_count, 'maxNative': max_native}, ensure_ascii=False)}")
                    self.comment_pending_send_payload = pending
                    self.busy = True
                    QTimer.singleShot(420, lambda: self._comment_focus_then_native_nudge_send(pending))
                    return
            retryable_states = {"draft_mismatch", "editor_missing", "target_editor_missing"}
            if isinstance(payload, dict) and state in retryable_states:
                pending = dict(payload)
                pending["phase"] = "reactivate"
                pending["reactivateCount"] = int(pending.get("reactivateCount", 0) or 0) + 1
                self.comment_pending_draft_probe_target = pending
                if int(pending.get("reactivateCount", 0) or 0) < self._comment_reactivate_max_attempts() + 1:
                    self._schedule_fast_comment_inspect(1800)
                    return
            self.comment_pending_draft_probe_target = None
            self._schedule_fast_comment_inspect(1800)

    def _comment_normalize_reply_confirmation_text(self, value: Any) -> str:
            text = re.sub(r"\s+", " ", str(value or "")).strip()
            text = re.sub(r"^回复\s*[^:：]{1,100}[:：]\s*", "", text)
            return text.casefold()[:500]

    def _comment_reply_text_matches_draft(self, message_text: Any, draft_text: Any) -> bool:
            actual = self._comment_normalize_reply_confirmation_text(message_text)
            expected = self._comment_normalize_reply_confirmation_text(draft_text)
            if not actual or not expected:
                return False
            if actual == expected or actual in expected or expected in actual:
                return True
            return SequenceMatcher(None, actual, expected).ratio() >= 0.72

    def _comment_find_new_author_reply_evidence(self, matched_thread: dict[str, Any] | None, payload: dict[str, Any]) -> dict[str, Any]:
            thread = matched_thread if isinstance(matched_thread, dict) else {}
            nested = [item for item in (thread.get("nestedReplies", []) or []) if isinstance(item, dict)]
            before_nested = max(0, int(payload.get("beforeNestedReplyCount", 0) or 0))
            before_messages = max(0, int(payload.get("beforeMessageCount", 0) or 0))
            target_index = int(payload.get("targetIndex", -1) if payload.get("targetIndex", -1) is not None else -1)
            current_messages = 1 + len(nested) if thread else 0
            snapshot_valid = bool(before_messages >= 1)
            count_increased = bool(snapshot_valid and (current_messages > before_messages or len(nested) > before_nested))
            candidates = []
            for item in nested:
                if not item.get("isAuthor"):
                    continue
                item_index = int(item.get("index", -1) if item.get("index", -1) is not None else -1)
                if item_index <= target_index:
                    continue
                if before_nested and item_index < before_nested:
                    continue
                if self._comment_reply_text_matches_draft(item.get("content", ""), payload.get("draftText", "")):
                    candidates.append(item)
            evidence = candidates[-1] if candidates else None
            return {
                "confirmed": bool(snapshot_valid and count_increased and evidence),
                "snapshotValid": snapshot_valid,
                "countIncreased": count_increased,
                "beforeNestedReplyCount": before_nested,
                "afterNestedReplyCount": len(nested),
                "beforeMessageCount": before_messages,
                "afterMessageCount": current_messages,
                "targetIndex": target_index,
                "newAuthorReply": evidence or {},
            }

    def _maybe_confirm_comment_reply_send(self, result: dict[str, Any]) -> None:
            payload = self.comment_pending_send_payload or {}
            if not payload:
                return
            signature = str(payload.get("signature", "") or "")
            target = {
                "threadKey": str(payload.get("threadKey", "") or ""),
                "author": str(payload.get("author", "") or ""),
                "content": str(payload.get("content", "") or ""),
            }
            matched_thread = self._comment_find_target_thread(result, target)
            heuristic = [item for item in (result.get("unrepliedHeuristic", []) or []) if self._comment_thread_match(item, target)]
            has_author_reply = bool((matched_thread or {}).get("hasAuthorReplyInThread", False))
            editor_visible = bool((matched_thread or {}).get("replyEditorVisible", False))
            still_pending = bool(heuristic)
            confirmation = self._comment_find_new_author_reply_evidence(matched_thread, payload)
            send_confirmed = bool(confirmation.get("confirmed"))
            confirm_mode = "new_author_reply_after_target_with_draft_match" if send_confirmed else ""
            if send_confirmed:
                self.comment_last_confirmed_signature = signature
                self.comment_last_confirmed_ms = self._now_ms()
                completed_signature = self._comment_target_signature(target, result=result)
                for key in [
                    signature,
                    str(payload.get("targetMessageKey", "") or ""),
                    str(payload.get("messageKey", "") or ""),
                    completed_signature,
                ]:
                    key = str(key or "").strip()
                    if not key:
                        continue
                    self.comment_completed_thread_keys.add(key)
                    if hasattr(self, "_comment_release_inflight_signature"):
                        self._comment_release_inflight_signature(key, reason="send_confirmed")
                try:
                    self._comment_sync_record_to_backend(
                        result,
                        dict(payload),
                        reply_text=str(payload.get("draftText", "") or ""),
                        status="sent",
                        skip=False,
                        reason="gui_send_confirmed",
                        backend_payload={
                            "commentType": str(payload.get("commentType", "") or payload.get("replyNeedReason", "") or "gui_sent"),
                            "intentLevel": str(payload.get("intentLevel", "") or "medium"),
                            "judgeReason": str(payload.get("reason", "") or payload.get("judgeReason", "") or "gui_send_confirmed"),
                        },
                    )
                except Exception as exc:
                    self._log("WARN", f"评论受控发送确认同步后端失败: {type(exc).__name__}: {str(exc)[:160]}")
                if hasattr(self, "_comment_note_followup_watch_after_send"):
                    self._comment_note_followup_watch_after_send(result, target)
                self.comment_pending_send_payload = None
                self.comment_pending_draft_probe_target = None
                self.comment_active_reply_target = None
                self._log(
                    "INFO",
                    f"评论受控发送确认成功: {json.dumps({'threadKey': target.get('threadKey', ''), 'author': target.get('author', ''), 'confirmMode': confirm_mode, 'beforeMessageCount': confirmation.get('beforeMessageCount', 0), 'afterMessageCount': confirmation.get('afterMessageCount', 0), 'newReplyIndex': (confirmation.get('newAuthorReply', {}) or {}).get('index', -1)}, ensure_ascii=False)}",
                )
                if hasattr(self, "_comment_set_flow_stage"):
                    self._comment_set_flow_stage("post_send_cooldown", result, reset=True, reason="send_confirmed")
                if hasattr(self, "_comment_enter_runtime_cooldown"):
                    cooldown_cfg = self._comment_runtime_cooldown_config() if hasattr(self, "_comment_runtime_cooldown_config") else {}
                    self._comment_enter_runtime_cooldown(
                        "after_send_success",
                        min_ms=int(cooldown_cfg.get("after_send_min_ms", cooldown_cfg.get("after_send_ms", 25000)) or 25000),
                        max_ms=int(cooldown_cfg.get("after_send_max_ms", cooldown_cfg.get("after_send_ms", 25000)) or 25000),
                    )
                return
            started_at = int(payload.get("attemptMs", 0) or payload.get("startedAt", 0) or 0)
            if started_at and self._now_ms() - started_at >= 22000:
                self._log(
                    "WARN",
                    f"评论受控发送超时未确认: {json.dumps({'threadKey': target.get('threadKey', ''), 'author': target.get('author', ''), 'stillPending': still_pending, 'editorVisible': editor_visible, 'hasAuthorReply': has_author_reply, 'snapshotValid': confirmation.get('snapshotValid', False), 'countIncreased': confirmation.get('countIncreased', False), 'beforeMessageCount': confirmation.get('beforeMessageCount', 0), 'afterMessageCount': confirmation.get('afterMessageCount', 0), 'reason': 'no_new_author_reply_matching_current_draft'}, ensure_ascii=False)}",
                )
                # 发送未确认不能标记 completed，也不能保留 last_send_signature/inflight；否则后续会被误认为已完成。
                if signature and signature == str(getattr(self, "comment_last_send_signature", "") or ""):
                    self.comment_last_send_signature = ""
                for key in [signature, str(payload.get("targetMessageKey", "") or ""), str(payload.get("messageKey", "") or ""), str(payload.get("threadKey", "") or "")]:
                    if key and hasattr(self, "_comment_release_inflight_signature"):
                        self._comment_release_inflight_signature(str(key), reason="send_timeout_retryable")
                try:
                    self._comment_sync_record_to_backend(
                        result,
                        dict(payload),
                        reply_text=str(payload.get("draftText", "") or ""),
                        status="failed",
                        skip=False,
                        reason="gui_send_timeout_unconfirmed",
                        backend_payload={
                            "commentType": "gui_send_timeout",
                            "intentLevel": str(payload.get("intentLevel", "") or "medium"),
                            "judgeReason": "GUI 点击发送后未在页面确认到作者回复，保留为可重试状态。",
                        },
                        fail_reason="send_timeout_unconfirmed",
                    )
                except Exception as exc:
                    self._log("WARN", f"评论受控发送失败同步后端失败: {type(exc).__name__}: {str(exc)[:160]}")
                self.comment_pending_send_payload = None
                self.comment_pending_draft_probe_target = None
                self.comment_active_reply_target = None
                if hasattr(self, "_comment_set_flow_stage"):
                    self._comment_set_flow_stage("send_failed_cooldown", result, reset=True, reason="send_timeout_unconfirmed")
                self.busy = False
                if hasattr(self, "_comment_enter_runtime_cooldown"):
                    cooldown_cfg = self._comment_runtime_cooldown_config() if hasattr(self, "_comment_runtime_cooldown_config") else {}
                    self._comment_enter_runtime_cooldown(
                        "send_failed_retryable",
                        min_ms=int(cooldown_cfg.get("failed_retry_min_ms", cooldown_cfg.get("failed_retry_ms", 60000)) or 60000),
                        max_ms=int(cooldown_cfg.get("failed_retry_max_ms", cooldown_cfg.get("failed_retry_ms", 60000)) or 60000),
                    )
                self._schedule_fast_comment_inspect(1500)

    def _maybe_confirm_comment_draft_probe(self, result: dict[str, Any]) -> None:
            pending = self.comment_pending_draft_probe_target
            if not pending:
                return
            if self.comment_pending_send_payload is not None:
                return
            phase = str(pending.get("phase", "") or "")
            if phase == "manual_send_hold":
                now_ms = self._now_ms()
                if now_ms - int(getattr(self, "comment_manual_send_hold_last_log_ms", 0) or 0) >= 5000:
                    self.comment_manual_send_hold_last_log_ms = now_ms
                    self._log("INFO", f"COMMENT_TRACE_DRAFT_PROBE_V70 | manual_send_hold_alive | threadKey={pending.get('threadKey', '')} | author={pending.get('author', '')} | draftPreview={str(pending.get('draftText', '') or '')[:80]} | sendEnabled=not_checked | autoSend=False")
                return
            attempt_ms = int(pending.get("attemptMs", 0) or 0)
            if attempt_ms and self._now_ms() - attempt_ms >= self._comment_stage_timeout_ms():
                self._log(
                    "WARN",
                    f"评论回复阶段确认超时: {json.dumps({'threadKey': pending.get('threadKey', ''), 'author': pending.get('author', ''), 'attemptNo': pending.get('attemptNo', 0), 'phase': pending.get('phase', '')}, ensure_ascii=False)}",
                )
                self.comment_pending_draft_probe_target = None
