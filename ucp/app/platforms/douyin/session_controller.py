from __future__ import annotations

from concurrent.futures import Future, ThreadPoolExecutor
import json
from pathlib import Path
from typing import Any
from urllib.parse import urlparse

from PySide6.QtCore import QObject, QTimer, QUrl, Signal
from PySide6.QtWebEngineCore import QWebEnginePage, QWebEngineProfile
from PySide6.QtWebEngineWidgets import QWebEngineView
from PySide6.QtWidgets import QWidget

from app.models import Account
from app.services.core_nexus_service import CoreNexusService
from app.services.dm_reply_engine import DMReplyEngine
from app.services.comment_reply_engine import CommentReplyEngine
from app.services.runtime_config import DM_RUNTIME_CONFIG, get_douyin_comment_config
from app.services.runtime_policy import RuntimePolicyController
from app.platforms.douyin.common.js_scripts import build_dismiss_blockers_script, build_geometry_probe_script, build_state_meta_probe
from app.services.logger_bus import LoggerBus
from app.platforms.douyin.comment.runtime.runtime_bundle import SessionControllerCommentMixin
from app.platforms.douyin.common.constants import DOUYIN_URLS
from app.platforms.douyin.dm.runtime.runtime_bundle import SessionControllerDMMixin
from app.platforms.douyin.state.runtime_bundle import SessionControllerStateMixin
from app.platforms.douyin.common.view_runtime import SessionControllerViewMixin


