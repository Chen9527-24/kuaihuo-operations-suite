from __future__ import annotations

import random
import time
from dataclasses import dataclass, replace
from typing import Optional


DEFAULT_PACING_PROFILE = "conservative"
PACING_PROFILE_CHOICES = ("conservative", "balanced", "efficient")


@dataclass(frozen=True)
class CrawlPacingPolicy:
    """保守节流策略。

    目标是把账号级同步做成更稳态的工作流：分页抓取不要连续过快，
    单个作品完成后给浏览器与账号状态留出冷却时间。
    这里不做任何隐藏自动化特征的处理。
    """

    post_page_pause_base_sec: float = 1.2
    comment_page_pause_base_sec: float = 1.0
    post_cooldown_base_sec: float = 7.0
    post_cooldown_max_sec: float = 28.0
    per_comment_cooldown_sec: float = 0.08
    per_comment_page_extra_sec: float = 0.35
    pause_jitter_ratio: float = 0.22
    min_comment_page_size: int = 10
    max_comment_page_size: int = 40
    comment_page_pause_min_sec: Optional[float] = None
    comment_page_pause_max_sec: Optional[float] = None
    profile_name: str = DEFAULT_PACING_PROFILE

    def resolve_post_limit(self, max_posts: int) -> Optional[int]:
        return None if max_posts <= 0 else max_posts

    def resolve_comment_limit(self, max_comments_per_post: int) -> Optional[int]:
        return None if max_comments_per_post <= 0 else max_comments_per_post

    def should_continue_posts(self, current_count: int, max_posts: int) -> bool:
        limit = self.resolve_post_limit(max_posts)
        return True if limit is None else current_count < limit

    def should_continue_comments(self, current_count: int, max_comments_per_post: int) -> bool:
        limit = self.resolve_comment_limit(max_comments_per_post)
        return True if limit is None else current_count < limit

    def _with_jitter(self, seconds: float, min_sec: float = 0.0, max_sec: Optional[float] = None) -> float:
        base = max(seconds, min_sec)
        delta = max(base * self.pause_jitter_ratio, 0.08)
        jittered = base + random.uniform(-delta, delta)
        jittered = max(min_sec, jittered)
        if max_sec is not None:
            jittered = min(jittered, max_sec)
        return round(jittered, 2)

    def post_page_pause(self, page_no: int, fallback_sec: float = 1.0) -> float:
        base = self.post_page_pause_base_sec + max(page_no - 1, 0) * 0.16
        return self._with_jitter(base, min_sec=max(fallback_sec, 0.8))

    def comment_page_pause(self, page_no: int, total_hint: Optional[int] = None) -> float:
        if self.comment_page_pause_min_sec is not None or self.comment_page_pause_max_sec is not None:
            lower = max(float(self.comment_page_pause_min_sec or 0), 0.0)
            upper = max(float(self.comment_page_pause_max_sec if self.comment_page_pause_max_sec is not None else lower), lower)
            if upper <= 0:
                return 0.0
            return round(random.uniform(lower, upper), 2)

        total_factor = 0.0
        if total_hint:
            total_factor = min(max(total_hint, 0), 800) / 800 * 0.45
        base = self.comment_page_pause_base_sec + max(page_no - 1, 0) * 0.12 + total_factor
        return self._with_jitter(base, min_sec=0.9)

    def comment_page_size(self, page_no: int, total_hint: Optional[int] = None, remaining: Optional[int] = None) -> int:
        total = max(int(total_hint or 0), 0)
        if total <= 30:
            base = 12
        elif total <= 100:
            base = 18
        elif total <= 300:
            base = 24
        elif total <= 800:
            base = 32
        else:
            base = self.max_comment_page_size

        base += min(max(page_no - 1, 0) * 2, 6)
        size = base + random.randint(-2, 4)
        size = max(self.min_comment_page_size, min(size, self.max_comment_page_size))
        if remaining is not None and remaining > 0:
            size = min(size, remaining)
        return max(1, size)

    def between_post_cooldown(self, comment_count: int, comment_pages_fetched: int = 1) -> float:
        pause = self.post_cooldown_base_sec
        pause += max(comment_count, 0) * self.per_comment_cooldown_sec
        pause += max(comment_pages_fetched - 1, 0) * self.per_comment_page_extra_sec
        if comment_count <= 0:
            pause = max(pause, 4.5)
        return self._with_jitter(pause, min_sec=4.5, max_sec=self.post_cooldown_max_sec)


def normalize_pacing_profile(profile: Optional[str]) -> str:
    value = (profile or DEFAULT_PACING_PROFILE).strip().lower()
    return value if value in PACING_PROFILE_CHOICES else DEFAULT_PACING_PROFILE


def build_crawl_pacing_policy(profile: Optional[str] = None) -> CrawlPacingPolicy:
    resolved = normalize_pacing_profile(profile)
    presets = {
        "conservative": CrawlPacingPolicy(
            post_page_pause_base_sec=1.35,
            comment_page_pause_base_sec=1.2,
            post_cooldown_base_sec=8.5,
            post_cooldown_max_sec=34.0,
            per_comment_cooldown_sec=0.1,
            per_comment_page_extra_sec=0.42,
            pause_jitter_ratio=0.28,
            min_comment_page_size=10,
            max_comment_page_size=28,
            profile_name="conservative",
        ),
        "balanced": CrawlPacingPolicy(
            post_page_pause_base_sec=1.2,
            comment_page_pause_base_sec=1.0,
            post_cooldown_base_sec=7.0,
            post_cooldown_max_sec=28.0,
            per_comment_cooldown_sec=0.08,
            per_comment_page_extra_sec=0.35,
            pause_jitter_ratio=0.22,
            min_comment_page_size=10,
            max_comment_page_size=40,
            profile_name="balanced",
        ),
        "efficient": CrawlPacingPolicy(
            post_page_pause_base_sec=1.0,
            comment_page_pause_base_sec=0.88,
            post_cooldown_base_sec=5.8,
            post_cooldown_max_sec=22.0,
            per_comment_cooldown_sec=0.06,
            per_comment_page_extra_sec=0.28,
            pause_jitter_ratio=0.18,
            min_comment_page_size=12,
            max_comment_page_size=44,
            profile_name="efficient",
        ),
    }
    return presets[resolved]


def sleep_seconds(seconds: float) -> None:
    time.sleep(max(seconds, 0.0))


def with_comment_page_pause_range(policy: CrawlPacingPolicy, min_sec: Optional[float], max_sec: Optional[float]) -> CrawlPacingPolicy:
    lower = max(float(min_sec or 0), 0.0) if min_sec is not None else None
    upper = max(float(max_sec or 0), lower or 0.0) if max_sec is not None else None
    if lower is None and upper is None:
        return policy
    return replace(policy, comment_page_pause_min_sec=lower, comment_page_pause_max_sec=upper)
