from __future__ import annotations

from dataclasses import dataclass
from pathlib import Path
from typing import Protocol, Tuple

from playwright.sync_api import BrowserContext

from .comments_api import DouyinCommentsAPICollector
from .pacing import CrawlPacingPolicy
from .posts_api import DouyinPostsAPICollector


class PlatformAdapter(Protocol):
    platform: str

    def create_posts_collector(self, context: BrowserContext, output_dir: Path, pacing_policy: CrawlPacingPolicy | None = None): ...

    def create_comments_collector(self, context: BrowserContext, output_dir: Path, pacing_policy: CrawlPacingPolicy | None = None): ...


@dataclass(frozen=True)
class DouyinPlatformAdapter:
    platform: str = "douyin"

    def create_posts_collector(
        self,
        context: BrowserContext,
        output_dir: Path,
        pacing_policy: CrawlPacingPolicy | None = None,
    ) -> DouyinPostsAPICollector:
        return DouyinPostsAPICollector(
            platform=self.platform,
            context=context,
            output_dir=output_dir,
            pacing_policy=pacing_policy,
        )

    def create_comments_collector(
        self,
        context: BrowserContext,
        output_dir: Path,
        pacing_policy: CrawlPacingPolicy | None = None,
    ) -> DouyinCommentsAPICollector:
        return DouyinCommentsAPICollector(
            platform=self.platform,
            context=context,
            output_dir=output_dir,
            pacing_policy=pacing_policy,
        )


def get_platform_adapter(platform: str) -> PlatformAdapter:
    if platform == "douyin":
        return DouyinPlatformAdapter()
    raise NotImplementedError(f"当前 API-first adapter 尚未实现平台: {platform}")
