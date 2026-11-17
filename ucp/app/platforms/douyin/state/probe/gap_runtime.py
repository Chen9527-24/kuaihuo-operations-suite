from __future__ import annotations

from app.platforms.douyin.state.probe.gap_helpers import SessionControllerStateProbeGapHelpersMixin
from app.platforms.douyin.state.probe.probe_result import SessionControllerStateProbeResultMixin


class SessionControllerStateProbeGapMixin(
    SessionControllerStateProbeGapHelpersMixin,
    SessionControllerStateProbeResultMixin,
):
    pass
