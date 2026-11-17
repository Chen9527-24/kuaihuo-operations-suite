from __future__ import annotations

import json
import random
import re
from typing import Any

from app.platforms.douyin.common.js_scripts import (
    build_dm_open_session_by_key_script,
    build_dm_open_session_script,
    build_dm_scroll_list_script,
    build_dm_switch_sub_tab_script,
)


class SessionControllerDMQueueMixin:
    DM_SUB_TAB_TEXTS = ("朋友私信", "陌生人私信", "群消息")
    DM_TRANSIENT_REPLY_STATES = {
        "message_panel_missing",
        "input_missing",
        "send_button_missing",
        "input_not_editable",
    }
    DM_PENDING_REPLY_TIMEOUT_MS = 18_000
    DM_CURRENT_OPEN_PENDING_TIMEOUT_MS = 45_000
    DM_CURRENT_OPEN_TAB_SWITCH_COOLDOWN_MS = 2_800
    DM_POST_SEND_HOLD_MS = 30_000
    DM_POST_SEND_HOLD_RECHECK_MIN_MS = 1_200
    DM_POST_SEND_HOLD_RECHECK_MAX_MS = 1_800

    def _dm_hard_sleep_blocks_dom_actions(self) -> bool:
        """休眠期阻断 DM 内部状态机触发的 Tab 切换、滚动、开会话等 DOM 动作。"""
        try:
            if hasattr(self, "_runtime_policy_hard_sleep_remaining_ms"):
                remaining_ms = int(self._runtime_policy_hard_sleep_remaining_ms() or 0)
                if remaining_ms > 0:
                    if hasattr(self, "_prepare_dm_for_hard_sleep"):
                        self._prepare_dm_for_hard_sleep(remaining_ms=remaining_ms)
                    return True
        except Exception:
            return False
        return False

    def _ensure_dm_sub_tab_state(self) -> None:
        if not hasattr(self, "dm_sub_tab_cycle_order"):
            self.dm_sub_tab_cycle_order = list(self.DM_SUB_TAB_TEXTS)
            random.shuffle(self.dm_sub_tab_cycle_order)
        if not hasattr(self, "dm_completed_sub_tabs"):
            self.dm_completed_sub_tabs = set()
        if not hasattr(self, "dm_switching_sub_tab"):
            self.dm_switching_sub_tab = ""
        if not hasattr(self, "dm_last_sub_tab_switch_ms"):
            self.dm_last_sub_tab_switch_ms = 0
        if not hasattr(self, "dm_last_full_tab_cycle_ms"):
            self.dm_last_full_tab_cycle_ms = 0
        if not hasattr(self, "dm_processed_keys_by_tab"):
            self.dm_processed_keys_by_tab = {}
        if not hasattr(self, "dm_skipped_keys_by_tab"):
            self.dm_skipped_keys_by_tab = {}
        if not hasattr(self, "dm_skipped_keys"):
            self.dm_skipped_keys = set()
        if not hasattr(self, "dm_processed_message_signatures"):
            self.dm_processed_message_signatures = set()
        if not hasattr(self, "dm_skipped_message_signatures"):
            self.dm_skipped_message_signatures = set()
        if not hasattr(self, "dm_pending_reply_meta"):
            self.dm_pending_reply_meta = {}
        if not hasattr(self, "dm_pending_message_signatures"):
            self.dm_pending_message_signatures = set()
        if not hasattr(self, "dm_processed_confirm_count"):
            self.dm_processed_confirm_count = 0
        if not hasattr(self, "dm_current_open_suppressed_signatures"):
            self.dm_current_open_suppressed_signatures = {}
        if not hasattr(self, "dm_post_send_hold_until_ms"):
            self.dm_post_send_hold_until_ms = 0
        if not hasattr(self, "dm_post_send_hold_meta"):
            self.dm_post_send_hold_meta = {}
        if not hasattr(self, "dm_last_post_send_hold_log_ms"):
            self.dm_last_post_send_hold_log_ms = 0
        if not hasattr(self, "dm_current_conversation_anchor"):
            self.dm_current_conversation_anchor = {}
        if not hasattr(self, "dm_startup_no_unread_recheck_count"):
            self.dm_startup_no_unread_recheck_count = 0
        if not hasattr(self, "dm_startup_no_unread_recheck_signature"):
            self.dm_startup_no_unread_recheck_signature = ""
        if not hasattr(self, "dm_startup_no_unread_recheck_done"):
            self.dm_startup_no_unread_recheck_done = False
        if not hasattr(self, "dm_startup_no_unread_recheck_last_log_ms"):
            self.dm_startup_no_unread_recheck_last_log_ms = 0
        if not hasattr(self, "dm_startup_no_unread_recheck_total_count"):
            self.dm_startup_no_unread_recheck_total_count = 0

    def _active_dm_tab_text(self, result: dict[str, Any]) -> str:
        tabs = result.get("tabs", []) or []
        for item in tabs:
            if not isinstance(item, dict):
                continue
            if item.get("selected"):
                text = str(item.get("text", "") or "").strip()
                if text:
                    return text
        return ""

    def _dm_bucket(self, storage_name: str, active_tab: str) -> set[str]:
        self._ensure_dm_sub_tab_state()
        tab = active_tab if active_tab in self.DM_SUB_TAB_TEXTS else "全部"
        storage = getattr(self, storage_name)
        bucket = storage.get(tab)
        if bucket is None:
            bucket = set()
            storage[tab] = bucket
        return bucket

    def _dm_processed_bucket(self, active_tab: str) -> set[str]:
        return self._dm_bucket("dm_processed_keys_by_tab", active_tab)

    def _dm_skipped_bucket(self, active_tab: str) -> set[str]:
        return self._dm_bucket("dm_skipped_keys_by_tab", active_tab)

    def _is_dm_processed_for_tab(self, key: str, active_tab: str) -> bool:
        if not key:
            return False
        if active_tab in self.DM_SUB_TAB_TEXTS:
            return key in self._dm_processed_bucket(active_tab)
        return key in self.dm_processed_keys

    def _is_dm_skipped_for_tab(self, key: str, active_tab: str) -> bool:
        if not key:
            return False
        if active_tab in self.DM_SUB_TAB_TEXTS:
            return key in self._dm_skipped_bucket(active_tab)
        return key in getattr(self, "dm_skipped_keys", set())

    def _is_dm_handled_for_tab(self, key: str, active_tab: str) -> bool:
        return self._is_dm_processed_for_tab(key, active_tab) or self._is_dm_skipped_for_tab(key, active_tab)

    def _normalize_dm_token_text(self, value: Any) -> str:
        return re.sub(r"\s+", " ", str(value or "")).strip()

    def _dm_unread_count_hint(self, value: Any) -> int:
        text = self._normalize_dm_token_text(value)
        if not text:
            return 0
        match = re.search(r"(\d{1,3})", text)
        if not match:
            return 0
        try:
            return max(0, min(99, int(match.group(1))))
        except (TypeError, ValueError):
            return 0

    def _dm_loose_token_key(self, value: Any) -> str:
        text = self._normalize_dm_token_text(value)
        text = text.replace("\ufe0f", "").replace("\u200d", "")
        return "".join(ch for ch in text if ("\u4e00" <= ch <= "\u9fff") or ch.isalnum()).lower()

    def _dm_text_contains_or_equal(self, actual: Any, expected: Any) -> bool:
        actual_n = self._normalize_dm_token_text(actual)
        expected_n = self._normalize_dm_token_text(expected)
        if not actual_n or not expected_n:
            return False
        if actual_n == expected_n or expected_n in actual_n or actual_n in expected_n:
            return True
        actual_key = self._dm_loose_token_key(actual_n)
        expected_key = self._dm_loose_token_key(expected_n)
        return bool(actual_key and expected_key and (actual_key == expected_key or expected_key in actual_key or actual_key in expected_key))

    def _dm_pending_open_snapshot_dict(self) -> dict[str, Any]:
        snapshot = getattr(self, "dm_pending_open_snapshot", None)
        return snapshot if isinstance(snapshot, dict) else {}

    def _dm_clear_pending_open(self, *, reason: str = "") -> None:
        self.dm_pending_open_key = ""
        self.dm_pending_open_dom_index = None
        self.dm_pending_open_snapshot = {}
        if reason:
            self._log("INFO", f"私信待打开候选已清理: {reason}")

    def _dm_open_confirmation_matches_pending(
        self,
        *,
        pending: dict[str, Any],
        selected: dict[str, Any],
        selected_key: str,
        message_panel: dict[str, Any],
        reply: dict[str, Any] | None = None,
        active_tab: str = "",
    ) -> tuple[bool, str, dict[str, Any]]:
        reply = reply or {}
        expected_key = self._normalize_dm_token_text(pending.get("sessionKey") or self.dm_pending_open_key)
        expected_nick = self._normalize_dm_token_text(pending.get("nickname", ""))
        expected_summary = self._normalize_dm_token_text(pending.get("summary", ""))
        selected_key_n = self._normalize_dm_token_text(selected_key)
        selected_nick = self._normalize_dm_token_text(selected.get("nickname", ""))
        selected_summary = self._normalize_dm_token_text(selected.get("summary", "") or selected.get("text", ""))
        header_name = self._normalize_dm_token_text(message_panel.get("headerName") or reply.get("headerName") or selected_nick)
        latest_incoming = self._normalize_dm_token_text(reply.get("latestIncomingText") or reply.get("groupMessageText") or "")
        active_tab_n = self._normalize_dm_token_text(active_tab)
        expected_tab = self._normalize_dm_token_text(pending.get("activeTab") or "")

        detail = {
            "pending": expected_key,
            "expectedNickname": expected_nick,
            "expectedSummary": expected_summary[:120],
            "selected": selected_key_n,
            "selectedNickname": selected_nick,
            "selectedSummary": selected_summary[:120],
            "headerName": header_name,
            "latestIncomingText": latest_incoming[:120],
            "activeTab": active_tab_n,
            "expectedActiveTab": expected_tab,
        }

        if not pending or not expected_key:
            return False, "pending_missing", detail
        if not selected and not header_name:
            return False, "selected_missing", detail
        if expected_tab and active_tab_n and expected_tab in self.DM_SUB_TAB_TEXTS and active_tab_n in self.DM_SUB_TAB_TEXTS and expected_tab != active_tab_n:
            return False, "active_tab_mismatch", detail

        # Private and stranger sessions must match the header/name. This is the
        # critical guard that prevents pending=花生牛奶 but selected=QXQ from sending.
        name_ok = True
        if expected_nick and expected_nick not in {"陌生人消息", "群消息"}:
            name_ok = self._dm_text_contains_or_equal(header_name or selected_nick, expected_nick) or self._dm_text_contains_or_equal(selected_nick, expected_nick)
        elif expected_nick == "陌生人消息":
            # The list may show a container row for stranger messages; in that
            # case summary matching is the stronger signal.
            name_ok = True
        if not name_ok:
            return False, "nickname_mismatch", detail

        summary_ok = True
        if expected_summary:
            summary_ok = (
                self._dm_text_contains_or_equal(selected_summary, expected_summary)
                or self._dm_text_contains_or_equal(latest_incoming, expected_summary)
                or self._dm_text_contains_or_equal(selected_key_n, expected_summary)
            )
        if not summary_ok:
            return False, "summary_mismatch", detail

        if expected_key and selected_key_n and self._dm_text_contains_or_equal(selected_key_n, expected_key):
            return True, "selected_key_exact", detail
        if name_ok and summary_ok:
            return True, "name_summary_match", detail
        return False, "open_mismatch", detail

    def _dm_selected_key_from_reply(self, reply: dict[str, Any], selected: dict[str, Any] | None = None, active_tab: str = "") -> str:
        selected = selected or {}
        selected_key = self._session_key(selected)
        if selected_key:
            return selected_key
        conversation_type = self._normalize_dm_token_text(reply.get("conversationType") or ("group" if active_tab == "群消息" else "private"))
        header_name = self._normalize_dm_token_text(
            reply.get("groupName")
            or reply.get("headerName")
            or reply.get("selectedNickname")
            or selected.get("nickname")
        )
        latest = self._normalize_dm_token_text(reply.get("groupMessageText") or reply.get("latestIncomingText"))
        parts = [active_tab or self._normalize_dm_token_text(reply.get("activeTabText")), conversation_type, header_name]
        if not header_name and latest:
            parts.append(latest[:40])
        return " | ".join(part for part in parts if part)[:240]

    def _dm_incoming_message_signature(self, reply: dict[str, Any], selected: dict[str, Any] | None = None, active_tab: str = "") -> str:
        selected = selected or {}
        conversation_type = self._normalize_dm_token_text(reply.get("conversationType") or ("group" if active_tab == "群消息" else "private"))
        tab = self._normalize_dm_token_text(active_tab or reply.get("activeTabText"))
        header_name = self._normalize_dm_token_text(reply.get("headerName") or reply.get("selectedNickname") or selected.get("nickname"))
        selected_key = self._normalize_dm_token_text(self._session_key(selected))
        latest_incoming = self._normalize_dm_token_text(reply.get("latestIncomingText"))
        latest_outgoing = self._normalize_dm_token_text(reply.get("latestOutgoingText"))
        if conversation_type == "group" or tab == "群消息":
            group_name = self._normalize_dm_token_text(reply.get("groupName") or header_name)
            sender = self._normalize_dm_token_text(reply.get("groupSenderName"))
            message = self._normalize_dm_token_text(reply.get("groupMessageText") or latest_incoming)
            if not group_name or not message:
                return ""
            # 当前打开会话在发送后 left-list summary 会变化；签名不能绑定 selectedSessionKey，
            # 否则同一条入站消息会因列表摘要变化被当成新消息。
            payload = {"tab": tab or "群消息", "type": "group", "group": group_name, "sender": sender, "text": message}
        else:
            target = header_name or self._normalize_dm_token_text(selected.get("nickname"))
            message = latest_incoming
            if not target or not message:
                return ""
            # 私聊同理：用稳定的会话目标 + 入站文本做签名，避免发送后 selectedKey 变化导致重复 pending。
            payload = {"tab": tab or "私信", "type": "private", "target": target, "text": message}
        if latest_outgoing and latest_outgoing == payload.get("text"):
            return ""
        return json.dumps(payload, ensure_ascii=False, sort_keys=True)[:500]

    def _is_dm_message_signature_handled(self, signature: str) -> bool:
        if not signature:
            return False
        self._ensure_dm_sub_tab_state()
        return signature in self.dm_processed_message_signatures or signature in self.dm_skipped_message_signatures

    def _is_dm_message_signature_pending(self, signature: str) -> bool:
        if not signature:
            return False
        self._ensure_dm_sub_tab_state()
        return signature in getattr(self, "dm_pending_message_signatures", set())

    def _is_dm_message_signature_finalized(self, signature: str) -> bool:
        if not signature:
            return False
        self._ensure_dm_sub_tab_state()
        return signature in self.dm_processed_message_signatures or signature in self.dm_skipped_message_signatures

    def _mark_dm_message_signature_processed(self, signature: str) -> None:
        if not signature:
            return
        self._ensure_dm_sub_tab_state()
        self.dm_processed_message_signatures.add(signature)
        self.dm_skipped_message_signatures.discard(signature)
        getattr(self, "dm_pending_message_signatures", set()).discard(signature)

    def _mark_dm_message_signature_skipped(self, signature: str) -> None:
        if not signature:
            return
        self._ensure_dm_sub_tab_state()
        if signature not in self.dm_processed_message_signatures:
            self.dm_skipped_message_signatures.add(signature)
        getattr(self, "dm_pending_message_signatures", set()).discard(signature)

    def _suppress_dm_current_open_signature(self, signature: str, *, ttl_ms: int = 8000, reason: str = "") -> None:
        if not signature:
            return
        self._ensure_dm_sub_tab_state()
        now_ms = self._now_ms()
        self.dm_current_open_suppressed_signatures[signature] = now_ms + max(1000, int(ttl_ms or 8000))
        if reason:
            self._log("INFO", f"当前打开会话签名短期抑制: {json.dumps({'reason': reason, 'ttlMs': ttl_ms, 'signature': signature[:160]}, ensure_ascii=False)}")

    def _is_dm_current_open_signature_suppressed(self, signature: str) -> bool:
        if not signature:
            return False
        self._ensure_dm_sub_tab_state()
        now_ms = self._now_ms()
        for sig, expires_at in list(self.dm_current_open_suppressed_signatures.items()):
            if int(expires_at or 0) <= now_ms:
                self.dm_current_open_suppressed_signatures.pop(sig, None)
        return int(self.dm_current_open_suppressed_signatures.get(signature, 0) or 0) > now_ms


    def _dm_post_send_hold_delay_ms(self) -> int:
        min_ms = int(getattr(self, "DM_POST_SEND_HOLD_RECHECK_MIN_MS", 1200) or 1200)
        max_ms = int(getattr(self, "DM_POST_SEND_HOLD_RECHECK_MAX_MS", 1800) or 1800)
        min_ms = max(1200, min_ms)
        max_ms = max(min_ms, max_ms)
        try:
            return random.randint(min_ms, max_ms)
        except Exception:
            return min_ms

    def _remember_dm_post_send_hold(self, *, active_tab: str = "", selected_key: str = "", header_name: str = "", message_signature: str = "") -> None:
        """发送确认后短期留守当前打开会话，避免后续消息被页面自动已读而漏回。"""
        self._ensure_dm_sub_tab_state()
        if active_tab not in self.DM_SUB_TAB_TEXTS:
            return
        now_ms = self._now_ms()
        hold_ms = max(30000, int(getattr(self, "DM_POST_SEND_HOLD_MS", 30000) or 30000))
        self.dm_post_send_hold_until_ms = now_ms + hold_ms
        self.dm_post_send_hold_meta = {
            "activeTab": active_tab or "",
            "selectedKey": selected_key or "",
            "headerName": self._normalize_dm_token_text(header_name),
            "messageSignature": message_signature or "",
            "startedAt": now_ms,
            "holdMs": hold_ms,
        }
        self.dm_last_post_send_hold_log_ms = 0
        self._log(
            "INFO",
            f"私信发送后留守当前会话监听: {json.dumps({'activeTab': active_tab, 'selected': selected_key, 'headerName': header_name, 'holdMs': hold_ms}, ensure_ascii=False)}",
        )

    def _clear_dm_post_send_hold(self, *, reason: str = "", log: bool = False) -> None:
        self._ensure_dm_sub_tab_state()
        meta = getattr(self, "dm_post_send_hold_meta", {}) or {}
        self.dm_post_send_hold_until_ms = 0
        self.dm_post_send_hold_meta = {}
        self.dm_last_post_send_hold_log_ms = 0
        if log and meta:
            self._log(
                "INFO",
                f"私信发送后留守释放: {json.dumps({'reason': reason or 'released', 'activeTab': meta.get('activeTab', ''), 'selected': meta.get('selectedKey', ''), 'headerName': meta.get('headerName', '')}, ensure_ascii=False)}",
            )

    def _remember_dm_current_conversation_anchor(
        self,
        *,
        active_tab: str = "",
        selected_key: str = "",
        header_name: str = "",
        message_signature: str = "",
        last_outgoing_text: str = "",
        source: str = "",
    ) -> None:
        """记录当前右侧会话锚点，用于 selectedSession 暂失时的 current-open 安全兜底。"""
        self._ensure_dm_sub_tab_state()
        if active_tab not in self.DM_SUB_TAB_TEXTS:
            return
        normalized_header = self._normalize_dm_token_text(header_name)
        if not normalized_header:
            return
        self.dm_current_conversation_anchor = {
            "activeTab": active_tab or "",
            "selectedKey": selected_key or "",
            "headerName": normalized_header,
            "lastIncomingSignature": message_signature or "",
            "lastOutgoingText": self._normalize_dm_token_text(last_outgoing_text),
            "updatedAt": self._now_ms(),
            "source": source or "",
        }
        self._log(
            "INFO",
            f"当前打开会话锚点已更新: {json.dumps({'source': source or '-', 'activeTab': active_tab, 'selected': selected_key, 'headerName': normalized_header, 'messageSignature': (message_signature or '')[:160]}, ensure_ascii=False)}",
        )

    def _dm_latest_incoming_visible_on_left(self, result: dict[str, Any], message_text: str) -> bool:
        """确认最新入站文本能在右侧消息面板的左侧气泡中看到，降低残留面板误判。"""
        normalized = self._normalize_dm_token_text(message_text)
        if not normalized:
            return False
        context = result.get("conversationContext", {}) or {}
        samples = context.get("visibleBubbleSamples", []) or []
        if not samples:
            samples = result.get("visibleBubbleSamples", []) or []
        if not samples:
            # 旧脚本或极端渲染情况下可能没有样本；调用方仍会用 header/tab/signature 继续约束。
            return True
        for item in reversed(samples):
            if not isinstance(item, dict):
                continue
            side = str(item.get("side", "") or "").strip().lower()
            if side not in {"left", "incoming"}:
                continue
            text = self._normalize_dm_token_text(item.get("messageText") or item.get("structuredText") or item.get("text"))
            if text and (text == normalized or normalized in text or text in normalized):
                return True
        return False

    def _dm_anchor_selected_fallback(
        self,
        result: dict[str, Any],
        *,
        active_tab: str,
        reply: dict[str, Any],
        message_signature: str,
    ) -> tuple[dict[str, Any], str, str]:
        """selectedSession 丢失时，使用当前会话锚点为 current-open 新消息构造安全 selected。"""
        self._ensure_dm_sub_tab_state()
        anchor = getattr(self, "dm_current_conversation_anchor", {}) or {}
        if not anchor:
            return {}, "", "anchor_missing"
        if active_tab not in self.DM_SUB_TAB_TEXTS:
            return {}, "", "not_sub_tab"
        expected_tab = str(anchor.get("activeTab", "") or "")
        if expected_tab and expected_tab != active_tab:
            return {}, "", "anchor_tab_mismatch"
        header = self._normalize_dm_token_text(reply.get("groupName") or reply.get("headerName"))
        expected_header = self._normalize_dm_token_text(anchor.get("headerName", ""))
        if not header or not expected_header or not self._dm_names_match_for_current_open(expected_header, header):
            return {}, "", "anchor_header_mismatch"
        message_text = self._normalize_dm_token_text(reply.get("groupMessageText") or reply.get("latestIncomingText"))
        if not message_text:
            return {}, "", "incoming_empty"
        latest_outgoing = self._normalize_dm_token_text(reply.get("latestOutgoingText") or anchor.get("lastOutgoingText", ""))
        if latest_outgoing and latest_outgoing == message_text:
            return {}, "", "incoming_is_outgoing"
        if not message_signature:
            return {}, "", "signature_empty"
        if message_signature == str(anchor.get("lastIncomingSignature", "") or ""):
            return {}, "", "anchor_old_signature"
        if not self._dm_latest_incoming_visible_on_left(result, message_text):
            return {}, "", "left_bubble_not_visible"
        key = self._dm_selected_key_from_reply(reply, {}, active_tab) or str(anchor.get("selectedKey", "") or "")
        if not key:
            return {}, "", "fallback_key_empty"
        selected = {
            "sessionKey": key,
            "nickname": header,
            "summary": message_text,
            "text": f"{header} {message_text}",
            "selected": True,
            "anchorFallback": True,
        }
        self._log(
            "INFO",
            f"当前打开会话 fallback 候选命中: {json.dumps({'activeTab': active_tab, 'headerName': header, 'latestIncomingText': message_text, 'selectedSession': None, 'anchorMatched': True, 'messageSignature': message_signature[:180]}, ensure_ascii=False)}",
        )
        return selected, key, "ok"

    def _is_dm_post_send_hold_active(self, result: dict[str, Any] | None = None) -> bool:
        self._ensure_dm_sub_tab_state()
        now_ms = self._now_ms()
        until_ms = int(getattr(self, "dm_post_send_hold_until_ms", 0) or 0)
        if not until_ms:
            return False
        if now_ms >= until_ms:
            self._clear_dm_post_send_hold(reason="expired", log=True)
            return False
        result = result or {}
        meta = getattr(self, "dm_post_send_hold_meta", {}) or {}
        active_tab = self._active_dm_tab_text(result) if result else ""
        expected_tab = str(meta.get("activeTab", "") or "")
        if active_tab and expected_tab and active_tab != expected_tab:
            self._clear_dm_post_send_hold(reason="active_tab_changed", log=True)
            return False
        reply = result.get("replyReadiness", {}) or {}
        panel = result.get("messagePanel", {}) or {}
        header = self._normalize_dm_token_text(reply.get("groupName") or reply.get("headerName") or panel.get("headerName"))
        expected_header = self._normalize_dm_token_text(meta.get("headerName", ""))
        if header and expected_header and not self._dm_names_match_for_current_open(expected_header, header):
            self._clear_dm_post_send_hold(reason="header_changed", log=True)
            return False
        return True

    def _maybe_wait_dm_post_send_hold(self, result: dict[str, Any], *, reason: str = "") -> bool:
        if not self._is_dm_post_send_hold_active(result):
            return False
        now_ms = self._now_ms()
        delay_ms = self._dm_post_send_hold_delay_ms()
        meta = getattr(self, "dm_post_send_hold_meta", {}) or {}
        last_log = int(getattr(self, "dm_last_post_send_hold_log_ms", 0) or 0)
        if now_ms - last_log >= 30000:
            self.dm_last_post_send_hold_log_ms = now_ms
            until_ms = int(getattr(self, "dm_post_send_hold_until_ms", 0) or 0)
            self._log(
                "INFO",
                f"私信发送后留守监听中，暂缓切Tab: {json.dumps({'reason': reason or '-', 'activeTab': meta.get('activeTab', ''), 'selected': meta.get('selectedKey', ''), 'headerName': meta.get('headerName', ''), 'remainingMs': max(0, until_ms - now_ms), 'nextScanMs': delay_ms}, ensure_ascii=False)}",
            )
        if hasattr(self, "_set_dm_scan_mode"):
            self._set_dm_scan_mode("active", reason="post_send_hold")
        self._schedule_fast_dm_inspect(delay_ms)
        return True

    def _dm_post_send_hold_selected_fallback(self, result: dict[str, Any], *, active_tab: str, reply: dict[str, Any]) -> tuple[dict[str, Any], str]:
        """仅在发送后留守窗口内，为当前仍打开但左侧 selected 暂失的会话补一个安全 selected。"""
        if not self._is_dm_post_send_hold_active(result):
            return {}, ""
        meta = getattr(self, "dm_post_send_hold_meta", {}) or {}
        expected_tab = str(meta.get("activeTab", "") or "")
        if expected_tab and active_tab and active_tab != expected_tab:
            return {}, ""
        header = self._normalize_dm_token_text(reply.get("groupName") or reply.get("headerName"))
        expected_header = self._normalize_dm_token_text(meta.get("headerName", ""))
        if not header or not expected_header or not self._dm_names_match_for_current_open(expected_header, header):
            return {}, ""
        key = str(meta.get("selectedKey", "") or "") or self._dm_selected_key_from_reply(reply, {}, active_tab)
        selected = {
            "sessionKey": key,
            "nickname": expected_header,
            "summary": "",
            "text": expected_header,
            "selected": True,
            "postSendHoldFallback": True,
        }
        return selected, key

    def _mark_dm_processed(self, key: str, active_tab: str = "", *, message_signature: str = "") -> None:
        """只在发送确认成功后标记 processed。

        打开会话、聚合等待、草稿生成、点击发送都不进入 processed，避免“已读但未回复”被误跳过。
        """
        if not key:
            return
        sig = message_signature or ""
        if not sig:
            meta = self._pending_dm_reply_meta(key)
            sig = str(meta.get("messageSignature", "") or "")
        already_processed = bool(sig and sig in self.dm_processed_message_signatures)
        already_key_processed = key in getattr(self, "dm_processed_keys", set())
        self.dm_processed_keys.add(key)
        if active_tab in self.DM_SUB_TAB_TEXTS:
            self._dm_processed_bucket(active_tab).add(key)
        if sig:
            self._mark_dm_message_signature_processed(sig)
            if not already_processed:
                self.dm_processed_confirm_count = int(getattr(self, "dm_processed_confirm_count", 0) or 0) + 1
        elif not already_key_processed:
            self.dm_processed_confirm_count = int(getattr(self, "dm_processed_confirm_count", 0) or 0) + 1
        self._clear_dm_pending_reply(key)

    def _mark_dm_skipped(self, key: str, active_tab: str = "", *, reason: str = "", message_signature: str = "") -> None:
        if not key:
            return
        self._ensure_dm_sub_tab_state()
        self.dm_skipped_keys.add(key)
        if active_tab in self.DM_SUB_TAB_TEXTS:
            self._dm_skipped_bucket(active_tab).add(key)
        if message_signature:
            self._mark_dm_message_signature_skipped(message_signature)
        else:
            meta = self._pending_dm_reply_meta(key)
            sig = str(meta.get("messageSignature", "") or "")
            if sig:
                self._mark_dm_message_signature_skipped(sig)

        # 关键修复：skip 是一个终态，必须释放“已打开但未闭环”的保护锁。
        # 之前后端回复失败时只进入 skipped，但 key 仍留在 dm_opened_unreplied_keys，
        # 下一轮巡检会被 _guard_opened_unreplied_session 当成仍需回复的会话，
        # 直接 return 且不再排下一轮 timer，最终表现为只刷新配置、不再扫描。
        try:
            self.dm_opened_unreplied_keys.discard(key)
        except Exception:
            pass
        if getattr(self, "dm_pending_open_key", "") == key:
            self.dm_pending_open_key = ""
            self.dm_pending_open_dom_index = None
            self.dm_pending_open_attempts = 0
            self.dm_pending_open_snapshot = {}
        self._clear_dm_pending_reply(key)
        if hasattr(self, "_clear_dm_reply_aggregate_window"):
            self._clear_dm_reply_aggregate_window()
        if hasattr(self, "_clear_dm_post_send_hold"):
            try:
                self._clear_dm_post_send_hold(reason="skip_terminal", log=False)
            except TypeError:
                self._clear_dm_post_send_hold(reason="skip_terminal")
            except Exception:
                pass
        if reason:
            self._log("WARN", f"私信会话已标记跳过并释放待回复锁: {json.dumps({'sessionKey': key, 'activeTab': active_tab or '-', 'reason': reason}, ensure_ascii=False)}")

    def _remember_dm_pending_reply(self, key: str, active_tab: str, *, pending_key: str = "", selected: dict[str, Any] | None = None, message_signature: str = "", source: str = "", unread_count_hint: int = 0) -> None:
        if not key:
            return
        self._ensure_dm_sub_tab_state()
        selected = selected or {}
        meta = self.dm_pending_reply_meta.get(key) or {}
        if not meta:
            meta = {
                "startedAt": self._now_ms(),
                "lastLogAt": 0,
                "replyReadyLogged": False,
            }
        meta.update(
            {
                "activeTab": active_tab or meta.get("activeTab", ""),
                "pendingKey": pending_key or meta.get("pendingKey", ""),
                "selectedKey": key,
                "nickname": selected.get("nickname", ""),
                "summary": selected.get("summary", ""),
                # 保留 selected 快照。current_open_anchor_fallback 场景左侧 selectedSession
                # 可能为空，但回复链路仍必须继续；后续预检查会用该快照补齐 selected_key。
                "selected": dict(selected) if isinstance(selected, dict) else {},
                "messageSignature": message_signature or meta.get("messageSignature", ""),
                "source": source or meta.get("source", ""),
                "unreadCountHint": max(
                    int(meta.get("unreadCountHint", 0) or 0),
                    max(0, int(unread_count_hint or 0)),
                ),
            }
        )
        self.dm_pending_reply_meta[key] = meta
        if message_signature:
            getattr(self, "dm_pending_message_signatures", set()).add(message_signature)

    def _clear_dm_pending_reply(self, key: str) -> None:
        if not key or not hasattr(self, "dm_pending_reply_meta"):
            return
        meta = self.dm_pending_reply_meta.pop(key, None) or {}
        sig = str(meta.get("messageSignature", "") or "")
        if sig:
            getattr(self, "dm_pending_message_signatures", set()).discard(sig)

    def _pending_dm_reply_meta(self, key: str) -> dict[str, Any]:
        if not key or not hasattr(self, "dm_pending_reply_meta"):
            return {}
        return self.dm_pending_reply_meta.get(key) or {}

    def _reset_dm_scan_for_tab_switch(self) -> None:
        # 只有在没有正在进行的回复流程时，Tab 切换才允许清理聚合窗口。
        # 正常业务流程优先级必须高于扫描/切 Tab。
        if (
            hasattr(self, "_clear_dm_reply_aggregate_window")
            and not getattr(self, "dm_opened_unreplied_keys", set())
            and not getattr(self, "dm_reply_aggregate_window", None)
        ):
            self._clear_dm_reply_aggregate_window()
        self.dm_scan_complete = False
        self.dm_scroll_no_change_count = 0
        self.dm_last_scroll_ms = 0
        self.dm_pending_open_key = ""
        self.dm_pending_open_dom_index = None
        self.dm_pending_open_attempts = 0
        self.dm_pending_open_snapshot = {}
        self.last_dm_open_attempt_key = ""
        self.last_dm_open_attempt_ms = 0
        self.dm_startup_no_unread_recheck_count = 0
        self.dm_startup_no_unread_recheck_signature = ""
        self.dm_startup_no_unread_recheck_done = False
        self.dm_startup_no_unread_recheck_last_log_ms = 0
        self.dm_startup_no_unread_recheck_total_count = 0
        if self._is_dm_post_send_hold_active():
            self._clear_dm_post_send_hold(reason="tab_switch_reset", log=False)

    def _switch_dm_sub_tab(self, target_tab: str, *, reason: str) -> bool:
        self._ensure_dm_sub_tab_state()
        if self._dm_hard_sleep_blocks_dom_actions():
            return True
        if not self.page or self.busy or self.current_module != "dm":
            return False
        if self.dm_opened_unreplied_keys:
            self._log("INFO", f"私信子Tab切换暂缓：仍有待回复会话未闭环。{json.dumps({'target': target_tab, 'pending': list(self.dm_opened_unreplied_keys)[:3]}, ensure_ascii=False)}")
            return False
        if hasattr(self, "_set_dm_scan_mode"):
            self._set_dm_scan_mode("tab", reason=f"switch_sub_tab:{reason}")
        now_ms = self._now_ms()
        if self.dm_switching_sub_tab and now_ms - self.dm_last_sub_tab_switch_ms < 4500:
            return True
        if now_ms - self.dm_last_sub_tab_switch_ms < 1200:
            return True
        self.dm_switching_sub_tab = target_tab
        self.dm_last_sub_tab_switch_ms = now_ms
        self._reset_dm_scan_for_tab_switch()
        self.busy = True
        self._emit_phase_observation("dm_tab", "switching", {"target": target_tab, "reason": reason}, force=True)
        self._log("INFO", f"私信子Tab切换准备执行: {json.dumps({'target': target_tab, 'reason': reason}, ensure_ascii=False)}")
        self.page.runJavaScript(build_dm_switch_sub_tab_script(target_tab), self._handle_dm_switch_sub_tab_result)
        return True

    def _handle_dm_switch_sub_tab_result(self, result: Any) -> None:
        self.busy = False
        result = self._coerce_js_result(result)
        target = self.dm_switching_sub_tab
        self.dm_switching_sub_tab = ""
        if not isinstance(result, dict):
            self._log("WARN", f"私信子Tab切换结果异常，目标={target}，类型={type(result).__name__}，内容片段={str(result)[:240]}")
            self._schedule_fast_dm_inspect(1200)
            return
        level = "INFO" if result.get("ok") else "WARN"
        self._log(level, f"私信子Tab切换结果: {json.dumps(result, ensure_ascii=False)}")
        self._schedule_fast_dm_inspect(1200)

    def _maybe_switch_dm_sub_tab_after_exhausted(self, result: dict[str, Any], *, reason: str) -> bool:
        self._ensure_dm_sub_tab_state()
        # 已经进入聚合/待回复链路时，切 Tab 和扫描收尾不能打断主流程。
        if getattr(self, "dm_reply_aggregate_window", None):
            if hasattr(self, "_schedule_fast_dm_inspect"):
                self._schedule_fast_dm_inspect(900)
            return True
        if self.dm_opened_unreplied_keys:
            return False
        active_tab = self._active_dm_tab_text(result)
        if active_tab not in self.DM_SUB_TAB_TEXTS:
            return False
        self.dm_completed_sub_tabs.add(active_tab)
        candidates = [tab for tab in self.dm_sub_tab_cycle_order if tab not in self.dm_completed_sub_tabs and tab != active_tab]
        if not candidates:
            now_ms = self._now_ms()
            if hasattr(self, "_clear_dm_reply_aggregate_window"):
                self._clear_dm_reply_aggregate_window()
            if hasattr(self, "_set_dm_scan_mode"):
                self._set_dm_scan_mode("idle", reason="all_sub_tabs_completed")
            idle_interval = int(getattr(self, "dm_idle_scan_interval_ms", 40000) or 40000)
            heartbeat_interval = int(getattr(self, "dm_idle_heartbeat_interval_ms", 90000) or 90000)
            if now_ms - int(self.dm_last_full_tab_cycle_ms or 0) < idle_interval:
                last_idle_log = int(getattr(self, "dm_last_idle_heartbeat_ms", 0) or 0)
                if now_ms - last_idle_log >= heartbeat_interval:
                    self.dm_last_idle_heartbeat_ms = now_ms
                    self._log("INFO", f"私信三个子Tab本轮均已扫描完成，空闲降频中。active={active_tab} completed={list(self.dm_completed_sub_tabs)} nextScanMs={idle_interval}")
                return False
            self.dm_last_full_tab_cycle_ms = now_ms
            self.dm_completed_sub_tabs = {active_tab}
            self.dm_sub_tab_cycle_order = list(self.DM_SUB_TAB_TEXTS)
            random.shuffle(self.dm_sub_tab_cycle_order)
            candidates = [tab for tab in self.dm_sub_tab_cycle_order if tab not in self.dm_completed_sub_tabs and tab != active_tab]
            self._log("INFO", f"私信子Tab新一轮扫描顺序: {json.dumps(self.dm_sub_tab_cycle_order, ensure_ascii=False)}")
        if not candidates:
            return False
        return self._switch_dm_sub_tab(candidates[0], reason=reason)

    def _confirm_pending_dm_open(self, result: dict[str, Any]) -> bool:
        if not self.dm_pending_open_key:
            return False
        selected = result.get("selectedSession") or {}
        selected_key = self._session_key(selected)
        active_tab = self._active_dm_tab_text(result)
        message_panel = result.get("messagePanel", {}) or {}
        reply = result.get("replyReadiness", {}) or {}
        pending_snapshot = self._dm_pending_open_snapshot_dict()

        if not (message_panel.get("found") and selected):
            return False

        ok, reason, detail = self._dm_open_confirmation_matches_pending(
            pending=pending_snapshot,
            selected=selected,
            selected_key=selected_key,
            message_panel=message_panel,
            reply=reply,
            active_tab=active_tab,
        )
        payload = {
            **detail,
            "reason": reason,
            "pendingDomIndex": self.dm_pending_open_dom_index,
        }
        if not ok:
            self._log("WARN", f"私信会话打开确认失败: {json.dumps(payload, ensure_ascii=False)}")
            self._emit_phase_observation("open", "mismatch", payload, force=True)
            # Do not mark processed/skipped. The next scan will re-locate the
            # pending unread row from a fresh DOM fingerprint and try again.
            self.dm_pending_open_key = ""
            self.dm_pending_open_dom_index = None
            self.dm_pending_open_snapshot = {}
            self.busy = False
            self._schedule_fast_dm_inspect(900)
            return True

        opened_key = selected_key or self.dm_pending_open_key
        if opened_key:
            self.dm_opened_unreplied_keys.add(opened_key)
            message_signature = self._dm_incoming_message_signature(reply, selected, active_tab)
            self._remember_dm_pending_reply(
                opened_key,
                active_tab,
                pending_key=self.dm_pending_open_key,
                selected=selected,
                message_signature=message_signature,
                source="list_unread_open",
                unread_count_hint=int(pending_snapshot.get("unreadCountHint", 0) or 0),
            )
        else:
            message_signature = ""

        self.dm_last_queue_progress_ms = self._now_ms()
        confirm_payload = {
            **payload,
            "openedKey": opened_key,
            "messageSignature": message_signature[:160],
        }
        self._emit_phase_observation("open", "confirmed", confirm_payload, force=True)
        self._log("INFO", f"私信未读队列确认打开成功: {json.dumps(confirm_payload, ensure_ascii=False)}")
        if active_tab == "群消息":
            self._log("INFO", f"群消息待回复锁定: {json.dumps(confirm_payload, ensure_ascii=False)}")
        if opened_key:
            self._remember_dm_current_conversation_anchor(
                active_tab=active_tab,
                selected_key=opened_key,
                header_name=(message_panel.get("headerName") or selected.get("nickname") or "") if isinstance(message_panel, dict) else selected.get("nickname", ""),
                message_signature=message_signature,
                source="list_open_confirmed",
            )
        self.dm_pending_open_key = ""
        self.dm_pending_open_dom_index = None
        self.dm_pending_open_attempts = 0
        self.dm_pending_open_snapshot = {}
        return True

    def _open_dm_candidate(self, item: dict[str, Any], *, reason: str) -> None:
        if self._dm_hard_sleep_blocks_dom_actions():
            return
        dom_index = item.get("domIndex")
        if not isinstance(dom_index, int) or not self.page:
            return
        key = self._session_key(item)
        if hasattr(self, "_set_dm_scan_mode"):
            self._set_dm_scan_mode("active", reason=f"open_candidate:{reason}")
        now_ms = self._now_ms()
        if key == self.last_dm_open_attempt_key and now_ms - self.last_dm_open_attempt_ms < 1500:
            return
        self.last_dm_open_attempt_key = key
        self.last_dm_open_attempt_ms = now_ms
        self.dm_pending_open_key = key
        self.dm_pending_open_dom_index = dom_index
        self.dm_pending_open_attempts += 1
        active_tab = getattr(self, "dm_current_sub_tab", "") or ""
        self.dm_pending_open_snapshot = {
            "domIndex": dom_index,
            "sessionKey": key,
            "nickname": item.get("nickname", ""),
            "summary": item.get("summary", ""),
            "text": item.get("text", ""),
            "activeTab": active_tab or getattr(self, "dm_current_sub_tab", "") or "",
            "unreadBadge": item.get("unreadBadge", ""),
            "unreadCountHint": self._dm_unread_count_hint(item.get("unreadBadge", "")),
        }
        self.busy = True
        payload = {
            "reason": reason,
            "domIndex": dom_index,
            "sessionKey": key or None,
            "nickname": item.get("nickname", ""),
            "summary": item.get("summary", ""),
            "clickTarget": item.get("clickTarget"),
            "attemptNo": self.dm_pending_open_attempts,
            "activeTab": self.dm_pending_open_snapshot.get("activeTab") or None,
        }
        self._log("INFO", f"私信页准备打开候选会话: {json.dumps(payload, ensure_ascii=False)}")
        self.page.runJavaScript(build_dm_open_session_by_key_script(self.dm_pending_open_snapshot), self._handle_dm_open_session_result)

    def _scroll_dm_list(self, *, reason: str) -> None:
        if self._dm_hard_sleep_blocks_dom_actions():
            return
        if not self.page:
            return
        now_ms = self._now_ms()
        if now_ms - self.dm_last_scroll_ms < 1200:
            return
        self.dm_last_scroll_ms = now_ms
        self.busy = True
        self._log("INFO", f"私信页开始深扫滚动: {reason}")
        self.page.runJavaScript(build_dm_scroll_list_script(direction="down", step_ratio=0.88), self._handle_dm_scroll_result)

    def _reset_dm_list_to_top_after_exhausted(self, *, reason: str) -> bool:
        """扫描到底后回到列表顶部，保证新来的会话未读能够在下一轮首先被看到。"""
        if self._dm_hard_sleep_blocks_dom_actions():
            return True
        if not self.page or self.busy or self.current_module != "dm":
            return False
        if self.dm_pending_open_key or getattr(self, "dm_opened_unreplied_keys", set()) or getattr(self, "dm_reply_aggregate_window", None):
            return False
        now_ms = self._now_ms()
        if now_ms - int(getattr(self, "dm_last_scroll_ms", 0) or 0) < 1200:
            return False
        self.dm_last_scroll_ms = now_ms
        self.busy = True
        self._log("INFO", f"私信页本轮扫描结束，列表回到顶部等待新未读: {reason}")
        self.page.runJavaScript(build_dm_scroll_list_script(direction="top", step_ratio=1.0), self._handle_dm_scroll_result)
        return True

    def _guard_opened_unreplied_session(self, *, selected_key: str, active_tab: str, reply: dict[str, Any]) -> bool:
        """保护已打开但未回复的会话，避免 unread 被页面清空后被队列误跳过。"""
        if not selected_key or selected_key not in self.dm_opened_unreplied_keys:
            return False
        # 如果该会话已经被终态处理（已发送、已跳过或签名已终态），不能继续
        # 作为 opened_unreplied 保护锁拦截队列；否则一次后端失败会让私信
        # 状态机永久停在“已打开待回复”分支，后续只刷新配置不再巡检。
        meta = self._pending_dm_reply_meta(selected_key)
        sig = str((meta or {}).get("messageSignature", "") or self._dm_incoming_message_signature(reply, None, active_tab))
        finalized = False
        try:
            finalized = bool(sig and self._is_dm_message_signature_finalized(sig))
        except Exception:
            finalized = False
        if (
            selected_key in getattr(self, "dm_skipped_keys", set())
            or selected_key in getattr(self, "dm_processed_keys", set())
            or finalized
        ):
            self.dm_opened_unreplied_keys.discard(selected_key)
            self._clear_dm_pending_reply(selected_key)
            return False
        now_ms = self._now_ms()
        started_at = int(meta.get("startedAt", now_ms) or now_ms)
        elapsed_ms = max(0, now_ms - started_at)
        if reply.get("canReply"):
            if not meta.get("replyReadyLogged"):
                meta["replyReadyLogged"] = True
                meta["replyReadyAt"] = now_ms
                self.dm_pending_reply_meta[selected_key] = meta
                if active_tab == "群消息" or reply.get("conversationType") == "group":
                    self._log(
                        "INFO",
                        f"群消息待回复已进入可回复状态: {json.dumps({'selected': selected_key, 'groupName': reply.get('groupName') or reply.get('headerName'), 'senderName': reply.get('groupSenderName'), 'messageText': reply.get('groupMessageText') or reply.get('latestIncomingText')}, ensure_ascii=False)}",
                    )
            # 这里不能只 return 保护队列；必须确保回复链路继续获得 tick。
            # current_open_anchor_fallback 等路径没有列表未读驱动，如果不主动排下一次
            # inspect，聚合等待可能启动后无法释放，最终 pending timeout。
            if hasattr(self, "_schedule_fast_dm_inspect"):
                self._schedule_fast_dm_inspect(900)
            return True

        state = str(reply.get("state", "") or "unknown")
        skip_reason = str(reply.get("skipReason") or "")
        terminal_skip = bool(skip_reason and skip_reason not in self.DM_TRANSIENT_REPLY_STATES)
        transient = state in self.DM_TRANSIENT_REPLY_STATES or not terminal_skip
        if transient and elapsed_ms < self.DM_PENDING_REPLY_TIMEOUT_MS:
            last_log_at = int(meta.get("lastLogAt", 0) or 0)
            if now_ms - last_log_at >= 3000:
                meta["lastLogAt"] = now_ms
                self.dm_pending_reply_meta[selected_key] = meta
                self._log(
                    "INFO",
                    f"私信待回复会话暂缓切换，等待回复区稳定: {json.dumps({'selected': selected_key, 'activeTab': active_tab or '-', 'state': state, 'skipReason': skip_reason or None, 'elapsedMs': elapsed_ms}, ensure_ascii=False)}",
                )
            self._schedule_fast_dm_inspect(1200)
            return True

        payload = {
            "selected": selected_key,
            "activeTab": active_tab or "-",
            "headerName": reply.get("headerName", ""),
            "state": state,
            "skipReason": skip_reason or None,
            "latestIncomingText": reply.get("latestIncomingText", ""),
            "elapsedMs": elapsed_ms,
        }
        self._log("WARN", f"私信已打开未读会话未能进入回复链，释放当前候选: {json.dumps(payload, ensure_ascii=False)}")
        self.dm_opened_unreplied_keys.discard(selected_key)
        message_signature = str(meta.get("messageSignature", "") or self._dm_incoming_message_signature(reply, None, active_tab))
        self._mark_dm_skipped(selected_key, active_tab, reason=skip_reason or state or "reply_not_ready_timeout", message_signature=message_signature)
        return False

    def _dm_names_match_for_current_open(self, expected: str, actual: str) -> bool:
        expected_n = self._normalize_dm_token_text(expected)
        actual_n = self._normalize_dm_token_text(actual)
        if not expected_n or not actual_n:
            return False
        return expected_n == actual_n

    def _current_open_dm_gate_ok(self, result: dict[str, Any], *, selected_key: str, active_tab: str, reply: dict[str, Any], selected: dict[str, Any], message_signature: str) -> tuple[bool, str]:
        """当前打开会话触发通道的严格门禁。

        这条通道只用于补偿“当前会话已打开，新消息被页面直接标为已读”的场景。
        为避免 Tab 切换后旧 messagePanel 残留误触发，这里宁愿保守不触发，也不允许误锁 pending。
        """
        if not reply.get("canReply"):
            return False, "reply_not_ready"
        if active_tab not in self.DM_SUB_TAB_TEXTS:
            return False, "not_sub_tab"
        now_ms = self._now_ms()
        last_switch_ms = int(getattr(self, "dm_last_sub_tab_switch_ms", 0) or 0)
        if last_switch_ms and now_ms - last_switch_ms < self.DM_CURRENT_OPEN_TAB_SWITCH_COOLDOWN_MS:
            return False, "tab_switch_cooling"
        if not selected_key or not selected:
            return False, "selected_missing"
        if not bool(selected.get("selected")):
            return False, "selected_not_active"
        header_name = self._normalize_dm_token_text(reply.get("groupName") or reply.get("headerName"))
        selected_name = self._normalize_dm_token_text(selected.get("nickname") or reply.get("selectedNickname"))
        if not header_name:
            return False, "header_missing"
        if not self._dm_names_match_for_current_open(header_name, selected_name):
            return False, "selected_header_mismatch"
        message_text = self._normalize_dm_token_text(reply.get("groupMessageText") or reply.get("latestIncomingText"))
        if not message_text:
            return False, "incoming_empty"
        if not message_signature:
            return False, "signature_empty"
        if self._is_dm_message_signature_finalized(message_signature):
            return False, "signature_finalized"
        if self._is_dm_current_open_signature_suppressed(message_signature):
            return False, "signature_suppressed"
        if message_signature in getattr(self, "dm_pending_message_signatures", set()):
            return False, "signature_pending"
        selected_summary = self._normalize_dm_token_text(selected.get("summary") or selected.get("text"))
        latest_outgoing = self._normalize_dm_token_text(reply.get("latestOutgoingText"))
        if latest_outgoing and selected_summary and latest_outgoing in selected_summary:
            return False, "selected_summary_is_latest_outgoing"
        return True, "ok"


    def _dm_should_defer_pending_timeout_for_send_flow(self, selected_key: str, meta: dict[str, Any], *, now_ms: int, timeout_ms: int) -> bool:
        """发送主链路已启动/草稿已就绪时，pending timeout 不能抢先释放会话。

        pending timeout 只应兜底真正卡死的打开会话；如果草稿生成、预检查、注入或发送
        仍在推进，先短暂续期，让主链路有机会完成。
        """
        if not selected_key:
            return False
        active = False
        try:
            future = getattr(self, "dm_pending_draft_future", None)
            ctx = getattr(self, "dm_pending_draft_context", None) or {}
            if future is not None and not future.done() and str(ctx.get("selected", "") or "") == selected_key:
                active = True
        except Exception:
            pass
        for attr in ("dm_pending_stage_payload", "dm_pending_send_payload", "dm_pending_delivery_sequence"):
            payload = getattr(self, attr, None) or {}
            if isinstance(payload, dict) and str(payload.get("selected", "") or "") == selected_key:
                active = True
        lock = (getattr(self, "dm_session_locks", {}) or {}).get(selected_key) or {}
        if lock:
            active = True
        reply_token = str((meta or {}).get("replyToken", "") or "")
        for cached in (getattr(self, "dm_draft_cache", {}) or {}).values():
            if not isinstance(cached, dict):
                continue
            if str(cached.get("selected", "") or "") != selected_key:
                continue
            cached_token = str(cached.get("replyToken", "") or "")
            if reply_token and cached_token and cached_token != reply_token:
                continue
            if str(cached.get("text", "") or "").strip():
                active = True
                break
        if not active:
            return False
        defer_count = int((meta or {}).get("sendFlowTimeoutDefers", 0) or 0)
        if defer_count >= 8:
            return False
        meta["sendFlowTimeoutDefers"] = defer_count + 1
        # 每次续期约 12 秒，避免后端稍慢或页面注入重试时被异常兜底打断。
        meta["startedAt"] = max(0, now_ms - max(0, timeout_ms - 12_000))
        self.dm_pending_reply_meta[selected_key] = meta
        self._log(
            "INFO",
            f"私信 pending 超时延后：发送主链路仍在推进。{json.dumps({'selected': selected_key, 'deferCount': meta['sendFlowTimeoutDefers']}, ensure_ascii=False)}",
        )
        if hasattr(self, "_schedule_fast_dm_inspect"):
            self._schedule_fast_dm_inspect(500)
        return True

    def _release_expired_dm_pending_replies(self, *, active_tab: str = "") -> None:
        self._ensure_dm_sub_tab_state()
        now_ms = self._now_ms()
        for key, meta in list(getattr(self, "dm_pending_reply_meta", {}).items()):
            started_at = int((meta or {}).get("startedAt", 0) or 0)
            if not started_at:
                continue
            elapsed_ms = now_ms - started_at
            source = str((meta or {}).get("source", "") or "")
            timeout_ms = self.DM_CURRENT_OPEN_PENDING_TIMEOUT_MS if source in {"current_open_conversation", "current_open_anchor_fallback"} else self.DM_PENDING_REPLY_TIMEOUT_MS * 2
            if elapsed_ms < timeout_ms:
                continue
            if self._dm_should_defer_pending_timeout_for_send_flow(key, meta, now_ms=now_ms, timeout_ms=timeout_ms):
                continue
            sig = str((meta or {}).get("messageSignature", "") or "")
            payload = {
                "selected": key,
                "activeTab": active_tab or meta.get("activeTab", ""),
                "source": source,
                "elapsedMs": elapsed_ms,
                "messageSignature": sig[:160],
            }
            self._log("WARN", f"当前打开会话 pending 超时释放: {json.dumps(payload, ensure_ascii=False)}")
            self.dm_opened_unreplied_keys.discard(key)
            if sig:
                self._mark_dm_message_signature_skipped(sig)
                self._suppress_dm_current_open_signature(sig, ttl_ms=12000, reason="pending_timeout")
            if hasattr(self, "_clear_dm_reply_aggregate_window"):
                self._clear_dm_reply_aggregate_window()
            self._clear_dm_pending_reply(key)
            # timeout 是异常兜底，释放后必须恢复巡检，不能静默停在配置刷新。
            if hasattr(self, "_set_dm_scan_mode"):
                self._set_dm_scan_mode("active", reason="pending_timeout_released")
            if hasattr(self, "_schedule_fast_dm_inspect"):
                self._schedule_fast_dm_inspect(1200)

    def _maybe_lock_current_open_dm_conversation(self, result: dict[str, Any], *, selected_key: str, active_tab: str, reply: dict[str, Any]) -> bool:
        """当前聊天界面已打开时的新入站消息补偿触发。

        严格门禁：只在当前子 Tab、左侧 selectedSession 与右侧 headerName 一致、
        且消息签名未处理/未 pending 时才锁定。避免 Tab 切换后的旧面板残留造成巡检风暴。
        """
        selected = result.get("selectedSession") or {}
        source = "current_open_conversation"
        key = selected_key or self._dm_selected_key_from_reply(reply, selected, active_tab)
        message_signature = self._dm_incoming_message_signature(reply, selected, active_tab)
        if not selected:
            fallback_selected, fallback_key = self._dm_post_send_hold_selected_fallback(result, active_tab=active_tab, reply=reply)
            if fallback_selected:
                selected = fallback_selected
                key = fallback_key or key
                source = "current_open_post_send_hold"
                message_signature = self._dm_incoming_message_signature(reply, selected, active_tab)
            else:
                anchor_selected, anchor_key, anchor_reason = self._dm_anchor_selected_fallback(
                    result,
                    active_tab=active_tab,
                    reply=reply,
                    message_signature=message_signature,
                )
                if anchor_selected:
                    selected = anchor_selected
                    key = anchor_key or key
                    source = "current_open_anchor_fallback"
                    message_signature = self._dm_incoming_message_signature(reply, selected, active_tab)
        ok, reason = self._current_open_dm_gate_ok(
            result,
            selected_key=key,
            active_tab=active_tab,
            reply=reply,
            selected=selected,
            message_signature=message_signature,
        )
        if not ok:
            return False
        # 如果已经由列表未读打开流程保护，不重复创建 current-open pending。
        if key in self.dm_opened_unreplied_keys:
            return False
        self.dm_opened_unreplied_keys.add(key)
        if self._is_dm_post_send_hold_active(result):
            self._clear_dm_post_send_hold(reason="current_open_pending", log=False)
        self._remember_dm_pending_reply(
            key,
            active_tab,
            pending_key=message_signature or key,
            selected=selected,
            message_signature=message_signature,
            source=source,
        )
        payload = {
            "activeTab": active_tab or reply.get("activeTabText") or "-",
            "selected": key,
            "pendingKey": (message_signature or key)[:180],
            "headerName": reply.get("headerName", ""),
            "conversationType": reply.get("conversationType", ""),
            "groupName": reply.get("groupName", ""),
            "senderName": reply.get("groupSenderName", ""),
            "latestIncomingText": reply.get("groupMessageText") or reply.get("latestIncomingText") or "",
            "source": source,
        }
        self._log("INFO", f"当前打开会话新入站消息待回复锁定: {json.dumps(payload, ensure_ascii=False)}")
        if source == "current_open_anchor_fallback":
            # fallback 命中表示当前页面会话已经打开，虽然左侧 selectedSession 可能为空，
            # 但业务流程已经进入待回复，后续聚合/生成/发送优先级必须高于扫描/切 Tab。
            self.dm_scan_complete = True
            self._log("INFO", f"当前打开会话 fallback 转入待回复: {json.dumps(payload, ensure_ascii=False)}")
        if active_tab == "群消息" or reply.get("conversationType") == "group":
            self._log("INFO", f"群消息待回复锁定: {json.dumps(payload, ensure_ascii=False)}")
        if hasattr(self, "_set_dm_scan_mode"):
            self._set_dm_scan_mode("active", reason="current_open_incoming")
        return True

    def _maybe_hold_dm_startup_visible_recheck(
        self,
        result: dict[str, Any],
        *,
        active_tab: str,
        visible_unread: list[dict[str, Any]],
    ) -> bool:
        """首轮未读为 0 时，先复核顶部可见区，避免预热刚放行就把真实未读滚走。"""
        self._ensure_dm_sub_tab_state()
        if visible_unread:
            self.dm_startup_no_unread_recheck_done = True
            return False
        if not bool(getattr(self, "dm_startup_gate_released", False)):
            return False
        if bool(getattr(self, "dm_startup_no_unread_recheck_done", False)):
            return False
        if self.dm_pending_open_key or getattr(self, "dm_opened_unreplied_keys", set()) or getattr(self, "dm_reply_aggregate_window", None):
            return False
        session_candidates = result.get("sessionCandidates", []) or []
        if not session_candidates:
            return False
        if active_tab and active_tab not in self.DM_SUB_TAB_TEXTS and active_tab not in {"全部", "全部私信"}:
            return False
        left_panel = result.get("leftPanel", {}) or {}
        scroll_info = left_panel.get("scroll") or {}
        # 只保护首屏/顶部可见区；用户日志中的漏识别正发生在启动首屏。
        if scroll_info:
            top = int(scroll_info.get("top", 0) or 0)
            if top > 8 and not bool(scroll_info.get("atTop")):
                self.dm_startup_no_unread_recheck_done = True
                return False
        top_items = session_candidates[:3]
        top_keys = [self._session_key(item) for item in top_items if self._session_key(item)]
        signature = json.dumps({"tab": active_tab or "", "top": top_keys}, ensure_ascii=False, sort_keys=True)
        if signature != str(getattr(self, "dm_startup_no_unread_recheck_signature", "") or ""):
            self.dm_startup_no_unread_recheck_signature = signature
            self.dm_startup_no_unread_recheck_count = 0
        max_rechecks = 3
        max_total_rechecks = 4
        count = int(getattr(self, "dm_startup_no_unread_recheck_count", 0) or 0)
        total_count = int(getattr(self, "dm_startup_no_unread_recheck_total_count", 0) or 0)
        if count >= max_rechecks or total_count >= max_total_rechecks:
            self.dm_startup_no_unread_recheck_done = True
            return False
        self.dm_startup_no_unread_recheck_count = count + 1
        self.dm_startup_no_unread_recheck_total_count = total_count + 1
        delay_ms = 650 + min(count, 2) * 350
        now_ms = self._now_ms()
        last_log_ms = int(getattr(self, "dm_startup_no_unread_recheck_last_log_ms", 0) or 0)
        if count == 0 or now_ms - last_log_ms >= 2500:
            self.dm_startup_no_unread_recheck_last_log_ms = now_ms
            top_diag = []
            for item in top_items:
                top_diag.append({
                    "key": self._session_key(item),
                    "nickname": str(item.get("nickname", "") or "")[:40],
                    "timeText": str(item.get("timeText", "") or "")[:24],
                    "summary": str(item.get("summary", "") or "")[:60],
                    "unreadBadge": item.get("unreadBadge", ""),
                    "unreadDot": bool(item.get("unreadDot")),
                    "unreadReason": item.get("unreadReason", ""),
                    "possibleUnread": bool(item.get("possibleUnreadFlag")),
                    "signals": item.get("unreadSignals", {}),
                })
            payload = {
                "activeTab": active_tab or "-",
                "recheck": self.dm_startup_no_unread_recheck_count,
                "maxRechecks": max_rechecks,
                "totalRechecks": self.dm_startup_no_unread_recheck_total_count,
                "maxTotalRechecks": max_total_rechecks,
                "sessionCandidates": len(session_candidates),
                "scrollTop": scroll_info.get("top") if scroll_info else None,
                "topSessions": top_diag,
                "nextScanMs": delay_ms,
            }
            self._log("INFO", f"私信首屏未读为0，暂缓深扫并复核可见区: {json.dumps(payload, ensure_ascii=False)}")
        if hasattr(self, "_set_dm_scan_mode"):
            self._set_dm_scan_mode("active", reason="startup_visible_unread_recheck")
        self._schedule_fast_dm_inspect(delay_ms)
        return True

    def _drive_dm_queue(self, result: dict[str, Any]) -> None:
        self._ensure_dm_sub_tab_state()
        if self._dm_hard_sleep_blocks_dom_actions():
            return
        self._update_dm_seen_keys(result)
        now_ms = self._now_ms()
        active_tab_for_cleanup = self._active_dm_tab_text(result)
        self._release_expired_dm_pending_replies(active_tab=active_tab_for_cleanup)
        just_confirmed = self._confirm_pending_dm_open(result)
        session_candidates = result.get("sessionCandidates", []) or []
        selected = result.get("selectedSession") or {}
        selected_key = self._session_key(selected)
        reply = result.get("replyReadiness", {}) or {}
        active_tab = self._active_dm_tab_text(result)
        if active_tab in self.DM_SUB_TAB_TEXTS:
            self.dm_current_sub_tab = active_tab
        visible_unread = sorted(
            [
                item
                for item in (result.get("unreadCandidates", []) or [])
                if not self._is_dm_handled_for_tab(self._session_key(item), active_tab)
            ],
            key=lambda item: (item.get("rect", {}) or {}).get("y", 0),
        )

        if not self.dm_startup_gate_released:
            return

        if self._maybe_hold_dm_startup_visible_recheck(result, active_tab=active_tab, visible_unread=visible_unread):
            return

        if visible_unread and hasattr(self, "_set_dm_scan_mode"):
            self._set_dm_scan_mode("active", reason="visible_unread")

        # 补充当前已打开会话的新入站消息检测：只在无列表未读、无打开中任务、无待回复任务时启用。
        # 这避免 Tab 切换后旧 messagePanel 残留被误判成当前 Tab 的新消息。
        if (
            not visible_unread
            and not self.dm_pending_open_key
            and not self.dm_opened_unreplied_keys
            and self._maybe_lock_current_open_dm_conversation(result, selected_key=selected_key, active_tab=active_tab, reply=reply)
        ):
            self._schedule_fast_dm_inspect(900)
            return

        if self.dm_pending_open_key:
            if now_ms - self.last_dm_open_attempt_ms >= 2800 and self.dm_pending_open_attempts < 3:
                retry_item = next((item for item in session_candidates if self._session_key(item) == self.dm_pending_open_key), None)
                if retry_item is not None:
                    self._log("WARN", f"私信会话打开尚未确认，准备重试: {json.dumps({'sessionKey': self.dm_pending_open_key, 'attemptNo': self.dm_pending_open_attempts + 1}, ensure_ascii=False)}")
                    self._open_dm_candidate(retry_item, reason="retry_pending_open")
                    return
            if now_ms - self.last_dm_open_attempt_ms >= 4500 and self.dm_pending_open_attempts >= 3:
                self._log("WARN", f"私信会话打开多次未确认，跳过当前候选: {json.dumps({'sessionKey': self.dm_pending_open_key}, ensure_ascii=False)}")
                self._mark_dm_skipped(self.dm_pending_open_key, active_tab, reason="open_not_confirmed")
                self.dm_opened_unreplied_keys.discard(self.dm_pending_open_key)
                self.dm_pending_open_key = ""
                self.dm_pending_open_dom_index = None
                self.dm_pending_open_attempts = 0
            else:
                return

        if just_confirmed:
            self._schedule_fast_dm_inspect(900)
            return

        if self._guard_opened_unreplied_session(selected_key=selected_key, active_tab=active_tab, reply=reply):
            return

        # 如果存在其它已打开但未完成回复的会话，先等待状态收敛，避免 unread 被清空后直接切走。
        if self.dm_opened_unreplied_keys:
            self._schedule_fast_dm_inspect(1200)
            return

        if visible_unread:
            self._open_dm_candidate(visible_unread[0], reason="next_visible_unread")
            return

        if (
            not visible_unread
            and not self.dm_pending_open_key
            and not self.dm_opened_unreplied_keys
            and self._maybe_wait_dm_post_send_hold(result, reason="no_visible_unread")
        ):
            return

        left_panel = result.get("leftPanel", {}) or {}
        scroll_info = left_panel.get("scroll") or {}
        can_scroll = bool(left_panel.get("found") and scroll_info and (scroll_info.get("maxTop", 0) > 0))
        if can_scroll and not self.dm_scan_complete:
            if scroll_info.get("atBottom"):
                self.dm_scan_complete = True
                self._log("INFO", f"私信页当前列表已扫描到底部。activeTab={active_tab or '-'} processed={int(getattr(self, 'dm_processed_confirm_count', len(getattr(self, 'dm_processed_message_signatures', set()))))} skipped={len(getattr(self, 'dm_skipped_keys', set()))} seen={len(self.dm_seen_keys)}")
                if self._maybe_switch_dm_sub_tab_after_exhausted(result, reason="current_tab_bottom_exhausted"):
                    return
                if self._reset_dm_list_to_top_after_exhausted(reason="current_tab_bottom_exhausted"):
                    return
                return
            self._scroll_dm_list(reason="visible_unread_exhausted")
            return

        if active_tab in self.DM_SUB_TAB_TEXTS and not visible_unread and not self.dm_pending_open_key:
            if hasattr(self, "_set_dm_scan_mode") and not self.dm_opened_unreplied_keys:
                self._set_dm_scan_mode("tab", reason="current_tab_no_visible_unread")
            if self._maybe_switch_dm_sub_tab_after_exhausted(result, reason="current_tab_no_visible_unread"):
                return
