from __future__ import annotations

from app.platforms.douyin.dm.queue.unread_queue import SessionControllerDMQueueMixin
from app.platforms.douyin.dm.runtime.warmup_gate import SessionControllerDMRuntimeGateMixin


class SessionControllerDMCoreMixin(
    SessionControllerDMRuntimeGateMixin,
    SessionControllerDMQueueMixin,
):
    pass
