from __future__ import annotations

import hashlib
import os
import re
import time
import sys
from datetime import datetime, timedelta
from typing import Any, Dict, List, Optional, Sequence
from urllib.parse import urljoin, urlparse

from playwright.sync_api import BrowserContext, Locator, Page

from .date_parse import parse_duration_to_seconds, parse_human_datetime
from .models import CommentRecord, ContentRecord, RunResult


def normalize_url(base: str, href: str) -> str:
    if href.startswith("http://") or href.startswith("https://"):
        return href.split("?")[0]
    return urljoin(base, href).split("?")[0]


def text_clean(s: Optional[str]) -> Optional[str]:
    if not s:
        return None
    cleaned = re.sub(r"\s+", " ", s).strip()
    return cleaned or None


def extract_first_text(scope: Page | Locator, selectors: Sequence[str], timeout_ms: int = 700) -> Optional[str]:
    for selector in selectors:
        try:
            locator = scope.locator(selector).first
            if locator.count() > 0:
                text = locator.inner_text(timeout=timeout_ms)
                if text_clean(text):
                    return text_clean(text)
        except Exception:
            continue
    return None


def extract_all_texts(scope: Page | Locator, selectors: Sequence[str], per_selector_limit: int = 8) -> List[str]:
    results: List[str] = []
    seen = set()
    for selector in selectors:
        try:
            locator = scope.locator(selector)
            count = min(locator.count(), per_selector_limit)
            for i in range(count):
                try:
                    txt = text_clean(locator.nth(i).inner_text(timeout=500))
                    if txt and txt not in seen:
                        seen.add(txt)
                        results.append(txt)
                except Exception:
                    continue
        except Exception:
            continue
    return results


def click_all(scope: Page | Locator, selectors: Sequence[str], limit: int = 5) -> int:
    clicked = 0
    for selector in selectors:
        try:
            locator = scope.locator(selector)
            count = min(locator.count(), limit)
            for idx in range(count):
                try:
                    locator.nth(idx).click(timeout=600)
                    clicked += 1
                    time.sleep(0.3)
                except Exception:
                    continue
        except Exception:
            continue
    return clicked


def infer_content_id(url: str) -> str:
    parsed = urlparse(url)
    last = parsed.path.rstrip("/").split("/")[-1] or parsed.path.rstrip("/")
    return last or hashlib.md5(url.encode("utf-8")).hexdigest()


TIME_PATTERNS = [
    r"(今天\s*\d{1,2}:\d{2})",
    r"(昨天\s*\d{1,2}:\d{2})",
    r"(\d+\s*分钟前)",
    r"(\d+\s*小时前)",
    r"(\d+\s*天前)",
    r"(\d{4}[-/.]\d{1,2}[-/.]\d{1,2}\s+\d{1,2}:\d{2})",
    r"(\d{4}[-/.]\d{1,2}[-/.]\d{1,2})",
    r"(\d{1,2}-\d{1,2}\s+\d{1,2}:\d{2})",
]

REGION_PATTERNS = [
    r"(IP属地[:：]?\s*[^\s]+)",
    r"(IP[:：]?\s*[^\s]+)",
]

# 处理“4小时前·安徽”这种结构，提取“安徽”
TIME_REGION_PATTERNS = [
    r"(?:今天\s*\d{1,2}:\d{2}|昨天\s*\d{1,2}:\d{2}|\d+\s*分钟前|\d+\s*小时前|\d+\s*天前|\d{1,2}-\d{1,2}\s+\d{1,2}:\d{2})\s*[·•]\s*([^\s·•]+)"
]


def first_regex_match(text: Optional[str], patterns: Sequence[str]) -> Optional[str]:
    if not text:
        return None
    for pattern in patterns:
        m = re.search(pattern, text, flags=re.IGNORECASE)
        if m:
            return text_clean(m.group(1))
    return None


