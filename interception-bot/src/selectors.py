from __future__ import annotations

from copy import deepcopy
from pathlib import Path
import json
from typing import Any, Dict


DEFAULT_SELECTORS: Dict[str, Dict[str, Any]] = {
    "tiktok": {
        "start_url": "https://www.tiktok.com/",
        "account_link_patterns": ["/video/"],
        "homepage_link_selectors": [
            "a[href*='/video/']",
            "div[data-e2e='user-post-item'] a[href*='/video/']",
            "a[data-e2e='user-post-item-link']",
        ],
        "detail_caption_selectors": [
            "h1[data-e2e='browse-video-desc']",
            "div[data-e2e='browse-video-desc']",
            "div[data-e2e='video-desc']",
        ],
        "detail_publish_time_selectors": [
            "span[data-e2e='browser-nickname'] + span",
            "span[data-e2e='browser-nickname'] ~ span",
            "time",
        ],
        "detail_duration_selectors": [
            "div[data-e2e='video-card-badge']",
            "span[data-e2e='video-duration']",
        ],
        "comment_container_selectors": [
            "div[data-e2e='comment-list']",
            "div[class*='comment-list']",
            "div[class*='CommentList']",
        ],
        "comment_item_selectors": [
            "div[data-e2e='comment-item']",
            "div[class*='CommentItem']",
        ],
        "comment_text_selectors": [
            "p[data-e2e='comment-level-1']",
            "span[data-e2e='comment-level-1']",
            "p[class*='CommentText']",
        ],
        "comment_author_selectors": [
            "a[href*='/@']",
            "span[data-e2e='comment-username-1']",
        ],
        "comment_time_selectors": [
            "span[data-e2e='comment-time-1']",
            "span[class*='Time']",
        ],
        "comment_region_selectors": [],
        "reply_item_selectors": ["div[data-e2e='comment-reply-item']"],
        "reply_text_selectors": [
            "p[data-e2e='comment-level-2']",
            "span[data-e2e='comment-level-2']",
        ],
        "reply_author_selectors": [
            "a[href*='/@']",
            "span[data-e2e='comment-username-2']",
        ],
        "reply_time_selectors": ["span[data-e2e='comment-time-2']"],
        "reply_region_selectors": [],
        "load_more_comment_selectors": [
            "button:has-text('Load more comments')",
            "span:has-text('View more comments')",
        ],
        "expand_reply_selectors": [
            "span:has-text('View more replies')",
            "button:has-text('View more replies')",
        ],
    },
    "douyin": {
        "start_url": "https://www.douyin.com/",
        "account_link_patterns": ["/video/"],
        "homepage_link_selectors": [
            "a[href*='/video/']",
            "li a[href*='/video/']",
            "div[data-e2e='user-post-item'] a[href*='/video/']",
        ],
        "detail_caption_selectors": [
            "h1",
            "div[data-e2e='video-desc']",
            "div[class*='title']",
        ],
        "detail_publish_time_selectors": [
            "time",
            "span[class*='publish']",
            "div[class*='time']",
        ],
        "detail_duration_selectors": [
            "span[class*='duration']",
            "div[class*='time']",
        ],
        "comment_container_selectors": [
            "div[data-e2e='comment-list']",
            "div[class*='comment-list']",
            "div[class*='commentList']",
            "div[class*='comment-panel']",
            "div[class*='commentPanel']",
            "aside div[class*='scroll']",
        ],
        "comment_item_selectors": [
            "div[data-e2e='comment-item']",
            "div[class*='comment-item']",
            "li[class*='comment']",
        ],
        "comment_text_selectors": [
            "p[data-e2e='comment-level-1']",
            "span[class*='comment-content']",
            "p",
        ],
        "comment_author_selectors": [
            "a[href*='/user/']",
            "span[class*='nickname']",
        ],
        "comment_time_selectors": [
            "span[class*='time']",
            "time",
        ],
        "comment_region_selectors": [
            "span[class*='ip']",
            "span:has-text('IP')",
        ],
        "reply_item_selectors": [
            "div[class*='reply-item']",
            "li[class*='reply']",
        ],
        "reply_text_selectors": [
            "p",
            "span[class*='comment-content']",
        ],
        "reply_author_selectors": [
            "a[href*='/user/']",
            "span[class*='nickname']",
        ],
        "reply_time_selectors": [
            "span[class*='time']",
            "time",
        ],
        "reply_region_selectors": [
            "span[class*='ip']",
            "span:has-text('IP')",
        ],
        "load_more_comment_selectors": [
            "button:has-text('更多评论')",
            "span:has-text('更多评论')",
        ],
        "expand_reply_selectors": [
            "span:has-text('展开')",
            "button:has-text('展开')",
            "span:has-text('更多回复')",
        ],
    },
    "xiaohongshu": {
        "start_url": "https://www.xiaohongshu.com/",
        "account_link_patterns": ["/explore/", "/discovery/item/"],
        "homepage_link_selectors": [
            "a[href*='/explore/']",
            "a[href*='/discovery/item/']",
            "section a[href*='/explore/']",
        ],
        "detail_caption_selectors": [
            "div[class*='title']",
            "h1",
            "div[class*='note-content']",
        ],
        "detail_publish_time_selectors": [
            "div[class*='publish']",
            "span[class*='date']",
            "time",
        ],
        "detail_duration_selectors": [
            "span[class*='duration']",
        ],
        "comment_container_selectors": [
            "div[class*='comment-list']",
            "div[class*='comments-container']",
            "div[class*='commentContainer']",
        ],
        "comment_item_selectors": [
            "div[class*='comment-item']",
            "div[class*='commentItem']",
        ],
        "comment_text_selectors": [
            "div[class*='content']",
            "span[class*='content']",
            "p",
        ],
        "comment_author_selectors": [
            "a[href*='/user/profile/']",
            "span[class*='author']",
        ],
        "comment_time_selectors": [
            "span[class*='time']",
            "time",
        ],
        "comment_region_selectors": [
            "span:has-text('IP')",
            "span[class*='ip']",
        ],
        "reply_item_selectors": [
            "div[class*='reply-item']",
            "div[class*='sub-comment']",
        ],
        "reply_text_selectors": [
            "div[class*='content']",
            "p",
        ],
        "reply_author_selectors": [
            "a[href*='/user/profile/']",
            "span[class*='author']",
        ],
        "reply_time_selectors": [
            "span[class*='time']",
            "time",
        ],
        "reply_region_selectors": [
            "span:has-text('IP')",
            "span[class*='ip']",
        ],
        "load_more_comment_selectors": [
            "span:has-text('查看更多评论')",
            "button:has-text('查看更多评论')",
        ],
        "expand_reply_selectors": [
            "span:has-text('展开')",
            "span:has-text('更多回复')",
        ],
    },
    "kuaishou": {
        "start_url": "https://www.kuaishou.com/",
        "account_link_patterns": ["/short-video/", "/photo/"],
        "homepage_link_selectors": [
            "a[href*='/short-video/']",
            "a[href*='/photo/']",
            "div a[href*='/short-video/']",
        ],
        "detail_caption_selectors": [
            "div[class*='title']",
            "h1",
            "div[class*='caption']",
        ],
        "detail_publish_time_selectors": [
            "time",
            "span[class*='time']",
        ],
        "detail_duration_selectors": [
            "span[class*='duration']",
        ],
        "comment_container_selectors": [
            "div[class*='comment-list']",
            "div[class*='comments']",
            "div[class*='scroll']",
        ],
        "comment_item_selectors": [
            "div[class*='comment-item']",
            "li[class*='comment']",
        ],
        "comment_text_selectors": [
            "div[class*='text']",
            "p",
        ],
        "comment_author_selectors": [
            "a[href*='/profile/']",
            "span[class*='name']",
        ],
        "comment_time_selectors": [
            "span[class*='time']",
            "time",
        ],
        "comment_region_selectors": [
            "span:has-text('IP')",
            "span[class*='ip']",
        ],
        "reply_item_selectors": [
            "div[class*='reply-item']",
            "li[class*='reply']",
        ],
        "reply_text_selectors": [
            "div[class*='text']",
            "p",
        ],
        "reply_author_selectors": [
            "a[href*='/profile/']",
            "span[class*='name']",
        ],
        "reply_time_selectors": [
            "span[class*='time']",
            "time",
        ],
        "reply_region_selectors": [
            "span:has-text('IP')",
            "span[class*='ip']",
        ],
        "load_more_comment_selectors": [
            "span:has-text('更多评论')",
            "button:has-text('更多评论')",
        ],
        "expand_reply_selectors": [
            "span:has-text('展开')",
            "span:has-text('更多回复')",
        ],
    },
}


def load_selectors(base_dir: Path, platform: str) -> Dict[str, Any]:
    if platform not in DEFAULT_SELECTORS:
        raise ValueError(f"Unsupported platform: {platform}")

    merged = deepcopy(DEFAULT_SELECTORS[platform])
    override_path = base_dir / "selector_overrides" / f"{platform}.json"
    if override_path.exists():
        with override_path.open("r", encoding="utf-8") as f:
            override = json.load(f)
        merged.update(override)
    return merged