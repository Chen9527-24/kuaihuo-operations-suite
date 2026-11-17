from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime, timedelta, timezone
import hashlib
import json
import re
from typing import Any
from zoneinfo import ZoneInfo, ZoneInfoNotFoundError

# Importing tzdata explicitly lets PyInstaller discover its IANA timezone files on Windows.
try:
    import tzdata as _tzdata  # type: ignore[import-not-found]  # noqa: F401
except ImportError:  # pragma: no cover - Linux/macOS may use the system timezone database.
    _tzdata = None

DEFAULT_BUSINESS_TIMEZONE = "Asia/Shanghai"
MAX_TEXT_LENGTH = 20000

FORBIDDEN_KEY_PARTS = {
    "authorization",
    "cookie",
    "cookies",
    "token",
    "accesstoken",
    "refreshtoken",
    "session",
    "sessiondata",
    "password",
    "passwd",
    "验证码",
    "verificationcode",
    "localstorage",
    "browserprofile",
    "profilepath",
    "html",
    "dom",
    "screenshot",
    "downloadurl",
    "attachmenturl",
    "rawpayload",
    "rawresponse",
    "headers",
}

ALLOWED_MESSAGE_TYPES = {
    "text",
    "image",
    "voice",
    "video",
    "file",
    "emoji",
    "link",
    "card",
    "system",
    "unsupported",
    "unknown",
}

MESSAGE_TYPE_PLACEHOLDERS = {
    "image": "[图片]",
    "voice": "[语音]",
    "video": "[视频]",
    "file": "[文件]",
    "emoji": "[表情]",
    "link": "[链接]",
    "card": "[卡片]",
    "unsupported": "[其他类型消息]",
    "unknown": "[其他类型消息]",
}


@dataclass(frozen=True, slots=True)
class NormalizedTime:
    source_time_raw: str
    source_timestamp_raw: str
    source_time_utc: str
    observed_at_utc: str
    first_observed_at_utc: str
    last_observed_at_utc: str
    time_accuracy: str
    source_timezone: str
    business_timezone: str
    time_parser_version: str = "1"

    def as_dict(self) -> dict[str, str]:
        return {
            "source_time_raw": self.source_time_raw,
            "source_timestamp_raw": self.source_timestamp_raw,
            "source_time_utc": self.source_time_utc,
            "observed_at_utc": self.observed_at_utc,
            "first_observed_at_utc": self.first_observed_at_utc,
            "last_observed_at_utc": self.last_observed_at_utc,
            "time_accuracy": self.time_accuracy,
            "source_timezone": self.source_timezone,
            "business_timezone": self.business_timezone,
            "time_parser_version": self.time_parser_version,
        }


def utc_now() -> datetime:
    return datetime.now(timezone.utc)


def iso_utc(value: datetime | None = None) -> str:
    dt = value or utc_now()
    if dt.tzinfo is None:
        dt = dt.replace(tzinfo=timezone.utc)
    return dt.astimezone(timezone.utc).isoformat(timespec="milliseconds").replace("+00:00", "Z")


def get_timezone(name: str | None) -> timezone | ZoneInfo:
    text = str(name or DEFAULT_BUSINESS_TIMEZONE).strip() or DEFAULT_BUSINESS_TIMEZONE
    try:
        return ZoneInfo(text)
    except ZoneInfoNotFoundError:
        # Asia/Shanghai is UTC+8 for all dates relevant to this application.
        if text == DEFAULT_BUSINESS_TIMEZONE:
            return timezone(timedelta(hours=8), name=DEFAULT_BUSINESS_TIMEZONE)
        return timezone.utc


def normalize_platform(value: Any) -> str:
    text = re.sub(r"[^A-Za-z0-9_]+", "_", str(value or "UNKNOWN").strip().upper())
    return text or "UNKNOWN"


def normalize_identifier(value: Any, *, max_length: int = 256) -> str:
    text = str(value or "").replace("\x00", "").strip()
    return text[:max_length]


def normalize_text(value: Any, *, max_length: int = MAX_TEXT_LENGTH) -> str:
    if value is None:
        return ""
    text = str(value).replace("\x00", "")
    text = text.replace("\r\n", "\n").replace("\r", "\n").strip()
    return text[:max_length]


