from __future__ import annotations

import json
import os
import re
import time
import uuid
from datetime import datetime, timedelta
from pathlib import Path
from typing import Any, Dict, List, Optional, Tuple
from urllib.parse import parse_qs, urlencode, urljoin, urlparse, unquote

from playwright.sync_api import BrowserContext, Page, Response

from .api_utils import (
    aweme_id_to_iso,
    build_url_with_overrides,
    detect_query_key,
    extract_cursor,
    extract_has_more,
    extract_nested_value,
    parse_duration_any,
    safe_json_loads,
    text_clean,
    ts_to_iso,
)
from .date_parse import parse_human_datetime
from .models import ContentRecord, RunResult
from .pacing import CrawlPacingPolicy, sleep_seconds
from .storage import output_section_dir


POST_URL_HINTS = [
    # Keep this list intentionally broad. Douyin changes the desktop web
    # endpoint names frequently; relying only on /aweme/post caused valid
    # homepage post-list responses to be ignored on some accounts. The final
    # guard is still the JSON payload shape (aweme_list + cursor/has_more),
    # so broad URL matching is safe here.
    "/aweme/",
    "/web/aweme/",
    "/aweme/v1/web/",
    "/post",
    "/post/list",
    "/aweme/post",
    "/aweme/list",
    "/mix/aweme",
    "/video/",
]

POST_RESPONSE_KEYS = {
    "aweme_list",
    "aweme_id",
    "desc",
    "create_time",
    "video",
    "duration",
    "author",
    "has_more",
    "max_cursor",
}

TAB_TEXT_CANDIDATES = ["作品", "视频", "投稿", "Posts", "Videos"]
TAB_ROLE_CANDIDATES = ["作品", "视频", "Posts", "Videos"]
GUI_DOM_REQUEST_PREFIX = "[GUI_DOM_REQUEST]"



def recursive_has_post_shape(obj: Any, depth: int = 0, max_depth: int = 6) -> bool:
    if depth > max_depth:
        return False
    if isinstance(obj, dict):
        keys = {str(key) for key in obj.keys()}
        if {"aweme_list", "has_more"} <= keys or {"aweme_list", "max_cursor"} <= keys:
            return True
        if keys & POST_RESPONSE_KEYS:
            return True
        return any(recursive_has_post_shape(value, depth + 1, max_depth) for value in obj.values())
    if isinstance(obj, list):
        return any(recursive_has_post_shape(value, depth + 1, max_depth) for value in obj[:10])
    return False


def recursive_find_aweme_list(obj: Any, depth: int = 0, max_depth: int = 7) -> Optional[List[Dict[str, Any]]]:
    if depth > max_depth:
        return None
    if isinstance(obj, dict):
        aweme_list = obj.get("aweme_list")
        if isinstance(aweme_list, list):
            dict_items = [item for item in aweme_list if isinstance(item, dict)]
            if dict_items:
                return dict_items
        for value in obj.values():
            found = recursive_find_aweme_list(value, depth + 1, max_depth)
            if found is not None:
                return found
    elif isinstance(obj, list):
        for value in obj[:10]:
            found = recursive_find_aweme_list(value, depth + 1, max_depth)
            if found is not None:
                return found
    return None


def extract_sec_uid_from_url(url: str) -> Optional[str]:
    parsed = urlparse(url)
    qs = parse_qs(parsed.query, keep_blank_values=True)
    for key in ["sec_uid", "sec_user_id", "sec_userid"]:
        values = qs.get(key) or []
        if values and text_clean(values[0]):
            return text_clean(values[0])

    parts = [part for part in parsed.path.split("/") if part]
    if len(parts) >= 2 and parts[0] == "user":
        value = text_clean(parts[1])
        if value:
            return value
    return None


def extract_author_sec_uid(aweme: Dict[str, Any]) -> Optional[str]:
    author = aweme.get("author") or {}
    if isinstance(author, dict):
        for key in ["sec_uid", "sec_user_id", "sec_userid"]:
            value = text_clean(author.get(key))
            if value:
                return value
    return None


DOUYIN_VIDEO_ID_RE = re.compile(r"(?<!\d)(\d{15,25})(?!\d)")


def extract_video_id_from_url(url: str) -> Optional[str]:
    if not url:
        return None
    try:
        parsed = urlparse(url)
        qs = parse_qs(parsed.query, keep_blank_values=True)
        for key in ["modal_id", "vid", "video_id", "aweme_id", "item_id", "itemId"]:
            for value in qs.get(key) or []:
                cleaned = text_clean(value)
                if cleaned and cleaned.isdigit() and 15 <= len(cleaned) <= 25:
                    return cleaned

        parts = [part for part in parsed.path.split("/") if part]
        for idx, part in enumerate(parts):
            if part in {"video", "note", "share", "discover"} and idx + 1 < len(parts):
                candidate = text_clean(parts[idx + 1])
                if candidate and candidate.isdigit() and 15 <= len(candidate) <= 25:
                    return candidate
        for part in parts:
            candidate = text_clean(part)
            if candidate and candidate.isdigit() and 15 <= len(candidate) <= 25:
                return candidate
    except Exception:
        return None
    return None


def normalize_douyin_video_url(base_url: str, href: Any) -> Optional[str]:
    value = text_clean(href)
    if not value:
        return None
    try:
        absolute = urljoin(base_url, value)
        parsed = urlparse(absolute)
        if "douyin.com" not in parsed.netloc.lower():
            return None
        video_id = extract_video_id_from_url(absolute)
        if not video_id:
            return None
        return f"https://www.douyin.com/video/{video_id}"
    except Exception:
        return None


def extract_embedded_aweme_hints(text: str, limit: int = 160) -> List[Dict[str, Any]]:
    """Best-effort extraction from SSR/script payloads when XHR capture is unavailable.

    Douyin sometimes renders the first screen from an embedded state without a
    fresh xhr/fetch response. This parser intentionally extracts only minimal
    fields needed by the homepage lookback filter: id, nearby create_time and
    desc/caption hints. The input may be normal JSON, escaped JSON or
    URI-encoded RENDER_DATA text, so decoding is intentionally layered.
    """
    if not text:
        return []

    text_variants = [text]
    try:
        decoded = unquote(text)
        if decoded and decoded != text:
            text_variants.append(decoded)
    except Exception:
        pass

    found: List[Dict[str, Any]] = []
    seen: set[str] = set()

    def add(video_id: str, raw_time: Any, desc: Any, source: str) -> bool:
        video_id = text_clean(video_id)
        if not video_id or not video_id.isdigit() or not (15 <= len(video_id) <= 25):
            return False
        if video_id in seen:
            return False
        seen.add(video_id)
        found.append(
            {
                "video_id": video_id,
                "publish_time_raw": raw_time,
                "caption": text_clean(desc),
                "source": source,
            }
        )
        return len(found) >= limit

    for variant in text_variants:
        # Structured parse first. This is much less brittle than regex and catches
        # current Douyin script states such as RENDER_DATA / router data.
        parsed = safe_json_loads(variant)
        if parsed is not None:
            for item in recursive_extract_aweme_hints_from_obj(parsed, limit=limit - len(found)):
                if add(str(item.get("video_id") or ""), item.get("publish_time_raw"), item.get("caption"), item.get("source") or "embedded_json_state"):
                    return found

        patterns = [
            re.compile(r'(?:(?:aweme_id|awemeId|item_id|itemId)["\\]?\s*[:=]\s*["\\]?)(\d{15,25})'),
            re.compile(r'(?:/video/)(\d{15,25})'),
            re.compile(r'(?:modal_id|vid|video_id|aweme_id|item_id|itemId)[=:\"%]+(\d{15,25})'),
        ]
        for pattern in patterns:
            for match in pattern.finditer(variant):
                video_id = match.group(1)
                if video_id in seen:
                    continue
                start = max(0, match.start() - 1800)
                end = min(len(variant), match.end() + 1800)
                chunk = variant[start:end]
                raw_time: Any = None
                time_match = re.search(r'(?:(?:create_time|createTime|publish_time|publishTime|release_time|releaseTime)["\\]?\s*[:=]\s*["\\]?)(\d{10,13})', chunk)
                if time_match:
                    raw_time = time_match.group(1)
                desc = None
                desc_match = re.search(r'"(?:desc|caption|title)"\s*:\s*"([^"\\]*(?:\\.[^"\\]*)*)"', chunk)
                if desc_match:
                    try:
                        desc = json.loads('"' + desc_match.group(1) + '"')
                    except Exception:
                        desc = desc_match.group(1)
                if add(video_id, raw_time, desc, "embedded_state_regex"):
                    return found
    return found


def recursive_extract_aweme_hints_from_obj(obj: Any, limit: int = 160, depth: int = 0, max_depth: int = 9) -> List[Dict[str, Any]]:
    """Extract minimal work hints from already parsed page state JSON."""
    if limit <= 0 or depth > max_depth:
        return []
    found: List[Dict[str, Any]] = []
    seen: set[str] = set()

    def find_author_sec_uid(data: Dict[str, Any]) -> Optional[str]:
        author = data.get("author")
        if isinstance(author, dict):
            for key in ["sec_uid", "sec_user_id", "sec_userid"]:
                value = text_clean(author.get(key))
                if value:
                    return value
        for key in ["sec_uid", "sec_user_id", "sec_userid", "author_sec_uid", "authorSecUid"]:
            value = text_clean(data.get(key))
            if value:
                return value
        value = extract_nested_value(data, ["sec_uid", "sec_user_id", "sec_userid"], max_depth=3)
        return text_clean(value) or None

    def add_from_dict(data: Dict[str, Any], source: str) -> None:
        if len(found) >= limit:
            return
        video_id = ""
        for key in ["aweme_id", "awemeId", "aweme_id_str", "awemeIdStr", "item_id", "itemId", "id"]:
            candidate = text_clean(data.get(key))
            if candidate and candidate.isdigit() and 15 <= len(candidate) <= 25:
                video_id = candidate
                break
        if not video_id or video_id in seen:
            return
        seen.add(video_id)
        desc = None
        for key in ["desc", "caption", "title", "text"]:
            if data.get(key) not in (None, ""):
                desc = data.get(key)
                break
        found.append(
            {
                "video_id": video_id,
                "publish_time_raw": extract_publish_time_raw(data),
                "caption": text_clean(desc),
                "source": source,
                "author_sec_uid": find_author_sec_uid(data),
            }
        )

    def walk(value: Any, current_depth: int) -> None:
        if len(found) >= limit or current_depth > max_depth:
            return
        if isinstance(value, dict):
            if isinstance(value.get("aweme_list"), list):
                for item in value.get("aweme_list") or []:
                    if isinstance(item, dict):
                        add_from_dict(item, "embedded_json_aweme_list")
                        walk(item, current_depth + 1)
                        if len(found) >= limit:
                            return
            add_from_dict(value, "embedded_json_item")
            # Prioritize containers that often hold work cards, then do a bounded walk.
            priority_keys = ["post", "posts", "aweme", "awemeList", "aweme_list", "items", "data", "userPost"]
            keys = list(value.keys())
            keys.sort(key=lambda k: 0 if str(k) in priority_keys else 1)
            for key in keys[:80]:
                walk(value.get(key), current_depth + 1)
                if len(found) >= limit:
                    return
        elif isinstance(value, list):
            for item in value[:300]:
                walk(item, current_depth + 1)
                if len(found) >= limit:
                    return

    walk(obj, depth)
    return found


PUBLISH_TIME_KEYS = [
    "create_time",
    "createTime",
    "create_timestamp",
    "createTimestamp",
    "publish_time",
    "publishTime",
    "published_at",
    "publishedAt",
    "release_time",
    "releaseTime",
]


def extract_publish_time_raw(aweme: Dict[str, Any]) -> Any:
    for key in PUBLISH_TIME_KEYS:
        if aweme.get(key) not in (None, ""):
            return aweme.get(key)
    return extract_nested_value(aweme, PUBLISH_TIME_KEYS, max_depth=4)


def resolve_publish_time(aweme: Dict[str, Any], aweme_id: str) -> tuple[Any, Optional[str], str]:
    """Resolve publish time for a Douyin work.

    The platform API publish time is the primary source. The aweme_id decoded
    timestamp is only a fallback when the API time is missing or unparsable.
    We do not aggressively overwrite API time with aweme_id time, because some
    Douyin ids cannot be decoded reliably by the snowflake rule and that can
    make recent works look expired. The lookback filter will still inspect both
    sources and log the final decision.
    """
    raw_time = extract_publish_time_raw(aweme)
    api_iso = ts_to_iso(raw_time)
    id_iso = aweme_id_to_iso(aweme_id)

    if api_iso:
        return raw_time, api_iso, "web_post_api"
    if id_iso:
        return raw_time if raw_time is not None else aweme_id, id_iso, "aweme_id_timestamp_fallback"
    return raw_time, None, "web_post_api_missing"


def extract_aweme_id(aweme: Dict[str, Any]) -> str:
    for key in ["aweme_id", "awemeId", "aweme_id_str", "awemeIdStr", "id", "item_id", "itemId"]:
        value = text_clean(aweme.get(key))
        if value:
            return value
    value = extract_nested_value(aweme, ["aweme_id", "awemeId", "aweme_id_str", "item_id"], max_depth=3)
    return text_clean(value) or "unknown"


