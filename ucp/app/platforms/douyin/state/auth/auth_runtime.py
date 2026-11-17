from __future__ import annotations

from app.platforms.douyin.state.auth.auth_flow import SessionControllerStateAuthFlowMixin
from app.platforms.douyin.state.runtime.phase_observer import SessionControllerStatePhaseMergeMixin


class SessionControllerStateAuthMixin(
    SessionControllerStateAuthFlowMixin,
    SessionControllerStatePhaseMergeMixin,
):
    pass
