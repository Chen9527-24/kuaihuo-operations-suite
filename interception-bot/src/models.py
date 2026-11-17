from __future__ import annotations

from dataclasses import dataclass, field, asdict
from typing import Dict, List, Optional


@dataclass
class CommentRecord:
    comment_id: Optional[str]
    parent_comment_id: Optional[str]
    user_id: Optional[str]
    nickname: Optional[str]
    comment_text: Optional[str]
    comment_time_raw: Optional[str]
    comment_time_iso: Optional[str]
    visible_region: Optional[str]
    source_account_url: str
    source_content_url: str
    platform: str
    comment_type: str = "text"
    has_media: bool = False
    media_urls: List[str] = field(default_factory=list)
    replies: List["CommentRecord"] = field(default_factory=list)


@dataclass
class ContentRecord:
    platform: str
    source_account_url: str
    source_content_url: str
    platform_content_id: str
    caption: Optional[str] = None
    publish_time_raw: Optional[str] = None
    publish_time_iso: Optional[str] = None
    duration_raw: Optional[str] = None
    duration_sec: Optional[int] = None
    author_nickname: Optional[str] = None
    author_user_id: Optional[str] = None
    video_title: Optional[str] = None
    comments: List[CommentRecord] = field(default_factory=list)
    field_source: Dict[str, str] = field(default_factory=dict)
    speech_transcript: Optional[str] = None
    speech_status: Optional[str] = None
    speech_error: Optional[str] = None
    video_description: Optional[str] = None
    video_tags: List[str] = field(default_factory=list)
    work_decision_status: Optional[str] = None
    work_decision_should_run: Optional[bool] = None
    work_decision_reason: Optional[str] = None
    work_decision_workflow_id: Optional[str] = None


@dataclass
class RunResult:
    run_id: str
    platform: str
    homepage_url: str
    account_alias: str
    generated_at: str
    items: List[ContentRecord] = field(default_factory=list)

    def to_dict(self):
        return asdict(self)


def count_comment_tree(comments: List[CommentRecord] | None) -> int:
    total = 0
    for comment in comments or []:
        total += 1
        total += count_comment_tree(comment.replies or [])
    return total
