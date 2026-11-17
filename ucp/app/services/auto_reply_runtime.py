from __future__ import annotations

from datetime import datetime
import json
import re
from typing import Any

from app.models import Account


def normalize_text(value: Any, limit: int = 4000) -> str:
    return re.sub(r"\s+", " ", str(value or "")).strip()[:limit]


def current_time_text() -> str:
    return datetime.now().strftime("%Y-%m-%d %H:%M:%S")


def normalize_comment_time_text(value: Any) -> str:
    """Convert Douyin UI time text to backend-friendly yyyy-mm-dd HH:mm:ss."""
    raw = normalize_text(value, 120)
    if not raw:
        return current_time_text()

    iso = raw.replace("T", " ").replace("Z", "").strip()
    if re.match(r"^\d{4}-\d{1,2}-\d{1,2}\s+\d{1,2}:\d{2}(:\d{2})?$", iso):
        if len(iso.split(":")) == 2:
            iso = f"{iso}:00"
        try:
            dt = datetime.strptime(iso, "%Y-%m-%d %H:%M:%S")
            return dt.strftime("%Y-%m-%d %H:%M:%S")
        except Exception:
            pass

    m = re.search(r"(?P<month>\d{1,2})\s*月\s*(?P<day>\d{1,2})\s*日\s*(?P<hour>\d{1,2})\s*:\s*(?P<minute>\d{2})(?:\s*:\s*(?P<second>\d{2}))?", raw)
    if m:
        now = datetime.now()
        try:
            dt = datetime(
                now.year,
                int(m.group("month")),
                int(m.group("day")),
                int(m.group("hour")),
                int(m.group("minute")),
                int(m.group("second") or 0),
            )
            return dt.strftime("%Y-%m-%d %H:%M:%S")
        except Exception:
            return current_time_text()

    m = re.search(r"(?P<prefix>今天|昨日|昨天)\s*(?P<hour>\d{1,2})\s*:\s*(?P<minute>\d{2})(?:\s*:\s*(?P<second>\d{2}))?", raw)
    if m:
        from datetime import timedelta
        base = datetime.now()
        if m.group("prefix") in {"昨日", "昨天"}:
            base = base - timedelta(days=1)
        try:
            dt = base.replace(
                hour=int(m.group("hour")),
                minute=int(m.group("minute")),
                second=int(m.group("second") or 0),
                microsecond=0,
            )
            return dt.strftime("%Y-%m-%d %H:%M:%S")
        except Exception:
            return current_time_text()

    return current_time_text()


def account_config(account: Account | None) -> dict[str, Any]:
    cfg = getattr(account, "config", {}) if account is not None else {}
    if isinstance(cfg, str):
        try:
            parsed = json.loads(cfg)
            return parsed if isinstance(parsed, dict) else {}
        except Exception:
            return {}
    return cfg if isinstance(cfg, dict) else {}


def module_auto_reply_config(account: Account | None, module: str) -> dict[str, Any]:
    cfg = account_config(account)

    # Canonical shape saved by PC backend:
    # config.autoReply.comment / config.autoReply.dm
    auto = cfg.get("autoReply") if isinstance(cfg.get("autoReply"), dict) else {}
    value = auto.get(module) if isinstance(auto.get(module), dict) else {}
    if value:
        return value

    aliases = {
        "comment": ("commentReply", "comment_reply", "COMMENT", "COMMENT_REPLY"),
        "dm": ("privateMessage", "private_message", "dmReply", "DM", "PRIVATE_MESSAGE"),
    }
    for key in aliases.get(module, ()):
        candidate = auto.get(key) if isinstance(auto, dict) else None
        if isinstance(candidate, dict):
            return candidate

    # Compatibility: some API details may expose the module config directly
    # on config.comment / config.dm or return an auto-reply setting object.
    for key in (module, *aliases.get(module, ())):
        candidate = cfg.get(key) if isinstance(cfg.get(key), dict) else None
        if isinstance(candidate, dict):
            return candidate

    if cfg.get("promptConfigId") or isinstance(cfg.get("promptSnapshot"), dict):
        raw_module = normalize_text(cfg.get("module"), 32).lower()
        if not raw_module or raw_module == module or (module == "comment" and raw_module == "comment_reply") or (module == "dm" and raw_module in {"private_message", "dm"}):
            return cfg

    return {}


