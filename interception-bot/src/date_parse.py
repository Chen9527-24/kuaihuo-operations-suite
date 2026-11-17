from __future__ import annotations

import re
from datetime import datetime, timedelta, timezone
from typing import Optional

from dateutil import parser as date_parser


def now_local() -> datetime:
    return datetime.now().astimezone()


def parse_human_datetime(value: Optional[str], now: Optional[datetime] = None) -> Optional[datetime]:
    if not value:
        return None
    text = re.sub(r"\s+", " ", value).strip()
    if not text:
        return None

    now = now or now_local()

    lower = text.lower()
    if lower in {"yesterday", "昨天"}:
        return now - timedelta(days=1)
    if lower in {"the day before yesterday", "前天"}:
        return now - timedelta(days=2)

    m = re.search(r"(\d+)\s*分钟前", text)
    if m:
        return now - timedelta(minutes=int(m.group(1)))
    m = re.search(r"(\d+)\s*小时前", text)
    if m:
        return now - timedelta(hours=int(m.group(1)))
    m = re.search(r"(\d+)\s*天前", text)
    if m:
        return now - timedelta(days=int(m.group(1)))

    m = re.search(r"(\d+)\s*min(?:ute)?s?\s*ago", lower)
    if m:
        return now - timedelta(minutes=int(m.group(1)))
    m = re.search(r"(\d+)\s*h(?:our)?s?\s*ago", lower)
    if m:
        return now - timedelta(hours=int(m.group(1)))
    m = re.search(r"(\d+)\s*days?\s*ago", lower)
    if m:
        return now - timedelta(days=int(m.group(1)))

    cleaned = (
        text.replace("年", "-")
        .replace("月", "-")
        .replace("日", "")
        .replace("号", "")
        .replace("/", "-")
        .strip()
    )

    try:
        dt = date_parser.parse(cleaned, default=now.replace(month=1, day=1, hour=0, minute=0, second=0, microsecond=0))
        if not dt.tzinfo:
            dt = dt.replace(tzinfo=now.tzinfo or timezone.utc)
        return dt
    except Exception:
        pass

    m = re.match(r"(\d{1,2})-(\d{1,2})(?:\s+(\d{1,2}):(\d{2}))?", cleaned)
    if m:
        month = int(m.group(1))
        day = int(m.group(2))
        hour = int(m.group(3) or 0)
        minute = int(m.group(4) or 0)
        year = now.year
        try:
            dt = datetime(year, month, day, hour, minute, tzinfo=now.tzinfo)
            if dt > now + timedelta(days=1):
                dt = datetime(year - 1, month, day, hour, minute, tzinfo=now.tzinfo)
            return dt
        except ValueError:
            return None

    return None


_DURATION_PATTERNS = [
    re.compile(r"^(\d{1,2}):(\d{2})(?::(\d{2}))?$"),
    re.compile(r"(\d+)\s*小时"),
    re.compile(r"(\d+)\s*分钟"),
    re.compile(r"(\d+)\s*秒"),
]


def parse_duration_to_seconds(value: Optional[str]) -> Optional[int]:
    if not value:
        return None
    text = value.strip()
    if not text:
        return None

    m = _DURATION_PATTERNS[0].match(text)
    if m:
        if m.group(3) is not None:
            return int(m.group(1)) * 3600 + int(m.group(2)) * 60 + int(m.group(3))
        return int(m.group(1)) * 60 + int(m.group(2))

    hours = 0
    minutes = 0
    seconds = 0
    mh = _DURATION_PATTERNS[1].search(text)
    mm = _DURATION_PATTERNS[2].search(text)
    ms = _DURATION_PATTERNS[3].search(text)
    if mh:
        hours = int(mh.group(1))
    if mm:
        minutes = int(mm.group(1))
    if ms:
        seconds = int(ms.group(1))
    total = hours * 3600 + minutes * 60 + seconds
    return total or None