class PlatformScraper:
    def __init__(self, platform: str, selectors: Dict[str, Any], context: BrowserContext):
        self.platform = platform
        self.selectors = selectors
        self.context = context

    def _auth_cookie_names(self) -> set[str]:
        if self.platform == "douyin":
            return {
                "sessionid",
                "sessionid_ss",
                "sid_guard",
                "sid_tt",
                "uid_tt",
                "uid_tt_ss",
                "passport_csrf_token",
                "passport_csrf_token_default",
                "ssid_ucp_v1",
            }
        return set()

    def _context_has_auth_cookies(self, page: Page) -> bool:
        names = self._auth_cookie_names()
        if not names:
            return False

        try:
            urls = ["https://www.douyin.com/"]
            if page.url:
                urls.append(page.url)
            cookies = page.context.cookies(urls)
        except Exception:
            try:
                cookies = page.context.cookies()
            except Exception:
                cookies = []

        cookie_names = {
            str(item.get("name", "")).strip()
            for item in cookies
            if isinstance(item, dict)
        }
        return bool(cookie_names & names)

    def _looks_like_login_page(self, page: Page) -> bool:
        try:
            current_url = (page.url or "").lower()
        except Exception:
            current_url = ""

        if any(token in current_url for token in ["login", "passport", "signup", "auth"]):
            return True

        try:
            body_text = page.locator("body").inner_text(timeout=1200) or ""
        except Exception:
            return False

        markers = [
            "扫码登录",
            "验证码登录",
            "手机号登录",
            "授权登录",
            "登录后",
        ]
        return any(marker in body_text for marker in markers)

    def _wait_for_login_completion(self, page: Page, timeout_sec: int = 300) -> bool:
        deadline = time.time() + max(timeout_sec, 10)
        stable_hits = 0

        while time.time() < deadline:
            if page.is_closed():
                return self._context_has_auth_cookies(page)

            has_auth = self._context_has_auth_cookies(page)
            looks_login = self._looks_like_login_page(page)

            if has_auth and not looks_login:
                stable_hits += 1
                if stable_hits >= 2:
                    return True
            else:
                stable_hits = 0

            time.sleep(1.0)

        return False

    def _try_open_login_entry(self, page: Page) -> bool:
        if self._context_has_auth_cookies(page) or self._looks_like_login_page(page):
            return False

        selectors = [
            "text=登录",
            "text=立即登录",
            "text=扫码登录",
            "button:has-text('登录')",
            "a:has-text('登录')",
            "[data-e2e='login-button']",
        ]

        for selector in selectors:
            try:
                locator = page.locator(selector).first
                if locator.count() <= 0:
                    continue
                locator.click(timeout=1500)
                time.sleep(1.2)
                if self._looks_like_login_page(page) or self._context_has_auth_cookies(page):
                    print(f"[LOGIN] 已尝试触发登录入口：{selector}")
                    return True
            except Exception:
                continue
        return False

    def login(self, start_url: str) -> None:
        page = self.context.new_page()
        page.goto(start_url, wait_until="domcontentloaded", timeout=60000)
        print(f"[LOGIN] 已打开 {start_url}")

        gui_mode = os.getenv("ACS_GUI_MODE") == "1"
        interactive = sys.stdin.isatty() and not gui_mode

        if interactive:
            print("[LOGIN] 请在浏览器中完成登录/授权，然后回到终端按 Enter 继续...")
            input()
            page.close()
            return

        print("[LOGIN] 工作台模式：正在自动检测登录状态。")
        print("[LOGIN] 若已登录，会自动结束；若刚完成扫码/授权，也会自动结束并保存会话。")
        if self._try_open_login_entry(page):
            print("[LOGIN] 已尝试自动拉起登录入口；如页面出现扫码/授权，请直接在浏览器中完成。")
        elif not self._context_has_auth_cookies(page):
            print("[LOGIN] 当前页面未检测到已登录状态；若没有自动弹出登录框，请手动点击页面上的“登录”。")

        timeout_sec = int(os.getenv("ACS_LOGIN_WAIT_SEC", "300"))
        ok = False

        try:
            ok = self._wait_for_login_completion(page, timeout_sec=timeout_sec)
            if ok:
                print("[LOGIN] 已检测到登录/授权成功，正在关闭浏览器窗口并保存会话…")
            else:
                raise RuntimeError("在等待时间内未识别到登录成功，请确认已完成授权后重试。")
        finally:
            try:
                if not page.is_closed():
                    page.close()
            except Exception:
                pass

    def _detect_fatal_page_error(self, page: Page) -> Optional[str]:
        try:
            body_text = page.locator("body").inner_text(timeout=3000)
        except Exception:
            return None

        body_text = body_text or ""
        fatal_markers = [
            "用户不存在",
            "该用户不存在",
            "账号不存在",
            "页面不存在",
            "内容不存在",
            "访问受限",
            "暂时无法查看",
        ]

        for marker in fatal_markers:
            if marker in body_text:
                return marker
        return None

    def collect_homepage_links(self, homepage_url: str, max_posts: int = 20, max_scrolls: int = 15) -> List[str]:
        page = self.context.new_page()
        try:
            page.goto(homepage_url, wait_until="domcontentloaded", timeout=60000)
            time.sleep(3)

            fatal_error = self._detect_fatal_page_error(page)
            if fatal_error:
                raise ValueError(f"主页不可用，页面提示：{fatal_error}，请检查 homepage-url 是否为真实可访问的 PC 主页地址")

            found: List[str] = []
            seen = set()
            empty_rounds = 0

            for _ in range(max_scrolls):
                fatal_error = self._detect_fatal_page_error(page)
                if fatal_error:
                    raise ValueError(f"主页采集中断，页面提示：{fatal_error}")

                hrefs: List[str] = []
                for selector in self.selectors.get("homepage_link_selectors", []):
                    try:
                        elements = page.locator(selector)
                        count = min(elements.count(), 200)
                        for idx in range(count):
                            href = elements.nth(idx).get_attribute("href")
                            if href:
                                hrefs.append(normalize_url(page.url, href))
                    except Exception:
                        continue

                new_count = 0
                for href in hrefs:
                    if self._looks_like_content_link(href) and href not in seen:
                        seen.add(href)
                        found.append(href)
                        new_count += 1
                        if len(found) >= max_posts:
                            return found

                if new_count == 0:
                    empty_rounds += 1
                else:
                    empty_rounds = 0

                if empty_rounds >= 2:
                    break

                page.mouse.wheel(0, 2500)
                time.sleep(1.2)

            return found
        finally:
            page.close()

    def scrape_item(
        self,
        source_account_url: str,
        content_url: str,
        max_comments: int = 200,
        days: int = 10,
        max_duration_sec: Optional[int] = None,
    ) -> Optional[ContentRecord]:
        page = self.context.new_page()
        try:
            page.goto(content_url, wait_until="domcontentloaded", timeout=60000)
            time.sleep(2)

            click_all(page, self.selectors.get("load_more_comment_selectors", []), limit=3)
            click_all(page, self.selectors.get("expand_reply_selectors", []), limit=3)
            self._scroll_comments(page, rounds=4)

            caption = extract_first_text(page, self.selectors.get("detail_caption_selectors", []))
            publish_time_raw = self._extract_publish_time(page)
            duration_raw = extract_first_text(page, self.selectors.get("detail_duration_selectors", []))
            publish_dt = parse_human_datetime(publish_time_raw)
            duration_sec = parse_duration_to_seconds(duration_raw)

            if publish_dt and publish_dt < datetime.now().astimezone() - timedelta(days=days):
                return None

            if max_duration_sec is not None and duration_sec is not None and duration_sec > max_duration_sec:
                return None

            comments = self._extract_comments(page, content_url, source_account_url, max_comments=max_comments)

            item = ContentRecord(
                platform=self.platform,
                source_account_url=source_account_url,
                source_content_url=content_url,
                platform_content_id=infer_content_id(content_url),
                caption=caption,
                publish_time_raw=publish_time_raw,
                publish_time_iso=publish_dt.isoformat() if publish_dt else None,
                duration_raw=duration_raw,
                duration_sec=duration_sec,
                comments=comments,
                field_source={
                    "caption": "browser_dom",
                    "publish_time": "browser_dom",
                    "duration": "browser_dom",
                    "comments": "browser_dom",
                },
            )
            return item
        finally:
            page.close()

    def sync(
        self,
        homepage_url: str,
        account_alias: str,
        days: int = 10,
        max_posts: int = 20,
        max_comments_per_post: int = 200,
        max_duration_sec: Optional[int] = None,
    ) -> RunResult:
        run_id = datetime.now().strftime("%Y%m%d_%H%M%S")
        result = RunResult(
            run_id=run_id,
            platform=self.platform,
            homepage_url=homepage_url,
            account_alias=account_alias,
            generated_at=datetime.now().astimezone().isoformat(),
            items=[],
        )

        content_urls = self.collect_homepage_links(homepage_url, max_posts=max_posts)
        if not content_urls:
            print("[WARN] 未找到任何作品链接。请优先检查：")
            print("1) homepage-url 是否为真实可访问的 PC 主页地址")
            print("2) 登录态是否仍然有效")
            print("3) 当前页面是否出现风控、验证、或页面结构变化")
            return result

        for url in content_urls:
            try:
                item = self.scrape_item(
                    source_account_url=homepage_url,
                    content_url=url,
                    max_comments=max_comments_per_post,
                    days=days,
                    max_duration_sec=max_duration_sec,
                )
                if item:
                    result.items.append(item)
            except Exception as exc:
                print(f"[WARN] 抓取失败: {url} -> {exc}")
                continue
        return result

    def _looks_like_content_link(self, href: str) -> bool:
        patterns = self.selectors.get("account_link_patterns", [])
        return any(pattern in href for pattern in patterns)

    def _find_comment_container(self, page: Page) -> Optional[Locator]:
        for selector in self.selectors.get("comment_container_selectors", []):
            try:
                locator = page.locator(selector).first
                if locator.count() > 0:
                    return locator
            except Exception:
                continue
        return None

    def _scroll_comments(self, page: Page, rounds: int = 6):
        container = self._find_comment_container(page)

        for _ in range(rounds):
            if page.is_closed():
                return

            click_all(page, self.selectors.get("load_more_comment_selectors", []), limit=3)
            click_all(page, self.selectors.get("expand_reply_selectors", []), limit=3)

            try:
                if container:
                    container.evaluate("(el) => { el.scrollTop = el.scrollHeight; }")
                else:
                    page.mouse.wheel(0, 1200)
            except Exception:
                try:
                    page.mouse.wheel(0, 1200)
                except Exception:
                    return

            time.sleep(1.0)

    def _extract_publish_time(self, page: Page) -> Optional[str]:
        raw = extract_first_text(page, self.selectors.get("detail_publish_time_selectors", []))
        if raw:
            return raw

        try:
            body_text = page.locator("body").inner_text(timeout=3000)
        except Exception:
            return None

        return first_regex_match(body_text, TIME_PATTERNS)

    def _extract_comments(self, page: Page, content_url: str, account_url: str, max_comments: int = 200) -> List[CommentRecord]:
        records: List[CommentRecord] = []
        item_selectors = self.selectors.get("comment_item_selectors", [])

        comment_nodes: List[Locator] = []
        for selector in item_selectors:
            try:
                locator = page.locator(selector)
                count = min(locator.count(), max_comments * 3)
                nodes = [locator.nth(i) for i in range(count)]
                if nodes:
                    comment_nodes = nodes
                    break
            except Exception:
                continue

        for node in comment_nodes:
            comment = self._parse_comment_node(node, content_url, account_url)
            if comment is None:
                continue
            records.append(comment)
            if len(records) >= max_comments:
                break

        return records

    def _parse_comment_node(self, node: Locator, content_url: str, account_url: str) -> Optional[CommentRecord]:
        full_text = self._safe_inner_text(node)
        nickname = self._extract_nickname(node, full_text)
        user_id = self._extract_user_id(node)
        comment_time_raw = self._extract_time(node, full_text, is_reply=False)
        visible_region = self._extract_region(node, full_text, is_reply=False)
        media_urls = self._extract_media_urls(node)
        has_media = len(media_urls) > 0

        comment_text = self._extract_comment_text(
            node=node,
            full_text=full_text,
            nickname=nickname,
            comment_time_raw=comment_time_raw,
            visible_region=visible_region,
            is_reply=False,
        )

        if has_media:
            # 图片/贴纸评论常见情况：没有真正文本，或者只剩省略号/整块 UI 文本
            if not comment_text or comment_text in {"...", "…", "......"}:
                comment_type = "image"
                comment_text = "[image_comment]"
            else:
                comment_type = "mixed"
        else:
            if not comment_text:
                return None
            comment_type = "text"

        dt = parse_human_datetime(comment_time_raw)
        comment_id = self._extract_comment_id(node)
        replies = self._extract_replies(node, content_url, account_url, parent_comment_id=comment_id)

        return CommentRecord(
            comment_id=comment_id,
            parent_comment_id=None,
            user_id=user_id,
            nickname=nickname,
            comment_text=comment_text,
            comment_time_raw=comment_time_raw,
            comment_time_iso=dt.isoformat() if dt else None,
            visible_region=visible_region,
            source_account_url=account_url,
            source_content_url=content_url,
            platform=self.platform,
            comment_type=comment_type,
            has_media=has_media,
            media_urls=media_urls,
            replies=replies,
        )

    def _extract_replies(
        self,
        node: Locator,
        content_url: str,
        account_url: str,
        parent_comment_id: Optional[str],
    ) -> List[CommentRecord]:
        replies: List[CommentRecord] = []
        click_all(node, self.selectors.get("expand_reply_selectors", []), limit=5)

        for selector in self.selectors.get("reply_item_selectors", []):
            try:
                locator = node.locator(selector)
                count = min(locator.count(), 50)
                for idx in range(count):
                    reply_node = locator.nth(idx)
                    full_text = self._safe_inner_text(reply_node)
                    nickname = self._extract_nickname(reply_node, full_text)
                    user_id = self._extract_user_id(reply_node)
                    comment_time_raw = self._extract_time(reply_node, full_text, is_reply=True)
                    visible_region = self._extract_region(reply_node, full_text, is_reply=True)
                    media_urls = self._extract_media_urls(reply_node)
                    has_media = len(media_urls) > 0

                    comment_text = self._extract_comment_text(
                        node=reply_node,
                        full_text=full_text,
                        nickname=nickname,
                        comment_time_raw=comment_time_raw,
                        visible_region=visible_region,
                        is_reply=True,
                    )

                    if has_media:
                        if not comment_text or comment_text in {"...", "…", "......"}:
                            comment_type = "image"
                            comment_text = "[image_comment]"
                        else:
                            comment_type = "mixed"
                    else:
                        if not comment_text:
                            continue
                        comment_type = "text"

                    dt = parse_human_datetime(comment_time_raw)

                    replies.append(
                        CommentRecord(
                            comment_id=self._extract_comment_id(reply_node),
                            parent_comment_id=parent_comment_id,
                            user_id=self._extract_user_id(reply_node),
                            nickname=nickname,
                            comment_text=comment_text,
                            comment_time_raw=comment_time_raw,
                            comment_time_iso=dt.isoformat() if dt else None,
                            visible_region=visible_region,
                            source_account_url=account_url,
                            source_content_url=content_url,
                            platform=self.platform,
                            comment_type=comment_type,
                            has_media=has_media,
                            media_urls=media_urls,
                            replies=[],
                        )
                    )
                if replies:
                    break
            except Exception:
                continue
        return replies

    def _extract_comment_text(
        self,
        node: Locator,
        full_text: Optional[str],
        nickname: Optional[str],
        comment_time_raw: Optional[str],
        visible_region: Optional[str],
        is_reply: bool = False,
    ) -> Optional[str]:
        selector_key = "reply_text_selectors" if is_reply else "comment_text_selectors"
        candidates = extract_all_texts(node, self.selectors.get(selector_key, []), per_selector_limit=6)

        filtered_candidates: List[str] = []
        for c in candidates:
            normalized = self._normalize_candidate_text(c, nickname, comment_time_raw, visible_region)
            if not normalized:
                continue
            filtered_candidates.append(normalized)

        if filtered_candidates:
            filtered_candidates.sort(key=len, reverse=True)
            best = filtered_candidates[0]
            if best not in {"...", "…", "......"}:
                return best

        normalized_full = self._normalize_candidate_text(full_text, nickname, comment_time_raw, visible_region)
        if normalized_full:
            return normalized_full

        return None

    def _normalize_candidate_text(
        self,
        text: Optional[str],
        nickname: Optional[str],
        comment_time_raw: Optional[str],
        visible_region: Optional[str],
    ) -> Optional[str]:
        t = text_clean(text)
        if not t:
            return None

        # 删除昵称前缀
        if nickname:
            t = re.sub(rf"^{re.escape(nickname)}\s*", "", t)

        # 删除“4小时前·安徽”这类时间+地域片段
        if comment_time_raw:
            t = re.sub(rf"{re.escape(comment_time_raw)}\s*[·•]?\s*[^\s·•]*", "", t)

        # 删除单独地域 / IP 文本
        if visible_region:
            t = t.replace(visible_region, "")
        t = re.sub(r"IP属地[:：]?\s*[^\s]+", "", t)

        # 删除常见 UI 文本
        t = re.sub(r"\b分享\b", "", t)
        t = re.sub(r"\b回复\b", "", t)
        t = re.sub(r"\b展开\b", "", t)
        t = re.sub(r"\b收起\b", "", t)
        t = re.sub(r"\b更多回复\b", "", t)

        # 删除纯数字计数或尾部计数
        t = re.sub(r"^\d+$", "", t)
        t = re.sub(r"\s+\d+\s*$", "", t)

        # 删除多余分隔符
        t = re.sub(r"[·•]+", " ", t)
        t = re.sub(r"\s+", " ", t).strip()

        if self._is_useless_text(t):
            return None
        return t

    def _extract_media_urls(self, node: Locator) -> List[str]:
        urls: List[str] = []
        seen = set()

        try:
            imgs = node.locator("img")
            count = min(imgs.count(), 10)
            for i in range(count):
                try:
                    img = imgs.nth(i)
                    src = img.get_attribute("src")
                    alt = text_clean(img.get_attribute("alt"))
                    cls = (img.get_attribute("class") or "").lower()

                    if "avatar" in cls:
                        continue
                    if alt and ("头像" in alt or "avatar" in alt.lower()):
                        continue
                    if src and src not in seen:
                        seen.add(src)
                        urls.append(src)
                except Exception:
                    continue
        except Exception:
            pass

        return urls

    def _is_useless_text(self, text: Optional[str]) -> bool:
        t = text_clean(text)
        if not t:
            return True

        if re.fullmatch(r"\d+", t):
            return True

        if t in {"...", "…", "......"}:
            return True

        useless_patterns = [
            r"^回复$",
            r"^展开$",
            r"^收起$",
            r"^更多回复$",
            r"^置顶$",
            r"^作者$",
            r"^赞$",
            r"^\d+\s*赞$",
            r"^\d+\s*回复$",
            r"^分享$",
            r"^IP属地",
            r"^\d+\s*分钟前$",
            r"^\d+\s*小时前$",
            r"^\d+\s*天前$",
            r"^今天\s*\d{1,2}:\d{2}$",
            r"^昨天\s*\d{1,2}:\d{2}$",
        ]
        for pattern in useless_patterns:
            if re.search(pattern, t, flags=re.IGNORECASE):
                return True

        return False

    def _extract_nickname(self, node: Locator, full_text: Optional[str]) -> Optional[str]:
        candidates = extract_all_texts(node, self.selectors.get("comment_author_selectors", []), per_selector_limit=10)
        for c in candidates:
            if c and not re.fullmatch(r"\d+", c):
                return c

        try:
            links = node.locator("a")
            count = min(links.count(), 10)
            for i in range(count):
                txt = text_clean(links.nth(i).inner_text(timeout=500))
                href = links.nth(i).get_attribute("href")
                if txt and href and "/user/" in href:
                    return txt
        except Exception:
            pass

        if full_text:
            lines = [text_clean(x) for x in re.split(r"[\r\n]+", full_text)]
            lines = [x for x in lines if x]
            for line in lines[:3]:
                if not re.fullmatch(r"\d+", line) and len(line) <= 30 and "IP属地" not in line:
                    return line

        return None

    def _extract_time(self, node: Locator, full_text: Optional[str], is_reply: bool = False) -> Optional[str]:
        selector_key = "reply_time_selectors" if is_reply else "comment_time_selectors"
        raw = extract_first_text(node, self.selectors.get(selector_key, []))
        if raw:
            return raw
        return first_regex_match(full_text, TIME_PATTERNS)

    def _extract_region(self, node: Locator, full_text: Optional[str], is_reply: bool = False) -> Optional[str]:
        selector_key = "reply_region_selectors" if is_reply else "comment_region_selectors"
        raw = extract_first_text(node, self.selectors.get(selector_key, []))
        if raw:
            return raw

        raw = first_regex_match(full_text, REGION_PATTERNS)
        if raw:
            return raw

        raw = first_regex_match(full_text, TIME_REGION_PATTERNS)
        if raw:
            return raw

        return None

    def _safe_inner_text(self, node: Locator) -> Optional[str]:
        try:
            return text_clean(node.inner_text(timeout=700))
        except Exception:
            return None

    def _extract_comment_id(self, node: Locator) -> Optional[str]:
        for attr in ["data-id", "data-e2e-comment-id", "id"]:
            try:
                value = node.get_attribute(attr)
                if value:
                    return value
            except Exception:
                continue

        try:
            html = node.inner_html(timeout=500)
            return hashlib.md5(html.encode("utf-8")).hexdigest()[:16]
        except Exception:
            return None

    def _extract_user_id(self, node: Locator) -> Optional[str]:
        try:
            links = node.locator("a")
            count = min(links.count(), 10)
            for i in range(count):
                href = links.nth(i).get_attribute("href")
                if href and "/user/" in href:
                    return href
        except Exception:
            return None
        return None
