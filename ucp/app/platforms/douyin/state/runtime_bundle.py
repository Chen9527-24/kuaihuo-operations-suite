from __future__ import annotations

from app.platforms.douyin.state.auth.auth_runtime import SessionControllerStateAuthMixin
from app.platforms.douyin.state.probe.gap_runtime import SessionControllerStateProbeGapMixin
from app.platforms.douyin.state.runtime.state_runtime import SessionControllerStateRuntimeMixin

class SessionControllerStateMixin(SessionControllerStateAuthMixin, SessionControllerStateProbeGapMixin, SessionControllerStateRuntimeMixin):
    pass
