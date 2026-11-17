from __future__ import annotations

import json
import re
from datetime import datetime, timedelta
from typing import Any, Dict, Iterable, List, Optional
from urllib.parse import parse_qs, urlencode, urlparse, urlunparse


def safe_json_loads(text: Optional[str]) -> Any:
    if not text:
        return None
    try:
        return json.loads(text)
    except Exception:
        return None


def text_clean(value: Optional[Any]) -> Optional[str]:
    if value is None:
        return None
    cleaned = re.sub(r"\s+", " ", str(value)).strip()
    return cleaned or None



def _parse_ts_to_datetime(ts: Any) -> Optional[datetime]:
    """Normalize platform timestamp values to an aware local datetime.

    Supports seconds, milliseconds, microseconds, nanoseconds, and ISO-like
    strings. Returns None for empty/invalid values rather than raising.
    """
    if ts is None:
        return None
    try:
        raw = str(ts).strip()
        if not raw:
            return None
        if not raw.isdigit() and not (raw.startswith("-") and raw[1:].isdigit()):
            parsed = datetime.fromisoformat(raw.replace("Z", "+00:00"))
            if parsed.tzinfo is None:
                parsed = parsed.astimezone()
            return parsed.astimezone()

        value = int(raw)
        abs_value = abs(value)
        if abs_value >= 10**17:
            value = value // 1_000_000_000
        elif abs_value >= 10**14:
            value = value // 1_000_000
        elif abs_value >= 10**11:
            value = value // 1000
        return datetime.fromtimestamp(value).astimezone()
    except Exception:
        return None


def aweme_id_to_datetime(aweme_id: Any) -> Optional[datetime]:
    """Decode Douyin/TikTok snowflake-like aweme_id to creation time.

    Douyin video ids are normally snowflake-like integers where the high bits
    contain a Unix timestamp in seconds. This gives us a reliable fallback when
    the post-list API omits create_time or returns an inconsistent timestamp.
    """
    try:
        raw = str(aweme_id or "").strip()
        if not raw.isdigit():
            return None
        value = int(raw) >> 32
        parsed = datetime.fromtimestamp(value).astimezone()
        # Guard against treating unrelated numeric ids as timestamps.
        if parsed.year < 2016:
            return None
        if parsed > datetime.now().astimezone() + timedelta(days=3):
            return None
        return parsed
    except Exception:
        return None


def aweme_id_to_iso(aweme_id: Any) -> Optional[str]:
    parsed = aweme_id_to_datetime(aweme_id)
    return parsed.isoformat() if parsed else None

def ts_to_iso(ts: Any) -> Optional[str]:
    """Convert common platform timestamp values to ISO time."""
    parsed = _parse_ts_to_datetime(ts)
    return parsed.isoformat() if parsed else None


def parse_duration_any(raw: Any) -> Optional[int]:
    if raw is None:
        return None
    try:
        value = int(raw)
        if value > 1000:
            return value // 1000
        return value
    except Exception:
        return None


def build_url_with_overrides(template_url: str, overrides: Dict[str, Any]) -> str:
    parsed = urlparse(template_url)
    qs = parse_qs(parsed.query, keep_blank_values=True)
    for key, value in overrides.items():
        qs[key] = [str(value)]
    new_query = urlencode(qs, doseq=True)
    return urlunparse((parsed.scheme, parsed.netloc, parsed.path, parsed.params, new_query, parsed.fragment))


def extract_nested_value(obj: Any, candidate_keys: Iterable[str], depth: int = 0, max_depth: int = 6) -> Any:
    if depth > max_depth:
        return None
    if isinstance(obj, dict):
        for key in candidate_keys:
            if key in obj:
                return obj[key]
        for value in obj.values():
            found = extract_nested_value(value, candidate_keys, depth + 1, max_depth)
            if found is not None:
                return found
    elif isinstance(obj, list):
        for value in obj[:10]:
            found = extract_nested_value(value, candidate_keys, depth + 1, max_depth)
            if found is not None:
                return found
    return None


def extract_cursor(obj: Any) -> Any:
    return extract_nested_value(obj, ["max_cursor", "cursor", "offset"])


def extract_has_more(obj: Any) -> int:
    value = extract_nested_value(obj, ["has_more", "hasMore"])
    try:
        return int(value)
    except Exception:
        return 0


def detect_query_key(url: str, candidates: List[str], default: str) -> str:
    qs = parse_qs(urlparse(url).query, keep_blank_values=True)
    for key in candidates:
        if key in qs:
            return key
    return default
