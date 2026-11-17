from __future__ import annotations

COMMENT_TRACE_FLOW_RUNTIME = "COMMENT_TRACE_FLOW_RUNTIME_V70"

from app.platforms.douyin.comment.reply.draft_probe import SessionControllerCommentDraftProbeMixin
from app.platforms.douyin.comment.reply.reply_editor import SessionControllerCommentReplyEditorMixin
from app.platforms.douyin.comment.switch.switch_runtime import SessionControllerCommentSwitchFlowMixin


class SessionControllerCommentFlowMixin(
    SessionControllerCommentSwitchFlowMixin,
    SessionControllerCommentReplyEditorMixin,
    SessionControllerCommentDraftProbeMixin,
):
    pass
