from __future__ import annotations

import re
from typing import Any


def normalize_text(value: Any, limit: int = 1000) -> str:
    return re.sub(r"\s+", " ", str(value or "")).strip()[:limit]


TRIVIAL_PHRASES = {
    "嗯", "哦", "噢", "好", "好的", "行", "可以", "ok", "收到", "知道了",
    "哈哈", "哈哈哈", "hhh", "666", "牛", "棒", "啊", "呀", "额", "…", "。。。",
}


def is_trivial_short_message(content: Any, threshold: int = 3) -> bool:
    text = normalize_text(content, 200).replace(" ", "")
    if not text:
        return True
    if text.lower() in {p.lower() for p in TRIVIAL_PHRASES}:
        return True
    if len(text) <= threshold:
        return True
    stripped = re.sub(r"[0-9a-zA-Z\u4e00-\u9fff]", "", text)
    return bool(stripped and len(stripped) == len(text))


def ts_value(node: dict[str, Any]) -> int:
    try:
        return int(float(node.get("commentCreatetime") or node.get("createTime") or node.get("ts") or 0))
    except Exception:
        return 0


def already_replied_by_me(comment: dict[str, Any], my_finder_username: str) -> bool:
    lv2 = comment.get("levelTwoComment") if isinstance(comment.get("levelTwoComment"), list) else []
    return any(isinstance(item, dict) and str(item.get("username") or "") == my_finder_username for item in lv2)


def pick_comment_reply_targets(roots: list[dict[str, Any]], my_finder_username: str) -> tuple[list[dict[str, Any]], list[dict[str, Any]]]:
    targets: list[dict[str, Any]] = []
    delayed: list[dict[str, Any]] = []
    for root in roots:
        if not isinstance(root, dict):
            continue
        root_id = normalize_text(root.get("commentId"), 128)
        if not root_id:
            continue
        lv2 = root.get("levelTwoComment") if isinstance(root.get("levelTwoComment"), list) else []
        thread = [root, *[item for item in lv2 if isinstance(item, dict)]]
        thread.sort(key=ts_value)
        last = thread[-1] if thread else root
        if not normalize_text(last.get("commentId"), 128):
            continue
        if str(last.get("username") or "") == my_finder_username:
            continue
        if is_trivial_short_message(last.get("commentContent")):
            delayed.append({"root": root, "target": last, "reason": "trivial_short_message"})
            continue
        has_me = any(str(node.get("username") or "") == my_finder_username for node in thread)
        if not has_me:
            targets.append({"root": root, "target": root, "reason": "root_without_author_reply"})
        else:
            targets.append({"root": root, "target": last, "reason": "followup_after_author_reply"})
    return targets, delayed


def message_from_wx_private(raw: dict[str, Any]) -> dict[str, Any]:
    from_username = normalize_text(raw.get("fromUsername"), 160)
    to_username = normalize_text(raw.get("toUsername"), 160)
    try:
        msg_type_code = int(raw.get("msgType") or 0)
    except Exception:
        msg_type_code = 0
    type_map = {
        1: ("text", ""),
        3: ("image", "[图片]"),
        34: ("voice", "[语音]"),
        43: ("video", "[视频]"),
        47: ("emoji", "[表情]"),
        49: ("card", "[卡片]"),
    }
    message_type, placeholder = type_map.get(msg_type_code, ("unknown", "[其他类型消息]"))
    text = normalize_text((raw.get("textMsg") or {}).get("content") if isinstance(raw.get("textMsg"), dict) else "", 2000)
    if message_type == "text" and not text:
        text = normalize_text(raw.get("rawContent"), 2000)
    if message_type == "text" and not text:
        message_type, placeholder = "unknown", "[其他类型消息]"
    if message_type != "text":
        text = ""
    session_id = normalize_text(raw.get("sessionId"), 180)
    msg_id = normalize_text(raw.get("svrMsgId") or raw.get("msgId") or raw.get("seq") or raw.get("cliMsgId"), 180)
    session_info = raw.get("_sessionInfo") if isinstance(raw.get("_sessionInfo"), dict) else {}
    nickname = normalize_text(session_info.get("nickname") or session_info.get("username") or from_username, 160)
    sender = "other" if from_username.startswith("fv") else "self"
    return {
        "sessionId": session_id,
        "msgId": msg_id,
        "fromUsername": from_username,
        "toUsername": to_username,
        "text": text,
        "messageType": message_type,
        "typePlaceholder": placeholder,
        "msgType": msg_type_code,
        "sender": sender,
        "nickname": nickname,
        "sessionType": raw.get("sessionType") or session_info.get("sessionType") or 0,
        "ts": raw.get("ts") or raw.get("createTime") or 0,
        "raw": raw,
    }

