from __future__ import annotations

import re
from dataclasses import dataclass
from typing import Any


def _text(value: Any, limit: int = 240) -> str:
    return re.sub(r"\s+", " ", str(value or "")).strip()[:limit]


def _int(value: Any, default: int = -1) -> int:
    try:
        return int(value)
    except Exception:
        return default


def _reply_to_name(content: str) -> str:
    match = re.match(r"^\s*回复\s+(.{1,40}?)[：:]\s*", str(content or ""))
    return _text(match.group(1), 80) if match else ""


@dataclass(frozen=True)
class CommentScopeConfig:
    reply_top_unreplied: bool = True
    reply_original_user_followup_after_author: bool = True
    reply_direct_reply_to_author: bool = True
    reply_third_party_followup: bool = False
    reply_user_to_user_chat: bool = False
    prefer_latest_relevant_message_only: bool = True

    @classmethod
    def from_robot(cls, *, comment_reply_mode: str = "", raw: dict[str, Any] | None = None) -> "CommentScopeConfig":
        raw = raw or {}
        scope = raw.get("comment_reply_scope") if isinstance(raw.get("comment_reply_scope"), dict) else {}
        mode = _text(comment_reply_mode or raw.get("commentReplyMode") or "", 64).upper()
        if mode == "ALL_UNREPLIED":
            base = {
                "reply_top_unreplied": True,
                "reply_original_user_followup_after_author": True,
                "reply_direct_reply_to_author": True,
                "reply_third_party_followup": True,
                "reply_user_to_user_chat": True,
                "prefer_latest_relevant_message_only": True,
            }
        else:
            base = {
                "reply_top_unreplied": True,
                "reply_original_user_followup_after_author": True,
                "reply_direct_reply_to_author": True,
                "reply_third_party_followup": False,
                "reply_user_to_user_chat": False,
                "prefer_latest_relevant_message_only": True,
            }
        for key in list(base.keys()):
            if key in scope:
                base[key] = bool(scope.get(key))
        return cls(**base)


def normalize_thread_messages(thread: dict[str, Any]) -> list[dict[str, Any]]:
    if not isinstance(thread, dict):
        return []
    thread_key = _text(thread.get("threadKey"), 320)
    top_author = _text(thread.get("author"), 120)
    confirmed_author = _text(thread.get("confirmedAuthorName"), 120)
    top = {
        "level": "top",
        "index": -1,
        "author": top_author,
        "content": _text(thread.get("content"), 500),
        "timeText": _text(thread.get("timeText"), 80),
        "isAuthor": bool(thread.get("isAuthor")),
        "replyButtonFound": bool(thread.get("replyButtonFound", False)),
        "replyButtonHint": _text(thread.get("replyButtonHint"), 180),
        "parentThreadKey": thread_key,
        "messageKey": _text(thread.get("messageKey"), 360) or f"{thread_key}|top|-1|{top_author}|{_text(thread.get('timeText'), 80)}|{_text(thread.get('content'), 100)}",
    }
    nested = thread.get("nestedReplies")
    if not isinstance(nested, list):
        nested = thread.get("nestedReplySamples") if isinstance(thread.get("nestedReplySamples"), list) else []
    messages = [top]
    for idx, raw in enumerate(nested):
        if not isinstance(raw, dict):
            continue
        msg = dict(raw)
        msg["level"] = _text(msg.get("level") or "nested", 24)
        msg["index"] = _int(msg.get("index"), idx)
        msg["author"] = _text(msg.get("author"), 120)
        msg["content"] = _text(msg.get("content"), 500)
        msg["timeText"] = _text(msg.get("timeText"), 80)
        msg["isAuthor"] = bool(msg.get("isAuthor"))
        msg["replyButtonFound"] = bool(msg.get("replyButtonFound", thread.get("replyButtonFound", False)))
        msg["replyButtonHint"] = _text(msg.get("replyButtonHint") or thread.get("replyButtonHint"), 180)
        msg["parentThreadKey"] = _text(msg.get("parentThreadKey") or thread_key, 320)
        msg["messageKey"] = _text(msg.get("messageKey"), 360) or f"{thread_key}|nested|{msg['index']}|{msg['author']}|{msg['timeText']}|{msg['content'][:100]}"
        messages.append(msg)
    out: list[dict[str, Any]] = []
    for timeline_index, msg in enumerate(messages):
        content = _text(msg.get("content"), 500)
        if not content and not _text(msg.get("author"), 120):
            continue
        reply_to = _reply_to_name(content)
        author = _text(msg.get("author"), 120)
        is_author = bool(msg.get("isAuthor"))
        is_top_author = bool(author and top_author and author == top_author and not is_author)
        is_third_party = bool(author and top_author and author != top_author and not is_author)
        reply_to_is_author = bool(reply_to and confirmed_author and reply_to == confirmed_author)
        role = "author" if is_author else "top_author" if is_top_author else "third_party" if is_third_party else "unknown_user"
        out.append({
            **msg,
            "timelineIndex": timeline_index,
            "topAuthor": top_author,
            "confirmedAuthorName": confirmed_author,
            "replyToName": reply_to,
            "replyToIsAuthor": reply_to_is_author,
            "isTopAuthor": is_top_author,
            "isThirdParty": is_third_party,
            "role": role,
        })
    return out