def map_aweme_to_content(platform: str, account_url: str, aweme: Dict[str, Any]) -> ContentRecord:
    aweme_id = extract_aweme_id(aweme)
    desc = text_clean(aweme.get("desc"))
    publish_time_raw, publish_time_iso, publish_time_source = resolve_publish_time(aweme, aweme_id)

    author = aweme.get("author") if isinstance(aweme.get("author"), dict) else {}
    author_nickname = text_clean(
        author.get("nickname")
        or author.get("name")
        or author.get("unique_id")
        or author.get("short_id")
        or author.get("custom_verify")
    )
    author_user_id = text_clean(
        author.get("sec_uid")
        or author.get("sec_user_id")
        or author.get("uid")
        or author.get("user_id")
        or author.get("id")
        or author.get("short_id")
    )

    duration_raw = None
    duration_sec = None
    video = aweme.get("video") or {}
    if isinstance(video, dict):
        duration_val = video.get("duration")
        duration_sec = parse_duration_any(duration_val)
        duration_raw = str(duration_sec) if duration_sec is not None else None

    return ContentRecord(
        platform=platform,
        source_account_url=account_url,
        source_content_url=f"https://www.douyin.com/video/{aweme_id}",
        platform_content_id=aweme_id,
        caption=desc,
        publish_time_raw=str(publish_time_raw) if publish_time_raw is not None else None,
        publish_time_iso=publish_time_iso,
        duration_raw=duration_raw,
        duration_sec=duration_sec,
        author_nickname=author_nickname or None,
        author_user_id=author_user_id or None,
        video_title=desc or None,
        comments=[],
        field_source={
            "caption": "web_post_api",
            "publish_time": publish_time_source,
            "duration": "web_post_api",
            "author": "web_post_api" if (author_nickname or author_user_id) else "",
        },
    )


