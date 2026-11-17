from __future__ import annotations

import re
from typing import Any

from .config import DEFAULT_DM_REPLY_CONFIG


def normalize_text(value: Any) -> str:
    return re.sub(r"\s+", " ", str(value or "")).strip()


def collect_context(
    reply: dict[str, Any],
    *,
    context: dict[str, Any] | None = None,
    selected: dict[str, Any] | None = None,
) -> dict[str, Any]:
    context = context or {}
    selected = selected or {}
    conversation_type = normalize_text(reply.get("conversationType", "") or context.get("conversationType", ""))
    group_name = normalize_text(reply.get("groupName", "") or context.get("groupName", ""))
    group_sender = normalize_text(reply.get("groupSenderName", "") or context.get("groupSenderName", ""))
    group_message = normalize_text(reply.get("groupMessageText", "") or context.get("groupMessageText", ""))
    latest_incoming = normalize_text(group_message if conversation_type == "group" and group_message else reply.get("latestIncomingText", ""))
    selected_summary = normalize_text(
        reply.get("selectedSummary", "")
        or context.get("selectedSummary", "")
        or selected.get("summary", "")
    )
    latest_outgoing = normalize_text(reply.get("latestOutgoingText", ""))
    recent_left: list[str] = []
    for item in context.get("visibleBubbleSamples", []) or []:
        if not isinstance(item, dict):
            continue
        if normalize_text(item.get("side", "")) != "left":
            continue
        text = normalize_text(item.get("messageText", "") or item.get("text", ""))
        if text and text not in recent_left:
            recent_left.append(text)
    recent_left = recent_left[-3:]
    seed_parts = [part for part in [group_name, group_sender, latest_incoming, selected_summary, *recent_left, latest_outgoing] if part]
    return {
        "conversation_type": conversation_type,
        "group_name": group_name,
        "group_sender": group_sender,
        "group_message": group_message,
        "latest_incoming": latest_incoming,
        "selected_summary": selected_summary,
        "latest_outgoing": latest_outgoing,
        "recent_left": recent_left,
        "seed_text": " | ".join(seed_parts).strip(),
    }


def build_system_prompt(config: dict[str, Any], robot_name: str) -> str:
    identity = normalize_text(config.get("identity", DEFAULT_DM_REPLY_CONFIG["identity"]))
    style = normalize_text(config.get("style_prompt", DEFAULT_DM_REPLY_CONFIG["style_prompt"]))
    safety = normalize_text(config.get("safety_prompt", DEFAULT_DM_REPLY_CONFIG["safety_prompt"]))
    role_name = normalize_text(robot_name) or "账号本人"
    return (
        f"{identity}\n"
        f"你的当前身份名：{role_name}。\n"
        f"{style}\n"
        f"{safety}\n"
        "强约束：回复像熟人私聊，不要像客服、销售、机器人。不要出现“这边在线”“我来接住这条”“有需要你再喊我”“不清楚再追问我”“我继续接”这类模板腔。"
        "优先顺着对方最后一句直接接话，像正常聊天。可以短一点、随意一点、带一点哈哈/呀/呢，但不要连发感叹号，不要过度热情。"
        "输出要求：只输出最终回复文本，不要解释，不要加引号，不要用 markdown，不要分点。"
        "长度尽量控制在1句到2句，优先10到28字，最多不超过45字。"
    )