def decide_thread_candidate(thread: dict[str, Any], config: CommentScopeConfig) -> tuple[dict[str, Any] | None, list[dict[str, Any]]]:
    decisions: list[dict[str, Any]] = []
    if not isinstance(thread, dict):
        return None, decisions
    thread_key = _text(thread.get("threadKey"), 320)
    if bool(thread.get("hasCollapsedReplies")):
        decisions.append({"threadKey": thread_key, "decision": "exclude", "reason": "collapsed_replies_pending"})
        return None, decisions
    messages = normalize_thread_messages(thread)
    effective = [msg for msg in messages if _text(msg.get("content"), 500)]
    if not effective:
        decisions.append({"threadKey": thread_key, "decision": "exclude", "reason": "empty_thread"})
        return None, decisions
    author_indexes = [_int(msg.get("timelineIndex")) for msg in effective if bool(msg.get("isAuthor"))]
    last_author_index = max(author_indexes) if author_indexes else -1
    top = effective[0]
    if last_author_index < 0:
        include = bool(config.reply_top_unreplied and not bool(top.get("isAuthor")) and _text(top.get("content"), 500))
        decisions.append({
            "threadKey": thread_key,
            "topAuthor": top.get("topAuthor", ""),
            "messageAuthor": top.get("author", ""),
            "replyTo": "",
            "role": top.get("role", ""),
            "afterAuthorReply": False,
            "directToAuthor": False,
            "decision": "include" if include else "exclude",
            "reason": "top_user_without_author_reply" if include else "top_reply_disabled_or_author",
        })
        if include:
            candidate = dict(top)
            candidate["replyNeedReason"] = "top_user_without_author_reply"
            return candidate, decisions
        return None, decisions
    related: list[tuple[dict[str, Any], str]] = []
    for msg in effective:
        if bool(msg.get("isAuthor")):
            continue
        idx = _int(msg.get("timelineIndex"))
        if idx <= last_author_index:
            continue
        direct = bool(msg.get("replyToIsAuthor"))
        role = _text(msg.get("role"), 40)
        reason = ""
        include = False
        if role == "top_author" and config.reply_original_user_followup_after_author:
            include = True
            reason = "original_user_followup_after_author"
        elif direct and config.reply_direct_reply_to_author:
            include = True
            reason = "direct_reply_to_author"
        elif role == "third_party" and config.reply_third_party_followup:
            include = True
            reason = "third_party_followup_after_author"
        elif role not in {"top_author", "author"} and config.reply_user_to_user_chat:
            include = True
            reason = "user_to_user_chat_after_author"
        else:
            reason = "third_party_or_user_chat_not_allowed" if role == "third_party" else "not_relevant_after_author"
        decisions.append({
            "threadKey": thread_key,
            "topAuthor": msg.get("topAuthor", ""),
            "messageAuthor": msg.get("author", ""),
            "replyTo": msg.get("replyToName", ""),
            "role": role,
            "afterAuthorReply": True,
            "directToAuthor": direct,
            "decision": "include" if include else "exclude",
            "reason": reason,
        })
        if include:
            related.append((msg, reason))
    if not related:
        return None, decisions
    target, reason = related[-1] if config.prefer_latest_relevant_message_only else related[0]
    candidate = dict(target)
    candidate["replyNeedReason"] = reason
    return candidate, decisions


def apply_candidate_scope(top_comments: list[Any], *, comment_reply_mode: str = "", config: dict[str, Any] | None = None) -> tuple[list[dict[str, Any]], list[dict[str, Any]], list[dict[str, Any]]]:
    scope = CommentScopeConfig.from_robot(comment_reply_mode=comment_reply_mode, raw=config or {})
    updated: list[dict[str, Any]] = []
    all_decisions: list[dict[str, Any]] = []
    candidates: list[dict[str, Any]] = []
    for raw in top_comments or []:
        if not isinstance(raw, dict):
            continue
        item = dict(raw)
        target, decisions = decide_thread_candidate(item, scope)
        all_decisions.extend(decisions)
        if target:
            item["replyTargetMessage"] = target
            item["replyNeedReason"] = _text(target.get("replyNeedReason"), 80)
            candidates.append(item)
        else:
            item["replyTargetMessage"] = {}
            item["replyNeedReason"] = ""
        updated.append(item)
    return updated, candidates, all_decisions