class DouyinPostsAPICollector:
    def __init__(
        self,
        platform: str,
        context: BrowserContext | None,
        output_dir: Path,
        pacing_policy: CrawlPacingPolicy | None = None,
    ):
        if platform != "douyin":
            raise ValueError("当前 posts api collector 仅支持 douyin")
        self.platform = platform

        self.context = context
        self.output_dir = output_dir
        self.pacing = pacing_policy or CrawlPacingPolicy()

    def _collect_gui_workspace_dom_posts(
        self,
        homepage_url: str,
        max_posts: int,
        trigger_scroll_rounds: int,
        trigger_pause_sec: float,
        debug_dir: Path,
    ) -> Tuple[List[ContentRecord], Dict[str, Any]]:
        """Ask the GUI embedded WebView to extract the profile DOM.

        In GUI mode the visible right-side workspace is Qt WebEngine, while the
        collector process normally uses a separate Playwright browser. Headless
        Playwright can render Douyin's profile shell without mounting the real
        ``data-e2e=user-post-list`` grid, so DOM primary fails even though the
        GUI page is correct. This bridge keeps a single visible browser: the
        collector prints a request, the GUI navigates/scrolls its WebView and
        writes the extracted profile works to a JSON file, then the collector
        continues from that DOM result. Network/direct API remains a fallback.
        """
        debug: Dict[str, Any] = {
            "enabled": False,
            "reason": "not_gui_embedded_mode",
            "items": 0,
            "request_path": None,
        }
        if os.getenv("ACS_GUI_MODE") != "1" or os.getenv("ACS_DISABLE_EXTERNAL_BROWSER", "1") == "0":
            return [], debug

        debug["enabled"] = True
        debug["reason"] = "pending"
        request_id = uuid.uuid4().hex[:12]
        output_path = (debug_dir / f"gui_workspace_dom_{request_id}.json").resolve()
        debug["request_path"] = str(output_path)
        payload = {
            "request_id": request_id,
            "url": homepage_url,
            "output_path": str(output_path),
            "max_posts": max(int(max_posts or 0), 0),
            "scroll_rounds": max(self._resolve_trigger_scroll_rounds(trigger_scroll_rounds, max_posts), 4),
            "pause_ms": int(max(float(trigger_pause_sec or 0.8), 0.6) * 1000),
        }
        try:
            print(f"{GUI_DOM_REQUEST_PREFIX} {json.dumps(payload, ensure_ascii=False)}", flush=True)
        except Exception as exc:
            debug["reason"] = f"print_request_failed: {exc}"
            return [], debug

        timeout_sec = max(18.0, min(45.0, 10.0 + payload["scroll_rounds"] * 3.0 + payload["pause_ms"] / 1000.0))
        deadline = time.time() + timeout_sec
        data: Dict[str, Any] | None = None
        while time.time() < deadline:
            if output_path.exists():
                try:
                    loaded = json.loads(output_path.read_text(encoding="utf-8"))
                    if isinstance(loaded, dict):
                        data = loaded
                        break
                except Exception as exc:
                    debug["read_error"] = str(exc)
            sleep_seconds(0.25)

        if data is None:
            debug["reason"] = "timeout_waiting_gui_workspace_dom"
            return [], debug

        debug.update({
            "reason": data.get("reason") or ("ok" if data.get("ok") else "gui_workspace_dom_failed"),
            "ok": bool(data.get("ok")),
            "profile_count": data.get("profile_count"),
            "source": data.get("source"),
            "extract_debug": data.get("debug"),
        })
        raw_items = data.get("items") if isinstance(data.get("items"), list) else []
        limit = max(int(max_posts or 0), 0)
        collection_limit = limit if limit > 0 else 120
        records: List[ContentRecord] = []
        seen: set[str] = set()
        for raw in raw_items:
            if not isinstance(raw, dict):
                continue
            video_id = text_clean(raw.get("video_id")) or extract_video_id_from_url(str(raw.get("href") or raw.get("url") or ""))
            if not video_id or video_id in seen:
                continue
            seen.add(video_id)
            href = raw.get("href") or raw.get("url") or f"https://www.douyin.com/video/{video_id}"
            video_url = normalize_douyin_video_url(homepage_url, href) or f"https://www.douyin.com/video/{video_id}"
            caption = text_clean(raw.get("caption") or raw.get("text"))
            publish_raw = raw.get("publish_time_raw") or raw.get("time_text") or video_id
            publish_iso = ts_to_iso(publish_raw)
            publish_source = "gui_workspace_dom_time_text"
            if not publish_iso and publish_raw:
                parsed_human_time = parse_human_datetime(str(publish_raw))
                if parsed_human_time:
                    publish_iso = parsed_human_time.isoformat()
            if not publish_iso:
                publish_iso = aweme_id_to_iso(video_id)
                publish_raw = video_id
                publish_source = "gui_workspace_dom_aweme_id_timestamp_fallback"
            records.append(
                ContentRecord(
                    platform=self.platform,
                    source_account_url=homepage_url,
                    source_content_url=video_url,
                    platform_content_id=video_id,
                    caption=caption,
                    publish_time_raw=str(publish_raw) if publish_raw is not None else None,
                    publish_time_iso=publish_iso,
                    duration_raw=None,
                    duration_sec=None,
                    author_nickname=text_clean(raw.get("author_nickname") or raw.get("nickname")) or None,
                    author_user_id=text_clean(raw.get("author_user_id") or raw.get("author_sec_uid") or raw.get("sec_uid")) or None,
                    video_title=caption or None,
                    comments=[],
                    field_source={
                        "caption": "gui_workspace_dom",
                        "publish_time": publish_source,
                        "duration": "not_available_dom",
                    },
                )
            )
            if len(records) >= collection_limit:
                break
        debug["items"] = len(records)
        debug["sample_ids"] = [item.platform_content_id for item in records[:8]]
        if records:
            debug["reason"] = "gui_workspace_dom_succeeded"
        return records, debug

    def sync(
        self,
        account_alias: str,
        homepage_url: str,
        max_posts: int = 20,
        capture_seconds: int = 8,
        trigger_scroll_rounds: int = 4,
        trigger_pause_sec: float = 1.0,
        trigger_tab_click: bool = True,
        save_debug_files: bool = False,
        run_id: str | None = None,
    ) -> Tuple[RunResult, Path]:
        run_id = run_id or datetime.now().strftime("%Y%m%d_%H%M%S")
        debug_dir = output_section_dir(self.output_dir, self.platform, account_alias, run_id, "posts_api")
        debug_dir.mkdir(parents=True, exist_ok=True)

        result = RunResult(
            run_id=run_id,
            platform=self.platform,
            homepage_url=homepage_url,
            account_alias=account_alias,
            generated_at=datetime.now().astimezone().isoformat(),
            items=[],
        )

        if self.context is None:
            print("[POSTS] Playwright browser is unavailable; using GUI workspace DOM bridge only.", flush=True)
            gui_dom_items, gui_dom_debug = self._collect_gui_workspace_dom_posts(
                homepage_url=homepage_url,
                max_posts=max_posts,
                trigger_scroll_rounds=trigger_scroll_rounds,
                trigger_pause_sec=trigger_pause_sec,
                debug_dir=debug_dir,
            )
            result.items.extend(gui_dom_items)
            summary = {
                "run_id": run_id,
                "platform": self.platform,
                "account_alias": account_alias,
                "homepage_url": homepage_url,
                "ok": bool(gui_dom_items),
                "reason": "gui_workspace_dom_only_succeeded" if gui_dom_items else gui_dom_debug.get("reason", "gui_workspace_dom_only_failed"),
                "posts_collected": len(result.items),
                "runtime_debug": {"gui_workspace_dom_only": gui_dom_debug},
            }
            summary_path = debug_dir / "summary.json"
            summary_path.write_text(json.dumps(summary, ensure_ascii=False, indent=2), encoding="utf-8")
            print(
                f"[POSTS] GUI workspace DOM-only collection finished: posts={len(result.items)} summary={summary_path}",
                flush=True,
            )
            return result, summary_path

        page = self.context.new_page()
        try:
            page.set_default_timeout(int(os.getenv("ACS_POSTS_PAGE_TIMEOUT_MS", "15000")))
            page.set_default_navigation_timeout(int(os.getenv("ACS_POSTS_NAV_TIMEOUT_MS", "45000")))
        except Exception:
            pass
        captured_candidates: List[Dict[str, Any]] = []
        captured_keys = set()
        runtime_debug: Dict[str, Any] = {
            "trigger_actions": [],
            "candidate_urls": [],
            "pagination_mode": None,
        }
        post_limit = self.pacing.resolve_post_limit(max_posts)

        def on_response(response: Response):
            try:
                candidate = self._capture_candidate(response=response, homepage_url=homepage_url)
                if not candidate:
                    return
                unique_key = candidate["unique_key"]
                if unique_key in captured_keys:
                    return
                captured_keys.add(unique_key)
                candidate.pop("unique_key", None)
                captured_candidates.append(candidate)
                runtime_debug["candidate_urls"].append(
                    {
                        "score": candidate["score"],
                        "url": candidate["request_url"],
                        "aweme_count": candidate["aweme_count"],
                    }
                )
            except Exception:
                return

        page.on("response", on_response)

        try:
            print(f"[POSTS] 打开主页：{homepage_url}", flush=True)
            print(f"[STEP] 主页作品列表采集中：正在打开主页（最多45秒）：{homepage_url}", flush=True)
            try:
                page.goto(homepage_url, wait_until="domcontentloaded", timeout=int(os.getenv("ACS_POSTS_NAV_TIMEOUT_MS", "45000")))
            except Exception as exc:
                print(f"[STEP] 主页作品列表采集失败：打开主页超时或失败：{homepage_url}，error={exc}", flush=True)
                raise
            print(f"[POSTS] 主页 DOM 已加载：{homepage_url}", flush=True)
            print("[STEP] 主页作品列表采集中：主页已打开，开始接口/DOM解析。", flush=True)
            if os.getenv("ACS_DISABLE_EXTERNAL_BROWSER", "1") != "0":
                print("[POSTS] 提醒：GUI 模式下不会额外打开浏览器窗口；右侧工作区会同步当前目标页面，采集进程在后台执行。", flush=True)
            else:
                print("[POSTS] 提醒：已启用外部可见采集窗口，滚动/刷新会显示在该采集窗口中。", flush=True)
            self._settle_page(page, trigger_pause_sec)
            effective_trigger_scroll_rounds = self._resolve_trigger_scroll_rounds(trigger_scroll_rounds, max_posts)
            if effective_trigger_scroll_rounds != trigger_scroll_rounds:
                runtime_debug["trigger_actions"].append(
                    {
                        "action": "auto_expand_scroll_rounds",
                        "configured": trigger_scroll_rounds,
                        "effective": effective_trigger_scroll_rounds,
                        "reason": "expanded_post_sampling_or_no_scroll_configured",
                    }
                )

            # Primary path: use Douyin's work-list API directly. GUI/DOM extraction is
            # intentionally kept as a fallback only, so normal runs do not refresh or
            # scroll the visible workspace just to collect the homepage list.
            print("[STEP] 主页作品列表采集中：尝试接口主链路获取作品。", flush=True)
            direct_primary = self._try_direct_first_page_candidate(
                page=page,
                homepage_url=homepage_url,
                max_posts=max_posts,
            )
            runtime_debug["interface_primary_direct"] = direct_primary.get("debug") if direct_primary else {"ok": False, "reason": "not_available"}
            if direct_primary and direct_primary.get("candidate"):
                candidate = direct_primary["candidate"]
                candidate["source"] = "interface_primary_direct"
                captured_candidates.append(candidate)
                runtime_debug["candidate_urls"].append(
                    {
                        "score": candidate.get("score"),
                        "url": candidate.get("request_url"),
                        "aweme_count": candidate.get("aweme_count"),
                        "source": "interface_primary_direct",
                    }
                )
                print(
                    f"[POSTS] 接口主链路成功：首批作品数={candidate.get('aweme_count')}，继续按接口模板翻页。",
                    flush=True,
                )
                return self._collect_posts_from_interface_template(
                    page=page,
                    result=result,
                    best_template=candidate,
                    captured_candidates=captured_candidates,
                    runtime_debug=runtime_debug,
                    run_id=run_id,
                    account_alias=account_alias,
                    homepage_url=homepage_url,
                    max_posts=max_posts,
                    post_limit=post_limit,
                    trigger_pause_sec=trigger_pause_sec,
                    save_debug_files=save_debug_files,
                    debug_dir=debug_dir,
                    bootstrap_source="interface_primary_direct",
                )
            print(
                f"[POSTS] 接口主链路未命中，进入 DOM 兜底：reason={runtime_debug['interface_primary_direct'].get('reason')}",
                flush=True,
            )
            print(
                f"[STEP] 主页作品列表采集中：接口主链路未命中，进入DOM/工作区兜底，reason={runtime_debug['interface_primary_direct'].get('reason')}",
                flush=True,
            )

            # GUI embedded WebView DOM bridge. This is used only as a fallback when
            # the GUI is running without an external Playwright window: all page
            # reload/scroll/extract actions happen in the right-side workspace.
            gui_dom_items, gui_dom_debug = self._collect_gui_workspace_dom_posts(
                homepage_url=homepage_url,
                max_posts=max_posts,
                trigger_scroll_rounds=effective_trigger_scroll_rounds,
                trigger_pause_sec=trigger_pause_sec,
                debug_dir=debug_dir,
            )
            runtime_debug["gui_workspace_dom_primary"] = gui_dom_debug
            if gui_dom_debug.get("enabled"):
                print(
                    f"[POSTS] GUI工作区DOM解析作品数：{len(gui_dom_items)}，profile_count={gui_dom_debug.get('profile_count')}，"
                    f"reason={gui_dom_debug.get('reason')}，sample_ids={gui_dom_debug.get('sample_ids', [])[:8]}",
                    flush=True,
                )
            if gui_dom_items:
                result.items.extend(gui_dom_items)
                summary = {
                    "run_id": run_id,
                    "platform": self.platform,
                    "account_alias": account_alias,
                    "homepage_url": homepage_url,
                    "ok": True,
                    "reason": "gui_workspace_dom_primary_succeeded",
                    "captured_candidate_count_passive": len(captured_candidates),
                    "posts_collected": len(result.items),
                    "posts_limit": post_limit,
                    "runtime_debug": runtime_debug,
                }
                summary_path = debug_dir / "summary.json"
                summary_path.write_text(json.dumps(summary, ensure_ascii=False, indent=2), encoding="utf-8")
                print(f"[POSTS] GUI工作区DOM主链路采集成功：作品数={len(result.items)}，summary={summary_path}", flush=True)
                return result, summary_path

            # Primary path: DOM/page-state extraction. Network captures may happen
            # passively while the page is prepared, but they are not considered a
            # successful primary path unless DOM extraction returns nothing. This
            # keeps UI/DOM failures visible instead of hiding them behind API fetches.
            best_template: Optional[Dict[str, Any]] = None
            self._prepare_homepage_for_dom(
                page=page,
                homepage_url=homepage_url,
                trigger_tab_click=trigger_tab_click,
                trigger_pause_sec=trigger_pause_sec,
                runtime_debug=runtime_debug,
                action_label="dom_primary_prepare",
            )
            runtime_debug["homepage_state_before_dom_primary"] = self._homepage_state_snapshot(page)
            dom_items, dom_debug = self._collect_dom_homepage_posts(
                page=page,
                homepage_url=homepage_url,
                max_posts=max_posts,
                trigger_pause_sec=trigger_pause_sec,
                requested_scroll_rounds=trigger_scroll_rounds,
            )
            runtime_debug["dom_primary"] = dom_debug
            print(
                f"[POSTS] DOM主链路解析作品数：{len(dom_items)}，profile_count={dom_debug.get('profile_post_count_estimate')}，"
                f"extract_sources={dom_debug.get('extract_sources', {})}，rejected={dom_debug.get('rejected', {})}，"
                f"sample_ids={dom_debug.get('sample_ids', [])[:8]}",
                flush=True,
            )
            if dom_items:
                result.items.extend(dom_items)
                summary = {
                    "run_id": run_id,
                    "platform": self.platform,
                    "account_alias": account_alias,
                    "homepage_url": homepage_url,
                    "ok": True,
                    "reason": "dom_primary_succeeded",
                    "captured_candidate_count_passive": len(captured_candidates),
                    "posts_collected": len(result.items),
                    "posts_limit": post_limit,
                    "runtime_debug": runtime_debug,
                }
                summary_path = debug_dir / "summary.json"
                summary_path.write_text(json.dumps(summary, ensure_ascii=False, indent=2), encoding="utf-8")
                print(f"[POSTS] DOM主链路采集成功：作品数={len(result.items)}，summary={summary_path}", flush=True)
                return result, summary_path

            print("[POSTS] DOM主链路未解析到作品，刷新主页后重试一次 DOM；接口仍不前置。", flush=True)
            runtime_debug["homepage_state_before_dom_reload_retry"] = self._homepage_state_snapshot(page)
            try:
                try:
                    page.reload(wait_until="domcontentloaded", timeout=60000)
                except Exception:
                    page.goto(homepage_url, wait_until="domcontentloaded", timeout=60000)
                self._settle_page(page, trigger_pause_sec)
                self._prepare_homepage_for_dom(
                    page=page,
                    homepage_url=homepage_url,
                    trigger_tab_click=trigger_tab_click,
                    trigger_pause_sec=trigger_pause_sec,
                    runtime_debug=runtime_debug,
                    action_label="dom_primary_reload_prepare",
                )
                dom_retry_items, dom_retry_debug = self._collect_dom_homepage_posts(
                    page=page,
                    homepage_url=homepage_url,
                    max_posts=max_posts,
                    trigger_pause_sec=trigger_pause_sec,
                    requested_scroll_rounds=max(trigger_scroll_rounds, effective_trigger_scroll_rounds),
                )
            except Exception as exc:
                dom_retry_items = []
                dom_retry_debug = {"enabled": True, "error": str(exc)}
            runtime_debug["dom_primary_reload_retry"] = dom_retry_debug
            print(
                f"[POSTS] DOM刷新重试解析作品数：{len(dom_retry_items)}，profile_count={dom_retry_debug.get('profile_post_count_estimate') if isinstance(dom_retry_debug, dict) else None}，"
                f"extract_sources={dom_retry_debug.get('extract_sources', {}) if isinstance(dom_retry_debug, dict) else {}}，"
                f"rejected={dom_retry_debug.get('rejected', {}) if isinstance(dom_retry_debug, dict) else {}}，"
                f"sample_ids={dom_retry_debug.get('sample_ids', [])[:8] if isinstance(dom_retry_debug, dict) else []}",
                flush=True,
            )
            if dom_retry_items:
                result.items.extend(dom_retry_items)
                summary = {
                    "run_id": run_id,
                    "platform": self.platform,
                    "account_alias": account_alias,
                    "homepage_url": homepage_url,
                    "ok": True,
                    "reason": "dom_primary_reload_retry_succeeded",
                    "captured_candidate_count_passive": len(captured_candidates),
                    "posts_collected": len(result.items),
                    "posts_limit": post_limit,
                    "runtime_debug": runtime_debug,
                }
                summary_path = debug_dir / "summary.json"
                summary_path.write_text(json.dumps(summary, ensure_ascii=False, indent=2), encoding="utf-8")
                print(f"[POSTS] DOM刷新重试采集成功：作品数={len(result.items)}，summary={summary_path}", flush=True)
                return result, summary_path

            print("[POSTS] DOM两次均未解析到作品，开始使用页面触发接口捕获作为兜底。", flush=True)
            # Some candidates may already have been captured passively during DOM
            # preparation/scrolling. Wait briefly first, then perform a bounded UI
            # trigger only if still empty.
            end_at = time.time() + max(2.0, min(float(capture_seconds or 0), 5.0))
            while time.time() < end_at:
                if captured_candidates:
                    break
                sleep_seconds(0.3)

            if not captured_candidates:
                self._trigger_post_requests(
                    page=page,
                    homepage_url=homepage_url,
                    trigger_scroll_rounds=effective_trigger_scroll_rounds,
                    trigger_pause_sec=trigger_pause_sec,
                    trigger_tab_click=trigger_tab_click,
                    runtime_debug=runtime_debug,
                )
                end_at = time.time() + max(capture_seconds, 5)
                while time.time() < end_at:
                    if captured_candidates:
                        break
                    sleep_seconds(0.35)

            if not captured_candidates:
                retry_rounds = max(3, self._resolve_trigger_scroll_rounds(trigger_scroll_rounds, max_posts) // 2)
                runtime_debug["homepage_state_before_interface_retry"] = self._homepage_state_snapshot(page)
                runtime_debug["trigger_actions"].append({"action": "interface_retry_when_dom_empty", "rounds": retry_rounds})
                for retry_index in range(retry_rounds):
                    try:
                        surface_result = self._scroll_homepage_surfaces(page, 1600)
                        page.mouse.wheel(0, 1600)
                        runtime_debug["trigger_actions"].append({"action": "interface_retry_when_dom_empty", "round": retry_index + 1, "surfaces": surface_result})
                    except Exception as exc:
                        runtime_debug["trigger_actions"].append({"action": "interface_retry_when_dom_empty", "round": retry_index + 1, "error": str(exc)})
                    sleep_seconds(max(trigger_pause_sec, 1.0))
                    if captured_candidates:
                        break

            print(f"[POSTS] 页面触发接口候选捕获数量：{len(captured_candidates)}", flush=True)
            captured_candidates.sort(key=lambda item: (-item["score"], item["request_url"]))
            best_template = self._select_best_candidate(captured_candidates, homepage_url)

            if save_debug_files:
                for idx, candidate in enumerate(captured_candidates[:15], start=1):
                    (debug_dir / f"candidate_{idx:03d}.json").write_text(
                        json.dumps(candidate, ensure_ascii=False, indent=2),
                        encoding="utf-8",
                    )

            if not best_template:
                print("[POSTS] 页面触发接口也未命中，最后尝试直接接口兜底。", flush=True)
                direct_last = self._try_direct_first_page_candidate(
                    page=page,
                    homepage_url=homepage_url,
                    max_posts=max_posts,
                )
                runtime_debug["direct_first_page_last_resort"] = direct_last.get("debug") if direct_last else {"ok": False, "reason": "not_available"}
                if direct_last and direct_last.get("candidate"):
                    candidate = direct_last["candidate"]
                    candidate["source"] = "direct_first_page_last_resort"
                    captured_candidates.append(candidate)
                    best_template = candidate
                    runtime_debug["candidate_urls"].append(
                        {
                            "score": candidate.get("score"),
                            "url": candidate.get("request_url"),
                            "aweme_count": candidate.get("aweme_count"),
                            "source": "direct_first_page_last_resort",
                        }
                    )
                    print(
                        f"[POSTS] 直接接口最后兜底成功：首批作品数={candidate.get('aweme_count')}，继续按接口模板翻页。",
                        flush=True,
                    )
                else:
                    summary = {
                        "run_id": run_id,
                        "platform": self.platform,
                        "account_alias": account_alias,
                        "homepage_url": homepage_url,
                        "ok": False,
                        "reason": "dom_empty_page_trigger_empty_and_direct_fallback_failed",
                        "captured_candidate_count": len(captured_candidates),
                        "posts_collected": len(result.items),
                        "posts_limit": post_limit,
                        "runtime_debug": runtime_debug,
                    }
                    summary_path = debug_dir / "summary.json"
                    summary_path.write_text(json.dumps(summary, ensure_ascii=False, indent=2), encoding="utf-8")
                    print(
                        f"[POSTS] DOM、页面触发接口、直接接口均未拿到作品：{homepage_url}，summary={summary_path}",
                        flush=True,
                    )
                    return result, summary_path

            if save_debug_files:
                (debug_dir / "bootstrap_template.json").write_text(
                    json.dumps(best_template, ensure_ascii=False, indent=2),
                    encoding="utf-8",
                )

            template_url = best_template["request_url"]
            first_payload = best_template["response_json"]
            cursor_key = detect_query_key(template_url, ["max_cursor", "cursor", "offset"], "max_cursor")
            count_key = detect_query_key(template_url, ["count", "page_size"], "count")
            homepage_sec_uid = extract_sec_uid_from_url(homepage_url)
            sec_uid = best_template.get("template_sec_uid") or extract_sec_uid_from_url(template_url)
            template_author_sec_uids = best_template.get("author_sec_uids") or []
            enforce_author_filter = bool(
                homepage_sec_uid
                and (
                    (sec_uid and sec_uid == homepage_sec_uid)
                    or (homepage_sec_uid in template_author_sec_uids)
                )
            )

            awemes: List[Dict[str, Any]] = []
            seen_ids = set()
            page_payloads: List[Dict[str, Any]] = []

            def append_awemes(payload: Dict[str, Any], page_no: int, source: str) -> None:
                items = recursive_find_aweme_list(payload) or []
                page_ids = []
                for aweme in items:
                    aweme_id = text_clean(aweme.get("aweme_id")) or text_clean(aweme.get("awemeId"))
                    if not aweme_id or aweme_id in seen_ids:
                        continue
                    if enforce_author_filter and homepage_sec_uid:
                        aweme_sec_uid = extract_author_sec_uid(aweme)
                        if aweme_sec_uid and aweme_sec_uid != homepage_sec_uid:
                            continue
                    seen_ids.add(aweme_id)
                    awemes.append(aweme)
                    page_ids.append(aweme_id)
                    if post_limit is not None and len(awemes) >= post_limit:
                        break
                page_payloads.append(
                    {
                        "page_no": page_no,
                        "source": source,
                        "cursor": extract_cursor(payload),
                        "has_more": extract_has_more(payload),
                        "aweme_ids": page_ids,
                    }
                )

            append_awemes(first_payload, 1, "bootstrap_capture")
            print(f"[POSTS] 已解析首批作品：{len(awemes)}", flush=True)
            if save_debug_files:
                (debug_dir / "page_001.json").write_text(json.dumps(first_payload, ensure_ascii=False, indent=2), encoding="utf-8")

            cursor = extract_cursor(first_payload)
            has_more = extract_has_more(first_payload)
            page_no = 1

            while has_more and self.pacing.should_continue_posts(len(awemes), max_posts):
                page_no += 1
                page_limit = 20 if post_limit is None else min(20, max(post_limit - len(awemes), 0) or 20)
                target_url = build_url_with_overrides(
                    template_url,
                    {
                        cursor_key: 0 if cursor is None else cursor,
                        count_key: page_limit,
                    },
                )
                payload = self._fetch_json(page, target_url)
                if isinstance(payload, dict) and recursive_find_aweme_list(payload):
                    runtime_debug["pagination_mode"] = runtime_debug["pagination_mode"] or "direct_fetch"
                    if save_debug_files:
                        (debug_dir / f"page_{page_no:03d}.json").write_text(
                            json.dumps(payload, ensure_ascii=False, indent=2),
                            encoding="utf-8",
                        )
                    append_awemes(payload, page_no, "direct_fetch")
                    print(f"[POSTS] 作品翻页完成：page={page_no} 当前作品数={len(awemes)}", flush=True)
                    cursor = extract_cursor(payload)
                    has_more = extract_has_more(payload)
                    sleep_seconds(self.pacing.post_page_pause(page_no, trigger_pause_sec))
                    continue

                runtime_debug["pagination_mode"] = runtime_debug["pagination_mode"] or "ui_trigger_fallback"
                next_payload = self._capture_next_page_via_ui(
                    page=page,
                    known_request_url=template_url,
                    current_count=len(awemes),
                    trigger_pause_sec=trigger_pause_sec,
                )
                if not isinstance(next_payload, dict):
                    break
                if save_debug_files:
                    (debug_dir / f"page_{page_no:03d}.json").write_text(
                        json.dumps(next_payload, ensure_ascii=False, indent=2),
                        encoding="utf-8",
                    )
                append_awemes(next_payload, page_no, "ui_trigger_fallback")
                print(f"[POSTS] UI 触发翻页完成：page={page_no} 当前作品数={len(awemes)}", flush=True)
                cursor = extract_cursor(next_payload)
                has_more = extract_has_more(next_payload)
                sleep_seconds(self.pacing.post_page_pause(page_no, trigger_pause_sec))

            final_awemes = awemes if post_limit is None else awemes[:post_limit]
            for aweme in final_awemes:
                result.items.append(map_aweme_to_content(self.platform, homepage_url, aweme))

            summary = {
                "run_id": run_id,
                "platform": self.platform,
                "account_alias": account_alias,
                "homepage_url": homepage_url,
                "ok": True,
                "pacing_profile": getattr(self.pacing, "profile_name", None),
                "template_url": template_url,
                "cursor_key": cursor_key,
                "count_key": count_key,
                "template_sec_uid": sec_uid,
                "homepage_sec_uid": homepage_sec_uid,
                "enforce_author_filter": enforce_author_filter,
                "pages_fetched": page_no,
                "posts_collected": len(result.items),
                "posts_limit": post_limit,
                "captured_candidate_count": len(captured_candidates),
                "page_payloads": page_payloads,
                "runtime_debug": runtime_debug,
            }
            summary_path = debug_dir / "summary.json"
            summary_path.write_text(json.dumps(summary, ensure_ascii=False, indent=2), encoding="utf-8")
            print(f"[POSTS] 主页作品采集完成：作品数={len(result.items)}，summary={summary_path}", flush=True)
            return result, summary_path
        finally:
            page.close()

    def _collect_posts_from_interface_template(
        self,
        *,
        page: Page,
        result: RunResult,
        best_template: Dict[str, Any],
        captured_candidates: List[Dict[str, Any]],
        runtime_debug: Dict[str, Any],
        run_id: str,
        account_alias: str,
        homepage_url: str,
        max_posts: int,
        post_limit: int | None,
        trigger_pause_sec: float,
        save_debug_files: bool,
        debug_dir: Path,
        bootstrap_source: str,
    ) -> Tuple[RunResult, Path]:
        """Build the homepage post result from an API template.

        This keeps the fast/stable API path independent from the DOM fallback.
        The DOM bridge is still available if this method is never reached, but a
        successful API path must not trigger GUI refresh/scroll actions.
        """
        if save_debug_files:
            (debug_dir / "bootstrap_template.json").write_text(
                json.dumps(best_template, ensure_ascii=False, indent=2),
                encoding="utf-8",
            )

        template_url = best_template["request_url"]
        first_payload = best_template["response_json"]
        cursor_key = detect_query_key(template_url, ["max_cursor", "cursor", "offset"], "max_cursor")
        count_key = detect_query_key(template_url, ["count", "page_size"], "count")
        homepage_sec_uid = extract_sec_uid_from_url(homepage_url)
        sec_uid = best_template.get("template_sec_uid") or extract_sec_uid_from_url(template_url)
        template_author_sec_uids = best_template.get("author_sec_uids") or []
        enforce_author_filter = bool(
            homepage_sec_uid
            and (
                (sec_uid and sec_uid == homepage_sec_uid)
                or (homepage_sec_uid in template_author_sec_uids)
            )
        )

        awemes: List[Dict[str, Any]] = []
        seen_ids = set()
        page_payloads: List[Dict[str, Any]] = []

        def append_awemes(payload: Dict[str, Any], page_no: int, source: str) -> None:
            items = recursive_find_aweme_list(payload) or []
            page_ids = []
            for aweme in items:
                aweme_id = text_clean(aweme.get("aweme_id")) or text_clean(aweme.get("awemeId"))
                if not aweme_id or aweme_id in seen_ids:
                    continue
                if enforce_author_filter and homepage_sec_uid:
                    aweme_sec_uid = extract_author_sec_uid(aweme)
                    if aweme_sec_uid and aweme_sec_uid != homepage_sec_uid:
                        continue
                seen_ids.add(aweme_id)
                awemes.append(aweme)
                page_ids.append(aweme_id)
                if post_limit is not None and len(awemes) >= post_limit:
                    break
            page_payloads.append(
                {
                    "page_no": page_no,
                    "source": source,
                    "cursor": extract_cursor(payload),
                    "has_more": extract_has_more(payload),
                    "aweme_ids": page_ids,
                }
            )

        append_awemes(first_payload, 1, bootstrap_source)
        print(f"[POSTS] 已解析首批作品：{len(awemes)}", flush=True)
        if save_debug_files:
            (debug_dir / "page_001.json").write_text(json.dumps(first_payload, ensure_ascii=False, indent=2), encoding="utf-8")

        cursor = extract_cursor(first_payload)
        has_more = extract_has_more(first_payload)
        page_no = 1

        while has_more and self.pacing.should_continue_posts(len(awemes), max_posts):
            page_no += 1
            page_limit = 20 if post_limit is None else min(20, max(post_limit - len(awemes), 0) or 20)
            target_url = build_url_with_overrides(
                template_url,
                {
                    cursor_key: 0 if cursor is None else cursor,
                    count_key: page_limit,
                },
            )
            payload = self._fetch_json(page, target_url)
            if isinstance(payload, dict) and recursive_find_aweme_list(payload):
                runtime_debug["pagination_mode"] = runtime_debug["pagination_mode"] or "direct_fetch"
                if save_debug_files:
                    (debug_dir / f"page_{page_no:03d}.json").write_text(
                        json.dumps(payload, ensure_ascii=False, indent=2),
                        encoding="utf-8",
                    )
                append_awemes(payload, page_no, "direct_fetch")
                print(f"[POSTS] 作品翻页完成：page={page_no} 当前作品数={len(awemes)}", flush=True)
                cursor = extract_cursor(payload)
                has_more = extract_has_more(payload)
                sleep_seconds(self.pacing.post_page_pause(page_no, trigger_pause_sec))
                continue

            runtime_debug["pagination_mode"] = runtime_debug["pagination_mode"] or "ui_trigger_fallback"
            next_payload = self._capture_next_page_via_ui(
                page=page,
                known_request_url=template_url,
                current_count=len(awemes),
                trigger_pause_sec=trigger_pause_sec,
            )
            if not isinstance(next_payload, dict):
                break
            if save_debug_files:
                (debug_dir / f"page_{page_no:03d}.json").write_text(
                    json.dumps(next_payload, ensure_ascii=False, indent=2),
                    encoding="utf-8",
                )
            append_awemes(next_payload, page_no, "ui_trigger_fallback")
            print(f"[POSTS] UI 触发翻页完成：page={page_no} 当前作品数={len(awemes)}", flush=True)
            cursor = extract_cursor(next_payload)
            has_more = extract_has_more(next_payload)
            sleep_seconds(self.pacing.post_page_pause(page_no, trigger_pause_sec))

        final_awemes = awemes if post_limit is None else awemes[:post_limit]
        for aweme in final_awemes:
            result.items.append(map_aweme_to_content(self.platform, homepage_url, aweme))

        summary = {
            "run_id": run_id,
            "platform": self.platform,
            "account_alias": account_alias,
            "homepage_url": homepage_url,
            "ok": True,
            "reason": f"{bootstrap_source}_succeeded",
            "pacing_profile": getattr(self.pacing, "profile_name", None),
            "template_url": template_url,
            "cursor_key": cursor_key,
            "count_key": count_key,
            "template_sec_uid": sec_uid,
            "homepage_sec_uid": homepage_sec_uid,
            "enforce_author_filter": enforce_author_filter,
            "pages_fetched": page_no,
            "posts_collected": len(result.items),
            "posts_limit": post_limit,
            "captured_candidate_count": len(captured_candidates),
            "page_payloads": page_payloads,
            "runtime_debug": runtime_debug,
        }
        summary_path = debug_dir / "summary.json"
        summary_path.write_text(json.dumps(summary, ensure_ascii=False, indent=2), encoding="utf-8")
        print(f"[POSTS] 主页作品采集完成：作品数={len(result.items)}，summary={summary_path}", flush=True)
        return result, summary_path

    def _resolve_trigger_scroll_rounds(self, configured_rounds: int, max_posts: int) -> int:
        """Use a minimum amount of scrolling for homepage sampling.

        In homepage mode the caller may pass an expanded max_posts value (for
        example 50) so time filtering can look beyond pinned/old first-screen
        works. If triggerScrollRounds is 0, Douyin often never issues the post
        list request and the whole account is incorrectly judged as having 0
        eligible works.
        """
        configured = max(int(configured_rounds or 0), 0)
        requested = max(int(max_posts or 0), 0)
        if requested <= 0:
            return max(configured, 6)
        if requested >= 80:
            return max(configured, 8)
        if requested >= 50:
            return max(configured, 6)
        if configured <= 0:
            return 4
        return configured

    def _collect_dom_homepage_posts(
        self,
        page: Page,
        homepage_url: str,
        max_posts: int,
        trigger_pause_sec: float,
        requested_scroll_rounds: int,
    ) -> Tuple[List[ContentRecord], Dict[str, Any]]:
        """Collect homepage works from the loaded page itself before API fallback.

        This method is intentionally staged. A single DOM read immediately after
        DOMContentLoaded is not enough on Douyin profile pages because the work grid is
        lazily mounted after small scroll/wheel activity, and sometimes only after a
        refresh with an already-warm login/session context. Therefore we keep trying DOM
        extraction after each safe UI trigger and only let the caller use interface
        capture after every DOM stage fails.
        """
        limit = max(int(max_posts or 0), 0)
        collection_limit = limit if limit > 0 else 120
        scroll_rounds = max(self._resolve_trigger_scroll_rounds(requested_scroll_rounds, max_posts), 6)
        homepage_sec_uid = extract_sec_uid_from_url(homepage_url)
        seen: set[str] = set()
        hints: List[Dict[str, Any]] = []
        debug: Dict[str, Any] = {
            "enabled": True,
            "collection_limit": collection_limit,
            "scroll_rounds": scroll_rounds,
            "phases": [],
            "sources": {},
            "extract_sources": {},
            "sample_ids": [],
            "homepage_sec_uid": homepage_sec_uid,
            "rejected": {},
        }

        def reject(reason: str) -> int:
            debug["rejected"][reason] = debug["rejected"].get(reason, 0) + 1
            return 0

        def add_hint(raw: Dict[str, Any], phase: str) -> int:
            href = raw.get("href") or raw.get("url")
            video_url = normalize_douyin_video_url(homepage_url, href) if href else None
            video_id = text_clean(raw.get("video_id")) or extract_video_id_from_url(video_url or "")
            if not video_id:
                return reject("missing_video_id")
            source = text_clean(raw.get("source")) or "homepage_dom_fallback"
            author_sec_uid = text_clean(raw.get("author_sec_uid") or raw.get("sec_uid"))

            # DOM primary is only useful if it represents the current profile.
            # Do not accept ids scraped from whole-page scripts/large React trees unless
            # the item author matches the homepage sec_uid. Those broad sources often
            # contain recommendation feed/cache data from other users.
            if homepage_sec_uid and author_sec_uid and author_sec_uid != homepage_sec_uid:
                return reject("author_sec_uid_mismatch")
            broad_source = source.startswith("embedded_") or source in {"homepage_dom_react_fiber", "homepage_dom_react_props"}
            if broad_source and homepage_sec_uid and not author_sec_uid and not raw.get("visible_profile_card"):
                return reject("broad_source_without_author")
            profile_count = debug.get("profile_post_count_estimate")
            try:
                profile_count_int = int(profile_count) if profile_count is not None else 0
            except Exception:
                profile_count_int = 0
            if profile_count_int > 0 and len(hints) >= min(collection_limit, profile_count_int):
                return reject("exceeds_profile_post_count_estimate")
            if video_id in seen:
                return reject("duplicate_video_id")
            seen.add(video_id)
            caption = text_clean(raw.get("caption") or raw.get("text"))
            publish_time_raw = raw.get("publish_time_raw") or raw.get("time_text")
            publish_time_iso = ts_to_iso(publish_time_raw)
            publish_source = source
            if not publish_time_iso and publish_time_raw:
                parsed_human_time = parse_human_datetime(str(publish_time_raw))
                if parsed_human_time:
                    publish_time_iso = parsed_human_time.isoformat()
                    publish_source = f"{publish_source}_time_text"
            id_iso = aweme_id_to_iso(video_id)
            if not publish_time_iso and id_iso:
                publish_time_raw = publish_time_raw or video_id
                publish_time_iso = id_iso
                publish_source = "aweme_id_timestamp_fallback"
            hints.append(
                {
                    "video_id": video_id,
                    "caption": caption,
                    "publish_time_raw": str(publish_time_raw) if publish_time_raw is not None else None,
                    "publish_time_iso": publish_time_iso,
                    "publish_time_source": publish_source,
                    "source_content_url": f"https://www.douyin.com/video/{video_id}",
                    "author_nickname": text_clean(raw.get("author_nickname") or raw.get("nickname")),
                    "author_user_id": text_clean(raw.get("author_user_id") or raw.get("author_sec_uid") or raw.get("sec_uid")),
                    "dom_phase": phase,
                }
            )
            debug["sources"][publish_source] = debug["sources"].get(publish_source, 0) + 1
            debug["extract_sources"][source] = debug["extract_sources"].get(source, 0) + 1
            return 1

        def reached_dom_target() -> bool:
            profile_count = debug.get("profile_post_count_estimate")
            try:
                profile_count_int = int(profile_count) if profile_count is not None else 0
            except Exception:
                profile_count_int = 0
            if profile_count_int > 0:
                return len(hints) >= min(collection_limit, profile_count_int)
            return len(hints) >= collection_limit

        def extract_phase(phase: str, action_result: Optional[Dict[str, Any]] = None) -> bool:
            before = len(hints)
            embedded_count = 0
            react_count = 0
            visible_count = 0
            errors: List[str] = []

            # Visible profile cards are the only DOM source trusted as the primary
            # chain. React/embedded states can include recommendation/cache data, so
            # they are only consulted when no visible-card evidence exists at all.
            try:
                for raw in self._extract_visible_dom_post_hints(page, homepage_url):
                    visible_count += 1
                    if raw.get("profile_post_count_estimate") is not None:
                        debug["profile_post_count_estimate"] = raw.get("profile_post_count_estimate")
                    add_hint(raw, phase)
                    effective_limit = int(debug.get("profile_post_count_estimate") or collection_limit)
                    if len(hints) >= min(collection_limit, max(effective_limit, 1)):
                        break
            except Exception as exc:
                errors.append(f"visible:{exc}")

            allow_broad_dom_state = visible_count == 0 and len(hints) == 0
            if allow_broad_dom_state and len(hints) < collection_limit:
                try:
                    for raw in self._extract_react_dom_post_hints(page, homepage_url):
                        react_count += 1
                        add_hint(raw, phase)
                        if len(hints) >= collection_limit:
                            break
                except Exception as exc:
                    errors.append(f"react:{exc}")

            if allow_broad_dom_state and len(hints) < collection_limit:
                try:
                    for raw in self._extract_embedded_post_hints(page):
                        embedded_count += 1
                        add_hint(raw, phase)
                        if len(hints) >= collection_limit:
                            break
                except Exception as exc:
                    errors.append(f"embedded:{exc}")

            snapshot = self._homepage_state_snapshot(page)
            entry: Dict[str, Any] = {
                "phase": phase,
                "embedded_candidates": embedded_count,
                "react_candidates": react_count,
                "visible_candidates": visible_count,
                "new_items": len(hints) - before,
                "total": len(hints),
                "snapshot": snapshot,
            }
            if action_result is not None:
                entry["action_result"] = action_result
            if errors:
                entry["errors"] = errors
            debug["phases"].append(entry)
            try:
                print(
                    f"[POSTS] DOM解析阶段：{phase}，新增={len(hints) - before}，累计={len(hints)}，"
                    f"embedded={embedded_count}，react={react_count}，visible={visible_count}，"
                    f"videoHref={snapshot.get('video_href_count', 0)}，modalHref={snapshot.get('modal_href_count', 0)}，"
                    f"userPostListHref={snapshot.get('user_post_list_href_count', 0)}，"
                    f"nonFooterVideoHref={snapshot.get('non_footer_profile_href_count', 0)}，"
                    f"profileCountText={snapshot.get('profile_post_count_text', '')}",
                    flush=True,
                )
            except Exception:
                pass
            return len(hints) >= collection_limit or len(hints) > 0

        # 1) Pure DOM read after page settle. Do not immediately give up.
        if extract_phase("initial_dom_after_settle"):
            pass
        else:
            # 2) Gentle first-screen lazy-load nudge. This should not open any work.
            try:
                page.mouse.move(720, 520)
                page.mouse.wheel(0, 360)
                action = self._scroll_homepage_surfaces(page, 280)
            except Exception as exc:
                action = {"ok": False, "error": str(exc)}
            sleep_seconds(max(trigger_pause_sec, 0.9))
            extract_phase("after_light_scroll_nudge", action)

        # 3) Scroll real containers in bounded rounds, parsing after every movement.
        round_no = 0
        while not reached_dom_target() and round_no < scroll_rounds:
            round_no += 1
            delta = 900 if round_no == 1 else (1350 if round_no % 2 else 1050)
            try:
                page.mouse.move(720 + (round_no % 3) * 60, 620)
                page.mouse.wheel(0, delta)
                action = self._scroll_homepage_surfaces(page, delta)
            except Exception as exc:
                action = {"ok": False, "error": str(exc), "delta_y": delta}
            sleep_seconds(max(trigger_pause_sec, 0.85))
            extract_phase(f"after_container_scroll_{round_no}", action)
            if reached_dom_target():
                break

            # A small upward/downward bounce is safer than clicking cards and often
            # forces virtualized grids to materialize anchors/React props.
            if round_no in {2, 4} and len(hints) == 0:
                try:
                    page.mouse.wheel(0, -360)
                    up = self._scroll_homepage_surfaces(page, -300)
                    sleep_seconds(0.25)
                    page.mouse.wheel(0, 760)
                    down = self._scroll_homepage_surfaces(page, 720)
                    action = {"ok": True, "up": up, "down": down}
                except Exception as exc:
                    action = {"ok": False, "error": str(exc)}
                sleep_seconds(max(trigger_pause_sec, 0.85))
                extract_phase(f"after_bounce_scroll_{round_no}", action)

        records = [
            ContentRecord(
                platform=self.platform,
                source_account_url=homepage_url,
                source_content_url=item["source_content_url"],
                platform_content_id=item["video_id"],
                caption=item.get("caption"),
                publish_time_raw=item.get("publish_time_raw"),
                publish_time_iso=item.get("publish_time_iso"),
                duration_raw=None,
                duration_sec=None,
                author_nickname=item.get("author_nickname") or None,
                author_user_id=item.get("author_user_id") or None,
                video_title=item.get("caption") or None,
                comments=[],
                field_source={
                    "caption": "homepage_dom_fallback" if item.get("caption") else "missing",
                    "publish_time": item.get("publish_time_source") or "homepage_dom_fallback",
                    "content_url": "homepage_dom_fallback",
                },
            )
            for item in hints[:collection_limit]
        ]
        debug["sample_ids"] = [item.platform_content_id for item in records[:30]]
        debug["posts_collected"] = len(records)
        return records, debug

    def _extract_visible_dom_post_hints(self, page: Page, homepage_url: str) -> List[Dict[str, Any]]:
        """Extract current-profile works from Douyin's real profile work list.

        The reliable DOM anchor on the current Douyin PC profile page is the
        dedicated work-list container: ``[data-e2e="user-post-list"]`` with
        ``ul[data-e2e="scroll-list"]`` children. Previous implementations scanned
        every visible ``/video/`` link and then tried to infer the profile grid by
        geometry; that could still include SEO/recommendation/cache links from other
        users, or reject correct anchors in headless mode because bounding boxes can
        be zero/virtualized. This version is deliberately narrow: prefer the profile
        work-list container, cap by the profile tab count, and do not use whole-page
        href scanning as DOM primary.
        """
        homepage_sec_uid = extract_sec_uid_from_url(homepage_url)
        raw_items = page.evaluate(
            r"""
            ({ homepageUrl, homepageSecUid }) => {
              const idRe = /^\d{15,25}$/;
              const targetSecUid = String(homepageSecUid || '').trim();
              const raw = [];
              const seen = new Set();

              const norm = (s) => String(s || '').replace(/\s+/g, ' ').trim();
              const toAbs = (href) => {
                try { return new URL(String(href || ''), location.href).href; } catch (e) { return String(href || ''); }
              };
              const idFromHref = (href) => {
                href = String(href || '');
                const patterns = [
                  /\/video\/(\d{15,25})/,
                  /[?&](?:modal_id|vid|video_id|aweme_id|item_id|itemId)=(\d{15,25})/,
                ];
                for (const re of patterns) {
                  const m = href.match(re);
                  if (m && idRe.test(m[1])) return m[1];
                }
                return '';
              };
              const secUidFromHref = (href) => {
                try {
                  const u = new URL(toAbs(href));
                  for (const key of ['sec_uid', 'sec_user_id', 'sec_userid']) {
                    const v = u.searchParams.get(key);
                    if (v) return v;
                  }
                  const parts = u.pathname.split('/').filter(Boolean);
                  if (parts[0] === 'user' && parts[1]) return decodeURIComponent(parts[1]);
                } catch (e) {}
                return '';
              };
              const hrefExplicitlyOtherUser = (href) => {
                if (!targetSecUid || !href) return false;
                const sec = secUidFromHref(href);
                return !!(sec && sec !== targetSecUid);
              };
              const parseNumericCount = (text) => {
                const token = norm(text).replace(/,/g, '');
                if (!token) return null;
                const m = token.match(/([0-9]+(?:\.[0-9]+)?)(\s*(?:万|w|W|k|K))?/);
                if (!m) return null;
                const base = parseFloat(m[1]);
                if (!Number.isFinite(base)) return null;
                const suffix = m[2] || '';
                const mul = /万|w|W/.test(suffix) ? 10000 : (/k|K/.test(suffix) ? 1000 : 1);
                const value = Math.round(base * mul);
                return value >= 0 && value <= 1000000 ? value : null;
              };
              const parseCountText = (text) => {
                text = norm(text);
                if (!text || !/(作品|视频|投稿|Posts|Videos)/i.test(text)) return null;
                const patterns = [
                  /(?:作品|视频|投稿)\s*([0-9]+(?:\.[0-9]+)?\s*(?:万|w|W|k|K)?)/,
                  /([0-9]+(?:\.[0-9]+)?\s*(?:万|w|W|k|K)?)\s*(?:作品|视频|投稿)/,
                  /(?:Posts|Videos)\s*([0-9]+(?:\.[0-9]+)?\s*(?:k|K)?)/i,
                  /([0-9]+(?:\.[0-9]+)?\s*(?:k|K)?)\s*(?:Posts|Videos)/i,
                ];
                for (const re of patterns) {
                  const m = text.match(re);
                  if (m) return parseNumericCount(m[1]);
                }
                return null;
              };
              const estimateProfilePostCount = () => {
                const direct = [
                  '#semiTabpost [data-e2e="user-tab-count"]',
                  '[role="tab"][aria-selected="true"] [data-e2e="user-tab-count"]',
                  '[data-e2e="user-tab-count"]',
                ];
                for (const sel of direct) {
                  for (const el of Array.from(document.querySelectorAll(sel)).slice(0, 8)) {
                    const v = parseNumericCount(el.innerText || el.textContent || '');
                    if (v !== null) return v;
                  }
                }
                const tabs = Array.from(document.querySelectorAll('#semiTabpost, [role="tab"], button, [role="button"]')).slice(0, 800);
                const values = [];
                for (const el of tabs) {
                  const txt = norm(el.innerText || el.textContent || el.getAttribute('aria-label') || el.getAttribute('title'));
                  const v = parseCountText(txt);
                  if (v !== null) values.push(v);
                  const ptxt = norm(el.parentElement && (el.parentElement.innerText || el.parentElement.textContent));
                  if (ptxt && ptxt.length <= 120) {
                    const pv = parseCountText(ptxt);
                    if (pv !== null) values.push(pv);
                  }
                }
                if (!values.length) return null;
                values.sort((a, b) => a - b);
                return values[0];
              };
              const profilePostCount = estimateProfilePostCount();
              const extractCaption = (anchor, card) => {
                const nodes = [anchor, card].filter(Boolean);
                for (const node of nodes) {
                  const img = node.querySelector && node.querySelector('img[alt]');
                  if (img) {
                    let alt = norm(img.getAttribute('alt'));
                    alt = alt.replace(/^[^：:]{1,40}[：:]\s*/, '');
                    if (alt) return alt.slice(0, 260);
                  }
                }
                const text = norm((card && (card.innerText || card.textContent)) || (anchor && (anchor.innerText || anchor.textContent)) || '');
                // Remove leading like/play count when it is joined with title text.
                return text.replace(/^[0-9.]+\s*(?:万|w|W|k|K)?\s*/, '').slice(0, 260);
              };
              const extractTimeText = (card) => {
                if (!card || !card.querySelectorAll) return '';
                for (const n of Array.from(card.querySelectorAll('time, [datetime], [title], span, div')).slice(0, 100)) {
                  const value = norm(n.getAttribute('datetime') || n.getAttribute('title') || n.innerText || n.textContent || '');
                  if (/刚刚|昨天|前天|分钟前|小时前|天前|周前|月前|\d{4}[年\-/]\d{1,2}|\d{1,2}[\-/]\d{1,2}/.test(value)) return value;
                }
                return '';
              };
              const nearestProfileCard = (anchor) => {
                return (anchor && anchor.closest && (anchor.closest('[data-e2e="user-post-list"] li') || anchor.closest('li') || anchor.closest('article') || anchor.parentElement)) || anchor;
              };
              const pushAnchor = (anchor, source, containerIndex) => {
                const hrefRaw = anchor && (anchor.getAttribute('href') || anchor.href || '');
                const href = toAbs(hrefRaw);
                const id = idFromHref(hrefRaw) || idFromHref(href);
                if (!id || !idRe.test(id)) return;
                if (hrefExplicitlyOtherUser(href)) return;
                if (seen.has(id)) return;
                seen.add(id);
                const card = nearestProfileCard(anchor);
                raw.push({
                  href: href || `https://www.douyin.com/video/${id}`,
                  video_id: id,
                  text: extractCaption(anchor, card),
                  caption: extractCaption(anchor, card),
                  time_text: extractTimeText(card),
                  source,
                  visible_profile_card: true,
                  profile_post_count_estimate: profilePostCount,
                  container_index: containerIndex,
                });
              };

              // Strong DOM primary: only the profile work list. This is the structure
              // seen in the supplied outerHTML: data-e2e="user-post-list" -> ul
              // data-e2e="scroll-list" -> li -> a[href="/video/..."]
              const strongContainers = Array.from(document.querySelectorAll('[data-e2e="user-post-list"]'));
              strongContainers.forEach((container, idx) => {
                const anchors = Array.from(container.querySelectorAll('a[href*="/video/"], a[href*="modal_id="], a[href*="aweme_id="], a[href*="item_id="]'));
                anchors.forEach(a => pushAnchor(a, 'homepage_dom_user_post_list', idx));
              });

              // Secondary but still profile-scoped: if Douyin changes the outer
              // attribute but keeps the scroll-list under the user tab area.
              if (raw.length === 0) {
                const scopedRoots = Array.from(document.querySelectorAll('#user-tabbar, #user-tabbar-2, [data-e2e="user-work-tab"], #semiTabPanelpost, #semiTabPanelvideo, [aria-labelledby="semiTabpost"], [aria-labelledby="semiTabvideo"]'));
                scopedRoots.forEach((root, idx) => {
                  const anchors = Array.from(root.querySelectorAll('[data-e2e="scroll-list"] a[href*="/video/"], ul a[href*="/video/"], a[href*="modal_id="]'));
                  anchors.forEach(a => pushAnchor(a, 'homepage_dom_profile_scoped_list', idx));
                });
              }

              // Headed/headless compatible fallback: when the tab count is present
              // but Douyin does not mount data-e2e="user-post-list" in the collection
              // browser, take only the first profile-count video links from the main
              // profile area. Footer/SEO/hot-search links are explicitly excluded.
              // This covers logs like: videoHref=7, profileCountText=6,
              // userPostListHref=0. It is still DOM primary, not direct API.
              if (raw.length === 0 && Number.isFinite(profilePostCount) && profilePostCount > 0 && profilePostCount <= 200) {
                const marker = document.querySelector('#semiTabpost, #user-tabbar, #user-tabbar-2, [data-e2e="user-work-tab"]');
                const anchors = Array.from(document.querySelectorAll('a[href*="/video/"], a[href*="modal_id="]'));
                let acceptedIndex = 0;
                for (const a of anchors) {
                  if (raw.length >= profilePostCount) break;
                  if (!a || !a.getAttribute) continue;
                  if (a.closest('footer, #douyin-header, [data-e2e="searchbar-button"], [data-e2e="searchbar-input"]')) continue;
                  if (marker && (marker.compareDocumentPosition(a) & Node.DOCUMENT_POSITION_PRECEDING)) continue;
                  const hrefRaw = a.getAttribute('href') || a.href || '';
                  const href = toAbs(hrefRaw);
                  const u = (() => { try { return new URL(href); } catch (e) { return null; } })();
                  if (u) {
                    const source = String(u.searchParams.get('source') || '');
                    if (/baiduspider|sogou|bing|spider|crawler/i.test(source)) continue;
                  }
                  const textAround = norm((a.closest('li, article, section, div') || a).innerText || a.textContent || '');
                  if (/大家都在搜|热门搜索|相关推荐|相关搜索|footer|客户端下载/.test(textAround)) continue;
                  pushAnchor(a, 'homepage_dom_profile_count_video_href', acceptedIndex++);
                }
              }

              let result = raw;
              if (Number.isFinite(profilePostCount) && profilePostCount > 0 && profilePostCount <= 500 && result.length > profilePostCount) {
                result = result.slice(0, profilePostCount);
              }
              return result.slice(0, 160);
            }
            """,
            {"homepageUrl": homepage_url, "homepageSecUid": homepage_sec_uid or ""},
        )
        if not isinstance(raw_items, list):
            return []
        return [item for item in raw_items if isinstance(item, dict)]

    def _extract_react_dom_post_hints(self, page: Page, homepage_url: str) -> List[Dict[str, Any]]:
        """Extract work ids from React props/fibers attached to visible work cards.

        This deliberately avoids scanning large React roots. Large roots often contain
        recommendation feed/cache data unrelated to the current profile, which caused
        other users' videos to be treated as homepage works. A React item is accepted
        when it is attached to a visible card-like DOM node, and author sec_uid is
        forwarded so Python can filter it against the target homepage.
        """
        homepage_sec_uid = extract_sec_uid_from_url(homepage_url)
        raw_items = page.evaluate(
            r"""
            ({ homepageSecUid }) => {
              const result = [];
              const seen = new Set();
              const idRe = /^\d{15,25}$/;
              const visibleNodes = [];
              const isCardLike = (el) => {
                if (!el || !el.getBoundingClientRect) return false;
                const rect = el.getBoundingClientRect();
                if (rect.width < 70 || rect.height < 70) return false;
                if (rect.bottom < -120 || rect.top > window.innerHeight + 360) return false;
                if (rect.width > window.innerWidth * 0.98 || rect.height > 950) return false;
                const style = window.getComputedStyle(el);
                if (style.display === 'none' || style.visibility === 'hidden' || Number(style.opacity || 1) === 0) return false;
                // Skip page/layout roots. We only want mounted work-card sized nodes.
                const area = rect.width * rect.height;
                if (area > window.innerWidth * window.innerHeight * 0.85) return false;
                return true;
              };
              const findAuthorSecUid = (obj, maxDepth = 3) => {
                if (!obj || typeof obj !== 'object') return '';
                const visited = new Set();
                const stack = [{v: obj, d: 0}];
                let steps = 0;
                while (stack.length && steps++ < 500) {
                  const {v, d} = stack.pop();
                  if (!v || typeof v !== 'object' || visited.has(v) || d > maxDepth) continue;
                  visited.add(v);
                  if (v.author && typeof v.author === 'object') {
                    const a = v.author.sec_uid || v.author.sec_user_id || v.author.sec_userid || '';
                    if (a) return String(a);
                  }
                  const direct = v.sec_uid || v.sec_user_id || v.sec_userid || v.author_sec_uid || v.authorSecUid || '';
                  if (direct) return String(direct);
                  for (const key of Object.keys(v).slice(0, 60)) {
                    if (/^(parent|children|child|sibling|return|stateNode|_owner)$/.test(key)) continue;
                    let child;
                    try { child = v[key]; } catch(e) { continue; }
                    if (child && typeof child === 'object') stack.push({v: child, d: d + 1});
                  }
                }
                return '';
              };
              const add = (id, data, source) => {
                id = String(id || '').trim();
                if (!idRe.test(id) || seen.has(id)) return;
                let caption = '';
                let rawTime = null;
                if (data && typeof data === 'object') {
                  caption = data.desc || data.caption || data.title || data.text || '';
                  rawTime = data.create_time || data.createTime || data.publish_time || data.publishTime || data.release_time || data.releaseTime || null;
                  if (!caption && data.aweme && typeof data.aweme === 'object') caption = data.aweme.desc || data.aweme.caption || data.aweme.title || '';
                  if (!rawTime && data.aweme && typeof data.aweme === 'object') rawTime = data.aweme.create_time || data.aweme.createTime || data.aweme.publish_time || null;
                }
                const authorSecUid = findAuthorSecUid(data);
                // If React data exposes an author, it must match the profile. If it
                // does not expose author, Python will still treat this as a visible
                // card source, not a broad source.
                if (homepageSecUid && authorSecUid && authorSecUid !== homepageSecUid) return;
                seen.add(id);
                result.push({
                  video_id: id,
                  caption: String(caption || '').slice(0, 260),
                  publish_time_raw: rawTime,
                  author_sec_uid: authorSecUid,
                  source,
                  visible_profile_card: true
                });
              };
              const scan = (obj, source) => {
                if (!obj || typeof obj !== 'object' || result.length >= 160) return;
                const stack = [{ value: obj, depth: 0 }];
                const visited = new Set();
                let steps = 0;
                while (stack.length && steps++ < 700 && result.length < 160) {
                  const cur = stack.pop();
                  const value = cur.value;
                  const d = cur.depth;
                  if (!value || typeof value !== 'object' || d > 4 || visited.has(value)) continue;
                  visited.add(value);
                  const directId = value.aweme_id || value.awemeId || value.aweme_id_str || value.awemeIdStr || value.item_id || value.itemId || value.video_id || value.videoId;
                  if (directId && idRe.test(String(directId))) add(directId, value, source);
                  for (const key of Object.keys(value).slice(0, 55)) {
                    if (/^(parent|children|child|sibling|return|stateNode|_owner)$/.test(key)) continue;
                    let child;
                    try { child = value[key]; } catch (e) { continue; }
                    if (typeof child === 'string') {
                      const m = child.match(/(?:aweme_id|awemeId|item_id|itemId|video_id|modal_id|vid)["'\s:=]+(\d{15,25})|\/video\/(\d{15,25})/);
                      if (m) add(m[1] || m[2], value, source);
                    } else if (child && typeof child === 'object') {
                      stack.push({ value: child, depth: d + 1 });
                    }
                  }
                }
              };
              const selector = '[data-e2e], [data-aweme-id], [data-item-id], [data-video-id], li, article, a, section, div';
              for (const node of Array.from(document.querySelectorAll(selector)).slice(0, 2600)) {
                if (!isCardLike(node)) continue;
                visibleNodes.push(node);
                if (visibleNodes.length >= 600) break;
              }
              for (const node of visibleNodes) {
                const keys = Object.keys(node).filter(k => k.startsWith('__reactProps$') || k.startsWith('__reactFiber$')).slice(0, 4);
                for (const key of keys) {
                  let value;
                  try { value = node[key]; } catch (e) { continue; }
                  if (!value) continue;
                  if (key.startsWith('__reactFiber$')) {
                    scan(value.memoizedProps, 'homepage_dom_visible_react_fiber');
                    scan(value.pendingProps, 'homepage_dom_visible_react_fiber');
                  } else {
                    scan(value, 'homepage_dom_visible_react_props');
                  }
                  if (result.length >= 160) break;
                }
                if (result.length >= 160) break;
              }
              return result.slice(0, 160);
            }
            """,
            {"homepageSecUid": homepage_sec_uid or ""},
        )
        if not isinstance(raw_items, list):
            return []
        return [item for item in raw_items if isinstance(item, dict)]

    def _extract_embedded_post_hints(self, page: Page) -> List[Dict[str, Any]]:
        try:
            payload = page.evaluate(
                r"""
                () => {
                  const chunks = [];
                  const scripts = Array.from(document.querySelectorAll('script'));
                  for (const script of scripts) {
                    const text = script.textContent || '';
                    // Only inspect explicit script state. Do not scan document.outerHTML:
                    // outerHTML can include virtualized/recommendation/cache fragments from
                    // unrelated authors and creates false homepage works.
                    if (text && (text.includes('aweme_id') || text.includes('awemeId') || text.includes('sec_uid') || text.includes('sec_user_id'))) {
                      chunks.push(text.slice(0, 900000));
                    }
                    if (chunks.length >= 8) break;
                  }
                  return chunks.join('\n');
                }
                """
            )
        except Exception:
            payload = ""
        return extract_embedded_aweme_hints(str(payload or ""), limit=120)

    def _try_direct_first_page_candidate(
        self,
        page: Page,
        homepage_url: str,
        max_posts: int,
    ) -> Optional[Dict[str, Any]]:
        homepage_sec_uid = extract_sec_uid_from_url(homepage_url)
        if not homepage_sec_uid:
            return {"debug": {"ok": False, "reason": "missing_sec_uid"}}
        count = min(max(int(max_posts or 0), 20), 50)
        try:
            cookie_info = page.evaluate(
                r"""
                () => {
                  const cookies = Object.fromEntries((document.cookie || '').split(';').map(x => x.trim()).filter(Boolean).map(x => {
                    const idx = x.indexOf('=');
                    return idx >= 0 ? [x.slice(0, idx), decodeURIComponent(x.slice(idx + 1))] : [x, ''];
                  }));
                  return {
                    msToken: cookies.msToken || cookies['msToken'] || '',
                    ttwid: cookies.ttwid || '',
                    screenWidth: window.screen && window.screen.width || 1920,
                    screenHeight: window.screen && window.screen.height || 1080,
                    language: navigator.language || 'zh-CN',
                    platform: navigator.platform || 'Win32',
                    browserOnline: navigator.onLine !== false,
                    cpu: navigator.hardwareConcurrency || 8,
                    memory: navigator.deviceMemory || 8,
                  };
                }
                """
            )
        except Exception:
            cookie_info = {}
        if not isinstance(cookie_info, dict):
            cookie_info = {}
        params = {
            "device_platform": "webapp",
            "aid": "6383",
            "channel": "channel_pc_web",
            "sec_user_id": homepage_sec_uid,
            "max_cursor": "0",
            "locate_query": "false",
            "show_live_replay_strategy": "1",
            "need_time_list": "1",
            "time_list_query": "0",
            "count": str(count),
            "publish_video_strategy_type": "2",
            "pc_client_type": "1",
            "version_code": "170400",
            "version_name": "17.4.0",
            "cookie_enabled": "true",
            "screen_width": str(cookie_info.get("screenWidth") or 1920),
            "screen_height": str(cookie_info.get("screenHeight") or 1080),
            "browser_language": str(cookie_info.get("language") or "zh-CN"),
            "browser_platform": str(cookie_info.get("platform") or "Win32"),
            "browser_name": "Chrome",
            "browser_online": "true" if cookie_info.get("browserOnline", True) else "false",
            "engine_name": "Blink",
            "os_name": "Windows",
            "cpu_core_num": str(cookie_info.get("cpu") or 8),
            "device_memory": str(cookie_info.get("memory") or 8),
            "platform": "PC",
            "downlink": "10",
            "effective_type": "4g",
            "round_trip_time": "50",
        }
        if cookie_info.get("msToken"):
            params["msToken"] = str(cookie_info["msToken"])
        target_url = "https://www.douyin.com/aweme/v1/web/aweme/post/?" + urlencode(params)
        debug: Dict[str, Any] = {"ok": False, "url": target_url, "sec_uid": homepage_sec_uid}
        try:
            payload = self._fetch_json(page, target_url)
        except Exception as exc:
            debug["error"] = str(exc)
            return {"debug": debug}
        aweme_list = recursive_find_aweme_list(payload) if isinstance(payload, dict) else []
        if not isinstance(payload, dict) or not aweme_list:
            debug["reason"] = "empty_or_rejected"
            if isinstance(payload, dict):
                debug["response_top_keys"] = list(payload.keys())[:20]
                debug["status_code"] = payload.get("status_code")
                debug["status_msg"] = payload.get("status_msg")
            return {"debug": debug}
        author_sec_uids = sorted({uid for uid in (extract_author_sec_uid(item) for item in aweme_list[:8]) if uid})
        cursor = extract_cursor(payload)
        has_more = extract_has_more(payload)
        score = self._score_candidate(
            request_url=target_url,
            payload=payload,
            aweme_list=aweme_list,
            homepage_sec_uid=homepage_sec_uid,
            template_sec_uid=homepage_sec_uid,
            author_sec_uids=author_sec_uids,
        ) + 20
        candidate = {
            "request_url": target_url,
            "status": 200,
            "method": "GET",
            "resource_type": "fetch_direct_fallback",
            "score": score,
            "aweme_count": len(aweme_list),
            "cursor": cursor,
            "has_more": has_more,
            "template_sec_uid": homepage_sec_uid,
            "author_sec_uids": author_sec_uids,
            "response_top_keys": list(payload.keys())[:40],
            "response_json": payload,
        }
        debug.update({"ok": True, "aweme_count": len(aweme_list), "cursor": cursor, "has_more": has_more})
        return {"debug": debug, "candidate": candidate}

    def _settle_page(self, page: Page, trigger_pause_sec: float) -> None:
        try:
            page.wait_for_load_state("networkidle", timeout=8000)
        except Exception:
            pass
        sleep_seconds(max(trigger_pause_sec, 0.8))

    def _homepage_state_snapshot(self, page: Page) -> Dict[str, Any]:
        try:
            snapshot = page.evaluate(
                r"""
                () => {
                  const bodyText = (document.body && document.body.innerText || '').replace(/\s+/g, ' ').trim();
                  const anchors = Array.from(document.querySelectorAll('a[href]'));
                  const hrefs = anchors.map(a => a.href || a.getAttribute('href') || '');
                  const videoHrefCount = hrefs.filter(h => /\/video\/\d{15,25}/.test(h)).length;
                  const modalHrefCount = hrefs.filter(h => /[?&](modal_id|aweme_id|item_id)=\d{15,25}/.test(h)).length;
                  const userPostListHrefCount = document.querySelectorAll('[data-e2e="user-post-list"] a[href*="/video/"], [data-e2e="user-post-list"] a[href*="modal_id="]').length;
                  const nonFooterProfileHrefCount = Array.from(document.querySelectorAll('a[href*="/video/"], a[href*="modal_id="]')).filter(a => !a.closest('footer, #douyin-header')).length;
                  const countNode = document.querySelector('#semiTabpost [data-e2e="user-tab-count"], [role="tab"][aria-selected="true"] [data-e2e="user-tab-count"], [data-e2e="user-tab-count"]');
                  const profilePostCountText = countNode ? (countNode.innerText || countNode.textContent || '').trim() : '';
                  const scriptsText = Array.from(document.querySelectorAll('script')).slice(0, 12).map(s => s.textContent || '').join('\n');
                  const scriptIdCount = (scriptsText.match(/\d{15,25}/g) || []).length;
                  const visibleCards = Array.from(document.querySelectorAll('[data-e2e], li, article, section, a[href]')).slice(0, 180).map(el => {
                    const txt = (el.innerText || el.getAttribute('aria-label') || el.getAttribute('title') || '').replace(/\s+/g, ' ').trim();
                    return txt.slice(0, 80);
                  }).filter(Boolean).slice(0, 12);
                  return {
                    title: document.title || '',
                    url: location.href,
                    readyState: document.readyState,
                    body_text_len: bodyText.length,
                    body_text_sample: bodyText.slice(0, 240),
                    anchor_count: anchors.length,
                    video_href_count: videoHrefCount,
                    modal_href_count: modalHrefCount,
                    user_post_list_href_count: userPostListHrefCount,
                    non_footer_profile_href_count: nonFooterProfileHrefCount,
                    profile_post_count_text: profilePostCountText,
                    script_numeric_id_count: scriptIdCount,
                    has_login_text: /登录|验证码|扫码|安全验证/.test(bodyText),
                    has_posts_tab_text: /作品|视频|投稿|Posts|Videos/.test(bodyText),
                    visible_text_samples: visibleCards,
                  };
                }
                """
            )
            return snapshot if isinstance(snapshot, dict) else {"ok": False, "reason": "non_dict_snapshot"}
        except Exception as exc:
            return {"ok": False, "error": str(exc)}

    def _try_close_overlays(self, page: Page) -> None:
        # Douyin frequently shows login/download popups that do not block DOMContentLoaded
        # but do block scroll and lazy loading. Keep this best-effort and silent.
        try:
            page.keyboard.press("Escape")
        except Exception:
            pass
        close_texts = ["关闭", "以后再说", "暂不", "我知道了", "取消"]
        for text in close_texts:
            try:
                locator = page.get_by_text(text, exact=True)
                if locator.count() > 0:
                    locator.first.click(timeout=700)
                    sleep_seconds(0.2)
                    return
            except Exception:
                continue

    def _wait_for_homepage_surface(self, page: Page, timeout_sec: float, runtime_debug: Dict[str, Any]) -> None:
        """Wait until the profile shell has enough real content to interact with.

        DOMContentLoaded is too early on Douyin profile pages: the account shell can be
        present while the work grid is not mounted. This wait is deliberately based on
        visible page signals instead of a brittle selector.
        """
        deadline = time.time() + max(timeout_sec, 1.0)
        snapshots: List[Dict[str, Any]] = []
        last_snapshot: Dict[str, Any] = {}
        while time.time() < deadline:
            last_snapshot = self._homepage_state_snapshot(page)
            if len(snapshots) < 5:
                snapshots.append(last_snapshot)
            if (
                last_snapshot.get("user_post_list_href_count", 0) > 0
                or last_snapshot.get("video_href_count", 0) > 0
                or last_snapshot.get("modal_href_count", 0) > 0
                or last_snapshot.get("profile_post_count_text")
                or (last_snapshot.get("has_posts_tab_text") and last_snapshot.get("body_text_len", 0) > 120)
            ):
                break
            sleep_seconds(0.35)
        runtime_debug["homepage_surface_wait"] = {
            "last": last_snapshot,
            "samples": snapshots,
        }

    def _scroll_homepage_surfaces(self, page: Page, delta_y: int) -> Dict[str, Any]:
        """Scroll the real scroll containers used by Douyin's virtualized grids.

        Wheel/JS window scrolling alone can be a no-op when the profile content sits
        inside an internal overflow container. This helper nudges document scrolling,
        the largest scrollable containers, and dispatches wheel/scroll events so the
        React lazy-loader sees realistic movement.
        """
        try:
            result = page.evaluate(
                r"""
                ({ deltaY }) => {
                  const beforeY = window.scrollY || document.documentElement.scrollTop || document.body.scrollTop || 0;
                  const candidates = [];
                  const pushCandidate = (el, label) => {
                    if (!el) return;
                    const style = window.getComputedStyle(el);
                    const rect = el.getBoundingClientRect ? el.getBoundingClientRect() : { width: 0, height: 0 };
                    const canScroll = (el.scrollHeight || 0) - (el.clientHeight || 0) > 80;
                    const overflowText = `${style.overflow || ''} ${style.overflowY || ''}`;
                    if (!canScroll && !/auto|scroll|overlay/i.test(overflowText)) return;
                    candidates.push({ el, label, area: Math.max(1, rect.width * rect.height), scrollHeight: el.scrollHeight || 0, clientHeight: el.clientHeight || 0, before: el.scrollTop || 0 });
                  };
                  pushCandidate(document.scrollingElement || document.documentElement || document.body, 'document');
                  for (const el of Array.from(document.querySelectorAll('main, [role="main"], [data-e2e], div, section, article')).slice(0, 4000)) {
                    pushCandidate(el, (el.getAttribute('data-e2e') || el.getAttribute('class') || el.tagName || 'node').toString().slice(0, 80));
                  }
                  candidates.sort((a, b) => (b.scrollHeight - b.clientHeight) - (a.scrollHeight - a.clientHeight) || b.area - a.area);
                  const used = [];
                  for (const item of candidates.slice(0, 8)) {
                    try {
                      item.el.scrollTop = (item.el.scrollTop || 0) + deltaY;
                      item.el.dispatchEvent(new WheelEvent('wheel', { bubbles: true, cancelable: true, deltaY }));
                      item.el.dispatchEvent(new Event('scroll', { bubbles: true }));
                      used.push({ label: item.label, before: item.before, after: item.el.scrollTop || 0, scrollHeight: item.scrollHeight, clientHeight: item.clientHeight });
                    } catch (e) {}
                  }
                  window.scrollBy(0, deltaY);
                  window.dispatchEvent(new WheelEvent('wheel', { bubbles: true, cancelable: true, deltaY }));
                  window.dispatchEvent(new Event('scroll', { bubbles: true }));
                  const afterY = window.scrollY || document.documentElement.scrollTop || document.body.scrollTop || 0;
                  return { ok: true, deltaY, beforeY, afterY, scrolled: used };
                }
                """,
                {"deltaY": int(delta_y)},
            )
            return result if isinstance(result, dict) else {"ok": False, "reason": "non_dict_result"}
        except Exception as exc:
            return {"ok": False, "error": str(exc)}

    def _ensure_homepage_context(self, page: Page, homepage_url: str, runtime_debug: Dict[str, Any], action_label: str) -> None:
        try:
            current = page.url or ""
            current_id = extract_video_id_from_url(current)
            homepage_sec_uid = extract_sec_uid_from_url(homepage_url)
            current_sec_uid = extract_sec_uid_from_url(current)
            if "/video/" in current or "modal_id=" in current or (homepage_sec_uid and current_sec_uid and homepage_sec_uid != current_sec_uid):
                runtime_debug["trigger_actions"].append(
                    {
                        "action": f"{action_label}_restore_homepage",
                        "from_url": current,
                        "video_id": current_id,
                    }
                )
                page.goto(homepage_url, wait_until="domcontentloaded", timeout=60000)
                self._settle_page(page, 0.8)
        except Exception as exc:
            runtime_debug["trigger_actions"].append({"action": f"{action_label}_restore_homepage", "error": str(exc)})

    def _prepare_homepage_for_dom(
        self,
        page: Page,
        homepage_url: str,
        trigger_tab_click: bool,
        trigger_pause_sec: float,
        runtime_debug: Dict[str, Any],
        action_label: str,
    ) -> None:
        """Prepare the profile page without clicking work cards.

        This is intentionally conservative: close overlays, focus the page, and only
        activate a top navigation tab when we can identify it safely. It never clicks
        arbitrary anchors/divs by text, because that can accidentally open a work.
        """
        self._try_close_overlays(page)
        self._wait_for_homepage_surface(page, timeout_sec=max(4.0, trigger_pause_sec * 2), runtime_debug=runtime_debug)
        try:
            page.bring_to_front()
            page.evaluate("() => { try { window.focus(); document.body && document.body.focus && document.body.focus(); } catch (e) {} }")
        except Exception:
            pass

        if trigger_tab_click:
            before_url = page.url
            clicked = self._try_activate_posts_tab(page)
            sleep_seconds(max(trigger_pause_sec, 0.8))
            self._ensure_homepage_context(page, homepage_url, runtime_debug, action_label)
            runtime_debug["trigger_actions"].append(
                {
                    "action": f"{action_label}_activate_posts_tab",
                    "clicked": clicked,
                    "before_url": before_url,
                    "after_url": page.url,
                }
            )
        else:
            runtime_debug["trigger_actions"].append({"action": f"{action_label}_activate_posts_tab", "clicked": False, "skipped": True})

        self._ensure_homepage_context(page, homepage_url, runtime_debug, action_label)

    def _trigger_post_requests(
        self,
        page: Page,
        homepage_url: str,
        trigger_scroll_rounds: int,
        trigger_pause_sec: float,
        trigger_tab_click: bool,
        runtime_debug: Dict[str, Any],
    ) -> None:
        self._prepare_homepage_for_dom(
            page=page,
            homepage_url=homepage_url,
            trigger_tab_click=trigger_tab_click,
            trigger_pause_sec=trigger_pause_sec,
            runtime_debug=runtime_debug,
            action_label="interface_fallback_prepare",
        )

        # First nudge: mount profile tabs/grids without jumping too far down the page.
        try:
            page.mouse.move(720, 520)
            page.mouse.wheel(0, 420)
            surface_result = self._scroll_homepage_surfaces(page, 360)
            runtime_debug["trigger_actions"].append({"action": "initial_lazyload_nudge", "delta_y": 420, "surfaces": surface_result})
        except Exception as exc:
            runtime_debug["trigger_actions"].append({"action": "initial_lazyload_nudge", "error": str(exc)})
        sleep_seconds(max(trigger_pause_sec, 0.9))

        rounds = max(trigger_scroll_rounds, 0)
        for round_index in range(rounds):
            delta = 1700 if round_index % 2 == 0 else 1100
            action_log: Dict[str, Any] = {"action": "scroll", "round": round_index + 1, "delta_y": delta}
            try:
                # Run all three because different Douyin layouts bind listeners to
                # different surfaces in headless Chromium.
                page.mouse.move(720 + (round_index % 3) * 90, 620)
                page.mouse.wheel(0, delta)
                if round_index % 2 == 1:
                    page.keyboard.press("PageDown")
                surface_result = self._scroll_homepage_surfaces(page, delta)
                action_log["surfaces"] = surface_result
                if round_index in {2, 5, 8}:
                    # Small bounce helps virtualized grids emit another page-list request.
                    page.mouse.wheel(0, -520)
                    self._scroll_homepage_surfaces(page, -420)
                    sleep_seconds(0.25)
                    page.mouse.wheel(0, 1500)
                    self._scroll_homepage_surfaces(page, 1500)
                    action_log["bounce"] = True
            except Exception as exc:
                action_log["error"] = str(exc)
            runtime_debug["trigger_actions"].append(action_log)
            sleep_seconds(max(trigger_pause_sec, 0.85))

    def _try_activate_posts_tab(self, page: Page) -> bool:
        """Safely activate the works tab without clicking arbitrary cards.

        Previous broad text-click fallbacks could match text inside a work/card and
        accidentally open a video. Keep this limited to semantic tabs/buttons
        near the top half of the page and never click plain div/span nodes.
        """
        for name in TAB_ROLE_CANDIDATES:
            try:
                locator = page.get_by_role("tab", name=name, exact=True)
                if locator.count() > 0:
                    candidate = locator.first
                    box = candidate.bounding_box(timeout=700)
                    if box and box.get("y", 9999) < 420:
                        candidate.click(timeout=1500)
                        return True
            except Exception:
                continue

        css_templates = [
            "[role=tab]:has-text('{text}')",
            "button:has-text('{text}')",
            "[role=button]:has-text('{text}')",
        ]
        for text in TAB_TEXT_CANDIDATES:
            for template in css_templates:
                try:
                    locator = page.locator(template.format(text=text))
                    count = min(locator.count(), 6)
                    for idx in range(count):
                        candidate = locator.nth(idx)
                        if not candidate.is_visible(timeout=300):
                            continue
                        box = candidate.bounding_box(timeout=500)
                        if not box or box.get("width", 0) < 8 or box.get("height", 0) < 8:
                            continue
                        # Work cards are usually lower in the viewport; tab controls
                        # should be in the profile header/top navigation area.
                        if box.get("y", 9999) > 420:
                            continue
                        href = ""
                        try:
                            href = candidate.get_attribute("href") or ""
                        except Exception:
                            href = ""
                        if extract_video_id_from_url(href):
                            continue
                        candidate.click(timeout=1500)
                        return True
                except Exception:
                    continue
        return False

    def _capture_candidate(self, response: Response, homepage_url: str) -> Optional[Dict[str, Any]]:
        req = response.request
        if req.resource_type not in {"xhr", "fetch"}:
            return None
        lower_url = response.url.lower()
        if "douyin.com" not in lower_url:
            return None
        if response.status != 200:
            return None

        # Do not rely solely on URL names. On Douyin, the same homepage list
        # payload may be served by renamed web endpoints. We still prefer hinted
        # URLs, but allow JSON-looking XHR/fetch responses through to the payload
        # shape validator below.
        headers = {str(k).lower(): str(v).lower() for k, v in response.headers.items()}
        content_type = headers.get("content-type", "")
        hinted_url = any(hint in lower_url for hint in POST_URL_HINTS)
        if not hinted_url and "json" not in content_type and "aweme" not in lower_url and "post" not in lower_url:
            return None

        data = safe_json_loads(response.text())
        if not isinstance(data, dict):
            return None
        if not recursive_has_post_shape(data):
            return None

        aweme_list = recursive_find_aweme_list(data) or []
        if not aweme_list:
            return None

        template_sec_uid = extract_sec_uid_from_url(response.url)
        homepage_sec_uid = extract_sec_uid_from_url(homepage_url)
        author_sec_uids = sorted({uid for uid in (extract_author_sec_uid(item) for item in aweme_list[:8]) if uid})
        cursor = extract_cursor(data)
        has_more = extract_has_more(data)
        score = self._score_candidate(
            request_url=response.url,
            payload=data,
            aweme_list=aweme_list,
            homepage_sec_uid=homepage_sec_uid,
            template_sec_uid=template_sec_uid,
            author_sec_uids=author_sec_uids,
        )

        return {
            "unique_key": f"{response.url}|{response.status}|{len(aweme_list)}|{cursor}|{has_more}",
            "request_url": response.url,
            "status": response.status,
            "method": req.method,
            "resource_type": req.resource_type,
            "score": score,
            "aweme_count": len(aweme_list),
            "cursor": cursor,
            "has_more": has_more,
            "template_sec_uid": template_sec_uid,
            "author_sec_uids": author_sec_uids,
            "response_top_keys": list(data.keys())[:40],
            "response_json": data,
        }

    def _score_candidate(
        self,
        request_url: str,
        payload: Dict[str, Any],
        aweme_list: List[Dict[str, Any]],
        homepage_sec_uid: Optional[str],
        template_sec_uid: Optional[str],
        author_sec_uids: List[str],
    ) -> int:
        score = 0
        lower_url = request_url.lower()
        if "aweme_list" in payload:
            score += 20
        if len(aweme_list) > 0:
            score += min(15, len(aweme_list))
        if extract_cursor(payload) is not None:
            score += 5
        if extract_has_more(payload) in {0, 1}:
            score += 4
        if any(key in lower_url for key in ["/post", "/aweme/post", "/post/list"]):
            score += 5
        if any(key in lower_url for key in ["sec_uid=", "sec_user_id="]):
            score += 5
        sample = aweme_list[:3]
        if sample and all(text_clean(item.get("aweme_id")) for item in sample):
            score += 8
        if sample and all(isinstance(item.get("video"), dict) for item in sample):
            score += 6
        if homepage_sec_uid and template_sec_uid and homepage_sec_uid == template_sec_uid:
            score += 10
        if homepage_sec_uid and homepage_sec_uid in author_sec_uids:
            score += 10
        if len(author_sec_uids) == 1:
            score += 3
        if extract_nested_value(payload, ["mix_id", "mixId"]) is not None:
            score -= 6
        return score

    def _select_best_candidate(self, candidates: List[Dict[str, Any]], homepage_url: str) -> Optional[Dict[str, Any]]:
        if not candidates:
            return None
        homepage_sec_uid = extract_sec_uid_from_url(homepage_url)

        def sort_key(item: Dict[str, Any]):
            sec_uid = item.get("template_sec_uid")
            author_sec_uids = item.get("author_sec_uids") or []
            sec_match = int(bool(homepage_sec_uid and sec_uid and homepage_sec_uid == sec_uid))
            author_match = int(bool(homepage_sec_uid and homepage_sec_uid in author_sec_uids))
            return (
                -sec_match,
                -author_match,
                -item["score"],
                -item["aweme_count"],
                item["request_url"],
            )

        ranked = sorted(candidates, key=sort_key)
        return ranked[0]

    def _capture_next_page_via_ui(
        self,
        page: Page,
        known_request_url: str,
        current_count: int,
        trigger_pause_sec: float,
    ) -> Optional[Dict[str, Any]]:
        captured: List[Dict[str, Any]] = []
        known_prefix = urlparse(known_request_url).path

        def on_response(response: Response):
            try:
                if response.request.resource_type not in {"xhr", "fetch"}:
                    return
                if urlparse(response.url).path != known_prefix:
                    return
                if response.status != 200:
                    return
                data = safe_json_loads(response.text())
                if isinstance(data, dict) and recursive_find_aweme_list(data):
                    captured.append(data)
            except Exception:
                return

        page.on("response", on_response)
        try:
            page.mouse.wheel(0, 2200)
            sleep_seconds(max(trigger_pause_sec, 0.8))
            end_at = time.time() + 6
            while time.time() < end_at:
                if captured:
                    return captured[-1]
                sleep_seconds(0.25)
            return None
        finally:
            try:
                page.remove_listener("response", on_response)
            except Exception:
                pass

    def _fetch_json(self, page: Page, target_url: str) -> Optional[Dict[str, Any]]:
        timeout_ms = max(3000, int(os.getenv("ACS_POSTS_FETCH_TIMEOUT_MS", "12000")))
        result = page.evaluate(
            """
            async ({ targetUrl, timeoutMs }) => {
              const controller = new AbortController();
              const timer = setTimeout(() => controller.abort(), timeoutMs);
              try {
                const resp = await fetch(targetUrl, {
                  method: 'GET',
                  credentials: 'include',
                  signal: controller.signal,
                });
                const text = await resp.text();
                return {
                  ok: resp.ok,
                  status: resp.status,
                  text,
                  aborted: false,
                };
              } catch (err) {
                return {
                  ok: false,
                  status: 0,
                  text: '',
                  aborted: err && err.name === 'AbortError',
                  error: err && (err.message || String(err)),
                };
              } finally {
                clearTimeout(timer);
              }
            }
            """,
            {"targetUrl": target_url, "timeoutMs": timeout_ms},
        )
        if not result or not result.get("ok"):
            if isinstance(result, dict) and result.get("aborted"):
                print(f"[STEP] 主页作品接口请求超时，已切换后续兜底：timeout={timeout_ms}ms", flush=True)
            return None
        return safe_json_loads(result.get("text"))