def prompt_snapshot(account: Account | None, module: str) -> dict[str, Any]:
    setting = module_auto_reply_config(account, module)
    value = setting.get("promptSnapshot")
    return value if isinstance(value, dict) else {}


def auto_reply_provider(account: Account | None, module: str) -> str:
    setting = module_auto_reply_config(account, module)
    binding = setting.get("aiBinding") if isinstance(setting.get("aiBinding"), dict) else {}
    provider = normalize_text(binding.get("provider"), 32).upper()
    return provider if provider in {"DEEPSEEK", "COZE"} else "COZE"


def build_runtime_payload_base(account: Account | None, module: str) -> dict[str, Any]:
    snapshot = prompt_snapshot(account, module)
    if auto_reply_provider(account, module) != "DEEPSEEK":
        return build_prompt_payload_from_snapshot(snapshot, module)
    payload: dict[str, Any] = {}
    # maxMsgCount is retained only as the legacy context-window compatibility value.
    # Prompt text, positioning, business profile and wording fields are not sent to normal DeepSeek.
    if module == "dm" and snapshot.get("maxMsgCount") not in (None, ""):
        payload["maxMsgCount"] = snapshot.get("maxMsgCount")
    return payload


def comment_reply_mode(account: Account | None) -> str:
    setting = module_auto_reply_config(account, "comment")
    return normalize_text(setting.get("commentReplyMode") or "ALL_UNREPLIED", limit=64) or "ALL_UNREPLIED"


def comment_reply_dataset_id(account: Account | None) -> str:
    setting = module_auto_reply_config(account, "comment")
    return normalize_text(setting.get("replyDatasetId"), limit=128)


def dm_use_conversation_context(account: Account | None) -> bool:
    setting = module_auto_reply_config(account, "dm")
    return bool(setting.get("useConversationContext", True))


def dm_first_reply_contents(account: Account | None) -> list[str]:
    setting = module_auto_reply_config(account, "dm")
    if not bool(setting.get("enableFirstReply", False)):
        return []
    raw = setting.get("firstReplyContents")
    if not isinstance(raw, list):
        return []
    return [normalize_text(item, limit=500) for item in raw if normalize_text(item, limit=500)]


def build_prompt_payload_from_snapshot(snapshot: dict[str, Any], module: str) -> dict[str, Any]:
    extra = snapshot.get("extraParams") if isinstance(snapshot.get("extraParams"), dict) else {}
    payload: dict[str, Any] = {
        "promptConfigId": normalize_text(snapshot.get("id"), 128) or None,
        "customSystemPrompt": snapshot.get("customSystemPrompt"),
        "customUserPrompt": snapshot.get("customUserPrompt"),
        "forbiddenWords": snapshot.get("forbiddenWords"),
        "requiredWords": snapshot.get("requiredWords"),
        "replyStyle": snapshot.get("replyStyle"),
        "platform": snapshot.get("platformLabel"),
        "accountPositioning": snapshot.get("accountPositioning"),
        "businessProfile": snapshot.get("businessProfile"),
        "replyLength": snapshot.get("replyLength"),
        "safetyPolicy": snapshot.get("safetyPolicy"),
    }
    if module == "comment":
        payload.update({
            "postContext": extra.get("POST_CONTEXT", ""),
            "commentGoal": snapshot.get("goal"),
            "commentPolicy": snapshot.get("policy"),
        })
    else:
        payload.update({
            "conversionGoal": snapshot.get("goal"),
            "contactPolicy": snapshot.get("policy"),
            "maxMsgCount": snapshot.get("maxMsgCount"),
        })
    return {k: v for k, v in payload.items() if v not in (None, "")}


def build_comment_test_payload(
    account: Account | None,
    user_input: str,
    *,
    comment_thread_id: str = "",
    thread_context: list[dict[str, Any]] | None = None,
    context_source: str = "",
) -> dict[str, Any]:
    payload = build_runtime_payload_base(account, "comment")
    clean_context: list[dict[str, Any]] = []
    for item in list(thread_context or [])[:10]:
        if not isinstance(item, dict):
            continue
        content = normalize_text(item.get("content"), 1000)
        if not content:
            continue
        role = normalize_text(item.get("role"), 24).lower()
        clean_context.append({
            "role": "account" if role == "account" else "user",
            "author": normalize_text(item.get("author"), 128),
            "content": content,
            "level": max(1, min(9, int(item.get("level") or 1))),
            "messageId": normalize_text(item.get("messageId"), 256),
        })
    payload.update({
        "robotId": getattr(account, "id", "") or None,
        "datasetId": comment_reply_dataset_id(account) or None,
        "userInput": normalize_text(user_input, 2000),
        "commentThreadId": normalize_text(comment_thread_id, 256) or None,
        "threadContext": clean_context or None,
        "contextSource": normalize_text(context_source, 64) or None,
    })
    return {k: v for k, v in payload.items() if v not in (None, "")}