class SessionController(
    SessionControllerViewMixin,
    SessionControllerStateMixin,
    SessionControllerDMMixin,
    SessionControllerCommentMixin,
    QObject,
):
    state_changed = Signal(str, str)
    title_changed = Signal(str, str)
    auth_confirmed = Signal(str, dict)
    def __init__(
            self,
            account: Account,
            profile_root: Path,
            logger: LoggerBus,
            core_service: CoreNexusService | None = None,
            record_service: Any | None = None,
            login_timeout_ms: int = 60_000,
            inspect_interval_ms: int = 8_000,
            poll_interval_ms: int = 2_500,
        ) -> None:
            super().__init__()
            self.account = account
            self.profile_root = profile_root
            self.logger = logger
            self.core_service = core_service
            self.record_service = record_service
            self.runtime_policy = RuntimePolicyController(account, core_service, log=self._log, module="dm")
            self.backend_dm_conversation_ids: dict[str, str] = {}
            self.backend_dm_first_reply_done: set[str] = set()
            self.login_timeout_ms = login_timeout_ms
            self.inspect_interval_ms = inspect_interval_ms
            self.poll_interval_ms = poll_interval_ms

            self.profile: QWebEngineProfile | None = None
            self._shared_profile_key = ""
            self.page: QWebEnginePage | None = None
            self.view: QWebEngineView | None = None
            self.work_window: QWidget | None = None
            self.preview_page: QWebEnginePage | None = None
            self.preview_view: QWebEngineView | None = None
            self.preview_visible = False

            self.current_module = "dm"
            self.target_url = DOUYIN_URLS["dm"]
            self.running = False
            self.ready = False
            self.busy = False
            self.stop_in_progress = False
            self.stop_quiet_until_ms = 0
            self.login_wait_started_ms: int | None = None
            self.last_wait_log_bucket = -1
            self.last_inspect_started_ms = 0
            self.last_state = "未启动"
            self.last_nav_request_ms = 0
            self.home_retry_count = 0
            self.max_home_retries = 3
            self.last_dm_open_attempt_key = ""
            self.last_dm_open_attempt_ms = 0
            self.dm_processed_keys: set[str] = set()
            self.dm_processed_keys_by_tab: dict[str, set[str]] = {}
            self.dm_skipped_keys: set[str] = set()
            self.dm_skipped_keys_by_tab: dict[str, set[str]] = {}
            self.dm_processed_message_signatures: set[str] = set()
            self.dm_skipped_message_signatures: set[str] = set()
            self.dm_pending_message_signatures: set[str] = set()
            self.dm_processed_confirm_count = 0
            self.dm_current_open_suppressed_signatures: dict[str, int] = {}
            self.dm_pending_reply_meta: dict[str, dict[str, Any]] = {}
            self.dm_seen_keys: set[str] = set()
            self.dm_opened_unreplied_keys: set[str] = set()
            self.dm_pending_open_key = ""
            self.dm_pending_open_dom_index: int | None = None
            self.dm_pending_open_attempts = 0
            self.dm_pending_open_snapshot: dict[str, Any] = {}
            self.backend_dm_conversation_ids = {}
            self.backend_dm_first_reply_done = set()
            self.dm_last_queue_progress_ms = 0
            self.dm_last_scroll_ms = 0
            self.dm_scroll_no_change_count = 0
            self.dm_scan_complete = False
            self.dm_sub_tab_cycle_order = ["朋友私信", "陌生人私信", "群消息"]
            self.dm_completed_sub_tabs: set[str] = set()
            self.dm_current_sub_tab = ""
            self.dm_switching_sub_tab = ""
            self.dm_last_sub_tab_switch_ms = 0
            self.dm_last_full_tab_cycle_ms = 0
            # 巡检频率配置必须先于首次使用初始化。
            # v9 中这里曾在 dm_active_scan_interval_ms 赋值前读取，导致启动时报错。
            dm_runtime_config = DM_RUNTIME_CONFIG
            self.dm_reply_aggregate_base_wait_ms = int(dm_runtime_config.get("reply_aggregate_base_wait_ms", 6000) or 6000)
            self.dm_reply_aggregate_max_wait_ms = int(dm_runtime_config.get("reply_aggregate_max_wait_ms", 8000) or 8000)
            self.dm_active_scan_interval_ms = int(dm_runtime_config.get("active_scan_interval_ms", 1200) or 1200)
            self.dm_tab_scan_interval_ms = int(dm_runtime_config.get("tab_scan_interval_ms", 3000) or 3000)
            self.dm_idle_scan_min_interval_ms = max(40000, int(dm_runtime_config.get("idle_scan_min_interval_ms", 40000) or 40000))
            self.dm_idle_scan_max_interval_ms = max(self.dm_idle_scan_min_interval_ms, int(dm_runtime_config.get("idle_scan_max_interval_ms", 90000) or 90000))
            self.dm_idle_scan_interval_ms = self.dm_idle_scan_min_interval_ms
            self.dm_idle_log_every_n = max(1, int(dm_runtime_config.get("idle_log_every_n", 1) or 1))
            self.dm_idle_heartbeat_interval_ms = int(dm_runtime_config.get("idle_heartbeat_interval_ms", 90000) or 90000)
            self.dm_debug_verbose = bool(dm_runtime_config.get("debug_verbose", False))
            self._apply_runtime_policy_to_runtime_config()
            self.dm_scan_mode = "active"
            self.inspect_interval_ms = self.dm_active_scan_interval_ms
            self.dm_idle_heartbeat_count = 0
            self.dm_last_idle_heartbeat_ms = 0
            self.dm_last_actual_inspect_ms = 0
            self.dm_next_inspect_timer = None
            self.background_viewport = (1366, 900)
            self.last_geometry_not_ready_ms = 0
            self.auth_started_ms = None
            self.module_mount_started_ms = None
            self.last_auth_cookie_ms = None
            self.auth_cookie_names = []
            self.last_probe_status = ""
            self.login_guard_probe_only = False
            self.last_login_guard_state_probe_ms = 0
            self.last_logout_guard_log_ms = 0
            self.auth_confirmed_ms = None
            self.last_post_login_redirect_ms = 0
            self.dm_last_reply_signature = ""
            self.dm_last_precheck_signature = ""
            self.dm_last_draft_stage_signature = ""
            self.dm_last_send_signature = ""
            self.dm_pending_precheck_signature = ""
            self.dm_pending_stage_payload: dict[str, Any] | None = None
            self.dm_pending_send_payload: dict[str, Any] | None = None
            self.dm_pending_delivery_sequence: dict[str, Any] | None = None
            self.dm_completed_reply_tokens: set[str] = set()
            self.dm_inflight_reply_tokens: set[str] = set()
            self.dm_last_confirmed_reply_signature = ""
            self.dm_last_confirmed_reply_ms = 0
            self.dm_draft_cache: dict[str, dict[str, Any]] = {}
            self.dm_reply_executor = ThreadPoolExecutor(max_workers=1, thread_name_prefix="dm-reply")
            self.dm_pending_draft_future: Future | None = None
            self.dm_pending_draft_cache_key = ""
            self.dm_pending_draft_request_signature = ""
            self.dm_pending_draft_context: dict[str, Any] | None = None
            self.dm_session_locks: dict[str, dict[str, Any]] = {}
            self.dm_session_cooldowns: dict[str, int] = {}
            self.dm_reply_aggregate_window: dict[str, Any] | None = None
            self.dm_skip_next_aggregate_signature = ""
            self.dm_startup_ready_since_ms = 0
            self.dm_startup_gate_released = False
            self.dm_startup_list_stable_streak = 0
            self.dm_startup_last_list_signature = ""
            self.dm_startup_last_gate_log_ms = 0
            self.dm_startup_last_gate_log_signature = ""
            self.dm_startup_last_fast_probe_request_ms = 0
            self.dm_startup_last_top_keys: list[str] = []
            self.dm_startup_no_unread_recheck_count = 0
            self.dm_startup_no_unread_recheck_signature = ""
            self.dm_startup_no_unread_recheck_done = False
            self.dm_startup_no_unread_recheck_last_log_ms = 0
            self.dm_startup_no_unread_recheck_total_count = 0
            self.dm_last_inspect_log_signature = ""
            self.dm_last_inspect_log_ms = 0
            self.dm_last_inspect_detail_signature = ""
            self.dm_last_inspect_detail_ms = 0
            self.dm_startup_min_warmup_ms = 6500
            self.dm_startup_soft_cap_ms = 13000
            self.dm_startup_hard_cap_ms = 16500
            self.dm_startup_fast_probe_interval_ms = 1400
            self._pending_state_meta_result: dict[str, Any] | None = None
            self._pending_state_meta_gap: dict[str, Any] | None = None
            self.state_probe_last_good_result: dict[str, Any] | None = None
            self.state_probe_last_good_ms = 0
            self.state_probe_gap_cache_ttl_ms = 3500
            self.state_probe_last_gap_kind = ""
            self.state_probe_recent_gap_count = 0
            self.state_probe_last_gap_logged_ms = 0
            self.state_probe_legacy_audit_last_ms = 0
            self.state_probe_legacy_audit_interval_ms = 4200
            self.state_probe_legacy_audit_min_mount_ms = 12000
            self.state_probe_legacy_audit_consecutive_mount_required = 4
            self.state_probe_mount_only_streak = 0
            self._pending_state_legacy_base_result: dict[str, Any] | None = None
            self.state_probe_legacy_audit_verbose = False
            self.observe_phase_current = ""
            self.observe_phase_state = ""
            self.observe_phase_last_payload_signature = ""
            self.observe_phase_last_logged_ms = 0
            self.dm_reply_engine = DMReplyEngine(Path(__file__).resolve().parents[3] / "data", logger=self._log)
            self.comment_reply_engine = CommentReplyEngine(Path(__file__).resolve().parents[3] / "data", logger=self._log)
            self.comment_reply_executor = ThreadPoolExecutor(max_workers=1, thread_name_prefix="comment-reply")
            self.comment_runtime_config = get_douyin_comment_config()
            self.comment_runtime_epoch = 0
            # 评论模块启动后应先做一次首轮业务巡检；只有 hard_sleep 能阻断首轮。
            # 运行窗口等待/普通节奏冷却不能让刚启动的评论机器人直接空等。
            self.comment_startup_first_cycle_done = False
            self.comment_startup_first_cycle_started = False
            self.comment_startup_first_cycle_start_logged = False
            self.comment_startup_first_cycle_force_until_ms = 0
            self.comment_startup_first_cycle_data_wait_started_ms = 0
            self.comment_startup_first_cycle_data_wait_last_log_ms = 0
            self.comment_pending_reply_future: Future | None = None
            self.comment_pending_reply_signature = ""
            self.comment_pending_reply_context: dict[str, Any] | None = None
            self.comment_preopen_reply_future: Future | None = None
            self.comment_preopen_reply_target: dict[str, Any] | None = None
            self.comment_preopen_reply_context: dict[str, Any] | None = None
            self.comment_pending_stage_payload: dict[str, Any] | None = None
            self.comment_pending_send_payload: dict[str, Any] | None = None
            self.comment_last_stage_signature = ""
            self.comment_last_send_signature = ""
            self.comment_last_confirmed_signature = ""
            self.comment_last_confirmed_ms = 0
            self.comment_draft_cache: dict[str, dict[str, Any]] = {}
            self.comment_completed_thread_keys: set[str] = set()
            self.comment_inflight_reply_signatures: set[str] = set()
            self.post_login_redirect_count = 0
            self.max_post_login_redirects = 6
            self.comment_last_drawer_open_attempt_ms = 0
            self.comment_drawer_open_attempts = 0
            self.comment_last_switch_attempt_ms = 0
            self.comment_switch_attempts = 0
            self.comment_pending_switch_target: dict[str, Any] | None = None
            self.comment_last_verified_work_title = ""
            self.comment_last_verified_work_meta = ""
            self.comment_recent_work_change_ms = 0
            self.comment_recent_work_change_key = ""
            self.comment_last_filter_settle_log_ms = 0
            self.comment_last_reply_block_log_ms = 0
            self.comment_last_reply_open_attempt_ms = 0
            self.comment_reply_open_attempts = 0
            self.comment_pending_reply_target: dict[str, Any] | None = None
            self.comment_active_reply_target: dict[str, Any] | None = None
            self.comment_last_draft_probe_attempt_ms = 0
            self.comment_draft_probe_attempts = 0
            self.comment_pending_draft_probe_target: dict[str, Any] | None = None
            self.comment_completed_work_keys: set[str] = set()
            self.comment_followup_watch_until_ms = 0
            self.comment_followup_watch_work_key = ""
            self.comment_followup_watch_thread_key = ""
            self.comment_followup_watch_signature = ""
            self.comment_followup_watch_last_log_ms = 0
            self.comment_followup_watch_refresh_count = 0
            self.comment_followup_watch_last_refresh_key = ""
            self.comment_known_work_count = 0
            self.comment_known_single_work = False
            self.comment_known_work_count_ms = 0
            self.comment_last_drawer_close_attempt_ms = 0
            self.comment_drawer_close_attempts = 0
            self.comment_empty_observed_work_key = ""
            self.comment_empty_observed_count = 0
            comment_filter_cfg = (self.comment_runtime_config.get("filter", {}) or {}) if isinstance(self.comment_runtime_config, dict) else {}
            self.comment_filter_force_enabled = bool(comment_filter_cfg.get("enabled", False) or comment_filter_cfg.get("force", False))
            self.comment_target_filter_text = str(comment_filter_cfg.get("target_text", "") or "").strip()
            self.comment_reply_expand_cooldowns: dict[str, int] = {}
            self.comment_reply_open_cooldowns: dict[str, int] = {}
            self.comment_reply_expand_last_attempt_ms = 0
            self.comment_reply_expand_attempts = 0
            self.comment_last_filter_attempt_ms = 0
            self.comment_filter_attempts = 0
            self.comment_pending_filter_target: dict[str, Any] | None = None
            self.comment_all_known_works_completed = False
            self.comment_runtime_cooldown_until_ms = 0
            self.comment_runtime_cooldown_reason = ""
            self.comment_runtime_cooldown_last_log_ms = 0
            self.comment_runtime_cooldown_reset_cycle_on_exit = False
            self.comment_same_work_refresh_last_ms = 0
            self.comment_same_work_refresh_pending = False
            self.comment_same_work_refresh_last_work_key = ""
            self.comment_same_work_refresh_last_reason = ""
            self.comment_same_work_refresh_attempts = 0
            self.comment_same_work_refresh_due_after_cooldown = False
            self.comment_trace_token = "COMMENT_TRACE_PACKAGE_BUILD_V70"
            self.comment_trace_runtime_logged = False
            self.comment_trace_filter_decision_last_ms = 0
            self.comment_trace_reply_decision_last_ms = 0
            self.comment_trace_entry_last_ms = 0
            self.comment_stage_name = ""
            self.comment_stage_work_key = ""
            self.comment_stage_since_ms = 0
            self.comment_stage_stable_streak = 0
            self.comment_stage_last_signature = ""
            self.comment_stage_last_log_ms = 0
            self.comment_current_work_key = ""
            self.comment_current_work_started_ms = 0
            self.comment_current_work_ready_count = 0
            self.comment_current_work_budget_logged = False
            self.comment_trace_draft_decision_last_ms = 0
            self.comment_complete_defer_last_log_ms = 0
            self.comment_reply_editor_probe_last_log_ms = 0
            self.comment_reply_editor_alive_streak = 0
            self.comment_reply_editor_lost_streak = 0
            self.comment_reply_editor_alive_last_visible = False
            self.comment_reply_editor_alive_last_visible_ms = 0
            self.comment_reply_editor_alive_last_log_ms = 0
            self.comment_reply_editor_focus_confirmed = False
            self.comment_reply_editor_focus_last_attempt_ms = 0
            self.comment_reply_editor_focus_attempts = 0
            self.comment_reply_editor_focus_lost_streak = 0
            self.comment_reply_editor_focus_confirmed_ms = 0
            self.comment_reply_editor_post_focus_running = False
            self.comment_reply_editor_post_focus_started_ms = 0
            self.comment_reply_editor_post_focus_success_streak = 0
            self.comment_reply_editor_post_focus_attempts = 0
            self.comment_reply_editor_post_focus_identity = ""
            self.comment_reply_editor_reopen_last_attempt_ms = 0
            self.comment_reply_editor_reopen_attempts = 0
            self.comment_reply_button_last_click_identity = ""
            self.comment_reply_button_last_click_ms = 0
            self.comment_reply_button_click_lock_until_ms = 0
            self.comment_reply_button_click_pending_until_ms = 0
            self.comment_reply_button_visible_lock_until_ms = 0
            self.comment_last_editor_risky_action: dict[str, Any] = {}
            self.comment_last_editor_risky_action_ms = 0
            self.comment_reply_editor_ever_visible = False
            self.comment_reply_editor_visible_identity = ""
            self.comment_reply_editor_first_visible_ms = 0
            self.comment_filter_skip_active_editor_last_log_ms = 0

            self.poll_timer = QTimer(self)
            self.poll_timer.timeout.connect(self._poll)

    def start(self, module: str) -> None:
            if str(self.account.platform).lower() != "douyin":
                self._log("WARN", f"当前示例只实现了抖音会话，忽略启动请求: {self.account.platform}")
                return

            self.ensure_view()
            self.current_module = module
            self.target_url = DOUYIN_URLS[module]
            try:
                self.runtime_policy.set_module(module)
            except Exception as exc:
                self._log("WARN", f"运行节奏配置初始化失败，继续使用本地默认策略: {type(exc).__name__}: {exc}")
            self.running = True
            self.ready = False
            self.busy = False
            self.stop_in_progress = False
            self.stop_quiet_until_ms = 0
            self.login_wait_started_ms = None
            self.last_wait_log_bucket = -1
            self.last_inspect_started_ms = 0
            self.home_retry_count = 0
            self.last_dm_open_attempt_key = ""
            self.last_dm_open_attempt_ms = 0
            self.dm_processed_keys.clear()
            self.dm_processed_keys_by_tab.clear()
            self.dm_skipped_keys.clear()
            self.dm_skipped_keys_by_tab.clear()
            self.dm_processed_message_signatures.clear()
            self.dm_skipped_message_signatures.clear()
            self.dm_pending_message_signatures.clear()
            self.dm_pending_reply_meta.clear()
            self.dm_seen_keys.clear()
            self.dm_opened_unreplied_keys.clear()
            self.dm_pending_open_key = ""
            self.dm_pending_open_dom_index = None
            self.dm_pending_open_attempts = 0
            self.dm_last_queue_progress_ms = 0
            self.dm_last_scroll_ms = 0
            self.dm_scroll_no_change_count = 0
            self.dm_scan_complete = False
            self.dm_sub_tab_cycle_order = ["朋友私信", "陌生人私信", "群消息"]
            self.dm_completed_sub_tabs.clear()
            self.dm_current_sub_tab = ""
            self.dm_switching_sub_tab = ""
            self.dm_last_sub_tab_switch_ms = 0
            self.dm_last_full_tab_cycle_ms = 0
            # 巡检频率配置必须先于首次使用初始化。
            # v9 中这里曾在 dm_active_scan_interval_ms 赋值前读取，导致启动时报错。
            dm_runtime_config = DM_RUNTIME_CONFIG
            self.dm_reply_aggregate_base_wait_ms = int(dm_runtime_config.get("reply_aggregate_base_wait_ms", 6000) or 6000)
            self.dm_reply_aggregate_max_wait_ms = int(dm_runtime_config.get("reply_aggregate_max_wait_ms", 8000) or 8000)
            self.dm_active_scan_interval_ms = int(dm_runtime_config.get("active_scan_interval_ms", 1200) or 1200)
            self.dm_tab_scan_interval_ms = int(dm_runtime_config.get("tab_scan_interval_ms", 3000) or 3000)
            self.dm_idle_scan_min_interval_ms = max(40000, int(dm_runtime_config.get("idle_scan_min_interval_ms", 40000) or 40000))
            self.dm_idle_scan_max_interval_ms = max(self.dm_idle_scan_min_interval_ms, int(dm_runtime_config.get("idle_scan_max_interval_ms", 90000) or 90000))
            self.dm_idle_scan_interval_ms = self.dm_idle_scan_min_interval_ms
            self.dm_idle_log_every_n = max(1, int(dm_runtime_config.get("idle_log_every_n", 1) or 1))
            self.dm_idle_heartbeat_interval_ms = int(dm_runtime_config.get("idle_heartbeat_interval_ms", 90000) or 90000)
            self.dm_debug_verbose = bool(dm_runtime_config.get("debug_verbose", False))
            self._apply_runtime_policy_to_runtime_config()
            self.dm_scan_mode = "active"
            self.inspect_interval_ms = self.dm_active_scan_interval_ms
            self.dm_idle_heartbeat_count = 0
            self.dm_last_idle_heartbeat_ms = 0
            self.dm_last_actual_inspect_ms = 0
            self.dm_next_inspect_timer = None
            self.background_viewport = (1366, 900)
            self.last_geometry_not_ready_ms = 0
            self.auth_started_ms = None
            self.module_mount_started_ms = None
            self.last_auth_cookie_ms = None
            self.auth_cookie_names = []
            self.last_probe_status = ""
            self.login_guard_probe_only = False
            self.last_login_guard_state_probe_ms = 0
            self.last_logout_guard_log_ms = 0
            self.auth_confirmed_ms = None
            self.last_post_login_redirect_ms = 0
            self.post_login_redirect_count = 0
            self.comment_runtime_epoch = self._now_ms()
            self.comment_startup_first_cycle_done = False
            self.comment_startup_first_cycle_started = False
            self.comment_startup_first_cycle_start_logged = False
            self.comment_startup_first_cycle_force_until_ms = 0
            self.comment_startup_first_cycle_data_wait_started_ms = 0
            self.comment_startup_first_cycle_data_wait_last_log_ms = 0
            self.comment_pending_reply_future = None
            self.comment_pending_reply_signature = ""
            self.comment_pending_reply_context = None
            self.comment_preopen_reply_future = None
            self.comment_preopen_reply_target = None
            self.comment_preopen_reply_context = None
            self.comment_pending_stage_payload = None
            self.comment_pending_send_payload = None
            self.comment_last_stage_signature = ""
            self.comment_last_send_signature = ""
            self.comment_last_confirmed_signature = ""
            self.comment_last_confirmed_ms = 0
            self.comment_draft_cache.clear()
            self.comment_completed_thread_keys.clear()
            self.comment_inflight_reply_signatures.clear()
            self.comment_last_drawer_open_attempt_ms = 0
            self.comment_drawer_open_attempts = 0
            self.comment_last_switch_attempt_ms = 0
            self.comment_switch_attempts = 0
            self.comment_pending_switch_target = None
            self.comment_last_verified_work_title = ""
            self.comment_last_verified_work_meta = ""
            self.comment_recent_work_change_ms = 0
            self.comment_recent_work_change_key = ""
            self.comment_last_filter_settle_log_ms = 0
            self.comment_last_reply_block_log_ms = 0
            self.comment_last_reply_open_attempt_ms = 0
            self.comment_reply_open_attempts = 0
            self.comment_pending_reply_target = None
            self.comment_active_reply_target = None
            self.comment_last_draft_probe_attempt_ms = 0
            self.comment_draft_probe_attempts = 0
            self.comment_pending_draft_probe_target = None
            self.comment_completed_work_keys.clear()
            self.comment_followup_watch_until_ms = 0
            self.comment_followup_watch_work_key = ""
            self.comment_followup_watch_thread_key = ""
            self.comment_followup_watch_signature = ""
            self.comment_followup_watch_refresh_count = 0
            self.comment_followup_watch_last_refresh_key = ""
            self.comment_known_work_count = 0
            self.comment_known_single_work = False
            self.comment_known_work_count_ms = 0
            self.comment_same_work_refresh_pending = False
            self.comment_same_work_refresh_due_after_cooldown = False
            self.comment_last_drawer_close_attempt_ms = 0
            self.comment_drawer_close_attempts = 0
            self.comment_empty_observed_work_key = ""
            self.comment_empty_observed_count = 0
            comment_filter_cfg = (self.comment_runtime_config.get("filter", {}) or {}) if isinstance(self.comment_runtime_config, dict) else {}
            self.comment_filter_force_enabled = bool(comment_filter_cfg.get("enabled", False) or comment_filter_cfg.get("force", False))
            self.comment_target_filter_text = str(comment_filter_cfg.get("target_text", "") or "").strip()
            self.comment_reply_expand_cooldowns: dict[str, int] = {}
            self.comment_reply_open_cooldowns: dict[str, int] = {}
            self.comment_reply_expand_last_attempt_ms = 0
            self.comment_reply_expand_attempts = 0
            self.comment_last_filter_attempt_ms = 0
            self.comment_filter_attempts = 0
            self.comment_pending_filter_target: dict[str, Any] | None = None
            self.comment_all_known_works_completed = False
            self.comment_runtime_cooldown_until_ms = 0
            self.comment_runtime_cooldown_reason = ""
            self.comment_runtime_cooldown_last_log_ms = 0
            self.comment_runtime_cooldown_reset_cycle_on_exit = False
            self.comment_same_work_refresh_last_ms = 0
            self.comment_same_work_refresh_pending = False
            self.comment_same_work_refresh_last_work_key = ""
            self.comment_same_work_refresh_last_reason = ""
            self.comment_same_work_refresh_attempts = 0
            self.comment_same_work_refresh_due_after_cooldown = False
            self.comment_trace_token = "COMMENT_TRACE_PACKAGE_BUILD_V70"
            self.comment_trace_runtime_logged = False
            self.comment_trace_filter_decision_last_ms = 0
            self.comment_trace_reply_decision_last_ms = 0
            self.comment_trace_entry_last_ms = 0
            self.comment_stage_name = ""
            self.comment_stage_work_key = ""
            self.comment_stage_since_ms = 0
            self.comment_stage_stable_streak = 0
            self.comment_stage_last_signature = ""
            self.comment_stage_last_log_ms = 0
            self.comment_current_work_key = ""
            self.comment_current_work_started_ms = 0
            self.comment_current_work_ready_count = 0
            self.comment_current_work_budget_logged = False
            self.comment_trace_draft_decision_last_ms = 0
            self.comment_complete_defer_last_log_ms = 0
            self.comment_reply_editor_probe_last_log_ms = 0
            self.comment_reply_editor_alive_streak = 0
            self.comment_reply_editor_lost_streak = 0
            self.comment_reply_editor_alive_last_visible = False
            self.comment_reply_editor_alive_last_visible_ms = 0
            self.comment_reply_editor_alive_last_log_ms = 0
            self.comment_reply_editor_focus_confirmed = False
            self.comment_reply_editor_focus_last_attempt_ms = 0
            self.comment_reply_editor_focus_attempts = 0
            self.comment_reply_editor_focus_lost_streak = 0
            self.comment_reply_editor_focus_confirmed_ms = 0
            self.comment_reply_editor_post_focus_running = False
            self.comment_reply_editor_post_focus_started_ms = 0
            self.comment_reply_editor_post_focus_success_streak = 0
            self.comment_reply_editor_post_focus_attempts = 0
            self.comment_reply_editor_post_focus_identity = ""
            self.comment_reply_editor_reopen_last_attempt_ms = 0
            self.comment_reply_editor_reopen_attempts = 0
            self.comment_reply_button_last_click_identity = ""
            self.comment_reply_button_last_click_ms = 0
            self.comment_reply_button_click_lock_until_ms = 0
            self.comment_reply_button_click_pending_until_ms = 0
            self.comment_reply_button_visible_lock_until_ms = 0
            self.comment_last_editor_risky_action: dict[str, Any] = {}
            self.comment_last_editor_risky_action_ms = 0
            self.comment_reply_editor_ever_visible = False
            self.comment_reply_editor_visible_identity = ""
            self.comment_reply_editor_first_visible_ms = 0
            self.comment_filter_skip_active_editor_last_log_ms = 0
            self.dm_last_reply_signature = ""
            self.dm_last_precheck_signature = ""
            self.dm_last_draft_stage_signature = ""
            self.dm_last_send_signature = ""
            self.dm_pending_precheck_signature = ""
            self.dm_pending_stage_payload: dict[str, Any] | None = None
            self.dm_pending_send_payload: dict[str, Any] | None = None
            self.dm_pending_delivery_sequence = None
            self.dm_completed_reply_tokens.clear()
            self.dm_inflight_reply_tokens.clear()
            self.dm_last_confirmed_reply_signature = ""
            self.dm_last_confirmed_reply_ms = 0
            self.dm_draft_cache.clear()
            self.dm_pending_draft_future = None
            self.dm_pending_draft_cache_key = ""
            self.dm_pending_draft_request_signature = ""
            self.dm_pending_draft_context = None
            self.dm_session_locks.clear()
            self.dm_session_cooldowns.clear()
            self.dm_reply_aggregate_window = None
            self.dm_startup_ready_since_ms = 0
            self.dm_startup_gate_released = False
            self.dm_startup_list_stable_streak = 0
            self.dm_startup_last_list_signature = ""
            self.dm_startup_last_gate_log_ms = 0
            self.dm_startup_last_gate_log_signature = ""
            self.dm_startup_last_fast_probe_request_ms = 0
            self.dm_startup_last_top_keys = []
            self.dm_last_inspect_log_signature = ""
            self.dm_last_inspect_log_ms = 0
            self.dm_last_inspect_detail_signature = ""
            self.dm_last_inspect_detail_ms = 0
            self._pending_state_meta_result = None
            self._pending_state_meta_gap = None
            self.state_probe_last_good_result = None
            self.state_probe_last_good_ms = 0
            self.state_probe_last_gap_kind = ""
            self.state_probe_recent_gap_count = 0
            self.state_probe_last_gap_logged_ms = 0
            self._pending_state_legacy_base_result = None
            self.observe_phase_current = ""
            self.observe_phase_state = ""
            self.observe_phase_last_payload_signature = ""
            self.observe_phase_last_logged_ms = 0
            self._set_state("启动中")
            self._log("INFO", f"启动账号会话，模块={module}，目标地址={self.target_url}")
            if module != "comment" or self._comment_verbose_logs_enabled():
                self._log("INFO", f"{self.comment_trace_token} | controller=session_controller.py | comment_runtime_config_loaded={bool(self.comment_runtime_config)} | target_filter={self.comment_target_filter_text}")
            if module == "comment" and self._comment_verbose_logs_enabled():
                self._log("INFO", "COMMENT_TRACE_EDITOR_DIAG_V70 | controller=session_controller.py | mode=v70_v68_safe_filter_option_and_reply_select_guard_hold | coze_pre_generate_before_open=True | editor_visible_immediate_inject=True | text_readback_hold=True | reactivation_disabled=True | schemeC_diag_only=True | no_reclick_after_visible=True | send_enabled=False | work_switch_enabled=False | quiet_inspect_mutex=True | hard_quiet_mutex=True | coze_wait_scan_throttled=True | coze_wait_lock_renew=True | reply_click_settle_extended=True | staged_open_confirm=True | fallback_click_methods=True | manual_hold_scan_suppressed=True | ready_draft_inject_pump=True | reply_first_click_targeting=True | filter_focus_residue_guard=True | filter_option_click_one_step_safe=True | reply_click_select_residue_close=True")
            self._load_target("启动")
            self.poll_timer.start(self.poll_interval_ms)

    def stop(self) -> None:
            self.stop_in_progress = True
            self.stop_quiet_until_ms = self._now_ms() + 2500
            self._pending_state_meta_result = None
            self._pending_state_meta_gap = None
            self._pending_state_legacy_base_result = None
            if self.view is not None:
                self._ensure_background_host_geometry()
                self.view.setUrl(QUrl("about:blank"))
            self.release_preview(destroy=True)
            self.running = False
            self.ready = False
            self.busy = False
            self.login_wait_started_ms = None
            self.dm_processed_keys.clear()
            self.dm_processed_keys_by_tab.clear()
            self.dm_skipped_keys.clear()
            self.dm_skipped_keys_by_tab.clear()
            self.dm_processed_message_signatures.clear()
            self.dm_skipped_message_signatures.clear()
            self.dm_pending_message_signatures.clear()
            self.dm_pending_reply_meta.clear()
            self.dm_seen_keys.clear()
            self.dm_opened_unreplied_keys.clear()
            self.dm_pending_open_key = ""
            self.dm_pending_open_dom_index = None
            self.dm_pending_open_attempts = 0
            self.poll_timer.stop()
            self.auth_started_ms = None
            self.module_mount_started_ms = None
            self.last_auth_cookie_ms = None
            self.auth_cookie_names = []
            self.last_probe_status = ""
            self.auth_confirmed_ms = None
            self.last_post_login_redirect_ms = 0
            self.post_login_redirect_count = 0
            self.comment_runtime_epoch = self._now_ms()
            self.comment_startup_first_cycle_done = False
            self.comment_startup_first_cycle_started = False
            self.comment_startup_first_cycle_start_logged = False
            self.comment_startup_first_cycle_force_until_ms = 0
            self.comment_startup_first_cycle_data_wait_started_ms = 0
            self.comment_startup_first_cycle_data_wait_last_log_ms = 0
            self.comment_pending_reply_future = None
            self.comment_pending_reply_signature = ""
            self.comment_pending_reply_context = None
            self.comment_preopen_reply_future = None
            self.comment_preopen_reply_target = None
            self.comment_preopen_reply_context = None
            self.comment_pending_stage_payload = None
            self.comment_pending_send_payload = None
            self.comment_last_stage_signature = ""
            self.comment_last_send_signature = ""
            self.comment_last_confirmed_signature = ""
            self.comment_last_confirmed_ms = 0
            self.comment_draft_cache.clear()
            self.comment_completed_thread_keys.clear()
            self.comment_inflight_reply_signatures.clear()
            self.comment_last_drawer_open_attempt_ms = 0
            self.comment_drawer_open_attempts = 0
            self.comment_last_switch_attempt_ms = 0
            self.comment_switch_attempts = 0
            self.comment_pending_switch_target = None
            self.comment_last_verified_work_title = ""
            self.comment_last_verified_work_meta = ""
            self.comment_last_reply_open_attempt_ms = 0
            self.comment_reply_open_attempts = 0
            self.comment_pending_reply_target = None
            self.comment_active_reply_target = None
            self.comment_last_draft_probe_attempt_ms = 0
            self.comment_draft_probe_attempts = 0
            self.comment_pending_draft_probe_target = None
            self.comment_completed_work_keys.clear()
            self.comment_followup_watch_until_ms = 0
            self.comment_followup_watch_work_key = ""
            self.comment_followup_watch_thread_key = ""
            self.comment_followup_watch_signature = ""
            self.comment_followup_watch_refresh_count = 0
            self.comment_followup_watch_last_refresh_key = ""
            self.comment_known_work_count = 0
            self.comment_known_single_work = False
            self.comment_known_work_count_ms = 0
            self.comment_last_drawer_close_attempt_ms = 0
            self.comment_drawer_close_attempts = 0
            self.comment_empty_observed_work_key = ""
            self.comment_empty_observed_count = 0
            comment_filter_cfg = (self.comment_runtime_config.get("filter", {}) or {}) if isinstance(self.comment_runtime_config, dict) else {}
            self.comment_filter_force_enabled = bool(comment_filter_cfg.get("enabled", False) or comment_filter_cfg.get("force", False))
            self.comment_target_filter_text = str(comment_filter_cfg.get("target_text", "") or "").strip()
            self.comment_reply_expand_cooldowns: dict[str, int] = {}
            self.comment_reply_open_cooldowns: dict[str, int] = {}
            self.comment_reply_expand_last_attempt_ms = 0
            self.comment_reply_expand_attempts = 0
            self.comment_last_filter_attempt_ms = 0
            self.comment_filter_attempts = 0
            self.comment_pending_filter_target = None
            self.comment_all_known_works_completed = False
            self.comment_runtime_cooldown_until_ms = 0
            self.comment_runtime_cooldown_reason = ""
            self.comment_runtime_cooldown_last_log_ms = 0
            self.comment_runtime_cooldown_reset_cycle_on_exit = False
            self.comment_same_work_refresh_last_ms = 0
            self.comment_same_work_refresh_pending = False
            self.comment_same_work_refresh_last_work_key = ""
            self.comment_same_work_refresh_last_reason = ""
            self.comment_same_work_refresh_attempts = 0
            self.comment_same_work_refresh_due_after_cooldown = False
            self.comment_trace_token = "COMMENT_TRACE_PACKAGE_BUILD_V70"
            self.comment_trace_runtime_logged = False
            self.comment_trace_filter_decision_last_ms = 0
            self.comment_trace_reply_decision_last_ms = 0
            self.comment_trace_entry_last_ms = 0
            self.comment_stage_name = ""
            self.comment_stage_work_key = ""
            self.comment_stage_since_ms = 0
            self.comment_stage_stable_streak = 0
            self.comment_stage_last_signature = ""
            self.comment_stage_last_log_ms = 0
            self.comment_current_work_key = ""
            self.comment_current_work_started_ms = 0
            self.comment_current_work_ready_count = 0
            self.comment_current_work_budget_logged = False
            self.comment_trace_draft_decision_last_ms = 0
            self.comment_complete_defer_last_log_ms = 0
            self.comment_reply_editor_probe_last_log_ms = 0
            self.comment_reply_editor_alive_streak = 0
            self.comment_reply_editor_lost_streak = 0
            self.comment_reply_editor_alive_last_visible = False
            self.comment_reply_editor_alive_last_visible_ms = 0
            self.comment_reply_editor_alive_last_log_ms = 0
            self.comment_reply_editor_focus_confirmed = False
            self.comment_reply_editor_focus_last_attempt_ms = 0
            self.comment_reply_editor_focus_attempts = 0
            self.comment_reply_editor_focus_lost_streak = 0
            self.comment_reply_editor_focus_confirmed_ms = 0
            self.comment_reply_editor_post_focus_running = False
            self.comment_reply_editor_post_focus_started_ms = 0
            self.comment_reply_editor_post_focus_success_streak = 0
            self.comment_reply_editor_post_focus_attempts = 0
            self.comment_reply_editor_post_focus_identity = ""
            self.comment_reply_editor_reopen_last_attempt_ms = 0
            self.comment_reply_editor_reopen_attempts = 0
            self.comment_reply_button_last_click_identity = ""
            self.comment_reply_button_last_click_ms = 0
            self.comment_reply_button_click_lock_until_ms = 0
            self.comment_reply_button_click_pending_until_ms = 0
            self.comment_reply_button_visible_lock_until_ms = 0
            self.comment_last_editor_risky_action: dict[str, Any] = {}
            self.comment_last_editor_risky_action_ms = 0
            self.comment_reply_editor_ever_visible = False
            self.comment_reply_editor_visible_identity = ""
            self.comment_reply_editor_first_visible_ms = 0
            self.comment_filter_skip_active_editor_last_log_ms = 0
            self.dm_last_reply_signature = ""
            self.dm_last_precheck_signature = ""
            self.dm_last_draft_stage_signature = ""
            self.dm_last_send_signature = ""
            self.dm_pending_precheck_signature = ""
            self.dm_pending_stage_payload: dict[str, Any] | None = None
            self.dm_pending_send_payload: dict[str, Any] | None = None
            self.dm_pending_delivery_sequence = None
            self.dm_completed_reply_tokens.clear()
            self.dm_inflight_reply_tokens.clear()
            self.dm_last_confirmed_reply_signature = ""
            self.dm_last_confirmed_reply_ms = 0
            self.dm_draft_cache.clear()
            self.dm_pending_draft_future = None
            self.dm_pending_draft_cache_key = ""
            self.dm_pending_draft_request_signature = ""
            self.dm_pending_draft_context = None
            self.dm_session_locks.clear()
            self.dm_session_cooldowns.clear()
            self.dm_reply_aggregate_window = None
            self.dm_startup_ready_since_ms = 0
            self.dm_startup_gate_released = False
            self.dm_startup_list_stable_streak = 0
            self.dm_startup_last_list_signature = ""
            self.dm_startup_last_gate_log_ms = 0
            self.dm_startup_last_gate_log_signature = ""
            self.dm_startup_last_fast_probe_request_ms = 0
            self.dm_startup_last_top_keys = []
            self._pending_state_meta_result = None
            self._pending_state_meta_gap = None
            self.state_probe_last_good_result = None
            self.state_probe_last_good_ms = 0
            self.state_probe_last_gap_kind = ""
            self.state_probe_recent_gap_count = 0
            self.state_probe_last_gap_logged_ms = 0
            self._pending_state_legacy_base_result = None
            self._emit_phase_observation("stop", "entered", {"module": self.current_module, "stopInProgress": True}, force=True)
            self.observe_phase_current = ""
            self.observe_phase_state = ""
            self.observe_phase_last_payload_signature = ""
            self.observe_phase_last_logged_ms = 0
            self._set_state("已停止")
            self._emit_phase_observation("stop", "completed", {"module": self.current_module, "stopped": True}, force=True)
            self._log("INFO", "会话已停止，后台工作页与预览页均已释放；非运行状态不保留真实网页，避免额外内存/网络占用")

    def _comment_startup_first_cycle_pending(self) -> bool:
            """Whether the comment module still needs its one startup business scan."""
            try:
                return bool(
                    self.current_module == "comment"
                    and not bool(getattr(self, "comment_startup_first_cycle_done", False))
                    and self.running
                    and self.ready
                    and self.page is not None
                    and not self.stop_in_progress
                )
            except Exception:
                return False

    def _comment_can_bypass_runtime_wait_for_startup(self, remaining_ms: int) -> bool:
            """Allow the first comment scan to bypass non-hard-sleep scheduling waits.

            The initial scan is part of module bootstrap. It must not be blocked by
            comment window waiting or an inherited interval cooldown; otherwise the
            robot starts as RUNNING but never processes the visible comment page.
            Night hard_sleep remains the only scheduler gate that can block this
            first pass.
            """
            try:
                if int(remaining_ms or 0) <= 0:
                    return False
                if not self._comment_startup_first_cycle_pending():
                    return False
                hard_ms = self._runtime_policy_hard_sleep_remaining_ms()
                if hard_ms > 0:
                    return False
                # 启动首轮巡检未完成时，普通 commentPolicy 工作窗口/间隔等待
                # 不能打断首轮；首轮过程中可能正处于 await_filtered_list_stable
                # 等“活跃阶段”，这些阶段仍属于启动首轮本身，不能因此取消 bypass。
                return True
            except Exception:
                return False

    def _comment_mark_startup_first_cycle_started(self, remaining_ms: int = 0) -> None:
            try:
                if not self._comment_startup_first_cycle_pending():
                    return
                # 这里只能标记“已开始放行”，不能标记 done。
                # done 必须等巡检脚本真正返回后再置位；否则一旦几何探测/JS 回调被延后，
                # 首轮评论处理会被误认为完成，后续直接进入运行窗口等待。
                self.comment_startup_first_cycle_started = True
                self.comment_startup_first_cycle_force_until_ms = self._now_ms() + 15000
                if not bool(getattr(self, "comment_startup_first_cycle_start_logged", False)):
                    self.comment_startup_first_cycle_start_logged = True
                    payload = {
                        "remainingSecSkipped": int(max(0, int(remaining_ms or 0)) / 1000),
                        "reason": "startup_first_comment_scan",
                    }
                    self._log("INFO", f"评论模块启动首轮巡检放行：先处理当前可见评论，再进入运行节奏等待。{json.dumps(payload, ensure_ascii=False)}")
            except Exception:
                # 异常时保持 pending，让下一轮巡检继续尝试，不要误置 done。
                return

    def _comment_startup_result_summary(self, result: dict[str, Any] | None = None) -> dict[str, Any]:
            try:
                if not isinstance(result, dict):
                    return {}
                counts = result.get("counts", {}) if isinstance(result.get("counts"), dict) else {}
                comments = result.get("comments") if isinstance(result.get("comments"), list) else []
                top_comments = result.get("topComments") if isinstance(result.get("topComments"), list) else []
                header = result.get("header", {}) if isinstance(result.get("header"), dict) else {}
                comment_filter = result.get("commentFilter", {}) if isinstance(result.get("commentFilter"), dict) else {}
                comment_list = result.get("commentList", {}) if isinstance(result.get("commentList"), dict) else {}
                diagnostics = result.get("diagnostics", {}) if isinstance(result.get("diagnostics"), dict) else {}
                visible_loading_texts = diagnostics.get("visibleLoadingTexts") if isinstance(diagnostics.get("visibleLoadingTexts"), list) else []
                top_count = int(counts.get("topComments", 0) or result.get("topCommentCount", 0) or len(top_comments) or len(comments) or 0)
                raw_count = int(counts.get("visibleCardCount", 0) or counts.get("rawCommentCount", 0) or result.get("rawCommentCount", 0) or top_count or 0)
                work_title = str(header.get("currentWorkTitle", "") or header.get("postTitle", "") or "").strip()
                work_meta = str(header.get("currentWorkMeta", "") or header.get("postMeta", "") or "").strip()
                current_filter = str(comment_filter.get("selectedText", "") or result.get("currentFilterText", "") or "").strip()
                return {
                    "top": top_count,
                    "raw": raw_count,
                    "currentFilter": current_filter,
                    "workTitle": work_title,
                    "workMeta": work_meta,
                    "headerFound": bool(header.get("found", False)),
                    "commentListFound": bool(comment_list.get("found", False)),
                    "loadingTexts": [str(x) for x in visible_loading_texts[:4] if str(x or "").strip()],
                    "stage": str(getattr(self, "comment_stage_name", "") or ""),
                }
            except Exception:
                return {}

    def _comment_startup_data_readiness(self, result: dict[str, Any] | None = None) -> tuple[bool, str, dict[str, Any]]:
            """Return whether the comment business DOM is truly ready for the startup scan.

            comment_root_ready only means the module shell is mounted.  The first
            business pass must wait until the filter/work/list data is readable,
            otherwise an empty DOM sample consumes the startup scan and the normal
            comment window wait hides the visible comments.
            """
            summary = self._comment_startup_result_summary(result)
            try:
                if not isinstance(result, dict):
                    return False, "invalid_result", summary
                top_count = int(summary.get("top", 0) or 0)
                raw_count = int(summary.get("raw", 0) or 0)
                current_filter = str(summary.get("currentFilter", "") or "").strip()
                work_title = str(summary.get("workTitle", "") or "").strip()
                work_meta = str(summary.get("workMeta", "") or "").strip()
                header_found = bool(summary.get("headerFound", False))
                list_found = bool(summary.get("commentListFound", False))
                loading_texts = [str(x or "").strip() for x in (summary.get("loadingTexts", []) or []) if str(x or "").strip()]
                joined_loading = " ".join(loading_texts)
                explicit_empty = any(token in joined_loading for token in ("暂无", "没有", "无评论", "暂无评论", "暂无数据", "还没有"))
                still_loading = any(token in joined_loading.lower() for token in ("加载", "loading", "spin", "骨架", "请稍候"))
                if top_count > 0 or raw_count > 0:
                    return True, "comments_visible", summary
                if explicit_empty and current_filter and (work_title or work_meta or header_found):
                    return True, "explicit_empty_state", summary
                if current_filter and (work_title or work_meta) and list_found and not still_loading:
                    return True, "filter_work_list_ready", summary
                if not current_filter:
                    return False, "filter_not_ready", summary
                if not (work_title or work_meta or header_found):
                    return False, "work_header_not_ready", summary
                if not list_found:
                    return False, "comment_list_not_ready", summary
                return False, "data_not_ready", summary
            except Exception as exc:
                summary["error"] = f"{type(exc).__name__}: {exc}"
                return False, "readiness_error", summary

    def _comment_startup_first_cycle_can_finish_after_inspect(self, result: dict[str, Any] | None = None) -> bool:
            try:
                if not self._comment_startup_first_cycle_pending():
                    return False
                stage = str(getattr(self, "comment_stage_name", "") or "")
                # 启动首轮的“完成”只能由终态确认，不能在回复主链路中途完成。
                # 上一版把 reply_editor_opening / pending_future 等活跃态也当成完成，
                # 会导致首轮保护提前解除；后续打开编辑器、草稿注入、发送确认所需的
                # 快速巡检会重新受到普通 commentPolicy 窗口/冷却限制，从而打断正常回复链路。
                active_stages = {
                    "reply_candidate_selected",
                    "reply_editor_opening",
                    "reply_editor_confirmed",
                    "reply_editor_focus_retry",
                    "reply_editor_post_focus_stabilizing",
                    "reply_editor_stable",
                    "reply_editor_ready_for_draft",
                    "reply_draft_inject_probe",
                    "reply_draft_reactivate_probe",
                    "reply_draft_verified",
                    "manual_send_hold",
                    "reply_editor_lost_hold",
                    "reply_editor_lost",
                    "reply_editor_recovering",
                }
                if stage in active_stages:
                    return False
                if (
                    getattr(self, "comment_pending_reply_target", None) is not None
                    or getattr(self, "comment_active_reply_target", None) is not None
                    or getattr(self, "comment_pending_draft_probe_target", None) is not None
                    or getattr(self, "comment_pending_send_payload", None) is not None
                    or getattr(self, "comment_pending_reply_future", None) is not None
                    or getattr(self, "comment_preopen_reply_future", None) is not None
                ):
                    return False
                terminal_stages = {
                    "completed_under_unreplied",
                    "post_send_cooldown",
                }
                if stage in terminal_stages:
                    return True
                if isinstance(result, dict):
                    work_key = ""
                    try:
                        work_key = self._comment_current_work_key(result) if hasattr(self, "_comment_current_work_key") else ""
                    except Exception:
                        work_key = ""
                    completed = getattr(self, "comment_completed_work_keys", set())
                    if work_key and work_key in completed:
                        return True
                return False
            except Exception:
                return False

    def _comment_schedule_startup_data_retry(self, reason: str, summary: dict[str, Any] | None = None, *, delay_ms: int = 1200) -> None:
            try:
                if not self._comment_startup_first_cycle_pending():
                    return
                now_ms = self._now_ms()
                wait_started = int(getattr(self, "comment_startup_first_cycle_data_wait_started_ms", 0) or 0)
                if wait_started <= 0:
                    self.comment_startup_first_cycle_data_wait_started_ms = now_ms
                    wait_started = now_ms
                last_log = int(getattr(self, "comment_startup_first_cycle_data_wait_last_log_ms", 0) or 0)
                reason_text = str(reason or "data_not_ready")
                last_reason = str(getattr(self, "comment_startup_first_cycle_data_wait_last_reason", "") or "")
                if reason_text != last_reason or now_ms - last_log >= 10000:
                    self.comment_startup_first_cycle_data_wait_last_log_ms = now_ms
                    self.comment_startup_first_cycle_data_wait_last_reason = reason_text
                    payload = {
                        "reason": reason_text,
                        "elapsedMs": now_ms - wait_started,
                    }
                    if isinstance(summary, dict):
                        payload.update({
                            "top": int(summary.get("top", 0) or 0),
                            "raw": int(summary.get("raw", 0) or 0),
                            "currentFilter": str(summary.get("currentFilter", "") or ""),
                            "workTitle": str(summary.get("workTitle", "") or ""),
                            "commentListFound": bool(summary.get("commentListFound", False)),
                            "stage": str(summary.get("stage", "") or getattr(self, "comment_stage_name", "") or ""),
                        })
                    self._log("INFO", f"评论模块启动首轮巡检等待评论数据就绪：{json.dumps(payload, ensure_ascii=False)}")
                if hasattr(self, "_schedule_fast_comment_inspect"):
                    self._schedule_fast_comment_inspect(max(800, int(delay_ms or 1200)))
            except Exception as exc:
                self._log("WARN", f"评论模块启动首轮数据就绪等待异常，稍后重试: {type(exc).__name__}: {exc}")

    def _comment_mark_startup_first_cycle_finished(self, result: dict[str, Any] | None = None) -> None:
            try:
                if bool(getattr(self, "comment_startup_first_cycle_done", False)):
                    return
                if getattr(self, "current_module", "") != "comment":
                    return
                self.comment_startup_first_cycle_done = True
                self.comment_startup_first_cycle_started = False
                self.comment_startup_first_cycle_force_until_ms = 0
                self.comment_startup_first_cycle_data_wait_started_ms = 0
                self.comment_startup_first_cycle_data_wait_last_log_ms = 0
                payload: dict[str, Any] = {"reason": "startup_first_comment_scan_completed"}
                payload.update(self._comment_startup_result_summary(result))
                self._log("INFO", f"评论模块启动首轮巡检已完成有效处理，后续恢复正常运行节奏。{json.dumps(payload, ensure_ascii=False)}")
            except Exception:
                self.comment_startup_first_cycle_done = True

    def _runtime_policy_hard_sleep_remaining_ms(self) -> int:
            try:
                controller = getattr(self, "runtime_policy", None)
                if controller is None:
                    return 0
                remaining = float(controller.hard_sleep_seconds_until_wake() or 0.0)
                return int(max(0.0, remaining) * 1000)
            except Exception as exc:
                self._log("WARN", f"夜间休眠检查异常，继续按普通节奏处理: {type(exc).__name__}: {exc}")
                return 0

    def _prepare_dm_for_hard_sleep(self, *, remaining_ms: int) -> None:
            """进入 hard_sleep 时清理 DM 非关键扫描态，防止内部 Tab 状态机绕过外层调度。"""
            if getattr(self, "current_module", "") != "dm":
                return
            try:
                # 休眠期间不允许继续切 Tab / 滚动 / 开新会话。保留已生成中的后端 future
                # 与发送链路对象，但清掉会触发新扫描的非关键队列态。
                self.dm_switching_sub_tab = ""
                self.dm_pending_open_key = ""
                self.dm_pending_open_dom_index = None
                self.dm_pending_open_attempts = 0
                self.dm_pending_open_snapshot = {}
                self.dm_opened_unreplied_keys.clear()
                self.dm_pending_reply_meta.clear()
                self.dm_reply_aggregate_window = None
                self.dm_scan_complete = False
                self.dm_completed_sub_tabs.clear()
                if hasattr(self, "_set_dm_scan_mode"):
                    self._set_dm_scan_mode("idle", reason="hard_sleep")
                timer = getattr(self, "dm_next_inspect_timer", None)
                if timer is not None and timer.isActive():
                    timer.stop()
            except Exception as exc:
                self._log("WARN", f"私信休眠态清理异常，继续休眠: {type(exc).__name__}: {exc}")

    def _runtime_policy_remaining_ms(self) -> int:
            try:
                # hard_sleep 是最高优先级：即使 DM 内部状态机存在 pending/opened
                # 残留，也不能在凌晨继续切 Tab、滚动或发起新扫描。
                hard_ms = self._runtime_policy_hard_sleep_remaining_ms()
                if hard_ms > 0:
                    try:
                        controller = getattr(self, "runtime_policy", None)
                        if controller is not None:
                            controller.seconds_until_allowed()
                    except Exception:
                        pass
                    self._prepare_dm_for_hard_sleep(remaining_ms=hard_ms)
                    self._apply_runtime_policy_to_runtime_config()
                    return hard_ms

                # 抖音评论启动后的首轮业务巡检属于 bootstrap：只受 hard_sleep 阻断，
                # 不受普通评论窗口/间隔等待阻断。否则启动后会显示运行中但一直不处理
                # 当前可见评论。
                if getattr(self, "current_module", "") == "comment":
                    try:
                        if self._comment_startup_first_cycle_pending():
                            # 启动首轮巡检期间只允许 hard_sleep / 停止 / 掉登录阻断。
                            # 普通 commentPolicy 工作窗口等待必须等首轮完成后再恢复，
                            # 否则 await_filtered_list_stable 等中间阶段会被 waiting_comment_window 吞掉。
                            self._apply_runtime_policy_to_runtime_config()
                            return 0
                    except Exception:
                        pass

                # 非 hard_sleep 的窗口等待/普通冷却只控制“是否开始新一轮业务扫描”，
                # 不能阻断已经开始的私信处理链路。
                if getattr(self, "current_module", "") == "dm":
                    try:
                        if self._dm_has_active_work():
                            return 0
                    except Exception:
                        pass
                controller = getattr(self, "runtime_policy", None)
                if controller is None:
                    return 0
                remaining = float(controller.seconds_until_allowed() or 0.0)
                self._apply_runtime_policy_to_runtime_config()
                return int(max(0.0, remaining) * 1000)
            except Exception as exc:
                self._log("WARN", f"运行节奏检查异常，继续巡检: {type(exc).__name__}: {exc}")
                return 0

    def _apply_runtime_policy_to_runtime_config(self) -> None:
            try:
                controller = getattr(self, "runtime_policy", None)
                if controller is None:
                    return
                dm = controller.dm_policy()
                aggregate_ms = int(dm.get("messageAggregateWaitSec", 12) or 12) * 1000
                self.dm_reply_aggregate_base_wait_ms = aggregate_ms
                self.dm_reply_aggregate_max_wait_ms = aggregate_ms
                # windowed 策略的 5~30 分钟间隔由 RuntimePolicyController 控制。
                # 页面内部 active/tab 巡检必须保持短周期，用于推进“已打开会话 ->
                # 聚合等待 -> 生成回复 -> 发送确认”的闭环；否则会把单条消息处理卡到
                # 下一个窗口间隔，触发 pending 超时。
                if str(dm.get("mode") or controller.policy.get("scheduleMode") or "").lower() == "windowed":
                    base_cfg = DM_RUNTIME_CONFIG
                    self.dm_active_scan_interval_ms = max(1000, int(base_cfg.get("active_scan_interval_ms", 1200) or 1200))
                    self.dm_tab_scan_interval_ms = max(self.dm_active_scan_interval_ms, int(base_cfg.get("tab_scan_interval_ms", 3000) or 3000))
                    self.dm_idle_scan_min_interval_ms = max(40000, int(base_cfg.get("idle_scan_min_interval_ms", 40000) or 40000))
                    self.dm_idle_scan_max_interval_ms = max(self.dm_idle_scan_min_interval_ms, int(base_cfg.get("idle_scan_max_interval_ms", 90000) or 90000))
                else:
                    self.dm_active_scan_interval_ms = max(1000, int(dm.get("pollIntervalMinSec", 6) or 6) * 1000)
                    self.dm_tab_scan_interval_ms = max(self.dm_active_scan_interval_ms, int(dm.get("pollIntervalMaxSec", 10) or 10) * 1000)
                    self.dm_idle_scan_min_interval_ms = max(1000, int(dm.get("shortIdleMinSec", 30) or 30) * 1000)
                    self.dm_idle_scan_max_interval_ms = max(self.dm_idle_scan_min_interval_ms, int(dm.get("shortIdleMaxSec", 60) or 60) * 1000)
                comment = controller.comment_policy()
                if isinstance(getattr(self, "comment_runtime_config", None), dict):
                    cooldown = dict((self.comment_runtime_config.get("cooldown") or {}) if isinstance(self.comment_runtime_config.get("cooldown"), dict) else {})
                    cooldown.update({
                        "after_send_min_ms": int(comment.get("afterReplyCooldownMinSec", 30) or 30) * 1000,
                        "after_send_max_ms": int(comment.get("afterReplyCooldownMaxSec", 90) or 90) * 1000,
                        "after_work_done_min_ms": int(comment.get("workCooldownMinSec", 60) or 60) * 1000,
                        "after_work_done_max_ms": int(comment.get("workCooldownMaxSec", 120) or 120) * 1000,
                        "no_candidate_min_ms": int(comment.get("noCandidateCooldownMinSec", 120) or 120) * 1000,
                        "no_candidate_max_ms": int(comment.get("noCandidateCooldownMaxSec", 300) or 300) * 1000,
                        "full_cycle_idle_min_ms": int(comment.get("roundCompletedCooldownMinSec", 600) or 600) * 1000,
                        "full_cycle_idle_max_ms": int(comment.get("roundCompletedCooldownMaxSec", 1200) or 1200) * 1000,
                        "multi_empty_round_threshold": int(comment.get("multiEmptyRoundThreshold", 3) or 3),
                        "multi_empty_round_min_ms": int(comment.get("multiEmptyRoundCooldownMinSec", 1200) or 1200) * 1000,
                        "multi_empty_round_max_ms": int(comment.get("multiEmptyRoundCooldownMaxSec", 2400) or 2400) * 1000,
                        "failed_retry_min_ms": int(comment.get("errorCooldownMinSec", 300) or 300) * 1000,
                        "failed_retry_max_ms": int(comment.get("errorCooldownMaxSec", 600) or 600) * 1000,
                    })
                    self.comment_runtime_config["cooldown"] = cooldown
            except Exception as exc:
                self._log("WARN", f"运行节奏配置应用失败，继续使用原有默认值: {type(exc).__name__}: {exc}")

    def _poll(self) -> None:
            if not self.running or self.busy or not self.page or self.stop_in_progress:
                return
            # 状态探测和业务巡检分层：未登录/扫码阶段只做页面状态探测，不进入
            # 私信/评论业务巡检；ready 后即使处于运行窗口冷却，也需要低频状态
            # 探测，以便用户手动退出登录时能回到待扫码而不是一直显示运行中。
            self.login_guard_probe_only = False
            if self.ready:
                remaining_ms = self._runtime_policy_remaining_ms()
                if remaining_ms > 0 and not self._comment_can_bypass_runtime_wait_for_startup(remaining_ms):
                    now_ms = self._now_ms()
                    if now_ms - int(getattr(self, "last_login_guard_state_probe_ms", 0) or 0) < 10_000:
                        return
                    self.last_login_guard_state_probe_ms = now_ms
                    self.login_guard_probe_only = True
            if not self.login_guard_probe_only and self.current_module == "comment" and hasattr(self, "_comment_runtime_cooldown_should_skip"):
                try:
                    startup_pending = bool(hasattr(self, "_comment_startup_first_cycle_pending") and self._comment_startup_first_cycle_pending())
                    if (not startup_pending) and self._comment_runtime_cooldown_should_skip():
                        remaining_ms = self._comment_runtime_cooldown_remaining_ms()
                        self._comment_runtime_cooldown_log_wait(remaining_ms)
                        return
                except Exception as exc:
                    self._log("WARN", f"评论模块冷却检查异常，继续巡检: {type(exc).__name__}: {exc}")
            self.busy = True
            self.page.runJavaScript(build_dismiss_blockers_script(), self._after_dismiss)

    def _after_dismiss(self, clicked: Any) -> None:
            if self._should_ignore_probe_callback("dismiss"):
                return
            if isinstance(clicked, list) and clicked:
                self._log("INFO", f"处理干扰项: {clicked}")
            assert self.page is not None
            self._pending_state_meta_result = None
            self._pending_state_meta_gap = None
            self.page.runJavaScript(build_state_meta_probe(self.current_module), self._handle_state_meta_result)

    def _inspect_current_module(self) -> None:
            if not self.running or not self.ready or not self.page or self.stop_in_progress:
                return
            remaining_ms = self._runtime_policy_remaining_ms()
            if remaining_ms > 0:
                if self._comment_can_bypass_runtime_wait_for_startup(remaining_ms):
                    self._comment_mark_startup_first_cycle_started(remaining_ms)
                else:
                    if self.current_module == "comment" and hasattr(self, "_schedule_fast_comment_inspect"):
                        self._schedule_fast_comment_inspect(min(max(remaining_ms + 120, 1000), 60000))
                    return
            elif self.current_module == "comment" and self._comment_startup_first_cycle_pending():
                self._comment_mark_startup_first_cycle_started(0)
            if self.current_module == "comment" and hasattr(self, "_comment_runtime_cooldown_should_skip"):
                try:
                    startup_pending = bool(hasattr(self, "_comment_startup_first_cycle_pending") and self._comment_startup_first_cycle_pending())
                    if (not startup_pending) and self._comment_runtime_cooldown_should_skip():
                        remaining_ms = self._comment_runtime_cooldown_remaining_ms()
                        self._comment_runtime_cooldown_log_wait(remaining_ms)
                        if hasattr(self, "_schedule_fast_comment_inspect"):
                            self._schedule_fast_comment_inspect(min(max(remaining_ms + 120, 1000), 60000))
                        return
                except Exception as exc:
                    self._log("WARN", f"评论模块冷却巡检检查异常，继续巡检: {type(exc).__name__}: {exc}")
            if self.current_module == "comment" and hasattr(self, "_comment_critical_quiet_remaining_ms"):
                try:
                    remaining_ms = int(self._comment_critical_quiet_remaining_ms() or 0)
                except Exception:
                    remaining_ms = 0
                if remaining_ms > 0:
                    now_ms = self._now_ms()
                    # Suppress per-tick quiet-skip logs; they were the main source of log noise.
                    if hasattr(self, "_schedule_fast_comment_inspect"):
                        self._schedule_fast_comment_inspect(min(max(remaining_ms + 80, 800), 5000))
                    return
            if self.current_module == "dm" and hasattr(self, "_start_dm_idle_light_probe"):
                try:
                    if self._start_dm_idle_light_probe(reason="inspect_idle_wakeup"):
                        return
                except Exception as exc:
                    self._log("WARN", f"私信空闲轻量检测入口异常，继续完整巡检: {type(exc).__name__}: {exc}")
            self._ensure_background_host_geometry()
            self.busy = True
            now_ms = self._now_ms()
            if self.current_module == "dm":
                self.dm_last_actual_inspect_ms = now_ms
                self.last_inspect_started_ms = now_ms
                if str(getattr(self, "dm_scan_mode", "active")) != "idle":
                    self._log("INFO", f"开始巡检模块: {self.current_module}")
            else:
                # 评论模块巡检频率较高，完整状态会由“评论页巡检摘要”按变化输出。
                # 这里仅低频保留心跳，避免每轮都刷“开始巡检模块”。
                if self.current_module != "comment" or now_ms - int(getattr(self, "comment_inspect_start_last_log_ms", 0) or 0) >= 15000:
                    if self.current_module == "comment":
                        self.comment_inspect_start_last_log_ms = now_ms
                    self._log("INFO", f"开始巡检模块: {self.current_module}")
            self.page.runJavaScript(build_geometry_probe_script(self.current_module), self._handle_geometry_probe_result)

    def _set_state(self, state: str) -> None:
            if self.last_state == state:
                return
            self.last_state = state
            self.state_changed.emit(self.account.id, state)
            self._log("INFO", f"状态切换 -> {state}")

    def _log(self, level: str, message: str) -> None:
            scope = getattr(self.account, "log_scope", f"{self.account.platform}:{self.account.name} | {self.account.id}")
            self.logger.emit(scope, level, message)

    @staticmethod
    def _now_ms() -> int:
            from time import monotonic

            return int(monotonic() * 1000)

    def _is_target_url(self, url: str) -> bool:
            return self._normalize_path(url) == self._normalize_path(self.target_url)

    @staticmethod
    def _is_home_url(url: str) -> bool:
            return SessionController._normalize_path(url) == "/creator-micro/home"

    @staticmethod
    def _normalize_path(url: str) -> str:
            try:
                return urlparse(url).path.rstrip("/") or "/"
            except Exception:
                return url.rstrip("/")
