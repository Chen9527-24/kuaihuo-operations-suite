from __future__ import annotations

from app.platforms.douyin.dm.runtime.core_runtime import SessionControllerDMCoreMixin
from app.platforms.douyin.dm.aggregate.aggregate_runtime import SessionControllerDMAggregateMixin
from app.platforms.douyin.dm.draft.draft_runtime import SessionControllerDMDraftMixin
from app.platforms.douyin.dm.send.send_runtime import SessionControllerDMSendMixin
from app.platforms.douyin.dm.recording.record_runtime import SessionControllerDMRecordMixin


class SessionControllerDMMixin(
    SessionControllerDMCoreMixin,
    SessionControllerDMAggregateMixin,
    SessionControllerDMDraftMixin,
    SessionControllerDMSendMixin,
    SessionControllerDMRecordMixin,
):
    pass
