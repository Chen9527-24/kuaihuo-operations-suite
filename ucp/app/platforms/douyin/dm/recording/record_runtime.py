from __future__ import annotations

from collections import Counter
from datetime import datetime, timezone
import json
import re
import uuid
from typing import Any

from app.services.local_records.normalizers import iso_utc


class SessionControllerDMRecordMixin:
    """Side-channel persistence for Douyin direct messages.

    This mixin never changes reply eligibility or platform actions. Every public
    hook swallows recording failures so the existing robot state machine keeps
    running unchanged.
    """

    _DM_RECORD_CURSOR_VERSION = 1

    @staticmethod
    def _dm_record_text(value: Any, limit: int = 20000) -> str:
        return re.sub(r"\s+", " ", str(value or "")).strip()[:limit]

    def _dm_record_service(self) -> Any | None:
        service = getattr(self, "record_service", None)
        if service is None:
            return None
        state = str(getattr(service, "state", "") or "")
        if state.endswith("CLOSED"):
            return None
        return service

    def _dm_record_store_id(self) -> str:
        account = getattr(self, "account", None)
        signature = (
            str(getattr(account, "tenant_id", "") or ""),
            str(getattr(account, "platform", "") or ""),
            str(getattr(account, "id", "") or ""),
            str(getattr(account, "auth_id", "") or ""),
            str(getattr(account, "auth_uid", "") or ""),
        )
        cached = str(getattr(self, "_dm_local_record_store_id", "") or "")
        if cached and getattr(self, "_dm_local_record_identity_signature", None) == signature:
            return cached
        service = self._dm_record_service()
        if service is None:
            return ""
        try:
            store_id = str(service.store_id_for(getattr(self, "account", None)) or "")
        except Exception:
            return ""
        if store_id:
            self._dm_local_record_store_id = store_id
            self._dm_local_record_identity_signature = signature
        return store_id

    def _dm_record_state(self) -> dict[str, Any]:
        state = getattr(self, "_dm_local_record_state", None)
        if not isinstance(state, dict):
            state = {}
            self._dm_local_record_state = state
        state.setdefault("cursors", {})
        state.setdefault("recent_confirmed", [])
        state.setdefault("flow_contexts", {})
        state.setdefault("latest_entries", {})
        state.setdefault("identity_diagnostic", {})
        state.setdefault("remote_contexts", {})
        state.setdefault("identity_instances", {})
        state.setdefault("active_identity", {})
        return state

    @staticmethod
    def _dm_record_identity_name(value: Any) -> str:
        return re.sub(r"\s+", " ", str(value or "").strip().lower())[:256]

    def _dm_record_identity_scope(self, active_tab: Any, conversation_type: Any) -> str:
        """Return a conservative identity partition for DM tabs.

        Friend DMs, stranger DMs, group chats, and unknown/all-message views are
        deliberately separate identity domains. This scope is only used by the
        recording/context side channel and never changes platform reply behavior.
        """
        clean_type = self._dm_record_text(conversation_type, 32).lower()
        clean_tab = self._dm_record_text(active_tab, 64)
        if clean_type == "group" or clean_tab == "群消息":
            return "group"
        if clean_tab == "朋友私信":
            return "friend_private"
        if clean_tab == "陌生人私信":
            return "stranger_private"
        if clean_tab == "全部私信":
            return "private_all"
        return "private_unknown"

    @staticmethod
    def _dm_record_channel_type_for_scope(identity_scope: str) -> str:
        scope = str(identity_scope or "private_unknown").strip().lower()
        return ("dm_" + scope)[:32]

    def _dm_record_identity_signatures(self, bubbles: list[dict[str, Any]]) -> list[str]:
        signatures: list[str] = []
        for bubble in bubbles[-16:]:
            side = "account" if str(bubble.get("side") or "") == "right" else "user"
            message_type = self._dm_record_text(bubble.get("message_type") or "unknown", 32).lower()
            raw_content = bubble.get("text") or bubble.get("placeholder") or f"[{message_type}]"
            content = re.sub(r"[\s\W_]+", "", str(raw_content or "").lower(), flags=re.UNICODE)[:1000]
            signatures.append(f"{side}|{message_type}|{content}")
        return signatures

    @staticmethod
    def _dm_record_longest_ordered_overlap(left: list[str], right: list[str]) -> int:
        best = 0
        for left_index in range(len(left)):
            for right_index in range(len(right)):
                size = 0
                while (
                    left_index + size < len(left)
                    and right_index + size < len(right)
                    and left[left_index + size] == right[right_index + size]
                ):
                    size += 1
                if size > best:
                    best = size
        return best

    @staticmethod
    def _dm_record_generic_identity_content(signature: str) -> bool:
        content = str(signature or "").rsplit("|", 1)[-1]
        return content in {"你好", "在吗", "好的", "好", "哈哈", "谢谢", "就是啊", "嗯", "哦"}

    def _dm_record_identity_score(self, current: list[str], previous: list[str]) -> tuple[int, int, str]:
        overlap = self._dm_record_longest_ordered_overlap(current, previous)
        score = 90 if overlap >= 5 else 82 if overlap == 4 else 75 if overlap == 3 else 55 if overlap == 2 else 15 if overlap == 1 else 0
        account_match = any(item.startswith("account|") and item in set(previous) for item in current)
        if account_match:
            score = min(100, score + 20)
        if overlap == 1:
            matched = next((item for item in current if item in set(previous)), "")
            if self._dm_record_generic_identity_content(matched):
                score = min(score, 20)
        return score, overlap, f"ordered_overlap_{overlap}_account_anchor_{int(account_match)}"

    def _dm_record_runtime_identity_candidates(
        self,
        normalized_name: str,
        identity_scope: str,
    ) -> list[dict[str, Any]]:
        state = self._dm_record_state()
        return [
            item for item in state.get("identity_instances", {}).values()
            if isinstance(item, dict)
            and item.get("normalized_name") == normalized_name
            and item.get("identity_scope") == identity_scope
        ]

    def _dm_record_local_identity_candidates(
        self,
        store_id: str,
        display_name: str,
        conversation_type: str,
        identity_scope: str,
    ) -> list[dict[str, Any]]:
        service = self._dm_record_service()
        if service is None or not hasattr(service, "conversation_candidates"):
            return []
        try:
            scoped_channel = self._dm_record_channel_type_for_scope(identity_scope)
            channels = [scoped_channel]
            # Legacy rows used channel_type=dm. They are considered only through
            # normal strong window scoring and are migrated after a safe match.
            if scoped_channel != "dm":
                channels.append("dm")
            output: list[dict[str, Any]] = []
            seen: set[str] = set()
            for channel_type in channels:
                rows = service.conversation_candidates(
                    store_id,
                    platform="DOUYIN",
                    channel_type=channel_type,
                    participant_display=display_name,
                    limit=20,
                    message_limit=20,
                )
                for item in rows:
                    conversation_id = str(item.get("conversation_id") or "")
                    if not conversation_id or conversation_id in seen:
                        continue
                    if str(item.get("conversation_type") or "private") != conversation_type:
                        continue
                    row = dict(item)
                    row["identity_scope"] = identity_scope if channel_type == scoped_channel else "legacy_unscoped"
                    row["legacy_unscoped"] = channel_type == "dm"
                    output.append(row)
                    seen.add(conversation_id)
            return output
        except Exception:
            return []

    def _dm_record_allocate_local_conversation_id(
        self,
        store_id: str,
        normalized_name: str,
        identity_scope: str,
    ) -> str:
        service = self._dm_record_service()
        seed = uuid.uuid4().hex
        if service is not None:
            return "conv_" + service.message_fingerprint(
                store_id, "DOUYIN", "dm", identity_scope, normalized_name, seed
            )[:32]
        return "conv_" + seed[:32]

    def _dm_record_resolve_local_identity(
        self,
        *,
        store_id: str,
        display_name: str,
        conversation_type: str,
        active_tab: str,
        selected_key: str,
        selected_dom_index: int,
        signatures: list[str],
    ) -> tuple[str, str, int]:
        """Resolve one local physical conversation without using platform UID.

        Nickname only narrows candidates. Runtime row identity and ordered message
        overlap decide reuse. Weak or ambiguous evidence creates a new isolated
        local conversation so two same-name users never share context by guess.
        """
        state = self._dm_record_state()
        normalized_name = self._dm_record_identity_name(display_name)
        identity_scope = self._dm_record_identity_scope(active_tab, conversation_type)
        session_instance = "|".join((identity_scope, active_tab, str(selected_dom_index), selected_key))
        session_hash = ""
        service = self._dm_record_service()
        if service is not None and session_instance.strip("|"):
            session_hash = service.message_fingerprint("dm-session-instance", session_instance)[:24]

        active = state.get("active_identity") if isinstance(state.get("active_identity"), dict) else {}
        if (
            active.get("conversation_id")
            and active.get("normalized_name") == normalized_name
            and active.get("conversation_type") == conversation_type
            and active.get("identity_scope") == identity_scope
        ):
            same_runtime_row = bool(session_hash and session_hash == active.get("session_hash"))
            same_dom_row = selected_dom_index >= 0 and selected_dom_index == int(active.get("selected_dom_index", -999))
            score, overlap, reason = self._dm_record_identity_score(signatures, list(active.get("signatures") or []))
            if same_runtime_row or (same_dom_row and overlap >= 1) or score >= 70:
                conversation_id = str(active.get("conversation_id"))
                state["identity_instances"][conversation_id] = {
                    **active,
                    "conversation_id": conversation_id,
                    "normalized_name": normalized_name,
                    "display_name": display_name,
                    "conversation_type": conversation_type,
                    "identity_scope": identity_scope,
                    "session_hash": session_hash,
                    "selected_dom_index": selected_dom_index,
                    "signatures": list(signatures),
                }
                state["active_identity"] = state["identity_instances"][conversation_id]
                return conversation_id, "active_runtime_row" if same_runtime_row else reason, max(score, 90 if same_runtime_row else score)

        scored: list[tuple[int, int, str, str, dict[str, Any]]] = []
        for candidate in self._dm_record_runtime_identity_candidates(normalized_name, identity_scope):
            if session_hash and session_hash == str(candidate.get("session_hash") or ""):
                score, overlap, reason = 100, len(signatures), "runtime_session_instance_exact"
            else:
                score, overlap, reason = self._dm_record_identity_score(signatures, list(candidate.get("signatures") or []))
            scored.append((score, overlap, reason, str(candidate.get("conversation_id") or ""), candidate))

        for candidate in self._dm_record_local_identity_candidates(
            store_id, display_name, conversation_type, identity_scope
        ):
            previous = [str(item or "") for item in candidate.get("signatures", []) if item]
            score, overlap, reason = self._dm_record_identity_score(signatures, previous)
            scored.append((score, overlap, "local_db_" + reason, str(candidate.get("conversation_id") or ""), candidate))

        scored = [item for item in scored if item[3]]
        scored.sort(key=lambda item: item[0], reverse=True)
        best = scored[0] if scored else None
        second_score = scored[1][0] if len(scored) > 1 else 0
        if best and best[0] >= 70 and best[0] - second_score >= 15:
            conversation_id = best[3]
            resolved = {
                "conversation_id": conversation_id,
                "normalized_name": normalized_name,
                "display_name": display_name,
                "conversation_type": conversation_type,
                "identity_scope": identity_scope,
                "session_hash": session_hash,
                "selected_dom_index": selected_dom_index,
                "signatures": list(signatures),
            }
            state["identity_instances"][conversation_id] = resolved
            state["active_identity"] = resolved
            return conversation_id, best[2], best[0]

        conversation_id = self._dm_record_allocate_local_conversation_id(
            store_id, normalized_name, identity_scope
        )
        resolved = {
            "conversation_id": conversation_id,
            "normalized_name": normalized_name,
            "display_name": display_name,
            "conversation_type": conversation_type,
            "identity_scope": identity_scope,
            "session_hash": session_hash,
            "selected_dom_index": selected_dom_index,
            "signatures": list(signatures),
        }
        state["identity_instances"][conversation_id] = resolved
        state["active_identity"] = resolved
        return conversation_id, "new_isolated_identity_insufficient_or_ambiguous_evidence", 0

    def _dm_record_active_local_conversation_id(
        self,
        *,
        store_id: str,
        display_name: str,
        conversation_type: str,
        active_tab: str,
        selected_key: str,
    ) -> str:
        state = self._dm_record_state()
        identity_scope = self._dm_record_identity_scope(active_tab, conversation_type)
        active = state.get("active_identity") if isinstance(state.get("active_identity"), dict) else {}
        if (
            active.get("conversation_id")
            and active.get("normalized_name") == self._dm_record_identity_name(display_name)
            and active.get("conversation_type") == conversation_type
            and active.get("identity_scope") == identity_scope
        ):
            return str(active.get("conversation_id"))
        conversation_id, _, _ = self._dm_record_resolve_local_identity(
            store_id=store_id,
            display_name=display_name,
            conversation_type=conversation_type,
            active_tab=active_tab,
            selected_key=selected_key,
            selected_dom_index=-1,
            signatures=[],
        )
        return conversation_id

    def _dm_record_conversation(self, result: dict[str, Any], bubbles: list[dict[str, Any]] | None = None) -> dict[str, Any]:
        service = self._dm_record_service()
        store_id = self._dm_record_store_id()
        if service is None or not store_id:
            return {}
        reply = result.get("replyReadiness", {}) or {}
        context = result.get("conversationContext", {}) or {}
        selected = result.get("selectedSession", {}) or {}
        active_tab = self._dm_record_text(
            (self._active_dm_tab_text(result) if hasattr(self, "_active_dm_tab_text") else "")
            or reply.get("activeTabText")
            or context.get("activeTabText"),
            64,
        )
        conversation_type = self._dm_record_text(
            reply.get("conversationType") or context.get("conversationType") or ("group" if active_tab == "群消息" else "private"),
            32,
        ).lower()
        is_group = conversation_type == "group"
        identity_scope = self._dm_record_identity_scope(active_tab, "group" if is_group else "private")
        identity_candidates = [
            ("reply_group_name", reply.get("groupName")),
            ("context_group_name", context.get("groupName")),
            ("reply_header_name", reply.get("headerName")),
            ("context_header_name", context.get("headerName")),
            ("selected_nickname", selected.get("nickname")),
        ]
        header = ""
        identity_source = ""
        for source_name, source_value in identity_candidates:
            normalized = self._dm_record_text(source_value, 256)
            if normalized:
                header = normalized
                identity_source = source_name
                break
        selected_key = ""
        try:
            selected_key = self._dm_record_text(self._session_key(selected), 512) if hasattr(self, "_session_key") else ""
        except Exception:
            selected_key = ""
        selected_nickname = self._dm_record_text(selected.get("nickname"), 256)
        identity_anchor = header or selected_nickname or selected_key
        if not identity_source and selected_nickname:
            identity_source = "selected_nickname"
        if not identity_source and selected_key:
            identity_source = "selected_session_key"
        if not identity_anchor:
            return {}
        try:
            selected_dom_index = int(selected.get("domIndex", -1))
        except (TypeError, ValueError):
            selected_dom_index = -1
        signatures = self._dm_record_identity_signatures(list(bubbles or []))
        conversation_id, local_identity_reason, local_identity_score = self._dm_record_resolve_local_identity(
            store_id=store_id,
            display_name=header or identity_anchor,
            conversation_type="group" if is_group else "private",
            active_tab=active_tab,
            selected_key=selected_key,
            selected_dom_index=selected_dom_index,
            signatures=signatures,
        )
        participant_key = "participant_" + service.message_fingerprint(
            store_id,
            "DOUYIN",
            "group" if is_group else "private",
            conversation_id,
        )[:28]
        return {
            "store_id": store_id,
            "conversation_id": conversation_id,
            "external_conversation_id": selected_key,
            "active_tab": active_tab,
            "conversation_type": "group" if is_group else "private",
            "identity_scope": identity_scope,
            "record_channel_type": self._dm_record_channel_type_for_scope(identity_scope),
            "is_group": is_group,
            "header": header or identity_anchor,
            "participant_key": participant_key,
            "identity_source": identity_source or "unknown",
            "identity_anchor": identity_anchor,
            "selected_key": selected_key,
            "selected_nickname": selected_nickname,
            "local_identity_reason": local_identity_reason,
            "local_identity_score": local_identity_score,
        }

    def _dm_record_diagnostic_hash(self, value: Any) -> str:
        text = self._dm_record_text(value, 20000)
        if not text:
            return ""
        service = self._dm_record_service()
        if service is not None:
            try:
                return str(service.message_fingerprint("c1-dm-identity", text) or "")[:16]
            except Exception:
                pass
        # Deterministic fallback only for diagnostics; raw values are never logged.
        import hashlib
        return hashlib.sha256(text.encode("utf-8", errors="ignore")).hexdigest()[:16]

    @staticmethod
    def _dm_record_multiset_overlap(previous: list[str], current: list[str]) -> int:
        if not previous or not current:
            return 0
        left = Counter(previous)
        right = Counter(current)
        return sum(min(left[key], right[key]) for key in left.keys() & right.keys())

    def _dm_record_identity_diagnostic(
        self,
        result: dict[str, Any],
        info: dict[str, Any],
        bubbles: list[dict[str, Any]],
    ) -> None:
        """Emit rate-limited, hash-only identity diagnostics for C.1.

        This method does not change local conversation identity, cursors, reply
        eligibility, DOM interaction, or persisted chat data.
        """
        try:
            state = self._dm_record_state().setdefault("identity_diagnostic", {})
            previous = state.get("last") if isinstance(state.get("last"), dict) else {}
            selected = result.get("selectedSession", {}) or {}
            reply = result.get("replyReadiness", {}) or {}
            context = result.get("conversationContext", {}) or {}
            js_diag = result.get("identityDiagnostic", {}) or {}
            anchor = getattr(self, "dm_current_conversation_anchor", {}) or {}

            current_tokens = [str(item.get("token") or "") for item in bubbles if item.get("token")]
            previous_tokens = [str(item or "") for item in previous.get("window_tokens", []) if item]
            forward_overlap = self._dm_record_forward_overlap(previous_tokens, current_tokens)
            backward_overlap = self._dm_record_backward_overlap(previous_tokens, current_tokens)
            multiset_overlap = self._dm_record_multiset_overlap(previous_tokens, current_tokens)
            overlap_denominator = max(1, min(len(previous_tokens), len(current_tokens)))
            overlap_ratio = round(multiset_overlap / overlap_denominator, 3)
            window_hash = self._dm_record_diagnostic_hash("|".join(current_tokens))

            selected_key = ""
            try:
                selected_key = self._dm_record_text(self._session_key(selected), 512) if hasattr(self, "_session_key") else ""
            except Exception:
                selected_key = ""
            selected_nickname = self._dm_record_text(selected.get("nickname"), 256)
            header = self._dm_record_text(
                reply.get("groupName")
                or context.get("groupName")
                or reply.get("headerName")
                or context.get("headerName"),
                256,
            )
            active_tab = self._dm_record_text(
                (self._active_dm_tab_text(result) if hasattr(self, "_active_dm_tab_text") else "")
                or reply.get("activeTabText")
                or context.get("activeTabText"),
                64,
            )

            def safe_candidates(value: Any) -> list[dict[str, Any]]:
                rows = value if isinstance(value, list) else []
                output: list[dict[str, Any]] = []
                for row in rows[:16]:
                    if not isinstance(row, dict):
                        continue
                    digest = self._dm_record_text(row.get("hash"), 64)
                    if not digest:
                        continue
                    output.append({
                        "source": self._dm_record_text(row.get("source"), 96),
                        "key": self._dm_record_text(row.get("key"), 96),
                        "hash": digest,
                        "length": int(row.get("length", 0) or 0),
                    })
                return output

            selected_candidates = safe_candidates(js_diag.get("selectedIdentityCandidates"))
            panel_candidates = safe_candidates(js_diag.get("panelIdentityCandidates"))
            stable_hashes = sorted({row["hash"] for row in selected_candidates + panel_candidates if row.get("hash")})
            previous_stable_hashes = set(previous.get("stable_hashes", []) or [])
            shared_stable_hashes = sorted(previous_stable_hashes.intersection(stable_hashes))

            conversation_id = self._dm_record_text(info.get("conversation_id"), 80)
            previous_conversation_id = self._dm_record_text(previous.get("conversation_id"), 80)
            selected_present = bool(selected)
            header_hash = self._dm_record_diagnostic_hash(header)
            nickname_hash = self._dm_record_diagnostic_hash(selected_nickname)
            selected_key_hash = self._dm_record_diagnostic_hash(selected_key)
            anchor_header_hash = self._dm_record_diagnostic_hash(anchor.get("headerName"))
            anchor_selected_key_hash = self._dm_record_diagnostic_hash(anchor.get("selectedKey"))
            conversation_changed = bool(previous_conversation_id and conversation_id and previous_conversation_id != conversation_id)
            high_window_overlap = bool(
                previous_tokens
                and current_tokens
                and (current_tokens == previous_tokens or max(forward_overlap, backward_overlap) >= 2 or overlap_ratio >= 0.6)
            )

            reasons: list[str] = []
            if not previous:
                reasons.append("first_observation")
            if not conversation_id:
                reasons.append("identity_unresolved")
            if not selected_present:
                reasons.append("selected_session_missing")
            if not header:
                reasons.append("header_missing")
            if anchor:
                reasons.append("current_anchor_available")
            if conversation_changed:
                reasons.append("conversation_id_changed")
                if previous.get("active_tab") != active_tab:
                    reasons.append("active_tab_changed")
                if previous.get("header_hash") and previous.get("header_hash") == header_hash:
                    reasons.append("header_stable")
                if previous.get("nickname_hash") and previous.get("nickname_hash") == nickname_hash:
                    reasons.append("nickname_stable")
                if shared_stable_hashes:
                    reasons.append("stable_dom_candidate_shared")
                if high_window_overlap:
                    reasons.append("high_window_overlap")
            elif previous_conversation_id and conversation_id == previous_conversation_id:
                reasons.append("conversation_id_reused")

            event = "identity_observed"
            level = "INFO"
            if conversation_changed and high_window_overlap:
                event = "conversation_changed_high_overlap"
                level = "WARN"
            elif conversation_changed:
                event = "conversation_changed"
                level = "WARN"
            elif not conversation_id:
                event = "identity_unresolved"
                level = "WARN"
            elif selected_present != bool(previous.get("selected_present")) and previous:
                event = "selected_presence_changed"

            diagnostic = {
                "version": 1,
                "event": event,
                "reasons": reasons,
                "conversationId": conversation_id,
                "previousConversationId": previous_conversation_id,
                "identitySource": self._dm_record_text(info.get("identity_source"), 64),
                "activeTab": active_tab,
                "selectedPresent": selected_present,
                "selectedNicknamePresent": bool(selected_nickname),
                "headerPresent": bool(header),
                "selectedNicknameHash": nickname_hash,
                "headerHash": header_hash,
                "selectedSessionKeyHash": selected_key_hash,
                "windowHash": window_hash,
                "windowCount": len(current_tokens),
                "forwardOverlap": forward_overlap,
                "backwardOverlap": backward_overlap,
                "multisetOverlap": multiset_overlap,
                "overlapRatio": overlap_ratio,
                "anchorPresent": bool(anchor),
                "anchorHeaderHash": anchor_header_hash,
                "anchorSelectedKeyHash": anchor_selected_key_hash,
                "anchorSource": self._dm_record_text(anchor.get("source"), 64),
                "selectedStableCandidates": selected_candidates,
                "panelStableCandidates": panel_candidates,
                "sharedStableCandidateHashes": shared_stable_hashes,
            }
            log_signature = self._dm_record_diagnostic_hash(json.dumps(diagnostic, sort_keys=True, ensure_ascii=False))
            last_log_signature = self._dm_record_text(state.get("last_log_signature"), 64)
            now_ms = int(self._now_ms()) if hasattr(self, "_now_ms") else int(datetime.now().timestamp() * 1000)
            last_log_ms = int(state.get("last_log_ms", 0) or 0)
            should_log = (
                event in {"conversation_changed_high_overlap", "conversation_changed", "identity_unresolved"}
                or log_signature != last_log_signature
                and (not previous or now_ms - last_log_ms >= 5000)
            )
            if should_log:
                self._log(level, "C1私信身份诊断: " + json.dumps(diagnostic, ensure_ascii=False, separators=(",", ":")))
                state["last_log_signature"] = log_signature
                state["last_log_ms"] = now_ms

            state["last"] = {
                "conversation_id": conversation_id,
                "active_tab": active_tab,
                "selected_present": selected_present,
                "header_hash": header_hash,
                "nickname_hash": nickname_hash,
                "selected_key_hash": selected_key_hash,
                "window_tokens": current_tokens[-16:],
                "window_hash": window_hash,
                "stable_hashes": stable_hashes,
            }
        except Exception as exc:
            try:
                self._log("WARN", f"C1私信身份诊断降级，不影响机器人：{type(exc).__name__}: {str(exc)[:160]}")
            except Exception:
                pass

    def _dm_record_bubble(self, item: dict[str, Any]) -> dict[str, Any]:
        side = "right" if str(item.get("side") or "").lower() == "right" else "left"
        message_type = self._dm_record_text(item.get("recordMessageType") or "", 32).lower()
        text = self._dm_record_text(
            item.get("recordText")
            if item.get("recordText") is not None
            else (item.get("messageText") if item.get("messageText") is not None else item.get("text")),
            20000,
        )
        placeholder = self._dm_record_text(item.get("recordPlaceholder"), 64)
        if not message_type:
            message_type = "text" if text else "unknown"
        if message_type == "text":
            placeholder = ""
        sender_name = self._dm_record_text(item.get("senderName"), 256)
        source_type_code = self._dm_record_text(item.get("recordSourceTypeCode"), 64)
        classification_source = self._dm_record_text(item.get("recordClassificationSource") or "douyin_dom", 64)
        token_service = self._dm_record_service()
        token = token_service.message_fingerprint(
            side,
            sender_name,
            message_type,
            text,
            placeholder,
        ) if token_service is not None else ""
        return {
            "side": side,
            "sender_name": sender_name,
            "message_type": message_type,
            "text": text,
            "placeholder": placeholder,
            "source_type_code": source_type_code,
            "classification_source": classification_source,
            "token": token,
        }

    @staticmethod
    def _dm_record_forward_overlap(previous: list[str], current: list[str]) -> int:
        for size in range(min(len(previous), len(current)), 0, -1):
            if previous[-size:] == current[:size]:
                return size
        return 0

    @staticmethod
    def _dm_record_backward_overlap(previous: list[str], current: list[str]) -> int:
        for size in range(min(len(previous), len(current)), 0, -1):
            if current[-size:] == previous[:size]:
                return size
        return 0

    def _dm_record_unread_count_hint(self, info: dict[str, Any]) -> int:
        """Return the unread badge count already captured by the queue layer.

        The hint is only used to distinguish newly arrived messages from older
        bubbles when a conversation is observed for the first time. It never
        changes reply eligibility or DOM actions.
        """
        if not hasattr(self, "_pending_dm_reply_meta"):
            return 0
        keys: list[str] = []
        for value in (info.get("selected_key"), info.get("external_conversation_id")):
            key = self._dm_record_text(value, 512)
            if key and key not in keys:
                keys.append(key)
        try:
            pending_meta = getattr(self, "dm_pending_reply_meta", {}) or {}
            if isinstance(pending_meta, dict):
                header = self._dm_record_text(info.get("header"), 256)
                participant = self._dm_record_text(info.get("selected_nickname"), 256)
                for key, value in pending_meta.items():
                    if not isinstance(value, dict):
                        continue
                    nickname = self._dm_record_text(value.get("nickname"), 256)
                    if nickname and nickname in {header, participant}:
                        normalized_key = self._dm_record_text(key, 512)
                        if normalized_key and normalized_key not in keys:
                            keys.append(normalized_key)
            for key in keys:
                meta = self._pending_dm_reply_meta(key) or {}
                hint = max(0, min(99, int(meta.get("unreadCountHint", 0) or 0)))
                if hint:
                    return hint
        except Exception:
            return 0
        return 0

    @staticmethod
    def _dm_record_initial_live_indexes(bubbles: list[dict[str, Any]], unread_count_hint: int) -> set[int]:
        """Select the newest N incoming bubbles indicated by the unread badge."""
        remaining = max(0, int(unread_count_hint or 0))
        if remaining <= 0:
            return set()
        indexes: set[int] = set()
        for index in range(len(bubbles) - 1, -1, -1):
            if str(bubbles[index].get("side") or "") != "left":
                continue
            indexes.add(index)
            remaining -= 1
            if remaining <= 0:
                break
        return indexes

    def _dm_record_load_cursor(self, store_id: str, cursor_key: str) -> dict[str, Any]:
        state = self._dm_record_state()
        cursors = state["cursors"]
        if cursor_key in cursors:
            return cursors[cursor_key]
        service = self._dm_record_service()
        loaded: dict[str, Any] = {}
        if service is not None and hasattr(service, "load_cursor"):
            try:
                loaded = service.load_cursor(store_id, cursor_key) or {}
            except Exception:
                loaded = {}
        if not isinstance(loaded, dict):
            loaded = {}
        loaded.setdefault("version", self._DM_RECORD_CURSOR_VERSION)
        loaded.setdefault("entries", [])
        loaded.setdefault("nextSequence", 1)
        loaded.setdefault("minSequence", 1)
        loaded.setdefault("pendingWindowFingerprints", [])
        loaded.setdefault("pendingNoOverlapCount", 0)
        cursors[cursor_key] = loaded
        return loaded

    def _dm_record_submit_conversation(self, info: dict[str, Any], observed_at_utc: str) -> None:
        service = self._dm_record_service()
        if service is None:
            return
        service.submit(
            store_id=info["store_id"],
            event_type="conversation_upsert",
            payload={
                "conversation_id": info["conversation_id"],
                "platform": "DOUYIN",
                "channel_type": info.get("record_channel_type") or "dm_private_unknown",
                "external_conversation_id": info["external_conversation_id"],
                "title": info["header"],
                "participant_key": info["participant_key"],
                "participant_display": info["header"],
                "is_group": info["is_group"],
                "first_observed_at_utc": observed_at_utc,
                "last_observed_at_utc": observed_at_utc,
            },
        )

    def _dm_record_outgoing_attribution(self, conversation_id: str, text: str) -> tuple[str, str, str, str, str]:
        normalized = self._dm_record_text(text)
        if not normalized:
            return "account_side_unconfirmed", "unknown", "", "", ""
        state = self._dm_record_state()
        now_ms = int(self._now_ms()) if hasattr(self, "_now_ms") else int(datetime.now().timestamp() * 1000)
        fresh: list[dict[str, Any]] = []
        matched: dict[str, Any] | None = None
        for item in state.get("recent_confirmed", []):
            age = now_ms - int(item.get("confirmedAtMs", 0) or 0)
            if age > 60000:
                continue
            if (
                matched is None
                and str(item.get("conversationId") or "") == conversation_id
                and self._dm_record_text(item.get("text")) == normalized
            ):
                matched = item
                continue
            fresh.append(item)
        state["recent_confirmed"] = fresh[-20:]
        if matched:
            return (
                "ucp_robot",
                "verified",
                str(matched.get("attemptId") or ""),
                str(matched.get("replyTraceId") or ""),
                str(matched.get("generationSource") or ""),
            )
        return "account_side_unconfirmed", "unknown", "", "", ""

    def _dm_record_submit_message(
        self,
        info: dict[str, Any],
        bubble: dict[str, Any],
        *,
        message_id: str,
        sequence_index: int,
        history_kind: str,
        live: bool,
        observed_at_utc: str,
    ) -> None:
        service = self._dm_record_service()
        if service is None:
            return
        if bubble["side"] == "left":
            sender_role = "user"
            if info["is_group"]:
                sender_display = bubble["sender_name"]
                sender_key = (
                    "sender_" + service.message_fingerprint(info["conversation_id"], sender_display)[:28]
                    if sender_display else ""
                )
            else:
                sender_display = bubble["sender_name"] or info["header"]
                sender_key = info["participant_key"]
            actor_source = "platform_user"
            confidence = "probable"
            reply_attempt_id = ""
            reply_trace_id = ""
            generation_source = ""
        else:
            sender_role = "account"
            sender_display = str(getattr(getattr(self, "account", None), "auth_name", "") or getattr(getattr(self, "account", None), "name", "") or "")
            sender_key = "account_" + service.message_fingerprint(info["store_id"], "account_side")[:28]
            actor_source, confidence, reply_attempt_id, reply_trace_id, generation_source = self._dm_record_outgoing_attribution(
                info["conversation_id"], bubble["text"] or bubble["placeholder"]
            )
        time_payload = service.normalized_time(is_live_observation=live)
        if not live:
            time_payload["time_accuracy"] = "unknown_history"
            time_payload["source_time_utc"] = ""
        time_payload["observed_at_utc"] = observed_at_utc
        time_payload["first_observed_at_utc"] = observed_at_utc
        time_payload["last_observed_at_utc"] = observed_at_utc
        service.submit(
            store_id=info["store_id"],
            event_type="message_upsert",
            payload={
                "message_id": message_id,
                "conversation_id": info["conversation_id"],
                "platform": "DOUYIN",
                "channel_type": info.get("record_channel_type") or "dm_private_unknown",
                "external_conversation_id": info["external_conversation_id"],
                "title": info["header"],
                "participant_key": info["participant_key"],
                "participant_display": info["header"],
                "is_group": info["is_group"],
                "sender_role": sender_role,
                "sender_key": sender_key,
                "sender_display": sender_display,
                "actor_source": actor_source,
                "attribution_confidence": confidence,
                "reply_attempt_id": reply_attempt_id,
                "reply_trace_id": reply_trace_id,
                "generation_source": generation_source,
                "message_type": bubble["message_type"],
                "text_content": bubble["text"],
                "type_placeholder": bubble["placeholder"],
                "source_type_code": bubble["source_type_code"],
                "classification_source": bubble["classification_source"],
                "sequence_index": sequence_index,
                **time_payload,
                "history_kind": history_kind,
                "payload_fingerprint": bubble["token"],
                "source_robot_id": str(getattr(getattr(self, "account", None), "id", "") or ""),
                "source_client_id": str(getattr(service, "client_id", "") or ""),
            },
        )

    def _dm_record_new_entry(
        self,
        info: dict[str, Any],
        bubble: dict[str, Any],
        sequence_index: int,
        history_kind: str,
        live: bool,
        observed_at_utc: str,
    ) -> dict[str, Any]:
        service = self._dm_record_service()
        assert service is not None
        message_id = "msg_" + service.message_fingerprint(
            info["conversation_id"],
            sequence_index,
            bubble["token"],
        )[:32]
        self._dm_record_submit_message(
            info,
            bubble,
            message_id=message_id,
            sequence_index=sequence_index,
            history_kind=history_kind,
            live=live,
            observed_at_utc=observed_at_utc,
        )
        return {
            "fingerprint": bubble["token"],
            "messageId": message_id,
            "sequenceIndex": sequence_index,
            "side": bubble["side"],
        }

    def _dm_record_persist_cursor(self, info: dict[str, Any], cursor_key: str, cursor: dict[str, Any]) -> None:
        service = self._dm_record_service()
        if service is None:
            return
        safe_cursor = {
            "version": self._DM_RECORD_CURSOR_VERSION,
            "entries": list(cursor.get("entries", []))[-16:],
            "nextSequence": int(cursor.get("nextSequence", 1) or 1),
            "minSequence": int(cursor.get("minSequence", 1) or 1),
            "lastPanelBubbleCount": int(cursor.get("lastPanelBubbleCount", 0) or 0),
            "lastPanelScrollTop": int(cursor.get("lastPanelScrollTop", 0) or 0),
            "lastPanelScrollHeight": int(cursor.get("lastPanelScrollHeight", 0) or 0),
            "pendingWindowFingerprints": list(cursor.get("pendingWindowFingerprints", []))[-16:],
            "pendingNoOverlapCount": int(cursor.get("pendingNoOverlapCount", 0) or 0),
            "lastObservedAtUtc": str(cursor.get("lastObservedAtUtc", "") or ""),
        }
        cursor.clear()
        cursor.update(safe_cursor)
        service.submit(
            store_id=info["store_id"],
            event_type="cursor_upsert",
            payload={
                "cursor_key": cursor_key,
                "conversation_id": info["conversation_id"],
                "cursor_type": "douyin_visible_window_v1",
                "cursor": safe_cursor,
            },
        )

    def _dm_record_snapshot(self, result: dict[str, Any]) -> None:
        """Record the current visible DM window without affecting reply flow."""
        try:
            service = self._dm_record_service()
            raw_items = result.get("visibleBubbleCandidates")
            if not isinstance(raw_items, list):
                raw_items = (result.get("conversationContext", {}) or {}).get("visibleBubbleSamples", [])
            bubbles = [self._dm_record_bubble(item) for item in raw_items if isinstance(item, dict)]
            bubbles = [item for item in bubbles if item.get("token")]
            info = self._dm_record_conversation(result, bubbles)
            self._dm_record_identity_diagnostic(result, info, bubbles)
            if service is None or not info or not bubbles:
                return
            observed_at_utc = iso_utc()
            self._dm_record_submit_conversation(info, observed_at_utc)
            cursor_key = "douyin_dm_window:" + info["conversation_id"]
            cursor = self._dm_record_load_cursor(info["store_id"], cursor_key)
            previous_entries = [
                item for item in cursor.get("entries", [])
                if isinstance(item, dict) and (item.get("fingerprint") or item.get("token"))
            ]
            previous_tokens = [str(item.get("fingerprint") or item.get("token") or "") for item in previous_entries]
            current_tokens = [str(item.get("token") or "") for item in bubbles]
            next_sequence = max(1, int(cursor.get("nextSequence", 1) or 1))
            min_sequence = int(cursor.get("minSequence", 1) or 1)
            panel = result.get("messagePanel", {}) or {}
            panel_scroll = panel.get("scroll", {}) or {}
            panel_count = int(panel.get("bubbleLikeCount", len(bubbles)) or len(bubbles))
            panel_top = int(panel_scroll.get("top", 0) or 0)
            panel_height = int(panel_scroll.get("scrollHeight", 0) or 0)
            previous_count = int(cursor.get("lastPanelBubbleCount", 0) or 0)
            previous_top = int(cursor.get("lastPanelScrollTop", panel_top) or panel_top)
            entries: list[dict[str, Any]] = []

            if not previous_entries:
                unread_count_hint = self._dm_record_unread_count_hint(info)
                live_indexes = self._dm_record_initial_live_indexes(bubbles, unread_count_hint)
                for index, bubble in enumerate(bubbles):
                    is_live = index in live_indexes
                    entries.append(self._dm_record_new_entry(
                        info,
                        bubble,
                        next_sequence,
                        "live_observed" if is_live else "initial_visible_baseline",
                        is_live,
                        observed_at_utc,
                    ))
                    next_sequence += 1
                if live_indexes:
                    self._log(
                        "INFO",
                        f"私信首次会话记录按未读提示标记实时消息: {json.dumps({'conversationId': info['conversation_id'], 'unreadHint': unread_count_hint, 'liveCount': len(live_indexes), 'windowCount': len(bubbles)}, ensure_ascii=False)}",
                    )
                min_sequence = min((int(item["sequenceIndex"]) for item in entries), default=1)
                cursor["pendingWindowFingerprints"] = []
                cursor["pendingNoOverlapCount"] = 0
            elif current_tokens == previous_tokens:
                count_delta = max(0, panel_count - previous_count)
                if count_delta > 0 and bool(panel_scroll.get("atBottom", True)):
                    add_count = min(count_delta, len(bubbles))
                    retained = previous_entries[add_count:] if add_count < len(previous_entries) else []
                    new_entries = []
                    for bubble in bubbles[-add_count:]:
                        new_entries.append(self._dm_record_new_entry(
                            info, bubble, next_sequence, "live_observed", True, observed_at_utc
                        ))
                        next_sequence += 1
                    entries = retained + new_entries
                else:
                    entries = previous_entries
                cursor["pendingWindowFingerprints"] = []
                cursor["pendingNoOverlapCount"] = 0
            else:
                forward = self._dm_record_forward_overlap(previous_tokens, current_tokens)
                backward = self._dm_record_backward_overlap(previous_tokens, current_tokens)
                scrolling_up = panel_top < previous_top
                if backward and (scrolling_up or backward > forward):
                    new_count = len(current_tokens) - backward
                    start_sequence = min_sequence - new_count
                    new_entries = []
                    for offset, bubble in enumerate(bubbles[:new_count]):
                        new_entries.append(self._dm_record_new_entry(
                            info, bubble, start_sequence + offset, "history_backfill", False, observed_at_utc
                        ))
                    entries = new_entries + previous_entries[:backward]
                    min_sequence = start_sequence if new_entries else min_sequence
                    cursor["pendingWindowFingerprints"] = []
                    cursor["pendingNoOverlapCount"] = 0
                elif forward:
                    entries = list(previous_entries[-forward:])
                    for bubble in bubbles[forward:]:
                        entries.append(self._dm_record_new_entry(
                            info, bubble, next_sequence, "live_observed", True, observed_at_utc
                        ))
                        next_sequence += 1
                    cursor["pendingWindowFingerprints"] = []
                    cursor["pendingNoOverlapCount"] = 0
                else:
                    pending_tokens = list(cursor.get("pendingWindowFingerprints", []))
                    pending_count = int(cursor.get("pendingNoOverlapCount", 0) or 0)
                    if pending_tokens == current_tokens:
                        pending_count += 1
                    else:
                        pending_tokens = current_tokens
                        pending_count = 1
                    cursor["pendingWindowFingerprints"] = pending_tokens
                    cursor["pendingNoOverlapCount"] = pending_count
                    if pending_count >= 2:
                        entries = []
                        for bubble in bubbles:
                            entries.append(self._dm_record_new_entry(
                                info, bubble, next_sequence, "window_rebaseline", False, observed_at_utc
                            ))
                            next_sequence += 1
                        min_sequence = min((int(item["sequenceIndex"]) for item in entries), default=min_sequence)
                        cursor["pendingWindowFingerprints"] = []
                        cursor["pendingNoOverlapCount"] = 0
                    else:
                        entries = previous_entries

            cursor["entries"] = entries[-16:]
            cursor["nextSequence"] = next_sequence
            cursor["minSequence"] = min_sequence
            cursor["lastPanelBubbleCount"] = panel_count
            cursor["lastPanelScrollTop"] = panel_top
            cursor["lastPanelScrollHeight"] = panel_height
            cursor["lastObservedAtUtc"] = observed_at_utc
            self._dm_record_state()["latest_entries"][info["conversation_id"]] = list(entries)
            self._dm_record_persist_cursor(info, cursor_key, cursor)
        except Exception as exc:
            try:
                self._log("WARN", f"抖音私信本地记录降级，不影响机器人：{type(exc).__name__}: {str(exc)[:200]}")
            except Exception:
                pass

    def _dm_record_flow_context(
        self,
        *,
        reply_token: str,
        selected_key: str,
        header_name: str,
        latest_incoming_text: str,
        conversation_id: str = "",
        conversation_type: str = "private",
        active_tab: str = "",
    ) -> dict[str, Any]:
        service = self._dm_record_service()
        store_id = self._dm_record_store_id()
        if service is None or not store_id:
            return {}
        header = self._dm_record_text(header_name or selected_key, 256)
        clean_type = "group" if self._dm_record_text(conversation_type, 32).lower() == "group" else "private"
        clean_tab = self._dm_record_text(active_tab, 64)
        identity_scope = self._dm_record_identity_scope(clean_tab, clean_type)
        local_conversation_id = self._dm_record_active_local_conversation_id(
            store_id=store_id,
            display_name=header or selected_key,
            conversation_type=clean_type,
            active_tab=clean_tab,
            selected_key=selected_key,
        )
        token = self._dm_record_text(reply_token or selected_key or latest_incoming_text, 512)
        turn_id = "turn_" + service.message_fingerprint(store_id, local_conversation_id, token)[:32]
        attempt_id = "attempt_" + service.message_fingerprint(store_id, local_conversation_id, token, "reply")[:32]
        analysis_id = "analysis_" + service.message_fingerprint(store_id, turn_id, "auto_reply")[:32]
        context = {
            "store_id": store_id,
            "conversation_id": local_conversation_id,
            "external_conversation_id": self._dm_record_text(conversation_id or selected_key, 512),
            "header": header,
            "participant_key": "participant_" + service.message_fingerprint(store_id, local_conversation_id)[:28],
            "turn_id": turn_id,
            "attempt_id": attempt_id,
            "analysis_id": analysis_id,
            "latest_incoming_text": self._dm_record_text(latest_incoming_text),
            "reply_token": token,
            "conversation_type": clean_type,
            "identity_scope": identity_scope,
            "record_channel_type": self._dm_record_channel_type_for_scope(identity_scope),
            "active_tab": clean_tab,
        }
        self._dm_record_state()["flow_contexts"][token] = context
        return context

    def _dm_record_context_from_payload(self, payload: dict[str, Any]) -> dict[str, Any]:
        token = self._dm_record_text(payload.get("replyToken") or payload.get("selected") or payload.get("latestIncomingText"), 512)
        state = self._dm_record_state()
        existing = state.get("flow_contexts", {}).get(token)
        if isinstance(existing, dict):
            return existing
        return self._dm_record_flow_context(
            reply_token=token,
            selected_key=self._dm_record_text(payload.get("selected"), 512),
            header_name=self._dm_record_text(payload.get("headerName"), 256),
            latest_incoming_text=self._dm_record_text(payload.get("latestIncomingText")),
            conversation_id=self._dm_record_text(payload.get("conversationId"), 512),
            conversation_type=self._dm_record_text(payload.get("conversationType") or "private", 32),
            active_tab=self._dm_record_text(payload.get("activeTabText"), 64),
        )

    @staticmethod
    def _dm_record_remote_message(row: dict[str, Any]) -> dict[str, Any]:
        return {
            "clientMessageId": str(row.get("message_id") or "")[:256],
            "sourceClientId": str(row.get("source_client_id") or "")[:128],
            "senderRole": str(row.get("sender_role") or "unknown")[:32],
            "actorSource": str(row.get("actor_source") or "")[:64],
            "attributionConfidence": str(row.get("attribution_confidence") or "")[:32],
            "messageType": str(row.get("message_type") or "unknown")[:32],
            "textContent": str(row.get("text_content") or "")[:20000],
            "typePlaceholder": str(row.get("type_placeholder") or "")[:64],
            "sequenceIndex": int(row.get("sequence_index", 0) or 0),
            "observedAtUtc": str(row.get("observed_at_utc") or "")[:64],
            "historyKind": str(row.get("history_kind") or "")[:32],
            "timeAccuracy": str(row.get("time_accuracy") or "")[:32],
            "payloadFingerprint": str(row.get("payload_fingerprint") or "")[:128],
            "replyAttemptId": str(row.get("reply_attempt_id") or "")[:256],
            "replyTraceId": str(row.get("reply_trace_id") or "")[:512],
            "generationSource": str(row.get("generation_source") or "")[:64],
        }

    def _dm_record_current_client_message_ids(
        self,
        messages: list[dict[str, Any]],
        aggregated_text: str,
    ) -> list[str]:
        """Find the newest user text rows that formed the current aggregate."""
        target_lines = [
            self._dm_record_text(item, 2000)
            for item in re.split(r"[\r\n]+", str(aggregated_text or ""))
            if self._dm_record_text(item, 2000)
        ]
        selected: list[str] = []
        if target_lines:
            expected_index = len(target_lines) - 1
            for row in reversed(messages):
                if expected_index < 0:
                    break
                if str(row.get("sender_role") or "") != "user" or str(row.get("message_type") or "") != "text":
                    continue
                value = self._dm_record_text(row.get("text_content"), 2000)
                if value == target_lines[expected_index]:
                    message_id = self._dm_record_text(row.get("message_id"), 256)
                    if message_id:
                        selected.append(message_id)
                    expected_index -= 1
            if expected_index < 0:
                return list(reversed(selected))

        # Fallback for older payloads where line breaks were collapsed.
        target = self._dm_record_text(aggregated_text, 4000)
        suffix: list[dict[str, Any]] = []
        for row in reversed(messages):
            if str(row.get("sender_role") or "") != "user" or str(row.get("message_type") or "") != "text":
                continue
            suffix.append(row)
            candidate = self._dm_record_text(" ".join(
                str(item.get("text_content") or "") for item in reversed(suffix)
            ), 4000)
            if candidate == target:
                return [
                    self._dm_record_text(item.get("message_id"), 256)
                    for item in reversed(suffix)
                    if self._dm_record_text(item.get("message_id"), 256)
                ]
            if len(candidate) > len(target) + 50 or len(suffix) >= 10:
                break
        return []

    def _dm_record_resolve_remote_context(self, payload: dict[str, Any]) -> dict[str, Any]:
        """Best-effort server sync and same-name-safe context resolution.

        Failure is deliberately isolated from reply generation. Only whitelist
        text/message metadata already persisted in local SQLite is uploaded.
        """
        try:
            local_service = self._dm_record_service()
            core_service = getattr(self, "core_service", None)
            ctx = self._dm_record_context_from_payload(payload)
            if (
                local_service is None
                or core_service is None
                or not hasattr(core_service, "resolve_sync_dm_dialogue")
                or not ctx
            ):
                return {}
            messages = local_service.recent_messages(
                ctx["store_id"],
                ctx["conversation_id"],
                limit=50,
            ) if hasattr(local_service, "recent_messages") else []
            if not messages:
                return {}
            aggregated_text = self._dm_record_text(
                payload.get("aggregatedIncomingText") or payload.get("latestIncomingText"),
                4000,
            )
            current_ids = self._dm_record_current_client_message_ids(messages, aggregated_text)
            window_rows = messages[-12:]
            current_window = [
                {
                    "senderRole": str(row.get("sender_role") or "unknown")[:32],
                    "messageType": str(row.get("message_type") or "unknown")[:32],
                    "textContent": str(row.get("text_content") or "")[:20000],
                    "typePlaceholder": str(row.get("type_placeholder") or "")[:64],
                    "actorSource": str(row.get("actor_source") or "")[:64],
                    "attributionConfidence": str(row.get("attribution_confidence") or "")[:32],
                }
                for row in window_rows
            ]
            account = getattr(self, "account", None)
            request_payload = {
                "robotId": str(getattr(account, "id", "") or ""),
                "platform": "DOUYIN",
                "channelType": "dm",
                "chatType": str(ctx.get("identity_scope") or "private_unknown"),
                "botNickname": str(
                    getattr(account, "auth_name", "")
                    or getattr(account, "name", "")
                    or "UCP机器人"
                )[:100],
                "userNickname": str(ctx.get("header") or payload.get("headerName") or payload.get("selected") or "未知用户")[:100],
                "sourceClientId": str(getattr(local_service, "client_id", "") or "ucp")[:128],
                "localConversationId": str(ctx.get("conversation_id") or "")[:128],
                "currentWindow": current_window,
                "messages": [self._dm_record_remote_message(row) for row in messages],
                "currentClientMessageIds": current_ids,
                "contextLimit": 10,
            }
            result = core_service.resolve_sync_dm_dialogue(request_payload)
            if not isinstance(result, dict):
                return {}
            result["currentClientMessageIds"] = current_ids
            self._dm_record_state()["remote_contexts"][ctx["conversation_id"]] = result
            self._log(
                "INFO",
                "私信服务端会话解析与增量同步完成: " + json.dumps({
                    "localConversationId": ctx["conversation_id"],
                    "canonicalConversationId": str(result.get("canonicalConversationId") or "")[:24],
                    "identityStatus": result.get("identityStatus", ""),
                    "chatType": result.get("chatType", ""),
                    "matchScore": result.get("matchScore", 0),
                    "matchReason": result.get("matchReason", ""),
                    "syncedCount": result.get("syncedCount", 0),
                    "contextCount": len(result.get("contextMessages") or []),
                }, ensure_ascii=False),
            )
            return result
        except Exception as exc:
            try:
                self._log(
                    "WARN",
                    f"私信服务端记录/上下文同步失败，已降级为无服务端上下文且不影响回复：{type(exc).__name__}: {str(exc)[:160]}",
                )
            except Exception:
                pass
            return {}

    def _dm_record_schedule_post_send_remote_sync(
        self,
        payload: dict[str, Any],
        *,
        actual_text: str = "",
    ) -> None:
        """Upload the just-confirmed outgoing row after the DOM snapshot is persisted.

        The first resolve/sync happens before reply generation, so it cannot
        contain the reply that has not been sent yet.  This side-channel task is
        queued on the existing DM worker after the current UI inspection returns;
        LocalRecordService.recent_messages() flushes the writer before reading.
        Failures never affect the already-confirmed platform send.
        """
        try:
            snapshot = dict(payload or {})
            snapshot["postSendSync"] = True
            if actual_text:
                snapshot["actualText"] = self._dm_record_text(actual_text)

            def _submit() -> None:
                try:
                    executor = getattr(self, "dm_reply_executor", None)
                    if executor is None:
                        return
                    previous = getattr(self, "dm_post_send_sync_future", None)
                    if previous is not None and not previous.done():
                        # One DM send is serialized already. A running post-send
                        # sync will include all currently persisted recent rows.
                        return

                    def _worker() -> dict[str, Any]:
                        result = self._dm_record_resolve_remote_context(snapshot) or {}
                        if result:
                            self._log(
                                "INFO",
                                "私信发送确认后服务端增量同步完成: " + json.dumps({
                                    "canonicalConversationId": str(result.get("canonicalConversationId") or "")[:24],
                                    "syncedCount": int(result.get("syncedCount", 0) or 0),
                                    "messageCount": int(result.get("messageCount", 0) or 0),
                                }, ensure_ascii=False),
                            )
                        return result

                    self.dm_post_send_sync_future = executor.submit(_worker)
                except Exception as exc:
                    try:
                        self._log(
                            "WARN",
                            f"私信发送确认后服务端增量同步提交失败，已忽略且不影响发送：{type(exc).__name__}: {str(exc)[:160]}",
                        )
                    except Exception:
                        pass

            # Called during the inspection stack before _dm_record_snapshot().
            # Zero-delay runs after the snapshot has queued the outgoing row.
            from PySide6.QtCore import QTimer
            QTimer.singleShot(0, _submit)
        except Exception:
            pass

    def _dm_record_analysis_started(self, payload: dict[str, Any]) -> None:
        try:
            service = self._dm_record_service()
            ctx = self._dm_record_context_from_payload(payload)
            if service is None or not ctx:
                return
            now = iso_utc()
            payload["replyAttemptId"] = ctx["attempt_id"]
            payload["localConversationId"] = ctx["conversation_id"]
            service.submit(store_id=ctx["store_id"], event_type="turn_upsert", payload={
                "turn_id": ctx["turn_id"],
                "conversation_id": ctx["conversation_id"],
                "platform": "DOUYIN",
                "channel_type": ctx.get("record_channel_type") or "dm_private_unknown",
                "external_conversation_id": ctx["external_conversation_id"],
                "title": ctx["header"],
                "participant_key": ctx["participant_key"],
                "participant_display": ctx["header"],
                "is_group": ctx.get("conversation_type") == "group",
                "aggregated_text": ctx["latest_incoming_text"],
                "started_at_utc": now,
                "first_observed_at_utc": now,
                "last_observed_at_utc": now,
            })
            recent_entries = list(self._dm_record_state().get("latest_entries", {}).get(ctx["conversation_id"], []))
            trailing_incoming: list[dict[str, Any]] = []
            for entry in reversed(recent_entries):
                if str(entry.get("side") or "") == "right":
                    break
                if str(entry.get("side") or "") == "left" and entry.get("messageId"):
                    trailing_incoming.append(entry)
            trailing_incoming.reverse()
            for position, entry in enumerate(trailing_incoming, start=1):
                service.submit(store_id=ctx["store_id"], event_type="turn_message_link", payload={
                    "turn_id": ctx["turn_id"],
                    "message_id": str(entry.get("messageId") or ""),
                    "position": position,
                })
            service.submit(store_id=ctx["store_id"], event_type="analysis_upsert", payload={
                "analysis_id": ctx["analysis_id"],
                "target_type": "turn",
                "target_id": ctx["turn_id"],
                "analysis_type": "dm_auto_reply",
                "status": "pending",
                "started_at_utc": now,
            })
        except Exception:
            pass

    def _dm_record_analysis_result(
        self,
        payload: dict[str, Any],
        *,
        status: str,
        draft_text: str = "",
        source: str = "",
        model: str = "",
        reason: str = "",
        intention_level: str = "",
        purpose_category: str = "",
        error_code: str = "",
    ) -> None:
        try:
            service = self._dm_record_service()
            ctx = self._dm_record_context_from_payload(payload)
            if service is None or not ctx:
                return
            now = iso_utc()
            service.submit(store_id=ctx["store_id"], event_type="analysis_upsert", payload={
                "analysis_id": ctx["analysis_id"],
                "target_type": "turn",
                "target_id": ctx["turn_id"],
                "analysis_type": "dm_auto_reply",
                "status": status,
                "result": {
                    "source": self._dm_record_text(source, 128),
                    "model": self._dm_record_text(model, 128),
                    "reason": self._dm_record_text(reason, 1000),
                },
                "purpose_category": self._dm_record_text(purpose_category, 128),
                "intention_level": self._dm_record_text(intention_level, 64),
                "completed_at_utc": now if status != "pending" else "",
                "error_code": self._dm_record_text(error_code, 128),
                "error_message": self._dm_record_text(reason, 2000) if status in {"failed", "timeout", "invalid", "empty_reply"} else "",
            })
            if draft_text:
                service.submit(store_id=ctx["store_id"], event_type="reply_attempt_upsert", payload={
                    "attempt_id": ctx["attempt_id"],
                    "target_type": "turn",
                    "target_id": ctx["turn_id"],
                    "conversation_id": ctx["conversation_id"],
                    "draft_text": self._dm_record_text(draft_text),
                    "status": "draft_generated",
                    "reply_trace_id": self._dm_record_text(payload.get("replyTraceId"), 512),
                    "generation_source": self._dm_record_text(payload.get("generationSource") or source, 64),
                    "source_robot_id": str(getattr(getattr(self, "account", None), "id", "") or ""),
                    "source_client_id": str(getattr(service, "client_id", "") or ""),
                })
        except Exception:
            pass

    def _dm_record_reply_attempt(
        self,
        payload: dict[str, Any],
        *,
        status: str,
        actual_text: str = "",
        error_code: str = "",
        error_message: str = "",
        confirmed: bool = False,
    ) -> None:
        try:
            service = self._dm_record_service()
            ctx = self._dm_record_context_from_payload(payload)
            if service is None or not ctx:
                return
            now = iso_utc()
            draft_text = self._dm_record_text(payload.get("draftText"))
            service.submit(store_id=ctx["store_id"], event_type="reply_attempt_upsert", payload={
                "attempt_id": ctx["attempt_id"],
                "target_type": "turn",
                "target_id": ctx["turn_id"],
                "conversation_id": ctx["conversation_id"],
                "draft_text": draft_text,
                "actual_text": self._dm_record_text(actual_text),
                "status": status,
                "attempted_at_utc": now if status in {"send_pending", "send_unconfirmed", "send_failed", "sent", "sent_late_confirmed"} else "",
                "confirmed_at_utc": now if confirmed else "",
                "error_code": self._dm_record_text(error_code, 128),
                "error_message": self._dm_record_text(error_message, 2000),
                "reply_trace_id": self._dm_record_text(payload.get("replyTraceId"), 512),
                "generation_source": self._dm_record_text(payload.get("generationSource"), 64),
                "source_robot_id": str(getattr(getattr(self, "account", None), "id", "") or ""),
                "source_client_id": str(getattr(service, "client_id", "") or ""),
            })
            if confirmed:
                now_ms = int(self._now_ms()) if hasattr(self, "_now_ms") else int(datetime.now(tz=timezone.utc).timestamp() * 1000)
                self._dm_record_state()["recent_confirmed"].append({
                    "conversationId": ctx["conversation_id"],
                    "text": actual_text or draft_text,
                    "attemptId": ctx["attempt_id"],
                    "replyTraceId": self._dm_record_text(payload.get("replyTraceId"), 512),
                    "generationSource": self._dm_record_text(payload.get("generationSource"), 64),
                    "confirmedAtMs": now_ms,
                })
        except Exception:
            pass