def normalize_message_type(value: Any) -> str:
    text = str(value or "unknown").strip().lower()
    return text if text in ALLOWED_MESSAGE_TYPES else "unknown"


def normalize_message_content(message_type: Any, text: Any = "", placeholder: Any = "") -> dict[str, Any]:
    msg_type = normalize_message_type(message_type)
    clean_text = normalize_text(text)
    clean_placeholder = normalize_text(placeholder, max_length=64)
    if msg_type == "text":
        clean_placeholder = ""
    elif not clean_placeholder:
        clean_placeholder = MESSAGE_TYPE_PLACEHOLDERS.get(msg_type, "[其他类型消息]")
    has_text = bool(clean_text)
    has_non_text = msg_type != "text"
    analyzable = has_text and msg_type not in {"system", "unsupported", "unknown"}
    return {
        "message_type": msg_type,
        "text_content": clean_text,
        "type_placeholder": clean_placeholder,
        "has_text": int(has_text),
        "has_non_text": int(has_non_text),
        "is_semantically_analyzable": int(analyzable),
    }


def _normalized_key(value: Any) -> str:
    return re.sub(r"[^a-z0-9\u4e00-\u9fff]", "", str(value or "").lower())


def is_forbidden_key(key: Any) -> bool:
    normalized = _normalized_key(key)
    return any(part in normalized for part in FORBIDDEN_KEY_PARTS)


def sanitize_mapping(value: Any, *, allowed_keys: set[str] | None = None, max_depth: int = 3) -> dict[str, Any]:
    if not isinstance(value, dict):
        return {}

    def clean(item: Any, depth: int) -> Any:
        if depth > max_depth:
            return None
        if item is None or isinstance(item, (bool, int, float)):
            return item
        if isinstance(item, str):
            return normalize_text(item)
        if isinstance(item, (list, tuple)):
            return [clean(child, depth + 1) for child in item[:500]]
        if isinstance(item, dict):
            result: dict[str, Any] = {}
            for raw_key, raw_value in item.items():
                key = normalize_identifier(raw_key, max_length=128)
                if not key or is_forbidden_key(key):
                    continue
                if depth == 0 and allowed_keys is not None and key not in allowed_keys:
                    continue
                result[key] = clean(raw_value, depth + 1)
            return result
        return normalize_text(item)

    cleaned = clean(value, 0)
    return cleaned if isinstance(cleaned, dict) else {}


def stable_fingerprint(*parts: Any) -> str:
    payload = json.dumps([normalize_text(part) for part in parts], ensure_ascii=False, separators=(",", ":"))
    return hashlib.sha256(payload.encode("utf-8")).hexdigest()


def _parse_epoch(value: Any) -> datetime | None:
    if value in (None, ""):
        return None
    try:
        number = float(str(value).strip())
    except (TypeError, ValueError):
        return None
    if number > 100_000_000_000:
        number /= 1000.0
    if number < 1_000_000_000 or number > 10_000_000_000:
        return None
    try:
        return datetime.fromtimestamp(number, tz=timezone.utc)
    except (OverflowError, OSError, ValueError):
        return None


def _parse_absolute_text(text: str, source_tz: timezone | ZoneInfo, observed_local: datetime) -> tuple[datetime | None, str]:
    raw = text.strip()
    if not raw:
        return None, "unknown"

    iso_candidate = raw.replace("Z", "+00:00")
    try:
        parsed = datetime.fromisoformat(iso_candidate)
        if parsed.tzinfo is None:
            parsed = parsed.replace(tzinfo=source_tz)
        return parsed.astimezone(timezone.utc), "absolute_parsed"
    except ValueError:
        pass

    formats = (
        "%Y-%m-%d %H:%M:%S",
        "%Y-%m-%d %H:%M",
        "%Y/%m/%d %H:%M:%S",
        "%Y/%m/%d %H:%M",
        "%Y年%m月%d日 %H:%M:%S",
        "%Y年%m月%d日 %H:%M",
        "%Y-%m-%d",
        "%Y/%m/%d",
    )
    for fmt in formats:
        try:
            parsed = datetime.strptime(raw, fmt).replace(tzinfo=source_tz)
            return parsed.astimezone(timezone.utc), "absolute_parsed"
        except ValueError:
            continue

    month_day = re.fullmatch(r"\s*(\d{1,2})[-/.月](\d{1,2})(?:日)?(?:\s+(\d{1,2}):(\d{2})(?::(\d{2}))?)?\s*", raw)
    if month_day:
        month, day = int(month_day.group(1)), int(month_day.group(2))
        hour = int(month_day.group(3) or 0)
        minute = int(month_day.group(4) or 0)
        second = int(month_day.group(5) or 0)
        try:
            candidate = datetime(observed_local.year, month, day, hour, minute, second, tzinfo=source_tz)
        except ValueError:
            return None, "invalid"
        # A month/day value far in the future generally belongs to the previous year.
        if candidate - observed_local > timedelta(days=31):
            candidate = candidate.replace(year=candidate.year - 1)
        return candidate.astimezone(timezone.utc), "inferred_year"

    return None, "unknown"