def build_user_prompt(reply: dict[str, Any], context: dict[str, Any], selected: dict[str, Any]) -> str:
    context_info = collect_context(reply, context=context, selected=selected)
    latest_incoming = str(context_info.get("latest_incoming", "") or "")
    header_name = normalize_text(reply.get("headerName", "") or selected.get("nickname", ""))
    selected_summary = str(context_info.get("selected_summary", "") or "")
    left_samples: list[str] = list(context_info.get("recent_left", []) or [])
    latest_outgoing = str(context_info.get("latest_outgoing", "") or "")
    conversation_type = str(context_info.get("conversation_type", "") or "")
    group_name = str(context_info.get("group_name", "") or "")
    group_sender = str(context_info.get("group_sender", "") or "")
    group_message = str(context_info.get("group_message", "") or latest_incoming or "")
    lines = [
        "请根据下面的私信上下文，写一条适合直接发送给用户的中文回复。",
    ]
    if conversation_type == "group":
        lines.extend([
            "当前聊天类型：群聊",
            f"群名：{group_name or header_name or '未识别'}",
            f"发送人：{group_sender or '未识别'}",
            f"消息正文：{group_message or '未识别'}",
        ])
    else:
        lines.extend([
            f"当前聊天对象：{header_name or '未识别'}",
            f"用户最新一句：{latest_incoming or '未识别'}",
        ])
    if selected_summary:
        lines.append(f"会话摘要：{selected_summary}")
    if left_samples:
        lines.append("最近用户消息：")
        lines.extend([f"- {item}" for item in left_samples])
    if latest_outgoing:
        lines.append(f"你上一句：{latest_outgoing}")
    lines.extend(
        [
            "要求：",
            "- 直接顺着对方最后一句接话，像朋友聊天。",
            "- 优先短句、口语、自然一点。",
            "- 不要客服腔，不要总结式收尾，不要教科书口吻。",
            "- 不要出现“这边”“收到啦”“有需要再找我”“我继续接”“不让你绕”这类模板句。",
            "- 信息不够时就轻轻追问一句。",
            "- 如果对方发的是表情/贴纸，也要回一句自然的话，不要空着。",
            "示例：对方：去干嘛了 -> 刚忙了会儿，回来啦哈哈；对方：你怎么回事 -> 哈哈别骂，我这次认真回你；对方：[表情] -> 哈哈这个表情有点东西啊",
        ]
    )
    return "\n".join(lines)


def build_coze_prompt(
    config: dict[str, Any],
    reply: dict[str, Any],
    context: dict[str, Any],
    selected: dict[str, Any],
    robot_name: str,
) -> str:
    return f"{build_system_prompt(config, robot_name)}\n\n{build_user_prompt(reply, context, selected)}"


def casualize_text(text: str) -> str:
    cleaned = normalize_text(text)
    replacements = {
        "这边在线": "我在呢",
        "收到啦": "看到了",
        "我来接住这条": "哈哈我来了",
        "你一句话我就往下给你接上": "你继续说就行",
        "有细节你再甩我，我继续接": "你继续说就行",
        "不清楚的地方再追问我就行": "你再说一句我就懂了",
        "我尽量回得接地气一点，不让你绕": "",
        "有需要你再喊我": "你再找我就行",
        "我继续接": "我接着聊",
    }
    for src, dst in replacements.items():
        cleaned = cleaned.replace(src, dst)
    cleaned = re.sub(r"(。|！|!|？|\?)\1+", r"\1", cleaned)
    cleaned = re.sub(r"~{2,}|～{2,}", "～", cleaned)
    return re.sub(r"\s+", " ", cleaned).strip(" ，,。；;：:")


def sanitize_model_reply(text: str) -> str:
    cleaned = str(text or "").replace("\r", " ").replace("\n", " ")
    cleaned = re.sub(r"`+", "", cleaned)
    cleaned = re.sub(r"^[\"'“”‘’]+|[\"'“”‘’]+$", "", cleaned.strip())
    cleaned = re.sub(r"\s+", " ", cleaned).strip()
    cleaned = re.sub(r"^(回复：|答：|建议回复：|可以回复：)", "", cleaned).strip()
    if any(token in cleaned.lower() for token in ["作为ai", "language model", "无法访问", "不能协助"]):
        return ""
    cleaned = re.sub(r"reasoning_content\s*[:：].*$", "", cleaned, flags=re.IGNORECASE)
    cleaned = casualize_text(cleaned)
    if len(cleaned) < 2:
        return ""
    if len(cleaned) > 45:
        cleaned = cleaned[:45].rstrip("，,。；;：: ") + "。"
    return cleaned
