from __future__ import annotations

import hashlib
import json
import re
import time
from datetime import datetime
from pathlib import Path
from typing import Any, Dict, List, Optional, Tuple
from urllib.parse import parse_qs, urlencode, urlparse, urlunparse

from playwright.sync_api import BrowserContext, Page, Response

from .api_utils import (
    build_url_with_overrides,
    detect_query_key,
    extract_cursor,
    extract_has_more,
    safe_json_loads,
    text_clean,
    ts_to_iso,
)
from .models import CommentRecord, ContentRecord, RunResult
from .pacing import CrawlPacingPolicy, sleep_seconds
from .storage import output_section_dir, safe_path_key


COMMENT_URL_PATTERN = "/aweme/v1/web/comment/list/"
COMMENT_FETCH_TIMEOUT_MS = 15000
COMMENT_REPLY_FETCH_TIMEOUT_MS = 10000
REPLY_DIAG_TEXT_LIMIT = 1200



def infer_content_id(url: str) -> str:
    """Extract the real Douyin aweme/video id from a URL or text.

    Short share links such as https://v.douyin.com/xxxx/ are not the real
    aweme id. Returning that short code causes the direct comment API to use
    an invalid aweme_id and then silently collect 0 comments.  Only return a
    numeric 15-25 digit content id; callers that need a debug/file key should
    provide their own fallback.
    """
    text = str(url or "").strip()
    if not text:
        return ""
    match = re.search(r"(?:/video/|[?&](?:aweme_id|item_id|modal_id|video_id|vid)=)(\d{15,25})", text)
    if match:
        return match.group(1)
    match = re.search(r"\b(\d{15,25})\b", text)
    return match.group(1) if match else ""


def extract_media_urls(comment: Dict[str, Any]) -> List[str]:
    urls: List[str] = []
    seen = set()

    image_list = comment.get("image_list") or []
    if isinstance(image_list, list):
        for image in image_list:
            if not isinstance(image, dict):
                continue
            candidates = []
            if isinstance(image.get("url_list"), list):
                candidates.extend([x for x in image.get("url_list") if isinstance(x, str)])
            if isinstance(image.get("origin_url"), dict):
                for arr in image.get("origin_url", {}).values():
                    if isinstance(arr, list):
                        candidates.extend([x for x in arr if isinstance(x, str)])
            if isinstance(image.get("url"), str):
                candidates.append(image.get("url"))
            for value in candidates:
                if value and value not in seen:
                    seen.add(value)
                    urls.append(value)
    return urls




def normalize_identity_text(value: Any) -> str:
    cleaned = text_clean(value)
    return str(cleaned or "").strip().lower()


def append_author_marker(value: Optional[str]) -> Optional[str]:
    text = text_clean(value)
    if not text:
        return text
    return text if "（作者）" in text or "(作者)" in text else f"{text}（作者）"


def _identity_values(values: List[Any]) -> set[str]:
    return {normalize_identity_text(v) for v in values if normalize_identity_text(v)}


def is_author_comment_user(user: Dict[str, Any], item: Dict[str, Any], author_identity: Optional[Dict[str, Any]] = None) -> bool:
    """Best-effort detection for whether a comment/reply user is the video author.

    Douyin response fields are not completely stable across page versions.  Use
    explicit flags first, then compare uid / sec_uid / nickname against the
    author identity extracted from page/source context.  False negatives are
    safer than false positives: if we are unsure, do not mark normal users as
    author.
    """
    if not isinstance(user, dict):
        user = {}
    if not isinstance(item, dict):
        item = {}
    flags = [
        item.get("is_author"),
        item.get("isAuthor"),
        item.get("is_aweme_author"),
        item.get("isAwemeAuthor"),
        item.get("is_video_author"),
        item.get("isVideoAuthor"),
        item.get("author"),
        user.get("is_author"),
        user.get("isAuthor"),
        user.get("is_aweme_author"),
        user.get("isAwemeAuthor"),
        user.get("is_video_author"),
        user.get("isVideoAuthor"),
    ]
    for flag in flags:
        if isinstance(flag, bool) and flag:
            return True
        if isinstance(flag, (int, float)) and int(flag) == 1:
            return True
        if isinstance(flag, str) and flag.strip().lower() in {"1", "true", "yes", "author", "creator"}:
            return True

    identity = author_identity or {}
    author_ids = _identity_values([
        identity.get("uid"), identity.get("user_id"), identity.get("author_uid"),
        identity.get("sec_uid"), identity.get("author_sec_uid"), identity.get("unique_id"),
        identity.get("short_id"),
    ])
    user_ids = _identity_values([
        user.get("uid"), user.get("sec_uid"), user.get("unique_id"), user.get("short_id"),
        item.get("user_id"), item.get("userId"), item.get("sec_uid"), item.get("secUid"),
    ])
    if author_ids and user_ids and author_ids.intersection(user_ids):
        return True

    # Nickname-only matching is weaker; only use it when at least one author id
    # could not be resolved.  This helps direct-content mode where target label
    # may be the author name, while still avoiding excessive false positives.
    author_names = _identity_values([identity.get("nickname"), identity.get("author_nickname"), identity.get("name")])
    user_names = _identity_values([user.get("nickname"), item.get("nickname"), item.get("user_name"), item.get("userName")])
    if author_names and user_names and author_names.intersection(user_names) and not author_ids:
        return True
    return False


def mark_author_nickname(
    nickname: Optional[str],
    user: Dict[str, Any],
    item: Dict[str, Any],
    author_identity: Optional[Dict[str, Any]] = None,
) -> Optional[str]:
    return append_author_marker(nickname) if is_author_comment_user(user, item, author_identity) else nickname


def map_comment(
    platform: str,
    source_account_url: str,
    source_content_url: str,
    item: Dict[str, Any],
    *,
    parent_comment_id: Optional[str] = None,
    author_identity: Optional[Dict[str, Any]] = None,
) -> CommentRecord:
    user = item.get("user") or {}
    text_value = text_clean(item.get("text"))
    media_urls = extract_media_urls(item)
    has_media = len(media_urls) > 0

    if has_media and text_value:
        comment_type = "mixed"
        comment_text = text_value
    elif has_media and not text_value:
        comment_type = "image"
        comment_text = "[image_comment]"
    else:
        comment_type = "text"
        comment_text = text_value

    sec_uid = text_clean(user.get("sec_uid"))
    uid = text_clean(user.get("uid"))
    user_id = sec_uid or uid
    nickname = mark_author_nickname(text_clean(user.get("nickname")), user, item, author_identity)

    return CommentRecord(
        comment_id=text_clean(item.get("cid")),
        parent_comment_id=parent_comment_id,
        user_id=user_id,
        nickname=nickname,
        comment_text=comment_text,
        comment_time_raw=str(item.get("create_time")) if item.get("create_time") is not None else None,
        comment_time_iso=ts_to_iso(item.get("create_time")),
        visible_region=text_clean(item.get("ip_label")),
        source_account_url=source_account_url,
        source_content_url=source_content_url,
        platform=platform,
        comment_type=comment_type,
        has_media=has_media,
        media_urls=media_urls,
        replies=[],
    )