def normalize_source_time(
    *,
    source_time_raw: Any = "",
    source_timestamp_raw: Any = "",
    observed_at: datetime | None = None,
    first_observed_at: datetime | None = None,
    last_observed_at: datetime | None = None,
    source_timezone: str = DEFAULT_BUSINESS_TIMEZONE,
    business_timezone: str = DEFAULT_BUSINESS_TIMEZONE,
    is_live_observation: bool = False,
) -> NormalizedTime:
    observed = observed_at or utc_now()
    if observed.tzinfo is None:
        observed = observed.replace(tzinfo=timezone.utc)
    observed = observed.astimezone(timezone.utc)
    first = first_observed_at or observed
    last = last_observed_at or observed
    if first.tzinfo is None:
        first = first.replace(tzinfo=timezone.utc)
    if last.tzinfo is None:
        last = last.replace(tzinfo=timezone.utc)

    raw_text = normalize_text(source_time_raw, max_length=256)
    raw_timestamp = normalize_text(source_timestamp_raw, max_length=128)
    source_tz = get_timezone(source_timezone)
    observed_local = observed.astimezone(source_tz)

    parsed = _parse_epoch(raw_timestamp)
    accuracy = "exact_platform" if parsed else "unknown"

    if parsed is None and raw_text:
        lowered = raw_text.lower()
        if raw_text in {"刚刚", "刚才", "现在"}:
            parsed = observed
            accuracy = "relative_parsed"
        else:
            minute_match = re.fullmatch(r"\s*(\d+)\s*分钟?前\s*", raw_text)
            hour_match = re.fullmatch(r"\s*(\d+)\s*小时?前\s*", raw_text)
            day_match = re.fullmatch(r"\s*(\d+)\s*天前\s*", raw_text)
            yesterday_match = re.fullmatch(r"\s*昨天(?:\s+(\d{1,2}):(\d{2}))?\s*", raw_text)
            if minute_match:
                parsed = observed - timedelta(minutes=int(minute_match.group(1)))
                accuracy = "relative_parsed"
            elif hour_match:
                parsed = observed - timedelta(hours=int(hour_match.group(1)))
                accuracy = "relative_parsed"
            elif day_match:
                parsed = observed - timedelta(days=int(day_match.group(1)))
                accuracy = "relative_parsed"
            elif yesterday_match:
                hour = int(yesterday_match.group(1) or observed_local.hour)
                minute = int(yesterday_match.group(2) or observed_local.minute)
                local = (observed_local - timedelta(days=1)).replace(hour=hour, minute=minute, second=0, microsecond=0)
                parsed = local.astimezone(timezone.utc)
                accuracy = "relative_parsed"
            else:
                parsed, accuracy = _parse_absolute_text(raw_text, source_tz, observed_local)
                if parsed is None and lowered in {"未知", "无", "--", "-"}:
                    accuracy = "unknown"

    if parsed is None and not raw_text and not raw_timestamp:
        accuracy = "live_observed" if is_live_observation else "unknown_history"

    return NormalizedTime(
        source_time_raw=raw_text,
        source_timestamp_raw=raw_timestamp,
        source_time_utc=iso_utc(parsed) if parsed else "",
        observed_at_utc=iso_utc(observed),
        first_observed_at_utc=iso_utc(first),
        last_observed_at_utc=iso_utc(last),
        time_accuracy=accuracy,
        source_timezone=str(source_timezone or DEFAULT_BUSINESS_TIMEZONE),
        business_timezone=str(business_timezone or DEFAULT_BUSINESS_TIMEZONE),
    )
