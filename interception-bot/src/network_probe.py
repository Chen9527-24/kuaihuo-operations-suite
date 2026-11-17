from __future__ import annotations

import json
import random
import re
import time
from datetime import datetime
from pathlib import Path
from typing import Any, Dict, List, Optional, Tuple
from urllib.parse import urljoin, urlparse

from playwright.sync_api import BrowserContext, Locator, Page, Response

from .storage import output_section_dir


def normalize_url(base: str, href: str) -> str:
    if href.startswith("http://") or href.startswith("https://"):
        return href.split("?")[0]
    return urljoin(base, href).split("?")[0]


def infer_content_id(url: str) -> str:
    parsed = urlparse(url)
    last = parsed.path.rstrip("/").split("/")[-1] or parsed.path.rstrip("/")
    return last or "unknown_content"


def text_clean(s: Optional[str]) -> Optional[str]:
    if not s:
        return None
    s = re.sub(r"\s+", " ", s).strip()
    return s or None


def safe_json_loads(text: Optional[str]) -> Any:
    if not text:
        return None
    try:
        return json.loads(text)
    except Exception:
        return None


def redact_headers(headers: Dict[str, str]) -> Dict[str, str]:
    if not headers:
        return {}
    redacted = {}
    for k, v in headers.items():
        lk = k.lower()
        if lk in {"cookie", "authorization", "x-secsdk-csrf-token", "x-tt-token", "x-bogus"}:
            redacted[k] = "[REDACTED]"
        else:
            redacted[k] = v
    return redacted


def truncate_text(text: Optional[str], max_len: int = 3000) -> Optional[str]:
    if text is None:
        return None
    if len(text) <= max_len:
        return text
    return text[:max_len] + "...[TRUNCATED]"


def recursive_has_keys(obj: Any, wanted_keys: set[str], depth: int = 0, max_depth: int = 5) -> bool:
    if depth > max_depth:
        return False
    if isinstance(obj, dict):
        keys = {str(k).lower() for k in obj.keys()}
        if keys & wanted_keys:
            return True
        return any(recursive_has_keys(v, wanted_keys, depth + 1, max_depth) for v in obj.values())
    if isinstance(obj, list):
        return any(recursive_has_keys(v, wanted_keys, depth + 1, max_depth) for v in obj[:20])
    return False


def recursive_find_comment_like_list(obj: Any, depth: int = 0, max_depth: int = 6) -> bool:
    if depth > max_depth:
        return False

    if isinstance(obj, list) and obj:
        sample = obj[:10]
        dict_items = [x for x in sample if isinstance(x, dict)]
        if dict_items:
            score = 0
            candidate_keys = {
                "cid", "comment_id", "text", "content", "nickname", "user", "user_info",
                "create_time", "createTime", "ip_label", "ipLabel", "digg_count",
                "reply_comment_total", "reply_count", "image_list", "sticker"
            }
            for item in dict_items:
                keys = {str(k) for k in item.keys()}
                if keys & candidate_keys:
                    score += 1
            if score >= 2:
                return True

        return any(recursive_find_comment_like_list(v, depth + 1, max_depth) for v in sample)

    if isinstance(obj, dict):
        return any(recursive_find_comment_like_list(v, depth + 1, max_depth) for v in obj.values())

    return False