class DouyinCommentsAPICollector:
    def __init__(
        self,
        platform: str,
        context: BrowserContext,
        output_dir: Path,
        pacing_policy: CrawlPacingPolicy | None = None,
    ):
        if platform != "douyin":
            raise ValueError("当前 comments api collector 仅支持 douyin")
        self.platform = platform
        self.context = context
        self.output_dir = output_dir
        self.pacing = pacing_policy or CrawlPacingPolicy()

    def _normalize_content_url(self, content_url: str) -> str:
        parsed = urlparse(content_url)
        qs = parse_qs(parsed.query)

        if "/video/" in parsed.path:
            return content_url

        if "/user/" in parsed.path:
            modal_id = (qs.get("modal_id") or [None])[0]
            vid = (qs.get("vid") or [None])[0]
            target_id = modal_id or vid
            if target_id:
                return f"https://www.douyin.com/video/{target_id}"

        return content_url

    def _build_homepage_modal_url(self, source_account_url: str, video_id: str) -> Optional[str]:
        if not source_account_url or not video_id:
            return None
        parsed = urlparse(source_account_url)
        if "douyin.com" not in parsed.netloc.lower() or "/user/" not in parsed.path:
            return None

        qs = parse_qs(parsed.query, keep_blank_values=True)
        qs["modal_id"] = [video_id]
        # 抖音不同页面版本可能读取 modal_id 或 vid，这里两个都带上，提升在主页弹层内触发评论接口的概率。
        qs["vid"] = [video_id]
        query = urlencode(qs, doseq=True)
        return urlunparse((parsed.scheme or "https", parsed.netloc, parsed.path, parsed.params, query, parsed.fragment))

    def _candidate_open_urls(self, content_url: str, source_account_url: str, normalized_content_url: str, video_id: str) -> List[str]:
        candidates: List[str] = []

        def add(value: Optional[str]) -> None:
            if not value:
                return
            if value not in candidates:
                candidates.append(value)

        # 主页模式下优先使用“主页 + modal_id/vid”打开作品。
        # 单主页旧流程通常更容易在主页弹层里触发评论接口；改为多主页后如果只打开 /video/{id}，
        # 有些账号/作品不会自动请求 comment/list，导致候选数为 0。
        add(self._build_homepage_modal_url(source_account_url, video_id))
        add(normalized_content_url)
        add(content_url)
        return candidates

    def _canonical_video_url(self, video_id: str) -> str:
        return f"https://www.douyin.com/video/{video_id}" if video_id else ""

    def _extract_content_id_from_page(self, page: Page) -> str:
        """Resolve a real aweme id from an opened page.

        Direct content targets are often v.douyin.com short links.  The comment
        API must use the redirected /video/<aweme_id> value rather than the
        short-code path segment.  Keep the DOM scan bounded and conservative so
        it cannot stall the normal comment collection path.
        """
        for value in [getattr(page, "url", "") or ""]:
            content_id = infer_content_id(value)
            if content_id:
                return content_id
        try:
            values = page.evaluate(
                """
                () => {
                  const out = [];
                  const add = (v) => { if (typeof v === 'string' && v) out.push(v); };
                  add(location.href);
                  add(document.querySelector('link[rel="canonical"]')?.href || '');
                  add(document.querySelector('meta[property="og:url"]')?.content || '');
                  add(document.querySelector('meta[name="twitter:url"]')?.content || '');
                  const scripts = Array.from(document.scripts || []).slice(0, 80);
                  for (const script of scripts) {
                    const text = script.textContent || '';
                    if (!text) continue;
                    const hit = text.match(/(?:aweme_id|awemeId|aweme_id_str|item_id|itemId|video_id|modal_id)[\"'\s:=]+(\d{15,25})/);
                    if (hit) add(hit[1]);
                    const videoHit = text.match(/\/video\/(\d{15,25})/);
                    if (videoHit) add(videoHit[1]);
                  }
                  return out.slice(0, 120);
                }
                """
            )
            if isinstance(values, list):
                for value in values:
                    content_id = infer_content_id(str(value or ""))
                    if content_id:
                        return content_id
        except Exception:
            pass
        return ""

    def _trigger_comment_requests(self, page: Page, pause_sec: float = 0.9) -> None:
        sleep_seconds(max(pause_sec, 0.6))

        try:
            page.bring_to_front()
        except Exception:
            pass

        # 先等待评论区域自然出现。部分作品页在登录态恢复后会自动请求评论接口，
        # 过早点击反而可能点到遮罩或视频区域。
        for selector in [
            "text=全部评论",
            "text=评论",
            "div[data-e2e='comment-list']",
            "div[class*='comment-list']",
            "div[class*='commentList']",
            "div[class*='comment-panel']",
            "div[class*='commentPanel']",
            "textarea",
            "input[placeholder*='评论']",
        ]:
            try:
                loc = page.locator(selector).first
                if loc.count() > 0 and loc.is_visible(timeout=700):
                    sleep_seconds(max(pause_sec, 0.6))
                    return
            except Exception:
                continue

        # 直接作品页在后台无界面模式下不一定会自动拉评论。
        # 多做几种低风险触发：轻微滚动、PageDown、点击评论按钮/评论文案。
        try:
            page.mouse.wheel(0, 700)
            sleep_seconds(0.35)
        except Exception:
            pass
        try:
            page.keyboard.press("PageDown")
            sleep_seconds(0.35)
        except Exception:
            pass

        selectors = [
            "[data-e2e='comment-icon']",
            "[data-e2e='comment']",
            "[aria-label*='评论']",
            "button[aria-label*='评论']",
            "button:has-text('评论')",
            "span:has-text('评论')",
            "div:has-text('评论')",
            "text=全部评论",
        ]

        for selector in selectors:
            try:
                loc = page.locator(selector).first
                if loc.count() > 0 and loc.is_visible(timeout=700):
                    loc.click(timeout=1600)
                    sleep_seconds(max(pause_sec, 0.8))
                    return
            except Exception:
                continue

        try:
            page.evaluate(
                """
                () => {
                    const nodes = Array.from(document.querySelectorAll('button, a, span, div'));
                    const target = nodes.find(el => {
                        const t = (el.innerText || el.getAttribute('aria-label') || '').trim();
                        return t.includes('评论') || t.includes('全部评论');
                    });
                    if (target) {
                        target.scrollIntoView({ block: 'center', inline: 'center' });
                        target.click();
                    }
                }
                """
            )
        except Exception:
            pass

        sleep_seconds(max(pause_sec, 0.8))
        try:
            page.mouse.wheel(0, 1200)
        except Exception:
            pass
        sleep_seconds(max(pause_sec, 0.8))

    def _is_primary_comment_url(self, url: str) -> bool:
        text = str(url or "").lower()
        return COMMENT_URL_PATTERN in text and "/reply" not in text and "reply" not in urlparse(text).path.lower()

    def _is_reply_comment_url(self, url: str) -> bool:
        parsed = urlparse(str(url or ""))
        path = (parsed.path or "").lower()
        return "/aweme/v1/web/comment/list/reply" in path or "/comment/list/reply" in path

    def _reply_parent_id_from_url(self, url: str) -> str:
        try:
            qs = parse_qs(urlparse(str(url or "")).query, keep_blank_values=True)
            for key in ["comment_id", "commentId", "cid", "root_comment_id", "root_commentId"]:
                value = (qs.get(key) or [""])[0]
                cleaned = text_clean(value)
                if cleaned:
                    return cleaned
        except Exception:
            pass
        return ""

    def _select_best_candidate(self, candidates: List[Dict[str, Any]]) -> Optional[Dict[str, Any]]:
        if not candidates:
            return None

        non_empty = [item for item in candidates if (item.get("comments_count") or 0) > 0]
        pool = non_empty or candidates
        # 作品精准监听里页面第一次触发到的 comment/list 有时只是一个很小的
        # 首屏/预览包，例如 raw=5 cursor=10，继续用这个模板会漏掉 cursor 0
        # 之后的若干一级评论。这里优先选择“一级评论主接口 + 首批评论数更多”的
        # 候选；直接 cursor=0 的主接口候选如果返回更多评论，会覆盖首屏预览包。
        ranked = sorted(
            pool,
            key=lambda item: (
                0 if self._is_primary_comment_url(str(item.get("request_url") or "")) else 1,
                -(item.get("comments_count") or 0),
                -int(item.get("score") or 0),
                str(item.get("request_url") or ""),
            ),
        )
        return ranked[0]

    def _payload_value(self, payload: Dict[str, Any], keys: List[str]) -> Any:
        if not isinstance(payload, dict):
            return None
        for key in keys:
            if key in payload:
                return payload.get(key)
        return None

    def _payload_has_more(self, payload: Dict[str, Any]) -> Optional[int]:
        value = self._payload_value(payload, ["has_more", "hasMore"])
        if value is None:
            return None
        try:
            return 1 if int(value) else 0
        except Exception:
            return 1 if bool(value) else 0

    def _payload_cursor(self, payload: Dict[str, Any]) -> Any:
        # 评论分页必须优先读取顶层 cursor/max_cursor。旧版的递归提取可能误读到
        # comments 内部字段，导致首批 32 条后误判没有下一页。
        return self._payload_value(payload, ["max_cursor", "cursor", "offset"])

    def _payload_total_hint(self, payload: Dict[str, Any]) -> Optional[int]:
        value = self._payload_value(payload, ["total", "total_count", "totalCount", "comment_total", "commentTotal"])
        try:
            if value is None:
                return None
            return max(int(value), 0)
        except Exception:
            return None

    def _cursor_to_int(self, value: Any) -> Optional[int]:
        try:
            if value is None:
                return None
            text = str(value).strip()
            if not text or not re.fullmatch(r"-?\d+", text):
                return None
            return int(text)
        except Exception:
            return None

    def _resolve_next_cursor(self, cursor: Any, collected_count: int, raw_count: int) -> Any:
        cursor_int = self._cursor_to_int(cursor)
        if cursor_int is None:
            return max(collected_count, raw_count, 0)
        if cursor_int <= 0 and collected_count > 0:
            # 抖音评论接口常用 cursor 作为偏移量。若首批 payload 没给出有效
            # 下一页 cursor，但首批数量已达到分页大小，则用已采集数量继续探测。
            return collected_count
        return cursor

    def _should_probe_next_comment_page(
        self,
        *,
        has_more: Optional[int],
        total_hint: Optional[int],
        collected_count: int,
        raw_count: int,
        page_no: int,
        forced_probe_count: int,
    ) -> bool:
        if has_more == 1:
            return True
        if total_hint is not None and collected_count < total_hint:
            return True
        # 有些首批接口 has_more / total 字段缺失或被前端包装为 0，但首批能返回
        # 30+ 条通常说明还有分页空间。额外探测 2 页，拿不到新数据再停。
        if page_no <= 3 and forced_probe_count < 2 and raw_count >= 28:
            return True
        return False

    def _bootstrap_direct_comment_template(self, page: Page, video_id: str, page_size: int) -> Optional[Dict[str, Any]]:
        """当页面未自动触发 comment/list 时，尝试在抖音页面上下文里直接请求一级评论接口。

        这里不在 Python 侧直接发 HTTP，而是在已登录的浏览器页面里 fetch：
        1. 可以复用当前页面 Cookie、UA、Referer 等浏览器上下文；
        2. 如果平台前端对 fetch/XMLHttpRequest 做了签名或参数补全，也更可能被页面环境接住；
        3. 作为兜底逻辑，避免多主页/后台无界面模式下“评论接口模板候选数为 0”后直接结束。
        """
        if not video_id:
            return None
        payload = None
        last_error = None
        for attempt in range(1, 4):
            try:
                page.wait_for_load_state("domcontentloaded", timeout=8000)
            except Exception:
                pass
            try:
                payload = page.evaluate(
                    """
                    async ({ awemeId, count, timeoutMs }) => {
                  const readCookie = (name) => {
                    const prefix = `${name}=`;
                    const hit = document.cookie.split(';').map(v => v.trim()).find(v => v.startsWith(prefix));
                    return hit ? decodeURIComponent(hit.slice(prefix.length)) : '';
                  };
                  const url = new URL('/aweme/v1/web/comment/list/', window.location.origin || 'https://www.douyin.com');
                  const nav = window.navigator || {};
                  const screenInfo = window.screen || {};
                  const params = {
                    device_platform: 'webapp',
                    aid: '6383',
                    channel: 'channel_pc_web',
                    aweme_id: awemeId,
                    cursor: '0',
                    count: String(count || 20),
                    item_type: '0',
                    insert_ids: '',
                    whale_cut_token: '',
                    cut_version: '1',
                    rcFT: '',
                    pc_client_type: '1',
                    version_code: '170400',
                    version_name: '17.4.0',
                    cookie_enabled: String(nav.cookieEnabled !== false),
                    screen_width: String(screenInfo.width || 1440),
                    screen_height: String(screenInfo.height || 1080),
                    browser_language: nav.language || 'zh-CN',
                    browser_platform: nav.platform || 'Win32',
                    browser_name: 'Chrome',
                    browser_version: ((nav.userAgent || '').match(/Chrome\/([0-9.]+)/) || [null, '120.0.0.0'])[1],
                    browser_online: String(nav.onLine !== false),
                    engine_name: 'Blink',
                    engine_version: ((nav.userAgent || '').match(/Chrome\/([0-9.]+)/) || [null, '120.0.0.0'])[1],
                    os_name: 'Windows',
                    os_version: '10',
                    cpu_core_num: String(nav.hardwareConcurrency || 8),
                    device_memory: String(nav.deviceMemory || 8),
                    platform: 'PC',
                    downlink: '10',
                    effective_type: '4g',
                    round_trip_time: '50',
                  };
                  const msToken = readCookie('msToken');
                  if (msToken) params.msToken = msToken;
                  for (const [key, value] of Object.entries(params)) url.searchParams.set(key, value);
                  const controller = new AbortController();
                  const timer = setTimeout(() => controller.abort('timeout'), Math.max(Number(timeoutMs || 15000), 3000));
                  try {
                    const resp = await fetch(url.toString(), {
                      method: 'GET',
                      credentials: 'include',
                      signal: controller.signal,
                      headers: {
                        accept: 'application/json, text/plain, */*',
                      },
                    });
                    const text = await resp.text();
                    return { ok: resp.ok, status: resp.status, url: url.toString(), text };
                  } catch (err) {
                    return {
                      ok: false,
                      status: 0,
                      url: url.toString(),
                      text: '',
                      error: String((err && (err.name || err.message)) || err || 'fetch_failed'),
                    };
                  } finally {
                    clearTimeout(timer);
                  }
                }
                """,
                    {"awemeId": video_id, "count": max(min(int(page_size or 20), 50), 10), "timeoutMs": COMMENT_FETCH_TIMEOUT_MS},
                )
                break
            except Exception as exc:
                last_error = exc
                print(f"[COMMENTS] 直接请求评论接口异常：{exc}，重试 {attempt}/3", flush=True)
                sleep_seconds(0.8 * attempt)
        if payload is None and last_error is not None:
            print(f"[COMMENTS] 直接请求评论接口最终失败：{last_error}", flush=True)
            return None

        if not isinstance(payload, dict):
            return None
        data = safe_json_loads(payload.get("text"))
        if not payload.get("ok") or not isinstance(data, dict):
            print(f"[COMMENTS] 直接请求评论接口失败：status={payload.get('status')} error={payload.get('error') or '-'}", flush=True)
            return None
        comments = data.get("comments")
        if not isinstance(comments, list):
            print(f"[COMMENTS] 直接请求评论接口未返回 comments 列表：status={payload.get('status')}", flush=True)
            return None

        score = 18 + (8 if comments else 0)
        if self._payload_total_hint(data) is not None:
            score += 2
        if self._payload_has_more(data) in {0, 1}:
            score += 1
        if self._payload_cursor(data) is not None:
            score += 1
        print(f"[COMMENTS] 直接请求评论接口成功：首批评论数={len(comments)}", flush=True)
        return {
            "request_url": str(payload.get("url") or ""),
            "status": int(payload.get("status") or 200),
            "response_json": data,
            "score": score,
            "comments_count": len(comments),
            "source": "direct_fetch_cursor0",
        }

    def _reply_total_hint(self, item: Dict[str, Any]) -> int:
        if not isinstance(item, dict):
            return 0
        for key in [
            "reply_comment_total",
            "replyCommentTotal",
            "reply_count",
            "replyCount",
            "reply_comment_count",
            "replyCommentCount",
            "reply_total",
            "replyTotal",
            "reply_total_count",
            "replyTotalCount",
        ]:
            try:
                value = item.get(key)
                if value is None:
                    continue
                return max(int(value), 0)
            except Exception:
                continue
        replies = self._inline_replies(item)
        return len(replies) if isinstance(replies, list) else 0

    def _looks_like_comment_item(self, value: Any) -> bool:
        if not isinstance(value, dict):
            return False
        cid = value.get("cid") or value.get("comment_id") or value.get("commentId")
        user = value.get("user") or value.get("user_info") or value.get("userInfo")
        text_value = value.get("text") if value.get("text") is not None else value.get("comment_text")
        return bool(cid) and isinstance(user, dict) and (text_value is not None or value.get("create_time") is not None)

    def _extract_comment_list_from_payload(self, payload: Any, *, prefer_reply_fields: bool = False) -> List[Dict[str, Any]]:
        """Extract comment/reply arrays from unstable Douyin payload shapes.

        The primary comment list usually returns top-level ``comments``.  Some
        reply/preview structures are nested under ``reply_comment`` /
        ``reply_comment_list`` / ``data.comments`` or similar aliases.  Keep the
        scan conservative: only return lists whose entries look like comment
        objects, so image/tag arrays are not misread as replies.
        """
        if not isinstance(payload, dict):
            return []
        direct_keys = [
            "reply_comment",
            "reply_comment_list",
            "replyComments",
            "replyCommentList",
            "reply_list",
            "replyList",
            "replies",
            "children",
            "child_comments",
            "childComments",
        ]
        if prefer_reply_fields:
            direct_keys += ["comments", "comment_list", "commentList", "items", "list"]
        else:
            direct_keys = ["comments", "comment_list", "commentList", "items", "list"] + direct_keys

        seen_ids: set[str] = set()
        result: List[Dict[str, Any]] = []

        def add_list(value: Any) -> bool:
            added = False
            if not isinstance(value, list):
                return False
            for entry in value:
                if not self._looks_like_comment_item(entry):
                    continue
                cid = text_clean(entry.get("cid") or entry.get("comment_id") or entry.get("commentId"))
                if cid and cid in seen_ids:
                    continue
                if cid:
                    seen_ids.add(cid)
                result.append(entry)
                added = True
            return added

        for key in direct_keys:
            if add_list(payload.get(key)):
                return result

        # Some payloads wrap the real response under data / aweme_detail / comment_info.
        for key in ["data", "result", "comment_info", "commentInfo", "reply_info", "replyInfo"]:
            value = payload.get(key)
            if isinstance(value, dict):
                nested = self._extract_comment_list_from_payload(value, prefer_reply_fields=prefer_reply_fields)
                for entry in nested:
                    cid = text_clean(entry.get("cid") or entry.get("comment_id") or entry.get("commentId"))
                    if cid and cid in seen_ids:
                        continue
                    if cid:
                        seen_ids.add(cid)
                    result.append(entry)
                if result:
                    return result
            elif add_list(value):
                return result
        return result

    def _inline_replies(self, item: Dict[str, Any]) -> List[Dict[str, Any]]:
        if not isinstance(item, dict):
            return []

        # Prefer explicit reply fields carried by the一级评论接口.  Douyin may
        # expose only a small preview here, but those rows are valid and should
        # be collected before falling back to the secondary reply endpoint.
        replies = self._extract_comment_list_from_payload(item, prefer_reply_fields=True)
        parent_cid = text_clean(item.get("cid") or item.get("comment_id") or item.get("commentId"))
        if parent_cid:
            replies = [entry for entry in replies if text_clean(entry.get("cid") or entry.get("comment_id") or entry.get("commentId")) != parent_cid]
        if replies:
            return replies

        # Conservative recursive scan for page variants that nest preview
        # replies one or two levels deeper, e.g. {reply_info: {comments: [...]}}.
        result: List[Dict[str, Any]] = []
        seen_ids: set[str] = set()

        def scan(obj: Any, depth: int = 0) -> None:
            if depth > 4 or not isinstance(obj, dict):
                return
            for key, value in obj.items():
                key_lower = str(key or "").lower()
                if isinstance(value, list) and ("reply" in key_lower or "comment" in key_lower or key_lower in {"children", "items", "list"}):
                    for entry in value:
                        if not self._looks_like_comment_item(entry):
                            continue
                        cid = text_clean(entry.get("cid") or entry.get("comment_id") or entry.get("commentId"))
                        if parent_cid and cid == parent_cid:
                            continue
                        if cid and cid in seen_ids:
                            continue
                        if cid:
                            seen_ids.add(cid)
                        result.append(entry)
                elif isinstance(value, dict) and ("reply" in key_lower or "comment" in key_lower or key_lower in {"data", "result"}):
                    scan(value, depth + 1)

        scan(item)
        return result

    def _extract_author_identity_from_page(
        self,
        page: Page,
        source_account_url: str = "",
        expected_author_nickname: str | None = None,
    ) -> Dict[str, Any]:
        identity: Dict[str, Any] = {}
        source_sec_uid = ""
        try:
            parsed = urlparse(source_account_url or "")
            m = re.search(r"/user/([^/?#]+)", parsed.path or "")
            if m:
                source_sec_uid = text_clean(m.group(1))
        except Exception:
            source_sec_uid = ""
        if source_sec_uid:
            identity["sec_uid"] = source_sec_uid
        if expected_author_nickname:
            identity["nickname"] = text_clean(expected_author_nickname)

        try:
            values = page.evaluate(
                """
                () => {
                  const out = {};
                  const add = (k, v) => { if (typeof v === 'string' && v.trim() && !out[k]) out[k] = v.trim(); };
                  const metas = Array.from(document.querySelectorAll('meta'));
                  for (const meta of metas) {
                    const key = meta.getAttribute('property') || meta.getAttribute('name') || '';
                    const value = meta.getAttribute('content') || '';
                    if (/author|creator/i.test(key)) add('nickname', value);
                  }
                  const scripts = Array.from(document.scripts || []).slice(0, 120);
                  for (const script of scripts) {
                    const text = script.textContent || '';
                    if (!text) continue;
                    const authorBlock = text.match(/"author"\s*:\s*\{[\s\S]{0,3000}?\}/);
                    const hay = authorBlock ? authorBlock[0] : text.slice(0, 60000);
                    const uid = hay.match(/"uid"\s*:\s*"(\d{4,30})"/);
                    const sec = hay.match(/"sec_uid"\s*:\s*"([^"]{8,120})"/);
                    const nickname = hay.match(/"nickname"\s*:\s*"([^"]{1,120})"/);
                    const unique = hay.match(/"unique_id"\s*:\s*"([^"]{1,80})"/);
                    const shortId = hay.match(/"short_id"\s*:\s*"([^"]{1,80})"/);
                    if (uid) add('uid', uid[1]);
                    if (sec) add('sec_uid', sec[1]);
                    if (nickname) add('nickname', nickname[1]);
                    if (unique) add('unique_id', unique[1]);
                    if (shortId) add('short_id', shortId[1]);
                    if (out.uid || out.sec_uid) break;
                  }
                  return out;
                }
                """
            )
            if isinstance(values, dict):
                for key, value in values.items():
                    cleaned = text_clean(value)
                    if cleaned and not identity.get(key):
                        identity[key] = cleaned
        except Exception:
            pass
        return identity

    def _build_reply_url_from_template(
        self,
        template_url: str,
        video_id: str,
        parent_comment_id: str,
        cursor: Any,
        count: int,
    ) -> str:
        parsed = urlparse(template_url)
        path = parsed.path or COMMENT_URL_PATTERN
        if "list/reply" not in path:
            path = path.replace("/aweme/v1/web/comment/list/", "/aweme/v1/web/comment/list/reply/")
            if path == parsed.path:
                path = "/aweme/v1/web/comment/list/reply/"
        qs = parse_qs(parsed.query, keep_blank_values=True)
        qs["item_id"] = [str(video_id or "")]
        qs["aweme_id"] = [str(video_id or "")]
        qs["comment_id"] = [str(parent_comment_id or "")]
        qs["cursor"] = [str(cursor if cursor is not None else 0)]
        qs["count"] = [str(max(min(int(count or 20), 50), 1))]
        query = urlencode(qs, doseq=True)
        return urlunparse((parsed.scheme or "https", parsed.netloc or "www.douyin.com", path, parsed.params, query, parsed.fragment))

    def _safe_write_debug_json(self, path: Path, payload: Dict[str, Any]) -> None:
        try:
            path.parent.mkdir(parents=True, exist_ok=True)
            path.write_text(json.dumps(payload, ensure_ascii=False, indent=2), encoding="utf-8")
        except Exception:
            pass

    def _response_text_head(self, value: Any, limit: int = REPLY_DIAG_TEXT_LIMIT) -> str:
        text = str(value or "")
        text = re.sub(r"\s+", " ", text).strip()
        if len(text) > limit:
            return text[:limit] + "..."
        return text

    def _dom_reply_comment_id(self, parent_comment_id: str, nickname: str, text: str, index: int = 0) -> str:
        seed = f"{parent_comment_id}|{nickname}|{text}|{index}".encode("utf-8", errors="ignore")
        return "dom_reply_" + hashlib.sha1(seed).hexdigest()[:24]

    def _dom_reply_raw_item(self, parent_comment_id: str, entry: Dict[str, Any], index: int = 0) -> Dict[str, Any]:
        nickname = text_clean(entry.get("nickname") or entry.get("user_name") or entry.get("userName"))
        text_value = text_clean(entry.get("text") or entry.get("comment_text") or entry.get("commentText"))
        cid = text_clean(entry.get("cid")) or self._dom_reply_comment_id(parent_comment_id, nickname, text_value, index)
        raw: Dict[str, Any] = {
            "cid": cid,
            "text": text_value,
            "user": {
                "nickname": nickname,
                "uid": text_clean(entry.get("user_id") or entry.get("userId")) or "",
                "sec_uid": text_clean(entry.get("sec_uid") or entry.get("secUid")) or "",
            },
        }
        # DOM 采集拿不到稳定时间戳；保留原始展示时间供后续排查，不传 create_time，避免错误时间。
        time_text = text_clean(entry.get("time_text") or entry.get("timeText"))
        if time_text:
            raw["dom_time_text"] = time_text
        return raw

    def _payload_status_msg(self, payload: Any) -> Tuple[Any, Any]:
        if not isinstance(payload, dict):
            return None, None
        code = payload.get("status_code")
        if code is None:
            code = payload.get("statusCode") or payload.get("code") or payload.get("status")
        msg = payload.get("status_msg") or payload.get("statusMsg") or payload.get("msg") or payload.get("message")
        return code, msg

    def _fetch_json_with_context_request(
        self,
        target_url: str,
        *,
        timeout_ms: int = COMMENT_FETCH_TIMEOUT_MS,
        referer: str = "",
        label: str = "评论接口",
        debug_path: Optional[Path] = None,
        return_diagnostic: bool = False,
    ) -> Optional[Dict[str, Any]]:
        """Fetch JSON with Playwright APIRequestContext and a hard Python-side timeout.

        page.evaluate(fetch(...)) can still hang when the browser driver or page
        network stack gets stuck before the JavaScript AbortController callback is
        delivered.  The APIRequestContext timeout is enforced by Playwright on
        the Python side and shares cookies with the browser context, so it is a
        safer choice for small JSON comment/reply API calls.  When
        return_diagnostic=True, failures return a diagnostic object instead of
        None so GUI logs can show the real HTTP status/body shape.
        """
        timeout_ms = max(int(timeout_ms or COMMENT_FETCH_TIMEOUT_MS), 3000)
        headers = {
            "accept": "application/json, text/plain, */*",
        }
        if referer:
            headers["referer"] = referer
        parsed_target = urlparse(target_url)
        query_keys = sorted(parse_qs(parsed_target.query, keep_blank_values=True).keys())
        attempts: List[Dict[str, Any]] = []
        last_diag: Dict[str, Any] = {
            "__diagnostic__": True,
            "ok": False,
            "url": target_url,
            "url_path": parsed_target.path,
            "query_keys": query_keys,
            "error": "not_started",
        }

        for attempt in range(1, 3):
            try:
                response = self.context.request.get(target_url, headers=headers, timeout=timeout_ms)
                status = int(getattr(response, "status", 0) or 0)
                response_headers = {}
                try:
                    response_headers = dict(getattr(response, "headers", {}) or {})
                except Exception:
                    response_headers = {}
                content_type = response_headers.get("content-type") or response_headers.get("Content-Type") or ""
                body_text = ""
                try:
                    body_text = response.text()
                except Exception as exc:
                    body_text = ""
                    attempts.append({"attempt": attempt, "status": status, "content_type": content_type, "error": f"read_body_failed:{exc}"})

                data = safe_json_loads(body_text)
                status_code, status_msg = self._payload_status_msg(data)
                diag = {
                    "__diagnostic__": True,
                    "ok": 200 <= status < 300 and isinstance(data, dict),
                    "attempt": attempt,
                    "url": target_url,
                    "url_path": parsed_target.path,
                    "query_keys": query_keys,
                    "http_status": status,
                    "content_type": content_type,
                    "body_len": len(body_text or ""),
                    "body_head": self._response_text_head(body_text),
                    "parsed_type": type(data).__name__ if data is not None else None,
                    "parsed_keys": list(data.keys())[:30] if isinstance(data, dict) else [],
                    "status_code": status_code,
                    "status_msg": status_msg,
                }
                attempts.append({k: v for k, v in diag.items() if k not in {"body_head", "url"}})
                last_diag = dict(diag)
                last_diag["attempts"] = attempts

                if debug_path is not None:
                    self._safe_write_debug_json(debug_path, last_diag)

                if status < 200 or status >= 300:
                    print(
                        f"[STEP] {label}请求失败：status={status} content_type={content_type or '-'} "
                        f"path={parsed_target.path} body={self._response_text_head(body_text, 220) or '-'}，重试 {attempt}/2",
                        flush=True,
                    )
                    sleep_seconds(0.5 * attempt)
                    continue
                if not isinstance(data, dict):
                    print(
                        f"[STEP] {label}响应不是 JSON 对象：status={status} content_type={content_type or '-'} "
                        f"body={self._response_text_head(body_text, 220) or '-'}，重试 {attempt}/2",
                        flush=True,
                    )
                    sleep_seconds(0.5 * attempt)
                    continue
                return data
            except Exception as exc:
                diag = {
                    "__diagnostic__": True,
                    "ok": False,
                    "attempt": attempt,
                    "url": target_url,
                    "url_path": parsed_target.path,
                    "query_keys": query_keys,
                    "error": str(exc),
                    "error_type": type(exc).__name__,
                }
                attempts.append({k: v for k, v in diag.items() if k != "url"})
                last_diag = dict(diag)
                last_diag["attempts"] = attempts
                if debug_path is not None:
                    self._safe_write_debug_json(debug_path, last_diag)
                print(f"[STEP] {label}请求异常/超时：{type(exc).__name__}: {exc}，重试 {attempt}/2", flush=True)
                sleep_seconds(0.5 * attempt)

        print(
            f"[STEP] {label}请求最终失败：path={parsed_target.path} "
            f"status={last_diag.get('http_status', '-')} error={last_diag.get('error', '-')} debug={debug_path or '-'}",
            flush=True,
        )
        return last_diag if return_diagnostic else None

    def _fetch_json_with_page_fetch_diagnostic(
        self,
        page: Page,
        target_url: str,
        *,
        timeout_ms: int = COMMENT_REPLY_FETCH_TIMEOUT_MS,
        label: str = "接口",
        debug_path: Optional[Path] = None,
    ) -> Optional[Dict[str, Any]]:
        """Fetch inside the real Douyin page context and keep diagnostics.

        The primary comment endpoint works from page.fetch because it reuses the
        current Douyin page origin, cookies and front-end environment.  The
        secondary reply endpoint can return an empty 200 body when requested via
        APIRequestContext, so try page-context fetch first and only then fall back
        to the hard-timeout API request.
        """
        timeout_ms = max(int(timeout_ms or COMMENT_REPLY_FETCH_TIMEOUT_MS), 3000)
        parsed_target = urlparse(target_url)
        query_keys = sorted(parse_qs(parsed_target.query, keep_blank_values=True).keys())
        for attempt in range(1, 3):
            try:
                result = page.evaluate(
                    """
                    async ({ targetUrl, timeoutMs }) => {
                      const controller = new AbortController();
                      const timer = setTimeout(() => controller.abort('timeout'), Math.max(Number(timeoutMs || 10000), 3000));
                      try {
                        const resp = await fetch(targetUrl, {
                          method: 'GET',
                          credentials: 'include',
                          signal: controller.signal,
                          headers: {
                            accept: 'application/json, text/plain, */*',
                          },
                        });
                        const text = await resp.text();
                        const headers = {};
                        try { for (const [k, v] of resp.headers.entries()) headers[k] = v; } catch (_) {}
                        return { ok: resp.ok, status: resp.status, url: targetUrl, text, headers };
                      } catch (err) {
                        return {
                          ok: false,
                          status: 0,
                          url: targetUrl,
                          text: '',
                          headers: {},
                          error: String((err && (err.name || err.message)) || err || 'fetch_failed'),
                        };
                      } finally {
                        clearTimeout(timer);
                      }
                    }
                    """,
                    {"targetUrl": target_url, "timeoutMs": timeout_ms},
                )
            except Exception as exc:
                print(f"[STEP] {label}页面上下文请求异常：{type(exc).__name__}: {exc}，重试 {attempt}/2", flush=True)
                sleep_seconds(0.4 * attempt)
                continue

            if not isinstance(result, dict):
                print(f"[STEP] {label}页面上下文请求返回异常对象，重试 {attempt}/2", flush=True)
                sleep_seconds(0.4 * attempt)
                continue

            status = int(result.get("status") or 0)
            body_text = str(result.get("text") or "")
            headers = result.get("headers") if isinstance(result.get("headers"), dict) else {}
            content_type = headers.get("content-type") or headers.get("Content-Type") or ""
            data = safe_json_loads(body_text)
            status_code, status_msg = self._payload_status_msg(data)
            diag = {
                "__diagnostic__": True,
                "source": "page_fetch",
                "ok": 200 <= status < 300 and isinstance(data, dict),
                "attempt": attempt,
                "url": target_url,
                "url_path": parsed_target.path,
                "query_keys": query_keys,
                "http_status": status,
                "content_type": content_type,
                "body_len": len(body_text or ""),
                "body_head": self._response_text_head(body_text),
                "parsed_type": type(data).__name__ if data is not None else None,
                "parsed_keys": list(data.keys())[:30] if isinstance(data, dict) else [],
                "status_code": status_code,
                "status_msg": status_msg,
                "error": result.get("error"),
            }
            if debug_path is not None:
                self._safe_write_debug_json(debug_path.with_name(debug_path.stem + "_page_fetch.json"), diag)

            if 200 <= status < 300 and isinstance(data, dict):
                print(
                    f"[STEP] {label}页面上下文请求成功：status={status} body_len={len(body_text or '')} "
                    f"keys={','.join(list(data.keys())[:12])}",
                    flush=True,
                )
                return data

            print(
                f"[STEP] {label}页面上下文请求未拿到有效 JSON：status={status if status else '-'} "
                f"content_type={content_type or '-'} body_len={len(body_text or '')} "
                f"body={self._response_text_head(body_text, 220) or '-'}，重试 {attempt}/2",
                flush=True,
            )
            sleep_seconds(0.4 * attempt)
        return None


    def _fetch_json_with_page_xhr_diagnostic(
        self,
        page: Page,
        target_url: str,
        *,
        timeout_ms: int = COMMENT_REPLY_FETCH_TIMEOUT_MS,
        label: str = "接口",
        debug_path: Optional[Path] = None,
    ) -> Optional[Dict[str, Any]]:
        """Fetch JSON from the real page by XMLHttpRequest with browser timeout.

        The Douyin reply endpoint has repeatedly returned ``HTTP 200 + empty
        body`` through Playwright APIRequestContext.  Use the loaded Douyin page
        itself to issue the request first, because this is closest to the real
        front-end environment and reuses credentials / UA / referer / cookies.
        This method is still bounded by XHR timeout and Python logs diagnostics.
        """
        timeout_ms = max(int(timeout_ms or COMMENT_REPLY_FETCH_TIMEOUT_MS), 3000)
        parsed_target = urlparse(target_url)
        query_keys = sorted(parse_qs(parsed_target.query, keep_blank_values=True).keys())
        for attempt in range(1, 3):
            try:
                result = page.evaluate(
                    """
                    ({ targetUrl, timeoutMs }) => new Promise((resolve) => {
                      try {
                        const xhr = new XMLHttpRequest();
                        let done = false;
                        const finish = (payload) => {
                          if (done) return;
                          done = true;
                          resolve(payload);
                        };
                        const timer = setTimeout(() => {
                          try { xhr.abort(); } catch (_) {}
                          finish({ ok: false, status: 0, url: targetUrl, text: '', headers: '', error: 'xhr_timeout' });
                        }, Math.max(Number(timeoutMs || 10000), 3000));
                        xhr.open('GET', targetUrl, true);
                        xhr.withCredentials = true;
                        xhr.timeout = Math.max(Number(timeoutMs || 10000), 3000);
                        xhr.setRequestHeader('Accept', 'application/json, text/plain, */*');
                        try { xhr.setRequestHeader('X-Requested-With', 'XMLHttpRequest'); } catch (_) {}
                        xhr.onreadystatechange = () => {
                          if (xhr.readyState !== 4) return;
                          clearTimeout(timer);
                          finish({
                            ok: xhr.status >= 200 && xhr.status < 300,
                            status: xhr.status || 0,
                            url: targetUrl,
                            text: xhr.responseText || '',
                            headers: xhr.getAllResponseHeaders ? xhr.getAllResponseHeaders() : '',
                          });
                        };
                        xhr.onerror = () => { clearTimeout(timer); finish({ ok: false, status: xhr.status || 0, url: targetUrl, text: xhr.responseText || '', headers: xhr.getAllResponseHeaders ? xhr.getAllResponseHeaders() : '', error: 'xhr_error' }); };
                        xhr.ontimeout = () => { clearTimeout(timer); finish({ ok: false, status: xhr.status || 0, url: targetUrl, text: xhr.responseText || '', headers: xhr.getAllResponseHeaders ? xhr.getAllResponseHeaders() : '', error: 'xhr_timeout_event' }); };
                        xhr.send(null);
                      } catch (err) {
                        resolve({ ok: false, status: 0, url: targetUrl, text: '', headers: '', error: String((err && (err.name || err.message)) || err || 'xhr_failed') });
                      }
                    })
                    """,
                    {"targetUrl": target_url, "timeoutMs": timeout_ms},
                )
            except Exception as exc:
                print(f"[STEP] {label}页面XHR异常：{type(exc).__name__}: {exc}，重试 {attempt}/2", flush=True)
                sleep_seconds(0.35 * attempt)
                continue

            if not isinstance(result, dict):
                print(f"[STEP] {label}页面XHR返回异常对象，重试 {attempt}/2", flush=True)
                sleep_seconds(0.35 * attempt)
                continue

            status = int(result.get("status") or 0)
            body_text = str(result.get("text") or "")
            headers_text = str(result.get("headers") or "")
            content_type = ""
            for line in headers_text.splitlines():
                if line.lower().startswith("content-type:"):
                    content_type = line.split(":", 1)[1].strip()
                    break
            data = safe_json_loads(body_text)
            status_code, status_msg = self._payload_status_msg(data)
            diag = {
                "__diagnostic__": True,
                "source": "page_xhr",
                "ok": 200 <= status < 300 and isinstance(data, dict),
                "attempt": attempt,
                "url": target_url,
                "url_path": parsed_target.path,
                "query_keys": query_keys,
                "http_status": status,
                "content_type": content_type,
                "body_len": len(body_text or ""),
                "body_head": self._response_text_head(body_text),
                "parsed_type": type(data).__name__ if data is not None else None,
                "parsed_keys": list(data.keys())[:30] if isinstance(data, dict) else [],
                "status_code": status_code,
                "status_msg": status_msg,
                "error": result.get("error"),
            }
            if debug_path is not None:
                self._safe_write_debug_json(debug_path.with_name(debug_path.stem + "_page_xhr.json"), diag)

            if 200 <= status < 300 and isinstance(data, dict):
                print(
                    f"[STEP] {label}页面XHR成功：status={status} body_len={len(body_text or '')} "
                    f"keys={','.join(list(data.keys())[:12])}",
                    flush=True,
                )
                return data

            print(
                f"[STEP] {label}页面XHR未拿到有效 JSON：status={status if status else '-'} "
                f"content_type={content_type or '-'} body_len={len(body_text or '')} "
                f"body={self._response_text_head(body_text, 220) or '-'}，重试 {attempt}/2",
                flush=True,
            )
            sleep_seconds(0.35 * attempt)
        return None


    def _fetch_reply_page_direct_browser(
        self,
        page: Page,
        video_id: str,
        parent_comment_id: str,
        cursor: Any,
        count: int,
        *,
        debug_path: Optional[Path] = None,
    ) -> Optional[Dict[str, Any]]:
        """Fetch Douyin second-level replies from the real page with full PC params.

        The previous fallback reused the first-level comment URL template.  The
        uploaded diagnostics showed that template did not carry several params
        used by the working first-level bootstrap request (version/screen/network
        and optional msToken), and the reply endpoint consistently returned
        HTTP 200 with an empty body.  Build the reply URL inside the loaded
        Douyin page instead, mirroring the successful first-level request.
        """
        if not video_id or not parent_comment_id:
            return None
        timeout_ms = max(int(COMMENT_REPLY_FETCH_TIMEOUT_MS or 10000), 3000)
        for attempt in range(1, 3):
            print(
                f"[STEP] 二级评论页面完整参数请求开始：cid={parent_comment_id} cursor={cursor} count={count} timeout={timeout_ms}ms attempt={attempt}/2",
                flush=True,
            )
            try:
                payload = page.evaluate(
                    """
                    async ({ awemeId, parentCommentId, cursor, count, timeoutMs }) => {
                      const readCookie = (name) => {
                        const prefix = `${name}=`;
                        const hit = document.cookie.split(';').map(v => v.trim()).find(v => v.startsWith(prefix));
                        return hit ? decodeURIComponent(hit.slice(prefix.length)) : '';
                      };
                      const nav = window.navigator || {};
                      const screenInfo = window.screen || {};
                      const ua = nav.userAgent || '';
                      const chromeVersion = (ua.match(/Chrome\/([0-9.]+)/) || [null, '120.0.0.0'])[1];
                      const url = new URL('/aweme/v1/web/comment/list/reply/', window.location.origin || 'https://www.douyin.com');
                      const params = {
                        device_platform: 'webapp',
                        aid: '6383',
                        channel: 'channel_pc_web',
                        item_id: String(awemeId || ''),
                        aweme_id: String(awemeId || ''),
                        comment_id: String(parentCommentId || ''),
                        cursor: String(cursor == null ? 0 : cursor),
                        count: String(Math.max(Math.min(Number(count || 20), 50), 1)),
                        item_type: '0',
                        insert_ids: '',
                        whale_cut_token: '',
                        cut_version: '1',
                        rcFT: '',
                        pc_client_type: '1',
                        version_code: '170400',
                        version_name: '17.4.0',
                        cookie_enabled: String(nav.cookieEnabled !== false),
                        screen_width: String(screenInfo.width || 1440),
                        screen_height: String(screenInfo.height || 1080),
                        browser_language: nav.language || 'zh-CN',
                        browser_platform: nav.platform || 'Win32',
                        browser_name: 'Chrome',
                        browser_version: chromeVersion,
                        browser_online: String(nav.onLine !== false),
                        engine_name: 'Blink',
                        engine_version: chromeVersion,
                        os_name: 'Windows',
                        os_version: '10',
                        cpu_core_num: String(nav.hardwareConcurrency || 8),
                        device_memory: String(nav.deviceMemory || 8),
                        platform: 'PC',
                        downlink: '10',
                        effective_type: '4g',
                        round_trip_time: '50',
                      };
                      const msToken = readCookie('msToken');
                      if (msToken) params.msToken = msToken;
                      for (const [key, value] of Object.entries(params)) url.searchParams.set(key, value);

                      const signUrlBestEffort = async (urlObj) => {
                        const info = { attempted: false, ok: false, source: '', type: '', error: '', keys: [] };
                        const cloneWithQuery = (baseUrl, queryText) => {
                          const u = new URL(baseUrl);
                          String(queryText || '').replace(/^\?/, '').split('&').forEach((part) => {
                            if (!part) return;
                            const idx = part.indexOf('=');
                            if (idx <= 0) return;
                            const key = decodeURIComponent(part.slice(0, idx));
                            const value = decodeURIComponent(part.slice(idx + 1));
                            if (key) u.searchParams.set(key, value);
                          });
                          return u.toString();
                        };
                        const applyResult = (res, source) => {
                          if (!res) return '';
                          let nextUrl = '';
                          if (typeof res === 'string') {
                            const value = res.trim();
                            if (!value) return '';
                            if (/^https?:\/\//i.test(value)) {
                              nextUrl = value;
                              info.type = 'url_string';
                            } else if (value.includes('a_bogus=') || value.includes('X-Bogus=') || value.includes('_signature=')) {
                              nextUrl = cloneWithQuery(urlObj.toString(), value);
                              info.type = 'query_string';
                            } else {
                              // Douyin reply endpoint diagnostics showed 200 + empty body without a_bogus.
                              // When the in-page signer returns a bare token, use it as a_bogus first.
                              const u = new URL(urlObj.toString());
                              if (value.startsWith('_')) {
                                u.searchParams.set('_signature', value);
                                info.type = 'bare_token_as_signature';
                              } else {
                                u.searchParams.set('a_bogus', value);
                                info.type = 'bare_token_as_a_bogus';
                              }
                              nextUrl = u.toString();
                            }
                          } else if (typeof res === 'object') {
                            const u = new URL(urlObj.toString());
                            const keys = Object.keys(res);
                            info.keys = keys.slice(0, 20);
                            const urlValue = res.url || res.href || res.signed_url || res.signedUrl;
                            if (typeof urlValue === 'string' && /^https?:\/\//i.test(urlValue)) {
                              nextUrl = urlValue;
                              info.type = 'object_url';
                            } else {
                              const possible = ['a_bogus', 'X-Bogus', 'x-bogus', 'XBogus', '_signature', 'signature'];
                              for (const key of possible) {
                                const value = res[key];
                                if (value != null && String(value)) {
                                  const mappedKey = key === 'x-bogus' || key === 'XBogus' ? 'X-Bogus' : key;
                                  u.searchParams.set(mappedKey, String(value));
                                }
                              }
                              nextUrl = u.toString();
                              info.type = 'object_params';
                            }
                          }
                          if (nextUrl) {
                            const signedObj = new URL(nextUrl);
                            info.attempted = true;
                            info.ok = signedObj.searchParams.has('a_bogus') || signedObj.searchParams.has('X-Bogus') || signedObj.searchParams.has('_signature');
                            info.source = source;
                            return nextUrl;
                          }
                          return '';
                        };

                        const ac = window.byted_acrawler || window._byted_acrawler || window.bytedAcrawler || null;
                        if (ac) {
                          const methods = ['sign', 'signUrl', 'frontierSign'];
                          const urlText = urlObj.toString();
                          const relText = `${urlObj.pathname}${urlObj.search}`;
                          for (const method of methods) {
                            if (typeof ac[method] !== 'function') continue;
                            const calls = [
                              () => ac[method]({ url: urlText }),
                              () => ac[method](urlText),
                              () => ac[method]({ url: relText }),
                              () => ac[method](relText),
                            ];
                            for (const call of calls) {
                              try {
                                info.attempted = true;
                                const signed = applyResult(await Promise.resolve(call()), `byted_acrawler.${method}`);
                                if (signed) return { url: signed, sign: info };
                              } catch (err) {
                                info.error = String((err && (err.message || err.name)) || err || 'sign_failed');
                              }
                            }
                          }
                        }
                        // Some bdms builds expose a_bogus on window after XHR/sign initialization.
                        try {
                          const bogus = window.a_bogus || window.A_BOGUS || '';
                          if (bogus && !urlObj.searchParams.has('a_bogus')) {
                            const u = new URL(urlObj.toString());
                            u.searchParams.set('a_bogus', String(bogus));
                            info.attempted = true;
                            info.ok = true;
                            info.source = 'window.a_bogus';
                            info.type = 'global_a_bogus';
                            return { url: u.toString(), sign: info };
                          }
                        } catch (_) {}
                        return { url: urlObj.toString(), sign: info };
                      };

                      const signed = await signUrlBestEffort(url);
                      const requestUrl = signed.url || url.toString();
                      const hardTimeoutMs = Math.max(Number(timeoutMs || 10000), 3000);
                      const fetchPromise = (async () => {
                        const controller = new AbortController();
                        const timer = setTimeout(() => {
                          try { controller.abort(); } catch (_) {}
                        }, hardTimeoutMs);
                        try {
                          const resp = await fetch(requestUrl, {
                            method: 'GET',
                            credentials: 'include',
                            signal: controller.signal,
                            headers: { accept: 'application/json, text/plain, */*' },
                          });
                          const text = await resp.text();
                          const headers = {};
                          try { for (const [k, v] of resp.headers.entries()) headers[k] = v; } catch (_) {}
                          return { ok: resp.ok, status: resp.status, url: requestUrl, original_url: url.toString(), sign: signed.sign, text, headers };
                        } catch (err) {
                          return {
                            ok: false,
                            status: 0,
                            url: requestUrl,
                            original_url: url.toString(),
                            sign: signed.sign,
                            text: '',
                            headers: {},
                            error: String((err && (err.name || err.message)) || err || 'fetch_failed'),
                          };
                        } finally {
                          clearTimeout(timer);
                        }
                      })();
                      const timeoutPromise = new Promise((resolve) => {
                        setTimeout(() => resolve({
                          ok: false,
                          status: 0,
                          url: requestUrl,
                          original_url: url.toString(),
                          sign: signed.sign,
                          text: '',
                          headers: {},
                          error: 'page_full_params_fetch_timeout',
                          timeout_ms: hardTimeoutMs,
                        }), hardTimeoutMs + 500);
                      });
                      return await Promise.race([fetchPromise, timeoutPromise]);
                    }
                    """,
                    {
                        "awemeId": str(video_id or ""),
                        "parentCommentId": str(parent_comment_id or ""),
                        "cursor": str(cursor if cursor is not None else 0),
                        "count": max(min(int(count or 20), 50), 1),
                        "timeoutMs": timeout_ms,
                    },
                )
            except Exception as exc:
                print(f"[STEP] 二级评论页面完整参数请求异常：{type(exc).__name__}: {exc}，重试 {attempt}/2", flush=True)
                sleep_seconds(0.4 * attempt)
                continue

            if not isinstance(payload, dict):
                print(f"[STEP] 二级评论页面完整参数请求返回异常对象，重试 {attempt}/2", flush=True)
                sleep_seconds(0.4 * attempt)
                continue

            target_url = str(payload.get("url") or "")
            sign_info = payload.get("sign") if isinstance(payload.get("sign"), dict) else {}
            parsed_target = urlparse(target_url)
            query_keys = sorted(parse_qs(parsed_target.query, keep_blank_values=True).keys())
            headers = payload.get("headers") if isinstance(payload.get("headers"), dict) else {}
            content_type = headers.get("content-type") or headers.get("Content-Type") or ""
            body_text = str(payload.get("text") or "")
            data = safe_json_loads(body_text)
            status = int(payload.get("status") or 0)
            status_code, status_msg = self._payload_status_msg(data)
            diag = {
                "__diagnostic__": True,
                "source": "page_full_params_fetch",
                "ok": 200 <= status < 300 and isinstance(data, dict),
                "attempt": attempt,
                "url": target_url,
                "url_path": parsed_target.path,
                "query_keys": query_keys,
                "http_status": status,
                "content_type": content_type,
                "body_len": len(body_text or ""),
                "body_head": self._response_text_head(body_text),
                "parsed_type": type(data).__name__ if data is not None else None,
                "parsed_keys": list(data.keys())[:30] if isinstance(data, dict) else [],
                "status_code": status_code,
                "status_msg": status_msg,
                "error": payload.get("error"),
                "sign": sign_info,
                "original_url": payload.get("original_url"),
                "has_a_bogus": "a_bogus" in query_keys,
                "has_x_bogus": "X-Bogus" in query_keys,
                "has_signature": "_signature" in query_keys,
            }
            if debug_path is not None:
                self._safe_write_debug_json(debug_path.with_name(debug_path.stem + "_page_full_params.json"), diag)

            if 200 <= status < 300 and isinstance(data, dict):
                reply_items = self._extract_comment_list_from_payload(data, prefer_reply_fields=True)
                print(
                    f"[STEP] 二级评论页面完整参数请求成功：status={status} body_len={len(body_text or '')} "
                    f"raw={len(reply_items)} keys={','.join(list(data.keys())[:12])} "
                    f"sign={sign_info.get('source') or '-'} signed={1 if sign_info.get('ok') else 0}",
                    flush=True,
                )
                return data

            print(
                f"[STEP] 二级评论页面完整参数请求未拿到有效 JSON：status={status if status else '-'} "
                f"content_type={content_type or '-'} body_len={len(body_text or '')} "
                f"sign={sign_info.get('source') or '-'} signed={1 if sign_info.get('ok') else 0} "
                f"a_bogus={1 if 'a_bogus' in query_keys else 0} body={self._response_text_head(body_text, 220) or '-'}，重试 {attempt}/2",
                flush=True,
            )
            sleep_seconds(0.4 * attempt)
        return None

    def _fetch_reply_page(
        self,
        page: Page,
        template_url: str,
        video_id: str,
        parent_comment_id: str,
        cursor: Any,
        count: int,
        *,
        debug_dir: Optional[Path] = None,
        parent_index: int = 0,
        reply_page_no: int = 0,
    ) -> Optional[Dict[str, Any]]:
        if not parent_comment_id or not video_id:
            return None
        target_url = self._build_reply_url_from_template(template_url, video_id, parent_comment_id, cursor, count)
        parsed = urlparse(target_url)
        query_keys = sorted(parse_qs(parsed.query, keep_blank_values=True).keys())
        debug_path = None
        if debug_dir is not None:
            safe_parent = safe_path_key(parent_comment_id, fallback="parent")
            debug_path = debug_dir / "reply_api_debug" / f"parent_{parent_index:03d}_{safe_parent}_page_{reply_page_no:03d}.json"
        print(
            f"[STEP] 二级评论接口诊断：path={parsed.path} query_keys={','.join(query_keys[:28])} "
            f"debug={debug_path or '-'}",
            flush=True,
        )
        # 先用与一级评论直接请求一致的“页面完整参数”方式获取二级回复。
        # 上传诊断确认一级 raw 只给 reply_comment_total，不给内联回复；而旧模板缺少
        # version/screen/network/msToken 等参数，二级接口稳定 200 空体。
        full_param_payload = self._fetch_reply_page_direct_browser(
            page,
            video_id,
            parent_comment_id,
            cursor,
            count,
            debug_path=debug_path,
        )
        if isinstance(full_param_payload, dict):
            return full_param_payload

        # 完整参数仍失败时，再用旧模板 XHR 做诊断，然后走硬超时 APIRequestContext 兜底。
        xhr_payload = self._fetch_json_with_page_xhr_diagnostic(
            page,
            target_url,
            timeout_ms=COMMENT_REPLY_FETCH_TIMEOUT_MS,
            label="二级评论接口",
            debug_path=debug_path,
        )
        if isinstance(xhr_payload, dict):
            return xhr_payload

        # XHR 仍失败时，再走硬超时 APIRequestContext 做诊断兜底。
        print(
            f"[STEP] 二级评论硬超时兜底请求：path={parsed.path} timeout={COMMENT_REPLY_FETCH_TIMEOUT_MS}ms",
            flush=True,
        )
        return self._fetch_json_with_context_request(
            target_url,
            timeout_ms=COMMENT_REPLY_FETCH_TIMEOUT_MS,
            referer=self._canonical_video_url(video_id),
            label="二级评论接口",
            debug_path=debug_path,
            return_diagnostic=True,
        )

    def sync(
        self,
        account_alias: str,
        content_url: str,
        max_comments_per_post: int = 50,
        capture_seconds: int = 8,
        save_debug_files: bool = False,
        source_account_url: str = "",
        max_runtime_seconds: int | None = None,
        run_id: str | None = None,
        debug_label: str | None = None,
        expected_author_nickname: str | None = None,
        collect_replies: bool = True,
    ) -> Tuple[RunResult, Path]:
        run_id = run_id or datetime.now().strftime("%Y%m%d_%H%M%S")
        debug_dir = output_section_dir(self.output_dir, self.platform, account_alias, run_id, "comments_api")
        if debug_label:
            debug_dir = debug_dir / safe_path_key(debug_label, fallback="content")
        debug_dir.mkdir(parents=True, exist_ok=True)

        result = RunResult(
            run_id=run_id,
            platform=self.platform,
            homepage_url=source_account_url,
            account_alias=account_alias,
            generated_at=datetime.now().astimezone().isoformat(),
            items=[],
        )

        normalized_content_url = self._normalize_content_url(content_url)
        video_id = infer_content_id(normalized_content_url)
        page = self.context.new_page()
        deadline_at = time.time() + max_runtime_seconds if max_runtime_seconds and max_runtime_seconds > 0 else None
        captured_candidates: List[Dict[str, Any]] = []
        seen_candidate_keys = set()
        captured_reply_candidates: List[Dict[str, Any]] = []
        seen_reply_candidate_keys = set()
        comment_limit = self.pacing.resolve_comment_limit(max_comments_per_post)
        author_identity: Dict[str, Any] = {}

        def _initial_comment_page_size() -> int:
            if comment_limit is not None and comment_limit > 0:
                return max(10, min(int(comment_limit), 50))
            # 直接作品模式优先拿 cursor=0 的完整一级评论主接口首包，避免页面预览包
            # raw 很小但 cursor 已推进时漏采。抖音 Web 评论接口通常接受 50 以内 count。
            return 50

        def on_response(response: Response):
            try:
                req = response.request
                if req.resource_type not in {"xhr", "fetch"}:
                    return
                if "comment" not in response.url.lower():
                    return
                if response.status != 200:
                    return

                data = safe_json_loads(response.text())
                if not isinstance(data, dict):
                    return

                if self._is_reply_comment_url(response.url):
                    reply_items = self._extract_comment_list_from_payload(data, prefer_reply_fields=True)
                    parent_id = self._reply_parent_id_from_url(response.url)
                    unique_key = f"reply|{parent_id}|{response.url}|{len(reply_items)}|{self._payload_cursor(data)}"
                    if unique_key in seen_reply_candidate_keys:
                        return
                    seen_reply_candidate_keys.add(unique_key)
                    captured_reply_candidates.append(
                        {
                            "request_url": response.url,
                            "status": response.status,
                            "response_json": data,
                            "parent_comment_id": parent_id,
                            "comments_count": len(reply_items),
                        }
                    )
                    return

                if not self._is_primary_comment_url(response.url):
                    return

                comments = data.get("comments")
                if not isinstance(comments, list):
                    return

                score = 0
                if COMMENT_URL_PATTERN in response.url:
                    score += 8
                if comments:
                    score += 10
                if video_id and video_id in response.url:
                    score += 4
                if extract_cursor(data) is not None:
                    score += 2
                if "total" in data:
                    score += 2
                if extract_has_more(data) in {0, 1}:
                    score += 1

                unique_key = f"{response.url}|{len(comments)}|{extract_cursor(data)}"
                if unique_key in seen_candidate_keys:
                    return
                seen_candidate_keys.add(unique_key)

                captured_candidates.append(
                    {
                        "request_url": response.url,
                        "status": response.status,
                        "response_json": data,
                        "score": score,
                        "comments_count": len(comments),
                    }
                )
            except Exception:
                return

        page.on("response", on_response)

        try:
            open_urls = self._candidate_open_urls(
                content_url=content_url,
                source_account_url=source_account_url,
                normalized_content_url=normalized_content_url,
                video_id=video_id,
            )
            best_template = None
            attempted_urls: List[str] = []

            # 主链路：先打开作品页。若传入的是 v.douyin.com 短链，必须等它跳转后
            # 解析出真实 /video/<aweme_id>，再调用评论接口。否则 aweme_id 会变成
            # 短链 code，表现为“口播能拿到媒体，但评论永远 0 条”。
            if normalized_content_url:
                attempted_urls.append(normalized_content_url)
                print(f"[STEP] 作品评论主链路：打开作品页解析真实作品ID：{normalized_content_url}", flush=True)
                print(f"[COMMENTS] 打开作品页用于接口主链路：{normalized_content_url}", flush=True)
                page.goto(normalized_content_url, wait_until="domcontentloaded", timeout=60000)
                resolved_url = getattr(page, "url", "") or normalized_content_url
                resolved_video_id = self._extract_content_id_from_page(page)
                if resolved_video_id and resolved_video_id != video_id:
                    video_id = resolved_video_id
                    normalized_content_url = self._canonical_video_url(video_id) or resolved_url
                    print(f"[STEP] 作品评论主链路：已解析真实作品ID={video_id}，使用地址={normalized_content_url}", flush=True)
                    # 如果短链落在 share/中间页或非 www.douyin.com 域名，切到标准作品页，
                    # 让后续页面内 fetch 使用正确 origin、Referer 与 Cookie 环境。
                    if normalized_content_url and normalized_content_url not in attempted_urls and normalized_content_url != resolved_url:
                        attempted_urls.append(normalized_content_url)
                        try:
                            page.goto(normalized_content_url, wait_until="domcontentloaded", timeout=60000)
                            resolved_url = getattr(page, "url", "") or normalized_content_url
                        except Exception as exc:
                            print(f"[COMMENTS] 标准作品页二次打开失败，继续使用当前页：{exc}", flush=True)
                elif video_id:
                    print(f"[STEP] 作品评论主链路：使用已知作品ID={video_id}", flush=True)
                else:
                    print("[STEP] 作品评论主链路：未解析到真实作品ID，将退回页面触发捕获。", flush=True)
                print(f"[COMMENTS] 作品页 DOM 已加载：{resolved_url}", flush=True)
                author_identity = self._extract_author_identity_from_page(
                    page,
                    source_account_url=source_account_url,
                    expected_author_nickname=expected_author_nickname,
                )
                if author_identity:
                    print(
                        f"[STEP] 作者识别：nickname={author_identity.get('nickname') or '-'} "
                        f"uid={author_identity.get('uid') or '-'} sec_uid={author_identity.get('sec_uid') or '-'}",
                        flush=True,
                    )
                open_urls = self._candidate_open_urls(
                    content_url=content_url,
                    source_account_url=source_account_url,
                    normalized_content_url=normalized_content_url,
                    video_id=video_id,
                )
                sleep_seconds(0.8)

                # 作品精准监听必须先真正打开作品页并触发评论面板，优先复用页面自己发出的
                # comment/list 接口模板。直接 fetch 只能兜底拿首批数据，部分作品会因此拿不到
                # 后续分页，表现为只采 32/34 条。
                before_count = len(captured_candidates)
                print("[STEP] 作品评论主链路：已进入作品页，尝试触发评论接口与分页模板。", flush=True)
                self._trigger_comment_requests(page, pause_sec=0.9)
                end_at = time.time() + max(capture_seconds, 3)
                while time.time() < end_at:
                    sleep_seconds(0.4)
                delta_count = len(captured_candidates) - before_count
                print(f"[STEP] 作品评论主链路：页面触发评论接口候选={delta_count}，累计候选={len(captured_candidates)}", flush=True)
                # 无论页面是否已经捕获到候选，都补一次 cursor=0 的一级评论主接口。
                # 这样作品精准监听与主页模式一样，先真实进入作品页，再用页面 Cookie/Referer
                # 取完整一级评论主链路；若页面首屏候选只有 5/10 条，不再被它误导。
                if video_id:
                    direct_candidate = self._bootstrap_direct_comment_template(
                        page=page,
                        video_id=video_id,
                        page_size=_initial_comment_page_size(),
                    )
                    if direct_candidate:
                        captured_candidates.append(direct_candidate)
                        print(
                            f"[STEP] 作品评论主链路：已补充 cursor=0 直接主接口候选，首批评论数={direct_candidate.get('comments_count') or 0}",
                            flush=True,
                        )
                best_template = self._select_best_candidate(captured_candidates)

            if not best_template:
                print("[COMMENTS] 评论接口主链路未命中，退回页面触发/DOM 兜底。", flush=True)
                # 先在当前已打开的真实作品页上触发评论区域。短链场景下当前页
                # 已完成跳转，如果直接跳过 attempted_urls，就会完全错过这一页的
                # 评论接口捕获。
                before_count = len(captured_candidates)
                print("[STEP] 作品评论主链路：直接接口未命中，尝试触发当前作品页评论接口。", flush=True)
                self._trigger_comment_requests(page, pause_sec=0.9)
                end_at = time.time() + max(capture_seconds, 3)
                while time.time() < end_at:
                    sleep_seconds(0.4)
                delta_count = len(captured_candidates) - before_count
                print(f"[STEP] 作品评论主链路：当前页新增评论接口候选={delta_count}，累计={len(captured_candidates)}", flush=True)
                best_template = self._select_best_candidate(captured_candidates)

            if not best_template:
                for open_index, open_url in enumerate(open_urls, start=1):
                    if open_url in attempted_urls:
                        continue
                    attempted_urls.append(open_url)
                    before_count = len(captured_candidates)
                    print(f"[COMMENTS] 打开作品页({open_index}/{len(open_urls)})：{open_url}", flush=True)
                    page.goto(open_url, wait_until="domcontentloaded", timeout=60000)
                    print(f"[COMMENTS] 作品页 DOM 已加载：{open_url}", flush=True)
                    sleep_seconds(1.2)
                    self._trigger_comment_requests(page, pause_sec=0.9)

                    end_at = time.time() + max(capture_seconds, 3)
                    while time.time() < end_at:
                        sleep_seconds(0.4)

                    delta_count = len(captured_candidates) - before_count
                    print(f"[COMMENTS] 当前打开方式新增评论接口候选：{delta_count}，累计候选：{len(captured_candidates)}", flush=True)
                    best_template = self._select_best_candidate(captured_candidates)
                    if best_template:
                        break

            if not best_template:
                print("[COMMENTS] 页面触发未捕获到评论接口，最后重试直接请求评论接口。", flush=True)
                direct_candidate = self._bootstrap_direct_comment_template(
                    page=page,
                    video_id=video_id,
                    page_size=_initial_comment_page_size(),
                )
                if direct_candidate:
                    captured_candidates.append(direct_candidate)
                    best_template = direct_candidate

            print(f"[COMMENTS] 评论接口候选捕获数量：{len(captured_candidates)}", flush=True)
            if not best_template:
                summary = {
                    "run_id": run_id,
                    "platform": self.platform,
                    "account_alias": account_alias,
                    "input_content_url": content_url,
                    "normalized_content_url": normalized_content_url,
                    "attempted_open_urls": attempted_urls,
                    "ok": False,
                    "reason": "comment_list_template_not_captured",
                    "captured_candidate_count": len(captured_candidates),
                }
                summary_path = debug_dir / "summary.json"
                summary_path.write_text(json.dumps(summary, ensure_ascii=False, indent=2), encoding="utf-8")
                print(f"[COMMENTS] 未捕获到评论接口模板：{normalized_content_url}，summary={summary_path}", flush=True)
                return result, summary_path

            template_url = best_template["request_url"]
            first_payload = best_template["response_json"]
            print(
                f"[STEP] 评论主接口模板选定：source={best_template.get('source') or 'page_capture'} "
                f"首批={best_template.get('comments_count') or 0} url={template_url[:180]}",
                flush=True,
            )

            if save_debug_files:
                (debug_dir / "bootstrap_template.json").write_text(
                    json.dumps(best_template, ensure_ascii=False, indent=2),
                    encoding="utf-8",
                )

            cursor_key = detect_query_key(template_url, ["cursor", "offset", "max_cursor"], "cursor")
            count_key = detect_query_key(template_url, ["count", "page_size"], "count")
            aweme_key = detect_query_key(template_url, ["aweme_id", "item_id"], "aweme_id")

            comments: List[CommentRecord] = []
            top_level_comments: List[CommentRecord] = []
            top_level_raw: Dict[str, Dict[str, Any]] = {}
            seen_cids = set()
            page_payloads = []
            processed_candidate_keys = set()

            def candidate_payload_key(candidate: Dict[str, Any]) -> str:
                payload = candidate.get("response_json") or {}
                return f"{candidate.get('request_url') or ''}|{self._payload_cursor(payload)}|{self._payload_has_more(payload)}|{candidate.get('comments_count') or 0}"

            def append_comments(payload: Dict[str, Any], page_no: int) -> Tuple[int, int]:
                raw_comments = payload.get("comments") or []
                raw_count = len(raw_comments) if isinstance(raw_comments, list) else 0
                page_ids = []
                new_count = 0

                for raw in raw_comments:
                    if not isinstance(raw, dict):
                        continue
                    cid = text_clean(raw.get("cid"))
                    if cid and cid in seen_cids:
                        continue
                    if cid:
                        seen_cids.add(cid)

                    record = map_comment(
                        platform=self.platform,
                        source_account_url=source_account_url,
                        source_content_url=normalized_content_url,
                        item=raw,
                        author_identity=author_identity,
                    )
                    comments.append(record)
                    top_level_comments.append(record)
                    if cid:
                        top_level_raw[cid] = raw
                    page_ids.append(cid)
                    new_count += 1

                    if comment_limit is not None and len(comments) >= comment_limit:
                        break

                page_payloads.append(
                    {
                        "page_no": page_no,
                        "cursor": self._payload_cursor(payload),
                        "has_more": self._payload_has_more(payload),
                        "total": self._payload_total_hint(payload),
                        "raw_count": raw_count,
                        "new_count": new_count,
                        "comment_ids": page_ids,
                    }
                )
                return raw_count, new_count

            def _scroll_comment_panel_for_more(rounds: int = 3, pause_sec: float = 0.9) -> None:
                for _ in range(max(int(rounds or 0), 1)):
                    try:
                        page.evaluate(
                            """
                            () => {
                              const selectors = [
                                "div[data-e2e='comment-list']",
                                "div[class*='comment-list']",
                                "div[class*='commentList']",
                                "div[class*='comment-panel']",
                                "div[class*='commentPanel']",
                                "div[class*='Comment']",
                              ];
                              let target = null;
                              for (const selector of selectors) {
                                const nodes = Array.from(document.querySelectorAll(selector));
                                target = nodes.find(el => el && el.scrollHeight > el.clientHeight + 20);
                                if (target) break;
                              }
                              if (target) {
                                target.scrollTop = target.scrollHeight;
                              } else {
                                window.scrollTo(0, document.body.scrollHeight || document.documentElement.scrollHeight || 0);
                              }
                              const buttons = Array.from(document.querySelectorAll('button, span, div'));
                              const more = buttons.find(el => {
                                const text = (el.innerText || '').trim();
                                return text.includes('查看更多') || text.includes('展开更多') || text.includes('更多回复');
                              });
                              if (more) more.click();
                            }
                            """
                        )
                    except Exception:
                        try:
                            page.mouse.wheel(0, 1800)
                        except Exception:
                            pass
                    sleep_seconds(max(float(pause_sec or 0.8), 0.5))

            def process_new_captured_candidates(start_page_no: int) -> Tuple[int, int, Any, Optional[int], Optional[int], int]:
                added_total = 0
                raw_total = 0
                last_cursor_value = None
                last_has_more_value = None
                last_total_value = None
                used_pages = 0
                for candidate in list(captured_candidates):
                    key = candidate_payload_key(candidate)
                    if key in processed_candidate_keys:
                        continue
                    processed_candidate_keys.add(key)
                    payload = candidate.get("response_json")
                    if not isinstance(payload, dict) or not isinstance(payload.get("comments"), list):
                        continue
                    raw_count, new_count = append_comments(payload, start_page_no + used_pages)
                    used_pages += 1
                    raw_total += raw_count
                    added_total += new_count
                    last_cursor_value = self._payload_cursor(payload)
                    last_has_more_value = self._payload_has_more(payload)
                    last_total_value = self._payload_total_hint(payload)
                    print(
                        f"[STEP] 评论接口分页捕获：page={start_page_no + used_pages - 1} raw={raw_count} 新增={new_count} "
                        f"累计={len(comments)} has_more={last_has_more_value if last_has_more_value is not None else '-'} "
                        f"cursor={last_cursor_value if last_cursor_value is not None else '-'} total={last_total_value if last_total_value is not None else '-'}",
                        flush=True,
                    )
                return added_total, raw_total, last_cursor_value, last_has_more_value, last_total_value, used_pages

            first_raw_count, first_new_count = append_comments(first_payload, 1)
            try:
                processed_candidate_keys.add(candidate_payload_key(best_template))
            except Exception:
                pass
            cursor = self._payload_cursor(first_payload)
            has_more = self._payload_has_more(first_payload)
            total_comments_hint = self._payload_total_hint(first_payload)
            print(
                f"[STEP] 已解析首批评论：raw={first_raw_count} 新增={first_new_count} 累计={len(comments)} "
                f"has_more={has_more if has_more is not None else '-'} cursor={cursor if cursor is not None else '-'} "
                f"total={total_comments_hint if total_comments_hint is not None else '-'}",
                flush=True,
            )

            if save_debug_files:
                (debug_dir / "page_001.json").write_text(json.dumps(first_payload, ensure_ascii=False, indent=2), encoding="utf-8")

            page_no = 1
            last_raw_count = first_raw_count
            forced_probe_count = 0
            duplicate_or_empty_pages = 0
            seen_request_cursors = set()
            max_pages = 120 if comment_limit is None else max(2, min(120, (comment_limit // 10) + 8))
            print(
                f"[STEP] 评论采集分页配置：limit={comment_limit if comment_limit is not None else '不限'} max_pages={max_pages} page_size<= {getattr(self.pacing, 'max_comment_page_size', '-')}",
                flush=True,
            )
            if comment_limit is not None and len(comments) >= comment_limit:
                print(f"[STEP] 评论分页未继续：已达到配置的单作品评论上限 limit={comment_limit}。", flush=True)

            while self.pacing.should_continue_comments(len(comments), max_comments_per_post):
                if deadline_at and time.time() >= deadline_at:
                    print("[STEP] 评论分页停止：达到单作品评论采集时间上限。", flush=True)
                    break
                if page_no >= max_pages:
                    print(f"[STEP] 评论分页停止：达到最大分页保护 page={page_no}/{max_pages}。", flush=True)
                    break

                should_probe = self._should_probe_next_comment_page(
                    has_more=has_more,
                    total_hint=total_comments_hint,
                    collected_count=len(comments),
                    raw_count=last_raw_count,
                    page_no=page_no,
                    forced_probe_count=forced_probe_count,
                )
                if not should_probe:
                    print(
                        f"[STEP] 评论分页停止：has_more={has_more if has_more is not None else '-'} "
                        f"total={total_comments_hint if total_comments_hint is not None else '-'} 累计={len(comments)}。",
                        flush=True,
                    )
                    break

                if has_more != 1:
                    forced_probe_count += 1

                page_no += 1
                remaining = 50 if comment_limit is None else max(comment_limit - len(comments), 0)
                page_size = self.pacing.comment_page_size(
                    page_no=page_no,
                    total_hint=total_comments_hint,
                    remaining=remaining if comment_limit is not None else None,
                )
                next_cursor = self._resolve_next_cursor(cursor, len(comments), last_raw_count)
                request_cursor_key = str(next_cursor)
                if request_cursor_key in seen_request_cursors:
                    # 避免 cursor 异常时重复请求同一页。若还有明确 total 缺口，则尝试按累计数量推进一次。
                    fallback_cursor = max(len(comments), last_raw_count, page_size)
                    if str(fallback_cursor) in seen_request_cursors or fallback_cursor == next_cursor:
                        print(f"[STEP] 评论分页停止：cursor 重复且无可推进值 cursor={next_cursor}。", flush=True)
                        break
                    next_cursor = fallback_cursor
                    request_cursor_key = str(next_cursor)
                seen_request_cursors.add(request_cursor_key)

                target_url = build_url_with_overrides(
                    template_url,
                    {
                        aweme_key: video_id,
                        cursor_key: next_cursor,
                        count_key: page_size,
                    },
                )

                print(
                    f"[STEP] 评论分页请求：page={page_no} cursor={next_cursor} count={page_size} "
                    f"has_more={has_more if has_more is not None else '-'} total={total_comments_hint if total_comments_hint is not None else '-'} 累计={len(comments)}",
                    flush=True,
                )
                payload = self._fetch_json(page, target_url)
                if not isinstance(payload, dict):
                    print(f"[STEP] 评论分页接口未返回有效 JSON，转页面滚动捕获：page={page_no}。", flush=True)
                    before_capture_count = len(captured_candidates)
                    _scroll_comment_panel_for_more(rounds=4, pause_sec=0.9)
                    added_ui, raw_ui, cursor_ui, has_more_ui, total_ui, used_ui_pages = process_new_captured_candidates(page_no)
                    if added_ui > 0:
                        print(f"[STEP] 评论分页滚动捕获成功：新增={added_ui} 累计={len(comments)} 候选新增={len(captured_candidates) - before_capture_count}", flush=True)
                        page_no += max(used_ui_pages - 1, 0)
                        cursor = cursor_ui
                        has_more = has_more_ui
                        if total_ui is not None:
                            total_comments_hint = total_ui
                        last_raw_count = raw_ui
                        duplicate_or_empty_pages = 0
                        continue
                    break
                if not isinstance(payload.get("comments"), list):
                    print(f"[STEP] 评论分页接口未返回 comments 列表，转页面滚动捕获：page={page_no}。", flush=True)
                    before_capture_count = len(captured_candidates)
                    _scroll_comment_panel_for_more(rounds=4, pause_sec=0.9)
                    added_ui, raw_ui, cursor_ui, has_more_ui, total_ui, used_ui_pages = process_new_captured_candidates(page_no)
                    if added_ui > 0:
                        print(f"[STEP] 评论分页滚动捕获成功：新增={added_ui} 累计={len(comments)} 候选新增={len(captured_candidates) - before_capture_count}", flush=True)
                        page_no += max(used_ui_pages - 1, 0)
                        cursor = cursor_ui
                        has_more = has_more_ui
                        if total_ui is not None:
                            total_comments_hint = total_ui
                        last_raw_count = raw_ui
                        duplicate_or_empty_pages = 0
                        continue
                    break

                if save_debug_files:
                    (debug_dir / f"page_{page_no:03d}.json").write_text(
                        json.dumps(payload, ensure_ascii=False, indent=2),
                        encoding="utf-8",
                    )

                raw_count, new_count = append_comments(payload, page_no)
                next_payload_cursor = self._payload_cursor(payload)
                next_payload_has_more = self._payload_has_more(payload)
                next_total_hint = self._payload_total_hint(payload)
                print(
                    f"[STEP] 评论翻页完成：page={page_no} raw={raw_count} 新增={new_count} 累计={len(comments)} "
                    f"has_more={next_payload_has_more if next_payload_has_more is not None else '-'} "
                    f"cursor={next_payload_cursor if next_payload_cursor is not None else '-'} "
                    f"total={next_total_hint if next_total_hint is not None else '-'}",
                    flush=True,
                )

                cursor = next_payload_cursor
                has_more = next_payload_has_more
                if next_total_hint is not None:
                    total_comments_hint = next_total_hint
                last_raw_count = raw_count

                if new_count <= 0:
                    duplicate_or_empty_pages += 1
                    if duplicate_or_empty_pages >= 2 or raw_count <= 0:
                        print(f"[STEP] 评论分页出现空页/重复页={duplicate_or_empty_pages}，转页面滚动捕获验证。", flush=True)
                        before_capture_count = len(captured_candidates)
                        _scroll_comment_panel_for_more(rounds=4, pause_sec=0.9)
                        added_ui, raw_ui, cursor_ui, has_more_ui, total_ui, used_ui_pages = process_new_captured_candidates(page_no + 1)
                        if added_ui > 0:
                            print(f"[STEP] 评论分页滚动捕获成功：新增={added_ui} 累计={len(comments)} 候选新增={len(captured_candidates) - before_capture_count}", flush=True)
                            page_no += max(used_ui_pages, 1)
                            cursor = cursor_ui
                            has_more = has_more_ui
                            if total_ui is not None:
                                total_comments_hint = total_ui
                            last_raw_count = raw_ui
                            duplicate_or_empty_pages = 0
                            continue
                        print(f"[STEP] 评论分页停止：连续空页/重复页={duplicate_or_empty_pages}。", flush=True)
                        break
                else:
                    duplicate_or_empty_pages = 0

                if deadline_at and time.time() >= deadline_at:
                    print("[STEP] 评论分页停止：达到单作品评论采集时间上限。", flush=True)
                    break
                page_pause_sec = self.pacing.comment_page_pause(
                    page_no=page_no,
                    total_hint=total_comments_hint,
                )
                if page_pause_sec > 0:
                    print(f"[STEP] 评论分页休息：{page_pause_sec:.2f}s", flush=True)
                    sleep_seconds(page_pause_sec)

            processed_reply_candidate_keys: set[str] = set()

            def take_captured_reply_payload(parent_cid: str) -> Optional[Dict[str, Any]]:
                for candidate in list(captured_reply_candidates):
                    if text_clean(candidate.get("parent_comment_id")) != text_clean(parent_cid):
                        continue
                    payload = candidate.get("response_json")
                    if not isinstance(payload, dict):
                        continue
                    key = f"{candidate.get('request_url') or ''}|{self._payload_cursor(payload)}|{candidate.get('comments_count') or 0}"
                    if key in processed_reply_candidate_keys:
                        continue
                    processed_reply_candidate_keys.add(key)
                    return payload
                return None

            def trigger_reply_ui(parent_cid: str, parent_text: str = "", parent_index: int = 0) -> int:
                before_count = len(captured_reply_candidates)
                try:
                    clicked = page.evaluate(
                        """
                        ({ parentText }) => {
                          const isVisible = (el) => {
                            if (!el) return false;
                            const rect = el.getBoundingClientRect();
                            const style = window.getComputedStyle(el);
                            return rect.width > 0 && rect.height > 0 && style.visibility !== 'hidden' && style.display !== 'none';
                          };
                          const clickEl = (el) => {
                            try { el.scrollIntoView({ block: 'center', inline: 'center' }); } catch (_) {}
                            try { el.click(); return true; } catch (_) { return false; }
                          };
                          let clicked = 0;
                          const parentNeedle = String(parentText || '').replace(/\s+/g, '').slice(0, 18);
                          const candidates = Array.from(document.querySelectorAll('button, a, span, div'))
                            .filter(isVisible)
                            .map(el => ({
                              el,
                              text: (el.innerText || el.textContent || el.getAttribute('aria-label') || '').trim(),
                              whole: ((el.closest('div') && el.closest('div').innerText) || '').replace(/\s+/g, ''),
                            }))
                            .filter(x => x.text && x.text.length <= 96);

                          const isExpandReply = (text) => {
                            const t = String(text || '').replace(/\s+/g, '');
                            if (/(发表评论|写评论|回复一下|发送|取消|删除|举报)/.test(t)) return false;
                            return /(展开|查看|更多|共).*回复|\d+条回复|回复\d+|查看\d+条/.test(t);
                          };

                          // Prefer controls near the target parent comment text when that text is visible.
                          if (parentNeedle) {
                            for (const x of candidates) {
                              if (!x.whole.includes(parentNeedle)) continue;
                              if (isExpandReply(x.text)) {
                                if (clickEl(x.el)) clicked++;
                                if (clicked >= 2) return clicked;
                              }
                            }
                          }

                          // Fallback: click visible reply expand controls one by one. Keep this small;
                          // over-clicking unrelated controls can trigger wrong parent replies.
                          for (const x of candidates) {
                            if (isExpandReply(x.text)) {
                              if (clickEl(x.el)) clicked++;
                              if (clicked >= 4) break;
                            }
                          }
                          if (clicked <= 0) {
                            try { window.scrollBy(0, 900); } catch (_) {}
                          }
                          return clicked;
                        }
                        """,
                        {"parentText": parent_text or ""},
                    )
                    try:
                        clicked_int = int(clicked or 0)
                    except Exception:
                        clicked_int = 0
                    if clicked_int > 0:
                        print(
                            f"[STEP] 二级评论页面触发：parent={parent_index}/{len(top_level_comments)} cid={parent_cid} 点击展开控件={clicked_int}",
                            flush=True,
                        )
                    else:
                        print(
                            f"[STEP] 二级评论页面触发未找到展开控件：parent={parent_index}/{len(top_level_comments)} cid={parent_cid}",
                            flush=True,
                        )
                    # 点击后轮询一小段时间，让 on_response 有机会捕获真实 reply 接口。
                    wait_until = time.time() + (5.0 if clicked_int > 0 else 1.2)
                    while time.time() < wait_until:
                        if len(captured_reply_candidates) > before_count:
                            break
                        sleep_seconds(0.25)
                    new_count = max(len(captured_reply_candidates) - before_count, 0)
                    if new_count > 0:
                        parent_ids = []
                        for candidate in captured_reply_candidates[before_count:]:
                            parent_ids.append(text_clean(candidate.get("parent_comment_id")) or "-")
                        print(
                            f"[STEP] 二级评论页面触发捕获响应：parent={parent_index}/{len(top_level_comments)} "
                            f"cid={parent_cid} 捕获={new_count} parent_ids={','.join(parent_ids[:8])}",
                            flush=True,
                        )
                    else:
                        print(
                            f"[STEP] 二级评论页面触发未捕获真实回复接口：parent={parent_index}/{len(top_level_comments)} cid={parent_cid}",
                            flush=True,
                        )
                except Exception as exc:
                    print(f"[STEP] 二级评论页面触发异常：parent={parent_index}/{len(top_level_comments)} cid={parent_cid} {type(exc).__name__}: {exc}", flush=True)
                return max(len(captured_reply_candidates) - before_count, 0)

            def collect_dom_reply_map(max_passes: int = 6) -> Dict[str, List[Dict[str, Any]]]:
                """DOM-first secondary reply collection.

                The direct reply API can return HTTP 200 with an empty body.  When
                the real page already shows controls such as “展开17条回复”, the most
                reliable path is to expand those controls in the comment DOM and
                parse the visible reply rows back under the matched top-level
                comment.  This function is intentionally bounded and diagnostic:
                it never loops forever and it does not block the primary comment
                collection/sync path.
                """
                parent_refs: List[Dict[str, Any]] = []
                for idx, parent in enumerate(list(top_level_comments), start=1):
                    parent_cid = text_clean(parent.comment_id)
                    if not parent_cid:
                        continue
                    raw_parent = top_level_raw.get(parent_cid) or {}
                    reply_total = self._reply_total_hint(raw_parent)
                    if reply_total <= 0 and not self._inline_replies(raw_parent):
                        continue
                    parent_refs.append(
                        {
                            "index": idx,
                            "cid": parent_cid,
                            "text": text_clean(parent.comment_text),
                            "nickname": text_clean(parent.nickname),
                            "replyTotal": reply_total,
                        }
                    )
                if not parent_refs:
                    return {}

                dom_debug_dir = debug_dir / "reply_dom_debug"
                dom_debug_dir.mkdir(parents=True, exist_ok=True)
                collected: Dict[str, List[Dict[str, Any]]] = {}
                seen_keys: set[str] = set()
                no_progress_rounds = 0

                click_js = """
                ({ parents, maxClicks }) => {
                  const norm = (s) => String(s || '').replace(/\s+/g, '').trim();
                  const isVisible = (el) => {
                    if (!el) return false;
                    const rect = el.getBoundingClientRect();
                    const style = window.getComputedStyle(el);
                    return rect.width > 0 && rect.height > 0 && style.visibility !== 'hidden' && style.display !== 'none' && rect.bottom >= 0 && rect.top <= (window.innerHeight || 1200) + 200;
                  };
                  const rawText = (el) => String((el && (el.innerText || el.textContent || el.getAttribute('aria-label'))) || '').trim();
                  const isExpandReply = (text) => {
                    const t = norm(text);
                    if (!t || t.length > 80) return false;
                    if (/(发表评论|写评论|回复一下|发送|取消|删除|举报|分享|收藏|点赞)/.test(t)) return false;
                    return /(展开|查看|更多|共)\d{0,4}条?回复/.test(t) || /展开.*回复/.test(t) || /查看.*回复/.test(t) || /\d+条回复/.test(t);
                  };
                  const parentNeedles = (parents || []).map(p => ({
                    cid: String(p.cid || ''),
                    textNeedle: norm(p.text).slice(0, 18),
                    nickNeedle: norm(p.nickname).replace(/（作者）|\(作者\)/g, '').slice(0, 12),
                    replyTotal: Number(p.replyTotal || 0),
                  })).filter(p => p.cid && p.textNeedle.length >= 4);
                  const matchParentFrom = (el) => {
                    let cur = el;
                    for (let depth = 0; cur && depth < 10; depth++, cur = cur.parentElement) {
                      const t = norm(cur.innerText || cur.textContent || '');
                      if (!t || t.length > 6500) continue;
                      for (const p of parentNeedles) {
                        if (!t.includes(p.textNeedle)) continue;
                        if (p.nickNeedle && !t.includes(p.nickNeedle) && t.length < p.textNeedle.length + 80) continue;
                        return { parent: p, block: cur, textLength: t.length };
                      }
                    }
                    return null;
                  };
                  const controls = Array.from(document.querySelectorAll('button, a, span, div'))
                    .filter(isVisible)
                    .map(el => ({ el, text: rawText(el), match: matchParentFrom(el) }))
                    .filter(x => isExpandReply(x.text));
                  const matched = controls.filter(x => x.match && x.match.parent && x.match.parent.cid);
                  const pool = matched.length ? matched : controls;
                  const clickedParents = [];
                  const clickedTexts = [];
                  let clicked = 0;
                  for (const x of pool) {
                    if (clicked >= Math.max(Number(maxClicks || 6), 1)) break;
                    try { x.el.scrollIntoView({ block: 'center', inline: 'nearest' }); } catch (_) {}
                    try {
                      x.el.click();
                      clicked++;
                      clickedTexts.push(x.text.slice(0, 60));
                      if (x.match && x.match.parent && x.match.parent.cid) clickedParents.push(x.match.parent.cid);
                    } catch (_) {}
                  }
                  if (clicked <= 0) {
                    const panels = Array.from(document.querySelectorAll('div')).filter(el => isVisible(el) && el.scrollHeight > el.clientHeight + 80);
                    const panel = panels.sort((a, b) => (b.clientHeight * b.clientWidth) - (a.clientHeight * a.clientWidth))[0];
                    if (panel) panel.scrollTop = Math.min(panel.scrollTop + 900, panel.scrollHeight);
                    else window.scrollBy(0, 900);
                  }
                  return {
                    visibleExpandCount: controls.length,
                    matchedExpandCount: matched.length,
                    clicked,
                    clickedParents: Array.from(new Set(clickedParents)).slice(0, 20),
                    clickedTexts: clickedTexts.slice(0, 8),
                  };
                }
                """

                extract_js = """
                ({ parents }) => {
                  const norm = (s) => String(s || '').replace(/\s+/g, '').trim();
                  const clean = (s) => String(s || '').replace(/\u200b/g, '').replace(/\s+/g, ' ').trim();
                  const isVisible = (el) => {
                    if (!el) return false;
                    const rect = el.getBoundingClientRect();
                    const style = window.getComputedStyle(el);
                    return rect.width > 0 && rect.height > 0 && style.visibility !== 'hidden' && style.display !== 'none';
                  };
                  const parentNeedles = (parents || []).map(p => ({
                    cid: String(p.cid || ''),
                    text: clean(p.text),
                    textNeedle: norm(p.text).slice(0, 18),
                    nickNeedle: norm(p.nickname).replace(/（作者）|\(作者\)/g, '').slice(0, 12),
                    replyTotal: Number(p.replyTotal || 0),
                  })).filter(p => p.cid && p.textNeedle.length >= 4);
                  const allParentTextNeedles = parentNeedles.map(p => p.textNeedle).filter(Boolean);
                  const isActionLine = (line) => {
                    const t = norm(line);
                    if (!t) return true;
                    if (/^(回复|分享|收藏|举报|删除|点赞|发送|取消)$/.test(t)) return true;
                    if (/^\d+$/.test(t)) return true;
                    if (/^展开\d*条?回复/.test(t) || /^查看.*回复/.test(t) || /^共\d+条?回复/.test(t) || /^收起/.test(t)) return true;
                    if (/大家都在搜|全部评论|留下你的精彩评论|发布于|发表于/.test(t)) return true;
                    return false;
                  };
                  const isTimeLine = (line) => {
                    const t = clean(line);
                    return /(刚刚|\d+\s*秒前|\d+\s*分钟前|\d+\s*小时前|\d+\s*天前|昨天|前天|\d{1,2}-\d{1,2}|\d{4}-\d{1,2}-\d{1,2})/.test(t) || /小时前\s*[·・]/.test(t);
                  };
                  const prevMeaningful = (lines, start) => {
                    for (let i = start; i >= 0; i--) {
                      const v = clean(lines[i]);
                      if (!v || isActionLine(v) || isTimeLine(v)) continue;
                      return { index: i, value: v };
                    }
                    return null;
                  };
                  const parseEntries = (text, parent) => {
                    const lines = String(text || '').split(/\n+/).map(clean).filter(Boolean);
                    const entries = [];
                    const used = new Set();
                    for (let i = 0; i < lines.length; i++) {
                      if (!isTimeLine(lines[i])) continue;
                      const content = prevMeaningful(lines, i - 1);
                      if (!content) continue;
                      const nickname = prevMeaningful(lines, content.index - 1);
                      if (!nickname) continue;
                      const body = clean(content.value);
                      const nick = clean(nickname.value);
                      if (!body || !nick || isActionLine(body) || isActionLine(nick)) continue;
                      const bodyNorm = norm(body);
                      if (!bodyNorm || bodyNorm === parent.textNeedle || bodyNorm.includes(parent.textNeedle) || parent.textNeedle.includes(bodyNorm)) continue;
                      if (allParentTextNeedles.some(n => n && bodyNorm.includes(n))) continue;
                      const key = `${nick}|${body}|${lines[i]}`;
                      if (used.has(key)) continue;
                      used.add(key);
                      entries.push({ nickname: nick, text: body, time_text: clean(lines[i]) });
                    }
                    return entries;
                  };
                  const findBlocksForParent = (parent) => {
                    const nodes = Array.from(document.querySelectorAll('div')).filter(isVisible);
                    const candidates = [];
                    for (const el of nodes) {
                      const text = el.innerText || el.textContent || '';
                      const t = norm(text);
                      if (!t.includes(parent.textNeedle)) continue;
                      if (parent.nickNeedle && !t.includes(parent.nickNeedle) && t.length < parent.textNeedle.length + 120) continue;
                      const rawLen = text.length;
                      const lineCount = String(text).split(/\n+/).filter(x => clean(x)).length;
                      if (rawLen < parent.text.length || rawLen > 7000 || lineCount < 3) continue;
                      const hasReplyWord = /回复|展开|查看|共\d+条/.test(text);
                      const rect = el.getBoundingClientRect();
                      candidates.push({ el, text, rawLen, lineCount, hasReplyWord, top: rect.top });
                    }
                    candidates.sort((a, b) => {
                      const ar = a.hasReplyWord ? 0 : 1;
                      const br = b.hasReplyWord ? 0 : 1;
                      if (ar !== br) return ar - br;
                      return a.rawLen - b.rawLen;
                    });
                    return candidates.slice(0, 4);
                  };
                  const results = {};
                  const debug = {};
                  for (const parent of parentNeedles) {
                    const blocks = findBlocksForParent(parent);
                    const merged = [];
                    const seen = new Set();
                    const blockDebug = [];
                    for (const block of blocks) {
                      const entries = parseEntries(block.text, parent);
                      blockDebug.push({ rawLen: block.rawLen, lineCount: block.lineCount, hasReplyWord: block.hasReplyWord, sample: clean(block.text).slice(0, 260), parsed: entries.slice(0, 5) });
                      for (const entry of entries) {
                        const key = `${entry.nickname}|${entry.text}|${entry.time_text}`;
                        if (seen.has(key)) continue;
                        seen.add(key);
                        merged.push(entry);
                        if (parent.replyTotal > 0 && merged.length >= parent.replyTotal) break;
                      }
                      if (parent.replyTotal > 0 && merged.length >= parent.replyTotal) break;
                    }
                    if (merged.length > 0) results[parent.cid] = merged;
                    debug[parent.cid] = { blockCount: blocks.length, entries: merged.slice(0, 8), blocks: blockDebug };
                  }
                  return { results, debug };
                }
                """

                for pass_no in range(1, max(int(max_passes or 0), 1) + 1):
                    before_total = sum(len(v) for v in collected.values())
                    try:
                        action = page.evaluate(click_js, {"parents": parent_refs, "maxClicks": 8})
                    except Exception as exc:
                        action = {"error": f"{type(exc).__name__}: {exc}"}
                    print(
                        f"[STEP] 二级评论DOM展开：pass={pass_no} "
                        f"visible={action.get('visibleExpandCount', '-') if isinstance(action, dict) else '-'} "
                        f"matched={action.get('matchedExpandCount', '-') if isinstance(action, dict) else '-'} "
                        f"clicked={action.get('clicked', '-') if isinstance(action, dict) else '-'} "
                        f"parents={','.join((action.get('clickedParents') or [])[:6]) if isinstance(action, dict) else '-'}",
                        flush=True,
                    )
                    sleep_seconds(0.9 if isinstance(action, dict) and int(action.get("clicked") or 0) > 0 else 0.45)
                    try:
                        snapshot = page.evaluate(extract_js, {"parents": parent_refs})
                    except Exception as exc:
                        snapshot = {"error": f"{type(exc).__name__}: {exc}", "results": {}, "debug": {}}
                    try:
                        self._safe_write_debug_json(
                            dom_debug_dir / f"pass_{pass_no:02d}.json",
                            {
                                "pass": pass_no,
                                "action": action,
                                "snapshot_debug": snapshot.get("debug") if isinstance(snapshot, dict) else {},
                                "result_counts": {k: len(v or []) for k, v in (snapshot.get("results") or {}).items()} if isinstance(snapshot, dict) else {},
                            },
                        )
                    except Exception:
                        pass
                    results = snapshot.get("results") if isinstance(snapshot, dict) else {}
                    if isinstance(results, dict):
                        for parent_cid, entries in results.items():
                            if not isinstance(entries, list):
                                continue
                            bucket = collected.setdefault(text_clean(parent_cid), [])
                            for entry_index, entry in enumerate(entries, start=1):
                                if not isinstance(entry, dict):
                                    continue
                                nick = text_clean(entry.get("nickname"))
                                text_value = text_clean(entry.get("text"))
                                if not text_value:
                                    continue
                                key = f"{parent_cid}|{nick}|{text_value}|{text_clean(entry.get('time_text'))}"
                                if key in seen_keys:
                                    continue
                                seen_keys.add(key)
                                bucket.append(entry)
                    after_total = sum(len(v) for v in collected.values())
                    added = after_total - before_total
                    print(f"[STEP] 二级评论DOM提取：pass={pass_no} 新增={added} 累计={after_total}", flush=True)
                    unresolved = 0
                    for ref in parent_refs:
                        cid = text_clean(ref.get("cid"))
                        total = int(ref.get("replyTotal") or 0)
                        if total > 0 and len(collected.get(cid, [])) < total:
                            unresolved += 1
                    if unresolved <= 0 and after_total > 0:
                        break
                    clicked_count = int(action.get("clicked") or 0) if isinstance(action, dict) else 0
                    if added <= 0 and clicked_count <= 0:
                        no_progress_rounds += 1
                    else:
                        no_progress_rounds = 0
                    if no_progress_rounds >= 2:
                        break
                return collected

            try:
                if total_comments_hint is not None:
                    gap_count = max(int(total_comments_hint) - len(top_level_comments), 0)
                    print(
                        f"[STEP] 评论数量核对：平台total={total_comments_hint} 一级评论={len(top_level_comments)} "
                        f"待补回复/折叠差额≈{gap_count}",
                        flush=True,
                    )
                    # 保存一个回复数最高的父评论原始结构，便于判断一级接口里是否已携带内联回复。
                    reply_debug_parent = None
                    reply_debug_total = -1
                    for cid_key, raw_item in top_level_raw.items():
                        hint = self._reply_total_hint(raw_item)
                        if hint > reply_debug_total:
                            reply_debug_total = hint
                            reply_debug_parent = {"cid": cid_key, "replyTotal": hint, "raw": raw_item}
                    if reply_debug_parent and reply_debug_total > 0:
                        self._safe_write_debug_json(debug_dir / "reply_probe_parent_raw.json", reply_debug_parent)
                        print(
                            f"[STEP] 二级评论诊断样本：已保存回复最多父评论 raw={debug_dir / 'reply_probe_parent_raw.json'} replyTotal={reply_debug_total}",
                            flush=True,
                        )
            except Exception:
                pass

            dom_reply_map: Dict[str, List[Dict[str, Any]]] = {}

            reply_added_total = 0
            reply_parent_total = 0
            reply_failed_total = 0
            if not collect_replies:
                # 二级评论采集代码保留，当前按产品要求暂时关闭，只提取一级评论。
                print("[STEP] 二级评论采集已按当前配置关闭：本轮仅提取一级评论。", flush=True)
            if collect_replies and top_level_comments:
                print(f"[STEP] 二级评论采集开始：一级评论数={len(top_level_comments)}", flush=True)
                # 诊断文件已确认：一级 raw 只给 reply_comment_total，不给内联回复；
                # DOM 泛点又会把“展开17条回复”误绑定到其它父评论，因此本版停用
                # DOM 全局展开主链路，改为逐父评论使用页面完整参数的二级接口。
                print("[STEP] 二级评论DOM全局展开已停用：改用页面完整参数二级接口主链路。", flush=True)
                reply_api_probe_used = 0
                reply_api_disabled = False
                max_reply_api_probe = 10000
                for parent_index, parent in enumerate(list(top_level_comments), start=1):
                    if deadline_at and time.time() >= deadline_at:
                        print("[STEP] 二级评论采集停止：达到单作品评论采集时间上限。", flush=True)
                        break
                    parent_cid = text_clean(parent.comment_id)
                    if not parent_cid:
                        continue
                    raw_parent = top_level_raw.get(parent_cid) or {}
                    reply_total_hint = self._reply_total_hint(raw_parent)
                    inline_replies = self._inline_replies(raw_parent)
                    parent_new_count = 0

                    def append_reply_items(raw_replies: List[Dict[str, Any]], reply_page_no: int) -> Tuple[int, int]:
                        nonlocal parent_new_count, reply_added_total
                        raw_reply_count = len(raw_replies) if isinstance(raw_replies, list) else 0
                        added_count = 0
                        if not isinstance(raw_replies, list):
                            return 0, 0
                        for raw_reply in raw_replies:
                            if not isinstance(raw_reply, dict):
                                continue
                            reply_cid = text_clean(raw_reply.get("cid"))
                            if reply_cid and reply_cid in seen_cids:
                                continue
                            if reply_cid:
                                seen_cids.add(reply_cid)
                            reply_record = map_comment(
                                platform=self.platform,
                                source_account_url=source_account_url,
                                source_content_url=normalized_content_url,
                                item=raw_reply,
                                parent_comment_id=parent_cid,
                                author_identity=author_identity,
                            )
                            parent.replies.append(reply_record)
                            added_count += 1
                            parent_new_count += 1
                            reply_added_total += 1
                        return raw_reply_count, added_count

                    if inline_replies:
                        raw_inline, added_inline = append_reply_items(inline_replies, 0)
                        if added_inline > 0:
                            print(
                                f"[STEP] 二级评论内联预览：parent={parent_index}/{len(top_level_comments)} "
                                f"cid={parent_cid} raw={raw_inline} 新增={added_inline} 已收={len(parent.replies)} total={reply_total_hint}",
                                flush=True,
                            )

                    dom_entries = dom_reply_map.get(parent_cid) or []
                    if dom_entries:
                        dom_raw_items = [self._dom_reply_raw_item(parent_cid, entry, i) for i, entry in enumerate(dom_entries, start=1)]
                        raw_dom, added_dom = append_reply_items(dom_raw_items, -1)
                        if added_dom > 0:
                            print(
                                f"[STEP] 二级评论DOM命中：parent={parent_index}/{len(top_level_comments)} "
                                f"cid={parent_cid} raw={raw_dom} 新增={added_dom} 已收={len(parent.replies)} total={reply_total_hint}",
                                flush=True,
                            )

                    if reply_total_hint <= 0 and not inline_replies and not dom_entries:
                        continue
                    if reply_total_hint > 0 and len(parent.replies) >= reply_total_hint:
                        continue

                    reply_parent_total += 1
                    parent_reply_deadline_at = time.time() + max(18, min(45, (reply_total_hint or 20) * 1.2))
                    reply_cursor: Any = 0
                    reply_has_more: Optional[int] = 1
                    reply_page_no = 0
                    duplicate_reply_pages = 0
                    max_reply_pages = max(2, min(80, ((reply_total_hint or 20) // 20) + 6))
                    while reply_page_no < max_reply_pages:
                        if deadline_at and time.time() >= deadline_at:
                            print("[STEP] 二级评论分页停止：达到单作品评论采集时间上限。", flush=True)
                            break
                        if time.time() >= parent_reply_deadline_at:
                            print(
                                f"[STEP] 二级评论分页停止：父评论处理超时 parent={parent_index}/{len(top_level_comments)} cid={parent_cid} 已收={len(parent.replies)} total={reply_total_hint}",
                                flush=True,
                            )
                            break
                        if reply_has_more == 0 and (reply_total_hint <= 0 or len(parent.replies) >= reply_total_hint):
                            break
                        reply_page_no += 1
                        remaining_reply = None
                        if reply_total_hint > 0:
                            remaining_reply = max(reply_total_hint - len(parent.replies), 0)
                            if remaining_reply <= 0:
                                break
                        reply_page_size = max(5, min(20, remaining_reply if remaining_reply is not None else 20))
                        print(
                            f"[STEP] 二级评论请求：parent={parent_index}/{len(top_level_comments)} cid={parent_cid} "
                            f"page={reply_page_no} cursor={reply_cursor} count={reply_page_size} 已收={len(parent.replies)} total={reply_total_hint}",
                            flush=True,
                        )
                        payload = None
                        # DOM 主链路已经在进入逐父级循环前统一展开并提取；这里只消费
                        # 期间捕获到的真实 reply 响应。不要再对每个父评论重复点击/重试，
                        # 避免出现几十条“200 空响应”的长时间无效循环。
                        if reply_page_no == 1:
                            payload = take_captured_reply_payload(parent_cid)
                            if isinstance(payload, dict):
                                print(
                                    f"[STEP] 二级评论页面捕获命中：parent={parent_index}/{len(top_level_comments)} "
                                    f"cid={parent_cid} raw={len(self._extract_comment_list_from_payload(payload, prefer_reply_fields=True))}",
                                    flush=True,
                                )
                        if not isinstance(payload, dict):
                            if reply_api_disabled or reply_api_probe_used >= max_reply_api_probe:
                                print(
                                    f"[STEP] 二级评论接口兜底已停止：parent={parent_index}/{len(top_level_comments)} "
                                    f"cid={parent_cid} reason=previous_probe_failed_or_probe_limit，跳过接口重试。",
                                    flush=True,
                                )
                                break
                            reply_api_probe_used += 1
                            payload = self._fetch_reply_page(
                                page=page,
                                template_url=template_url,
                                video_id=video_id,
                                parent_comment_id=parent_cid,
                                cursor=reply_cursor,
                                count=reply_page_size,
                                debug_dir=debug_dir,
                                parent_index=parent_index,
                                reply_page_no=reply_page_no,
                            )
                        reply_items = self._extract_comment_list_from_payload(payload, prefer_reply_fields=True) if isinstance(payload, dict) else []
                        if not reply_items:
                            reply_failed_total += 1
                            payload_keys = ",".join(list(payload.keys())[:10]) if isinstance(payload, dict) else "-"
                            status_code, status_msg = self._payload_status_msg(payload) if isinstance(payload, dict) else (None, None)
                            diag_flag = bool(isinstance(payload, dict) and payload.get("__diagnostic__"))
                            http_status = payload.get("http_status") if isinstance(payload, dict) else None
                            content_type = payload.get("content_type") if isinstance(payload, dict) else None
                            parsed_type = payload.get("parsed_type") if isinstance(payload, dict) else None
                            parsed_keys = payload.get("parsed_keys") if isinstance(payload, dict) else None
                            body_head = payload.get("body_head") if isinstance(payload, dict) else None
                            diag_debug_path = None
                            if isinstance(payload, dict) and payload.get("url"):
                                try:
                                    diag_url = urlparse(str(payload.get("url") or ""))
                                    diag_debug_path = debug_dir / "reply_api_debug" / f"parent_{parent_index:03d}_{safe_path_key(parent_cid, fallback='parent')}_page_{reply_page_no:03d}.json"
                                except Exception:
                                    diag_url = None
                            else:
                                diag_url = None
                            print(
                                f"[STEP] 二级评论接口未返回有效回复列表：parent={parent_index}/{len(top_level_comments)} "
                                f"cid={parent_cid} page={reply_page_no} keys={payload_keys or '-'} "
                                f"status_code={status_code if status_code is not None else '-'} msg={status_msg or '-'} "
                                f"http={http_status if http_status is not None else '-'} content_type={content_type or '-'} "
                                f"parsed_type={parsed_type or '-'} parsed_keys={','.join(parsed_keys[:12]) if isinstance(parsed_keys, list) else '-'} "
                                f"diag={1 if diag_flag else 0} debug={diag_debug_path or '-'}",
                                flush=True,
                            )
                            if body_head:
                                print(f"[STEP] 二级评论响应预览：{self._response_text_head(body_head, 260)}", flush=True)
                            if diag_flag:
                                reply_api_disabled = True
                                print("[STEP] 二级评论接口兜底停止：探测返回无效响应，后续父评论不再重复接口请求。", flush=True)
                            break
                        raw_reply_count, added_reply_count = append_reply_items(reply_items, reply_page_no)
                        reply_cursor = self._payload_cursor(payload)
                        reply_has_more = self._payload_has_more(payload)
                        reply_page_total = self._payload_total_hint(payload)
                        if reply_page_total is not None:
                            reply_total_hint = max(reply_total_hint, reply_page_total)
                        print(
                            f"[STEP] 二级评论完成：parent={parent_index}/{len(top_level_comments)} page={reply_page_no} "
                            f"raw={raw_reply_count} 新增={added_reply_count} 已收={len(parent.replies)} "
                            f"has_more={reply_has_more if reply_has_more is not None else '-'} "
                            f"cursor={reply_cursor if reply_cursor is not None else '-'} total={reply_total_hint}",
                            flush=True,
                        )
                        if added_reply_count <= 0:
                            duplicate_reply_pages += 1
                            if duplicate_reply_pages >= 2 or raw_reply_count <= 0:
                                break
                        else:
                            duplicate_reply_pages = 0
                        if reply_has_more != 1 and (reply_total_hint <= 0 or len(parent.replies) >= reply_total_hint):
                            break
                        pause_sec = min(max(self.pacing.comment_page_pause(page_no=reply_page_no, total_hint=reply_total_hint) * 0.45, 0.25), 1.0)
                        if pause_sec > 0:
                            sleep_seconds(pause_sec)

                    if parent_new_count > 0:
                        print(
                            f"[STEP] 二级评论父级完成：parent={parent_index}/{len(top_level_comments)} "
                            f"cid={parent_cid} 新增={parent_new_count} 当前父级回复={len(parent.replies)} total={reply_total_hint}",
                            flush=True,
                        )
                    if reply_api_disabled and reply_added_total <= 0:
                        print(
                            "[STEP] 二级评论采集提前停止：页面DOM未提取到回复，接口探测也返回无效响应；"
                            "为避免无效重试，本轮不再继续遍历剩余父评论。",
                            flush=True,
                        )
                        break
                print(
                    f"[STEP] 二级评论采集结束：有回复父级={reply_parent_total} 新增回复={reply_added_total} 失败父级={reply_failed_total}",
                    flush=True,
                )

            item = ContentRecord(
                platform=self.platform,
                source_account_url=source_account_url,
                source_content_url=normalized_content_url,
                platform_content_id=video_id,
                caption=None,
                publish_time_raw=None,
                publish_time_iso=None,
                duration_raw=None,
                duration_sec=None,
                comments=comments,
                field_source={
                    "comments": "web_comment_api",
                },
            )
            result.items.append(item)

            summary = {
                "run_id": run_id,
                "platform": self.platform,
                "account_alias": account_alias,
                "input_content_url": content_url,
                "normalized_content_url": normalized_content_url,
                "source_account_url": source_account_url,
                "ok": True,
                "pacing_profile": getattr(self.pacing, "profile_name", None),
                "template_url": template_url,
                "cursor_key": cursor_key,
                "count_key": count_key,
                "aweme_key": aweme_key,
                "pages_fetched": page_no,
                "comments_collected": len(comments),
                "reply_comments_collected": reply_added_total,
                "total_comment_rows_collected": len(comments) + reply_added_total,
                "comments_limit": comment_limit,
                "comment_page_pause_sec": {
                    "min": getattr(self.pacing, "comment_page_pause_min_sec", None),
                    "max": getattr(self.pacing, "comment_page_pause_max_sec", None),
                },
                "captured_candidate_count": len(captured_candidates),
                "page_payloads": page_payloads,
            }
            summary_path = debug_dir / "summary.json"
            summary_path.write_text(json.dumps(summary, ensure_ascii=False, indent=2), encoding="utf-8")
            print(f"[STEP] 作品评论采集完成：一级评论={len(comments)} 二级回复={reply_added_total} 总评论行={len(comments) + reply_added_total} summary={summary_path}", flush=True)
            return result, summary_path
        finally:
            try:
                page.close()
            except Exception:
                pass

    def _fetch_json(self, page: Page, target_url: str, timeout_ms: int = COMMENT_FETCH_TIMEOUT_MS) -> Optional[Dict[str, Any]]:
        last_error = None
        timeout_ms = max(int(timeout_ms or COMMENT_FETCH_TIMEOUT_MS), 3000)
        for attempt in range(1, 4):
            try:
                result = page.evaluate(
                    """
                    async ({ targetUrl, timeoutMs }) => {
                      const controller = new AbortController();
                      const timer = setTimeout(() => controller.abort('timeout'), Math.max(Number(timeoutMs || 15000), 3000));
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
                        };
                      } catch (err) {
                        return {
                          ok: false,
                          status: 0,
                          text: '',
                          error: String((err && (err.name || err.message)) || err || 'fetch_failed'),
                        };
                      } finally {
                        clearTimeout(timer);
                      }
                    }
                    """,
                    {"targetUrl": target_url, "timeoutMs": timeout_ms},
                )
                if not result or not result.get("ok"):
                    error = result.get("error") if isinstance(result, dict) else None
                    status = result.get("status") if isinstance(result, dict) else None
                    last_error = error or f"status={status}"
                    print(f"[COMMENTS] 评论分页接口请求失败：status={status if status is not None else '-'} error={error or '-'}，重试 {attempt}/3", flush=True)
                    sleep_seconds(0.7 * attempt)
                    continue
                return safe_json_loads(result.get("text"))
            except Exception as exc:
                last_error = exc
                print(f"[COMMENTS] 评论分页接口请求异常：{exc}，重试 {attempt}/3", flush=True)
                sleep_seconds(0.7 * attempt)
        if last_error is not None:
            print(f"[COMMENTS] 评论分页接口请求最终失败：{last_error}", flush=True)
        return None