def build_dm_test_payload(
    account: Account | None,
    message_content: str,
    *,
    conversation_id: str = "",
    dialogue_conversation_id: str = "",
    current_client_message_ids: list[str] | None = None,
) -> dict[str, Any]:
    payload = build_runtime_payload_base(account, "dm")
    use_context = dm_use_conversation_context(account)
    payload.update({
        "robotId": getattr(account, "id", "") or None,
        "messageContent": normalize_text(message_content, 2000),
        "useConversationContext": use_context,
        "conversationId": conversation_id if use_context and conversation_id else None,
        "dialogueConversationId": dialogue_conversation_id if use_context and dialogue_conversation_id else None,
        "currentClientMessageIds": list(current_client_message_ids or []) if use_context and current_client_message_ids else None,
    })
    return {k: v for k, v in payload.items() if v not in (None, "")}


def intent_label(intent_level: str) -> str:
    mapping = {
        "none": "完全无意向",
        "low": "低意向",
        "medium": "中意向",
        "high": "高意向",
    }
    return mapping.get(normalize_text(intent_level, 32).lower(), "完全无意向")


def auto_reply_backend_enabled(account: Account | None, module: str) -> bool:
    setting = module_auto_reply_config(account, module)
    snapshot = setting.get("promptSnapshot")
    binding = setting.get("aiBinding") if isinstance(setting.get("aiBinding"), dict) else {}
    provider = normalize_text(binding.get("provider"), 32).upper()
    account_profile_id = normalize_text(binding.get("accountProfileId"), 128)
    return bool(
        setting.get("promptConfigId")
        or (isinstance(snapshot, dict) and bool(snapshot))
        or provider in {"COZE", "DEEPSEEK"}
        or account_profile_id
    )


def auto_reply_config_summary(account: Account | None, module: str) -> dict[str, Any]:
    setting = module_auto_reply_config(account, module)
    snapshot = setting.get("promptSnapshot")
    binding = setting.get("aiBinding") if isinstance(setting.get("aiBinding"), dict) else {}
    return {
        "module": module,
        "backendEnabled": auto_reply_backend_enabled(account, module),
        "provider": normalize_text(binding.get("provider"), 32).upper(),
        "normalDeepSeekUsesLegacyPrompt": normalize_text(binding.get("provider"), 32).upper() != "DEEPSEEK",
        "hasAccountProfileId": bool(normalize_text(binding.get("accountProfileId"), 128)),
        "hasPromptConfigId": bool(normalize_text(setting.get("promptConfigId"), 128)),
        "hasPromptSnapshot": isinstance(snapshot, dict) and bool(snapshot),
        "datasetId": normalize_text(setting.get("replyDatasetId"), 128),
        "commentReplyMode": normalize_text(setting.get("commentReplyMode") or "ALL_UNREPLIED", 64) if module == "comment" else "",
        "enableFirstReply": bool(setting.get("enableFirstReply")) if module == "dm" else False,
        "firstReplyCount": len(setting.get("firstReplyContents") or []) if module == "dm" and isinstance(setting.get("firstReplyContents"), list) else 0,
        "useConversationContext": dm_use_conversation_context(account) if module == "dm" else False,
    }


def merge_auto_reply_setting_into_account(account: Account | None, module: str, setting: dict[str, Any] | None) -> None:
    if account is None or not isinstance(setting, dict):
        return
    cfg = account_config(account)
    auto = cfg.get("autoReply") if isinstance(cfg.get("autoReply"), dict) else {}
    normalized = dict(setting)
    normalized.pop("id", None)
    normalized.pop("robotId", None)
    normalized.pop("tenantId", None)
    normalized.pop("createdAt", None)
    normalized.pop("updatedAt", None)
    normalized["module"] = module
    auto[module] = normalized
    cfg["autoReply"] = auto
    try:
        account.config = cfg
    except Exception:
        pass