class CommentAPINetworkProbe:
    def __init__(self, platform: str, selectors: Dict[str, Any], context: BrowserContext, output_dir: Path):
        self.platform = platform
        self.selectors = selectors
        self.context = context
        self.output_dir = output_dir

    def probe(
        self,
        homepage_url: Optional[str],
        account_alias: str,
        content_url: Optional[str] = None,
        max_posts: int = 1,
        capture_seconds: int = 10,
        scroll_rounds: int = 4,
        pause_base: float = 1.0,
    ) -> Tuple[Path, Dict[str, Any]]:
        run_id = datetime.now().strftime("%Y%m%d_%H%M%S")
        base_dir = output_section_dir(self.output_dir, self.platform, account_alias, run_id, "network_probe")
        base_dir.mkdir(parents=True, exist_ok=True)

        if content_url:
            content_urls = [content_url]
            source_account_url = homepage_url or ""
        else:
            if not homepage_url:
                raise ValueError("homepage_url 和 content_url 至少要提供一个")
            content_urls = self.collect_homepage_links(homepage_url, max_posts=max_posts)
            source_account_url = homepage_url

        summary: Dict[str, Any] = {
            "run_id": run_id,
            "platform": self.platform,
            "account_alias": account_alias,
            "homepage_url": homepage_url,
            "content_urls": content_urls,
            "generated_at": datetime.now().astimezone().isoformat(),
            "items": [],
        }

        for url in content_urls:
            item_result = self._probe_single_content(
                source_account_url=source_account_url,
                content_url=url,
                base_dir=base_dir,
                capture_seconds=capture_seconds,
                scroll_rounds=scroll_rounds,
                pause_base=pause_base,
            )
            summary["items"].append(item_result)

        summary_path = base_dir / "summary.json"
        with summary_path.open("w", encoding="utf-8") as f:
            json.dump(summary, f, ensure_ascii=False, indent=2)

        return summary_path, summary

    def collect_homepage_links(self, homepage_url: str, max_posts: int = 20, max_scrolls: int = 15) -> List[str]:
        page = self.context.new_page()
        try:
            page.goto(homepage_url, wait_until="domcontentloaded", timeout=60000)
            time.sleep(3)

            found: List[str] = []
            seen = set()
            empty_rounds = 0

            for _ in range(max_scrolls):
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

                page.mouse.wheel(0, 2200)
                time.sleep(1.2)

            return found
        finally:
            page.close()

    def _probe_single_content(
        self,
        source_account_url: str,
        content_url: str,
        base_dir: Path,
        capture_seconds: int,
        scroll_rounds: int,
        pause_base: float,
    ) -> Dict[str, Any]:
        video_id = infer_content_id(content_url)
        item_dir = base_dir / video_id
        item_dir.mkdir(parents=True, exist_ok=True)

        page = self.context.new_page()
        captured: List[Dict[str, Any]] = []
        seen_keys = set()

        def on_response(response: Response):
            try:
                candidate = self._maybe_capture_response(response, content_url=content_url)
                if not candidate:
                    return
                unique_key = f"{candidate['url']}|{candidate['status']}|{candidate['score']}"
                if unique_key in seen_keys:
                    return
                seen_keys.add(unique_key)
                captured.append(candidate)
            except Exception:
                return

        page.on("response", on_response)

        try:
            page.goto(content_url, wait_until="domcontentloaded", timeout=60000)
            time.sleep(2.0)

            self._trigger_comment_loading(page, scroll_rounds=scroll_rounds, pause_base=pause_base)

            end_at = time.time() + max(capture_seconds, 3)
            while time.time() < end_at:
                time.sleep(0.6)

            captured.sort(key=lambda x: (-x["score"], x["url"]))

            saved_files = []
            for idx, item in enumerate(captured, start=1):
                fp = item_dir / f"candidate_{idx:03d}.json"
                with fp.open("w", encoding="utf-8") as f:
                    json.dump(item, f, ensure_ascii=False, indent=2)
                saved_files.append(str(fp))

            item_summary = {
                "source_account_url": source_account_url,
                "content_url": content_url,
                "video_id": video_id,
                "captured_candidate_count": len(captured),
                "saved_files": saved_files,
                "top_candidates": [
                    {
                        "url": x["url"],
                        "method": x["method"],
                        "status": x["status"],
                        "score": x["score"],
                        "reasons": x["reasons"],
                        "content_type": x["content_type"],
                    }
                    for x in captured[:10]
                ],
            }

            with (item_dir / "item_summary.json").open("w", encoding="utf-8") as f:
                json.dump(item_summary, f, ensure_ascii=False, indent=2)

            return item_summary
        finally:
            page.close()

    def _trigger_comment_loading(self, page: Page, scroll_rounds: int = 4, pause_base: float = 1.0):
        # 这里只用最小 DOM 动作触发评论请求，不依赖 DOM 产出数据
        time.sleep(pause_base + random.uniform(0.2, 0.6))

        # 尝试点“评论”tab（如果存在）
        for selector in [
            "text=评论",
            "button:has-text('评论')",
            "span:has-text('评论')",
        ]:
            try:
                loc = page.locator(selector).first
                if loc.count() > 0:
                    loc.click(timeout=1200)
                    time.sleep(pause_base + random.uniform(0.2, 0.5))
                    break
            except Exception:
                continue

        container = self._find_comment_container(page)

        last_hint = 0
        stable_rounds = 0

        for _ in range(scroll_rounds):
            current_hint = self._comment_count_hint(page)

            try:
                if container:
                    container.evaluate("(el) => { el.scrollTop = el.scrollHeight; }")
                else:
                    page.mouse.wheel(0, 900)
            except Exception:
                try:
                    page.mouse.wheel(0, 900)
                except Exception:
                    return

            time.sleep(pause_base + random.uniform(0.4, 0.9))

            for selector in self.selectors.get("load_more_comment_selectors", []):
                try:
                    btn = page.locator(selector).first
                    if btn.count() > 0:
                        btn.click(timeout=800)
                        time.sleep(pause_base + random.uniform(0.3, 0.7))
                except Exception:
                    continue

            new_hint = self._comment_count_hint(page)
            if new_hint <= current_hint and new_hint <= last_hint:
                stable_rounds += 1
            else:
                stable_rounds = 0

            last_hint = max(last_hint, new_hint)

            if stable_rounds >= 2:
                break

    def _comment_count_hint(self, page: Page) -> int:
        selectors = self.selectors.get("comment_item_selectors", [])
        for selector in selectors:
            try:
                count = page.locator(selector).count()
                if count > 0:
                    return count
            except Exception:
                continue
        return 0

    def _find_comment_container(self, page: Page) -> Optional[Locator]:
        for selector in self.selectors.get("comment_container_selectors", []):
            try:
                locator = page.locator(selector).first
                if locator.count() > 0:
                    return locator
            except Exception:
                continue
        return None

    def _maybe_capture_response(self, response: Response, content_url: str) -> Optional[Dict[str, Any]]:
        request = response.request
        resource_type = request.resource_type
        if resource_type not in {"xhr", "fetch"}:
            return None

        url = request.url
        method = request.method
        video_id = infer_content_id(content_url)

        post_data = None
        try:
            post_data = request.post_data
        except Exception:
            post_data = None

        content_type = None
        try:
            content_type = response.header_value("content-type")
        except Exception:
            content_type = None

        score, reasons = self._score_request_level(
            url=url,
            method=method,
            post_data=post_data,
            content_type=content_type,
            video_id=video_id,
        )

        if score < 2:
            return None

        response_text = None
        response_json = None
        try:
            response_text = response.text()
            if response_text:
                response_json = safe_json_loads(response_text)
        except Exception:
            response_text = None
            response_json = None

        extra_score, extra_reasons = self._score_response_level(
            url=url,
            response_text=response_text,
            response_json=response_json,
            video_id=video_id,
        )
        score += extra_score
        reasons.extend(extra_reasons)

        if score < 4:
            return None

        try:
            request_headers = redact_headers(request.headers)
        except Exception:
            request_headers = {}

        try:
            response_headers = redact_headers(response.headers)
        except Exception:
            response_headers = {}

        item = {
            "captured_at": datetime.now().astimezone().isoformat(),
            "video_id": video_id,
            "content_url": content_url,
            "url": url,
            "method": method,
            "status": response.status,
            "resource_type": resource_type,
            "content_type": content_type,
            "score": score,
            "reasons": reasons,
            "request_headers": request_headers,
            "response_headers": response_headers,
            "request_post_data": truncate_text(post_data, max_len=4000),
            "response_json": response_json,
            "response_text_excerpt": None if response_json is not None else truncate_text(response_text, max_len=5000),
        }
        return item

    def _score_request_level(
        self,
        url: str,
        method: str,
        post_data: Optional[str],
        content_type: Optional[str],
        video_id: str,
    ) -> Tuple[int, List[str]]:
        score = 0
        reasons: List[str] = []

        lower_url = url.lower()
        lower_post = (post_data or "").lower()
        lower_ct = (content_type or "").lower()

        positive_keywords = [
            "comment", "comments", "comment/list", "commentlist", "comment_list",
            "aweme/comment", "item/comment", "comment/fetch", "list/reply", "reply/list"
        ]
        negative_keywords = [
            "monitor", "metrics", "log", "report", "search", "feed", "recommend",
            "ad", "ads", "impression", "track", "notice"
        ]

        if any(k in lower_url for k in positive_keywords):
            score += 4
            reasons.append("url_contains_comment_keyword")

        if video_id and (video_id in lower_url or video_id in lower_post):
            score += 2
            reasons.append("video_id_present")

        if method.upper() in {"GET", "POST"}:
            score += 1
            reasons.append("common_api_method")

        if "json" in lower_ct:
            score += 1
            reasons.append("json_content_type")

        if any(k in lower_url for k in negative_keywords) and score < 4:
            score -= 2
            reasons.append("negative_url_keyword")

        return score, reasons

    def _score_response_level(
        self,
        url: str,
        response_text: Optional[str],
        response_json: Any,
        video_id: str,
    ) -> Tuple[int, List[str]]:
        score = 0
        reasons: List[str] = []

        if response_json is not None:
            if recursive_has_keys(
                response_json,
                {
                    "comment", "comments", "comment_list", "commentlist", "cid", "comment_id",
                    "reply_comment_total", "reply_count", "ip_label", "iplabel", "nickname",
                    "text", "content", "sticker", "image_list"
                },
            ):
                score += 3
                reasons.append("json_has_comment_like_keys")

            if recursive_find_comment_like_list(response_json):
                score += 5
                reasons.append("json_has_comment_like_list")

        else:
            lower_text = (response_text or "").lower()
            if "comment" in lower_text or "comments" in lower_text:
                score += 2
                reasons.append("text_contains_comment_keyword")
            if video_id and video_id in lower_text:
                score += 1
                reasons.append("response_text_contains_video_id")

        return score, reasons

    def _looks_like_content_link(self, href: str) -> bool:
        patterns = self.selectors.get("account_link_patterns", [])
        return any(pattern in href for pattern in patterns)