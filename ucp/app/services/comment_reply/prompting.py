from __future__ import annotations

import re
from typing import Any

from app.services.dm_reply.prompting import normalize_text, sanitize_model_reply


def collect_comment_context(context: dict[str, Any]) -> dict[str, Any]:
    target = context.get("target", {}) if isinstance(context.get("target"), dict) else {}
    thread = context.get("thread", {}) if isinstance(context.get("thread"), dict) else {}
    nested = thread.get("nestedReplySamples", []) if isinstance(thread.get("nestedReplySamples"), list) else []
    nested_lines: list[str] = []
    for item in nested[:4]:
        if not isinstance(item, dict):
            continue
        author = normalize_text(item.get("author", "")) or "某用户"
        content = normalize_text(item.get("content", ""))
        if not content:
            continue
        prefix = "作者回复" if bool(item.get("isAuthor")) else f"{author}回复"
        nested_lines.append(f"{prefix}：{content}")
    return {
        "work_title": normalize_text(context.get("workTitle", "")),
        "work_meta": normalize_text(context.get("workMeta", "")),
        "author": normalize_text(target.get("author", "") or thread.get("author", "")),
        "comment": normalize_text(target.get("content", "") or thread.get("content", "")),
        "comment_time": normalize_text(thread.get("timeText", "")),
        "nested_lines": nested_lines,
        "audience_filter": normalize_text(context.get("audienceFilterText", "")),
        "comment_filter": normalize_text(context.get("commentFilterText", "")),
        "sort_text": normalize_text(context.get("sortText", "")),
    }



def build_system_prompt(config: dict[str, Any], robot_name: str) -> str:
    identity = normalize_text(config.get("identity", ""))
    style = normalize_text(config.get("style_prompt", ""))
    safety = normalize_text(config.get("safety_prompt", ""))
    role_name = normalize_text(robot_name) or "账号本人"
    return (
        f"{identity}\n"
        f"当前账号身份：{role_name}。\n"
        f"{style}\n"
        f"{safety}\n"
        "这是公开评论区回复，不是私信。你是作品发布账号本人或账号运营者，不是旁观网友。"
        "强约束：直接回应用户评论本身，像账号主人顺手回一句。"
        "事实边界：只使用作品标题和评论线程明确出现的信息；地点、拍摄方式、设备、价格、开放时间、效果等没有依据时不得猜测或装作确定。"
        "身份和确定性必须前后一致：不能先说不知道，后面又无依据肯定推荐；后续回复的确定程度不能高于已有上下文。"
        "不要客服腔，不要模板腔，不要销售导流，不要让对方私信你，不要说“感谢关注支持”这一类空话，除非上下文真的合适。"
        "优先 1 句话，必要时 2 句话；长度尽量控制在 6 到 28 个字，最多不超过 38 个字。"
        "只输出最终回复文本，不要解释，不要加引号，不要 markdown，不要分点。"
    )



def build_user_prompt(context: dict[str, Any]) -> str:
    info = collect_comment_context(context)
    lines = [
        "请根据下面的抖音评论上下文，写一条可以直接发布的中文评论回复。",
        f"作品标题：{info['work_title'] or '未识别'}",
        f"作品信息：{info['work_meta'] or '未识别'}",
        f"评论用户：{info['author'] or '未识别'}",
        f"用户评论：{info['comment'] or '未识别'}",
    ]
    if info["comment_time"]:
        lines.append(f"评论时间：{info['comment_time']}")
    if info["comment_filter"]:
        lines.append(f"当前评论筛选：{info['comment_filter']}")
    if info["audience_filter"]:
        lines.append(f"当前人群筛选：{info['audience_filter']}")
    if info["sort_text"]:
        lines.append(f"当前排序：{info['sort_text']}")
    if info["nested_lines"]:
        lines.append("该评论串里当前可见回复：")
        lines.extend([f"- {item}" for item in info["nested_lines"]])
    lines.extend([
        "要求：",
        "- 直接接用户这句评论，不要泛泛而谈。",
        "- 像真人评论区回复，简短自然一点。",
        "- 信息不够时可以轻轻反问一句，或自然说明暂时不确定，但不要连续追问。",
        "- 以作品账号主人身份回复，不要把自己说成路过网友。",
        "- 不要承诺或编造地点、拍摄方式、设备、发货、效果、价格、福利、私信联系等未给出的信息。",
        "- 回复的确定程度不能无依据高于前文。",
        "- 不要只回表情；除非上下文非常合适，也不要纯“哈哈哈”。",
    ])
    return "\n".join(lines)



def build_coze_prompt(config: dict[str, Any], context: dict[str, Any], robot_name: str) -> str:
    return f"{build_system_prompt(config, robot_name)}\n\n{build_user_prompt(context)}"



def sanitize_comment_reply(text: str) -> str:
    cleaned = sanitize_model_reply(text)
    cleaned = re.sub(r"^(评论回复[:：]\s*)", "", cleaned).strip()
    if len(cleaned) > 38:
        cleaned = cleaned[:38].rstrip("，,。；;：: ") + "。"
    return cleaned
