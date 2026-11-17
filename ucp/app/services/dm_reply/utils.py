from __future__ import annotations

import re
from typing import Any


def normalize_text_space(value: Any) -> str:
    return re.sub(r"\s+", " ", str(value or "")).strip()


def build_aggregate_signature(
    reply: dict[str, Any],
    context: dict[str, Any] | None = None,
    selected: dict[str, Any] | None = None,
) -> str:
    context = context or {}
    selected = selected or {}
    header_name = normalize_text_space(
        reply.get("headerName", "") or reply.get("selectedNickname", "") or selected.get("nickname", "") or ""
    )
    conversation_type = normalize_text_space(reply.get("conversationType", "") or context.get("conversationType", ""))
    group_name = normalize_text_space(reply.get("groupName", "") or context.get("groupName", ""))
    group_sender = normalize_text_space(reply.get("groupSenderName", "") or context.get("groupSenderName", ""))
    group_message = normalize_text_space(reply.get("groupMessageText", "") or context.get("groupMessageText", ""))
    aggregated_incoming = normalize_text_space(
        reply.get("aggregatedIncomingText", "") or context.get("aggregatedIncomingText", "")
    )
    latest_incoming = aggregated_incoming or normalize_text_space(
        group_message if conversation_type == "group" and group_message else reply.get("latestIncomingText", "")
    )
    selected_summary = normalize_text_space(
        reply.get("selectedSummary", "") or context.get("selectedSummary", "") or selected.get("summary", "") or ""
    )
    recent_left: list[str] = []
    for item in list(context.get("visibleBubbleSamples", []) or []):
        if str(item.get("side", "") or "") != "left":
            continue
        text = normalize_text_space(item.get("messageText", "") or item.get("text", ""))
        if text:
            recent_left.append(text)
    recent_left = recent_left[-3:]
    parts = [part for part in [header_name, group_name, group_sender, latest_incoming or selected_summary, *recent_left] if part]
    return " || ".join(parts)[:480]


def build_draft_cache_key(
    reply: dict[str, Any],
    context: dict[str, Any] | None = None,
    selected: dict[str, Any] | None = None,
) -> str:
    context = context or {}
    selected = selected or {}
    conversation_type = normalize_text_space(reply.get("conversationType", "") or context.get("conversationType", ""))
    group_sender = normalize_text_space(reply.get("groupSenderName", "") or context.get("groupSenderName", ""))
    group_message = normalize_text_space(reply.get("groupMessageText", "") or context.get("groupMessageText", ""))
    aggregated_incoming = normalize_text_space(
        reply.get("aggregatedIncomingText", "") or context.get("aggregatedIncomingText", "")
    )
    latest_incoming = aggregated_incoming or normalize_text_space(
        group_message if conversation_type == "group" and group_message else reply.get("latestIncomingText", "")
    )
    header_name = normalize_text_space(
        reply.get("headerName", "") or reply.get("selectedNickname", "") or selected.get("nickname", "") or ""
    )
    selected_summary = normalize_text_space(
        reply.get("selectedSummary", "") or context.get("selectedSummary", "") or selected.get("summary", "") or ""
    )
    identity = " | ".join(part for part in [group_sender, latest_incoming or selected_summary] if part)
    if not header_name or not identity:
        return ""
    return f"{header_name} | {identity}"[:240]
